const express = require("express");
const auth = require("../services/githubAuthService");
const sync = require("../services/githubSyncService");
const { GitHubApiClient } = require("../services/githubApiClient");
const { normalizePolicy, evaluateAttachment } = require("../services/attachmentPolicyService");
const path = require("path");
const { DATA_DIR } = require("../config/paths");
const { createGitHubOperationService } = require("../services/githubOperationService");
const { readLedger } = require("../services/syncLedgerService");

function createGitHubSyncRouter(options = {}) {
  const router = express.Router();
  const clientId = String(options.clientId || "").trim();
  const appType = String(options.appType || "").trim();
  const operations = options.operations || createGitHubOperationService({
    filePath: path.join(DATA_DIR, "github-sync-operations.json"),
    confirmCommitResult: (details) => sync.confirmCommitResult(details),
    actions: {
      sync: (payload) => sync.syncBoard(payload),
      "workspace-plan": (payload) => sync.getWorkspacePlan(payload),
      "workspace-sync": (payload) => sync.syncWorkspace(payload),
      "workspace-pull": (payload) => sync.pullWorkspace(payload),
      download: (payload) => sync.downloadBoard(payload),
      pull: (payload) => sync.pullBoard(payload),
      reconcile: (payload) => sync.reconcileBoard(payload),
      "delete-remote": (payload) => sync.deleteRemoteBoard(payload),
      "apply-deletion": (payload) => sync.applyRemoteDeletion(payload),
    },
  });
  let remoteHead = null;

  router.post("/operations", async (req, res) => {
    try { res.json({ ok: true, operation: await operations.start(req.body || {}) }); }
    catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message, code: error.code || "", operationId: error.operationId }); }
  });
  router.get("/operations", async (_req, res) => {
    try { res.json({ ok: true, operations: await operations.list() }); }
    catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });
  router.get("/operations/:id", async (req, res) => {
    try {
      const operation = await operations.get(req.params.id);
      res.status(operation ? 200 : 404).json(operation ? { ok: true, operation } : { ok: false, error: "未找到同步操作，请检查远端差异", code: "SYNC_OPERATION_NOT_FOUND" });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });
  router.get("/remote/check", async (_req, res) => {
    try {
      if ((await operations.list()).some((entry) => ["queued", "running", "confirming"].includes(entry.phase))) {
        return res.json({ ok: true, busy: true, nextCheckMs: 60000 });
      }
      const result = await auth.withConnectionOperation(async () => {
        const config = sync.cleanRepoConfig(await auth.readSettings());
        const token = await auth.getAccessToken();
        if (!token || !config.owner || !config.repo) { remoteHead = null; return { connected: false }; }
        const key = `${config.owner}/${config.repo}:${config.branch}`;
        const previous = remoteHead?.key === key ? remoteHead : null;
        const client = new GitHubApiClient({ token });
        const head = await client.getBranchHead(config.owner, config.repo, config.branch, { etag: previous?.etag });
        const sha = String(head?.object?.sha || previous?.sha || "");
        if (!sha) throw new Error("GitHub 未返回有效的远端版本");
        const ledger = await readLedger();
        const sameRepository = ["owner", "repo", "branch"].every((field) => ledger.repository?.[field] === config[field]);
        const knownBoards = sameRepository ? Object.values(ledger.boards || {}) : [];
        const alreadyKnown = knownBoards.some((entry) => entry.remoteHeadSha === sha);
        const hasBaseline = knownBoards.some((entry) => entry.remoteHeadSha || entry.baseRemoteCommit);
        remoteHead = { key, sha, etag: client.lastResponseMeta?.etag || previous?.etag || "" };
        return { connected: true, repositoryKey: key, remoteHeadSha: sha, changed: Boolean(!alreadyKnown && (previous ? previous.sha !== sha : hasBaseline)), checkedAt: Date.now(), nextCheckMs: Math.max(60000, (client.lastResponseMeta?.pollInterval || 0) * 1000) };
      });
      res.json({ ok: true, ...result });
    } catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message, code: error.code || "", retryAfterMs: error.retryAfterMs }); }
  });

  // Compatibility endpoints share the same journal and write guard as IPC tasks.
  // A lost HTTP response can be recovered through /operations without republishing.
  const legacyActions = {
    "/sync": "sync", "/workspace/plan": "workspace-plan", "/workspace/sync": "workspace-sync",
    "/workspace/pull": "workspace-pull", "/download": "download", "/pull": "pull",
    "/reconcile": "reconcile", "/delete-remote": "delete-remote", "/apply-deletion": "apply-deletion",
  };
  for (const [route, action] of Object.entries(legacyActions)) router.post(route, async (req, res) => {
    let operation;
    try {
      operation = await operations.start({ action, payload: req.body || {} });
      while (["queued", "running", "confirming"].includes(operation.phase)) {
        await new Promise(resolve => setTimeout(resolve, 100));
        operation = await operations.get(operation.id);
        if (res.destroyed) return;
      }
      if (operation.phase === "completed") return res.json({ ok: true, ...operation.result, operationId: operation.id, operationCompleted: true });
      throw Object.assign(new Error(operation.error?.message || "同步结果尚需检查"), operation.error);
    } catch (error) {
      res.status(error.status || 500).json({ ok: false, error: error.message, code: error.code || "", operationId: operation?.id || error.operationId,
        retryAfterMs: error.retryAfterMs, conflicts: error.conflicts, artifacts: error.artifacts, state: error.state,
        localChanged: error.localChanged, filePath: error.filePath, boardId: error.boardId, merged: error.merged });
    }
  });

  router.get("/status", async (_req, res) => {
    try { res.json({ ok: true, ...(await sync.getStatus()), auth: await auth.getPublicAuthStatus({ clientId, appType }) }); }
    catch (error) { res.status(500).json({ ok: false, error: error.message, retryAfterMs: error.retryAfterMs }); }
  });

  router.post("/device-flow/start", async (req, res) => {
    try { res.json({ ok: true, ...(await auth.beginDeviceFlow({ clientId: req.body?.clientId || clientId, appType: req.body?.appType || appType })) }); }
    catch (error) { res.status(400).json({ ok: false, error: error.message, retryAfterMs: error.retryAfterMs, code: error.code || "" }); }
  });

  router.post("/token", async (req, res) => {
    try { res.json({ ok: true, ...(await auth.connectWithToken({ token: req.body?.token })) }); }
    catch (error) { res.status(400).json({ ok: false, error: error.message, retryAfterMs: error.retryAfterMs }); }
  });

  router.post("/device-flow/poll", async (req, res) => {
    try { res.json({ ok: true, ...(await auth.pollDeviceFlow({ deviceCode: req.body?.deviceCode })) }); }
    catch (error) { res.status(400).json({ ok: false, error: error.message, retryAfterMs: error.retryAfterMs }); }
  });

  router.post("/disconnect", async (_req, res) => {
    try {
      await auth.clearTokens();
      res.json({ ok: true });
    } catch (error) { res.status(500).json({ ok: false, error: error.message, retryAfterMs: error.retryAfterMs }); }
  });

  router.get("/user", async (_req, res) => {
    try { res.json({ ok: true, user: (await sync.getStatus()).connected ? await (new GitHubApiClient({ token: await auth.getAccessToken() })).getUser() : null }); }
    catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message, retryAfterMs: error.retryAfterMs }); }
  });

  router.get("/repositories", async (_req, res) => {
    try {
      const client = new GitHubApiClient({ token: await auth.getAccessToken() });
      const user = await client.getUser();
      const repositories = (await client.listRepositories()).filter((repository) => repository.private === true && repository.owner?.login === user.login);
      res.json({ ok: true, repositories, user: { login: user.login, id: user.id } });
    }
    catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message, retryAfterMs: error.retryAfterMs }); }
  });

  router.post("/repository", async (req, res) => {
    try {
      const config = sync.cleanRepoConfig(req.body);
      if (!config.owner || !config.repo) throw new Error("GitHub 仓库配置不完整");
      const client = new GitHubApiClient({ token: await auth.getAccessToken() });
      const user = await client.getUser();
      const repository = await client.getRepository(config.owner, config.repo);
      if (repository.private !== true || repository.owner?.login !== user.login) throw new Error("只能绑定你自己账号下的私有仓库");
      if (repository.permissions?.push === false) throw new Error("此仓库没有写入权限，请检查 GitHub 应用或令牌的 Contents 权限");
      res.json({ ok: true, repository: await sync.setConfig({ ...config, branch: req.body?.branch || repository.default_branch || "main" }) });
    }
    catch (error) { res.status(400).json({ ok: false, error: error.message, retryAfterMs: error.retryAfterMs }); }
  });

  router.post("/repository/create", async (req, res) => {
    try {
      const repository = await (new GitHubApiClient({ token: await auth.getAccessToken() })).createPrivateRepository(req.body?.name || "freeflow-workspace", req.body?.description);
      res.json({ ok: true, repository });
    } catch (error) { res.status(error.status || 400).json({ ok: false, error: error.message, retryAfterMs: error.retryAfterMs }); }
  });

  router.get("/workspace", async (_req, res) => {
    try { res.json({ ok: true, ...(await sync.getWorkspace({ includeDeleted: String(_req.query?.includeDeleted || "") === "true" })) }); }
    catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message, retryAfterMs: error.retryAfterMs, code: error.code || "" }); }
  });

  router.post("/attachment-policy/evaluate", (req, res) => {
    res.json({ ok: true, policy: normalizePolicy(req.body?.policy), evaluation: evaluateAttachment(req.body || {}, { policy: req.body?.policy }) });
  });











  router.get("/boards", async (_req, res) => {
    try { res.json({ ok: true, ...(await sync.listBoards({ includeDeleted: String(_req.query?.includeDeleted || "") === "true" })) }); }
    catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message, retryAfterMs: error.retryAfterMs, code: error.code || "" }); }
  });

  router.get("/boards/:boardId/state", async (req, res) => {
    try { res.json({ ok: true, ...(await sync.getBoardState({ boardId: req.params.boardId, boardPath: req.query?.boardPath || "" })) }); }
    catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message, retryAfterMs: error.retryAfterMs, code: error.code || "", conflicts: error.conflicts || undefined, artifacts: error.artifacts || undefined, state: error.state || undefined }); }
  });





  return router;
}

module.exports = { createGitHubSyncRouter };
