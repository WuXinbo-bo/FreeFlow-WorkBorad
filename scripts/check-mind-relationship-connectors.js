const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:3000/canvas-office.html";
const STORAGE_KEY = "ai_worker_canvas_office_board_v3";

function assert(condition, message, detail = "") {
  if (!condition) {
    const suffix = detail ? `\n${detail}` : "";
    throw new Error(`${message}${suffix}`);
  }
}

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
    columns: 2,
    rows: 2,
    locked: false,
    createdAt: Date.now(),
    table: {
      title: "表格",
      columns: 2,
      hasHeader: true,
      rows: [
        {
          rowIndex: 0,
          cells: [
            { rowIndex: 0, cellIndex: 0, plainText: "A", header: true, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 0, cellIndex: 1, plainText: "B", header: true, align: "", colSpan: 1, rowSpan: 1 },
          ],
        },
        {
          rowIndex: 1,
          cells: [
            { rowIndex: 1, cellIndex: 0, plainText: "1", header: false, align: "", colSpan: 1, rowSpan: 1 },
            { rowIndex: 1, cellIndex: 1, plainText: "2", header: false, align: "", colSpan: 1, rowSpan: 1 },
          ],
        },
      ],
    },
  };
}

function createImageItem(id, x, y) {
  return {
    id,
    type: "image",
    name: "图片",
    mime: "image/png",
    source: "blob",
    sourcePath: "",
    fileId: "",
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=",
    x,
    y,
    width: 120,
    height: 120,
    naturalWidth: 120,
    naturalHeight: 120,
    rotation: 0,
    flipX: false,
    flipY: false,
    brightness: 0,
    contrast: 0,
    crop: null,
    annotations: {
      lines: [],
      texts: [],
      rects: [],
      arrows: [],
    },
    memo: "",
    memoVisible: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    structuredImport: null,
  };
}

function createShapeItem(id, x, y) {
  return {
    id,
    type: "shape",
    shapeType: "rect",
    x,
    y,
    width: 180,
    height: 100,
    startX: x,
    startY: y,
    endX: x + 180,
    endY: y + 100,
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

function createBoard(items = []) {
  return {
    items,
    selectedIds: [],
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    preferences: {
      allowLocalFileAccess: true,
      backgroundPattern: "none",
    },
  };
}

async function waitForStableCanvas(page) {
  await page.waitForFunction(() => Boolean(window.__canvas2dEngine && document.querySelector("canvas")), null, {
    timeout: 15000,
  });
  await page.addStyleTag({
    content: `
      html, body, #canvas-office-root, .canvas-office-root, .canvas-office-shell, .canvas-office-main, .canvas-office-surface {
        min-height: 100vh !important;
        height: 100vh !important;
      }
      body { margin: 0 !important; }
    `,
  });
  await page.evaluate(() => {
    window.__canvas2dEngine?.resize?.();
  });
  await page.waitForTimeout(180);
}

async function createPage(browser, board) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message || String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") {
      pageErrors.push(message.text());
    }
  });
  await page.addInitScript(
    ({ storageKey, payload }) => {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    },
    { storageKey: STORAGE_KEY, payload: board }
  );
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await waitForStableCanvas(page);
  return { page, getErrors: () => pageErrors.slice() };
}

async function getCanvasBox(page) {
  const box = await page.locator("canvas").boundingBox();
  assert(box, "canvas bounding box unavailable");
  return box;
}

async function getItemScreenCenter(page, itemId) {
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
  assert(metrics, `missing metrics for ${itemId}`);
  return metrics;
}

async function rightClickItem(page, itemId) {
  const box = await getCanvasBox(page);
  const center = await getItemScreenCenter(page, itemId);
  await page.mouse.click(box.x + center.x, box.y + center.y);
  await page.waitForTimeout(80);
  await page.mouse.click(box.x + center.x, box.y + center.y, { button: "right" });
  await page.waitForTimeout(120);
}

async function leftClickItem(page, itemId) {
  const box = await getCanvasBox(page);
  const center = await getItemScreenCenter(page, itemId);
  await page.mouse.click(box.x + center.x, box.y + center.y);
  await page.waitForTimeout(140);
}

