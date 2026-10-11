const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { GitHubApiClient } = require("../src/backend/services/githubApiClient");

async function main() {
  const waits = [];
  let calls = 0;
  const read = new GitHubApiClient({ retryDelay: async (ms) => waits.push(ms), fetchImpl: async () => {
    if (++calls === 1) throw new TypeError("connection reset");
    if (calls === 2) return { text: async () => { throw new Error("body interrupted"); } };
    return Response.json({ login: "fixture" });
  } });
  assert.equal((await read.getUser()).login, "fixture");
  assert.deepEqual(waits, [250, 500]);
  let writeCalls = 0;
  await assert.rejects(new GitHubApiClient({ fetchImpl: async () => { writeCalls++; throw new Error("reset"); } }).request("/writes", { method: "POST" }), (e) => e.code === "NETWORK_ERROR");
  assert.equal(writeCalls, 1);
  let limitedCalls = 0;
  const limited = new GitHubApiClient({ retryDelay: async () => { throw new Error("must not wait early"); }, fetchImpl: async () => {
    limitedCalls++;
    return Response.json({ message: "limit" }, { status: 403, headers: { "x-ratelimit-remaining": "0", "retry-after": "120" } });
  } });
  await assert.rejects(limited.getUser(), (e) => e.meta.rateLimit.remaining === 0 && e.retryAfterMs === 120000);
  assert.equal(limitedCalls, 1);
  const reset = new GitHubApiClient({ fetchImpl: async () => Response.json({}, { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.ceil(Date.now() / 1000) + 120) } }) });
  await assert.rejects(reset.getUser(), (e) => e.retryAfterMs >= 120000);

  for (const published of [true, false]) {
    let head = "base";
    let patches = 0;
    const client = new GitHubApiClient({ retryDelay: async () => {}, fetchImpl: async (url, options = {}) => {
      const route = new URL(url).pathname;
      if (route.includes("/git/ref/")) return Response.json({ object: { sha: head } });
      if (route.endsWith("/git/commits/base")) return Response.json({ tree: { sha: "base-tree" } });
      if (route.endsWith("/git/blobs")) return Response.json({ sha: "blob" });
      if (route.endsWith("/git/trees")) return Response.json({ sha: "tree" });
      if (route.endsWith("/git/commits")) return Response.json({ sha: "new" });
      if (options.method === "PATCH") {
        patches++;
        if (patches === 1) {
          if (published) head = "new";
          throw new TypeError("lost response");
        }
        assert.equal(JSON.parse(options.body).force, false);
        head = "new";
        return Response.json({ object: { sha: head } });
      }
      throw new Error(route);
    } });
    assert.equal((await client.createCommit({ owner: "fixture", repo: "test", files: [{ path: "board", content: "hello" }] })).commitSha, "new");
    assert.equal(patches, published ? 1 : 2);
    assert.equal(head, "new");
  }

  // Repository changes/disconnects wait for an in-flight plan; its workspace
  // index and HEAD must come from one immutable remote snapshot.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-sync-queue-"));
  process.env.FREEFLOW_HOME_DIR = root;
  process.env.FREEFLOW_USER_DATA_DIR = path.join(root, "AppData");
  process.env.FREEFLOW_CANVAS_BOARD_DIR = path.join(root, "Boards");
  process.env.FREEFLOW_LEGACY_PROJECT_DATA_DIR = path.join(root, "Legacy");
  const auth = require("../src/backend/services/githubAuthService");
  const sync = require("../src/backend/services/githubSyncService");
  const realFetch = globalThis.fetch;
  let releaseHead;
  let enteredHead;
  const headEntered = new Promise((resolve) => { enteredHead = resolve; });
  let headReads = 0;
  globalThis.fetch = async (url) => {
    const route = new URL(url).pathname;
    if (route === "/user") return Response.json({ login: "fixture", id: 42 });
    assert(route.includes("/repos/fixture/old/"), "in-flight plan mixed repository contexts");
    if (route.includes("/git/ref/")) {
      headReads++;
      enteredHead();
      await new Promise((resolve) => { releaseHead = resolve; });
      return Response.json({ object: { sha: "base" } });
    }
    if (route.endsWith("/git/commits/base")) return Response.json({ tree: { sha: "tree" } });
    if (route.endsWith("/git/trees/tree")) return Response.json({ tree: [] });
    throw new Error(route);
  };
  try {
    fs.mkdirSync(path.join(root, "Boards"), { recursive: true });
    await auth.connectWithToken({ token: "fixture" });
    await sync.setConfig({ owner: "fixture", repo: "old" });
    const planning = sync.getWorkspacePlan({ rootPath: path.join(root, "Boards") });
    await headEntered;
    let changed = false;
    const change = sync.setConfig({ owner: "fixture", repo: "new" }).then(() => { changed = true; });
    const disconnect = auth.clearTokens();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(changed, false);
    releaseHead();
    assert.equal((await planning).remoteHeadSha, "base");
    await change;
    await disconnect;
    assert.equal(headReads, 1, "plan read multiple HEADs");
    assert.equal((await sync.getConfig()).repo, "new");
    assert.equal(await auth.getAccessToken(), "");
    await assert.rejects(sync.getWorkspacePlan(), /尚未连接/);
    await auth.connectWithToken({ token: "retry-fixture" });
    assert.equal((await sync.getStatus()).connected, true);
  } finally {
    globalThis.fetch = realFetch;
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log("[check-github-failure-recovery] transport, limits, uncertain writes and context recovery passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
