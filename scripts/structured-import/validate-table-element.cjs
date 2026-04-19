"use strict";

async function main() {
  const tableModule = await import(
    "../../public/src/engines/canvas2d-core/elements/table.js"
  );
  const indexModule = await import(
    "../../public/src/engines/canvas2d-core/elements/index.js"
  );
  const bridgeModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/table/tableElementBridge.js"
  );

  const {
    createTableElement,
    normalizeTableElement,
    TABLE_MIN_WIDTH,
    TABLE_MIN_HEIGHT,
  } = tableModule;
  const { normalizeElement } = indexModule;
  const { buildTableElementFromRenderOperation } = bridgeModule;

  const created = createTableElement(
    { x: 10, y: 20 },
    {
      title: "课程表",
      columns: 2,
      rows: [
        {
          cells: [
            { plainText: "名称", header: true },
            { plainText: "时间", header: true },
          ],
        },
        {
          cells: [
            { plainText: "算法" },
            { plainText: "09:00" },
          ],
        },
      ],
    }
  );
  assert(created.type === "table", "created table type mismatch");
  assert(created.columns === 2, "created table columns mismatch");
  assert(created.table.rows.length === 2, "created table row count mismatch");

  const normalized = normalizeElement({
    type: "table",
    width: 120,
    height: 40,
    table: {
      columns: 2,
      rows: [
        {
          cells: [
            { plainText: "A", colSpan: 2, header: true },
          ],
        },
      ],
    },
  });
  assert(normalized.type === "table", "normalized table type mismatch");
  assert(normalized.width >= TABLE_MIN_WIDTH, "normalized table min width mismatch");
  assert(normalized.height >= TABLE_MIN_HEIGHT, "normalized table min height mismatch");

  const bridged = buildTableElementFromRenderOperation({
    type: "render-table-block",
    sourceNodeType: "table",
    element: {
      id: "table-1",
      type: "table",
      title: "项目表",
      columns: 2,
      rows: 2,
      width: 420,
      height: 140,
      x: 0,
      y: 0,
      locked: false,
    },
    structure: {
      columns: 2,
      hasHeader: true,
      rows: [
        {
          rowIndex: 0,
          cells: [
            { rowIndex: 0, cellIndex: 0, plainText: "名称", html: "名称", header: true, align: "left", colSpan: 1, rowSpan: 1 },
            { rowIndex: 0, cellIndex: 1, plainText: "状态", html: "状态", header: true, align: "center", colSpan: 1, rowSpan: 1 },
          ],
        },
      ],
      parentType: "doc",
    },
    meta: {
      descriptorId: "descriptor-table-1",
      parserId: "markdown-parser",
    },
  });

  assert(bridged.type === "table", "bridged table type mismatch");
  assert(bridged.table.rows.length === 1, "bridged table row count mismatch");
  assert(bridged.structuredImport != null, "bridged table structuredImport missing");
  assert(bridged.structuredImport.canonicalFragment.type === "table", "bridged canonical fragment mismatch");

  console.log("[table-element] ok: 3 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[table-element] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
