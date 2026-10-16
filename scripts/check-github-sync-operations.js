const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { createGitHubOperationService } = require("../src/backend/services/githubOperationService");
const { createGitHubSyncOperations } = require("../electron/githubSyncOperations");

async function waitUntil(test) {
  for (let i = 0; i < 100; i++) { if (await test()) return; await new Promise((resolve) => setTimeout(resolve, 5)); }
  throw new Error("同步操作测试超时");
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-github-operations-"));
  try {
    let release;
    let calls = 0;
    let now = 1000;
    const actions = {
      sync: async () => { calls++; await new Promise((resolve) => { release = resolve; }); return { commitSha: "confirmed", bundle: { boardText: "large private contents", files: [{ path: "board" }] } }; },
      "workspace-plan": async () => ({ items: [] }),
      pull: async () => { throw Object.assign(new Error("fixture conflict"), { code: "SYNC_CONFLICT", status: 409, conflicts: [{ path: "items[one].text" }] }); },
    };
    const filePath = path.join(directory, "operations.json");
    const service = createGitHubOperationService({ filePath, actions, now: () => now });
    const started = await service.start({ id: "operation-one", action: "sync" });
    assert.equal(started.id, "operation-one");
    assert.equal((await service.start({ id: "operation-one", action: "sync" })).id, started.id);
    assert.equal(calls, 1, "duplicate start must not publish twice");
    await assert.rejects(service.start({ id: "operation-two", action: "pull" }), (error) => error.code === "SYNC_OPERATION_PENDING");
    now += 31000;
    assert.equal((await service.get(started.id)).phase, "confirming");
    release();
    await waitUntil(async () => (await service.get(started.id)).phase === "completed");
    assert.equal((await service.get(started.id)).result.commitSha, "confirmed");
    await waitUntil(async () => JSON.parse(await fs.readFile(filePath, "utf8")).operations[0].phase === "completed");
    assert(!String(await fs.readFile(filePath)).includes("large private contents"));
    const restored = createGitHubOperationService({ filePath, actions });
    assert.equal((await restored.get(started.id)).result.commitSha, "confirmed");
    await restored.start({ id: "failed", action: "pull" });
    await waitUntil(async () => (await restored.get("failed")).phase === "failed");
    assert.equal((await restored.get("failed")).error.code, "SYNC_CONFLICT");
    await waitUntil(async () => JSON.parse(await fs.readFile(filePath, "utf8")).operations.some((entry) => entry.id === "failed" && entry.phase === "failed"));

    await fs.writeFile(path.join(directory, "interrupted.json"), JSON.stringify({ schemaVersion: 1, operations: [{ id: "old", action: "sync", phase: "running", startedAt: 1 }] }));
    const interrupted = createGitHubOperationService({ filePath: path.join(directory, "interrupted.json"), actions });
    assert.equal((await interrupted.get("old")).phase, "interrupted");
    await assert.rejects(interrupted.start({ id: "blocked", action: "sync" }), (error) => error.code === "SYNC_OPERATION_INTERRUPTED");
    await interrupted.start({ id: "review", action: "workspace-plan" });
    await waitUntil(async () => (await interrupted.get("review")).phase === "completed");
    assert((await interrupted.get("old")).reviewedAt);
    await waitUntil(async () => JSON.parse(await fs.readFile(path.join(directory, "interrupted.json"), "utf8")).operations.some((entry) => entry.id === "review" && entry.phase === "completed"));

    let confirmations = 0;
    let outcome = "unknown";
    const uncertainFile = path.join(directory, "uncertain.json");
    const uncertainActions = { ...actions, sync: async () => { throw Object.assign(new Error("lost ref response and HEAD"), { code: "COMMIT_RESULT_UNKNOWN", commitSha: "candidate", baseCommitSha: "base", owner: "owner", repo: "repo", branch: "main" }); } };
    const confirmCommitResult = async (details) => { confirmations++; assert.equal(details.commitSha, "candidate"); return { status: outcome }; };
    const uncertain = createGitHubOperationService({ filePath: uncertainFile, actions: uncertainActions, confirmCommitResult, now: () => now });
    await uncertain.start({ id: "uncertain", action: "sync" });
    await waitUntil(async () => (await uncertain.get("uncertain")).phase === "confirming");
    assert.equal((await uncertain.get("uncertain")).phase, "confirming");
    assert.equal(confirmations, 1, "polling must throttle confirmation requests");
    await assert.rejects(uncertain.start({ id: "blocked-unknown", action: "pull" }), error => error.code === "SYNC_OPERATION_PENDING");
    await waitUntil(async () => JSON.parse(await fs.readFile(uncertainFile, "utf8")).operations[0].phase === "confirming");
    outcome = "published";
    const afterRestart = createGitHubOperationService({ filePath: uncertainFile, actions: uncertainActions, confirmCommitResult, now: () => now });
    const confirmed = await afterRestart.get("uncertain");
    assert.equal(confirmed.phase, "interrupted");
    assert.equal(confirmed.error.code, "COMMIT_CONFIRMED_RECHECK");
    assert.equal(confirmed.result, undefined, "remote confirmation must not invent local completion");
    await assert.rejects(afterRestart.start({ id: "still-blocked", action: "pull" }), error => error.code === "SYNC_OPERATION_INTERRUPTED");
    await afterRestart.start({ id: "review-commit", action: "workspace-plan" });
    await waitUntil(async () => (await afterRestart.get("review-commit")).phase === "completed");
    assert((await afterRestart.get("uncertain")).reviewedAt);
    await waitUntil(async () => JSON.parse(await fs.readFile(uncertainFile, "utf8")).operations.some(entry => entry.id === "review-commit" && entry.phase === "completed"));

    let posts = 0;
    let polls = 0;
    const phases = [];
    const transport = createGitHubSyncOperations({ delay: async () => {}, onProgress: (event) => phases.push(event.phase), request: async (url, options) => {
      if (options?.method === "POST") { posts++; throw new Error("lost start response after acceptance"); }
      polls++;
      return { operation: polls === 1 ? { phase: "confirming" } : { phase: "completed", result: { commitSha: "confirmed" } } };
    } });
    assert.equal((await transport.run("/sync", {})).commitSha, "confirmed");
    assert.equal(posts, 1, "response loss must never trigger another publish");
    assert.deepEqual(phases, ["confirming", "completed"]);
    const disconnected = createGitHubSyncOperations({ delay: async () => {}, request: async () => { throw new Error("offline"); } });
    await assert.rejects(disconnected.run("/workspace/pull", {}), (error) => error.code === "SYNC_OPERATION_PENDING" && Boolean(error.operationId));
    const unreceived = createGitHubSyncOperations({ delay: async () => {}, request: async (url, options) => { throw Object.assign(new Error("not received"), options?.method === "POST" ? {} : { status: 404, code: "SYNC_OPERATION_NOT_FOUND" }); } });
    await assert.rejects(unreceived.run("/sync", {}), error => error.code === "SYNC_OPERATION_INTERRUPTED");
    const closedRenderer = createGitHubSyncOperations({ delay: async () => {}, onProgress: () => { throw new Error("renderer destroyed"); }, request: async () => ({ operation: { phase: "completed", result: { commitSha: "published" } } }) });
    assert.equal((await closedRenderer.run("/sync", {})).commitSha, "published");
    console.log("PASS GitHub operation identity, duplicate prevention, journal recovery, failure details and lost IPC response");
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
