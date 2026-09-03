const assert = require("assert");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireFresh(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(resolved);
}

function clearSettingsModules() {
  [
    "../src/backend/config/paths",
    "../src/backend/config/index",
    "../src/backend/services/secretStorageService",
    "../src/backend/services/modelProviderSettingsService",
  ].forEach((modulePath) => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch {
      // The module may not have been loaded in this process.
    }
  });
}

async function checkCredentialLifecycle(tempRoot) {
  const dataDir = path.join(tempRoot, "credentials", "AppData");
  process.env.FREEFLOW_HOME_DIR = path.join(tempRoot, "credentials");
  process.env.FREEFLOW_USER_DATA_DIR = dataDir;
  process.env.FREEFLOW_CANVAS_BOARD_DIR = path.join(tempRoot, "credentials", "CanvasBoards");
  process.env.BIGMODEL_API_KEY = "";
  clearSettingsModules();

  const paths = requireFresh("../src/backend/config/paths");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    paths.MODEL_PROVIDER_SETTINGS_FILE,
    JSON.stringify({
      schemaVersion: 1,
      cloud: {
        provider: "bigmodel",
        baseUrl: "https://example.invalid/v1",
        apiKey: "legacy-secret",
        models: ["alpha"],
        defaultModel: "alpha",
      },
      updatedAt: 1,
    }),
    "utf8"
  );

  const service = requireFresh("../src/backend/services/modelProviderSettingsService");
  const migrated = await service.readModelProviderSettingsStore();
  assert.equal(migrated.cloud.apiKey, "legacy-secret", "legacy key should remain available after migration");
  assert.equal(migrated.cloud.apiKeyConfigured, true, "migrated key should be reported as configured");
  const persisted = await fs.readFile(paths.MODEL_PROVIDER_SETTINGS_FILE, "utf8");
  assert(!persisted.includes("legacy-secret"), "provider settings must not retain plaintext credentials");

  await service.writeModelProviderSettingsStore({
    cloud: { baseUrl: "https://example.invalid/v2", apiKeyAction: "keep" },
  });
  assert.equal((await service.readModelProviderSettingsStore()).cloud.apiKey, "legacy-secret");

  await service.writeModelProviderSettingsStore({
    cloud: { apiKey: "replacement-secret", apiKeyAction: "replace" },
  });
  assert.equal((await service.readModelProviderSettingsStore()).cloud.apiKey, "replacement-secret");

  await service.writeModelProviderSettingsStore({ cloud: { apiKeyAction: "clear" } });
  const cleared = await service.readModelProviderSettingsStore();
  assert.equal(cleared.cloud.apiKey, "");
  assert.equal(cleared.cloud.apiKeyConfigured, false);
}

