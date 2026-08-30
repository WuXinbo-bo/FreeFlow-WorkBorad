function snapshotView(view = {}) {
  return Object.freeze({
    scale: Number(view.scale) || 1,
    offsetX: Number(view.offsetX) || 0,
    offsetY: Number(view.offsetY) || 0,
  });
}

export function createFrameContext({
  frameId = 0,
  timestamp = 0,
  view = null,
  sceneRevision = 0,
  boardRevision = 0,
  registryRevision = 0,
  pixelRatio = 1,
  runtimeMode = "steady",
  presentation = null,
} = {}) {
  return Object.freeze({
    frameId: Math.max(0, Number(frameId) || 0),
    timestamp: Math.max(0, Number(timestamp) || 0),
    view: snapshotView(view),
    sceneRevision: Math.max(0, Number(sceneRevision) || 0),
    boardRevision: Math.max(0, Number(boardRevision) || 0),
    registryRevision: Math.max(0, Number(registryRevision) || 0),
    pixelRatio: Math.max(0.1, Number(pixelRatio) || 1),
    runtimeMode: String(runtimeMode || "steady"),
    presentation: presentation && typeof presentation === "object" ? presentation : null,
  });
}
