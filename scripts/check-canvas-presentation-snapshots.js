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
    ["snapshot-text", "snapshot-math", "snapshot-code"].forEach((id) => {
      const node = document.querySelector(`[data-id="${id}"][data-active-representation]`);
      const image = node?.querySelector(".canvas2d-presentation-snapshot") || null;
      let paintedPixels = 0;
      if (image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 16) paintedPixels += 1;
        }
      }
      entries[id] = {
        planned: node?.dataset.plannedRepresentation || "",
        active: node?.dataset.activeRepresentation || "",
        status: node?.dataset.presentationSnapshotStatus || "",
        signature: node?.dataset.presentationSnapshotSignature || "",
        snapshotCount: node?.querySelectorAll(".canvas2d-presentation-snapshot").length || 0,
        naturalWidth: image?.naturalWidth || 0,
        naturalHeight: image?.naturalHeight || 0,
        paintedPixels,
        text: node?.textContent || "",
      };
    });
    return {
      entries,
      selectedIds: window.__canvas2dEngine.getSnapshot().board.selectedIds,
      quality: window.__ffPresentationQuality || null,
    };
  });
}

async function waitForSnapshots(page) {
  await page.waitForFunction(() => {
    const ids = ["snapshot-text", "snapshot-math", "snapshot-code"];
    return ids.every((id) => {
      const node = document.querySelector(`[data-id="${id}"][data-active-representation]`);
      const image = node?.querySelector(".canvas2d-presentation-snapshot");
      return node?.dataset.activeRepresentation === "exact-snapshot" && image?.complete && image.naturalWidth > 0;
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
    await page.evaluate(() => window.__canvas2dEngine.resize({ immediate: true, reason: "snapshot-check" }));
    await waitForSnapshots(page);
    const initial = await collect(page);
    await page.screenshot({ path: "tmp/presentation-snapshots.png", fullPage: false });
    Object.entries(initial.entries).forEach(([id, entry]) => {
      assert(entry.planned === "exact-snapshot", `${id} was not planned as an exact snapshot`, initial);
      assert(entry.active === "exact-snapshot", `${id} did not commit its exact snapshot`, initial);
      assert(entry.snapshotCount === 1, `${id} did not own exactly one snapshot`, initial);
      assert(entry.paintedPixels > 0, `${id} snapshot was blank`, initial);
    });

    const initialTextSignature = initial.entries["snapshot-text"].signature;
    await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      const board = engine.getSnapshotData();
      const item = board.items.find((entry) => entry.id === "snapshot-text");
      item.plainText = "Updated snapshot revision";
      item.text = "Updated snapshot revision";
      item.html = "<p><strong>Updated</strong> snapshot revision</p>";
      item.updatedAt = Date.now() + 1000;
      engine.loadStructuredBoardForExport(board);
      engine.resize({ immediate: true, reason: "snapshot-content-revision" });
    });
    await page.waitForFunction((previousSignature) => {
      const node = document.querySelector('[data-id="snapshot-text"][data-active-representation]');
      return (
        node?.dataset.activeRepresentation === "exact-snapshot" &&
        node.dataset.presentationSnapshotSignature &&
        node.dataset.presentationSnapshotSignature !== previousSignature
      );
    }, initialTextSignature);
    const revised = await collect(page);
    assert(
      revised.entries["snapshot-text"].paintedPixels > 0,
      "content revision produced a blank replacement snapshot",
      revised
    );

    const cycles = [];
    for (let index = 0; index < 3; index += 1) {
      const box = await page.locator('[data-id="snapshot-text"][data-active-representation]').boundingBox();
      assert(box, "snapshot text node was not measurable", initial);
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
      await waitForSnapshots(page);
      const recovered = await collect(page);
      assert(recovered.selectedIds.length === 0, "blank click did not release snapshot selection", recovered);
      assert(recovered.entries["snapshot-text"].paintedPixels > 0, "snapshot recovery produced a blank image", recovered);
      cycles.push({ detail: detail.entries["snapshot-text"], recovered: recovered.entries["snapshot-text"] });
    }

    assert(errors.length === 0, "presentation snapshot browser check produced page errors", errors);
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
