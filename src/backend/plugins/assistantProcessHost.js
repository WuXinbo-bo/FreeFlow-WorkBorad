const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { fork } = require("node:child_process");

function unavailable() {
  return Object.assign(new Error("AI 助手插件尚未启用，请在画布插件中安装并于下次启动使用"), {
    statusCode: 409, code: "ASSISTANT_PLUGIN_DISABLED",
  });
}

function createAssistantProcessHost({ paths, appVersion, services, getInstallation, isEnabled }) {
  let active = null;
  let starting = null;
  let generation = 0;
  let stopping = null;

  function spawnWorker(directory, mode, signal) {
    const workerPath = path.join(__dirname, "assistantWorker.js");
    const electron = process.versions.electron ? require("electron") : null;
    const child = electron?.utilityProcess
      ? electron.utilityProcess.fork(workerPath, [], { serviceName: "FreeFlow AI Assistant", stdio: "pipe" })
      : fork(workerPath, [], { stdio: ["ignore", "pipe", "pipe", "ipc"], execArgv: [] });
    child.stdout?.resume();
    child.stderr?.resume();
    const send = (message) => child.postMessage ? child.postMessage(message) : child.send(message);
    const requests = new Map();
    const token = crypto.randomBytes(32).toString("base64url");
    let sequence = 0;
    let settled = false;
    let settledExit = false;
    let readyTimer;
    let resolveReady;
    let rejectReady;
    let resolveExit;
    const exit = new Promise((resolve) => { resolveExit = resolve; });
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const instance = {
      child, port: 0, token, ready, exit,
      async call(target, method, args = []) {
        await ready;
        if (settledExit) throw new Error("AI 助手进程已退出");
        const id = ++sequence;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            requests.delete(id);
            reject(new Error("AI 助手请求超时"));
          }, 30000);
          requests.set(id, { resolve, reject, timer });
          send({ type: "call", id, target, method, args });
        });
      },
      async stop() {
        if (settledExit) return;
        try { send({ type: "shutdown" }); } catch { /* The process may have already exited. */ }
        const timer = setTimeout(() => child.kill(), 5000);
        try { await exit; } finally { clearTimeout(timer); }
      },
    };
    const fail = (error) => {
      if (!settled) { settled = true; clearTimeout(readyTimer); rejectReady(error); }
    };
    const onMessage = async (message) => {
      if (message.type === "ready" || message.type === "checked") {
        if (settled) return;
        settled = true;
        clearTimeout(readyTimer);
        instance.port = message.port || 0;
        resolveReady(message.result || instance);
      } else if (message.type === "failed") {
        fail(Object.assign(new Error(message.error.message), message.error));
      } else if (message.type === "result") {
        const request = requests.get(message.id);
        if (!request) return;
        requests.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(Object.assign(new Error(message.error.message), message.error));
        else request.resolve(message.result);
      } else if (message.type === "host-call") {
        try {
          if (message.service === "secretStorageService" && !["agent-provider:codex:api-key", "agent-provider:claude:api-key"].includes(message.args?.[0])) {
            throw new Error("助手不能访问其他组件的凭据");
          }
          const service = Object.hasOwn(services, message.service) ? services[message.service] : null;
          const method = service && Object.hasOwn(service, message.method) ? service[message.method] : null;
          if (typeof method !== "function") throw new Error("助手宿主接口不允许此操作");
          const result = await method(...(message.args || []));
          send({ type: "host-result", id: message.id, result });
        } catch (error) {
          try { send({ type: "host-result", id: message.id, error: { message: error.message, code: error.code, statusCode: error.statusCode } }); } catch { /* Worker stopped. */ }
        }
      }
    };
    child.on("message", (message) => { void onMessage(message); });
    child.on("error", fail);
    child.on("exit", () => {
      settledExit = true;
      clearTimeout(readyTimer);
      signal?.removeEventListener("abort", onAbort);
      const error = new Error("AI 助手进程已退出");
      fail(error);
      requests.forEach((request) => { clearTimeout(request.timer); request.reject(error); });
      requests.clear();
      if (active === instance) active = null;
      resolveExit();
    });
    const onAbort = () => { fail(new Error("已取消助手检查")); child.kill(); };
    signal?.addEventListener("abort", onAbort, { once: true });
    readyTimer = setTimeout(() => { fail(new Error("AI 助手启动检查超时")); child.kill(); }, 30000);
    send({
      type: "init", modulePath: path.join(directory, "backend.cjs"), mode, token, paths, appVersion,
      services: Object.fromEntries(Object.entries(services).map(([name, service]) => [name, Object.keys(service).filter((method) => typeof service[method] === "function")])),
    });
    if (signal?.aborted) onAbort();
    return instance;
  }

  async function ensureRunning() {
    if (stopping || !isEnabled()) throw unavailable();
    if (active) {
      const worker = active;
      await worker.ready;
      if (stopping || !isEnabled() || active !== worker) throw unavailable();
      return worker;
    }
    if (starting) return starting;
    const revision = generation;
    starting = (async () => {
      const installation = getInstallation();
      if (!installation?.activeDirectory) throw unavailable();
      const worker = spawnWorker(installation.activeDirectory, "serve");
      active = worker;
      try {
        await worker.ready;
        if (revision !== generation || !isEnabled()) { await worker.stop(); throw unavailable(); }
        return worker;
      } catch (error) {
        await worker.stop();
        if (active === worker) active = null;
        throw error;
      }
    })().finally(() => { starting = null; });
    return starting;
  }

  async function shutdown() {
    if (stopping) return stopping;
    generation += 1;
    stopping = (async () => {
      const worker = active;
      if (worker) await worker.stop();
      if (starting) await starting.catch(() => {});
      active = null;
    })();
    try { await stopping; } finally { stopping = null; }
  }

  async function selfCheck(directory, _manifest, options = {}) {
    const worker = spawnWorker(directory, "self-check", options.signal);
    try { return await worker.ready; }
    finally { await worker.stop(); }
  }

  async function proxy(req, res) {
    try {
      const worker = await ensureRunning();
      if (!isEnabled()) throw unavailable();
      if (req.aborted || res.destroyed) return;
      const body = req.body && !["GET", "HEAD"].includes(req.method) ? Buffer.from(JSON.stringify(req.body)) : null;
      const headers = { ...req.headers, "x-freeflow-worker-token": worker.token };
      delete headers.connection;
      delete headers["content-length"];
      delete headers["transfer-encoding"];
      if (body) headers["content-length"] = body.length;
      const upstream = http.request({ hostname: "127.0.0.1", port: worker.port, path: req.originalUrl, method: req.method, headers }, (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
        response.on("error", () => res.destroy());
      });
      upstream.on("error", (error) => {
        if (!res.headersSent) res.status(503).json({ ok: false, error: error.message, code: "ASSISTANT_PROCESS_UNAVAILABLE" });
        else res.destroy();
      });
      res.on("close", () => upstream.destroy());
      upstream.end(body);
    } catch (error) {
      if (!res.headersSent) res.status(error.statusCode || 503).json({ ok: false, error: error.message, code: error.code || "ASSISTANT_PROCESS_UNAVAILABLE" });
    }
  }

  const settingsService = Object.fromEntries(["readAgentSettings", "writeAgentSettings"].map((method) => [
    method, async (...args) => (await ensureRunning()).call("settingsService", method, args),
  ]));
  return { ensureRunning, shutdown, selfCheck, proxy, settingsService, isRunning: () => Boolean(active) };
}

module.exports = { createAssistantProcessHost };
