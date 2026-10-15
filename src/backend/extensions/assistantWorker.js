"use strict";
// A disposable host: Electron utilityProcess on desktop, node child process in web/tests.
const path = require("path");
const http = require("http");
const { createRequire } = require("module");
// Node-based CLI wrappers reuse this executable. Only their environment should
// request Node mode; the main application and mirror keep the normal GUI mode.
if (process.versions.electron) process.env.ELECTRON_RUN_AS_NODE = "1";
const coreRequire = createRequire(path.join(process.env.FREEFLOW_CORE_ROOT, "package.json"));
const pendingHostCalls = new Map();
let callSequence = 0;
const send = (message) => process.parentPort ? process.parentPort.postMessage(message) : process.send?.(message);
const receive = (message) => {
  if (message?.type !== "host-result") return;
  const pending = pendingHostCalls.get(message.id);
  if (!pending) return;
  pendingHostCalls.delete(message.id);
  clearTimeout(pending.timer);
  message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.value);
};
if (process.parentPort) process.parentPort.on("message", ({ data }) => receive(data));
else process.on("message", receive);
const secrets = Object.fromEntries(["readSecret", "writeSecret", "clearSecret"].map((method) => [method, (...args) => new Promise((resolve, reject) => {
  const id = ++callSequence;
  const timer = setTimeout(() => { pendingHostCalls.delete(id); reject(new Error("凭据服务响应超时")); }, 20000);
  pendingHostCalls.set(id, { resolve, reject, timer });
  send({ type: "host-call", id, method, args });
})]));
globalThis.__freeflowHostRequire = (id) => id === "src/backend/services/secretStorageService" ? secrets
  : coreRequire(id.startsWith("src/") || id === "package.json" ? `./${id}` : id);
const express = coreRequire("express");
const backend = require(process.env.FREEFLOW_ASSISTANT_ENTRY)();
const app = express();
const token = process.env.FREEFLOW_ASSISTANT_HOST_TOKEN;
delete process.env.FREEFLOW_ASSISTANT_HOST_TOKEN;
app.use((req, res, next) => req.get("x-freeflow-extension-host") === token ? next() : res.sendStatus(403));
app.use(express.json({ limit: "1mb" }));
app.get("/internal/settings", async (_req, res) => {
  try { res.json({ ok: true, settings: await backend.settings.readAgentSettings() }); }
  catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});
app.post("/internal/settings", async (req, res) => {
  try { res.json({ ok: true, settings: await backend.settings.writeAgentSettings(req.body) }); }
  catch (error) { res.status(500).json({ ok: false, error: error.message }); }
});
app.use("/api/agent", backend.router);
let closing = false;
const server = http.createServer(app);
async function shutdown() {
  if (closing) return;
  closing = true;
  await backend.runtime.shutdown();
  server.close();
  server.closeAllConnections();
  process.exit(0);
}
if (process.parentPort) process.parentPort.on("message", ({ data }) => { if (data?.type === "shutdown") void shutdown(); });
else { process.on("message", (data) => { if (data?.type === "shutdown") void shutdown(); }); process.on("disconnect", () => void shutdown()); }
process.on("SIGTERM", () => void shutdown());
server.listen(0, "127.0.0.1", () => send({ type: "ready", port: server.address().port }));
