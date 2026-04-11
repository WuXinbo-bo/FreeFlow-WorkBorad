import { THEME_PRESET_DEFS } from "../../config/ui-meta.js";

export function getThemePresetMeta(themePresetKey) {
  return THEME_PRESET_DEFS[themePresetKey] || THEME_PRESET_DEFS.custom;
}
