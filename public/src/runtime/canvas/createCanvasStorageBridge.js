export function createCanvasStorageBridge(deps) {
  const {
    state,
    CONFIG,
    DESKTOP_SHELL,
    setStatus,
    getStartupContext,
    writeUiSettingsCache,
    writeStartupContextUiSettings,
    normalizeUiSettings,
    canvasProjectFile,
    normalizeCanvasBoard,
    applyCanvasBoardStorageInfo,
  } = deps;

  function getCanvasBoardSavePath() {
    return String(state.uiSettings?.canvasBoardSavePath || "").trim();
  }

  function getCanvasLastOpenedBoardPath() {
    return String(state.uiSettings?.canvasLastOpenedBoardPath || "").trim();
  }

  function getCanvasImageSavePath() {
    return String(state.uiSettings?.canvasImageSavePath || "").trim();
  }

  function normalizeCanvasBoardSavePathValue(value = "") {
    const clean = String(value || "").trim();
    if (!clean) {
      return "";
    }
    const trimmed = clean.replace(/[\\/]+$/, "");
    const segments = trimmed.split(/[\\/]/).filter(Boolean);
    const last = segments[segments.length - 1] || "";
    if (/\.(?:freeflow|json)$/i.test(last)) {
      return segments.slice(0, -1).join(clean.includes("\\") ? "\\" : "/");
    }
    return trimmed;
  }

  function normalizeCanvasLastOpenedBoardPathValue(value = "") {
    return String(value || "").trim().replace(/[\\/]+$/, "");
  }

  function normalizeCanvasImageSavePathValue(value = "") {
    const clean = String(value || "").trim();
    if (!clean) {
      return "";
    }
    return clean.replace(/[\\/]+$/, "");
  }

  function emitCanvasBoardPathChanged(pathValue = getCanvasBoardSavePath()) {
    const cleanPath = String(pathValue || "").trim();
    if (!cleanPath) return;
    window.dispatchEvent(
      new CustomEvent("canvas-board-path-changed", {
        detail: { canvasBoardSavePath: cleanPath },
      })
    );
  }

  function syncCanvasPathActionButtons(pathValue = getCanvasBoardSavePath()) {
    const hasPath = Boolean(String(pathValue || "").trim());
    if (deps.canvasBoardPathBrowseBtn) {
      deps.canvasBoardPathBrowseBtn.disabled = !DESKTOP_SHELL?.pickCanvasBoardPath;
    }
    if (deps.drawerCanvasBoardPathBrowseBtn) {
      deps.drawerCanvasBoardPathBrowseBtn.disabled = !DESKTOP_SHELL?.pickCanvasBoardPath;
    }
    if (deps.canvasBoardPathOpenBtn) {
      deps.canvasBoardPathOpenBtn.disabled = !DESKTOP_SHELL?.revealPath || !hasPath;
    }
    if (deps.drawerCanvasBoardPathOpenBtn) {
      deps.drawerCanvasBoardPathOpenBtn.disabled = !DESKTOP_SHELL?.revealPath || !hasPath;
    }
  }

  function syncCanvasImagePathActionButtons(pathValue = getCanvasImageSavePath()) {
    const hasPath = Boolean(String(pathValue || "").trim());
    if (deps.canvasImagePathBrowseBtn) {
      deps.canvasImagePathBrowseBtn.disabled = !DESKTOP_SHELL?.pickDirectory;
    }
    if (deps.drawerCanvasImagePathBrowseBtn) {
      deps.drawerCanvasImagePathBrowseBtn.disabled = !DESKTOP_SHELL?.pickDirectory;
    }
    if (deps.canvasImagePathOpenBtn) {
      deps.canvasImagePathOpenBtn.disabled = !DESKTOP_SHELL?.revealPath || !hasPath;
    }
    if (deps.drawerCanvasImagePathOpenBtn) {
      deps.drawerCanvasImagePathOpenBtn.disabled = !DESKTOP_SHELL?.revealPath || !hasPath;
    }
  }

  function syncCanvasLastOpenedBoardPathState(nextPath) {
    const cleanPath = normalizeCanvasLastOpenedBoardPathValue(nextPath);
    if (!cleanPath || cleanPath === getCanvasLastOpenedBoardPath()) {
      return;
    }
    state.uiSettings = normalizeUiSettings({
      ...state.uiSettings,
      canvasLastOpenedBoardPath: cleanPath,
    });
    writeUiSettingsCache(state.uiSettings);
    writeStartupContextUiSettings({
      canvasLastOpenedBoardPath: cleanPath,
    });
  }

  async function loadCanvasBoard() {
    return canvasProjectFile.load();
  }

  function queueCanvasBoardPersist(immediate = false) {
    return canvasProjectFile.save(state.canvasBoard, immediate);
  }

  function saveCanvasBoardToStorage() {
    return canvasProjectFile.save(state.canvasBoard);
  }

  async function loadCanvasBoardFromStorage() {
    const startupInitialBoardPath = String(getStartupContext()?.startup?.initialBoardPath || "").trim();
    if (!startupInitialBoardPath || !DESKTOP_SHELL?.readFile) {
      await canvasProjectFile.load();
      return;
    }

    try {
      const readResult = await DESKTOP_SHELL.readFile(startupInitialBoardPath);
      if (!readResult?.ok) {
        throw new Error(readResult?.error || "无法读取启动画布");
      }
      const parsedRaw = JSON.parse(String(readResult.text || "{}").replace(/^\uFEFF/, ""));
      const payload = parsedRaw?.kind === "freeflow.canvas.board" ? parsedRaw.payload || {} : parsedRaw;
      const parsed = payload?.kind === "structured-host-board" ? payload.board || {} : payload;
      state.canvasBoard = normalizeCanvasBoard(parsed);
      applyCanvasBoardStorageInfo({
        file: startupInitialBoardPath,
        fileSizeBytes: new Blob([readResult.text || ""]).size,
        updatedAt: Date.now(),
      });
    } catch (error) {
      setStatus(`启动画布读取失败，已回退到默认路径：${error.message}`, "warning");
      await canvasProjectFile.load();
    }
  }

  return {
    getCanvasBoardSavePath,
    getCanvasLastOpenedBoardPath,
    getCanvasImageSavePath,
    normalizeCanvasBoardSavePathValue,
    normalizeCanvasLastOpenedBoardPathValue,
    normalizeCanvasImageSavePathValue,
    emitCanvasBoardPathChanged,
    syncCanvasPathActionButtons,
    syncCanvasImagePathActionButtons,
    syncCanvasLastOpenedBoardPathState,
    loadCanvasBoard,
    queueCanvasBoardPersist,
    saveCanvasBoardToStorage,
    loadCanvasBoardFromStorage,
  };
}
