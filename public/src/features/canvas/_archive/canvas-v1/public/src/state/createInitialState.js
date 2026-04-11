import { CONFIG } from "../config/app.config.js";
import { PERMISSION_META, SIDEBAR_SECTION_DEFS } from "../config/ui-meta.js";
import { DEFAULT_THEME_SETTINGS } from "../theme/themeSettings.js";

export function getDefaultPermissionStore() {
  return {
    file: "",
    desktopDir: "",
    workspaceDir: "",
    permissions: Object.fromEntries(PERMISSION_META.map((item) => [item.key, false])),
    allowedRoots: [],
  };
}

export function createInitialState() {
  return {
    sessions: [],
    currentSessionId: null,
    currentAssistantId: null,
    abortController: null,
    model: "",
    availableModels: [],
    contextLimit: CONFIG.defaultContextLimit,
    compressionInFlight: false,
    persistTimer: null,
    persistPromise: Promise.resolve(),
    storageInfo: {
      file: "",
      fileSizeBytes: 0,
      updatedAt: null,
    },
    canvasBoardStorageInfo: {
      file: "",
      fileSizeBytes: 0,
      updatedAt: null,
    },
    permissionStore: getDefaultPermissionStore(),
    modelProfiles: {},
    hardware: {
      preferredGpuName: "",
      videoControllers: [],
    },
    provider: "ollama",
    providerLabel: "Ollama",
    supportsRuntimeOptions: true,
    outputMode: "nonstream",
    systemStats: null,
    activeControlMenu: "overview",
    drawerOpen: false,
    activeRightPanelView: "assistant",
    leftPanelCollapsed: false,
    rightPanelCollapsed: false,
    historyExpanded: false,
    editingSessionId: null,
    uiSettings: {
      appName: "Bo AI",
      appSubtitle: "无限画布助手",
      canvasTitle: "无限画布与 AI 助手",
      canvasBoardSavePath: "data/canvas-board.json",
      ...DEFAULT_THEME_SETTINGS,
      sidebarSections: SIDEBAR_SECTION_DEFS.map((item) => ({ key: item.key, visible: true })),
    },
    desktopShellState: {
      pinned: false,
      fullscreen: false,
      clickThrough: false,
      fullClickThrough: false,
    },
    clipboardStore: {
      mode: "manual",
      maxItems: CONFIG.clipboardMaxItems,
      items: [],
    },
    appClipboard: {
      source: "",
      text: "",
      items: [],
      createdAt: 0,
    },
    composerAttachments: [],
    clipboardPollTimer: null,
    lastClipboardText: "",
    activeTaskRoute: "",
    canvasBoardPersistTimer: null,
    canvasBoardPersistPromise: Promise.resolve(),
    canvasBoard: {
      items: [],
      selectedIds: [],
      view: {
        scale: CONFIG.canvasDefaultScale,
        offsetX: CONFIG.canvasDefaultOffsetX,
        offsetY: CONFIG.canvasDefaultOffsetY,
      },
    },
    canvasEditingTextId: null,
    screenSource: {
      stream: null,
      startPromise: null,
      statusText: "未启动",
      availableSources: [],
      selectedSourceId: "",
      selectedSourceLabel: "",
      activeTargetId: "",
      activeMode: "",
      embeddedSourceId: "",
      embeddedSourceLabel: "",
      embedPolicies: {},
    },
    stagePanels: {
      left: { x: 0, y: 0, hidden: false },
      right: { x: 0, y: 0, hidden: false },
    },
  };
}
