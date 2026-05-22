import { createTutorialConfig, getTutorialChapters, getTutorialDefinition, TUTORIAL_IDS } from "./tutorialConfig.js";

function cloneChapter(chapter) {
  return {
    ...chapter,
    steps: Array.isArray(chapter?.steps) ? chapter.steps.map((step) => ({ ...step })) : [],
  };
}

export function getCanvasTutorialDefinition() {
  return getTutorialDefinition(TUTORIAL_IDS.CANVAS);
}

export function getCanvasTutorialChapters() {
  return getTutorialChapters(TUTORIAL_IDS.CANVAS).map(cloneChapter);
}

export function createCanvasTutorialConfig() {
  const base = createTutorialConfig();
  const canvasTutorial = getCanvasTutorialDefinition();
  const chapters = getCanvasTutorialChapters();
  return {
    ...base,
    tutorials: canvasTutorial ? [{ ...canvasTutorial, chapterIds: [...(canvasTutorial.chapterIds || [])] }] : [],
    chapters,
    resolveTutorialDefinition(tutorialId = "") {
      const normalizedId = String(tutorialId || "").trim().toLowerCase();
      return normalizedId === TUTORIAL_IDS.CANVAS ? canvasTutorial || null : null;
    },
    resolveTutorialChapters(tutorialId = "") {
      const normalizedId = String(tutorialId || "").trim().toLowerCase();
      return normalizedId === TUTORIAL_IDS.CANVAS ? chapters.map(cloneChapter) : [];
    },
  };
}
