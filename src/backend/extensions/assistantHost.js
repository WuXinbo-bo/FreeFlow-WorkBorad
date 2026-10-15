"use strict";
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { fork } = require("child_process");
const { failure } = require("./extensionManager");
class AssistantHost {
  constructor(manager, rootDir) {
    this.manager = manager;
    this.rootDir = rootDir;
    this.child = null;
    this.starting = null;
    this.stopping = null;
    this.port = 0;
    this.generation = 0;
    manager.stopRuntime = () => this.stop();
    manager.isRuntimeRunning = () => Boolean(this.child);
  }
  async start() {
    await this.manager.initialize();
    if (this.closed) throw failure("应用正在关闭", "EXTENSION_STOPPING");
    if (!this.manager.enabled()) throw failure("AI 助手扩展未启用", "EXTENSION_DISABLED", 404);
    if (this.stopping) throw failure("AI 助手正在停止", "EXTENSION_STOPPING");
    if (this.port && this.child) return;
    if (this.starting) return this.starting;
    const generation = this.generation;
    const pending = (async () => {
      await this.manager.verifyInstalled();
      if (generation !== this.generation || !this.manager.enabled()) throw failure("AI 助手已停用", "EXTENSION_DISABLED");
      const token = crypto.randomBytes(32).toString("hex");
      const env = { ...process.env, FREEFLOW_CORE_ROOT: this.rootDir, FREEFLOW_ASSISTANT_HOST_TOKEN: token,
        FREEFLOW_ASSISTANT_ENTRY: path.join(this.manager.directory(), "server.cjs") };
      const worker = path.join(__dirname, "assistantWorker.js");
      let utilityProcess;
      if (process.versions.electron && process.type === "browser") utilityProcess = require("electron").utilityProcess;
      const child = utilityProcess ? utilityProcess.fork(worker, [], { env, serviceName: "FreeFlow AI Assistant", stdio: "pipe" })
        : fork(worker, [], { env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
      this.child = child;
      this.token = token;
      // Do not forward child output: CLI providers can include sensitive connection details.
      child.stdout?.resume(); child.stderr?.resume();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error("AI 助手启动超时")); }, 15000);
        const onExit = () => {
          if (this.child === child) { this.child = null; this.port = 0; }
          clearTimeout(timer);
          reject(new Error("AI 助手进程已退出，可重新打开重试"));
        };
        child.once("exit", onExit);
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        child.on("message", async (message) => {
          if (message?.type === "host-call") {
            const response = { type: "host-result", id: message.id };
            try {
              if (!["readSecret", "writeSecret", "clearSecret"].includes(message.method) || !/^agent-provider:(codex|claude):api-key$/.test(String(message.args?.[0] || ""))) throw new Error("扩展凭据请求被拒绝");
              response.value = await require("../services/secretStorageService")[message.method](...message.args);
            } catch (error) { response.error = error.message; }
            try { if (child.postMessage) child.postMessage(response); else if (child.connected) child.send(response); } catch {}
            return;
          }
          if (message?.type !== "ready") return;
          clearTimeout(timer);
          if (this.child !== child || generation !== this.generation || !this.manager.enabled()) { child.kill(); reject(failure("AI 助手已停用")); return; }
          this.port = message.port;
          resolve();
        });
      });
    })();
    this.starting = pending;
    try { await pending; } finally { if (this.starting === pending) this.starting = null; }
  }
  async stop() {
    if (this.stopping) return this.stopping;
    ++this.generation;
    const pending = (async () => {
      if (this.starting) await this.starting.catch(() => {});
      const child = this.child;
      this.port = 0;
      if (!child) return;
      await new Promise((resolve) => {
        const timer = setTimeout(() => { child.kill(); }, 5000);
        const deadline = setTimeout(resolve, 7000);
        child.once("exit", () => { clearTimeout(timer); clearTimeout(deadline); resolve(); });
        try { if (child.postMessage) child.postMessage({ type: "shutdown" }); else child.send({ type: "shutdown" }); }
        catch { child.kill(); }
      });
      if (this.child === child) this.child = null;
    })();
    this.stopping = pending;
    try { await pending; } finally { if (this.stopping === pending) this.stopping = null; }
  }
  async settings(method = "GET", body) {
    await this.start();
    const response = await fetch(`http://127.0.0.1:${this.port}/internal/settings`, { method,
      headers: { "x-freeflow-extension-host": this.token, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "无法读取 AI 设置");
    return result.settings;
  }
  async proxy(req, res) {
    try {
      await this.start();
      if (res.destroyed) return;
      const body = req.body === undefined ? null : Buffer.from(JSON.stringify(req.body));
      const headers = { ...req.headers, "x-freeflow-extension-host": this.token };
      delete headers["content-length"]; delete headers["transfer-encoding"]; delete headers.connection;
      if (body) headers["content-length"] = body.length;
      const upstream = http.request({ hostname: "127.0.0.1", port: this.port, path: req.originalUrl, method: req.method, headers }, (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
        response.on("error", () => res.destroy());
      });
      upstream.on("error", () => { if (!res.headersSent) res.status(503).json({ ok: false, error: "AI 助手已停止，请重新打开", code: "EXTENSION_HOST_STOPPED" }); else res.end(); });
      res.once("close", () => upstream.destroy());
      upstream.end(body);
    } catch (error) { if (!res.headersSent) res.status(error.statusCode || 503).json({ ok: false, code: error.code || "EXTENSION_HOST_FAILED", error: error.message }); }
  }
}
module.exports = { AssistantHost };
