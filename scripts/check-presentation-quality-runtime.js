const assert = require("assert");

async function main() {
  const { createElementTypeRegistry } = await import(
    "../public/src/engines/canvas2d-core/runtime/elementTypeRegistry.js"
  );
  const { createPresentationQualityPlanner, PRESENTATION_REPRESENTATIONS } = await import(
    "../public/src/engines/canvas2d-core/runtime/presentationQualityPlanner.js"
  );
  const { createPresentationQualityRuntime } = await import(
    "../public/src/engines/canvas2d-core/runtime/presentationQualityRuntime.js"
  );

  const registry = createElementTypeRegistry({ fallbackType: "text" });
  const baseDefinition = {
    normalize: (item) => item,
    getBounds: (item) => ({
      left: item.x,
      top: item.y,
      width: item.width,
      height: item.height,
      right: item.x + item.width,
      bottom: item.y + item.height,
    }),
    translate: (item) => item,
  };
  registry.register({
    ...baseDefinition,
    type: "text",
    capabilities: { render: "canvas-dom", overlay: "rich", cache: "tile" },
  });
  registry.register({
    ...baseDefinition,
    type: "image",
    capabilities: { render: "canvas", resource: "image", cache: "live" },
  });

  const items = [
    { id: "text-small", type: "text", x: 0, y: 0, width: 100, height: 20 },
    { id: "image-large", type: "image", x: 120, y: 0, width: 400, height: 300 },
    { id: "outside", type: "text", x: 1000, y: 1000, width: 200, height: 80 },
  ];
  const planner = createPresentationQualityPlanner({ registry });
  const plan = planner.createPlan({
    items,
    visibleIds: ["text-small", "image-large"],
    selectedIds: ["text-small"],
    view: { scale: 0.5 },
    revisionKey: "initial",
  });
  assert.strictEqual(Object.isFrozen(plan), true, "quality plan is mutable");
  assert.strictEqual(Object.isFrozen(plan.entries), true, "quality plan entries are mutable");
  assert.strictEqual(
    plan.entries["text-small"].representation,
    PRESENTATION_REPRESENTATIONS.LIVE_DETAIL,
    "selected element was degraded"
  );
  assert.strictEqual(
    plan.entries.outside.representation,
    PRESENTATION_REPRESENTATIONS.CULLED,
    "offscreen element was not culled"
  );

  const compactDomPlan = planner.createPlan({
    items,
    visibleIds: ["text-small"],
    view: { scale: 0.2 },
    revisionKey: "compact-dom",
  });
  assert.strictEqual(
    compactDomPlan.entries["text-small"].representation,
    PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT,
    "small DOM element did not use the unified exact-detail representation"
  );

  const lowScalePlan = planner.createPlan({
    items,
    visibleIds: items.map((item) => item.id),
    editingId: "text-small",
    view: { scale: 0.15 },
    revisionKey: "low-scale",
  });
  assert.strictEqual(lowScalePlan.entries["text-small"].representation, PRESENTATION_REPRESENTATIONS.LIVE_DETAIL);
  assert.strictEqual(lowScalePlan.entries["image-large"].representation, PRESENTATION_REPRESENTATIONS.NATIVE_COMPACT);

  const runtime = createPresentationQualityRuntime({ registry, planner, mode: "active" });
  const steady = runtime.update(
    { items, visibleIds: items.map((item) => item.id), view: { scale: 1 }, revisionKey: "steady-1" },
    { phase: "steady", sessionId: 0 }
  );
  const lockedPlan = steady.activePlan;
  assert.strictEqual(steady.mode, "active", "presentation quality runtime did not activate");
  const active = runtime.update(
    { items, visibleIds: items.map((item) => item.id), view: { scale: 0.4 }, revisionKey: "active-1" },
    { phase: "active", sessionId: 1 }
  );
  assert.strictEqual(active.activePlan, lockedPlan, "interaction did not lock the committed representation plan");
  const activeAgain = runtime.update(
    { items, visibleIds: items.map((item) => item.id), view: { scale: 0.2 }, revisionKey: "active-2" },
    { phase: "active", sessionId: 1 }
  );
  assert.strictEqual(activeAgain.activePlan, lockedPlan, "continuous interaction changed representation");

  const settling = runtime.update(
    { items, visibleIds: items.map((item) => item.id), view: { scale: 0.2 }, revisionKey: "settle-1" },
    { phase: "settling", sessionId: 1 }
  );
  assert.strictEqual(settling.activePlan, lockedPlan, "settling exposed a candidate before commit");
  assert.notStrictEqual(settling.candidatePlan, null, "settling did not prepare a candidate plan");

  const reentered = runtime.update(
    { items, visibleIds: items.map((item) => item.id), view: { scale: 0.3 }, revisionKey: "active-new" },
    { phase: "active", sessionId: 2 }
  );
  assert.strictEqual(reentered.candidatePlan, null, "new interaction retained a stale candidate");
  assert.strictEqual(reentered.activePlan, lockedPlan, "rapid re-entry changed the visible plan");

  runtime.update(
    { items, visibleIds: items.map((item) => item.id), view: { scale: 0.3 }, revisionKey: "settle-new" },
    { phase: "settling", sessionId: 2 }
  );
  const recovered = runtime.update(
    { items, visibleIds: items.map((item) => item.id), view: { scale: 0.3 }, revisionKey: "settle-new" },
    { phase: "steady", sessionId: 2 }
  );
  assert.strictEqual(recovered.phase, "steady", "quality runtime did not recover to steady");
  assert.strictEqual(recovered.activePlan.revisionKey, "settle-new", "latest settled plan was not committed");
  assert.strictEqual(recovered.candidatePlan, null, "recovery retained candidate state");

  console.log("[check-presentation-quality-runtime] ok");
}

main().catch((error) => {
  console.error(`[check-presentation-quality-runtime] ${error.stack || error.message}`);
  process.exitCode = 1;
});
