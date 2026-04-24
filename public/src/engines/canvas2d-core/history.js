import { HISTORY_LIMIT } from "./constants.js";
import { clone } from "./utils.js";

export function createHistoryState() {
  return {
    undo: [],
    redo: [],
    lastSignature: "",
  };
}

export function takeHistorySnapshot(state) {
  return {
    items: clone(state.board.items),
    selectedIds: clone(state.board.selectedIds),
    view: clone(state.board.view),
    editingId: null,
    editingType: null,
  };
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

function getPatchTargetSignature(entry, targetKey) {
  if (!entry || entry.kind !== "patch") {
    return "";
  }
  try {
    return JSON.stringify({
      kind: entry.kind,
      patchKind: entry.patchKind || "",
      itemId: entry.itemId || "",
      item: clone(entry[`${targetKey}Item`] || null),
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
  const nextItem = clone(entry?.[`${targetKey}Item`] || null);
  const itemId = String(entry?.itemId || nextItem?.id || "").trim();
  const nextItems = Array.isArray(nextSnapshot.items) ? nextSnapshot.items.slice() : [];
  const index = itemId ? nextItems.findIndex((item) => String(item?.id || "") === itemId) : -1;
  if (nextItem) {
    if (index >= 0) {
      nextItems[index] = nextItem;
    } else {
      nextItems.push(nextItem);
    }
  } else if (index >= 0) {
    nextItems.splice(index, 1);
  }
  nextSnapshot.items = nextItems;
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
  const entry = {
    kind: "patch",
    patchKind: String(patch?.patchKind || ""),
    itemId: String(patch?.itemId || "").trim(),
    beforeItem: clone(patch?.beforeItem || null),
    afterItem: clone(patch?.afterItem || null),
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
    return resolveHistoryEntrySnapshot(entry, currentSnapshot, "before");
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
  return clone(entry.before);
}

export function redoHistory(history, currentSnapshot) {
  const entry = history.redo.pop();
  if (!entry) {
    return null;
  }
  if (entry.kind === "patch") {
    history.undo.push(clone(entry));
    history.lastSignature = getHistoryEntryTargetSignature(entry, "after");
    return resolveHistoryEntrySnapshot(entry, currentSnapshot, "after");
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
  return clone(entry.after);
}
