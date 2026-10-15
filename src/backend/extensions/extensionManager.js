"use strict";
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { promisify } = require("util");
const { writeJsonFile } = require("../utils/jsonStore");
const gunzip = promisify(zlib.gunzip);
const FILES = ["server.cjs", "settingsBackend.cjs", "client.js", "settings.js", "assistant.css", "panel.json"];
const MAX_BYTES = 16 * 1024 * 1024;
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function failure(message, code = "EXTENSION_ERROR", statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}
async function readOptional(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
class ExtensionManager {
  constructor({ dataDir, catalog, localPackage = "", download = null }) {
    this.root = path.join(dataDir, "Extensions", "ai-assistant");
    this.dataDir = dataDir;
    this.catalog = catalog;
    this.localPackage = localPackage;
    this.download = download || this.downloadOfficial.bind(this);
    this.state = null;
    this.error = "";
    this.operation = "";
    this.progress = 0;
    this.queue = Promise.resolve();
    this.abortController = null;
    this.stopRuntime = async () => {};
  }
  async initialize() {
    if (!this.initializing) this.initializing = this.loadState();
    return this.initializing;
  }
  async loadState() {
    try {
      this.state = await readOptional(path.join(this.root, "state.json"), null);
      if (!this.state) {
        const legacy = await Promise.all(["agent-settings.json", "agent-sessions.sqlite"].map((name) => fs.stat(path.join(this.dataDir, name)).then(() => true, () => false)));
        this.state = { schemaVersion: 1, version: "", enabled: false, legacyAvailable: legacy.some(Boolean) };
        // Development upgrades reuse the independently built, pinned package, never loose source.
        if (this.state.legacyAvailable && this.localPackage) {
          try { await this.installBytes(await fs.readFile(this.localPackage), true); }
          catch (error) { this.error = `原 AI 数据已保留，扩展恢复未完成：${error.message}`; }
        }
        await this.persist();
      }
      if (!this.state.version) await fs.rm(path.join(this.root, "versions"), { recursive: true, force: true, maxRetries: 3, retryDelay: 80 }).catch(() => {});
      if (this.state.version) {
        try { await this.verifyInstalled(); }
        catch (error) {
          // A new core pins a new package. Preserve the enabled preference while repairing.
          if (this.localPackage) await this.installBytes(await fs.readFile(this.localPackage), this.state.enabled === true);
          else { this.state.legacyAvailable = true; throw error; }
        }
      }
    } catch (error) {
      this.error = `扩展不可用：${error.message}`;
      this.state ||= { schemaVersion: 1, enabled: false, version: "" };
    }
  }
  async restoreLegacy() {
    if (!this.state?.legacyAvailable || this.operation || this.enabled() || this.restoreAttempted) return;
    this.restoreAttempted = true;
    try { await this.change("install"); await this.change("enable"); }
    catch (error) { this.error = `原有 AI 数据已保留，扩展恢复未完成：${error.message}`; }
  }
  directory(version = this.state?.version) {
    if (version !== this.catalog.version) throw failure("扩展与当前应用不兼容，请重新安装", "EXTENSION_INCOMPATIBLE");
    return path.join(this.root, "versions", version);
  }
  async verifyInstalled() {
    const dir = this.directory();
    const receipt = await readOptional(path.join(dir, "receipt.json"), null);
    if (receipt?.sha256 !== this.catalog.sha256) throw failure("扩展校验信息不匹配，请重新安装", "EXTENSION_INTEGRITY");
    for (const name of FILES) {
      const target = path.join(dir, name);
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES || digest(await fs.readFile(target)) !== receipt.files?.[name]) {
        throw failure("扩展文件已损坏，请重新安装", "EXTENSION_INTEGRITY");
      }
    }
  }
  async persist() { await writeJsonFile(path.join(this.root, "state.json"), this.state); }
  enabled() { return this.state?.enabled === true && !this.error && !this.replacing && Boolean(this.state?.version); }
  status() {
    return { id: "ai-assistant", name: "AI 助手", installed: Boolean(this.state?.version), enabled: this.enabled(),
      version: this.state?.version || "", availableVersion: this.catalog.version,
      state: this.operation || (this.error ? "error" : this.enabled() ? "enabled" : this.state?.version ? "disabled" : "not-installed"),
      operation: this.operation, progress: this.progress, error: this.error, legacyAvailable: this.state?.legacyAvailable === true,
      sizeBytes: this.catalog.sizeBytes, running: this.isRuntimeRunning?.() === true };
  }
  async downloadOfficial(signal) {
    const url = new URL(this.catalog.url);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || !url.pathname.startsWith("/WuXinbo-bo/FreeFlow-WorkBorad/releases/download/")) {
      throw failure("扩展下载地址不受信任", "EXTENSION_SOURCE_REJECTED");
    }
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]), redirect: "follow" });
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== "https:" || !["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(finalUrl.hostname)) throw failure("扩展下载跳转地址不受信任");
    if (!response.ok) throw failure(response.status === 404 ? "官方扩展包尚未发布，请稍后重试" : `扩展下载失败（${response.status}）`, "EXTENSION_DOWNLOAD_FAILED", 502);
    if (Number(response.headers.get("content-length")) > MAX_BYTES) throw failure("扩展包超过大小限制");
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_BYTES) throw failure("扩展包超过大小限制");
      this.progress = Math.min(99, Math.round(size * 100 / this.catalog.sizeBytes));
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async installBytes(bytes, enabled = false) {
    if (bytes.length > MAX_BYTES || digest(bytes) !== this.catalog.sha256) throw failure("下载文件校验失败，原扩展未被替换", "EXTENSION_INTEGRITY");
    const manifest = JSON.parse(await gunzip(bytes, { maxOutputLength: 32 * 1024 * 1024 }));
    if (manifest.id !== "ai-assistant" || manifest.apiVersion !== 1 || manifest.version !== this.catalog.version || manifest.platform !== this.catalog.platform || manifest.dataSchemaVersion !== 3) throw failure("扩展版本或平台不兼容", "EXTENSION_INCOMPATIBLE");
    if (!manifest.files || Object.keys(manifest.files).length !== FILES.length || FILES.some((name) => typeof manifest.files[name] !== "string")) throw failure("扩展文件列表无效");
    const stage = path.join(this.root, `staging-${crypto.randomUUID()}`);
    const target = this.directory(manifest.version);
    const previous = `${target}.previous`;
    await fs.mkdir(stage, { recursive: true });
    try {
      const hashes = {};
      for (const name of FILES) {
        const content = Buffer.from(manifest.files[name], "base64");
        hashes[name] = digest(content);
        await fs.writeFile(path.join(stage, name), content, { mode: 0o600 });
      }
      await writeJsonFile(path.join(stage, "receipt.json"), { sha256: this.catalog.sha256, files: hashes });
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rm(previous, { recursive: true, force: true });
      const hadTarget = await fs.rename(target, previous).then(() => true, (error) => { if (error.code === "ENOENT") return false; throw error; });
      const oldState = { ...this.state };
      try {
        await fs.rename(stage, target);
        this.state = { schemaVersion: 1, version: manifest.version, enabled, legacyAvailable: false };
        await this.persist();
      } catch (error) {
        this.state = oldState;
        await fs.rm(target, { recursive: true, force: true });
        if (hadTarget) await fs.rename(previous, target);
        throw error;
      }
      await fs.rm(previous, { recursive: true, force: true }).catch(() => {});
    } finally { await fs.rm(stage, { recursive: true, force: true }); }
  }
  cancel() { this.abortController?.abort(); }
  change(action) {
    if (this.operation) return Promise.reject(failure("扩展正在处理中，请稍后再试", "EXTENSION_BUSY"));
    if (!["install", "enable", "disable", "uninstall"].includes(action)) return Promise.reject(failure("未知扩展操作", "EXTENSION_INVALID", 400));
    this.operation = action;
    const operation = this.queue.catch(() => {}).then(async () => {
      await this.initialize();
      this.progress = 0;
      const oldState = { ...this.state };
      this.abortController = new AbortController();
      try {
        if (action === "install") {
          // Download/verify before stopping the current version; a failed download leaves it usable.
          const bytes = this.localPackage ? await fs.readFile(this.localPackage) : await this.download(this.abortController.signal);
          if (this.abortController.signal.aborted) throw failure("已取消安装", "EXTENSION_CANCELLED");
          if (digest(bytes) !== this.catalog.sha256) throw failure("下载文件校验失败", "EXTENSION_INTEGRITY");
          this.replacing = true;
          await this.stopRuntime();
          await this.installBytes(bytes, oldState.enabled === true);
        } else if (action === "enable") {
          if (!this.state.version) throw failure("请先安装 AI 助手");
          await this.verifyInstalled();
          this.state.enabled = true;
          await this.persist();
        } else {
          // Close the gate before awaiting shutdown so new API requests cannot start a worker.
          this.state.enabled = false;
          await this.stopRuntime();
          if (action === "uninstall") this.state.version = "";
          await this.persist();
          // Persisting the disabled/uninstalled state is the commit point. A transient file lock
          // must not roll memory back to enabled after metadata has already been committed.
          if (action === "uninstall") await fs.rm(path.join(this.root, "versions"), { recursive: true, force: true, maxRetries: 5, retryDelay: 80 }).catch(() => {});
        }
        this.error = "";
        this.replacing = false;
        return this.status();
      } catch (error) {
        this.state = oldState;
        if (!oldState.version) this.error = error.name === "AbortError" ? "安装已取消，可重新下载" : error.message;
        throw error;
      } finally { this.replacing = false; this.abortController = null; this.operation = ""; this.progress = 0; }
    });
    this.queue = operation;
    return operation;
  }
}
module.exports = { ExtensionManager, FILES, MAX_BYTES, digest, failure };
