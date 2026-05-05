export function createCanvas2DReactBridge(engine) {
  return {
    subscribe(listener) {
      return engine?.subscribe?.(listener) || (() => {});
    },
    setTool(tool) {
      engine?.setTool?.(tool);
    },
    undo() {
      engine?.undo?.();
    },
    redo() {
      engine?.redo?.();
    },
    zoomIn() {
      engine?.zoomIn?.();
    },
    zoomOut() {
      engine?.zoomOut?.();
    },
    resetView() {
      engine?.resetView?.();
    },
    focusOnBounds(bounds, options) {
      return engine?.focusOnBounds?.(bounds, options);
    },
    zoomToFit() {
      engine?.zoomToFit?.();
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
    addMindMapRoot() {
      return engine?.addMindMapRoot?.();
    },
    addFlowNode() {
      return engine?.addFlowNode?.();
    },
    addMindChildNode(nodeId) {
      return engine?.addMindChildNode?.(nodeId);
    },
    addMindSiblingNode(nodeId) {
      return engine?.addMindSiblingNode?.(nodeId);
    },
    promoteMindNode(nodeId) {
      return engine?.promoteMindNode?.(nodeId);
    },
    demoteMindNode(nodeId) {
      return engine?.demoteMindNode?.(nodeId);
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
      return engine?.toggleMindNodeCollapsed?.(nodeId);
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
      return engine?.saveBoard?.();
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
  };
}
