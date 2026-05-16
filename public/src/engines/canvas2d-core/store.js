import { DEFAULT_VIEW, DEFAULT_STORAGE_KEY, LEGACY_STORAGE_KEYS, STORAGE_KEY } from "./constants.js";
import { normalizeBoard } from "./elements/index.js";
import { createHistoryState } from "./history.js";
import { clone } from "./utils.js";

const DEFAULT_PERSIST_DEBOUNCE_MS = 320;

/**
 * 从 localStorage 加载 board，包含时间戳同步检查
 * @returns {{board: object, meta: {savedAt?: number, fileTimestamp?: number, checksum?: string}}}
 */
function loadBoardWithMeta(disableLocalStorage = false, storageKey = DEFAULT_STORAGE_KEY) {
  if (disableLocalStorage) {
    return { board: normalizeBoard({}), meta: {} };
  }
  try {
    const raw = localStorage.getItem(storageKey || DEFAULT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 支持旧版本无 meta 的格式和新版有 meta 的格式
      if (parsed && typeof parsed === "object") {
        if (parsed.board && parsed.meta) {
          return { board: normalizeBoard(parsed.board), meta: parsed.meta || {} };
        }
        // 兼容旧格式（直接是 board 数据）
        return { board: normalizeBoard(parsed), meta: { legacy: true } };
      }
    }
    return { board: normalizeBoard({}), meta: {} };
  } catch {
    return { board: normalizeBoard({}), meta: {} };
  }
}

function loadBoard(disableLocalStorage = false, storageKey = DEFAULT_STORAGE_KEY) {
  return loadBoardWithMeta(disableLocalStorage, storageKey).board;
}

/**
 * 检查 localStorage 缓存是否比文件时间戳更新
 * @param {number} fileTimestamp - 文件最后修改时间戳
 * @returns {boolean} true 如果缓存比文件更新
 */
export function isLocalStorageNewerThanFile(fileTimestamp, storageKey = DEFAULT_STORAGE_KEY) {
  if (!fileTimestamp || !Number.isFinite(fileTimestamp)) {
    return true;
  }
  try {
    const raw = localStorage.getItem(storageKey || DEFAULT_STORAGE_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw);
    if (parsed?.meta?.savedAt && Number.isFinite(parsed.meta.savedAt)) {
      return parsed.meta.savedAt > fileTimestamp;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 保存 board 到 localStorage，带有时间戳和元数据
 */
export function persistBoard(board, storageKey = DEFAULT_STORAGE_KEY, fileTimestamp) {
  try {
    const payload = {
      board,
      meta: {
        savedAt: Date.now(),
        fileTimestamp: fileTimestamp || null,
        version: 1,
      },
    };
    localStorage.setItem(storageKey || DEFAULT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore local persistence failures.
  }
}

export function clearLegacyBoardStorage() {
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore local persistence failures.
  }
}

export function createCanvas2DStore({
  onStateChange,
  theme,
  disableLocalStorage = false,
  initialBoard,
  onPersist,
  storageKey = DEFAULT_STORAGE_KEY,
} = {}) {
  const subscribers = new Set();
  const resolvedStorageKey = String(storageKey || DEFAULT_STORAGE_KEY).trim() || DEFAULT_STORAGE_KEY;
  const persistHandler =
    typeof onPersist === "function"
      ? onPersist
      : (board) => {
          if (disableLocalStorage) {
            return;
          }
          persistBoard(board, resolvedStorageKey);
        };
  const state = {
    board: initialBoard ? normalizeBoard(initialBoard) : loadBoard(disableLocalStorage, resolvedStorageKey),
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
      captureModeActive: state.captureModeActive === true,
      captureModeDragging: state.captureModeDragging === true,
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
    getFileTimestamp() {
      return Number(state.boardLastSavedAt || 0) || null;
    },
    getLocalStorageMeta() {
      const { meta } = loadBoardWithMeta(disableLocalStorage, resolvedStorageKey);
      return meta;
    },
  };
}