async function clickContextAction(page, action) {
  const menuItem = page.locator(`#canvas2d-context-menu [data-action="${action}"]`).first();
  await menuItem.waitFor({ state: "visible", timeout: 2000 });
  await menuItem.click();
  await page.waitForTimeout(140);
}

async function getRelationships(page) {
  return page.evaluate(() => {
    const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
    return (snapshot?.board?.items || []).filter((item) => item?.type === "mindRelationship");
  });
}

async function addRelationshipViaApi(page, sourceId, targetId) {
  return page.evaluate(
    ({ source, target }) => window.__canvas2dEngine?.addMindRelationship?.(source, target) || false,
    { source: sourceId, target: targetId }
  );
}

async function assertMenuMarkupHasConnectAction(page) {
  const result = await page.evaluate(async () => {
    const menuModule = await import("/src/engines/canvas2d-core/contextMenu/menuSchemaBuilders.js");
    const fileModule = await import("/src/engines/canvas2d-core/fileCardModule.js");
    const imageModule = await import("/src/engines/canvas2d-core/imageModule.js");
    return {
      richText: menuModule.buildRichTextItemContextMenuHtml({ isNode: false }),
      codeBlock: menuModule.buildCodeBlockContextMenuHtml(),
      table: menuModule.buildTableContextMenuHtml({ editing: false, selectionMode: "cell" }),
      math: menuModule.buildMathContextMenuHtml(),
      fileCard: fileModule.buildFileCardContextMenuHtml({ locked: false, ext: "" }),
      image: imageModule.buildImageContextMenuHtml({ locked: false }),
    };
  });
  Object.entries(result).forEach(([key, html]) => {
    assert(String(html || "").includes('data-action="connect-node"'), `missing connect-node markup for ${key}`);
  });
}

async function assertSourceCanConnect(page, sourceId, targetId) {
  const before = await getRelationships(page);
  const createdByApi = await addRelationshipViaApi(page, sourceId, targetId);
  assert(createdByApi, `addMindRelationship api returned false for ${sourceId} -> ${targetId}`);
  const after = await getRelationships(page);
  assert(
    after.length === before.length + 1,
    `relationship count did not increase for source ${sourceId}`,
    JSON.stringify({ before: before.length, after: after.length }, null, 2)
  );
  const created = after.find(
    (item) =>
      !before.some((prev) => prev.id === item.id) &&
      String(item.fromId || "") === String(sourceId) &&
      String(item.toId || "") === String(targetId)
  );
  assert(created, `created relationship missing expected endpoints for ${sourceId} -> ${targetId}`, JSON.stringify(after, null, 2));
}

async function main() {
  const secondaryTargetText = createTextItem("text-target", 1020, 320, "目标文本");
  const sources = [
    createTextItem("text-source", 80, 80, "源文本"),
    createFileCardItem("file-source", 80, 220, "项目文件"),
    createImageItem("image-source", 80, 400),
    createCodeBlockItem("code-source", 80, 570, "const ok = true;"),
    createTableItem("table-source", 460, 80),
    createMathBlockItem("math-source", 460, 360, "E=mc^2"),
    createShapeItem("shape-source", 460, 560),
  ];

  const board = createBoard([...sources, secondaryTargetText]);
  const browser = await chromium.launch({ headless: true });
  const session = await createPage(browser, board);
  try {
    const targetNodeId = await session.page.evaluate(() => {
      window.__canvas2dEngine.addFlowNode();
      const snapshot = window.__canvas2dEngine.getSnapshot();
      const node = (snapshot?.board?.items || []).find((item) => item?.type === "mindNode");
      return node?.id || "";
    });
    assert(targetNodeId, "failed to create target mind node");
    await assertMenuMarkupHasConnectAction(session.page);
    for (const source of sources) {
      await assertSourceCanConnect(session.page, source.id, targetNodeId);
    }
    await assertSourceCanConnect(session.page, "text-source", secondaryTargetText.id);
    const relationships = await getRelationships(session.page);
    assert(relationships.length === sources.length + 1, "unexpected final relationship count", JSON.stringify(relationships, null, 2));
    const errors = session.getErrors().filter((entry) => !/favicon/i.test(entry));
    assert(errors.length === 0, "page reported runtime errors", errors.join("\n"));
    console.log("[mind-relationship-connectors] ok");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
