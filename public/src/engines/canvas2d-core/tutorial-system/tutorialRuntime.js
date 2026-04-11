import { createTutorialConfig, getTutorialChapters, getTutorialDefinition, TUTORIAL_ENTRY_ACTIONS } from "./tutorialConfig.js";
import { createTutorialStateStore } from "./tutorialState.js";
import { TUTORIAL_EVENT_TYPES } from "../../../tutorial-core/tutorialTypes.js";

function flattenSteps(config, tutorialId = "", resolveTutorialChapters = getTutorialChapters) {
  const chapters = resolveTutorialChapters(tutorialId || "").length
    ? resolveTutorialChapters(tutorialId || "")
    : Array.isArray(config?.chapters)
      ? config.chapters
      : [];
  return chapters.flatMap((chapter, chapterIndex) =>
    (Array.isArray(chapter.steps) ? chapter.steps : []).map((step, stepIndex) => ({
      ...step,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterIndex,
      stepIndex,
    }))
  );
}

function findStepRecord(config, chapterId, stepId, tutorialId = "", resolveTutorialChapters = getTutorialChapters) {
  return flattenSteps(config, tutorialId, resolveTutorialChapters).find(
    (step) =>
      (chapterId ? step.chapterId === String(chapterId || "").trim() : true) &&
      (stepId ? step.id === String(stepId || "").trim() : true)
  );
}

function getFirstStep(config, tutorialId = "", resolveTutorialChapters = getTutorialChapters) {
  return flattenSteps(config, tutorialId, resolveTutorialChapters)[0] || null;
}

function getResolvedSnapshot(store, config, { resolveTutorialDefinition = getTutorialDefinition, resolveTutorialChapters = getTutorialChapters } = {}) {
  const base = store.getSnapshot();
  const activeTutorialId = String(base.activeTutorialId || "").trim();
  const flatSteps = flattenSteps(config, activeTutorialId, resolveTutorialChapters);
  const currentStep =
    findStepRecord(config, base.currentChapterId, base.currentStepId, activeTutorialId, resolveTutorialChapters) ||
    flatSteps.find((step) => step.id === base.currentStepId) ||
    null;
  const currentStepIndex = currentStep ? flatSteps.findIndex((step) => step.id === currentStep.id) : -1;
  const totalSteps = flatSteps.length;
  const currentChapter = currentStep
    ? flatSteps
        .map((step) => ({
          id: step.chapterId,
          title: step.chapterTitle,
          chapterIndex: step.chapterIndex,
        }))
        .find((chapter) => chapter.id === currentStep.chapterId) || null
    : resolveTutorialChapters(activeTutorialId).find((chapter) => chapter.id === base.currentChapterId) || null;
  const activeTutorial = resolveTutorialDefinition(activeTutorialId);
  return {
    ...base,
    activeTutorial,
    flatSteps,
    totalSteps,
    currentStep,
    currentStepIndex,
    currentStepNumber: currentStepIndex >= 0 ? currentStepIndex + 1 : 0,
    currentChapter,
    currentChapterIndex: currentStep ? currentStep.chapterIndex : -1,
    totalChapters: resolveTutorialChapters(activeTutorialId).length,
    hasPreviousStep: currentStepIndex > 0,
    hasNextStep: currentStepIndex >= 0 && currentStepIndex < totalSteps - 1,
  };
}

