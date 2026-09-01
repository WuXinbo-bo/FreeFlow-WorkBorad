"use strict";

const assert = require("assert");
const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:3000/canvas-office.html";

function createTable() {
  return {
    id: "advanced-table",
    type: "table",
    title: "Advanced table",
    x: 160,
    y: 160,
    width: 480,
    height: 240,
    columns: 2,
    rows: 2,
    table: {
      title: "Advanced table",
      columns: 2,
      hasHeader: false,
      rows: [
        { rowIndex: 0, cells: [{ plainText: "A" }, { plainText: "B" }] },
        { rowIndex: 1, cells: [{ plainText: "C" }, { plainText: "D" }] },
      ],
    },
  };
}

async function loadBoard(page, items, selectedIds) {
  await page.evaluate(({ items: nextItems, selectedIds: nextSelectedIds }) => {
    globalThis.__canvas2dEngine.loadStructuredBoardForExport({
      items: nextItems,
      selectedIds: nextSelectedIds,
      view: { scale: 1, offsetX: 0, offsetY: 0 },
    });
    globalThis.__canvas2dEngine.resize();
  }, { items, selectedIds });
  await page.waitForTimeout(100);
}

async function getItem(page, itemId) {
  return page.evaluate((id) => globalThis.__canvas2dEngine.getSnapshot().board.items.find((item) => item.id === id), itemId);
}

async function clickTableCell(page, rowIndex, columnIndex, shiftKey = false) {
  await page.evaluate(({ rowIndex: row, columnIndex: column, shiftKey: extend }) => {
    const cell = document.querySelector(
      `#canvas-table-editor [data-row-index="${row}"][data-column-index="${column}"]`
    );
    cell.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      pointerId: 71,
      pointerType: "mouse",
      shiftKey: extend,
    }));
    cell.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 0,
      pointerId: 71,
      pointerType: "mouse",
      shiftKey: extend,
    }));
    cell.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: extend }));
  }, { rowIndex, columnIndex, shiftKey });
}

async function dispatchFlowDrag(page, start, end, pointerId) {
  await page.evaluate(({ start: from, end: to, pointerId: id }) => {
    const canvas = document.querySelector("#canvas-office-canvas");
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};
    const rect = canvas.getBoundingClientRect();
    const dispatch = (type, point, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons,
      pointerId: id,
      pointerType: "mouse",
      clientX: rect.left + point.x,
      clientY: rect.top + point.y,
    }));
    dispatch("pointerdown", from, 1);
    dispatch("pointermove", to, 1);
    dispatch("pointerup", to, 0);
  }, { start, end, pointerId });
  await page.waitForTimeout(50);
}

async function checkMathEditing(page) {
  const math = {
    id: "advanced-math",
    type: "mathBlock",
    formula: "x^2",
    displayMode: true,
    x: 180,
    y: 140,
    width: 420,
    height: 100,
    structuredImport: {
      sourceNodeType: "mathBlock",
      canonicalFragment: {
        type: "mathBlock",
        attrs: { sourceFormat: "latex", displayMode: true, renderState: "ready" },
        text: "x^2",
      },
    },
  };
  await loadBoard(page, [math], [math.id]);
  assert.strictEqual(await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("element.edit")), true);
  const editor = page.locator("#canvas-text-editor.is-math:not(.is-hidden)");
  await editor.waitFor();
  assert.strictEqual(await editor.inputValue(), "x^2");
  await editor.fill("\\frac{a}{b}");
  await editor.press("Control+Enter");
  const committed = await getItem(page, math.id);
  assert.strictEqual(committed.type, "text");
  assert.strictEqual(committed.plainText, "\\frac{a}{b}");
  assert.strictEqual(committed.text, "\\frac{a}{b}");
  assert(committed.html.includes('data-role="math-block"'));
  assert.strictEqual(committed.structuredImport.canonicalFragment.text, "\\frac{a}{b}");
  assert.strictEqual(committed.structuredImport.canonicalFragment.attrs.displayMode, true);

  await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
  assert.strictEqual((await getItem(page, math.id)).plainText, "x^2");
  await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.redo"));
  assert.strictEqual((await getItem(page, math.id)).plainText, "\\frac{a}{b}");

  await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("element.edit"));
  await editor.fill("cancelled");
  await editor.press("Escape");
  assert.strictEqual((await getItem(page, math.id)).plainText, "\\frac{a}{b}");

  const locked = { ...(await getItem(page, math.id)), locked: true };
  await loadBoard(page, [locked], [locked.id]);
  assert.strictEqual(Boolean(await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("element.edit"))), false);
  assert.strictEqual(await editor.count(), 0);
}

