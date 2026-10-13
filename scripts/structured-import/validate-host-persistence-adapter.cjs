const assert = require("node:assert/strict");

async function main() {
  const {
    serializeHostBoard,
    deserializeHostBoard,
  } = await import("../../public/src/engines/canvas2d-core/import/host/hostPersistenceAdapter.js");

  const serialized = serializeHostBoard({
    items: [{ id: "text-1", type: "text", text: "hello" }],
    selectedIds: ["text-1"],
    view: {},
    preferences: {},
  });
  const deserialized = deserializeHostBoard(JSON.stringify(serialized));
  assert.equal(deserialized.board.items.length, 1);
  assert.equal(deserialized.kind, "structured-host-board");

  const live = {
    items: [{ id: "live", type: "text", html: "<h2>Measured</h2><p>Body</p>", text: "Measured\nBody",
      width: 517, height: 231, fontSize: 20, textBoxLayoutMode: "auto-width" }],
    selectedIds: ["live"], view: { scale: .5, offsetX: 21, offsetY: 42 },
  };
  const before = JSON.stringify(live);
  const saved = serializeHostBoard(live, { preserveTextGeometry: true });
  assert.equal(saved.board.items[0].width, 517);
  assert.equal(saved.board.items[0].height, 231);
  assert.equal(saved.board.items[0].id, "live");
  assert.deepEqual(saved.board.view, live.view);
  assert.equal(JSON.stringify(live), before, "serialization mutated the live board");
  const reopened = deserializeHostBoard(saved);
  assert.equal(reopened.board.items[0].width, 517, "reopen remeasured saved text width");
  assert.equal(reopened.board.items[0].height, 231, "reopen remeasured saved text height");
  const missingGeometry = serializeHostBoard({ items: [{ id: "legacy", type: "text", text: "hello" }] }, { preserveTextGeometry: true });
  assert(missingGeometry.board.items[0].width > 0 && missingGeometry.board.items[0].height > 0);
  console.log("[host-persistence-adapter] geometry preservation, legacy fallback and isolation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
