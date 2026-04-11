import { TUTORIAL_IDS } from "../../tutorial-core/tutorialTypes.js";
import { MAIN_SHELL_TUTORIAL_CHAPTERS, MAIN_SHELL_TUTORIAL_DEFINITION } from "../../engines/canvas2d-core/tutorial-system/tutorials/mainShellTutorial.js";
import { AI_MIRROR_TUTORIAL_CHAPTERS, AI_MIRROR_TUTORIAL_DEFINITION } from "../../engines/canvas2d-core/tutorial-system/tutorials/aiMirrorTutorial.js";

export const GLOBAL_TUTORIAL_IDS = Object.freeze({
  MAIN_SHELL: TUTORIAL_IDS.MAIN_SHELL,
  CANVAS: TUTORIAL_IDS.CANVAS,
  AI_MIRROR: TUTORIAL_IDS.AI_MIRROR,
});

export const GLOBAL_TUTORIAL_TARGETS = Object.freeze({
  workspaceShell: {
    selector: ".workspace",
    padding: 18,
  },
  globalSettingsButton: {
    selector: "#conversation-settings-btn",
    padding: 12,
  },
  globalSettingsDrawer: {
    selector: "#insight-drawer.is-open",
    padding: 18,
  },
  globalMoreButton: {
    selector: "#conversation-shell-more",
    padding: 12,
  },
  globalMoreMenu: {
    selector: "#conversation-shell-menu:not(.is-hidden)",
    padding: 16,
  },
  panelCornerResizer: {
    selector: "#left-pane-resizer",
    padding: 14,
  },
  panelVerticalResizer: {
    selector: "#left-pane-y-resizer",
    padding: 14,
  },
  restoreDefaultButton: {
    selector: "#stage-restore-btn",
    padding: 12,
  },
  panelOrbControls: {
    selector: '[data-stage-panel-controls="left"]',
    padding: 14,
  },
  viewport: {
    selector: ".workspace",
    padding: 16,
  },
  rightPanelScreenTab: {
    selector: "#right-panel-tab-screen",
    padding: 12,
  },
  screenSourceHeaderTrigger: {
    selector: "#screen-source-header-menu > summary",
    padding: 12,
  },
  screenSourceHeaderPanel: {
    selector: ".screen-source-header-panel:not(.is-hidden)",
    padding: 16,
  },
  screenSourceTargetSelect: {
    selector: "#screen-source-select",
    padding: 12,
  },
  screenSourceRenderMode: {
    selector: "#screen-source-render-mode-select",
    padding: 12,
  },
  screenSourceFitMode: {
    selector: "#screen-source-fit-mode-select",
    padding: 12,
  },
  screenSourceEmbedToggle: {
    selector: "#screen-source-embed-toggle-btn",
    padding: 12,
  },
  screenSourceStatusPill: {
    selector: "#screen-source-status-pill",
    padding: 12,
  },
  screenSourcePreviewShell: {
    selector: "#screen-source-panel:not(.is-hidden) .screen-source-preview-shell",
    padding: 16,
  },
  screenSourceShellOutline: {
    selector: "#screen-source-panel:not(.is-hidden) .screen-source-shell-outline",
    padding: 16,
  },
});

export const GLOBAL_TUTORIAL_CHAPTERS = Object.freeze([
  ...MAIN_SHELL_TUTORIAL_CHAPTERS,
  ...AI_MIRROR_TUTORIAL_CHAPTERS,
]);

export const GLOBAL_TUTORIAL_DEFINITIONS = Object.freeze([
  {
    ...MAIN_SHELL_TUTORIAL_DEFINITION,
    description: "整体界面的介绍以及交互键的使用指南",
  },
  {
    id: GLOBAL_TUTORIAL_IDS.CANVAS,
    title: "画布教程",
    description: "FreeFlow自研画布的使用指南",
    chapterIds: [],
  },
  {
    ...AI_MIRROR_TUTORIAL_DEFINITION,
    description: "AI 镜像功能工作区使用指南",
  },
]);

export function getGlobalTutorialDefinition(tutorialId) {
  const normalizedId = String(tutorialId || "").trim().toLowerCase();
  return GLOBAL_TUTORIAL_DEFINITIONS.find((item) => item.id === normalizedId) || null;
}

export function getGlobalTutorialChapters(tutorialId) {
  const definition = getGlobalTutorialDefinition(tutorialId);
  if (!definition) {
    return GLOBAL_TUTORIAL_CHAPTERS;
  }
  const chapterIdSet = new Set(
    Array.isArray(definition.chapterIds) ? definition.chapterIds.map((item) => String(item || "").trim()) : []
  );
  return GLOBAL_TUTORIAL_CHAPTERS.filter((chapter) => chapterIdSet.has(String(chapter.id || "").trim()));
}

export function createGlobalTutorialConfig() {
  return {
    version: "0.8.1",
    tutorials: GLOBAL_TUTORIAL_DEFINITIONS.map((item) => ({
      ...item,
      chapterIds: Array.isArray(item.chapterIds) ? [...item.chapterIds] : [],
    })),
    targets: { ...GLOBAL_TUTORIAL_TARGETS },
    chapters: GLOBAL_TUTORIAL_CHAPTERS.map((chapter) => ({
      ...chapter,
      steps: Array.isArray(chapter.steps) ? chapter.steps.map((step) => ({ ...step })) : [],
    })),
    resolveTutorialDefinition: getGlobalTutorialDefinition,
    resolveTutorialChapters: getGlobalTutorialChapters,
  };
}
