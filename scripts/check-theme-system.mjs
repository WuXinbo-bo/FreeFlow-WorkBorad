import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { THEME_PRESET_ALIASES, THEME_PRESET_DEFS } from "../public/src/config/ui-meta.js";
import { buildThemeCssVariables } from "../public/src/theme/themeCssVariables.js";
import { deriveCustomThemeSettings, normalizeThemeSettings } from "../public/src/theme/themeSettings.js";

const require = createRequire(import.meta.url);
const { normalizeThemeSettings: normalizeBackendThemeSettings } = require("../src/backend/models/themeSettingsModel.js");

const presetKeys = Object.keys(THEME_PRESET_DEFS);
assert.deepEqual(
  presetKeys,
  ["custom", "minimalist-slate", "midnight-slate-glow", "clear-day", "harbor-blue", "spruce-green"],
  "appearance should expose only the five supported presets"
);

for (const [legacyKey, nextKey] of Object.entries(THEME_PRESET_ALIASES)) {
  const migrated = normalizeThemeSettings({
    themePreset: legacyKey,
    backgroundColor: "#ff0000",
    panelOpacity: 0.55,
    canvasOpacity: 0.2,
    backgroundOpacity: 0,
  });
  assert.equal(migrated.themePreset, nextKey, `${legacyKey} did not migrate to ${nextKey}`);
  assert.equal(migrated.backgroundColor, THEME_PRESET_DEFS[nextKey].settings.backgroundColor);
  assert.equal(migrated.panelOpacity, 0.96);
  assert.equal(migrated.canvasOpacity, 1);
  assert.equal(migrated.backgroundOpacity, 1);
}

const darkVariables = buildThemeCssVariables({
  ...THEME_PRESET_DEFS["midnight-slate-glow"].settings,
  themePreset: "midnight-slate-glow",
});
assert.equal(darkVariables["--app-color-scheme"], "dark");
assert.equal(darkVariables["--air-canvas"], "#ffffff");
assert.equal(darkVariables["--air-canvas-surface"], "#ffffff");
assert.equal(darkVariables["--canvas-viewport-alpha"], "1.00");

const custom = deriveCustomThemeSettings({
  ...THEME_PRESET_DEFS["clear-day"].settings,
  buttonColor: "#0b6f61",
});
assert.equal(custom.themePreset, "custom");
assert.equal(custom.buttonColor, "#0b6f61");
assert.equal(custom.canvasOpacity, 1);
assert.notEqual(custom.controlActiveColor, THEME_PRESET_DEFS["clear-day"].settings.controlActiveColor);

const backendTheme = normalizeBackendThemeSettings({
  panelOpacity: 0.55,
  canvasOpacity: 0.2,
  backgroundOpacity: 0,
});
assert.equal(backendTheme.panelOpacity, 0.96);
assert.equal(backendTheme.canvasOpacity, 1);
assert.equal(backendTheme.backgroundOpacity, 1);

console.log("[check-theme-system] Presets, migration, frontend/backend normalization, and white canvas isolation passed");
