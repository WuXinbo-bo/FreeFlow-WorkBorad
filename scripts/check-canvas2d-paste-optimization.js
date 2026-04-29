const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:3000/canvas-office.html";
const STORAGE_KEY = "ai_worker_canvas_office_board_v3";

function createTextItem(id, x, y, text) {
  return {
    id,
    type: "text",
    x,
    y,
    width: 180,
    height: 60,
    text,
    plainText: text,
    html: text,
    fontSize: 20,
    color: "#0f172a",
    wrapMode: "manual",
    textBoxLayoutMode: "auto-width",
    textResizeMode: "auto-width",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createBoard(items = [], selectedIds = [], view = { scale: 1, offsetX: 0, offsetY: 0 }) {
  return {
    items,
    selectedIds,
    view,
    preferences: {
      allowLocalFileAccess: true,
      backgroundPattern: "none",
    },
  };
}

function createLargeBoard(count = 4000) {
  const items = [];
  for (let index = 0; index < count; index += 1) {
    const col = index % 40;
    const row = Math.floor(index / 40);
    items.push(createTextItem(`text-${index}`, 80 + col * 220, 80 + row * 120, `Item ${index + 1}`));
  }
  return items;
}

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

async function waitForStableCanvas(page) {
  await page.waitForFunction(() => Boolean(window.__canvas2dEngine && document.querySelector("canvas")));
  await page.addStyleTag({
    content: `
      html, body, #canvas-office-root, .canvas-office-root, .canvas-office-shell, .canvas-office-main, .canvas-office-surface {
        min-height: 100vh !important;
        height: 100vh !important;
      }
      body {
        margin: 0 !important;
      }
    `,
  });
  await page.evaluate(() => {
    window.__canvas2dEngine?.resize?.();
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    return Boolean(canvas && canvas.clientWidth > 400 && canvas.clientHeight > 200);
  });
  await page.waitForTimeout(120);
}

async function createPage(browser, { board } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message || String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") {
      pageErrors.push(message.text());
    }
  });
  if (board) {
    await page.addInitScript(
      ({ storageKey, payload }) => {
        localStorage.setItem(storageKey, JSON.stringify(payload));
      },
      { storageKey: STORAGE_KEY, payload: board }
    );
  }
  await page.addInitScript(() => {
    globalThis.__TEST_CLIPBOARD_TEXT = "";
    globalThis.desktopShell = {
      getStartupContext: async () => ({ ok: true, startup: {}, cached: {}, remote: {} }),
      readClipboardText: async () => ({ text: String(globalThis.__TEST_CLIPBOARD_TEXT || "") }),
      readClipboardFiles: async () => ({ ok: true, paths: [] }),
      pathExists: async () => false,
      findPathByFileId: async () => ({ ok: false, path: "" }),
      getFileId: async () => ({ ok: false, fileId: "" }),
      fetchUrlMeta: async () => ({ ok: false }),
      readFileBase64: async () => ({ ok: false, data: "", mime: "" }),
      pickImageSavePath: async () => ({ canceled: true, filePath: "" }),
      pickTextSavePath: async () => ({ canceled: true, filePath: "" }),
      pickPdfSavePath: async () => ({ canceled: true, filePath: "" }),
      writeFile: async () => ({ ok: false, error: "stub" }),
      revealPath: async () => ({ ok: true }),
      openPath: async () => ({ ok: true }),
      startExportDrag: async () => ({ ok: true }),
      getShortcutSettings: async () => ({ ok: true, settings: {} }),
      setShortcutSettings: async () => ({ ok: true, settings: {} }),
      setWindowShape: async () => ({ ok: true }),
      setClickThrough: async () => ({ clickThrough: false }),
      toggleClickThrough: async () => ({ clickThrough: false }),
      togglePin: async () => ({ pinned: false }),
      setPinned: async () => ({ pinned: false }),
      toggleFullscreen: async () => ({ fullscreen: false }),
      reload: async () => ({ ok: true }),
    };
    globalThis.__FREEFLOW_STARTUP_CONTEXT = { ok: true, startup: {}, cached: {}, remote: {} };
  });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForStableCanvas(page);
  return {
    page,
    getErrors() {
      return pageErrors.slice();
    },
  };
}

