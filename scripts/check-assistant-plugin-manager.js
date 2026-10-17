const assert = require("assert/strict");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const zlib = require("zlib");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { createAssistantPluginManager, compareVersion } = require("../src/backend/plugins/assistantPluginManager");

const execute = promisify(execFile);
const pluginId = "freeflow.ai-assistant";
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

function makePackage(version = "2.0.2", modify = () => {}) {
  const source = {
    "backend.cjs": "module.exports={hostApiVersion:1,selfCheck:async()=>({ok:true,roundTrip:'assistant-ready'})};",
    "assistant.js": "export const assistant = { ready: true };",
    "assistant.css": ".assistant{display:block}",
    "assistant.html": "<section class=assistant>AI Assistant</section>",
  };
  const manifest = {
    id: pluginId,
    version,
    hostApiVersion: 1,
    minAppVersion: "2.0.2",
    files: Object.fromEntries(Object.entries(source).map(([name, text]) => [name, {
      size: Buffer.byteLength(text),
      sha256: crypto.createHash("sha256").update(text).digest("hex"),
    }])),
  };
  const envelope = {
    manifest,
    signature: crypto.sign(null, Buffer.from(JSON.stringify(manifest)), privateKey).toString("base64"),
    files: Object.fromEntries(Object.entries(source).map(([name, text]) => [name, Buffer.from(text).toString("base64")])),
  };
  modify(envelope, () => {
    envelope.signature = crypto.sign(null, Buffer.from(JSON.stringify(manifest)), privateKey).toString("base64");
  });
  return zlib.gzipSync(Buffer.from(JSON.stringify(envelope)));
}

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-plugin-manager-"));
  const dataDir = path.join(temp, "data");
  const payloads = new Map();
  let catalogVersion = "2.0.2";
  let catalogOverrides = {};
  let catalogDocument = null;
  let catalogEncoding = null;
  let packageDownloads = 0;
  let disableCount = 0;
  let checkCount = 0;
  const server = http.createServer((request, response) => {
    if (request.url === "/catalog.json") {
      const body = payloads.get(`/assistant-${catalogVersion}.ffplugin`);
      response.setHeader("Content-Type", "application/json");
      let bytes = Buffer.from(JSON.stringify(catalogDocument || {
        id: pluginId, version: catalogVersion, hostApiVersion: 1, minAppVersion: "2.0.2",
        url: `assistant-${catalogVersion}.ffplugin`, size: body.length,
        sha256: crypto.createHash("sha256").update(body).digest("hex"),
        ...catalogOverrides,
      }));
      if (catalogEncoding) {
        bytes = catalogEncoding === "gzip" ? zlib.gzipSync(bytes) : zlib.brotliCompressSync(bytes);
        response.setHeader("Content-Encoding", catalogEncoding);
      }
      response.setHeader("Content-Length", bytes.length);
      response.end(bytes);
      return;
    }
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "http://192.168.0.1/unsafe" });
      response.end();
      return;
    }
    const body = payloads.get(request.url);
    if (!body) { response.writeHead(404); response.end(); return; }
    if (request.url.endsWith(".ffplugin")) packageDownloads += 1;
    response.setHeader("Content-Length", body.length);
    if (request.url === "/slow") {
      response.write(body.subarray(0, 20));
      const timer = setTimeout(() => response.end(body.subarray(20)), 5000);
      response.on("close", () => clearTimeout(timer));
      return;
    }
    response.end(body);
  });
  payloads.set("/assistant-2.0.2.ffplugin", makePackage());
  payloads.set("/assistant-2.0.3.ffplugin", makePackage("2.0.3"));
  payloads.set("/slow", makePackage("2.0.4"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const options = {
    rootDir: path.resolve(__dirname, ".."), dataDir, appVersion: "2.0.2", publicKey,
    allowLoopback: true, catalogUrl: `${baseUrl}/catalog.json`,
    onDisable: async () => { disableCount += 1; },
    selfCheck: async (directory, manifest, { signal }) => {
      checkCount += 1;
      assert.equal(manifest.id, pluginId);
      const { stdout } = await execute(process.execPath, ["-e", "require(process.argv[1]).selfCheck().then(r=>process.stdout.write(JSON.stringify(r)))", path.join(directory, "backend.cjs")], { signal, timeout: 10000 });
      const result = JSON.parse(stdout);
      assert.equal(result.roundTrip, "assistant-ready");
      return result;
    },
  };
  const create = (overrides = {}) => createAssistantPluginManager({ ...options, ...overrides });
  try {
    assert.equal(compareVersion("2.0.2", "2.0.2-beta.10"), 1);
    assert.equal(compareVersion("2.0.2-beta.10", "2.0.2-beta.2"), 1);
    const manager = create();
    assert.equal(manager.getStatus().installed, false);
    assert.equal(manager.getStatus().activeEnabled, false);
    await assert.rejects(fs.stat(dataDir), { code: "ENOENT" });
    await manager.initialize();
    await assert.rejects(fs.stat(dataDir), { code: "ENOENT" });
    const catalog = await manager.checkForUpdate();
    assert.equal(catalog.version, "2.0.2");
    assert.equal(catalog.available, true);
    await manager.install();
    assert.equal(checkCount, 1, "download must run a real isolated module self-check");
    assert.equal(manager.getStatus().installed, true);
    assert.equal(manager.getStatus().activeEnabled, false);
    assert.equal(manager.getStatus().desiredEnabled, true);
    assert.equal(manager.getStatus().restartRequired, true);
    await manager.initialize();
    assert.equal(manager.getStatus().activeEnabled, false, "initialize is frozen for the current application boot");
    assert.equal(JSON.stringify(manager.getStatus()).includes(dataDir), false);

    const running = create();
    await running.initialize();
    assert.equal(running.getStatus().activeEnabled, true);
    assert.equal(running.getStatus().restartRequired, false);
    const oldDirectory = running.getInstallation().activeDirectory;
    await running.setEnabled(false);
    assert.equal(disableCount, 1);
    assert.equal(running.getStatus().activeEnabled, false);
    await running.setEnabled(true);
    await running.initialize();
    assert.equal(running.getStatus().activeEnabled, false);

    catalogVersion = "2.0.3";
    await running.checkForUpdate();
    assert.equal(running.getStatus().updateAvailable, true);
    const signedCatalog = JSON.parse(zlib.gunzipSync(makePackage("2.0.3")).toString("utf8"));
    const incompatibleManifest = JSON.parse(zlib.gunzipSync(makePackage("2.0.3", (envelope, sign) => {
      envelope.manifest.platform = process.platform === "win32" ? "darwin" : "win32";
      sign();
    })).toString("utf8"));
    const badCatalogs = [
      [{ minAppVersion: "3.0.0" }, "PLUGIN_INCOMPATIBLE"],
      [{ maxAppVersion: "2.0.1" }, "PLUGIN_INCOMPATIBLE"],
      [{ platform: process.platform === "win32" ? "darwin" : "win32" }, "PLUGIN_INCOMPATIBLE"],
      [{ arch: process.arch === "arm64" ? "x64" : "arm64" }, "PLUGIN_INCOMPATIBLE"],
      [{ manifest: incompatibleManifest.manifest, signature: incompatibleManifest.signature }, "PLUGIN_INCOMPATIBLE"],
      [{ manifest: signedCatalog.manifest, signature: Buffer.alloc(64, 42).toString("base64") }, "PLUGIN_SIGNATURE"],
      [{ version: "2.0.4", manifest: signedCatalog.manifest, signature: signedCatalog.signature }, "PLUGIN_CATALOG"],
      [{ url: "" }, "PLUGIN_CATALOG"],
    ];
    for (const [overrides, code] of badCatalogs) {
      catalogOverrides = {};
      await running.checkForUpdate();
      catalogOverrides = overrides;
      const downloadsBefore = packageDownloads;
      await assert.rejects(running.install(), { code });
      assert.equal(running.getStatus().update, null, "a direct install must not retain a stale catalog on failure");
      await assert.rejects(running.checkForUpdate(), { code });
      assert.equal(running.getStatus().updateAvailable, false, "failed catalog checks must clear stale updates");
      assert.equal(running.getStatus().update, null);
      await assert.rejects(running.install(), { code });
      assert.equal(packageDownloads, downloadsBefore, "incompatible catalog must fail before downloading a package");
      assert.equal(running.getStatus().version, "2.0.2");
    }
    catalogOverrides = { manifest: signedCatalog.manifest, signature: signedCatalog.signature };
    await running.checkForUpdate();
    assert.equal(running.getStatus().updateAvailable, true, "a valid catalog must recover after failed checks");
    assert.equal(running.getStatus().error, null);
    const catalogManager = create({ dataDir: path.join(temp, "platform-catalog") });
    const entryFor = (version, changes = {}) => {
      const bytes = makePackage(version, (envelope, sign) => { Object.assign(envelope.manifest, changes); sign(); });
      const envelope = JSON.parse(zlib.gunzipSync(bytes));
      const { files, ...metadata } = envelope.manifest;
      const url = `/target-${version}-${changes.platform || "any"}.ffplugin`;
      payloads.set(url, bytes);
      return { ...metadata, url, size: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), manifest: envelope.manifest, signature: envelope.signature };
    };
    const matching = entryFor("2.0.3", { platform: process.platform, arch: "any" });
    const otherPlatform = entryFor("2.0.9", { platform: process.platform === "win32" ? "darwin" : "win32", arch: "any" });
    const futureHost = entryFor("2.0.8", { platform: process.platform, minAppVersion: "3.0.0" });
    const otherArch = entryFor("2.0.7", { platform: process.platform, arch: process.arch === "arm64" ? "x64" : "arm64" });
    const universal = entryFor("2.0.2", { platform: "any", arch: "any" });
    catalogDocument = { schemaVersion: 1, id: pluginId, packages: [otherPlatform, futureHost, otherArch, universal, matching] };
    assert.equal((await catalogManager.checkForUpdate()).version, "2.0.3", "select highest compatible signed package rather than another OS or newer host");
    await catalogManager.install();
    assert.equal(catalogManager.getInstallation().manifest.platform, process.platform);
    const selectedVersion = catalogManager.getStatus().version;
    for (const [document, code] of [
      [{ ...catalogDocument, packages: [otherPlatform, futureHost, otherArch] }, "PLUGIN_INCOMPATIBLE"],
      [{ ...catalogDocument, schemaVersion: 2 }, "PLUGIN_CATALOG"],
      [{ ...catalogDocument, packages: [{ ...matching, platform: "any" }] }, "PLUGIN_CATALOG"],
      [{ ...catalogDocument, packages: [{ ...matching, signature: Buffer.alloc(64).toString("base64") }] }, "PLUGIN_SIGNATURE"],
    ]) {
      catalogDocument = document;
      const downloadsBefore = packageDownloads;
      await assert.rejects(catalogManager.checkForUpdate(), { code });
      await assert.rejects(catalogManager.install(), { code });
      assert.equal(packageDownloads, downloadsBefore);
      assert.equal(catalogManager.getStatus().version, selectedVersion);
      assert.equal(catalogManager.getStatus().update, null);
    }
    catalogDocument = { schemaVersion: 1, id: pluginId, packages: [matching] };
    await catalogManager.checkForUpdate();
    assert.equal(catalogManager.getStatus().error, null, "valid signed catalog recovers after rejection");
    for (const encoding of ["gzip", "br"]) {
      catalogEncoding = encoding;
      assert.equal((await catalogManager.checkForUpdate()).version, "2.0.3");
      await catalogManager.install();
      assert.equal(catalogManager.getStatus().version, "2.0.3", "compressed HTTP catalogs must install using decoded bytes");
    }
    catalogDocument = { ...catalogDocument, padding: "x".repeat(70 * 1024) };
    await assert.rejects(catalogManager.checkForUpdate(), { code: "PLUGIN_SIZE" });
    assert.equal(catalogManager.getStatus().version, "2.0.3", "decoded response limit still protects the installed version");
    catalogEncoding = null;
    catalogDocument = null;
    await catalogManager.uninstall();
    catalogOverrides = {};
    catalogVersion = "2.0.2";

    const attacks = [
      ["bad-signature", makePackage("2.0.4", (envelope) => { envelope.signature = Buffer.alloc(64, 42).toString("base64"); }), "PLUGIN_SIGNATURE"],
      ["bad-content", makePackage("2.0.4", (envelope) => { envelope.files["backend.cjs"] = Buffer.from("malicious code").toString("base64"); }), "PLUGIN_INTEGRITY"],
      ["unsafe-path", makePackage("2.0.4", (envelope, sign) => { envelope.manifest.files["../escape"] = { size: 1, sha256: "a".repeat(64) }; sign(); }), "PLUGIN_CONTENT"],
      ["new-host", makePackage("2.0.4", (envelope, sign) => { envelope.manifest.hostApiVersion = 2; sign(); }), "PLUGIN_INCOMPATIBLE"],
      ["new-app", makePackage("2.0.4", (envelope, sign) => { envelope.manifest.minAppVersion = "3.0.0"; sign(); }), "PLUGIN_INCOMPATIBLE"],
      ["extra-file", makePackage("2.0.4", (envelope) => { envelope.files["extra.js"] = ""; }), "PLUGIN_CONTENT"],
      ["bad-gzip", Buffer.from("not a plugin"), "PLUGIN_CONTENT"],
    ];
    for (const [name, bytes, code] of attacks) {
      payloads.set(`/${name}`, bytes);
      await assert.rejects(running.install({ url: `${baseUrl}/${name}` }), { code });
      assert.equal(running.getStatus().version, "2.0.2", `${name} must retain the installed version`);
    }
    await assert.rejects(running.install({ url: `${baseUrl}/redirect` }), { code: "PLUGIN_URL" });
    await assert.rejects(running.install({ url: `${baseUrl}/missing` }), { code: "PLUGIN_DOWNLOAD" });
    const httpsOnly = create({ allowLoopback: false, dataDir: path.join(temp, "https-only") });
    await assert.rejects(httpsOnly.install({ url: `${baseUrl}/assistant-2.0.2.ffplugin` }), { code: "PLUGIN_URL" });

    const pending = running.install({ url: `${baseUrl}/slow` });
    const start = Date.now();
    while ((running.getStatus().progress?.receivedBytes || 0) === 0) {
      assert.ok(Date.now() - start < 3000, "download should report progress");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(running.cancel(), true);
    await pending;
    assert.equal(running.getStatus().error.code, "PLUGIN_CANCELLED");
    assert.equal(running.getStatus().version, "2.0.2");
    assert.equal(running.cancel(), false);
    const timeout = create({ timeoutMs: 50 });
    await timeout.initialize();
    await assert.rejects(timeout.install({ url: `${baseUrl}/slow` }), { code: "PLUGIN_TIMEOUT" });
    assert.equal(timeout.getStatus().version, "2.0.2");

    const checkFailure = create({ selfCheck: async () => ({ ok: false }) });
    await checkFailure.initialize();
    await assert.rejects(checkFailure.install({ url: `${baseUrl}/assistant-2.0.3.ffplugin` }), { code: "PLUGIN_SELF_CHECK" });
    assert.equal(checkFailure.getStatus().version, "2.0.2");
    assert.equal(checkFailure.getStatus().activeEnabled, true);
    const cancellation = create({ selfCheck: async (directory, manifest, { signal }) => new Promise((resolve) => signal.addEventListener("abort", () => resolve({ ok: false }), { once: true })) });
    await cancellation.initialize();
    const checking = cancellation.install({ url: `${baseUrl}/assistant-2.0.3.ffplugin` });
    const checkingStart = Date.now();
    while (cancellation.getStatus().phase !== "checking") {
      assert.ok(Date.now() - checkingStart < 3000);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    cancellation.cancel();
    await checking;
    assert.equal(cancellation.getStatus().error.code, "PLUGIN_CANCELLED");
    assert.equal(cancellation.getStatus().version, "2.0.2");
    const pluginRoot = path.join(dataDir, "plugins", pluginId);
    assert.equal((await fs.readdir(pluginRoot)).some((name) => name.startsWith(".staging-")), false);

    const active = create();
    await active.initialize();
    assert.equal(active.getInstallation().activeDirectory, oldDirectory);
    catalogVersion = "2.0.3";
    await active.install();
    assert.equal(active.getStatus().version, "2.0.3");
    assert.equal(active.getStatus().activeEnabled, true);
    assert.equal(active.getStatus().restartRequired, true, "an update cannot hot-swap the running module");
    assert.equal(active.getInstallation().activeDirectory, oldDirectory);
    await fs.access(path.join(oldDirectory, "backend.cjs"));
    let restarted = create();
    await restarted.initialize();
    assert.equal(restarted.getStatus().version, "2.0.3");
    assert.equal(restarted.getStatus().activeEnabled, true);
    assert.notEqual(restarted.getInstallation().activeDirectory, oldDirectory);

    const history = path.join(dataDir, "agent", "sessions.sqlite");
    await fs.mkdir(path.dirname(history), { recursive: true });
    await fs.writeFile(history, "existing history must survive");
    const offline = path.join(temp, "assistant.ffplugin");
    await fs.writeFile(offline, makePackage("2.0.3"));
    const cleanupDir = path.join(temp, "install-cleanup-failure");
    const cleanupVersions = path.join(cleanupDir, "plugins", pluginId, "versions");
    const cleanupManager = create({ dataDir: cleanupDir, selfCheck: async () => ({ ok: true }) });
    const originalReaddir = fs.readdir;
    fs.readdir = async (directory, ...args) => {
      if (directory === cleanupVersions) throw Object.assign(new Error("simulated old-version listing failure"), { code: "EACCES" });
      return originalReaddir(directory, ...args);
    };
    try { await cleanupManager.install({ filePath: offline }); }
    finally { fs.readdir = originalReaddir; }
    assert.equal(cleanupManager.getStatus().installed, true, "optional old-version cleanup must not undo a committed installation");
    assert.equal(cleanupManager.getStatus().phase, "ready");
    assert.equal(cleanupManager.getStatus().restartRequired, true);
    const cleanupBoot = create({ dataDir: cleanupDir });
    await cleanupBoot.initialize();
    assert.equal(cleanupBoot.getStatus().activeEnabled, true);
    await cleanupBoot.uninstall();
    for (let index = 0; index < 20; index += 1) {
      await restarted.setEnabled(false);
      assert.equal(restarted.getStatus().activeEnabled, false);
      await restarted.setEnabled(true);
      assert.equal(restarted.getStatus().activeEnabled, false);
      await restarted.initialize();
      assert.equal(restarted.getStatus().activeEnabled, false);
      restarted = create();
      await restarted.initialize();
      assert.equal(restarted.getStatus().activeEnabled, true);
    }
    let failStop = true;
    let stopAttempts = 0;
    const failedShutdown = create({ onDisable: async () => {
      stopAttempts += 1;
      assert.equal(failedShutdown.getStatus().activeEnabled, false, "disable must reject new requests before awaiting worker exit");
      assert.equal(failedShutdown.getStatus().desiredEnabled, false);
      if (failStop) throw new Error("simulated worker shutdown error");
    } });
    await failedShutdown.initialize();
    await assert.rejects(failedShutdown.setEnabled(false), { code: "PLUGIN_DISABLE" });
    assert.equal(failedShutdown.getStatus().activeEnabled, false);
    assert.equal(failedShutdown.getStatus().desiredEnabled, false);
    assert.equal(failedShutdown.getStatus().stopPending, true, "failed stop must not masquerade as a completed disable");
    failStop = false;
    await failedShutdown.setEnabled(false);
    assert.equal(stopAttempts, 2, "failed worker shutdown must remain retryable");
    assert.equal(failedShutdown.getStatus().error, null);
    assert.equal(failedShutdown.getStatus().phase, "ready");
    assert.equal(failedShutdown.getStatus().stopPending, false);
    await failedShutdown.setEnabled(true);
    await fs.appendFile(path.join(restarted.getInstallation().directory, "backend.cjs"), "tamper");
    const corrupted = create();
    await corrupted.initialize();
    assert.equal(corrupted.getStatus().phase, "error");
    assert.equal(corrupted.getStatus().activeEnabled, false);
    assert.equal(corrupted.getStatus().integrity.valid, false, "historic self-check is not proof that current files remain valid");
    assert.equal(corrupted.getStatus().selfCheck.ok, true);
    await corrupted.install({ filePath: offline });
    assert.equal(corrupted.getStatus().phase, "ready");
    assert.equal(corrupted.getStatus().activeEnabled, false);
    assert.equal(corrupted.getStatus().integrity.valid, true);
    await corrupted.setEnabled(false);
    assert.equal(corrupted.getStatus().restartRequired, false);
    await corrupted.uninstall();
    assert.equal(corrupted.getStatus().installed, false);
    assert.equal(await fs.readFile(history, "utf8"), "existing history must survive");
    await corrupted.install({ filePath: offline });
    assert.equal(corrupted.getStatus().activeEnabled, false);
    assert.equal(await fs.readFile(history, "utf8"), "existing history must survive");
    const finalBoot = create();
    await finalBoot.initialize();
    assert.equal(finalBoot.getStatus().activeEnabled, true);

    const disabledDir = path.join(temp, "disabled-update");
    const disabledUpdate = create({ dataDir: disabledDir });
    await disabledUpdate.install({ url: `${baseUrl}/assistant-2.0.2.ffplugin` });
    await disabledUpdate.setEnabled(false);
    await disabledUpdate.install({ filePath: offline });
    assert.equal(disabledUpdate.getStatus().desiredEnabled, false, "updating a disabled plugin must preserve the user's choice");
    assert.equal(disabledUpdate.getStatus().restartRequired, false);
    const disabledBoot = create({ dataDir: disabledDir });
    await disabledBoot.initialize();
    assert.equal(disabledBoot.getStatus().activeEnabled, false);
    await disabledBoot.setEnabled(true);
    const integrityBoot = create({ dataDir: disabledDir });
    await integrityBoot.initialize();
    await fs.appendFile(path.join(integrityBoot.getInstallation().directory, "assistant.js"), "tampered after startup");
    const inspected = await integrityBoot.refreshStatus();
    assert.equal(inspected.integrity.valid, false);
    assert.equal(inspected.activeEnabled, false, "detecting damaged active files must block new work");
    assert.equal(inspected.desiredEnabled, true, "repair preserves the user's enable preference");
    await integrityBoot.install({ filePath: offline });
    assert.equal(integrityBoot.getStatus().integrity.valid, true);
    assert.equal(integrityBoot.getStatus().activeEnabled, false, "repair also waits until the next boot");
    assert.equal(integrityBoot.getStatus().restartRequired, true);

    const recoveryDir = path.join(temp, "uninstall-recovery");
    let failRecoveryStop = false;
    const recoveryOptions = { dataDir: recoveryDir, selfCheck: async () => ({ ok: true }), onDisable: async () => {
      if (failRecoveryStop) throw new Error("simulated worker stop failure");
    } };
    const recoveryRegistry = path.join(recoveryDir, "plugins", pluginId, "state.json");
    const recoveryVersions = path.join(recoveryDir, "plugins", pluginId, "versions");
    const originalRemove = fs.rm;
    let failRemove = false;
    fs.rm = async (target, opts) => {
      if (failRemove && target === recoveryVersions) throw Object.assign(new Error("simulated Windows file lock"), { code: "EBUSY" });
      return originalRemove(target, opts);
    };
    try {
      for (let index = 0; index < 20; index += 1) {
        let recovery = create(recoveryOptions);
        await recovery.install({ filePath: offline });
        recovery = create(recoveryOptions);
        await recovery.initialize();
        assert.equal(recovery.getStatus().activeEnabled, true);
        failRecoveryStop = true;
        await assert.rejects(recovery.setEnabled(false), { code: "PLUGIN_DISABLE" });
        assert.equal(recovery.getStatus().stopPending, true);
        await assert.rejects(recovery.uninstall(), { code: "PLUGIN_UNINSTALL" });
        assert.equal(recovery.getStatus().cleanupPending, true);
        assert.equal(recovery.getStatus().stopPending, true);
        failRecoveryStop = false;
        failRemove = true;
        await assert.rejects(recovery.uninstall(), { code: "PLUGIN_UNINSTALL" });
        assert.equal(recovery.getStatus().installed, true, "failed removal must retain a retryable installation record");
        assert.equal(recovery.getStatus().cleanupPending, true);
        assert.equal(recovery.getStatus().activeEnabled, false);
        assert.equal((JSON.parse(await fs.readFile(recoveryRegistry, "utf8"))).cleanupPending, true);
        recovery = create(recoveryOptions);
        await recovery.initialize();
        assert.equal(recovery.getStatus().phase, "cleanup-pending");
        assert.equal(recovery.getStatus().activeEnabled, false, "unfinished uninstall must never reactivate on restart");
        await assert.rejects(recovery.setEnabled(true), { code: "PLUGIN_CLEANUP_PENDING" });
        await assert.rejects(recovery.install({ filePath: offline }), { code: "PLUGIN_CLEANUP_PENDING" });
        failRemove = false;
        if (index % 2) {
          recovery = create(recoveryOptions);
          await recovery.initialize();
        } else await recovery.uninstall();
        assert.equal(recovery.getStatus().cleanupPending, false);
        assert.equal(recovery.getStatus().installed, false);
        assert.equal(recovery.getStatus().phase, "not-installed");
      }
    } finally { fs.rm = originalRemove; }

    const saveDir = path.join(temp, "disable-save-failure");
    const saved = create({ dataDir: saveDir, selfCheck: async () => ({ ok: true }) });
    await saved.install({ filePath: offline });
    const saveBoot = create({ dataDir: saveDir });
    await saveBoot.initialize();
    const originalRename = fs.rename;
    const savedRegistry = path.join(saveDir, "plugins", pluginId, "state.json");
    fs.rename = async (source, target) => {
      if (target === savedRegistry) throw Object.assign(new Error("simulated state save failure"), { code: "EACCES" });
      return originalRename(source, target);
    };
    try {
      await assert.rejects(saveBoot.setEnabled(false), { code: "PLUGIN_DISABLE" });
      assert.equal(saveBoot.getStatus().activeEnabled, false);
      assert.equal(saveBoot.getStatus().stopPending, true, "save failure also keeps the retry affordance");
      assert.equal(saveBoot.getStatus().phase, "disable-pending");
    } finally { fs.rename = originalRename; }
    await saveBoot.setEnabled(false);
    const savedDisabled = create({ dataDir: saveDir });
    await savedDisabled.initialize();
    assert.equal(savedDisabled.getStatus().activeEnabled, false);
    assert.equal(savedDisabled.getStatus().desiredEnabled, false);
    const invalidRecordDir = path.join(temp, "invalid-install-record");
    const invalidState = path.join(invalidRecordDir, "plugins", pluginId, "state.json");
    await fs.mkdir(path.dirname(invalidState), { recursive: true });
    await fs.writeFile(invalidState, JSON.stringify({ schemaVersion: 1, desiredEnabled: true, installed: {} }));
    const invalidRecord = create({ dataDir: invalidRecordDir, selfCheck: async () => ({ ok: true }) });
    await invalidRecord.initialize();
    assert.equal(invalidRecord.getStatus().integrity.valid, false);
    assert.equal(invalidRecord.getStatus().installed, true, "damaged records must still expose repair and uninstall");
    await invalidRecord.install({ filePath: offline });
    assert.equal(invalidRecord.getStatus().integrity.valid, true);
    await invalidRecord.uninstall();
    const artifactIndex = process.argv.indexOf("--artifact");
    if (artifactIndex >= 0) {
      const artifact = await fs.readFile(process.argv[artifactIndex + 1]);
      const manifest = JSON.parse(zlib.gunzipSync(artifact).toString("utf8")).manifest;
      payloads.set("/real.ffplugin", artifact);
      payloads.set("/real-catalog.json", Buffer.from(JSON.stringify({ id: manifest.id, version: manifest.version, minAppVersion: manifest.minAppVersion,
        hostApiVersion: manifest.hostApiVersion, url: "/real.ffplugin", size: artifact.length, sha256: crypto.createHash("sha256").update(artifact).digest("hex") })));
      const actualOptions = {
        ...options, publicKey: undefined, dataDir: path.join(temp, "real-artifact"),
        catalogUrl: `${baseUrl}/real-catalog.json`,
        selfCheck: async (directory, _manifest, { signal }) => {
          const { stdout } = await execute(process.execPath, ["-e", "require(process.argv[1]).selfCheck().then(r=>process.stdout.write(JSON.stringify(r)))", path.join(directory, "backend.cjs")], { signal, timeout: 10000 });
          const result = JSON.parse(stdout);
          assert.equal(result.ok, true);
          assert.ok(result.checks.includes("sqlite"));
          assert.ok(result.checks.includes("schema"));
          return result;
        },
      };
      const actual = createAssistantPluginManager(actualOptions);
      assert.equal((await actual.checkForUpdate()).version, manifest.version);
      await actual.install();
      assert.equal(actual.getStatus().version, manifest.version);
      assert.equal(actual.getStatus().activeEnabled, false);
      const actualRestart = createAssistantPluginManager(actualOptions);
      await actualRestart.initialize();
      assert.equal(actualRestart.getStatus().activeEnabled, true);
      await actualRestart.setEnabled(false);
      await actualRestart.uninstall();
      console.log("PASS actual release artifact: catalog discovery, trusted signature, HTTP download, bundled SQLite/schema self-check, deferred activation, uninstall");
    }
    console.log("PASS assistant plugin manager: signed catalog download, self-check, deferred activation, disabled update/repair, current integrity, state-save failure, 20 enable cycles and 20 stop/uninstall failure+restart recovery cycles, history preservation");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
