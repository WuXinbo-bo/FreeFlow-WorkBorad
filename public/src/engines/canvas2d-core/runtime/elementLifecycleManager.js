const ELEMENT_RUNTIME_STATES = Object.freeze([
  "unmounted",
  "dormant",
  "visible",
  "interacting",
  "editing",
  "settling",
]);

function normalizeId(value = "") {
  return String(value || "").trim();
}

export function createElementLifecycleManager({ registry } = {}) {
  const records = new Map();
  let itemById = new Map();
  let lastItems = null;
  let lastSceneRevision = -1;
  let revision = 0;
  let lastReconcileStats = { totalElements: 0, evaluatedElements: 0, visibleElements: 0 };

  function callHook(item, hook, context) {
    const definition = registry?.resolveElement?.(item, { fallback: false });
    const handler = definition?.lifecycle?.[hook];
    if (typeof handler === "function") {
      handler(item, context);
    }
  }

  function transition(item, nextState, context = {}) {
    const id = normalizeId(item?.id);
    if (!id || !ELEMENT_RUNTIME_STATES.includes(nextState)) {
      return null;
    }
    const previous = records.get(id) || { item, state: "unmounted", revision: 0 };
    if (previous.state === nextState) {
      previous.item = item;
      return previous;
    }
    const transitionContext = Object.freeze({
      ...context,
      itemId: id,
      from: previous.state,
      to: nextState,
    });
    callHook(previous.item || item, "onExit", transitionContext);
    revision += 1;
    const record = { item, state: nextState, revision };
    records.set(id, record);
    callHook(item, "onEnter", transitionContext);
    return record;
  }

  function syncItems(items = [], sceneRevision = 0, frameContext = null) {
    if (items === lastItems && Number(sceneRevision) === lastSceneRevision) {
      return;
    }
    const nextItemById = new Map(
      (Array.isArray(items) ? items : []).filter((item) => normalizeId(item?.id)).map((item) => [normalizeId(item.id), item])
    );
    Array.from(records.keys()).forEach((id) => {
      if (!nextItemById.has(id)) {
        const current = records.get(id);
        transition(current.item, "unmounted", { frameContext, reason: "removed" });
        records.delete(id);
      }
    });
    nextItemById.forEach((item, id) => {
      if (!records.has(id)) {
        transition(item, "dormant", { frameContext, reason: "mounted" });
      } else {
        records.get(id).item = item;
      }
    });
    itemById = nextItemById;
    lastItems = items;
    lastSceneRevision = Number(sceneRevision);
  }

  function reconcile({ items = [], visibleIds = [], editingId = "", interactingIds = [], frameContext = null, sceneRevision = 0 } = {}) {
    syncItems(items, sceneRevision, frameContext);
    const visible = new Set((visibleIds || []).map(normalizeId).filter(Boolean));
    const interacting = new Set((interactingIds || []).map(normalizeId).filter(Boolean));
    const activeEditingId = normalizeId(editingId);
    const activeIds = new Set([...visible, ...interacting, ...(activeEditingId ? [activeEditingId] : [])]);
    records.forEach((record, id) => {
      if (record.state !== "dormant" && record.state !== "unmounted") {
        activeIds.add(id);
      }
    });
    activeIds.forEach((id) => {
      const item = itemById.get(id);
      if (!item) {
        return;
      }
      let nextState = visible.has(id) ? "visible" : "dormant";
      if (interacting.has(id)) {
        nextState = "interacting";
      }
      if (activeEditingId === id) {
        nextState = "editing";
      }
      const current = records.get(id);
      if ((current?.state === "interacting" || current?.state === "editing") && nextState === "visible") {
        transition(item, "settling", { frameContext, reason: "interaction-end" });
      } else {
        transition(item, nextState, { frameContext, reason: "reconcile" });
      }
    });
    lastReconcileStats = {
      totalElements: itemById.size,
      evaluatedElements: activeIds.size,
      visibleElements: visible.size,
    };
    return getSnapshot();
  }

  function finishSettling(frameContext = null) {
    records.forEach((record) => {
      if (record.state === "settling") {
        transition(record.item, "visible", { frameContext, reason: "settled" });
      }
    });
    return getSnapshot();
  }

  function dispose(context = {}) {
    records.forEach((record) => transition(record.item, "unmounted", { ...context, reason: "dispose" }));
    records.clear();
    itemById = new Map();
    lastItems = null;
    lastSceneRevision = -1;
  }

  function getSnapshot() {
    return {
      revision,
      states: new Map(Array.from(records, ([id, record]) => [id, record.state])),
      stats: { ...lastReconcileStats },
    };
  }

  return {
    reconcile,
    finishSettling,
    dispose,
    getState: (itemId) => records.get(normalizeId(itemId))?.state || "unmounted",
    getSnapshot,
  };
}

export { ELEMENT_RUNTIME_STATES };
