const { UI_SETTINGS_FILE } = require("../config/paths");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const { UI_SETTINGS_SCHEMA_VERSION, getDefaultUiSettings, normalizeUiSettings } = require("../models/uiSettingsModel");

async function readUiSettingsStore() {
  const result = await readVersionedJsonFile(UI_SETTINGS_FILE, {
    defaultValue: getDefaultUiSettings(),
    normalize: normalizeUiSettings,
    currentVersion: UI_SETTINGS_SCHEMA_VERSION,
  });
  return result.data;
}

async function writeUiSettingsStore(payload = {}) {
  const current = await readUiSettingsStore().catch(() => getDefaultUiSettings());
  const next = normalizeUiSettings({
    ...current,
    ...payload,
  });
  next.updatedAt = Date.now();
  await writeJsonFile(UI_SETTINGS_FILE, next);
  return next;
}

module.exports = {
  UI_SETTINGS_FILE,
  readUiSettingsStore,
  writeUiSettingsStore,
};
