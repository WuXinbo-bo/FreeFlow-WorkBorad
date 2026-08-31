export function createCanvas2DReactBridge(engine) {
  return {
    subscribe(listener) {
      return engine?.subscribe?.(listener) || (() => {});
    },
    setTool(tool) {
      return typeof engine?.runCommand === "function" ? engine.runCommand("tool.set", tool) : engine?.setTool?.(tool);
    },
    undo() {
      return typeof engine?.runCommand === "function" ? engine.runCommand("canvas.undo") : engine?.undo?.();
    },
    redo() {
      return typeof engine?.runCommand === "function" ? engine.runCommand("canvas.redo") : engine?.redo?.();
    },
    copySelection() {
      return typeof engine?.runCommand === "function" ? engine.runCommand("selection.copy") : engine?.copySelection?.();
    },
    cutSelection() {
      return typeof engine?.runCommand === "function" ? engine.runCommand("selection.cut") : engine?.cutSelection?.();
    },
    pasteSelection(anchorPoint) {
      return typeof engine?.runCommand === "function"
        ? engine.runCommand("selection.paste", anchorPoint)
        : engine?.pasteFromSystemClipboard?.(anchorPoint);
    },
    deleteSelection() {
      return typeof engine?.runCommand === "function" ? engine.runCommand("selection.delete") : engine?.removeSelected?.();
    },
    toggleSelectionLock() {
      return engine?.runCommand?.("selection.toggle-lock");
    },
    toggleSelectionGroup() {
      return engine?.runCommand?.("selection.group-toggle");
    },
    alignSelection(direction) {
      return engine?.runCommand?.(`selection.align-${String(direction || "").trim().toLowerCase()}`);
    },
    distributeSelection(axis) {
      return engine?.runCommand?.(`selection.distribute-${String(axis || "").trim().toLowerCase()}`);
    },
    moveSelectionLayer(direction) {
      return engine?.runCommand?.(`selection.layer-${String(direction || "").trim().toLowerCase()}`);
    },
    zoomIn() {
      return typeof engine?.runCommand === "function" ? engine.runCommand("view.zoom-in") : engine?.zoomIn?.();
    },
    zoomOut() {
      return typeof engine?.runCommand === "function" ? engine.runCommand("view.zoom-out") : engine?.zoomOut?.();
    },
    resetView() {
      return typeof engine?.runCommand === "function" ? engine.runCommand("view.reset") : engine?.resetView?.();
    },
    focusOnBounds(bounds, options) {
      return engine?.focusOnBounds?.(bounds, options);
    },
    zoomToFit() {
      return typeof engine?.runCommand === "function" ? engine.runCommand("view.fit") : engine?.zoomToFit?.();
    },
    startCanvasCapture() {
      return engine?.startCanvasCapture?.();
    },
    exportBoardAsPdf(options) {
      return engine?.exportBoardAsPdf?.(options);
    },
    exportBoardAsPng(options) {
      return engine?.exportBoardAsPng?.(options);
    },
    cancelActiveExport() {
      return engine?.cancelActiveExport?.();
    },
    confirmWordExportPreview(requestId) {
      return engine?.confirmWordExportPreview?.(requestId);
    },
    closeWordExportPreview(requestId) {
      return engine?.closeWordExportPreview?.(requestId);
    },
    closeFileCardPreview(requestId) {
      return engine?.closeFileCardPreview?.(requestId);
    },
    toggleFileCardPreviewExpanded(requestId) {
      return engine?.toggleFileCardPreviewExpanded?.(requestId);
    },
    setFileCardPreviewZoom(requestId, zoom) {
      return engine?.setFileCardPreviewZoom?.(requestId, zoom);
    },
    retryFileCardPreview(requestId) {
      return typeof engine?.runCommand === "function"
        ? engine.runCommand("file.retry-preview", requestId)
        : engine?.retryFileCardPreview?.(requestId);
    },
    getDocumentPreviewSessionData(sessionId, generation) {
      return engine?.getDocumentPreviewSessionData?.(sessionId, generation) || null;
    },
    getDocumentPreviewRuntimeSnapshot() {
      return engine?.getDocumentPreviewRuntimeSnapshot?.() || null;
    },
    addMindMapRoot() {
      return engine?.addMindMapRoot?.();
    },
    addFlowNode() {
      return engine?.addFlowNode?.();
    },
    addMindChildNode(nodeId) {
      return typeof engine?.runCommand === "function" ? engine.runCommand("mind.child", nodeId) : engine?.addMindChildNode?.(nodeId);
    },
    addMindSiblingNode(nodeId) {
      return typeof engine?.runCommand === "function" ? engine.runCommand("mind.sibling", nodeId) : engine?.addMindSiblingNode?.(nodeId);
    },
    promoteMindNode(nodeId) {
      return typeof engine?.runCommand === "function" ? engine.runCommand("mind.promote", nodeId) : engine?.promoteMindNode?.(nodeId);
    },
    demoteMindNode(nodeId) {
      return typeof engine?.runCommand === "function" ? engine.runCommand("mind.demote", nodeId) : engine?.demoteMindNode?.(nodeId);
    },
    insertMindIntermediateNode(nodeId) {
      return engine?.insertMindIntermediateNode?.(nodeId);
    },
    setMindBranchSide(nodeId, side) {
      return engine?.setMindBranchSide?.(nodeId, side);
    },
    relayoutMindMapByNodeId(nodeId) {
      return engine?.relayoutMindMapByNodeId?.(nodeId);
    },
    toggleMindNodeCollapsed(nodeId) {
      return typeof engine?.runCommand === "function" ? engine.runCommand("mind.collapse", nodeId) : engine?.toggleMindNodeCollapsed?.(nodeId);
    },
    addTable(options) {
      return engine?.addTable?.(options);
    },
    addCodeBlock(options) {
      return engine?.addCodeBlock?.(options);
    },
    newBoard() {
      return engine?.newBoard?.();
    },
    openBoard() {
      return engine?.openBoard?.();
    },
    openBoardAtPath(filePath, options) {
      return engine?.openBoardAtPath?.(filePath, options);
    },
    repairBoardAtPath(filePath) {
      return engine?.repairBoardAtPath?.(filePath);
    },
    ensureTutorialBoard() {
      return engine?.ensureTutorialBoard?.();
    },
    saveBoard() {
      return typeof engine?.runCommand === "function" ? engine.runCommand("canvas.save") : engine?.saveBoard?.();
    },
    saveBoardAs() {
      return engine?.saveBoardAs?.();
    },
    renameBoard(name) {
      return engine?.renameBoard?.(name);
    },
    renameBoardAtPath(filePath, name) {
      return engine?.renameBoardAtPath?.(filePath, name);
    },
    deleteBoardAtPath(filePath) {
      return engine?.deleteBoardAtPath?.(filePath);
    },
    revealBoardInFolder() {
      return engine?.revealBoardInFolder?.();
    },
    revealBoardPathInFolder(filePath) {
      return engine?.revealBoardPathInFolder?.(filePath);
    },
    openExternalUrl(url) {
      return engine?.openExternalUrl?.(url);
    },
    checkForAppUpdate(options) {
      return engine?.checkForAppUpdate?.(options);
    },
    pickCanvasBoardSavePath() {
      return engine?.pickCanvasBoardSavePath?.();
    },
    getCanvasBoardWorkspace() {
      return engine?.getCanvasBoardWorkspace?.();
    },
    pickCanvasWorkspaceFolder() {
      return engine?.pickCanvasWorkspaceFolder?.();
    },
    listCanvasBoards(folderPath) {
      return engine?.listCanvasBoards?.(folderPath);
    },
    createBoardInWorkspace(folderPath, name) {
      return engine?.createBoardInWorkspace?.(folderPath, name);
    },
    revealCanvasImageSavePath() {
      return engine?.revealCanvasImageSavePath?.();
    },
    pickCanvasImageSavePath() {
      return engine?.pickCanvasImageSavePath?.();
    },
    refreshCanvasImageManager() {
      return engine?.refreshCanvasImageManager?.();
    },
    insertManagedCanvasImage(filePath, options) {
      return engine?.insertManagedCanvasImage?.(filePath, options);
    },
    importCanvasImagesFromClipboard(anchorPoint) {
      return engine?.importCanvasImagesFromClipboard?.(anchorPoint);
    },
    captureCanvasImageToManager(anchorPoint) {
      return engine?.captureCanvasImageToManager?.(anchorPoint);
    },
    setBoardBackgroundPattern(pattern) {
      return engine?.setBoardBackgroundPattern?.(pattern);
    },
    toggleAutosave() {
      return engine?.toggleAutosave?.();
    },
    setAlignmentSnapEnabled(enabled) {
      return engine?.setAlignmentSnapEnabled?.(enabled);
    },
    setAlignmentSnapConfig(patch) {
      return engine?.setAlignmentSnapConfig?.(patch);
    },
    getCanvasNavigatorViewModel() {
      return engine?.getCanvasNavigatorViewModel?.() || null;
    },
    getCanvasNavigatorSuggestions(limit) {
      return engine?.getCanvasNavigatorSuggestions?.(limit) || [];
    },
    getCanvasNavigatorPendingTargetFolderId() {
      return engine?.getCanvasNavigatorPendingTargetFolderId?.() || "";
    },
    setCanvasNavigatorCollapsed(collapsed) {
      return engine?.setCanvasNavigatorCollapsed?.(collapsed);
    },
    addCanvasNavigatorFolder(options) {
      return engine?.addCanvasNavigatorFolder?.(options);
    },
    addCanvasNavigatorEntryForItem(itemId, options) {
      return engine?.addCanvasNavigatorEntryForItem?.(itemId, options);
    },
    removeCanvasNavigatorEntry(entryId) {
      return engine?.removeCanvasNavigatorEntry?.(entryId);
    },
    renameCanvasNavigatorEntry(entryId, title) {
      return engine?.renameCanvasNavigatorEntry?.(entryId, title);
    },
    moveCanvasNavigatorEntry(entryId, direction) {
      return engine?.moveCanvasNavigatorEntry?.(entryId, direction);
    },
    setCanvasNavigatorEntryParent(entryId, parentId, index) {
      return engine?.setCanvasNavigatorEntryParent?.(entryId, parentId, index);
    },
    beginCanvasNavigatorFolderTargetPick(entryId) {
      return engine?.beginCanvasNavigatorFolderTargetPick?.(entryId);
    },
    cancelCanvasNavigatorFolderTargetPick() {
      return engine?.cancelCanvasNavigatorFolderTargetPick?.();
    },
    toggleCanvasNavigatorEntryCollapsed(entryId) {
      return engine?.toggleCanvasNavigatorEntryCollapsed?.(entryId);
    },
    focusCanvasNavigatorEntry(entryId) {
      return engine?.focusCanvasNavigatorEntry?.(entryId);
    },
    previewCanvasNavigatorEntry(entryId) {
      return engine?.previewCanvasNavigatorEntry?.(entryId);
    },
    clearBoard() {
      engine?.clearBoard?.();
    },
    importFiles(files) {
      return engine?.importFiles?.(files);
    },
    getSnapshot() {
      return engine?.getSnapshot?.() || null;
    },
    setLocalFileAccess(enabled) {
      engine?.setLocalFileAccess?.(enabled);
    },
    toggleLocalFileAccess() {
      engine?.toggleLocalFileAccess?.();
    },
    runCommand(name, ...args) {
      return engine?.runCommand?.(name, ...args);
    },
    listCommands(context) {
      return engine?.listCommands?.(context) || [];
    },
    getCommandState(name, context) {
      return engine?.getCommandState?.(name, context) || null;
    },
    getCanvasUiRuntimeSnapshot(context) {
      return engine?.getCanvasUiRuntimeSnapshot?.(context) || null;
    },
    getElementUxSnapshot() {
      return engine?.getElementUxSnapshot?.() || [];
    },
    getInputCapabilities() {
      return engine?.getInputCapabilities?.() || null;
    },
  };
}
