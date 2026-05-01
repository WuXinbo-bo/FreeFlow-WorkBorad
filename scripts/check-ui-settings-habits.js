const assert = require("assert");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { normalizeUiSettings, UI_SETTINGS_SCHEMA_VERSION } = require("../src/backend/models/uiSettingsModel");

function requireFresh(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(resolved);
}

function clearFreshBackendSettingsModules() {
  [
    "../src/backend/config/paths",
    "../src/backend/services/uiSettingsService",
    "../src/backend/services/appStartupService",
  ].forEach((modulePath) => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch {
      // Ignore modules that have not been loaded in this process.
    }
  });
}

async function checkNormalization() {
  const legacy = normalizeUiSettings({
    schemaVersion: 1,
    appName: "FreeFlow",
  });
  assert.strictEqual(legacy.schemaVersion, UI_SETTINGS_SCHEMA_VERSION, "schemaVersion should migrate to current version");
  assert.strictEqual(legacy.defaultCanvasPanelSide, "left", "legacy canvas side default mismatch");
  assert.strictEqual(legacy.defaultChatPanelSide, "right", "legacy chat side default mismatch");
  assert.strictEqual(legacy.defaultCanvasPanelVisible, true, "legacy canvas visible default mismatch");
  assert.strictEqual(legacy.defaultChatPanelVisible, true, "legacy chat visible default mismatch");
  assert.strictEqual(legacy.defaultLaunchFullscreen, false, "legacy fullscreen default mismatch");

  const custom = normalizeUiSettings({
    defaultCanvasPanelSide: "right",
    defaultCanvasPanelVisible: false,
    defaultChatPanelVisible: false,
    defaultLaunchFullscreen: true,
  });
  assert.strictEqual(custom.defaultCanvasPanelSide, "right", "custom canvas side mismatch");
  assert.strictEqual(custom.defaultChatPanelSide, "left", "custom chat side mismatch");
  assert.strictEqual(custom.defaultCanvasPanelVisible, false, "custom canvas visible mismatch");
  assert.strictEqual(custom.defaultChatPanelVisible, false, "custom chat visible mismatch");
  assert.strictEqual(custom.defaultLaunchFullscreen, true, "custom fullscreen mismatch");

  console.log("[check-ui-settings-habits] UI habits migration and normalization passed");
}

async function checkStartupPersistence() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-habits-"));
  const homeDir = path.join(tempRoot, "FreeFlow");
  const appDataDir = path.join(homeDir, "AppData");
  const boardDir = path.join(homeDir, "CanvasBoards");
  process.env.FREEFLOW_HOME_DIR = homeDir;
  process.env.FREEFLOW_USER_DATA_DIR = appDataDir;
  process.env.FREEFLOW_CANVAS_BOARD_DIR = boardDir;
  process.env.FREEFLOW_CACHE_DIR = path.join(appDataDir, "Cache");
  process.env.FREEFLOW_RUNTIME_DIR = path.join(appDataDir, "Runtime");
  process.env.FREEFLOW_TEMP_DRAG_DIR = path.join(appDataDir, "Runtime", "drag-export");
  delete process.env.FREEFLOW_LEGACY_PROJECT_DATA_DIR;

  clearFreshBackendSettingsModules();
  const uiSettingsService = requireFresh("../src/backend/services/uiSettingsService");
  const { ensureAppStartupState } = requireFresh("../src/backend/services/appStartupService");

  await uiSettingsService.writeWorkbenchPreferencesStore({
    defaultCanvasPanelSide: "right",
    defaultCanvasPanelVisible: false,
    defaultChatPanelVisible: false,
    defaultLaunchFullscreen: true,
  });

  const startupContext = await ensureAppStartupState({
    ensureTutorialBoardFile: async () => ({ ok: false, filePath: "" }),
  });
  const persisted = await uiSettingsService.readUiSettingsStore();

  assert.strictEqual(startupContext.workbenchPreferences.defaultCanvasPanelSide, "right", "startup canvas side mismatch");
  assert.strictEqual(startupContext.workbenchPreferences.defaultChatPanelSide, "left", "startup chat side mismatch");
  assert.strictEqual(startupContext.workbenchPreferences.defaultCanvasPanelVisible, false, "startup canvas visible mismatch");
  assert.strictEqual(startupContext.workbenchPreferences.defaultChatPanelVisible, false, "startup chat visible mismatch");
  assert.strictEqual(startupContext.workbenchPreferences.defaultLaunchFullscreen, true, "startup fullscreen mismatch");
  assert.strictEqual(persisted.defaultCanvasPanelVisible, false, "persisted canvas visible mismatch");
  assert.strictEqual(persisted.defaultChatPanelVisible, false, "persisted chat visible mismatch");
  console.log("[check-ui-settings-habits] startup workbench preferences persistence passed");
}

async function checkLegacyProjectSettingsMigration() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-habits-migration-"));
  const projectRoot = path.join(tempRoot, "Project");
  const homeDir = path.join(tempRoot, "FreeFlow");
  const appDataDir = path.join(homeDir, "AppData");
  const projectDataDir = path.join(projectRoot, "data");
  await fs.mkdir(projectDataDir, { recursive: true });
  await fs.mkdir(appDataDir, { recursive: true });

  process.env.FREEFLOW_HOME_DIR = homeDir;
  delete process.env.FREEFLOW_USER_DATA_DIR;
  process.env.FREEFLOW_LEGACY_PROJECT_DATA_DIR = projectDataDir;
  process.env.FREEFLOW_CANVAS_BOARD_DIR = path.join(homeDir, "CanvasBoards");
  process.env.FREEFLOW_CACHE_DIR = path.join(appDataDir, "Cache");
  process.env.FREEFLOW_RUNTIME_DIR = path.join(appDataDir, "Runtime");
  process.env.FREEFLOW_TEMP_DRAG_DIR = path.join(appDataDir, "Runtime", "drag-export");

  const legacySettingsPath = path.join(projectDataDir, "ui-settings.json");
  await fs.writeFile(
    legacySettingsPath,
    JSON.stringify(
      {
        schemaVersion: UI_SETTINGS_SCHEMA_VERSION,
        defaultCanvasPanelVisible: false,
        defaultChatPanelVisible: false,
        defaultLaunchFullscreen: true,
        updatedAt: 200,
      },
      null,
      2
    ),
    "utf8"
  );

  const originalCwd = process.cwd();
  process.chdir(projectRoot);
  try {
    clearFreshBackendSettingsModules();
    const uiSettingsService = requireFresh("../src/backend/services/uiSettingsService");
    const migrated = await uiSettingsService.readUiSettingsStore();
    assert.strictEqual(
      uiSettingsService.UI_SETTINGS_FILE,
      path.join(appDataDir, "ui-settings.json"),
      "default ui settings path should use user AppData"
    );
    assert.strictEqual(migrated.defaultCanvasPanelVisible, false, "legacy canvas visible should migrate");
    assert.strictEqual(migrated.defaultChatPanelVisible, false, "legacy chat visible should migrate");
    assert.strictEqual(migrated.defaultLaunchFullscreen, true, "legacy fullscreen should migrate");
  } finally {
    process.chdir(originalCwd);
  }
  console.log("[check-ui-settings-habits] legacy project settings migration passed");
}

async function main() {
  await checkNormalization();
  await checkStartupPersistence();
  await checkLegacyProjectSettingsMigration();
}

main().catch((error) => {
  console.error(`[check-ui-settings-habits] ${error.message}`);
  process.exit(1);
});
