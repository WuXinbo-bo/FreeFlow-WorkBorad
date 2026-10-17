const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createAssistantPluginManager } = require("../src/backend/plugins/assistantPluginManager");
const { createAssistantProcessHost } = require("../src/backend/plugins/assistantProcessHost");
const { ASSISTANT_PLUGIN_CATALOG_URL } = require("../src/backend/plugins/pluginTrust");
const { validateCatalogUrl } = require("./configure-assistant-plugin-release");
const { version: appVersion } = require("../package.json");

// This opt-in test uses only a disposable profile and anonymous public HTTPS.
// It never reads the user's assistant settings, tokens, or canvas sync account.
async function checkAssistantPluginOnline({ catalogUrl = ASSISTANT_PLUGIN_CATALOG_URL } = {}) {
  validateCatalogUrl(catalogUrl, true);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-plugin-online-"));
  const secrets = new Map();
  const paths = {
    ROOT_DIR: path.resolve(__dirname, ".."), WORKSPACE_DIR: directory,
    AGENT_SETTINGS_FILE: path.join(directory, "agent-settings.json"),
    AGENT_DATABASE_FILE: path.join(directory, "agent-sessions.sqlite"),
    AGENT_ATTACHMENTS_DIR: path.join(directory, "attachments"),
    AGENT_PROFILES_DIR: path.join(directory, "profiles"),
    AGENT_BACKUPS_DIR: path.join(directory, "backups"),
    AGENT_WORKSPACES_DIR: path.join(directory, "workspaces"),
  };
  const services = {
    permissionsService: {
      readPermissionsStore: async () => ({ allowedDirectories: [directory] }),
      resolveAllowedExistingPath: async (value) => path.resolve(value),
    },
    sessionService: { readSessionStore: async () => ({ sessions: [] }), writeSessionStore: async () => {} },
    secretStorageService: {
      readSecret: async (key) => secrets.get(key) || "",
      writeSecret: async (key, value) => { secrets.set(key, value); },
      clearSecret: async (key) => { secrets.delete(key); },
    },
  };
  const hosts = [];
  function boot() {
    let manager;
    const host = createAssistantProcessHost({
      paths, appVersion, services,
      getInstallation: () => manager.getInstallation(),
      isEnabled: () => manager.getStatus().activeEnabled,
    });
    manager = createAssistantPluginManager({
      dataDir: directory, appVersion, catalogUrl,
      selfCheck: host.selfCheck, onDisable: host.shutdown,
    });
    hosts.push(host);
    return { manager, host };
  }
  try {
    let { manager, host } = boot();
    await manager.initialize();
    assert.equal(manager.getStatus().installed, false);
    const available = await manager.checkForUpdate();
    await manager.install();
    assert.equal(manager.getStatus().version, available.version);
    assert.equal(manager.getStatus().selfCheck.ok, true);
    assert.equal(manager.getStatus().activeEnabled, false);
    assert.equal(manager.getStatus().restartRequired, true);
    assert.equal(host.isRunning(), false, "installation self-check must not leave a worker running");

    ({ manager, host } = boot());
    await manager.initialize();
    assert.equal(manager.getStatus().activeEnabled, true);
    assert.equal((await manager.checkForUpdate()).available, false);
    await host.ensureRunning();
    assert.equal(typeof await host.settingsService.readAgentSettings(), "object");
    await host.settingsService.writeAgentSettings({ showReasoning: true });
    assert.equal(host.isRunning(), true);
    await manager.setEnabled(false);
    assert.equal(manager.getStatus().activeEnabled, false);
    assert.equal(host.isRunning(), false, "disable must release the real plugin worker");
    await manager.setEnabled(true);
    assert.equal(manager.getStatus().activeEnabled, false);
    assert.equal(manager.getStatus().restartRequired, true);

    ({ manager, host } = boot());
    await manager.initialize();
    await host.ensureRunning();
    const settings = await fs.readFile(paths.AGENT_SETTINGS_FILE, "utf8");
    await manager.uninstall();
    assert.equal(manager.getStatus().installed, false);
    assert.equal(manager.getStatus().activeEnabled, false);
    assert.equal(host.isRunning(), false);
    assert.equal(await fs.readFile(paths.AGENT_SETTINGS_FILE, "utf8"), settings, "uninstall must preserve user settings");
    await manager.install();
    assert.equal(manager.getStatus().installed, true);
    assert.equal(manager.getStatus().restartRequired, true);
    assert.equal(manager.getStatus().activeEnabled, false);
    return { catalogUrl, version: available.version, checks: ["public-https-download", "signature-and-hash", "isolated-self-check", "next-boot-enable", "real-worker-start", "disable-stop", "re-enable-next-boot", "uninstall-preserves-data", "public-reinstall"] };
  } finally {
    await Promise.allSettled(hosts.map((host) => host.shutdown()));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const index = process.argv.indexOf("--catalog-url");
  const catalogUrl = index >= 0 ? process.argv[index + 1] : undefined;
  if (index >= 0 && (!catalogUrl || catalogUrl.startsWith("--"))) throw new Error("--catalog-url requires a public HTTPS catalog URL");
  checkAssistantPluginOnline({ catalogUrl }).then((result) => {
    console.log(`[assistant-plugin-online] PASS ${JSON.stringify(result)}`);
  }).catch((error) => { console.error(`[assistant-plugin-online] ${error.message}`); process.exitCode = 1; });
}

module.exports = { checkAssistantPluginOnline };