function isCompletionRuleSatisfied(rule, payload = {}) {
  if (!rule || typeof rule !== "object") {
    return false;
  }
  const type = String(rule.type || "").trim().toLowerCase();
  if (type === TUTORIAL_EVENT_TYPES.MENU_OPENED) {
    return payload.event?.type === TUTORIAL_EVENT_TYPES.MENU_OPENED && payload.event?.menuId === rule.menuId;
  }
  if (type === TUTORIAL_EVENT_TYPES.TOOL_SELECTED) {
    return String(payload.engineSnapshot?.tool || "").trim().toLowerCase() === String(rule.tool || "").trim().toLowerCase();
  }
  if (type === TUTORIAL_EVENT_TYPES.VIEW_SCALE_CHANGED) {
    const prevScale = Number(payload.previousEngineSnapshot?.board?.view?.scale || 0);
    const nextScale = Number(payload.engineSnapshot?.board?.view?.scale || 0);
    return prevScale > 0 && nextScale > 0 && Math.abs(prevScale - nextScale) > 0.0001;
  }
  if (type === TUTORIAL_EVENT_TYPES.ITEM_CREATED) {
    const itemType = String(rule.itemType || "").trim();
    const prevCount = Array.isArray(payload.previousEngineSnapshot?.board?.items)
      ? payload.previousEngineSnapshot.board.items.filter((item) => item?.type === itemType).length
      : 0;
    const nextCount = Array.isArray(payload.engineSnapshot?.board?.items)
      ? payload.engineSnapshot.board.items.filter((item) => item?.type === itemType).length
      : 0;
    return nextCount > prevCount;
  }
  if (type === TUTORIAL_EVENT_TYPES.ALIGNMENT_SNAP_TRIGGERED) {
    return payload.previousEngineSnapshot?.alignmentSnapActive !== true && payload.engineSnapshot?.alignmentSnapActive === true;
  }
  if (type === TUTORIAL_EVENT_TYPES.TEXT_EDITED) {
    const itemType = String(rule.itemType || "text").trim().toLowerCase();
    const previousItems = Array.isArray(payload.previousEngineSnapshot?.board?.items) ? payload.previousEngineSnapshot.board.items : [];
    const nextItems = Array.isArray(payload.engineSnapshot?.board?.items) ? payload.engineSnapshot.board.items : [];
    const previousMap = new Map(previousItems.map((item) => [String(item?.id || ""), item]));
    return nextItems.some((item) => {
      if (!item || String(item.type || "").trim().toLowerCase() !== itemType) {
        return false;
      }
      const nextText = String(item.plainText || item.text || "").trim();
      const previous = previousMap.get(String(item.id || ""));
      const previousText = String(previous?.plainText || previous?.text || "").trim();
      return nextText.length > 0 && nextText !== previousText;
    });
  }
  return false;
}

