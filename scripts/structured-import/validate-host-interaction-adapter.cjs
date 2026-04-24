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
        id: "code-1",
        type: "codeBlock",
        x: 100,
        y: 300,
        width: 300,
        height: 150,
        language: "js",
        text: "const a = 1;\nconsole.log(a);",
      },
      {
        id: "math-1",
        type: "mathBlock",
        x: 440,
        y: 300,
        width: 220,
        height: 100,
        formula: "\\frac{a}{b}",
        fallbackText: "$$\\frac{a}{b}$$",
        displayMode: true,
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
  assert.equal(tableHit.detail.columnIndex, 0);

  const tableRightHit = hitTestHostInteraction(board, { x: 330, y: 120 }, 1);
  assert.equal(tableRightHit.zone, "table-cell");
  assert.equal(tableRightHit.detail.columnIndex, 1);

  const taskHit = hitTestHostInteraction(board, { x: 430, y: 110 }, 1);
  assert.equal(taskHit.zone, "task-checkbox");

  const codeContentHit = hitTestHostInteraction(board, { x: 116, y: 334 }, 1);
  assert.equal(codeContentHit.zone, "code-content");

  const codeContainerHit = hitTestHostInteraction(board, { x: 102, y: 306 }, 1);
  assert.equal(codeContainerHit.zone, "element");

  const mathFormulaHit = hitTestHostInteraction(board, { x: 500, y: 350 }, 1);
  assert.equal(mathFormulaHit.zone, "math-formula");

  const mathContainerHit = hitTestHostInteraction(board, { x: 444, y: 304 }, 1);
  assert.equal(mathContainerHit.zone, "element");

  const selection = collectHostSelection(board, { x: 90, y: 90 }, { x: 680, y: 470 });
  assert.equal(selection.ids.length, 4);

  const dragSelection = buildHostDragSelection(board, selection.ids);
  assert.equal(dragSelection.draggable, true);
  assert.equal(dragSelection.items.length, 4);

  console.log("[host-interaction-adapter] ok: geometry-aligned scenarios validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
