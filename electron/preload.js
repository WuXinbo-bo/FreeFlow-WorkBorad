const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("desktopShell", {
  isDesktop: true,
  platform: process.platform,
  readClipboardText: () => ipcRenderer.invoke("desktop-shell:read-clipboard-text"),
  readClipboardFiles: () => ipcRenderer.invoke("desktop-shell:read-clipboard-files"),
  copyFilesToClipboard: (paths) => ipcRenderer.invoke("desktop-shell:copy-files-to-clipboard", paths),
  startFileDrag: (paths) => ipcRenderer.invoke("desktop-shell:start-file-drag", paths),
  startExportDrag: (payload) => ipcRenderer.invoke("desktop-shell:start-export-drag", payload),
  getFileId: (targetPath) => ipcRenderer.invoke("desktop-shell:get-file-id", targetPath),
  findPathByFileId: (fileId) => ipcRenderer.invoke("desktop-shell:find-path-by-file-id", fileId),
  pathExists: (targetPath) => ipcRenderer.invoke("desktop-shell:path-exists", targetPath),
  ensureTutorialBoard: () => ipcRenderer.invoke("desktop-shell:ensure-tutorial-board"),
  getStartupContext: () => ipcRenderer.invoke("desktop-shell:get-startup-context"),
  openPath: (targetPath) => ipcRenderer.invoke("desktop-shell:open-path", targetPath),
  revealPath: (targetPath) => ipcRenderer.invoke("desktop-shell:reveal-path", targetPath),
  pickCanvasBoardPath: (payload) => ipcRenderer.invoke("desktop-shell:pick-canvas-board-path", payload),
  pickCanvasBoardOpenPath: (payload) => ipcRenderer.invoke("desktop-shell:pick-canvas-board-open", payload),
  pickDirectory: (payload) => ipcRenderer.invoke("desktop-shell:pick-directory", payload),
  pickImageSavePath: (payload) => ipcRenderer.invoke("desktop-shell:pick-image-save-path", payload),
  pickTextSavePath: (payload) => ipcRenderer.invoke("desktop-shell:pick-text-save-path", payload),
  pickPdfSavePath: (payload) => ipcRenderer.invoke("desktop-shell:pick-pdf-save-path", payload),
  readFile: (targetPath) => ipcRenderer.invoke("desktop-shell:read-file", targetPath),
  readFileBase64: (targetPath) => ipcRenderer.invoke("desktop-shell:read-file-base64", targetPath),
  writeFile: (targetPath, data) => ipcRenderer.invoke("desktop-shell:write-file", targetPath, data),
  renamePath: (sourcePath, targetPath) => ipcRenderer.invoke("desktop-shell:rename-path", sourcePath, targetPath),
  getCaptureSources: () => ipcRenderer.invoke("desktop-shell:get-capture-sources"),
  captureScreenImage: () => ipcRenderer.invoke("desktop-shell:capture-screen-image"),
  listAiMirrorTargets: () => ipcRenderer.invoke("desktop-shell:list-ai-mirror-targets"),
  prepareAiMirrorTarget: (payload) => ipcRenderer.invoke("desktop-shell:prepare-ai-mirror-target", payload),
  stopAiMirrorTarget: (payload) => ipcRenderer.invoke("desktop-shell:stop-ai-mirror-target", payload),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || "";
    } catch {
      return "";
    }
  },
  getState: () => ipcRenderer.invoke("desktop-shell:get-state"),
  notifyRendererReady: () => ipcRenderer.send("desktop-shell:renderer-ready"),
  releaseBootShapeLock: () => ipcRenderer.invoke("desktop-shell:release-boot-shape-lock"),
  minimize: () => ipcRenderer.invoke("desktop-shell:minimize"),
  close: () => ipcRenderer.invoke("desktop-shell:close"),
  setPinned: (enabled) => ipcRenderer.invoke("desktop-shell:set-pinned", enabled),
  togglePin: () => ipcRenderer.invoke("desktop-shell:toggle-pin"),
  toggleFullscreen: () => ipcRenderer.invoke("desktop-shell:toggle-fullscreen"),
  reload: () => ipcRenderer.invoke("desktop-shell:reload"),
  getShortcutSettings: () => ipcRenderer.invoke("desktop-shell:get-shortcut-settings"),
  setShortcutSettings: (payload) => ipcRenderer.invoke("desktop-shell:set-shortcut-settings", payload),
  openDoubaoWindow: () => ipcRenderer.invoke("desktop-shell:open-doubao-window"),
  chatWithDoubao: (payload) => ipcRenderer.invoke("desktop-shell:chat-with-doubao", payload),
  cancelDoubaoChat: () => ipcRenderer.invoke("desktop-shell:cancel-doubao-chat"),
  prepareDoubaoPrompt: (payload) => ipcRenderer.invoke("desktop-shell:prepare-doubao-prompt", payload),
  setClickThrough: (enabled) => ipcRenderer.invoke("desktop-shell:set-click-through", enabled),
  toggleClickThrough: () => ipcRenderer.invoke("desktop-shell:toggle-click-through"),
  setWindowShape: (rects) => ipcRenderer.invoke("desktop-shell:set-window-shape", rects),
  embedExternalWindow: (payload) => ipcRenderer.invoke("desktop-shell:embed-external-window", payload),
  syncExternalWindowBounds: (payload) => ipcRenderer.invoke("desktop-shell:sync-external-window-bounds", payload),
  setExternalWindowVisibility: (visible) => ipcRenderer.invoke("desktop-shell:set-external-window-visibility", visible),
  clearExternalWindow: (payload) => ipcRenderer.invoke("desktop-shell:clear-external-window", payload),
  focusEmbeddedWindow: (payload) => ipcRenderer.invoke("desktop-shell:focus-embedded-window", payload),
  attachAiMirrorWebContentsView: (payload) => ipcRenderer.invoke("desktop-shell:attach-ai-mirror-webcontents-view", payload),
  syncAiMirrorWebContentsViewBounds: (payload) =>
    ipcRenderer.invoke("desktop-shell:sync-ai-mirror-webcontents-view-bounds", payload),
  setAiMirrorWebContentsViewVisibility: (visible) =>
    ipcRenderer.invoke("desktop-shell:set-ai-mirror-webcontents-view-visibility", visible),
  clearAiMirrorWebContentsView: () => ipcRenderer.invoke("desktop-shell:clear-ai-mirror-webcontents-view"),
  focusAiMirrorWebContentsView: () => ipcRenderer.invoke("desktop-shell:focus-ai-mirror-webcontents-view"),
  onStateChange: (listener) => {
    if (typeof listener !== "function") {
      return () => {};
    }

    const handleStateChange = (_event, nextState) => {
      listener(nextState);
    };

    ipcRenderer.on("desktop-shell:state-changed", handleStateChange);
    return () => ipcRenderer.removeListener("desktop-shell:state-changed", handleStateChange);
  },
});