function createMemoryDependencies({ failPermissions = false } = {}) {
  const stores = {
    ui: {
      appName: "FreeFlow Work",
      assistantName: "Flow",
      appSubtitle: "自由画布与 AI 工作台",
      updateCheckEnabled: true,
      defaultCanvasPanelSide: "left",
      defaultCanvasPanelVisible: true,
      defaultChatPanelVisible: true,
      defaultLaunchFullscreen: false,
      canvasBoardSavePath: "D:\\Boards",
      canvasWorkspaceFolderPath: "D:\\Workspace",
      canvasImageSavePath: "D:\\Exports",
      canvasAutosaveEnabled: true,
      canvasLinkSemanticsEnabled: true,
      defaultOutputMode: "nonstream",
      defaultAgentMode: false,
      panelOpacity: 0.96,
      canvasOpacity: 0.95,
      backgroundColor: "#f8f9fa",
      backgroundOpacity: 1,
      textColor: "#212529",
      patternColor: "#e9ecef",
      buttonColor: "#111111",
      buttonTextColor: "#f8f9fa",
      shellPanelColor: "#f9fafb",
      shellPanelTextColor: "#1f2937",
      controlColor: "#f9fafb",
      controlActiveColor: "#939394",
      floatingPanelColor: "#dddedf",
      inputColor: "#fafbfc",
      inputTextColor: "#1f2937",
      messageColor: "#fafbfb",
      userMessageColor: "#b9b9b9",
      dialogColor: "#e0e1e2",
      themePreset: "minimalist-slate",
      updatedAt: 10,
    },
    provider: {
      cloud: {
        provider: "bigmodel",
        baseUrl: "https://example.invalid/v1",
        apiKey: "secret",
        apiKeyConfigured: true,
        models: ["alpha"],
        defaultModel: "alpha",
      },
      updatedAt: 11,
    },
    profiles: { schemaVersion: 2, profiles: {}, updatedAt: 12 },
    permissions: {
      permissions: {
        fileRead: false,
        fileWrite: false,
        desktopOrganize: false,
        inputControl: false,
        systemMonitor: false,
        appControl: false,
        scriptExecution: false,
        selfRepair: false,
      },
      allowedRoots: ["D:\\Workspace"],
      updatedAt: 13,
    },
    agent: {
      schemaVersion: 1,
      provider: "codex",
      cliPath: "",
      defaultModel: "",
      reasoningEffort: "high",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      workspaceRoot: "D:\\Workspace",
      queueWhileRunning: true,
      showReasoning: true,
      updatedAt: 14,
    },
  };
  let shouldFailPermissions = failPermissions;
  const deps = {
    uiSettingsService: {
      async readUiSettingsStore() { return clone(stores.ui); },
      async writeUiSettingsStore(patch) { stores.ui = { ...stores.ui, ...clone(patch), updatedAt: stores.ui.updatedAt + 1 }; return clone(stores.ui); },
    },
    modelProviderSettingsService: {
      async readModelProviderSettingsStore() { return clone(stores.provider); },
      toPublicModelProviderSettings(store) {
        return { ...clone(store), cloud: { ...clone(store.cloud), apiKey: "", apiKeyConfigured: Boolean(store.cloud.apiKey) } };
      },
      async writeModelProviderSettingsStore(patch) {
        stores.provider = {
          ...stores.provider,
          ...clone(patch),
          cloud: { ...stores.provider.cloud, ...clone(patch.cloud || {}) },
          updatedAt: stores.provider.updatedAt + 1,
        };
        return clone(stores.provider);
      },
    },
    modelProfilesService: {
      async readModelProfilesStore() { return clone(stores.profiles); },
      async writeModelProfilesStore(next) { stores.profiles = clone(next); return clone(stores.profiles); },
    },
    permissionsService: {
      async readPermissionsStore() { return clone(stores.permissions); },
      async writePermissionsStore(next) {
        if (shouldFailPermissions) {
          shouldFailPermissions = false;
          throw new Error("permission write failed");
        }
        stores.permissions = clone(next);
        return clone(stores.permissions);
      },
      normalizeRootPath(value) { return String(value || "").trim(); },
      async resolveAllowedExistingPath(value, roots = []) {
        const target = String(value || "").toLowerCase();
        const allowed = roots.some((root) => {
          const normalized = String(root || "").toLowerCase().replace(/[\\/]+$/, "");
          return target === normalized || target.startsWith(`${normalized}\\`) || target.startsWith(`${normalized}/`);
        });
        if (!allowed) throw new Error("outside allowed roots");
        return value;
      },
    },
    agentSettingsService: {
      async readAgentSettings() { return clone(stores.agent); },
      async writeAgentSettings(patch) {
        stores.agent = { ...stores.agent, ...clone(patch), updatedAt: stores.agent.updatedAt + 1 };
        return clone(stores.agent);
      },
    },
    async onModelProviderSettingsChanged() {},
  };
  return { deps, stores };
}

