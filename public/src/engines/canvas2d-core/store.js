import { DEFAULT_VIEW, LEGACY_STORAGE_KEYS, STORAGE_KEY } from "./constants.js";
import { normalizeBoard } from "./elements/index.js";
import { createHistoryState } from "./history.js";
import { clone } from "./utils.js";

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
  };

  function getSnapshot() {
    return {
      board: clone(state.board),
      tool: state.tool,
      mode: state.mode,
      editingId: state.editingId,
      editingType: state.editingType,
      hoverId: state.hoverId,
      hoverHandle: state.hoverHandle,
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
      persistHandler(state.board);
    },
    replaceBoard(board) {
      state.board = normalizeBoard(board);
    },
    resetView() {
      state.board.view = clone(DEFAULT_VIEW);
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
