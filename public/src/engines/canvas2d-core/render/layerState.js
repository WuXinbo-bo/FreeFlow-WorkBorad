function createBaseLayerSnapshot() {
  return {
    revisions: {
      background: 1,
      staticScene: 1,
      dynamicScene: 1,
      interaction: 1,
      overlay: 1,
      camera: 1,
      surface: 1,
    },
    dirty: {
      background: true,
      staticScene: true,
      dynamicScene: true,
      interaction: true,
      overlay: true,
      camera: true,
      surface: true,
    },
    renderReason: "initial",
    reasons: ["initial"],
  };
}

export function createLayerState() {
  let snapshot = createBaseLayerSnapshot();

  function applyDirtyState(dirtyState = {}) {
    const renderReason = String(dirtyState.reason || "render");
    const staticOnlyViewDirty = renderReason === "large-viewport-progressive-render";
    const cameraDirty = Boolean(dirtyState.cameraDirty || dirtyState.viewDirty);
    const surfaceDirty = Boolean(dirtyState.surfaceDirty);
    const nextDirty = {
      background: Boolean(surfaceDirty || dirtyState.backgroundDirty || (cameraDirty && !staticOnlyViewDirty)),
      staticScene: Boolean(surfaceDirty || dirtyState.sceneDirty || (dirtyState.viewDirty && !cameraDirty)),
      dynamicScene: Boolean(surfaceDirty || dirtyState.sceneDirty || dirtyState.interactionDirty),
      interaction: Boolean(surfaceDirty || dirtyState.sceneDirty || cameraDirty || dirtyState.interactionDirty),
      overlay: Boolean(dirtyState.sceneDirty || dirtyState.overlayDirty),
      camera: cameraDirty,
      surface: surfaceDirty,
    };
    const nextRevisions = {
      background: snapshot.revisions.background + (nextDirty.background ? 1 : 0),
      staticScene: snapshot.revisions.staticScene + (nextDirty.staticScene ? 1 : 0),
      dynamicScene: snapshot.revisions.dynamicScene + (nextDirty.dynamicScene ? 1 : 0),
      interaction: snapshot.revisions.interaction + (nextDirty.interaction ? 1 : 0),
      overlay: snapshot.revisions.overlay + (nextDirty.overlay ? 1 : 0),
      camera: snapshot.revisions.camera + (nextDirty.camera ? 1 : 0),
      surface: snapshot.revisions.surface + (nextDirty.surface ? 1 : 0),
    };
    snapshot = {
      revisions: nextRevisions,
      dirty: nextDirty,
      renderReason,
      reasons: Array.isArray(dirtyState.reasons) && dirtyState.reasons.length ? dirtyState.reasons.slice() : [renderReason],
    };
    return getSnapshot();
  }

  function getSnapshot() {
    return {
      revisions: { ...snapshot.revisions },
      dirty: { ...snapshot.dirty },
      renderReason: snapshot.renderReason,
      reasons: snapshot.reasons.slice(),
    };
  }

  return {
    applyDirtyState,
    getSnapshot,
  };
}
