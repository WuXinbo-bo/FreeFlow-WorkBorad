const assert = require("assert/strict");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-sync-http-"));
  process.env.FREEFLOW_HOME_DIR = directory;
  process.env.FREEFLOW_USER_DATA_DIR = path.join(directory, "AppData");
  process.env.FREEFLOW_CANVAS_BOARD_DIR = path.join(directory, "Boards");
  process.env.FREEFLOW_LEGACY_PROJECT_DATA_DIR = path.join(directory, "Legacy");
  const express = require("express");
  const auth = require("../src/backend/services/githubAuthService");
  const sync = require("../src/backend/services/githubSyncService");
  const { createGitHubSyncRouter } = require("../src/backend/routes/githubSyncRoutes");
  const { GitHubApiClient } = require("../src/backend/services/githubApiClient");
  const { createGitHubMock } = require("./fixtures/github-sync");
  const remote = createGitHubMock();
  const originalFetch = globalThis.fetch;
  let server;
  try {
    globalThis.fetch = remote.fetchImpl;
    await auth.connectWithToken({ token: "fixture-only-token", fetchImpl: remote.fetchImpl });
    await sync.setConfig({ owner: "fixture-user", repo: "private-workspace", branch: "main" });
    const app = express();
    app.use(express.json());
    app.use("/sync", createGitHubSyncRouter());
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/sync`;
    const request = async (route, body) => {
      const response = await originalFetch(`${url}${route}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
      return { status: response.status, ...(await response.json()) };
    };
    const before = remote.state.requestCount;
    assert.equal((await request("/remote/check")).changed, false);
    assert.equal(remote.state.requestCount - before, 1, "background check must read only the branch ref");
    assert.equal((await request("/remote/check")).changed, false);
    assert(remote.state.seenIfNoneMatch.at(-1), "second check must use ETag");
    const { updateLedger } = require("../src/backend/services/syncLedgerService");
    await updateLedger(current => ({ ...current, boards: { fixture: { remoteHeadSha: remote.state.head } } }));
    const client = new GitHubApiClient({ token: "fixture-only-token", fetchImpl: remote.fetchImpl });
    await client.createCommit({ owner: "fixture-user", repo: "private-workspace", branch: "main", files: [{ path: "notes.txt", content: "another device" }], message: "fixture remote change" });
    const changed = await request("/remote/check");
    assert.equal(changed.changed, true);
    assert.equal(changed.repositoryKey, "fixture-user/private-workspace:main");
    app.use("/restart", createGitHubSyncRouter());
    const restartCheck = async () => (await originalFetch(`http://127.0.0.1:${server.address().port}/restart/remote/check`)).json();
    assert.equal((await restartCheck()).changed, true, "first check after restart must compare the persisted baseline");
    assert.equal((await restartCheck()).changed, false, "unchanged remote should not repeatedly notify");
    assert.equal((await request("/operations/missing")).code, "SYNC_OPERATION_NOT_FOUND");
    assert.equal((await request("/operations", { id: "invalid", action: "arbitrary-code" })).status, 400);
    const boardRoot = path.join(directory, "Boards");
    await fs.mkdir(boardRoot, { recursive: true });
    const payload = { rootPath: boardRoot };
    const started = await request("/operations", { id: "http-plan", action: "workspace-plan", payload });
    assert.equal(started.ok, true);
    let operation;
    for (let i = 0; i < 100; i++) {
      operation = (await request("/operations/http-plan")).operation;
      if (["completed", "failed"].includes(operation.phase)) break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(operation.phase, "completed", operation.error?.message);
    assert(Array.isArray(operation.result.items));
    assert.equal((await request("/operations", { id: "http-plan", action: "workspace-plan", payload })).operation.id, "http-plan");
    assert.equal((await request("/operations", { id: "http-plan", action: "workspace-plan", payload: { rootPath: directory } })).status, 409);
    assert.equal((await request("/operations")).operations.length, 1);
    const legacyPlan = await request("/workspace/plan", payload);
    assert.equal(legacyPlan.operationCompleted, true);
    assert(legacyPlan.operationId);
    assert.equal((await request("/operations")).operations.length, 2, "legacy paths must use the task journal too");
    console.log("PASS actual HTTP task routes, idempotency, plan integration and lightweight conditional remote checks");
  } finally {
    globalThis.fetch = originalFetch;
    if (server) await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
