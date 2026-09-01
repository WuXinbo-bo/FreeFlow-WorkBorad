const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:3000/canvas-office.html";
const STORAGE_KEY = "ai_worker_canvas_office_board_v3";

function createLargeTable(now) {
  const rows = Array.from({ length: 8 }, (_, rowIndex) => ({
    rowIndex,
    cells: Array.from({ length: 8 }, (_, columnIndex) => ({
      id: `snapshot-table-${rowIndex}-${columnIndex}`,
      plainText: rowIndex === 0 ? `Column ${columnIndex + 1}` : `R${rowIndex + 1} C${columnIndex + 1}`,
      html: rowIndex === 0
        ? `<p><strong>Column ${columnIndex + 1}</strong></p>`
        : `<p>R${rowIndex + 1} C${columnIndex + 1}</p>`,
      header: rowIndex === 0,
      colSpan: 1,
      rowSpan: 1,
    })),
  }));
  return {
    id: "snapshot-table",
    type: "table",
    x: 1000,
    y: 650,
    width: 960,
    height: 640,
    title: "Snapshot table",
    columns: 8,
    rows: 8,
    table: { title: "Snapshot table", columns: 8, rows, hasHeader: true },
    createdAt: now,
    updatedAt: now,
  };
}

function createBoard() {
  const now = Date.now();
  return {
    items: [
      {
        id: "snapshot-text",
        type: "text",
        x: 100,
        y: 100,
        width: 400,
        height: 100,
        plainText: "Exact snapshot preserves real rich text",
        text: "Exact snapshot preserves real rich text",
        html: "<p><strong>Exact snapshot</strong> preserves <em>real rich text</em></p>",
        fontSize: 30,
        color: "#0f172a",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "snapshot-math",
        type: "mathBlock",
        x: 600,
        y: 100,
        width: 320,
        height: 100,
        formula: "E = mc^2",
        fallbackText: "E = mc^2",
        displayMode: true,
        renderState: "ready",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "snapshot-code",
        type: "codeBlock",
        x: 100,
        y: 350,
        width: 420,
        height: 160,
        language: "javascript",
        plainText: "const stable = true;\nrender(stable);",
        text: "const stable = true;\nrender(stable);",
        fontSize: 18,
        wrap: false,
        showLineNumbers: true,
        headerVisible: true,
        createdAt: now,
        updatedAt: now,
      },
      createLargeTable(now),
    ],
    selectedIds: [],
    view: { scale: 0.2, offsetX: 260, offsetY: 180 },
    preferences: { allowLocalFileAccess: true, backgroundPattern: "none" },
  };
}

function assert(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}

async function collect(page) {
  return page.evaluate(() => {
    const entries = {};
    const boardItems = window.__canvas2dEngine.getSnapshot().board.items;
    const countLineBands = (node) => {
      if (!node) return 0;
      const rows = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!String(walker.currentNode.nodeValue || "").trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        Array.from(range.getClientRects()).forEach((rect) => rows.push(Math.round(rect.top * 2) / 2));
      }
      return new Set(rows).size;
    };
    ["snapshot-text", "snapshot-math", "snapshot-code"].forEach((id) => {
      const node = document.querySelector(`[data-id="${id}"][data-active-representation]`);
      const item = boardItems.find((entry) => entry.id === id) || null;
      entries[id] = {
        planned: node?.dataset.plannedRepresentation || "",
        active: node?.dataset.activeRepresentation || "",
        snapshotCount: node?.querySelectorAll(".canvas2d-presentation-snapshot").length || 0,
        text: node?.textContent || "",
        lineBands: countLineBands(node),
        modelWidth: Number(item?.width || 0),
        modelHeight: Number(item?.height || 0),
      };
    });
    return {
      entries,
      selectedIds: window.__canvas2dEngine.getSnapshot().board.selectedIds,
      quality: window.__ffPresentationQuality || null,
    };
  });
}

