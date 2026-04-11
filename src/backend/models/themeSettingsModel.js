function hexToRgb(hexColor = "#0f1d3a") {
  const normalized = String(hexColor || "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return { r: 15, g: 29, b: 58 };
  }

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function mixRgb(base, target, amount = 0.5) {
  const ratio = Math.min(Math.max(Number(amount) || 0, 0), 1);
  return {
    r: Math.min(255, Math.max(0, Math.round(base.r + (target.r - base.r) * ratio))),
    g: Math.min(255, Math.max(0, Math.round(base.g + (target.g - base.g) * ratio))),
    b: Math.min(255, Math.max(0, Math.round(base.b + (target.b - base.b) * ratio))),
  };
}

function rgbToHex(rgb = {}) {
  const toChannel = (value) => Math.min(255, Math.max(0, Math.round(Number(value) || 0))).toString(16).padStart(2, "0");
  return `#${toChannel(rgb.r)}${toChannel(rgb.g)}${toChannel(rgb.b)}`;
}

function mixHex(baseHex, targetHex, ratio) {
  return rgbToHex(mixRgb(hexToRgb(baseHex), hexToRgb(targetHex), ratio));
}

function getColorBrightness(hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

const DEFAULT_THEME_SETTINGS = Object.freeze({
  panelOpacity: 0.96,
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
});

const THEME_SETTING_KEYS = Object.freeze([
  "panelOpacity",
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

function normalizePanelOpacity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_THEME_SETTINGS.panelOpacity;
  return Math.min(Math.max(parsed, 0.55), 1);
}

function normalizeBackgroundOpacity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_THEME_SETTINGS.backgroundOpacity;
  return Math.min(Math.max(parsed, 0), 1);
}

function normalizeHexColor(value, fallback) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return fallback;
  return `#${normalized.toLowerCase()}`;
}

function pickThemeSource(payload = {}) {
  const nestedTheme = payload?.theme && typeof payload.theme === "object" ? payload.theme : null;
  return nestedTheme ? { ...nestedTheme, ...payload } : payload;
}

function pickThemeSettings(payload = {}) {
  const source = pickThemeSource(payload);
  const next = {};

  for (const key of THEME_SETTING_KEYS) {
    next[key] = source?.[key];
  }

  return next;
}

function deriveThemeColors(source = {}) {
  const backgroundColor = normalizeHexColor(source.backgroundColor, DEFAULT_THEME_SETTINGS.backgroundColor);
  const textColor = normalizeHexColor(source.textColor, DEFAULT_THEME_SETTINGS.textColor);
  const patternColor = normalizeHexColor(source.patternColor, DEFAULT_THEME_SETTINGS.patternColor);
  const buttonColor = normalizeHexColor(source.buttonColor, DEFAULT_THEME_SETTINGS.buttonColor);
  const buttonTextColor = normalizeHexColor(source.buttonTextColor, DEFAULT_THEME_SETTINGS.buttonTextColor);
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
    shellPanelColor: normalizeHexColor(source.shellPanelColor, shellPanelBase),
    shellPanelTextColor: normalizeHexColor(source.shellPanelTextColor, shellPanelTextBase),
    controlColor: normalizeHexColor(source.controlColor, controlBase),
    controlActiveColor: normalizeHexColor(source.controlActiveColor, controlActiveBase),
    floatingPanelColor: normalizeHexColor(source.floatingPanelColor, floatingPanelBase),
    inputColor: normalizeHexColor(source.inputColor, inputBase),
    inputTextColor: normalizeHexColor(source.inputTextColor, shellPanelTextBase),
    messageColor: normalizeHexColor(source.messageColor, messageBase),
    userMessageColor: normalizeHexColor(source.userMessageColor, userMessageBase),
    dialogColor: normalizeHexColor(source.dialogColor, dialogBase),
  };
}

function normalizeThemeSettings(payload = {}) {
  const source = pickThemeSource(payload);
  const colors = deriveThemeColors(source);
  return {
    panelOpacity: normalizePanelOpacity(source.panelOpacity),
    ...colors,
    backgroundOpacity: normalizeBackgroundOpacity(source.backgroundOpacity),
    themePreset:
      typeof source.themePreset === "string" && source.themePreset.trim()
        ? source.themePreset.trim().slice(0, 40)
        : DEFAULT_THEME_SETTINGS.themePreset,
  };
}

module.exports = {
  DEFAULT_THEME_SETTINGS,
  THEME_SETTING_KEYS,
  normalizePanelOpacity,
  normalizeBackgroundOpacity,
  normalizeHexColor,
  pickThemeSettings,
  normalizeThemeSettings,
};
