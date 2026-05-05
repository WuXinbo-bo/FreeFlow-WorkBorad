import { createDirtyRegionManager } from "./dirtyRegionManager.js";
import { createLayerState } from "./layerState.js";

export function createRenderScheduler({
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (frameId) => cancelAnimationFrame(frameId),
  collectFrameInput,
  renderFrame,
} = {}) {
  const dirtyManager = createDirtyRegionManager();
  const layerState = createLayerState();
  let frameId = 0;

  function flush() {
    frameId = 0;
    const dirtyState = dirtyManager.consume();
    const nextLayerState = layerState.applyDirtyState(dirtyState);
    const frameInput = typeof collectFrameInput === "function"
      ? collectFrameInput({ dirtyState, layerState: nextLayerState })
      : null;
    if (!frameInput) {
      return null;
    }
    return typeof renderFrame === "function"
      ? renderFrame({
          ...frameInput,
          dirtyState,
          layerState: nextLayerState,
        })
      : null;
  }

  function schedule(patch = {}) {
    dirtyManager.merge(patch);
    if (!frameId) {
      frameId = requestFrame(flush);
    }
    return frameId;
  }

  function flushNow(patch = null) {
    if (patch && typeof patch === "object") {
      dirtyManager.merge(patch);
    }
    if (frameId) {
      cancelFrame(frameId);
      frameId = 0;
    }
    return flush();
  }

  function dispose() {
    if (frameId) {
      cancelFrame(frameId);
      frameId = 0;
    }
    dirtyManager.reset();
  }

  return {
    schedule,
    flushNow,
    dispose,
    peekDirtyState: () => dirtyManager.peek(),
    getLayerState: () => layerState.getSnapshot(),
  };
}
