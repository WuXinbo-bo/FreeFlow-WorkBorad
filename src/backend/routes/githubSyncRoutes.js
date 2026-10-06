const express = require("express");
const auth = require("../services/githubAuthService");
const sync = require("../services/githubSyncService");
const { GitHubApiClient } = require("../services/githubApiClient");
const { normalizePolicy, evaluateAttachment } = require("../services/attachmentPolicyService");

function createGitHubSyncRouter(options = {}) {
  const router = express.Router();
  const clientId = String(options.clientId || "").trim();

  router.get("/status", async (_req, res) => {
    try { res.json({ ok: true, ...(await sync.getStatus()) }); }
    catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.post("/device-flow/start", async (_req, res) => {
    try { res.json({ ok: true, ...(await auth.beginDeviceFlow({ clientId })) }); }
    catch (error) { res.status(400).json({ ok: false, error: error.message }); }
  });

  router.post("/device-flow/poll", async (req, res) => {
    try { res.json({ ok: true, ...(await auth.pollDeviceFlow({ clientId, deviceCode: req.body?.deviceCode, interval: req.body?.interval })) }); }
    catch (error) { res.status(400).json({ ok: false, error: error.message }); }
  });

  router.post("/disconnect", async (_req, res) => {
    try {
      await auth.clearTokens();
      res.json({ ok: true });
    } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
  });

  router.get("/user", async (_req, res) => {
    try { res.json({ ok: true, user: await (await sync.getStatus()).connected ? await (new GitHubApiClient({ token: await auth.getAccessToken() })).getUser() : null }); }
    catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message }); }
  });

  router.get("/repositories", async (_req, res) => {
    try { res.json({ ok: true, repositories: await (new GitHubApiClient({ token: await auth.getAccessToken() })).listRepositories() }); }
    catch (error) { res.status(error.status || 500).json({ ok: false, error: error.message }); }
  });

  router.post("/repository", async (req, res) => {
    try { res.json({ ok: true, repository: await sync.setConfig(req.body || {}) }); }
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
