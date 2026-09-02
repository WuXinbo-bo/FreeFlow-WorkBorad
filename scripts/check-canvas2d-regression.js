const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:3000/canvas-office.html";
const STORAGE_KEY = "ai_worker_canvas_office_board_v3";
const MAIN_CANVAS_SELECTOR = "#canvas-office-canvas";

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

function createCodeBlockItem(id, x, y, code, language = "javascript") {
  return {
    id,
    type: "codeBlock",
    title: `${language} code`,
    language,
    code,
    text: code,
    plainText: code,
    fontSize: 16,
    x,
    y,
    width: 320,
    height: 140,
    wrap: false,
    showLineNumbers: true,
    headerVisible: true,
    collapsed: false,
    autoHeight: true,
    tabSize: 2,
    previewMode: "source",
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createMathBlockItem(id, x, y, formula) {
  return {
    id,
    type: "mathBlock",
    title: "math block",
    formula,
    fallbackText: `$$${formula}$$`,
    sourceFormat: "latex",
    displayMode: true,
    renderState: "ready",
    x,
    y,
    width: 260,
    height: 88,
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createFileCardItem(id, x, y, name = "项目文件夹") {
  return {
    id,
    type: "fileCard",
    name,
    fileName: name,
    title: name,
    ext: "",
    mime: "inode/directory",
    sourcePath: "",
    fileId: "",
    size: 0,
    sizeLabel: "",
    x,
    y,
    width: 320,
    height: 120,
    marked: false,
    memo: "",
    memoVisible: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createTableItem(id, x, y) {
  return {
    id,
    type: "table",
    title: "表格",
    x,
    y,
    width: 520,
    height: 216,
    columns: 4,
    rows: 4,
    locked: false,
    createdAt: Date.now(),
    table: {
      title: "表格",
      columns: 4,
      hasHeader: true,
      rows: [
        {
          rowIndex: 0,
          cells: [
            { rowIndex: 0, cellIndex: 0, plainText: "Name", header: true, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 0, cellIndex: 1, plainText: "Status", header: true, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 0, cellIndex: 2, plainText: "Owner", header: true, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 0, cellIndex: 3, plainText: "ETA", header: true, align: "", colSpan: 1, rowSpan: 1 },
          ],
        },
        {
          rowIndex: 1,
          cells: [
            { rowIndex: 1, cellIndex: 0, plainText: "Parser", header: false, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 1, cellIndex: 1, plainText: "Done", header: false, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 1, cellIndex: 2, plainText: "A", header: false, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 1, cellIndex: 3, plainText: "Today", header: false, align: "", colSpan: 1, rowSpan: 1 },
          ],
        },
        {
          rowIndex: 2,
          cells: [
            { rowIndex: 2, cellIndex: 0, plainText: "Renderer", header: false, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 2, cellIndex: 1, plainText: "Doing", header: false, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 2, cellIndex: 2, plainText: "B", header: false, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 2, cellIndex: 3, plainText: "Tomorrow", header: false, align: "", colSpan: 1, rowSpan: 1 },
          ],
        },
        {
          rowIndex: 3,
          cells: [
            { rowIndex: 3, cellIndex: 0, plainText: "QA", header: false, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 3, cellIndex: 1, plainText: "Todo", header: false, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 3, cellIndex: 2, plainText: "C", header: false, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 3, cellIndex: 3, plainText: "Friday", header: false, align: "", colSpan: 1, rowSpan: 1 },
          ],
        },
      ],
    },
  };
}

function createImageItem(id, x, y) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#dbeafe"/><path d="M30 145 112 62l54 50 48-40 76 73Z" fill="#2563eb"/><circle cx="254" cy="42" r="18" fill="#f59e0b"/></svg>';
  return {
    id,
    type: "image",
    name: "scene image",
    mime: "image/svg+xml",
    source: "blob",
    sourcePath: "",
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    x,
    y,
    width: 320,
    height: 180,
    naturalWidth: 320,
    naturalHeight: 180,
    rotation: 0,
    flipX: false,
    flipY: false,
    brightness: 0,
    contrast: 0,
    crop: null,
    annotations: { lines: [], texts: [], rects: [], arrows: [] },
    memo: "",
    memoVisible: false,
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createRectShape(id, x, y, width, height) {
  return {
    id,
    type: "shape",
    shapeType: "rect",
    x,
    y,
    width,
    height,
    startX: x,
    startY: y,
    endX: x + width,
    endY: y + height,
    strokeColor: "#1e293b",
    fillColor: "rgba(59, 130, 246, 0.12)",
    strokeWidth: 2,
    lineDash: false,
    rotation: 0,
    radius: 18,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createFlowNodeItem(id, x, y, text) {
  return {
    id,
    type: "flowNode",
    x,
    y,
    width: 220,
    height: 96,
    text,
    plainText: text,
    html: text,
    fontSize: 18,
    color: "#0f172a",
    wrapMode: "flow",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createFlowEdgeItem(id, fromId, toId) {
  return {
    id,
    type: "flowEdge",
    fromId,
    fromSide: "right",
    toId,
    toSide: "left",
    style: "arrow",
    arrowDirection: "forward",
    createdAt: Date.now(),
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
    items.push(
      createTextItem(
        `text-${index}`,
        80 + col * 220,
        80 + row * 120,
        `Item ${index + 1}`
      )
    );
  }
  return items;
}

function createDesktopShellStub() {
  return {
    getStartupContext: async () => ({ ok: true, startup: {}, cached: {}, remote: {} }),
    pathExists: async () => false,
    findPathByFileId: async () => ({ ok: false, path: "" }),
    getFileId: async () => ({ ok: false, fileId: "" }),
    fetchUrlMeta: async () => ({ ok: false }),
    readClipboardFiles: async () => ({ ok: true, paths: [] }),
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
}

async function waitForStableCanvas(page) {
  await page.waitForFunction((selector) => Boolean(window.__canvas2dEngine && document.querySelector(selector)), MAIN_CANVAS_SELECTOR);
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
    const surface =
      document.querySelector("[data-canvas-office-surface]") ||
      document.querySelector(".canvas-office-surface");
    const canvas = document.querySelector("#canvas-office-canvas");
    if (!surface || !canvas) {
      return false;
    }
    const surfaceRect = surface.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    return surfaceRect.width > 400 && surfaceRect.height > 200 && canvasRect.width > 400 && canvasRect.height > 200;
  });
  await page.waitForTimeout(120);
}

async function createPage(browser, { board, useDesktopShellStub = false, viewport = { width: 1440, height: 960 }, deviceScaleFactor = 1 } = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor });
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
    const clipboardStore = {
      items: [],
      text: "",
      html: "",
      markdown: "",
    };

    class FreeFlowClipboardItem {
      constructor(entries = {}) {
        this.__entries = new Map(Object.entries(entries || {}));
        this.types = Array.from(this.__entries.keys());
      }

      async getType(type) {
        const key = String(type || "");
        const value = this.__entries.get(key);
        if (value instanceof Blob) {
          return value;
        }
        if (typeof value === "string") {
          return new Blob([value], { type: key || "text/plain" });
        }
        return new Blob([""], { type: key || "text/plain" });
      }
    }

    const clipboardApi = {
      async write(items = []) {
        clipboardStore.items = Array.isArray(items) ? items.slice() : [];
        clipboardStore.text = "";
        clipboardStore.html = "";
        clipboardStore.markdown = "";
        for (const item of clipboardStore.items) {
          const types = Array.isArray(item?.types) ? item.types : [];
          if (!clipboardStore.text && types.includes("text/plain") && typeof item?.getType === "function") {
            clipboardStore.text = await (await item.getType("text/plain")).text();
          }
          if (!clipboardStore.html && types.includes("text/html") && typeof item?.getType === "function") {
            clipboardStore.html = await (await item.getType("text/html")).text();
          }
          if (!clipboardStore.markdown && types.includes("text/markdown") && typeof item?.getType === "function") {
            clipboardStore.markdown = await (await item.getType("text/markdown")).text();
          }
        }
      },
      async read() {
        return clipboardStore.items.slice();
      },
      async writeText(text = "") {
        clipboardStore.text = String(text || "");
        clipboardStore.html = "";
        clipboardStore.markdown = "";
        clipboardStore.items = [
          new FreeFlowClipboardItem({
            "text/plain": new Blob([clipboardStore.text], { type: "text/plain" }),
          }),
        ];
      },
      async readText() {
        return clipboardStore.text || "";
      },
      async __snapshot() {
        return {
          text: clipboardStore.text,
          html: clipboardStore.html,
          markdown: clipboardStore.markdown,
          types: clipboardStore.items.flatMap((item) => Array.isArray(item?.types) ? item.types : []),
          itemCount: clipboardStore.items.length,
        };
      },
    };

    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      writable: true,
      value: FreeFlowClipboardItem,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboardApi,
    });
  });

  if (useDesktopShellStub) {
    await page.addInitScript((stub) => {
      globalThis.desktopShell = stub;
      globalThis.__FREEFLOW_STARTUP_CONTEXT = { ok: true, startup: {}, cached: {}, remote: {} };
    }, createDesktopShellStub());
  }

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForStableCanvas(page);

  return {
    page,
    getErrors() {
      return pageErrors.slice();
    },
  };
}

async function dispatchCanvasPaste(page, { text = "", html = "", uriList = "" } = {}) {
  await page.evaluate(async ({ textValue, htmlValue, uriValue }) => {
    const canvas = document.querySelector("#canvas-office-canvas");
    if (!canvas || !window.__canvas2dEngine) {
      throw new Error("canvas engine is not ready");
    }
    canvas.focus();
    const types = [];
    if (textValue) {
      types.push("text/plain");
    }
    if (htmlValue) {
      types.push("text/html");
    }
    if (uriValue) {
      types.push("text/uri-list");
    }
    const clipboardData = {
      files: [],
      types,
      getData(type) {
        const normalized = String(type || "").trim().toLowerCase();
        if (normalized === "text/plain" || normalized === "text") {
          return textValue;
        }
        if (normalized === "text/html") {
          return htmlValue;
        }
        if (normalized === "text/uri-list") {
          return uriValue;
        }
        return "";
      },
    };
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      configurable: true,
      enumerable: true,
      value: clipboardData,
    });
    canvas.dispatchEvent(event);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { textValue: text, htmlValue: html, uriValue: uriList });
  await page.waitForTimeout(240);
}

async function dispatchSyntheticCopyPasteRoundTrip(page) {
  await page.evaluate(async () => {
    const canvas = document.querySelector("#canvas-office-canvas");
    if (!canvas || !window.__canvas2dEngine) {
      throw new Error("canvas engine is not ready");
    }
    const copyData = {
      data: new Map(),
      types: [],
      setData(type, value) {
        const normalized = String(type || "");
        if (!this.types.includes(normalized)) {
          this.types.push(normalized);
        }
        this.data.set(normalized, String(value || ""));
      },
      getData(type) {
        return this.data.get(String(type || "")) || "";
      },
    };
    const copyEvent = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(copyEvent, "clipboardData", {
      configurable: true,
      enumerable: true,
      value: copyData,
    });
    canvas.dispatchEvent(copyEvent);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      configurable: true,
      enumerable: true,
      value: {
        files: [],
        types: copyData.types.slice(),
        getData(type) {
          return copyData.getData(type);
        },
      },
    });
    canvas.dispatchEvent(pasteEvent);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(240);
}

async function rightClickCanvasItem(page, itemId) {
  const metrics = await page.evaluate((targetId) => {
    const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
    const item = snapshot?.board?.items?.find?.((entry) => entry.id === targetId) || null;
    const view = snapshot?.board?.view || { scale: 1, offsetX: 0, offsetY: 0 };
    if (!item) {
      return null;
    }
    const scale = Number(view.scale || 1) || 1;
    const width = Math.max(1, Number(item.width || 1) * scale);
    const height = Math.max(1, Number(item.height || 1) * scale);
    return {
      x: Number(item.x || 0) * scale + Number(view.offsetX || 0) + width / 2,
      y: Number(item.y || 0) * scale + Number(view.offsetY || 0) + height / 2,
    };
  }, itemId);
  assert(metrics, `could not resolve canvas item metrics for ${itemId}`, metrics);
  const canvasRect = await page.locator(MAIN_CANVAS_SELECTOR).boundingBox();
  await page.mouse.click(canvasRect.x + metrics.x, canvasRect.y + metrics.y, { button: "right" });
  await page.waitForTimeout(120);
}

async function rightClickBlankCanvas(page) {
  const point = await page.evaluate((canvasSelector) => {
    const canvas = document.querySelector(canvasSelector);
    const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
    if (!(canvas instanceof HTMLCanvasElement) || !snapshot?.board) return null;
    const rect = canvas.getBoundingClientRect();
    const view = snapshot.board.view || { scale: 1, offsetX: 0, offsetY: 0 };
    const scale = Math.max(0.01, Number(view.scale || 1) || 1);
    const candidates = [
      [0.18, 0.82],
      [0.5, 0.82],
      [0.82, 0.5],
      [0.18, 0.5],
    ];
    for (const [ratioX, ratioY] of candidates) {
      const x = rect.left + rect.width * ratioX;
      const y = rect.top + rect.height * ratioY;
      if (document.elementFromPoint(x, y) !== canvas) continue;
      const sceneX = (x - rect.left - Number(view.offsetX || 0)) / scale;
      const sceneY = (y - rect.top - Number(view.offsetY || 0)) / scale;
      const hitsItem = snapshot.board.items.some((item) => {
        const left = Number(item?.x || 0) - 24;
        const top = Number(item?.y || 0) - 24;
        const right = Number(item?.x || 0) + Number(item?.width || 0) + 24;
        const bottom = Number(item?.y || 0) + Number(item?.height || 0) + 24;
        return sceneX >= left && sceneX <= right && sceneY >= top && sceneY <= bottom;
      });
      if (!hitsItem) return { x, y };
    }
    return null;
  }, MAIN_CANVAS_SELECTOR);
  assert(point, "could not resolve an unobstructed blank canvas point");
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page.waitForTimeout(120);
}

async function clickContextMenuAction(page, action) {
  const menuItem = page.locator(`#canvas2d-context-menu [data-action="${action}"]`).first();
  await menuItem.waitFor({ state: "visible", timeout: 2000 });
  await menuItem.click();
  await page.waitForTimeout(180);
}

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

async function readElementEditorMapping(page, editorSelector, itemId) {
  return page.evaluate(({ selector, targetId }) => {
    const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
    const item = snapshot?.board?.items?.find?.((entry) => entry.id === targetId) || null;
    const view = snapshot?.board?.view || { scale: 1, offsetX: 0, offsetY: 0 };
    const canvasRect = document.querySelector("#canvas-office-canvas")?.getBoundingClientRect?.() || null;
    const editor = document.querySelector(selector);
    const editorRect = editor?.getBoundingClientRect?.() || null;
    if (!item || !canvasRect || !editorRect) return null;
    const scale = Number(view.scale || 1) || 1;
    return {
      actual: {
        left: editorRect.left,
        top: editorRect.top,
        width: editorRect.width,
        height: editorRect.height,
      },
      expected: {
        left: canvasRect.left + Number(item.x || 0) * scale + Number(view.offsetX || 0),
        top: canvasRect.top + Number(item.y || 0) * scale + Number(view.offsetY || 0),
        width: Math.max(1, Number(item.width || 1) * scale),
        height: Math.max(1, Number(item.height || 1) * scale),
      },
      placement: editor.dataset.editorPlacement || "",
      editorType: editor.dataset.editorType || "",
      itemId: editor.dataset.itemId || "",
      view: { ...view },
    };
  }, { selector: editorSelector, targetId: itemId });
}

function assertElementEditorMapping(mapping, label, { size = true } = {}) {
  assert(mapping, `${label}: editor mapping is unavailable`, mapping);
  assert(mapping.placement === "element", `${label}: editor is not element-local`, mapping);
  assert(mapping.itemId, `${label}: editor did not publish its item identity`, mapping);
  assert(Math.abs(mapping.actual.left - mapping.expected.left) <= 2, `${label}: editor left is detached from the element`, mapping);
  assert(Math.abs(mapping.actual.top - mapping.expected.top) <= 2, `${label}: editor top is detached from the element`, mapping);
  if (size) {
    assert(Math.abs(mapping.actual.width - mapping.expected.width) <= 2, `${label}: editor width is detached from the element`, mapping);
    assert(Math.abs(mapping.actual.height - mapping.expected.height) <= 2, `${label}: editor height is detached from the element`, mapping);
  }
}

async function runCodeBlockOverlayCheck(browser, { desktopShell = false } = {}) {
  const board = createBoard([
    createCodeBlockItem("code-check", 160, 160, "const answer = 42;\\nconsole.log(answer);"),
  ]);
  const session = await createPage(browser, { board, useDesktopShellStub: desktopShell });
  try {
    await session.page.waitForTimeout(400);
    const result = await session.page.evaluate(() => {
      const host = document.querySelector("#canvas2d-code-block-display");
      const nodes = Array.from(document.querySelectorAll(".canvas2d-code-block-item")).map((node) => ({
        id: node.dataset.id,
        display: getComputedStyle(node).display,
        highlightState: node.dataset.highlightState || "",
        left: node.style.left || "",
        top: node.style.top || "",
      }));
      return {
        hostDisplay: host ? getComputedStyle(host).display : "",
        nodeCount: nodes.length,
        nodes,
      };
    });
    assert(session.getErrors().length === 0, "codeBlock overlay check produced page errors", session.getErrors());
    assert(result.hostDisplay === "block", "codeBlock display host is not visible", result);
    assert(result.nodeCount >= 1, "codeBlock overlay node was not mounted", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runMathOverlayStandaloneCheck(browser) {
  const board = createBoard([
    createMathBlockItem("math-check", 180, 180, "\\\\int_0^1 x^2 \\\\, dx"),
  ]);
  const session = await createPage(browser, { board });
  try {
    await session.page.waitForFunction(() => {
      const node = document.querySelector('.canvas2d-rich-item[data-id="math-check"]');
      return Boolean(node);
    }, { timeout: 3000 });
    const result = await session.page.evaluate(() => {
      const host = document.querySelector("#canvas2d-rich-display");
      const node = document.querySelector('.canvas2d-rich-item[data-id="math-check"]');
      const snapshotItems = window.__canvas2dEngine?.getSnapshot?.()?.board?.items || [];
      const mathItem = snapshotItems.find((item) => item.id === "math-check") || null;
      return {
        hostDisplay: host ? getComputedStyle(host).display : "",
        nodeExists: Boolean(node),
        nodeContentMode: node?.dataset.contentMode || "",
        nodeTextLength: (node?.textContent || "").trim().length,
        itemType: mathItem?.type || "",
        itemPlainText: mathItem?.plainText || "",
        itemHtml: mathItem?.html || "",
      };
    });
    assert(session.getErrors().length === 0, "math overlay standalone check produced page errors", session.getErrors());
    assert(result.itemType === "text", "math item was not normalized back to text-backed math", result);
    assert(result.hostDisplay === "block", "math display host is not visible", result);
    assert(result.nodeExists === true, "text-backed math rich overlay node was not mounted", result);
    assert(result.nodeTextLength > 0, "text-backed math overlay did not render any content", result);
    assert(/data-role=["']math-block["']/i.test(result.itemHtml), "text-backed math html marker missing", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runTableEditorCheck(browser) {
  const board = createBoard(
    [
      createTableItem("table-check", 220, 180),
      createCodeBlockItem("table-code-underlay", 760, 520, "const hidden = true;\\nconsole.log(hidden);"),
    ],
    ["table-check"],
    { scale: 0.5, offsetX: 96, offsetY: 72 }
  );
  const session = await createPage(browser, { board });
  try {
    await session.page.waitForFunction(() => Boolean(document.querySelector('.canvas2d-scene-table-item[data-id="table-check"]')));
    const metrics = await session.page.evaluate(() => {
      const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
      const item = snapshot?.board?.items?.find?.((entry) => entry.id === "table-check") || null;
      const view = snapshot?.board?.view || { scale: 1, offsetX: 0, offsetY: 0 };
      if (!item) {
        return null;
      }
      window.__tableSceneNode = document.querySelector('.canvas2d-scene-table-item[data-id="table-check"]');
      const scale = Number(view.scale || 1) || 1;
      return {
        screenCenterX: Number(item.x || 0) * scale + Number(view.offsetX || 0) + Math.max(1, Number(item.width || 1) * scale) / 2,
        screenCenterY: Number(item.y || 0) * scale + Number(view.offsetY || 0) + Math.max(1, Number(item.height || 1) * scale) / 2,
        scaledWidth: Math.max(1, Number(item.width || 1) * scale),
        scaledHeight: Math.max(1, Number(item.height || 1) * scale),
      };
    });
    assert(metrics, "table editor check could not resolve table metrics", metrics);
    const canvasRect = await session.page.locator(MAIN_CANVAS_SELECTOR).boundingBox();
    await session.page.mouse.dblclick(canvasRect.x + metrics.screenCenterX, canvasRect.y + metrics.screenCenterY);
    await session.page.waitForTimeout(220);
    let editorBox = await session.page.locator("#canvas-table-editor").boundingBox();
    await session.page.evaluate(() => {
      const firstCell = document.querySelector('#canvas-table-editor [data-row-index="0"][data-column-index="0"]');
      const secondCell = document.querySelector('#canvas-table-editor [data-row-index="1"][data-column-index="1"]');
      firstCell?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      secondCell?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, shiftKey: true }));
    });
    const selectedCellsBeforeContext = await session.page.evaluate(
      () => Array.from(document.querySelectorAll("#canvas-table-editor .is-selected")).length
    );
    const initialMapping = await readElementEditorMapping(session.page, "#canvas-table-editor", "table-check");
    assertElementEditorMapping(initialMapping, "table editor initial");
    editorBox = await session.page.locator("#canvas-table-editor").boundingBox();
    await session.page.mouse.click(editorBox.x + 160, editorBox.y + 48, { button: "right" });
    await session.page.waitForTimeout(120);
    const result = await session.page.evaluate(() => {
      const editor = document.querySelector("#canvas-table-editor");
      const toolbar = document.querySelector("#canvas-table-toolbar");
      const overlayHost = document.querySelector("#canvas-fixed-overlay-host");
      const codeBlockHost = document.querySelector("#canvas2d-code-block-display");
      const contextMenu = document.querySelector("#canvas2d-context-menu");
      const sceneTableNode = document.querySelector('.canvas2d-scene-table-item[data-id="table-check"]');
      const editorRect = editor?.getBoundingClientRect?.() || null;
      const overlayRect = overlayHost?.getBoundingClientRect?.() || null;
      const toolButtons = Array.from(toolbar?.querySelectorAll("[data-action]") || []).map((button) => ({
        action: button.getAttribute("data-action") || "",
        text: (button.textContent || "").trim(),
      }));
      const selectedCells = Array.from(editor?.querySelectorAll(".is-selected") || []).length;
      const edgeButtons = Array.from(editor?.querySelectorAll(".canvas-table-edge-btn") || []).map((button) => ({
        action: button.getAttribute("data-action") || "",
        text: (button.textContent || "").trim(),
      }));
      const contextActions = Array.from(contextMenu?.querySelectorAll("[data-action]") || []).map((node) => node.getAttribute("data-action") || "");
      const style = editor ? getComputedStyle(editor) : null;
      return {
        overlayHostExists: Boolean(overlayHost),
        editorVisible: Boolean(editor) && style?.display !== "none",
        toolbarVisible: Boolean(toolbar) && getComputedStyle(toolbar).display !== "none",
        codeBlockHostVisible: Boolean(codeBlockHost) && getComputedStyle(codeBlockHost).display !== "none",
        sceneTableReleased:
          sceneTableNode === window.__tableSceneNode && getComputedStyle(sceneTableNode).display === "none",
        editorWidth: Math.round(editor?.getBoundingClientRect?.().width || 0),
        editorHeight: Math.round(editor?.getBoundingClientRect?.().height || 0),
        editorLeft: Math.round(editorRect?.left || 0),
        editorTop: Math.round(editorRect?.top || 0),
        overlayCenterX: Math.round((overlayRect?.left || 0) + (overlayRect?.width || 0) / 2),
        overlayCenterY: Math.round((overlayRect?.top || 0) + (overlayRect?.height || 0) / 2),
        selectedCells,
        toolButtons,
        edgeButtons,
        contextActions,
      };
    });
    result.selectedCellsBeforeContext = selectedCellsBeforeContext;
    assert(session.getErrors().length === 0, "table editor check produced page errors", session.getErrors());
    assert(result.overlayHostExists === true, "fixed overlay host was not mounted", result);
    assert(result.editorVisible === true, "table editor did not enter visible edit mode", result);
    assert(result.toolbarVisible === true, "table toolbar did not enter visible mode", result);
    assert(result.codeBlockHostVisible === false, "codeBlock overlay host should be hidden while table editing", result);
    assert(result.sceneTableReleased === true, "table scene ownership was not released during editing", result);
    assert(Math.abs(result.editorWidth - Math.round(metrics.scaledWidth)) <= 2, "table editor width is detached from the table element", { result, metrics });
    assert(Math.abs(result.editorHeight - Math.round(metrics.scaledHeight)) <= 2, "table editor height is detached from the table element", { result, metrics });
    assert(result.selectedCellsBeforeContext >= 4, "table range selection did not expand beyond a single cell", result);
    assert(result.toolButtons.length === 3, "table toolbar button count mismatch", result);
    assert(result.toolButtons.every((button) => button.text === ""), "table toolbar should use icon-only controls", result);
    assert(result.edgeButtons.length === 2, "table edge insert controls are missing", result);
    assert(result.edgeButtons.every((button) => button.text === ""), "table edge controls should use icon-only controls", result);
    assert(result.contextActions.includes("table-copy-selection"), "table context menu is missing copy-selection action", result);
    assert(result.contextActions.includes("table-add-row-above"), "table context menu is missing directional row insertion", result);
    assert(result.contextActions.includes("table-move-column-right"), "table context menu is missing column reorder action", result);
    assert(!result.contextActions.includes("table-sort-desc"), "table context menu should no longer expose sort action", result);
    await session.page.evaluate(() => {
      document.querySelector('#canvas-table-toolbar [data-action="table-done"]')?.click?.();
    });
    await session.page.waitForFunction(() => {
      const editor = document.querySelector("#canvas-table-editor");
      const codeBlockHost = document.querySelector("#canvas2d-code-block-display");
      return (!editor || getComputedStyle(editor).display === "none") &&
        Boolean(codeBlockHost) && getComputedStyle(codeBlockHost).display !== "none";
    });
    const restored = await session.page.evaluate(() => ({
      editorHidden: getComputedStyle(document.querySelector("#canvas-table-editor")).display === "none",
      toolbarHidden: getComputedStyle(document.querySelector("#canvas-table-toolbar")).display === "none",
      codeBlockHostVisible: getComputedStyle(document.querySelector("#canvas2d-code-block-display")).display !== "none",
      sceneTableRestored:
        document.querySelector('.canvas2d-scene-table-item[data-id="table-check"]') === window.__tableSceneNode &&
        getComputedStyle(window.__tableSceneNode).display !== "none",
    }));
    assert(restored.editorHidden === true, "table editor did not exit edit mode", restored);
    assert(restored.toolbarHidden === true, "table toolbar did not exit edit mode", restored);
    assert(restored.codeBlockHostVisible === true, "codeBlock overlay host did not recover after table editing", restored);
    assert(restored.sceneTableRestored === true, "table scene ownership did not recover after editing", restored);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await session.page.mouse.dblclick(canvasRect.x + metrics.screenCenterX, canvasRect.y + metrics.screenCenterY);
      await session.page.waitForFunction(() =>
        getComputedStyle(document.querySelector("#canvas-table-editor")).display !== "none" &&
        getComputedStyle(document.querySelector("#canvas2d-code-block-display")).display === "none"
      );
      await session.page.evaluate(() => {
        document.querySelector('#canvas-table-toolbar [data-action="table-done"]')?.click?.();
      });
      await session.page.waitForFunction(() =>
        getComputedStyle(document.querySelector("#canvas-table-editor")).display === "none" &&
        getComputedStyle(document.querySelector("#canvas2d-code-block-display")).display !== "none"
      );
    }
    assert(session.getErrors().length === 0, "rapid table edit cycles produced page errors", session.getErrors());
    return { ...result, initialMapping, restored, rapidCycles: 3 };
  } finally {
    await session.page.close();
  }
}

async function runPanRealtimeCheck(browser) {
  const board = createBoard([
    createRectShape("shape-pan", 120, 120, 140, 90),
    createTextItem("text-pan", 360, 160, "Pan Test"),
  ]);
  const session = await createPage(browser, { board });
  try {
    const rect = await session.page.locator(MAIN_CANVAS_SELECTOR).boundingBox();
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const deltaX = 96;
    const deltaY = 64;
    const minimapBefore = await session.page.evaluate(() =>
      document.querySelector("#canvas2d-transient-minimap canvas")?.__ffMinimapStats || null
    );

    await session.page.mouse.move(centerX, centerY);
    await session.page.mouse.down({ button: "middle" });
    await session.page.mouse.move(centerX + deltaX, centerY + deltaY, { steps: 4 });
    await session.page.waitForTimeout(80);
    const midStats = await session.page.evaluate(() => document.querySelector("#canvas-office-canvas").__ffRenderStats || null);
    const minimapMid = await session.page.evaluate(() =>
      document.querySelector("#canvas2d-transient-minimap canvas")?.__ffMinimapStats || null
    );
    await session.page.mouse.up({ button: "middle" });
    await session.page.waitForFunction(
      ({ expectedOffsetX, expectedOffsetY }) => {
        const view = window.__canvas2dEngine?.getSnapshot?.()?.board?.view;
        const runtime = window.__canvas2dEngine?.getCanvasPerformanceLifecycleSnapshot?.();
        return view?.offsetX === expectedOffsetX && view?.offsetY === expectedOffsetY && runtime?.phase === "steady";
      },
      { expectedOffsetX: deltaX, expectedOffsetY: deltaY }
    );
    const afterStats = await session.page.evaluate(() => document.querySelector("#canvas-office-canvas").__ffRenderStats || null);
    const committedView = await session.page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.view);
    const result = { midStats, afterStats, committedView, minimapBefore, minimapMid };
    assert(session.getErrors().length === 0, "pan check produced page errors", session.getErrors());
    assert(result.midStats?.renderReason === "pointer-pan-move", "pan move did not trigger view render", result);
    assert(result.midStats?.invalidation?.cameraDirty === true, "pan move did not use camera invalidation", result);
    assert(result.midStats?.layerReuse?.staticSceneReused === true, "scene-owned static layer redrew during pan", result);
    assert(result.midStats?.cameraFastPath?.active === true, "pan move did not use the camera fast path", result);
    assert(result.minimapBefore && result.minimapMid, "minimap runtime stats were unavailable", result);
    assert(
      result.minimapMid.snapshotRenderCount === result.minimapBefore.snapshotRenderCount,
      "minimap redrew its static scene during pan",
      result
    );
    assert(
      result.minimapMid.viewportRenderCount > result.minimapBefore.viewportRenderCount,
      "minimap viewport frame did not follow pan",
      result
    );
    assert(
      result.committedView?.offsetX === deltaX &&
        result.committedView?.offsetY === deltaY &&
        result.afterStats?.performanceRuntime?.phase === "steady",
      "pan commit did not flush and recover the view state",
      result
    );
    return result;
  } finally {
    await session.page.close();
  }
}

async function runViewportInteractionRecoveryCheck(browser) {
  const board = createBoard(
    [
      createTextItem("viewport-text", 180, 160, "Viewport interaction text fallback"),
      createMathBlockItem("viewport-math", 460, 160, "x^2 + y^2 = z^2"),
      createCodeBlockItem("viewport-code", 760, 160, "const stable = true;"),
      createImageItem("viewport-image", 180, 380),
      createTableItem("viewport-table", 560, 360),
      createFileCardItem("viewport-file", 560, 640, "Architecture Notes.docx"),
      createRectShape("viewport-shape", 1120, 160, 180, 110),
      createFlowNodeItem("viewport-flow-a", 1120, 380, "Flow A"),
      createFlowNodeItem("viewport-flow-b", 1420, 380, "Flow B"),
      createFlowEdgeItem("viewport-flow-edge", "viewport-flow-a", "viewport-flow-b"),
    ],
    ["viewport-image"],
    { scale: 0.5, offsetX: 40, offsetY: 40 }
  );
  const session = await createPage(browser, { board });
  try {
    await session.page.waitForFunction(() =>
      document.querySelector('.canvas2d-rich-item[data-id="viewport-text"]') &&
      document.querySelector('.canvas2d-rich-item[data-id="viewport-math"]') &&
      document.querySelector('.canvas2d-code-block-item[data-id="viewport-code"]') &&
      document.querySelector('.canvas2d-scene-image-item[data-id="viewport-image"]') &&
      document.querySelector('.canvas2d-scene-table-item[data-id="viewport-table"]') &&
      document.querySelector('.canvas2d-scene-file-card-item[data-id="viewport-file"]') &&
      document.querySelector('.canvas2d-scene-shape-item[data-id="viewport-shape"]') &&
      document.querySelector('.canvas2d-scene-flow-node-item[data-id="viewport-flow-a"]') &&
      document.querySelector('.canvas2d-scene-flow-node-item[data-id="viewport-flow-b"]') &&
      document.querySelector('.canvas2d-scene-flow-edge-item[data-id="viewport-flow-edge"]')
    );
    const result = await session.page.evaluate(async () => {
      const canvas = document.querySelector("#canvas-office-canvas");
      const richNode = document.querySelector('.canvas2d-rich-item[data-id="viewport-text"]');
      const mathNode = document.querySelector('.canvas2d-rich-item[data-id="viewport-math"]');
      const flowTextNode = document.querySelector('.canvas2d-rich-item[data-id="viewport-flow-a"]');
      const codeNode = document.querySelector('.canvas2d-code-block-item[data-id="viewport-code"]');
      const imageNode = document.querySelector('.canvas2d-scene-image-item[data-id="viewport-image"]');
      const tableNode = document.querySelector('.canvas2d-scene-table-item[data-id="viewport-table"]');
      const fileNode = document.querySelector('.canvas2d-scene-file-card-item[data-id="viewport-file"]');
      const shapeNode = document.querySelector('.canvas2d-scene-shape-item[data-id="viewport-shape"]');
      const flowNodeA = document.querySelector('.canvas2d-scene-flow-node-item[data-id="viewport-flow-a"]');
      const flowNodeB = document.querySelector('.canvas2d-scene-flow-node-item[data-id="viewport-flow-b"]');
      const flowEdgeNode = document.querySelector('.canvas2d-scene-flow-edge-item[data-id="viewport-flow-edge"]');
      const sceneRoot = document.querySelector("#canvas2d-scene-root");
      const contentLayer = document.querySelector("#canvas2d-content-layer");
      const interactionCanvas = document.querySelector("#canvas2d-interaction-canvas");
      const readInteractionState = () => {
        const interactionStyle = getComputedStyle(interactionCanvas);
        const sceneStyle = getComputedStyle(sceneRoot);
        const pixels = interactionCanvas.getContext("2d").getImageData(
          0,
          0,
          interactionCanvas.width,
          interactionCanvas.height
        ).data;
        let paintedPixels = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) {
            paintedPixels += 1;
          }
        }
        return {
          width: interactionCanvas.width,
          height: interactionCanvas.height,
          mainWidth: canvas.width,
          mainHeight: canvas.height,
          pointerEvents: interactionStyle.pointerEvents,
          zIndex: Number(interactionStyle.zIndex || 0),
          sceneZIndex: Number(sceneStyle.zIndex || 0),
          paintedPixels,
        };
      };
      const initialInteraction = readInteractionState();
      const startScale = window.__canvas2dEngine.getSnapshot().board.view.scale;
      const startBoardRevision = canvas.__ffRenderStats?.frameContext?.boardRevision || 0;
      const initialRichLocalLeft = Number.parseFloat(richNode.style.left);
      const initialRichLocalTop = Number.parseFloat(richNode.style.top);
      const initialMathLocalLeft = Number.parseFloat(mathNode.style.left);
      const initialMathLocalTop = Number.parseFloat(mathNode.style.top);
      const initialFlowLocalLeft = Number.parseFloat(flowTextNode.style.left);
      const initialFlowLocalTop = Number.parseFloat(flowTextNode.style.top);
      const initialCodeLocalLeft = Number.parseFloat(codeNode.style.left);
      const initialCodeLocalTop = Number.parseFloat(codeNode.style.top);
      const initialOverlayHtml = [richNode.innerHTML, mathNode.innerHTML, codeNode.innerHTML];
      const initialOverlayRepresentations = [richNode, mathNode, codeNode].map((node) => ({
        planned: node.dataset.plannedRepresentation || "",
        active: node.dataset.activeRepresentation || "",
        hasSnapshot: Boolean(node.querySelector(".canvas2d-presentation-snapshot")),
      }));
      const initialImageBox = [imageNode.style.left, imageNode.style.top, imageNode.style.width, imageNode.style.height];
      const initialTableBox = [tableNode.style.left, tableNode.style.top, tableNode.style.width, tableNode.style.height];
      const initialFileBox = [fileNode.style.left, fileNode.style.top, fileNode.style.width, fileNode.style.height];
      const shapeBody = shapeNode.querySelector(".canvas2d-scene-shape-body");
      const flowEdgeLine = flowEdgeNode.querySelector(".canvas2d-scene-flow-edge-line");
      const initialShapeGeometry = ["x", "y", "width", "height"].map((name) => shapeBody.getAttribute(name));
      const initialFlowEdgeGeometry = ["x1", "y1", "x2", "y2"].map((name) => flowEdgeLine.getAttribute(name));
      window.__sceneContentTestRefs = { imageNode, tableNode, fileNode, shapeNode, flowNodeA, flowNodeB, flowEdgeNode };
      for (let index = 0; index < 24; index += 1) {
        canvas.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          clientX: 520,
          clientY: 320,
          deltaY: 2,
        }));
      }
      const immediateScale = window.__canvas2dEngine.getSnapshot().board.view.scale;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const activeScale = window.__canvas2dEngine.getSnapshot().board.view.scale;
      const ctx = canvas.getContext("2d");
      const activeView = window.__canvas2dEngine.getSnapshot().board.view;
      const activeMatrix = new DOMMatrix(getComputedStyle(sceneRoot).transform);
      const active = {
        richVisibility: getComputedStyle(document.querySelector("#canvas2d-rich-display")).visibility,
        mathVisibility: getComputedStyle(document.querySelector("#canvas2d-math-display")).visibility,
        codeVisibility: getComputedStyle(document.querySelector("#canvas2d-code-block-display")).visibility,
        richPreserved: richNode === document.querySelector('.canvas2d-rich-item[data-id="viewport-text"]'),
        mathPreserved: mathNode === document.querySelector('.canvas2d-rich-item[data-id="viewport-math"]'),
        codePreserved: codeNode === document.querySelector('.canvas2d-code-block-item[data-id="viewport-code"]'),
        imagePreserved: imageNode === document.querySelector('.canvas2d-scene-image-item[data-id="viewport-image"]'),
        tablePreserved: tableNode === document.querySelector('.canvas2d-scene-table-item[data-id="viewport-table"]'),
        filePreserved: fileNode === document.querySelector('.canvas2d-scene-file-card-item[data-id="viewport-file"]'),
        shapePreserved: shapeNode === document.querySelector('.canvas2d-scene-shape-item[data-id="viewport-shape"]'),
        flowNodesPreserved:
          flowNodeA === document.querySelector('.canvas2d-scene-flow-node-item[data-id="viewport-flow-a"]') &&
          flowNodeB === document.querySelector('.canvas2d-scene-flow-node-item[data-id="viewport-flow-b"]'),
        flowEdgePreserved: flowEdgeNode === document.querySelector('.canvas2d-scene-flow-edge-item[data-id="viewport-flow-edge"]'),
        sceneMatrix: [activeMatrix.a, activeMatrix.d, activeMatrix.e, activeMatrix.f],
        scenePhase: sceneRoot.dataset.presentationPhase,
        sceneWillChange: getComputedStyle(sceneRoot).willChange,
        richLocalLeft: Number.parseFloat(richNode.style.left),
        mathLocalLeft: Number.parseFloat(mathNode.style.left),
        codeLocalLeft: Number.parseFloat(codeNode.style.left),
        overlayHtml: [richNode.innerHTML, mathNode.innerHTML, codeNode.innerHTML],
        overlayRepresentations: [richNode, mathNode, codeNode].map((node) => ({
          planned: node.dataset.plannedRepresentation || "",
          active: node.dataset.activeRepresentation || "",
          hasSnapshot: Boolean(node.querySelector(".canvas2d-presentation-snapshot")),
        })),
        imageBox: [imageNode.style.left, imageNode.style.top, imageNode.style.width, imageNode.style.height],
        tableBox: [tableNode.style.left, tableNode.style.top, tableNode.style.width, tableNode.style.height],
        fileBox: [fileNode.style.left, fileNode.style.top, fileNode.style.width, fileNode.style.height],
        shapeGeometry: ["x", "y", "width", "height"].map((name) => shapeBody.getAttribute(name)),
        flowEdgeGeometry: ["x1", "y1", "x2", "y2"].map((name) => flowEdgeLine.getAttribute(name)),
        hostsOwnedByContentLayer:
          document.querySelector("#canvas2d-rich-display")?.parentElement === contentLayer &&
          document.querySelector("#canvas2d-math-display")?.parentElement === contentLayer &&
          document.querySelector("#canvas2d-code-block-display")?.parentElement === contentLayer,
        view: activeView,
        frameContext: canvas.__ffRenderStats?.frameContext || null,
        runtimeMode: canvas.__ffRenderStats?.runtimeMode || null,
        sceneContentOwnedCount: canvas.__ffRenderStats?.sceneContentOwnedCount || 0,
        sceneOverlayOwnedCount: Array.from(document.querySelectorAll(
          ".canvas2d-rich-item[data-id], .canvas2d-code-block-item[data-id], .canvas2d-math-item[data-id]"
        )).filter((node) => {
          const host = node.parentElement;
          return node.style.display !== "none" && host && getComputedStyle(host).visibility !== "hidden";
        }).length,
        sceneVectorOwnedCount: canvas.__ffRenderStats?.sceneVectorOwnedCount || 0,
        sceneVectorSubjectCount: document.querySelectorAll(".canvas2d-scene-vector-item[data-id]").length,
        interaction: readInteractionState(),
        pixel: Array.from(ctx.getImageData(2, 2, 1, 1).data),
      };
      await new Promise((resolve) => setTimeout(resolve, 220));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const recovered = {
        richVisibility: getComputedStyle(document.querySelector("#canvas2d-rich-display")).visibility,
        mathVisibility: getComputedStyle(document.querySelector("#canvas2d-math-display")).visibility,
        codeVisibility: getComputedStyle(document.querySelector("#canvas2d-code-block-display")).visibility,
        richPreserved: richNode === document.querySelector('.canvas2d-rich-item[data-id="viewport-text"]'),
        mathPreserved: mathNode === document.querySelector('.canvas2d-rich-item[data-id="viewport-math"]'),
        codePreserved: codeNode === document.querySelector('.canvas2d-code-block-item[data-id="viewport-code"]'),
        imagePreserved: imageNode === document.querySelector('.canvas2d-scene-image-item[data-id="viewport-image"]'),
        tablePreserved: tableNode === document.querySelector('.canvas2d-scene-table-item[data-id="viewport-table"]'),
        filePreserved: fileNode === document.querySelector('.canvas2d-scene-file-card-item[data-id="viewport-file"]'),
        shapePreserved: shapeNode === document.querySelector('.canvas2d-scene-shape-item[data-id="viewport-shape"]'),
        flowNodesPreserved:
          flowNodeA === document.querySelector('.canvas2d-scene-flow-node-item[data-id="viewport-flow-a"]') &&
          flowNodeB === document.querySelector('.canvas2d-scene-flow-node-item[data-id="viewport-flow-b"]'),
        flowEdgePreserved: flowEdgeNode === document.querySelector('.canvas2d-scene-flow-edge-item[data-id="viewport-flow-edge"]'),
        scenePhase: sceneRoot.dataset.presentationPhase,
        sceneWillChange: getComputedStyle(sceneRoot).willChange,
        overlayHtml: [richNode.innerHTML, mathNode.innerHTML, codeNode.innerHTML],
        overlayRepresentations: [richNode, mathNode, codeNode].map((node) => ({
          planned: node.dataset.plannedRepresentation || "",
          active: node.dataset.activeRepresentation || "",
          hasSnapshot: Boolean(node.querySelector(".canvas2d-presentation-snapshot")),
        })),
        frameContext: canvas.__ffRenderStats?.frameContext || null,
        runtimeMode: canvas.__ffRenderStats?.runtimeMode || null,
        interaction: readInteractionState(),
      };
      const resizeMatrixBefore = getComputedStyle(sceneRoot).transform;
      window.__canvas2dEngine.resize({ immediate: true, reason: "interaction-resize-check" });
      const resizeMatrixAfter = getComputedStyle(sceneRoot).transform;
      const resizePixel = Array.from(ctx.getImageData(2, 2, 1, 1).data);
      return {
        startScale,
        startBoardRevision,
        immediateScale,
        activeScale,
        initialRichLocalLeft,
        initialRichLocalTop,
        initialMathLocalLeft,
        initialMathLocalTop,
        initialFlowLocalLeft,
        initialFlowLocalTop,
        initialCodeLocalLeft,
        initialCodeLocalTop,
        initialOverlayHtml,
        initialOverlayRepresentations,
        initialImageBox,
        initialTableBox,
        initialFileBox,
        initialShapeGeometry,
        initialFlowEdgeGeometry,
        initialInteraction,
        active,
        recovered,
        resizeMatrixBefore,
        resizeMatrixAfter,
        resizePixel,
      };
    });
    await session.page.setViewportSize({ width: 1280, height: 800 });
    await session.page.waitForTimeout(160);
    result.externalResize = await session.page.evaluate(() => {
      const canvas = document.querySelector("#canvas-office-canvas");
      const interactionCanvas = document.querySelector("#canvas2d-interaction-canvas");
      const sceneRoot = document.querySelector("#canvas2d-scene-root");
      const { imageNode, tableNode, fileNode, shapeNode, flowNodeA, flowNodeB, flowEdgeNode } = window.__sceneContentTestRefs || {};
      return {
        matrix: getComputedStyle(sceneRoot).transform,
        imagePreserved: imageNode === document.querySelector('.canvas2d-scene-image-item[data-id="viewport-image"]'),
        tablePreserved: tableNode === document.querySelector('.canvas2d-scene-table-item[data-id="viewport-table"]'),
        filePreserved: fileNode === document.querySelector('.canvas2d-scene-file-card-item[data-id="viewport-file"]'),
        shapePreserved: shapeNode === document.querySelector('.canvas2d-scene-shape-item[data-id="viewport-shape"]'),
        flowNodesPreserved:
          flowNodeA === document.querySelector('.canvas2d-scene-flow-node-item[data-id="viewport-flow-a"]') &&
          flowNodeB === document.querySelector('.canvas2d-scene-flow-node-item[data-id="viewport-flow-b"]'),
        flowEdgePreserved: flowEdgeNode === document.querySelector('.canvas2d-scene-flow-edge-item[data-id="viewport-flow-edge"]'),
        imageBox: imageNode ? [imageNode.style.left, imageNode.style.top, imageNode.style.width, imageNode.style.height] : [],
        tableBox: tableNode ? [tableNode.style.left, tableNode.style.top, tableNode.style.width, tableNode.style.height] : [],
        fileBox: fileNode ? [fileNode.style.left, fileNode.style.top, fileNode.style.width, fileNode.style.height] : [],
        shapeGeometry: shapeNode
          ? ["x", "y", "width", "height"].map((name) => shapeNode.querySelector(".canvas2d-scene-shape-body")?.getAttribute(name))
          : [],
        flowEdgeGeometry: flowEdgeNode
          ? ["x1", "y1", "x2", "y2"].map((name) => flowEdgeNode.querySelector(".canvas2d-scene-flow-edge-line")?.getAttribute(name))
          : [],
        phase: sceneRoot?.dataset.presentationPhase || "",
        interactionSizeMatches:
          interactionCanvas?.width === canvas.width && interactionCanvas?.height === canvas.height,
        pixel: Array.from(canvas.getContext("2d").getImageData(2, 2, 1, 1).data),
      };
    });
    assert(session.getErrors().length === 0, "viewport interaction recovery produced page errors", session.getErrors());
    assert(result.immediateScale === result.startScale, "wheel events committed before the animation frame", result);
    assert(
      result.active.frameContext?.camera?.scale !== result.startScale,
      "batched wheel events did not present in one animation frame",
      result
    );
    assert(
      result.activeScale === result.startScale,
      "visual wheel input leaked into the formal board snapshot before commit",
      result
    );
    assert(
      result.active.frameContext?.boardRevision === result.startBoardRevision,
      "wheel interaction changed the document revision before commit",
      result
    );
    assert(
      result.recovered.frameContext?.boardRevision === result.startBoardRevision + 1,
      "wheel interaction did not commit exactly one document revision",
      result
    );
    assert(result.active.runtimeMode?.mode === "viewport-interaction", "wheel frame did not enter viewport interaction mode", result);
    assert(
      result.active.richVisibility === "visible" && result.active.mathVisibility === "visible" && result.active.codeVisibility === "visible",
      "scene content disappeared during viewport interaction",
      result
    );
    assert(result.active.hostsOwnedByContentLayer, "scene content hosts do not share the content layer", result);
    assert(result.initialRichLocalLeft === 180 && result.initialRichLocalTop === 160, "rich text local geometry diverged from world geometry", result);
    assert(result.initialMathLocalLeft === 460 && result.initialMathLocalTop === 160, "math text local geometry diverged from world geometry", result);
    assert(result.initialFlowLocalLeft === 1120 && result.initialFlowLocalTop === 380, "flow text local geometry diverged from world geometry", result);
    assert(result.initialCodeLocalLeft === 760 && result.initialCodeLocalTop === 160, "code local geometry diverged from world geometry", result);
    assert(
      result.active.sceneContentOwnedCount === result.active.sceneOverlayOwnedCount + 3,
      "visible DOM subjects did not have singular scene ownership",
      result
    );
    assert(
      result.active.sceneVectorOwnedCount === result.active.sceneVectorSubjectCount,
      "visible vector subjects did not have singular scene ownership",
      result
    );
    assert(
      Math.abs(result.active.richLocalLeft - result.initialRichLocalLeft) < 0.01,
      "rich content local coordinates changed during camera interaction",
      result
    );
    assert(
      Math.abs(result.active.mathLocalLeft - result.initialMathLocalLeft) < 0.01,
      "math content local coordinates changed during camera interaction",
      result
    );
    assert(
      Math.abs(result.active.codeLocalLeft - result.initialCodeLocalLeft) < 0.01,
      "code content local coordinates changed during camera interaction",
      result
    );
    assert(
      JSON.stringify(result.active.overlayHtml) === JSON.stringify(result.initialOverlayHtml),
      "DOM overlay content changed during camera interaction",
      result
    );
    assert(
      result.initialOverlayRepresentations.every(
        (entry) =>
          entry.planned &&
          ((entry.active === entry.planned &&
            (entry.active !== "exact-snapshot" || entry.hasSnapshot)) ||
            (entry.planned === "exact-snapshot" &&
              entry.active === "live-detail" &&
              !entry.hasSnapshot))
      ),
      "DOM overlays did not resolve the unified presentation plan",
      result
    );
    assert(
      JSON.stringify(result.active.overlayRepresentations) === JSON.stringify(result.initialOverlayRepresentations),
      "DOM overlay representation changed during camera interaction",
      result
    );
    assert(JSON.stringify(result.active.imageBox) === JSON.stringify(result.initialImageBox), "image world box changed during camera interaction", result);
    assert(JSON.stringify(result.active.tableBox) === JSON.stringify(result.initialTableBox), "table world box changed during camera interaction", result);
    assert(JSON.stringify(result.active.fileBox) === JSON.stringify(result.initialFileBox), "file-card world box changed during camera interaction", result);
    assert(JSON.stringify(result.active.shapeGeometry) === JSON.stringify(result.initialShapeGeometry), "shape world geometry changed during camera interaction", result);
    assert(JSON.stringify(result.active.flowEdgeGeometry) === JSON.stringify(result.initialFlowEdgeGeometry), "flow edge world geometry changed during camera interaction", result);
    assert(
      Math.abs(result.active.sceneMatrix[0] - result.active.frameContext.camera.scale) < 0.0001,
      "scene scale matrix diverged from visual camera",
      result
    );
    assert(
      Math.abs(result.active.sceneMatrix[1] - result.active.frameContext.camera.scale) < 0.0001,
      "scene scale matrix is not uniform",
      result
    );
    assert(
      Math.abs(result.active.sceneMatrix[2] - result.active.frameContext.camera.offsetX) < 0.01,
      "scene X translation diverged from visual camera",
      result
    );
    assert(
      Math.abs(result.active.sceneMatrix[3] - result.active.frameContext.camera.offsetY) < 0.01,
      "scene Y translation diverged from visual camera",
      result
    );
    assert(["active", "settling"].includes(result.active.scenePhase), "scene presentation did not enter interaction phase", result);
    assert(result.active.sceneWillChange === "transform", "scene transform was not promoted during viewport interaction", result);
    assert(
      result.active.richPreserved && result.active.mathPreserved && result.active.codePreserved &&
        result.active.imagePreserved && result.active.tablePreserved && result.active.filePreserved &&
        result.active.shapePreserved && result.active.flowNodesPreserved && result.active.flowEdgePreserved,
      "viewport interaction destroyed scene content nodes",
      result
    );
    assert(result.active.pixel[3] === 255, "canvas background became transparent during wheel interaction", result);
    assert(result.initialInteraction.pointerEvents === "none", "screen-space interaction layer captures pointer events", result);
    assert(result.initialInteraction.zIndex > result.initialInteraction.sceneZIndex, "screen-space interaction layer is below scene subjects", result);
    assert(
      result.initialInteraction.width === result.initialInteraction.mainWidth &&
        result.initialInteraction.height === result.initialInteraction.mainHeight,
      "screen-space interaction backing store does not match the main canvas",
      result
    );
    assert(result.initialInteraction.paintedPixels > 0, "selected element controls were not drawn on the interaction layer", result);
    assert(result.active.interaction.paintedPixels > 0, "interaction controls disappeared during viewport interaction", result);
    assert(
      result.recovered.richVisibility === "visible" && result.recovered.mathVisibility === "visible" && result.recovered.codeVisibility === "visible",
      "DOM overlays did not recover after viewport interaction",
      result
    );
    assert(
      result.recovered.richPreserved && result.recovered.mathPreserved && result.recovered.codePreserved &&
        result.recovered.imagePreserved && result.recovered.tablePreserved && result.recovered.filePreserved &&
        result.recovered.shapePreserved && result.recovered.flowNodesPreserved && result.recovered.flowEdgePreserved,
      "scene recovery replaced preserved nodes",
      result
    );
    assert(result.recovered.runtimeMode?.mode === "steady", "viewport interaction state did not return to steady", result);
    assert(result.recovered.scenePhase === "steady", "scene presentation did not return to steady", result);
    assert(result.recovered.sceneWillChange === "transform", "scene root lost compositor readiness after recovery", result);
    assert(
      result.recovered.overlayHtml.every((html) => Boolean(String(html || "").trim())),
      "DOM overlay content did not recover after viewport interaction",
      result
    );
    assert(
      result.recovered.overlayRepresentations.every(
        (entry) =>
          entry.planned &&
          entry.active === entry.planned &&
          (entry.active !== "exact-snapshot" || entry.hasSnapshot)
      ),
      "DOM overlay representation did not recover to the settled plan",
      result
    );
    assert(result.recovered.interaction.paintedPixels > 0, "interaction controls did not recover after viewport interaction", result);
    assert(result.resizeMatrixAfter === result.resizeMatrixBefore, "viewport resize mutated the scene camera matrix", result);
    assert(result.resizePixel[3] === 255, "canvas resize exposed a transparent backing-store frame", result);
    assert(result.externalResize.matrix === result.resizeMatrixBefore, "external viewport resize mutated the scene camera matrix", result);
    assert(
      result.externalResize.imagePreserved && result.externalResize.tablePreserved && result.externalResize.filePreserved &&
        result.externalResize.shapePreserved && result.externalResize.flowNodesPreserved && result.externalResize.flowEdgePreserved,
      "external viewport resize replaced scene nodes",
      result
    );
    assert(JSON.stringify(result.externalResize.imageBox) === JSON.stringify(result.initialImageBox), "external resize changed image world box", result);
    assert(JSON.stringify(result.externalResize.tableBox) === JSON.stringify(result.initialTableBox), "external resize changed table world box", result);
    assert(JSON.stringify(result.externalResize.fileBox) === JSON.stringify(result.initialFileBox), "external resize changed file-card world box", result);
    assert(JSON.stringify(result.externalResize.shapeGeometry) === JSON.stringify(result.initialShapeGeometry), "external resize changed shape world geometry", result);
    assert(JSON.stringify(result.externalResize.flowEdgeGeometry) === JSON.stringify(result.initialFlowEdgeGeometry), "external resize changed flow edge world geometry", result);
    assert(result.externalResize.phase === "steady", "external resize left scene presentation unsettled", result);
    assert(result.externalResize.interactionSizeMatches === true, "external resize desynchronized canvas backing stores", result);
    assert(result.externalResize.pixel[3] === 255, "external viewport resize exposed a transparent backing-store frame", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runSelectionDragRealtimeCheck(browser) {
  const board = createBoard(
    [createTextItem("drag-text", 520, 220, "Drag Realtime")],
    ["drag-text"]
  );
  const session = await createPage(browser, { board });
  try {
    const itemCenter = await session.page.evaluate(() => {
      const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
      const item = snapshot?.board?.items?.find?.((entry) => entry.id === "drag-text") || null;
      const view = snapshot?.board?.view || { scale: 1, offsetX: 0, offsetY: 0 };
      if (!item) {
        return null;
      }
      const scale = Number(view.scale || 1) || 1;
      const offsetX = Number(view.offsetX || 0);
      const offsetY = Number(view.offsetY || 0);
      return {
        x: Number(item.x || 0) * scale + offsetX + Math.max(1, Number(item.width || 1) * scale) / 2,
        y: Number(item.y || 0) * scale + offsetY + Math.max(1, Number(item.height || 1) * scale) / 2,
      };
    });
    assert(itemCenter, "selection drag check could not resolve item center", itemCenter);
    const canvasRect = await session.page.locator(MAIN_CANVAS_SELECTOR).boundingBox();
    const startX = canvasRect.x + itemCenter.x;
    const startY = canvasRect.y + itemCenter.y;
    await session.page.mouse.move(startX, startY);
    await session.page.mouse.down({ button: "left" });
    await session.page.mouse.move(startX + 96, startY + 48, { steps: 4 });
    await session.page.waitForTimeout(80);
    const midState = await session.page.evaluate(() => {
      const node = document.querySelector('.canvas2d-rich-item[data-id="drag-text"]');
      return {
        stats: document.querySelector("#canvas-office-canvas").__ffRenderStats || null,
        scenePosition: node ? { left: Number.parseFloat(node.style.left), top: Number.parseFloat(node.style.top) } : null,
      };
    });
    await session.page.mouse.up({ button: "left" });
    await session.page.waitForTimeout(80);
    const afterStats = await session.page.evaluate(() => document.querySelector("#canvas-office-canvas").__ffRenderStats || null);
    const afterPosition = await session.page.evaluate(() => {
      const item = window.__canvas2dEngine?.getSnapshot?.()?.board?.items?.find?.((entry) => entry.id === "drag-text");
      return item ? { x: Number(item.x || 0), y: Number(item.y || 0) } : null;
    });
    const result = { midStats: midState.stats, midScenePosition: midState.scenePosition, afterStats, afterPosition };
    assert(session.getErrors().length === 0, "selection drag check produced page errors", session.getErrors());
    assert(result.midStats?.sceneContentOwnedCount === 1, "selection drag lost scene ownership", result);
    assert(result.midStats?.canvasOwnedItems === 0, "selection drag duplicated content into the canvas layer", result);
    assert(result.midStats?.layerReuse?.dynamicSceneReused === true, "scene-owned drag redrew the canvas content layer", result);
    assert(result.midStats?.layerReuse?.interactionReused === false, "selection drag did not refresh screen-space interaction", result);
    assert(Math.abs(result.midScenePosition?.left - 616) <= 2, "scene node did not move horizontally in real time", result);
    assert(Math.abs(result.midScenePosition?.top - 268) <= 2, "scene node did not move vertically in real time", result);
    assert(Math.abs(result.afterPosition?.x - 616) <= 2, "selection drag did not commit the horizontal position", result);
    assert(Math.abs(result.afterPosition?.y - 268) <= 2, "selection drag did not commit the vertical position", result);

    await session.page.mouse.move(startX + 96, startY + 48);
    await session.page.mouse.down({ button: "left" });
    await session.page.mouse.move(startX + 48, startY + 24, { steps: 2 });
    await session.page.mouse.up({ button: "left" });
    await session.page.waitForTimeout(80);
    result.repeatedPosition = await session.page.evaluate(() => {
      const item = window.__canvas2dEngine?.getSnapshot?.()?.board?.items?.find?.((entry) => entry.id === "drag-text");
      return item ? { x: Number(item.x || 0), y: Number(item.y || 0) } : null;
    });
    assert(Math.abs(result.repeatedPosition?.x - 568) <= 2, "repeated drag left stale horizontal state", result);
    assert(Math.abs(result.repeatedPosition?.y - 244) <= 2, "repeated drag left stale vertical state", result);
    assert(session.getErrors().length === 0, "repeated selection drag produced page errors", session.getErrors());
    return result;
  } finally {
    await session.page.close();
  }
}

async function runMarqueeMultiSelectCheck(browser) {
  const board = createBoard(
    [
      createTextItem("marquee-a", 420, 160, "Marquee A"),
      createTextItem("marquee-b", 680, 210, "Marquee B"),
      createRectShape("marquee-c", 1040, 420, 140, 96),
    ],
    [],
    { scale: 1, offsetX: 0, offsetY: 0 }
  );
  const session = await createPage(browser, { board });
  try {
    const canvasRect = await session.page.locator(MAIN_CANVAS_SELECTOR).boundingBox();
    await session.page.mouse.move(canvasRect.x + 360, canvasRect.y + 120);
    await session.page.mouse.down({ button: "left" });
    await session.page.mouse.move(canvasRect.x + 940, canvasRect.y + 340, { steps: 8 });
    await session.page.waitForTimeout(80);
    await session.page.mouse.up({ button: "left" });
    await session.page.waitForTimeout(120);
    const after = await session.page.evaluate(() => {
      const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
      return {
        selectedIds: snapshot?.board?.selectedIds || [],
      };
    });
    const result = { after };
    assert(session.getErrors().length === 0, "marquee multi-select check produced page errors", session.getErrors());
    assert(after.selectedIds.includes("marquee-a"), "marquee did not select first text item", result);
    assert(after.selectedIds.includes("marquee-b"), "marquee did not select second text item", result);
    assert(after.selectedIds.length >= 2, "marquee did not keep a multi-selection", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runLocalizedTileInvalidationCheck(browser) {
  const items = [
    createTextItem("align-a", 120, 120, "Alpha"),
    createTextItem("align-b", 260, 220, "Beta"),
    createTextItem("align-c", 800, 680, "Gamma"),
    createRectShape("shape-x", 640, 120, 140, 100),
  ];
  const board = createBoard(items, ["align-a", "align-b"]);
  const session = await createPage(browser, { board });
  try {
    const result = await session.page.evaluate(async () => {
      const readGeometry = () => {
        const boardItems = window.__canvas2dEngine.getSnapshot().board.items;
        const entries = ["align-a", "align-b"].map((id) => {
          const item = boardItems.find((candidate) => candidate.id === id);
          const node = document.querySelector(`.canvas2d-rich-item[data-id="${id}"]`);
          return {
            id,
            x: Number(item?.x || 0),
            width: Number(item?.width || 0),
            nodeLeft: Number.parseFloat(node?.style?.left || "0"),
          };
        });
        return entries;
      };
      window.__canvas2dEngine.alignSelection("left");
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const first = document.querySelector("#canvas-office-canvas").__ffRenderStats || null;
      const firstGeometry = readGeometry();
      window.__canvas2dEngine.alignSelection("right");
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const repeated = document.querySelector("#canvas-office-canvas").__ffRenderStats || null;
      const repeatedGeometry = readGeometry();
      return { first, firstGeometry, repeated, repeatedGeometry };
    });
    assert(session.getErrors().length === 0, "alignSelection check produced page errors", session.getErrors());
    for (const stats of [result?.first, result?.repeated]) {
      const tileCache = stats?.tileCache || {};
      assert(stats?.canvasOwnedItems === 0, "scene-owned alignment duplicated content into canvas", result);
      assert(stats?.sceneContentOwnedCount === 3, "scene ownership changed during alignment", result);
      assert(tileCache.cacheSize === 0, "scene-owned alignment populated the tile cache", result);
      assert(stats?.layerReuse?.staticSceneReused === true, "scene-owned alignment redrew the static canvas layer", result);
    }
    assert(result.firstGeometry[0].x === result.firstGeometry[1].x, "left alignment did not update scene geometry", result);
    assert(result.firstGeometry.every((entry) => entry.nodeLeft === entry.x), "left alignment left stale scene nodes", result);
    assert(
      result.repeatedGeometry[0].x + result.repeatedGeometry[0].width ===
        result.repeatedGeometry[1].x + result.repeatedGeometry[1].width,
      "right alignment did not update scene geometry",
      result
    );
    assert(result.repeatedGeometry.every((entry) => entry.nodeLeft === entry.x), "right alignment left stale scene nodes", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runBackgroundLayerReuseCheck(browser) {
  const board = createBoard(createLargeBoard(4000));
  const session = await createPage(browser, { board });
  try {
    const result = await session.page.evaluate(async () => {
      const canvas = document.querySelector("#canvas-office-canvas");
      window.__canvas2dEngine.resize({ immediate: true, reason: "background-reuse-preflight" });
      let stableFrameCount = 0;
      let lastFrameId = -1;
      for (let index = 0; index < 30 && stableFrameCount < 3; index += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const frameId = Number(canvas.__ffRenderStats?.frameContext?.frameId || 0);
        if (frameId === lastFrameId) {
          stableFrameCount += 1;
        } else {
          stableFrameCount = 0;
          lastFrameId = frameId;
        }
      }
      const frames = [];
      let latestStats = canvas.__ffRenderStats || null;
      Object.defineProperty(canvas, "__ffRenderStats", {
        configurable: true,
        get: () => latestStats,
        set: (value) => {
          latestStats = value;
          frames.push(value);
        },
      });
      window.__canvas2dEngine.setBoardBackgroundPattern("grid");
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return frames.find((stats) => stats?.renderReasons?.includes("set-background-pattern")) || null;
    });
    assert(result, "background change render frame was not observed");
    assert(session.getErrors().length === 0, "background reuse check produced page errors", session.getErrors());
    assert(result?.layerReuse?.backgroundReused === false, "background layer did not redraw", result);
    assert(result?.layerReuse?.staticSceneReused === true, "static scene layer should have been reused", result);
    assert(result?.layerReuse?.dynamicSceneReused === true, "dynamic scene layer should have been reused", result);
    assert(result?.layerReuse?.interactionReused === true, "interaction layer should have been reused", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runLargeViewportPixelBudgetCheck(browser) {
  const board = createBoard(createLargeBoard(1600), [], { scale: 0.75, offsetX: 0, offsetY: 0 });
  const session = await createPage(browser, {
    board,
    viewport: { width: 4200, height: 2400 },
    deviceScaleFactor: 2,
  });
  try {
    const result = await session.page.evaluate(async () => {
      const canvas = document.querySelector("#canvas-office-canvas");
      const frames = [];
      let latestStats = canvas.__ffRenderStats || null;
      Object.defineProperty(canvas, "__ffRenderStats", {
        configurable: true,
        get: () => latestStats,
        set: (value) => {
          latestStats = value;
          frames.push(value);
        },
      });
      window.__canvas2dEngine?.resize?.({ immediate: true, reason: "large-viewport-test" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        stats: frames.find((stats) =>
          stats?.renderReasons?.some((reason) => String(reason).startsWith("large-viewport-test"))
        ) || null,
        width: canvas?.width || 0,
        height: canvas?.height || 0,
        clientWidth: canvas?.clientWidth || 0,
        clientHeight: canvas?.clientHeight || 0,
        devicePixelRatio: window.devicePixelRatio,
      };
    });
    assert(result.stats, "large viewport resize render frame was not observed", result);
    const stats = result.stats || {};
    const budget = stats.pixelBudget || {};
    assert(session.getErrors().length === 0, "large viewport budget check produced page errors", session.getErrors());
    assert(result.width * result.height <= budget.maxBackingPixels, "canvas backing store exceeded pixel budget", result);
    assert(budget.dprLimited === true, "large viewport did not limit effective DPR", result);
    assert(budget.effectiveDpr < result.devicePixelRatio, "effective DPR was not reduced under large viewport", result);
    assert(stats.progressiveRender?.enabled === true || stats.progressiveRender?.pending === true, "large viewport did not enable progressive render", result);
    assert(Number(stats.tileCache?.tileCount || 0) >= 1, "large viewport did not render visible tiles", result);
    assert(stats.tileCache?.scaleMode === "exact", "settled large viewport did not use exact tile scale", result);
    const performanceWindow = stats.performanceWindow || {};
    assert(Number(performanceWindow.p50Ms || 0) <= Number(performanceWindow.p95Ms || 0), "performance P50 exceeded P95", result);
    assert(Number(performanceWindow.p95Ms || 0) <= Number(performanceWindow.p99Ms || 0), "performance P95 exceeded P99", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runTileScaleRecoveryCheck(browser) {
  const board = createBoard(createLargeBoard(320), [], { scale: 0.12, offsetX: 160, offsetY: 120 });
  const session = await createPage(browser, { board });
  try {
    const canvasBox = await session.page.locator(MAIN_CANVAS_SELECTOR).boundingBox();
    assert(canvasBox, "tile scale recovery canvas was not measurable");
    const cycles = [];
    for (let index = 0; index < 3; index += 1) {
      await session.page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
      await session.page.keyboard.down("Control");
      await session.page.mouse.wheel(0, 40);
      await session.page.keyboard.up("Control");
      await session.page.waitForTimeout(50);
      const active = await session.page.evaluate(() =>
        document.querySelector("#canvas-office-canvas")?.__ffRenderStats || null
      );
      await session.page.waitForTimeout(220);
      const recovered = await session.page.evaluate(() =>
        document.querySelector("#canvas-office-canvas")?.__ffRenderStats || null
      );
      cycles.push({ active, recovered });
    }
    assert(session.getErrors().length === 0, "tile scale recovery produced page errors", session.getErrors());
    cycles.forEach(({ active, recovered }, index) => {
      assert(active?.runtimeMode?.viewportInteractionActive === true, `cycle ${index} did not enter viewport interaction`, cycles);
      const retainedFrameActive = active?.cameraFastPath?.active === true && active?.retainedCameraFrame?.active === true;
      if (!retainedFrameActive) {
        assert(active?.tileCache?.scaleMode === "bucket", `cycle ${index} did not use a bucketed interaction scale`, cycles);
        assert(
          Number(active?.tileCache?.rasterScale || 0) >= Number(active?.tileCache?.requestedScale || 0),
          `cycle ${index} undersampled the interaction tile scale`,
          cycles
        );
      }
      assert(recovered?.runtimeMode?.mode === "steady", `cycle ${index} did not recover to steady mode`, cycles);
      assert(recovered?.cameraFastPath?.active === false, `cycle ${index} retained the camera fast path after recovery`, cycles);
      assert(recovered?.tileCache?.scaleMode === "exact", `cycle ${index} did not restore exact tile scale`, cycles);
      assert(
        Math.abs(Number(recovered?.tileCache?.rasterScale || 0) - Number(recovered?.tileCache?.requestedScale || 0)) <= 0.001,
        `cycle ${index} did not rebuild the settled exact scale`,
        cycles
      );
    });
    return { cycles: cycles.map(({ active, recovered }) => ({
      active: active?.tileCache || null,
      retainedFrameActive: active?.retainedCameraFrame?.active === true,
      recovered: recovered?.tileCache || null,
    })) };
  } finally {
    await session.page.close();
  }
}

async function runUndoPatchCheck(browser) {
  const board = createBoard([]);
  const session = await createPage(browser, { board });
  try {
    const result = await session.page.evaluate(async () => {
      window.__canvas2dEngine.addFlowNode();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return window.__canvas2dEngine.getSnapshot();
    });
    assert(session.getErrors().length === 0, "undo patch check produced page errors", session.getErrors());
    assert(result?.canUndo === true, "addFlowNode did not produce undo entry", result);
    assert(
      Array.isArray(result?.board?.items) && result.board.items.some((item) => item.type === "mindNode"),
      "addFlowNode should now create a mindNode root",
      result
    );
    return result;
  } finally {
    await session.page.close();
  }
}

async function runMindMapBasicCheck(browser) {
  const board = createBoard([]);
  const session = await createPage(browser, { board });
  try {
    const result = await session.page.evaluate(async () => {
      window.__canvas2dEngine.addFlowNode();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      let snapshot = window.__canvas2dEngine.getSnapshot();
      const root = snapshot?.board?.items?.find?.((item) => item.type === "mindNode") || null;
      if (!root) {
        return { rootExists: false };
      }
      window.__canvas2dEngine.addMindChildNode(root.id);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__canvas2dEngine.addMindChildNode(root.id);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      snapshot = window.__canvas2dEngine.getSnapshot();
      const items = Array.isArray(snapshot?.board?.items) ? snapshot.board.items : [];
      const rootAfter = items.find((item) => item.id === root.id) || null;
      const children = items.filter((item) => item.parentId === root.id);
      const childBranchSides = children.map((item) => item.branchSide || "");
      window.__canvas2dEngine.toggleMindNodeCollapsed(root.id);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const collapsedSnapshot = window.__canvas2dEngine.getSnapshot();
      const collapsedRoot = collapsedSnapshot?.board?.items?.find?.((item) => item.id === root.id) || null;
      return {
        rootExists: true,
        rootId: root.id,
        childCount: children.length,
        childParentId: children[0]?.parentId || "",
        rootChildrenIds: rootAfter?.childrenIds || [],
        childBranchSides,
        collapsed: Boolean(collapsedRoot?.collapsed),
        canUndo: Boolean(collapsedSnapshot?.canUndo),
      };
    });
    assert(session.getErrors().length === 0, "mind map basic check produced page errors", session.getErrors());
    assert(result.rootExists === true, "mind map root was not created", result);
    assert(result.childCount >= 2, "mind map root children were not created via keyboard flow", result);
    assert(result.childParentId === result.rootId, "mind map child did not bind to root", result);
    assert(Array.isArray(result.rootChildrenIds) && result.rootChildrenIds.length >= 1, "root childrenIds not updated", result);
    assert(
      Array.isArray(result.childBranchSides) && result.childBranchSides.every((side) => side === "right"),
      "mind map root children should default to the right branch",
      result
    );
    assert(result.collapsed === true, "mind map collapse toggle did not persist", result);
    assert(result.canUndo === true, "mind map actions did not enter undo history", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runMindMapDragConnectionCheck(browser) {
  const board = createBoard([]);
  const session = await createPage(browser, { board });
  try {
    const result = await session.page.evaluate(async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__canvas2dEngine.addFlowNode();
      await waitFrame();
      let snapshot = window.__canvas2dEngine.getSnapshot();
      const root = snapshot?.board?.items?.find?.((item) => item.type === "mindNode") || null;
      if (!root) {
        return { rootExists: false };
      }
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const child = snapshot?.board?.items?.find?.((item) => item.parentId === root.id) || null;
      if (!child) {
        return { rootExists: true, childExists: false };
      }
      const canvas = document.querySelector("#canvas-office-canvas");
      const view = snapshot.board.view;
      const startX = (Number(child.x || 0) + Number(child.width || 0) / 2) * Number(view.scale || 1) + Number(view.offsetX || 0);
      const startY = (Number(child.y || 0) + Number(child.height || 0) / 2) * Number(view.scale || 1) + Number(view.offsetY || 0);
      canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: startX, clientY: startY, button: 0, buttons: 1, pointerId: 1 }));
      canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: startX + 120, clientY: startY + 12, button: 0, buttons: 1, pointerId: 1 }));
      await waitFrame();
      const duringDragStats = canvas.__ffRenderStats || null;
      canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: startX + 120, clientY: startY + 12, button: 0, buttons: 0, pointerId: 1 }));
      await waitFrame();
      await new Promise((resolve) => setTimeout(resolve, 180));
      await waitFrame();
      const afterDragStats = canvas.__ffRenderStats || null;
      const afterSnapshot = window.__canvas2dEngine.getSnapshot();
      const movedChild = afterSnapshot?.board?.items?.find?.((item) => item.id === child.id) || null;
      return {
        rootExists: true,
        childExists: true,
        renderedItems: Number(duringDragStats?.renderedItems || 0),
        canvasOwnedItems: Number(duringDragStats?.canvasOwnedItems || 0),
        sceneVectorOwnedCount: Number(duringDragStats?.sceneVectorOwnedCount || 0),
        dynamicRenderedItems: Number(duringDragStats?.dynamicRenderedItems || 0),
        staticRenderedItems: Number(duringDragStats?.staticRenderedItems || 0),
        mindMapConnectionsDrawn: Number(duringDragStats?.mindMapConnectionsDrawn || 0),
        afterDynamicRenderedItems: Number(afterDragStats?.dynamicRenderedItems || 0),
        afterCanvasOwnedItems: Number(afterDragStats?.canvasOwnedItems || 0),
        afterSceneVectorOwnedCount: Number(afterDragStats?.sceneVectorOwnedCount || 0),
        afterStaticRenderedItems: Number(afterDragStats?.staticRenderedItems || 0),
        afterMindMapConnectionsDrawn: Number(afterDragStats?.mindMapConnectionsDrawn || 0),
        movedBy: {
          x: Number(movedChild?.x || 0) - Number(child.x || 0),
          y: Number(movedChild?.y || 0) - Number(child.y || 0),
        },
        selectedIds: afterSnapshot?.board?.selectedIds || [],
        interactionPriority: window.__canvas2dEngine.getInteractionPrioritySnapshot(),
      };
    });
    assert(session.getErrors().length === 0, "mind map drag connection check produced page errors", session.getErrors());
    assert(result.rootExists === true, "mind map drag check root was not created", result);
    assert(result.childExists === true, "mind map drag check child was not created", result);
    assert(result.renderedItems >= 2, "mind map drag check rendered item count is invalid", result);
    assert(result.canvasOwnedItems === 0, "mind map drag duplicated scene vectors into canvas", result);
    assert(result.sceneVectorOwnedCount >= 2, "mind map drag lost scene vector ownership", result);
    assert(result.dynamicRenderedItems === 0, "mind map drag redrew the dynamic canvas layer", result);
    assert(result.mindMapConnectionsDrawn >= 1, "mind map connection disappeared during drag", result);
    assert(result.afterStaticRenderedItems === 0, "mind map node unexpectedly entered the static tile cache", result);
    assert(result.afterCanvasOwnedItems === 0, "mind map recovery duplicated scene vectors into canvas", result);
    assert(result.afterSceneVectorOwnedCount >= 2, "mind map scene vector ownership did not recover", result);
    assert(result.afterDynamicRenderedItems === 0, "mind map recovery redrew the dynamic canvas layer", result);
    assert(result.afterMindMapConnectionsDrawn >= 1, "mind map connection disappeared after drag", result);
    assert(Math.abs(result.movedBy?.x) >= 100, "mind map drag position was not committed", result);
    assert(result.selectedIds.length === 1, "mind map drag left stale multi-selection state", result);
    assert(result.interactionPriority?.active === false, "interaction priority did not release after mind map drag", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runMindMapReparentCheck(browser) {
  const board = createBoard([]);
  const session = await createPage(browser, { board });
  try {
    const setup = await session.page.evaluate(async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__canvas2dEngine.addFlowNode();
      await waitFrame();
      let snapshot = window.__canvas2dEngine.getSnapshot();
      const root = snapshot?.board?.items?.find?.((item) => item.type === "mindNode" && !item.parentId) || null;
      if (!root) {
        return { rootExists: false };
      }
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const children = snapshot.board.items.filter((item) => item.parentId === root.id);
      const source = children[0] || null;
      const target = children[1] || null;
      if (!source || !target) {
        return { rootExists: true, childPairExists: false };
      }
      const canvas = document.querySelector("#canvas-office-canvas");
      const rect = canvas.getBoundingClientRect();
      const view = snapshot.board.view;
      return {
        rootExists: true,
        childPairExists: true,
        sourceId: source.id,
        targetId: target.id,
        sourceX: rect.left + (Number(source.x || 0) + Number(source.width || 0) / 2) * Number(view.scale || 1) + Number(view.offsetX || 0),
        sourceY: rect.top + (Number(source.y || 0) + Number(source.height || 0) / 2) * Number(view.scale || 1) + Number(view.offsetY || 0),
        targetX: rect.left + (Number(target.x || 0) + Number(target.width || 0) / 2) * Number(view.scale || 1) + Number(view.offsetX || 0),
        targetY: rect.top + (Number(target.y || 0) + Number(target.height || 0) / 2) * Number(view.scale || 1) + Number(view.offsetY || 0),
      };
    });
    assert(session.getErrors().length === 0, "mind map reparent check produced page errors", session.getErrors());
    assert(setup.rootExists === true, "mind map reparent check root was not created", setup);
    assert(setup.childPairExists === true, "mind map reparent check child pair missing", setup);
    await session.page.mouse.move(setup.sourceX, setup.sourceY);
    await session.page.mouse.down();
    await session.page.mouse.move(setup.targetX, setup.targetY, { steps: 14 });
    await session.page.mouse.up();
    await session.page.waitForTimeout(180);
    const result = await session.page.evaluate(({ sourceId, targetId }) => {
      const snapshot = window.__canvas2dEngine.getSnapshot();
      return {
        sourceParentId: snapshot?.board?.items?.find?.((item) => item.id === sourceId)?.parentId || "",
        targetId,
        canUndo: Boolean(snapshot?.canUndo),
      };
    }, { sourceId: setup.sourceId, targetId: setup.targetId });
    assert(session.getErrors().length === 0, "mind map reparent drag produced page errors", session.getErrors());
    assert(result.sourceParentId === result.targetId, "mind map node did not reparent onto drop target", result);
    assert(result.canUndo === true, "mind map reparent action did not enter undo history", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runMindMapDropFeedbackCheck(browser) {
  const board = createBoard([]);
  const session = await createPage(browser, { board });
  try {
    const result = await session.page.evaluate(async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__canvas2dEngine.addFlowNode();
      await waitFrame();
      let snapshot = window.__canvas2dEngine.getSnapshot();
      const root = snapshot?.board?.items?.find?.((item) => item.type === "mindNode" && !item.parentId) || null;
      if (!root) {
        return { rootExists: false };
      }
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const children = snapshot.board.items.filter((item) => item.parentId === root.id);
      const source = children[0] || null;
      const target = children[1] || null;
      if (!source || !target) {
        return { rootExists: true, childPairExists: false };
      }
      const canvas = document.querySelector("#canvas-office-canvas");
      const rect = canvas.getBoundingClientRect();
      const view = snapshot.board.view;
      return {
        rootExists: true,
        childPairExists: true,
        sourceId: source.id,
        targetId: target.id,
        sourceX: rect.left + (Number(source.x || 0) + Number(source.width || 0) / 2) * Number(view.scale || 1) + Number(view.offsetX || 0),
        sourceY: rect.top + (Number(source.y || 0) + Number(source.height || 0) / 2) * Number(view.scale || 1) + Number(view.offsetY || 0),
        targetX: rect.left + (Number(target.x || 0) + Number(target.width || 0) / 2) * Number(view.scale || 1) + Number(view.offsetX || 0),
        targetY: rect.top + (Number(target.y || 0) + Number(target.height || 0) / 2) * Number(view.scale || 1) + Number(view.offsetY || 0),
      };
    });
    assert(session.getErrors().length === 0, "mind map drop feedback check produced page errors", session.getErrors());
    assert(result.rootExists === true, "mind map drop feedback root missing", result);
    assert(result.childPairExists === true, "mind map drop feedback child pair missing", result);
    await session.page.mouse.move(result.sourceX, result.sourceY);
    await session.page.mouse.down();
    await session.page.mouse.move(result.targetX, result.targetY, { steps: 14 });
    await session.page.waitForTimeout(120);
    const duringDrag = await session.page.evaluate(() => window.__canvas2dEngine.getSnapshot());
    await session.page.mouse.up();
    await session.page.waitForTimeout(120);
    const afterDrop = await session.page.evaluate((sourceId) => {
      const snapshot = window.__canvas2dEngine.getSnapshot();
      return {
        dropTargetId: snapshot?.mindMapDropTargetId || "",
        dropHint: snapshot?.mindMapDropHint || "",
        movedParentId: snapshot?.board?.items?.find?.((item) => item.id === sourceId)?.parentId || "",
      };
    }, result.sourceId);
    const finalResult = {
      ...result,
      dropTargetIdDuringDrag: duringDrag?.mindMapDropTargetId || "",
      dropHintDuringDrag: duringDrag?.mindMapDropHint || "",
      dropTargetCleared: !afterDrop?.dropTargetId && !afterDrop?.dropHint,
      movedParentId: afterDrop?.movedParentId || "",
    };
    assert(Boolean(finalResult.dropTargetIdDuringDrag), "mind map drag target feedback did not appear", finalResult);
    assert(finalResult.dropHintDuringDrag === "将成为子节点", "mind map drag hint text is missing", finalResult);
    assert(finalResult.dropTargetCleared === true, "mind map drag target feedback was not cleared after drop", finalResult);
    assert(finalResult.movedParentId === finalResult.targetId, "mind map drag feedback check did not reparent onto target", finalResult);
    return finalResult;
  } finally {
    await session.page.close();
  }
}

async function runMindMapStructureActionsCheck(browser) {
  const board = createBoard([]);
  const session = await createPage(browser, { board });
  try {
    const result = await session.page.evaluate(async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__canvas2dEngine.addFlowNode();
      await waitFrame();
      let snapshot = window.__canvas2dEngine.getSnapshot();
      const root = snapshot?.board?.items?.find?.((item) => item.type === "mindNode" && !item.parentId) || null;
      if (!root) {
        return { rootExists: false };
      }
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const siblings = snapshot.board.items.filter((item) => item.parentId === root.id);
      const first = siblings[0] || null;
      const second = siblings[1] || null;
      if (!first || !second) {
        return { rootExists: true, childPairExists: false };
      }
      window.__canvas2dEngine.demoteMindNode(second.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const demoted = snapshot.board.items.find((item) => item.id === second.id) || null;
      const demotedParent = snapshot.board.items.find((item) => item.id === first.id) || null;
      window.__canvas2dEngine.insertMindIntermediateNode(second.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const movedSecond = snapshot.board.items.find((item) => item.id === second.id) || null;
      const bridge = snapshot.board.items.find((item) => item.type === "mindNode" && item.parentId === first.id && Array.isArray(item.childrenIds) && item.childrenIds.includes(second.id) && item.id !== second.id) || null;
      return {
        rootExists: true,
        childPairExists: true,
        demotedParentId: demoted?.parentId || "",
        expectedDemotedParentId: first.id,
        secondNodeId: second.id,
        demotedParentChildren: demotedParent?.childrenIds || [],
        bridgeExists: Boolean(bridge),
        bridgeId: bridge?.id || "",
        bridgeParentId: bridge?.parentId || "",
        bridgeChildIds: bridge?.childrenIds || [],
        movedSecondParentId: movedSecond?.parentId || "",
        canUndo: Boolean(snapshot?.canUndo),
      };
    });
    assert(session.getErrors().length === 0, "mind map structure actions check produced page errors", session.getErrors());
    assert(result.rootExists === true, "mind map structure actions root missing", result);
    assert(result.childPairExists === true, "mind map structure actions child pair missing", result);
    assert(result.demotedParentId === result.expectedDemotedParentId, "mind map demote did not move node under previous sibling", result);
    assert(Array.isArray(result.demotedParentChildren) && result.demotedParentChildren.length >= 1, "mind map demote did not update parent children", result);
    assert(result.bridgeExists === true, "mind map intermediate node was not inserted", result);
    assert(Array.isArray(result.bridgeChildIds) && result.bridgeChildIds.length === 1, "mind map intermediate node children are invalid", result);
    assert(result.bridgeChildIds[0] === result.secondNodeId, "mind map intermediate node did not capture the original node", result);
    assert(result.movedSecondParentId === result.bridgeId, "mind map intermediate node did not become the new parent", result);
    assert(result.canUndo === true, "mind map structure actions did not enter undo history", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runMindMapAncestorReparentCheck(browser) {
  const board = createBoard([], [], { scale: 1, offsetX: 0, offsetY: 0 });
  const session = await createPage(browser, { board });
  try {
    await session.page.setViewportSize({ width: 1900, height: 960 });
    await waitForStableCanvas(session.page);
    const result = await session.page.evaluate(async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__canvas2dEngine.addFlowNode();
      await waitFrame();
      let snapshot = window.__canvas2dEngine.getSnapshot();
      const root = snapshot?.board?.items?.find?.((item) => item.type === "mindNode" && !item.parentId) || null;
      if (!root) {
        return { rootExists: false };
      }
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const child = snapshot?.board?.items?.find?.((item) => item.parentId === root.id) || null;
      if (!child) {
        return { rootExists: true, childExists: false };
      }
      window.__canvas2dEngine.addMindChildNode(child.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const grandchild = snapshot?.board?.items?.find?.((item) => item.parentId === child.id) || null;
      if (!grandchild) {
        return { rootExists: true, childExists: true, grandchildExists: false };
      }
      const canvas = document.querySelector("#canvas-office-canvas");
      const rect = canvas.getBoundingClientRect();
      const view = snapshot.board.view;
      const toScreen = (item) => ({
        x: rect.left + (Number(item.x || 0) + Number(item.width || 0) / 2) * Number(view.scale || 1) + Number(view.offsetX || 0),
        y: rect.top + (Number(item.y || 0) + Number(item.height || 0) / 2) * Number(view.scale || 1) + Number(view.offsetY || 0),
      });
      return {
        rootExists: true,
        childExists: true,
        grandchildExists: true,
        rootId: root.id,
        grandchildId: grandchild.id,
        rootPoint: toScreen(root),
        grandchildPoint: toScreen(grandchild),
      };
    });
    assert(session.getErrors().length === 0, "mind map ancestor reparent setup produced page errors", session.getErrors());
    assert(result.rootExists === true, "mind map ancestor reparent root missing", result);
    assert(result.childExists === true, "mind map ancestor reparent child missing", result);
    assert(result.grandchildExists === true, "mind map ancestor reparent grandchild missing", result);
    await session.page.keyboard.press("Escape");
    await session.page.waitForTimeout(120);
    const editingId = await session.page.evaluate(() => window.__canvas2dEngine.getSnapshot()?.editingId || "");
    assert(!editingId, "mind map ancestor reparent did not exit edit mode", { editingId });
    await session.page.mouse.move(result.grandchildPoint.x, result.grandchildPoint.y);
    await session.page.mouse.down();
    await session.page.mouse.move(result.rootPoint.x, result.rootPoint.y, { steps: 16 });
    await session.page.waitForTimeout(120);
    const duringDrag = await session.page.evaluate(() => window.__canvas2dEngine.getSnapshot());
    await session.page.mouse.up();
    await session.page.waitForTimeout(120);
    const afterDrop = await session.page.evaluate((grandchildId) => {
      const snapshot = window.__canvas2dEngine.getSnapshot();
      return {
        movedParentId: snapshot?.board?.items?.find?.((item) => item.id === grandchildId)?.parentId || "",
        dropTargetId: snapshot?.mindMapDropTargetId || "",
        dropHint: snapshot?.mindMapDropHint || "",
      };
    }, result.grandchildId);
    const finalResult = {
      ...result,
      dropTargetIdDuringDrag: duringDrag?.mindMapDropTargetId || "",
      dropHintDuringDrag: duringDrag?.mindMapDropHint || "",
      movedParentId: afterDrop?.movedParentId || "",
      dropTargetCleared: !afterDrop?.dropTargetId && !afterDrop?.dropHint,
    };
    assert(finalResult.dropTargetIdDuringDrag === finalResult.rootId, "mind map ancestor reparent did not target ancestor during drag", finalResult);
    assert(finalResult.dropHintDuringDrag === "将成为子节点", "mind map ancestor reparent hint missing", finalResult);
    assert(finalResult.movedParentId === finalResult.rootId, "mind map descendant did not merge into ancestor", finalResult);
    assert(finalResult.dropTargetCleared === true, "mind map ancestor reparent feedback was not cleared", finalResult);
    return finalResult;
  } finally {
    await session.page.close();
  }
}

async function runMindMapSummaryCheck(browser) {
  const board = createBoard([]);
  const session = await createPage(browser, { board });
  try {
    const result = await session.page.evaluate(async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__canvas2dEngine.addFlowNode();
      await waitFrame();
      let snapshot = window.__canvas2dEngine.getSnapshot();
      const root = snapshot?.board?.items?.find?.((item) => item.type === "mindNode" && !item.parentId) || null;
      if (!root) {
        return { rootExists: false };
      }
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const children = snapshot.board.items.filter((item) => item.parentId === root.id);
      const anchor = children[0] || null;
      if (!anchor || children.length < 2) {
        return { rootExists: true, childrenReady: false };
      }
      window.__canvas2dEngine.addMindSummaryNode(anchor.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const summary = snapshot.board.items.find((item) => item.type === "mindSummary") || null;
      const canvas = document.querySelector("#canvas-office-canvas");
      const stats = canvas?.__ffRenderStats || null;
      const vectorLayer = document.querySelector("#canvas2d-vector-layer");
      return {
        rootExists: true,
        childrenReady: true,
        summaryExists: Boolean(summary),
        summarySiblingIds: summary?.siblingIds || [],
        summaryOwnerId: summary?.summaryOwnerId || "",
        summaryX: Number(summary?.x || 0),
        childrenMaxX: Math.max(...children.map((item) => Number(item.x || 0) + Number(item.width || 0))),
        connectionsDrawn: Number(stats?.mindMapConnectionsDrawn || 0),
        vectorSummaryPathExists: Boolean(vectorLayer?.querySelector(".canvas2d-scene-mind-summary-path")),
      };
    });
    assert(session.getErrors().length === 0, "mind map summary check produced page errors", session.getErrors());
    assert(result.rootExists === true, "mind map summary root missing", result);
    assert(result.childrenReady === true, "mind map summary children missing", result);
    assert(result.summaryExists === true, "mind map summary node was not created", result);
    assert(Array.isArray(result.summarySiblingIds) && result.summarySiblingIds.length >= 2, "mind map summary sibling binding missing", result);
    assert(Boolean(result.summaryOwnerId), "mind map summary owner missing", result);
    assert(result.summaryX > result.childrenMaxX, "mind map summary should be placed outside sibling group", result);
    assert(result.vectorSummaryPathExists === true, "mind map summary connection did not migrate to vector layer", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runMindMapRelationshipCheck(browser) {
  const board = createBoard([createTextItem("relationship-source", 420, 160, "Relationship Source")]);
  const session = await createPage(browser, { board });
  try {
    const result = await session.page.evaluate(async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__canvas2dEngine.addFlowNode();
      await waitFrame();
      let snapshot = window.__canvas2dEngine.getSnapshot();
      const root = snapshot?.board?.items?.find?.((item) => item.type === "mindNode" && !item.parentId) || null;
      if (!root) {
        return { rootExists: false };
      }
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const children = snapshot.board.items.filter((item) => item.parentId === root.id);
      if (children.length < 2) {
        return { rootExists: true, childrenReady: false };
      }
      const created = window.__canvas2dEngine.addMindRelationship("relationship-source", children[0].id);
      const duplicateCreated = window.__canvas2dEngine.addMindRelationship("relationship-source", children[0].id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const relationships = snapshot.board.items.filter((item) => item.type === "mindRelationship");
      const relationship = relationships[0] || null;
      const canvas = document.querySelector("#canvas-office-canvas");
      const stats = canvas?.__ffRenderStats || null;
      const vectorLayer = document.querySelector("#canvas2d-vector-layer");
      return {
        rootExists: true,
        childrenReady: true,
        created,
        duplicateCreated,
        relationshipCount: relationships.length,
        relationshipExists: Boolean(relationship),
        fromId: relationship?.fromId || "",
        toId: relationship?.toId || "",
        expectedFromId: "relationship-source",
        expectedToId: children[0].id,
        connectionsDrawn: Number(stats?.mindMapConnectionsDrawn || 0),
        vectorTreePathCount: vectorLayer?.querySelectorAll(".canvas2d-scene-mind-tree-path").length || 0,
        vectorRelationshipExists: Boolean(
          vectorLayer?.querySelector(`.canvas2d-scene-mind-relationship-item[data-id="${relationship?.id || ""}"]`)
        ),
      };
    });
    assert(session.getErrors().length === 0, "mind map relationship check produced page errors", session.getErrors());
    assert(result.rootExists === true, "mind map relationship root missing", result);
    assert(result.childrenReady === true, "mind map relationship children missing", result);
    assert(result.created === true, "mind map relationship API rejected an eligible source", result);
    assert(result.duplicateCreated === false, "duplicate mind map relationship was accepted", result);
    assert(result.relationshipCount === 1, "duplicate mind map relationship was persisted", result);
    assert(result.relationshipExists === true, "mind map relationship was not created", result);
    assert(result.fromId === result.expectedFromId && result.toId === result.expectedToId, "mind map relationship endpoints missing", result);
    assert(result.connectionsDrawn >= 3, "mind map relationship should contribute to connection layer rendering", result);
    assert(result.vectorTreePathCount >= 2, "mind map tree connections did not migrate to vector layer", result);
    assert(result.vectorRelationshipExists === true, "mind map relationship did not migrate to vector layer", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runMindMapSubtreeReparentCheck(browser) {
  const board = createBoard([], [], { scale: 1, offsetX: 0, offsetY: 0 });
  const session = await createPage(browser, { board });
  try {
    await session.page.setViewportSize({ width: 1900, height: 960 });
    await waitForStableCanvas(session.page);
    const setup = await session.page.evaluate(async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__canvas2dEngine.addFlowNode();
      await waitFrame();
      let snapshot = window.__canvas2dEngine.getSnapshot();
      const root = snapshot?.board?.items?.find?.((item) => item.type === "mindNode" && !item.parentId) || null;
      if (!root) {
        return { rootExists: false };
      }
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      window.__canvas2dEngine.addMindChildNode(root.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const siblings = snapshot.board.items.filter((item) => item.parentId === root.id);
      const source = siblings[0] || null;
      const target = siblings[1] || null;
      if (!source || !target) {
        return { rootExists: true, siblingsReady: false };
      }
      window.__canvas2dEngine.addMindChildNode(source.id);
      await waitFrame();
      snapshot = window.__canvas2dEngine.getSnapshot();
      const child = snapshot.board.items.find((item) => item.parentId === source.id) || null;
      if (!child) {
        return { rootExists: true, siblingsReady: true, subtreeReady: false };
      }
      const canvas = document.querySelector("#canvas-office-canvas");
      const rect = canvas.getBoundingClientRect();
      const view = snapshot.board.view;
      const toScreen = (item) => ({
        x: rect.left + (Number(item.x || 0) + Number(item.width || 0) / 2) * Number(view.scale || 1) + Number(view.offsetX || 0),
        y: rect.top + (Number(item.y || 0) + Number(item.height || 0) / 2) * Number(view.scale || 1) + Number(view.offsetY || 0),
      });
      return {
        rootExists: true,
        siblingsReady: true,
        subtreeReady: true,
        sourceId: source.id,
        targetId: target.id,
        childId: child.id,
        sourcePoint: toScreen(source),
        targetPoint: toScreen(target),
      };
    });
    assert(session.getErrors().length === 0, "mind map subtree reparent setup produced page errors", session.getErrors());
    assert(setup.rootExists === true, "mind map subtree reparent root missing", setup);
    assert(setup.siblingsReady === true, "mind map subtree reparent siblings missing", setup);
    assert(setup.subtreeReady === true, "mind map subtree reparent subtree missing", setup);
    await session.page.mouse.move(setup.sourcePoint.x, setup.sourcePoint.y);
    await session.page.mouse.down();
    await session.page.mouse.move(setup.targetPoint.x, setup.targetPoint.y, { steps: 16 });
    await session.page.waitForTimeout(120);
    await session.page.mouse.up();
    await session.page.waitForTimeout(120);
    const result = await session.page.evaluate(({ sourceId, targetId, childId }) => {
      const snapshot = window.__canvas2dEngine.getSnapshot();
      const source = snapshot?.board?.items?.find?.((item) => item.id === sourceId) || null;
      const child = snapshot?.board?.items?.find?.((item) => item.id === childId) || null;
      return {
        sourceParentId: source?.parentId || "",
        targetId,
        childParentId: child?.parentId || "",
        sourceChildrenIds: source?.childrenIds || [],
      };
    }, setup);
    assert(result.sourceParentId === result.targetId, "mind map subtree root did not reparent onto target", result);
    assert(result.childParentId === setup.sourceId, "mind map subtree child did not stay attached to moved subtree", result);
    assert(Array.isArray(result.sourceChildrenIds) && result.sourceChildrenIds.includes(setup.childId), "mind map subtree childrenIds were not preserved", result);
    return { ...setup, ...result };
  } finally {
    await session.page.close();
  }
}

async function runLowZoomOverlaySummaryCheck(browser) {
  const board = createBoard(
    [
      createTextItem("text-lod", 120, 120, "Low zoom overlay summary check with enough text to trigger preview mode."),
      createMathBlockItem("math-lod", 320, 120, "\\\\sum_{i=1}^{n} i"),
      createCodeBlockItem("code-lod", 420, 120, "const total = items.reduce((sum, item) => sum + item.value, 0);"),
    ],
    [],
    { scale: 0.12, offsetX: 60, offsetY: 40 }
  );
  const session = await createPage(browser, { board });
  try {
    await session.page.waitForTimeout(300);
    const result = await session.page.evaluate(() => {
      const richNode = document.querySelector('.canvas2d-rich-item[data-id="text-lod"]');
      const mathNode = document.querySelector('.canvas2d-rich-item[data-id="math-lod"]');
      const codeNode = document.querySelector('.canvas2d-code-block-item[data-id="code-lod"]');
      const canvas = document.querySelector("#canvas-office-canvas");
      const hostHidden = (selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return style.visibility === "hidden" || style.display === "none";
      };
      return {
        richExists: Boolean(richNode),
        mathExists: Boolean(mathNode),
        codeExists: Boolean(codeNode),
        richRepresentation: richNode?.dataset.activeRepresentation || "",
        mathRepresentation: mathNode?.dataset.activeRepresentation || "",
        codeRepresentation: codeNode?.dataset.activeRepresentation || "",
        richHasSnapshot: Boolean(richNode?.querySelector(".canvas2d-presentation-snapshot")),
        mathHasSnapshot: Boolean(mathNode?.querySelector(".canvas2d-presentation-snapshot")),
        codeHasSnapshot: Boolean(codeNode?.querySelector(".canvas2d-presentation-snapshot")),
        mathText: String(mathNode?.textContent || "").trim(),
        mathVisible: Boolean(mathNode) && getComputedStyle(mathNode).display !== "none" &&
          getComputedStyle(mathNode).visibility !== "hidden",
        legacySkeletonCount: document.querySelectorAll(".canvas2d-rich-skeleton, .canvas2d-rich-skeleton-svg").length,
        richHostHidden: hostHidden("#canvas2d-rich-display"),
        mathHostHidden: hostHidden("#canvas2d-math-display"),
        codeHostHidden: hostHidden("#canvas2d-code-block-display"),
        stats: canvas?.__ffRenderStats || null,
      };
    });
    assert(session.getErrors().length === 0, "low zoom overlay summary check produced page errors", session.getErrors());
    assert(result.richExists && result.mathExists && result.codeExists, "low zoom lost a detail representation", result);
    assert(
      result.richRepresentation === "frozen-detail" &&
        result.mathRepresentation === "frozen-detail" &&
        result.codeRepresentation === "frozen-detail",
      "low zoom did not preserve frozen layout detail",
      result
    );
    assert(
      !result.richHasSnapshot && !result.mathHasSnapshot && !result.codeHasSnapshot,
      "low zoom started a main-thread snapshot capture",
      result
    );
    assert(result.mathVisible && result.mathText.length > 0, "low zoom formula detail was not visibly preserved", result);
    assert(result.legacySkeletonCount === 0, "low zoom restored a legacy skeleton", result);
    assert(!result.richHostHidden && result.mathHostHidden && !result.codeHostHidden, "low zoom overlay hosts were inconsistent", result);
    assert(result.stats?.renderedItems === 3, "low zoom canvas did not render every item", result);
    assert(result.stats?.sceneContentOwnedCount === 3, "low zoom presentation ownership was incomplete", result);
    assert(result.stats?.lodSimplifiedCount === 0, "low zoom duplicated frozen detail on the canvas", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runTextSummaryStabilityCheck(browser) {
  const board = createBoard(
    [createTextItem("text-stability", 180, 160, "占位骨架稳定性检查，缩放时内容不应跳变。")],
    [],
    { scale: 0.12, offsetX: 680, offsetY: 440 }
  );
  const session = await createPage(browser, { board });
  try {
    await session.page.waitForTimeout(240);
    const beforeHidden = await session.page.evaluate(() => {
      const hostStyle = getComputedStyle(document.querySelector("#canvas2d-rich-display"));
      const node = document.querySelector('.canvas2d-rich-item[data-id="text-stability"]');
      return {
        nodeMissing: !node,
        hostHidden: hostStyle.visibility === "hidden" || hostStyle.display === "none",
        activeRepresentation: node?.dataset.activeRepresentation || "",
        text: node?.textContent || "",
        hasSnapshot: Boolean(node?.querySelector(".canvas2d-presentation-snapshot")),
      };
    });
    const firstRecoveredScale = await session.page.evaluate(async () => {
      for (let index = 0; index < 10; index += 1) {
        if (window.__canvas2dEngine.getSnapshot().board.view.scale >= 0.23) break;
        window.__canvas2dEngine.zoomIn();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      return window.__canvas2dEngine.getSnapshot().board.view.scale;
    });
    await session.page.waitForTimeout(800);
    const readRecovered = () => session.page.evaluate(() => {
      const node = document.querySelector('.canvas2d-rich-item[data-id="text-stability"]');
      const svg = node?.querySelector(".canvas2d-rich-skeleton-svg");
      return {
        hostHidden: getComputedStyle(document.querySelector("#canvas2d-rich-display")).visibility === "hidden" ||
          getComputedStyle(document.querySelector("#canvas2d-rich-display")).display === "none",
        contentMode: node?.dataset.contentMode || "",
        plannedRepresentation: node?.dataset.plannedRepresentation || "",
        activeRepresentation: node?.dataset.activeRepresentation || "",
        hasSnapshot: Boolean(node?.querySelector(".canvas2d-presentation-snapshot")),
        html: node?.innerHTML || "",
        scrollWidth: Number(node?.scrollWidth || 0),
        clientWidth: Number(node?.clientWidth || 0),
        scrollHeight: Number(node?.scrollHeight || 0),
        clientHeight: Number(node?.clientHeight || 0),
        hasSvg: Boolean(svg),
        hasLegacyPlaceholder: Boolean(node?.querySelector(".canvas2d-rich-skeleton, .canvas2d-rich-skeleton-svg")),
        padding: node ? getComputedStyle(node).padding : "",
      };
    });
    const firstRecovered = await readRecovered();
    await session.page.evaluate(async () => {
      for (let index = 0; index < 10; index += 1) {
        if (window.__canvas2dEngine.getSnapshot().board.view.scale <= 0.14) break;
        window.__canvas2dEngine.zoomOut();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
    });
    await session.page.waitForTimeout(300);
    const hiddenAgain = await session.page.evaluate(() => {
      const hostStyle = getComputedStyle(document.querySelector("#canvas2d-rich-display"));
      const node = document.querySelector('.canvas2d-rich-item[data-id="text-stability"]');
      return {
        hostHidden: hostStyle.visibility === "hidden" || hostStyle.display === "none",
        nodeMissing: !node,
        activeRepresentation: node?.dataset.activeRepresentation || "",
        text: node?.textContent || "",
        hasSnapshot: Boolean(node?.querySelector(".canvas2d-presentation-snapshot")),
        scale: window.__canvas2dEngine.getSnapshot().board.view.scale,
      };
    });
    const secondRecoveredScale = await session.page.evaluate(async () => {
      for (let index = 0; index < 10; index += 1) {
        if (window.__canvas2dEngine.getSnapshot().board.view.scale >= 0.23) break;
        window.__canvas2dEngine.zoomIn();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      return window.__canvas2dEngine.getSnapshot().board.view.scale;
    });
    await session.page.waitForTimeout(800);
    const secondRecovered = await readRecovered();
    const result = { beforeHidden, firstRecoveredScale, firstRecovered, hiddenAgain, secondRecoveredScale, secondRecovered };
    assert(session.getErrors().length === 0, "text summary stability check produced page errors", session.getErrors());
    for (const lowZoomState of [beforeHidden, hiddenAgain]) {
      assert(
        !lowZoomState.nodeMissing &&
          !lowZoomState.hostHidden &&
          lowZoomState.activeRepresentation === "frozen-detail" &&
          lowZoomState.text === beforeHidden.text &&
          !lowZoomState.hasSnapshot,
        "low zoom text did not preserve its frozen layout detail",
        result
      );
    }
    assert(firstRecovered.contentMode === "detail", "text overlay did not recover in detail mode", result);
    assert(secondRecovered.contentMode === "detail", "text overlay did not recover after repeated threshold crossing", result);
    for (const recovered of [firstRecovered, secondRecovered]) {
      assert(
        recovered.hostHidden === false &&
          recovered.activeRepresentation === recovered.plannedRepresentation &&
          (recovered.activeRepresentation !== "exact-snapshot" || recovered.hasSnapshot),
        "text overlay did not resolve the unified plan after threshold recovery",
        result
      );
    }
    assert(
      firstRecovered.plannedRepresentation && secondRecovered.plannedRepresentation,
      "text overlay did not receive the unified presentation plan",
      result
    );
    assert(
      !firstRecovered.hasSvg && !secondRecovered.hasSvg &&
        !firstRecovered.hasLegacyPlaceholder && !secondRecovered.hasLegacyPlaceholder,
      "text detail overlay retained a stale summary skeleton",
      result
    );
    assert(firstRecovered.html === secondRecovered.html, "text detail content changed after threshold recovery", result);
    for (const recovered of [firstRecovered, secondRecovered]) {
      assert(recovered.padding === "0px", "text detail host retained unexpected padding", result);
      assert(recovered.scrollWidth <= recovered.clientWidth, "text detail overlay overflowed width", result);
      assert(recovered.scrollHeight <= recovered.clientHeight, "text detail overlay overflowed height", result);
    }
    return result;
  } finally {
    await session.page.close();
  }
}

async function runOverlayBudgetReconciliationCheck(browser) {
  const board = createBoard([createTextItem("overlay-reconcile", 420, 180, "Overlay budget reconciliation")]);
  const session = await createPage(browser, { board });
  try {
    await session.page.waitForFunction(() =>
      document.querySelector('.canvas2d-rich-item[data-id="overlay-reconcile"]')?.dataset.contentMode === "detail"
    );
    const cycles = await session.page.evaluate(async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const missing = [];
      for (let index = 0; index < 50; index += 1) {
        window.__canvas2dEngine.clearBoard();
        await waitFrame();
        if (document.querySelector('.canvas2d-rich-item[data-id="overlay-reconcile"]')) {
          missing.push(`clear:${index}`);
        }
        window.__canvas2dEngine.undo();
        await waitFrame();
        if (!document.querySelector('.canvas2d-rich-item[data-id="overlay-reconcile"]')) {
          missing.push(`restore:${index}`);
        }
      }
      await waitFrame();
      return { missing };
    });
    await session.page.waitForFunction(() =>
      document.querySelector('.canvas2d-rich-item[data-id="overlay-reconcile"]')?.dataset.contentMode === "detail"
    );
    const result = await session.page.evaluate((cycleResult) => {
      const actualRich = document.querySelectorAll("#canvas2d-rich-display .canvas2d-rich-item[data-id]").length;
      return {
        ...cycleResult,
        actualRich,
        overlayStats: window.__ffOverlayStats || null,
      };
    }, cycles);
    assert(session.getErrors().length === 0, "overlay budget reconciliation produced page errors", session.getErrors());
    assert(result.missing.length === 0, "overlay did not recover during rapid board clear/restore cycles", result);
    assert(result.actualRich === 1, "rich overlay did not recover after rapid board switching", result);
    assert(result.overlayStats?.activeByType?.rich === result.actualRich, "overlay budget drifted from the DOM count", result);
    assert(result.overlayStats?.active === result.actualRich, "overlay total drifted from the DOM count", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runFileCardLodThresholdCheck(browser) {
  const board = createBoard(
    [createFileCardItem("filecard-lod", 2400, 1600, "项目文件夹")],
    ["filecard-lod"],
    { scale: 0.15, offsetX: 40, offsetY: 32 }
  );
  const session = await createPage(browser, { board });
  try {
    await session.page.waitForTimeout(240);
    const selected = await session.page.evaluate(() => {
      const stats = document.querySelector("#canvas-office-canvas")?.__ffRenderStats || null;
      return { stats, selectedIds: window.__canvas2dEngine.getSnapshot().board.selectedIds };
    });
    const canvasRect = await session.page.locator(MAIN_CANVAS_SELECTOR).boundingBox();
    await session.page.mouse.click(canvasRect.x + 1000, canvasRect.y + 700);
    await session.page.waitForTimeout(240);
    const compact = await session.page.evaluate(() => ({
      stats: document.querySelector("#canvas-office-canvas")?.__ffRenderStats || null,
      selectedIds: window.__canvas2dEngine.getSnapshot().board.selectedIds,
    }));
    await session.page.mouse.click(
      canvasRect.x + 40 + (2400 + 160) * 0.15,
      canvasRect.y + 32 + (1600 + 60) * 0.15
    );
    await session.page.waitForTimeout(240);
    const recovered = await session.page.evaluate(() => ({
      stats: document.querySelector("#canvas-office-canvas")?.__ffRenderStats || null,
      selectedIds: window.__canvas2dEngine.getSnapshot().board.selectedIds,
    }));
    const result = { selected, compact, recovered };
    assert(session.getErrors().length === 0, "fileCard lod threshold check produced page errors", session.getErrors());
    assert(selected.selectedIds.includes("filecard-lod"), "fileCard selection precondition was lost", result);
    assert(Number(selected.stats?.lodSimplifiedCount || 0) === 0, "selected fileCard was incorrectly compacted", result);
    assert(compact.selectedIds.length === 0, "fileCard did not leave the selected state", result);
    assert(
      Number(compact.stats?.lodSimplifiedCount || 0) >= 1,
      "unselected fileCard did not switch to semantic compact presentation",
      result
    );
    assert(recovered.selectedIds.includes("filecard-lod"), "fileCard was not reselected after compact presentation", result);
    assert(Number(recovered.stats?.lodSimplifiedCount || 0) === 0, "reselected fileCard retained stale compact presentation", result);
    return result;
  } finally {
    await session.page.close();
  }
}

async function runPasteSemanticChecks(browser) {
  const cases = [
    {
      key: "plainText",
      text: "hello canvas",
      verify: (items) => {
        const target = items.find((item) => item.plainText === "hello canvas");
        assert(Boolean(target), "plain text paste did not create text item", items);
        assert(target.type === "text", "plain text paste should create text item", target);
      },
    },
    {
      key: "markdownTable",
      text: "| Name | Status |\n| --- | --- |\n| Parser | Done |",
      verify: (items) => {
        const target = items.find((item) => item.type === "table");
        assert(Boolean(target), "markdown table paste did not create table item", items);
      },
    },
    {
      key: "codeFence",
      text: "```javascript\nconst total = 3;\nconsole.log(total);\n```",
      verify: (items) => {
        const target = items.find((item) => item.type === "codeBlock");
        assert(Boolean(target), "code fence paste did not create codeBlock item", items);
        assert(target.language === "javascript", "code fence paste lost language tag", target);
      },
    },
    {
      key: "inlineMath",
      text: "基础运算：$a_n + x^{k+1}$",
      verify: (items) => {
        const target = items.find((item) => item.type === "text" && /math-inline/i.test(String(item.html || "")));
        assert(Boolean(target), "inline math paste did not create rich text math item", items);
      },
    },
    {
      key: "richHtmlTypographyScale",
      text: "一级标题\n副标题正文\n普通正文",
      html: `
        <h1><span style="font-size:48px">一级标题</span></h1>
        <div><span style="font-size:16px">副标题正文</span></div>
        <div><span style="font-size:13px">普通正文</span></div>
      `,
      verify: (items) => {
        const textItems = items.filter((item) => item.type === "text");
        assert(textItems.length >= 1, "rich html typography paste did not create text items", items);
        const html = textItems.map((item) => String(item.html || "")).join("\n");
        assert(/<h1[\s>]/i.test(html), "rich html typography paste lost heading semantics", textItems);
        assert(!/<h1\b[^>]*>[\s\S]*?data-ff-font-size[\s\S]*?<\/h1>/i.test(html), "heading kept imported inline font-size", html);
        assert(!/data-ff-font-size=/i.test(html), "body text kept imported webpage body font-size", html);
      },
    },
  ];

  const result = {};
  for (const scenario of cases) {
    const session = await createPage(browser, { board: createBoard([], [], { scale: 1, offsetX: 0, offsetY: 0 }) });
    try {
      await dispatchCanvasPaste(session.page, { text: scenario.text, html: scenario.html || "" });
      const snapshotItems = await session.page.evaluate(() => window.__canvas2dEngine?.getSnapshot?.()?.board?.items || []);
      scenario.verify(snapshotItems);
      assert(session.getErrors().length === 0, `paste semantic check ${scenario.key} produced page errors`, session.getErrors());
      result[scenario.key] = {
        itemCount: snapshotItems.length,
        types: snapshotItems.map((item) => item.type),
      };
    } finally {
      await session.page.close();
    }
  }
  return result;
}

async function runElementContextMenuClipboardCheck(browser) {
  const result = {};

  const codeSession = await createPage(browser, {
    board: createBoard([createCodeBlockItem("code-copy", 420, 160, "const answer = 42;\\nconsole.log(answer);")]),
  });
  try {
    await codeSession.page.evaluate(() => {
      document.querySelector('.canvas2d-code-block-item[data-id="code-copy"]')?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 460,
          clientY: 220,
          button: 2,
        })
      );
    });
    await codeSession.page.waitForTimeout(120);
    await codeSession.page.evaluate(() => {
      document.querySelector('#canvas2d-context-menu [data-action="code-copy-text-markdown"]')?.click();
    });
    await codeSession.page.waitForTimeout(120);
    const markdownClipboard = await codeSession.page.evaluate(() => navigator.clipboard.__snapshot());
    assert(markdownClipboard?.types?.includes("text/markdown"), "code Markdown copy omitted text/markdown", markdownClipboard);
    assert(markdownClipboard?.markdown?.includes("```"), "code Markdown clipboard payload lost fenced code", markdownClipboard);
    await codeSession.page.evaluate(() => {
      document.querySelector('.canvas2d-code-block-item[data-id="code-copy"]')?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 460, clientY: 220, button: 2 })
      );
    });
    await codeSession.page.waitForTimeout(120);
    await clickContextMenuAction(codeSession.page, "copy");
    await rightClickBlankCanvas(codeSession.page);
    await clickContextMenuAction(codeSession.page, "paste");
    const clipboardSnapshot = await codeSession.page.evaluate(() => navigator.clipboard.__snapshot());
    const items = await codeSession.page.evaluate(() => window.__canvas2dEngine?.getSnapshot?.()?.board?.items || []);
    const codeBlocks = items.filter((item) => item.type === "codeBlock");
    const plainTexts = items.filter((item) => item.type === "text");
    assert(clipboardSnapshot?.itemCount >= 1, "codeBlock context-menu copy did not populate clipboard items", clipboardSnapshot);
    assert(codeBlocks.length === 2, "codeBlock context-menu copy/paste did not duplicate codeBlock element", items);
    assert(plainTexts.length === 0, "codeBlock context-menu paste regressed into plain text item", items);
    assert(codeSession.getErrors().length === 0, "codeBlock context-menu clipboard check produced page errors", codeSession.getErrors());
    result.codeBlock = {
      itemCount: items.length,
      types: items.map((item) => item.type),
      clipboard: clipboardSnapshot,
    };
  } finally {
    await codeSession.page.close();
  }

  const tableSession = await createPage(browser, {
    board: createBoard([createTableItem("table-copy", 220, 180)], ["table-copy"]),
  });
  try {
    await dispatchSyntheticCopyPasteRoundTrip(tableSession.page);
    const clipboardSnapshot = await tableSession.page.evaluate(() => navigator.clipboard.__snapshot());
    const items = await tableSession.page.evaluate(() => window.__canvas2dEngine?.getSnapshot?.()?.board?.items || []);
    const tables = items.filter((item) => item.type === "table");
    const plainTexts = items.filter((item) => item.type === "text");
    assert(clipboardSnapshot?.itemCount >= 1, "table copy did not populate clipboard items", clipboardSnapshot);
    assert(tables.length === 2, "table copy/paste did not duplicate table element", items);
    assert(plainTexts.length === 0, "table paste regressed into plain text item", items);
    assert(tableSession.getErrors().length === 0, "table clipboard check produced page errors", tableSession.getErrors());
    result.table = {
      itemCount: items.length,
      types: items.map((item) => item.type),
      clipboard: clipboardSnapshot,
    };
  } finally {
    await tableSession.page.close();
  }

  const mixedSession = await createPage(browser, {
    board: createBoard(
      [
        createTextItem("mixed-copy-text", 220, 180, "Structured text"),
        createRectShape("mixed-copy-shape", 480, 180, 160, 100),
      ],
      ["mixed-copy-text", "mixed-copy-shape"]
    ),
  });
  try {
    await mixedSession.page.evaluate(() => {
      const canvas = document.querySelector("#canvas-office-canvas");
      const rect = canvas?.getBoundingClientRect?.();
      canvas?.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: Number(rect?.left || 0) + 440,
        clientY: Number(rect?.top || 0) + 230,
        button: 2,
      }));
    });
    await mixedSession.page.waitForTimeout(120);
    await mixedSession.page.evaluate(() => {
      document.querySelector('#canvas2d-context-menu [data-action="copy-selected-html"]')?.click();
    });
    await mixedSession.page.waitForTimeout(180);
    const mixedCopy = await mixedSession.page.evaluate(async () => ({
      clipboard: await navigator.clipboard.__snapshot(),
      statusText: window.__canvas2dEngine?.getSnapshot?.()?.statusText || "",
    }));
    assert(mixedCopy.clipboard?.types?.includes("text/html"), "mixed selection copy omitted rich HTML", mixedCopy);
    assert(mixedCopy.clipboard?.html?.includes("Structured text"), "mixed selection copy lost supported text", mixedCopy);
    assert(/跳过\s*1\s*个/.test(mixedCopy.statusText), "mixed selection copy hid skipped-element feedback", mixedCopy);
    assert(mixedSession.getErrors().length === 0, "mixed selection copy produced page errors", mixedSession.getErrors());
    result.mixedSelection = mixedCopy;
  } finally {
    await mixedSession.page.close();
  }

  return result;
}

async function runUnifiedFrameLifecycleCheck(browser) {
  const session = await createPage(browser, {
    board: createBoard([
      createTextItem("frame-text", 180, 180, "Frame contract"),
      createCodeBlockItem("frame-code", 440, 180, "const frame = true;"),
      createRectShape("frame-shape", 260, 360, 180, 120),
    ]),
  });
  try {
    await session.page.evaluate(async () => {
      window.__canvas2dEngine?.resize?.();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const before = await session.page.evaluate(() => {
      const snapshot = window.__canvas2dEngine?.getSnapshot?.();
      const stats = window.__ffRenderStats;
      return {
        frame: stats?.frameContext || null,
        view: snapshot?.board?.view || null,
        overlayFrames: {
          rich: document.querySelector("#canvas2d-rich-display")?.dataset?.frameId || "",
          math: document.querySelector("#canvas2d-math-display")?.dataset?.frameId || "",
          code: document.querySelector("#canvas2d-code-block-display")?.dataset?.frameId || "",
        },
        runtime: window.__canvas2dEngine?.getElementRuntimeSnapshot?.() || null,
        registry: window.__canvas2dEngine?.getElementRegistrySnapshot?.() || null,
      };
    });
    assert(before.frame?.frameId > 0, "unified frame context was not published", before);
    assert(JSON.stringify(before.frame.camera) === JSON.stringify(before.view), "render camera diverged from board view", before);
    assert(Object.values(before.overlayFrames).every((value) => Number(value) === before.frame.frameId), "overlay frame revisions diverged", before);
    assert(before.registry?.ok === true && before.registry.types?.length >= 13, "element registry is incomplete", before.registry);
    assert(before.runtime?.states?.["frame-text"] === "visible", "text lifecycle did not enter visible", before.runtime);
    assert(before.runtime?.states?.["frame-code"] === "visible", "code lifecycle did not enter visible", before.runtime);

    const canvasRect = await session.page.locator(MAIN_CANVAS_SELECTOR).boundingBox();
    await session.page.keyboard.down("Control");
    for (let index = 0; index < 6; index += 1) {
      await session.page.mouse.move(canvasRect.x + 520, canvasRect.y + 360);
      await session.page.mouse.wheel(0, index % 2 === 0 ? -90 : 70);
      await session.page.waitForTimeout(28);
    }
    await session.page.keyboard.up("Control");
    await session.page.waitForTimeout(360);

    const recovered = await session.page.evaluate(() => {
      const snapshot = window.__canvas2dEngine?.getSnapshot?.();
      const stats = window.__ffRenderStats;
      return {
        frame: stats?.frameContext || null,
        runtimeMode: stats?.runtimeMode || null,
        view: snapshot?.board?.view || null,
        overlayFrames: {
          rich: document.querySelector("#canvas2d-rich-display")?.dataset?.frameId || "",
          math: document.querySelector("#canvas2d-math-display")?.dataset?.frameId || "",
          code: document.querySelector("#canvas2d-code-block-display")?.dataset?.frameId || "",
        },
        runtime: window.__canvas2dEngine?.getElementRuntimeSnapshot?.() || null,
      };
    });
    assert(recovered.frame?.frameId > before.frame.frameId, "frame revision did not advance during repeated zoom", { before, recovered });
    assert(recovered.runtimeMode?.mode === "steady", "viewport interaction did not recover to steady", recovered);
    assert(JSON.stringify(recovered.frame.camera) === JSON.stringify(recovered.view), "recovered camera snapshot diverged", recovered);
    assert(Object.values(recovered.overlayFrames).every((value) => Number(value) === recovered.frame.frameId), "recovered overlay frames diverged", recovered);
    assert(recovered.runtime?.states?.["frame-text"] === "visible", "text lifecycle retained stale interaction state", recovered.runtime);
    assert(recovered.runtime?.states?.["frame-code"] === "visible", "code lifecycle retained stale interaction state", recovered.runtime);
    const rendererFallback = await session.page.evaluate(async () => {
      const calls = [];
      const baseRenderer = ({ item }) => {
        if (item?.id !== "frame-shape") {
          return false;
        }
        calls.push("base");
        return true;
      };
      baseRenderer.supportedTypes = ["shape"];
      const overrideRenderer = ({ item }) => {
        if (item?.id !== "frame-shape") {
          return false;
        }
        calls.push("override");
        return false;
      };
      overrideRenderer.supportedTypes = ["shape"];
      const removeBase = window.__canvas2dEngine.registerElementRenderer(baseRenderer);
      const removeOverride = window.__canvas2dEngine.registerElementRenderer(overrideRenderer);
      window.__canvas2dEngine.resize();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      removeOverride();
      removeBase();
      window.__canvas2dEngine.resize();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return calls;
    });
    assert(
      rendererFallback.some((value, index) => value === "override" && rendererFallback[index + 1] === "base"),
      "renderer returning false did not fall back to the previous typed renderer",
      rendererFallback
    );

    const extension = await session.page.evaluate(async () => {
      const engine = window.__canvas2dEngine;
      const definition = {
        type: "testSticker",
        normalize: (item) => ({ ...item, type: "testSticker" }),
        getBounds: (item) => ({
          left: Number(item.x || 0),
          top: Number(item.y || 0),
          right: Number(item.x || 0) + Number(item.width || 1),
          bottom: Number(item.y || 0) + Number(item.height || 1),
        }),
        translate: (item, dx, dy) => ({ ...item, x: Number(item.x || 0) + dx, y: Number(item.y || 0) + dy }),
        resize: (item) => item,
        capabilities: {
          render: "canvas",
          lod: "full",
          hitTest: "bounds",
          handles: "bounds",
          editor: "none",
          overlay: "none",
          resource: "none",
          layer: "scene",
          cache: "tile",
          marquee: true,
          visibility: "always",
          objectCopy: true,
          contentCopy: "none",
          selectionCopy: "none",
          copyExportProtocol: "none",
          visualExport: ["png", "pdf"],
          semanticExport: [],
          dependencyClosure: "none",
          measurement: "bounds",
          persistence: "inline",
        },
      };
      const dispose = engine.registerElementDefinition(definition);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const registered = engine.getElementRegistrySnapshot();
      dispose();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const removed = engine.getElementRegistrySnapshot();
      const disposeReplacement = engine.registerElementDefinition(definition);
      dispose();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const staleDisposeIgnored = engine.getElementRegistrySnapshot();
      disposeReplacement();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const replacementRemoved = engine.getElementRegistrySnapshot();
      return {
        registered: registered.types.includes("testSticker") && registered.ok,
        removed: !removed.types.includes("testSticker") && removed.ok,
        staleDisposeIgnored: staleDisposeIgnored.types.includes("testSticker") && staleDisposeIgnored.ok,
        replacementRemoved: !replacementRemoved.types.includes("testSticker") && replacementRemoved.ok,
      };
    });
    assert(extension.registered === true, "runtime element definition did not register", extension);
    assert(extension.removed === true, "runtime element definition did not unregister cleanly", extension);
    assert(extension.staleDisposeIgnored === true, "stale definition disposer removed a later registration", extension);
    assert(extension.replacementRemoved === true, "replacement definition did not unregister cleanly", extension);
    assert(session.getErrors().length === 0, "unified frame lifecycle check produced page errors", session.getErrors());
    return { before, recovered, rendererFallback, extension, repeatedZoomCycles: 6 };
  } finally {
    await session.page.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const report = {
    baseUrl: BASE_URL,
    checks: {},
  };
  try {
    report.checks.codeBlockOverlayBrowser = await runCodeBlockOverlayCheck(browser, { desktopShell: false });
    report.checks.codeBlockOverlayDesktopStub = await runCodeBlockOverlayCheck(browser, { desktopShell: true });
    report.checks.mathOverlayStandalone = await runMathOverlayStandaloneCheck(browser);
    report.checks.tableEditor = await runTableEditorCheck(browser);
    report.checks.panRealtime = await runPanRealtimeCheck(browser);
    report.checks.viewportInteractionRecovery = await runViewportInteractionRecoveryCheck(browser);
    report.checks.selectionDragRealtime = await runSelectionDragRealtimeCheck(browser);
    report.checks.marqueeMultiSelect = await runMarqueeMultiSelectCheck(browser);
    report.checks.localizedTileInvalidation = await runLocalizedTileInvalidationCheck(browser);
    report.checks.backgroundLayerReuse = await runBackgroundLayerReuseCheck(browser);
    report.checks.largeViewportPixelBudget = await runLargeViewportPixelBudgetCheck(browser);
    report.checks.tileScaleRecovery = await runTileScaleRecoveryCheck(browser);
    report.checks.undoPatch = await runUndoPatchCheck(browser);
    report.checks.mindMapBasic = await runMindMapBasicCheck(browser);
    report.checks.mindMapDragConnection = await runMindMapDragConnectionCheck(browser);
    report.checks.mindMapReparent = await runMindMapReparentCheck(browser);
    report.checks.mindMapDropFeedback = await runMindMapDropFeedbackCheck(browser);
    report.checks.mindMapStructureActions = await runMindMapStructureActionsCheck(browser);
    report.checks.mindMapAncestorReparent = await runMindMapAncestorReparentCheck(browser);
    report.checks.mindMapSummary = await runMindMapSummaryCheck(browser);
    report.checks.mindMapRelationship = await runMindMapRelationshipCheck(browser);
    report.checks.mindMapSubtreeReparent = await runMindMapSubtreeReparentCheck(browser);
    report.checks.lowZoomOverlaySummary = await runLowZoomOverlaySummaryCheck(browser);
    report.checks.textSummaryStability = await runTextSummaryStabilityCheck(browser);
    report.checks.overlayBudgetReconciliation = await runOverlayBudgetReconciliationCheck(browser);
    report.checks.fileCardLodThreshold = await runFileCardLodThresholdCheck(browser);
    report.checks.pasteSemantic = await runPasteSemanticChecks(browser);
    report.checks.elementContextMenuClipboard = await runElementContextMenuClipboardCheck(browser);
    report.checks.unifiedFrameLifecycle = await runUnifiedFrameLifecycleCheck(browser);
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          ...report,
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
