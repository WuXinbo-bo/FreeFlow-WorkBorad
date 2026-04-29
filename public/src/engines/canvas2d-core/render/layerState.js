function createBaseLayerSnapshot() {
  return {
    revisions: {
      background: 1,
      staticScene: 1,
      dynamicScene: 1,
      interaction: 1,
      overlay: 1,
    },
    dirty: {
      background: true,
      staticScene: true,
      dynamicScene: true,
      interaction: true,
      overlay: true,
    },
    renderReason: "initial",
    reasons: ["initial"],
  };
}

export function createLayerState() {
  let snapshot = createBaseLayerSnapshot();

  function applyDirtyState(dirtyState = {}) {
    const nextDirty = {
      background: Boolean(dirtyState.backgroundDirty || dirtyState.viewDirty),
      staticScene: Boolean(dirtyState.sceneDirty || dirtyState.viewDirty),
      dynamicScene: Boolean(dirtyState.sceneDirty || dirtyState.viewDirty || dirtyState.interactionDirty),
      interaction: Boolean(dirtyState.sceneDirty || dirtyState.viewDirty || dirtyState.interactionDirty),
      overlay: Boolean(dirtyState.sceneDirty || dirtyState.viewDirty || dirtyState.overlayDirty),
    };
    const nextRevisions = {
      background: snapshot.revisions.background + (nextDirty.background ? 1 : 0),
      staticScene: snapshot.revisions.staticScene + (nextDirty.staticScene ? 1 : 0),
      dynamicScene: snapshot.revisions.dynamicScene + (nextDirty.dynamicScene ? 1 : 0),
      interaction: snapshot.revisions.interaction + (nextDirty.interaction ? 1 : 0),
      overlay: snapshot.revisions.overlay + (nextDirty.overlay ? 1 : 0),
    };
    snapshot = {
      revisions: nextRevisions,
      dirty: nextDirty,
      renderReason: String(dirtyState.reason || "render"),
      reasons: Array.isArray(dirtyState.reasons) && dirtyState.reasons.length ? dirtyState.reasons.slice() : [String(dirtyState.reason || "render")],
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