async function checkTableSpans(page) {
  const table = createTable();
  await loadBoard(page, [table], [table.id]);
  assert.strictEqual(await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("element.edit")), true);
  await clickTableCell(page, 0, 0);
  await clickTableCell(page, 1, 1, true);
  assert.strictEqual(await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("table.merge-cells")), true);
  const mergedCell = page.locator('#canvas-table-editor [data-row-index="0"][data-column-index="0"]');
  await mergedCell.waitFor();
  assert.strictEqual(await mergedCell.getAttribute("rowspan"), "2");
  assert.strictEqual(await mergedCell.getAttribute("colspan"), "2");
  assert.strictEqual(await page.locator("#canvas-table-editor td, #canvas-table-editor th").count(), 1);
  await page.evaluate(() => document.querySelector('#canvas-table-toolbar [data-action="table-done"]').click());
  let committed = await getItem(page, table.id);
  assert.strictEqual(committed.table.rows[0].cells[0].rowSpan, 2);
  assert.strictEqual(committed.table.rows[0].cells[0].colSpan, 2);
  assert.strictEqual(committed.table.rows[1].cells.length, 0);

  await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
  committed = await getItem(page, table.id);
  assert.strictEqual(committed.table.rows[0].cells.length, 2);
  await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.redo"));
  assert.strictEqual((await getItem(page, table.id)).table.rows[0].cells[0].colSpan, 2);

  await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("element.edit"));
  assert.strictEqual(await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("table.split-cell")), true);
  assert.strictEqual(await page.locator("#canvas-table-editor td, #canvas-table-editor th").count(), 4);
  await page.evaluate(() => document.querySelector('#canvas-table-toolbar [data-action="table-done"]').click());
  committed = await getItem(page, table.id);
  assert(committed.table.rows.every((row) => row.cells.every((cell) => cell.rowSpan === 1 && cell.colSpan === 1)));
  await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
  assert.strictEqual((await getItem(page, table.id)).table.rows[0].cells[0].colSpan, 2);

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("element.edit"));
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("table.split-cell"));
    await page.evaluate(() => {
      const cell = document.querySelector("#canvas-table-editor [data-row-index][data-column-index]");
      cell.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
    });
    assert.strictEqual((await getItem(page, table.id)).table.rows[0].cells[0].colSpan, 2);
  }
}

async function checkFlowReconnect(page) {
  const nodes = [
    { id: "flow-a", type: "flowNode", x: 180, y: 180, width: 160, height: 100, plainText: "A" },
    { id: "flow-b", type: "flowNode", x: 580, y: 180, width: 160, height: 100, plainText: "B" },
    { id: "flow-c", type: "flowNode", x: 580, y: 420, width: 160, height: 100, plainText: "C" },
  ];
  const edge = {
    id: "flow-edge",
    type: "flowEdge",
    fromId: "flow-a",
    fromSide: "right",
    toId: "flow-b",
    toSide: "left",
    style: "arrow",
    arrowDirection: "forward",
  };
  await loadBoard(page, [edge, ...nodes], [edge.id]);
  assert.deepStrictEqual(
    await page.evaluate(() => globalThis.__canvas2dEngine.getSnapshot().board.selectedIds),
    [edge.id]
  );
  await page.waitForFunction(() => document.querySelectorAll('.canvas2d-scene-flow-edge-endpoint[style*="block"]').length === 2);
  await dispatchFlowDrag(page, { x: 580, y: 230 }, { x: 580, y: 470 }, 31);
  let current = await getItem(page, edge.id);
  const reconnectDiagnostic = await page.evaluate(() => ({
    view: globalThis.__canvas2dEngine.getSnapshot().board.view,
    items: globalThis.__canvas2dEngine.getSnapshot().board.items,
    canvasRect: document.querySelector("#canvas-office-canvas").getBoundingClientRect().toJSON(),
    endpoints: Array.from(document.querySelectorAll(".canvas2d-scene-flow-edge-endpoint")).map((node) => ({
      className: node.getAttribute("class"),
      cx: node.getAttribute("cx"),
      cy: node.getAttribute("cy"),
      display: node.style.display,
    })),
  }));
  assert.strictEqual(current.toId, "flow-c", JSON.stringify(reconnectDiagnostic));
  assert.strictEqual(current.toSide, "left");
  await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
  assert.strictEqual((await getItem(page, edge.id)).toId, "flow-b");

  await dispatchFlowDrag(page, { x: 580, y: 230 }, { x: 900, y: 700 }, 32);
  assert.strictEqual((await getItem(page, edge.id)).toId, "flow-b");

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await dispatchFlowDrag(page, { x: 580, y: 230 }, { x: 580, y: 470 }, 40 + cycle);
    assert.strictEqual((await getItem(page, edge.id)).toId, "flow-c");
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
    assert.strictEqual((await getItem(page, edge.id)).toId, "flow-b");
  }

  await loadBoard(page, [{ ...edge, locked: true }, ...nodes], [edge.id]);
  await dispatchFlowDrag(page, { x: 580, y: 230 }, { x: 580, y: 470 }, 51);
  current = await getItem(page, edge.id);
  assert.strictEqual(current.toId, "flow-b");
  assert.strictEqual(current.locked, true);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message || String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(globalThis.__canvas2dEngine?.runCommand));
    await checkMathEditing(page);
    await checkTableSpans(page);
    await checkFlowReconnect(page);
    assert.deepStrictEqual(pageErrors, []);
    console.log("[check-canvas-advanced-element-interactions] ok");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[check-canvas-advanced-element-interactions] ${error.stack || error.message}`);
  process.exitCode = 1;
});
