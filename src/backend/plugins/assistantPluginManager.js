const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { promisify } = require("util");
const { atomicWriteFile } = require("../utils/atomicWrite");
const {
  ASSISTANT_PLUGIN_ID,
  ASSISTANT_HOST_API_VERSION,
  ASSISTANT_PLUGIN_PUBLIC_KEY,
  ASSISTANT_PLUGIN_CATALOG_URL,
} = require("./pluginTrust");

const gunzip = promisify(zlib.gunzip);
const FILE_NAMES = ["backend.cjs", "assistant.js", "assistant.css", "assistant.html"];
const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
const MAX_CONTENT_BYTES = 96 * 1024 * 1024;
const MAX_FILE_BYTES = 24 * 1024 * 1024;
const NETWORK_TIMEOUT_MS = 120000;

function pluginError(code, message) {
  return Object.assign(new Error(message), { code });
}

function parseVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value || ""));
  if (!match) throw pluginError("PLUGIN_VERSION", "组件版本格式无效");
  return { parts: match.slice(1, 4).map(Number), prerelease: match[4] || "" };
}

function compareVersion(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] !== b.parts[index]) return a.parts[index] > b.parts[index] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  const aa = a.prerelease.split(".");
  const bb = b.prerelease.split(".");
  for (let index = 0; index < Math.max(aa.length, bb.length); index += 1) {
    if (aa[index] === bb[index]) continue;
    if (aa[index] == null) return -1;
    if (bb[index] == null) return 1;
    const an = /^\d+$/.test(aa[index]);
    const bn = /^\d+$/.test(bb[index]);
    if (an && bn) return Number(aa[index]) > Number(bb[index]) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1;
    return aa[index] > bb[index] ? 1 : -1;
  }
  return 0;
}

function checkedUrl(value, allowLoopback) {
  let url;
  try { url = new URL(value); } catch { throw pluginError("PLUGIN_URL", "组件下载地址无效"); }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(allowLoopback && loopback && url.protocol === "http:"))) {
    throw pluginError("PLUGIN_URL", "组件下载只支持 HTTPS 地址");
  }
  return url;
}

