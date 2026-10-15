"use strict";
const fs = require("fs/promises");
const path = require("path");
const { sameOriginRequest, isLoopbackHost, createAgentApiSecurity } = require("./requestBoundary");
const { FILES } = require("./extensionManager");
function registerExtensionRoutes(app, manager, host, publicDir) {
  app.use("/api/extensions", async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isLoopbackHost(req.hostname) || !sameOriginRequest(req) || (req.method !== "GET" && req.get("x-freeflow-extension") !== "1")) {
      return res.status(403).json({ ok: false, error: "扩展管理仅允许应用内操作" });
    }
    try { await manager.initialize(); next(); }
    catch (error) { res.status(503).json({ ok: false, error: error.message }); }
  });
  app.get("/api/extensions", (_req, res) => res.json({ ok: true, assistant: manager.status() }));
  app.post("/api/extensions/ai-assistant/:action", async (req, res) => {
    try {
      if (req.params.action === "cancel") { manager.cancel(); return res.json({ ok: true, assistant: manager.status() }); }
      await manager.change(req.params.action);
      res.json({ ok: true, assistant: manager.status() });
    } catch (error) { res.status(error.statusCode || 500).json({ ok: false, error: error.message, code: error.code, assistant: manager.status() }); }
  });
  const security = createAgentApiSecurity();
  app.use("/api/agent", (_req, res, next) => manager.enabled() ? next() : res.status(404).json({ ok: false, code: "EXTENSION_DISABLED", error: "AI 助手扩展未启用" }));
  app.get("/api/agent/bootstrap", security.bootstrap);
  app.use("/api/agent", security.requireAuth, (req, res) => host.proxy(req, res));
  app.get("/extensions/ai-assistant/:file", async (req, res) => {
    if (!manager.enabled() || !FILES.includes(req.params.file) || req.params.file.endsWith(".cjs")) return res.sendStatus(404);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(path.join(manager.directory(), req.params.file));
  });
  const renderIndex = async (_req, res, next) => {
    try {
      let html = await fs.readFile(path.join(publicDir, "index.html"), "utf8");
      if (manager.enabled()) {
        const panel = JSON.parse(await fs.readFile(path.join(manager.directory(), "panel.json"), "utf8"));
        for (const name of ["heading", "history", "composer"]) html = html.replace(`<!-- assistant:${name} -->`, () => panel[name]);
        html = html.replace("<!-- assistant:styles -->", '<link rel="stylesheet" href="/extensions/ai-assistant/assistant.css" />');
        html = html.replace('data-right-panel-view="assistant" hidden', 'data-right-panel-view="assistant"');
        html = html.replace("<body", '<body data-assistant-enabled="true"');
      }
      res.setHeader("Cache-Control", "no-store");
      res.type("html").send(html);
    } catch (error) { next(error); }
  };
  app.get(["/", "/index.html"], renderIndex);
  return { renderIndex };
}
module.exports = { registerExtensionRoutes };
