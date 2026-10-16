const express = require("express");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

function requirePluginOrigin(req, res, next) {
  const host = String(req.hostname || "").replace(/^\[|\]$/g, "");
  const origin = String(req.get("origin") || "");
  const site = String(req.get("sec-fetch-site") || "");
  let valid = ["localhost", "127.0.0.1", "::1"].includes(host) && (!site || ["same-origin", "none"].includes(site));
  if (origin) {
    try { valid = valid && new URL(origin).origin === `http://${req.get("host")}`; }
    catch { valid = false; }
  }
  if (!["GET", "HEAD"].includes(req.method)) valid = valid && req.get("x-freeflow-plugin") === "1";
  if (!valid) return res.status(403).json({ ok: false, error: "插件管理请求来源不允许", code: "PLUGIN_ORIGIN_REJECTED" });
  res.setHeader("Cache-Control", "no-store");
  next();
}

function createAssistantPluginRouter({ manager, processHost }) {
  const router = express.Router();
  let installTask = null;
  router.use(requirePluginOrigin);
  const respond = (res) => res.json({ ok: true, plugin: { ...manager.getStatus(), running: processHost.isRunning(), operationPending: Boolean(installTask) } });
  const wrap = (task) => async (req, res) => {
    try { await task(req, res); }
    catch (error) { res.status(error.statusCode || 400).json({ ok: false, error: error.message, code: error.code || "PLUGIN_OPERATION_FAILED" }); }
  };
  function startInstall(options, cleanup) {
    if (installTask) throw Object.assign(new Error("插件正在安装，请等待或取消"), { statusCode: 409 });
    installTask = manager.install(options).catch(() => {}).finally(async () => {
      try { await cleanup?.(); }
      catch { /* A locked temporary import must not reject a completed installation. */ }
      finally { installTask = null; }
    });
  }
  router.get("/status", (_req, res) => respond(res));
  router.post("/check", wrap(async (_req, res) => {
    await manager.checkForUpdate();
    respond(res);
  }));
  router.post("/install", wrap(async (_req, res) => {
    // Download sources come from the trusted catalog, never arbitrary browser input.
    startInstall({});
    res.status(202);
    respond(res);
  }));
  router.post("/import", express.raw({ type: "application/octet-stream", limit: "24mb" }), wrap(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error("请选择有效的 .ffplugin 插件包");
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-plugin-import-"));
    try {
      const filePath = path.join(directory, "assistant.ffplugin");
      await fs.writeFile(filePath, req.body, { mode: 0o600 });
      startInstall({ filePath }, () => fs.rm(directory, { recursive: true, force: true }));
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true });
      throw error;
    }
    res.status(202);
    respond(res);
  }));
  router.post("/cancel", wrap(async (_req, res) => {
    manager.cancel();
    if (installTask) await installTask;
    respond(res);
  }));
  router.post("/enabled", wrap(async (req, res) => {
    if (typeof req.body?.enabled !== "boolean") throw new Error("请指定插件开启或关闭状态");
    await manager.setEnabled(req.body.enabled);
    respond(res);
  }));
  router.post("/uninstall", wrap(async (_req, res) => {
    if (installTask) throw Object.assign(new Error("请先取消正在进行的安装"), { statusCode: 409 });
    await manager.uninstall();
    respond(res);
  }));
  router.get("/assets/:name", wrap(async (req, res) => {
    if (!manager.getStatus().activeEnabled) return res.status(404).end();
    if (!["assistant.js", "assistant.css", "assistant.html"].includes(req.params.name)) return res.status(404).end();
    const directory = manager.getInstallation()?.activeDirectory;
    if (!directory) return res.status(404).end();
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(req.params.name.endsWith(".js") ? "text/javascript" : req.params.name.endsWith(".css") ? "text/css" : "text/html");
    res.sendFile(path.join(directory, req.params.name));
  }));
  return router;
}

module.exports = { createAssistantPluginRouter, requirePluginOrigin };
