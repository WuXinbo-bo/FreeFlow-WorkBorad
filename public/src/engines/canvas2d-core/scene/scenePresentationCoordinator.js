function snapshotCamera(view = {}) {
  return Object.freeze({
    scale: Math.max(0.01, Number(view?.scale) || 1),
    offsetX: Number(view?.offsetX) || 0,
    offsetY: Number(view?.offsetY) || 0,
  });
}

function snapshotViewport(viewport = {}) {
  return Object.freeze({
    width: Math.max(1, Number(viewport?.width) || 1),
    height: Math.max(1, Number(viewport?.height) || 1),
    pixelRatio: Math.max(0.1, Number(viewport?.pixelRatio) || 1),
  });
}

function camerasMatch(left, right) {
  return left.scale === right.scale && left.offsetX === right.offsetX && left.offsetY === right.offsetY;
}

function viewportsMatch(left, right) {
  return left.width === right.width && left.height === right.height && left.pixelRatio === right.pixelRatio;
}

function createCameraMatrix(camera) {
  return Object.freeze({
    a: camera.scale,
    b: 0,
    c: 0,
    d: camera.scale,
    e: camera.offsetX,
    f: camera.offsetY,
    css: `matrix(${camera.scale}, 0, 0, ${camera.scale}, ${camera.offsetX}, ${camera.offsetY})`,
  });
}

export function createScenePresentationCoordinator({ view = null, viewport = null } = {}) {
  let camera = snapshotCamera(view);
  let viewportSnapshot = snapshotViewport(viewport);
  let cameraRevision = 0;
  let viewportRevision = 0;
  let sessionId = 0;
  let phase = "steady";
  let reason = "";

  function updateCamera(nextView = {}) {
    const next = snapshotCamera(nextView);
    if (!camerasMatch(camera, next)) {
      camera = next;
      cameraRevision += 1;
    }
    return camera;
  }

  function updateViewport(nextViewport = {}) {
    const next = snapshotViewport(nextViewport);
    if (!viewportsMatch(viewportSnapshot, next)) {
      viewportSnapshot = next;
      viewportRevision += 1;
    }
    return viewportSnapshot;
  }

  function beginInteraction(nextReason = "interaction") {
    if (phase !== "active") {
      sessionId += 1;
    }
    phase = "active";
    reason = String(nextReason || "interaction");
    return sessionId;
  }

  function settleInteraction(targetSessionId = sessionId) {
    if (targetSessionId !== sessionId || phase !== "active") {
      return false;
    }
    phase = "settling";
    return true;
  }

  function finishInteraction(targetSessionId = sessionId) {
    if (targetSessionId !== sessionId || phase === "active") {
      return false;
    }
    phase = "steady";
    reason = "";
    return true;
  }

  function reset() {
    sessionId += 1;
    phase = "steady";
    reason = "";
  }

  function getSnapshot() {
    return Object.freeze({
      camera,
      cameraMatrix: createCameraMatrix(camera),
      viewport: viewportSnapshot,
      cameraRevision,
      viewportRevision,
      interaction: Object.freeze({ sessionId, phase, reason }),
    });
  }

  return {
    updateCamera,
    updateViewport,
    beginInteraction,
    settleInteraction,
    finishInteraction,
    reset,
    getSnapshot,
  };
}
