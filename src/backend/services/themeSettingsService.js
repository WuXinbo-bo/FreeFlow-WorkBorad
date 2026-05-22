const uiSettingsService = require("./uiSettingsService");
const { normalizeThemeSettings, pickThemeSettings } = require("../models/themeSettingsModel");

async function readThemeSettingsStore() {
  const uiSettings = await uiSettingsService.readUiSettingsStore();
  return normalizeThemeSettings(uiSettings);
}

async function writeThemeSettingsStore(payload = {}) {
  const currentUiSettings = await uiSettingsService.readUiSettingsStore();
  const nextThemeSettings = normalizeThemeSettings({
    ...pickThemeSettings(currentUiSettings),
    ...pickThemeSettings(payload),
  });

  await uiSettingsService.writeUiSettingsStore({
    ...currentUiSettings,
    ...nextThemeSettings,
  });

  return nextThemeSettings;
}

module.exports = {
  readThemeSettingsStore,
  writeThemeSettingsStore,
};
