import { TUTORIAL_VERSION } from "./tutorialTypes.js";

export const TUTORIAL_STORAGE_KEY = "freeflow_canvas2d_tutorial_state_v1";

function normalizeCompletedStepIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export function createInitialTutorialState() {
  return {
    version: TUTORIAL_VERSION,
    mode: "idle",
    centerOpen: false,
    overlayOpen: false,
    centerView: "root",
    activeTutorialId: "",
    tutorialBoardPath: "",
    returnBoardPath: "",
    usingTutorialBoard: false,
    currentChapterId: "",
    currentStepId: "",
    completed: false,
    completedStepIds: [],
    dontAutoShowAgain: false,
    lastStartedAt: null,
    lastCompletedAt: null,
  };
}

export function normalizeTutorialState(input = {}, { version = TUTORIAL_VERSION } = {}) {
  const base = createInitialTutorialState();
  const source = input && typeof input === "object" ? input : {};
  const sameVersion = String(source.version || "").trim() === String(version || "").trim();
  return {
    ...base,
    ...source,
    version,
    mode: source.centerOpen ? "center" : source.overlayOpen ? "running" : "idle",
    centerOpen: Boolean(source.centerOpen) && sameVersion,
    overlayOpen: Boolean(source.overlayOpen) && sameVersion,
    centerView: sameVersion && String(source.centerView || "").trim() ? String(source.centerView || "").trim() : "root",
    activeTutorialId: sameVersion ? String(source.activeTutorialId || "").trim() : "",
    tutorialBoardPath: sameVersion ? String(source.tutorialBoardPath || "").trim() : "",
    returnBoardPath: sameVersion ? String(source.returnBoardPath || "").trim() : "",
    usingTutorialBoard: sameVersion ? Boolean(source.usingTutorialBoard) : false,
    currentChapterId: sameVersion ? String(source.currentChapterId || "").trim() : "",
    currentStepId: sameVersion ? String(source.currentStepId || "").trim() : "",
    completed: sameVersion ? Boolean(source.completed) : false,
    completedStepIds: sameVersion ? normalizeCompletedStepIds(source.completedStepIds) : [],
    dontAutoShowAgain: Boolean(source.dontAutoShowAgain),
    lastStartedAt: Number(source.lastStartedAt) || null,
    lastCompletedAt: Number(source.lastCompletedAt) || null,
  };
}

export function serializeTutorialState(state = {}) {
  const normalized = normalizeTutorialState(state);
  return {
    version: normalized.version,
    completed: normalized.completed,
    completedStepIds: [...normalized.completedStepIds],
    dontAutoShowAgain: normalized.dontAutoShowAgain,
    centerView: normalized.centerView,
    activeTutorialId: normalized.activeTutorialId,
    tutorialBoardPath: normalized.tutorialBoardPath,
    returnBoardPath: normalized.returnBoardPath,
    usingTutorialBoard: normalized.usingTutorialBoard,
    currentChapterId: normalized.currentChapterId,
    currentStepId: normalized.currentStepId,
    lastStartedAt: normalized.lastStartedAt,
    lastCompletedAt: normalized.lastCompletedAt,
  };
}

export function loadTutorialState(storage = globalThis?.localStorage, { storageKey = TUTORIAL_STORAGE_KEY } = {}) {
  if (!storage) {
    return createInitialTutorialState();
  }
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return createInitialTutorialState();
    }
    return normalizeTutorialState(JSON.parse(raw));
  } catch {
    return createInitialTutorialState();
  }
}

export function persistTutorialState(state, storage = globalThis?.localStorage, { storageKey = TUTORIAL_STORAGE_KEY } = {}) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(storageKey, JSON.stringify(serializeTutorialState(state)));
  } catch {
    // Ignore transient storage failures.
  }
}

export function clearTutorialState(storage = globalThis?.localStorage, { storageKey = TUTORIAL_STORAGE_KEY } = {}) {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(storageKey);
  } catch {
    // Ignore transient storage failures.
  }
}

export function createTutorialStateStore(config, options = {}) {
  const subscribers = new Set();
  const storage = options.storage ?? globalThis?.localStorage;
  const storageKey = options.storageKey || TUTORIAL_STORAGE_KEY;
  const version = options.version || config?.version || TUTORIAL_VERSION;
  const state = loadTutorialState(storage, { storageKey });

  function getSnapshot() {
    return {
      ...state,
      config,
    };
  }

  function emit() {
    const snapshot = getSnapshot();
    subscribers.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("[tutorial-system] subscribe listener failed", error);
      }
    });
    return snapshot;
  }

  function patch(next = {}, { persist = true, emit: shouldEmit = true } = {}) {
    Object.assign(state, normalizeTutorialState({ ...state, ...(next || {}) }, { version }));
    if (persist) {
      persistTutorialState(state, storage, { storageKey });
    }
    return shouldEmit ? emit() : getSnapshot();
  }

  function reset({ persist = true, emit: shouldEmit = true } = {}) {
    Object.assign(state, createInitialTutorialState());
    if (persist) {
      clearTutorialState(storage, { storageKey });
    }
    return shouldEmit ? emit() : getSnapshot();
  }

  return {
    state,
    getSnapshot,
    patch,
    reset,
    subscribe(listener) {
      if (typeof listener !== "function") {
        return () => {};
      }
      subscribers.add(listener);
      listener(getSnapshot());
      return () => subscribers.delete(listener);
    },
    persist() {
      persistTutorialState(state, storage, { storageKey });
    },
  };
}
