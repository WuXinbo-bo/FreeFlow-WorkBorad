function snapshotView(view = {}) {
  return Object.freeze({
    scale: Math.max(0.01, Number(view?.scale) || 1),
    offsetX: Number(view?.offsetX) || 0,
    offsetY: Number(view?.offsetY) || 0,
  });
}

function viewsMatch(left, right) {
  return left.scale === right.scale && left.offsetX === right.offsetX && left.offsetY === right.offsetY;
}

export function createCameraInteractionRuntime({
  getView,
  presentView,
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (frameId) => cancelAnimationFrame(frameId),
} = {}) {
  let active = false;
  let sessionId = 0;
  let generation = 0;
  let reason = "";
  let pendingView = null;
  let frameId = 0;
  let changed = false;

  function getCurrentView() {
    return snapshotView(pendingView || getView?.() || {});
  }

  function begin(nextReason = "camera-interaction") {
    if (!active) {
      active = true;
      sessionId += 1;
      generation += 1;
      changed = false;
    }
    reason = String(nextReason || "camera-interaction");
    return sessionId;
  }

  function present(timestamp = 0, targetGeneration = generation) {
    if (targetGeneration !== generation || !pendingView) {
      return false;
    }
    const nextView = pendingView;
    pendingView = null;
    changed = true;
    presentView?.(nextView, {
      sessionId,
      generation,
      reason,
      timestamp: Number(timestamp) || 0,
    });
    return true;
  }

  function schedule() {
    if (frameId) {
      return frameId;
    }
    const targetGeneration = generation;
    frameId = requestFrame((timestamp) => {
      if (targetGeneration !== generation) {
        return;
      }
      frameId = 0;
      present(timestamp, targetGeneration);
    });
    return frameId;
  }

  function update(reducer, nextReason = reason || "camera-interaction") {
    begin(nextReason);
    const baseView = getCurrentView();
    const nextView = snapshotView(typeof reducer === "function" ? reducer(baseView) : reducer);
    if (viewsMatch(baseView, nextView)) {
      return false;
    }
    pendingView = nextView;
    schedule();
    return true;
  }

  function flush(timestamp = 0) {
    if (frameId) {
      cancelFrame(frameId);
      frameId = 0;
    }
    return present(timestamp);
  }

  function finish({ timestamp = 0 } = {}) {
    flush(timestamp);
    const result = Object.freeze({
      active,
      changed,
      sessionId,
      generation,
      reason,
      view: snapshotView(getView?.() || pendingView || {}),
    });
    active = false;
    reason = "";
    pendingView = null;
    frameId = 0;
    generation += 1;
    changed = false;
    return result;
  }

  function cancel() {
    if (frameId) {
      cancelFrame(frameId);
    }
    frameId = 0;
    pendingView = null;
    active = false;
    reason = "";
    changed = false;
    generation += 1;
  }

  function getSnapshot() {
    return Object.freeze({
      active,
      changed,
      sessionId,
      generation,
      reason,
      pending: Boolean(pendingView),
      view: getCurrentView(),
    });
  }

  return {
    begin,
    update,
    flush,
    finish,
    cancel,
    getCurrentView,
    getSnapshot,
  };
}