function decodeBase64(value, limit, name) {
  if (typeof value !== "string" || value.length > Math.ceil(limit / 3) * 4 + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw pluginError("PLUGIN_CONTENT", `组件文件编码无效：${name}`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > limit) throw pluginError("PLUGIN_SIZE", "组件文件超过大小限制");
  return bytes;
}

function createAssistantPluginManager(options = {}) {
  const {
    dataDir,
    appVersion,
    publicKey = ASSISTANT_PLUGIN_PUBLIC_KEY,
    catalogUrl = ASSISTANT_PLUGIN_CATALOG_URL,
    allowLoopback = false,
    selfCheck,
    onDisable,
  } = options;
  if (!dataDir || !appVersion) throw new Error("助手组件需要 dataDir 与 appVersion");
  parseVersion(appVersion);
  const pluginDir = path.join(path.resolve(dataDir), "plugins", ASSISTANT_PLUGIN_ID);
  const versionsDir = path.join(pluginDir, "versions");
  const registryPath = path.join(pluginDir, "state.json");
  let registry = { schemaVersion: 1, desiredEnabled: false, installed: null, cleanupPending: false };
  let initializePromise;
  let activeDirectory = null;
  let activeManifest = null;
  let disablePending = false;
  let integrity = null;
  let phase = "not-installed";
  let error = null;
  let update = null;
  let progress = null;
  let currentOperation = null;
  let mutation = Promise.resolve();

  function getStatus() {
    return {
      id: ASSISTANT_PLUGIN_ID,
      phase,
      installed: !!registry.installed,
      version: registry.installed?.manifest?.version || null,
      desiredEnabled: registry.desiredEnabled,
      activeEnabled: !!activeDirectory,
      activeVersion: activeManifest?.version || null,
      stopPending: disablePending,
      cleanupPending: registry.cleanupPending,
      integrity: integrity ? { ...integrity } : null,
      downloadAvailable: Boolean(catalogUrl),
      restartRequired: !!registry.installed && integrity?.valid === true && registry.desiredEnabled
        && !registry.cleanupPending && !disablePending
        && activeDirectory !== path.join(versionsDir, registry.installed.directoryName),
      progress: progress ? { ...progress } : null,
      error: error ? { ...error } : null,
      update: update ? { ...update } : null,
      updateAvailable: !!registry.installed && integrity?.valid === true && !!update
        && compareVersion(update.version, registry.installed.manifest.version) > 0,
      selfCheck: registry.installed?.selfCheck ? { ...registry.installed.selfCheck } : null,
    };
  }

  function getInstallation() {
    if (!registry.installed) return null;
    return {
      directory: path.join(versionsDir, registry.installed.directoryName),
      activeDirectory,
      manifest: JSON.parse(JSON.stringify(registry.installed.manifest)),
      activeManifest: activeManifest ? JSON.parse(JSON.stringify(activeManifest)) : null,
    };
  }

  async function persist(next) {
    const result = await atomicWriteFile(registryPath, JSON.stringify(next, null, 2), { mode: 0o600, fsync: true });
    if (!result.ok) throw pluginError("PLUGIN_STORAGE", "无法保存组件状态");
    registry = next;
  }

  function validateCompatibility(manifest) {
    if (!manifest || manifest.id !== ASSISTANT_PLUGIN_ID || manifest.hostApiVersion !== ASSISTANT_HOST_API_VERSION) {
      throw pluginError("PLUGIN_INCOMPATIBLE", "组件与当前 FreeFlow 接口不兼容");
    }
    parseVersion(manifest.version);
    if (compareVersion(appVersion, manifest.minAppVersion) < 0
      || (manifest.maxAppVersion && compareVersion(appVersion, manifest.maxAppVersion) > 0)
      || (manifest.platform && manifest.platform !== "any" && manifest.platform !== process.platform)
      || (manifest.arch && manifest.arch !== "any" && manifest.arch !== process.arch)) {
      throw pluginError("PLUGIN_INCOMPATIBLE", "组件不支持当前应用版本或系统");
    }
  }

  function validateManifest(manifest, signature, { compatible = true } = {}) {
    if (compatible) validateCompatibility(manifest);
    else {
      if (!manifest || manifest.id !== ASSISTANT_PLUGIN_ID) throw pluginError("PLUGIN_CATALOG", "组件目录标识无效");
      parseVersion(manifest.version);
      parseVersion(manifest.minAppVersion);
      if (manifest.maxAppVersion) parseVersion(manifest.maxAppVersion);
    }
    if ((manifest.platform && !["darwin", "win32", "linux", "any"].includes(manifest.platform))
      || (manifest.arch && !["arm64", "x64", "any"].includes(manifest.arch))) {
      throw pluginError("PLUGIN_INCOMPATIBLE", "组件目标系统或架构无效");
    }
    const names = Object.keys(manifest.files || {});
    if (names.length !== FILE_NAMES.length || names.some((name) => !FILE_NAMES.includes(name))) {
      throw pluginError("PLUGIN_CONTENT", "组件文件清单无效");
    }
    let totalSize = 0;
    for (const name of names) {
      const file = manifest.files[name];
      if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES || !/^[a-f0-9]{64}$/.test(file.sha256)) {
        throw pluginError("PLUGIN_CONTENT", "组件文件大小或校验值无效");
      }
      totalSize += file.size;
    }
    if (totalSize > MAX_CONTENT_BYTES) throw pluginError("PLUGIN_SIZE", "组件解压大小超过限制");
    const signatureBytes = decodeBase64(signature, 128, "signature");
    let valid = false;
    try { valid = crypto.verify(null, Buffer.from(JSON.stringify(manifest)), publicKey, signatureBytes); } catch {}
    if (!valid) throw pluginError("PLUGIN_SIGNATURE", "组件签名验证失败，请使用官方组件包");
  }

  function validateBytes(bytes, name, manifest) {
    const info = manifest.files[name];
    if (bytes.length !== info.size || crypto.createHash("sha256").update(bytes).digest("hex") !== info.sha256) {
      throw pluginError("PLUGIN_INTEGRITY", `组件文件校验失败：${name}`);
    }
  }

  async function verifyInstalled(installed) {
    if (!installed || !/^[a-zA-Z0-9.-]+$/.test(installed.directoryName) || installed.directoryName.startsWith(".")) {
      throw pluginError("PLUGIN_STORAGE", "组件安装记录无效");
    }
    validateManifest(installed.manifest, installed.signature);
    const directory = path.join(versionsDir, installed.directoryName);
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw pluginError("PLUGIN_INTEGRITY", "组件目录无效");
    for (const name of FILE_NAMES) {
      const file = path.join(directory, name);
      const fileStat = await fs.lstat(file);
      if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size > MAX_FILE_BYTES) throw pluginError("PLUGIN_INTEGRITY", "组件文件无效");
      validateBytes(await fs.readFile(file), name, installed.manifest);
    }
  }

  async function checkInstalled() {
    try {
      await verifyInstalled(registry.installed);
      integrity = { valid: true, checkedAt: new Date().toISOString() };
    } catch (cause) {
      integrity = { valid: false, checkedAt: new Date().toISOString(), errorCode: cause.code || "PLUGIN_INTEGRITY", message: "组件文件缺失或损坏，请修复安装" };
      throw cause;
    }
  }

  async function initialize() {
    if (initializePromise) return initializePromise;
    initializePromise = (async () => {
      try {
        const raw = await fs.readFile(registryPath, "utf8");
        if (raw.length > 65536) throw pluginError("PLUGIN_STORAGE", "组件状态文件过大");
        const saved = JSON.parse(raw);
        if (saved.schemaVersion !== 1 || typeof saved.desiredEnabled !== "boolean") throw pluginError("PLUGIN_STORAGE", "组件状态记录无效");
        registry = { schemaVersion: 1, desiredEnabled: saved.desiredEnabled, installed: saved.installed || null, cleanupPending: saved.cleanupPending === true };
        if (registry.cleanupPending) return await finishUninstall();
        if (registry.installed) {
          await checkInstalled();
          phase = "ready";
          if (registry.desiredEnabled) {
            activeDirectory = getInstallation().directory;
            activeManifest = registry.installed.manifest;
          }
        }
      } catch (cause) {
        if (registry.cleanupPending) {
          phase = "cleanup-pending";
          error = { code: "PLUGIN_UNINSTALL", message: "组件卸载尚未完成，请重试卸载" };
        } else if (cause.code !== "ENOENT") {
          phase = "error";
          error = { code: cause.code || "PLUGIN_STORAGE", message: "助手组件无法加载，请重新安装或卸载后重试" };
        } else if (registry.installed) {
          phase = "error";
          error = { code: "PLUGIN_MISSING", message: "助手组件文件缺失，请重新安装" };
        }
      }
      return getStatus();
    })();
    return initializePromise;
  }

  async function refreshStatus() {
    // Progress polling must remain responsive while an installation owns the queue.
    if (currentOperation) return getStatus();
    return serialize(async () => {
      if (!registry.installed || registry.cleanupPending) return getStatus();
      try { await checkInstalled(); }
      catch (cause) {
        disablePending = disablePending || !!activeDirectory;
        activeDirectory = null;
        activeManifest = null;
        if (disablePending) {
          try { await onDisable?.(); disablePending = false; }
          catch { /* Keep the retryable stop state; never expose damaged code. */ }
        }
        phase = "error";
        error = { code: integrity.errorCode, message: integrity.message };
      }
      return getStatus();
    });
  }

  function serialize(action) {
    const result = mutation.then(async () => { await initialize(); return action(); });
    mutation = result.catch(() => {});
    return result;
  }

  function assertNotBusy() {
    if (currentOperation) throw pluginError("PLUGIN_BUSY", "组件正在安装，请先取消或等待完成");
  }

  function throwIfCancelled(operation) {
    if (operation.controller.signal.aborted) throw pluginError("PLUGIN_CANCELLED", "已取消组件安装");
  }

  async function fetchBytes(source, operation, limit, showProgress) {
    let url = checkedUrl(source, allowLoopback);
    for (let hop = 0; hop <= 5; hop += 1) {
      throwIfCancelled(operation);
      const response = await fetch(url, { redirect: "manual", signal: operation.controller.signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || hop === 5) throw pluginError("PLUGIN_DOWNLOAD", "组件下载重定向无效");
        url = checkedUrl(new URL(location, url).href, allowLoopback);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw pluginError("PLUGIN_DOWNLOAD", response.status === 404 ? "官方组件尚未发布，可导入经过验证的离线组件包" : `组件下载失败（HTTP ${response.status}）`);
      }
      const headerLength = response.headers.get("content-length");
      const totalBytes = headerLength == null ? null : Number(headerLength);
      if (totalBytes != null && (!Number.isSafeInteger(totalBytes) || totalBytes < 0 || totalBytes > limit)) {
        await response.body?.cancel();
        throw pluginError("PLUGIN_SIZE", "组件下载大小超过限制");
      }
      const chunks = [];
      let receivedBytes = 0;
      if (showProgress) progress = { receivedBytes, totalBytes, percent: totalBytes ? 0 : null };
      if (!response.body) throw pluginError("PLUGIN_DOWNLOAD", "组件下载内容为空");
      for await (const chunk of response.body) {
        throwIfCancelled(operation);
        receivedBytes += chunk.length;
        if (receivedBytes > limit) throw pluginError("PLUGIN_SIZE", "组件下载大小超过限制");
        chunks.push(chunk);
        if (showProgress) progress = { receivedBytes, totalBytes, percent: totalBytes ? Math.min(100, Math.round(receivedBytes / totalBytes * 100)) : null };
      }
      if (totalBytes != null && totalBytes !== receivedBytes) throw pluginError("PLUGIN_DOWNLOAD", "组件下载不完整");
      return Buffer.concat(chunks);
    }
    throw pluginError("PLUGIN_DOWNLOAD", "组件下载失败");
  }

  function operationTimeout(operation) {
    const timer = setTimeout(() => {
      operation.timedOut = true;
      operation.controller.abort();
    }, options.timeoutMs || NETWORK_TIMEOUT_MS);
    timer.unref?.();
    return timer;
  }

  async function readCatalog(operation) {
    if (!catalogUrl) throw pluginError("PLUGIN_CATALOG_UNAVAILABLE", "在线组件尚未发布，请导入官方签名组件包");
    const bytes = await fetchBytes(catalogUrl, operation, 64 * 1024, false);
    let catalog;
    try { catalog = JSON.parse(bytes.toString("utf8")); } catch { throw pluginError("PLUGIN_CATALOG", "组件目录信息无效"); }
    const multiple = Object.prototype.hasOwnProperty.call(catalog || {}, "packages");
    if (multiple && (catalog.schemaVersion !== 1 || catalog.id !== ASSISTANT_PLUGIN_ID || !Array.isArray(catalog.packages) || !catalog.packages.length)) {
      throw pluginError("PLUGIN_CATALOG", "组件目录协议无效");
    }
    const candidates = [];
    for (const entry of multiple ? catalog.packages : [catalog]) {
      if (entry?.manifest) {
        if (!multiple) validateCompatibility(entry.manifest);
        validateManifest(entry.manifest, entry.signature, { compatible: false });
        for (const key of ["id", "version", "hostApiVersion", "minAppVersion", "maxAppVersion", "platform", "arch"]) {
          if (entry[key] !== entry.manifest[key]) throw pluginError("PLUGIN_CATALOG", "组件目录与签名信息不一致");
        }
      } else if (multiple) throw pluginError("PLUGIN_SIGNATURE", "组件目录缺少签名信息");
      try { validateCompatibility(entry); }
      catch (cause) { if (multiple && cause.code === "PLUGIN_INCOMPATIBLE") continue; throw cause; }
      if (typeof entry.url !== "string" || !entry.url.trim()) throw pluginError("PLUGIN_CATALOG", "组件下载地址无效");
      const url = checkedUrl(new URL(entry.url, catalogUrl).href, allowLoopback).href;
      if (!Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size > MAX_PACKAGE_BYTES || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
        throw pluginError("PLUGIN_CATALOG", "组件目录大小或校验信息无效");
      }
      candidates.push({ version: entry.version, size: entry.size, sha256: entry.sha256, url,
        specificity: Number(entry.platform === process.platform) + Number(entry.arch === process.arch) });
    }
    candidates.sort((a, b) => compareVersion(b.version, a.version) || b.specificity - a.specificity);
    if (!candidates.length) throw pluginError("PLUGIN_INCOMPATIBLE", "暂无支持当前应用版本与系统的组件");
    const { specificity, ...selected } = candidates[0];
    return selected;
  }

  async function checkForUpdate() {
    return serialize(async () => {
      assertNotBusy();
      if (registry.cleanupPending) throw pluginError("PLUGIN_CLEANUP_PENDING", "请先重试完成组件卸载，再安装");
      const operation = { controller: new AbortController() };
      currentOperation = operation;
      const timer = operationTimeout(operation);
      try {
        update = null;
        update = await readCatalog(operation);
        error = null;
        return { ...update, available: !registry.installed || integrity?.valid !== true || compareVersion(update.version, registry.installed.manifest.version) > 0 };
      } catch (cause) {
        error = { code: operation.timedOut ? "PLUGIN_TIMEOUT" : cause.code || "PLUGIN_DOWNLOAD", message: cause.message || "无法获取组件目录" };
        throw cause;
      } finally {
        clearTimeout(timer);
        currentOperation = null;
      }
    });
  }

  function cancel() {
    if (!currentOperation) return false;
    currentOperation.controller.abort();
    return true;
  }

  async function install(input = {}) {
    return serialize(async () => {
      assertNotBusy();
      if (registry.cleanupPending) throw pluginError("PLUGIN_CLEANUP_PENDING", "请先重试完成组件卸载，再安装");
      if (disablePending) await deactivate();
      if (input.url && input.filePath) throw pluginError("PLUGIN_SOURCE", "请选择一种组件安装来源");
      const operation = { controller: new AbortController(), timedOut: false };
      currentOperation = operation;
      const timer = operationTimeout(operation);
      let stagingDirectory;
      let finalDirectory;
      let published = false;
      const previousPhase = phase;
      error = null;
      try {
        phase = "downloading";
        let bytes;
        let catalog;
        if (input.filePath) {
          const stat = await fs.stat(input.filePath);
          if (!stat.isFile() || stat.size > MAX_PACKAGE_BYTES) throw pluginError("PLUGIN_SIZE", "离线组件包无效或超过大小限制");
          bytes = await fs.readFile(input.filePath);
          progress = { receivedBytes: bytes.length, totalBytes: bytes.length, percent: 100 };
        } else {
          if (!input.url) {
            catalog = await readCatalog(operation);
            update = catalog;
          }
          bytes = await fetchBytes(input.url || catalog.url, operation, MAX_PACKAGE_BYTES, true);
        }
        throwIfCancelled(operation);
        if (bytes.length > MAX_PACKAGE_BYTES) throw pluginError("PLUGIN_SIZE", "组件包超过大小限制");
        phase = "verifying";
        if (catalog && (bytes.length !== catalog.size || crypto.createHash("sha256").update(bytes).digest("hex") !== catalog.sha256)) {
          throw pluginError("PLUGIN_INTEGRITY", "下载的组件包与发布信息不一致");
        }
        let envelope;
        try { envelope = JSON.parse((await gunzip(bytes, { maxOutputLength: MAX_CONTENT_BYTES })).toString("utf8")); }
        catch { throw pluginError("PLUGIN_CONTENT", "无法读取组件包，文件可能损坏或过大"); }
        const { manifest, signature, files } = envelope;
        validateManifest(manifest, signature);
        if (catalog && manifest.version !== catalog.version) throw pluginError("PLUGIN_INTEGRITY", "组件版本与发布信息不一致");
        const fileNames = Object.keys(files || {});
        if (fileNames.length !== FILE_NAMES.length || fileNames.some((name) => !FILE_NAMES.includes(name))) {
          throw pluginError("PLUGIN_CONTENT", "组件包包含未允许的文件");
        }
        const payload = {};
        for (const name of FILE_NAMES) {
          payload[name] = decodeBase64(files[name], MAX_FILE_BYTES, name);
          validateBytes(payload[name], name, manifest);
        }
        throwIfCancelled(operation);
        await fs.mkdir(versionsDir, { recursive: true, mode: 0o700 });
        stagingDirectory = await fs.mkdtemp(path.join(pluginDir, ".staging-"));
        for (const name of FILE_NAMES) {
          await fs.writeFile(path.join(stagingDirectory, name), payload[name], { flag: "wx", mode: 0o600 });
        }
        phase = "checking";
        if (typeof selfCheck !== "function") throw pluginError("PLUGIN_SELF_CHECK", "当前应用无法执行组件自检");
        operation.checkPromise = Promise.resolve(selfCheck(stagingDirectory, manifest, { signal: operation.controller.signal }));
        const check = await Promise.race([
          operation.checkPromise,
          new Promise((resolve, reject) => {
            const abort = () => reject(pluginError("PLUGIN_CANCELLED", "已取消组件安装"));
            operation.controller.signal.addEventListener("abort", abort, { once: true });
            operation.cleanupCheck = () => operation.controller.signal.removeEventListener("abort", abort);
            if (operation.controller.signal.aborted) abort();
          }),
        ]);
        operation.cleanupCheck?.();
        if (check !== true && check?.ok !== true) throw pluginError("PLUGIN_SELF_CHECK", "助手组件运行自检失败");
        throwIfCancelled(operation);
        phase = "installing";
        const directoryName = `${manifest.version}-${crypto.randomBytes(8).toString("hex")}`;
        finalDirectory = path.join(versionsDir, directoryName);
        await fs.rename(stagingDirectory, finalDirectory);
        stagingDirectory = null;
        throwIfCancelled(operation);
        const installed = { manifest, signature, directoryName, installedAt: new Date().toISOString(), selfCheck: { ok: true, checkedAt: new Date().toISOString() } };
        await persist({ schemaVersion: 1, desiredEnabled: registry.installed ? registry.desiredEnabled : true, installed, cleanupPending: false });
        integrity = { valid: true, checkedAt: new Date().toISOString() };
        published = true;
        phase = "ready";
        // Existing processes keep their old immutable version until this application exits.
        const keep = new Set([finalDirectory, activeDirectory].filter(Boolean));
        for (const entry of await fs.readdir(versionsDir, { withFileTypes: true }).catch(() => [])) {
          if (entry.isDirectory() && !keep.has(path.join(versionsDir, entry.name))) await fs.rm(path.join(versionsDir, entry.name), { recursive: true, force: true }).catch(() => {});
        }
        return getStatus();
      } catch (cause) {
        const cancelled = operation.controller.signal.aborted && !operation.timedOut;
        error = { code: operation.timedOut ? "PLUGIN_TIMEOUT" : cancelled ? "PLUGIN_CANCELLED" : cause.code || "PLUGIN_INSTALL", message: operation.timedOut ? "组件安装超时，请重试" : cancelled ? "已取消组件安装" : cause.message || "组件安装失败" };
        phase = previousPhase;
        if (cancelled) return getStatus();
        throw pluginError(error.code, error.message);
      } finally {
        clearTimeout(timer);
        operation.cleanupCheck?.();
        if (operation.controller.signal.aborted && operation.checkPromise) {
          // Let the isolated checker release file handles before removing its bundle.
          let cleanupTimer;
          await Promise.race([
            operation.checkPromise.catch(() => {}),
            new Promise((resolve) => { cleanupTimer = setTimeout(resolve, 5000); }),
          ]).finally(() => clearTimeout(cleanupTimer));
        }
        if (stagingDirectory) await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
        if (finalDirectory && !published) await fs.rm(finalDirectory, { recursive: true, force: true }).catch(() => {});
        currentOperation = null;
        progress = null;
      }
    });
  }

  async function setEnabled(enabled) {
    if (typeof enabled !== "boolean") throw pluginError("PLUGIN_ENABLED", "组件启用状态无效");
    return serialize(async () => {
      assertNotBusy();
      if (registry.cleanupPending) throw pluginError("PLUGIN_CLEANUP_PENDING", "组件卸载尚未完成，请先重试卸载");
      if (enabled && !registry.installed) throw pluginError("PLUGIN_NOT_INSTALLED", "请先安装 AI 助手组件");
      if (enabled) {
        try { await checkInstalled(); }
        catch (cause) {
          phase = "error";
          error = { code: integrity.errorCode, message: integrity.message };
          throw cause;
        }
      }
      if (!enabled || disablePending) await deactivate();
      if (enabled) await persist({ ...registry, desiredEnabled: true });
      error = null;
      return getStatus();
    });
  }

  async function deactivate() {
    disablePending = disablePending || !!activeDirectory;
    // Block new proxy/RPC requests before waiting for persistence or worker exit.
    activeDirectory = null;
    activeManifest = null;
    const next = { ...registry, desiredEnabled: false };
    let failure;
    try { await persist(next); }
    catch (cause) { registry = next; failure = cause; }
    if (disablePending) {
      try { await onDisable?.(); disablePending = false; }
      catch (cause) { failure = failure || cause; }
    }
    if (failure) {
      disablePending = true;
      phase = registry.cleanupPending ? "cleanup-pending" : "disable-pending";
      error = { code: "PLUGIN_DISABLE", message: "助手已禁止接入，但停止或保存状态失败，请重试停用" };
      throw pluginError(error.code, error.message);
    }
    if (error?.code === "PLUGIN_DISABLE") phase = registry.installed ? integrity?.valid === false ? "error" : "ready" : "not-installed";
  }

  async function finishUninstall() {
    try {
      await deactivate();
      await fs.rm(versionsDir, { recursive: true, force: true });
      // Keep the installation and durable intent until removal has actually succeeded.
      await persist({ schemaVersion: 1, desiredEnabled: false, installed: null, cleanupPending: false });
      integrity = null;
      phase = "not-installed";
      error = null;
      update = null;
      return getStatus();
    } catch (cause) {
      phase = "cleanup-pending";
      error = { code: "PLUGIN_UNINSTALL", message: "组件卸载尚未完成，请重试卸载" };
      throw pluginError(error.code, error.message);
    }
  }

  async function uninstall() {
    return serialize(async () => {
      assertNotBusy();
      await persist({ ...registry, desiredEnabled: false, cleanupPending: true });
      return finishUninstall();
    });
  }

  return { initialize, getStatus, refreshStatus, getInstallation, checkForUpdate, install, cancel, setEnabled, uninstall };
}

module.exports = { createAssistantPluginManager, compareVersion, FILE_NAMES };
