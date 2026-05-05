export function createCanvasExportHistoryManager(deps) {
  const {
    state,
    store,
    normalizeExportHistoryBoardKey,
    normalizeExportHistoryEntry,
    normalizeExportHistoryList,
    readExportHistoryStorage,
    writeExportHistoryStorage,
  } = deps;

  function resolveActiveExportHistoryBoardKey() {
    return normalizeExportHistoryBoardKey(state.boardFilePath || state.boardFileName || "未命名画布");
  }

  function syncExportHistoryForActiveBoard({ emit = true } = {}) {
    const cache = readExportHistoryStorage();
    const boardKey = resolveActiveExportHistoryBoardKey();
    state.exportHistory = normalizeExportHistoryList(cache[boardKey]);
    state.exportHistoryUpdatedAt = Date.now();
    if (emit) {
      store.emit();
    }
    return state.exportHistory;
  }

  function persistExportHistoryForActiveBoard(entries = []) {
    const cache = readExportHistoryStorage();
    const boardKey = resolveActiveExportHistoryBoardKey();
    cache[boardKey] = normalizeExportHistoryList(entries);
    writeExportHistoryStorage(cache);
    state.exportHistory = cache[boardKey];
    state.exportHistoryUpdatedAt = Date.now();
    store.emit();
    return state.exportHistory;
  }

  function recordExportHistory(entry = {}) {
    const normalized = normalizeExportHistoryEntry(entry);
    if (!normalized) {
      return [];
    }
    const existing = Array.isArray(state.exportHistory) ? state.exportHistory : [];
    const deduped = existing.filter(
      (item) =>
        !(
          String(item.filePath || "").trim() === normalized.filePath &&
          String(item.kind || "").trim() === normalized.kind &&
          Math.abs(Number(item.exportedAt || 0) - Number(normalized.exportedAt || 0)) < 1000
        )
    );
    return persistExportHistoryForActiveBoard([normalized, ...deduped]);
  }

  return {
    resolveActiveExportHistoryBoardKey,
    syncExportHistoryForActiveBoard,
    persistExportHistoryForActiveBoard,
    recordExportHistory,
  };
}
