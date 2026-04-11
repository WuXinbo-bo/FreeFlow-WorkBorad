const {
  DEFAULT_THEME_SETTINGS,
  normalizePanelOpacity,
  normalizeBackgroundOpacity,
  normalizeHexColor,
  normalizeThemeSettings,
} = require("./themeSettingsModel");
const { CANVAS_BOARD_DIR } = require("../config/paths");

const UI_SETTINGS_SCHEMA_VERSION = 1;

function getDefaultUiSettings() {
  return {
    schemaVersion: UI_SETTINGS_SCHEMA_VERSION,
    appName: "FreeFlow",
    appSubtitle: "自由画布与 AI 工作台",
    canvasTitle: "FreeFlow 工作白板",
    canvasBoardSavePath: CANVAS_BOARD_DIR,
    canvasLastOpenedBoardPath: "",
    hasShownStartupTutorial: false,
    canvasImageSavePath: "",
    ...DEFAULT_THEME_SETTINGS,
    updatedAt: Date.now(),
  };
}

function normalizeUiSettings(payload = {}) {
  const defaults = getDefaultUiSettings();
  const theme = normalizeThemeSettings(payload);
  return {
    schemaVersion: UI_SETTINGS_SCHEMA_VERSION,
    appName:
      typeof payload.appName === "string" && payload.appName.trim()
        ? payload.appName.trim().slice(0, 40)
        : defaults.appName,
    appSubtitle:
      typeof payload.appSubtitle === "string" && payload.appSubtitle.trim()
        ? payload.appSubtitle.trim().slice(0, 80)
        : defaults.appSubtitle,
    canvasTitle:
      typeof payload.canvasTitle === "string" && payload.canvasTitle.trim()
        ? payload.canvasTitle.trim().slice(0, 60)
        : defaults.canvasTitle,
    canvasBoardSavePath:
      typeof payload.canvasBoardSavePath === "string" && payload.canvasBoardSavePath.trim()
        ? payload.canvasBoardSavePath.trim().slice(0, 400)
        : defaults.canvasBoardSavePath,
    canvasLastOpenedBoardPath:
      typeof payload.canvasLastOpenedBoardPath === "string" && payload.canvasLastOpenedBoardPath.trim()
        ? payload.canvasLastOpenedBoardPath.trim().slice(0, 400)
        : defaults.canvasLastOpenedBoardPath,
    hasShownStartupTutorial: Boolean(payload.hasShownStartupTutorial),
    canvasImageSavePath:
      typeof payload.canvasImageSavePath === "string" && payload.canvasImageSavePath.trim()
        ? payload.canvasImageSavePath.trim().slice(0, 400)
        : defaults.canvasImageSavePath,
    ...theme,
    updatedAt: payload.updatedAt || Date.now(),
  };
}

module.exports = {
  UI_SETTINGS_SCHEMA_VERSION,
  getDefaultUiSettings,
  normalizePanelOpacity,
  normalizeBackgroundOpacity,
  normalizeHexColor,
  normalizeUiSettings,
};
