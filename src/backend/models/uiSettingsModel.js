const {
  DEFAULT_THEME_SETTINGS,
  normalizePanelOpacity,
  normalizeBackgroundOpacity,
  normalizeHexColor,
  normalizeThemeSettings,
} = require("./themeSettingsModel");
const { CANVAS_BOARD_DIR } = require("../config/paths");

const UI_SETTINGS_SCHEMA_VERSION = 2;
const WORKBENCH_PANEL_SIDES = new Set(["left", "right"]);
const DEFAULT_WORKBENCH_PREFERENCES = Object.freeze({
  defaultCanvasPanelSide: "left",
  defaultChatPanelSide: "right",
  defaultCanvasPanelVisible: true,
  defaultChatPanelVisible: true,
  defaultLaunchFullscreen: false,
});

function normalizeWorkbenchPanelSide(value, fallback = "left") {
  const side = String(value || "").trim().toLowerCase();
  return WORKBENCH_PANEL_SIDES.has(side) ? side : fallback;
}

function normalizeWorkbenchPreferences(payload = {}) {
  const defaultCanvasPanelSide = normalizeWorkbenchPanelSide(
    payload.defaultCanvasPanelSide,
    DEFAULT_WORKBENCH_PREFERENCES.defaultCanvasPanelSide
  );
  return {
    defaultCanvasPanelSide,
    defaultChatPanelSide: defaultCanvasPanelSide === "left" ? "right" : "left",
    defaultCanvasPanelVisible:
      payload.defaultCanvasPanelVisible === false ? false : DEFAULT_WORKBENCH_PREFERENCES.defaultCanvasPanelVisible,
    defaultChatPanelVisible:
      payload.defaultChatPanelVisible === false ? false : DEFAULT_WORKBENCH_PREFERENCES.defaultChatPanelVisible,
    defaultLaunchFullscreen: payload.defaultLaunchFullscreen === true,
  };
}

function pickWorkbenchPreferences(payload = {}) {
  return normalizeWorkbenchPreferences(payload);
}

function getDefaultUiSettings() {
  return {
    schemaVersion: UI_SETTINGS_SCHEMA_VERSION,
    appName: "FreeFlow",
    appSubtitle: "自由画布与 AI 工作台",
    canvasTitle: "FreeFlow 工作白板",
    canvasBoardSavePath: CANVAS_BOARD_DIR,
    canvasLastOpenedBoardPath: "",
    hasShownStartupTutorial: false,
    lastTutorialIntroVersion: "",
    dismissedTutorialIntroVersion: "",
    canvasImageSavePath: "",
    ...DEFAULT_WORKBENCH_PREFERENCES,
    ...DEFAULT_THEME_SETTINGS,
    updatedAt: Date.now(),
  };
}

function normalizeUiSettings(payload = {}) {
  const defaults = getDefaultUiSettings();
  const theme = normalizeThemeSettings(payload);
  const workbenchPreferences = normalizeWorkbenchPreferences(payload);
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
    lastTutorialIntroVersion:
      typeof payload.lastTutorialIntroVersion === "string" && payload.lastTutorialIntroVersion.trim()
        ? payload.lastTutorialIntroVersion.trim().slice(0, 80)
        : defaults.lastTutorialIntroVersion,
    dismissedTutorialIntroVersion:
      typeof payload.dismissedTutorialIntroVersion === "string" && payload.dismissedTutorialIntroVersion.trim()
        ? payload.dismissedTutorialIntroVersion.trim().slice(0, 80)
        : defaults.dismissedTutorialIntroVersion,
    canvasImageSavePath:
      typeof payload.canvasImageSavePath === "string" && payload.canvasImageSavePath.trim()
        ? payload.canvasImageSavePath.trim().slice(0, 400)
        : defaults.canvasImageSavePath,
    ...workbenchPreferences,
    ...theme,
    updatedAt: payload.updatedAt || Date.now(),
  };
}

module.exports = {
  UI_SETTINGS_SCHEMA_VERSION,
  DEFAULT_WORKBENCH_PREFERENCES,
  getDefaultUiSettings,
  normalizeWorkbenchPreferences,
  pickWorkbenchPreferences,
  normalizePanelOpacity,
  normalizeBackgroundOpacity,
  normalizeHexColor,
  normalizeUiSettings,
};
