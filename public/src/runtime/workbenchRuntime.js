import {
  CONFIG,
  DESKTOP_SHELL,
  IS_DESKTOP_APP,
  DOUBAO_WEB_MODEL,
  LOCAL_MODEL_PREFIX,
  CLOUD_MODEL_PREFIX,
  AGENT_PREFERRED_MODEL,
  getCanvasFileTypeTagMeta,
} from "../config/index.js";
import { PERMISSION_META } from "../config/ui-meta.js";
import { createInitialState } from "../state/createInitialState.js";
import { mountLemniscateBloomLoader } from "../components/loaders/lemniscateBloomLoader.js";
import { createCanvasFeature } from "../features/canvas/index.js";
import { createCanvasItemInteractionController } from "../features/canvas/interactions/canvasItemInteractions.js";
import { mountThemeSettingsPanel } from "../components/theme/themeSettingsPanel.js";
import { DEFAULT_THEME_SETTINGS, normalizeThemeSettings } from "../theme/themeSettings.js";
import { applyThemeCssVariables } from "../theme/themeCssVariables.js";
import { API_ROUTES, readJsonResponse } from "../api/http.js";
import { listAiMirrorTargets, prepareAiMirrorTarget, stopAiMirrorTarget } from "./aiMirrorClient.js";
import { createConversationAssistantChrome } from "./conversationAssistant/chrome.js";
import { getConversationAssistantElements } from "./conversationAssistant/dom.js";
import { dispatchTutorialUiEvent } from "../tutorial-core/tutorialEventBus.js";
import { TUTORIAL_EVENT_TYPES } from "../tutorial-core/tutorialTypes.js";
import {
  createDefaultPanelLayout,
  isPanelLayoutSwapped,
  loadPanelLayout,
  normalizePanelLayout,
  savePanelLayout,
  swapPanelLayoutDockSides,
} from "./layout/panelLayoutManager.js";
import {
  collectDesktopWindowShapeRects as collectWindowShapeRects,
  isElementIncludedInWindowShape,
  markElementForWindowShape,
  unmarkElementForWindowShape,
} from "./layout/windowShapeCollector.js";
import {
  bindMarkedWindowShapeAutoSync,
  bindWindowShapeAutoSync,
  createWindowShapeSyncScheduler,
} from "./layout/windowShapeSyncManager.js";
import { mountGlobalTutorialHost } from "./tutorial-system/index.js";

const state = createInitialState();
const APP_CLIPBOARD_TTL_MS = 120000;
const CANVAS_MODE_LEGACY = "legacy";
const SCREEN_SOURCE_EMBED_FIT_MODES = Object.freeze(["contain", "cover", "fill"]);
const SCREEN_SOURCE_RENDER_MODES = Object.freeze(["win32", "webcontentsview"]);
const DEFAULT_SCREEN_SOURCE_EMBED_POLICY = Object.freeze({
  fitMode: "fill",
});

state.screenSource.embedPolicies = loadScreenSourceEmbedPolicies();
state.screenSource.renderMode = loadScreenSourceRenderMode();
state.canvasMode = loadCanvasMode();
let conversationAssistantChrome = null;
let lastPanelLayoutViewportSize = null;
let workspaceResizeRefreshFrame = 0;

function normalizeScreenSourceFitMode(value) {
  const fitMode = String(value || "").trim().toLowerCase();
  return SCREEN_SOURCE_EMBED_FIT_MODES.includes(fitMode) ? fitMode : DEFAULT_SCREEN_SOURCE_EMBED_POLICY.fitMode;
}

function normalizeScreenSourceRenderMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return SCREEN_SOURCE_RENDER_MODES.includes(mode) ? mode : "win32";
}

function normalizeScreenSourceEmbedPolicy(policy = {}) {
  return {
    fitMode: normalizeScreenSourceFitMode(policy?.fitMode),
  };
}

function normalizeScreenSourceEmbedPoliciesMap(input = {}) {
  const entries = {};
  for (const [sourceId, policy] of Object.entries(input || {})) {
    const cleanSourceId = String(sourceId || "").trim();
    if (!cleanSourceId) continue;
    entries[cleanSourceId] = normalizeScreenSourceEmbedPolicy(policy);
  }
  return entries;
}

function loadScreenSourceEmbedPolicies() {
  try {
    const raw = localStorage.getItem(CONFIG.screenSourceEmbedPolicyKey);
    if (!raw) {
      return {};
    }
    return normalizeScreenSourceEmbedPoliciesMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function persistScreenSourceEmbedPolicies() {
  try {
    localStorage.setItem(CONFIG.screenSourceEmbedPolicyKey, JSON.stringify(state.screenSource.embedPolicies || {}));
  } catch {
    // Ignore local persistence failures.
  }
}

function loadScreenSourceRenderMode() {
  try {
    return normalizeScreenSourceRenderMode(localStorage.getItem(CONFIG.screenSourceRenderModeKey));
  } catch {
    return "win32";
  }
}

function persistScreenSourceRenderMode() {
  try {
    localStorage.setItem(CONFIG.screenSourceRenderModeKey, normalizeScreenSourceRenderMode(state.screenSource.renderMode));
  } catch {
    // Ignore local persistence failures.
  }
}

function getScreenSourceEmbedPolicy(sourceId = "") {
  const cleanSourceId = String(sourceId || "").trim();
  if (!cleanSourceId) {
    return { ...DEFAULT_SCREEN_SOURCE_EMBED_POLICY };
  }

  return normalizeScreenSourceEmbedPolicy(state.screenSource.embedPolicies?.[cleanSourceId]);
}

function updateScreenSourceEmbedPolicy(sourceId = "", nextPolicy = {}) {
  const cleanSourceId = String(sourceId || "").trim();
  if (!cleanSourceId) return;

  state.screenSource.embedPolicies = {
    ...(state.screenSource.embedPolicies || {}),
    [cleanSourceId]: normalizeScreenSourceEmbedPolicy({
      ...getScreenSourceEmbedPolicy(cleanSourceId),
      ...nextPolicy,
    }),
  };
  persistScreenSourceEmbedPolicies();
}

function normalizeCanvasMode(value = "") {
  return CANVAS_MODE_LEGACY;
}

function loadCanvasMode() {
  return CANVAS_MODE_LEGACY;
}

function persistCanvasMode() {}

const DEFAULT_APP_NAME = "FreeFlow";
const DEFAULT_APP_SUBTITLE = "自由画布与 AI 工作台";
const DEFAULT_CANVAS_TITLE = "FreeFlow 工作白板";
const DEFAULT_CLICK_THROUGH_ACCELERATOR = "CommandOrControl+Shift+X";
const DEFAULT_CLICK_THROUGH_DISPLAY = "Ctrl+Shift+X";
const DEFAULT_WORKBENCH_PREFERENCES = Object.freeze({
  defaultCanvasPanelSide: "left",
  defaultChatPanelSide: "right",
  defaultCanvasPanelVisible: true,
  defaultChatPanelVisible: true,
  defaultLaunchFullscreen: false,
});
const PANEL_LAYOUT_MIN_HEIGHT = 320;
const PANEL_LAYOUT_EDGE_OFFSET = 0;
const PANEL_RESIZER_SIZE = 34;
const PANEL_RESIZER_CORNER_OFFSET = 24;
let startupContextPromise = null;
let startupTutorialIntroPersistSeq = 0;

function normalizeShortcutAcceleratorToken(token = "") {
  const value = String(token || "").trim();
  if (!value) return "";
  const lower = value.toLowerCase();

  if (["cmdorctrl", "commandorcontrol", "ctrlorcmd", "controlorcommand"].includes(lower)) {
    return "CommandOrControl";
  }
  if (["ctrl", "control", "ctl"].includes(lower)) {
    return "Control";
  }
  if (["cmd", "command"].includes(lower)) {
    return "Command";
  }
  if (lower === "shift") {
    return "Shift";
  }
  if (["alt", "option"].includes(lower)) {
    return "Alt";
  }
  if (["super", "meta"].includes(lower)) {
    return "Super";
  }
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(value)) {
    return value.toUpperCase();
  }
  if (/^[a-z]$/i.test(value)) {
    return value.toUpperCase();
  }
  if (/^[0-9]$/.test(value)) {
    return value;
  }

  const namedKeys = {
    space: "Space",
    tab: "Tab",
    enter: "Enter",
    escape: "Escape",
    esc: "Escape",
    plus: "+",
  };

  return namedKeys[lower] || value;
}

function normalizeShortcutAccelerator(value = "", fallback = DEFAULT_CLICK_THROUGH_ACCELERATOR) {
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }

  const parts = raw
    .split("+")
    .map((item) => normalizeShortcutAcceleratorToken(item))
    .filter(Boolean);

  if (!parts.length) {
    return fallback;
  }

  const modifiers = [];
  let key = "";
  for (const part of parts) {
    if (["CommandOrControl", "Control", "Command", "Shift", "Alt", "Super"].includes(part)) {
      if (!modifiers.includes(part)) {
        modifiers.push(part);
      }
        continue;
    }
    key = part;
  }

  if (!key) {
    return fallback;
  }

  return [...modifiers, key].join("+");
}

function formatShortcutAcceleratorForDisplay(accelerator = "") {
  return normalizeShortcutAccelerator(accelerator)
    .split("+")
    .map((part) => {
      if (part === "CommandOrControl") return DESKTOP_SHELL?.platform === "darwin" ? "Cmd" : "Ctrl";
      if (part === "Control") return "Ctrl";
      if (part === "Command") return "Cmd";
      return part;
    })
    .join("+");
}

function normalizeShortcutSettings(input = {}) {
  const accelerator = normalizeShortcutAccelerator(input?.clickThroughAccelerator);
  return {
    clickThroughAccelerator: accelerator,
    clickThroughDisplay: String(input?.clickThroughDisplay || "").trim() || formatShortcutAcceleratorForDisplay(accelerator),
  };
}

function normalizeWorkbenchPanelSide(value, fallback = "left") {
  const side = String(value || "").trim().toLowerCase();
  return side === "right" || side === "left" ? side : fallback;
}

function normalizeWorkbenchPreferences(input = {}) {
  const defaultCanvasPanelSide = normalizeWorkbenchPanelSide(
    input?.defaultCanvasPanelSide,
    DEFAULT_WORKBENCH_PREFERENCES.defaultCanvasPanelSide
  );
  return {
    defaultCanvasPanelSide,
    defaultChatPanelSide: defaultCanvasPanelSide === "left" ? "right" : "left",
    defaultCanvasPanelVisible: input?.defaultCanvasPanelVisible === false ? false : true,
    defaultChatPanelVisible: input?.defaultChatPanelVisible === false ? false : true,
    defaultLaunchFullscreen: input?.defaultLaunchFullscreen === true,
  };
}

function pickWorkbenchPreferences(input = {}) {
  return normalizeWorkbenchPreferences(input || {});
}

function matchesShortcutKeyboardEvent(event, accelerator) {
  const normalized = normalizeShortcutAccelerator(accelerator);
  const parts = normalized.split("+");
  const key = String(parts.pop() || "").toLowerCase();
  const modifiers = new Set(parts);
  const expectsCtrl = modifiers.has("Control") || (DESKTOP_SHELL?.platform !== "darwin" && modifiers.has("CommandOrControl"));
  const expectsMeta = modifiers.has("Command") || (DESKTOP_SHELL?.platform === "darwin" && modifiers.has("CommandOrControl"));
  const expectsShift = modifiers.has("Shift");
  const expectsAlt = modifiers.has("Alt");

  return (
    String(event?.key || "").toLowerCase() === key &&
    Boolean(event?.ctrlKey) === expectsCtrl &&
    Boolean(event?.metaKey) === expectsMeta &&
    Boolean(event?.shiftKey) === expectsShift &&
    Boolean(event?.altKey) === expectsAlt
  );
}

function normalizeUiSettings(payload = {}) {
  const rawAppName =
    typeof payload.appName === "string" && payload.appName.trim() ? payload.appName.trim() : DEFAULT_APP_NAME;
  const rawAppSubtitle =
    typeof payload.appSubtitle === "string" && payload.appSubtitle.trim()
      ? payload.appSubtitle.trim()
      : DEFAULT_APP_SUBTITLE;
  const rawCanvasTitle =
    typeof payload.canvasTitle === "string" && payload.canvasTitle.trim()
      ? payload.canvasTitle.trim()
      : DEFAULT_CANVAS_TITLE;
  const appName = rawAppName === "AI_Worker" || rawAppName === "Bo AI" ? DEFAULT_APP_NAME : rawAppName;
  const appSubtitle =
    rawAppSubtitle === "本地模型工作台" ||
    rawAppSubtitle === "Infinite Board Assistant" ||
    rawAppSubtitle === "无限画布助手"
      ? DEFAULT_APP_SUBTITLE
      : rawAppSubtitle;
  const canvasTitle =
    rawCanvasTitle === "Infinite Canvas & AI Assistant Overlay" || rawCanvasTitle === "无限画布与 AI 助手"
      ? DEFAULT_CANVAS_TITLE
      : rawCanvasTitle;
  const canvasBoardSavePath =
    typeof payload.canvasBoardSavePath === "string" && payload.canvasBoardSavePath.trim()
      ? payload.canvasBoardSavePath.trim()
      : "";
  const canvasLastOpenedBoardPath =
    typeof payload.canvasLastOpenedBoardPath === "string" && payload.canvasLastOpenedBoardPath.trim()
      ? payload.canvasLastOpenedBoardPath.trim()
      : "";
  const hasShownStartupTutorial = Boolean(payload.hasShownStartupTutorial);
  const lastTutorialIntroVersion =
    typeof payload.lastTutorialIntroVersion === "string" && payload.lastTutorialIntroVersion.trim()
      ? payload.lastTutorialIntroVersion.trim()
      : "";
  const dismissedTutorialIntroVersion =
    typeof payload.dismissedTutorialIntroVersion === "string" && payload.dismissedTutorialIntroVersion.trim()
      ? payload.dismissedTutorialIntroVersion.trim()
      : "";
  const canvasImageSavePath =
    typeof payload.canvasImageSavePath === "string" && payload.canvasImageSavePath.trim()
      ? payload.canvasImageSavePath.trim()
      : "";
  const workbenchPreferences = normalizeWorkbenchPreferences(payload);
  const theme = normalizeThemeSettings(payload);

  return {
    appName: appName.slice(0, 40),
    appSubtitle: appSubtitle.slice(0, 80),
    canvasTitle: canvasTitle.slice(0, 60),
    canvasBoardSavePath: normalizeCanvasBoardSavePathValue(canvasBoardSavePath).slice(0, 400),
    canvasLastOpenedBoardPath: normalizeCanvasLastOpenedBoardPathValue(canvasLastOpenedBoardPath).slice(0, 400),
    hasShownStartupTutorial,
    lastTutorialIntroVersion: lastTutorialIntroVersion.slice(0, 80),
    dismissedTutorialIntroVersion: dismissedTutorialIntroVersion.slice(0, 80),
    canvasImageSavePath: normalizeCanvasImageSavePathValue(canvasImageSavePath).slice(0, 400),
    ...workbenchPreferences,
    ...theme,
  };
}

function normalizeModelProviderSettings(payload = {}) {
  const cloud = payload && typeof payload.cloud === "object" ? payload.cloud : {};
  const models = Array.isArray(cloud.models)
    ? cloud.models.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const provider = String(cloud.provider || "bigmodel").trim().toLowerCase() === "openai_compatible"
    ? "openai_compatible"
    : "bigmodel";

  return {
    cloud: {
      provider,
      baseUrl: String(cloud.baseUrl || "").trim(),
      apiKey: String(cloud.apiKey || "").trim(),
      apiKeyConfigured: Boolean(cloud.apiKeyConfigured ?? cloud.apiKey),
      models,
      defaultModel: String(cloud.defaultModel || "").trim() || models[0] || "",
    },
    file: String(payload.file || "").trim(),
    updatedAt: Number(payload.updatedAt) || 0,
  };
}

function sanitizeCanvasTextPreview(text, maxLength = 8000) {
  return String(text || "").replace(/\0/g, "").trim().slice(0, maxLength);
}

function isExtractableCanvasFile(fileName = "", mimeType = "") {
  const normalizedName = String(fileName || "").trim().toLowerCase();
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
  return (
    normalizedMimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    normalizedMimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    normalizedMimeType === "application/pdf" ||
    normalizedName.endsWith(".docx") ||
    normalizedName.endsWith(".pptx") ||
    normalizedName.endsWith(".pdf")
  );
}

function getFileNameFromPath(filePath = "") {
  return String(filePath || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || "未命名文件";
}

function getFileExtension(fileName = "") {
  const normalizedName = String(fileName || "").trim().toLowerCase();
  const index = normalizedName.lastIndexOf(".");
  return index >= 0 ? normalizedName.slice(index + 1) : "";
}

function clampCanvasScale(scale) {
  const numericScale = Number(scale) || CONFIG.canvasDefaultScale;
  return Math.min(Math.max(numericScale, CONFIG.canvasMinScale), CONFIG.canvasMaxScale);
}

function normalizeCanvasTextBoxFontSize(fontSize) {
  const numericValue = Number(fontSize) || CONFIG.canvasTextBoxDefaultFontSize;
  return Math.min(Math.max(numericValue, CONFIG.canvasTextBoxMinFontSize), CONFIG.canvasTextBoxMaxFontSize);
}

function sanitizeCanvasTextboxText(text, maxLength = 8000) {
  return String(text || "").replace(/\0/g, "").replace(/\r\n?/g, "\n").slice(0, maxLength);
}

function normalizeCanvasBoard(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const view = source.view && typeof source.view === "object" ? source.view : {};
  const items = Array.isArray(source.items) ? source.items : [];

  return {
    view: {
      scale: clampCanvasScale(view.scale),
      offsetX: Number(view.offsetX) || CONFIG.canvasDefaultOffsetX,
      offsetY: Number(view.offsetY) || CONFIG.canvasDefaultOffsetY,
    },
    selectedIds: Array.isArray(source.selectedIds)
      ? source.selectedIds.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 24)
      : [],
    items: items
      .map((item, index) => ({
        id: String(item?.id || crypto.randomUUID()),
        kind: ["text", "image", "file", "textbox"].includes(item?.kind) ? item.kind : "text",
        title: String(item?.title || "").trim() || `素材 ${index + 1}`,
        text:
          item?.kind === "textbox"
            ? sanitizeCanvasTextboxText(item?.text || "")
            : sanitizeCanvasTextPreview(item?.text || ""),
        dataUrl: typeof item?.dataUrl === "string" ? item.dataUrl : "",
        filePath: String(item?.filePath || "").trim(),
        fileName: String(item?.fileName || "").trim(),
        mimeType: String(item?.mimeType || "").trim(),
        isDirectory: Boolean(item?.isDirectory),
        fileSize: Number(item?.fileSize) || 0,
        x: Number(item?.x) || index * 44,
        y: Number(item?.y) || index * 36,
        width:
          (item?.kind === "textbox" || item?.kind === "text")
            ? Math.max(220, Math.min(420, Number(item?.width) || CONFIG.canvasTextBoxDefaultWidth))
            : Math.max(220, Number(item?.width) || CONFIG.canvasCardWidth),
        height:
          (item?.kind === "textbox" || item?.kind === "text")
            ? Math.max(88, Math.min(180, Number(item?.height) || CONFIG.canvasTextBoxDefaultHeight))
            : Math.max(88, Number(item?.height) || CONFIG.canvasCardHeight),
        fontSize: normalizeCanvasTextBoxFontSize(item?.fontSize),
        bold: Boolean(item?.bold),
        highlighted: Boolean(item?.highlighted),
        createdAt: Number(item?.createdAt) || Date.now(),
      }))
      .slice(0, 120),
  };
}

function normalizeModelList(models = [], fallbackModel = "") {
  const entries = [];
  const seen = new Set();

  for (const item of Array.isArray(models) ? models : []) {
    const name = String(item?.name || item?.id || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      name,
      id: item?.id || name,
      rawName: String(item?.rawName || "").trim(),
      source: String(item?.source || "").trim(),
      displayName: String(item?.displayName || "").trim() || getModelDisplayName(name),
      contextLength: Number(item?.contextLength) || 0,
      contextOptions: Array.isArray(item?.contextOptions)
        ? item.contextOptions.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
        : [],
    });
  }

  for (const name of [String(fallbackModel || "").trim()]) {
    const cleanName = String(name || "").trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      name: cleanName,
      id: cleanName,
      rawName: stripRoutedModelName(cleanName),
      source: getModelSource(cleanName),
      displayName: getModelDisplayName(cleanName),
      contextLength: 0,
      contextOptions: [],
    });
  }

  return entries;
}

function stripRoutedModelName(modelName) {
  const value = String(modelName || "").trim();
  if (value.startsWith(LOCAL_MODEL_PREFIX)) {
    return value.slice(LOCAL_MODEL_PREFIX.length);
  }
  if (value.startsWith(CLOUD_MODEL_PREFIX)) {
    return value.slice(CLOUD_MODEL_PREFIX.length);
  }
  return value;
}

function getModelSource(modelName) {
  const value = String(modelName || "").trim();
  if (value.startsWith(LOCAL_MODEL_PREFIX)) return "local";
  if (value.startsWith(CLOUD_MODEL_PREFIX)) return "cloud";
  if (isDoubaoWebModel(value)) return "browser";
  return "local";
}

function isLocalModel(modelName) {
  return getModelSource(modelName) === "local";
}

function supportsRuntimeOptionsForModel(modelName) {
  return isLocalModel(modelName);
}

function supportsThinkingToggle(modelName) {
  if (isDoubaoWebModel(modelName)) {
    return false;
  }
  return /^(qwen3\.5:|glm-4\.7-flash|glm-4\.6v-flash)/i.test(stripRoutedModelName(modelName));
}

function isDoubaoWebModel(modelName) {
  return String(modelName || "").trim().toLowerCase() === DOUBAO_WEB_MODEL;
}

function getModelDisplayName(modelName) {
  const value = String(modelName || "").trim();
  if (isDoubaoWebModel(value)) {
    return "豆包网页版";
  }

  const rawValue = stripRoutedModelName(value);
  const shortRawValue = rawValue === "qwen2.5:0.5b-instruct-q4_0" ? "qwen2.5:0.5b" : rawValue;

  if (value.startsWith(LOCAL_MODEL_PREFIX)) {
    return `本地：${shortRawValue}`;
  }
  if (value.startsWith(CLOUD_MODEL_PREFIX)) {
    return `云端：${shortRawValue}`;
  }

  return shortRawValue;
}

function hasAvailableModel(modelName) {
  const target = String(modelName || "").trim();
  if (!target || !modelSelect) return false;
  return [...modelSelect.options].some((option) => option.value === target);
}

function getPreferredAgentModel() {
  const selectedModel = String(modelSelect?.value || state.model || "").trim();

  if (selectedModel && !isDoubaoWebModel(selectedModel) && hasAvailableModel(selectedModel)) {
    return selectedModel;
  }

  if (hasAvailableModel(AGENT_PREFERRED_MODEL)) {
    return AGENT_PREFERRED_MODEL;
  }

  return selectedModel || AGENT_PREFERRED_MODEL;
}

function stripMarkdownCodeFence(text) {
  const raw = String(text || "").trim();
  if (!raw.startsWith("```")) {
    return raw;
  }

  return raw
    .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractFirstJsonObject(text) {
  const raw = stripMarkdownCodeFence(text);
  const start = raw.indexOf("{");
  if (start < 0) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }

  return "";
}

function getDeviceModeLabel(deviceMode, gpuName = "") {
  const normalizedDevice = String(deviceMode || "").trim();
  if (/^gpu:\d+$/.test(normalizedDevice)) {
    return gpuName ? `${gpuName} / GPU` : "指定 GPU";
  }
  if (deviceMode === "cpu") {
    return "CPU";
  }
  if (deviceMode === "cloud") {
    return "云端";
  }
  if (deviceMode === "browser") {
    return "网页桥接";
  }

  return gpuName ? `${gpuName} / GPU` : "GPU";
}

function getDefaultModelProfile(modelName = "") {
  return {
    contextLimit: CONFIG.defaultContextLimit,
    thinkingEnabled: supportsThinkingToggle(modelName),
    deviceMode: "auto",
  };
}

function normalizeStoredContextLimit(limit, fallback = CONFIG.defaultContextLimit) {
  const numericLimit = Number(limit);
  if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
    return Number(fallback) || CONFIG.defaultContextLimit;
  }
  return Math.max(256, Math.round(numericLimit));
}

function normalizeStoredDeviceMode(deviceMode) {
  const value = String(deviceMode || "").trim().toLowerCase();
  if (value === "cpu") {
    return "cpu";
  }
  if (/^gpu:\d+$/.test(value)) {
    return value;
  }
  return "auto";
}

function getModelEntry(modelName) {
  const target = String(modelName || "").trim();
  if (!target) {
    return null;
  }
  return state.availableModels.find((item) => item.name === target) || null;
}

function getModelContextMax(modelName) {
  const entry = getModelEntry(modelName);
  const numericMax = Number(entry?.contextLength);
  if (Number.isFinite(numericMax) && numericMax > 0) {
    return numericMax;
  }
  return Math.max(CONFIG.defaultContextLimit, ...CONFIG.contextLimitOptions);
}

function getModelContextOptions(modelName) {
  const entry = getModelEntry(modelName);
  const modelOptions = Array.isArray(entry?.contextOptions)
    ? entry.contextOptions.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const contextMax = getModelContextMax(modelName);
  const values = [...new Set([...CONFIG.contextLimitOptions, ...modelOptions, contextMax])]
    .filter((value) => Number.isFinite(value) && value > 0 && value <= contextMax)
    .sort((a, b) => a - b);

  if (!values.length) {
    return [Math.max(CONFIG.defaultContextLimit, 1024)];
  }

  return values;
}

function getResolvedContextLimit(modelName, preferredLimit) {
  const contextMax = getModelContextMax(modelName);
  const normalized = normalizeStoredContextLimit(preferredLimit, CONFIG.defaultContextLimit);
  return Math.min(normalized, contextMax);
}

function getAvailableGpuDevices() {
  return (Array.isArray(state.hardware.videoControllers) ? state.hardware.videoControllers : [])
    .map((item, index) => ({
      index,
      name: String(item?.Name || "").trim() || `GPU ${index + 1}`,
      vendor: String(item?.AdapterCompatibility || "").trim(),
    }))
    .filter((item) => item.name && !/Microsoft Basic|DisplayLink|Oray/i.test(item.name));
}

function getDeviceModeGpuName(deviceMode) {
  const normalizedDevice = String(deviceMode || "").trim().toLowerCase();
  if (normalizedDevice === "auto") {
    return state.hardware.preferredGpuName || getAvailableGpuDevices()[0]?.name || "";
  }
  if (/^gpu:\d+$/.test(normalizedDevice)) {
    const index = Number(normalizedDevice.split(":")[1]);
    return getAvailableGpuDevices().find((item) => item.index === index)?.name || "";
  }
  return "";
}

function normalizeModelProfileEntry(modelName, profile = {}) {
  const base = getDefaultModelProfile(modelName);
  const incoming = profile && typeof profile === "object" ? profile : {};
  const contextMax = getModelContextMax(modelName);

  return {
    ...base,
    ...incoming,
    contextLimit: getResolvedContextLimit(modelName, normalizeStoredContextLimit(incoming.contextLimit, base.contextLimit)),
    deviceMode: normalizeStoredDeviceMode(incoming.deviceMode),
    thinkingEnabled:
      typeof incoming.thinkingEnabled === "boolean" ? incoming.thinkingEnabled : base.thinkingEnabled,
    contextMax,
  };
}

function sanitizeModelProfilesMap(profiles = {}) {
  const next = {};
  let changed = false;

  for (const [modelName, profile] of Object.entries(profiles && typeof profiles === "object" ? profiles : {})) {
    if (!modelName || isDoubaoWebModel(modelName)) {
      changed = true;
      continue;
    }

    const normalized = normalizeModelProfileEntry(modelName, profile);
    next[modelName] = normalized;

    if (
      !profile ||
      Number(profile.contextLimit) !== normalized.contextLimit ||
      profile.deviceMode !== normalized.deviceMode ||
      Boolean(profile.thinkingEnabled) !== normalized.thinkingEnabled
    ) {
      changed = true;
    }
  }

  return {
    profiles: next,
    changed,
  };
}

function getModelProfile(modelName) {
  const key = String(modelName || "").trim();
  if (!key) {
    return getDefaultModelProfile(key);
  }

  return normalizeModelProfileEntry(key, state.modelProfiles[key]);
}

function getModelContextLimit(modelName) {
  return Number(getModelProfile(modelName).contextLimit) || CONFIG.defaultContextLimit;
}

function getStoredModelDeviceMode(modelName) {
  return normalizeStoredDeviceMode(getModelProfile(modelName).deviceMode);
}

function canUseGpuForModel(modelName) {
  return isLocalModel(modelName) && supportsRuntimeOptionsForModel(modelName) && state.hardware.gpuAvailable !== false;
}

function getModelDeviceMode(modelName) {
  if (!isLocalModel(modelName)) {
    return "cloud";
  }
  const storedMode = getStoredModelDeviceMode(modelName);
  if (storedMode === "cpu") {
    return "cpu";
  }
  if (!supportsRuntimeOptionsForModel(modelName)) {
    return "auto";
  }
  if (!canUseGpuForModel(modelName)) {
    return "cpu";
  }
  if (/^gpu:\d+$/.test(storedMode)) {
    const gpuIndex = Number(storedMode.split(":")[1]);
    if (getAvailableGpuDevices().some((item) => item.index === gpuIndex)) {
      return storedMode;
    }
  }
  return "auto";
}

function renderDeviceModeOptions(modelName) {
  if (!deviceModeSelect) return;

  const activeModel = String(modelName || state.model || "").trim();
  const isDoubaoModel = isDoubaoWebModel(activeModel);
  const canUseGpu = canUseGpuForModel(activeModel);
  const gpuDevices = getAvailableGpuDevices();
  const currentValue = isDoubaoModel ? "auto" : getModelDeviceMode(activeModel);

  const optionValues = ["cpu", "auto"];
  const options = [];
  options.push(`<option value="cpu">CPU</option>`);
  options.push(
    `<option value="auto"${canUseGpu ? "" : " disabled"}>${escapeHtml(getDeviceModeLabel("auto", getDeviceModeGpuName("auto")))}</option>`
  );

  if (canUseGpu) {
    for (const gpu of gpuDevices) {
      optionValues.push(`gpu:${gpu.index}`);
      options.push(
        `<option value="gpu:${gpu.index}">${escapeHtml(`GPU · ${gpu.name}`)}</option>`
      );
    }
  }

  deviceModeSelect.innerHTML = options.join("");
  deviceModeSelect.value = optionValues.includes(currentValue)
    ? currentValue
    : canUseGpu
      ? "auto"
      : "cpu";
}

function syncProviderCapabilities() {
  if (!deviceModeSelect) return;
  if (isDoubaoWebModel(state.model)) {
    renderDeviceModeOptions(state.model);
    deviceModeSelect.disabled = true;
    return;
  }

  const enabled = supportsRuntimeOptionsForModel(state.model);
  renderDeviceModeOptions(state.model);
  deviceModeSelect.disabled = !enabled;
}

function ensureContextLimitOption(limit, modelName = state.model) {
  const numericLimit = normalizeStoredContextLimit(limit, CONFIG.defaultContextLimit);
  const values = [...new Set([...getModelContextOptions(modelName), numericLimit])].sort((a, b) => a - b);
  contextLimitSelect.innerHTML = values
    .map((value) => `<option value="${value}">${value}</option>`)
    .join("");
}

function applyModelSelection(modelName, { announce = false, persistSession = true } = {}) {
  const nextModel = String(modelName || "").trim() || state.model;
  if (!nextModel) return;
  const isDoubaoModel = isDoubaoWebModel(nextModel);

  state.model = nextModel;
  const nextLimit = getResolvedContextLimit(nextModel, getModelProfile(nextModel).contextLimit);
  state.contextLimit = nextLimit;

  if (modelSelect.value !== nextModel) {
    modelSelect.value = nextModel;
  }

  ensureContextLimitOption(nextLimit, nextModel);
  contextLimitSelect.value = String(nextLimit);
  contextLimitSelect.disabled = isDoubaoModel;
  if (deviceModeSelect) {
    renderDeviceModeOptions(nextModel);
    deviceModeSelect.disabled = !supportsRuntimeOptionsForModel(nextModel) || isDoubaoModel;
  }
  syncThinkingToggle(nextModel);
  renderAiRuntimeSummary();
  if (conversationModelLabelEl) {
    conversationModelLabelEl.textContent = getModelDisplayName(nextModel);
  }
  renderConversationModelMenu();

  const session = getCurrentSession();
  if (session && persistSession) {
    session.activeModel = nextModel;
    touchSession(session);
    persistSessions();
    renderSessions();
  }

  renderContextStats();

  if (announce) {
    if (isDoubaoModel) {
      setStatus("已切换到豆包网页版。消息会通过 Electron 打开豆包网页、自动发送并抓取回答。", "success");
      return;
    }
    const thinkingSuffix = supportsThinkingToggle(nextModel)
      ? `，Thinking ${getModelProfile(nextModel).thinkingEnabled ? "开启" : "关闭"}`
      : "";
    const deviceSuffix = `，设备 ${getDeviceModeLabel(
      isLocalModel(nextModel) ? getModelDeviceMode(nextModel) : "cloud",
      getDeviceModeGpuName(getModelDeviceMode(nextModel))
    )}`;
    setStatus(
      `已切换到 ${getModelDisplayName(nextModel)}，上下文窗口 ${nextLimit}${deviceSuffix}${thinkingSuffix}`,
      "success"
    );
  }
}

function syncThinkingToggle(modelName) {
  const supported = supportsThinkingToggle(modelName);
  thinkingToggleWrap?.classList.toggle("is-hidden", !supported);

  if (thinkingToggle) {
    thinkingToggle.disabled = !supported;
    if (supported) {
      thinkingToggle.checked = Boolean(getModelProfile(modelName).thinkingEnabled);
    } else {
      thinkingToggle.checked = false;
    }
  }

  if (!composerThinkingBtn) return;

  composerThinkingBtn.classList.toggle("is-hidden", !supported);
  composerThinkingBtn.disabled = !supported;
  if (supported) {
    const enabled = Boolean(getModelProfile(modelName).thinkingEnabled);
    composerThinkingBtn.classList.toggle("is-active", enabled);
    composerThinkingBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    composerThinkingBtn.title = enabled ? "关闭 Thinking" : "开启 Thinking";
    composerThinkingBtn.setAttribute("aria-label", enabled ? "关闭 Thinking" : "开启 Thinking");
  } else {
    composerThinkingBtn.classList.remove("is-active");
    composerThinkingBtn.setAttribute("aria-pressed", "false");
    composerThinkingBtn.title = "";
    composerThinkingBtn.setAttribute("aria-label", "切换 Thinking");
  }
}

async function setThinkingEnabledForActiveModel(enabled) {
  const activeModel = modelSelect?.value || state.model;
  if (!activeModel || !supportsThinkingToggle(activeModel)) return;

  state.modelProfiles[activeModel] = {
    ...getModelProfile(activeModel),
    thinkingEnabled: Boolean(enabled),
  };

  if (thinkingToggle) {
    thinkingToggle.checked = Boolean(enabled);
  }
  syncThinkingToggle(activeModel);

  try {
    await saveModelProfiles();
    setStatus(`${getModelDisplayName(activeModel)} Thinking 已${enabled ? "开启" : "关闭"}`, "success");
  } catch (error) {
    setStatus(`模型档案保存失败：${error.message}`, "warning");
  }
}

function buildAgentConversationMessages(session) {
  const messages = [];
  const canvasContext = buildCanvasSelectionContext();

  if (session?.summary) {
    messages.push({
      role: "system",
      content: `以下是当前会话的运行摘要，请作为上下文继续处理：\n${session.summary}`,
    });
  }

  if (canvasContext) {
    messages.push({
      role: "system",
      content: `以下是左侧无限画布中当前选中的素材卡，请优先把它们作为本次任务的上下文：\n${canvasContext}`,
    });
  }

  messages.push(
    ...(session?.messages || [])
      .filter((item) => !item.transient && !item.summarized && !item.pending && String(item.content || "").trim())
      .map(({ role, content }) => ({ role, content }))
  );

  return messages;
}

function buildAgentPlannerMessages(task, session) {
  const enabledPermissions = PERMISSION_META.filter(
    (item) => state.permissionStore.permissions[item.key]
  ).map((item) => item.name);

  const permissionSummary = enabledPermissions.length
    ? enabledPermissions.join("、")
    : "当前没有任何已开启权限";

  const allowedRoots = state.permissionStore.allowedRoots.length
    ? state.permissionStore.allowedRoots.join("；")
    : "当前没有任何授权目录";

  return [
    {
      role: "system",
      content: [
        `你是 ${getAppDisplayName()} 的本地桌面管家。`,
        "你现在不是单纯的命令改写器，而是一个可对话的任务管家。",
        "你必须先理解用户意图，再决定是：直接回答、追问澄清，还是执行本地动作。",
        "如果用户只是像聊天一样提问、追问上一步结果、询问建议或让你解释当前情况，你应该直接回复，不要强行执行动作。",
        "只有当用户明确希望你操作电脑、读取界面、识别文字、点击按钮、打开应用、读写文件或执行系统任务时，才进入执行模式。",
        "",
        "当需要执行本地动作时，你能选择的标准命令只有这些：",
        "1. 整理桌面",
        "2. 查看系统状态",
        "3. 打开记事本",
        "4. 打开计算器",
        "5. 打开文件资源管理器",
        "6. 打开 PowerShell",
        "7. 打开 CMD",
        "8. 关闭记事本",
        "9. 关闭计算器",
        "10. 关闭文件资源管理器",
        "11. 关闭 PowerShell",
        "12. 关闭 CMD",
        "13. 读取文件 <绝对路径>",
        "14. 查看目录 <绝对路径>",
        "15. 写入文件 <绝对路径> 内容：<文本内容>",
        "16. 输入文字：<文本内容>",
        "17. 点击坐标 X,Y",
        "18. 运行脚本：<PowerShell 脚本>",
        "19. 修复 DNS",
        "20. 修复资源管理器",
        "21. 清理临时文件",
        "22. 列出窗口",
        "23. 聚焦窗口 <窗口标题或进程名>",
        "24. 分析界面 <窗口标题 => 任务说明> 或 分析界面 <任务说明>",
        "25. 识别文字 <窗口标题 => 任务说明> 或 识别文字 <任务说明>",
        "26. 点击按钮 <窗口标题 => 按钮文字或元素描述> 或 点击按钮 <按钮文字或元素描述>",
        "",
        "输出要求：",
        "- 你必须只返回一个 JSON 对象，不要返回 markdown，不要解释，不要输出 JSON 之外的任何内容。",
        '- JSON 格式之一：{"mode":"reply","reply":"给用户的自然语言回复"}',
        '- JSON 格式之二：{"mode":"clarify","reply":"你的澄清问题"}',
        '- JSON 格式之三：{"mode":"execute","task":"标准命令","reply":"一句简短说明，告诉用户你准备执行什么"}',
        "",
        "决策规则：",
        "- 如果当前信息足够，且用户希望你实际操作电脑，返回 mode=execute。",
        "- 如果用户只是聊天、咨询、解释、追问结果、询问下一步建议，返回 mode=reply。",
        "- 如果用户目标不清楚，缺少关键对象、窗口、按钮或文件路径，返回 mode=clarify。",
        "",
        "执行命令规则：",
        "- 如果用户要读取、写入、查看目录，尽量保留原始绝对路径。",
        "- 如果用户表达的是同义句，例如“帮我看一下系统占用”，应改写成“查看系统状态”。",
        "- 如果用户表达“帮我把桌面整理一下”，应改写成“整理桌面”。",
        "- 如果用户要求你看当前界面、识别窗口内容、看图操作、找按钮、读屏幕文字，优先改写为“分析界面”“识别文字”或“点击按钮”。",
        "- 需要指定窗口时，使用“窗口标题 => 目标”这种格式。",
        "- 如果请求依赖未授权能力，也仍然可以先规划标准命令，不要替用户拒绝；由执行层处理权限结果。",
        "",
        "回复规则：",
        "- reply/clarify 要像正常聊天一样自然、简洁、有上下文感。",
        "- 你可以引用当前会话中已经发生的执行结果来回答用户追问。",
        "",
        `当前已开启权限：${permissionSummary}。`,
        `当前授权目录：${allowedRoots}。`,
      ].join("\n"),
    },
    ...buildAgentConversationMessages(session),
    {
      role: "user",
      content: task,
    },
  ];
}

function applyThinkingDirective(messages, modelName) {
  if (!supportsThinkingToggle(modelName)) {
    return messages;
  }

  const thinkingEnabled = getModelProfile(modelName).thinkingEnabled;
  const nextMessages = Array.isArray(messages) ? messages.map((item) => ({ ...item })) : [];
  if (thinkingEnabled || !isLocalModel(modelName)) {
    return nextMessages;
  }

  const lastMessage = nextMessages[nextMessages.length - 1];
  if (lastMessage?.role === "assistant" && String(lastMessage.content || "").trim() === "<think>\n\n</think>") {
    return nextMessages;
  }

  nextMessages.push({
    role: "assistant",
    content: "<think>\n\n</think>\n\n",
  });
  return nextMessages;
}

function buildRequestOptions(modelName, extraOptions = {}) {
  if (isDoubaoWebModel(modelName)) {
    return {};
  }
  const baseOptions = {
    __thinkingEnabled: Boolean(getModelProfile(modelName).thinkingEnabled),
    ...(extraOptions || {}),
  };

  if (!isLocalModel(modelName)) {
    return baseOptions;
  }
  const deviceMode = getModelDeviceMode(modelName);
  const runtimeOptions =
    deviceMode === "cpu"
      ? {
          num_gpu: 0,
          use_mmap: false,
        }
      : /^gpu:\d+$/.test(deviceMode)
        ? {
            main_gpu: Number(deviceMode.split(":")[1]),
          }
        : {};
  return {
    num_ctx: getModelContextLimit(modelName),
    ...runtimeOptions,
    ...baseOptions,
  };
}

function parseAgentPlannerResponse(rawText) {
  const jsonText = extractFirstJsonObject(rawText);
  if (!jsonText) {
    return {
      mode: "reply",
      reply: String(rawText || "").trim() || "我理解了你的请求，但暂时没有整理出进一步动作。",
      task: "",
    };
  }

  try {
    const parsed = JSON.parse(jsonText);
    return {
      mode: ["execute", "reply", "clarify"].includes(parsed?.mode) ? parsed.mode : "reply",
      reply: String(parsed?.reply || "").trim(),
      task: String(parsed?.task || "").trim(),
    };
  } catch {
    return {
      mode: "reply",
      reply: String(rawText || "").trim() || "我理解了你的请求，但暂时没有整理出进一步动作。",
      task: "",
    };
  }
}

function buildExecutionFlowText(steps = []) {
  return steps
    .map((step, index) => `${index + 1}. ${String(step || "").trim()}`)
    .filter((line) => !/\d+\.\s*$/.test(line))
    .join("\n");
}

async function rewriteAgentTask(task, session, preferredModel = "") {
  const model = preferredModel || getPreferredAgentModel();
  const messages = applyThinkingDirective(buildAgentPlannerMessages(task, session), model);
  const response = await fetch(API_ROUTES.chatOnce, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      options: buildRequestOptions(model, {
        temperature: 0.1,
      }),
      messages,
    }),
  });
  const data = await readJsonResponse(response, "管家模式规划");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "本地管家规划失败");
  }

  return parseAgentPlannerResponse(String(data.message || "").trim());
}

const threadViewport = document.querySelector("#thread-viewport");
const sidePanelEl = document.querySelector(".side-panel");
const sidePanelScrollEl = document.querySelector(".side-panel-scroll");
const conversationHeaderToplineEl = document.querySelector(".conversation-header-topline");
const rightPanelWindowControlsEl = document.querySelector(".right-panel-window-controls");
const {
  conversationPanel,
  rightPanelWindowStripEl,
  rightPanelWindowSliderEl,
  rightPanelViewTabEls,
  chatLog,
  chatForm,
  composerAttachmentsEl,
  promptInput,
  sendBtn,
  stopBtn,
  composerThinkingBtn,
  clearBtn,
  conversationTitleEl,
  conversationTitleInputEl,
  conversationAppPillEl,
  conversationAppRenameTriggerEl,
  conversationAppNameEl,
  conversationAppNameInputEl,
  conversationModelMenuEl,
  conversationModelGroupsEl,
  conversationModelGuideEl,
  conversationModelGuideBtn,
  conversationModelLabelEl,
  conversationModePillEl,
  conversationSettingsBtn,
  conversationShellMoreBtn,
  conversationShellMenuEl,
  conversationShellPinBtn,
  conversationShellFullscreenBtn,
  conversationShellSwapBtn,
  conversationShellClickThroughBtn,
  conversationShellRefreshBtn,
  conversationShellCloseBtn,
  screenSourceHeaderSlotEl,
  screenSourceHeaderMenuEl,
  screenSourcePanelEl,
  screenSourceToolbarEl,
  screenSourceInlineActionsEl,
  screenSourceOverflowMenuEl,
  screenSourceStageEl,
  screenSourceShellWrapEl,
  screenSourcePreviewShellEl,
  screenSourceVideoEl,
  screenSourceEmptyEl,
  screenSourceLoaderHostEl,
  screenSourceEmptyTitleEl,
  screenSourceEmptyTextEl,
  screenSourceStatusPillEl,
  screenSourceRenderModeSelectEl,
  screenSourceFitModeSelectEl,
  screenSourceSelectEl,
  screenSourceSelectMenuEl,
  screenSourceSelectTriggerEl,
  screenSourceSelectCurrentEl,
  screenSourceSelectPanelEl,
  screenSourceRefreshBtn,
  screenSourceRefreshEmbedBtn,
  screenSourceEmbedToggleBtn,
  screenSourceActionButtonEls,
} = getConversationAssistantElements(document);
const clearHistoryBtn = document.querySelector("#clear-history-btn");
const refreshStorageBtn = document.querySelector("#refresh-storage-btn");
const savePermissionsBtn = document.querySelector("#save-permissions-btn");
const refreshPermissionsBtn = document.querySelector("#refresh-permissions-btn");
const refreshSystemBtn = document.querySelector("#refresh-system-btn");
const addRootBtn = document.querySelector("#add-root-btn");
const rootPathInput = document.querySelector("#root-path-input");
const permissionGridEl = document.querySelector("#permission-grid");
const allowedRootListEl = document.querySelector("#allowed-root-list");
const systemStatsEl = document.querySelector("#system-stats");
const agentModeToggle = document.querySelector("#agent-mode-toggle");
const permissionsSectionEl = document.querySelector("#permissions-section");
const thinkingToggleWrap = document.querySelector("#thinking-toggle-wrap");
const thinkingToggle = document.querySelector("#thinking-toggle");
const historyListEl = document.querySelector("#history-list");
const historyCountEl = document.querySelector("#history-count");
const modelSelect = document.querySelector("#model-select");
const deviceModeSelect = document.querySelector("#device-mode-select");
const outputModeSelect = document.querySelector("#output-mode-select");
const contextLimitSelect = document.querySelector("#context-limit-select");
const contextLimitInput = document.querySelector("#context-limit-input");
const contextLimitApplyBtn = document.querySelector("#context-limit-apply-btn");
const contextLimitHintEl = document.querySelector("#context-limit-hint");
const aiControlSessionMenuEl = document.querySelector("#ai-control-session-menu");
const aiControlNewSessionBtn = document.querySelector("#ai-control-new-session-btn");
const aiControlHistoryCountEl = document.querySelector("#ai-control-history-count");
const aiControlHistoryListEl = document.querySelector("#ai-control-history-list");
const defaultModelEl = document.querySelector("#default-model");
const connectionStatusEl = document.querySelector("#connection-status");
const responseModeLabelEl = document.querySelector("#response-mode-label");
const statusTextEl = document.querySelector("#status-text");
const statusPillEl = document.querySelector("#status-pill");
const workspaceEl = document.querySelector(".workspace");
const contextSummaryEl = document.querySelector("#context-summary");
const contextUsedEl = document.querySelector("#context-used");
const contextRemainingEl = document.querySelector("#context-remaining");
const messageCountEl = document.querySelector("#message-count");
const contextProgressEl = document.querySelector("#context-progress");
const contextRatioEl = document.querySelector("#context-ratio");
const contextBreakdownEl = document.querySelector("#context-breakdown");
const messageTemplate = document.querySelector("#message-template");
const budgetCardEl = document.querySelector(".budget-card");
const drawerToggleBtn = document.querySelector("#drawer-toggle-btn");
const drawerCloseBtn = document.querySelector("#drawer-close-btn");
const drawerBackdropEl = document.querySelector("#drawer-backdrop");
const insightDrawerEl = document.querySelector("#insight-drawer");
const insightDrawerHandleEl = document.querySelector("#insight-drawer-handle");
const leftPaneResizerEl = document.querySelector("#left-pane-resizer");
const rightPaneResizerEl = document.querySelector("#right-pane-resizer");
const leftPaneYResizerEl = document.querySelector("#left-pane-y-resizer");
const rightPaneYResizerEl = document.querySelector("#right-pane-y-resizer");
const stageRestoreDockEl = document.querySelector("#stage-restore-dock");
const stageRestoreBtn = document.querySelector("#stage-restore-btn");
const stagePanelDragEls = Array.from(document.querySelectorAll("[data-stage-panel-drag]"));
const stagePanelActionEls = Array.from(document.querySelectorAll("[data-stage-panel-action]"));
const desktopShellControlsEl = document.querySelector("#desktop-shell-controls");
const desktopWindowBarEl = document.querySelector("#desktop-window-bar");
const bootSplashEl = document.querySelector(".boot-splash");
const desktopStatusBannerEl = document.querySelector("#desktop-status-banner");
const desktopStatusBannerTextEl = document.querySelector("#desktop-status-banner-text");
const desktopPassThroughHintEl = document.querySelector("#desktop-pass-through-hint");
const desktopPassThroughCopyEl = document.querySelector("#desktop-pass-through-copy");
const desktopRefreshBtn = document.querySelector("#desktop-refresh-btn");
const desktopFullscreenBtn = document.querySelector("#desktop-fullscreen-btn");
const desktopMenuBtn = document.querySelector("#desktop-menu-btn");
const desktopMenuPanel = document.querySelector("#desktop-menu-panel");
const desktopClickThroughBtn = document.querySelector("#desktop-clickthrough-btn");
const desktopPinBtn = document.querySelector("#desktop-pin-btn");
const desktopMinimizeBtn = document.querySelector("#desktop-minimize-btn");
const desktopCloseBtn = document.querySelector("#desktop-close-btn");
const globalOverlayLayerEl = document.querySelector("#global-overlay-layer");
const appGlobalShellActionsEl = document.querySelector(".app-global-shell-actions");
const rightPanelSwitchLockBtn = document.querySelector("#right-panel-switch-lock-btn");
const toggleLeftPaneBtn = document.querySelector("#toggle-left-pane-btn");
const toggleRightPaneBtn = document.querySelector("#toggle-right-pane-btn");
const restoreLeftPaneBtn = document.querySelector("#restore-left-pane-btn");
const restoreRightPaneBtn = document.querySelector("#restore-right-pane-btn");
const brandNameEl = document.querySelector("#brand-name");
const brandSubtitleEl = document.querySelector("#brand-subtitle");
const canvasTitleEl = document.querySelector("#canvas-title");
const canvasTitleRenameTriggerEl = document.querySelector("#canvas-title-rename-trigger");
const canvasTitleInputEl = document.querySelector("#canvas-title-input");
const appNameInput = document.querySelector("#app-name-input");
const appSubtitleInput = document.querySelector("#app-subtitle-input");
const canvasBoardPathInputEl = document.querySelector("#canvas-board-path-input");
  const canvasBoardPathBrowseBtn = document.querySelector("#canvas-board-path-browse-btn");
  const canvasBoardPathOpenBtn = document.querySelector("#canvas-board-path-open-btn");
  const canvasImagePathInputEl = document.querySelector("#canvas-image-path-input");
  const canvasImagePathBrowseBtn = document.querySelector("#canvas-image-path-browse-btn");
  const canvasImagePathOpenBtn = document.querySelector("#canvas-image-path-open-btn");
  const drawerAppNameInputEl = document.querySelector("#drawer-app-name-input");
  const drawerAppSubtitleInputEl = document.querySelector("#drawer-app-subtitle-input");
  const drawerCanvasBoardPathInputEl = document.querySelector("#drawer-canvas-board-path-input");
  const drawerCanvasBoardPathBrowseBtn = document.querySelector("#drawer-canvas-board-path-browse-btn");
  const drawerCanvasBoardPathOpenBtn = document.querySelector("#drawer-canvas-board-path-open-btn");
const drawerCanvasImagePathInputEl = document.querySelector("#drawer-canvas-image-path-input");
const drawerCanvasImagePathBrowseBtn = document.querySelector("#drawer-canvas-image-path-browse-btn");
const drawerCanvasImagePathOpenBtn = document.querySelector("#drawer-canvas-image-path-open-btn");
const habitSettingsSummaryEl = document.querySelector("#habit-settings-summary");
const clickThroughShortcutInputEl = document.querySelector("#clickthrough-shortcut-input");
const clickThroughShortcutSaveBtn = document.querySelector("#clickthrough-shortcut-save-btn");
const clickThroughShortcutResetBtn = document.querySelector("#clickthrough-shortcut-reset-btn");
const clickThroughShortcutStatusEl = document.querySelector("#clickthrough-shortcut-status");
const clickThroughShortcutNoteEl = document.querySelector("#clickthrough-shortcut-note");
const defaultCanvasPanelSideSelectEl = document.querySelector("#default-canvas-panel-side-select");
const defaultCanvasPanelVisibleInputEl = document.querySelector("#default-canvas-panel-visible-input");
const defaultChatPanelVisibleInputEl = document.querySelector("#default-chat-panel-visible-input");
const defaultLaunchFullscreenInputEl = document.querySelector("#default-launch-fullscreen-input");
const workbenchHabitSaveBtn = document.querySelector("#workbench-habit-save-btn");
const workbenchHabitResetBtn = document.querySelector("#workbench-habit-reset-btn");
const workbenchHabitApplyBtn = document.querySelector("#workbench-habit-apply-btn");
const workbenchHabitStatusEl = document.querySelector("#workbench-habit-status");
const conversationShellClickThroughNoteEl = document.querySelector("#conversation-shell-clickthrough-note");
const themeSettingsPanelHostEl = document.querySelector("#theme-settings-panel-host");
const canvasModeLegacyBtn = document.querySelector("#canvas-mode-legacy-btn");
const canvasModeSwitchEl = document.querySelector("#canvas-mode-switch");
const canvasModeSliderEl = document.querySelector("#canvas-mode-slider");
const clipboardModeSelect = document.querySelector("#clipboard-mode-select");
const clipboardCaptureBtn = document.querySelector("#clipboard-capture-btn");
const clipboardClearBtn = document.querySelector("#clipboard-clear-btn");
const clipboardSaveChatBtn = document.querySelector("#clipboard-save-chat-btn");
const clipboardListEl = document.querySelector("#clipboard-list");
const clipboardCountEl = document.querySelector("#clipboard-count");
const clipboardSummaryEl = document.querySelector("#clipboard-summary");
const clipboardStatusPillEl = document.querySelector("#clipboard-status-pill");
const canvasViewportEl = document.querySelector("#canvas-viewport");
const canvasStageBodyEl = document.querySelector("#canvas-engine-stage");
const canvasShellEl = document.querySelector(".canvas-shell");
const canvasSurfaceEl = document.querySelector("#canvas-surface");
const canvasItemsEl = document.querySelector("#canvas-items");
const canvasDraftLayerEl = document.querySelector("#canvas-draft-layer");
const canvasEmptyStateEl = document.querySelector("#canvas-empty-state");
const canvasCanvas2dHostEl = document.querySelector("#canvas-canvas2d-host");
const canvasItemCountEl = document.querySelector("#canvas-item-count");
const canvasZoomLabelEl = document.querySelector("#canvas-zoom-label");
const canvasZoomRangeEl = document.querySelector("#canvas-zoom-range");
const canvasStatusPillEl = document.querySelector("#canvas-status-pill");
const canvasReturnBtn = document.querySelector("#canvas-return-btn");
const canvasZoomInBtn = document.querySelector("#canvas-zoom-in-btn");
const canvasZoomOutBtn = document.querySelector("#canvas-zoom-out-btn");
const canvasPasteBtn = document.querySelector("#canvas-paste-btn");
const canvasResetViewBtn = document.querySelector("#canvas-reset-view-btn");
const canvasClearBtn = document.querySelector("#canvas-clear-btn");
const canvasToolButtons = Array.from(document.querySelectorAll("[data-canvas-tool]"));
const screenSourceHeaderPanelEl = screenSourceHeaderMenuEl?.querySelector(".screen-source-header-panel") || null;
const runtimeSummaryEl = document.querySelector("#runtime-summary");
const customizeSummaryEl = document.querySelector("#customize-summary");
const historySummaryEl = document.querySelector("#history-summary");
const renameSessionBtn = document.querySelector("#rename-session-btn");
const saveSessionRenameBtn = document.querySelector("#save-session-rename-btn");
const cancelSessionRenameBtn = document.querySelector("#cancel-session-rename-btn");
let permissionAttentionTimer = null;
let removeDesktopShellStateListener = null;
let desktopSurfaceSyncPromise = Promise.resolve();
const desktopClearStageEl = document.querySelector(".desktop-clear-stage");
let bootShapeUnlockTimer = 0;
let screenSourceEmbedSyncFrame = 0;
let screenSourceToolbarSyncFrame = 0;
let rightPanelWindowSliderFrame = 0;
let screenSourceHeaderMenuLayoutFrame = 0;
let conversationShellMenuLayoutFrame = 0;
let panelTransformDependentSyncFrame = 0;
let activeClipboardZone = "";
let embeddedWindowOverlayHidden = false;
let embeddedWindowOverlaySyncPromise = Promise.resolve();
let drawerResumeScreenSourceTargetId = "";
let shellMenuResumeScreenSourceTargetId = "";
let canvasTitleRenameInFlight = false;
let canvasPointerAnchorPoint = null;
let canvasContextMenuAnchorPoint = null;
let composerAttachmentDragPayload = null;
let rightPanelSwitchLocked = false;
const windowShapeAutoSyncDisposers = [];
const desktopWindowShapeScheduler = createWindowShapeSyncScheduler({
  sync: () => {
    if (!IS_DESKTOP_APP || state.desktopShellState.fullClickThrough) {
      scheduleEmbeddedScreenSourceSync();
      return;
    }
    syncDesktopWindowShape();
    scheduleEmbeddedScreenSourceSync();
  },
});

function mountDrawerPortal() {
  if (
    !(globalOverlayLayerEl instanceof HTMLElement) ||
    !(drawerBackdropEl instanceof HTMLElement) ||
    !(insightDrawerEl instanceof HTMLElement)
  ) {
    return;
  }

  if (drawerBackdropEl.parentElement !== globalOverlayLayerEl) {
    globalOverlayLayerEl.appendChild(drawerBackdropEl);
  }

  if (insightDrawerEl.parentElement !== globalOverlayLayerEl) {
    globalOverlayLayerEl.appendChild(insightDrawerEl);
  }
  unmarkElementForWindowShape(drawerBackdropEl);
  markElementForWindowShape(insightDrawerEl, { padding: 4 });
}

function mountShellMenuPortal() {
  if (!(globalOverlayLayerEl instanceof HTMLElement) || !(conversationShellMenuEl instanceof HTMLElement)) {
    return;
  }

  if (conversationShellMenuEl.parentElement !== globalOverlayLayerEl) {
    globalOverlayLayerEl.appendChild(conversationShellMenuEl);
  }
  markElementForWindowShape(conversationShellMenuEl, { padding: 6 });
}

function syncDesktopMenuPanelPosition() {
  if (!(globalOverlayLayerEl instanceof HTMLElement) || !(desktopMenuPanel instanceof HTMLElement) || !(desktopMenuBtn instanceof HTMLElement)) {
    return;
  }

  const triggerRect = desktopMenuBtn.getBoundingClientRect();
  const overlayRect = globalOverlayLayerEl.getBoundingClientRect();
  const panelRect = desktopMenuPanel.getBoundingClientRect();
  const viewportWidth = Math.max(0, Number(window.innerWidth) || 0);
  const viewportHeight = Math.max(0, Number(window.innerHeight) || 0);
  const margin = 12;
  const measuredWidth = Math.max(160, Math.round(panelRect.width || desktopMenuPanel.offsetWidth || 160));
  const measuredHeight = Math.max(80, Math.round(panelRect.height || desktopMenuPanel.offsetHeight || 80));
  const left = Math.max(
    margin,
    Math.min(triggerRect.right - overlayRect.left - measuredWidth, viewportWidth - measuredWidth - margin)
  );
  const top = Math.max(
    margin,
    Math.min(triggerRect.bottom - overlayRect.top + 10, viewportHeight - measuredHeight - margin)
  );

  desktopMenuPanel.style.left = `${Math.round(left)}px`;
  desktopMenuPanel.style.top = `${Math.round(top)}px`;
}

function mountDesktopMenuPanelPortal() {
  if (!(globalOverlayLayerEl instanceof HTMLElement) || !(desktopMenuPanel instanceof HTMLElement)) {
    return;
  }

  if (desktopMenuPanel.parentElement !== globalOverlayLayerEl) {
    globalOverlayLayerEl.appendChild(desktopMenuPanel);
  }
  markElementForWindowShape(desktopMenuPanel, { padding: 6 });
  syncDesktopMenuPanelPosition();
}

function mountScreenSourceHeaderPanelPortal() {
  if (!(globalOverlayLayerEl instanceof HTMLElement) || !(screenSourceHeaderPanelEl instanceof HTMLElement)) {
    return;
  }

  if (screenSourceHeaderPanelEl.parentElement !== globalOverlayLayerEl) {
    globalOverlayLayerEl.appendChild(screenSourceHeaderPanelEl);
  }
  markElementForWindowShape(screenSourceHeaderPanelEl, { padding: 6 });
  screenSourceHeaderPanelEl.classList.toggle("is-hidden", !screenSourceHeaderMenuEl?.hasAttribute("open"));
}

function mountDesktopPassThroughHintPortal() {
  if (!(globalOverlayLayerEl instanceof HTMLElement) || !(desktopPassThroughHintEl instanceof HTMLElement)) {
    return;
  }

  if (desktopPassThroughHintEl.parentElement !== globalOverlayLayerEl) {
    globalOverlayLayerEl.appendChild(desktopPassThroughHintEl);
  }
  markElementForWindowShape(desktopPassThroughHintEl, { padding: 4 });
}

mountDrawerPortal();
mountShellMenuPortal();
mountDesktopMenuPanelPortal();
mountScreenSourceHeaderPanelPortal();
mountDesktopPassThroughHintPortal();
const globalTutorialHost = mountGlobalTutorialHost({
  overlayRoot: globalOverlayLayerEl,
  onShapeChange: () => {
    scheduleDesktopWindowShapeSync();
  },
  onFinalShapeChange: () => {
    desktopWindowShapeScheduler.requestFinalShapeSync(48);
  },
  onIntroDismiss: () => {
    void persistStartupTutorialIntroSettings();
  },
  onIntroDismissVersion: () => {
    void persistStartupTutorialIntroSettings({
      dismissedTutorialIntroVersion: getStartupTutorialIntroVersion(),
    });
  },
});
bindDesktopWindowShapeAutoSync();

const screenSourceEmptyLoader = mountLemniscateBloomLoader(screenSourceLoaderHostEl);
const themeSettingsPanel = mountThemeSettingsPanel(themeSettingsPanelHostEl, {
  onPreviewChange: handleThemeSettingsPreviewChange,
  onSave: handleThemeSettingsSave,
  onReset: handleThemeSettingsReset,
});
const hasLegacyCanvasShell =
  canvasViewportEl instanceof HTMLElement &&
  canvasSurfaceEl instanceof HTMLElement &&
  canvasItemsEl instanceof HTMLElement;

function createDisabledCanvasFeature() {
  return {
    canvas: {
      createContextMenu() {
        return null;
      },
      createImageLightbox() {
        return null;
      },
      render() {},
      setView() {},
      setScaleContinuous() {},
      focusNearestItem() {},
      openImageLightbox() {},
      closeImageLightbox() {},
      getCanvasPositionFromClientPoint(clientX, clientY) {
        return { x: Number(clientX) || 0, y: Number(clientY) || 0 };
      },
    },
    itemManager: {
      beginCanvasShapeDraft() {},
      updateCanvasShapeDraft() {},
      commitCanvasShapeDraft() {},
      cancelCanvasShapeDraft() {},
      isCanvasShapeItem() {
        return false;
      },
      getCanvasItemById() {
        return null;
      },
      getSelectedCanvasItems() {
        return [];
      },
      setSelectionToCanvasItem() {},
      clearCanvasSelection() {
        return false;
      },
      startEditingCanvasTextbox() {},
      stopEditingCanvasTextbox() {},
      bindCanvasTextboxEditor() {},
      openCanvasItem() {},
      createCanvasTextboxAt() {
        return null;
      },
      getCanvasTool() {
        return "select";
      },
      setCanvasTool() {},
      recordCanvasHistory() {},
      handleCanvasExternalDrop() {
        return false;
      },
      isCanvasTextItem() {
        return false;
      },
      getCanvasMaterialDimensions() {
        return { width: 0, height: 0 };
      },
      getCanvasFileMetaLine() {
        return "";
      },
      getCanvasCardTitle() {
        return "";
      },
      removeCanvasItemsByIds() {
        return false;
      },
      createCanvasItem(base = {}) {
        return base;
      },
      upsertCanvasItems() {
        return [];
      },
      fileToDataUrl() {
        return Promise.resolve("");
      },
      readImageDimensions() {
        return Promise.resolve({ width: 0, height: 0 });
      },
      getAdaptiveImageCardSize() {
        return { width: 0, height: 0 };
      },
      fileToCanvasItem() {
        return Promise.resolve(null);
      },
      filePathToCanvasItem() {
        return Promise.resolve(null);
      },
      hasClipboardFiles() {
        return false;
      },
      readClipboardFilePaths() {
        return Promise.resolve([]);
      },
      importClipboardFilesFromDesktop() {
        return Promise.resolve(false);
      },
      getDroppedDirectoryItems() {
        return Promise.resolve([]);
      },
      importClipboardOrDroppedData() {
        return Promise.resolve(false);
      },
      copyCanvasItemToClipboard() {
        return false;
      },
      copyCanvasItemsToClipboard() {
        return false;
      },
      undoCanvasBoard() {},
      redoCanvasBoard() {},
    },
    projectFile: {
      load() {
        return Promise.resolve(state.canvasBoard);
      },
      save() {
        return Promise.resolve(true);
      },
    },
  };
}

const canvasFeature = hasLegacyCanvasShell
  ? createCanvasFeature({
  state,
  refs: {
    canvasViewportEl,
    canvasSurfaceEl,
    canvasItemsEl,
    canvasDraftLayerEl,
    canvasEmptyStateEl,
    canvasItemCountEl,
    canvasZoomLabelEl,
    canvasZoomRangeEl,
    canvasToolButtons,
  },
  apiRoutes: API_ROUTES,
  readJsonResponse,
  getCanvasBoardSavePath,
  applyCanvasBoardStorageInfo,
  readLegacyBoard: readLegacyCanvasBoardFromStorage,
  clearLegacyBoard: clearLegacyCanvasBoardStorage,
  setCanvasStatus,
  getActiveAppClipboardPayload: () => getActiveAppClipboardPayload(),
  shouldUseAppClipboardPayload: (payload, dataTransfer) => shouldUseAppClipboardPayload(payload, dataTransfer),
  pasteAppClipboardToCanvas: (payload, anchorPoint) => pasteAppClipboardToCanvas(payload, anchorPoint),
  pasteAppClipboardToComposer: (payload) => pasteAppClipboardToComposer(payload),
  setAppClipboardPayload: (payload) => setAppClipboardPayload(payload),
  readClipboardText: () => readClipboardText(),
  writeClipboardText: (text) => writeClipboardText(text),
  setActiveClipboardZone: (zone) => setActiveClipboardZone(zone),
  scheduleDesktopWindowShapeSync,
  isEditableElement,
  openCanvasImageLightbox: (item) => openCanvasImageLightbox(item),
  openCanvasItem: (item) => openCanvasItem(item),
  getCanvasTool: () => state.canvasTool,
  setCanvasTool: (tool) => {
    state.canvasTool = tool;
  },
  beginCanvasShapeDraft: (shapeType, clientX, clientY, options) =>
    canvasItemManager.beginCanvasShapeDraft(shapeType, clientX, clientY, options),
  updateCanvasShapeDraft: (clientX, clientY, options) =>
    canvasItemManager.updateCanvasShapeDraft(clientX, clientY, options),
  commitCanvasShapeDraft: () => canvasItemManager.commitCanvasShapeDraft(),
  cancelCanvasShapeDraft: (options) => canvasItemManager.cancelCanvasShapeDraft(options),
  isCanvasShapeItem: (item) => canvasItemManager.isCanvasShapeItem(item),
})
  : createDisabledCanvasFeature();
const canvasCanvas = canvasFeature.canvas;
const canvasItemManager = canvasFeature.itemManager;
const canvasProjectFile = canvasFeature.projectFile;
const canvasContextMenuEl = canvasCanvas.createContextMenu();
const canvasImageLightboxEl = canvasCanvas.createImageLightbox();
const canvasItemInteractionController = createCanvasItemInteractionController({
  canvasViewportEl,
  chatFormEl: chatForm,
  screenSourcePanelEl,
  screenSourceHeaderSlotEl,
  getState: () => state,
  getCanvasItemById: (itemId) => canvasItemManager.getCanvasItemById(itemId),
  getSelectedCanvasItems: () => canvasItemManager.getSelectedCanvasItems(),
  setSelectionToCanvasItem: (itemId, options) => canvasItemManager.setSelectionToCanvasItem(itemId, options),
  clearCanvasSelection: (options) => canvasItemManager.clearCanvasSelection(options),
  renderCanvasBoard: () => canvasCanvas.render(),
  saveCanvasBoardToStorage: () => canvasProjectFile.save(state.canvasBoard),
  setCanvasStatus,
  closeCanvasContextMenu,
  openCanvasContextMenu,
  openCanvasImageLightbox,
  startEditingCanvasTextbox: (itemId) => canvasItemManager.startEditingCanvasTextbox(itemId),
  openCanvasItem: (item) => canvasItemManager.openCanvasItem(item),
  createCanvasTextboxAt: (clientX, clientY) => canvasItemManager.createCanvasTextboxAt(clientX, clientY),
  getCanvasTool: () => canvasItemManager.getCanvasTool(),
  setCanvasTool: (tool) => canvasItemManager.setCanvasTool(tool),
  beginCanvasShapeDraft: (shapeType, clientX, clientY, options) =>
    canvasItemManager.beginCanvasShapeDraft(shapeType, clientX, clientY, options),
  updateCanvasShapeDraft: (clientX, clientY, options) =>
    canvasItemManager.updateCanvasShapeDraft(clientX, clientY, options),
  commitCanvasShapeDraft: () => canvasItemManager.commitCanvasShapeDraft(),
  cancelCanvasShapeDraft: (options) => canvasItemManager.cancelCanvasShapeDraft(options),
  isCanvasShapeItem: (item) => canvasItemManager.isCanvasShapeItem(item),
  recordCanvasHistory: (reason) => canvasItemManager.recordCanvasHistory(reason),
  updateCanvasView: (nextView, options) => canvasCanvas.setView(nextView, options),
  onExternalDrop: (items, zone) => canvasItemManager.handleCanvasExternalDrop(items, zone),
  isEditableElement,
  getCanvasPositionFromClientPoint: (clientX, clientY) => canvasCanvas.getCanvasPositionFromClientPoint(clientX, clientY),
  setActiveClipboardZone: (zone) => setActiveClipboardZone(zone),
});

function updatePromptPlaceholder() {
  if (!promptInput) return;

  promptInput.placeholder = agentModeToggle?.checked
    ? "像聊天一样描述你的目标，例如：帮我看看这个窗口在干嘛、点一下保存按钮、刚才识别到了什么、读取 D:\\FreeFlow-WorkBoard\\data\\sessions.json"
    : `给 ${getAppDisplayName()} 发送任务，例如：整理这段代码逻辑，或者起草一封邮件。`;
}

function getAppDisplayName() {
  return String(state.uiSettings?.appName || "").trim() || DEFAULT_APP_NAME;
}

function getAppSubtitle() {
  return String(state.uiSettings?.appSubtitle || "").trim() || DEFAULT_APP_SUBTITLE;
}

function getCanvasTitle() {
  return String(state.uiSettings?.canvasTitle || "").trim() || DEFAULT_CANVAS_TITLE;
}

function normalizeRightPanelView(value) {
  return String(value || "").trim() === "screen" ? "screen" : "assistant";
}

function getModelSourceLabel(modelName) {
  const source = getModelSource(modelName);
  if (source === "cloud") return "云端";
  if (source === "browser") return "网页";
  return "本地";
}

function closeConversationModelMenu() {
  conversationAssistantChrome?.closeModelMenu();
}

function setConversationShellMenuOpen(open) {
  conversationAssistantChrome?.setShellMenuOpen(open);
}

function renderConversationShellMenuState() {
  conversationAssistantChrome?.renderShellMenuState();
}

function closeScreenSourceOverflowMenu() {
  screenSourceOverflowMenuEl?.removeAttribute("open");
  syncEmbeddedWindowOverlayVisibility();
}

function closeScreenSourceHeaderMenu() {
  screenSourceHeaderMenuEl?.removeAttribute("open");
  screenSourceHeaderPanelEl?.classList.add("is-hidden");
  syncEmbeddedWindowOverlayVisibility();
}

function isWin32EmbeddedScreenSourceActive() {
  return state.screenSource.activeMode === "embedded-win32" && Boolean(state.screenSource.embeddedSourceId);
}

function isWebContentsViewScreenSourceActive() {
  return state.screenSource.activeMode === "embedded-webcontentsview" && Boolean(state.screenSource.embeddedSourceId);
}

function isEmbeddedScreenSourceActive() {
  return isWin32EmbeddedScreenSourceActive() || isWebContentsViewScreenSourceActive();
}

function canUseWin32EmbeddedScreenSource() {
  return (
    Boolean(IS_DESKTOP_APP) &&
    DESKTOP_SHELL?.platform === "win32" &&
    typeof DESKTOP_SHELL?.embedExternalWindow === "function" &&
    typeof DESKTOP_SHELL?.syncExternalWindowBounds === "function" &&
    typeof DESKTOP_SHELL?.clearExternalWindow === "function"
  );
}

function canUseWebContentsViewScreenSource() {
  return (
    Boolean(IS_DESKTOP_APP) &&
    typeof DESKTOP_SHELL?.attachAiMirrorWebContentsView === "function" &&
    typeof DESKTOP_SHELL?.syncAiMirrorWebContentsViewBounds === "function" &&
    typeof DESKTOP_SHELL?.clearAiMirrorWebContentsView === "function"
  );
}

function canUseSelectedEmbeddedScreenSourceMode() {
  return normalizeScreenSourceRenderMode(state.screenSource.renderMode) === "webcontentsview"
    ? canUseWebContentsViewScreenSource()
    : canUseWin32EmbeddedScreenSource();
}

function setEmbeddedProjectionVisibility(visible) {
  if (!IS_DESKTOP_APP || !isEmbeddedScreenSourceActive()) {
    return Promise.resolve({ ok: true, active: false });
  }

  if (isWin32EmbeddedScreenSourceActive() && typeof DESKTOP_SHELL?.setExternalWindowVisibility === "function") {
    return DESKTOP_SHELL.setExternalWindowVisibility(visible);
  }

  if (
    isWebContentsViewScreenSourceActive() &&
    typeof DESKTOP_SHELL?.setAiMirrorWebContentsViewVisibility === "function"
  ) {
    return DESKTOP_SHELL.setAiMirrorWebContentsViewVisibility(visible);
  }

  return Promise.resolve({ ok: true, active: false });
}

function shouldHideEmbeddedWindowForOverlay() {
  if (!isEmbeddedScreenSourceActive() || state.desktopShellState.fullClickThrough) {
    return false;
  }

  return Boolean(
    state.drawerOpen ||
      !desktopMenuPanel?.classList.contains("is-hidden") ||
      !conversationShellMenuEl?.classList.contains("is-hidden") ||
      screenSourceHeaderMenuEl?.hasAttribute("open") ||
      screenSourceOverflowMenuEl?.hasAttribute("open") ||
      isLeftStageOccludingRightPanel()
  );
}

function isLeftStageOccludingRightPanel() {
  const leftPanel = state.panelLayout?.left;
  const rightPanel = state.panelLayout?.right;
  if (!leftPanel || !rightPanel) return false;
  if (leftPanel.hidden || leftPanel.collapsed || rightPanel.hidden || rightPanel.collapsed) return false;

  const leftZ = Number(desktopClearStageEl?.style?.zIndex || window.getComputedStyle(desktopClearStageEl || document.body).zIndex) || 0;
  const rightZ = Number(conversationPanel?.style?.zIndex || window.getComputedStyle(conversationPanel || document.body).zIndex) || 0;
  if (leftZ <= rightZ) return false;

  const leftRect = desktopClearStageEl?.getBoundingClientRect?.();
  const rightRect = conversationPanel?.getBoundingClientRect?.();
  if (!leftRect || !rightRect) return false;

  const overlapWidth = Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left);
  const overlapHeight = Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top);
  return overlapWidth > 24 && overlapHeight > 64;
}

function syncEmbeddedWindowOverlayVisibility() {
  if (!IS_DESKTOP_APP) {
    return Promise.resolve();
  }

  if (state.desktopShellState.fullClickThrough) {
    embeddedWindowOverlayHidden = true;
    embeddedWindowOverlaySyncPromise = embeddedWindowOverlaySyncPromise
      .catch(() => {})
      .then(() => setEmbeddedProjectionVisibility(false))
      .catch(() => {});
    return embeddedWindowOverlaySyncPromise;
  }

  const shouldHide = shouldHideEmbeddedWindowForOverlay();
  if (!isEmbeddedScreenSourceActive()) {
    embeddedWindowOverlayHidden = false;
    return Promise.resolve();
  }

  if (embeddedWindowOverlayHidden === shouldHide) {
    return embeddedWindowOverlaySyncPromise;
  }

  embeddedWindowOverlayHidden = shouldHide;
  embeddedWindowOverlaySyncPromise = embeddedWindowOverlaySyncPromise
    .catch(() => {})
    .then(() => setEmbeddedProjectionVisibility(!shouldHide))
    .then(() => {
      if (!shouldHide) {
        scheduleEmbeddedScreenSourceSync();
        focusEmbeddedScreenSourceWindow();
      }
    })
    .catch(() => {});

  return embeddedWindowOverlaySyncPromise;
}

function prepareEmbeddedWindowForDrawerOpen() {
  if (
    !IS_DESKTOP_APP ||
    !isEmbeddedScreenSourceActive() ||
    state.activeRightPanelView !== "screen" ||
    (!isWin32EmbeddedScreenSourceActive() && !isWebContentsViewScreenSourceActive())
  ) {
    return;
  }

  embeddedWindowOverlayHidden = true;
  embeddedWindowOverlaySyncPromise = embeddedWindowOverlaySyncPromise
    .catch(() => {})
    .then(() => setEmbeddedProjectionVisibility(false))
    .catch(() => {});
}

async function suspendScreenSourceForDrawer() {
  if (
    !IS_DESKTOP_APP ||
    state.drawerOpen ||
    state.activeRightPanelView !== "screen" ||
    (!isEmbeddedScreenSourceActive() && !state.screenSource.stream)
  ) {
    return;
  }

  drawerResumeScreenSourceTargetId = String(
    state.screenSource.activeTargetId || state.screenSource.selectedSourceId || ""
  ).trim();

  await stopScreenSourceCapture({
    announce: false,
    statusText: "AI镜像已临时关闭",
  });
}

async function resumeScreenSourceAfterDrawerClose() {
  const targetId = String(drawerResumeScreenSourceTargetId || "").trim();
  drawerResumeScreenSourceTargetId = "";

  if (!targetId || state.activeRightPanelView !== "screen") {
    return;
  }

  state.screenSource.selectedSourceId = targetId;
  const selected = state.screenSource.availableSources.find((item) => item.id === targetId) || null;
  state.screenSource.selectedSourceLabel = selected?.label || selected?.name || "";

  try {
    await ensureScreenSourceCapture();
  } catch {
    // Keep drawer closing resilient; status will be updated by ensureScreenSourceCapture.
  }
}

async function suspendScreenSourceForShellMenu() {
  if (
    !IS_DESKTOP_APP ||
    state.drawerOpen ||
    !conversationShellMenuEl?.classList.contains("is-hidden") ||
    state.activeRightPanelView !== "screen" ||
    (!isEmbeddedScreenSourceActive() && !state.screenSource.stream)
  ) {
    return;
  }

  shellMenuResumeScreenSourceTargetId = String(
    state.screenSource.activeTargetId || state.screenSource.selectedSourceId || ""
  ).trim();

  await stopScreenSourceCapture({
    announce: false,
    statusText: "AI镜像已临时关闭",
  });
}

async function resumeScreenSourceAfterShellMenuClose() {
  const targetId = String(shellMenuResumeScreenSourceTargetId || "").trim();
  shellMenuResumeScreenSourceTargetId = "";

  if (!targetId || state.drawerOpen || state.activeRightPanelView !== "screen") {
    return;
  }

  state.screenSource.selectedSourceId = targetId;
  const selected = state.screenSource.availableSources.find((item) => item.id === targetId) || null;
  state.screenSource.selectedSourceLabel = selected?.label || selected?.name || "";

  try {
    await ensureScreenSourceCapture();
  } catch {
    // Keep shell menu closing resilient; status will be updated by ensureScreenSourceCapture.
  }
}

function setScreenSourceActionButtonsState(action, { text, disabled } = {}) {
  const buttons = screenSourceActionButtonEls[action] || [];
  for (const button of buttons) {
    if (typeof text === "string") {
      button.textContent = text;
    }
    if (typeof disabled === "boolean") {
      button.disabled = disabled;
    }
  }
}

function hasActiveScreenSourceProjection() {
  return Boolean(state.screenSource.stream || isEmbeddedScreenSourceActive());
}

function syncRightPanelWindowSlider() {
  if (!rightPanelWindowStripEl || !rightPanelWindowSliderEl) {
    return;
  }

  const activeTab = rightPanelViewTabEls.find((tab) => tab.classList.contains("is-active"));
  if (!activeTab) {
    rightPanelWindowSliderEl.style.width = "0px";
    return;
  }

  const stripRect = rightPanelWindowStripEl.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();
  rightPanelWindowSliderEl.style.width = `${Math.max(0, tabRect.width)}px`;
  rightPanelWindowSliderEl.style.transform = `translateX(${Math.max(0, tabRect.left - stripRect.left)}px)`;
}

function renderRightPanelSwitchLockState() {
  const locked = Boolean(rightPanelSwitchLocked);
  rightPanelWindowStripEl?.classList.toggle("is-locked", locked);
  rightPanelSwitchLockBtn?.classList.toggle("is-locked", locked);
  rightPanelSwitchLockBtn?.setAttribute("aria-pressed", String(locked));
  rightPanelSwitchLockBtn?.setAttribute("aria-label", locked ? "解锁界面切换" : "锁定界面切换");
  rightPanelSwitchLockBtn?.setAttribute("title", locked ? "解锁界面切换" : "锁定界面切换");

  for (const tab of rightPanelViewTabEls) {
    tab.disabled = locked;
    tab.setAttribute("aria-disabled", String(locked));
  }
}

function scheduleRightPanelWindowSliderSync() {
  if (rightPanelWindowSliderFrame) {
    window.cancelAnimationFrame(rightPanelWindowSliderFrame);
  }

  rightPanelWindowSliderFrame = window.requestAnimationFrame(() => {
    rightPanelWindowSliderFrame = 0;
    syncRightPanelWindowSlider();
  });
}

function syncConversationShellMenuLayout() {
  if (!conversationShellMenuEl || !conversationShellMoreBtn) {
    return;
  }

  if (conversationShellMenuEl.classList.contains("is-hidden")) {
    conversationShellMenuEl.style.removeProperty("left");
    conversationShellMenuEl.style.removeProperty("top");
    conversationShellMenuEl.style.removeProperty("max-width");
    conversationShellMenuEl.style.removeProperty("max-height");
    return;
  }

  const viewportPadding = 12;
  const verticalGap = 10;
  const buttonRect = conversationShellMoreBtn.getBoundingClientRect();
  const maxWidth = Math.max(220, window.innerWidth - viewportPadding * 2);
  const maxHeight = Math.max(220, window.innerHeight - viewportPadding * 2);

  conversationShellMenuEl.style.setProperty("max-width", `${maxWidth}px`);
  conversationShellMenuEl.style.setProperty("max-height", `${maxHeight}px`);
  conversationShellMenuEl.style.setProperty("left", "0px");
  conversationShellMenuEl.style.setProperty("top", "0px");

  const panelRect = conversationShellMenuEl.getBoundingClientRect();
  const desiredLeft = buttonRect.right - panelRect.width;
  const clampedLeft = Math.min(
    Math.max(viewportPadding, desiredLeft),
    Math.max(viewportPadding, window.innerWidth - viewportPadding - panelRect.width)
  );
  const canOpenUpward = buttonRect.top - verticalGap - panelRect.height >= viewportPadding;
  const overflowsBottom = buttonRect.bottom + verticalGap + panelRect.height > window.innerHeight - viewportPadding;
  const top = overflowsBottom && canOpenUpward
    ? Math.max(viewportPadding, Math.round(buttonRect.top - verticalGap - panelRect.height))
    : Math.min(
        Math.max(viewportPadding, Math.round(buttonRect.bottom + verticalGap)),
        Math.max(viewportPadding, window.innerHeight - viewportPadding - panelRect.height)
      );

  conversationShellMenuEl.style.setProperty("left", `${Math.round(clampedLeft)}px`);
  conversationShellMenuEl.style.setProperty("top", `${Math.round(top)}px`);
}

function scheduleConversationShellMenuLayoutSync() {
  if (conversationShellMenuLayoutFrame) {
    window.cancelAnimationFrame(conversationShellMenuLayoutFrame);
  }

  conversationShellMenuLayoutFrame = window.requestAnimationFrame(() => {
    conversationShellMenuLayoutFrame = 0;
    syncConversationShellMenuLayout();
  });
}

function syncScreenSourceHeaderMenuLayout() {
  if (!screenSourceHeaderMenuEl || !screenSourceHeaderPanelEl) {
    return;
  }

  if (!screenSourceHeaderMenuEl.hasAttribute("open")) {
    screenSourceHeaderPanelEl.classList.add("is-hidden");
    screenSourceHeaderPanelEl.style.removeProperty("left");
    screenSourceHeaderPanelEl.style.removeProperty("top");
    screenSourceHeaderPanelEl.style.removeProperty("max-width");
    screenSourceHeaderPanelEl.style.removeProperty("max-height");
    return;
  }

  screenSourceHeaderPanelEl.classList.remove("is-hidden");

  const viewportPadding = 12;
  const verticalGap = 10;
  const maxWidth = Math.max(260, window.innerWidth - viewportPadding * 2);
  const maxHeight = Math.max(220, window.innerHeight - viewportPadding * 2);

  screenSourceHeaderPanelEl.style.setProperty("max-width", `${maxWidth}px`);
  screenSourceHeaderPanelEl.style.setProperty("max-height", `${maxHeight}px`);
  screenSourceHeaderPanelEl.style.setProperty("left", "0px");
  screenSourceHeaderPanelEl.style.setProperty("top", "0px");

  const anchorRect = screenSourceHeaderMenuEl.getBoundingClientRect();
  const panelRect = screenSourceHeaderPanelEl.getBoundingClientRect();
  const clampedLeft = Math.min(
    Math.max(viewportPadding, anchorRect.left),
    Math.max(viewportPadding, window.innerWidth - viewportPadding - panelRect.width)
  );
  const canOpenUpward = anchorRect.top - verticalGap - panelRect.height >= viewportPadding;
  const overflowsBottom = anchorRect.bottom + verticalGap + panelRect.height > window.innerHeight - viewportPadding;
  const top = overflowsBottom && canOpenUpward
    ? Math.max(viewportPadding, Math.round(anchorRect.top - verticalGap - panelRect.height))
    : Math.min(
        Math.max(viewportPadding, Math.round(anchorRect.bottom + verticalGap)),
        Math.max(viewportPadding, window.innerHeight - viewportPadding - panelRect.height)
      );

  screenSourceHeaderPanelEl.style.setProperty("left", `${Math.round(clampedLeft)}px`);
  screenSourceHeaderPanelEl.style.setProperty("top", `${Math.round(top)}px`);
}

function scheduleScreenSourceHeaderMenuLayoutSync() {
  if (screenSourceHeaderMenuLayoutFrame) {
    window.cancelAnimationFrame(screenSourceHeaderMenuLayoutFrame);
  }

  screenSourceHeaderMenuLayoutFrame = window.requestAnimationFrame(() => {
    screenSourceHeaderMenuLayoutFrame = 0;
    syncScreenSourceHeaderMenuLayout();
  });
}

function syncRightPanelWindowControlsLayout() {
  if (!rightPanelWindowControlsEl || !rightPanelWindowStripEl) {
    return;
  }

  const overflowThreshold = 4;
  const hasWidth = rightPanelWindowControlsEl.clientWidth > 0;
  const hasScreenSourceSlot = Boolean(screenSourceHeaderSlotEl && !screenSourceHeaderSlotEl.classList.contains("is-hidden"));

  conversationHeaderToplineEl?.classList.remove("is-compact", "is-tight");
  rightPanelWindowControlsEl.classList.remove("is-compact", "is-tight");
  rightPanelWindowStripEl.classList.remove("is-compact", "is-tight");

  if (!hasWidth) {
    scheduleRightPanelWindowSliderSync();
    return;
  }

  const isOverflowing = () => rightPanelWindowControlsEl.scrollWidth > rightPanelWindowControlsEl.clientWidth + overflowThreshold;
  if (hasScreenSourceSlot && isOverflowing()) {
    conversationHeaderToplineEl?.classList.add("is-compact");
    rightPanelWindowControlsEl.classList.add("is-compact");
    rightPanelWindowStripEl.classList.add("is-compact");
  }

  if (hasScreenSourceSlot && isOverflowing()) {
    conversationHeaderToplineEl?.classList.add("is-tight");
    rightPanelWindowControlsEl.classList.add("is-tight");
    rightPanelWindowStripEl.classList.add("is-tight");
  }

  scheduleRightPanelWindowSliderSync();
}

function syncScreenSourceToolbarLayout() {
  syncRightPanelWindowControlsLayout();

  if (!screenSourceToolbarEl || !screenSourceInlineActionsEl || !screenSourceOverflowMenuEl) {
    return;
  }

  screenSourceToolbarEl.classList.remove("is-compact");
  const needsCompact = screenSourceToolbarEl.scrollWidth > screenSourceToolbarEl.clientWidth + 4;
  screenSourceToolbarEl.classList.toggle("is-compact", needsCompact);
  if (!needsCompact) {
    closeScreenSourceOverflowMenu();
  }
  scheduleScreenSourceHeaderMenuLayoutSync();
}

function scheduleScreenSourceToolbarLayoutSync() {
  if (screenSourceToolbarSyncFrame) {
    window.cancelAnimationFrame(screenSourceToolbarSyncFrame);
  }

  screenSourceToolbarSyncFrame = window.requestAnimationFrame(() => {
    screenSourceToolbarSyncFrame = 0;
    syncScreenSourceToolbarLayout();
  });
}

function closeScreenSourceTargetMenu() {
  screenSourceSelectMenuEl?.removeAttribute("open");
}

function updateScreenSourceSelection(nextSourceId = "") {
  state.screenSource.selectedSourceId = String(nextSourceId || "").trim();
  const selected = state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId) || null;
  state.screenSource.selectedSourceLabel = selected?.label || selected?.name || "";

  if (!state.screenSource.selectedSourceId) {
    state.screenSource.statusText = "未选择映射目标";
    renderScreenSourceState();
    return;
  }

  if (!hasActiveScreenSourceProjection()) {
    state.screenSource.statusText = `已选择 ${state.screenSource.selectedSourceLabel || "映射目标"}`;
  }

  renderScreenSourceState();
}

function renderScreenSourceState() {
  const selectedSource =
    state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId) || null;
  const selectedPolicy = getScreenSourceEmbedPolicy(selectedSource?.id || state.screenSource.selectedSourceId);
  const hasEmbeddedWindow = isEmbeddedScreenSourceActive();
  const hasStream = Boolean(state.screenSource.stream);
  const hasActiveProjection = hasEmbeddedWindow || hasStream;
  const renderMode = normalizeScreenSourceRenderMode(state.screenSource.renderMode);
  const canEmbedWindow = canUseSelectedEmbeddedScreenSourceMode();

  if (screenSourceStatusPillEl) {
    screenSourceStatusPillEl.textContent = state.screenSource.statusText || (hasActiveProjection ? "映射中" : "未启动");
  }
  if (screenSourceEmptyEl) {
    screenSourceEmptyEl.classList.toggle("is-hidden", hasActiveProjection);
    if (screenSourceEmptyTitleEl) {
      screenSourceEmptyTitleEl.textContent = canEmbedWindow ? "等待嵌入" : "等待映射";
    }
    if (screenSourceEmptyTextEl) {
      screenSourceEmptyTextEl.textContent = selectedSource
        ? "选择目标后点击开始嵌入。"
        : "打开映射控制，选择映射目标。";
    }
  }
  if (screenSourcePreviewShellEl) {
    screenSourcePreviewShellEl.classList.toggle("is-native-embedded", hasEmbeddedWindow);
  }
  if (screenSourceShellWrapEl) {
    screenSourceShellWrapEl.classList.toggle("is-native-embedded", hasEmbeddedWindow);
    screenSourceShellWrapEl.classList.toggle("has-active-projection", hasActiveProjection);
  }
  if (screenSourceVideoEl) {
    screenSourceVideoEl.classList.toggle("is-hidden", hasEmbeddedWindow);
  }
  setScreenSourceActionButtonsState("refresh", {
    disabled: Boolean(state.screenSource.startPromise),
    text: "刷新目标",
  });
  const shouldShowRefreshEmbedButton = Boolean(selectedSource && hasActiveProjection);
  setScreenSourceActionButtonsState("refreshEmbed", {
    disabled: Boolean(state.screenSource.startPromise) || !shouldShowRefreshEmbedButton,
    text: "刷新嵌入",
  });
  if (screenSourceRefreshEmbedBtn) {
    screenSourceRefreshEmbedBtn.hidden = !shouldShowRefreshEmbedButton;
  }
  setScreenSourceActionButtonsState("embedToggle", {
    disabled: Boolean(state.screenSource.startPromise) || (!selectedSource && !hasActiveProjection),
    text: hasActiveProjection ? "关闭嵌入" : "开始嵌入",
  });
  if (screenSourceSelectEl) {
    const sources = Array.isArray(state.screenSource.availableSources) ? state.screenSource.availableSources : [];
    const disabled = !sources.length || Boolean(state.screenSource.startPromise);
    screenSourceSelectEl.value = state.screenSource.selectedSourceId || "";
    screenSourceSelectEl.disabled = disabled;
    if (screenSourceSelectCurrentEl) {
      screenSourceSelectCurrentEl.textContent = selectedSource?.label || selectedSource?.name || "暂无可用 AI 镜像目标";
    }
    if (screenSourceSelectMenuEl) {
      screenSourceSelectMenuEl.classList.toggle("is-disabled", disabled);
      if (disabled) {
        closeScreenSourceTargetMenu();
      }
    }
    if (screenSourceSelectTriggerEl) {
      screenSourceSelectTriggerEl.setAttribute("aria-disabled", String(disabled));
    }
    if (screenSourceSelectPanelEl) {
      screenSourceSelectPanelEl.innerHTML = sources.length
        ? sources
            .map((source) => {
              const isActive = source.id === state.screenSource.selectedSourceId;
              return `
                <button
                  type="button"
                  class="canvas2d-engine-menu-item canvas2d-engine-menu-item-primary screen-source-select-option${isActive ? " is-active" : ""}"
                  data-screen-source-option="${escapeHtml(source.id)}"
                  role="option"
                  aria-selected="${isActive ? "true" : "false"}"
                >
                  <span class="screen-source-select-option-copy">
                    <span class="screen-source-select-option-title">${escapeHtml(source.label || source.name || source.id)}</span>
                    <span class="canvas2d-engine-menu-meta">${escapeHtml(source.note || "AI 镜像目标")}</span>
                  </span>
                  <span class="screen-source-select-option-check" aria-hidden="true">${isActive ? "✓" : ""}</span>
                </button>
              `;
            })
            .join("")
        : `
          <div class="canvas2d-engine-menu-item is-disabled screen-source-select-option-empty">
            <span>暂无可用 AI 镜像目标</span>
          </div>
        `;
    }
  }
  if (screenSourceFitModeSelectEl) {
    screenSourceFitModeSelectEl.value = selectedPolicy.fitMode;
    screenSourceFitModeSelectEl.disabled =
      !selectedSource ||
      renderMode !== "win32" ||
      !canUseWin32EmbeddedScreenSource() ||
      Boolean(state.screenSource.startPromise);
  }
  if (screenSourceRenderModeSelectEl) {
    screenSourceRenderModeSelectEl.value = renderMode;
    screenSourceRenderModeSelectEl.disabled =
      Boolean(state.screenSource.startPromise) ||
      (!canUseWin32EmbeddedScreenSource() && !canUseWebContentsViewScreenSource());
  }
  scheduleScreenSourceToolbarLayoutSync();
}

function syncScreenSourceVideo() {
  if (!screenSourceVideoEl) return;
  const stream = isEmbeddedScreenSourceActive() ? null : state.screenSource.stream || null;
  if (screenSourceVideoEl.srcObject !== stream) {
    screenSourceVideoEl.srcObject = stream;
  }
  if (stream) {
    screenSourceVideoEl.play().catch(() => {});
  }
  renderScreenSourceState();
}

function getScreenSourcePreviewBounds() {
  if (!screenSourcePreviewShellEl) {
    return { x: 0, y: 0, width: 640, height: 360 };
  }

  const rect = screenSourcePreviewShellEl.getBoundingClientRect();
  const embeddedInset = isEmbeddedScreenSourceActive() ? 14 : 0;
  const safeInset = Math.max(
    0,
    Math.min(
      embeddedInset,
      Math.floor(Math.max(0, rect.width - 2) / 2),
      Math.floor(Math.max(0, rect.height - 2) / 2)
    )
  );
  return {
    x: Math.max(0, Math.floor(rect.left + safeInset)),
    y: Math.max(0, Math.floor(rect.top + safeInset)),
    width: Math.max(1, Math.ceil(rect.width - safeInset * 2)),
    height: Math.max(1, Math.ceil(rect.height - safeInset * 2)),
  };
}

function waitForScreenSourceLayoutStability() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

function getCurrentScreenSourceEmbedLayout(sourceId = "") {
  const policySourceId =
    String(state.screenSource.activeTargetId || state.screenSource.selectedSourceId || sourceId || "").trim();
  const source =
    state.screenSource.availableSources.find((item) => item.id === policySourceId) ||
    state.screenSource.availableSources.find((item) => item.id === sourceId) ||
    null;
  const policy = getScreenSourceEmbedPolicy(source?.id || policySourceId);

  return {
    fitMode: policy.fitMode,
  };
}

async function syncEmbeddedScreenSourceBounds() {
  if (
    !isEmbeddedScreenSourceActive() ||
    state.activeRightPanelView !== "screen" ||
    !IS_DESKTOP_APP ||
    state.desktopShellState.fullClickThrough
  ) {
    return;
  }

  const syncPayload = {
    bounds: getScreenSourcePreviewBounds(),
    layout: getCurrentScreenSourceEmbedLayout(state.screenSource.activeTargetId || state.screenSource.embeddedSourceId),
  };
  const response = isWin32EmbeddedScreenSourceActive()
    ? await DESKTOP_SHELL.syncExternalWindowBounds(syncPayload)
    : await DESKTOP_SHELL.syncAiMirrorWebContentsViewBounds(syncPayload);
  if (!response?.ok) {
    throw new Error(response?.error || "同步嵌入窗口位置失败");
  }
}

async function focusEmbeddedScreenSourceWindow() {
  if (
    !IS_DESKTOP_APP ||
    !isEmbeddedScreenSourceActive() ||
    state.desktopShellState.fullClickThrough ||
    embeddedWindowOverlayHidden
  ) {
    return;
  }

  try {
    if (isWin32EmbeddedScreenSourceActive() && typeof DESKTOP_SHELL?.focusEmbeddedWindow === "function") {
      await DESKTOP_SHELL.focusEmbeddedWindow({
        sourceId: state.screenSource.embeddedSourceId,
        activeTargetId: state.screenSource.activeTargetId,
      });
    } else if (
      isWebContentsViewScreenSourceActive() &&
      typeof DESKTOP_SHELL?.focusAiMirrorWebContentsView === "function"
    ) {
      await DESKTOP_SHELL.focusAiMirrorWebContentsView();
    }
  } catch {
    // Ignore focus restoration failures; the embedded window can still work if the native shell rejects it.
  }
}

function scheduleEmbeddedScreenSourceSync() {
  if (
    !isEmbeddedScreenSourceActive() ||
    state.activeRightPanelView !== "screen" ||
    state.desktopShellState.fullClickThrough ||
    embeddedWindowOverlayHidden
  ) {
    return;
  }

  if (screenSourceEmbedSyncFrame) {
    window.cancelAnimationFrame(screenSourceEmbedSyncFrame);
  }

  screenSourceEmbedSyncFrame = window.requestAnimationFrame(() => {
    screenSourceEmbedSyncFrame = 0;
    syncEmbeddedScreenSourceBounds()
      .then(() => focusEmbeddedScreenSourceWindow())
      .catch(() => {});
  });
}

async function stopScreenSourceCapture({ announce = true, statusText = "画面映射已停止" } = {}) {
  const stream = state.screenSource.stream;
  const activeTargetId = String(state.screenSource.activeTargetId || state.screenSource.selectedSourceId || "").trim();
  if (stream) {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Ignore track shutdown failures.
      }
    }
  }

  if (isWin32EmbeddedScreenSourceActive() && IS_DESKTOP_APP && typeof DESKTOP_SHELL?.clearExternalWindow === "function") {
    try {
      await DESKTOP_SHELL.clearExternalWindow({ restoreVisible: false });
    } catch {
      // Keep renderer state consistent even if native cleanup fails.
    }
  } else if (
    isWebContentsViewScreenSourceActive() &&
    IS_DESKTOP_APP &&
    typeof DESKTOP_SHELL?.clearAiMirrorWebContentsView === "function"
  ) {
    try {
      await DESKTOP_SHELL.clearAiMirrorWebContentsView();
    } catch {
      // Keep renderer state consistent even if native cleanup fails.
    }
  }

  if (activeTargetId && state.screenSource.activeMode === "embedded-win32") {
    try {
      await stopAiMirrorTarget(activeTargetId);
    } catch {
      // Ignore managed target shutdown failures during cleanup.
    }
  }

  state.screenSource.stream = null;
  state.screenSource.startPromise = null;
  state.screenSource.activeMode = "";
  state.screenSource.activeTargetId = "";
  state.screenSource.embeddedSourceId = "";
  state.screenSource.embeddedSourceLabel = "";
  embeddedWindowOverlayHidden = false;
  state.screenSource.statusText = statusText;
  if (screenSourceVideoEl && screenSourceVideoEl.srcObject) {
    screenSourceVideoEl.srcObject = null;
  }
  renderScreenSourceState();
  if (announce) {
    setStatus(statusText, "success");
  }
}

function normalizeScreenSourceEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((source) => ({
      id: String(source?.id || "").trim(),
      name: String(source?.name || "").trim(),
      kind: String(source?.kind || "").trim() === "window" ? "window" : "screen",
      displayId: String(source?.displayId || "").trim(),
      label: String(source?.label || "").trim(),
      note: String(source?.note || "").trim(),
    }))
    .filter((source) => source.id && source.name);
}

async function refreshScreenSourceTargets({ preserveSelection = true } = {}) {
  if (!IS_DESKTOP_APP || typeof DESKTOP_SHELL?.listAiMirrorTargets !== "function") {
    state.screenSource.availableSources = [];
    state.screenSource.selectedSourceId = "";
    state.screenSource.selectedSourceLabel = "";
    state.screenSource.statusText = "当前环境不支持 AI 镜像目标";
    renderScreenSourceState();
    return [];
  }

  const sources = normalizeScreenSourceEntries(await listAiMirrorTargets());
  const previousId = preserveSelection ? state.screenSource.selectedSourceId : "";
  const nextSelected = sources.find((source) => source.id === previousId) || sources[0] || null;

  state.screenSource.availableSources = sources;
  state.screenSource.selectedSourceId = nextSelected?.id || "";
  state.screenSource.selectedSourceLabel = nextSelected?.label || nextSelected?.name || "";

  if (!state.screenSource.stream && !isEmbeddedScreenSourceActive()) {
    state.screenSource.statusText = nextSelected ? `已选择 ${state.screenSource.selectedSourceLabel}` : "暂无可用 AI 镜像目标";
  }

  renderScreenSourceState();
  return sources;
}

async function ensureScreenSourceCapture({ force = false } = {}) {
  if (force && (state.screenSource.stream || isEmbeddedScreenSourceActive())) {
    await stopScreenSourceCapture({ announce: false, statusText: "正在重新建立画面映射" });
  }

  if (state.screenSource.stream || isEmbeddedScreenSourceActive()) {
    renderScreenSourceState();
    return state.screenSource.stream || state.screenSource.embeddedSourceId;
  }

  if (state.screenSource.startPromise) {
    return state.screenSource.startPromise;
  }

  if (!navigator.mediaDevices?.getUserMedia && !navigator.mediaDevices?.getDisplayMedia) {
    const message = "当前环境不支持屏幕映射";
    state.screenSource.statusText = message;
    renderScreenSourceState();
    throw new Error(message);
  }

  const initialSource =
    state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId) ||
    state.screenSource.availableSources[0] ||
    null;
  state.screenSource.statusText = initialSource ? `正在准备 ${initialSource.label || initialSource.name}` : "正在准备 AI 镜像";
  renderScreenSourceState();

  state.screenSource.startPromise = (async () => {
    const source =
      state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId) ||
      state.screenSource.availableSources[0] ||
      null;

    const renderMode = normalizeScreenSourceRenderMode(state.screenSource.renderMode);

    if (IS_DESKTOP_APP && renderMode === "webcontentsview" && canUseWebContentsViewScreenSource() && source?.id) {
      await waitForScreenSourceLayoutStability();
      const response = await DESKTOP_SHELL.attachAiMirrorWebContentsView({
        targetId: source.id,
        bounds: getScreenSourcePreviewBounds(),
        layout: getCurrentScreenSourceEmbedLayout(source.id),
      });
      if (!response?.ok) {
        throw new Error(response?.error || "WebContentsView 嵌入失败");
      }

      state.screenSource.stream = null;
      state.screenSource.activeTargetId = source.id;
      state.screenSource.activeMode = "embedded-webcontentsview";
      state.screenSource.embeddedSourceId = String(response?.projection?.sourceId || `webcontentsview:${source.id}`).trim();
      state.screenSource.embeddedSourceLabel = response?.target?.label || source.label || source.name || "";
      state.screenSource.statusText = `已嵌入：${state.screenSource.embeddedSourceLabel || "当前网页"}（WebContentsView）`;
      state.screenSource.startPromise = null;
      syncScreenSourceVideo();
      scheduleEmbeddedScreenSourceSync();
      syncEmbeddedWindowOverlayVisibility();
      focusEmbeddedScreenSourceWindow();
      return {
        mode: "embedded",
        result: response,
      };
    }

    if (
      IS_DESKTOP_APP &&
      renderMode === "win32" &&
      canUseWin32EmbeddedScreenSource() &&
      typeof DESKTOP_SHELL?.prepareAiMirrorTarget === "function" &&
      source?.id
    ) {
      const preparedTarget = await prepareAiMirrorTarget(source.id);
      await waitForScreenSourceLayoutStability();
      const response = await DESKTOP_SHELL.embedExternalWindow({
        sourceId: preparedTarget?.projection?.sourceId,
        bounds: getScreenSourcePreviewBounds(),
        layout: getCurrentScreenSourceEmbedLayout(source.id),
      });
      if (!response?.ok) {
        throw new Error(response?.error || "窗口嵌入失败");
      }

      state.screenSource.stream = null;
      state.screenSource.activeTargetId = source.id;
      state.screenSource.activeMode = "embedded-win32";
      state.screenSource.embeddedSourceId = String(preparedTarget?.projection?.sourceId || "").trim();
      state.screenSource.embeddedSourceLabel = preparedTarget?.target?.label || source.label || source.name || "";
      state.screenSource.statusText = `已嵌入：${state.screenSource.embeddedSourceLabel || "当前窗口"}（Win32）`;
      state.screenSource.startPromise = null;
      syncScreenSourceVideo();
      scheduleEmbeddedScreenSourceSync();
      syncEmbeddedWindowOverlayVisibility();
      focusEmbeddedScreenSourceWindow();
      return {
        mode: "embedded",
        result: response,
      };
    }

    if (IS_DESKTOP_APP && DESKTOP_SHELL?.getCaptureSources && navigator.mediaDevices?.getUserMedia) {
      if (!state.screenSource.availableSources.length || !state.screenSource.selectedSourceId) {
        await refreshScreenSourceTargets();
      }

      const currentSource =
        state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId) ||
        state.screenSource.availableSources[0];
      if (!currentSource?.id) {
        throw new Error("没有可用的映射目标");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: currentSource.id,
            minWidth: 1280,
            maxWidth: 3840,
            minHeight: 720,
            maxHeight: 2160,
            minFrameRate: 8,
            maxFrameRate: 20,
          },
        },
      });
      return {
        mode: "capture",
        stream,
      };
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("当前环境不支持屏幕映射");
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 12, max: 20 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    return {
      mode: "capture",
      stream,
    };
  })()
    .then((result) => {
      if (result?.mode === "embedded") {
        return result.result;
      }

      const stream = result?.stream;
      const videoTrack = stream.getVideoTracks?.()[0];
      if (!videoTrack) {
        throw new Error("没有获取到可用的视频轨道");
      }

      videoTrack.addEventListener(
        "ended",
        () => {
          stopScreenSourceCapture({ announce: false, statusText: "画面映射已结束" });
        },
        { once: true }
      );

      state.screenSource.stream = stream;
      state.screenSource.activeMode = "capture";
      state.screenSource.activeTargetId = state.screenSource.activeTargetId || state.screenSource.selectedSourceId || "";
      state.screenSource.embeddedSourceId = "";
      state.screenSource.embeddedSourceLabel = "";
      const label =
        result?.label ||
        state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId)?.label ||
        state.screenSource.selectedSourceLabel ||
        "当前目标";
      state.screenSource.statusText = `正在实时映射：${label}`;
      state.screenSource.startPromise = null;
      syncScreenSourceVideo();
      return stream;
    })
    .catch((error) => {
      state.screenSource.startPromise = null;
      state.screenSource.statusText = `映射失败：${error.message}`;
      renderScreenSourceState();
      throw error;
    });

  return state.screenSource.startPromise;
}

function renderRightPanelView() {
  const activeView = normalizeRightPanelView(state.activeRightPanelView);
  state.activeRightPanelView = activeView;
  setActiveClipboardZone(activeView === "screen" ? "screen" : "assistant");
  conversationPanel?.classList.toggle("assistant-view-active", activeView === "assistant");
  conversationPanel?.classList.toggle("screen-view-active", activeView === "screen");
  screenSourceHeaderSlotEl?.classList.toggle("is-hidden", activeView !== "screen");
  screenSourcePanelEl?.classList.toggle("is-hidden", activeView !== "screen");
  screenSourcePanelEl?.classList.toggle("is-active", activeView === "screen");
  if (activeView !== "assistant") {
    closeConversationModelMenu();
  }
  if (activeView !== "screen") {
    closeScreenSourceHeaderMenu();
    closeScreenSourceOverflowMenu();
  }
  syncEmbeddedWindowOverlayVisibility();

  for (const tab of rightPanelViewTabEls) {
    const isActive = tab.dataset.rightPanelView === activeView;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }
  scheduleRightPanelWindowSliderSync();

  renderScreenSourceState();
  if (activeView === "screen") {
    waitForScreenSourceLayoutStability().then(() => {
      scheduleEmbeddedScreenSourceSync();
      focusEmbeddedScreenSourceWindow();
    });
  }
  syncComposerOffset();
  scheduleDesktopWindowShapeSync();
}

async function setActiveRightPanelView(view, { persist = true, ensureCapture = false } = {}) {
  state.activeRightPanelView = normalizeRightPanelView(view);
  if (persist) {
    localStorage.setItem(CONFIG.rightPanelViewKey, state.activeRightPanelView);
  }
  renderRightPanelView();

  if (state.activeRightPanelView !== "screen" && (state.screenSource.embeddedSourceId || state.screenSource.stream)) {
    await stopScreenSourceCapture({ announce: false, statusText: "画面映射已停止" });
    return;
  }

  if (state.activeRightPanelView === "screen" && IS_DESKTOP_APP) {
    try {
      await refreshScreenSourceTargets();
    } catch (error) {
      setStatus(`读取映射目标失败：${error.message}`, "warning");
    }
  }

  if (state.activeRightPanelView === "screen" && ensureCapture) {
    try {
      await ensureScreenSourceCapture();
    } catch (error) {
      setStatus(`画面映射启动失败：${error.message}`, "warning");
    }
  }
}

function renderConversationModelMenu() {
  conversationAssistantChrome?.renderModelMenu();
}

function beginConversationAppRename() {
  conversationAssistantChrome?.beginAppRename();
}

function cancelConversationAppRename() {
  conversationAssistantChrome?.cancelAppRename();
}

async function commitConversationAppRename() {
  await conversationAssistantChrome?.commitAppRename();
}

function beginCanvasTitleRename() {
  if (!canvasTitleInputEl || !canvasTitleEl) return;
  canvasTitleRenameInFlight = false;
  canvasTitleInputEl.disabled = false;
  canvasTitleEl.classList.add("is-hidden");
  canvasTitleRenameTriggerEl?.classList.add("is-hidden");
  canvasTitleInputEl.classList.remove("is-hidden");
  canvasTitleInputEl.value = getCanvasTitle();
  requestAnimationFrame(() => {
    canvasTitleInputEl.focus();
    canvasTitleInputEl.select();
  });
}

function cancelCanvasTitleRename() {
  if (!canvasTitleInputEl || !canvasTitleEl) return;
  canvasTitleRenameInFlight = false;
  canvasTitleInputEl.disabled = false;
  canvasTitleInputEl.classList.add("is-hidden");
  canvasTitleRenameTriggerEl?.classList.remove("is-hidden");
  canvasTitleEl.classList.remove("is-hidden");
  canvasTitleInputEl.value = getCanvasTitle();
}

async function commitCanvasTitleRename() {
  if (!canvasTitleInputEl || canvasTitleRenameInFlight) return;
  canvasTitleRenameInFlight = true;
  canvasTitleInputEl.disabled = true;
  const nextTitle = String(canvasTitleInputEl.value || "").trim() || DEFAULT_CANVAS_TITLE;
  try {
    await saveUiSettings({ canvasTitle: nextTitle });
    setStatus("画布标题已更新", "success");
  } catch (error) {
    setStatus(`保存画布标题失败：${error.message}`, "warning");
  } finally {
    cancelCanvasTitleRename();
  }
}

conversationAssistantChrome = createConversationAssistantChrome({
  state,
  elements: {
    conversationAppNameEl,
    conversationAppNameInputEl,
    conversationAppRenameTriggerEl,
    conversationModelGuideBtn,
    conversationModelGuideEl,
    conversationModelGroupsEl,
    conversationModelMenuEl,
    conversationSettingsBtn,
    conversationShellClickThroughBtn,
    conversationShellCloseBtn,
    conversationShellFullscreenBtn,
    conversationShellMenuEl,
    conversationShellMoreBtn,
    conversationShellPinBtn,
    conversationShellRefreshBtn,
    conversationShellSwapBtn,
  },
  escapeHtml,
  getModelSource,
  getModelDisplayName,
  getModelSourceLabel,
  getAppDisplayName,
  saveUiSettings,
  saveModelProviderSettings,
  setStatus,
  applyModelSelection,
  refreshAvailableModels,
  syncEmbeddedWindowOverlayVisibility,
  scheduleShellMenuLayout: scheduleConversationShellMenuLayoutSync,
  scheduleWindowShapeSync: scheduleDesktopWindowShapeSync,
  suspendScreenSourceForDrawer,
  suspendScreenSourceForShellMenu,
  setDrawerOpen,
  resumeScreenSourceAfterDrawerClose,
  resumeScreenSourceAfterShellMenuClose,
  swapPanels: swapMainPanels,
  desktopActions: {
    clickThroughBtn: desktopClickThroughBtn,
    closeBtn: desktopCloseBtn,
    fullscreenBtn: desktopFullscreenBtn,
    toggleFullscreen: toggleDesktopFullscreenFromShellMenu,
    pinBtn: desktopPinBtn,
    refreshBtn: desktopRefreshBtn,
  },
});

function applyThemeAppearance() {
  applyThemeCssVariables(document.documentElement, state.uiSettings);
  themeSettingsPanel.update(state.uiSettings);
}

function handleThemeSettingsPreviewChange(overrides = {}) {
  state.uiSettings = normalizeUiSettings({
    ...state.uiSettings,
    ...overrides,
  });
  applyThemeAppearance();
}

async function handleThemeSettingsSave() {
  try {
    await saveThemeSettings();
    setStatus("主题设置已保存", "success");
  } catch (error) {
    setStatus(`保存主题设置失败：${error.message}`, "warning");
  }
}

function handleThemeSettingsReset() {
  state.uiSettings = normalizeUiSettings({
    ...state.uiSettings,
    ...DEFAULT_THEME_SETTINGS,
    themePreset: DEFAULT_THEME_SETTINGS.themePreset,
  });
  writeUiSettingsCache(state.uiSettings);
  applyThemeAppearance();
  setStatus("已恢复默认主题", "success");
}

function applyUiSettings() {
  state.uiSettings = normalizeUiSettings(state.uiSettings);
  const appName = getAppDisplayName();
  const appSubtitle = getAppSubtitle();
  const canvasTitle = getCanvasTitle();

  document.title = appName;
  if (brandNameEl) {
    brandNameEl.textContent = appName;
  }
  if (brandSubtitleEl) {
    brandSubtitleEl.textContent = appSubtitle;
  }
  if (conversationAppNameEl) {
    conversationAppNameEl.textContent = appName;
  }
  if (conversationAppNameInputEl) {
    conversationAppNameInputEl.value = appName;
  }
  if (appNameInput) {
    appNameInput.value = appName;
  }
  if (drawerAppNameInputEl) {
    drawerAppNameInputEl.value = appName;
  }
  if (appSubtitleInput) {
    appSubtitleInput.value = appSubtitle;
  }
  if (drawerAppSubtitleInputEl) {
    drawerAppSubtitleInputEl.value = appSubtitle;
  }
  if (canvasBoardPathInputEl) {
    canvasBoardPathInputEl.value = getCanvasBoardSavePath();
  }
  if (drawerCanvasBoardPathInputEl) {
    drawerCanvasBoardPathInputEl.value = getCanvasBoardSavePath();
  }
  if (canvasImagePathInputEl) {
    canvasImagePathInputEl.value = getCanvasImageSavePath();
  }
  if (drawerCanvasImagePathInputEl) {
    drawerCanvasImagePathInputEl.value = getCanvasImageSavePath();
  }
  renderWorkbenchHabitSettings();
  syncCanvasPathActionButtons(getCanvasBoardSavePath());
  syncCanvasImagePathActionButtons(getCanvasImageSavePath());
  emitCanvasBoardPathChanged(getCanvasBoardSavePath());
  if (canvasTitleEl) {
    canvasTitleEl.textContent = canvasTitle;
  }
  if (canvasTitleInputEl) {
    canvasTitleInputEl.value = canvasTitle;
  }
  if (customizeSummaryEl) {
    customizeSummaryEl.textContent = `${truncate(appName, 18)} · ${truncate(appSubtitle, 22)}`;
  }
  if (conversationModelLabelEl && state.model) {
    conversationModelLabelEl.textContent = getModelDisplayName(state.model);
  }

  applyThemeAppearance();

  updatePromptPlaceholder();
  renderCurrentSessionHeader();
  if (state.sessions.length || state.currentSessionId) {
    renderCurrentSession();
  }
}

function normalizeClipboardStore(payload = {}) {
  const maxItems = Math.min(Math.max(Number(payload?.maxItems) || CONFIG.clipboardMaxItems, 5), 100);
  const items = Array.isArray(payload?.items) ? payload.items : [];

  return {
    mode: payload?.mode === "auto" ? "auto" : "manual",
    maxItems,
    items: items
      .map((item) => ({
        id: String(item?.id || ""),
        content: String(item?.content || ""),
        source: item?.source === "auto" ? "auto" : "manual",
        createdAt: Number(item?.createdAt) || Date.now(),
      }))
      .filter((item) => item.id && item.content.trim())
      .slice(0, maxItems),
  };
}

function readUiSettingsCache() {
  try {
    const raw = localStorage.getItem(CONFIG.uiSettingsCacheKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function loadStartupContext() {
  if (startupContextPromise) {
    return startupContextPromise;
  }
  startupContextPromise = (async () => {
    if (!DESKTOP_SHELL?.getStartupContext) {
      return null;
    }
    const context = await DESKTOP_SHELL.getStartupContext().catch(() => null);
    if (context?.ok) {
      globalThis.__FREEFLOW_STARTUP_CONTEXT = context;
      return context;
    }
    return null;
  })();
  return startupContextPromise;
}

function getStartupContext() {
  const context = globalThis.__FREEFLOW_STARTUP_CONTEXT;
  return context && typeof context === "object" && context.ok ? context : null;
}

function writeUiSettingsCache(payload = {}) {
  try {
    localStorage.setItem(CONFIG.uiSettingsCacheKey, JSON.stringify(normalizeUiSettings(payload)));
  } catch {
    // Ignore local cache failures.
  }
}

function writeStartupContextUiSettings(nextUiSettings = {}) {
  const context = getStartupContext();
  if (!context) {
    return;
  }
  const nextNormalizedUiSettings = normalizeUiSettings({
    ...(context.uiSettings || {}),
    ...nextUiSettings,
  });
  const nextStartup = {
    ...(context.startup || {}),
  };
  if (typeof nextUiSettings.canvasBoardSavePath === "string") {
    nextStartup.boardSavePath = nextNormalizedUiSettings.canvasBoardSavePath;
  }
  if (typeof nextUiSettings.canvasImageSavePath === "string") {
    nextStartup.canvasImageSavePath = nextNormalizedUiSettings.canvasImageSavePath;
  }
  if (typeof nextUiSettings.canvasLastOpenedBoardPath === "string") {
    nextStartup.lastOpenedBoardPath = nextNormalizedUiSettings.canvasLastOpenedBoardPath;
    nextStartup.initialBoardPath = nextNormalizedUiSettings.canvasLastOpenedBoardPath;
  }
  globalThis.__FREEFLOW_STARTUP_CONTEXT = {
    ...context,
    uiSettings: nextNormalizedUiSettings,
    workbenchPreferences: pickWorkbenchPreferences(nextNormalizedUiSettings),
    startup: nextStartup,
  };
}

function getStartupTutorialIntroVersion() {
  return String(CONFIG.startupTutorialIntroVersion || "").trim();
}

function shouldAutoShowStartupTutorialIntro() {
  const introVersion = getStartupTutorialIntroVersion();
  if (!introVersion) {
    return false;
  }
  const startup = getStartupContext()?.startup || {};
  const shouldOpenStartupTutorial = Boolean(startup?.shouldOpenStartupTutorial);
  const hasShownStartupTutorial = Boolean(state.uiSettings?.hasShownStartupTutorial);
  const lastIntroVersion = String(state.uiSettings?.lastTutorialIntroVersion || "").trim();
  const dismissedIntroVersion = String(state.uiSettings?.dismissedTutorialIntroVersion || "").trim();

  if (dismissedIntroVersion === introVersion) {
    return false;
  }
  if (shouldOpenStartupTutorial) {
    return true;
  }
  if (!hasShownStartupTutorial) {
    return true;
  }
  return lastIntroVersion !== introVersion;
}

async function persistStartupTutorialIntroSettings(overrides = {}) {
  const persistSeq = ++startupTutorialIntroPersistSeq;
  const introVersion = getStartupTutorialIntroVersion();
  const payload = buildUiSettingsPayload({
    hasShownStartupTutorial: true,
    lastTutorialIntroVersion: overrides.lastTutorialIntroVersion ?? introVersion,
    dismissedTutorialIntroVersion:
      overrides.dismissedTutorialIntroVersion ?? state.uiSettings?.dismissedTutorialIntroVersion ?? "",
  });
  writeUiSettingsCache(payload);

  try {
    const response = await fetch(API_ROUTES.uiSettings, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await readJsonResponse(response, "界面设置");
    if (!response.ok || !data.ok) {
      throw new Error(data.details || data.error || "保存界面设置失败");
    }
    if (persistSeq !== startupTutorialIntroPersistSeq) {
      return;
    }
    state.uiSettings = normalizeUiSettings({
      ...payload,
      ...data,
    });
    writeUiSettingsCache(state.uiSettings);
    applyUiSettings();
  } catch {
    if (persistSeq !== startupTutorialIntroPersistSeq) {
      return;
    }
    state.uiSettings = normalizeUiSettings(payload);
    writeUiSettingsCache(state.uiSettings);
  }
}

function syncCanvasLastOpenedBoardPathState(nextPath) {
  const cleanPath = normalizeCanvasLastOpenedBoardPathValue(nextPath);
  if (!cleanPath || cleanPath === getCanvasLastOpenedBoardPath()) {
    return;
  }
  state.uiSettings = normalizeUiSettings({
    ...state.uiSettings,
    canvasLastOpenedBoardPath: cleanPath,
  });
  writeUiSettingsCache(state.uiSettings);
  writeStartupContextUiSettings({
    canvasLastOpenedBoardPath: cleanPath,
  });
}

function renderClipboardStore() {
  if (clipboardModeSelect) {
    clipboardModeSelect.value = state.clipboardStore.mode;
  }

  if (clipboardCountEl) {
    clipboardCountEl.textContent = `${state.clipboardStore.items.length} 条内容`;
  }
  if (clipboardSummaryEl) {
    const latest = state.clipboardStore.items[0]?.content?.replace(/\s+/g, " ").trim() || "";
    clipboardSummaryEl.textContent = latest
      ? `${state.clipboardStore.mode === "auto" ? "自动" : "手动"} · ${truncate(latest, 24)}`
      : state.clipboardStore.mode === "auto"
        ? "自动监测剪贴板"
        : "点击手动入队保存内容";
  }

  if (clipboardStatusPillEl) {
    const modeLabel = state.clipboardStore.mode === "auto" ? "自动队列中" : "手动存储模式";
    clipboardStatusPillEl.textContent = modeLabel;
  }

  if (!clipboardListEl) return;

  if (!state.clipboardStore.items.length) {
    clipboardListEl.innerHTML = `
      <div class="clipboard-empty">
        <strong>暂无剪贴板内容</strong>
        <span>${state.clipboardStore.mode === "auto" ? "自动模式会在复制新内容后入队" : "点击“手动入队”保存当前剪贴板"}</span>
      </div>
    `;
    return;
  }

  clipboardListEl.innerHTML = state.clipboardStore.items
    .map(
      (item) => `
        <article class="clipboard-item" data-clipboard-id="${escapeHtml(item.id)}">
          <div class="clipboard-item-meta">
            <span class="pill-note">${item.source === "auto" ? "自动" : "手动"}</span>
            <span>${formatTime(item.createdAt)}</span>
          </div>
          <div class="clipboard-item-content">${escapeHtml(truncate(item.content.replace(/\s+/g, " ").trim(), 180))}</div>
          <div class="clipboard-item-actions">
            <button class="ghost-btn compact-btn" type="button" data-clipboard-copy="${escapeHtml(item.id)}">复制</button>
            <button class="ghost-btn compact-btn" type="button" data-clipboard-remove="${escapeHtml(item.id)}">删除</button>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadClipboardStore() {
  try {
    const response = await fetch("/api/clipboard-store");
    const data = await readJsonResponse(response, "剪贴板队列");

    if (!response.ok || !data.ok) {
      throw new Error(data.details || data.error || "无法读取剪贴板队列");
    }

    state.clipboardStore = normalizeClipboardStore(data);
  } catch (error) {
    state.clipboardStore = normalizeClipboardStore();
    setStatus(`剪贴板队列读取失败：${error.message}`, "warning");
  }

  state.lastClipboardText = state.clipboardStore.items[0]?.content || "";
  renderClipboardStore();
}

async function saveClipboardStore() {
  const response = await fetch("/api/clipboard-store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.clipboardStore),
  });
  const data = await readJsonResponse(response, "剪贴板队列");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "无法保存剪贴板队列");
  }

  state.clipboardStore = normalizeClipboardStore(data);
  renderClipboardStore();
}

function readLegacyCanvasBoardFromStorage() {
  try {
    const raw = localStorage.getItem(CONFIG.canvasBoardKey);
    return raw ? normalizeCanvasBoard(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function clearLegacyCanvasBoardStorage() {
  try {
    localStorage.removeItem(CONFIG.canvasBoardKey);
  } catch {
    // Ignore legacy cleanup failures.
  }
}

function hasCanvasBoardContent(board = state.canvasBoard) {
  const view = board?.view || {};
  return Boolean(
    (Array.isArray(board?.items) && board.items.length) ||
      (Array.isArray(board?.selectedIds) && board.selectedIds.length) ||
      Number(view.scale) !== CONFIG.canvasDefaultScale ||
      Number(view.offsetX) !== CONFIG.canvasDefaultOffsetX ||
      Number(view.offsetY) !== CONFIG.canvasDefaultOffsetY
  );
}

function applyCanvasBoardStorageInfo(data) {
  state.canvasBoardStorageInfo = {
    file: data.file || state.canvasBoardStorageInfo.file,
    fileSizeBytes: Number(data.fileSizeBytes) || 0,
    updatedAt: data.updatedAt ? Number(data.updatedAt) : state.canvasBoardStorageInfo.updatedAt,
  };
}

function getCanvasBoardSavePath() {
  return String(state.uiSettings?.canvasBoardSavePath || "").trim();
}

function getCanvasLastOpenedBoardPath() {
  return String(state.uiSettings?.canvasLastOpenedBoardPath || "").trim();
}

function getCanvasImageSavePath() {
  return String(state.uiSettings?.canvasImageSavePath || "").trim();
}

function normalizeCanvasBoardSavePathValue(value = "") {
  const clean = String(value || "").trim();
  if (!clean) {
    return "";
  }
  const trimmed = clean.replace(/[\\/]+$/, "");
  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  const last = segments[segments.length - 1] || "";
  if (last.toLowerCase().endsWith(".json")) {
    return segments.slice(0, -1).join(clean.includes("\\") ? "\\" : "/");
  }
  return trimmed;
}

function normalizeCanvasLastOpenedBoardPathValue(value = "") {
  return String(value || "").trim().replace(/[\\/]+$/, "");
}

function normalizeCanvasImageSavePathValue(value = "") {
  const clean = String(value || "").trim();
  if (!clean) {
    return "";
  }
  return clean.replace(/[\\/]+$/, "");
}

function emitCanvasBoardPathChanged(pathValue = getCanvasBoardSavePath()) {
  const cleanPath = String(pathValue || "").trim();
  if (!cleanPath) return;
  window.dispatchEvent(
    new CustomEvent("canvas-board-path-changed", {
      detail: { canvasBoardSavePath: cleanPath },
    })
  );
}

function syncCanvasPathActionButtons(pathValue = getCanvasBoardSavePath()) {
  const hasPath = Boolean(String(pathValue || "").trim());
  if (canvasBoardPathBrowseBtn) {
    canvasBoardPathBrowseBtn.disabled = !DESKTOP_SHELL?.pickCanvasBoardPath;
  }
  if (drawerCanvasBoardPathBrowseBtn) {
    drawerCanvasBoardPathBrowseBtn.disabled = !DESKTOP_SHELL?.pickCanvasBoardPath;
  }
  if (canvasBoardPathOpenBtn) {
    canvasBoardPathOpenBtn.disabled = !DESKTOP_SHELL?.revealPath || !hasPath;
  }
  if (drawerCanvasBoardPathOpenBtn) {
    drawerCanvasBoardPathOpenBtn.disabled = !DESKTOP_SHELL?.revealPath || !hasPath;
  }
}

function syncCanvasImagePathActionButtons(pathValue = getCanvasImageSavePath()) {
  const hasPath = Boolean(String(pathValue || "").trim());
  if (canvasImagePathBrowseBtn) {
    canvasImagePathBrowseBtn.disabled = !DESKTOP_SHELL?.pickDirectory;
  }
  if (drawerCanvasImagePathBrowseBtn) {
    drawerCanvasImagePathBrowseBtn.disabled = !DESKTOP_SHELL?.pickDirectory;
  }
  if (canvasImagePathOpenBtn) {
    canvasImagePathOpenBtn.disabled = !DESKTOP_SHELL?.revealPath || !hasPath;
  }
  if (drawerCanvasImagePathOpenBtn) {
    drawerCanvasImagePathOpenBtn.disabled = !DESKTOP_SHELL?.revealPath || !hasPath;
  }
}

async function loadCanvasBoard() {
  return canvasProjectFile.load();
}

function queueCanvasBoardPersist(immediate = false) {
  return canvasProjectFile.save(state.canvasBoard, immediate);
}

function saveCanvasBoardToStorage() {
  return canvasProjectFile.save(state.canvasBoard);
}

async function loadCanvasBoardFromStorage() {
  const startupInitialBoardPath = String(getStartupContext()?.startup?.initialBoardPath || "").trim();
  if (!startupInitialBoardPath || !DESKTOP_SHELL?.readFile) {
    await canvasProjectFile.load();
    return;
  }

  try {
    const readResult = await DESKTOP_SHELL.readFile(startupInitialBoardPath);
    if (!readResult?.ok) {
      throw new Error(readResult?.error || "无法读取启动画布");
    }
    const parsed = JSON.parse(readResult.text || "{}");
    state.canvasBoard = normalizeCanvasBoard(parsed);
    applyCanvasBoardStorageInfo({
      file: startupInitialBoardPath,
      fileSizeBytes: new Blob([readResult.text || ""]).size,
      updatedAt: Date.now(),
    });
  } catch (error) {
    setStatus(`启动画布读取失败，已回退到默认路径：${error.message}`, "warning");
    await canvasProjectFile.load();
  }
}

function setCanvasStatus(text) {
  if (canvasStatusPillEl) canvasStatusPillEl.textContent = text;
}

function getCanvasScalePercent(scale = state.canvasBoard.view.scale) {
  return Math.round(clampCanvasScale(scale) * 100);
}

function setCanvasScaleContinuous(nextScale, { persist = true, status = true } = {}) {
  canvasCanvas.setScaleContinuous(nextScale, { persist, status });
}

function focusNearestCanvasItem() {
  canvasCanvas.focusNearestItem();
}

function getCanvasItemsByIds(itemIds = []) {
  if (!Array.isArray(itemIds) || !itemIds.length) {
    return [];
  }
  return state.canvasBoard.items.filter((item) => itemIds.includes(item.id));
}

function getSelectedCanvasItems(itemIds = state.canvasBoard.selectedIds) {
  if (Array.isArray(itemIds) && itemIds === state.canvasBoard.selectedIds) {
    return canvasItemManager.getSelectedCanvasItems();
  }
  return getCanvasItemsByIds(itemIds);
}

function buildCanvasSelectionContext(itemIds = state.canvasBoard.selectedIds) {
  const selectedItems = getSelectedCanvasItems(itemIds);
  if (!selectedItems.length) {
    return "";
  }

  return selectedItems
    .map((item, index) => {
      const typeLabel = item.kind === "textbox" ? "文本框" : item.kind;
      const header = `画布元素 ${index + 1}｜${typeLabel}｜${item.title}`;
      if (item.kind === "image") {
        return `${header}\n文件名：${item.fileName || item.title}\n说明：这是画布中选中的图片素材卡。`;
      }
      if (item.kind === "file") {
        return `${header}\n文件名：${item.fileName || item.title}\n类型：${item.isDirectory ? "文件夹" : item.mimeType || "未知"}\n内容摘要：${truncate(
          item.text || "文件已加入画布。",
          1200
        )}`;
      }
      if (item.kind === "textbox") {
        return `${header}\n字号：${item.fontSize || CONFIG.canvasTextBoxDefaultFontSize}\n样式：${
          [item.bold ? "加粗" : "", item.highlighted ? "高光" : ""].filter(Boolean).join(" / ") || "常规"
        }\n内容：${truncate(item.text || "", 1600)}`;
      }
      return `${header}\n内容：${truncate(item.text || "", 1600)}`;
    })
    .join("\n\n");
}

function normalizeComposerAttachments(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: String(item?.id || "").trim(),
      title: String(item?.title || item?.fileName || "").trim() || "未命名文件",
      kind: ["text", "image", "file"].includes(item?.kind) ? item.kind : "file",
    }))
    .filter((item) => item.id && !seen.has(item.id) && seen.add(item.id))
    .slice(0, 12);
}

function renderComposerAttachments() {
  if (!composerAttachmentsEl) return;

  const attachments = normalizeComposerAttachments(state.composerAttachments);
  state.composerAttachments = attachments;
  composerAttachmentsEl.classList.toggle("is-hidden", attachments.length === 0);

  if (!attachments.length) {
    composerAttachmentsEl.innerHTML = "";
    return;
  }

  composerAttachmentsEl.innerHTML = attachments
    .map(
      (item) => `
        <button class="composer-attachment-chip" type="button" draggable="true" data-composer-attachment-id="${escapeHtml(
          item.id
        )}" data-remove-composer-attachment="${escapeHtml(item.id)}">
          <span class="composer-attachment-chip-label">${escapeHtml(item.title)}</span>
          <span class="composer-attachment-chip-remove" aria-hidden="true">×</span>
        </button>
      `
    )
    .join("");
}

function setComposerAttachments(items = []) {
  state.composerAttachments = normalizeComposerAttachments(items);
  renderComposerAttachments();
}

function appendComposerAttachments(items = []) {
  state.composerAttachments = normalizeComposerAttachments([...state.composerAttachments, ...items]);
  renderComposerAttachments();
}

function clearComposerAttachments() {
  state.composerAttachments = [];
  renderComposerAttachments();
}

function buildAttachmentPromptPrefix(attachments = []) {
  const normalized = normalizeComposerAttachments(attachments);
  if (!normalized.length) return "";
  return `已附加文件：\n${normalized.map((item) => `- ${item.title}`).join("\n")}`;
}

function removeCanvasSelectionByIds(itemIds = []) {
  if (!Array.isArray(itemIds) || !itemIds.length) return;
  state.canvasBoard.selectedIds = state.canvasBoard.selectedIds.filter((id) => !itemIds.includes(id));
  renderCanvasBoard();
  saveCanvasBoardToStorage();
}

function buildCanvasTextTitle(text = "") {
  const firstLine =
    String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || "文本框";
  return truncate(firstLine, 24);
}

function isEditableElement(target) {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    Boolean(target?.closest?.('[contenteditable="true"]'))
  );
}

function normalizeAppClipboardItem(item = {}) {
  const kind = ["text", "image", "file", "textbox", "shape"].includes(item?.kind) ? item.kind : "text";
  return {
    id: String(item?.id || crypto.randomUUID()),
    kind,
    title: String(item?.title || item?.fileName || "未命名内容").trim() || "未命名内容",
    text: kind === "textbox" ? sanitizeCanvasTextboxText(item?.text || "") : sanitizeCanvasTextPreview(item?.text || ""),
    filePath: String(item?.filePath || "").trim(),
    fileName: String(item?.fileName || "").trim(),
    mimeType: String(item?.mimeType || "").trim(),
    isDirectory: Boolean(item?.isDirectory),
    fileSize: Number(item?.fileSize) || 0,
    dataUrl: typeof item?.dataUrl === "string" ? item.dataUrl : "",
    width: Math.max(44, Number(item?.width) || 0),
    height: Math.max(44, Number(item?.height) || 0),
    fontSize: normalizeCanvasTextBoxFontSize(item?.fontSize),
    bold: Boolean(item?.bold),
    highlighted: Boolean(item?.highlighted),
    shapeType: String(item?.shapeType || "rect"),
    stroke: String(item?.stroke || ""),
    fill: String(item?.fill || ""),
    strokeWidth: Number(item?.strokeWidth) || 2,
    radius: Number(item?.radius) || 16,
    startX: Number(item?.startX) || 0,
    startY: Number(item?.startY) || 0,
    endX: Number(item?.endX) || 0,
    endY: Number(item?.endY) || 0,
  };
}

function normalizeAppClipboardPayload(payload = {}) {
  return {
    source: ["canvas", "chat"].includes(payload?.source) ? payload.source : "",
    text: String(payload?.text || ""),
    items: (Array.isArray(payload?.items) ? payload.items : []).map((item) => normalizeAppClipboardItem(item)),
    createdAt: Number(payload?.createdAt) || 0,
  };
}

function setAppClipboardPayload(payload = {}) {
  state.appClipboard = normalizeAppClipboardPayload({
    ...payload,
    createdAt: Date.now(),
  });
}

function getActiveAppClipboardPayload() {
  const payload = normalizeAppClipboardPayload(state.appClipboard);
  if (!payload.source || Date.now() - payload.createdAt > APP_CLIPBOARD_TTL_MS) {
    return null;
  }
  return payload;
}

function setActiveClipboardZone(zone = "") {
  activeClipboardZone = ["canvas", "assistant", "screen"].includes(zone) ? zone : "";
}

function setCanvasPointerAnchorPoint(clientX, clientY) {
  if (Number.isFinite(Number(clientX)) && Number.isFinite(Number(clientY))) {
    canvasPointerAnchorPoint = getCanvasPositionFromClientPoint(Number(clientX), Number(clientY));
  }
}

function getCanvasPointerAnchorPoint() {
  return canvasPointerAnchorPoint && Number.isFinite(Number(canvasPointerAnchorPoint.x)) && Number.isFinite(Number(canvasPointerAnchorPoint.y))
    ? { ...canvasPointerAnchorPoint }
    : null;
}

function setCanvasContextMenuAnchorPoint(clientX, clientY) {
  if (Number.isFinite(Number(clientX)) && Number.isFinite(Number(clientY))) {
    canvasContextMenuAnchorPoint = getCanvasPositionFromClientPoint(Number(clientX), Number(clientY));
  }
}

function getCanvasContextMenuAnchorPoint() {
  return canvasContextMenuAnchorPoint && Number.isFinite(Number(canvasContextMenuAnchorPoint.x)) && Number.isFinite(Number(canvasContextMenuAnchorPoint.y))
    ? { ...canvasContextMenuAnchorPoint }
    : getCanvasPointerAnchorPoint();
}

function buildCanvasItemDragPayload(item = {}) {
  return {
    kind: ["text", "image", "file", "textbox", "shape"].includes(item.kind) ? item.kind : "text",
    title: String(item.title || item.fileName || "未命名内容").trim() || "未命名内容",
    text: String(item.text || ""),
    filePath: String(item.filePath || ""),
    fileName: String(item.fileName || ""),
    mimeType: String(item.mimeType || ""),
    isDirectory: Boolean(item.isDirectory),
    fileSize: Number(item.fileSize) || 0,
    dataUrl: typeof item.dataUrl === "string" ? item.dataUrl : "",
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    fontSize: Number(item.fontSize) || CONFIG.canvasTextBoxDefaultFontSize,
    bold: Boolean(item.bold),
    highlighted: Boolean(item.highlighted),
    shapeType: String(item.shapeType || "rect"),
    stroke: String(item.stroke || ""),
    fill: String(item.fill || ""),
    strokeWidth: Number(item.strokeWidth) || 2,
    radius: Number(item.radius) || 16,
    startX: Number(item.startX) || 0,
    startY: Number(item.startY) || 0,
    endX: Number(item.endX) || 0,
    endY: Number(item.endY) || 0,
  };
}

function setCanvasStageInteractionState({ hovered = false, dragging = false } = {}) {
  const isActive = Boolean(hovered || dragging);
  canvasViewportEl?.classList.toggle("is-hovered", isActive);
  canvasViewportEl?.classList.toggle("is-dragover", Boolean(dragging));
}

function updateCanvasModeButtons(mode = CANVAS_MODE_LEGACY) {
  const isLegacy = mode === CANVAS_MODE_LEGACY;
  canvasModeLegacyBtn?.classList.toggle("is-active", isLegacy);
  canvasModeLegacyBtn?.setAttribute("aria-selected", String(isLegacy));
  canvasModeLegacyBtn?.setAttribute("aria-pressed", String(isLegacy));
  scheduleCanvasModeSliderSync();
}

function syncCanvasModeSlider() {
  if (!canvasModeSwitchEl || !canvasModeSliderEl) {
    return;
  }

  const activeTab = [canvasModeLegacyBtn].find((tab) => tab?.classList.contains("is-active"));
  if (!(activeTab instanceof HTMLElement)) {
    canvasModeSliderEl.style.width = "0px";
    canvasModeSliderEl.style.opacity = "0";
    return;
  }

  const stripRect = canvasModeSwitchEl.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();
  canvasModeSliderEl.style.width = `${Math.max(0, tabRect.width)}px`;
  canvasModeSliderEl.style.transform = `translateX(${Math.max(0, tabRect.left - stripRect.left)}px)`;
  canvasModeSliderEl.style.opacity = tabRect.width > 0 ? "1" : "0";
}

let canvasModeSliderFrame = 0;
function scheduleCanvasModeSliderSync() {
  if (canvasModeSliderFrame) {
    window.cancelAnimationFrame(canvasModeSliderFrame);
  }
  canvasModeSliderFrame = window.requestAnimationFrame(() => {
    canvasModeSliderFrame = 0;
    syncCanvasModeSlider();
  });
}

function syncCanvasModeVisibility(mode = CANVAS_MODE_LEGACY) {
  document.body?.classList.add("is-office-embedded");
  canvasShellEl?.classList.add("is-office-embedded");
  canvasStageBodyEl?.classList.add("is-office-embedded");
  canvasViewportEl?.classList.add("is-hidden");
  canvasCanvas2dHostEl?.classList.remove("is-hidden");
  canvasItemInteractionController.setEnabled?.(false);
  canvasViewportEl?.classList.remove("is-hovered", "is-dragover");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  });
}

function ensureLegacyCanvasMode(statusText = "请先切回旧画布后再使用该操作") {
  return true;
}

function getModernCanvas2DEngine() {
  const engine = globalThis.__canvas2dEngine;
  if (!engine || typeof engine !== "object") {
    return null;
  }
  return engine;
}

async function setCanvasMode(nextMode, { persist = true, waitForMount = true } = {}) {
  const normalizedMode = CANVAS_MODE_LEGACY;
  if (state.canvasMode !== normalizedMode) {
    state.canvasMode = normalizedMode;
    if (persist) {
      persistCanvasMode(normalizedMode);
    }
  }

  updateCanvasModeButtons(normalizedMode);
  syncCanvasModeVisibility(normalizedMode);
  window.dispatchEvent(
    new CustomEvent("canvas-office:mode-change", {
      detail: { mode: normalizedMode },
    })
  );
  setCanvasStatus("已切回 FreeFlow 画布");
}

function getClipboardZoneFromTarget(target) {
  if (!(target instanceof Element)) {
    return "";
  }

  if (
    target.closest("#canvas-viewport") ||
    target.closest("#canvas-items") ||
    target.closest(".desktop-clear-stage")
  ) {
    return "canvas";
  }

  if (target.closest("#screen-source-panel") || target.closest("#screen-source-header-slot")) {
    return "screen";
  }

  if (target.closest(".conversation-panel")) {
    return "assistant";
  }

  return "";
}

function getActiveClipboardZone() {
  return activeClipboardZone;
}

function getClipboardPlainText(dataTransfer) {
  return String(dataTransfer?.getData?.("text/plain") || "").trim();
}

function shouldUseAppClipboardPayload(payload, dataTransfer = null) {
  if (!payload) return false;
  const plainText = getClipboardPlainText(dataTransfer);
  if (!plainText) {
    return true;
  }
  if (payload.text && plainText === payload.text.trim()) {
    return true;
  }
  return false;
}

function extractConversationCopyText(target) {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const start = Number(target.selectionStart);
    const end = Number(target.selectionEnd);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return String(target.value || "").slice(start, end).trim();
    }
    return "";
  }

  return String(window.getSelection?.()?.toString() || "").trim();
}

function insertTextIntoPrompt(text = "", { focus = true } = {}) {
  if (!promptInput) return false;

  const insertion = String(text || "");
  const start = Number.isFinite(promptInput.selectionStart) ? promptInput.selectionStart : promptInput.value.length;
  const end = Number.isFinite(promptInput.selectionEnd) ? promptInput.selectionEnd : promptInput.value.length;
  const before = promptInput.value.slice(0, start);
  const after = promptInput.value.slice(end);
  promptInput.value = `${before}${insertion}${after}`;
  const nextCursor = before.length + insertion.length;
  promptInput.selectionStart = nextCursor;
  promptInput.selectionEnd = nextCursor;
  autoresize();
  if (focus) {
    promptInput.focus();
  }
  return true;
}

function createCanvasItemsFromClipboardPayload(items = [], anchorPoint = null) {
  const offsetStep = 28;
  const hasAnchorPoint =
    anchorPoint && Number.isFinite(Number(anchorPoint.x)) && Number.isFinite(Number(anchorPoint.y));
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    kind: item.kind === "textbox" ? "textbox" : item.kind,
    title: item.title,
    text: item.text,
    filePath: item.filePath,
    fileName: item.fileName,
    mimeType: item.mimeType,
    isDirectory: item.isDirectory,
    fileSize: item.fileSize,
    dataUrl: item.dataUrl,
    width: item.width,
    height: item.height,
    fontSize: item.fontSize,
    bold: item.bold,
    highlighted: item.highlighted,
    shapeType: item.shapeType,
    stroke: item.stroke,
    fill: item.fill,
    strokeWidth: item.strokeWidth,
    radius: item.radius,
    startX: item.startX,
    startY: item.startY,
    endX: item.endX,
    endY: item.endY,
    x: hasAnchorPoint ? Number(anchorPoint.x) + (index % 4) * offsetStep : index * offsetStep,
    y: hasAnchorPoint ? Number(anchorPoint.y) + Math.floor(index / 4) * offsetStep : index * offsetStep,
  }));
}

function pasteAppClipboardToCanvas(payload, anchorPoint = null) {
  if (!payload) return false;
  const nextAnchorPoint = anchorPoint || getCanvasPointerAnchorPoint();

  if (payload.source === "canvas" && payload.items.length) {
    upsertCanvasItems(
      createCanvasItemsFromClipboardPayload(payload.items, nextAnchorPoint),
      "已将复制的画布内容粘贴回左侧画布"
    );
    return true;
  }

  const text = String(payload.text || "").trim();
  if (!text) return false;
  upsertCanvasItems(
    [
      {
        kind: "text",
        title: payload.source === "chat" ? "交互文本" : "剪贴板文本",
        text,
      },
    ],
    payload.source === "chat" ? "已把右侧交互内容粘贴到左侧画布" : "已把剪贴板文本放入无限画布",
    nextAnchorPoint
  );
  return true;
}

function pasteAppClipboardToComposer(payload) {
  if (!payload) return false;

  const attachmentItems = payload.items.filter((item) => item.kind === "file" || item.kind === "image");
  if (attachmentItems.length) {
    appendComposerAttachments(attachmentItems);
  }

  const textItems = payload.items.filter((item) => item.kind === "text" || item.kind === "textbox");
  const textChunks = [];
  if (payload.text) {
    textChunks.push(payload.text);
  } else if (textItems.length) {
    textChunks.push(...textItems.map((item) => item.text).filter(Boolean));
  }

  if (textChunks.length) {
    const nextText = textChunks.join("\n\n");
    if (promptInput?.value?.trim()) {
      insertTextIntoPrompt(`\n${nextText}`);
    } else {
      insertTextIntoPrompt(nextText);
    }
  } else if (promptInput) {
    promptInput.focus();
  }

  if (attachmentItems.length || textChunks.length) {
    promptInput?.focus();
    if (payload.source === "canvas") {
      const hasAttachments = attachmentItems.length > 0;
      const hasText = textChunks.length > 0;
      if (hasAttachments && hasText) {
        setStatus("已将左侧画布的文字与附件加入右侧交互区", "success");
      } else if (hasAttachments) {
        setStatus(
          `已将左侧画布的${attachmentItems.length}个${attachmentItems.length > 1 ? "附件" : "附件"}加入右侧交互区`,
          "success"
        );
      } else {
        setStatus("已将左侧画布的文字加入右侧输入区", "success");
      }
    } else {
      setStatus(attachmentItems.length ? "已将剪贴板附件加入右侧交互区" : "已将剪贴板文本粘贴到输入区", "success");
    }
    return true;
  }

  return false;
}

function getCanvas2DSelectionClipboardFallback() {
  const engine = globalThis.__canvas2dEngine;
  if (!engine || typeof engine.getSnapshotData !== "function") {
    return null;
  }

  let snapshot = null;
  try {
    snapshot = engine.getSnapshotData();
  } catch {
    snapshot = null;
  }
  if (!snapshot || !Array.isArray(snapshot.items) || !Array.isArray(snapshot.selectedIds) || !snapshot.selectedIds.length) {
    return null;
  }

  const selectedIdSet = new Set(snapshot.selectedIds.map((item) => String(item || "").trim()).filter(Boolean));
  const selectedItems = snapshot.items.filter((item) => selectedIdSet.has(String(item?.id || "").trim()));
  if (!selectedItems.length) {
    return null;
  }

  const summarizeItem = (item = {}) => {
    if (item?.type === "text" || item?.type === "flowNode") {
      return String(item.plainText || item.text || "").trim();
    }
    return String(item.title || item.name || item.fileName || item.shapeType || item.type || "").trim();
  };

  const textItems = selectedItems
    .filter((item) => item?.type === "text" || item?.type === "flowNode")
    .map((item) => String(item.plainText || item.text || "").trim())
    .filter(Boolean);

  const attachmentItems = selectedItems
    .filter((item) => item?.type === "fileCard" || item?.type === "image")
    .map((item) => ({
      id: `canvas2d:${String(item.id || crypto.randomUUID())}`,
      kind: item.type === "image" ? "image" : "file",
      title: String(item.title || item.name || item.fileName || (item.type === "image" ? "图片" : "文件")).trim() || "未命名内容",
    }));

  const summaryText = selectedItems.map(summarizeItem).filter(Boolean).join("\n").trim();

  return {
    source: "canvas2d-selection",
    text: summaryText,
    textItems,
    attachmentItems,
  };
}

function pasteCanvas2DSelectionToComposer(payload) {
  if (!payload) return false;

  const attachmentItems = Array.isArray(payload.attachmentItems) ? payload.attachmentItems : [];
  const textChunks = Array.isArray(payload.textItems) && payload.textItems.length
    ? payload.textItems
    : String(payload.text || "").trim()
      ? [String(payload.text || "").trim()]
      : [];

  if (attachmentItems.length) {
    appendComposerAttachments(attachmentItems);
  }

  if (textChunks.length) {
    const nextText = textChunks.join("\n\n");
    if (promptInput?.value?.trim()) {
      insertTextIntoPrompt(`\n${nextText}`);
    } else {
      insertTextIntoPrompt(nextText);
    }
  } else {
    promptInput?.focus();
  }

  if (!attachmentItems.length && !textChunks.length) {
    return false;
  }

  if (attachmentItems.length && textChunks.length) {
    setStatus("已将左侧画布的文字与附件加入右侧交互区", "success");
  } else if (attachmentItems.length) {
    setStatus("已将左侧画布的附件加入右侧交互区", "success");
  } else {
    setStatus("已将左侧画布的文字加入右侧输入区", "success");
  }
  return true;
}

async function pasteIntoAssistantFromClipboard(dataTransfer, anchorPoint = null) {
  const appClipboard = getActiveAppClipboardPayload();
  const canUseCanvasClipboard = appClipboard?.source === "canvas";
  const plainText = getClipboardPlainText(dataTransfer);

  if (canUseCanvasClipboard && shouldUseAppClipboardPayload(appClipboard, dataTransfer)) {
    return pasteAppClipboardToComposer(appClipboard);
  }

  const handledImportedContent = await importClipboardToComposer(dataTransfer, anchorPoint);
  if (handledImportedContent) {
    return true;
  }

  if (canUseCanvasClipboard) {
    return pasteAppClipboardToComposer(appClipboard);
  }

  const canvas2dFallback = getCanvas2DSelectionClipboardFallback();
  if (canvas2dFallback) {
    const matchesClipboardText =
      !plainText ||
      (canvas2dFallback.text && plainText === canvas2dFallback.text) ||
      canvas2dFallback.textItems.includes(plainText);
    if (matchesClipboardText) {
      return pasteCanvas2DSelectionToComposer(canvas2dFallback);
    }
  }

  return false;
}

async function importClipboardToComposer(dataTransfer, anchorPoint = null) {
  if (!promptInput) return false;
  const nextAnchorPoint = anchorPoint || getCanvasPointerAnchorPoint();

  let importedItems = [];
  if (hasClipboardFiles(dataTransfer)) {
    for (const file of [...(dataTransfer?.files || [])]) {
      importedItems.push(await fileToCanvasItem(file));
    }
  } else if (IS_DESKTOP_APP) {
    const paths = await readClipboardFilePaths();
    for (const filePath of paths) {
      importedItems.push(await filePathToCanvasItem(filePath));
    }
  }

  if (importedItems.length) {
    const insertedItems = upsertCanvasItems(importedItems, "剪贴板文件已同步到左侧画布", nextAnchorPoint);
    appendComposerAttachments(insertedItems.filter((item) => item.kind === "file" || item.kind === "image"));
    promptInput.focus();
    setStatus(
      `已将剪贴板的${insertedItems.length}个${insertedItems.length > 1 ? "文件/图片" : "文件/图片"}加入右侧交互区，并同步到左侧画布`,
      "success"
    );
    return true;
  }

  const plainText = getClipboardPlainText(dataTransfer);
  if (plainText) {
    insertTextIntoPrompt(promptInput.value.trim() ? `\n${plainText}` : plainText);
    setStatus("已将剪贴板文本粘贴到右侧交互区", "success");
    return true;
  }

  return false;
}

function getCanvasItemById(itemId) {
  return state.canvasBoard.items.find((item) => item.id === itemId);
}

function getCanvasTextBoxItemById(itemId) {
  const item = getCanvasItemById(itemId);
  return isCanvasTextItem(item) ? item : null;
}

function getCanvasPositionFromClientPoint(clientX, clientY) {
  const viewportEl = canvasViewportEl;
  if (!viewportEl) {
    return { x: 0, y: 0 };
  }
  const rect = viewportEl.getBoundingClientRect();
  const scale = clampCanvasScale(Number(state.canvasBoard?.view?.scale) || CONFIG.canvasDefaultScale);
  const scrollLeft = Number(viewportEl.scrollLeft) || 0;
  const scrollTop = Number(viewportEl.scrollTop) || 0;
  const offsetX = Number(state.canvasBoard?.view?.offsetX) || 0;
  const offsetY = Number(state.canvasBoard?.view?.offsetY) || 0;
  return {
    x: (Number(clientX) - rect.left + scrollLeft - offsetX) / scale,
    y: (Number(clientY) - rect.top + scrollTop - offsetY) / scale,
  };
}

function setSelectionToCanvasItem(itemId, { additive = false } = {}) {
  canvasItemManager.setSelectionToCanvasItem(itemId, { additive });
}

function clearCanvasSelection({ persist = true, statusText = "" } = {}) {
  return canvasItemManager.clearCanvasSelection({ persist, statusText });
}

function startEditingCanvasTextbox(itemId) {
  canvasItemManager.startEditingCanvasTextbox(itemId);
}

function stopEditingCanvasTextbox({ persist = true } = {}) {
  canvasItemManager.stopEditingCanvasTextbox({ persist });
}

function bindCanvasTextboxEditor() {
  canvasItemManager.bindCanvasTextboxEditor();
}

function isCanvasTextItem(item) {
  return canvasItemManager.isCanvasTextItem(item);
}

function getCanvasMaterialDimensions(item) {
  return canvasItemManager.getCanvasMaterialDimensions(item);
}

function getCanvasFileMetaLine(item) {
  return canvasItemManager.getCanvasFileMetaLine(item);
}

function getCanvasCardTitle(item) {
  return canvasItemManager.getCanvasCardTitle(item);
}

function escapeCssColor(value = "") {
  return String(value || "").replace(/["'<>]/g, "").trim();
}

function removeCanvasItemsByIds(itemIds = [], statusText = "") {
  return canvasItemManager.removeCanvasItemsByIds(itemIds, statusText);
}

async function copySelectedCanvasItems() {
  const selectedItems = getSelectedCanvasItems();
  if (!selectedItems.length) {
    throw new Error("没有选中的素材卡");
  }
  return copyCanvasItemsToClipboard(selectedItems);
}

async function cutSelectedCanvasItems() {
  const selectedItems = getSelectedCanvasItems();
  if (!selectedItems.length) {
    throw new Error("没有选中的素材卡");
  }
  const result = await copyCanvasItemsToClipboard(selectedItems);
  removeCanvasItemsByIds(
    selectedItems.map((item) => item.id),
    `已剪切 ${selectedItems.length} 个素材卡`
  );
  return result;
}

async function pasteIntoCanvasFromSystemClipboard(anchorPoint = null) {
  const nextAnchorPoint = anchorPoint || getCanvasPointerAnchorPoint();
  const appClipboard = getActiveAppClipboardPayload();
  if (shouldUseAppClipboardPayload(appClipboard) && pasteAppClipboardToCanvas(appClipboard, nextAnchorPoint)) {
    return true;
  }

  const handledFiles = await importClipboardFilesFromDesktop(nextAnchorPoint).catch(() => false);
  if (handledFiles) {
    return true;
  }

  await importClipboardTextToCanvas(nextAnchorPoint);
  return true;
}

async function openCanvasItem(item) {
  return canvasItemManager.openCanvasItem(item);
}

function createCanvasContextMenu() {
  return canvasCanvas.createContextMenu();
}

function closeCanvasContextMenu() {
  canvasContextMenuEl?.classList.add("is-hidden");
}

function openCanvasContextMenu(clientX, clientY) {
  if (!canvasContextMenuEl) return;

  const hasSelection = state.canvasBoard.selectedIds.length > 0;
  for (const actionEl of canvasContextMenuEl.querySelectorAll("[data-canvas-menu-action]")) {
    const action = actionEl.dataset.canvasMenuAction;
    actionEl.disabled = ["copy", "cut", "delete"].includes(action) ? !hasSelection : false;
  }

  canvasContextMenuEl.classList.remove("is-hidden");
  const rect = canvasContextMenuEl.getBoundingClientRect();
  const nextX = Math.min(clientX, window.innerWidth - rect.width - 12);
  const nextY = Math.min(clientY, window.innerHeight - rect.height - 12);
  canvasContextMenuEl.style.left = `${Math.max(12, nextX)}px`;
  canvasContextMenuEl.style.top = `${Math.max(12, nextY)}px`;
  setCanvasContextMenuAnchorPoint(clientX, clientY);
}

function createCanvasImageLightbox() {
  return canvasCanvas.createImageLightbox();
}

function openCanvasImageLightbox(item) {
  return canvasCanvas.openImageLightbox(canvasImageLightboxEl, item);
}

function closeCanvasImageLightbox() {
  return canvasCanvas.closeImageLightbox(canvasImageLightboxEl);
}

function createCanvasTextboxAt(clientX, clientY) {
  return canvasItemManager.createCanvasTextboxAt(clientX, clientY);
}

function renderCanvasBoard() {
  return canvasCanvas.render();
}

function updateCanvasView(nextView = {}, { persist = true } = {}) {
  return canvasCanvas.setView(nextView, { persist });
}

function createCanvasItem(base = {}) {
  return canvasItemManager.createCanvasItem(base);
}

function upsertCanvasItems(items = [], statusText = "", anchorPoint = null) {
  return canvasItemManager.upsertCanvasItems(items, statusText, anchorPoint);
}

function fileToDataUrl(file) {
  return canvasItemManager.fileToDataUrl(file);
}

function readImageDimensions(dataUrl) {
  return canvasItemManager.readImageDimensions(dataUrl);
}

function getAdaptiveImageCardSize(imageWidth, imageHeight) {
  return canvasItemManager.getAdaptiveImageCardSize(imageWidth, imageHeight);
}

async function fileToCanvasItem(file) {
  return canvasItemManager.fileToCanvasItem(file);
}

async function filePathToCanvasItem(filePath) {
  return canvasItemManager.filePathToCanvasItem(filePath);
}

function hasClipboardFiles(dataTransfer) {
  return canvasItemManager.hasClipboardFiles(dataTransfer);
}

async function readClipboardFilePaths() {
  return canvasItemManager.readClipboardFilePaths();
}

async function importClipboardFilesFromDesktop(anchorPoint = null) {
  return canvasItemManager.importClipboardFilesFromDesktop(anchorPoint);
}

function getDroppedDirectoryItems(dataTransfer) {
  return canvasItemManager.getDroppedDirectoryItems(dataTransfer);
}

async function importClipboardOrDroppedData(dataTransfer, source = "paste", anchorPoint = null) {
  return canvasItemManager.importClipboardOrDroppedData(dataTransfer, source, anchorPoint);
}

async function readClipboardText() {
  if (DESKTOP_SHELL?.readClipboardText) {
    const result = await DESKTOP_SHELL.readClipboardText();
    if (!result?.ok) {
      throw new Error(result?.error || "无法读取系统剪贴板");
    }
    return String(result.text || "");
  }

  if (navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }

  throw new Error("当前环境不支持读取剪贴板");
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(String(text || ""));
    return;
  }

  throw new Error("当前环境不支持写入剪贴板");
}

async function copyCanvasItemToClipboard(item) {
  return canvasItemManager.copyCanvasItemToClipboard(item);
}

async function copyCanvasItemsToClipboard(items = []) {
  return canvasItemManager.copyCanvasItemsToClipboard(items);
}

function handleCanvasExternalDrop(items = [], zone = "outside") {
  return canvasItemManager.handleCanvasExternalDrop(items, zone);
}

async function captureClipboardEntry(source = "manual") {
  const content = String(await readClipboardText()).trim();
  if (!content) {
    throw new Error("当前剪贴板为空");
  }

  if (state.clipboardStore.items[0]?.content === content) {
    clipboardStatusPillEl.textContent = "最新剪贴板已在队列中";
    return false;
  }

  state.lastClipboardText = content;
  state.clipboardStore.items = [
    {
      id: crypto.randomUUID(),
      content,
      source: source === "auto" ? "auto" : "manual",
      createdAt: Date.now(),
    },
    ...state.clipboardStore.items,
  ].slice(0, state.clipboardStore.maxItems);

  await saveClipboardStore();
  clipboardStatusPillEl.textContent = source === "auto" ? "已自动保存新剪贴板" : "已手动保存到队列";
  return true;
}

async function importClipboardTextToCanvas(anchorPoint = null) {
  const nextAnchorPoint = anchorPoint || getCanvasPointerAnchorPoint();
  const content = String(await readClipboardText()).trim();
  if (!content) {
    throw new Error("当前剪贴板没有可导入的文本");
  }

  upsertCanvasItems(
    [
      {
        kind: "text",
        title: "剪贴板文本",
        text: content,
      },
    ],
    "已把剪贴板文本放入无限画布",
    nextAnchorPoint
  );
}

function stopClipboardPolling() {
  if (state.clipboardPollTimer) {
    clearInterval(state.clipboardPollTimer);
    state.clipboardPollTimer = null;
  }
}

function startClipboardPolling() {
  stopClipboardPolling();

  if (state.clipboardStore.mode !== "auto") {
    return;
  }

  state.clipboardPollTimer = window.setInterval(async () => {
    try {
      const text = String(await readClipboardText()).trim();
      if (!text || text === state.lastClipboardText) {
        return;
      }

      state.lastClipboardText = text;
      await captureClipboardEntry("auto");
    } catch {
      // Keep polling silent; manual mode remains available even if clipboard polling fails.
    }
  }, CONFIG.clipboardPollIntervalMs);
}

async function loadUiSettings() {
  const cached = readUiSettingsCache();
  const startupContext = await loadStartupContext();
  const startupUiSettings = startupContext?.uiSettings || {};
  const startupWorkbenchPreferences = startupContext?.workbenchPreferences || {};
  try {
    const response = await fetch(API_ROUTES.uiSettings);
    const data = await readJsonResponse(response, "界面设置");

    if (!response.ok || !data.ok) {
      throw new Error(data.details || data.error || "无法读取界面设置");
    }

    state.uiSettings = normalizeUiSettings({
      ...startupUiSettings,
      ...startupWorkbenchPreferences,
      ...data,
    });
  } catch (error) {
    state.uiSettings = normalizeUiSettings({
      ...startupUiSettings,
      ...startupWorkbenchPreferences,
      ...cached,
    });
    setStatus(`界面设置读取失败：${error.message}`, "warning");
  }

  state.workbenchPreferences = pickWorkbenchPreferences({
    ...state.uiSettings,
    ...startupWorkbenchPreferences,
  });
  writeUiSettingsCache(state.uiSettings);
  applyUiSettings();
}

function buildUiSettingsPayload(overrides = {}) {
  const cached = readUiSettingsCache();
  return normalizeUiSettings({
    appName: overrides.appName ?? appNameInput?.value ?? state.uiSettings?.appName,
    appSubtitle: overrides.appSubtitle ?? appSubtitleInput?.value ?? state.uiSettings?.appSubtitle,
    canvasTitle: overrides.canvasTitle ?? canvasTitleInputEl?.value ?? state.uiSettings?.canvasTitle,
    canvasBoardSavePath:
      overrides.canvasBoardSavePath ??
      canvasBoardPathInputEl?.value ??
      state.uiSettings?.canvasBoardSavePath ??
      cached.canvasBoardSavePath,
    canvasLastOpenedBoardPath:
      overrides.canvasLastOpenedBoardPath ??
      state.uiSettings?.canvasLastOpenedBoardPath ??
      cached.canvasLastOpenedBoardPath,
    hasShownStartupTutorial:
      overrides.hasShownStartupTutorial ??
      state.uiSettings?.hasShownStartupTutorial ??
      cached.hasShownStartupTutorial,
    lastTutorialIntroVersion:
      overrides.lastTutorialIntroVersion ??
      state.uiSettings?.lastTutorialIntroVersion ??
      cached.lastTutorialIntroVersion,
    dismissedTutorialIntroVersion:
      overrides.dismissedTutorialIntroVersion ??
      state.uiSettings?.dismissedTutorialIntroVersion ??
      cached.dismissedTutorialIntroVersion,
    canvasImageSavePath:
      overrides.canvasImageSavePath ??
      canvasImagePathInputEl?.value ??
      state.uiSettings?.canvasImageSavePath ??
      cached.canvasImageSavePath,
    defaultCanvasPanelSide:
      overrides.defaultCanvasPanelSide ??
      state.uiSettings?.defaultCanvasPanelSide ??
      cached.defaultCanvasPanelSide,
    defaultChatPanelSide:
      overrides.defaultChatPanelSide ??
      state.uiSettings?.defaultChatPanelSide ??
      cached.defaultChatPanelSide,
    defaultCanvasPanelVisible:
      overrides.defaultCanvasPanelVisible ??
      state.uiSettings?.defaultCanvasPanelVisible ??
      cached.defaultCanvasPanelVisible,
    defaultChatPanelVisible:
      overrides.defaultChatPanelVisible ??
      state.uiSettings?.defaultChatPanelVisible ??
      cached.defaultChatPanelVisible,
    defaultLaunchFullscreen:
      overrides.defaultLaunchFullscreen ??
      state.uiSettings?.defaultLaunchFullscreen ??
      cached.defaultLaunchFullscreen,
    panelOpacity: overrides.panelOpacity ?? state.uiSettings?.panelOpacity,
    canvasOpacity: overrides.canvasOpacity ?? state.uiSettings?.canvasOpacity,
    backgroundColor: overrides.backgroundColor ?? state.uiSettings?.backgroundColor,
    backgroundOpacity: overrides.backgroundOpacity ?? state.uiSettings?.backgroundOpacity,
    textColor: overrides.textColor ?? state.uiSettings?.textColor,
    patternColor: overrides.patternColor ?? state.uiSettings?.patternColor,
    buttonColor: overrides.buttonColor ?? state.uiSettings?.buttonColor,
    buttonTextColor: overrides.buttonTextColor ?? state.uiSettings?.buttonTextColor,
    shellPanelColor: overrides.shellPanelColor ?? state.uiSettings?.shellPanelColor,
    shellPanelTextColor: overrides.shellPanelTextColor ?? state.uiSettings?.shellPanelTextColor,
    controlColor: overrides.controlColor ?? state.uiSettings?.controlColor,
    controlActiveColor: overrides.controlActiveColor ?? state.uiSettings?.controlActiveColor,
    floatingPanelColor: overrides.floatingPanelColor ?? state.uiSettings?.floatingPanelColor,
    inputColor: overrides.inputColor ?? state.uiSettings?.inputColor,
    inputTextColor: overrides.inputTextColor ?? state.uiSettings?.inputTextColor,
    messageColor: overrides.messageColor ?? state.uiSettings?.messageColor,
    userMessageColor: overrides.userMessageColor ?? state.uiSettings?.userMessageColor,
    dialogColor: overrides.dialogColor ?? state.uiSettings?.dialogColor,
    themePreset: overrides.themePreset ?? state.uiSettings?.themePreset,
  });
}

function buildThemeSettingsPayload(overrides = {}) {
  return normalizeThemeSettings({
    panelOpacity: overrides.panelOpacity ?? state.uiSettings?.panelOpacity,
    canvasOpacity: overrides.canvasOpacity ?? state.uiSettings?.canvasOpacity,
    backgroundColor: overrides.backgroundColor ?? state.uiSettings?.backgroundColor,
    backgroundOpacity: overrides.backgroundOpacity ?? state.uiSettings?.backgroundOpacity,
    textColor: overrides.textColor ?? state.uiSettings?.textColor,
    patternColor: overrides.patternColor ?? state.uiSettings?.patternColor,
    buttonColor: overrides.buttonColor ?? state.uiSettings?.buttonColor,
    buttonTextColor: overrides.buttonTextColor ?? state.uiSettings?.buttonTextColor,
    shellPanelColor: overrides.shellPanelColor ?? state.uiSettings?.shellPanelColor,
    shellPanelTextColor: overrides.shellPanelTextColor ?? state.uiSettings?.shellPanelTextColor,
    controlColor: overrides.controlColor ?? state.uiSettings?.controlColor,
    controlActiveColor: overrides.controlActiveColor ?? state.uiSettings?.controlActiveColor,
    floatingPanelColor: overrides.floatingPanelColor ?? state.uiSettings?.floatingPanelColor,
    inputColor: overrides.inputColor ?? state.uiSettings?.inputColor,
    inputTextColor: overrides.inputTextColor ?? state.uiSettings?.inputTextColor,
    messageColor: overrides.messageColor ?? state.uiSettings?.messageColor,
    userMessageColor: overrides.userMessageColor ?? state.uiSettings?.userMessageColor,
    dialogColor: overrides.dialogColor ?? state.uiSettings?.dialogColor,
    themePreset: overrides.themePreset ?? state.uiSettings?.themePreset,
  });
}

async function saveUiSettings(overrides = {}) {
  const previousCanvasBoardPath = getCanvasBoardSavePath();
  const payload = buildUiSettingsPayload(overrides);
  writeUiSettingsCache(payload);

  const response = await fetch(API_ROUTES.uiSettings, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJsonResponse(response, "界面设置");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "保存界面设置失败");
  }

  state.uiSettings = normalizeUiSettings({
    ...payload,
    ...data,
  });
  writeUiSettingsCache(state.uiSettings);
  applyUiSettings();

  if (getCanvasBoardSavePath() !== previousCanvasBoardPath) {
    try {
      await queueCanvasBoardPersist(true);
      setCanvasStatus("画布已保存到新的文件地址");
    } catch (error) {
      throw new Error(`设置已保存，但新画布地址写入失败：${error.message}`);
    }
  }
}

async function saveWorkbenchPreferences(preferences = {}) {
  const payload = pickWorkbenchPreferences(preferences);
  state.workbenchPreferences = payload;
  state.uiSettings = normalizeUiSettings({
    ...state.uiSettings,
    ...payload,
  });
  writeUiSettingsCache(state.uiSettings);
  writeStartupContextUiSettings(state.uiSettings);

  const response = await fetch(API_ROUTES.workbenchPreferences, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJsonResponse(response, "习惯设置");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "保存习惯设置失败");
  }

  const nextUiSettings = normalizeUiSettings({
    ...state.uiSettings,
    ...(data.uiSettings || {}),
    ...(data.preferences || {}),
  });
  state.uiSettings = nextUiSettings;
  state.workbenchPreferences = pickWorkbenchPreferences(data.preferences || nextUiSettings);
  writeUiSettingsCache(nextUiSettings);
  writeStartupContextUiSettings(nextUiSettings);
  applyUiSettings();
  return state.workbenchPreferences;
}

async function saveThemeSettings(overrides = {}) {
  const themePayload = buildThemeSettingsPayload(overrides);
  writeUiSettingsCache({
    ...state.uiSettings,
    ...themePayload,
  });

  const response = await fetch(API_ROUTES.themeSettings, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(themePayload),
  });
  const data = await readJsonResponse(response, "主题设置");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "保存主题设置失败");
  }

  state.uiSettings = normalizeUiSettings({
    ...state.uiSettings,
    ...themePayload,
    ...data,
  });
  writeUiSettingsCache(state.uiSettings);
  applyUiSettings();
}

function syncModelSelectOptions(models = []) {
  modelSelect.innerHTML = models
    .map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.displayName || getModelDisplayName(item.name))}</option>`)
    .join("");
}

function applyModelCatalogResponse(data = {}) {
  state.provider = data.provider || "ollama";
  state.providerLabel =
    data.providerLabel ||
    (state.provider === "lmstudio"
      ? "LM Studio"
      : state.provider === "bigmodel"
        ? "BigModel"
        : state.provider === "hybrid"
          ? "本地 + BigModel"
          : "Ollama");
  state.supportsRuntimeOptions = data.supportsRuntimeOptions !== false;
  state.modelProviderSettings = normalizeModelProviderSettings(data.modelProviderSettings || state.modelProviderSettings);
  defaultModelEl.textContent = getModelDisplayName(data.defaultModel);
  connectionStatusEl.textContent = "已连接";
  state.hardware = {
    platform: data.hardwarePlatform || "",
    gpuAvailable: data.gpuAvailable !== false,
    runtimePermissionRequired: Boolean(data.runtimePermissionRequired),
    runtimePermissionGranted: Boolean(data.runtimePermissionGranted),
    preferredGpuName: data.preferredGpuName || "",
    videoControllers: Array.isArray(data.videoControllers) ? data.videoControllers : [],
  };
  syncProviderCapabilities();

  const models = normalizeModelList(data.models, data.defaultModel);
  state.availableModels = models;
  mergeModelProfiles(models.map((item) => item.name));
  syncModelSelectOptions(models);

  const currentSession = getCurrentSession();
  const initialModel = resolveExistingModelSelection(currentSession?.activeModel || state.model, models) || data.defaultModel;
  applyModelSelection(initialModel, { announce: false, persistSession: false });
  renderConversationModelMenu();

  return models;
}

async function refreshAvailableModels({
  announceSuccess = true,
  successText = "",
  loadingText = "正在连接模型服务并读取模型列表",
} = {}) {
  setStatus(loadingText);
  const response = await fetch(API_ROUTES.meta);
  const data = await readJsonResponse(response, "模型信息");
  if (data?.modelProviderSettings) {
    state.modelProviderSettings = normalizeModelProviderSettings(data.modelProviderSettings);
    renderConversationModelMenu();
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "无法读取模型信息");
  }

  const models = applyModelCatalogResponse(data);
  if (announceSuccess) {
    setStatus(successText || `已连接到 ${state.providerLabel}，发现 ${models.length} 个可用模型`, "success");
  }
  return data;
}

async function saveModelProviderSettings(nextSettings = {}) {
  const payload = normalizeModelProviderSettings({
    ...state.modelProviderSettings,
    ...nextSettings,
    cloud: {
      ...state.modelProviderSettings.cloud,
      ...(nextSettings.cloud || {}),
    },
  });

  const response = await fetch(API_ROUTES.modelProviderSettings, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJsonResponse(response, "模型配置");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "保存模型配置失败");
  }

  state.modelProviderSettings = normalizeModelProviderSettings(data);
  renderConversationModelMenu();
  return state.modelProviderSettings;
}

function renderCurrentSessionHeader() {
  const session = getCurrentSession();
  const isEditingCurrent = state.editingSessionId && session?.id === state.editingSessionId;

  if (conversationTitleEl) {
    conversationTitleEl.textContent = session?.title || CONFIG.defaultSessionTitle;
    conversationTitleEl.classList.toggle("is-hidden", Boolean(isEditingCurrent));
  }

  if (conversationTitleInputEl) {
    conversationTitleInputEl.classList.toggle("is-hidden", !isEditingCurrent);
    if (isEditingCurrent) {
      conversationTitleInputEl.value = session?.title || CONFIG.defaultSessionTitle;
    }
  }

  renameSessionBtn?.classList.toggle("is-hidden", Boolean(isEditingCurrent));
  saveSessionRenameBtn?.classList.toggle("is-hidden", !isEditingCurrent);
  cancelSessionRenameBtn?.classList.toggle("is-hidden", !isEditingCurrent);
}

function focusSessionRenameInput(sessionId) {
  requestAnimationFrame(() => {
    if (sessionId === state.currentSessionId && conversationTitleInputEl && !conversationTitleInputEl.classList.contains("is-hidden")) {
      conversationTitleInputEl.focus();
      conversationTitleInputEl.select();
      return;
    }

    const inlineInput = historyListEl?.querySelector(`[data-inline-session-input="${sessionId}"]`);
    if (inlineInput) {
      inlineInput.focus();
      inlineInput.select();
    }
  });
}

function getEditingSessionValue(sessionId) {
  if (sessionId === state.currentSessionId && conversationTitleInputEl && !conversationTitleInputEl.classList.contains("is-hidden")) {
    return conversationTitleInputEl.value;
  }

  const inlineInput = historyListEl?.querySelector(`[data-inline-session-input="${sessionId}"]`);
  return inlineInput?.value || "";
}

function syncOutputModeUi() {
  const label = state.outputMode === "stream" ? "流式输出" : "同步 / 非流式";
  if (outputModeSelect) {
    outputModeSelect.value = state.outputMode;
  }
  if (responseModeLabelEl) {
    responseModeLabelEl.textContent = label;
  }
  if (conversationModePillEl) {
    conversationModePillEl.textContent = label;
  }
  renderAiRuntimeSummary();
}

function renderAiRuntimeSummary() {
  if (!runtimeSummaryEl) {
    return;
  }

  const activeModel = state.model || modelSelect?.value || "";
  if (!activeModel) {
    runtimeSummaryEl.textContent = "模型未选择";
    return;
  }

  const deviceLabel = getDeviceModeLabel(
    isLocalModel(activeModel) ? getModelDeviceMode(activeModel) : "cloud",
    getDeviceModeGpuName(getModelDeviceMode(activeModel))
  );
  const outputLabel = state.outputMode === "stream" ? "流式" : "同步";
  runtimeSummaryEl.textContent = `${getModelDisplayName(activeModel)} · ${deviceLabel} · ${Math.round(
    state.contextLimit / 1024
  )}k · ${outputLabel}`;
}

async function bootstrap() {
  document.body.classList.toggle("desktop-mode", IS_DESKTOP_APP);
  state.activeRightPanelView = normalizeRightPanelView(localStorage.getItem(CONFIG.rightPanelViewKey));
  await loadStartupContext();
  await loadUiSettings();
  await loadCanvasBoardFromStorage();
  await loadSessions();
  await loadClipboardStore();

  try {
    await loadPermissions();
  } catch (error) {
    state.permissionStore = getDefaultPermissionStore();
    setStatus(`权限配置读取失败：${error.message}`, "warning");
  }

  if (!state.sessions.length) {
    createSession({ switchTo: true, persist: false });
  } else if (!getCurrentSession()) {
    state.currentSessionId = state.sessions[0].id;
  }

  renderSessions();
  renderCurrentSession();
  renderContextStats();
  renderPermissions();
  renderAllowedRoots();
  renderSystemStats();
  renderCanvasBoard();
  await setCanvasMode(state.canvasMode, { persist: false, waitForMount: false });
  renderRightPanelView();
  renderRightPanelSwitchLockState();
  setDrawerOpen(false);
  initializePaneLayout();
  await initializeDesktopShell();
  startClipboardPolling();
  autoresize();
  syncComposerOffset();
  observeComposerSize();
  observeScreenSourcePreviewSize();
  observeScreenSourceToolbarSize();
  agentModeToggle.checked = localStorage.getItem(CONFIG.agentModeKey) === "true";
  state.outputMode = localStorage.getItem(CONFIG.outputModeKey) === "stream" ? "stream" : "nonstream";
  syncOutputModeUi();
  updatePromptPlaceholder();
  scheduleDesktopWindowShapeSync();
  document.body.classList.remove("app-booting");
  if (bootShapeUnlockTimer) {
    window.clearTimeout(bootShapeUnlockTimer);
    bootShapeUnlockTimer = 0;
  }
  const handleBootSplashTransitionEnd = (event) => {
    if (event.target !== bootSplashEl || event.propertyName !== "opacity") {
      return;
    }

    bootSplashEl?.removeEventListener("transitionend", handleBootSplashTransitionEnd);
    if (bootShapeUnlockTimer) {
      window.clearTimeout(bootShapeUnlockTimer);
      bootShapeUnlockTimer = 0;
    }
    releaseBootShapeLock();
  };
  if (bootSplashEl) {
    bootSplashEl.addEventListener("transitionend", handleBootSplashTransitionEnd);
    bootShapeUnlockTimer = window.setTimeout(() => {
      bootShapeUnlockTimer = 0;
      bootSplashEl.removeEventListener("transitionend", handleBootSplashTransitionEnd);
      releaseBootShapeLock();
    }, 800);
  } else {
    releaseBootShapeLock();
  }
  try {
    DESKTOP_SHELL?.notifyRendererReady?.();
  } catch {
    // Ignore desktop boot readiness signal failures.
  }

  if (shouldAutoShowStartupTutorialIntro()) {
    globalTutorialHost.openIntro();
  }

  try {
    await loadModelProfiles();
  } catch (error) {
    setStatus(`模型档案读取失败：${error.message}`, "warning");
  }

  try {
    await refreshAvailableModels();
  } catch (error) {
    const providerFallbackModel = state.provider === "bigmodel" ? `${CLOUD_MODEL_PREFIX}glm-4.7-flash` : `${LOCAL_MODEL_PREFIX}qwen3.5:4b`;
    const fallbackModels = normalizeModelList([], state.model || providerFallbackModel);
    state.availableModels = fallbackModels;
    syncModelSelectOptions(fallbackModels);
    mergeModelProfiles(fallbackModels.map((item) => item.name));
    applyModelSelection(fallbackModels[0]?.name || providerFallbackModel, { announce: false, persistSession: false });
    defaultModelEl.textContent = "不可用";
    connectionStatusEl.textContent = "连接失败";
    setStatus(error.message, "error");
  }
}

function setDrawerOpen(open) {
  state.drawerOpen = Boolean(open);
  if (state.drawerOpen) {
    void setDesktopClickThrough(false);
    markElementForWindowShape(drawerBackdropEl, { padding: 0 });
  } else {
    unmarkElementForWindowShape(drawerBackdropEl);
  }
  insightDrawerEl?.classList.toggle("is-open", state.drawerOpen);
  drawerBackdropEl?.classList.toggle("is-open", state.drawerOpen);
  document.body.classList.toggle("drawer-open", state.drawerOpen);
  conversationSettingsBtn?.setAttribute("aria-expanded", String(state.drawerOpen));
  drawerToggleBtn?.setAttribute("aria-expanded", String(state.drawerOpen));
  insightDrawerHandleEl?.setAttribute("aria-expanded", String(state.drawerOpen));
  insightDrawerEl?.setAttribute("aria-hidden", String(!state.drawerOpen));
  dispatchTutorialUiEvent({
    type: state.drawerOpen ? TUTORIAL_EVENT_TYPES.MENU_OPENED : TUTORIAL_EVENT_TYPES.MENU_CLOSED,
    menuId: "settings-drawer",
  });
  syncEmbeddedWindowOverlayVisibility();
  scheduleDesktopWindowShapeSync();
  requestDrawerWindowShapeFinalSync();
}

function initializePaneLayout() {
  if (!workspaceEl) return;

  state.historyExpanded = localStorage.getItem(CONFIG.historyExpandedKey) === "true";
  applyWorkbenchPreferencesToPanelLayout({ persist: true, announce: false });
}

function setDesktopMenuOpen(open) {
  desktopMenuPanel?.classList.toggle("is-hidden", !open);
  desktopMenuBtn?.setAttribute("aria-expanded", String(Boolean(open)));
  if (open) {
    syncDesktopMenuPanelPosition();
  }
  syncEmbeddedWindowOverlayVisibility();
  scheduleDesktopWindowShapeSync();
}

function readPaneWidth(storageKey, fallback) {
  const value = Number(localStorage.getItem(storageKey));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getPanelLayoutViewportOptions() {
  return {
    viewportWidth: Number(window.innerWidth) || 0,
    viewportHeight: Number(window.innerHeight) || 0,
  };
}

function getWorkspaceViewport() {
  const width = Math.max(0, Number(workspaceEl?.clientWidth) || Number(window.innerWidth) || 0);
  const height = Math.max(0, Number(workspaceEl?.clientHeight) || Number(window.innerHeight) || 0);
  return { width, height };
}

function getDefaultPanelFrameForViewport(side, sideLayout = state.panelLayout?.[side], viewport = getWorkspaceViewport()) {
  const workspaceWidth = Math.max(0, Number(viewport?.width) || 0);
  const workspaceHeight = Math.max(0, Number(viewport?.height) || 0);
  const dockSide = sideLayout?.dockSide === "right" ? "right" : "left";
  const minWidth = side === "left" ? CONFIG.leftPanelMinWidth : CONFIG.rightPanelMinWidth;
  const maxWidth = side === "left" ? CONFIG.leftPanelMaxWidth : CONFIG.rightPanelMaxWidth;
  const fallbackWidth = side === "left" ? CONFIG.leftPanelDefaultWidth : CONFIG.rightPanelDefaultWidth;
  const requestedWidth = Number(sideLayout?.width);
  const width = clampPaneWidth(
    Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : fallbackWidth,
    Math.max(280, minWidth),
    Math.min(maxWidth, Math.max(320, workspaceWidth))
  );
  const height = Math.min(
    Math.max(workspaceHeight || 0, PANEL_LAYOUT_MIN_HEIGHT),
    Math.max(PANEL_LAYOUT_MIN_HEIGHT, workspaceHeight || PANEL_LAYOUT_MIN_HEIGHT)
  );
  const x =
    dockSide === "right"
      ? Math.max(PANEL_LAYOUT_EDGE_OFFSET, workspaceWidth - width - PANEL_LAYOUT_EDGE_OFFSET)
      : PANEL_LAYOUT_EDGE_OFFSET;
  return {
    x,
    y: PANEL_LAYOUT_EDGE_OFFSET,
    width,
    height,
  };
}

function getDefaultPanelSize(side, widthOverride = null) {
  const { width: workspaceWidth, height: workspaceHeight } = getWorkspaceViewport();
  const minWidth = side === "left" ? CONFIG.leftPanelMinWidth : CONFIG.rightPanelMinWidth;
  const maxWidth = side === "left" ? CONFIG.leftPanelMaxWidth : CONFIG.rightPanelMaxWidth;
  const fallbackWidth = side === "left" ? CONFIG.leftPanelDefaultWidth : CONFIG.rightPanelDefaultWidth;
  const requestedWidth = Number(widthOverride);
  const width = clampPaneWidth(
    Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : fallbackWidth,
    Math.max(280, minWidth),
    Math.min(maxWidth, Math.max(320, workspaceWidth))
  );
  const height = Math.min(
    Math.max(Number(workspaceHeight) || 0, PANEL_LAYOUT_MIN_HEIGHT),
    Math.max(PANEL_LAYOUT_MIN_HEIGHT, Number(workspaceHeight) || PANEL_LAYOUT_MIN_HEIGHT)
  );
  return { width, height };
}

function getDefaultPanelFrame(side, sideLayout = state.panelLayout?.[side]) {
  return getDefaultPanelFrameForViewport(side, sideLayout, getWorkspaceViewport());
}

function getPanelMaxZIndex() {
  return Math.max(10, Number(state.panelLayout?.left?.zIndex) || 0, Number(state.panelLayout?.right?.zIndex) || 0);
}

function bringPanelToFront(side) {
  const panel = state.panelLayout?.[side];
  if (!panel) return;
  panel.zIndex = getPanelMaxZIndex() + 1;
}

function clampPanelLayoutSideToWorkspace(side) {
  const panel = state.panelLayout?.[side];
  if (!panel) return;

  const { width: workspaceWidth, height: workspaceHeight } = getWorkspaceViewport();
  const defaultFrame = getDefaultPanelFrame(side, panel);
  const minWidth = Math.max(280, side === "left" ? CONFIG.leftPanelMinWidth : CONFIG.rightPanelMinWidth);
  const maxSideWidth = side === "left" ? CONFIG.leftPanelMaxWidth : CONFIG.rightPanelMaxWidth;
  const requestedWidth = Number(panel.width);
  const requestedHeight = Number(panel.height);
  const minHeight = Math.max(160, Math.min(PANEL_LAYOUT_MIN_HEIGHT, Math.max(160, workspaceHeight)));

  const shouldRestoreDockPosition =
    panel.dockSide === "right" &&
    Math.round(Number(panel.x) || 0) === 0 &&
    Math.round(Number(panel.y) || 0) === 0;

  if (!Number.isFinite(Number(panel.x)) || shouldRestoreDockPosition) {
    panel.x = defaultFrame.x;
  }
  if (!Number.isFinite(Number(panel.y))) {
    panel.y = defaultFrame.y;
  }

  const requestedWidthForClamp = clampPaneWidth(
    Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : defaultFrame.width,
    minWidth,
    Math.min(maxSideWidth, Math.max(minWidth, workspaceWidth - PANEL_LAYOUT_EDGE_OFFSET))
  );
  const requestedHeightForClamp = clampPaneWidth(
    Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : defaultFrame.height,
    minHeight,
    Math.max(minHeight, workspaceHeight - PANEL_LAYOUT_EDGE_OFFSET)
  );

  const maxInitialX = Math.max(
    PANEL_LAYOUT_EDGE_OFFSET,
    workspaceWidth - requestedWidthForClamp - PANEL_LAYOUT_EDGE_OFFSET
  );
  const maxInitialY = Math.max(
    PANEL_LAYOUT_EDGE_OFFSET,
    workspaceHeight - requestedHeightForClamp - PANEL_LAYOUT_EDGE_OFFSET
  );
  panel.x = Math.round(Math.min(Math.max(Number(panel.x) || 0, PANEL_LAYOUT_EDGE_OFFSET), maxInitialX));
  panel.y = Math.round(Math.min(Math.max(Number(panel.y) || 0, PANEL_LAYOUT_EDGE_OFFSET), maxInitialY));

  const maxWidth = Math.min(
    maxSideWidth,
    Math.max(minWidth, workspaceWidth - panel.x - PANEL_LAYOUT_EDGE_OFFSET)
  );
  const maxHeight = Math.max(minHeight, workspaceHeight - panel.y - PANEL_LAYOUT_EDGE_OFFSET);
  panel.width = clampPaneWidth(
    Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : defaultFrame.width,
    minWidth,
    maxWidth
  );
  panel.height = clampPaneWidth(
    Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : defaultFrame.height,
    minHeight,
    maxHeight
  );
  panel.x = Math.round(Math.min(Math.max(Number(panel.x) || 0, PANEL_LAYOUT_EDGE_OFFSET), Math.max(PANEL_LAYOUT_EDGE_OFFSET, workspaceWidth - panel.width - PANEL_LAYOUT_EDGE_OFFSET)));
  panel.y = Math.round(Math.min(Math.max(Number(panel.y) || 0, PANEL_LAYOUT_EDGE_OFFSET), Math.max(PANEL_LAYOUT_EDGE_OFFSET, workspaceHeight - panel.height - PANEL_LAYOUT_EDGE_OFFSET)));
  panel.zIndex = Math.max(1, Number(panel.zIndex) || (side === "left" ? 10 : 14));
}

function didPanelStickToDockEdge(side, panel = {}, viewport = lastPanelLayoutViewportSize) {
  if (!viewport || !panel || panel.hidden || panel.collapsed) {
    return false;
  }
  const expectedFrame = getDefaultPanelFrameForViewport(side, panel, viewport);
  return (
    Math.abs((Number(panel.x) || 0) - expectedFrame.x) <= 24 &&
    Math.abs((Number(panel.y) || 0) - expectedFrame.y) <= 24
  );
}

function realignDockedPanelsForViewportChange(previousViewport, nextViewport = getWorkspaceViewport()) {
  if (!previousViewport) {
    return;
  }

  for (const side of ["left", "right"]) {
    const panel = state.panelLayout?.[side];
    if (!panel || panel.hidden || panel.collapsed) {
      continue;
    }
    if (!didPanelStickToDockEdge(side, panel, previousViewport)) {
      continue;
    }

    const nextFrame = getDefaultPanelFrameForViewport(side, panel, nextViewport);
    panel.x = nextFrame.x;
    if (Math.abs((Number(panel.y) || 0) - PANEL_LAYOUT_EDGE_OFFSET) <= 24) {
      panel.y = nextFrame.y;
    }
  }
}

function panelLayoutSideDiffersFromDefault(side) {
  const panel = state.panelLayout?.[side];
  if (!panel) return false;
  const defaultFrame = getDefaultPanelFrame(side, panel);
  return (
    Boolean(panel.hidden) ||
    Boolean(panel.collapsed) ||
    Math.abs((Number(panel.x) || 0) - defaultFrame.x) > 2 ||
    Math.abs((Number(panel.y) || 0) - defaultFrame.y) > 2 ||
    Math.abs((Number(panel.width) || 0) - defaultFrame.width) > 2 ||
    Math.abs((Number(panel.height) || 0) - defaultFrame.height) > 2
  );
}

function resetPanelLayoutSideToDefault(side) {
  const panel = state.panelLayout?.[side];
  if (!panel) return;
  const defaultFrame = getDefaultPanelFrame(side, panel);
  panel.x = defaultFrame.x;
  panel.y = defaultFrame.y;
  panel.width = defaultFrame.width;
  panel.height = defaultFrame.height;
  panel.hidden = false;
  panel.collapsed = false;
}

function readLegacyStagePanelsFromStorage() {
  try {
    const raw = localStorage.getItem(CONFIG.stagePanelsKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function syncLegacyStateFromPanelLayout() {
  const nextLayout = normalizePanelLayout(state.panelLayout, getPanelLayoutViewportOptions());
  state.panelLayout = nextLayout;
  state.leftPanelCollapsed = Boolean(nextLayout.left.collapsed);
  state.rightPanelCollapsed = Boolean(nextLayout.right.collapsed);
  state.stagePanels = {
    left: {
      x: Number(nextLayout.left.x) || 0,
      y: Number(nextLayout.left.y) || 0,
      hidden: Boolean(nextLayout.left.hidden || nextLayout.left.collapsed),
    },
    right: {
      x: Number(nextLayout.right.x) || 0,
      y: Number(nextLayout.right.y) || 0,
      hidden: Boolean(nextLayout.right.hidden || nextLayout.right.collapsed),
    },
  };
}

function buildSafeLegacyPanelLayout() {
  const fallbackLayout = createDefaultPanelLayout(getPanelLayoutViewportOptions());
  const legacyStagePanels = normalizeStagePanelState(readLegacyStagePanelsFromStorage());

  return normalizePanelLayout(
    {
      ...fallbackLayout,
      left: {
        ...fallbackLayout.left,
        x: legacyStagePanels.left.x,
        y: legacyStagePanels.left.y,
        hidden: false,
        collapsed: false,
      },
      right: {
        ...fallbackLayout.right,
        x: legacyStagePanels.right.x,
        y: legacyStagePanels.right.y,
        hidden: false,
        collapsed: false,
      },
    },
    getPanelLayoutViewportOptions()
  );
}

function isPanelLayoutSideVisible(sideLayout = {}) {
  return !Boolean(sideLayout.hidden) && !Boolean(sideLayout.collapsed) && Number(sideLayout.width) > 6;
}

function ensureUsablePanelLayout(layout) {
  const normalizedLayout = normalizePanelLayout(layout, getPanelLayoutViewportOptions());
  const hasVisibleMainPanel =
    isPanelLayoutSideVisible(normalizedLayout.left) || isPanelLayoutSideVisible(normalizedLayout.right);

  if (hasVisibleMainPanel) {
    return normalizedLayout;
  }

  return createDefaultPanelLayout(getPanelLayoutViewportOptions());
}

function persistLegacyPaneState() {
  localStorage.setItem(CONFIG.leftPanelWidthKey, String(Math.max(0, Number(state.panelLayout.left.width) || 0)));
  localStorage.setItem(CONFIG.rightPanelWidthKey, String(Math.max(0, Number(state.panelLayout.right.width) || 0)));
  localStorage.setItem(CONFIG.leftPanelCollapsedKey, String(Boolean(state.panelLayout.left.collapsed)));
  localStorage.setItem(CONFIG.rightPanelCollapsedKey, String(Boolean(state.panelLayout.right.collapsed)));
  localStorage.setItem(CONFIG.stagePanelsKey, JSON.stringify(state.stagePanels));
}

function loadPanelLayoutState() {
  state.panelLayout = ensureUsablePanelLayout(
    loadPanelLayout(localStorage, {
      ...getPanelLayoutViewportOptions(),
      migrateLegacy: buildSafeLegacyPanelLayout,
    })
  );
  syncLegacyStateFromPanelLayout();
}

function savePanelLayoutState() {
  savePanelLayout(localStorage, state.panelLayout);
  persistLegacyPaneState();
}

function getWorkbenchPreferencesFromState() {
  return pickWorkbenchPreferences(state.workbenchPreferences || state.uiSettings || {});
}

function buildPanelLayoutFromWorkbenchPreferences(preferences = getWorkbenchPreferencesFromState()) {
  const nextPreferences = normalizeWorkbenchPreferences(preferences);
  const nextLayout = createDefaultPanelLayout(getPanelLayoutViewportOptions());
  nextLayout.left.dockSide = nextPreferences.defaultCanvasPanelSide;
  nextLayout.right.dockSide = nextPreferences.defaultChatPanelSide;
  const viewport = getWorkspaceViewport();
  for (const side of ["left", "right"]) {
    const frame = getDefaultPanelFrameForViewport(side, nextLayout[side], viewport);
    nextLayout[side].x = frame.x;
    nextLayout[side].y = frame.y;
    nextLayout[side].width = frame.width;
    nextLayout[side].height = frame.height;
  }
  nextLayout.left.collapsed = !nextPreferences.defaultCanvasPanelVisible;
  nextLayout.right.collapsed = !nextPreferences.defaultChatPanelVisible;
  nextLayout.left.hidden = false;
  nextLayout.right.hidden = false;
  nextLayout.left.zIndex = nextPreferences.defaultCanvasPanelSide === "right" ? 14 : 10;
  nextLayout.right.zIndex = nextPreferences.defaultChatPanelSide === "right" ? 14 : 10;
  return normalizePanelLayout(nextLayout, getPanelLayoutViewportOptions());
}

function applyWorkbenchPreferencesToPanelLayout({ persist = true, announce = false } = {}) {
  state.panelLayout = buildPanelLayoutFromWorkbenchPreferences();
  applyPanelLayoutState({ persist });
  if (announce) {
    setStatus("已按习惯设置应用默认布局", "success");
  }
}

function clampPaneWidth(value, min, max) {
    return Math.min(Math.max(Number(value) || min, min), max);
  }

function resolveResponsivePaneWidths(left, right) {
  const workspaceWidth = workspaceEl?.clientWidth || Math.max(0, window.innerWidth - 40);
  let leftWidth = clampPaneWidth(left, CONFIG.leftPanelMinWidth, Math.min(CONFIG.leftPanelMaxWidth, workspaceWidth));
  let rightWidth = clampPaneWidth(right, CONFIG.rightPanelMinWidth, Math.min(CONFIG.rightPanelMaxWidth, workspaceWidth));

  const maxCombined = Math.max(0, workspaceWidth);

  let overflow = leftWidth + rightWidth - maxCombined;
  if (overflow > 0) {
    const leftReducible = Math.max(0, leftWidth - CONFIG.leftPanelMinWidth);
    const rightReducible = Math.max(0, rightWidth - CONFIG.rightPanelMinWidth);
    const totalReducible = leftReducible + rightReducible;
    if (totalReducible > 0) {
      const leftShare = leftReducible / totalReducible;
      const leftReduce = Math.min(leftReducible, Math.round(overflow * leftShare));
      leftWidth -= leftReduce;
      overflow -= leftReduce;
      const rightReduce = Math.min(rightReducible, overflow);
      rightWidth -= rightReduce;
      overflow -= rightReduce;
      if (overflow > 0 && leftWidth > CONFIG.leftPanelMinWidth) {
        leftWidth -= Math.min(leftWidth - CONFIG.leftPanelMinWidth, overflow);
      }
    }
  }

  return {
    left: leftWidth,
    right: rightWidth,
  };
}
  
function applyPaneWidths({ left, right }) {
  if (!workspaceEl) return;

  const { left: leftWidth, right: rightWidth } = resolveResponsivePaneWidths(left, right);
  state.panelLayout.left.width = leftWidth;
  state.panelLayout.right.width = rightWidth;
  if (!state.panelLayout.left.collapsed) {
    state.panelLayout.left.width = leftWidth;
  }
  if (!state.panelLayout.right.collapsed) {
    state.panelLayout.right.width = rightWidth;
  }
  applyPanelLayoutState();
}

function normalizeStagePanelState(input = {}) {
  const normalizeSide = (side) => ({
    x: Number.isFinite(Number(input?.[side]?.x)) ? Number(input[side].x) : 0,
    y: Number.isFinite(Number(input?.[side]?.y)) ? Number(input[side].y) : 0,
    hidden: Boolean(input?.[side]?.hidden),
  });

  return {
    left: normalizeSide("left"),
    right: normalizeSide("right"),
  };
}

function saveStagePanelsState() {
  state.panelLayout.left.x = Number(state.stagePanels.left?.x) || 0;
  state.panelLayout.left.y = Number(state.stagePanels.left?.y) || 0;
  state.panelLayout.left.hidden = Boolean(state.stagePanels.left?.hidden);
  state.panelLayout.right.x = Number(state.stagePanels.right?.x) || 0;
  state.panelLayout.right.y = Number(state.stagePanels.right?.y) || 0;
  state.panelLayout.right.hidden = Boolean(state.stagePanels.right?.hidden);
  savePanelLayoutState();
}

function clearStagePanelsState() {
  try {
    localStorage.removeItem(CONFIG.stagePanelsKey);
    localStorage.removeItem(CONFIG.panelLayoutKey);
    localStorage.removeItem(CONFIG.leftPanelCollapsedKey);
    localStorage.removeItem(CONFIG.rightPanelCollapsedKey);
    localStorage.removeItem(CONFIG.leftPanelWidthKey);
    localStorage.removeItem(CONFIG.rightPanelWidthKey);
  } catch {
    // Ignore transient storage failures and keep layout in memory.
  }
}

function loadStagePanelsState() {
  loadPanelLayoutState();
}

function clampStagePanelToViewport(side) {
  clampPanelLayoutSideToWorkspace(side);
}

function getStagePanelElement(side) {
  if (side === "left") return desktopClearStageEl;
  if (side === "right") return conversationPanel;
  return null;
}

function getStagePanelResizer(side) {
  if (side === "left") return leftPaneResizerEl;
  if (side === "right") return rightPaneResizerEl;
  return null;
}

function getStagePanelYResizer(side) {
  if (side === "left") return leftPaneYResizerEl;
  if (side === "right") return rightPaneYResizerEl;
  return null;
}

function shouldShowPaneVerticalHandle(side) {
  const panel = state.panelLayout?.[side];
  if (!panel) return false;
  if (panel.hidden || panel.collapsed) return false;
  if (state.desktopShellState?.fullClickThrough) return false;
  const { height: workspaceHeight } = getWorkspaceViewport();
  const panelHeight = Math.max(0, Number(panel.height) || getDefaultPanelFrame(side, panel).height);
  return panelHeight < Math.max(0, workspaceHeight - PANEL_LAYOUT_EDGE_OFFSET * 2 - 4);
}

function getPanelKeyByDockSide(dockSide) {
  const targetDockSide = dockSide === "right" ? "right" : "left";
  return state.panelLayout.left.dockSide === targetDockSide ? "left" : "right";
}

function setStagePanelFront(side) {
  const panel = state.panelLayout?.[side];
  if (!panel || panel.hidden || panel.collapsed) {
    return;
  }
  bringPanelToFront(side);
  refreshPanelLayoutVisualState();
}

function isStagePanelDetached(side) {
  const panel = state.panelLayout?.[side];
  if (!panel) return false;
  return Boolean(panel.hidden || panel.collapsed || panelLayoutSideDiffersFromDefault(side));
}

function renderStageRestoreDock() {
  const needsRestore = panelLayoutSideDiffersFromDefault("left") || panelLayoutSideDiffersFromDefault("right");

  stageRestoreDockEl?.classList.toggle("is-hidden", !needsRestore);
}

function renderPanelLayoutSide(side) {
  const panelState = state.panelLayout?.[side];
  const element = getStagePanelElement(side);
  const resizer = getStagePanelResizer(side);
  const yResizer = getStagePanelYResizer(side);
  if (!panelState || !element) return;

  const dockSide = panelState.dockSide === "right" ? "right" : "left";
  const isHidden = Boolean(panelState.hidden || panelState.collapsed);
  if (isHidden) {
    element.style.setProperty("display", "none", "important");
  } else {
    element.style.removeProperty("display");
  }
  element.style.left = `${Math.round(Number(panelState.x) || 0)}px`;
  element.style.top = `${Math.round(Number(panelState.y) || 0)}px`;
  element.style.width = `${Math.round(Math.max(0, Number(panelState.width) || 0))}px`;
  element.style.height = `${Math.round(Math.max(0, Number(panelState.height) || 0))}px`;
  element.style.zIndex = String(Math.max(1, Number(panelState.zIndex) || (side === "left" ? 10 : 14)));
  element.classList.toggle("is-stage-hidden", isHidden);
  element.classList.toggle("is-pane-collapsed", Boolean(panelState.collapsed));

  if (resizer) {
    const resizerLeft = dockSide === "right"
      ? Math.round(Number(panelState.x) || 0) - (PANEL_RESIZER_SIZE - PANEL_RESIZER_CORNER_OFFSET)
      : Math.round((Number(panelState.x) || 0) + (Number(panelState.width) || 0) - PANEL_RESIZER_CORNER_OFFSET);
    resizer.style.left = `${resizerLeft}px`;
    resizer.style.top = `${Math.round((Number(panelState.y) || 0) + (Number(panelState.height) || 0) - PANEL_RESIZER_CORNER_OFFSET)}px`;
    resizer.style.width = `${PANEL_RESIZER_SIZE}px`;
    resizer.style.height = `${PANEL_RESIZER_SIZE}px`;
    resizer.style.zIndex = String(Math.max(2, Number(panelState.zIndex) || 2) + 1);
    resizer.classList.toggle("is-left-corner", dockSide === "right");
    resizer.classList.toggle("is-hidden", isHidden);
  }

  if (yResizer) {
    yResizer.style.zIndex = String(Math.max(2, Number(panelState.zIndex) || 2) + 2);
    yResizer.classList.toggle("is-left-pane", dockSide === "left");
    yResizer.classList.toggle("is-right-pane", dockSide === "right");
    yResizer.classList.toggle("is-hidden", isHidden || !shouldShowPaneVerticalHandle(side));
  }
}

function syncPanelDependentUi(side, { syncShape = false } = {}) {
  scheduleConversationShellMenuLayoutSync();
  scheduleScreenSourceHeaderMenuLayoutSync();
  scheduleScreenSourceToolbarLayoutSync();
  scheduleRightPanelWindowSliderSync();
  syncDesktopPassThroughHintLayout();
  syncEmbeddedWindowOverlayVisibility();

  if (side === "right") {
    scheduleEmbeddedScreenSourceSync();
  }

  if (syncShape) {
    requestPanelLayoutShapeSync();
  }
}

function schedulePanelDependentUiSync(side, options = {}) {
  if (panelTransformDependentSyncFrame) {
    window.cancelAnimationFrame(panelTransformDependentSyncFrame);
  }

  panelTransformDependentSyncFrame = window.requestAnimationFrame(() => {
    panelTransformDependentSyncFrame = 0;
    syncPanelDependentUi(side, options);
  });
}

function refreshPanelLayoutVisualState() {
  const sides = ["left", "right"];
  for (const side of sides) {
    renderPanelLayoutSide(side);
  }

  renderStageRestoreDock();
  syncPaneVisibility({ syncShape: false });
  syncEmbeddedWindowOverlayVisibility();
  scheduleConversationShellMenuLayoutSync();
  scheduleScreenSourceHeaderMenuLayoutSync();
  syncDesktopPassThroughHintLayout();
}

function applyStagePanelsState({ persist = true, syncShape = true } = {}) {
  state.panelLayout.left.x = Number(state.stagePanels.left?.x) || 0;
  state.panelLayout.left.y = Number(state.stagePanels.left?.y) || 0;
  state.panelLayout.left.hidden = Boolean(state.stagePanels.left?.hidden);
  state.panelLayout.right.x = Number(state.stagePanels.right?.x) || 0;
  state.panelLayout.right.y = Number(state.stagePanels.right?.y) || 0;
  state.panelLayout.right.hidden = Boolean(state.stagePanels.right?.hidden);
  applyPanelLayoutState({ persist, syncShape });
}

function applyPanelLayoutState({ persist = true, syncShape = true } = {}) {
  if (!workspaceEl) return;

  const previousViewport = lastPanelLayoutViewportSize;
  const nextViewport = getWorkspaceViewport();
  state.panelLayout = normalizePanelLayout(state.panelLayout, getPanelLayoutViewportOptions());
  realignDockedPanelsForViewportChange(previousViewport, nextViewport);
  const sides = ["left", "right"];
  for (const side of sides) {
    clampStagePanelToViewport(side);
  }
  syncLegacyStateFromPanelLayout();
  workspaceEl.classList.toggle("is-panels-swapped", isPanelLayoutSwapped(state.panelLayout));
  refreshPanelLayoutVisualState();
  if (persist) {
    savePanelLayoutState();
  }
  if (syncShape) {
    requestPanelLayoutFinalShapeSync();
  }
  lastPanelLayoutViewportSize = nextViewport;
}

function resetStagePanelsToDefault({ persist = true, announce = false } = {}) {
  state.panelLayout = createDefaultPanelLayout(getPanelLayoutViewportOptions());
  resetPanelLayoutSideToDefault("left");
  resetPanelLayoutSideToDefault("right");
  applyPanelLayoutState({ persist });
  if (announce) {
    setStatus("已恢复默认布局", "success");
  }
}

function restoreDefaultStagePanels() {
  applyWorkbenchPreferencesToPanelLayout({ persist: true, announce: true });
}

function setStagePanelHidden(side, hidden) {
  if (!state.panelLayout[side]) return;
  state.panelLayout[side].hidden = Boolean(hidden);
  applyPanelLayoutState();
}

function resetStagePanelPosition(side) {
  if (!state.panelLayout[side]) return;
  resetPanelLayoutSideToDefault(side);
  applyPanelLayoutState();
}

function beginStagePanelMove(side, event) {
  const element = getStagePanelElement(side);
  const panelState = state.panelLayout[side];
  if (!element || !panelState || panelState.hidden || panelState.collapsed || state.desktopShellState.pinned) return;
  const dragHandle = event.currentTarget instanceof Element ? event.currentTarget : null;

  event.preventDefault();
  event.stopPropagation();
  bringPanelToFront(side);

  const initialX = panelState.x;
  const initialY = panelState.y;
  const startX = event.clientX;
  const startY = event.clientY;
  const { width: workspaceWidth, height: workspaceHeight } = getWorkspaceViewport();

  const handleMove = (moveEvent) => {
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    panelState.x = Math.round(
      Math.min(
        Math.max(PANEL_LAYOUT_EDGE_OFFSET, initialX + deltaX),
        Math.max(PANEL_LAYOUT_EDGE_OFFSET, workspaceWidth - panelState.width - PANEL_LAYOUT_EDGE_OFFSET)
      )
    );
    panelState.y = Math.round(
      Math.min(
        Math.max(PANEL_LAYOUT_EDGE_OFFSET, initialY + deltaY),
        Math.max(PANEL_LAYOUT_EDGE_OFFSET, workspaceHeight - panelState.height - PANEL_LAYOUT_EDGE_OFFSET)
      )
    );
    clampPanelLayoutSideToWorkspace(side);
    renderPanelLayoutSide(side);
    schedulePanelDependentUiSync(side, { syncShape: true });
  };

  const handleUp = () => {
    document.removeEventListener("pointermove", handleMove);
    document.removeEventListener("pointerup", handleUp);
    dragHandle?.releasePointerCapture?.(event.pointerId);
    document.body.classList.remove("is-resizing");
    document.body.classList.remove("is-stage-dragging");
    saveStagePanelsState();
    requestPanelLayoutFinalShapeSync();
  };

  dragHandle?.setPointerCapture?.(event.pointerId);
  document.body.classList.add("is-stage-dragging");
  document.body.classList.add("is-resizing");
  document.addEventListener("pointermove", handleMove);
  document.addEventListener("pointerup", handleUp, { once: true });
}

function syncPaneVisibility({ syncShape = true } = {}) {
  if (!workspaceEl) return;

  const leftDockPanelKey = getPanelKeyByDockSide("left");
  const rightDockPanelKey = getPanelKeyByDockSide("right");
  const leftDockPanel = state.panelLayout?.[leftDockPanelKey];
  const rightDockPanel = state.panelLayout?.[rightDockPanelKey];
  const leftDockCollapsed = Boolean(leftDockPanel?.collapsed || leftDockPanel?.hidden);
  const rightDockCollapsed = Boolean(rightDockPanel?.collapsed || rightDockPanel?.hidden);
  const canvasPanelCollapsed = Boolean(state.panelLayout?.left?.collapsed || state.panelLayout?.left?.hidden);
  const chatPanelCollapsed = Boolean(state.panelLayout?.right?.collapsed || state.panelLayout?.right?.hidden);

  workspaceEl.classList.toggle("left-collapsed", leftDockCollapsed);
  workspaceEl.classList.toggle("right-collapsed", rightDockCollapsed);
  sidePanelEl?.classList.toggle("is-collapsed", canvasPanelCollapsed);
  conversationPanel?.classList.toggle("is-collapsed", chatPanelCollapsed);
  desktopClearStageEl?.classList.toggle("is-pane-collapsed", canvasPanelCollapsed);
  conversationPanel?.classList.toggle("is-pane-collapsed", chatPanelCollapsed);
  leftPaneResizerEl?.classList.toggle("is-hidden", Boolean(state.panelLayout.left?.collapsed || state.panelLayout.left?.hidden));
  rightPaneResizerEl?.classList.toggle("is-hidden", Boolean(state.panelLayout.right?.collapsed || state.panelLayout.right?.hidden));

  restoreLeftPaneBtn?.classList.toggle("is-hidden", !state.leftPanelCollapsed);
  restoreRightPaneBtn?.classList.toggle("is-hidden", !state.rightPanelCollapsed);
  if (restoreLeftPaneBtn) {
    restoreLeftPaneBtn.textContent = "抽出画板";
    restoreLeftPaneBtn.classList.toggle("pane-restore-btn-right", state.panelLayout.left.dockSide === "right");
  }
  if (restoreRightPaneBtn) {
    restoreRightPaneBtn.textContent = "抽出对话";
    restoreRightPaneBtn.classList.toggle("pane-restore-btn-right", state.panelLayout.right.dockSide === "right");
  }

  if (toggleLeftPaneBtn) {
    toggleLeftPaneBtn.textContent = state.leftPanelCollapsed ? "展开菜单" : "收起菜单";
  }
  if (toggleRightPaneBtn) {
    toggleRightPaneBtn.textContent = state.rightPanelCollapsed ? "展开对话" : "收起对话";
  }

  if (syncShape) {
    requestPanelLayoutShapeSync();
  }
}

function setPaneCollapsed(side, collapsed) {
  const next = Boolean(collapsed);
  const panel = state.panelLayout?.[side];
  if (!panel) return;
  panel.collapsed = next;
  panel.hidden = false;
  if (!next) {
    if (!Number.isFinite(Number(panel.width)) || Number(panel.width) <= 0) {
      panel.width = getDefaultPanelFrame(side, panel).width;
    }
    if (!Number.isFinite(Number(panel.height)) || Number(panel.height) <= 0) {
      panel.height = getDefaultPanelFrame(side, panel).height;
    }
  }
  applyPanelLayoutState();
}

function getWorkspaceAvailableWidth() {
  return Math.max(0, Number(workspaceEl?.clientWidth) || Number(window.innerWidth) || 0);
}

function resizePaneToHalfScreen(side) {
  const workspaceWidth = getWorkspaceAvailableWidth();
  const workspaceHeight = getWorkspaceViewport().height;
  if (!workspaceWidth || !workspaceHeight) return;
  const panel = state.panelLayout?.[side];
  if (!panel) return;
  const targetWidth = Math.max(320, Math.round(workspaceWidth / 2));
  panel.hidden = false;
  panel.collapsed = false;
  panel.width = targetWidth;
  panel.height = workspaceHeight;
  panel.x = panel.dockSide === "right" ? Math.max(0, workspaceWidth - targetWidth) : 0;
  panel.y = 0;
  bringPanelToFront(side);
  applyPanelLayoutState();
}

function expandPaneToFullscreen(side) {
  const { width: workspaceWidth, height: workspaceHeight } = getWorkspaceViewport();
  if (!workspaceWidth || !workspaceHeight) return;

  const panel = state.panelLayout?.[side];
  const otherSide = side === "left" ? "right" : "left";
  if (!panel || !state.panelLayout?.[otherSide]) return;

  panel.hidden = false;
  panel.collapsed = false;
  panel.x = 0;
  panel.y = 0;
  panel.width = workspaceWidth;
  panel.height = workspaceHeight;
  state.panelLayout[otherSide].collapsed = true;
  state.panelLayout[otherSide].hidden = false;
  bringPanelToFront(side);
  applyPanelLayoutState();
}

async function swapMainPanels() {
  const currentLayout = normalizePanelLayout(state.panelLayout, getPanelLayoutViewportOptions());
  const nextLayout = swapPanelLayoutDockSides(currentLayout);
  const leftFrame = getDefaultPanelFrame("left", nextLayout.left);
  const rightFrame = getDefaultPanelFrame("right", nextLayout.right);

  nextLayout.left.x = leftFrame.x;
  nextLayout.right.x = rightFrame.x;

  if (Math.abs((Number(currentLayout.left.y) || 0) - PANEL_LAYOUT_EDGE_OFFSET) <= 24) {
    nextLayout.left.y = leftFrame.y;
  }
  if (Math.abs((Number(currentLayout.right.y) || 0) - PANEL_LAYOUT_EDGE_OFFSET) <= 24) {
    nextLayout.right.y = rightFrame.y;
  }

  state.panelLayout = nextLayout;
  applyPanelLayoutState();
  setStatus("左右主界面已换位", "success");
}

function syncStagePanelOrbLabels() {
  stagePanelActionEls.forEach((actionEl) => {
    const side = actionEl.dataset.stagePanelSide;
    const action = actionEl.dataset.stagePanelAction;
    if (!side || !action) return;
    const sideLabel = side === "left" ? "左侧" : "右侧";
    if (action === "close") {
      actionEl.title = `收回${sideLabel}界面`;
      actionEl.setAttribute("aria-label", `收回${sideLabel}界面`);
      return;
    }
    if (action === "reset") {
      actionEl.title = `${sideLabel}界面全屏显示`;
      actionEl.setAttribute("aria-label", `${sideLabel}界面全屏显示`);
    }
  });

  stagePanelDragEls.forEach((triggerEl) => {
    const side = triggerEl.dataset.stagePanelDrag;
    if (!side) return;
    triggerEl.title = "左右界面换位";
    triggerEl.setAttribute("aria-label", "左右界面换位");
  });
}

function beginPaneResize(side, startX, startY, pointerId) {
  const panel = state.panelLayout?.[side];
  if (!panel) return;
  const resizerEl = side === "left" ? leftPaneResizerEl : rightPaneResizerEl;
  if (panel.collapsed || panel.hidden) {
    setPaneCollapsed(side, false);
  }
  bringPanelToFront(side);

  const dockSide = panel.dockSide === "right" ? "right" : "left";
  const initialWidth = Number(panel.width) || getDefaultPanelFrame(side, panel).width;
  const initialHeight = Number(panel.height) || getDefaultPanelFrame(side, panel).height;
  const initialX = Number(panel.x) || 0;
  const initialRight = initialX + initialWidth;
  const { width: workspaceWidth, height: workspaceHeight } = getWorkspaceViewport();
  const minWidth = Math.max(320, side === "left" ? CONFIG.leftPanelMinWidth : CONFIG.rightPanelMinWidth);
  const sideMaxWidth = side === "left" ? CONFIG.leftPanelMaxWidth : CONFIG.rightPanelMaxWidth;
  const maxWidth = Math.min(sideMaxWidth, Math.max(minWidth, workspaceWidth - panel.x));
  const minHeight = Math.min(PANEL_LAYOUT_MIN_HEIGHT, Math.max(PANEL_LAYOUT_MIN_HEIGHT, workspaceHeight));
  const maxHeight = Math.max(minHeight, workspaceHeight - panel.y);

  const handleMove = (event) => {
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (dockSide === "right") {
      const proposedWidth = clampPaneWidth(initialWidth - deltaX, minWidth, Math.min(sideMaxWidth, Math.max(minWidth, initialRight)));
      panel.width = proposedWidth;
      panel.x = Math.round(initialRight - proposedWidth);
    } else {
      panel.width = clampPaneWidth(initialWidth + deltaX, minWidth, maxWidth);
    }
    panel.height = clampPaneWidth(initialHeight + deltaY, minHeight, maxHeight);
    panel.collapsed = false;
    panel.hidden = false;
    clampPanelLayoutSideToWorkspace(side);
    renderPanelLayoutSide(side);
    schedulePanelDependentUiSync(side, { syncShape: true });
  };

  const handleUp = () => {
    document.removeEventListener("pointermove", handleMove);
    document.removeEventListener("pointerup", handleUp);
    resizerEl?.releasePointerCapture?.(pointerId);
    document.body.classList.remove("is-resizing");
    savePanelLayoutState();
    requestPanelLayoutFinalShapeSync();
  };

  resizerEl?.setPointerCapture?.(pointerId);

  document.body.classList.add("is-resizing");
  document.addEventListener("pointermove", handleMove);
  document.addEventListener("pointerup", handleUp, { once: true });
}

function beginPaneVerticalMove(side, startY, pointerId) {
  const panelState = state.panelLayout?.[side];
  if (!panelState) return;
  const yResizerEl = getStagePanelYResizer(side);
  const element = getStagePanelElement(side);
  if (!element) return;
  if (panelState.collapsed || panelState.hidden) {
    setPaneCollapsed(side, false);
  }
  const activePanelState = state.panelLayout?.[side];
  if (!activePanelState) return;
  bringPanelToFront(side);

  const initialY = Number(activePanelState.y) || 0;
  const { height: workspaceHeight } = getWorkspaceViewport();
  const panelHeight = Math.max(0, Number(activePanelState.height) || getDefaultPanelFrame(side, activePanelState).height);
  const minY = PANEL_LAYOUT_EDGE_OFFSET;
  const maxY = Math.max(minY, workspaceHeight - panelHeight - PANEL_LAYOUT_EDGE_OFFSET);

  const handleMove = (event) => {
    const deltaY = event.clientY - startY;
    const nextY = Math.round(Math.min(maxY, Math.max(minY, initialY + deltaY)));
    activePanelState.y = nextY;
    activePanelState.collapsed = false;
    activePanelState.hidden = false;
    element.style.top = `${nextY}px`;
    schedulePanelDependentUiSync(side, { syncShape: true });
  };

  const handleUp = () => {
    document.removeEventListener("pointermove", handleMove, true);
    document.removeEventListener("pointerup", handleUp);
    yResizerEl?.releasePointerCapture?.(pointerId);
    document.body.classList.remove("is-pane-y-resizing");
    document.body.classList.remove("is-stage-dragging");
    savePanelLayoutState();
    requestPanelLayoutFinalShapeSync();
  };

  yResizerEl?.setPointerCapture?.(pointerId);
  document.body.classList.add("is-pane-y-resizing");
  document.body.classList.add("is-stage-dragging");
  document.addEventListener("pointermove", handleMove, true);
  document.addEventListener("pointerup", handleUp, { once: true });
}

async function initializeDesktopShell() {
  if (!IS_DESKTOP_APP) {
    renderShortcutSettings();
    return;
  }

  desktopShellControlsEl?.classList.remove("is-hidden");
  desktopWindowBarEl?.classList.add("is-visible");
  setDesktopMenuOpen(false);
  removeDesktopShellStateListener?.();
  removeDesktopShellStateListener = DESKTOP_SHELL?.onStateChange?.((nextState) => {
    syncDesktopShellState(nextState);
  });
  await refreshShortcutSettings();
  await refreshDesktopShellState();
  const shouldLaunchFullscreen = Boolean(state.uiSettings?.defaultLaunchFullscreen);
  if (Boolean(state.desktopShellState.fullscreen) !== shouldLaunchFullscreen && DESKTOP_SHELL?.toggleFullscreen) {
    await DESKTOP_SHELL.toggleFullscreen();
    await refreshDesktopShellState();
  }
  await setDesktopClickThrough(false);
  scheduleDesktopWindowShapeSync();
}

function applyFullClickThroughUiState(enabled) {
  document.body.classList.toggle("desktop-full-pass-through", Boolean(enabled));

  if (enabled) {
    setDesktopMenuOpen(false);
    setConversationShellMenuOpen(false);
    closeConversationModelMenu();
    setDrawerOpen(false);
    closeScreenSourceTargetMenu();
    closeScreenSourceHeaderMenu();
    closeScreenSourceOverflowMenu();
    void globalTutorialHost?.runtime?.closeTutorial?.();
  }

  syncEmbeddedWindowOverlayVisibility();
  scheduleDesktopWindowShapeSync();
}

function syncDesktopPassThroughHintLayout() {
  if (!desktopPassThroughHintEl) {
    return;
  }

  const viewportPadding = 14;
  desktopPassThroughHintEl.style.setProperty("right", `${viewportPadding}px`);
  desktopPassThroughHintEl.style.setProperty("top", `${Math.round(window.innerHeight / 2)}px`);
  desktopPassThroughHintEl.style.removeProperty("left");
}

function syncDesktopShellState(nextState = {}) {
  const clickThrough = Boolean(nextState?.clickThrough);
  const nextFullClickThrough = clickThrough;
  const previousFullscreen = Boolean(state.desktopShellState.fullscreen);

  state.desktopShellState.pinned = Boolean(nextState?.pinned);
  state.desktopShellState.fullscreen = Boolean(nextState?.fullscreen);
  state.desktopShellState.clickThrough = clickThrough;

  if (state.desktopShellState.fullClickThrough !== nextFullClickThrough) {
    state.desktopShellState.fullClickThrough = nextFullClickThrough;
    applyFullClickThroughUiState(nextFullClickThrough);
  }

  desktopPinBtn?.classList.toggle("is-active", state.desktopShellState.pinned);
  desktopFullscreenBtn?.classList.toggle("is-active", state.desktopShellState.fullscreen);
  desktopClickThroughBtn?.classList.toggle("is-active", state.desktopShellState.fullClickThrough);

  if (desktopPinBtn) {
    desktopPinBtn.textContent = state.desktopShellState.pinned ? "取消固定" : "固定";
  }
  if (desktopFullscreenBtn) {
    desktopFullscreenBtn.textContent = state.desktopShellState.fullscreen ? "关闭全屏" : "开启全屏";
  }
  if (desktopClickThroughBtn) {
    desktopClickThroughBtn.textContent = state.desktopShellState.fullClickThrough ? "退出完全穿透" : "完全穿透";
  }

  desktopStatusBannerEl?.classList.toggle("is-hidden", !state.desktopShellState.pinned);
  if (desktopStatusBannerTextEl) {
    desktopStatusBannerTextEl.textContent = state.desktopShellState.pinned ? "固定中 · 始终置顶" : "";
  }
  document.body?.classList.toggle("is-desktop-pinned", state.desktopShellState.pinned);
  desktopPassThroughHintEl?.classList.toggle("is-hidden", !state.desktopShellState.fullClickThrough);
  renderConversationShellMenuState();
  syncDesktopPassThroughHintLayout();

  if (!previousFullscreen && state.desktopShellState.fullscreen) {
    applyWorkbenchPreferencesToPanelLayout({ persist: true, announce: false });
  }
}

function getClickThroughShortcutDisplay() {
  return String(state.shortcutSettings?.clickThroughDisplay || "").trim() || DEFAULT_CLICK_THROUGH_DISPLAY;
}

function renderShortcutSettings() {
  const display = getClickThroughShortcutDisplay();
  const accelerator =
    String(state.shortcutSettings?.clickThroughAccelerator || "").trim() || DEFAULT_CLICK_THROUGH_ACCELERATOR;

  if (clickThroughShortcutInputEl && document.activeElement !== clickThroughShortcutInputEl) {
    clickThroughShortcutInputEl.value = display;
  }
  if (clickThroughShortcutStatusEl) {
    clickThroughShortcutStatusEl.textContent = `当前快捷键：${display}`;
  }
  if (desktopPassThroughCopyEl) {
    desktopPassThroughCopyEl.textContent = `按 ${display} 退出`;
  }
  if (conversationShellClickThroughNoteEl) {
    conversationShellClickThroughNoteEl.textContent = `穿透模式开启后，可按 ${display} 退出或恢复。`;
  }
  if (clickThroughShortcutNoteEl) {
    clickThroughShortcutNoteEl.textContent = `当前用于切换完全穿透，正在使用 ${display}。`;
  }
  if (clickThroughShortcutInputEl?.dataset.accelerator !== accelerator) {
    clickThroughShortcutInputEl.dataset.accelerator = accelerator;
  }
  renderWorkbenchHabitSettings();
}

function getWorkbenchHabitDraft() {
  const canvasSide = normalizeWorkbenchPanelSide(
    defaultCanvasPanelSideSelectEl?.value || state.uiSettings?.defaultCanvasPanelSide,
    DEFAULT_WORKBENCH_PREFERENCES.defaultCanvasPanelSide
  );
  return normalizeWorkbenchPreferences({
    defaultCanvasPanelSide: canvasSide,
    defaultCanvasPanelVisible: defaultCanvasPanelVisibleInputEl
      ? defaultCanvasPanelVisibleInputEl.checked
      : state.uiSettings?.defaultCanvasPanelVisible,
    defaultChatPanelVisible: defaultChatPanelVisibleInputEl
      ? defaultChatPanelVisibleInputEl.checked
      : state.uiSettings?.defaultChatPanelVisible,
    defaultLaunchFullscreen: defaultLaunchFullscreenInputEl
      ? defaultLaunchFullscreenInputEl.checked
      : state.uiSettings?.defaultLaunchFullscreen,
  });
}

function renderWorkbenchHabitSettings() {
  const preferences = getWorkbenchPreferencesFromState();
  const canvasSideLabel = preferences.defaultCanvasPanelSide === "right" ? "画布在右" : "画布在左";
  const visibleLabels = [
    preferences.defaultCanvasPanelVisible ? "画布默认展开" : "画布默认收起",
    preferences.defaultChatPanelVisible ? "对话默认展开" : "对话默认收起",
    preferences.defaultLaunchFullscreen ? "启动默认全屏" : "启动默认窗口",
  ];
  if (defaultCanvasPanelSideSelectEl && document.activeElement !== defaultCanvasPanelSideSelectEl) {
    defaultCanvasPanelSideSelectEl.value = preferences.defaultCanvasPanelSide;
  }
  if (defaultCanvasPanelVisibleInputEl && document.activeElement !== defaultCanvasPanelVisibleInputEl) {
    defaultCanvasPanelVisibleInputEl.checked = preferences.defaultCanvasPanelVisible;
  }
  if (defaultChatPanelVisibleInputEl && document.activeElement !== defaultChatPanelVisibleInputEl) {
    defaultChatPanelVisibleInputEl.checked = preferences.defaultChatPanelVisible;
  }
  if (defaultLaunchFullscreenInputEl && document.activeElement !== defaultLaunchFullscreenInputEl) {
    defaultLaunchFullscreenInputEl.checked = preferences.defaultLaunchFullscreen;
  }
  if (habitSettingsSummaryEl) {
    habitSettingsSummaryEl.textContent = `${canvasSideLabel} · ${visibleLabels.join(" / ")} · 快捷键 ${getClickThroughShortcutDisplay()}`;
  }
  if (workbenchHabitStatusEl) {
    workbenchHabitStatusEl.textContent = `当前默认：${canvasSideLabel}，${visibleLabels.join("，")}`;
  }
}

function previewWorkbenchHabitDraft() {
  const preferences = getWorkbenchHabitDraft();
  state.workbenchPreferences = pickWorkbenchPreferences(preferences);
  state.uiSettings = normalizeUiSettings({
    ...state.uiSettings,
    ...state.workbenchPreferences,
  });
  renderWorkbenchHabitSettings();
  requestPanelLayoutFinalShapeSync();
}

async function refreshShortcutSettings() {
  if (!IS_DESKTOP_APP || !DESKTOP_SHELL?.getShortcutSettings) {
    state.shortcutSettings = normalizeShortcutSettings(state.shortcutSettings);
    renderShortcutSettings();
    return state.shortcutSettings;
  }

  try {
    const response = await DESKTOP_SHELL.getShortcutSettings();
    state.shortcutSettings = normalizeShortcutSettings(response?.settings || {});
  } catch {
    state.shortcutSettings = normalizeShortcutSettings(state.shortcutSettings);
  }

  renderShortcutSettings();
  return state.shortcutSettings;
}

async function refreshDesktopShellState() {
  if (!IS_DESKTOP_APP || !DESKTOP_SHELL?.getState) {
    return;
  }

  try {
    const nextState = await DESKTOP_SHELL.getState();
    syncDesktopShellState(nextState);
  } catch {
    state.desktopShellState = {
      pinned: false,
      fullscreen: false,
      clickThrough: false,
      fullClickThrough: false,
    };
    applyFullClickThroughUiState(false);
    if (desktopPinBtn) {
      desktopPinBtn.textContent = "固定";
    }
    if (desktopFullscreenBtn) {
      desktopFullscreenBtn.textContent = "开启全屏";
    }
    if (desktopClickThroughBtn) {
      desktopClickThroughBtn.textContent = "完全穿透";
    }
    desktopStatusBannerEl?.classList.add("is-hidden");
    desktopPassThroughHintEl?.classList.add("is-hidden");
    renderConversationShellMenuState();
  }
}

async function setDesktopClickThrough(enabled) {
  if (!IS_DESKTOP_APP || !DESKTOP_SHELL?.setClickThrough) {
    return;
  }

  if (state.desktopShellState.clickThrough === Boolean(enabled)) {
    return;
  }

  desktopSurfaceSyncPromise = desktopSurfaceSyncPromise
    .catch(() => {})
    .then(async () => {
      const nextState = await DESKTOP_SHELL.setClickThrough(enabled);
      syncDesktopShellState(nextState);
    });

  return desktopSurfaceSyncPromise;
}

async function exitDesktopClickThroughFromShortcut() {
  if (!IS_DESKTOP_APP || !DESKTOP_SHELL?.setClickThrough || !state.desktopShellState.fullClickThrough) {
    return false;
  }

  try {
    await setDesktopClickThrough(false);
    await refreshDesktopShellState();
    if (!state.desktopShellState.fullClickThrough) {
      setStatus("已退出完全穿透，已恢复正常交互。", "success");
    }
    return true;
  } catch (error) {
    setStatus(`退出完全穿透失败：${error.message}`, "warning");
    return false;
  }
}

async function syncDesktopSurfaceInteraction(target, { force = false, activatePanel = false } = {}) {
  if (!IS_DESKTOP_APP || state.desktopShellState.fullClickThrough) {
    return;
  }

  const targetEl = target instanceof Element ? target : null;
  if (activatePanel) {
    if (targetEl?.closest?.(".desktop-clear-stage")) {
      setStagePanelFront("left");
    } else if (targetEl?.closest?.(".conversation-panel")) {
      setStagePanelFront("right");
    }
  }

  if (!force && state.desktopShellState.clickThrough === false) {
    return;
  }

  try {
    await setDesktopClickThrough(false);
  } catch {
    // Ignore transient IPC errors during pointer transitions.
  }
}

function getElementShapeRect(element, padding = 0) {
  if (!(element instanceof Element) || element.classList.contains("is-hidden")) {
    return null;
  }
  if (
    element.classList.contains("is-stage-hidden") ||
    element.classList.contains("is-pane-collapsed") ||
    element.classList.contains("is-collapsed")
  ) {
    return null;
  }

  const style = window.getComputedStyle(element);
  const shapeIncluded = isElementIncludedInWindowShape(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return null;
  }
  if (!shapeIncluded && style.pointerEvents === "none") {
    return null;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return null;
  }

  const left = Math.max(0, Math.floor(rect.left - padding));
  const top = Math.max(0, Math.floor(rect.top - padding));
  const right = Math.min(window.innerWidth, Math.ceil(rect.right + padding));
  const bottom = Math.min(window.innerHeight, Math.ceil(rect.bottom + padding));

  if (right - left < 2 || bottom - top < 2) {
    return null;
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function getOpenDrawerShapeRect() {
  if (!state.drawerOpen || !(insightDrawerEl instanceof Element)) {
    return null;
  }

  const rect = getElementShapeRect(insightDrawerEl, 12);
  if (rect) {
    return rect;
  }

  const viewportWidth = Math.max(2, Number(window.innerWidth) || 0);
  const viewportHeight = Math.max(2, Number(window.innerHeight) || 0);
  const fallbackWidth = Math.min(460, Math.max(2, viewportWidth - 32));
  return {
    x: Math.max(0, Math.floor(viewportWidth - fallbackWidth - 8)),
    y: 0,
    width: Math.min(viewportWidth, Math.ceil(fallbackWidth + 8)),
    height: viewportHeight,
  };
}

function getBaseDesktopWindowShapeElements() {
  const elements = [
    { element: desktopClearStageEl, padding: 4 },
    { element: sidePanelEl, padding: 2 },
    { element: leftPaneResizerEl, padding: 2 },
    { element: rightPaneResizerEl, padding: 2 },
    { element: conversationPanel, padding: 2 },
    { element: stageRestoreDockEl, padding: 6 },
    { element: desktopShellControlsEl, padding: 6 },
    { element: desktopStatusBannerEl, padding: 4 },
    { element: appGlobalShellActionsEl, padding: 6 },
    { element: restoreLeftPaneBtn, padding: 6 },
    { element: restoreRightPaneBtn, padding: 6 },
    { element: insightDrawerHandleEl, padding: 4 },
  ];
  return elements;
}

function collectDesktopWindowShapeRects() {
  if (document.body?.classList.contains("boot-shape-lock")) {
    return [
      {
        x: 0,
        y: 0,
        width: Math.max(2, window.innerWidth),
        height: Math.max(2, window.innerHeight),
      },
    ];
  }

  if (canvasImageLightboxEl && !canvasImageLightboxEl.classList.contains("is-hidden")) {
    return [
      {
        x: 0,
        y: 0,
        width: Math.max(2, window.innerWidth),
        height: Math.max(2, window.innerHeight),
      },
    ];
  }

  const rects = collectWindowShapeRects({
    baseElements: getBaseDesktopWindowShapeElements(),
    overlayRoot: globalOverlayLayerEl,
    getElementShapeRect,
  });
  const drawerRect = getOpenDrawerShapeRect();
  if (drawerRect) {
    rects.push(drawerRect);
  }
  return rects;
}

function bindDesktopWindowShapeAutoSync() {
  windowShapeAutoSyncDisposers.splice(0).forEach((dispose) => {
    try {
      dispose();
    } catch {
      // Ignore teardown failures during rebinding.
    }
  });

  const register = (dispose) => {
    if (typeof dispose === "function") {
      windowShapeAutoSyncDisposers.push(dispose);
    }
  };

  register(
    bindMarkedWindowShapeAutoSync({
      rootElement: globalOverlayLayerEl,
      scheduleSync: scheduleDesktopWindowShapeSync,
    })
  );

  [
    desktopMenuPanel,
    desktopStatusBannerEl,
    insightDrawerEl,
  ].forEach((element) => {
    register(
      bindWindowShapeAutoSync({
        element,
        scheduleSync: scheduleDesktopWindowShapeSync,
        observeSubtree: true,
      })
    );
  });
}

async function syncDesktopWindowShape() {
  if (!IS_DESKTOP_APP || !DESKTOP_SHELL?.setWindowShape || state.desktopShellState.fullClickThrough) {
    return;
  }

  try {
    await DESKTOP_SHELL.setWindowShape(collectDesktopWindowShapeRects());
  } catch {
    // Keep the widget usable even if shape sync fails.
  }
}

function requestPanelLayoutShapeSync() {
  scheduleDesktopWindowShapeSync();
}

function requestPanelLayoutFinalShapeSync(delayMs = 32) {
  desktopWindowShapeScheduler.requestFinalShapeSync(delayMs);
}

function requestDrawerWindowShapeFinalSync() {
  scheduleDesktopWindowShapeSync();
  desktopWindowShapeScheduler.requestFinalShapeSync(260);
}

function scheduleDesktopWindowShapeSync() {
  desktopWindowShapeScheduler.scheduleSync();
}

function scheduleWorkspaceResizeRefresh() {
  if (workspaceResizeRefreshFrame) {
    window.cancelAnimationFrame(workspaceResizeRefreshFrame);
  }

  workspaceResizeRefreshFrame = window.requestAnimationFrame(() => {
    workspaceResizeRefreshFrame = 0;
    closeCanvasContextMenu();
    const previousViewport = lastPanelLayoutViewportSize;
    const nextViewport = getWorkspaceViewport();
    state.panelLayout = normalizePanelLayout(state.panelLayout, getPanelLayoutViewportOptions());
    realignDockedPanelsForViewportChange(previousViewport, nextViewport);
    clampStagePanelToViewport("left");
    clampStagePanelToViewport("right");
    syncLegacyStateFromPanelLayout();
    workspaceEl?.classList.toggle("is-panels-swapped", isPanelLayoutSwapped(state.panelLayout));
    refreshPanelLayoutVisualState();
    lastPanelLayoutViewportSize = nextViewport;
    syncDesktopMenuPanelPosition();
    requestPanelLayoutFinalShapeSync();
    scheduleScreenSourceToolbarLayoutSync();
    scheduleRightPanelWindowSliderSync();
    scheduleCanvasModeSliderSync();
  });
}

function releaseBootShapeLock() {
  if (!document.body?.classList.contains("boot-shape-lock")) {
    return;
  }

  document.body.classList.remove("boot-shape-lock");
  scheduleDesktopWindowShapeSync();
  void DESKTOP_SHELL?.releaseBootShapeLock?.();
}

function handleBootstrapFailure(error) {
  const message = String(error?.message || error || "未知错误").trim() || "未知错误";
  console.error("[FreeFlow] bootstrap failed:", error);
  document.body?.classList.remove("app-booting");
  releaseBootShapeLock();
  setStatus(`启动失败：${message}`, "error");
  if (statusTextEl) {
    statusTextEl.textContent = `启动失败：${message}`;
  }
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();
  const attachmentSnapshot = normalizeComposerAttachments(state.composerAttachments);
  const attachmentPromptPrefix = buildAttachmentPromptPrefix(attachmentSnapshot);
  const finalPromptBody =
    prompt || (attachmentSnapshot.length ? "请先阅读我附加的文件，并根据这些文件回答我的问题。" : "");
  const finalPrompt = [attachmentPromptPrefix, finalPromptBody].filter(Boolean).join("\n\n").trim();
  if (!finalPrompt || state.abortController) return;

  const model = modelSelect.value || state.model;

  if (agentModeToggle.checked) {
    await runAgentModeTask(finalPrompt);
    return;
  }

  if (isDoubaoWebModel(model)) {
    await runDoubaoWebTask(finalPrompt);
    return;
  }

  const session = ensureCurrentSession();
  session.activeModel = model;

  addMessage({ role: "user", content: finalPrompt });
  promptInput.value = "";
  removeCanvasSelectionByIds(attachmentSnapshot.map((item) => item.id));
  clearComposerAttachments();
  autoresize();

  await maybeCompressConversation(session, model);

  const assistantMessage = addMessage({
    role: "assistant",
    content: "",
    model,
    thinkingEnabled: getModelProfile(model).thinkingEnabled,
    deviceMode: isLocalModel(model) ? getModelDeviceMode(model) : "cloud",
    pending: true,
  });
  state.currentAssistantId = assistantMessage.dataset.messageId;
  state.abortController = new AbortController();
  state.activeTaskRoute = "chat";
  setComposerState(true);
  setStatus("回复等待中");

  try {
    if (state.outputMode === "stream") {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: applyThinkingDirective(
            buildPayloadMessages(
              session,
              attachmentSnapshot.map((item) => item.id)
            ),
            model
          ),
          options: buildRequestOptions(model),
        }),
        signal: state.abortController.signal,
      });

      if (!response.ok || !response.body) {
        const errorText = await safeErrorText(response);
        throw new Error(errorText || "聊天请求失败");
      }

      await consumeNdjsonStream(response.body);
      updateAssistantMessage(getCurrentSession()
        ?.messages?.find((item) => item.id === state.currentAssistantId)?.content || "", {
        thinkingContent:
          getCurrentSession()?.messages?.find((item) => item.id === state.currentAssistantId)?.thinkingContent || "",
        pending: false,
      });
    } else {
  const response = await fetch(API_ROUTES.chatOnce, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: applyThinkingDirective(
            buildPayloadMessages(
              session,
              attachmentSnapshot.map((item) => item.id)
            ),
            model
          ),
          options: buildRequestOptions(model),
        }),
        signal: state.abortController.signal,
      });

      const data = await readJsonResponse(response, "聊天");
      if (!response.ok || !data.ok) {
        throw new Error(data.details || data.error || "聊天请求失败");
      }

      updateAssistantMessage(data.message || "模型没有返回内容。", {
        thinkingContent: data.thinking || "",
        pending: false,
      });
    }
    setStatus("回复完成", "success");
  } catch (error) {
    if (error.name === "AbortError") {
      updateAssistantMessage("已停止当前生成。", {
        pending: false,
      });
      setStatus("已停止当前生成", "warning");
    } else {
      updateAssistantMessage(`发生错误：${error.message}`, {
        pending: false,
      });
      setStatus(error.message, "error");
    }
  } finally {
    state.abortController = null;
    state.currentAssistantId = null;
    state.activeTaskRoute = "";
    setComposerState(false);
    persistSessions();
    renderSessions();
    renderContextStats();
  }
});

stopBtn.addEventListener("click", () => {
  if (state.activeTaskRoute === "doubao-web") {
    fetch("/api/doubao-web/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  }
  state.abortController?.abort();
});

composerThinkingBtn?.addEventListener("click", async () => {
  const activeModel = modelSelect?.value || state.model;
  if (!activeModel || !supportsThinkingToggle(activeModel)) return;
  await setThinkingEnabledForActiveModel(!getModelProfile(activeModel).thinkingEnabled);
});

clearBtn.addEventListener("click", async () => {
  if (state.abortController) return;

  const previousSessionId = state.currentSessionId;
  createSession({ switchTo: true });
  await resetDesktopAgentSession(previousSessionId);
  renderSessions();
  renderCurrentSession();
  renderContextStats();
  setStatus("已创建新会话");
});

clearHistoryBtn.addEventListener("click", async () => {
  if (state.abortController) return;
  if (!window.confirm("确定要清空全部会话历史吗？")) return;

  const sessionIds = state.sessions.map((session) => session.id);
  state.sessions = [];
  state.currentSessionId = null;
  createSession({ switchTo: true, persist: false });
  await Promise.all(sessionIds.map((sessionId) => resetDesktopAgentSession(sessionId)));
  persistSessions();
  renderSessions();
  renderCurrentSession();
  renderContextStats();
  setStatus("全部会话历史已清空");
});

agentModeToggle?.addEventListener("change", () => {
  localStorage.setItem(CONFIG.agentModeKey, agentModeToggle.checked ? "true" : "false");
  updatePromptPlaceholder();
  setStatus(
    agentModeToggle.checked
      ? `已开启管家模式，当前将优先使用 ${getModelDisplayName(getPreferredAgentModel())}`
      : "已切换回普通聊天模式"
  );
});

outputModeSelect?.addEventListener("change", () => {
  state.outputMode = outputModeSelect.value === "stream" ? "stream" : "nonstream";
  localStorage.setItem(CONFIG.outputModeKey, state.outputMode);
  syncOutputModeUi();
  setStatus(state.outputMode === "stream" ? "已切换为流式输出" : "已切换为同步 / 非流式", "success");
});

leftPaneResizerEl?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  beginPaneResize("left", event.clientX, event.clientY, event.pointerId);
});

rightPaneResizerEl?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  beginPaneResize("right", event.clientX, event.clientY, event.pointerId);
});

leftPaneYResizerEl?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  beginPaneVerticalMove("left", event.clientY, event.pointerId);
});

rightPaneYResizerEl?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  beginPaneVerticalMove("right", event.clientY, event.pointerId);
});

leftPaneResizerEl?.addEventListener("dblclick", () => {
  const panel = state.panelLayout?.left;
  if (!panel) return;
  const defaultFrame = getDefaultPanelFrame("left", panel);
  panel.width = defaultFrame.width;
  panel.height = defaultFrame.height;
  panel.collapsed = false;
  panel.hidden = false;
  applyPanelLayoutState();
});

rightPaneResizerEl?.addEventListener("dblclick", () => {
  const panel = state.panelLayout?.right;
  if (!panel) return;
  const defaultFrame = getDefaultPanelFrame("right", panel);
  panel.width = defaultFrame.width;
  panel.height = defaultFrame.height;
  panel.collapsed = false;
  panel.hidden = false;
  applyPanelLayoutState();
});

syncStagePanelOrbLabels();

stagePanelDragEls.forEach((triggerEl) => {
  triggerEl.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await swapMainPanels();
  });
});

stagePanelActionEls.forEach((actionEl) => {
  actionEl.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const side = actionEl.dataset.stagePanelSide;
    const action = actionEl.dataset.stagePanelAction;
    if (!side || !action) return;
    if (action === "close") {
      setPaneCollapsed(side, true);
      setStatus(`${side === "left" ? "左侧" : "右侧"}界面已收回`, "success");
      return;
    }
    if (action === "reset") {
      expandPaneToFullscreen(side);
      setStatus(`${side === "left" ? "左侧" : "右侧"}界面已全屏显示`, "success");
    }
  });
});

stageRestoreBtn?.addEventListener("click", () => {
  restoreDefaultStagePanels();
});

toggleLeftPaneBtn?.addEventListener("click", () => {
  setPaneCollapsed("left", !state.leftPanelCollapsed);
});

toggleRightPaneBtn?.addEventListener("click", () => {
  setPaneCollapsed("right", !state.rightPanelCollapsed);
});

canvasTitleRenameTriggerEl?.addEventListener("dblclick", (event) => {
  event.preventDefault();
  event.stopPropagation();
  beginCanvasTitleRename();
});

canvasTitleInputEl?.addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    await commitCanvasTitleRename();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    cancelCanvasTitleRename();
  }
});

canvasTitleInputEl?.addEventListener("blur", async () => {
  if (canvasTitleInputEl.classList.contains("is-hidden") || canvasTitleRenameInFlight) return;
  await commitCanvasTitleRename();
});

conversationAssistantChrome?.bindEvents();

restoreLeftPaneBtn?.addEventListener("click", () => {
  setPaneCollapsed("left", false);
});

restoreRightPaneBtn?.addEventListener("click", () => {
  setPaneCollapsed("right", false);
});

desktopRefreshBtn?.addEventListener("click", async () => {
  setDesktopMenuOpen(false);
  try {
    await stopScreenSourceCapture({ announce: false, statusText: "画面映射已停止" });
  } catch {
    // Ignore pre-reload cleanup failures and continue refresh.
  }
  if (IS_DESKTOP_APP && DESKTOP_SHELL?.reload) {
    try {
      await DESKTOP_SHELL.reload();
      return;
    } catch (error) {
      setStatus(`刷新界面失败：${error.message}`, "warning");
      return;
    }
  }

  window.location.reload();
});

desktopFullscreenBtn?.addEventListener("click", async () => {
  setDesktopMenuOpen(false);
  if (!DESKTOP_SHELL?.toggleFullscreen) return;

  try {
    await DESKTOP_SHELL.toggleFullscreen();
    await refreshDesktopShellState();
    setStatus("已切换全屏状态", "success");
  } catch (error) {
    setStatus(`切换全屏失败：${error.message}`, "warning");
  }
});

async function toggleDesktopFullscreenFromShellMenu() {
  if (!DESKTOP_SHELL?.toggleFullscreen) return;

  try {
    await DESKTOP_SHELL.toggleFullscreen();
    await refreshDesktopShellState();
    setStatus("已切换全屏状态", "success");
  } catch (error) {
    setStatus(`切换全屏失败：${error.message}`, "warning");
  }
}

desktopClickThroughBtn?.addEventListener("click", async () => {
  if (!DESKTOP_SHELL?.setClickThrough) return;

  try {
    const nextEnabled = !state.desktopShellState.fullClickThrough;
    state.desktopShellState.fullClickThrough = nextEnabled;
    applyFullClickThroughUiState(nextEnabled);
    const nextState = await DESKTOP_SHELL.setClickThrough(nextEnabled);
    syncDesktopShellState(nextState);
    await refreshDesktopShellState();
    setDesktopMenuOpen(false);
    setStatus(
      nextEnabled
        ? `已开启完全穿透。左右栏已隐藏，按 ${getClickThroughShortcutDisplay()} 可退出。`
        : "已退出完全穿透，已恢复正常交互。",
      "success"
    );
  } catch (error) {
    state.desktopShellState.fullClickThrough = false;
    applyFullClickThroughUiState(false);
    setStatus(`切换穿透模式失败：${error.message}`, "warning");
  }
});

document.addEventListener(
  "keydown",
  (event) => {
    if (
      !state.desktopShellState.fullClickThrough ||
      !matchesShortcutKeyboardEvent(event, state.shortcutSettings?.clickThroughAccelerator || DEFAULT_CLICK_THROUGH_ACCELERATOR)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void exitDesktopClickThroughFromShortcut();
  },
  true
);

clickThroughShortcutSaveBtn?.addEventListener("click", async () => {
  if (!IS_DESKTOP_APP || !DESKTOP_SHELL?.setShortcutSettings) {
    setStatus("当前环境不支持全局快捷键配置", "warning");
    return;
  }

  const rawValue = String(clickThroughShortcutInputEl?.value || "").trim();
  try {
    const response = await DESKTOP_SHELL.setShortcutSettings({
      clickThroughAccelerator: rawValue || DEFAULT_CLICK_THROUGH_ACCELERATOR,
    });
    if (!response?.ok) {
      throw new Error(response?.error || "保存快捷键失败");
    }
    state.shortcutSettings = normalizeShortcutSettings(response.settings || {});
    renderShortcutSettings();
    setStatus(`完全穿透快捷键已更新为 ${getClickThroughShortcutDisplay()}`, "success");
  } catch (error) {
    setStatus(`保存快捷键失败：${error.message}`, "warning");
  }
});

clickThroughShortcutResetBtn?.addEventListener("click", async () => {
  if (!IS_DESKTOP_APP || !DESKTOP_SHELL?.setShortcutSettings) {
    setStatus("当前环境不支持全局快捷键配置", "warning");
    return;
  }

  try {
    const response = await DESKTOP_SHELL.setShortcutSettings({
      clickThroughAccelerator: DEFAULT_CLICK_THROUGH_ACCELERATOR,
    });
    if (!response?.ok) {
      throw new Error(response?.error || "恢复默认快捷键失败");
    }
    state.shortcutSettings = normalizeShortcutSettings(response.settings || {});
    renderShortcutSettings();
    setStatus("完全穿透快捷键已恢复默认", "success");
  } catch (error) {
    setStatus(`恢复默认快捷键失败：${error.message}`, "warning");
  }
});

[
  defaultCanvasPanelSideSelectEl,
  defaultCanvasPanelVisibleInputEl,
  defaultChatPanelVisibleInputEl,
  defaultLaunchFullscreenInputEl,
].forEach((element) => {
  element?.addEventListener("change", () => {
    previewWorkbenchHabitDraft();
    requestDrawerWindowShapeFinalSync();
  });
});

insightDrawerEl?.querySelectorAll("details").forEach((detailsEl) => {
  detailsEl.addEventListener("toggle", () => {
    requestDrawerWindowShapeFinalSync();
  });
});

insightDrawerEl?.addEventListener("scroll", () => {
  requestDrawerWindowShapeFinalSync();
});

insightDrawerEl?.addEventListener("transitionend", (event) => {
  if (event.target === insightDrawerEl && event.propertyName === "transform") {
    requestDrawerWindowShapeFinalSync();
  }
});

workbenchHabitSaveBtn?.addEventListener("click", async () => {
  try {
    if (workbenchHabitSaveBtn) {
      workbenchHabitSaveBtn.disabled = true;
      workbenchHabitSaveBtn.textContent = "保存中";
    }
    if (workbenchHabitStatusEl) {
      workbenchHabitStatusEl.textContent = "正在保存并应用布局习惯...";
    }
    const preferences = getWorkbenchHabitDraft();
    await saveWorkbenchPreferences(preferences);
    clearStagePanelsState();
    applyWorkbenchPreferencesToPanelLayout({ persist: true, announce: false });
    renderWorkbenchHabitSettings();
    if (workbenchHabitStatusEl) {
      const savedPreferences = getWorkbenchPreferencesFromState();
      const canvasSideLabel = savedPreferences.defaultCanvasPanelSide === "right" ? "画布在右" : "画布在左";
      const visibleLabels = [
        savedPreferences.defaultCanvasPanelVisible ? "画布默认展开" : "画布默认收起",
        savedPreferences.defaultChatPanelVisible ? "对话默认展开" : "对话默认收起",
        savedPreferences.defaultLaunchFullscreen ? "启动默认全屏" : "启动默认窗口",
      ];
      workbenchHabitStatusEl.textContent = `已保存并应用：${canvasSideLabel}，${visibleLabels.join("，")}`;
    }
    setStatus("习惯设置已保存并应用", "success");
  } catch (error) {
    if (workbenchHabitStatusEl) {
      workbenchHabitStatusEl.textContent = `保存失败：${error.message}`;
    }
    setStatus(`保存习惯设置失败：${error.message}`, "warning");
  } finally {
    if (workbenchHabitSaveBtn) {
      workbenchHabitSaveBtn.disabled = false;
      workbenchHabitSaveBtn.textContent = "保存并应用";
    }
  }
});

workbenchHabitApplyBtn?.addEventListener("click", () => {
  const preferences = getWorkbenchHabitDraft();
  state.workbenchPreferences = pickWorkbenchPreferences(preferences);
  state.uiSettings = normalizeUiSettings({
    ...state.uiSettings,
    ...state.workbenchPreferences,
  });
  writeUiSettingsCache(state.uiSettings);
  clearStagePanelsState();
  renderWorkbenchHabitSettings();
  applyWorkbenchPreferencesToPanelLayout({ persist: true, announce: true });
});

workbenchHabitResetBtn?.addEventListener("click", async () => {
  try {
    await saveWorkbenchPreferences({ ...DEFAULT_WORKBENCH_PREFERENCES });
    clearStagePanelsState();
    applyWorkbenchPreferencesToPanelLayout({ persist: true, announce: false });
    renderWorkbenchHabitSettings();
    setStatus("已恢复默认习惯设置", "success");
  } catch (error) {
    setStatus(`恢复习惯设置失败：${error.message}`, "warning");
  }
});

desktopPinBtn?.addEventListener("click", async () => {
  if (!DESKTOP_SHELL?.setPinned) return;

  try {
    const nextState = await DESKTOP_SHELL.setPinned(!state.desktopShellState.pinned);
    syncDesktopShellState(nextState);
    setDesktopMenuOpen(false);
    setStatus(state.desktopShellState.pinned ? "已固定到桌面最顶层" : "已解除固定", "success");
  } catch (error) {
    setStatus(`切换置顶失败：${error.message}`, "warning");
  }
});

desktopMinimizeBtn?.addEventListener("click", async () => {
  if (!DESKTOP_SHELL?.minimize) return;

  try {
    setDesktopMenuOpen(false);
    await DESKTOP_SHELL.minimize();
  } catch (error) {
    setStatus(`最小化失败：${error.message}`, "warning");
  }
});

desktopCloseBtn?.addEventListener("click", async () => {
  if (!DESKTOP_SHELL?.close) return;

  try {
    setDesktopMenuOpen(false);
    await DESKTOP_SHELL.close();
  } catch (error) {
    setStatus(`关闭桌面挂件失败：${error.message}`, "warning");
  }
});

  canvasBoardPathBrowseBtn?.addEventListener("click", async () => {
    if (!DESKTOP_SHELL?.pickCanvasBoardPath) {
      setStatus("当前环境不支持原生文件选择，请直接输入路径", "warning");
      return;
    }

  try {
    const result = await DESKTOP_SHELL.pickCanvasBoardPath({
      defaultPath: canvasBoardPathInputEl?.value || getCanvasBoardSavePath(),
    });
    if (result?.canceled || !result?.filePath) {
      return;
    }

    if (canvasBoardPathInputEl) {
      canvasBoardPathInputEl.value = normalizeCanvasBoardSavePathValue(result.filePath);
    }
    } catch (error) {
      setStatus(`选择画布保存地址失败：${error.message}`, "warning");
    }
  });

  canvasImagePathBrowseBtn?.addEventListener("click", async () => {
    if (!DESKTOP_SHELL?.pickDirectory) {
      setStatus("当前环境不支持原生文件选择，请直接输入路径", "warning");
      return;
    }
    try {
      const result = await DESKTOP_SHELL.pickDirectory({
        defaultPath: canvasImagePathInputEl?.value || getCanvasImageSavePath(),
      });
      if (result?.canceled || !result?.filePath) {
        return;
      }
      const normalized = normalizeCanvasImageSavePathValue(result.filePath);
      if (canvasImagePathInputEl) {
        canvasImagePathInputEl.value = normalized;
      }
      if (drawerCanvasImagePathInputEl) {
        drawerCanvasImagePathInputEl.value = normalized;
      }
      syncCanvasImagePathActionButtons(normalized);
    } catch (error) {
      setStatus(`选择图片保存地址失败：${error.message}`, "warning");
    }
  });

  drawerCanvasBoardPathBrowseBtn?.addEventListener("click", async () => {
    if (!DESKTOP_SHELL?.pickCanvasBoardPath) {
      setStatus("当前环境不支持原生文件选择，请直接输入路径", "warning");
      return;
    }

  try {
    const result = await DESKTOP_SHELL.pickCanvasBoardPath({
      defaultPath: drawerCanvasBoardPathInputEl?.value || getCanvasBoardSavePath(),
    });
    if (result?.canceled || !result?.filePath) {
      return;
    }

    if (drawerCanvasBoardPathInputEl) {
      drawerCanvasBoardPathInputEl.value = normalizeCanvasBoardSavePathValue(result.filePath);
    }
    if (canvasBoardPathInputEl) {
      canvasBoardPathInputEl.value = normalizeCanvasBoardSavePathValue(result.filePath);
    }
    syncCanvasPathActionButtons(normalizeCanvasBoardSavePathValue(result.filePath));
    } catch (error) {
      setStatus(`选择画布保存地址失败：${error.message}`, "warning");
    }
  });

  drawerCanvasImagePathBrowseBtn?.addEventListener("click", async () => {
    if (!DESKTOP_SHELL?.pickDirectory) {
      setStatus("当前环境不支持原生文件选择，请直接输入路径", "warning");
      return;
    }
    try {
      const result = await DESKTOP_SHELL.pickDirectory({
        defaultPath: drawerCanvasImagePathInputEl?.value || getCanvasImageSavePath(),
      });
      if (result?.canceled || !result?.filePath) {
        return;
      }
      const normalized = normalizeCanvasImageSavePathValue(result.filePath);
      if (drawerCanvasImagePathInputEl) {
        drawerCanvasImagePathInputEl.value = normalized;
      }
      if (canvasImagePathInputEl) {
        canvasImagePathInputEl.value = normalized;
      }
      syncCanvasImagePathActionButtons(normalized);
    } catch (error) {
      setStatus(`选择图片保存地址失败：${error.message}`, "warning");
    }
  });

  canvasBoardPathOpenBtn?.addEventListener("click", async () => {
    const targetPath = canvasBoardPathInputEl?.value || getCanvasBoardSavePath();
    if (!targetPath || !DESKTOP_SHELL?.revealPath) {
      return;
    }

  try {
    const result = await DESKTOP_SHELL.revealPath(targetPath);
    if (result?.ok === false) {
      throw new Error(result.error || "打开路径失败");
    }
  } catch (error) {
      setStatus(`打开画布保存地址失败：${error.message}`, "warning");
    }
  });

  canvasImagePathOpenBtn?.addEventListener("click", async () => {
    const targetPath = canvasImagePathInputEl?.value || getCanvasImageSavePath();
    if (!targetPath || !DESKTOP_SHELL?.revealPath) {
      return;
    }
    try {
      const result = await DESKTOP_SHELL.revealPath(targetPath);
      if (result?.ok === false) {
        throw new Error(result.error || "打开路径失败");
      }
    } catch (error) {
      setStatus(`打开图片保存地址失败：${error.message}`, "warning");
    }
  });

  drawerCanvasBoardPathOpenBtn?.addEventListener("click", async () => {
    const targetPath = drawerCanvasBoardPathInputEl?.value || getCanvasBoardSavePath();
    if (!targetPath || !DESKTOP_SHELL?.revealPath) {
      return;
    }

  try {
    const result = await DESKTOP_SHELL.revealPath(targetPath);
    if (result?.ok === false) {
      throw new Error(result.error || "打开路径失败");
    }
  } catch (error) {
      setStatus(`打开画布保存地址失败：${error.message}`, "warning");
    }
  });

  drawerCanvasImagePathOpenBtn?.addEventListener("click", async () => {
    const targetPath = drawerCanvasImagePathInputEl?.value || getCanvasImageSavePath();
    if (!targetPath || !DESKTOP_SHELL?.revealPath) {
      return;
    }
    try {
      const result = await DESKTOP_SHELL.revealPath(targetPath);
      if (result?.ok === false) {
        throw new Error(result.error || "打开路径失败");
      }
    } catch (error) {
      setStatus(`打开图片保存地址失败：${error.message}`, "warning");
    }
  });

  canvasBoardPathInputEl?.addEventListener("input", () => {
    const nextValue = normalizeCanvasBoardSavePathValue(canvasBoardPathInputEl.value || "");
    if (drawerCanvasBoardPathInputEl && drawerCanvasBoardPathInputEl.value !== nextValue) {
      drawerCanvasBoardPathInputEl.value = nextValue;
    }
    syncCanvasPathActionButtons(nextValue);
  });

  drawerCanvasBoardPathInputEl?.addEventListener("input", () => {
    const nextValue = normalizeCanvasBoardSavePathValue(drawerCanvasBoardPathInputEl.value || "");
    if (canvasBoardPathInputEl && canvasBoardPathInputEl.value !== nextValue) {
      canvasBoardPathInputEl.value = nextValue;
    }
    syncCanvasPathActionButtons(nextValue);
  });

  canvasImagePathInputEl?.addEventListener("input", () => {
    const nextValue = normalizeCanvasImageSavePathValue(canvasImagePathInputEl.value || "");
    if (drawerCanvasImagePathInputEl && drawerCanvasImagePathInputEl.value !== nextValue) {
      drawerCanvasImagePathInputEl.value = nextValue;
    }
    syncCanvasImagePathActionButtons(nextValue);
  });

  drawerCanvasImagePathInputEl?.addEventListener("input", () => {
    const nextValue = normalizeCanvasImageSavePathValue(drawerCanvasImagePathInputEl.value || "");
    if (canvasImagePathInputEl && canvasImagePathInputEl.value !== nextValue) {
      canvasImagePathInputEl.value = nextValue;
    }
    syncCanvasImagePathActionButtons(nextValue);
  });

  window.addEventListener("canvas-board-path-changed", (event) => {
    const nextValue = String(event?.detail?.canvasBoardSavePath || "").trim();
    if (!nextValue || nextValue === getCanvasBoardSavePath()) {
      return;
    }
    state.uiSettings = normalizeUiSettings({
      ...state.uiSettings,
      canvasBoardSavePath: nextValue,
    });
    writeUiSettingsCache(state.uiSettings);
    writeStartupContextUiSettings({
      canvasBoardSavePath: nextValue,
    });
    if (canvasBoardPathInputEl) {
      canvasBoardPathInputEl.value = nextValue;
    }
    if (drawerCanvasBoardPathInputEl) {
      drawerCanvasBoardPathInputEl.value = nextValue;
    }
    syncCanvasPathActionButtons(nextValue);
  });

  window.addEventListener("canvas-last-opened-board-path-changed", (event) => {
    syncCanvasLastOpenedBoardPathState(event?.detail?.canvasLastOpenedBoardPath || "");
  });

canvasModeLegacyBtn?.addEventListener("click", () => {
  void setCanvasMode(CANVAS_MODE_LEGACY);
});

for (const button of canvasToolButtons) {
  button?.addEventListener("click", () => {
    const engine = getModernCanvas2DEngine();
    if (engine?.setTool) {
      const tool = String(button.dataset.canvasTool || "select").trim() || "select";
      engine.setTool(tool);
      return;
    }
    if (!ensureLegacyCanvasMode()) return;
    const tool = String(button.dataset.canvasTool || "select").trim() || "select";
    canvasItemManager.setCanvasTool(tool);
  });
}

canvasZoomInBtn?.addEventListener("click", () => {
  const engine = getModernCanvas2DEngine();
  if (engine?.zoomIn) {
    engine.zoomIn();
    return;
  }
  if (!ensureLegacyCanvasMode()) return;
  setCanvasScaleContinuous(state.canvasBoard.view.scale * 1.12);
});

canvasZoomOutBtn?.addEventListener("click", () => {
  const engine = getModernCanvas2DEngine();
  if (engine?.zoomOut) {
    engine.zoomOut();
    return;
  }
  if (!ensureLegacyCanvasMode()) return;
  setCanvasScaleContinuous(state.canvasBoard.view.scale / 1.12);
});

canvasReturnBtn?.addEventListener("click", () => {
  const engine = getModernCanvas2DEngine();
  if (engine?.zoomToFit) {
    engine.zoomToFit();
    return;
  }
  if (!ensureLegacyCanvasMode()) return;
  focusNearestCanvasItem();
});

canvasZoomRangeEl?.addEventListener("input", () => {
  if (!ensureLegacyCanvasMode()) return;
  const nextScale = Number(canvasZoomRangeEl.value) / 100;
  setCanvasScaleContinuous(nextScale, { persist: false, status: true });
});

canvasZoomRangeEl?.addEventListener("change", () => {
  if (!ensureLegacyCanvasMode()) return;
  saveCanvasBoardToStorage();
});

canvasPasteBtn?.addEventListener("click", async () => {
  if (!ensureLegacyCanvasMode()) return;
  try {
    await pasteIntoCanvasFromSystemClipboard(getCanvasPointerAnchorPoint());
  } catch (error) {
    setCanvasStatus(`导入失败：${error.message}`);
  }
});

canvasResetViewBtn?.addEventListener("click", () => {
  const engine = getModernCanvas2DEngine();
  if (engine?.resetView) {
    engine.resetView();
    return;
  }
  if (!ensureLegacyCanvasMode()) return;
  updateCanvasView({
    scale: CONFIG.canvasDefaultScale,
    offsetX: CONFIG.canvasDefaultOffsetX,
    offsetY: CONFIG.canvasDefaultOffsetY,
  });
  setCanvasStatus("画布视图已重置");
});

canvasClearBtn?.addEventListener("click", () => {
  const engine = getModernCanvas2DEngine();
  if (engine?.clearBoard) {
    if (!window.confirm("确定要清空整个无限画布吗？")) return;
    engine.clearBoard();
    return;
  }
  if (!ensureLegacyCanvasMode()) return;
  if (!window.confirm("确定要清空整个无限画布吗？")) return;
  state.canvasBoard.items = [];
  renderCanvasBoard();
  saveCanvasBoardToStorage();
  setCanvasStatus("无限画布已清空");
});

document.addEventListener("keydown", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (isEditableElement(target)) return;
  const withinCanvas =
    Boolean(target?.closest?.("#canvas-viewport")) ||
    Boolean(target?.closest?.("#canvas-items")) ||
    Boolean(target?.closest?.(".desktop-clear-stage")) ||
    getActiveClipboardZone() === "canvas";
  if (!withinCanvas) return;

  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    canvasItemManager.undoCanvasBoard();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.shiftKey || event.key.toLowerCase() === "y")) {
    event.preventDefault();
    canvasItemManager.redoCanvasBoard();
    return;
  }

  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const key = String(event.key || "").toLowerCase();
  const toolMap = {
    v: "select",
    t: "text",
    r: "rect",
    a: "arrow",
    l: "line",
    e: "ellipse",
    h: "highlight",
  };
  const nextTool = toolMap[key];
  if (!nextTool) return;
  event.preventDefault();
  canvasItemManager.setCanvasTool(nextTool);
});

canvasViewportEl?.addEventListener("paste", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (isEditableElement(target)) {
    return;
  }

  if (getActiveClipboardZone() !== "canvas") {
    return;
  }

  try {
    const appClipboard = getActiveAppClipboardPayload();
    if (shouldUseAppClipboardPayload(appClipboard, event.clipboardData)) {
      const handledAppPaste = pasteAppClipboardToCanvas(appClipboard, getCanvasPointerAnchorPoint());
      if (handledAppPaste) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    const handled = await importClipboardOrDroppedData(event.clipboardData, "paste", getCanvasPointerAnchorPoint());
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  } catch (error) {
    setCanvasStatus(`粘贴失败：${error.message}`);
  }
});

canvasViewportEl?.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setCanvasStageInteractionState({ hovered: true, dragging: true });
  setCanvasPointerAnchorPoint(event.clientX, event.clientY);
});

canvasViewportEl?.addEventListener(
  "pointerdown",
  () => {
    setStagePanelFront("left");
  },
  true
);

canvasViewportEl?.addEventListener("dragenter", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setCanvasStageInteractionState({ hovered: true, dragging: true });
  setCanvasPointerAnchorPoint(event.clientX, event.clientY);
});

canvasViewportEl?.addEventListener("pointermove", (event) => {
  setCanvasPointerAnchorPoint(event.clientX, event.clientY);
});

canvasViewportEl?.addEventListener("dragstart", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest?.("[data-canvas-item-id]")) {
    event.preventDefault();
  }
});

canvasViewportEl?.addEventListener("dragleave", (event) => {
  if (event.target === canvasViewportEl) {
    setCanvasStageInteractionState({ hovered: false, dragging: false });
  }
});

canvasViewportEl?.addEventListener("drop", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  setCanvasStageInteractionState({ hovered: false, dragging: false });
  try {
    if (composerAttachmentDragPayload?.items?.length) {
      upsertCanvasItems(
        composerAttachmentDragPayload.items,
        "右侧素材已加入画布",
        getCanvasPositionFromClientPoint(event.clientX, event.clientY)
      );
      composerAttachmentDragPayload = null;
      return;
    }

    await importClipboardOrDroppedData(
      event.dataTransfer,
      "drop",
      getCanvasPositionFromClientPoint(event.clientX, event.clientY)
    );
  } catch (error) {
    setCanvasStatus(`拖拽导入失败：${error.message}`);
  } finally {
    composerAttachmentDragPayload = null;
  }
});

canvasViewportEl?.addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const currentScale = state.canvasBoard.view.scale;
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    setCanvasScaleContinuous(currentScale * zoomFactor);
  },
  { passive: false }
);

canvasViewportEl?.addEventListener("pointerdown", canvasItemInteractionController.handlePointerDown);
canvasViewportEl?.addEventListener("dblclick", canvasItemInteractionController.handleDoubleClick);
canvasViewportEl?.addEventListener("click", canvasItemInteractionController.handleClick);
canvasViewportEl?.addEventListener("contextmenu", canvasItemInteractionController.handleContextMenu);
document.addEventListener("pointermove", canvasItemInteractionController.handlePointerMove);
window.addEventListener("pointerup", canvasItemInteractionController.handlePointerUp);
window.addEventListener("pointercancel", canvasItemInteractionController.handlePointerUp);

desktopMenuBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  const willOpen = desktopMenuPanel?.classList.contains("is-hidden");
  setDesktopMenuOpen(Boolean(willOpen));
});

document.addEventListener(
  "pointermove",
  (event) => {
    syncDesktopSurfaceInteraction(event.target);
  },
  true
);

document.addEventListener(
  "pointerdown",
  (event) => {
    syncDesktopSurfaceInteraction(event.target, { force: true, activatePanel: true });
  },
  true
);

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest?.(".pane-resizer")) return;
  if (target?.closest?.(".pane-edge-y-resizer")) return;
  if (target?.closest?.("[data-stage-panel-drag]")) return;
  if (target?.closest?.("[data-stage-panel-action]")) return;
  if (target?.closest?.("#conversation-shell-more")) return;
  if (target?.closest?.("#conversation-shell-menu")) return;
  setConversationShellMenuOpen(false);
  if (conversationModelMenuEl?.contains(target)) return;
  closeConversationModelMenu();
  if (target?.closest?.("#screen-source-header-menu")) return;
  if (target?.closest?.(".screen-source-header-panel")) return;
  closeScreenSourceHeaderMenu();
});

document.addEventListener(
  "focusin",
  (event) => {
    syncDesktopSurfaceInteraction(event.target, { force: true });
  },
  true
);

window.addEventListener("resize", () => {
  scheduleWorkspaceResizeRefresh();
});

desktopClearStageEl?.addEventListener(
  "pointerdown",
  () => {
    setStagePanelFront("left");
  },
  true
);

canvasShellEl?.addEventListener(
  "pointerdown",
  () => {
    setStagePanelFront("left");
  },
  true
);

canvasStageBodyEl?.addEventListener(
  "pointerdown",
  () => {
    setStagePanelFront("left");
  },
  true
);

canvasCanvas2dHostEl?.addEventListener(
  "pointerdown",
  () => {
    setStagePanelFront("left");
  },
  true
);

conversationPanel?.addEventListener("pointerdown", () => {
  setStagePanelFront("right");
});

insightDrawerEl?.addEventListener("mouseenter", () => {
  syncDesktopSurfaceInteraction(insightDrawerEl, { force: true });
});

desktopShellControlsEl?.addEventListener("mouseenter", () => {
  syncDesktopSurfaceInteraction(desktopShellControlsEl, { force: true });
});

window.addEventListener("blur", () => {
  if (!state.desktopShellState.fullClickThrough) {
    setDesktopClickThrough(false);
  }
});

window.addEventListener(
  "scroll",
  () => {
    scheduleConversationShellMenuLayoutSync();
    scheduleScreenSourceHeaderMenuLayoutSync();
    syncDesktopPassThroughHintLayout();
  },
  true
);

renameSessionBtn?.addEventListener("click", () => {
  renameSession(state.currentSessionId);
});

saveSessionRenameBtn?.addEventListener("click", () => {
  commitSessionRename();
});

cancelSessionRenameBtn?.addEventListener("click", () => {
  cancelSessionRename();
});

conversationTitleInputEl?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitSessionRename();
  }
  if (event.key === "Escape") {
    cancelSessionRename();
  }
});

drawerToggleBtn?.addEventListener("click", async () => {
  const willOpen = !state.drawerOpen;
  if (willOpen) {
    await suspendScreenSourceForDrawer();
    setDrawerOpen(true);
    return;
  }
  setDrawerOpen(false);
  await resumeScreenSourceAfterDrawerClose();
});

drawerCloseBtn?.addEventListener("click", () => {
  setDrawerOpen(false);
  resumeScreenSourceAfterDrawerClose();
});

drawerBackdropEl?.addEventListener("click", () => {
  setDrawerOpen(false);
  resumeScreenSourceAfterDrawerClose();
});

insightDrawerHandleEl?.addEventListener("click", async () => {
  const willOpen = !state.drawerOpen;
  if (willOpen) {
    await suspendScreenSourceForDrawer();
    setDrawerOpen(true);
    return;
  }
  setDrawerOpen(false);
  await resumeScreenSourceAfterDrawerClose();
});

refreshStorageBtn?.addEventListener("click", async () => {
  refreshStorageBtn.disabled = true;
  setStatus("正在刷新会话文件占用空间");

  try {
    await refreshStorageUsage();
    renderContextStats();
    setStatus("已刷新历史对话占用空间", "success");
  } catch (error) {
    setStatus(`刷新失败：${error.message}`, "warning");
  } finally {
    refreshStorageBtn.disabled = false;
  }
});

savePermissionsBtn?.addEventListener("click", async () => {
  savePermissionsBtn.disabled = true;
  setStatus("正在保存本地权限配置");

  try {
    await savePermissions();
    setStatus("本地权限配置已保存", "success");
  } catch (error) {
    setStatus(`权限保存失败：${error.message}`, "warning");
  } finally {
    savePermissionsBtn.disabled = false;
  }
});

refreshPermissionsBtn?.addEventListener("click", async () => {
  refreshPermissionsBtn.disabled = true;
  setStatus("正在刷新权限配置");

  try {
    await loadPermissions();
    renderPermissions();
    renderAllowedRoots();
    setStatus("权限配置已刷新", "success");
  } catch (error) {
    setStatus(`权限刷新失败：${error.message}`, "warning");
  } finally {
    refreshPermissionsBtn.disabled = false;
  }
});

refreshSystemBtn?.addEventListener("click", async () => {
  refreshSystemBtn.disabled = true;
  setStatus("正在刷新系统监控信息");

  try {
    await refreshSystemStats();
    renderSystemStats();
    setStatus("系统监控信息已刷新", "success");
  } catch (error) {
    setStatus(`监控刷新失败：${error.message}`, "warning");
  } finally {
    refreshSystemBtn.disabled = false;
  }
});

addRootBtn?.addEventListener("click", async () => {
  const nextRoot = rootPathInput.value.trim();
  if (!nextRoot) return;

  if (!state.permissionStore.allowedRoots.includes(nextRoot)) {
    state.permissionStore.allowedRoots.push(nextRoot);
  }

  renderAllowedRoots();
  rootPathInput.value = "";
  await savePermissions().catch(() => {});
});

promptInput.addEventListener("input", autoresize);
promptInput.addEventListener("input", syncConversationEmptyStateVisibility);
promptInput.addEventListener("focus", () => {
  setActiveClipboardZone("assistant");
});
promptInput.addEventListener("paste", async (event) => {
  if (event.defaultPrevented) {
    return;
  }

  setActiveClipboardZone("assistant");

  try {
    const handled = await pasteIntoAssistantFromClipboard(event.clipboardData, getCanvasPointerAnchorPoint());
    if (!handled) return;
    event.preventDefault();
  } catch (error) {
    setStatus(`粘贴到右侧交互区失败：${error.message}`, "warning");
  }
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

composerAttachmentsEl?.addEventListener("click", (event) => {
  const removeBtn = event.target.closest("[data-remove-composer-attachment]");
  if (!removeBtn) return;

  removeCanvasSelectionByIds([removeBtn.dataset.removeComposerAttachment]);
  state.composerAttachments = state.composerAttachments.filter(
    (item) => item.id !== removeBtn.dataset.removeComposerAttachment
  );
  renderComposerAttachments();
});

renderComposerAttachments();

composerAttachmentsEl?.addEventListener("dragstart", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const chip = target?.closest?.("[data-composer-attachment-id]");
  if (!chip) return;

  const attachmentId = String(chip.dataset.composerAttachmentId || "").trim();
  if (!attachmentId) return;

  const item = state.canvasBoard.items.find((entry) => entry.id === attachmentId);
  if (!item) return;

  composerAttachmentDragPayload = {
    items: [buildCanvasItemDragPayload(item)],
  };

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", item.text || item.fileName || item.title || "");
  }
});

composerAttachmentsEl?.addEventListener("dragend", () => {
  composerAttachmentDragPayload = null;
});

canvasViewportEl?.addEventListener("mouseenter", (event) => {
  setCanvasPointerAnchorPoint(event.clientX, event.clientY);
  setActiveClipboardZone("canvas");
  setCanvasStageInteractionState({ hovered: true, dragging: false });
});

canvasViewportEl?.addEventListener("mouseleave", () => {
  setCanvasStageInteractionState({ hovered: false, dragging: false });
});

canvasViewportEl?.addEventListener(
  "focusin",
  (event) => {
    if (getClipboardZoneFromTarget(event.target) === "canvas") {
      setActiveClipboardZone("canvas");
    }
  },
  true
);

threadViewport?.addEventListener("mouseenter", () => {
  setActiveClipboardZone("assistant");
});

chatForm?.addEventListener("mouseenter", () => {
  setActiveClipboardZone("assistant");
});

chatLog?.addEventListener("mouseenter", () => {
  setActiveClipboardZone("assistant");
});

threadViewport?.addEventListener(
  "focusin",
  (event) => {
    if (getClipboardZoneFromTarget(event.target) === "assistant") {
      setActiveClipboardZone("assistant");
    }
  },
  true
);

chatForm?.addEventListener(
  "focusin",
  (event) => {
    if (getClipboardZoneFromTarget(event.target) === "assistant") {
      setActiveClipboardZone("assistant");
    }
  },
  true
);

screenSourcePanelEl?.addEventListener("mouseenter", () => {
  setActiveClipboardZone("screen");
});

screenSourcePanelEl?.addEventListener("pointerdown", () => {
  setActiveClipboardZone("screen");
});

screenSourceHeaderSlotEl?.addEventListener("mouseenter", () => {
  setActiveClipboardZone("screen");
});

screenSourcePanelEl?.addEventListener(
  "focusin",
  (event) => {
    if (getClipboardZoneFromTarget(event.target) === "screen") {
      setActiveClipboardZone("screen");
    }
  },
  true
);

screenSourceHeaderSlotEl?.addEventListener(
  "focusin",
  (event) => {
    if (getClipboardZoneFromTarget(event.target) === "screen") {
      setActiveClipboardZone("screen");
    }
  },
  true
);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && canvasImageLightboxEl && !canvasImageLightboxEl.classList.contains("is-hidden")) {
    closeCanvasImageLightbox();
    return;
  }

  if (event.key === "Escape" && state.canvasEditingTextId) {
    stopEditingCanvasTextbox();
    return;
  }

  if (event.key === "Escape" && state.drawerOpen) {
    setDrawerOpen(false);
    resumeScreenSourceAfterDrawerClose();
    return;
  }

  if (event.key === "Escape" && desktopMenuPanel && !desktopMenuPanel.classList.contains("is-hidden")) {
    setDesktopMenuOpen(false);
    return;
  }

  if (event.key === "Escape" && state.editingSessionId) {
    cancelSessionRename();
  }
});

document.addEventListener("copy", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const zone = getClipboardZoneFromTarget(target);
  if (zone) {
    setActiveClipboardZone(zone);
  }

  if (zone !== "assistant") {
    return;
  }

  const copiedText = extractConversationCopyText(
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : event.target
  );
  if (!copiedText) {
    return;
  }

  setAppClipboardPayload({
    source: "chat",
    text: copiedText,
  });
});

document.addEventListener("keydown", async (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "c") {
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  const withinCanvas =
    Boolean(target?.closest?.("#canvas-viewport")) ||
    Boolean(target?.closest?.("#canvas-items")) ||
    Boolean(target?.closest?.(".desktop-clear-stage"));
  if (isEditableElement(target) || !withinCanvas) {
    return;
  }

  const selectedItems = getSelectedCanvasItems();
  if (!selectedItems.length) {
    return;
  }

  event.preventDefault();

  try {
    const result = await copySelectedCanvasItems();
    setCanvasStatus(
      result.mode === "file"
        ? `已将${result.count > 1 ? `${result.count} 个` : ""}文件复制到系统剪贴板`
        : "已复制选中的素材卡"
    );
  } catch (error) {
    setCanvasStatus(`复制失败：${error.message}`);
  }
});

document.addEventListener("keydown", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (isEditableElement(target)) {
    return;
  }

  const withinCanvas =
    Boolean(target?.closest?.("#canvas-viewport")) ||
    Boolean(target?.closest?.("#canvas-items")) ||
    getActiveClipboardZone() === "canvas";
  if (!withinCanvas) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "x") {
    if (!state.canvasBoard.selectedIds.length) return;
    event.preventDefault();
    try {
      await cutSelectedCanvasItems();
    } catch (error) {
      setCanvasStatus(`剪切失败：${error.message}`);
    }
    return;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && state.canvasBoard.selectedIds.length) {
    event.preventDefault();
    removeCanvasItemsByIds(state.canvasBoard.selectedIds, `已删除 ${state.canvasBoard.selectedIds.length} 个素材卡`);
  }
});

window.addEventListener("beforeunload", () => {
  screenSourceEmptyLoader?.destroy?.();
  stopScreenSourceCapture({ announce: false, statusText: "画面映射已停止" });
  stopClipboardPolling();
});

Promise.resolve()
  .then(() => bootstrap())
  .catch((error) => {
    handleBootstrapFailure(error);
  });

document.addEventListener("pointerdown", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest?.(".canvas-context-menu")) {
    return;
  }
  closeCanvasContextMenu();
});

canvasImageLightboxEl?.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest?.(".canvas-image-lightbox-image")) {
    return;
  }
  closeCanvasImageLightbox();
});

canvasContextMenuEl?.addEventListener("click", async (event) => {
  const actionBtn = event.target.closest("[data-canvas-menu-action]");
  if (!actionBtn) return;
  closeCanvasContextMenu();

  try {
    switch (actionBtn.dataset.canvasMenuAction) {
      case "copy": {
        const result = await copySelectedCanvasItems();
        setCanvasStatus(
          result.mode === "file"
            ? `已将${result.count > 1 ? `${result.count} 个` : ""}文件复制到系统剪贴板`
            : "已复制选中的素材卡"
        );
        break;
      }
      case "cut":
        await cutSelectedCanvasItems();
        break;
      case "delete":
        removeCanvasItemsByIds(state.canvasBoard.selectedIds, `已删除 ${state.canvasBoard.selectedIds.length} 个素材卡`);
        break;
      case "paste":
        await pasteIntoCanvasFromSystemClipboard(getCanvasContextMenuAnchorPoint());
        break;
      default:
        break;
    }
  } catch (error) {
    setCanvasStatus(`画布操作失败：${error.message}`);
  }
});

rightPanelViewTabEls.forEach((tab) => {
  tab.addEventListener("click", () => {
    if (rightPanelSwitchLocked) {
      return;
    }
    setActiveRightPanelView(tab.dataset.rightPanelView);
  });
});

rightPanelSwitchLockBtn?.addEventListener("click", () => {
  rightPanelSwitchLocked = !rightPanelSwitchLocked;
  renderRightPanelSwitchLockState();
});

for (const button of screenSourceActionButtonEls.refresh) {
  button.addEventListener("click", async () => {
    try {
      await refreshScreenSourceTargets({ preserveSelection: true });
      setStatus("AI 镜像目标已刷新", "success");
    } catch (error) {
      setStatus(`刷新 AI 镜像目标失败：${error.message}`, "warning");
    }
  });
}

for (const button of screenSourceActionButtonEls.refreshEmbed) {
  button.addEventListener("click", async () => {
    try {
      if (!hasActiveScreenSourceProjection()) {
        throw new Error("当前未开始嵌入");
      }

      const activeOrSelectedSourceId = String(
        state.screenSource.selectedSourceId || state.screenSource.activeTargetId || ""
      ).trim();
      if (!activeOrSelectedSourceId) {
        throw new Error("请先选择映射目标");
      }

      await refreshScreenSourceTargets({ preserveSelection: true });

      const nextSelectedSource =
        state.screenSource.availableSources.find((item) => item.id === activeOrSelectedSourceId) ||
        state.screenSource.availableSources.find((item) => item.id === state.screenSource.selectedSourceId) ||
        null;

      if (!nextSelectedSource?.id) {
        throw new Error("当前映射目标已失效，请重新选择");
      }

      state.screenSource.selectedSourceId = nextSelectedSource.id;
      state.screenSource.selectedSourceLabel = nextSelectedSource.label || nextSelectedSource.name || "";
      await ensureScreenSourceCapture({ force: true });
      setStatus("AI 镜像嵌入已刷新", "success");
    } catch (error) {
      setStatus(`刷新嵌入失败：${error.message}`, "warning");
    }
  });
}

for (const button of screenSourceActionButtonEls.embedToggle) {
  button.addEventListener("click", async () => {
    try {
      if (hasActiveScreenSourceProjection()) {
        await stopScreenSourceCapture({ announce: false, statusText: "AI 镜像已关闭" });
        setStatus("AI 镜像已关闭", "success");
      } else {
        if (!state.screenSource.availableSources.length) {
          await refreshScreenSourceTargets({ preserveSelection: true });
        }
        if (!state.screenSource.selectedSourceId) {
          throw new Error("请先选择映射目标");
        }
        await ensureScreenSourceCapture();
        setStatus("AI 镜像已开始嵌入", "success");
      }
    } catch (error) {
      setStatus(`${hasActiveScreenSourceProjection() ? "关闭" : "开始"} AI 镜像失败：${error.message}`, "warning");
    } finally {
      closeScreenSourceHeaderMenu();
      closeScreenSourceOverflowMenu();
    }
  });
}

screenSourceSelectMenuEl?.addEventListener("toggle", () => {
  scheduleScreenSourceHeaderMenuLayoutSync();
});

screenSourceSelectTriggerEl?.addEventListener("click", (event) => {
  if (!screenSourceSelectMenuEl?.classList.contains("is-disabled")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  closeScreenSourceTargetMenu();
});

screenSourceSelectPanelEl?.addEventListener("click", (event) => {
  const target = event.target instanceof HTMLElement ? event.target.closest("[data-screen-source-option]") : null;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const nextSourceId = String(target.getAttribute("data-screen-source-option") || "").trim();
  if (!nextSourceId) {
    return;
  }
  updateScreenSourceSelection(nextSourceId);
});

screenSourceRenderModeSelectEl?.addEventListener("change", async () => {
  const nextMode = normalizeScreenSourceRenderMode(screenSourceRenderModeSelectEl.value);
  if (nextMode === state.screenSource.renderMode) {
    renderScreenSourceState();
    return;
  }

  state.screenSource.renderMode = nextMode;
  persistScreenSourceRenderMode();
  renderScreenSourceState();

  if (state.screenSource.stream || isEmbeddedScreenSourceActive()) {
    try {
      await ensureScreenSourceCapture({ force: true });
      setStatus(`已切换 AI 镜像渲染方式：${nextMode === "webcontentsview" ? "WebContentsView" : "Win32 原生嵌入"}`, "success");
    } catch (error) {
      setStatus(`切换 AI 镜像渲染方式失败：${error.message}`, "warning");
    }
  }
});

screenSourceFitModeSelectEl?.addEventListener("change", async () => {
  const sourceId = String(state.screenSource.selectedSourceId || "").trim();
  if (!sourceId) {
    renderScreenSourceState();
    return;
  }

  const nextFitMode = normalizeScreenSourceFitMode(screenSourceFitModeSelectEl.value);
  updateScreenSourceEmbedPolicy(sourceId, { fitMode: nextFitMode });
  renderScreenSourceState();

  if (state.screenSource.activeTargetId === sourceId && isWin32EmbeddedScreenSourceActive()) {
    try {
      await syncEmbeddedScreenSourceBounds();
      setStatus(`已切换嵌入适配模式：${screenSourceFitModeSelectEl.selectedOptions?.[0]?.textContent || nextFitMode}`, "success");
    } catch (error) {
      setStatus(`切换嵌入适配模式失败：${error.message}`, "warning");
    }
  }
});

screenSourceHeaderMenuEl?.addEventListener("toggle", () => {
  scheduleScreenSourceToolbarLayoutSync();
  scheduleScreenSourceHeaderMenuLayoutSync();
  syncEmbeddedWindowOverlayVisibility();
  dispatchTutorialUiEvent({
    type: screenSourceHeaderMenuEl.hasAttribute("open") ? TUTORIAL_EVENT_TYPES.MENU_OPENED : TUTORIAL_EVENT_TYPES.MENU_CLOSED,
    menuId: "screen-source-header-menu",
  });
});

modelSelect.addEventListener("change", () => {
  applyModelSelection(modelSelect.value, { announce: true, persistSession: true });
});

contextLimitSelect.addEventListener("change", async () => {
  const activeModel = modelSelect.value || state.model;
  if (!activeModel) return;

  const nextLimit = getResolvedContextLimit(activeModel, contextLimitSelect.value);
  state.modelProfiles[activeModel] = {
    ...getModelProfile(activeModel),
    contextLimit: nextLimit,
  };

  state.contextLimit = nextLimit;
  renderContextStats();

  try {
    await saveModelProfiles();
    setStatus(`已保存 ${getModelDisplayName(activeModel)} 的上下文窗口：${nextLimit}`, "success");
  } catch (error) {
    setStatus(`模型档案保存失败：${error.message}`, "warning");
  }
});

contextLimitApplyBtn?.addEventListener("click", async () => {
  const activeModel = modelSelect.value || state.model;
  if (!activeModel) return;

  const nextLimit = getResolvedContextLimit(activeModel, contextLimitInput?.value);
  state.modelProfiles[activeModel] = {
    ...getModelProfile(activeModel),
    contextLimit: nextLimit,
  };
  state.contextLimit = nextLimit;
  renderContextStats();

  try {
    await saveModelProfiles();
    setStatus(`已保存 ${getModelDisplayName(activeModel)} 的上下文窗口：${nextLimit}`, "success");
  } catch (error) {
    setStatus(`模型档案保存失败：${error.message}`, "warning");
  }
});

contextLimitInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  contextLimitApplyBtn?.click();
});

deviceModeSelect?.addEventListener("change", async () => {
  const activeModel = modelSelect.value || state.model;
  if (!activeModel) return;

  state.modelProfiles[activeModel] = {
    ...getModelProfile(activeModel),
    deviceMode: normalizeStoredDeviceMode(deviceModeSelect.value),
  };
  syncProviderCapabilities();

  try {
    await saveModelProfiles();
    setStatus(
      `已保存 ${getModelDisplayName(activeModel)} 的设备模式：${getDeviceModeLabel(
        getModelDeviceMode(activeModel),
        getDeviceModeGpuName(getModelDeviceMode(activeModel))
      )}`,
      "success"
    );
  } catch (error) {
    setStatus(`模型档案保存失败：${error.message}`, "warning");
  }
});

thinkingToggle?.addEventListener("change", async () => {
  const activeModel = modelSelect.value || state.model;
  if (!activeModel || !supportsThinkingToggle(activeModel)) return;
  await setThinkingEnabledForActiveModel(thinkingToggle.checked);
});

aiControlNewSessionBtn?.addEventListener("click", async () => {
  clearBtn?.click();
  aiControlSessionMenuEl?.removeAttribute("open");
});

aiControlHistoryListEl?.addEventListener("click", (event) => {
  const deleteBtn = event.target.closest("[data-ai-control-delete-session]");
  if (deleteBtn) {
    const sessionId = String(deleteBtn.dataset.aiControlDeleteSession || "").trim();
    if (!sessionId) return;
    event.preventDefault();
    event.stopPropagation();
    deleteSession(sessionId);
    aiControlSessionMenuEl?.removeAttribute("open");
    return;
  }

  const button = event.target.closest("[data-ai-control-session-id]");
  if (!button) return;
  const sessionId = String(button.dataset.aiControlSessionId || "").trim();
  if (!sessionId) return;
  switchSession(sessionId);
  aiControlSessionMenuEl?.removeAttribute("open");
});

clipboardModeSelect?.addEventListener("change", async () => {
  state.clipboardStore.mode = clipboardModeSelect.value === "auto" ? "auto" : "manual";

  try {
    await saveClipboardStore();
    startClipboardPolling();
    setStatus(
      state.clipboardStore.mode === "auto" ? "已开启剪贴板自动队列" : "已切换到剪贴板手动存储",
      "success"
    );
  } catch (error) {
    setStatus(`剪贴板模式保存失败：${error.message}`, "warning");
  }
});

clipboardCaptureBtn?.addEventListener("click", async () => {
  try {
    const inserted = await captureClipboardEntry("manual");
    if (inserted) {
      await importClipboardTextToCanvas(getCanvasPointerAnchorPoint()).catch(() => {});
      setStatus("当前剪贴板已加入保留队列", "success");
    }
  } catch (error) {
    setStatus(`剪贴板保存失败：${error.message}`, "warning");
  }
});

clipboardSaveChatBtn?.addEventListener("click", async () => {
  try {
    const inserted = await captureClipboardEntry("manual");
    if (inserted) {
      setStatus("已从右侧快捷保存当前剪贴板", "success");
    }
  } catch (error) {
    setStatus(`剪贴板保存失败：${error.message}`, "warning");
  }
});

clipboardClearBtn?.addEventListener("click", async () => {
  state.clipboardStore.items = [];

  try {
    await saveClipboardStore();
    clipboardStatusPillEl.textContent = "队列已清空";
    setStatus("剪贴板队列已清空", "success");
  } catch (error) {
    setStatus(`剪贴板清空失败：${error.message}`, "warning");
  }
});

clipboardListEl?.addEventListener("click", async (event) => {
  const copyBtn = event.target.closest("[data-clipboard-copy]");
  if (copyBtn) {
    const item = state.clipboardStore.items.find((entry) => entry.id === copyBtn.dataset.clipboardCopy);
    if (!item) return;

    try {
      await writeClipboardText(item.content);
      setAppClipboardPayload({
        source: "chat",
        text: item.content,
      });
      state.lastClipboardText = item.content;
      setStatus("已将内容复制回系统剪贴板", "success");
    } catch (error) {
      setStatus(`复制失败：${error.message}`, "warning");
    }
    return;
  }

  const removeBtn = event.target.closest("[data-clipboard-remove]");
  if (removeBtn) {
    state.clipboardStore.items = state.clipboardStore.items.filter(
      (entry) => entry.id !== removeBtn.dataset.clipboardRemove
    );

    try {
      await saveClipboardStore();
      setStatus("已从剪贴板队列移除内容", "success");
    } catch (error) {
      setStatus(`剪贴板队列更新失败：${error.message}`, "warning");
    }
  }
});

chatLog.addEventListener("click", async (event) => {
  const suggestionBtn = event.target.closest("[data-suggestion]");
  if (suggestionBtn) {
    promptInput.value = suggestionBtn.dataset.suggestion || "";
    autoresize();
    promptInput.focus();
    return;
  }

  const copyBtn = event.target.closest(".code-copy-btn");
  if (copyBtn) {
    const codeEl = copyBtn.closest(".code-block")?.querySelector("code");
    const codeText = codeEl?.innerText ?? "";
    if (!codeText) return;

    try {
      await navigator.clipboard.writeText(codeText);
      setAppClipboardPayload({
        source: "chat",
        text: codeText,
      });
      copyBtn.textContent = "已复制";
      setTimeout(() => {
        copyBtn.textContent = "复制";
      }, 1200);
    } catch {
      copyBtn.textContent = "复制失败";
      setTimeout(() => {
        copyBtn.textContent = "复制";
      }, 1200);
    }
  }
});

historyListEl.addEventListener("click", (event) => {
  if (state.abortController) return;

  if (event.target.closest("[data-inline-session-input]")) {
    return;
  }

  const saveRenameBtn = event.target.closest("[data-save-session-rename]");
  if (saveRenameBtn) {
    commitSessionRename(saveRenameBtn.dataset.saveSessionRename);
    return;
  }

  const cancelRenameBtn = event.target.closest("[data-cancel-session-rename]");
  if (cancelRenameBtn) {
    cancelSessionRename();
    return;
  }

  const deleteBtn = event.target.closest("[data-delete-session]");
  if (deleteBtn) {
    const sessionId = deleteBtn.dataset.deleteSession;
    deleteSession(sessionId);
    return;
  }

  const renameBtn = event.target.closest("[data-rename-session]");
  if (renameBtn) {
    renameSession(renameBtn.dataset.renameSession);
    return;
  }

  const item = event.target.closest("[data-session-id]");
  if (!item) return;

  switchSession(item.dataset.sessionId);
});

chatLog?.addEventListener("click", (event) => {
  const deleteBtn = event.target.closest("[data-delete-message]");
  if (!(deleteBtn instanceof HTMLElement)) {
    return;
  }

  const messageEl = deleteBtn.closest("[data-message-id]");
  const messageId = messageEl?.dataset?.messageId || "";
  if (!messageId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const menu = deleteBtn.closest(".message-menu");
  if (menu instanceof HTMLDetailsElement) {
    menu.open = false;
  }

  deleteMessageById(messageId);
});

historyListEl.addEventListener("dblclick", (event) => {
  if (state.abortController) return;

  const item = event.target.closest("[data-session-id]");
  if (!item) return;

  renameSession(item.dataset.sessionId);
});

historyListEl.addEventListener("keydown", (event) => {
  const input = event.target.closest("[data-inline-session-input]");
  if (!input) return;

  if (event.key === "Enter") {
    event.preventDefault();
    commitSessionRename(input.dataset.inlineSessionInput);
  }

  if (event.key === "Escape") {
    cancelSessionRename();
  }
});

historyListEl.addEventListener(
  "toggle",
  (event) => {
  const details = event.target.closest(".history-group");
  if (!details) return;

  state.historyExpanded = details.open;
  localStorage.setItem(CONFIG.historyExpandedKey, String(state.historyExpanded));
  },
  true
);

permissionGridEl?.addEventListener("change", (event) => {
  const toggle = event.target.closest("[data-permission-key]");
  if (!toggle) return;

  state.permissionStore.permissions[toggle.dataset.permissionKey] = toggle.checked;
});

allowedRootListEl?.addEventListener("click", (event) => {
  const removeBtn = event.target.closest("[data-remove-root]");
  if (!removeBtn) return;

  state.permissionStore.allowedRoots = state.permissionStore.allowedRoots.filter(
    (root) => root !== removeBtn.dataset.removeRoot
  );
  renderAllowedRoots();
});

document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(".desktop-shell-menu-wrap") && !target?.closest("#desktop-menu-panel")) {
    setDesktopMenuOpen(false);
  }

  const actionBtn = target?.closest(".control-action-btn");
  if (!actionBtn) return;

  const action = actionBtn.dataset.action;
  const args = {};

  if (actionBtn.dataset.app) {
    args.appName = actionBtn.dataset.app;
  }
  if (actionBtn.dataset.task) {
    args.taskName = actionBtn.dataset.task;
  }

  actionBtn.disabled = true;
  setStatus(`正在执行本地动作：${action}`);

  try {
    const response = await executeControlActionRequest(action, args);
    addMessage({
      role: "assistant",
      content: formatControlResult(response.action, response.result),
    });

    if (action === "system_stats") {
      state.systemStats = response.result;
      renderSystemStats();
    }

    setStatus(`本地动作已完成：${action}`, "success");
  } catch (error) {
    const hint = guidePermissionResolution(error.message);
    const message = hint || error.message;
    addMessage({
      role: "assistant",
      content: `本地动作执行失败：${message}`,
    });
    setStatus(`本地动作失败：${message}`, "warning");
  } finally {
    actionBtn.disabled = false;
  }
});

document.addEventListener("paste", async (event) => {
  if (event.defaultPrevented) {
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  const targetZone = getClipboardZoneFromTarget(target);
  const activeZone = targetZone || getActiveClipboardZone();
  if (
    isEditableElement(target) ||
    target?.closest?.("#canvas-viewport") ||
    target?.closest?.("#screen-source-panel") ||
    target?.closest?.("#screen-source-header-slot") ||
    state.activeRightPanelView === "screen"
  ) {
    return;
  }

  try {
    if (activeZone === "screen") {
      return;
    }

    if (activeZone === "assistant" || target?.closest?.(".conversation-panel")) {
      const handledConversationPaste = await pasteIntoAssistantFromClipboard(
        event.clipboardData,
        getCanvasPointerAnchorPoint()
      );
      if (handledConversationPaste) {
        event.preventDefault();
      }
      return;
    }

    if (activeZone === "canvas") {
      const appClipboard = getActiveAppClipboardPayload();
      if (shouldUseAppClipboardPayload(appClipboard, event.clipboardData) && pasteAppClipboardToCanvas(appClipboard, getCanvasPointerAnchorPoint())) {
        event.preventDefault();
        return;
      }

      const handled = await importClipboardOrDroppedData(event.clipboardData, "paste", getCanvasPointerAnchorPoint());
      if (handled) {
        event.preventDefault();
      }
    }
  } catch (error) {
    setCanvasStatus(`粘贴失败：${error.message}`);
  }
});

async function consumeNdjsonStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalState = {
    content: "",
    thinkingContent: "",
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      finalState = handleStreamLine(line, finalState);
    }
  }

  if (buffer.trim()) {
    finalState = handleStreamLine(buffer, finalState);
  }

  updateAssistantMessage(finalState.content || (finalState.thinkingContent ? "" : "模型没有返回内容。"), {
    thinkingContent: finalState.thinkingContent,
  });
}

function createSession({ switchTo = true, persist = true } = {}) {
  const now = Date.now();
  const session = {
    id: crypto.randomUUID(),
    title: CONFIG.defaultSessionTitle,
    createdAt: now,
    updatedAt: now,
    activeModel: state.model || "",
    summary: "",
    summaryUpdatedAt: null,
    messages: [],
  };

  state.sessions.unshift(session);

  if (switchTo) {
    state.currentSessionId = session.id;
  }

  if (persist) {
    persistSessions();
  }

  return session;
}

function deleteSession(sessionId) {
  if (!sessionId) return;

  state.sessions = state.sessions.filter((session) => session.id !== sessionId);
  resetDesktopAgentSession(sessionId);

  if (!state.sessions.length) {
    createSession({ switchTo: true, persist: false });
  } else if (state.currentSessionId === sessionId) {
    state.currentSessionId = state.sessions[0].id;
  }

  persistSessions();
  renderSessions();
  renderCurrentSession();
  renderContextStats();
  setStatus("会话已删除");
}

function switchSession(sessionId) {
  if (!sessionId || sessionId === state.currentSessionId) return;

  state.currentSessionId = sessionId;
  const session = getCurrentSession();
  if (session?.activeModel) {
    applyModelSelection(session.activeModel, { announce: false, persistSession: false });
  }
  persistSessions();
  renderSessions();
  renderCurrentSession();
  renderContextStats();
  setStatus("已切换会话");
}

function renameSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;

  state.editingSessionId = session.id;
  renderCurrentSessionHeader();
  renderSessions();
  focusSessionRenameInput(session.id);
}

function cancelSessionRename() {
  state.editingSessionId = null;
  renderCurrentSessionHeader();
  renderSessions();
}

function commitSessionRename(targetSessionId = state.editingSessionId) {
  const session = state.sessions.find((item) => item.id === targetSessionId);
  if (!session) {
    cancelSessionRename();
    return;
  }

  const cleaned = truncate(cleanTitle(getEditingSessionValue(session.id)), 40) || CONFIG.defaultSessionTitle;
  session.title = cleaned;
  touchSession(session);
  state.editingSessionId = null;
  persistSessions();
  renderSessions();
  renderCurrentSessionHeader();
  setStatus("会话名称已更新", "success");
}

function ensureCurrentSession() {
  let session = getCurrentSession();
  if (!session) {
    session = createSession({ switchTo: true, persist: false });
  }
  return session;
}

function getCurrentSession() {
  return state.sessions.find((session) => session.id === state.currentSessionId) || null;
}

function resolveExistingModelSelection(requestedModel, models = []) {
  const requested = String(requestedModel || "").trim();
  if (!requested) return "";

  const exact = models.find((item) => item.name === requested);
  if (exact) return exact.name;

  const requestedRaw = stripRoutedModelName(requested);
  const byRaw = models.find((item) => stripRoutedModelName(item.name) === requestedRaw);
  return byRaw?.name || "";
}

function addMessage({
  role,
  content,
  transient = false,
  model = "",
  thinkingEnabled = null,
  deviceMode = "",
  thinkingContent = "",
  reasoningLabel = "",
  pending = false,
}) {
  const session = ensureCurrentSession();
  clearEmptyState();
  const normalizedAssistantParts =
    role === "assistant"
      ? normalizeAssistantParts(content, thinkingContent, thinkingEnabled !== false)
      : {
          content: String(content || ""),
          thinkingContent: "",
        };

  const message = {
    id: crypto.randomUUID(),
    role,
    content: normalizedAssistantParts.content,
    model: role === "assistant" ? model : "",
    thinkingEnabled: role === "assistant" ? thinkingEnabled : null,
    deviceMode: role === "assistant" ? deviceMode : "",
    thinkingContent: role === "assistant" ? normalizedAssistantParts.thinkingContent : "",
    reasoningLabel: role === "assistant" ? String(reasoningLabel || "").trim() : "",
    pending: role === "assistant" ? Boolean(pending) : false,
    transient,
    summarized: false,
    createdAt: Date.now(),
  };

  session.messages.push(message);
  updateSessionTitle(session, message);
  touchSession(session);
  persistSessions();
  renderSessions();
  renderCurrentSessionHeader();

  const element = appendMessageElement(message);
  renderContextStats();
  scrollThreadToBottom();
  return element;
}

function updateAssistantMessage(content, streamingOrOptions = false, legacyThinkingContent = "") {
  const session = getCurrentSession();
  const targetId = state.currentAssistantId;
  if (!session || !targetId) return;

  const message = session.messages.find((item) => item.id === targetId);
  if (!message) return;

  const options =
    typeof streamingOrOptions === "object" && streamingOrOptions !== null
        ? streamingOrOptions
        : {
            streaming: Boolean(streamingOrOptions),
            thinkingContent: legacyThinkingContent,
          };
  const normalizedAssistantParts = normalizeAssistantParts(
    content,
    options.thinkingContent,
    message.thinkingEnabled !== false
  );

  message.content = normalizedAssistantParts.content;
  message.thinkingContent = normalizedAssistantParts.thinkingContent;
  if (typeof options.reasoningLabel === "string") {
    message.reasoningLabel = options.reasoningLabel.trim();
  }
  message.pending = Boolean(options.pending);
  touchSession(session);
  persistSessions();
  renderSessions();

  const target = chatLog.querySelector(`[data-message-id="${targetId}"]`);
  if (!target) return;

  hydrateMessageElement(target, message, { streaming: Boolean(options.streaming) });
  renderContextStats();
  scrollThreadToBottom();
}

function renderCurrentSession() {
  const session = getCurrentSession();
  chatLog.innerHTML = "";
  renderCurrentSessionHeader();

  if (!session || !session.messages.length) {
    renderEmptyState();
    return;
  }

  for (const message of session.messages) {
    appendMessageElement(message);
  }

  scrollThreadToBottom();
}

function appendMessageElement(message) {
  const fragment = messageTemplate.content.cloneNode(true);
  const messageEl = fragment.querySelector(".message");
  messageEl.dataset.messageId = message.id;
  hydrateMessageElement(messageEl, message);
  chatLog.appendChild(fragment);
  return chatLog.querySelector(`[data-message-id="${message.id}"]`);
}

function hydrateMessageElement(messageEl, message, { streaming = false } = {}) {
  const roleEl = messageEl.querySelector(".message-role");
  const timeEl = messageEl.querySelector(".message-time");
  const badgeEl = messageEl.querySelector(".message-badge");
  const contentEl = messageEl.querySelector(".message-content");

  messageEl.className = "message";
  messageEl.classList.add(message.role);
  roleEl.textContent = message.role === "user" ? "你" : getAppDisplayName();
  timeEl.textContent = formatTime(message.createdAt);
  const badgeParts = [];
  if (message.role === "assistant" && message.model) {
    badgeParts.push(getModelDisplayName(message.model));
  }
  if (message.role === "assistant" && message.deviceMode) {
    badgeParts.push(getDeviceModeLabel(message.deviceMode, getDeviceModeGpuName(message.deviceMode)));
  }
  if (message.role === "assistant" && supportsThinkingToggle(message.model)) {
    badgeParts.push(message.thinkingEnabled ? "Thinking" : "No Thinking");
  }
  if (message.summarized) {
    badgeParts.push("已压缩");
  }
  badgeEl.textContent = badgeParts.join(" · ");
  badgeEl.hidden = badgeParts.length === 0;

  setRichMessageContent(contentEl, message.content, {
    streaming,
    thinkingContent: message.thinkingContent,
    reasoningLabel: message.reasoningLabel,
    pending: Boolean(message.pending),
  });
}

function setRichMessageContent(
  container,
  content,
  { streaming = false, thinkingContent = "", reasoningLabel = "", pending = false } = {}
) {
  if (pending && !String(content || "").trim() && !String(thinkingContent || "").trim()) {
    container.innerHTML = `
      <div class="pending-reply" aria-live="polite" aria-label="回复等待中">
        <span class="pending-reply-label">回复等待中</span>
        <span class="pending-reply-dots" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </div>
    `;
    return;
  }

  const html = renderMessageHTML(content || (streaming ? "" : " "), thinkingContent, reasoningLabel);
  container.innerHTML = html || "<p></p>";

  if (streaming) {
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.textContent = " ";
    container.appendChild(cursor);
  }
}

function renderMessageHTML(text, thinkingText = "", reasoningLabel = "") {
  const messageParts = splitThinkingContent(text, thinkingText);
  const chunks = [];

  if (messageParts.thinkingContent) {
    chunks.push(renderThinkingBlock(messageParts.thinkingContent, reasoningLabel || "Thinking"));
  }

  if (messageParts.content) {
    chunks.push(renderStructuredContent(messageParts.content));
  }

  return chunks.join("");
}

function splitThinkingContent(text, thinkingText = "") {
  const source = String(text || "").replace(/\r\n/g, "\n");
  const extractedThinking = [];
  let cleanedContent = "";
  let cursor = 0;
  const thinkingRegex = /<think>([\s\S]*?)(?:<\/think>|$)/gi;
  let thinkingMatch;

  while ((thinkingMatch = thinkingRegex.exec(source))) {
    cleanedContent += source.slice(cursor, thinkingMatch.index);
    extractedThinking.push(String(thinkingMatch[1] || "").trim());
    cursor = thinkingRegex.lastIndex;
  }

  cleanedContent += source.slice(cursor);

  const mergedThinking = [String(thinkingText || "").trim(), ...extractedThinking]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join("\n\n")
    .trim();

  return {
    content: cleanedContent.trim(),
    thinkingContent: mergedThinking,
  };
}

function normalizeAssistantParts(content, thinkingText = "", allowThinking = true) {
  const parts = splitThinkingContent(content, thinkingText);
  return {
    content: parts.content,
    thinkingContent: allowThinking ? parts.thinkingContent : "",
  };
}

function renderThinkingBlock(text, label = "Thinking") {
  const body = renderStructuredContent(text);
  if (!body) return "";

  return `
    <section class="thinking-block">
      <div class="thinking-head">
        <span class="thinking-dot"></span>
        <span>${escapeHtml(label)}</span>
      </div>
      <div class="thinking-body">${body}</div>
    </section>
  `;
}

function renderStructuredContent(text) {
  const source = String(text || "").replace(/\r\n/g, "\n");
  const regex = /```([\w.+-]*)\n?([\s\S]*?)```/g;
  const chunks = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(source))) {
    const plain = source.slice(lastIndex, match.index);
    if (plain.trim()) {
      chunks.push(renderTextBlocks(plain));
    }

    const language = (match[1] || "").trim();
    const code = match[2].replace(/\n$/, "");
    chunks.push(renderCodeBlock(code, language));
    lastIndex = regex.lastIndex;
  }

  const tail = source.slice(lastIndex);
  if (tail.trim()) {
    chunks.push(renderTextBlocks(tail));
  }

  if (!chunks.length && source) {
    return renderTextBlocks(source);
  }

  return chunks.join("");
}

function renderTextBlocks(text) {
  const blocks = text
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean);

  return blocks.map((block) => renderTextBlock(block)).join("");
}

function renderTextBlock(block) {
  const lines = block.split("\n").filter((line) => line.length > 0);
  if (!lines.length) return "";

  if (lines.every((line) => /^\s*[-*•]\s+/.test(line))) {
    return `<ul>${lines
      .map((line) => `<li>${renderInlineText(line.replace(/^\s*[-*•]\s+/, ""))}</li>`)
      .join("")}</ul>`;
  }

  if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
    return `<ol>${lines
      .map((line) => `<li>${renderInlineText(line.replace(/^\s*\d+\.\s+/, ""))}</li>`)
      .join("")}</ol>`;
  }

  const heading = lines[0].match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
    const level = Math.min(heading[1].length + 2, 5);
    return `<h${level}>${renderInlineText(heading[2])}</h${level}>`;
  }

  return `<p>${lines.map((line) => renderInlineText(line)).join("<br>")}</p>`;
}

function renderInlineText(text) {
  const tokens = String(text).split(/(`[^`]+`)/g);

  return tokens
    .map((token) => {
      if (/^`[^`]+`$/.test(token)) {
        return `<code class="inline-code">${escapeHtml(token.slice(1, -1))}</code>`;
      }

      return applyBasicMarkup(escapeHtml(token));
    })
    .join("");
}

function applyBasicMarkup(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function renderCodeBlock(code, language) {
  const safeLang = sanitizeLanguage(language);
  const highlighted = highlightCode(code, safeLang);
  const displayLang = safeLang || "code";

  return `
    <section class="code-block">
      <div class="code-toolbar">
        <span class="code-lang">${escapeHtml(displayLang)}</span>
        <button class="code-copy-btn" type="button">复制</button>
      </div>
      <pre><code class="hljs ${safeLang ? `language-${safeLang}` : ""}">${highlighted}</code></pre>
    </section>
  `;
}

function highlightCode(code, language) {
  const hljs = window.hljs;
  const plain = escapeHtml(code);

  if (!hljs) return plain;

  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }

    return hljs.highlightAuto(code).value;
  } catch {
    return plain;
  }
}

function sanitizeLanguage(language) {
  return String(language || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9#+.-]/g, "");
}

function setComposerState(isBusy) {
  sendBtn.disabled = isBusy;
  stopBtn.disabled = !isBusy;
  clearBtn.disabled = isBusy;
  clearHistoryBtn.disabled = isBusy;
  if (refreshStorageBtn) {
    refreshStorageBtn.disabled = isBusy;
  }
  if (savePermissionsBtn) {
    savePermissionsBtn.disabled = isBusy;
  }
  if (refreshPermissionsBtn) {
    refreshPermissionsBtn.disabled = isBusy;
  }
  if (refreshSystemBtn) {
    refreshSystemBtn.disabled = isBusy;
  }
  if (addRootBtn) {
    addRootBtn.disabled = isBusy;
  }
  if (agentModeToggle) {
    agentModeToggle.disabled = isBusy;
  }
  if (renameSessionBtn) {
    renameSessionBtn.disabled = isBusy;
  }
  if (saveSessionRenameBtn) {
    saveSessionRenameBtn.disabled = isBusy;
  }
  if (cancelSessionRenameBtn) {
    cancelSessionRenameBtn.disabled = isBusy;
  }
  if (toggleLeftPaneBtn) {
    toggleLeftPaneBtn.disabled = isBusy;
  }
  if (toggleRightPaneBtn) {
    toggleRightPaneBtn.disabled = isBusy;
  }
  modelSelect.disabled = isBusy;
  if (deviceModeSelect) {
    deviceModeSelect.disabled = isBusy || !supportsRuntimeOptionsForModel(state.model);
  }
  if (outputModeSelect) {
    outputModeSelect.disabled = isBusy;
  }
  contextLimitSelect.disabled = isBusy;
  if (contextLimitInput) {
    contextLimitInput.disabled = isBusy;
  }
  if (contextLimitApplyBtn) {
    contextLimitApplyBtn.disabled = isBusy;
  }
  if (aiControlNewSessionBtn) {
    aiControlNewSessionBtn.disabled = isBusy;
  }
  sendBtn.textContent = isBusy ? "生成中" : "发送";
  historyListEl.classList.toggle("is-disabled", isBusy);
  aiControlHistoryListEl?.classList.toggle("is-disabled", isBusy);
}

function setStatus(text, tone = "") {
  statusTextEl.textContent = text;
  statusPillEl.classList.remove("status-error", "status-success", "status-warning");

  if (tone === "error") {
    statusPillEl.classList.add("status-error");
  }
  if (tone === "success") {
    statusPillEl.classList.add("status-success");
  }
  if (tone === "warning") {
    statusPillEl.classList.add("status-warning");
  }
}

function getPermissionMeta(permissionKey) {
  return PERMISSION_META.find((item) => item.key === permissionKey) || null;
}

function extractDisabledPermission(errorMessage) {
  const match = String(errorMessage || "").match(/Permission "([^"]+)" is disabled/);
  return match?.[1] || "";
}

function guidePermissionResolution(errorMessage) {
  const permissionKey = extractDisabledPermission(errorMessage);
  if (!permissionKey) return null;

  const meta = getPermissionMeta(permissionKey);
  const label = meta?.name || permissionKey;

  if (permissionAttentionTimer) {
    clearTimeout(permissionAttentionTimer);
  }

  permissionsSectionEl?.classList.add("is-attention");

  const targetItem = permissionGridEl
    ?.querySelector(`[data-permission-key="${permissionKey}"]`)
    ?.closest(".permission-item");
  targetItem?.classList.add("is-attention");

  setDrawerOpen(true);
  window.setTimeout(() => {
    permissionsSectionEl?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, 120);

  permissionAttentionTimer = setTimeout(() => {
    permissionsSectionEl?.classList.remove("is-attention");
    permissionGridEl
      ?.querySelectorAll(".permission-item.is-attention")
      .forEach((item) => item.classList.remove("is-attention"));
  }, 2600);

  return `需要先开启「${label}」权限，并点击“保存权限”`;
}

function renderEmptyState() {
  if (!chatLog) {
    return;
  }

  chatLog.classList.add("has-empty-state");
  chatLog.innerHTML = `
    <div class="empty-state" data-empty-state="true">
      <div class="empty-state-card empty-state-card-guide">
        <div class="empty-state-loader-host" aria-hidden="true"></div>
        <div class="empty-state-guide-copy">
          <strong>配置 AI 模型，开始对话。</strong>
        </div>
      </div>
    </div>
  `;
  mountLemniscateBloomLoader(chatLog.querySelector(".empty-state-loader-host"));
}

function clearEmptyState() {
  chatLog?.classList.remove("has-empty-state");
  const emptyState = chatLog.querySelector('[data-empty-state="true"]');
  if (emptyState) {
    emptyState.remove();
  }
}

function syncConversationEmptyStateVisibility() {
  const session = getCurrentSession();
  const hasMessages = Boolean(session?.messages?.length);
  const hasPrompt = Boolean(promptInput?.value?.trim());

  if (hasMessages || hasPrompt) {
    clearEmptyState();
    return;
  }

  renderEmptyState();
}

function renderSessionItem(session) {
  const active = session.id === state.currentSessionId;
  const editing = session.id === state.editingSessionId;
  const preview = escapeHtml(getSessionPreview(session));

  if (editing) {
    return `
      <article class="history-item ${active ? "is-active" : ""} is-editing" data-session-id="${session.id}">
        <div class="history-main">
          <input
            class="panel-input history-title-input"
            type="text"
            maxlength="40"
            value="${escapeHtml(session.title)}"
            data-inline-session-input="${session.id}"
          />
          <div class="history-preview">${preview}</div>
        </div>
        <div class="history-meta">
          <span>${formatRelativeTime(session.updatedAt)}</span>
          <div class="history-actions">
            <button class="history-rename" type="button" data-save-session-rename="${session.id}">保存</button>
            <button class="history-delete" type="button" data-cancel-session-rename="${session.id}">取消</button>
          </div>
        </div>
      </article>
    `;
  }

  return `
    <article class="history-item ${active ? "is-active" : ""}" data-session-id="${session.id}">
      <div class="history-main">
        <div class="history-title">${escapeHtml(session.title)}</div>
        <div class="history-preview">${preview}</div>
      </div>
      <div class="history-meta">
        <span>${formatRelativeTime(session.updatedAt)}</span>
        <div class="history-actions">
          <button class="history-rename" type="button" data-rename-session="${session.id}">重命名</button>
          <button class="history-delete" type="button" data-delete-session="${session.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderSessions() {
  const sessions = [...state.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  state.sessions = sessions;

  historyCountEl.textContent = `${sessions.length} 个会话`;
  renderAiControlHistory();
  if (historySummaryEl) {
    const latestSession = sessions[0];
    historySummaryEl.textContent = latestSession
      ? `${truncate(latestSession.title || CONFIG.defaultSessionTitle, 18)} · ${truncate(getSessionPreview(latestSession), 22)}`
      : "暂无会话";
  }

  if (!sessions.length) {
    historyListEl.innerHTML = `
      <div class="history-empty">还没有历史会话。</div>
    `;
    return;
  }

  historyListEl.innerHTML = `
    <section class="history-group-card">
      <div class="history-group-head">
        <div class="eyebrow">Sessions</div>
        <strong class="panel-title">全部会话</strong>
      </div>
      <div class="history-group-list">
        ${sessions.map((session) => renderSessionItem(session)).join("")}
      </div>
    </section>
  `;
}

function deleteMessageById(messageId) {
  const session = getCurrentSession();
  const targetId = String(messageId || "").trim();
  if (!session || !targetId) return false;

  const index = session.messages.findIndex((item) => item.id === targetId);
  if (index < 0) return false;

  session.messages.splice(index, 1);
  if (state.currentAssistantId === targetId) {
    state.currentAssistantId = null;
  }
  touchSession(session);
  persistSessions();
  renderSessions();
  renderCurrentSession();
  renderContextStats();
  setStatus("已删除该条对话", "success");
  return true;
}

function renderContextStats() {
  const session = getCurrentSession();
  const stats = getContextStats(session);
  const storageRows = getStorageRows();
  const activeModel = state.model || modelSelect?.value || "";
  const contextMax = getModelContextMax(activeModel);
  const contextOptions = getModelContextOptions(activeModel);

  contextSummaryEl.textContent = `${stats.used} / ${state.contextLimit} tokens`;
  contextUsedEl.textContent = String(stats.used);
  contextRemainingEl.textContent = String(stats.remaining);
  messageCountEl.textContent = String(stats.activeMessages.length);
  contextRatioEl.textContent = `${Math.round(stats.ratio)}%`;
  contextProgressEl.style.width = `${stats.ratio}%`;
  if (contextLimitSelect) {
    ensureContextLimitOption(state.contextLimit, activeModel);
    contextLimitSelect.value = String(state.contextLimit);
  }
  if (contextLimitInput) {
    contextLimitInput.value = String(state.contextLimit);
    contextLimitInput.placeholder = contextMax ? `最大 ${contextMax}` : "例如 8192";
  }
  if (contextLimitHintEl) {
    const presets = contextOptions.map((value) => `${Math.round(value / 1024)}k`).join(" / ");
    contextLimitHintEl.textContent = contextMax
      ? `当前模型最大上下文约 ${Math.round(contextMax / 1024)}k，可选预设：${presets || `${Math.round(contextMax / 1024)}k`}。`
      : "当前模型可用窗口会随模型切换自动更新。";
  }

  budgetCardEl.classList.remove("progress-warning", "progress-danger");
  if (stats.ratio >= 90) {
    budgetCardEl.classList.add("progress-danger");
  } else if (stats.ratio >= 75) {
    budgetCardEl.classList.add("progress-warning");
  }

  if (!storageRows.length) {
    contextBreakdownEl.innerHTML = `
      <div class="usage-row">
        <div class="snippet">当前还没有历史对话写入会话文件。</div>
        <div class="token">0 B</div>
      </div>
    `;
    renderAiRuntimeSummary();
    return;
  }

  const rows = [
    `
      <div class="usage-row summary-row">
        <div>
          <div class="label">会话文件总占用</div>
          <div class="snippet">sessions.json</div>
          <div class="sub-snippet">${escapeHtml(state.storageInfo.file || "D:\\FreeFlow-WorkBoard\\data\\sessions.json")}</div>
        </div>
        <div class="token">${formatBytes(state.storageInfo.fileSizeBytes)}</div>
      </div>
    `,
    ...storageRows.map((row) => `
      <div class="usage-row ${row.id === state.currentSessionId ? "summary-row" : ""}">
        <div>
          <div class="label">${row.id === state.currentSessionId ? "当前会话" : "历史会话"}</div>
          <div class="snippet">${escapeHtml(row.title)}</div>
        </div>
        <div class="token">${formatBytes(row.bytes)}</div>
      </div>
    `),
  ];

  contextBreakdownEl.innerHTML = rows.join("");
  renderAiRuntimeSummary();
}

function renderAiControlHistory() {
  if (!aiControlHistoryListEl) {
    return;
  }

  const sessions = [...state.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  if (aiControlHistoryCountEl) {
    aiControlHistoryCountEl.textContent = `${sessions.length} 个会话`;
  }

  if (!sessions.length) {
    aiControlHistoryListEl.innerHTML = `<div class="history-empty">还没有历史会话。</div>`;
    return;
  }

  aiControlHistoryListEl.innerHTML = sessions
    .slice(0, 8)
    .map(
      (session) => `
        <article class="history-item ai-control-history-item${session.id === state.currentSessionId ? " is-active" : ""}">
          <button
            class="ai-control-history-main"
            type="button"
            data-ai-control-session-id="${escapeHtml(session.id)}"
          >
            <div class="history-main">
              <div class="history-title">${escapeHtml(session.title || CONFIG.defaultSessionTitle)}</div>
              <div class="history-preview">${escapeHtml(getSessionPreview(session))}</div>
            </div>
            <div class="history-meta">
              <span>${formatRelativeTime(session.updatedAt)}</span>
            </div>
          </button>
          <button
            class="history-delete ai-control-history-delete"
            type="button"
            data-ai-control-delete-session="${escapeHtml(session.id)}"
          >
            删除
          </button>
        </article>
      `
    )
    .join("");
}

function renderPermissions() {
  permissionGridEl.innerHTML = PERMISSION_META.map((item) => {
    const enabled = Boolean(state.permissionStore.permissions[item.key]);
    return `
      <label class="permission-item" data-permission-item="${item.key}">
        <div class="permission-meta">
          <div class="permission-name">${item.name}</div>
          <div class="permission-desc">${item.description}</div>
        </div>
        <input type="checkbox" data-permission-key="${item.key}" ${enabled ? "checked" : ""} />
      </label>
    `;
  }).join("");
}

function renderAllowedRoots() {
  if (!state.permissionStore.allowedRoots.length) {
    allowedRootListEl.innerHTML = `
      <div class="usage-row">
        <div class="snippet">当前还没有授权目录。</div>
      </div>
    `;
    return;
  }

  allowedRootListEl.innerHTML = state.permissionStore.allowedRoots
    .map((root) => `
      <div class="root-row">
        <div class="snippet">${escapeHtml(root)}</div>
        <button class="remove-root-btn" type="button" data-remove-root="${escapeHtml(root)}">移除</button>
      </div>
    `)
    .join("");
}

function renderSystemStats() {
  if (!state.systemStats) {
    systemStatsEl.innerHTML = `
      <div class="stat-row">
        <div class="snippet">点击“刷新监控”后显示 CPU、内存、磁盘实时状态。</div>
      </div>
    `;
    return;
  }

  const mem = state.systemStats.memory || {};
  const firstDisk = state.systemStats.disks?.[0];

  systemStatsEl.innerHTML = `
    <div class="stat-row">
      <div class="snippet">CPU 占用</div>
      <div class="token">${state.systemStats.cpuPercent}%</div>
    </div>
    <div class="stat-row">
      <div class="snippet">内存占用</div>
      <div class="token">${formatBytes(mem.usedBytes || 0)} / ${formatBytes(mem.totalBytes || 0)}</div>
    </div>
    <div class="stat-row">
      <div class="snippet">主磁盘 ${firstDisk?.device || ""}</div>
      <div class="token">${firstDisk ? `${formatBytes(firstDisk.usedBytes)} / ${formatBytes(firstDisk.sizeBytes)}` : "无"}</div>
    </div>
    <div class="stat-row">
      <div class="snippet">系统运行时长</div>
      <div class="token">${formatDuration(state.systemStats.uptimeSeconds || 0)}</div>
    </div>
  `;
}

function getContextStats(session) {
  const activeMessages = session
    ? session.messages.filter((item) => !item.transient && !item.summarized && item.content.trim())
    : [];

  const summaryTokens = session?.summary ? estimateTokens(session.summary) + CONFIG.summaryOverhead : 0;
  const hasContext = summaryTokens > 0 || activeMessages.length > 0;
  const used = hasContext
    ? summaryTokens +
      CONFIG.contextOverhead +
      activeMessages.reduce((total, item) => total + estimateTokens(item.content) + CONFIG.messageOverhead, 0)
    : 0;
  const remaining = Math.max(state.contextLimit - used, 0);
  const ratio = state.contextLimit ? Math.min((used / state.contextLimit) * 100, 100) : 0;

  return {
    used,
    remaining,
    ratio,
    summaryTokens,
    activeMessages,
  };
}

function getStorageRows() {
  return [...state.sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((session) => ({
      id: session.id,
      title: session.title || CONFIG.defaultSessionTitle,
      bytes: estimateSessionBytes(session),
    }));
}

async function loadPermissions() {
  const response = await fetch("/api/permissions");
  const data = await readJsonResponse(response, "权限配置");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "无法读取权限配置");
  }

  state.permissionStore = {
    file: data.file || "",
    desktopDir: data.desktopDir || "",
    workspaceDir: data.workspaceDir || "",
    permissions: { ...(data.permissions || {}) },
    allowedRoots: Array.isArray(data.allowedRoots) ? data.allowedRoots : [],
  };
}

async function loadModelProfiles() {
  const response = await fetch("/api/model-profiles");
  const data = await readJsonResponse(response, "模型档案");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "无法读取模型档案");
  }

  const normalized = sanitizeModelProfilesMap(data.profiles);
  state.modelProfiles = normalized.profiles;

  if (normalized.changed) {
    saveModelProfiles().catch(() => {});
  }
}

async function saveModelProfiles() {
  const response = await fetch("/api/model-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profiles: state.modelProfiles,
    }),
  });
  const data = await readJsonResponse(response, "模型档案");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "无法保存模型档案");
  }

  state.modelProfiles = sanitizeModelProfilesMap(data.profiles).profiles;
}

function mergeModelProfiles(modelNames) {
  let changed = false;

  for (const modelName of modelNames) {
    const normalized = normalizeModelProfileEntry(modelName, state.modelProfiles[modelName]);
    if (
      !state.modelProfiles[modelName] ||
      Number(state.modelProfiles[modelName].contextLimit) !== normalized.contextLimit ||
      state.modelProfiles[modelName].deviceMode !== normalized.deviceMode ||
      Boolean(state.modelProfiles[modelName].thinkingEnabled) !== normalized.thinkingEnabled
    ) {
      state.modelProfiles[modelName] = normalized;
      changed = true;
    }
  }

  if (changed) {
    saveModelProfiles().catch(() => {});
  }
}

async function savePermissions() {
  const response = await fetch("/api/permissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      permissions: state.permissionStore.permissions,
      allowedRoots: state.permissionStore.allowedRoots,
    }),
  });
  const data = await readJsonResponse(response, "权限配置");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "无法保存权限配置");
  }

  state.permissionStore = {
    file: data.file || "",
    desktopDir: data.desktopDir || "",
    workspaceDir: data.workspaceDir || "",
    permissions: { ...(data.permissions || {}) },
    allowedRoots: Array.isArray(data.allowedRoots) ? data.allowedRoots : [],
  };

  renderPermissions();
  renderAllowedRoots();
}

async function refreshSystemStats() {
  const response = await fetch("/api/system/stats");
  const data = await readJsonResponse(response, "系统监控");

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "无法获取系统监控信息");
  }

  state.systemStats = data.stats;
}

async function executeControlActionRequest(action, args = {}) {
  const response = await fetch("/api/control/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
  const data = await readJsonResponse(response, `本地动作 ${action}`);

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "本地动作执行失败");
  }

  return data;
}

async function resetDesktopAgentSession(sessionId) {
  return;
}

async function runAgentModeTask(prompt) {
  const model = getPreferredAgentModel();
  const session = ensureCurrentSession();
  const flowSteps = [
    `接收用户请求：${truncate(String(prompt || "").trim(), 80) || "空请求"}`,
    `切换到管家模型：${getModelDisplayName(model)}`,
    "读取当前会话上下文并理解用户意图",
  ];
  const syncAgentFlow = (content, extraOptions = {}) => {
    updateAssistantMessage(content, {
      pending: Boolean(extraOptions.pending),
      thinkingContent: buildExecutionFlowText(flowSteps),
      reasoningLabel: "执行流",
    });
  };

  addMessage({ role: "user", content: prompt });
  promptInput.value = "";
  autoresize();

      const placeholder = addMessage({
        role: "assistant",
        content: `管家模式已接收任务，正在用 ${getModelDisplayName(model)} 理解你的意图...`,
        model,
        thinkingEnabled: getModelProfile(model).thinkingEnabled,
        deviceMode: isLocalModel(model) ? getModelDeviceMode(model) : "cloud",
    thinkingContent: buildExecutionFlowText(flowSteps),
    reasoningLabel: "执行流",
    pending: true,
  });
  state.currentAssistantId = placeholder.dataset.messageId;
  state.abortController = new AbortController();
  state.activeTaskRoute = "agent";
  setComposerState(true);
  setStatus(`管家模式正在处理任务：${getModelDisplayName(model)}`);

  try {
    syncAgentFlow(`管家模式已接收任务，正在用 ${getModelDisplayName(model)} 理解你的意图...`, {
      pending: true,
    });
    const decision = await rewriteAgentTask(prompt, session, model);

    if (!decision || !decision.mode) {
      throw new Error("模型没有返回有效的管家决策");
    }

    if (decision.mode === "clarify") {
      flowSteps.push("判定结果：信息不足，需要向用户追问");
      syncAgentFlow(decision.reply || "我还需要你补充一点信息，才能继续处理这个任务。");
      setStatus("管家模式需要补充信息", "warning");
      return;
    }

      if (decision.mode === "reply") {
        flowSteps.push("判定结果：这是对话请求，直接给出自然语言回复");
        if (isLocalModel(model)) {
          flowSteps.push("当前由本地模型负责对话理解与任务规划");
        }
        syncAgentFlow(decision.reply || "我理解了你的问题，当前不需要实际执行电脑动作。");
        setStatus(`管家模式已回复：${getModelDisplayName(model)}`, "success");
        return;
      }

    const rewrittenTask = String(decision.task || "").trim();
    if (!rewrittenTask) {
      throw new Error("模型决定执行动作，但没有返回标准命令");
    }

    flowSteps.push(`判定结果：需要执行本地动作`);
    flowSteps.push(`规划命令：${rewrittenTask}`);
    if (isLocalModel(model)) {
      flowSteps.push("当前由本地模型负责意图理解与动作规划");
      if (/^(分析界面|识别文字|点击按钮)/.test(rewrittenTask)) {
        flowSteps.push("视觉识别阶段将调用云端视觉模型执行截图理解与定位");
      }
    }
    syncAgentFlow(
      `${decision.reply || "我已经理解你的请求，准备执行本地动作。"}\n\n规划命令：${rewrittenTask}\n\n正在执行本地动作...`,
      { pending: true }
    );

    const response = await fetch("/api/agent/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: rewrittenTask,
      }),
      signal: state.abortController.signal,
    });
    const data = await readJsonResponse(response, "管家模式");

    if (!response.ok || !data.ok) {
      throw new Error(data.details || data.error || "管家模式执行失败");
    }

    if (!data.planned) {
      flowSteps.push("执行层反馈：标准命令未被本地控制器识别");
      syncAgentFlow(data.message || "当前管家模式无法解析这个任务。");
      setStatus("管家模式未能解析任务", "warning");
      return;
    }

    flowSteps.push(`执行动作：${data.action}`);
    flowSteps.push("执行完成，正在整理结果回复");
    syncAgentFlow(
      `${decision.reply || "我已经完成这个任务。"}\n\n规划命令：${rewrittenTask}\n\n执行结果：\n${formatControlResult(
        data.action,
        data.result
      )}`
    );
    if (data.action === "system_stats") {
      state.systemStats = data.result;
      renderSystemStats();
    }
    setStatus(`管家模式已完成任务：${getModelDisplayName(model)}`, "success");
  } catch (error) {
    if (error.name === "AbortError") {
      flowSteps.push("任务被用户中止");
      syncAgentFlow("管家模式已停止当前任务。");
      setStatus("已停止当前管家模式任务", "warning");
    } else {
      const hint = guidePermissionResolution(error.message);
      const message = hint || error.message;
      flowSteps.push(`执行失败：${message}`);
      syncAgentFlow(`管家模式执行失败：${message}`);
      setStatus(`管家模式失败：${message}`, "warning");
    }
  } finally {
    state.abortController = null;
    state.currentAssistantId = null;
    state.activeTaskRoute = "";
    setComposerState(false);
  }
}

async function runDoubaoWebTask(prompt) {
  if (!IS_DESKTOP_APP) {
    throw new Error("豆包网页版桥接只在桌面版可用，请使用 npm run start:desktop 启动。");
  }

  const model = modelSelect.value || state.model || DOUBAO_WEB_MODEL;
  const session = ensureCurrentSession();
  session.activeModel = model;

  addMessage({ role: "user", content: prompt });
  promptInput.value = "";
  autoresize();

  const assistantMessage = addMessage({
    role: "assistant",
    content: "正在激活豆包网页版...",
    model,
    deviceMode: "browser",
  });
  state.currentAssistantId = assistantMessage.dataset.messageId;
  state.abortController = new AbortController();
  state.activeTaskRoute = "doubao-web";
  setComposerState(true);
  setStatus("正在通过后端调用豆包网页版");

  const abortHandler = () => {
    fetch("/api/doubao-web/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  };
  state.abortController.signal.addEventListener("abort", abortHandler, { once: true });

  try {
    updateAssistantMessage("后端正在打开豆包网页、输入消息并等待回复...");
    const response = await fetch("/api/doubao-web/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        timeoutMs: 120000,
      }),
      signal: state.abortController.signal,
    });
    const result = await readJsonResponse(response, "豆包网页版");

    if (!response.ok) {
      throw new Error(result?.error || "豆包网页版接口调用失败");
    }

    if (!result?.ok) {
      if (result?.aborted || state.abortController.signal.aborted) {
        throw new DOMException("豆包网页调用已取消", "AbortError");
      }
      const stage = result?.stage ? `阶段：${result.stage}。` : "";
      throw new Error(`${stage}${result?.error || "豆包网页调用失败"}`);
    }

    updateAssistantMessage(result.reply || "豆包网页没有返回可读取内容。");
    setStatus(result.partial ? "豆包网页版返回了部分回答" : "豆包网页版回复完成", "success");
  } catch (error) {
    if (error.name === "AbortError") {
      updateAssistantMessage("已停止当前豆包网页任务。");
      setStatus("已停止当前豆包网页任务", "warning");
    } else {
      const message = formatDoubaoBridgeError(error);
      updateAssistantMessage(`豆包网页调用失败：${message}`);
      setStatus(`豆包网页失败：${message}`, "warning");
    }
  } finally {
    state.abortController = null;
    state.currentAssistantId = null;
    state.activeTaskRoute = "";
    setComposerState(false);
    persistSessions();
    renderSessions();
    renderContextStats();
  }
}

function formatDoubaoBridgeError(error) {
  const raw = String(error?.message || error || "").trim();
  if (!raw) {
    return "未知错误";
  }

  if (
    raw.includes("No handler registered for 'desktop-shell:chat-with-doubao'") ||
    raw.includes("No handler registered for \"desktop-shell:chat-with-doubao\"")
  ) {
    return "桌面主进程还是旧版本。请完整关闭桌面版窗口后重新执行 npm run start:desktop，再试一次。";
  }

  if (
    raw.includes("No handler registered for 'desktop-shell:open-doubao-window'") ||
    raw.includes("No handler registered for 'desktop-shell:cancel-doubao-chat'")
  ) {
    return "豆包网页桥接尚未载入到 Electron 主进程。请完整重启桌面版。";
  }

  if (raw.includes("网页没有接受自动输入")) {
    return "已找到豆包输入框，但当前网页控件没有接受自动输入。需要继续兼容豆包当前网页编辑器。";
  }

  return raw;
}

function formatControlResult(action, result) {
  switch (action) {
    case "system_stats":
      return [
        "本地系统监控结果：",
        `- CPU: ${result.cpuPercent}%`,
        `- 内存: ${formatBytes(result.memory.usedBytes)} / ${formatBytes(result.memory.totalBytes)}`,
        ...(result.disks || []).map(
          (disk) => `- 磁盘 ${disk.device}: ${formatBytes(disk.usedBytes)} / ${formatBytes(disk.sizeBytes)}`
        ),
      ].join("\n");
    case "organize_desktop":
      return `桌面整理完成。\n已移动 ${result.movedCount} 个文件。`;
    case "launch_app":
      return `已打开应用：${result.launched}`;
    case "close_app":
      return `已关闭应用：${result.closed}`;
    case "list_windows":
      return `窗口列表：\n${(result.windows || [])
        .map((item) => `- ${item.title || "(无标题)"} [${item.processName}]`)
        .join("\n") || "未发现可用窗口"}`;
    case "focus_window":
      return `已聚焦窗口：${result.title || result.query}\n进程：${result.processName || "未知"}`;
    case "analyze_window_ui":
      return [
        `界面理解完成：${result.window?.title || "当前窗口"}`,
        result.analysis || "视觉模型没有返回说明。",
      ].join("\n\n");
    case "recognize_window_text":
      return [
        `文字识别完成：${result.window?.title || "当前窗口"}`,
        `OCR 引擎：${result.engine || "未知"}`,
        result.text || "没有识别到可用文字。",
      ].join("\n\n");
    case "click_window_element":
      return [
        `已点击界面元素：${result.target || "未命名目标"}`,
        `窗口：${result.window?.title || "当前窗口"}`,
        `坐标：(${result.x}, ${result.y})`,
        result.reason ? `定位说明：${result.reason}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "read_file":
      return `已读取文件：${result.path}\n\n${result.content}`;
    case "write_file":
      return `已写入文件：${result.path}\n写入大小：${formatBytes(result.bytesWritten)}`;
    case "list_directory":
      return `目录内容：${result.path}\n${result.entries.map((entry) => `- [${entry.type}] ${entry.name}`).join("\n")}`;
    case "keyboard_text":
      return `已发送键盘文本输入。`;
    case "mouse_click":
      return `已执行鼠标点击：(${result.x}, ${result.y})`;
    case "run_script":
      return `脚本执行完成。\n${result.stdout || result.stderr || "无输出"}`;
    case "repair_task":
      return `修复任务已执行：${result.task}\n${result.stdout || result.stderr || "无输出"}`;
    default:
      return JSON.stringify(result, null, 2);
  }
}

async function maybeCompressConversation(session, model) {
  if (!session || state.compressionInFlight) return false;

  const stats = getContextStats(session);
  if (stats.ratio < CONFIG.compressionTriggerRatio * 100) return false;

  const unsummarized = session.messages.filter((item) => !item.transient && !item.summarized && item.content.trim());
  if (unsummarized.length <= CONFIG.keepRecentMessages) return false;

  const candidates = unsummarized.slice(0, -CONFIG.keepRecentMessages);
  if (candidates.length < CONFIG.minMessagesToCompress) return false;

  state.compressionInFlight = true;
  setStatus("正在压缩早期对话上下文");

  try {
  const response = await fetch(API_ROUTES.chatOnce, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        options: buildRequestOptions(model, {
          temperature: 0.2,
        }),
        messages: applyThinkingDirective(
          [
            {
              role: "system",
              content:
                "你是对话压缩器。请把已有对话总结成供另一个模型继续工作的上下文摘要。保留用户目标、限制条件、关键事实、已做决定、未解决问题、文件名或代码线索。不要回答问题，不要扩展内容，输出简洁中文项目符号。",
            },
            {
              role: "user",
              content: buildSummaryPrompt(session.summary, candidates),
            },
          ],
          model
        ),
      }),
    });

    const data = await readJsonResponse(response, "对话压缩");
    if (!response.ok || !data.ok || !data.message?.trim()) {
      throw new Error(data.details || data.error || "摘要压缩失败");
    }

    session.summary = data.message.trim();
    session.summaryUpdatedAt = Date.now();

    for (const item of candidates) {
      item.summarized = true;
    }

    touchSession(session);
    persistSessions();
    renderSessions();
    renderCurrentSession();
    setStatus("早期对话已压缩", "success");
    return true;
  } catch (error) {
    setStatus(`对话压缩失败：${error.message}`, "warning");
    return false;
  } finally {
    state.compressionInFlight = false;
  }
}

function buildPayloadMessages(session, canvasItemIds = []) {
  const messages = [];
  const canvasContext = buildCanvasSelectionContext(
    Array.isArray(canvasItemIds) && canvasItemIds.length ? canvasItemIds : state.canvasBoard.selectedIds
  );

  if (session?.summary) {
    messages.push({
      role: "system",
      content: `以下是当前会话的运行摘要，请作为上下文继续处理：\n${session.summary}`,
    });
  }

  if (canvasContext) {
    messages.push({
      role: "system",
      content: `以下是左侧无限画布中当前选中的素材卡，请优先把它们作为本次回复的上下文：\n${canvasContext}`,
    });
  }

  messages.push(
    ...session.messages
      .filter((item) => !item.transient && !item.summarized && item.content.trim())
      .map(({ role, content }) => ({ role, content }))
  );

  return messages;
}

function buildSummaryPrompt(existingSummary, messages) {
  const messageText = messages
    .map((item) => `[${item.role === "user" ? "用户" : getAppDisplayName()}] ${item.content}`)
    .join("\n\n");

  return `已有摘要：
${existingSummary || "暂无"}

请将下面这些较早消息压缩进新的运行摘要：
${messageText}

要求：
- 输出简洁项目符号
- 保留目标、限制、已确认决定、未解决事项
- 如涉及代码或文件，保留文件名、接口名、关键参数
- 不要添加原文中没有的信息`;
}

function updateSessionTitle(session, message) {
  if (message.role !== "user") return;
  if (session.title !== CONFIG.defaultSessionTitle) return;

  const title = truncate(cleanTitle(message.content), CONFIG.maxTitleLength);
  session.title = title || CONFIG.defaultSessionTitle;
}

function cleanTitle(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/[`*_#>-]/g, "")
    .trim();
}

function touchSession(session) {
  session.updatedAt = Date.now();
  state.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

function getSessionPreview(session) {
  const latest = [...session.messages].reverse().find((item) => item.content.trim());
  if (latest) return truncate(latest.content.replace(/\s+/g, " ").trim(), 44);
  if (session.summary) return truncate(`摘要: ${session.summary}`, 44);
  return "空会话";
}

function scrollThreadToBottom() {
  requestAnimationFrame(() => {
    threadViewport.scrollTop = threadViewport.scrollHeight;
  });
}

function autoresize() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 220)}px`;
  syncComposerOffset();
}

function syncComposerOffset() {
  if (!conversationPanel || !chatForm) return;

  const composerOffset = chatForm.offsetHeight + 30;
  conversationPanel.style.setProperty("--composer-offset", `${composerOffset}px`);
}

function observeComposerSize() {
  if (!window.ResizeObserver || !chatForm) return;

  const observer = new ResizeObserver(() => {
    syncComposerOffset();
  });

  observer.observe(chatForm);
  window.addEventListener("resize", syncComposerOffset);
}

function observeScreenSourcePreviewSize() {
  if (!window.ResizeObserver || !screenSourcePreviewShellEl) return;

  const observer = new ResizeObserver(() => {
    scheduleEmbeddedScreenSourceSync();
  });

  observer.observe(screenSourcePreviewShellEl);
}

function observeScreenSourceToolbarSize() {
  if (!window.ResizeObserver || !screenSourceToolbarEl) return;

  const observer = new ResizeObserver(() => {
    scheduleScreenSourceToolbarLayoutSync();
    scheduleScreenSourceHeaderMenuLayoutSync();
  });

  observer.observe(screenSourceToolbarEl);
  if (screenSourcePanelEl) {
    observer.observe(screenSourcePanelEl);
  }
  if (conversationPanel) {
    observer.observe(conversationPanel);
  }
}

async function safeErrorText(response) {
  try {
    const payload = await readJsonResponse(response);
    return payload.details || payload.error;
  } catch {
    try {
      const text = await response.text();
      return text.slice(0, 160);
    } catch {
      return "";
    }
  }
}

function handleStreamLine(line, currentState) {
  if (!line.trim()) return currentState;

  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return currentState;
  }

  const chunk = String(parsed.message?.content ?? "");
  const thinkingChunk = String(parsed.message?.thinking ?? "");
  if (!chunk && !thinkingChunk) return currentState;

  const nextState = {
    content: mergeStreamText(currentState.content, chunk),
    thinkingContent: mergeStreamText(currentState.thinkingContent, thinkingChunk),
  };

  updateAssistantMessage(nextState.content, {
    streaming: true,
    thinkingContent: nextState.thinkingContent,
  });
  return nextState;
}

function mergeStreamText(currentText, incomingChunk) {
  const current = String(currentText || "");
  const incoming = String(incomingChunk || "");

  if (!incoming) return current;
  if (!current) return incoming;
  if (incoming === current) return current;
  if (incoming.startsWith(current)) return incoming;
  if (current.endsWith(incoming)) return current;

  const maxOverlap = Math.min(current.length, incoming.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (current.slice(-size) === incoming.slice(0, size)) {
      return current + incoming.slice(size);
    }
  }

  return current + incoming;
}

function estimateTokens(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  if (!compact) return 0;

  const cjkChars = (compact.match(/[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g) || []).length;
  const otherChars = Math.max(compact.length - cjkChars, 0);
  return Math.max(1, Math.round(cjkChars * 1.08 + otherChars / 3.6));
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(value) {
  const diff = Date.now() - value;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;

  return new Date(value).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

async function loadSessions() {
  try {
  const response = await fetch(API_ROUTES.sessions);
    const data = await readJsonResponse(response, "会话文件");

    if (!response.ok || !data.ok) {
      throw new Error(data.details || data.error || "无法读取会话文件");
    }

    const normalizedSessions = normalizeSessions(data.sessions);
    applyStorageInfo(data);

    if (!normalizedSessions.length) {
      const migrated = migrateLegacyLocalSessions();
      if (migrated) {
        state.sessions = migrated.sessions;
        state.currentSessionId = migrated.currentSessionId;
        await persistSessions(true);
        setStatus("已将旧浏览器会话迁移到本地文件", "success");
        return;
      }
    }

    state.sessions = normalizedSessions;
    state.currentSessionId = data.currentSessionId || normalizedSessions[0]?.id || null;
  } catch (error) {
    state.sessions = [];
    state.currentSessionId = null;
    setStatus(`会话文件读取失败：${error.message}`, "warning");
  }
}

function persistSessions(immediate = false) {
  if (state.persistTimer) {
    clearTimeout(state.persistTimer);
    state.persistTimer = null;
  }

  const run = () => {
    const payload = {
      currentSessionId: state.currentSessionId,
      sessions: state.sessions,
    };

    state.persistPromise = state.persistPromise
      .catch(() => {})
      .then(() =>
        fetch(API_ROUTES.sessions, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) {
            throw new Error(data.details || data.error || "会话文件写入失败");
          }

          applyStorageInfo(data);
        })
      )
      .catch((error) => {
        setStatus(`会话保存失败：${error.message}`, "warning");
      });
  };

  if (immediate) {
    run();
    return state.persistPromise;
  }

  state.persistTimer = setTimeout(run, 250);
  return state.persistPromise;
}

function normalizeSessions(input) {
  return Array.isArray(input)
    ? input
        .map((session) => ({
          id: session.id || crypto.randomUUID(),
          title: session.title || CONFIG.defaultSessionTitle,
          createdAt: Number(session.createdAt) || Date.now(),
          updatedAt: Number(session.updatedAt) || Date.now(),
          activeModel: typeof session.activeModel === "string" ? session.activeModel : "",
          summary: session.summary || "",
          summaryUpdatedAt: session.summaryUpdatedAt ? Number(session.summaryUpdatedAt) : null,
          messages: Array.isArray(session.messages)
            ? session.messages.map((message) => {
                const role = message.role === "assistant" ? "assistant" : "user";
                const normalizedAssistantParts =
                  role === "assistant"
                    ? normalizeAssistantParts(
                        String(message.content || ""),
                        typeof message.thinkingContent === "string" ? message.thinkingContent : "",
                        message.thinkingEnabled !== false
                      )
                    : {
                        content: String(message.content || ""),
                        thinkingContent: "",
                      };

                  return {
                    id: message.id || crypto.randomUUID(),
                    role,
                    content: normalizedAssistantParts.content,
                    model: typeof message.model === "string" ? message.model : "",
                    thinkingContent: normalizedAssistantParts.thinkingContent,
                    reasoningLabel: typeof message.reasoningLabel === "string" ? message.reasoningLabel : "",
                    thinkingEnabled:
                      typeof message.thinkingEnabled === "boolean" ? message.thinkingEnabled : null,
                    deviceMode: typeof message.deviceMode === "string" ? message.deviceMode : "",
                  transient: Boolean(message.transient),
                  summarized: Boolean(message.summarized),
                  createdAt: Number(message.createdAt) || Date.now(),
                };
              })
            : [],
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    : [];
}

async function refreshStorageUsage() {
  const response = await fetch(API_ROUTES.sessions);
  const data = await readJsonResponse(response, "会话文件");

  if (!response.ok || !data.ok) {
    throw new Error(data.details || data.error || "无法读取会话文件");
  }

  state.sessions = normalizeSessions(data.sessions);
  state.currentSessionId = data.currentSessionId || state.sessions[0]?.id || null;
  applyStorageInfo(data);
  renderSessions();
  renderCurrentSession();
}

function applyStorageInfo(data) {
  state.storageInfo = {
    file: data.file || state.storageInfo.file,
    fileSizeBytes: Number(data.fileSizeBytes) || 0,
    updatedAt: data.updatedAt ? Number(data.updatedAt) : state.storageInfo.updatedAt,
  };
}

function estimateSessionBytes(session) {
  try {
    return new TextEncoder().encode(JSON.stringify(session)).length;
  } catch {
    return 0;
  }
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(seconds) {
  const value = Math.max(Number(seconds) || 0, 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function migrateLegacyLocalSessions() {
  try {
    const raw = localStorage.getItem(CONFIG.legacyStorageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const sessions = normalizeSessions(parsed);
    if (!sessions.length) return null;

    const currentSessionId =
      localStorage.getItem(CONFIG.legacyCurrentSessionKey) || sessions[0]?.id || null;

    localStorage.removeItem(CONFIG.legacyStorageKey);
    localStorage.removeItem(CONFIG.legacyCurrentSessionKey);

    return {
      sessions,
      currentSessionId,
    };
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

