const assert = require("node:assert/strict");
async function checkHistoryMemoryAndRecovery() {
  const { createHistoryState, pushHistory, pushPatchHistory, undoHistory, redoHistory } = await import("../public/src/engines/canvas2d-core/history.js");
  const history = createHistoryState();
  const large = "x".repeat(1_000_000);
  assert.equal(pushPatchHistory(history, { itemIds: ["a"], afterItems: [{ id: "a", html: large }] }), true);
  assert.ok(history.lastSignature.length < 64, "history signature retained rich text content");
  assert.equal(history.undo[0].afterItem, history.undo[0].afterItems[0], "patch stored a duplicate rich text item");
  for (let cycle = 0; cycle < 4; cycle += 1) {
    assert.equal(undoHistory(history, { items: [{ id: "a", html: large }] }).kind, "patch");
    assert.equal(history.undo.length, 0);
    assert.equal(history.redo.length, 1);
    assert.equal(redoHistory(history, { items: [] }).kind, "patch");
    assert.equal(history.undo.length, 1);
    assert.equal(history.redo.length, 0);
  }
  const full = createHistoryState();
  const before = { items: [{ id: "a", x: 0 }], selectedIds: [], view: {} };
  const after = { items: [{ id: "a", x: 12 }], selectedIds: ["a"], view: {} };
  pushHistory(full, before, after);
  for (let cycle = 0; cycle < 4; cycle += 1) {
    assert.deepEqual(undoHistory(full, after).snapshot, before, "repeated snapshot undo lost original state");
    assert.deepEqual(redoHistory(full, before).snapshot, after);
  }
  undoHistory(full, after);
  pushHistory(full, before, { ...after, items: [{ id: "a", x: 24 }] });
  assert.equal(full.redo.length, 0, "new edit retained stale redo history");
}

async function checkHydrationRecovery() {
  const { createHydrationScheduler } = await import("../public/src/engines/canvas2d-core/perf/hydrationScheduler.js");
  const callbacks = [];
  const scheduled = new Map();
  let nextId = 0;
  global.requestIdleCallback = (callback) => {
    const record = { callback, cancelled: false };
    callbacks.push(record);
    scheduled.set(++nextId, record);
    return nextId;
  };
  global.cancelIdleCallback = (id) => { scheduled.get(id).cancelled = true; };
  const scheduler = createHydrationScheduler({ maxTasksPerFlush: 1 });
  const completed = [];
  let release;
  try {
    scheduler.enqueue("first", async ({ isStale }) => {
      await new Promise((resolve) => { release = resolve; });
      if (!isStale()) completed.push("first");
    });
    callbacks.shift().callback(null);
    await new Promise((resolve) => setImmediate(resolve));
    scheduler.enqueue("second", () => completed.push("second"));
    assert.equal(callbacks.length, 0, "overlapping flush scheduled while first task was running");
    scheduler.setPaused(true);
    release();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(completed, ["first"]);
    scheduler.setPaused(false);
    assert.equal(callbacks.length, 1);
    callbacks.shift().callback(null);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(completed, ["first", "second"]);
    scheduler.enqueue("stale", () => completed.push("stale"));
    const pending = callbacks.shift();
    scheduler.clear({ stale: true });
    scheduler.enqueue("recovered", () => completed.push("recovered"));
    pending.callback(null);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(completed, ["first", "second"]);
    callbacks.shift().callback(null);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(completed, ["first", "second", "recovered"]);
    scheduler.enqueue("in-flight", async ({ isStale }) => {
      await new Promise((resolve) => { release = resolve; });
      if (!isStale()) completed.push("wrong-board");
    });
    callbacks.shift().callback(null);
    await new Promise((resolve) => setImmediate(resolve));
    scheduler.clear({ stale: true });
    release();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(completed, ["first", "second", "recovered"]);
  } finally {
    scheduler.clear({ stale: true });
    delete global.requestIdleCallback;
    delete global.cancelIdleCallback;
  }
}

async function checkStatsPublication() {
  global.window = {};
  try {
    const stats = await import("../public/src/engines/canvas2d-core/perf/canvasRuntimeStats.js");
    stats.recordHydrationStats({ queued: 2 });
    stats.recordOverlayActive({ text: 3 });
    stats.recordAssetStats({ bytesLoaded: 128 });
    const load = window.__ffLoadStats;
    const asset = window.__ffAssetStats;
    const snapshot = window.__ffPerfSnapshot;
    stats.recordOverlayEvent("created");
    assert.equal(window.__ffLoadStats, load, "overlay update copied unrelated load stats");
    assert.equal(window.__ffAssetStats, asset, "overlay update copied unrelated asset stats");
    assert.equal(window.__ffPerfSnapshot, snapshot);
    const read = snapshot();
    assert.equal(read.overlay.active, 3);
    assert.equal(read.load.queued, 2);
    read.overlay.activeByType.text = 99;
    assert.equal(snapshot().overlay.activeByType.text, 3, "caller mutated published stats");
    await assert.rejects(stats.timeAssetTask("failure", () => { throw new Error("test failure"); }));
    assert.equal(snapshot().asset.running, 0);
    assert.equal(await stats.timeAssetTask("recovery", () => 42), 42);
    assert.equal(snapshot().asset.running, 0);
  } finally {
    delete global.window;
  }
}

async function main() {
  await checkHistoryMemoryAndRecovery();
  await checkHydrationRecovery();
  await checkStatsPublication();
  console.log("[check-canvas-runtime-hardening] ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
