const express = require("express");
const auth = require("../services/githubAuthService");
const sync = require("../services/githubSyncService");
const { GitHubApiClient } = require("../services/githubApiClient");
const { normalizePolicy, evaluateAttachment } = require("../services/attachmentPolicyService");

function createGitHubSyncRouter(options = {}) {
  const router = express.Router();
  const clientId = String(options.clientId || "").trim();
  const appType = String(options.appType || "").trim();

  router.get("/status", async (_req, res) => {
    try { res.json({ ok: true, ...(await sync.getStatus()), auth: await auth.getPublicAuthStatus({ clientId, appType }) }); }
    catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.post("/device-flow/start", async (req, res) => {
    try { res.json({ ok: true, ...(await auth.beginDeviceFlow({ clientId: req.body?.clientId || clientId, appType: req.body?.appType || appType })) }); }
    catch (error) { res.status(400).json({ ok: false, error: error.message, code: error.code || "" }); }
  });

  router.post("/token", async (req, res) => {
    try { res.json({ ok: true, ...(await auth.connectWithToken({ token: req.body?.token })) }); }
    catch (error) { res.status(400).json({ ok: false, error: error.message }); }
  });

  router.post("/device-flow/poll", async (req, res) => {
    try { res.json({ ok: true, ...(await auth.pollDeviceFlow({ deviceCode: req.body?.deviceCode })) }); }
    catch (error) { res.status(400).json({ ok: false, error: error.message }); }
  });

  router.post("/disconnect", async (_req, res) => {
    try {
      await auth.clearTokens();
      res.json({ ok: true });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.get("/user", async (_req, res) => {
    try { res.json({ ok: true, user: (await sync.getStatus()).connected ? await (new GitHubApiClient({ token: await auth.getAccessToken() })).getUser() : null }); }
    catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message }); }
  });

  router.get("/repositories", async (_req, res) => {
    try {
      const client = new GitHubApiClient({ token: await auth.getAccessToken() });
      const user = await client.getUser();
      const repositories = (await client.listRepositories()).filter((repository) => repository.private === true && repository.owner?.login === user.login);
      res.json({ ok: true, repositories, user: { login: user.login, id: user.id } });
    }
    catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message }); }
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
    catch (error) { res.status(400).json({ ok: false, error: error.message }); }
  });

  router.post("/repository/create", async (req, res) => {
    try {
      const repository = await (new GitHubApiClient({ token: await auth.getAccessToken() })).createPrivateRepository(req.body?.name || "freeflow-workspace", req.body?.description);
      res.json({ ok: true, repository });
    } catch (error) { res.status(error.status || 400).json({ ok: false, error: error.message }); }
  });

  router.post("/attachment-policy/evaluate", (req, res) => {
    res.json({ ok: true, policy: normalizePolicy(req.body?.policy), evaluation: evaluateAttachment(req.body || {}, { policy: req.body?.policy }) });
  });

  router.post("/sync", async (req, res) => {
    try { res.json({ ok: true, ...(await sync.syncBoard(req.body || {})) }); }
    catch (error) { res.status(error.code === "REMOTE_CHANGED" ? 409 : error.status || 500).json({ ok: false, error: error.message, code: error.code || "" }); }
  });

  router.post("/download", async (req, res) => {
    try { res.json({ ok: true, ...(await sync.downloadBoard(req.body || {})) }); }
    catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message }); }
  });

  return router;
}

module.exports = { createGitHubSyncRouter };
