const { EventEmitter } = require("events");
const { execFile, spawn } = require("child_process");
const readline = require("readline");

function execFileText(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: 8000, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = String(stderr || "");
        reject(error);
        return;
      }
      resolve(String(stdout || "").trim());
    });
  });
}

async function discoverCodexExecutable(configuredPath = "") {
  const candidates = configuredPath ? [configuredPath] : ["codex"];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const version = await execFileText(candidate, ["--version"]);
      return { available: true, command: candidate, version };
    } catch (error) {
      lastError = error;
    }
  }
  return { available: false, command: configuredPath || "codex", version: "", error: lastError?.message || "Codex CLI not found" };
}

class CodexAppServerClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.command = options.command || "codex";
    this.cwd = options.cwd || process.cwd();
    this.clientVersion = options.clientVersion || "0.0.0";
    this.requestTimeoutMs = Math.max(1000, Number(options.requestTimeoutMs) || 15000);
    this.process = null;
    this.pending = new Map();
    this.sequence = 0;
    this.generation = 0;
    this.initialized = false;
    this.stopping = false;
    this.handledExitGeneration = 0;
  }

  async start() {
    if (this.process && !this.process.killed && this.initialized) return this;
    this.stopping = false;
    this.generation += 1;
    const generation = this.generation;
    const child = spawn(this.command, ["app-server", "--stdio"], {
      cwd: this.cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = child;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => this.emit("stderr", String(chunk || "")));
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => this._handleLine(line, generation));
    child.once("error", (error) => this._handleExit(error, generation));
    child.once("exit", (code, signal) => this._handleExit(new Error(`Codex app-server exited (${code ?? signal ?? "unknown"})`), generation));
    await this.request("initialize", {
      clientInfo: { name: "freeflow", title: "FreeFlow", version: this.clientVersion },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
    this.initialized = true;
    this.emit("ready", { generation, pid: child.pid });
    return this;
  }

  request(method, params = {}, options = {}) {
    if (!this.process?.stdin?.writable) return Promise.reject(new Error("Codex app-server is not running"));
    const id = ++this.sequence;
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || this.requestTimeoutMs);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this._write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method, params = {}) {
    this._write({ jsonrpc: "2.0", method, params });
  }

  respond(id, result) {
    this._write({ jsonrpc: "2.0", id, result });
  }

  respondError(id, code, message) {
    this._write({ jsonrpc: "2.0", id, error: { code, message } });
  }

  _write(message) {
    if (!this.process?.stdin?.writable) throw new Error("Codex app-server is not writable");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  _handleLine(line, generation) {
    if (generation !== this.generation || !String(line || "").trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.emit("protocol-error", new Error("Codex app-server returned invalid JSON"));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(message, "id") && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || `${pending.method} failed`));
      else pending.resolve(message.result);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(message, "id") && message.method) {
      this.emit("server-request", message);
      return;
    }
    if (message.method) this.emit("notification", message.method, message.params || {});
  }

  _handleExit(error, generation) {
    if (generation !== this.generation || this.handledExitGeneration === generation) return;
    this.handledExitGeneration = generation;
    this.initialized = false;
    const wasStopping = this.stopping;
    this.process = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.emit("exit", { error, expected: wasStopping, generation });
  }

  async stop() {
    const child = this.process;
    if (!child) return;
    this.stopping = true;
    this.initialized = false;
    this.process = null;
    child.stdin?.end();
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      child.once("exit", finish);
      setTimeout(() => {
        if (settled) return;
        if (process.platform === "win32" && child.pid) {
          execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, finish);
        } else {
          child.kill("SIGKILL");
          finish();
        }
      }, 1500).unref?.();
    });
  }
}

module.exports = {
  CodexAppServerClient,
  discoverCodexExecutable,
};
