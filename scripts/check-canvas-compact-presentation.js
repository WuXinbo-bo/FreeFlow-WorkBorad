const { chromium } = require("playwright");
const sharp = require("sharp");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:3000/canvas-office.html";
const STORAGE_KEY = "ai_worker_canvas_office_board_v3";

function now() {
  return Date.now();
}

function createBoard() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#dbeafe"/><path d="M40 430 260 130l170 190 130-140 200 250Z" fill="#2563eb"/><circle cx="650" cy="105" r="58" fill="#f59e0b"/></svg>';
  return {
    items: [
      { id: "compact-text", type: "text", x: 100, y: 100, width: 900, height: 300, text: "真实文字缩略 Semantic text", plainText: "真实文字缩略 Semantic text", html: "<p>真实文字缩略 <strong>Semantic text</strong></p>", fontSize: 64, color: "#0f172a", createdAt: now(), updatedAt: now() },
      { id: "compact-image", type: "image", x: 1200, y: 100, width: 800, height: 500, dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, naturalWidth: 800, naturalHeight: 500, brightness: 0, contrast: 0, annotations: { lines: [], texts: [], rects: [], arrows: [] }, createdAt: now(), updatedAt: now() },
      { id: "compact-table", type: "table", x: 2200, y: 100, width: 1000, height: 500, table: { columns: 3, hasHeader: true, rows: [
        { cells: [{ plainText: "Name", header: true }, { plainText: "State", header: true }, { plainText: "Owner", header: true }] },
        { cells: [{ plainText: "Parser", header: false }, { plainText: "Done", header: false }, { plainText: "A", header: false }] },
        { cells: [{ plainText: "Renderer", header: false }, { plainText: "Doing", header: false }, { plainText: "B", header: false }] },
      ] }, createdAt: now(), updatedAt: now() },
      { id: "compact-code", type: "codeBlock", x: 100, y: 800, width: 1000, height: 500, language: "javascript", plainText: "const semantic = true;\nrender(semantic);", text: "const semantic = true;\nrender(semantic);", fontSize: 48, createdAt: now(), updatedAt: now() },
      { id: "compact-math", type: "mathBlock", x: 1300, y: 800, width: 800, height: 300, formula: "E = mc^2", fallbackText: "E = mc^2", displayMode: true, renderState: "ready", createdAt: now(), updatedAt: now() },
      { id: "compact-file", type: "fileCard", x: 2300, y: 800, width: 800, height: 400, name: "architecture.pdf", fileName: "architecture.pdf", ext: "PDF", accentSoftColor: "rgba(254, 226, 226, 0.96)", accentStrokeColor: "rgba(239, 68, 68, 0.72)", accentTextColor: "#b91c1c", createdAt: now(), updatedAt: now() },
      { id: "compact-flow", type: "flowNode", x: 100, y: 1500, width: 900, height: 400, text: "真实流程节点", plainText: "真实流程节点", html: "<p>真实流程节点</p>", fontSize: 56, createdAt: now(), updatedAt: now() },
      { id: "compact-shape", type: "shape", shapeType: "rect", x: 1300, y: 1500, width: 800, height: 400, startX: 1300, startY: 1500, endX: 2100, endY: 1900, strokeColor: "#166534", fillColor: "rgba(34, 197, 94, 0.42)", strokeWidth: 8, radius: 24, createdAt: now(), updatedAt: now() },
    ],
    selectedIds: [],
    view: { scale: 0.1, offsetX: 420, offsetY: 120 },
    preferences: { allowLocalFileAccess: true, backgroundPattern: "none" },
  };
}

function assert(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}

