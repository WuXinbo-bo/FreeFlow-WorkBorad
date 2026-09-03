const fs = require("fs/promises");
const { UI_SETTINGS_FILE, LEGACY_PROJECT_UI_SETTINGS_FILE } = require("../config/paths");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const {
  UI_SETTINGS_SCHEMA_VERSION,
  getDefaultUiSettings,
  normalizeUiSettings,
  normalizeWorkbenchPreferences,
  pickWorkbenchPreferences,
} = require("../models/uiSettingsModel");

let migrationPromise = null;
let writeQueue = Promise.resolve();

async function readUiSettingsFileIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeUiSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

function getUpdatedAt(value = {}) {
  const updatedAt = Number(value?.updatedAt);
  return Number.isFinite(updatedAt) ? updatedAt : 0;
}

async function migrateLegacyProjectUiSettingsIfNeeded() {
  if (migrationPromise) {
    return migrationPromise;
  }

  migrationPromise = (async () => {
    const legacy = await readUiSettingsFileIfExists(LEGACY_PROJECT_UI_SETTINGS_FILE);
    if (!legacy) {
      return;
    }

    const current = await readUiSettingsFileIfExists(UI_SETTINGS_FILE);
    if (current && getUpdatedAt(current) >= getUpdatedAt(legacy)) {
      return;
    }

    await writeJsonFile(UI_SETTINGS_FILE, {
      ...(current || {}),
      ...legacy,
      updatedAt: Math.max(getUpdatedAt(current), getUpdatedAt(legacy), Date.now()),
    });
  })();

  return migrationPromise;
}

async function readUiSettingsStore() {
  await migrateLegacyProjectUiSettingsIfNeeded();
  const result = await readVersionedJsonFile(UI_SETTINGS_FILE, {
    defaultValue: getDefaultUiSettings(),
    normalize: normalizeUiSettings,
    currentVersion: UI_SETTINGS_SCHEMA_VERSION,
  });
  return result.data;
}

function writeUiSettingsStore(payload = {}) {
  const operation = writeQueue.catch(() => {}).then(async () => {
    const current = await readUiSettingsStore().catch(() => getDefaultUiSettings());
    const next = normalizeUiSettings({
      ...current,
      ...payload,
    });
    next.updatedAt = Math.max(Date.now(), Number(current.updatedAt || 0) + 1);
    await writeJsonFile(UI_SETTINGS_FILE, next);
    return next;
  });
  writeQueue = operation;
  return operation;
}

async function readWorkbenchPreferencesStore() {
  const current = await readUiSettingsStore();
  return pickWorkbenchPreferences(current);
}

async function writeWorkbenchPreferencesStore(payload = {}) {
  const nextPreferences = normalizeWorkbenchPreferences(payload);
  const next = await writeUiSettingsStore(nextPreferences);
  return {
    uiSettings: next,
    preferences: pickWorkbenchPreferences(next),
  };
}

module.exports = {
  UI_SETTINGS_FILE,
  readUiSettingsStore,
  writeUiSettingsStore,
  readWorkbenchPreferencesStore,
  writeWorkbenchPreferencesStore,
};
