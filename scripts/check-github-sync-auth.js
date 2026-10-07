const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const express = require("express");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-github-auth-"));
process.env.FREEFLOW_HOME_DIR = root;
process.env.FREEFLOW_USER_DATA_DIR = path.join(root, "AppData");
process.env.FREEFLOW_CANVAS_BOARD_DIR = path.join(root, "Boards");
process.env.FREEFLOW_LEGACY_PROJECT_DATA_DIR = path.join(root, "Legacy");
const auth = require("../src/backend/services/githubAuthService");
const sync = require("../src/backend/services/githubSyncService");
const paths = require("../src/backend/config/paths");
const { createGitHubSyncRouter } = require("../src/backend/routes/githubSyncRoutes");
const { GitHubApiClient } = require("../src/backend/services/githubApiClient");
const realFetch = globalThis.fetch;
const realNow = Date.now;
let now = realNow();
const calls = [];
const user = { login: "fixture-user", id: 123 };
let oauthResult = { error: "authorization_pending" };
let beginError = "";
let pendingUser = null;
let deviceIndex = 0;
const privateRepo = { name: "workspace", private: true, owner: user, default_branch: "trunk", permissions: { push: true } };

async function fakeFetch(url, options = {}) {
  const pathname = new URL(url).pathname;
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ pathname, body });
  if (pathname === "/login/device/code") return Response.json(beginError ? { error: beginError } : {
    device_code: `device-${++deviceIndex}`, user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5,
  });
  if (pathname === "/login/oauth/access_token") return Response.json(oauthResult);
  if (pathname === "/user") {
    if (options.headers.Authorization === "Bearer invalid-fixture") return Response.json({ message: "Bad credentials" }, { status: 401 });
    if (pendingUser) return pendingUser;
    return Response.json(user);
  }
  if (pathname === "/user/repos") return Response.json([privateRepo, { ...privateRepo, name: "public", private: false }, { ...privateRepo, name: "foreign", owner: { login: "other" } }]);
  if (pathname === "/repos/fixture-user/workspace") return Response.json(privateRepo);
  if (pathname === "/repos/fixture-user/public") return Response.json({ ...privateRepo, private: false });
  throw new Error(`Unexpected fixture request ${pathname}`);
}