async function waitFrames(page, count = 2) {
  await page.evaluate(async (frameCount) => {
    for (let index = 0; index < frameCount; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

async function collectState(page) {
  return page.evaluate(() => {
    const engine = window.__canvas2dEngine;
    const snapshot = engine.getSnapshot();
    const canvas = document.querySelector("#canvas-office-canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const view = snapshot.board.view;
    const canvasRect = canvas.getBoundingClientRect();
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const sample = (item) => {
      const left = Math.max(0, Math.floor((item.x * view.scale + view.offsetX) * dpr));
      const top = Math.max(0, Math.floor((item.y * view.scale + view.offsetY) * dpr));
      const width = Math.max(1, Math.min(canvas.width - left, Math.ceil(item.width * view.scale * dpr)));
      const height = Math.max(1, Math.min(canvas.height - top, Math.ceil(item.height * view.scale * dpr)));
      const pixels = ctx.getImageData(left, top, width, height).data;
      let dark = 0;
      let saturated = 0;
      let neutralMid = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max < 170) dark += 1;
        if (max - min > 45 && max > 100) saturated += 1;
        if (max - min < 12 && max >= 105 && max <= 235) neutralMid += 1;
      }
      const total = Math.max(1, pixels.length / 4);
      return { dark, saturated, neutralMid, total, neutralMidRatio: neutralMid / total, width, height };
    };
    const samples = Object.fromEntries(snapshot.board.items.map((item) => [item.id, sample(item)]));
    const hostHidden = (selector) => {
      const node = document.querySelector(selector);
      return !node || getComputedStyle(node).visibility === "hidden" || getComputedStyle(node).display === "none";
    };
    return {
      view,
      samples,
      compositeBounds: Object.fromEntries(snapshot.board.items.map((item) => [item.id, {
        left: canvasRect.left + item.x * view.scale + view.offsetX,
        top: canvasRect.top + item.y * view.scale + view.offsetY,
        width: item.width * view.scale,
        height: item.height * view.scale,
      }])),
      stats: canvas.__ffRenderStats || null,
      overlaysHidden: ["#canvas2d-rich-display", "#canvas2d-math-display", "#canvas2d-code-block-display"].every(hostHidden),
      legacySkeletonCount: document.querySelectorAll(".canvas2d-rich-skeleton, .canvas2d-rich-skeleton-svg").length,
      detailNodeCount: document.querySelectorAll(".canvas2d-rich-item, .canvas2d-math-item, .canvas2d-code-block-item").length,
    };
  });
}

async function collectCompositeSamples(page, state) {
  const screenshot = await page.screenshot({ fullPage: false });
  const { data, info } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const samples = {};
  Object.entries(state.compositeBounds || {}).forEach(([id, bounds]) => {
    const left = Math.max(0, Math.floor(Number(bounds.left) || 0));
    const top = Math.max(0, Math.floor(Number(bounds.top) || 0));
    const right = Math.min(info.width, Math.ceil(left + Math.max(1, Number(bounds.width) || 1)));
    const bottom = Math.min(info.height, Math.ceil(top + Math.max(1, Number(bounds.height) || 1)));
    let dark = 0;
    let saturated = 0;
    let neutralMid = 0;
    let total = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max < 170) dark += 1;
        if (max - min > 45 && max > 100) saturated += 1;
        if (max - min < 12 && max >= 105 && max <= 235) neutralMid += 1;
        total += 1;
      }
    }
    samples[id] = {
      dark,
      saturated,
      neutralMid,
      total,
      neutralMidRatio: neutralMid / Math.max(1, total),
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  });
  return samples;
}

async function moveAcrossThreshold(page, direction) {
  await page.evaluate(async (nextDirection) => {
    const engine = window.__canvas2dEngine;
    const target = nextDirection === "up" ? 0.18 : 0.14;
    for (let index = 0; index < 12; index += 1) {
      const scale = engine.getSnapshot().board.view.scale;
      if ((nextDirection === "up" && scale >= target) || (nextDirection === "down" && scale <= target)) break;
      if (nextDirection === "up") engine.zoomIn();
      else engine.zoomOut();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
  }, direction);
  await page.waitForTimeout(240);
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
    await page.evaluate(() => window.__canvas2dEngine.resize({ immediate: true, reason: "compact-presentation-check" }));
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#canvas-office-canvas");
      return canvas?.clientWidth > 1000 && canvas?.clientHeight > 700;
    });
    await waitFrames(page, 4);
    await page.waitForTimeout(300);

    const compact = await collectState(page);
    compact.compositeSamples = await collectCompositeSamples(page, compact);
    await page.screenshot({ path: "tmp/compact-presentation-10.png", fullPage: false });
    assert(compact.overlaysHidden, "10% did not hide detail overlays", compact);
    assert(compact.legacySkeletonCount === 0, "10% retained a legacy DOM skeleton", compact);
    assert(compact.stats?.lodSimplifiedCount >= 7, "10% did not route semantic elements through compact painters", compact.stats);
    assert(compact.stats?.compactPresentation?.registeredTypes?.includes("image"), "image compact painter was not registered", compact.stats);
    assert(compact.compositeSamples["compact-text"].dark > 0, "text compact lost real glyph pixels", compact.compositeSamples);
    assert(compact.compositeSamples["compact-code"].dark > 0, "code compact lost real source pixels", compact.compositeSamples);
    assert(compact.compositeSamples["compact-table"].dark > 0, "table compact lost real cell content", compact);
    assert(compact.compositeSamples["compact-math"].dark > 0, "math compact lost real formula pixels", compact.compositeSamples);
    assert(compact.compositeSamples["compact-image"].saturated > 50, "image compact did not render real image pixels", compact);
    assert(compact.compositeSamples["compact-file"].saturated > 0, "file compact lost its semantic accent", compact.compositeSamples);
    assert(compact.compositeSamples["compact-flow"].dark > 0, "flow compact lost real node text", compact.compositeSamples);
    assert(compact.compositeSamples["compact-text"].neutralMidRatio < 0.18, "text compact still resembles the generic gray skeleton", compact.compositeSamples["compact-text"]);

    const cycles = [];
    for (let index = 0; index < 3; index += 1) {
      await moveAcrossThreshold(page, "up");
      const detail = await collectState(page);
      assert(detail.view.scale >= 0.17, "detail recovery did not cross the exit threshold", detail.view);
      assert(!detail.overlaysHidden && detail.detailNodeCount > 0, "detail overlays did not recover", detail);
      assert(detail.legacySkeletonCount === 0, "detail recovery restored a legacy skeleton", detail);
      await moveAcrossThreshold(page, "down");
      const compactAgain = await collectState(page);
      compactAgain.compositeSamples = await collectCompositeSamples(page, compactAgain);
      assert(compactAgain.view.scale <= 0.15, "compact re-entry did not cross the enter threshold", compactAgain.view);
      assert(compactAgain.overlaysHidden, "compact re-entry left detail overlays visible", compactAgain);
      assert(compactAgain.compositeSamples["compact-image"].saturated > 50, "image became stale after threshold re-entry", compactAgain.compositeSamples);
      cycles.push({ detailScale: detail.view.scale, compactScale: compactAgain.view.scale });
    }

    assert(errors.length === 0, "compact presentation browser check produced page errors", errors);
    console.log(JSON.stringify({ ok: true, compact, cycles }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message, details: error.details || null, errors }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
