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

export function undoHistory(history, currentSnapshot) {
  const entry = history.undo.pop();
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
