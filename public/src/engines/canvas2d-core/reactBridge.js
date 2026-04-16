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
    addFlowNode() {
      engine?.addFlowNode?.();
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
    revealBoardInFolder() {
      return engine?.revealBoardInFolder?.();
    },
    revealCanvasImageSavePath() {
      return engine?.revealCanvasImageSavePath?.();
    },
    pickCanvasImageSavePath() {
      return engine?.pickCanvasImageSavePath?.();
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
