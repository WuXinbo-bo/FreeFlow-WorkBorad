const assert = require("node:assert/strict");

async function main() {
  const { resolveSelectionDependencyClosure } = await import(
    "../public/src/engines/canvas2d-core/selection/selectionDependencyClosure.js"
  );
  const { buildHostExportSnapshot } = await import(
    "../public/src/engines/canvas2d-core/export/host/hostExportSnapshotAdapter.js"
  );

  const items = [
    { id: "group-a", type: "shape", groupId: "group-1", x: 0, y: 0, width: 80, height: 50 },
    { id: "group-b", type: "text", groupId: "group-1", x: 90, y: 0, width: 80, height: 50 },
    { id: "outside", type: "text", x: 300, y: 0, width: 80, height: 50 },
    { id: "internal-edge", type: "flowEdge", fromId: "group-a", toId: "group-b" },
    { id: "external-edge", type: "flowEdge", fromId: "group-b", toId: "outside" },
    { id: "mind-a", type: "mindNode", x: 0, y: 100, width: 120, height: 60 },
    { id: "mind-b", type: "mindNode", x: 140, y: 100, width: 120, height: 60 },
    { id: "summary", type: "mindSummary", summaryOwnerId: "mind-a", siblingIds: ["mind-b"], x: 280, y: 100, width: 120, height: 60 },
  ];

  const grouped = resolveSelectionDependencyClosure([items[0]], items);
  assert.deepStrictEqual(grouped.map((item) => item.id), ["group-a", "group-b", "internal-edge"]);

  const explicitEdge = resolveSelectionDependencyClosure([items[4]], items);
  assert.deepStrictEqual(explicitEdge.map((item) => item.id), ["group-a", "group-b", "outside", "internal-edge", "external-edge"]);

  const partialMind = resolveSelectionDependencyClosure([items[5]], items);
  assert.deepStrictEqual(partialMind.map((item) => item.id), ["mind-a"]);
  const completeMind = resolveSelectionDependencyClosure([items[5], items[6]], items);
  assert.deepStrictEqual(completeMind.map((item) => item.id), ["mind-a", "mind-b", "summary"]);

  const snapshot = buildHostExportSnapshot(
    { items, selectedIds: ["group-a"], view: { scale: 1, offsetX: 0, offsetY: 0 } },
    {
      scope: "selection",
      safeExport: false,
      getElementBounds: (item) => ({
        left: Number(item.x || 0),
        top: Number(item.y || 0),
        right: Number(item.x || 0) + Number(item.width || 1),
        bottom: Number(item.y || 0) + Number(item.height || 1),
        width: Number(item.width || 1),
        height: Number(item.height || 1),
      }),
      getFlowEdgeBounds: () => ({ left: 0, top: 0, right: 170, bottom: 50, width: 170, height: 50 }),
    }
  );
  assert.deepStrictEqual(snapshot.items.map((item) => item.id), ["group-a", "group-b", "internal-edge"]);
  console.log("[check-selection-dependency-closure] ok");
}

main().catch((error) => {
  console.error(`[check-selection-dependency-closure] ${error.stack || error.message}`);
  process.exitCode = 1;
});
