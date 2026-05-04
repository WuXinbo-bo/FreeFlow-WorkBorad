import { DEFAULT_VIEW, LEGACY_STORAGE_KEYS, STORAGE_KEY } from "./constants.js";
import { normalizeBoard } from "./elements/index.js";
import { createHistoryState } from "./history.js";
import { clone } from "./utils.js";

const DEFAULT_PERSIST_DEBOUNCE_MS = 320;

function loadBoard(disableLocalStorage = false) {
  if (disableLocalStorage) {
    return normalizeBoard({});
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeBoard(JSON.parse(raw));
    }
    return normalizeBoard({});
  } catch {
    return normalizeBoard({});
  }
}

export function clearLegacyBoardStorage() {
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore local persistence failures.
  }
}

export function persistBoard(board) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch {
    // Ignore local persistence failures.
  }
}

export function createCanvas2DStore({ onStateChange, theme, disableLocalStorage = false, initialBoard, onPersist } = {}) {
  const subscribers = new Set();
  const persistHandler =
    typeof onPersist === "function"
      ? onPersist
      : (board) => {
          if (disableLocalStorage) {
            return;
          }
          persistBoard(board);
        };
  const state = {
    board: initialBoard ? normalizeBoard(initialBoard) : loadBoard(disableLocalStorage),
    boardRevision: 1,
    tool: "select",
    mode: "canvas2d",
    theme: theme || "light",
    history: createHistoryState(),
    clipboard: null,
    pointer: null,
    draftElement: null,
    editingId: null,
    editingType: null,
    hoverId: null,
    hoverHandle: null,
    hoverConnector: null,
    mindMapDropTargetId: null,
    mindMapDropHint: "",
    selectionRect: null,
    statusText: "工作白板已就绪",
    statusTone: "neutral",
    lastPointerScenePoint: { x: 0, y: 0 },
    spaceDown: false,
    lastSelectionSource: null,
    boardFilePath: "",
    boardFileName: "未命名画布",
    canvasImageSavePath: "",
    boardDirty: false,
    boardAutosaveEnabled: true,
    boardAutosaveAt: null,
    boardLastSavedAt: null,
    boardSaveToastAt: null,
    boardSaveToastMessage: "",
    canvasImageManager: {
      folderPath: "",
      items: [],
      loading: false,
      error: "",
      lastScannedAt: 0,
      missingCount: 0,
    },
    exportHistory: [],
    exportHistoryUpdatedAt: 0,
    wordExportPreviewRequest: null,
    fileCardPreviewRequests: [],
  };

  let cachedBoardSnapshotRevision = -1;
  let cachedBoardSnapshot = null;
  let pendingPersistTimer = 0;
  let pendingPersistRevision = 0;

  function clearScheduledPersist() {
    if (pendingPersistTimer) {
      clearTimeout(pendingPersistTimer);
      pendingPersistTimer = 0;
    }
  }

  function flushPersist() {
    clearScheduledPersist();
    if (!pendingPersistRevision) {
      return false;
    }
    pendingPersistRevision = 0;
    persistHandler(state.board);
    return true;
  }

  function schedulePersist(delay = DEFAULT_PERSIST_DEBOUNCE_MS) {
    pendingPersistRevision = state.boardRevision;
    clearScheduledPersist();
    pendingPersistTimer = setTimeout(() => {
      flushPersist();
    }, Math.max(0, Number(delay) || 0));
  }

  function handleLifecyclePersistFlush() {
    flushPersist();
  }

  function handleVisibilityChange() {
    if (documentTarget?.visibilityState === "hidden") {
      handleLifecyclePersistFlush();
    }
  }

  const lifecycleTarget = typeof window !== "undefined" ? window : null;
  const documentTarget = typeof document !== "undefined" ? document : null;
  if (lifecycleTarget?.addEventListener) {
    lifecycleTarget.addEventListener("pagehide", handleLifecyclePersistFlush);
    lifecycleTarget.addEventListener("beforeunload", handleLifecyclePersistFlush);
  }
  if (documentTarget?.addEventListener) {
    documentTarget.addEventListener("visibilitychange", handleVisibilityChange);
  }

  function cloneBoardForSnapshot() {
    if (cachedBoardSnapshotRevision === state.boardRevision && cachedBoardSnapshot) {
      return cachedBoardSnapshot;
    }
    cachedBoardSnapshot = clone(state.board);
    cachedBoardSnapshotRevision = state.boardRevision;
    return cachedBoardSnapshot;
  }

  function getSnapshot() {
    return {
      board: cloneBoardForSnapshot(),
      tool: state.tool,
      mode: state.mode,
      editingId: state.editingId,
      editingType: state.editingType,
      hoverId: state.hoverId,
      hoverHandle: state.hoverHandle,
      mindMapDropTargetId: state.mindMapDropTargetId,
      mindMapDropHint: state.mindMapDropHint,
      lastSelectionSource: state.lastSelectionSource,
      statusText: state.statusText,
      statusTone: state.statusTone,
      boardFilePath: state.boardFilePath,
      boardFileName: state.boardFileName,
      canvasImageSavePath: state.canvasImageSavePath,
      boardDirty: state.boardDirty,
      boardAutosaveEnabled: state.boardAutosaveEnabled,
      boardAutosaveAt: state.boardAutosaveAt,
      boardLastSavedAt: state.boardLastSavedAt,
      boardSaveToastAt: state.boardSaveToastAt,
      boardSaveToastMessage: state.boardSaveToastMessage,
      canvasImageManager:
        state.canvasImageManager && typeof state.canvasImageManager === "object"
          ? JSON.parse(JSON.stringify(state.canvasImageManager))
          : null,
      exportHistory: Array.isArray(state.exportHistory) ? state.exportHistory.map((entry) => ({ ...entry })) : [],
      exportHistoryUpdatedAt: Number(state.exportHistoryUpdatedAt || 0) || 0,
      wordExportPreviewRequest:
        state.wordExportPreviewRequest && typeof state.wordExportPreviewRequest === "object"
          ? JSON.parse(JSON.stringify({
              ...state.wordExportPreviewRequest,
              previewAst: undefined,
            }))
          : null,
      fileCardPreviewRequests: Array.isArray(state.fileCardPreviewRequests)
        ? state.fileCardPreviewRequests
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) =>
              JSON.parse(
                JSON.stringify({
                  ...entry,
                })
              )
            )
        : [],
      alignmentSnapConfig:
        state.alignmentSnapConfig && typeof state.alignmentSnapConfig === "object"
          ? { ...state.alignmentSnapConfig }
          : null,
      alignmentSnapActive: Boolean(state.alignmentSnap?.active),
      canUndo: state.history.undo.length > 0,
      canRedo: state.history.redo.length > 0,
    };
  }

  function emit() {
    cachedBoardSnapshotRevision = -1;
    const snapshot = getSnapshot();
    if (typeof onStateChange === "function") {
      onStateChange(snapshot);
    }
    subscribers.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("[canvas2d-core] subscribe listener failed", error);
      }
    });
  }

  return {
    state,
    getSnapshot,
    emit,
    subscribe(listener) {
      if (typeof listener !== "function") {
        return () => {};
      }
      subscribers.add(listener);
      listener(getSnapshot());
      return () => subscribers.delete(listener);
    },
    persist() {
      schedulePersist();
    },
    flushPersist,
    dispose() {
      flushPersist();
      if (lifecycleTarget?.removeEventListener) {
        lifecycleTarget.removeEventListener("pagehide", handleLifecyclePersistFlush);
        lifecycleTarget.removeEventListener("beforeunload", handleLifecyclePersistFlush);
      }
      if (documentTarget?.removeEventListener) {
        documentTarget.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    },
    replaceBoard(board) {
      state.board = normalizeBoard(board);
      state.boardRevision += 1;
      cachedBoardSnapshotRevision = -1;
    },
    resetView() {
      state.board.view = clone(DEFAULT_VIEW);
      state.boardRevision += 1;
      cachedBoardSnapshotRevision = -1;
    },
    touchBoard() {
      state.boardRevision += 1;
      cachedBoardSnapshotRevision = -1;
    },
    setTool(tool) {
      state.tool = String(tool || "select").trim().toLowerCase() || "select";
    },
    setMode(mode) {
      state.mode = String(mode || "canvas2d").trim().toLowerCase() || "canvas2d";
    },
    setStatus(text, tone = "neutral") {
      state.statusText = String(text || "");
      state.statusTone = tone;
      emit();
    },
  };
}
