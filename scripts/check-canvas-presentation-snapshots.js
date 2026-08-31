const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:3000/canvas-office.html";
const STORAGE_KEY = "ai_worker_canvas_office_board_v3";

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
    const initial = await collect(page);
    await page.screenshot({ path: "tmp/presentation-snapshots.png", fullPage: false });
    Object.entries(initial.entries).forEach(([id, entry]) => {
      assert(entry.planned === "frozen-detail", `${id} was not planned as frozen detail`, initial);
      assert(entry.active === "frozen-detail", `${id} did not activate frozen detail`, initial);
      assert(entry.snapshotCount === 0, `${id} started a main-thread snapshot capture`, initial);
      assert(String(entry.text || "").trim(), `${id} frozen detail was blank`, initial);
    });
    assert(initial.entries["snapshot-code"].lineBands >= 2, "code frozen detail collapsed its lines", initial);

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

    assert(errors.length === 0, "frozen presentation browser check produced page errors", errors);
    console.log(JSON.stringify({ ok: true, initial, revised, cycles }, null, 2));
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
