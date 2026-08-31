import { createDirtyRegionManager } from "./dirtyRegionManager.js";
import { createLayerState } from "./layerState.js";
import { CANVAS_PERFORMANCE_LANES } from "../perf/canvasPerformanceRuntime.js";

const LANE_ORDER = Object.freeze([
  CANVAS_PERFORMANCE_LANES.INPUT,
  CANVAS_PERFORMANCE_LANES.COMMIT,
  CANVAS_PERFORMANCE_LANES.RECOVERY,
  CANVAS_PERFORMANCE_LANES.BACKGROUND,
]);

function normalizeLane(value) {
  const lane = String(value || "").trim();
  return LANE_ORDER.includes(lane) ? lane : CANVAS_PERFORMANCE_LANES.COMMIT;
}

function hasDirtyState(state = null) {
  return Boolean(
    state?.reasons?.length ||
    state?.itemIds?.length ||
    state?.backgroundDirty ||
    state?.sceneDirty ||
    state?.surfaceDirty ||
    state?.cameraDirty ||
    state?.viewDirty ||
    state?.interactionDirty ||
    state?.overlayDirty ||
    state?.hitTestDirty ||
    state?.fullOverlayRescan
  );
}

export function createRenderScheduler({
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (frameId) => cancelAnimationFrame(frameId),
  collectFrameInput,
  renderFrame,
  canRunLane = () => true,
  onFrameComplete = null,
} = {}) {
  const dirtyManagers = new Map(LANE_ORDER.map((lane) => [lane, createDirtyRegionManager()]));
  const layerState = createLayerState();
  let frameId = 0;
  let frameRevision = 0;

  function getNextRunnableLane(preferredLane = "") {
    const preferred = preferredLane ? normalizeLane(preferredLane) : "";
    const lanes = preferred ? [preferred] : LANE_ORDER;
    return lanes.find((lane) => {
      const dirtyManager = dirtyManagers.get(lane);
      return hasDirtyState(dirtyManager?.peek()) && canRunLane(lane) !== false;
    }) || "";
  }

  function requestNextFrame() {
    if (!frameId && getNextRunnableLane()) {
      frameId = requestFrame(flush);
    }
    return frameId;
  }

  function flush(timestamp = 0, preferredLane = "") {
    frameId = 0;
    const lane = getNextRunnableLane(preferredLane);
    if (!lane) {
      return null;
    }
    frameRevision += 1;
    const dirtyManager = dirtyManagers.get(lane);
    const dirtyState = dirtyManager.consume();
    const nextLayerState = layerState.applyDirtyState(dirtyState);
    const frameInput = typeof collectFrameInput === "function"
      ? collectFrameInput({ dirtyState, layerState: nextLayerState, frameId: frameRevision, timestamp, lane })
      : null;
    if (!frameInput) {
      onFrameComplete?.({ lane, dirtyState, layerState: nextLayerState, frameId: frameRevision, timestamp, result: null });
      requestNextFrame();
      return null;
    }
    const result = typeof renderFrame === "function"
      ? renderFrame({
          ...frameInput,
          dirtyState,
          layerState: nextLayerState,
          frameId: frameRevision,
          timestamp,
          lane,
        })
      : null;
    onFrameComplete?.({ lane, dirtyState, layerState: nextLayerState, frameId: frameRevision, timestamp, result });
    requestNextFrame();
    return result;
  }

  function schedule(patch = {}) {
    const lane = normalizeLane(patch?.lane);
    const dirtyManager = dirtyManagers.get(lane);
    dirtyManager.merge(patch);
    return requestNextFrame();
  }

  function flushNow(patch = null, timestamp = 0) {
    const lane = normalizeLane(patch?.lane);
    if (patch && typeof patch === "object") {
      dirtyManagers.get(lane).merge(patch);
    }
    if (frameId) {
      cancelFrame(frameId);
      frameId = 0;
    }
    return flush(timestamp, patch ? lane : "");
  }

  function dispose() {
    if (frameId) {
      cancelFrame(frameId);
      frameId = 0;
    }
    dirtyManagers.forEach((dirtyManager) => dirtyManager.reset());
  }

  return {
    schedule,
    flushNow,
    resume: requestNextFrame,
    dispose,
    peekDirtyState: (lane = CANVAS_PERFORMANCE_LANES.COMMIT) => dirtyManagers.get(normalizeLane(lane)).peek(),
    peekAllDirtyStates: () => Object.freeze(Object.fromEntries(
      LANE_ORDER.map((lane) => [lane, dirtyManagers.get(lane).peek()])
    )),
    getLayerState: () => layerState.getSnapshot(),
    getFrameRevision: () => frameRevision,
  };
}
