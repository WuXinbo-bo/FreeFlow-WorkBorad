const assert = require("assert");

function createItem(id, x = 0) {
  return {
    id,
    type: "shape",
    shapeType: "rect",
    x,
    y: 0,
    width: 100,
    height: 60,
    startX: x,
    startY: 0,
    endX: x + 100,
    endY: 60,
  };
}

function createSnapshot(items, selectedIds = []) {
  return {
    items,
    selectedIds,
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    editingId: null,
    editingType: null,
  };
}

function itemIds(snapshot) {
  return snapshot.items.map((item) => item.id);
}

async function checkStoreSnapshotReuse() {
  const { createCanvas2DStore } = await import("../public/src/engines/canvas2d-core/store.js");
  const store = createCanvas2DStore({
    disableLocalStorage: true,
    initialBoard: {
      items: [createItem("a")],
      selectedIds: [],
      view: { scale: 1, offsetX: 0, offsetY: 0 },
    },
  });

  try {
    const initial = store.getSnapshot();
    store.state.hoverId = "a";
    store.emit();
    const hover = store.getSnapshot();
    assert.strictEqual(hover.board, initial.board, "UI-only emit rebuilt the board snapshot");

    store.state.board.selectedIds = ["a"];
    store.emit();
    const selected = store.getSnapshot();
    assert.notStrictEqual(selected.board, hover.board, "selection change reused stale board metadata");
    assert.strictEqual(selected.board.items, hover.board.items, "selection change cloned the element array");
    assert.deepStrictEqual(selected.board.selectedIds, ["a"], "selection snapshot did not update");

    store.state.board.view = { scale: 0.8, offsetX: 12, offsetY: 8 };
    store.touchBoard({ itemsChanged: false });
    const camera = store.getSnapshot();
    assert.strictEqual(camera.board.items, selected.board.items, "camera update cloned the element array");
    assert.deepStrictEqual(camera.board.view, store.state.board.view, "camera snapshot did not update");

    store.state.board.items[0] = { ...store.state.board.items[0], x: 40 };
    store.touchBoard();
    const changed = store.getSnapshot();
    assert.notStrictEqual(changed.board.items, camera.board.items, "element mutation reused a stale element snapshot");
    assert.strictEqual(changed.board.items[0].x, 40, "element mutation was not reflected in the snapshot");
  } finally {
    store.dispose();
  }
}

