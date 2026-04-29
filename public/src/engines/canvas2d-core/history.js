import { HISTORY_LIMIT } from "./constants.js";
import { clone } from "./utils.js";

export function createHistoryState() {
  return {
    undo: [],
    redo: [],
    lastSignature: "",
  };
}

function normalizeHistorySnapshotItemIds(itemIds = []) {
  return Array.from(
    new Set(
      (Array.isArray(itemIds) ? itemIds : [])
        .map((itemId) => String(itemId || "").trim())
        .filter(Boolean)
    )
  );
}

function cloneHistorySnapshotItems(state, itemIds = null) {
  const sourceItems = Array.isArray(state?.board?.items) ? state.board.items : [];
  if (!Array.isArray(itemIds) || !itemIds.length) {
    return clone(sourceItems);
  }
  const targetIds = new Set(normalizeHistorySnapshotItemIds(itemIds));
  if (!targetIds.size) {
    return [];
  }
  return clone(sourceItems.filter((item) => targetIds.has(String(item?.id || "").trim())));
}

export function takeHistorySnapshot(state, options = {}) {
  const includeItems = options?.includeItems !== false;
  const itemIds = normalizeHistorySnapshotItemIds(options?.itemIds);
  return {
    items: includeItems ? cloneHistorySnapshotItems(state, itemIds.length ? itemIds : null) : [],
    selectedIds: clone(state.board.selectedIds),
    view: clone(state.board.view),
    editingId: null,
    editingType: null,
  };
}

export function takeHistoryMetadataSnapshot(state) {
  return takeHistorySnapshot(state, { includeItems: false });
}

export function getSnapshotSignature(snapshot) {
  try {
    return JSON.stringify(snapshot);
  } catch {
    return "";
  }
}

export function markHistoryBaseline(history, snapshot) {
  history.lastSignature = getSnapshotSignature(snapshot);
}

function cloneHistorySnapshot(snapshot) {
  return {
    items: Array.isArray(snapshot?.items) ? clone(snapshot.items) : [],
    selectedIds: Array.isArray(snapshot?.selectedIds) ? clone(snapshot.selectedIds) : [],
    view: clone(snapshot?.view || {}),
    editingId: snapshot?.editingId || null,
    editingType: snapshot?.editingType || null,
  };
}

