import { THEME_PRESET_ALIASES, THEME_PRESET_DEFS } from "../../config/ui-meta.js";

export function getThemePresetMeta(themePresetKey) {
  return THEME_PRESET_DEFS[THEME_PRESET_ALIASES[themePresetKey] || themePresetKey] || THEME_PRESET_DEFS.custom;
}