async function checkPatchRecovery() {
  const {
    applyPatchEntryToHistorySnapshot,
    createHistoryState,
    pushPatchHistory,
    redoHistory,
    undoHistory,
  } = await import("../public/src/engines/canvas2d-core/history.js");

  const beforeItems = [createItem("a", 0), createItem("b", 120), createItem("c", 240)];
  const editedB = createItem("b", 180);
  const editHistory = createHistoryState();
  assert.strictEqual(
    pushPatchHistory(editHistory, {
      patchKind: "item-edit",
      itemIds: ["b"],
      beforeItems: [beforeItems[1]],
      afterItems: [editedB],
      beforeSelectedIds: ["b"],
      afterSelectedIds: ["b"],
      beforeView: { scale: 1, offsetX: 0, offsetY: 0 },
      afterView: { scale: 1, offsetX: 0, offsetY: 0 },
    }),
    true,
    "item patch was not recorded"
  );
  const editEntry = editHistory.undo[0];
  let current = applyPatchEntryToHistorySnapshot(editEntry, createSnapshot(beforeItems, ["b"]), "after");
  assert.strictEqual(current.items[1].x, 180, "forward item patch did not apply");
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const undo = undoHistory(editHistory, current);
    current = applyPatchEntryToHistorySnapshot(undo.entry, current, "before");
    assert.strictEqual(current.items[1].x, 120, `cycle ${cycle} did not restore the edited item`);
    const redo = redoHistory(editHistory, current);
    current = applyPatchEntryToHistorySnapshot(redo.entry, current, "after");
    assert.strictEqual(current.items[1].x, 180, `cycle ${cycle} did not reapply the edited item`);
  }

  const inserted = createItem("d", 200);
  const insertHistory = createHistoryState();
  pushPatchHistory(insertHistory, {
    patchKind: "item-insert",
    itemIds: ["d"],
    beforeItems: [],
    afterItems: [inserted],
    beforeOrderIds: ["a", "b", "c"],
    afterOrderIds: ["a", "b", "d", "c"],
  });
  const insertEntry = insertHistory.undo[0];
  let insertedSnapshot = applyPatchEntryToHistorySnapshot(
    insertEntry,
    createSnapshot(beforeItems),
    "after"
  );
  assert.deepStrictEqual(itemIds(insertedSnapshot), ["a", "b", "d", "c"], "insert order was not applied");
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const insertUndo = undoHistory(insertHistory, insertedSnapshot);
    const insertRestored = applyPatchEntryToHistorySnapshot(insertUndo.entry, insertedSnapshot, "before");
    assert.deepStrictEqual(itemIds(insertRestored), ["a", "b", "c"], `insert undo cycle ${cycle} did not restore order`);
    const insertRedo = redoHistory(insertHistory, insertRestored);
    insertedSnapshot = applyPatchEntryToHistorySnapshot(insertRedo.entry, insertRestored, "after");
    assert.deepStrictEqual(itemIds(insertedSnapshot), ["a", "b", "d", "c"], `insert redo cycle ${cycle} did not restore order`);
  }

  const deleteHistory = createHistoryState();
  pushPatchHistory(deleteHistory, {
    patchKind: "item-delete",
    itemIds: ["b"],
    beforeItems: [beforeItems[1]],
    afterItems: [],
    beforeOrderIds: ["a", "b", "c"],
    afterOrderIds: ["a", "c"],
  });
  const deleteEntry = deleteHistory.undo[0];
  let deletedSnapshot = applyPatchEntryToHistorySnapshot(deleteEntry, createSnapshot(beforeItems), "after");
  assert.deepStrictEqual(itemIds(deletedSnapshot), ["a", "c"], "delete patch did not remove the item");
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const deleteUndo = undoHistory(deleteHistory, deletedSnapshot);
    const deleteRestored = applyPatchEntryToHistorySnapshot(deleteUndo.entry, deletedSnapshot, "before");
    assert.deepStrictEqual(itemIds(deleteRestored), ["a", "b", "c"], `delete undo cycle ${cycle} did not restore order`);
    const deleteRedo = redoHistory(deleteHistory, deleteRestored);
    deletedSnapshot = applyPatchEntryToHistorySnapshot(deleteRedo.entry, deleteRestored, "after");
    assert.deepStrictEqual(itemIds(deletedSnapshot), ["a", "c"], `delete redo cycle ${cycle} did not restore order`);
  }

  const reorderHistory = createHistoryState();
  pushPatchHistory(reorderHistory, {
    patchKind: "item-reorder",
    itemIds: ["a"],
    beforeItems: [beforeItems[0]],
    afterItems: [beforeItems[0]],
    beforeOrderIds: ["a", "b", "c"],
    afterOrderIds: ["c", "b", "a"],
  });
  const reorderEntry = reorderHistory.undo[0];
  const reordered = applyPatchEntryToHistorySnapshot(reorderEntry, createSnapshot(beforeItems), "after");
  assert.deepStrictEqual(itemIds(reordered), ["c", "b", "a"], "reorder patch did not apply");
  const reorderUndo = undoHistory(reorderHistory, reordered);
  assert.deepStrictEqual(
    itemIds(applyPatchEntryToHistorySnapshot(reorderUndo.entry, reordered, "before")),
    ["a", "b", "c"],
    "reorder undo did not restore order"
  );
}

async function main() {
  await checkStoreSnapshotReuse();
  await checkPatchRecovery();
  console.log("[check-canvas-state-history] ok");
}

main().catch((error) => {
  console.error(`[check-canvas-state-history] ${error.stack || error.message}`);
  process.exitCode = 1;
});
