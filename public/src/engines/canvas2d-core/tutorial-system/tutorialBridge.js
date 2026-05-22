export function createTutorialBridge(engine) {
  return {
    getEngine() {
      return engine || null;
    },
    getSnapshot() {
      return engine?.getSnapshot?.() || null;
    },
    openTutorialBoard() {
      return engine?.ensureTutorialBoard?.() || null;
    },
    openBoardAtPath(filePath, options) {
      return engine?.openBoardAtPath?.(filePath, options) || null;
    },
    resetView() {
      return engine?.resetView?.();
    },
    zoomToFit() {
      return engine?.zoomToFit?.();
    },
    setTool(tool) {
      return engine?.setTool?.(tool);
    },
  };
}
