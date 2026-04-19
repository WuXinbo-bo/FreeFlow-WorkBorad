const assert = require("node:assert/strict");

async function main() {
  const { createHistoryState } = await import(
    "../../public/src/engines/canvas2d-core/history.js"
  );
  const { createHostHistoryAdapter } = await import(
    "../../public/src/engines/canvas2d-core/import/host/hostHistoryAdapter.js"
  );

  const history = createHistoryState();
  const adapter = createHostHistoryAdapter();
  const before = {
    items: [],
    selectedIds: [],
    view: {},
    editingId: null,
    editingType: null,
  };
  const transaction = adapter.beginTransaction(before, "structured-import:text");
  const after = {
    ...before,
    items: [{ id: "text-1", type: "text", text: "hello" }],
    selectedIds: ["text-1"],
  };
  const result = adapter.commitTransaction(history, transaction, after);
  assert.equal(result.ok, true);
  assert.equal(history.undo.length, 1);

  console.log("[host-history-adapter] ok: 1 scenario validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