export function createTutorialRuntime({ engine, bridge, config, storage, storageKey } = {}) {
  const tutorialConfig = config || createTutorialConfig();
  const store = createTutorialStateStore(tutorialConfig, { storage, storageKey });
  const tutorialBridge = bridge || null;
  const resolveTutorialDefinition =
    typeof tutorialConfig?.resolveTutorialDefinition === "function"
      ? tutorialConfig.resolveTutorialDefinition
      : getTutorialDefinition;
  const resolveTutorialChapters =
    typeof tutorialConfig?.resolveTutorialChapters === "function"
      ? tutorialConfig.resolveTutorialChapters
      : getTutorialChapters;
  let previousEngineSnapshot = tutorialBridge?.getSnapshot?.() || null;

  function getSnapshot() {
    return getResolvedSnapshot(store, tutorialConfig, {
      resolveTutorialDefinition,
      resolveTutorialChapters,
    });
  }

  function emitPatched(next, options) {
    store.patch(next, options);
    return getSnapshot();
  }

  function markStepCompleted(stepId = "") {
    const nextId = String(stepId || "").trim();
    if (!nextId) {
      return getSnapshot();
    }
    const completedStepIds = new Set(store.state.completedStepIds || []);
    completedStepIds.add(nextId);
    return emitPatched({
      completedStepIds: [...completedStepIds],
    });
  }

  function maybeCompleteCurrentStep(payload = {}) {
    const snapshot = getSnapshot();
    const rule = snapshot.currentStep?.completionRule || null;
    if (!snapshot.overlayOpen || !snapshot.currentStep || !rule) {
      return snapshot;
    }
    if (!isCompletionRuleSatisfied(rule, payload)) {
      return snapshot;
    }
    markStepCompleted(snapshot.currentStep.id);
    return goToNextStep();
  }

  function subscribe(listener) {
    return store.subscribe(() => listener?.(getSnapshot()));
  }

  function openCenter() {
    return emitPatched({
      centerOpen: true,
      centerView: "root",
      overlayOpen: false,
      mode: "center",
    });
  }

  function closeCenter() {
    return emitPatched({
      centerOpen: false,
      centerView: "root",
      mode: store.state.overlayOpen ? "running" : "idle",
    });
  }

  function setCenterView(view = "root") {
    return emitPatched({
      centerOpen: true,
      centerView: String(view || "root").trim() || "root",
      overlayOpen: false,
      mode: "center",
    });
  }

  function setCurrentStep({ chapterId = "", stepId = "" } = {}) {
    return emitPatched({
      currentChapterId: String(chapterId || "").trim(),
      currentStepId: String(stepId || "").trim(),
    });
  }

  function openStartMenu() {
    return emitPatched({
      centerOpen: true,
      centerView: "start-menu",
      overlayOpen: false,
      mode: "center",
    });
  }

  function startTutorial(tutorialId) {
    const normalizedTutorialId = String(tutorialId || "").trim().toLowerCase();
    const firstStep = getFirstStep(tutorialConfig, normalizedTutorialId, resolveTutorialChapters);
    return emitPatched({
      centerOpen: false,
      centerView: "root",
      overlayOpen: true,
      completed: false,
      activeTutorialId: normalizedTutorialId,
      currentChapterId: firstStep?.chapterId || "",
      currentStepId: firstStep?.id || "",
      lastStartedAt: Date.now(),
      mode: "running",
    });
  }

  function resumeTutorial() {
    const snapshot = getSnapshot();
    if (!snapshot.currentStep) {
      return openStartMenu();
    }
    return emitPatched({
      centerOpen: false,
      centerView: "root",
      overlayOpen: true,
      mode: "running",
    });
  }

  async function restoreReturnBoardIfNeeded() {
    const snapshot = getSnapshot();
    const tutorialBoardPath = String(snapshot.tutorialBoardPath || "").trim();
    const returnBoardPath = String(snapshot.returnBoardPath || "").trim();
    if (!snapshot.usingTutorialBoard || !returnBoardPath || returnBoardPath === tutorialBoardPath) {
      return false;
    }
    const restored = await tutorialBridge?.openBoardAtPath?.(returnBoardPath, { silent: true });
    return Boolean(restored);
  }

  function goToNextStep() {
    const snapshot = getSnapshot();
    if (!snapshot.currentStep) {
      if (snapshot.activeTutorialId) {
        return startTutorial(snapshot.activeTutorialId);
      }
      return openStartMenu();
    }
    if (!snapshot.hasNextStep) {
      return completeTutorial();
    }
    const nextStep = snapshot.flatSteps[snapshot.currentStepIndex + 1] || null;
    if (!nextStep) {
      return completeTutorial();
    }
    return emitPatched({
      currentChapterId: nextStep.chapterId,
      currentStepId: nextStep.id,
    });
  }

  function goToPreviousStep() {
    const snapshot = getSnapshot();
    if (!snapshot.currentStep || !snapshot.hasPreviousStep) {
      return snapshot;
    }
    const previousStep = snapshot.flatSteps[snapshot.currentStepIndex - 1] || null;
    if (!previousStep) {
      return snapshot;
    }
    return emitPatched({
      currentChapterId: previousStep.chapterId,
      currentStepId: previousStep.id,
    });
  }

  function skipCurrentStep() {
    const snapshot = getSnapshot();
    if (!snapshot.currentStep?.skippable) {
      return snapshot;
    }
    return goToNextStep();
  }

  async function closeTutorial() {
    await restoreReturnBoardIfNeeded();
    return emitPatched({
      centerOpen: false,
      centerView: "root",
      overlayOpen: false,
      mode: "idle",
      activeTutorialId: "",
      tutorialBoardPath: "",
      returnBoardPath: "",
      usingTutorialBoard: false,
    });
  }

  async function completeTutorial() {
    await restoreReturnBoardIfNeeded();
    return emitPatched({
      centerOpen: false,
      centerView: "root",
      overlayOpen: false,
      mode: "idle",
      completed: true,
      lastCompletedAt: Date.now(),
      activeTutorialId: "",
      tutorialBoardPath: "",
      returnBoardPath: "",
      usingTutorialBoard: false,
    });
  }

  function setDontAutoShowAgain(enabled) {
    return emitPatched({
      dontAutoShowAgain: Boolean(enabled),
    });
  }

  function resetProgress() {
    store.reset();
    return getSnapshot();
  }

  function reportUiEvent(event = {}) {
    return maybeCompleteCurrentStep({
      event,
      engineSnapshot: tutorialBridge?.getSnapshot?.() || null,
      previousEngineSnapshot,
    });
  }

  if (engine?.subscribe) {
    engine.subscribe((engineSnapshot) => {
      const nextSnapshot = engineSnapshot || null;
      maybeCompleteCurrentStep({
        event: null,
        engineSnapshot: nextSnapshot,
        previousEngineSnapshot,
      });
      previousEngineSnapshot = nextSnapshot;
    });
  }

  async function handleEntryAction(action) {
    const type = String(action || "").trim().toLowerCase();
    if (type === TUTORIAL_ENTRY_ACTIONS.START_FULL) {
      return openStartMenu();
    }
    if (type === TUTORIAL_ENTRY_ACTIONS.START_MAIN_SHELL) {
      return startTutorial("main-shell");
    }
    if (type === TUTORIAL_ENTRY_ACTIONS.START_CANVAS) {
      return startTutorial("canvas");
    }
    if (type === TUTORIAL_ENTRY_ACTIONS.START_AI_MIRROR) {
      return startTutorial("ai-mirror");
    }
    if (type === TUTORIAL_ENTRY_ACTIONS.BACK_TO_ROOT) {
      return emitPatched({
        centerOpen: true,
        centerView: "root",
        overlayOpen: false,
        mode: "center",
      });
    }
    if (type === TUTORIAL_ENTRY_ACTIONS.RESUME) {
      return resumeTutorial();
    }
    if (type === TUTORIAL_ENTRY_ACTIONS.OPEN_BOARD) {
      const tutorialSnapshot = getSnapshot();
      const currentBoardPath = String(tutorialBridge?.getSnapshot?.()?.boardFilePath || "").trim();
      const result = await tutorialBridge?.openTutorialBoard?.();
      if (!result?.ok || !result?.filePath) {
        return getSnapshot();
      }
      const nextTutorialBoardPath = String(result.filePath || "").trim();
      const currentTutorialBoardPath = String(tutorialSnapshot.tutorialBoardPath || "").trim();
      const preservedReturnBoardPath = String(tutorialSnapshot.returnBoardPath || "").trim();
      const nextReturnBoardPath =
        tutorialSnapshot.usingTutorialBoard &&
        preservedReturnBoardPath &&
        currentBoardPath &&
        currentTutorialBoardPath &&
        currentBoardPath === currentTutorialBoardPath
          ? preservedReturnBoardPath
          : String(result.previousBoardPath || currentBoardPath || "").trim();
      return emitPatched({
        centerOpen: false,
        centerView: "root",
        mode: store.state.overlayOpen ? "running" : "idle",
        tutorialBoardPath: nextTutorialBoardPath,
        returnBoardPath: nextReturnBoardPath,
        usingTutorialBoard: true,
      });
    }
    if (type === TUTORIAL_ENTRY_ACTIONS.RESET) {
      return resetProgress();
    }
    if (type === TUTORIAL_ENTRY_ACTIONS.CLOSE) {
      return closeTutorial();
    }
    return getSnapshot();
  }

  return {
    engine: engine || null,
    bridge: tutorialBridge,
    config: tutorialConfig,
    state: store.state,
    getSnapshot,
    subscribe,
    openCenter,
    closeCenter,
    setCenterView,
    openStartMenu,
    startTutorial,
    resumeTutorial,
    closeTutorial,
    completeTutorial,
    goToNextStep,
    goToPreviousStep,
    skipCurrentStep,
    setDontAutoShowAgain,
    setCurrentStep,
    markStepCompleted,
    reportUiEvent,
    resetProgress,
    handleEntryAction,
    persist: store.persist,
  };
}
