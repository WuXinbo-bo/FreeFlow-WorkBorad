const fs = require("fs/promises");
const crypto = require("crypto");
const { atomicWriteJsonFile } = require("../utils/atomicWrite");

const ACTIVE_PHASES = new Set(["queued", "running", "confirming"]);

function publicError(error) {
  return {
    message: String(error?.message || "GitHub 操作失败"),
    code: String(error?.code || ""),
    status: Number(error?.status) || 500,
    retryAfterMs: Number(error?.retryAfterMs) || 0,
    conflicts: error?.conflicts,
    artifacts: error?.artifacts,
    state: error?.state,
    commitSha: error?.commitSha,
    baseCommitSha: error?.baseCommitSha,
    owner: error?.owner,
    repo: error?.repo,
    branch: error?.branch,
    localChanged: error?.localChanged,
    filePath: error?.filePath,
    boardId: error?.boardId,
    merged: error?.merged,
  };
}

// The journal contains outcomes, never credentials or attachment bytes.
function journalValue(value) {
  return JSON.parse(JSON.stringify(value, (key, entry) =>
    ["boardText", "manifestText", "bytes", "token", "accessToken"].includes(key) ? undefined : entry));
}

function createGitHubOperationService({ filePath, actions, confirmCommitResult, now = Date.now }) {
  const operations = new Map();
  const confirmations = new Map();
  const nextConfirmation = new Map();
  let initialization;
  let writes = Promise.resolve();
  const persist = () => {
    const saved = journalValue([...operations.values()]);
    const next = writes.catch(() => {}).then(async () => {
      const result = await atomicWriteJsonFile(filePath, { schemaVersion: 1, operations: saved }, { mode: 0o600, fsync: true });
      if (!result.ok) throw new Error(result.error || "无法保存同步操作记录");
    });
    writes = next;
    return next;
  };

  async function initialize() {
    if (!initialization) initialization = (async () => {
      let saved;
      try { saved = JSON.parse(await fs.readFile(filePath, "utf8")); }
      catch (error) { if (error.code !== "ENOENT") throw error; return; }
      if (saved?.schemaVersion !== 1 || !Array.isArray(saved.operations)) throw new Error("同步操作记录格式无效");
      for (const entry of saved.operations.slice(-16)) {
        if (!entry?.id || !Object.hasOwn(actions, entry.action)) continue;
        const operation = { ...entry };
        if (ACTIVE_PHASES.has(operation.phase) && operation.error?.code !== "COMMIT_RESULT_UNKNOWN") {
          operation.phase = "interrupted";
          operation.error = { code: "SYNC_OPERATION_INTERRUPTED", message: "应用退出时操作尚未确认，请先检查远端差异再重试", status: 409 };
        }
        operations.set(operation.id, operation);
      }
    })();
    return initialization;
  }

  function snapshot(operation) {
    if (!operation) return null;
    const confirming = ACTIVE_PHASES.has(operation.phase) && now() - operation.startedAt > 30000;
    return { ...operation, phase: confirming ? "confirming" : operation.phase };
  }

  async function start({ id = crypto.randomUUID(), action, payload = {} } = {}) {
    await initialize();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !Object.hasOwn(actions, action)) {
      throw Object.assign(new Error("同步操作参数无效"), { status: 400, code: "SYNC_OPERATION_INVALID" });
    }
    // Reserving the ID before awaiting disk also makes a lost start response safe to retry.
    const existing = operations.get(id);
    if (existing) {
      if (existing.action !== action || existing.payloadHash && existing.payloadHash !== crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex")) throw Object.assign(new Error("同步操作标识已被使用"), { status: 409, code: "SYNC_OPERATION_INVALID" });
      return snapshot(existing);
    }
    const active = [...operations.values()].find((entry) => ACTIVE_PHASES.has(entry.phase));
    if (active) throw Object.assign(new Error("另一个同步操作尚未结束，请先确认结果"), { status: 409, code: "SYNC_OPERATION_PENDING", operationId: active.id });
    const interrupted = [...operations.values()].find((entry) => entry.phase === "interrupted" && !entry.reviewedAt);
    if (interrupted && action !== "workspace-plan") {
      throw Object.assign(new Error("上次同步随应用退出中断，请先检查当前文件夹差异"), { status: 409, code: "SYNC_OPERATION_INTERRUPTED", operationId: interrupted.id });
    }
    const operation = { id, action, payloadHash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"), phase: "queued", startedAt: now(), updatedAt: now() };
    operations.set(id, operation);
    while (operations.size > 16) {
      const oldest = [...operations.values()].find((entry) => !ACTIVE_PHASES.has(entry.phase) && (entry.phase !== "interrupted" || entry.reviewedAt));
      if (!oldest) break;
      operations.delete(oldest.id);
    }
    try { await persist(); }
    catch (error) { operations.delete(id); throw error; }
    void (async () => {
      operation.phase = "running";
      operation.updatedAt = now();
      try {
        operation.result = journalValue(await actions[action](payload));
        operation.phase = "completed";
        if (action === "workspace-plan") for (const entry of operations.values()) {
          if (entry.phase === "interrupted") entry.reviewedAt = now();
        }
      } catch (error) {
        operation.error = publicError(error);
        operation.phase = error.code === "COMMIT_RESULT_UNKNOWN" ? "confirming" : "failed";
      }
      operation.updatedAt = now();
      try { await persist(); }
      catch { operation.journalWarning = "操作结果已确认，但记录保存失败；下次启动请重新检查差异"; }
    })();
    return snapshot(operation);
  }

  async function confirm(operation) {
    if (!confirmCommitResult || operation?.phase !== "confirming" || operation.error?.code !== "COMMIT_RESULT_UNKNOWN") return;
    if (confirmations.has(operation.id)) return confirmations.get(operation.id);
    if ((nextConfirmation.get(operation.id) || 0) > now()) return;
    const pending = (async () => {
      try {
        const result = await confirmCommitResult(operation.error);
        if (result?.status === "published" || result?.status === "not-published") {
          const published = result.status === "published";
          operation.phase = "interrupted";
          operation.confirmation = result;
          operation.error = { ...operation.error, status: 409,
            code: published ? "COMMIT_CONFIRMED_RECHECK" : "COMMIT_NOT_PUBLISHED_RECHECK",
            message: published ? "远端提交已确认，本机保存与同步记录尚需核对；请先检查当前文件夹差异" : "此提交未在当前远端生效，请先检查当前文件夹与远端差异再重试" };
          operation.updatedAt = now();
          try { await persist(); } catch { operation.journalWarning = "提交确认结果保存失败，下次启动将再次核对"; }
        }
        nextConfirmation.set(operation.id, now() + Math.max(5000, Number(result?.retryAfterMs) || 0));
      } catch {
        // Keep the write guard while disconnected or bound to another repository.
        nextConfirmation.set(operation.id, now() + 5000);
      }
    })();
    confirmations.set(operation.id, pending);
    try { await pending; } finally { confirmations.delete(operation.id); }
  }

  async function get(id) {
    await initialize();
    const operation = operations.get(String(id || ""));
    await confirm(operation);
    return snapshot(operation);
  }
  async function list() { await initialize(); return [...operations.values()].map(snapshot); }
  return { start, get, list };
}

module.exports = { createGitHubOperationService };
