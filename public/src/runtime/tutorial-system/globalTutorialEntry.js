const TUTORIAL_PRESENTATION = Object.freeze({
  "main-shell": { icon: "layout", category: "工作台" },
  canvas: { icon: "canvas", category: "创作" },
  "ai-mirror": { icon: "screen", category: "协作" },
});

export function createGlobalTutorialEntryItems(snapshotOrConfig = null) {
  const snapshot = snapshotOrConfig?.config ? snapshotOrConfig : null;
  const config = snapshot?.config || snapshotOrConfig;
  const tutorials = Array.isArray(config?.tutorials) ? config.tutorials : [];
  const completedStepIds = new Set(snapshot?.completedStepIds || []);
  return tutorials.map((item) => {
    const chapters = typeof config?.resolveTutorialChapters === "function" ? config.resolveTutorialChapters(item.id) : [];
    const stepIds = chapters.flatMap((chapter) => (chapter.steps || []).map((step) => step.id));
    const stepCount = Number(item.stepCount) || stepIds.length;
    const completedSteps = stepIds.filter((stepId) => completedStepIds.has(stepId)).length;
    return {
      id: item.id,
      label: item.title,
      description: item.description,
      disabled: false,
      stepCount,
      completedSteps,
      ...TUTORIAL_PRESENTATION[item.id],
    };
  });
}
