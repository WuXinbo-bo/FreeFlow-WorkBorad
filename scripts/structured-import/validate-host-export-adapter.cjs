const assert = require("node:assert/strict");

async function main() {
  const { buildHostExportSnapshot } = await import(
    "../../public/src/engines/canvas2d-core/import/host/hostExportAdapter.js"
  );

  const snapshot = buildHostExportSnapshot({
    items: [
      { id: "code-1", type: "codeBlock", text: "print(1)", plainText: "print(1)" },
      { id: "math-1", type: "mathBlock", formula: "x+y", fallbackText: "$$x+y$$" },
    ],
    selectedIds: ["code-1", "math-1"],
    view: { scale: 1 },
  });

  assert.equal(snapshot.itemCount, 2);
  assert.equal(snapshot.summary.typeCounts.codeBlock, 1);
  assert.equal(snapshot.items[0].exportText.includes("print"), true);

  console.log("[host-export-adapter] ok: 1 scenario validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
