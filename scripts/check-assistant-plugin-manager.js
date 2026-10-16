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
  let disableCount = 0;
  let checkCount = 0;
  const server = http.createServer((request, response) => {
    if (request.url === "/catalog.json") {
      const body = payloads.get(`/assistant-${catalogVersion}.ffplugin`);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        id: pluginId, version: catalogVersion, hostApiVersion: 1, minAppVersion: "2.0.2",
        url: `assistant-${catalogVersion}.ffplugin`, size: body.length,
        sha256: crypto.createHash("sha256").update(body).digest("hex"),
      }));
      return;
    }
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "http://192.168.0.1/unsafe" });
      response.end();
      return;
    }
    const body = payloads.get(request.url);
    if (!body) { response.writeHead(404); response.end(); return; }
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
    failStop = false;
    await failedShutdown.setEnabled(false);
    assert.equal(stopAttempts, 2, "failed worker shutdown must remain retryable");
    assert.equal(failedShutdown.getStatus().error, null);
    assert.equal(failedShutdown.getStatus().phase, "ready");
    await failedShutdown.setEnabled(true);
    await fs.appendFile(path.join(restarted.getInstallation().directory, "backend.cjs"), "tamper");
    const corrupted = create();
    await corrupted.initialize();
    assert.equal(corrupted.getStatus().phase, "error");
    assert.equal(corrupted.getStatus().activeEnabled, false);
    await corrupted.install({ filePath: offline });
    assert.equal(corrupted.getStatus().phase, "ready");
    assert.equal(corrupted.getStatus().activeEnabled, false);
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
    const artifactIndex = process.argv.indexOf("--artifact");
    if (artifactIndex >= 0) {
      const artifact = await fs.readFile(process.argv[artifactIndex + 1]);
      const manifest = JSON.parse(zlib.gunzipSync(artifact).toString("utf8")).manifest;
      payloads.set("/real.ffplugin", artifact);
      const actualOptions = {
        ...options, publicKey: undefined, dataDir: path.join(temp, "real-artifact"),
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
      await actual.install({ url: `${baseUrl}/real.ffplugin` });
      assert.equal(actual.getStatus().version, manifest.version);
      assert.equal(actual.getStatus().activeEnabled, false);
      const actualRestart = createAssistantPluginManager(actualOptions);
      await actualRestart.initialize();
      assert.equal(actualRestart.getStatus().activeEnabled, true);
      await actualRestart.setEnabled(false);
      await actualRestart.uninstall();
      console.log("PASS actual release artifact: trusted signature, HTTP download, bundled SQLite/schema self-check, deferred activation, uninstall");
    }
    console.log("PASS assistant plugin manager: signed HTTP download, isolated self-check, deferred activation, failure rollback, cancellation, 20 restart cycles, offline reinstall, history preservation");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
