const assert = require("node:assert/strict");

async function main() {
  const { hitTestHostInteraction, collectHostSelection, buildHostDragSelection } = await import(
    "../../public/src/engines/canvas2d-core/import/host/hostInteractionAdapter.js"
  );

  const board = {
    items: [
      {
        id: "table-1",
        type: "table",
        x: 100,
        y: 100,
        width: 280,
        height: 140,
        table: {
          columns: 2,
          rows: [
            { cells: [{ plainText: "A", colSpan: 1, header: true }, { plainText: "B", colSpan: 1, header: true }] },
            { cells: [{ plainText: "1", colSpan: 1 }, { plainText: "2", colSpan: 1 }] },
          ],
        },
      },
      {
        id: "text-1",
        type: "text",
        x: 420,
        y: 100,
        width: 220,
        height: 90,
        text: "[ ] one\n[x] two",
        plainText: "[ ] one\n[x] two",
        html: "",
        structuredImport: {
          kind: "structured-import-v1",
          listRole: "taskList",
          canonicalFragment: {
            items: [
              { kind: "taskItem", checked: false, level: 0, childItems: [] },
              { kind: "taskItem", checked: true, level: 0, childItems: [] },
            ],
          },
        },
      },
    ],
  };

  const tableHit = hitTestHostInteraction(board, { x: 130, y: 120 }, 1);
  assert.equal(tableHit.zone, "table-cell");
  assert.equal(tableHit.detail.rowIndex, 0);

  const taskHit = hitTestHostInteraction(board, { x: 430, y: 110 }, 1);
  assert.equal(taskHit.zone, "task-checkbox");

  const selection = collectHostSelection(board, { x: 90, y: 90 }, { x: 650, y: 210 });
  assert.equal(selection.ids.length, 2);

  const dragSelection = buildHostDragSelection(board, selection.ids);
  assert.equal(dragSelection.draggable, true);
  assert.equal(dragSelection.items.length, 2);

  console.log("[host-interaction-adapter] ok: 1 scenario validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