async function collectTable(page) {
  return page.evaluate(() => {
    const node = document.querySelector('.canvas2d-scene-table-item[data-id="snapshot-table"]');
    const cache = document.querySelector("#canvas-office-canvas")?.__ffRenderStats?.resourceCaches || {};
    return {
      selected: window.__canvas2dEngine.getSnapshot().board.selectedIds.includes("snapshot-table"),
      editingType: window.__canvas2dEngine.getSnapshot().editingType || "",
      planned: node?.dataset.plannedRepresentation || "",
      active: node?.dataset.activeRepresentation || "",
      snapshotCount: node?.querySelectorAll(".canvas2d-presentation-snapshot").length || 0,
      tableCount: node?.querySelectorAll(".canvas2d-scene-table").length || 0,
      cellCount: node?.querySelectorAll("th, td").length || 0,
      text: node?.textContent || "",
      display: node ? getComputedStyle(node).display : "missing",
      sameNode: node === window.__snapshotTableNode,
      snapshotCache: cache.presentationSnapshot || null,
      unifiedSnapshotPool: cache.unified?.pools?.["presentation-snapshot"] || null,
    };
  });
}

async function waitForTableRepresentation(page, representation) {
  await page.waitForFunction((target) => {
    const node = document.querySelector('.canvas2d-scene-table-item[data-id="snapshot-table"]');
    if (!node || node.dataset.activeRepresentation !== target) return false;
    return target === "exact-snapshot"
      ? node.querySelectorAll(".canvas2d-presentation-snapshot").length === 1 && !node.querySelector("table")
      : node.querySelectorAll("th, td").length === 64 && !node.querySelector(".canvas2d-presentation-snapshot");
  }, representation, { timeout: 15_000 });
}

