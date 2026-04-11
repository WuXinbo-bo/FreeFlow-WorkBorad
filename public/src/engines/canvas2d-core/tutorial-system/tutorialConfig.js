import { MAIN_SHELL_TUTORIAL_CHAPTERS, MAIN_SHELL_TUTORIAL_DEFINITION } from "./tutorials/mainShellTutorial.js";
import { CANVAS_TUTORIAL_CHAPTERS, CANVAS_TUTORIAL_DEFINITION } from "./tutorials/canvasTutorial.js";
import { AI_MIRROR_TUTORIAL_CHAPTERS, AI_MIRROR_TUTORIAL_DEFINITION } from "./tutorials/aiMirrorTutorial.js";
export {
  TUTORIAL_ENTRY_ACTIONS,
  TUTORIAL_IDS,
  TUTORIAL_VERSION,
} from "../../../tutorial-core/tutorialTypes.js";
import { TUTORIAL_VERSION } from "../../../tutorial-core/tutorialTypes.js";

export const TUTORIAL_TARGETS = Object.freeze({
  viewport: {
    selector: ".canvas2d-engine-ui",
    padding: 20,
  },
  workspaceShell: {
    selector: ".workspace",
    padding: 18,
  },
  boardInfo: {
    selector: ".canvas2d-engine-corner-top-left .canvas2d-floating-card-info",
    padding: 14,
  },
  toolbar: {
    selector: ".canvas2d-engine-toolbar-wrap",
    padding: 14,
  },
  topRightControls: {
    selector: ".canvas2d-engine-toolbar-wrap",
    padding: 14,
  },
  menuButton: {
    selector: '[data-tutorial-target="menu-button"]',
    padding: 12,
  },
  tutorialEntry: {
    selector: '[data-tutorial-target="tutorial-entry"]',
    padding: 12,
  },
  nodeButton: {
    selector: '[data-tutorial-target="node-button"]',
    padding: 12,
  },
  canvasStage: {
    selector: "#canvas-canvas2d-host",
    padding: 18,
  },
  zoomPanel: {
    selector: ".canvas2d-engine-corner-bottom-right .canvas2d-floating-card-zoom",
    padding: 14,
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
});

export const TUTORIAL_CHAPTERS = Object.freeze([
  ...MAIN_SHELL_TUTORIAL_CHAPTERS,
  ...CANVAS_TUTORIAL_CHAPTERS,
  ...AI_MIRROR_TUTORIAL_CHAPTERS,
]);

export const TUTORIAL_DEFINITIONS = Object.freeze([
  MAIN_SHELL_TUTORIAL_DEFINITION,
  CANVAS_TUTORIAL_DEFINITION,
  AI_MIRROR_TUTORIAL_DEFINITION,
]);

export function getTutorialDefinition(tutorialId) {
  const normalizedId = String(tutorialId || "").trim().toLowerCase();
  return TUTORIAL_DEFINITIONS.find((item) => item.id === normalizedId) || null;
}

export function getTutorialChapters(tutorialId) {
  const definition = getTutorialDefinition(tutorialId);
  if (!definition) {
    return TUTORIAL_CHAPTERS;
  }
  const chapterIdSet = new Set(
    Array.isArray(definition.chapterIds) ? definition.chapterIds.map((item) => String(item || "").trim()) : []
  );
  return TUTORIAL_CHAPTERS.filter((chapter) => chapterIdSet.has(String(chapter.id || "").trim()));
}

export function createTutorialConfig() {
  return {
    version: TUTORIAL_VERSION,
    targets: { ...TUTORIAL_TARGETS },
    tutorials: TUTORIAL_DEFINITIONS.map((item) => ({
      ...item,
      chapterIds: Array.isArray(item.chapterIds) ? [...item.chapterIds] : [],
    })),
    chapters: TUTORIAL_CHAPTERS.map((chapter) => ({
      ...chapter,
      steps: Array.isArray(chapter.steps) ? chapter.steps.map((step) => ({ ...step })) : [],
    })),
  };
}
