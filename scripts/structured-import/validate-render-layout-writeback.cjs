const assert = require("node:assert/strict");

async function main() {
  const {
    applyRenderLayoutWriteback,
    applyRenderLayoutWritebackAsync,
    getImportedBatchLayoutIssues,
    stabilizeImportedBatchLayout,
  } = await import(
    "../../public/src/engines/canvas2d-core/import/host/renderLayoutWriteback.js"
  );

  const result = applyRenderLayoutWriteback({
    operations: [
      {
        layout: { strategy: "flow-stack", stackIndex: 0, gap: 18 },
        element: { id: "text-1", type: "text", text: "A", plainText: "A", html: "A", width: 100, height: 40 },
      },
      {
        layout: { strategy: "inline-anchor", stackIndex: 1 },
        element: { id: "math-1", type: "mathInline", formula: "x", width: 50, height: 28 },
      },
    ],
  }, {
    anchorPoint: { x: 40, y: 50 },
  });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].x, 40);
  assert.equal(result.items[0].y, 50);
  assert.ok(result.items[1].x >= 40);

  const mixed = applyRenderLayoutWriteback({
    operations: [
      {
        layout: { strategy: "flow-stack", stackIndex: 0, gap: 20 },
        element: { id: "intro", type: "text", text: "Intro", width: 760, height: 40 },
      },
      {
        type: "render-table-block",
        layout: { strategy: "flow-stack", stackIndex: 1, gap: 20 },
        structure: {
          title: "Metrics",
          columns: 2,
          hasHeader: true,
          rows: [
            { cells: [{ plainText: "Name", header: true }, { plainText: "Value", header: true }] },
            { cells: [{ plainText: "A" }, { plainText: "1" }] },
            { cells: [{ plainText: "B" }, { plainText: "2" }] },
          ],
        },
        element: { id: "table", type: "table", width: 760, height: 84 },
      },
      {
        type: "render-code-block",
        layout: { strategy: "flow-stack", stackIndex: 2, gap: 20 },
        structure: { language: "javascript", code: Array.from({ length: 18 }, (_, index) => `line ${index}`).join("\n") },
        element: { id: "code", type: "codeBlock", width: 760, height: 84, autoHeight: true },
      },
      {
        layout: { strategy: "flow-stack", stackIndex: 3, gap: 20 },
        element: { id: "outro", type: "text", text: "Outro", width: 760, height: 40 },
      },
    ],
  }, { anchorPoint: { x: 10, y: 20 }, batchId: "batch-mixed" });
  const stabilized = stabilizeImportedBatchLayout(mixed.items);
  assert.equal(stabilized.length, 4);
  assert.equal(stabilized.every((item) => item.importBatch?.id === "batch-mixed"), true);
  assert.deepEqual(getImportedBatchLayoutIssues(stabilized), []);
  for (let index = 1; index < stabilized.length; index += 1) {
    const previous = stabilized[index - 1];
    const current = stabilized[index];
    assert.ok(current.y >= previous.y + previous.height + 20, `items ${previous.id}/${current.id} overlap`);
  }

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    applyRenderLayoutWritebackAsync({ operations: mixed.commits.map((commit) => commit.operation) }, {
      anchorPoint: { x: 0, y: 0 },
      signal: controller.signal,
      yieldControl: async () => {},
    }),
    (error) => error?.name === "AbortError"
  );

  console.log("[render-layout-writeback] ok: 3 scenarios validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