async function checkSettingsTransaction() {
  const { createSettingsCenterService } = require("../src/backend/services/settingsCenterService");
  const memory = createMemoryDependencies();
  const service = createSettingsCenterService(memory.deps);
  const initial = await service.readSettingsSnapshot();
  assert.equal(initial.sections.general.workspaceName, "FreeFlow Work");
  assert.equal(initial.sections.general.assistantName, "Flow");
  assert.equal(initial.sections.ai.agent.provider, "codex");
  assert.equal(Object.hasOwn(initial.sections.ai, "provider"), false, "legacy provider settings leaked into the unified AI section");
  assert.equal(Object.hasOwn(initial.sections.ai, "profiles"), false, "legacy model profiles leaked into the unified AI section");

  const saved = await service.saveSettingsSnapshot({
    revision: initial.revision,
    sections: {
      general: {
        workspaceName: "Research Desk",
        workspaceSubtitle: "知识与创作空间",
        assistantName: "小流",
        updateCheckEnabled: false,
      },
      canvas: {
        defaultBoardDirectory: "D:\\Boards2",
        workspaceDirectory: "D:\\Workspace2",
        exportImageDirectory: "D:\\Exports2",
        autosaveEnabled: false,
        linkSemanticsEnabled: false,
      },
      ai: {
        agent: { ...initial.sections.ai.agent, reasoningEffort: "xhigh" },
      },
    },
  });
  assert.notEqual(saved.revision, initial.revision, "successful save should advance revision");
  assert.equal(memory.stores.ui.appName, "Research Desk");
  assert.equal(memory.stores.ui.assistantName, "小流");
  assert.equal(memory.stores.ui.canvasAutosaveEnabled, false);
  assert.equal(memory.stores.agent.reasoningEffort, "xhigh");

  await assert.rejects(
    service.saveSettingsSnapshot({
      revision: saved.revision,
      sections: {
        ...saved.sections,
        permissions: { ...saved.sections.permissions, allowedRoots: ["D:\\Other"] },
      },
    }),
    (error) => Boolean(error.fieldErrors?.["ai.agent.workspaceRoot"]),
    "settings accepted an Agent workspace outside the effective allowed roots"
  );

  await assert.rejects(
    service.saveSettingsSnapshot({ revision: initial.revision, sections: saved.sections }),
    (error) => error.statusCode === 409 && error.code === "SETTINGS_REVISION_CONFLICT"
  );
}

async function checkSettingsRollback() {
  const { createSettingsCenterService } = require("../src/backend/services/settingsCenterService");
  const memory = createMemoryDependencies({ failPermissions: true });
  const before = clone(memory.stores);
  const service = createSettingsCenterService(memory.deps);
  const snapshot = await service.readSettingsSnapshot();
  await assert.rejects(
    service.saveSettingsSnapshot({
      revision: snapshot.revision,
      sections: {
        general: {
          workspaceName: "Changed",
          workspaceSubtitle: "Changed subtitle",
          assistantName: "Changed assistant",
          updateCheckEnabled: true,
        },
        ai: {
          agent: { ...snapshot.sections.ai.agent, reasoningEffort: "low" },
        },
        permissions: snapshot.sections.permissions,
      },
    }),
    /permission write failed/
  );
  assert.equal(memory.stores.ui.appName, before.ui.appName, "UI settings should roll back");
  assert.equal(memory.stores.agent.reasoningEffort, before.agent.reasoningEffort, "Agent settings should remain unchanged when the transaction fails early");
}

async function checkModelProfileMigration() {
  const { normalizeModelProfilesStore } = require("../src/backend/models/modelProfilesModel");
  const migrated = normalizeModelProfilesStore({ profiles: { alpha: { contextLimit: 8192 } } });
  assert.equal(migrated.profiles.alpha.thinkingEnabled, false, "legacy profiles must not enable thinking implicitly");
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-settings-center-"));
  try {
    await checkModelProfileMigration();
    await checkCredentialLifecycle(tempRoot);
    await checkSettingsTransaction();
    await checkSettingsRollback();
    console.log("[check-settings-center] unified settings transaction and rollback passed");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[check-settings-center] ${error.stack || error.message}`);
  process.exitCode = 1;
});