async function main() {
  let server;
  Date.now = () => now;
  try {
    await assert.rejects(auth.beginDeviceFlow({ fetchImpl: fakeFetch }), /尚未配置 GitHub Client ID/);
    beginError = "device_flow_disabled";
    await assert.rejects(auth.beginDeviceFlow({ clientId: "fixture", fetchImpl: fakeFetch }), /未启用 Device Flow/);
    beginError = "incorrect_client_credentials";
    await assert.rejects(auth.beginDeviceFlow({ clientId: "fixture", fetchImpl: fakeFetch }), /Client ID 无效/);
    beginError = "";

    await auth.connectWithToken({ token: "fixture-token", fetchImpl: fakeFetch });
    await auth.saveTokens({ refreshToken: "old-refresh-fixture" });
    await sync.setConfig({ owner: user.login, repo: "workspace", branch: "trunk" });
    assert.equal((await auth.getPublicAuthStatus()).user.login, user.login);
    await assert.rejects(auth.connectWithToken({ token: "invalid-fixture", fetchImpl: fakeFetch }), /凭证无效/);
    assert((await auth.getAccessToken()) === "fixture-token", "failed verification replaced the existing credential");

    let releaseUser;
    pendingUser = new Promise((resolve) => { releaseUser = resolve; });
    const delayedConnection = auth.connectWithToken({ token: "delayed-fixture", fetchImpl: fakeFetch });
    const cancelled = assert.rejects(delayedConnection, /操作已取消/);
    await auth.clearTokens();
    releaseUser(Response.json(user));
    await cancelled;
    pendingUser = null;
    assert.equal(await auth.getAccessToken(), "");
    assert.equal((await auth.getPublicAuthStatus()).user, null);

    const flow = await auth.beginDeviceFlow({ clientId: "fixture", appType: "oauth-app", fetchImpl: fakeFetch });
    assert.equal(calls.at(-1).body.scope, "repo");
    const count = calls.length;
    assert.equal((await auth.pollDeviceFlow({ deviceCode: flow.device_code, fetchImpl: fakeFetch })).pending, true);
    assert.equal(calls.length, count, "early polling reached GitHub");
    now += 5000;
    assert.equal((await auth.pollDeviceFlow({ deviceCode: flow.device_code, fetchImpl: fakeFetch })).interval, 5);
    oauthResult = { error: "slow_down" };
    now += 5000;
    assert.equal((await auth.pollDeviceFlow({ deviceCode: flow.device_code, fetchImpl: fakeFetch })).interval, 10);
    oauthResult = { access_token: "device-token-fixture", refresh_token: "device-refresh-fixture" };
    now += 10000;
    const connected = await auth.pollDeviceFlow({ deviceCode: flow.device_code, fetchImpl: fakeFetch });
    assert.equal(connected.pending, false);
    assert(!JSON.stringify(connected).includes("token"), "OAuth secrets escaped to the renderer");
    assert.equal((await sync.getConfig()).branch, "trunk");
    assert.equal((await auth.getPublicAuthStatus()).appType, "oauth-app");
    assert(!fs.readFileSync(paths.CREDENTIALS_FILE, "utf8").includes("device-token-fixture"), "credential was saved in plaintext");
    assert(!fs.readFileSync(paths.GITHUB_SYNC_SETTINGS_FILE, "utf8").includes("device-token-fixture"));
    await assert.rejects(auth.pollDeviceFlow({ deviceCode: flow.device_code, fetchImpl: fakeFetch }), /已失效/);

    const expired = await auth.beginDeviceFlow({ clientId: "fixture", appType: "github-app", fetchImpl: fakeFetch });
    assert(!calls.at(-1).body.scope, "GitHub App used OAuth scopes");
    now += 901000;
    await assert.rejects(auth.pollDeviceFlow({ deviceCode: expired.device_code, fetchImpl: fakeFetch }), /已失效/);
    const discarded = await auth.beginDeviceFlow({ clientId: "fixture", fetchImpl: fakeFetch });
    await auth.clearTokens();
    await assert.rejects(auth.pollDeviceFlow({ deviceCode: discarded.device_code, fetchImpl: fakeFetch }), /已失效/);
    await auth.connectWithToken({ token: "reconnected-fixture", fetchImpl: fakeFetch });

    let created = false;
    const createCalls = [];
    const creationClient = new GitHubApiClient({ fetchImpl: async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      createCalls.push({ pathname, method: options.method });
      if (pathname === "/user/repos") return new Response("", { status: 500 });
      if (pathname === "/user") return Response.json(user);
      if (pathname === "/repos/fixture-user/workspace") return created ? Response.json(privateRepo) : Response.json({ message: "Not Found" }, { status: 404 });
      if (pathname === "/graphql") { created = true; return Response.json({ data: { createRepository: { repository: { name: "workspace" } } } }); }
      if (pathname.endsWith("/contents/.freeflow/README.md")) return Response.json({ commit: { sha: "initial" } }, { status: 201 });
      throw new Error(`Unexpected creation request ${pathname}`);
    } });
    assert.equal((await creationClient.createPrivateRepository("workspace")).private, true);
    assert.equal(createCalls.filter((call) => call.pathname === "/graphql").length, 1);
    assert(createCalls.some((call) => call.method === "PUT"));
    await creationClient.createPrivateRepository("workspace");
    assert.equal(createCalls.filter((call) => call.pathname === "/graphql").length, 1, "5xx recovery recreated an existing repository");
    const deniedClient = new GitHubApiClient({ fetchImpl: async () => Response.json({ message: "Forbidden" }, { status: 403 }) });
    await assert.rejects(deniedClient.createPrivateRepository(), (error) => error.status === 403);

    // Exercise the actual desktop request function against an HTTP router, including /?desktop=1.
    globalThis.fetch = fakeFetch;
    const app = express();
    app.use(express.json());
    app.use("/api/github-sync", createGitHubSyncRouter());
    app.get("/api/github-sync/html", (_req, res) => res.send("<html>not an API response</html>"));
    server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const source = fs.readFileSync(path.join(__dirname, "../electron/main.js"), "utf8");
    const start = source.indexOf("async function githubSyncRequest(");
    const end = source.indexOf('\nipcMain.handle("desktop-shell:github-sync-status"', start);
    assert(start >= 0 && end > start);
    const request = vm.runInNewContext(`${source.slice(start, end)}\ngithubSyncRequest`, { APP_URL: `${origin}/?desktop=1`, URL, AbortSignal, fetch: realFetch });
    assert.equal((await request("/status")).connected, true);
    assert.equal((await request("/user")).user.login, user.login);
    await assert.rejects(request("/html"), /无效响应/);
    const repositories = await request("/repositories");
    assert.deepEqual(repositories.repositories.map((repo) => repo.name), ["workspace"]);
    await assert.rejects(request("/repository", { method: "POST", body: { owner: user.login, repo: "public" } }), /自己账号下的私有仓库/);
    assert.equal((await request("/repository", { method: "POST", body: { owner: user.login, repo: "workspace" } })).repository.branch, "trunk");
    assert.equal((await request("/status")).auth.user.login, user.login, "repository binding erased auth metadata");
    await request("/disconnect", { method: "POST" });
    await auth.writeSettings({ ...(await auth.readSettings()), auth: {} });
    await assert.rejects(request("/device-flow/start", { method: "POST", body: { clientId: "" } }), /GitHub/);
    await assert.rejects(request("/token", { method: "POST", body: { token: "invalid-fixture" } }), /凭证无效/);
    assert.equal((await request("/status")).connected, false);
    assert.equal((await request("/user")).user, null);
    console.log("[check-github-sync-auth] auth recovery, secret isolation and desktop HTTP routing passed");
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