async function waitForFrozenDetails(page) {
  await page.waitForFunction(() => {
    const ids = ["snapshot-text", "snapshot-math", "snapshot-code"];
    return ids.every((id) => {
      const node = document.querySelector(`[data-id="${id}"][data-active-representation]`);
      return (
        node?.dataset.activeRepresentation === "frozen-detail" &&
        !node.querySelector(".canvas2d-presentation-snapshot") &&
        String(node.textContent || "").trim()
      );
    });
  }, null, { timeout: 10_000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message || String(error)));
  try {
    await page.addInitScript(({ storageKey, board }) => {
      localStorage.setItem(storageKey, JSON.stringify(board));
    }, { storageKey: STORAGE_KEY, board: createBoard() });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__canvas2dEngine && document.querySelector("#canvas-office-canvas")));
    await page.addStyleTag({ content: `
      html, body, #canvas-office-root, .canvas-office-root, .canvas-office-shell, .canvas-office-main, .canvas-office-surface {
        min-height: 100vh !important;
        height: 100vh !important;
      }
      body { margin: 0 !important; }
    ` });
    await page.evaluate(() => window.__canvas2dEngine.resize({ immediate: true, reason: "frozen-detail-check" }));
    await waitForFrozenDetails(page);
    await waitForTableRepresentation(page, "exact-snapshot");
    await page.evaluate(() => {
      window.__snapshotTableNode = document.querySelector('.canvas2d-scene-table-item[data-id="snapshot-table"]');
      window.__canvas2dEngine.resize({ immediate: true, reason: "table-snapshot-budget-check" });
    });
    await page.waitForFunction(() => {
      const cache = document.querySelector("#canvas-office-canvas")?.__ffRenderStats?.resourceCaches || {};
      return cache.presentationSnapshot?.size >= 1 && cache.presentationSnapshot?.byteSize > 0;
    });
    const initial = await collect(page);
    const initialTable = await collectTable(page);
    await page.screenshot({ path: "tmp/presentation-snapshots.png", fullPage: false });
    Object.entries(initial.entries).forEach(([id, entry]) => {
      assert(entry.planned === "frozen-detail", `${id} was not planned as frozen detail`, initial);
      assert(entry.active === "frozen-detail", `${id} did not activate frozen detail`, initial);
      assert(entry.snapshotCount === 0, `${id} started a main-thread snapshot capture`, initial);
      assert(String(entry.text || "").trim(), `${id} frozen detail was blank`, initial);
    });
    assert(initial.entries["snapshot-code"].lineBands >= 2, "code frozen detail collapsed its lines", initial);
    assert(initialTable.planned === "exact-snapshot", "large table was not planned as an exact snapshot", initialTable);
    assert(initialTable.snapshotCount === 1 && initialTable.cellCount === 0, "large table retained live cell DOM", initialTable);
    assert(
      initialTable.snapshotCache?.size >= 1 &&
        initialTable.snapshotCache?.byteSize > 0 &&
        initialTable.snapshotCache?.byteSize <= initialTable.snapshotCache?.maxBytes,
      "large table snapshot escaped its cache budget",
      initialTable
    );
    assert(
      initialTable.unifiedSnapshotPool?.stats?.byteSize === initialTable.snapshotCache?.byteSize,
      "large table snapshot was not reported to the unified resource budget",
      initialTable
    );

    const expectedTextGeometry = await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      const board = engine.getSnapshotData();
      const item = board.items.find((entry) => entry.id === "snapshot-text");
      item.plainText = "Updated snapshot revision";
      item.text = "Updated snapshot revision";
      item.html = "<p><strong>Updated</strong> snapshot revision</p>";
      item.updatedAt = Date.now() + 1000;
      engine.loadStructuredBoardForExport(board);
      const loaded = engine.getSnapshot().board.items.find((entry) => entry.id === "snapshot-text");
      return { width: Number(loaded?.width || 0), height: Number(loaded?.height || 0) };
    });
    await page.evaluate(() => {
      window.__canvas2dEngine.resize({ immediate: true, reason: "frozen-detail-content-revision" });
    });
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-id="snapshot-text"][data-active-representation]');
      return (
        node?.dataset.activeRepresentation === "frozen-detail" &&
        String(node.textContent || "").includes("Updated snapshot revision")
      );
    });
    const revised = await collect(page);
    assert(revised.entries["snapshot-text"].text.includes("Updated snapshot revision"), "content revision was not visible", revised);
    assert(
      revised.entries["snapshot-text"].modelWidth === expectedTextGeometry.width &&
        revised.entries["snapshot-text"].modelHeight === expectedTextGeometry.height,
        "frozen detail preparation wrote transient layout back into the text model",
      { expectedTextGeometry, revised: revised.entries["snapshot-text"] }
    );

    const cycles = [];
    for (let index = 0; index < 3; index += 1) {
      const box = await page.locator('[data-id="snapshot-text"][data-active-representation]').boundingBox();
      assert(box, "frozen text node was not measurable", initial);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForFunction(() => {
        const node = document.querySelector('[data-id="snapshot-text"][data-active-representation]');
        return (
          window.__canvas2dEngine.getSnapshot().board.selectedIds.includes("snapshot-text") &&
          node?.dataset.activeRepresentation === "live-detail" &&
          !node.querySelector(".canvas2d-presentation-snapshot")
        );
      });
      const detail = await collect(page);
      assert(detail.entries["snapshot-text"].text.includes("Updated snapshot"), "detail recovery lost revised text content", detail);

      await page.mouse.move(1320, 860);
      await page.mouse.click(1320, 860);
      await waitForFrozenDetails(page);
      const recovered = await collect(page);
      assert(recovered.selectedIds.length === 0, "blank click did not release frozen-detail selection", recovered);
      assert(recovered.entries["snapshot-text"].text.includes("Updated snapshot revision"), "frozen recovery was blank", recovered);
      assert(
        recovered.entries["snapshot-text"].modelWidth === detail.entries["snapshot-text"].modelWidth &&
          recovered.entries["snapshot-text"].modelHeight === detail.entries["snapshot-text"].modelHeight,
        "frozen recovery changed the stable live-detail geometry",
        { detail: detail.entries["snapshot-text"], recovered: recovered.entries["snapshot-text"] }
      );
      assert(
        Number(recovered.quality?.pendingTransitions || 0) === 0 &&
          Number(recovered.quality?.nextEvaluationInMs || 0) === 0,
        "frozen recovery retained a pending presentation transition",
        recovered.quality
      );
      cycles.push({ detail: detail.entries["snapshot-text"], recovered: recovered.entries["snapshot-text"] });
    }

    const tableCycles = [];
    for (let index = 0; index < 3; index += 1) {
      const box = await page.locator('.canvas2d-scene-table-item[data-id="snapshot-table"]').boundingBox();
      assert(box, "snapshot table was not measurable", await collectTable(page));
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await waitForTableRepresentation(page, "live-detail");
      const live = await collectTable(page);
      assert(live.selected && live.cellCount === 64, "table selection did not restore live cells", live);
      assert(live.sameNode, "table selection replaced the scene node", live);

      await page.mouse.click(1320, 860);
      await waitForTableRepresentation(page, "exact-snapshot");
      const snapshot = await collectTable(page);
      assert(!snapshot.selected && snapshot.snapshotCount === 1, "table deselection did not restore its snapshot", snapshot);
      assert(snapshot.sameNode, "table snapshot recovery replaced the scene node", snapshot);
      tableCycles.push({ live, snapshot });
    }

    await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      const board = engine.getSnapshotData();
      const table = board.items.find((entry) => entry.id === "snapshot-table");
      table.table.rows[1].cells[1].plainText = "Updated snapshot cell";
      table.table.rows[1].cells[1].html = "<p><strong>Updated snapshot cell</strong></p>";
      table.updatedAt = Date.now() + 2000;
      engine.loadStructuredBoardForExport(board);
      engine.resize({ immediate: true, reason: "table-snapshot-content-revision" });
    });
    await waitForTableRepresentation(page, "exact-snapshot");
    const revisedTableBox = await page.locator('.canvas2d-scene-table-item[data-id="snapshot-table"]').boundingBox();
    await page.mouse.click(revisedTableBox.x + revisedTableBox.width / 2, revisedTableBox.y + revisedTableBox.height / 2);
    await waitForTableRepresentation(page, "live-detail");
    const revisedTableLive = await collectTable(page);
    assert(revisedTableLive.text.includes("Updated snapshot cell"), "table snapshot reused stale content", revisedTableLive);
    assert(revisedTableLive.sameNode, "table content revision replaced the scene node", revisedTableLive);
    await page.mouse.click(1320, 860);
    await waitForTableRepresentation(page, "exact-snapshot");

    const tableBox = await page.locator('.canvas2d-scene-table-item[data-id="snapshot-table"]').boundingBox();
    await page.mouse.dblclick(tableBox.x + tableBox.width / 2, tableBox.y + tableBox.height / 2);
    await page.waitForFunction(() => {
      const editor = document.querySelector("#canvas-table-editor");
      const node = document.querySelector('.canvas2d-scene-table-item[data-id="snapshot-table"]');
      return getComputedStyle(editor).display !== "none" && getComputedStyle(node).display === "none";
    });
    const editing = await collectTable(page);
    assert(editing.editingType === "table" && editing.display === "none", "table did not enter live edit mode", editing);
    await page.locator('#canvas-table-toolbar [data-action="table-done"]').click();
    await waitForTableRepresentation(page, "live-detail");
    const edited = await collectTable(page);
    assert(edited.selected && edited.cellCount === 64, "table edit exit did not recover live detail", edited);
    await page.mouse.click(1320, 860);
    await waitForTableRepresentation(page, "exact-snapshot");

    const beforeWheel = await collectTable(page);
    const canvas = page.locator("#canvas-office-canvas");
    const canvasBox = await canvas.boundingBox();
    await page.keyboard.down("Control");
    for (let index = 0; index < 12; index += 1) {
      await page.mouse.move(canvasBox.x + 700, canvasBox.y + 460);
      await page.mouse.wheel(0, index % 2 === 0 ? -3 : 3);
    }
    await page.keyboard.up("Control");
    const duringWheel = await collectTable(page);
    assert(duringWheel.sameNode, "continuous viewport interaction replaced the table node", duringWheel);
    assert(duringWheel.active === beforeWheel.active, "continuous viewport interaction changed table representation", {
      beforeWheel,
      duringWheel,
    });
    await page.waitForFunction(() => document.querySelector("#canvas2d-scene-root")?.dataset.presentationPhase === "steady");
    await waitForTableRepresentation(page, "exact-snapshot");
    const wheelRecovered = await collectTable(page);
    assert(wheelRecovered.sameNode && wheelRecovered.snapshotCount === 1, "table snapshot did not recover after viewport interaction", wheelRecovered);

    assert(errors.length === 0, "frozen presentation browser check produced page errors", errors);
    console.log(JSON.stringify({ ok: true, initial, initialTable, revised, cycles, tableCycles, revisedTableLive, edited, wheelRecovered }, null, 2));
  } catch (error) {
    let state = null;
    try {
      state = await collect(page);
    } catch {
      state = null;
    }
    console.error(JSON.stringify({ ok: false, error: error.message, details: error.details || null, errors, state }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
