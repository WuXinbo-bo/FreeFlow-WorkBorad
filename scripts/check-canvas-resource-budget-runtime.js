const assert = require("assert");

function createPool(bytes) {
  let byteSize = bytes;
  return {
    getStats: () => ({ byteSize }),
    setBytes: (nextBytes) => { byteSize = Math.max(0, Number(nextBytes) || 0); },
    trimToBytes: (target) => {
      const before = byteSize;
      byteSize = Math.min(byteSize, Math.max(0, Number(target) || 0));
      return before - byteSize;
    },
  };
}

async function main() {
  const { createResourceBudgetRuntime, resolveCanvasResourceBudgetBytes } = await import(
    "../public/src/engines/canvas2d-core/perf/resourceBudgetRuntime.js"
  );
  assert(resolveCanvasResourceBudgetBytes(4) < resolveCanvasResourceBudgetBytes(16));

  const queued = [];
  const runtime = createResourceBudgetRuntime({
    maxBytes: 100,
    scheduleTask: (task) => {
      const record = { task, canceled: false };
      queued.push(record);
      return () => { record.canceled = true; };
    },
  });
  const snapshots = createPool(50);
  const tiles = createPool(50);
  const retained = createPool(40);
  runtime.register({ id: "snapshots", priority: 10, minimumBytes: 20, ...snapshots });
  runtime.register({ id: "tiles", priority: 20, minimumBytes: 20, ...tiles });
  runtime.register({ id: "retained", reclaimable: false, ...retained });

  runtime.setInteractionActive(true);
  runtime.requestReconcile();
  assert.strictEqual(runtime.getSnapshot().totalBytes, 140, "interaction changed resource ownership");
  assert.strictEqual(runtime.getSnapshot().deferred, true, "interaction did not defer cache reclamation");
  assert.strictEqual(snapshots.getStats().byteSize, 50, "active interaction reclaimed snapshots");

  runtime.setInteractionActive(false);
  assert.strictEqual(queued.length, 1, "interaction exit did not schedule reclamation");
  queued.shift().task();
  assert.strictEqual(snapshots.getStats().byteSize, 20, "lower priority cache was not reclaimed first");
  assert.strictEqual(tiles.getStats().byteSize, 40, "remaining pressure did not reach the next cache");
  assert.strictEqual(retained.getStats().byteSize, 40, "retained frame was reclaimed");
  assert.strictEqual(runtime.getSnapshot().totalBytes, 100, "global resource budget was not enforced");

  tiles.setBytes(80);
  runtime.requestReconcile();
  const pending = queued.shift();
  runtime.setInteractionActive(true);
  assert.strictEqual(pending.canceled, true, "interaction did not cancel scheduled reclamation");
  pending.task();
  assert.strictEqual(runtime.getSnapshot().reconcileCount, 1, "stale reclamation ran during interaction");
  runtime.setInteractionActive(false);
  queued.shift().task();
  assert.strictEqual(runtime.getSnapshot().overBudgetBytes, 0, "rapid interaction recovery left stale pressure");
  runtime.dispose();
  console.log("[check-canvas-resource-budget-runtime] ok");
}

main().catch((error) => {
  console.error(`[check-canvas-resource-budget-runtime] ${error.stack || error.message}`);
  process.exitCode = 1;
});