async function dispatchCanvasPaste(page, text) {
  await page.evaluate((textValue) => {
    globalThis.__TEST_CLIPBOARD_TEXT = String(textValue || "");
  }, text);
  const canvasRect = await page.locator("canvas").boundingBox();
  await page.mouse.move(canvasRect.x + canvasRect.width / 2, canvasRect.y + canvasRect.height / 2);
  return page.evaluate(async () => {
    const startedAt = performance.now();
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("canvas not found");
    }
    canvas.focus();
    const dataTransfer = {
      types: ["text/plain"],
      files: [],
      getData(type) {
        return type === "text/plain" || type === "text" ? String(globalThis.__TEST_CLIPBOARD_TEXT || "") : "";
      },
    };
    const event = new Event("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "clipboardData", {
      value: dataTransfer,
      configurable: true,
    });
    canvas.dispatchEvent(event);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return Math.round((performance.now() - startedAt) * 100) / 100;
  });
}

async function runSemanticPasteChecks(browser) {
  const cases = [
    {
      key: "plainText",
      text: "hello canvas",
      verify: (items) => {
        const item = items.find((entry) => entry.plainText === "hello canvas");
        assert(Boolean(item), "plain text paste did not produce text item", items);
        assert(item.type === "text", "plain text paste produced wrong item type", item);
      },
    },
    {
      key: "multilineText",
      text: "hello\\ncanvas\\nworld",
      verify: (items) => {
        const item = items.find((entry) => entry.type === "text" && /hello/.test(String(entry.plainText || "")));
        assert(Boolean(item), "multiline paste did not produce text item", items);
        assert(String(item.text || "").includes("canvas"), "multiline paste lost content", item);
      },
    },
  ];

  const results = {};
  for (const scenario of cases) {
    const session = await createPage(browser, { board: createBoard([]) });
    try {
      const durationMs = await dispatchCanvasPaste(session.page, scenario.text);
      await session.page.waitForTimeout(220);
      const snapshotItems = await session.page.evaluate(() => window.__canvas2dEngine?.getSnapshot?.()?.board?.items || []);
      scenario.verify(snapshotItems);
      assert(session.getErrors().length === 0, `paste scenario ${scenario.key} produced page errors`, session.getErrors());
      results[scenario.key] = {
        durationMs,
        itemCount: snapshotItems.length,
        types: snapshotItems.map((item) => item.type),
      };
    } finally {
      await session.page.close();
    }
  }
  return results;
}

async function runLargeBoardResponsivenessCheck(browser) {
  const session = await createPage(browser, {
    board: createBoard([]),
  });
  try {
    for (let index = 0; index < 120; index += 1) {
      await dispatchCanvasPaste(session.page, `Seed item ${index + 1}`);
    }
    await session.page.waitForTimeout(240);
    const pasteDurationMs = await dispatchCanvasPaste(session.page, "final responsiveness probe");
    const canvasRect = await session.page.locator("canvas").boundingBox();
    const centerX = canvasRect.x + canvasRect.width / 2;
    const centerY = canvasRect.y + canvasRect.height / 2;
    const beforeView = await session.page.evaluate(() => window.__canvas2dEngine?.getSnapshot?.()?.board?.view || null);
    await session.page.mouse.move(centerX, centerY);
    await session.page.mouse.down({ button: "middle" });
    await session.page.mouse.move(centerX + 96, centerY + 64, { steps: 3 });
    await session.page.waitForTimeout(80);
    await session.page.mouse.up({ button: "middle" });
    await session.page.waitForTimeout(120);
    const snapshot = await session.page.evaluate(() => window.__canvas2dEngine?.getSnapshot?.() || null);
    const afterView = snapshot?.board?.view || null;
    const result = {
      pasteDurationMs,
      boardItemCount: snapshot?.board?.items?.length || 0,
      viewChanged:
        Boolean(beforeView && afterView) &&
        (Number(beforeView.offsetX || 0) !== Number(afterView.offsetX || 0) ||
          Number(beforeView.offsetY || 0) !== Number(afterView.offsetY || 0)),
      pageErrors: session.getErrors(),
    };
    assert(result.boardItemCount >= 121, "accumulated board paste did not append probe item", result);
    assert(result.viewChanged === true, "board was not responsive to pan after repeated paste operations", result);
    assert(result.pageErrors.length === 0, "large board check produced page errors", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const report = {
    ok: true,
    baseUrl: BASE_URL,
    checks: {},
  };
  try {
    report.checks.semanticPaste = await runSemanticPasteChecks(browser);
    report.checks.largeBoardResponsiveness = await runLargeBoardResponsivenessCheck(browser);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          baseUrl: BASE_URL,
          checks: report.checks,
          error: error.message || String(error),
          details: error.details || null,
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