function normalizePatchItemIds(patch = {}) {
  const ids = Array.isArray(patch?.itemIds)
    ? patch.itemIds
    : patch?.itemId
      ? [patch.itemId]
      : [];
  return Array.from(
    new Set(
      ids
        .map((itemId) => String(itemId || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizePatchItemCollection(patch = {}, key = "before") {
  const pluralKey = `${key}Items`;
  const singularKey = `${key}Item`;
  if (Array.isArray(patch?.[pluralKey])) {
    return clone(patch[pluralKey]);
  }
  if (patch?.[singularKey]) {
    return [clone(patch[singularKey])];
  }
  return [];
}

function getPatchTargetItems(entry, targetKey) {
  if (!entry || entry.kind !== "patch") {
    return [];
  }
  if (Array.isArray(entry[`${targetKey}Items`])) {
    return clone(entry[`${targetKey}Items`]);
  }
  if (entry[`${targetKey}Item`]) {
    return [clone(entry[`${targetKey}Item`])];
  }
  return [];
}

function getPatchTargetOrderIds(entry, targetKey) {
  const key = `${targetKey}OrderIds`;
  if (!Array.isArray(entry?.[key])) {
    return [];
  }
  return entry[key]
    .map((itemId) => String(itemId || "").trim())
    .filter(Boolean);
}

function getPatchTargetSignature(entry, targetKey) {
  if (!entry || entry.kind !== "patch") {
    return "";
  }
  try {
    return JSON.stringify({
      kind: entry.kind,
      patchKind: entry.patchKind || "",
      itemIds: Array.isArray(entry.itemIds) ? clone(entry.itemIds) : [],
      items: getPatchTargetItems(entry, targetKey),
      orderIds: getPatchTargetOrderIds(entry, targetKey),
      selectedIds: clone(entry[`${targetKey}SelectedIds`] || []),
      view: clone(entry[`${targetKey}View`] || {}),
      editingId: entry[`${targetKey}EditingId`] || null,
      editingType: entry[`${targetKey}EditingType`] || null,
    });
  } catch {
    return "";
  }
}

function applyPatchEntryToSnapshot(entry, currentSnapshot, targetKey) {
  const nextSnapshot = cloneHistorySnapshot(currentSnapshot);
  const patchItems = getPatchTargetItems(entry, targetKey);
  const itemIds = Array.isArray(entry?.itemIds) && entry.itemIds.length
    ? entry.itemIds.map((itemId) => String(itemId || "").trim()).filter(Boolean)
    : [String(entry?.itemId || patchItems[0]?.id || "").trim()].filter(Boolean);
  const patchItemMap = new Map(
    patchItems
      .map((item) => [String(item?.id || "").trim(), item])
      .filter(([itemId]) => Boolean(itemId))
  );
  const nextItems = Array.isArray(nextSnapshot.items) ? nextSnapshot.items.slice() : [];
  itemIds.forEach((itemId) => {
    const nextItem = patchItemMap.get(itemId) ? clone(patchItemMap.get(itemId)) : null;
    const index = itemId ? nextItems.findIndex((item) => String(item?.id || "") === itemId) : -1;
    if (nextItem) {
      if (index >= 0) {
        nextItems[index] = nextItem;
      } else {
        nextItems.push(nextItem);
      }
      return;
    }
    if (index >= 0) {
      nextItems.splice(index, 1);
    }
  });
  const orderIds = getPatchTargetOrderIds(entry, targetKey);
  if (orderIds.length) {
    const nextItemMap = new Map(
      nextItems
        .map((item) => [String(item?.id || "").trim(), item])
        .filter(([itemId]) => Boolean(itemId))
    );
    const orderedItems = [];
    const visited = new Set();
    orderIds.forEach((itemId) => {
      const item = nextItemMap.get(itemId);
      if (!item || visited.has(itemId)) {
        return;
      }
      orderedItems.push(item);
      visited.add(itemId);
    });
    nextItems.forEach((item) => {
      const itemId = String(item?.id || "").trim();
      if (!itemId || visited.has(itemId)) {
        return;
      }
      orderedItems.push(item);
    });
    nextSnapshot.items = orderedItems;
  } else {
    nextSnapshot.items = nextItems;
  }
  nextSnapshot.selectedIds = Array.isArray(entry?.[`${targetKey}SelectedIds`])
    ? clone(entry[`${targetKey}SelectedIds`])
    : nextSnapshot.selectedIds;
  nextSnapshot.view = entry?.[`${targetKey}View`] ? clone(entry[`${targetKey}View`]) : nextSnapshot.view;
  nextSnapshot.editingId = entry?.[`${targetKey}EditingId`] || null;
  nextSnapshot.editingType = entry?.[`${targetKey}EditingType`] || null;
  return nextSnapshot;
}

function getHistoryEntryTargetSignature(entry, targetKey) {
  if (!entry) {
    return "";
  }
  if (entry.kind === "patch") {
    return getPatchTargetSignature(entry, targetKey);
  }
  return getSnapshotSignature(entry[targetKey]);
}

function resolveHistoryEntrySnapshot(entry, currentSnapshot, targetKey) {
  if (!entry) {
    return null;
  }
  if (entry.kind === "patch") {
    return applyPatchEntryToSnapshot(entry, currentSnapshot, targetKey);
  }
  return entry[targetKey] ? clone(entry[targetKey]) : null;
}

export function pushHistory(history, before, after, reason = "") {
  const signature = getSnapshotSignature(after);
  if (!signature || signature === history.lastSignature) {
    return false;
  }
  history.undo.push({
    before: clone(before),
    after: clone(after),
    reason,
    createdAt: Date.now(),
  });
  history.redo = [];
  history.lastSignature = signature;
  while (history.undo.length > HISTORY_LIMIT) {
    history.undo.shift();
  }
  return true;
}

export function pushPatchHistory(history, patch, reason = "") {
  const itemIds = normalizePatchItemIds(patch);
  const beforeItems = normalizePatchItemCollection(patch, "before");
  const afterItems = normalizePatchItemCollection(patch, "after");
  const entry = {
    kind: "patch",
    patchKind: String(patch?.patchKind || ""),
    itemId: String(patch?.itemId || itemIds[0] || "").trim(),
    itemIds,
    beforeItem: beforeItems[0] ? clone(beforeItems[0]) : null,
    afterItem: afterItems[0] ? clone(afterItems[0]) : null,
    beforeItems,
    afterItems,
    beforeOrderIds: Array.isArray(patch?.beforeOrderIds) ? clone(patch.beforeOrderIds) : [],
    afterOrderIds: Array.isArray(patch?.afterOrderIds) ? clone(patch.afterOrderIds) : [],
    beforeSelectedIds: Array.isArray(patch?.beforeSelectedIds) ? clone(patch.beforeSelectedIds) : [],
    afterSelectedIds: Array.isArray(patch?.afterSelectedIds) ? clone(patch.afterSelectedIds) : [],
    beforeView: clone(patch?.beforeView || {}),
    afterView: clone(patch?.afterView || {}),
    beforeEditingId: patch?.beforeEditingId || null,
    beforeEditingType: patch?.beforeEditingType || null,
    afterEditingId: patch?.afterEditingId || null,
    afterEditingType: patch?.afterEditingType || null,
    reason,
    createdAt: Date.now(),
  };
  const beforeSignature = getHistoryEntryTargetSignature(entry, "before");
  const afterSignature = getHistoryEntryTargetSignature(entry, "after");
  if (!afterSignature || beforeSignature === afterSignature || afterSignature === history.lastSignature) {
    return false;
  }
  history.undo.push(entry);
  history.redo = [];
  history.lastSignature = afterSignature;
  while (history.undo.length > HISTORY_LIMIT) {
    history.undo.shift();
  }
  return true;
}

export function undoHistory(history, currentSnapshot) {
  const entry = history.undo.pop();
  if (!entry) {
    return null;
  }
  if (entry.kind === "patch") {
    history.redo.push(clone(entry));
    history.lastSignature = getHistoryEntryTargetSignature(entry, "before");
    return {
      kind: "patch",
      direction: "undo",
      entry: clone(entry),
      snapshot: null,
    };
  }
  if (!entry?.before) {
    return null;
  }
  history.redo.push({
    before: clone(currentSnapshot),
    after: clone(entry.after || currentSnapshot),
    reason: "undo",
    createdAt: Date.now(),
  });
  history.lastSignature = getSnapshotSignature(entry.before);
  return {
    kind: "snapshot",
    direction: "undo",
    entry: null,
    snapshot: clone(entry.before),
  };
}

export function redoHistory(history, currentSnapshot) {
  const entry = history.redo.pop();
  if (!entry) {
    return null;
  }
  if (entry.kind === "patch") {
    history.undo.push(clone(entry));
    history.lastSignature = getHistoryEntryTargetSignature(entry, "after");
    return {
      kind: "patch",
      direction: "redo",
      entry: clone(entry),
      snapshot: null,
    };
  }
  if (!entry?.after) {
    return null;
  }
  history.undo.push({
    before: clone(currentSnapshot),
    after: clone(entry.after),
    reason: "redo",
    createdAt: Date.now(),
  });
  history.lastSignature = getSnapshotSignature(entry.after);
  return {
    kind: "snapshot",
    direction: "redo",
    entry: null,
    snapshot: clone(entry.after),
  };
}

export function applyPatchEntryToHistorySnapshot(entry, currentSnapshot, targetKey) {
  return resolveHistoryEntrySnapshot(entry, currentSnapshot, targetKey);
}
