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

  console.log("[host-persistence-adapter] ok: 1 scenario validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
