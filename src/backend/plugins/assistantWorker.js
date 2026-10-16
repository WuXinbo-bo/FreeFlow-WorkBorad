// This host is shipped with FreeFlow. Only a verified, installed bundle is loaded.
const http = require("node:http");
const crypto = require("node:crypto");

const port = process.parentPort;
const send = (message) => port ? port.postMessage(message) : process.send?.(message);
const listen = (callback) => port
  ? port.on("message", ({ data }) => callback(data))
  : process.on("message", callback);
const pending = new Map();
let sequence = 0;
let backend;
let server;
let shuttingDown = false;

function callHost(service, method, args) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("助手宿主请求超时"));
    }, 30000);
    pending.set(id, { resolve, reject, timer });
    send({ type: "host-call", id, service, method, args });
  });
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await backend?.shutdown?.();
  server?.closeAllConnections?.();
  if (server) await new Promise((resolve) => server.close(resolve));
  send({ type: "stopped" });
  process.exit(0);
}

async function initialize(message) {
  const services = Object.fromEntries(Object.entries(message.services || {}).map(([name, methods]) => [
    name, Object.fromEntries(methods.map((method) => [method, (...args) => callHost(name, method, args)])),
  ]));
  const host = { ...services, paths: message.paths, appVersion: message.appVersion };
  globalThis.__FREEFLOW_ASSISTANT_HOST__ = host;
  const plugin = require(message.modulePath);
  backend = plugin.createAssistantBackend(host);
  if (message.mode === "self-check") {
    const result = await backend.selfCheck();
    send({ type: "checked", result });
    await shutdown();
    return;
  }
  const app = backend.express();
  app.use((req, res, next) => {
    const actual = Buffer.from(String(req.headers["x-freeflow-worker-token"] || ""));
    const expected = Buffer.from(message.token);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      res.status(403).end();
      return;
    }
    next();
  });
  app.use(backend.express.json({ limit: "1mb" }));
  app.use("/api/agent", backend.router);
  server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  send({ type: "ready", port: server.address().port });
}

listen(async (message) => {
  try {
    if (message.type === "init") await initialize(message);
    else if (message.type === "host-result") {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(Object.assign(new Error(message.error.message), message.error));
      else request.resolve(message.result);
    } else if (message.type === "call") {
      try {
        const allowed = message.target === "settingsService"
          ? new Set(["readAgentSettings", "writeAgentSettings"])
          : new Set(["listSessions", "getRuntimeStatus", "initialize"]);
        if (!allowed.has(message.method)) throw new Error("不支持的助手调用");
        const result = await backend[message.target][message.method](...(message.args || []));
        send({ type: "result", id: message.id, result });
      } catch (error) {
        send({ type: "result", id: message.id, error: { message: error.message, code: error.code, statusCode: error.statusCode } });
      }
    } else if (message.type === "shutdown") await shutdown();
  } catch (error) {
    send({ type: "failed", error: { message: error.message, code: error.code } });
    if (message.type === "init") process.exit(1);
  }
});
process.on("disconnect", () => { void shutdown(); });
