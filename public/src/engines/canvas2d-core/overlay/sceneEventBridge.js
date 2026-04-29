export function createSceneEventBridge({
  resolveScenePoint,
  resolveTarget,
} = {}) {
  function resolveEventContext(event) {
    if (typeof resolveScenePoint !== "function" || typeof resolveTarget !== "function") {
      return null;
    }
    const scenePoint = resolveScenePoint(event);
    if (!scenePoint) {
      return null;
    }
    return {
      event,
      scenePoint,
      target: resolveTarget(scenePoint, event) || null,
    };
  }

  return {
    resolveEventContext,
  };
}
