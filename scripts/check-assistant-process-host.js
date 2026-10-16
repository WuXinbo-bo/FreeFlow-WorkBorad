const assert = require("assert/strict");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const http = require("http");
const express = require("express");
const { AgentStore } = require("../src/backend/agent/agentStore");
const { createAssistantPluginManager } = require("../src/backend/plugins/assistantPluginManager");
const { createAssistantProcessHost } = require("../src/backend/plugins/assistantProcessHost");
const { createAssistantPluginRouter } = require("../src/backend/plugins/assistantPluginRoutes");
const { getDefaultProviderSettings, providerValidationFingerprint } = require("../src/backend/agent/agentSettingsModel");
const packageInfo = require("../package.json");

async function checkBundledTurns({ host, baseUrl, cookie, directory, secrets }) {
  const fixture = path.join(directory, "claude-fixture.js");
  await fs.copyFile(path.join(__dirname, "fixtures/claude-cli.js"), fixture);
  const provider = {
    ...getDefaultProviderSettings("claude"),
    cliPath: fixture, cliVersion: "claude-cli fixture 1.0.0", cliSource: "configured",
    baseUrl: "https://example.test", apiKeyConfigured: true,
    models: [{ id: "claude-test", displayName: "Claude Test" }], selectedModel: "claude-test",
    modelValidatedAt: Date.now(),
  };
  provider.validationFingerprint = providerValidationFingerprint("claude", provider);
  secrets.set("agent-provider:claude:api-key", "fixture-only-never-sent-to-a-cloud-service");
  await host.settingsService.writeAgentSettings({ activeProvider: "claude", providers: { claude: provider } });
  async function request(suffix, method = "GET", body) {
    const response = await fetch(`${baseUrl}/api/agent${suffix}`, {
      method, headers: { cookie, origin: baseUrl, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    assert.ok(response.ok, `${method} ${suffix}: ${JSON.stringify(result)}`);
    return result;
  }
  async function eventually(check, label) {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const value = await check();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail(label);
  }
  const { session } = await request("/sessions", "POST", { provider: "claude", title: "Installed bundle turn lifecycle" });
  assert.equal(session.provider, "claude");
  assert.equal(session.runtimeBinding.cliPath, fixture);
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/agent/sessions/${session.id}/events`, { headers: { cookie }, signal: controller.signal });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = "";
  let streamError;
  const reading = (async () => {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += decoder.decode(chunk.value, { stream: true });
    }
  })().catch((error) => { if (!controller.signal.aborted) streamError = error; });
  try {
    await eventually(() => output.includes("event: ready"), "installed bundle SSE did not become ready");
    const first = await request(`/sessions/${session.id}/turns`, "POST", { text: "normal", clientRequestId: "bundle-normal" });
    assert.equal(first.turn.status, "running");
    const completed = await eventually(async () => {
      const current = (await request(`/sessions/${session.id}`)).session;
      return current.turns.some((turn) => turn.clientRequestId === "bundle-normal" && turn.status === "completed") && current;
    }, "installed bundle did not complete the real CLI turn");
    assert.equal(completed.status, "idle");
    assert.equal(completed.messages.filter((message) => message.role === "assistant").at(-1).content, "Claude reply");
    await eventually(() => output.includes('"type":"message.delta"') && output.includes('"delta":"Claude "') && output.includes('"type":"turn.completed"'), "installed bundle did not proxy streamed text and completion over SSE");
    const duplicate = await request(`/sessions/${session.id}/turns`, "POST", { text: "normal", clientRequestId: "bundle-normal" });
    assert.equal(duplicate.duplicate, true);

    const slow = await request(`/sessions/${session.id}/turns`, "POST", { text: "slow", clientRequestId: "bundle-slow" });
    assert.equal(slow.turn.status, "running");
    const queued = await request(`/sessions/${session.id}/turns`, "POST", { text: "queued normal", clientRequestId: "bundle-queued" });
    assert.equal(queued.queued, true);
    const duplicateQueue = await request(`/sessions/${session.id}/turns`, "POST", { text: "queued normal", clientRequestId: "bundle-queued" });
    assert.equal(duplicateQueue.duplicate, true);
    const interrupted = await request(`/sessions/${session.id}/interrupt`, "POST", {});
    assert.equal(interrupted.interrupted, true);
    const drained = await eventually(async () => {
      const current = (await request(`/sessions/${session.id}`)).session;
      return current.turns.some((turn) => turn.clientRequestId === "bundle-slow" && turn.status === "cancelled")
        && current.turns.some((turn) => turn.clientRequestId === "bundle-queued" && turn.status === "completed") && current;
    }, "installed bundle failed to stop the active turn and complete its queued successor");
    assert.equal(drained.status, "idle");
    assert.equal(drained.pendingInputs.length, 0);
    assert.equal(drained.messages.filter((message) => message.role === "assistant").length, 2);
    await eventually(() => output.includes('"type":"queue.added"') && output.includes('"type":"turn.cancelled"'), "installed bundle queue/cancellation events were not streamed");
    assert.equal(streamError, undefined);
    console.log("PASS installed assistant bundle turns: real fixture CLI discovery, session creation, streamed text/completion, idempotent sends, queued follow-up, interrupt, idle recovery");
  } finally {
    controller.abort();
    await reader.cancel().catch(() => {});
    await reading;
  }
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-assistant-process-"));
  const paths = {
    ROOT_DIR: path.resolve(__dirname, ".."), WORKSPACE_DIR: directory,
    AGENT_SETTINGS_FILE: path.join(directory, "agent-settings.json"),
    AGENT_DATABASE_FILE: path.join(directory, "agent-sessions.sqlite"),
    AGENT_ATTACHMENTS_DIR: path.join(directory, "attachments"),
    AGENT_PROFILES_DIR: path.join(directory, "profiles"),
    AGENT_BACKUPS_DIR: path.join(directory, "backups"),
    AGENT_WORKSPACES_DIR: path.join(directory, "workspaces"),
  };
  const seed = new AgentStore(paths.AGENT_DATABASE_FILE);
  seed.open();
  seed.setMeta("legacy-history-retired-v1", "done");
  seed.createSession({ id: "session-1", provider: "codex", title: "Persistent plugin session", workspaceRoot: directory });
  seed.close();
  const secrets = new Map();
  let secretReads = 0;
  const services = {
    permissionsService: {
      readPermissionsStore: async () => ({ allowedDirectories: [directory] }),
      resolveAllowedExistingPath: async (value) => path.resolve(value),
    },
    sessionService: { readSessionStore: async () => ({ sessions: [] }), writeSessionStore: async () => {} },
    secretStorageService: {
      readSecret: async (key) => { secretReads += 1; return secrets.get(key) || ""; },
      writeSecret: async (key, value) => { secrets.set(key, value); },
      clearSecret: async (key) => { secrets.delete(key); },
    },
  };
  let manager;
  const host = createAssistantProcessHost({
    paths, appVersion: packageInfo.version, services,
    getInstallation: () => manager.getInstallation(),
    isEnabled: () => manager.getStatus().activeEnabled,
  });
  const createManager = () => createAssistantPluginManager({
    dataDir: directory, appVersion: packageInfo.version,
    selfCheck: host.selfCheck, onDisable: host.shutdown,
  });
  manager = createManager();
  const app = express();
  app.use(express.json());
  app.use("/api/plugins/assistant", createAssistantPluginRouter({ manager: {
    initialize: (...args) => manager.initialize(...args),
    getStatus: (...args) => manager.getStatus(...args),
    getInstallation: (...args) => manager.getInstallation(...args),
    checkForUpdate: (...args) => manager.checkForUpdate(...args),
    install: (...args) => manager.install(...args),
    cancel: (...args) => manager.cancel(...args),
    setEnabled: (...args) => manager.setEnabled(...args),
    uninstall: (...args) => manager.uninstall(...args),
  }, processHost: host }));
  app.use("/api/agent", (req, res) => host.proxy(req, res));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let streamReader;
  async function bootstrap() {
    const response = await fetch(`${baseUrl}/api/agent/bootstrap`);
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  }
  try {
    await manager.initialize();
    const absent = await fetch(`${baseUrl}/api/agent/bootstrap`);
    assert.equal(absent.status, 409);
    assert.equal(host.isRunning(), false);
    const malicious = await fetch(`${baseUrl}/api/plugins/assistant/enabled`, {
      method: "POST", headers: { "content-type": "application/json", origin: "https://untrusted.example", "x-freeflow-plugin": "1" }, body: JSON.stringify({ enabled: true }),
    });
    assert.equal(malicious.status, 403);
    const boundaryFixture = path.join(directory, "credential-boundary-check");
    await fs.mkdir(boundaryFixture);
    await fs.writeFile(path.join(boundaryFixture, "backend.cjs"), `
      exports.createAssistantBackend = (host) => ({
        async selfCheck() {
          let denied = 0;
          for (const method of ["readSecret", "writeSecret", "clearSecret"]) {
            try { await host.secretStorageService[method]("github-sync", "must-not-be-written"); }
            catch (error) { if (/其他组件/.test(error.message)) denied += 1; else throw error; }
          }
          if (denied !== 3) throw new Error("Non-assistant credentials were exposed");
          return { ok: true, denied };
        },
        async shutdown() {},
      });
    `);
    assert.equal((await host.selfCheck(boundaryFixture)).denied, 3);
    assert.equal(secretReads, 0, "rejected credential calls must not reach the vault");
    assert.equal(secrets.has("github-sync"), false);
    const artifact = process.argv[2] || path.join(__dirname, "..", "release/plugins", `freeflow-ai-assistant-${packageInfo.version}.ffplugin`);
    await manager.install({ filePath: artifact });
    assert.equal(manager.getStatus().selfCheck.ok, true);
    assert.equal(manager.getStatus().activeEnabled, false);
    assert.equal(host.isRunning(), false);
    assert.equal(secretReads, 0, "installation self-check must not read user credentials");
    manager = createManager();
    await manager.initialize();
    assert.equal(manager.getStatus().activeEnabled, true);
    assert.equal(host.isRunning(), false, "enabled assistant stays lazy until used");

    let cookie = await bootstrap();
    const worker = await host.ensureRunning();
    const direct = await fetch(`http://127.0.0.1:${worker.port}/api/agent/bootstrap`);
    assert.equal(direct.status, 403, "worker endpoint needs an unguessable host capability");
    const crossOrigin = await fetch(`${baseUrl}/api/agent/bootstrap`, { headers: { origin: "https://untrusted.example", "sec-fetch-site": "cross-site" } });
    assert.equal(crossOrigin.status, 403);
    const noCookie = await fetch(`${baseUrl}/api/agent/sessions`);
    assert.equal(noCookie.status, 401);
    const sessions = await fetch(`${baseUrl}/api/agent/sessions`, { headers: { cookie } });
    assert.equal(sessions.status, 200);
    assert.equal((await sessions.json()).sessions[0].id, "session-1");

    const settings = await host.settingsService.readAgentSettings();
    assert.equal(settings.showReasoning, true);
    assert.ok(secretReads >= 2, "settings RPC should use the bounded credential bridge");
    await host.settingsService.writeAgentSettings({ showReasoning: false });
    assert.equal((await host.settingsService.readAgentSettings()).showReasoning, false);
    assert.equal(JSON.parse(await fs.readFile(paths.AGENT_SETTINGS_FILE, "utf8")).showReasoning, false);

    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/api/agent/sessions/session-1/events`, { headers: { cookie }, signal: controller.signal });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get("content-type"), /event-stream/);
    streamReader = stream.body.getReader();
    const decoder = new TextDecoder();
    let output = "";
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      while (!output.includes("event: ready")) {
        const chunk = await streamReader.read();
        assert.equal(chunk.done, false);
        output += decoder.decode(chunk.value);
      }
      assert.match(output, /session.created/);
      const rename = await fetch(`${baseUrl}/api/agent/sessions/session-1`, {
        method: "PATCH", headers: { cookie, "content-type": "application/json", origin: baseUrl }, body: JSON.stringify({ title: "Renamed across process boundary" }),
      });
      assert.equal(rename.status, 200);
      while (!output.includes("Renamed across process boundary")) {
        const chunk = await streamReader.read();
        assert.equal(chunk.done, false);
        output += decoder.decode(chunk.value);
      }
    } finally {
      clearTimeout(timer);
      await streamReader.cancel();
      streamReader = null;
    }

    await checkBundledTurns({ host, baseUrl, cookie, directory, secrets });

    worker.child.kill();
    await worker.exit;
    assert.equal(host.isRunning(), false);
    cookie = await bootstrap();
    const afterCrash = await fetch(`${baseUrl}/api/agent/sessions`, { headers: { cookie } });
    assert.equal((await afterCrash.json()).sessions.find((session) => session.id === "session-1").title, "Renamed across process boundary");
    const closingStream = await fetch(`${baseUrl}/api/agent/sessions/session-1/events`, { headers: { cookie }, signal: AbortSignal.timeout(5000) });
    const closingReader = closingStream.body.getReader();
    let closingText = "";
    while (!closingText.includes("event: ready")) {
      const chunk = await closingReader.read();
      assert.equal(chunk.done, false);
      closingText += decoder.decode(chunk.value);
    }
    const stopping = host.shutdown();
    await assert.rejects(host.ensureRunning(), /停止|停用|尚未启用|stopp/i);
    await stopping;
    while (!(await closingReader.read()).done) { /* Drain buffered events before EOF. */ }
    assert.equal(host.isRunning(), false);
    await manager.setEnabled(false);
    assert.equal(host.isRunning(), false);
    await manager.setEnabled(true);
    const stillDisabled = await fetch(`${baseUrl}/api/agent/bootstrap`);
    assert.equal(stillDisabled.status, 409);
    for (let index = 0; index < 20; index += 1) {
      manager = createManager();
      await manager.initialize();
      const same = await Promise.all([host.ensureRunning(), host.ensureRunning(), host.ensureRunning()]);
      assert.equal(new Set(same.map((instance) => instance.child.pid)).size, 1);
      await manager.setEnabled(false);
      assert.equal(host.isRunning(), false);
      assert.ok(same[0].child.exitCode != null, "disabled worker must actually exit");
      await manager.setEnabled(true);
    }
    manager = createManager();
    await manager.initialize();
    const early = [host.ensureRunning(), host.ensureRunning(), host.settingsService.readAgentSettings()];
    const rapidDisable = manager.setEnabled(false);
    const earlyResults = await Promise.allSettled(early);
    await rapidDisable;
    assert.equal(earlyResults.every((result) => result.status === "rejected"), true, "all startup waiters must reject after disable during startup");
    assert.equal(host.isRunning(), false);
    await manager.uninstall();
    assert.equal((await fs.stat(paths.AGENT_DATABASE_FILE)).isFile(), true);
    assert.equal(host.isRunning(), false);
    console.log("PASS assistant process host: real signed bundle install/self-check, lazy child, protected HTTP proxy, settings/credential RPC, SSE replay/live events, crash recovery, shutdown guard, 20 enable/restart/disable cycles, history retention");
  } finally {
    await streamReader?.cancel().catch(() => {});
    await host.shutdown();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
