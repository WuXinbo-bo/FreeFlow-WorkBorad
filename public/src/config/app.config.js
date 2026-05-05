export const CONFIG = {
  defaultContextLimit: 2048,
  contextLimitOptions: [1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072],
  breakdownSize: 5,
  contextOverhead: 48,
  messageOverhead: 8,
  summaryOverhead: 36,
  keepRecentMessages: 6,
  compressionTriggerRatio: 0.72,
  minMessagesToCompress: 4,
  defaultSessionTitle: "新会话",
  legacyStorageKey: "ai_worker_sessions_v2",
  legacyCurrentSessionKey: "ai_worker_current_session_v2",
  agentModeKey: "ai_worker_agent_mode_v1",
  outputModeKey: "ai_worker_output_mode_v1",
  leftPanelWidthKey: "ai_worker_left_panel_width_v2",
  rightPanelWidthKey: "ai_worker_right_panel_width_v2",
  leftPanelCollapsedKey: "ai_worker_left_panel_collapsed_v2",
  rightPanelCollapsedKey: "ai_worker_right_panel_collapsed_v2",
  historyExpandedKey: "ai_worker_history_expanded_v1",
  controlMenuKey: "ai_worker_control_menu_v1",
  rightPanelViewKey: "ai_worker_right_panel_view_v1",
  screenSourceEmbedPolicyKey: "ai_worker_screen_source_embed_policy_v2",
  screenSourceRenderModeKey: "ai_worker_screen_source_render_mode_v1",
  uiSettingsCacheKey: "ai_worker_ui_settings_v4",
  canvasBoardKey: "ai_worker_canvas_board_v1",
  canvasModeKey: "ai_worker_canvas_mode_v1",
  stagePanelsKey: "ai_worker_stage_panels_v2",
  panelLayoutKey: "ai_worker_panel_layout_v3",
  panelLayoutLegacyKeys: ["ai_worker_panel_layout_v2", "ai_worker_panel_layout_v1"],
  panelLayoutVersion: 3,
  maxTitleLength: 26,
  leftPanelDefaultWidth: 762,
  rightPanelDefaultWidth: 667,
  leftPanelMinWidth: 0,
  leftPanelMaxWidth: 10000,
  rightPanelMinWidth: 0,
  rightPanelMaxWidth: 10000,
  clipboardMaxItems: 20,
  clipboardPollIntervalMs: 1800,
  canvasMinScale: 0.02,
  canvasMaxScale: 24,
  canvasDefaultScale: 1,
  canvasDefaultOffsetX: 0,
  canvasDefaultOffsetY: 0,
  canvasCardWidth: 320,
  canvasCardHeight: 96,
  canvasTextBoxDefaultWidth: 320,
  canvasTextBoxDefaultHeight: 96,
  canvasTextBoxDefaultFontSize: 18,
  canvasTextBoxMinFontSize: 14,
  canvasTextBoxMaxFontSize: 72,
  startupTutorialIntroVersion: "1.1.1",
};

const browserWindow = typeof window === "undefined" ? null : window;

export const DESKTOP_SHELL = browserWindow?.desktopShell || null;
export const IS_DESKTOP_APP =
  Boolean(DESKTOP_SHELL?.isDesktop) ||
  (browserWindow ? new URLSearchParams(browserWindow.location.search).get("desktop") === "1" : false);
export const DOUBAO_WEB_MODEL = "doubao:web";
export const LOCAL_MODEL_PREFIX = "local::";
export const CLOUD_MODEL_PREFIX = "cloud::";
export const AGENT_PREFERRED_MODEL = `${CLOUD_MODEL_PREFIX}glm-4.6v-flash`;

