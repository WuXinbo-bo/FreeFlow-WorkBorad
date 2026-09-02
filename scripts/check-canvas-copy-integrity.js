const assert = require("node:assert/strict");

async function main() {
  const { prepareElementDuplicateBatch } = await import(
    "../public/src/engines/canvas2d-core/brokers/duplicateElementBatch.js"
  );
  const {
    matchesInternalClipboardMarker,
    resolveInternalClipboardFreshness,
  } = await import("../public/src/engines/canvas2d-core/brokers/internalClipboardFreshness.js");

  let idSeed = 0;
  const createId = (prefix) => `${prefix}-copy-${++idSeed}`;
  const source = [
    { id: "root", type: "mindNode", parentId: "", rootId: "root", childrenIds: ["child"], groupId: "group-a", links: [{ id: "link-a", targetId: "target" }] },
    { id: "child", type: "mindNode", parentId: "root", rootId: "root", childrenIds: [], groupId: "group-a", links: [] },
    { id: "target", type: "text", text: "target", html: '<a href="freeflow://canvas/item/child">child</a>' },
    { id: "edge", type: "flowEdge", fromId: "root", toId: "target" },
    { id: "relation", type: "mindRelationship", fromId: "child", toId: "target" },
    { id: "orphan-edge", type: "flowEdge", fromId: "root", toId: "outside" },
  ];

  const first = prepareElementDuplicateBatch(source, { createId });
  const root = first.items.find((item) => item.type === "mindNode" && !item.parentId);
  const child = first.items.find((item) => item.type === "mindNode" && item.parentId);
  const target = first.items.find((item) => item.type === "text");
  const edge = first.items.find((item) => item.type === "flowEdge");
  const relation = first.items.find((item) => item.type === "mindRelationship");

  assert.equal(first.items.length, 5, "relation with an external endpoint was duplicated");
  assert.equal(child.parentId, root.id, "mind parent reference was not remapped");
  assert.deepEqual(root.childrenIds, [child.id], "mind children references were not remapped");
  assert.equal(root.rootId, root.id, "mind root reference was not remapped");
  assert.equal(child.rootId, root.id, "mind child root reference was not remapped");
  assert.equal(child.depth, 1, "mind child depth was not rebuilt");
  assert.equal(root.groupId, child.groupId, "duplicated group members lost their shared group");
  assert.notEqual(root.groupId, "group-a", "duplicated items kept the source group identity");
  assert.equal(root.links[0].targetId, target.id, "mind canvas link was not remapped");
  assert.equal(edge.fromId, root.id, "flow edge source was not remapped");
  assert.equal(edge.toId, target.id, "flow edge target was not remapped");
  assert.equal(relation.fromId, child.id, "mind relationship source was not remapped");
  assert.equal(relation.toId, target.id, "mind relationship target was not remapped");
  assert.match(target.html, new RegExp(encodeURIComponent(child.id)), "rich text canvas link was not remapped");
  assert.equal(source[0].groupId, "group-a", "source items were mutated");
  assert.equal(source[1].parentId, "root", "source mind references were mutated");

  const second = prepareElementDuplicateBatch(source, { createId });
  assert.notEqual(second.items[0].id, first.items[0].id, "repeated duplicate batches reused element ids");
  assert.notEqual(second.items[0].groupId, first.items[0].groupId, "repeated duplicate batches reused group ids");

  const payload = { clipboardId: "clip-a", copiedAt: 10, items: [{ id: "a" }] };
  assert.equal(matchesInternalClipboardMarker({ clipboardId: "clip-a", copiedAt: 9 }, payload), true);
  assert.equal(matchesInternalClipboardMarker({ clipboardId: "clip-b", copiedAt: 10 }, payload), false);
  assert.equal(
    resolveInternalClipboardFreshness({
      payload,
      marker: { clipboardId: "clip-b", copiedAt: 10 },
      payloadText: "table",
      clipboardText: "table",
    }),
    false,
    "mismatched clipboard marker fell back to identical plain text"
  );
  assert.equal(
    resolveInternalClipboardFreshness({ payload, payloadText: "table", clipboardText: "" }),
    false,
    "empty system clipboard incorrectly trusted stale structured payload"
  );
  assert.equal(
    resolveInternalClipboardFreshness({ payload, payloadText: "table", clipboardText: "table" }),
    true,
    "matching system text did not recover internal clipboard fallback"
  );
  assert.equal(
    resolveInternalClipboardFreshness({ payload, payloadPaths: ["c:\\a.txt"], clipboardPaths: ["c:\\b.txt"] }),
    false,
    "different system files incorrectly matched internal clipboard"
  );

  console.log(`[check-canvas-copy-integrity] ok: ${first.items.length} duplicated items`);
}

main().catch((error) => {
  console.error(`[check-canvas-copy-integrity] ${error.stack || error.message}`);
  process.exitCode = 1;
});
