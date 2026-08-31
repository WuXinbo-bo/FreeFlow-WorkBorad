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
    capabilities: {
      render: "canvas-dom",
      overlay: "rich",
      cache: "tile",
      presentation: "layout-snapshot",
      minimumReadableTextPx: 4,
      nominalFontSizePx: 18,
    },
  });
  registry.register({
    ...baseDefinition,
    type: "image",
    capabilities: { render: "canvas", resource: "image", cache: "live" },
  });
  registry.register({
    ...baseDefinition,
    type: "table",
    getPresentationCost: (item) => item.table.rows.reduce((total, row) => total + row.cells.length, 0),
    capabilities: {
      render: "canvas-dom",
      cache: "live",
      presentation: "cost-snapshot",
      exactSnapshotCost: 64,
      minimumReadableTextPx: 3.5,
      nominalFontSizePx: 14,
    },
  });

  const items = [
    { id: "text-small", type: "text", x: 0, y: 0, width: 100, height: 20, fontSize: 30 },
    { id: "text-default", type: "text", x: 0, y: 40, width: 400, height: 200, fontSize: 18 },
    { id: "text-tiny", type: "text", x: 0, y: 260, width: 40, height: 20, fontSize: 30 },
    { id: "image-large", type: "image", x: 120, y: 0, width: 400, height: 300 },
    { id: "outside", type: "text", x: 1000, y: 1000, width: 200, height: 80 },
    {
      id: "table-large",
      type: "table",
      x: 0,
      y: 1100,
      width: 800,
      height: 600,
      table: { rows: Array.from({ length: 8 }, () => ({ cells: Array.from({ length: 8 }, () => ({})) })) },
    },
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

  const unreadableTextPlan = planner.createPlan({
    items,
    visibleIds: items.map((item) => item.id),
    view: { scale: 0.18 },
    revisionKey: "unreadable-text",
  });
  assert.strictEqual(
    unreadableTextPlan.entries["text-default"].representation,
    PRESENTATION_REPRESENTATIONS.FROZEN_DETAIL,
    "subpixel text did not preserve its frozen full layout"
  );
  assert.strictEqual(
    unreadableTextPlan.entries["image-large"].representation,
    PRESENTATION_REPRESENTATIONS.LIVE_DETAIL,
    "non-text content was held by the text readability policy"
  );
  assert.strictEqual(
    unreadableTextPlan.entries["text-tiny"].representation,
    PRESENTATION_REPRESENTATIONS.FROZEN_DETAIL,
    "small projected text lost its original multi-line layout"
  );
  assert.strictEqual(
    plan.entries.outside.representation,
    PRESENTATION_REPRESENTATIONS.CULLED,
    "offscreen element was not culled"
  );

  const largeTablePlan = planner.createPlan({
    items,
    visibleIds: ["table-large"],
    view: { scale: 1 },
    revisionKey: "large-table",
  });
  assert.strictEqual(
    largeTablePlan.entries["table-large"].representation,
    PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT,
    "high-cost table did not use an exact snapshot"
  );
  assert.strictEqual(largeTablePlan.entries["table-large"].presentationCost, 64);
  const selectedTablePlan = planner.createPlan({
    items,
    visibleIds: ["table-large"],
    selectedIds: ["table-large"],
    view: { scale: 1 },
    revisionKey: "selected-table",
  });
  assert.strictEqual(
    selectedTablePlan.entries["table-large"].representation,
    PRESENTATION_REPRESENTATIONS.LIVE_DETAIL,
    "selected high-cost table did not recover live detail"
  );

  const compactDomPlan = planner.createPlan({
    items,
    visibleIds: ["text-small"],
    view: { scale: 0.2 },
    revisionKey: "compact-dom",
  });
  assert.strictEqual(
    compactDomPlan.entries["text-small"].representation,
    PRESENTATION_REPRESENTATIONS.FROZEN_DETAIL,
    "small DOM element fell back to a semantic compact summary"
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

  const compactHysteresis = planner.createPlan({
    items,
    visibleIds: items.map((item) => item.id),
    view: { scale: 0.16 },
    revisionKey: "compact-hysteresis",
    previousPlan: lowScalePlan,
  });
  assert.strictEqual(
    compactHysteresis.entries["image-large"].representation,
    PRESENTATION_REPRESENTATIONS.NATIVE_COMPACT,
    "compact representation left before its exit threshold"
  );
  const compactRecovered = planner.createPlan({
    items,
    visibleIds: items.map((item) => item.id),
    view: { scale: 0.18 },
    revisionKey: "compact-recovered",
    previousPlan: compactHysteresis,
  });
  assert.strictEqual(
    compactRecovered.entries["image-large"].representation,
    PRESENTATION_REPRESENTATIONS.LIVE_DETAIL,
    "compact representation did not recover after its exit threshold"
  );

  let nowMs = 0;
  const runtime = createPresentationQualityRuntime({
    registry,
    planner,
    mode: "active",
    minimumDwellMs: 120,
    nowProvider: () => nowMs,
  });
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

  nowMs = 200;
  const dwellBaseline = runtime.update(
    { items, visibleIds: items.map((item) => item.id), view: { scale: 0.15 }, revisionKey: "dwell-compact" },
    { phase: "steady", sessionId: 2 }
  );
  assert.strictEqual(
    dwellBaseline.activePlan.entries["image-large"].representation,
    PRESENTATION_REPRESENTATIONS.NATIVE_COMPACT
  );
  nowMs = 240;
  const dwellHeld = runtime.update(
    { items, visibleIds: items.map((item) => item.id), view: { scale: 0.18 }, revisionKey: "dwell-live" },
    { phase: "steady", sessionId: 2 }
  );
  assert.strictEqual(
    dwellHeld.activePlan.entries["image-large"].representation,
    PRESENTATION_REPRESENTATIONS.NATIVE_COMPACT,
    "minimum dwell did not retain the current representation"
  );
  assert.strictEqual(dwellHeld.pendingTransitions > 0, true, "minimum dwell did not report a pending transition");
  assert.strictEqual(dwellHeld.nextEvaluationInMs, 80, "minimum dwell returned the wrong reevaluation delay");
  nowMs = 320;
  const dwellReleased = runtime.update(
    { items, visibleIds: items.map((item) => item.id), view: { scale: 0.18 }, revisionKey: "dwell-live" },
    { phase: "steady", sessionId: 2 }
  );
  assert.strictEqual(
    dwellReleased.activePlan.entries["image-large"].representation,
    PRESENTATION_REPRESENTATIONS.LIVE_DETAIL,
    "representation did not recover after the minimum dwell"
  );
  assert.strictEqual(dwellReleased.pendingTransitions, 0, "released dwell retained pending state");

  nowMs = 500;
  runtime.update(
    { items, visibleIds: items.map((item) => item.id), view: { scale: 0.15 }, revisionKey: "protected-compact" },
    { phase: "steady", sessionId: 2 }
  );
  nowMs = 510;
  const protectedImmediately = runtime.update(
    {
      items,
      visibleIds: items.map((item) => item.id),
      selectedIds: ["image-large"],
      view: { scale: 0.15 },
      revisionKey: "protected-live",
    },
    { phase: "steady", sessionId: 2 }
  );
  assert.strictEqual(
    protectedImmediately.activePlan.entries["image-large"].representation,
    PRESENTATION_REPRESENTATIONS.LIVE_DETAIL,
    "interaction protection was delayed by minimum dwell"
  );

  console.log("[check-presentation-quality-runtime] ok");
}

main().catch((error) => {
  console.error(`[check-presentation-quality-runtime] ${error.stack || error.message}`);
  process.exitCode = 1;
});
