import { THEME_PRESET_ALIASES, THEME_PRESET_DEFS } from "../config/ui-meta.js";
import { hexToRgb, mixRgb, normalizeThemeHexColor } from "../utils/color.js";

const DEFAULT_THEME_PRESET_KEY = "minimalist-slate";
const DEFAULT_THEME_PRESET_SOURCE = Object.freeze({
  panelOpacity: 0.96,
  canvasOpacity: 1,
  backgroundColor: "#f8f9fa",
  backgroundOpacity: 1,
  textColor: "#212529",
  patternColor: "#e9ecef",
  buttonColor: "#111111",
  buttonTextColor: "#f8f9fa",
  ...(THEME_PRESET_DEFS[DEFAULT_THEME_PRESET_KEY]?.settings || {}),
  themePreset: DEFAULT_THEME_PRESET_KEY,
});

function rgbToHex(rgb = {}) {
  const toChannel = (value) => Math.min(255, Math.max(0, Math.round(Number(value) || 0))).toString(16).padStart(2, "0");
  return `#${toChannel(rgb.r)}${toChannel(rgb.g)}${toChannel(rgb.b)}`;
}

function getColorBrightness(hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function mixHex(baseHex, targetHex, ratio) {
  return rgbToHex(mixRgb(hexToRgb(baseHex), hexToRgb(targetHex), ratio));
}

function deriveThemeColors(source = {}) {
  const backgroundColor = normalizeThemeHexColor(source.backgroundColor, DEFAULT_THEME_PRESET_SOURCE.backgroundColor);
  const textColor = normalizeThemeHexColor(source.textColor, DEFAULT_THEME_PRESET_SOURCE.textColor);
  const patternColor = normalizeThemeHexColor(source.patternColor, DEFAULT_THEME_PRESET_SOURCE.patternColor);
  const buttonColor = normalizeThemeHexColor(source.buttonColor, DEFAULT_THEME_PRESET_SOURCE.buttonColor);
  const buttonTextColor = normalizeThemeHexColor(source.buttonTextColor, DEFAULT_THEME_PRESET_SOURCE.buttonTextColor);
  const isLightBackground = getColorBrightness(backgroundColor) >= 158;
  const shellPanelBase = isLightBackground ? mixHex(backgroundColor, "#ffffff", 0.18) : mixHex(backgroundColor, "#08111f", 0.42);
  const shellPanelTextBase = isLightBackground ? "#1f2937" : "#f5f7ff";
  const controlBase = isLightBackground ? mixHex(shellPanelBase, "#ffffff", 0.08) : mixHex(shellPanelBase, "#243754", 0.3);
  const controlActiveBase = mixHex(controlBase, buttonColor, 0.44);
  const floatingPanelBase = isLightBackground ? mixHex(shellPanelBase, buttonColor, 0.12) : mixHex(shellPanelBase, buttonColor, 0.2);
  const inputBase = isLightBackground ? mixHex(shellPanelBase, "#ffffff", 0.14) : mixHex(shellPanelBase, "#152238", 0.22);
  const messageBase = isLightBackground ? mixHex(shellPanelBase, "#ffffff", 0.12) : mixHex(shellPanelBase, "#223453", 0.26);
  const userMessageBase = mixHex(messageBase, buttonColor, isLightBackground ? 0.28 : 0.42);
  const dialogBase = isLightBackground ? mixHex(floatingPanelBase, "#ffffff", 0.08) : mixHex(floatingPanelBase, "#101a2e", 0.2);

  return {
    backgroundColor,
    textColor,
    patternColor,
    buttonColor,
    buttonTextColor,
    shellPanelColor: normalizeThemeHexColor(source.shellPanelColor, shellPanelBase),
    shellPanelTextColor: normalizeThemeHexColor(source.shellPanelTextColor, shellPanelTextBase),
    controlColor: normalizeThemeHexColor(source.controlColor, controlBase),
    controlActiveColor: normalizeThemeHexColor(source.controlActiveColor, controlActiveBase),
    floatingPanelColor: normalizeThemeHexColor(source.floatingPanelColor, floatingPanelBase),
    inputColor: normalizeThemeHexColor(source.inputColor, inputBase),
    inputTextColor: normalizeThemeHexColor(source.inputTextColor, shellPanelTextBase),
    messageColor: normalizeThemeHexColor(source.messageColor, messageBase),
    userMessageColor: normalizeThemeHexColor(source.userMessageColor, userMessageBase),
    dialogColor: normalizeThemeHexColor(source.dialogColor, dialogBase),
  };
}

export const DEFAULT_THEME_SETTINGS = Object.freeze({
  panelOpacity: Number.isFinite(Number(DEFAULT_THEME_PRESET_SOURCE.panelOpacity))
    ? Math.min(Math.max(Number(DEFAULT_THEME_PRESET_SOURCE.panelOpacity), 0.55), 1)
    : 0.96,
  canvasOpacity: Number.isFinite(Number(DEFAULT_THEME_PRESET_SOURCE.canvasOpacity))
    ? Math.min(Math.max(Number(DEFAULT_THEME_PRESET_SOURCE.canvasOpacity), 0.2), 1)
    : 0.95,
  ...deriveThemeColors(DEFAULT_THEME_PRESET_SOURCE),
  backgroundOpacity: Number.isFinite(Number(DEFAULT_THEME_PRESET_SOURCE.backgroundOpacity))
    ? Math.min(Math.max(Number(DEFAULT_THEME_PRESET_SOURCE.backgroundOpacity), 0), 1)
    : 1,
  themePreset: DEFAULT_THEME_PRESET_KEY,
});

export const THEME_SETTING_KEYS = Object.freeze([
  "panelOpacity",
  "canvasOpacity",
  "backgroundColor",
  "backgroundOpacity",
  "textColor",
  "patternColor",
  "buttonColor",
  "buttonTextColor",
  "shellPanelColor",
  "shellPanelTextColor",
  "controlColor",
  "controlActiveColor",
  "floatingPanelColor",
  "inputColor",
  "inputTextColor",
  "messageColor",
  "userMessageColor",
  "dialogColor",
  "themePreset",
]);

function pickThemeSource(payload = {}) {
  const nestedTheme = payload?.theme && typeof payload.theme === "object" ? payload.theme : null;
  return nestedTheme ? { ...nestedTheme, ...payload } : payload;
}

export function pickThemeSettings(payload = {}) {
  const source = pickThemeSource(payload);
  const next = {};

  for (const key of THEME_SETTING_KEYS) {
    next[key] = source?.[key];
  }

  return next;
}

export function resolveThemePresetKey(settings = {}, requestedKey = "") {
  const rawRequestedKey = typeof requestedKey === "string" ? requestedKey.trim() : "";
  const normalizedRequestedKey = THEME_PRESET_ALIASES[rawRequestedKey] || rawRequestedKey;
  if (normalizedRequestedKey && THEME_PRESET_DEFS[normalizedRequestedKey] && normalizedRequestedKey !== "custom") {
    return normalizedRequestedKey;
  }

  for (const preset of Object.values(THEME_PRESET_DEFS)) {
    if (!preset?.settings) continue;
    const presetSource = { ...DEFAULT_THEME_SETTINGS, ...preset.settings };
    const normalizedPreset = {
      panelOpacity: Number.isFinite(Number(presetSource.panelOpacity))
        ? Math.min(Math.max(Number(presetSource.panelOpacity), 0.55), 1)
        : DEFAULT_THEME_SETTINGS.panelOpacity,
      canvasOpacity: Number.isFinite(Number(presetSource.canvasOpacity))
        ? Math.min(Math.max(Number(presetSource.canvasOpacity), 0.2), 1)
        : DEFAULT_THEME_SETTINGS.canvasOpacity,
      backgroundOpacity: Number.isFinite(Number(presetSource.backgroundOpacity))
        ? Math.min(Math.max(Number(presetSource.backgroundOpacity), 0), 1)
        : DEFAULT_THEME_SETTINGS.backgroundOpacity,
      ...deriveThemeColors(presetSource),
      themePreset: preset.key,
    };
    const matches = THEME_SETTING_KEYS.every((key) => key === "themePreset" || normalizedPreset[key] === settings[key]);
    if (matches) {
      return preset.key;
    }
  }

  return "custom";
}

export function normalizeThemeSettings(payload = {}) {
  const rawSource = pickThemeSource(payload);
  const aliasedPreset = THEME_PRESET_ALIASES[String(rawSource.themePreset || "").trim()] || "";
  const source = aliasedPreset
    ? { ...rawSource, ...THEME_PRESET_DEFS[aliasedPreset]?.settings, themePreset: aliasedPreset }
    : rawSource;
  const panelOpacity = DEFAULT_THEME_SETTINGS.panelOpacity;
  const canvasOpacity = 1;
  const backgroundOpacity = 1;
  const colors = deriveThemeColors(source);

  return {
    panelOpacity,
    canvasOpacity,
    ...colors,
    backgroundOpacity,
    themePreset: resolveThemePresetKey(
      {
        panelOpacity,
        canvasOpacity,
        ...colors,
        backgroundOpacity,
      },
      source.themePreset
    ),
  };
}

export function deriveCustomThemeSettings(payload = {}) {
  const source = { ...DEFAULT_THEME_SETTINGS, ...pickThemeSource(payload) };
  const backgroundColor = normalizeThemeHexColor(source.backgroundColor, DEFAULT_THEME_SETTINGS.backgroundColor);
  const shellPanelColor = normalizeThemeHexColor(source.shellPanelColor, DEFAULT_THEME_SETTINGS.shellPanelColor);
  const controlColor = normalizeThemeHexColor(source.controlColor, DEFAULT_THEME_SETTINGS.controlColor);
  const buttonColor = normalizeThemeHexColor(source.buttonColor, DEFAULT_THEME_SETTINGS.buttonColor);
  const shellPanelTextColor = normalizeThemeHexColor(source.shellPanelTextColor, DEFAULT_THEME_SETTINGS.shellPanelTextColor);
  const messageColor = normalizeThemeHexColor(source.messageColor, DEFAULT_THEME_SETTINGS.messageColor);
  const isLight = getColorBrightness(backgroundColor) >= 158;
  const buttonTextColor = getColorBrightness(buttonColor) >= 150 ? "#182026" : "#ffffff";

  return {
    panelOpacity: DEFAULT_THEME_SETTINGS.panelOpacity,
    canvasOpacity: 1,
    backgroundColor,
    backgroundOpacity: 1,
    textColor: shellPanelTextColor,
    patternColor: mixHex(backgroundColor, shellPanelTextColor, isLight ? 0.18 : 0.28),
    buttonColor,
    buttonTextColor,
    shellPanelColor,
    shellPanelTextColor,
    controlColor,
    controlActiveColor: mixHex(controlColor, buttonColor, isLight ? 0.28 : 0.38),
    floatingPanelColor: mixHex(shellPanelColor, buttonColor, isLight ? 0.08 : 0.16),
    inputColor: mixHex(shellPanelColor, isLight ? "#ffffff" : "#111820", isLight ? 0.32 : 0.22),
    inputTextColor: shellPanelTextColor,
    messageColor,
    userMessageColor: mixHex(messageColor, buttonColor, isLight ? 0.2 : 0.34),
    dialogColor: mixHex(shellPanelColor, buttonColor, isLight ? 0.06 : 0.14),
    themePreset: "custom",
  };
}
