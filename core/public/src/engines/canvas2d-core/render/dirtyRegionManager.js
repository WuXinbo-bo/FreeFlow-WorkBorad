function normalizeIds(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function createEmptyDirtyState() {
  return {
    reason: "idle",
    reasons: [],
    backgroundDirty: false,
    sceneDirty: false,
    viewDirty: false,
    interactionDirty: false,
    overlayDirty: false,
    hitTestDirty: false,
    fullOverlayRescan: false,
    itemIds: [],
  };
}

export function createDirtyRegionManager() {
  let state = createEmptyDirtyState();

  function merge(patch = {}) {
    if (!patch || typeof patch !== "object") {
      return state;
    }
    const nextReasons = new Set(state.reasons);
    const reason = String(patch.reason || "").trim();
    if (reason) {
      nextReasons.add(reason);
    }
    state = {
      reason: reason || state.reason || "render",
      reasons: Array.from(nextReasons),
      backgroundDirty: state.backgroundDirty || Boolean(patch.backgroundDirty),
      sceneDirty: state.sceneDirty || Boolean(patch.sceneDirty),
      viewDirty: state.viewDirty || Boolean(patch.viewDirty),
      interactionDirty: state.interactionDirty || Boolean(patch.interactionDirty),
      overlayDirty: state.overlayDirty || Boolean(patch.overlayDirty),
      hitTestDirty: state.hitTestDirty || Boolean(patch.hitTestDirty),
      fullOverlayRescan: state.fullOverlayRescan || Boolean(patch.fullOverlayRescan),
      itemIds: normalizeIds([...(state.itemIds || []), ...(patch.itemIds || [])]),
    };
    return state;
  }

  function peek() {
    return {
      ...state,
      reasons: state.reasons.slice(),
      itemIds: state.itemIds.slice(),
    };
  }

  function consume() {
    const snapshot = peek();
    state = createEmptyDirtyState();
    return snapshot;
  }

  function reset() {
    state = createEmptyDirtyState();
  }

  return {
    merge,
    peek,
    consume,
    reset,
  };
}
