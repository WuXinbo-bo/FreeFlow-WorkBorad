const crypto = require("crypto");

const OPERATION_ACTIONS = Object.freeze({
  "/sync": "sync", "/workspace/plan": "workspace-plan", "/workspace/sync": "workspace-sync",
  "/workspace/pull": "workspace-pull", "/download": "download", "/pull": "pull",
  "/reconcile": "reconcile", "/delete-remote": "delete-remote", "/apply-deletion": "apply-deletion",
});

function createGitHubSyncOperations({ request, onProgress = () => {}, delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  async function run(pathname, payload) {
    const id = crypto.randomUUID();
    let operation;
    try { operation = (await request("/operations", { method: "POST", body: { id, action: OPERATION_ACTIONS[pathname], payload } })).operation; }
    catch (error) {
      if (error.status >= 400 && error.status < 500) throw error;
      // The start response can disappear after the write was accepted. Query the
      // same identity rather than submitting the canvas a second time.
    }
    let failures = 0;
    let previousPhase = "";
    for (;;) {
      try {
        if (!operation) operation = (await request(`/operations/${id}`)).operation;
        if (!operation) throw new Error("无法确认同步操作状态");
        failures = 0;
      } catch (error) {
        if (++failures >= 3) {
          if (error.code === "SYNC_OPERATION_NOT_FOUND") {
            throw Object.assign(new Error("未找到上次操作记录，请先检查当前文件夹与远端差异再重试"), { code: "SYNC_OPERATION_INTERRUPTED", operationId: id, status: 409 });
          }
          throw Object.assign(new Error("同步操作结果尚未确认，请查询当前任务后再重试"), { code: "SYNC_OPERATION_PENDING", operationId: id, retryAfterMs: 1000 });
        }
        await delay(1000);
        continue;
      }
      if (operation.phase !== previousPhase) {
        previousPhase = operation.phase;
        try { onProgress({ id, action: operation.action, phase: operation.phase, startedAt: operation.startedAt }); }
        catch { /* A closed renderer must not change the backend operation outcome. */ }
      }
      if (operation.phase === "completed") return { ok: true, ...operation.result, ...(operation.journalWarning ? { journalWarning: operation.journalWarning } : {}), operationId: id, operationCompleted: true };
      if (["failed", "interrupted"].includes(operation.phase)) {
        const details = operation.error || {};
        throw Object.assign(new Error(details.message || "同步操作未完成"), details, { operationId: id });
      }
      await delay(500);
      operation = null;
    }
  }
  return { run, supports: (pathname) => Object.hasOwn(OPERATION_ACTIONS, pathname) };
}

module.exports = { createGitHubSyncOperations };
