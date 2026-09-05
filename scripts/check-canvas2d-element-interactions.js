"use strict";

const { chromium } = require("playwright");

const CURRENT_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:53127/canvas-office.html";
const BASELINE_URL = String(process.env.CANVAS_BASELINE_URL || "").trim();
const STORAGE_KEY = "ai_worker_canvas_office_board_v3";
const CANVAS_SELECTOR = "#canvas-office-canvas";
const VIEW = Object.freeze({ scale: 0.75, offsetX: 80, offsetY: 48 });
const DRAG_SCREEN_DELTA = Object.freeze({ x: 48, y: 30 });
const RESIZE_SCREEN_DELTA = Object.freeze({ x: 36, y: 24 });
const KIND_FILTER = new Set(
  String(process.env.CANVAS_CONTRACT_KINDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

function now() {
  return Date.now();
}

function createBoard(items = [], selectedIds = []) {
  return {
    items,
    selectedIds,
    view: { ...VIEW },
    preferences: {
      allowLocalFileAccess: true,
      backgroundPattern: "none",
    },
  };
}

function createText(id, x = 720, y = 520, text = "Interaction contract") {
  return {
    id,
    type: "text",
    x,
    y,
    width: 240,
    height: 72,
    text,
    plainText: text,
    html: text,
    fontSize: 20,
    color: "#0f172a",
    wrapMode: "manual",
    textBoxLayoutMode: "auto-width",
    textResizeMode: "auto-width",
    createdAt: now(),
    updatedAt: now(),
  };
}

function createCodeBlock(id, x = 720, y = 500) {
  return {
    id,
    type: "codeBlock",
    title: "javascript code",
    language: "javascript",
    code: "const stable = true;",
    text: "const stable = true;",
    plainText: "const stable = true;",
    fontSize: 16,
    x,
    y,
    width: 360,
    height: 168,
    wrap: false,
    showLineNumbers: true,
    headerVisible: true,
    collapsed: false,
    autoHeight: true,
    tabSize: 2,
    previewMode: "source",
    locked: false,
    createdAt: now(),
    updatedAt: now(),
  };
}

function createImage(id, x = 720, y = 500) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#dbeafe"/><circle cx="160" cy="90" r="48" fill="#2563eb"/></svg>';
  return {
    id,
    type: "image",
    name: "contract.svg",
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
    createdAt: now(),
    updatedAt: now(),
  };
}

function createTable(id, x = 720, y = 480) {
  return {
    id,
    type: "table",
    title: "Contract table",
    x,
    y,
    width: 520,
    height: 216,
    columns: 3,
    rows: 3,
    locked: false,
    createdAt: now(),
    table: {
      title: "Contract table",
      columns: 3,
      hasHeader: true,
      rows: [
        { rowIndex: 0, cells: ["Name", "State", "Owner"].map((plainText, cellIndex) => ({ rowIndex: 0, cellIndex, plainText, header: true, align: "", colSpan: 1, rowSpan: 1 })) },
        { rowIndex: 1, cells: ["Runtime", "Ready", "Canvas"].map((plainText, cellIndex) => ({ rowIndex: 1, cellIndex, plainText, header: false, align: "", colSpan: 1, rowSpan: 1 })) },
        { rowIndex: 2, cells: ["Recovery", "Ready", "Canvas"].map((plainText, cellIndex) => ({ rowIndex: 2, cellIndex, plainText, header: false, align: "", colSpan: 1, rowSpan: 1 })) },
      ],
    },
  };
}

function createFileCard(id, x = 720, y = 520) {
  return {
    id,
    type: "fileCard",
    name: "contract.md",
    fileName: "contract.md",
    title: "contract",
    ext: "md",
    mime: "text/markdown",
    sourcePath: "",
    fileId: "",
    size: 128,
    sizeLabel: "128 B",
    x,
    y,
    width: 336,
    height: 128,
    marked: false,
    memo: "",
    memoVisible: false,
    createdAt: now(),
    updatedAt: now(),
  };
}

function createShape(id, x = 720, y = 500) {
  return {
    id,
    type: "shape",
    shapeType: "rect",
    x,
    y,
    width: 260,
    height: 150,
    startX: x,
    startY: y,
    endX: x + 260,
    endY: y + 150,
    strokeColor: "#1e293b",
    fillColor: "rgba(59, 130, 246, 0.12)",
    strokeWidth: 2,
    lineDash: false,
    rotation: 0,
    radius: 18,
    createdAt: now(),
    updatedAt: now(),
  };
}

function createFlowNode(id, x = 720, y = 520, text = "Flow node") {
  return {
    id,
    type: "flowNode",
    x,
    y,
    width: 240,
    height: 104,
    text,
    plainText: text,
    html: text,
    fontSize: 18,
    color: "#0f172a",
    wrapMode: "flow",
    createdAt: now(),
    updatedAt: now(),
  };
}

function createFlowEdge(id, fromId, toId) {
  return {
    id,
    type: "flowEdge",
    fromId,
    fromSide: "right",
    toId,
    toSide: "left",
    style: "arrow",
    arrowDirection: "forward",
    createdAt: now(),
  };
}

function createMindNode(id, x = 720, y = 520, options = {}) {
  const text = String(options.text || "Mind node");
  return {
    id,
    type: "mindNode",
    title: text,
    text,
    plainText: text,
    html: text,
    x,
    y,
    width: 220,
    height: 80,
    fontSize: Number(options.fontSize || 18),
    color: "#0f172a",
    layoutMode: "horizontal",
    branchSide: String(options.branchSide || "right"),
    parentId: String(options.parentId || ""),
    rootId: String(options.rootId || id),
    depth: Number(options.depth || 0),
    order: Number(options.order || 0),
    collapsed: false,
    childrenIds: Array.isArray(options.childrenIds) ? options.childrenIds.slice() : [],
    links: [],
    textBoxLayoutMode: "auto-height",
    textResizeMode: "wrap",
    createdAt: now(),
    updatedAt: now(),
  };
}

function createMathBlock(id, x = 720, y = 520) {
  return {
    id,
    type: "mathBlock",
    title: "Formula",
    formula: "x^2 + y^2 = z^2",
    fallbackText: "$$x^2 + y^2 = z^2$$",
    sourceFormat: "latex",
    displayMode: true,
    renderState: "ready",
    x,
    y,
    width: 300,
    height: 96,
    locked: false,
    createdAt: now(),
    updatedAt: now(),
  };
}

function createMindSummaryFixture(targetId = "contract-mind-summary") {
  const rootId = "contract-mind-root";
  const childAId = "contract-mind-child-a";
  const childBId = "contract-mind-child-b";
  return createBoard([
    createMindNode(rootId, 120, 270, { text: "Root", childrenIds: [childAId, childBId] }),
    createMindNode(childAId, 460, 190, { text: "Branch A", parentId: rootId, rootId, depth: 1, order: 0 }),
    createMindNode(childBId, 460, 350, { text: "Branch B", parentId: rootId, rootId, depth: 1, order: 1 }),
    {
      id: targetId,
      type: "mindSummary",
      title: "Summary",
      text: "Summary",
      plainText: "Summary",
      html: "Summary",
      x: 840,
      y: 270,
      width: 220,
      height: 80,
      fontSize: 16,
      color: "#0f172a",
      layoutMode: "horizontal",
      branchSide: "right",
      parentId: "",
      rootId,
      depth: 1,
      order: 0,
      collapsed: false,
      childrenIds: [],
      siblingIds: [childAId, childBId],
      summaryOwnerId: rootId,
      links: [],
      textBoxLayoutMode: "auto-height",
      textResizeMode: "wrap",
      createdAt: now(),
      updatedAt: now(),
    },
  ]);
}

function createFixture(kind) {
  const id = `contract-${kind}`;
  if (kind === "text") return { id, board: createBoard([createText(id)]) };
  if (kind === "codeBlock") return { id, board: createBoard([createCodeBlock(id)]) };
  if (kind === "image") return { id, board: createBoard([createImage(id)]) };
  if (kind === "table") return { id, board: createBoard([createTable(id)]) };
  if (kind === "fileCard") return { id, board: createBoard([createFileCard(id)]) };
  if (kind === "shape") return { id, board: createBoard([createShape(id)]) };
  if (kind === "flowNode") return { id, board: createBoard([createFlowNode(id)]) };
  if (kind === "mindNode") return { id, board: createBoard([createMindNode(id)]) };
  if (kind === "mindSummary") return { id, board: createMindSummaryFixture(id) };
  if (kind === "formula") return { id, board: createBoard([createMathBlock(id)]) };
  throw new Error(`Unknown fixture type: ${kind}`);
}

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function assertNear(actual, expected, message, details = null, tolerance = 2) {
  assert(Number.isFinite(Number(actual)) && Math.abs(Number(actual) - Number(expected)) <= tolerance, message, {
    actual,
    expected,
    tolerance,
    details,
  });
}

async function readElementEditorMapping(page, editorSelector, itemId) {
  return page.evaluate(({ selector, targetId }) => {
    const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
    const item = snapshot?.board?.items?.find?.((entry) => String(entry.id) === String(targetId)) || null;
    const view = snapshot?.board?.view || { scale: 1, offsetX: 0, offsetY: 0 };
    const canvasRect = document.querySelector("#canvas-office-canvas")?.getBoundingClientRect?.() || null;
    const editor = document.querySelector(selector);
    const editorRect = editor?.getBoundingClientRect?.() || null;
    if (!item || !canvasRect || !editorRect) return null;
    const scale = Number(view.scale || 1) || 1;
    return {
      actual: { left: editorRect.left, top: editorRect.top, width: editorRect.width, height: editorRect.height },
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

function assertElementEditorMapping(mapping, itemId, editorType, label, { size = true } = {}) {
  assert(mapping, `${label}: editor mapping is unavailable`, mapping);
  assert(mapping.placement === "element", `${label}: editor is not element-local`, mapping);
  assert(mapping.itemId === itemId && mapping.editorType === editorType, `${label}: editor identity is stale`, mapping);
  assertNear(mapping.actual.left, mapping.expected.left, `${label}: editor left is detached from the element`, mapping);
  assertNear(mapping.actual.top, mapping.expected.top, `${label}: editor top is detached from the element`, mapping);
  if (size) {
    assertNear(mapping.actual.width, mapping.expected.width, `${label}: editor width is detached from the element`, mapping, 3);
    assertNear(mapping.actual.height, mapping.expected.height, `${label}: editor height is detached from the element`, mapping, 3);
  }
}

async function waitForFrames(page, timeout = 140) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (timeout > 0) {
    await page.waitForTimeout(timeout);
  }
}

async function createSession(browser, url, board) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message || String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(
    ({ storageKey, payload }) => localStorage.setItem(storageKey, JSON.stringify(payload)),
    { storageKey: STORAGE_KEY, payload: board }
  );
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction((selector) => Boolean(window.__canvas2dEngine && document.querySelector(selector)), CANVAS_SELECTOR);
  await page.addStyleTag({
    content: "html,body,#canvas-office-root,.canvas-office-root,.canvas-office-shell,.canvas-office-main,.canvas-office-surface{height:100vh!important;min-height:100vh!important}body{margin:0!important}",
  });
  await waitForFrames(page, 40);
  await page.evaluate(() => window.__canvas2dEngine?.resize?.({ immediate: true, reason: "contract-layout" }));
  await page.waitForFunction(() => document.querySelector("#canvas-office-canvas")?.getBoundingClientRect?.().width > 800);
  await waitForFrames(page, 180);
  return { page, errors };
}

async function waitForUnifiedPresentation(page, itemId) {
  try {
    await page.waitForFunction((targetId) => {
      const escapedId = globalThis.CSS?.escape ? CSS.escape(String(targetId)) : String(targetId).replace(/["\\]/g, "\\$&");
      return Boolean(
        document.querySelector(`.canvas2d-rich-item[data-id="${escapedId}"]`) ||
        document.querySelector(`.canvas2d-math-item[data-id="${escapedId}"]`) ||
        document.querySelector(`.canvas2d-code-block-item[data-id="${escapedId}"]`) ||
        document.querySelector(`.canvas2d-scene-content-item[data-id="${escapedId}"]`) ||
        document.querySelector(`.canvas2d-scene-vector-item[data-id="${escapedId}"]`)
      );
    }, itemId, { timeout: 4000 });
  } catch (error) {
    error.details = await page.evaluate((targetId) => {
      const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
      return {
        item: snapshot?.board?.items?.find?.((entry) => entry.id === targetId) || null,
        view: snapshot?.board?.view || null,
        stats: window.__ffRenderStats || document.querySelector("#canvas-office-canvas")?.__ffRenderStats || null,
        overlayHosts: {
          rich: document.querySelector("#canvas2d-rich-display")?.outerHTML?.slice?.(0, 320) || "",
          math: document.querySelector("#canvas2d-math-display")?.outerHTML?.slice?.(0, 320) || "",
          code: document.querySelector("#canvas2d-code-block-display")?.outerHTML?.slice?.(0, 320) || "",
        },
      };
    }, itemId);
    throw error;
  }
}

async function readState(page, itemId) {
  return page.evaluate((targetId) => {
    const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
    const item = snapshot?.board?.items?.find?.((entry) => String(entry.id) === String(targetId)) || null;
    if (!item) return null;
    const readCssBox = (node) => node ? {
      x: Number.parseFloat(node.style.left),
      y: Number.parseFloat(node.style.top),
      width: Number.parseFloat(node.style.width),
      height: Number.parseFloat(node.style.height),
      connected: node.isConnected,
      visible: getComputedStyle(node).visibility !== "hidden" && getComputedStyle(node).display !== "none",
    } : null;
    const readSvgBox = (node) => node ? {
      x: Number(node.getAttribute("x")),
      y: Number(node.getAttribute("y")),
      width: Number(node.getAttribute("width")),
      height: Number(node.getAttribute("height")),
      connected: node.isConnected,
      visible: getComputedStyle(node).display !== "none",
    } : null;
    const escapedId = globalThis.CSS?.escape ? CSS.escape(String(targetId)) : String(targetId).replace(/["\\]/g, "\\$&");
    const rich = document.querySelector(`.canvas2d-rich-item[data-id="${escapedId}"]`);
    const math = document.querySelector(`.canvas2d-math-item[data-id="${escapedId}"]`);
    const code = document.querySelector(`.canvas2d-code-block-item[data-id="${escapedId}"]`);
    const content = document.querySelector(`.canvas2d-scene-content-item[data-id="${escapedId}"]`);
    const vector = document.querySelector(`.canvas2d-scene-vector-item[data-id="${escapedId}"]`);
    let presentation = readCssBox(rich || math || code || content);
    if (!presentation && vector) {
      presentation = readSvgBox(
        vector.querySelector(".canvas2d-scene-shape-body,.canvas2d-scene-flow-node-body,.canvas2d-scene-mind-node-body")
      );
    }
    return {
      item: {
        id: item.id,
        type: item.type,
        x: Number(item.x || 0),
        y: Number(item.y || 0),
        width: Number(item.width || 0),
        height: Number(item.height || 0),
      },
      presentation,
      selectedIds: Array.isArray(snapshot?.board?.selectedIds) ? snapshot.board.selectedIds.slice() : [],
      editingId: snapshot?.editingId || null,
      editingType: snapshot?.editingType || null,
      hoverId: snapshot?.hoverId || null,
      view: { ...(snapshot?.board?.view || {}) },
      runtimeMode: window.__ffRenderStats?.runtimeMode?.mode || document.querySelector("#canvas-office-canvas")?.__ffRenderStats?.runtimeMode?.mode || "",
      scenePhase: document.querySelector("#canvas2d-scene-root")?.dataset?.phase || "",
    };
  }, itemId);
}

function assertPresentation(state, label) {
  assert(state?.presentation, `${label}: unified presentation node is missing`, state);
  assert(state.presentation.connected === true && state.presentation.visible === true, `${label}: presentation is not visibly connected`, state);
  assertNear(state.presentation.x, state.item.x, `${label}: presentation x diverged from model`, state);
  assertNear(state.presentation.y, state.item.y, `${label}: presentation y diverged from model`, state);
  if (state.item.width > 0 && state.presentation.width > 0) {
    assertNear(state.presentation.width, state.item.width, `${label}: presentation width diverged from model`, state, 3);
  }
  if (state.item.height > 0 && state.presentation.height > 0) {
    assertNear(state.presentation.height, state.item.height, `${label}: presentation height diverged from model`, state, 3);
  }
}

async function getScreenPoint(page, itemId, anchor = "center") {
  const point = await page.evaluate(({ targetId, targetAnchor }) => {
    const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
    const item = snapshot?.board?.items?.find?.((entry) => String(entry.id) === String(targetId)) || null;
    const view = snapshot?.board?.view || { scale: 1, offsetX: 0, offsetY: 0 };
    const canvas = document.querySelector("#canvas-office-canvas");
    if (!item || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const localX = targetAnchor === "se"
      ? Number(item.x || 0) + Number(item.width || 0)
      : Number(item.x || 0) + Number(item.width || 0) / 2;
    const localY = targetAnchor === "se"
      ? Number(item.y || 0) + Number(item.height || 0)
      : targetAnchor === "memo"
        ? Number(item.y || 0) + Number(item.height || 0) + 10
        : Number(item.y || 0) + Number(item.height || 0) / 2;
    return {
      x: rect.left + localX * Number(view.scale || 1) + Number(view.offsetX || 0),
      y: rect.top + localY * Number(view.scale || 1) + Number(view.offsetY || 0),
    };
  }, { targetId: itemId, targetAnchor: anchor });
  assert(point, `Could not resolve screen point for ${itemId}`, point);
  return point;
}

async function drag(page, start, delta, steps = 5) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps });
}

async function runMovableContract(browser, url, kind, assertUnifiedPresentation) {
  const fixture = createFixture(kind);
  const session = await createSession(browser, url, fixture.board);
  try {
    if (assertUnifiedPresentation) await waitForUnifiedPresentation(session.page, fixture.id);
    const initial = await readState(session.page, fixture.id);
    assert(initial, `${kind}: item missing after legacy normalization`);
    if (assertUnifiedPresentation) assertPresentation(initial, `${kind} initial`);
    const center = await getScreenPoint(session.page, fixture.id);
    await session.page.mouse.click(center.x, center.y);
    await waitForFrames(session.page, 40);
    const selected = await readState(session.page, fixture.id);
    assert(selected.selectedIds.length === 1 && selected.selectedIds[0] === fixture.id, `${kind}: click selection failed`, selected);

    await drag(session.page, center, DRAG_SCREEN_DELTA);
    await waitForFrames(session.page, 30);
    const moving = await readState(session.page, fixture.id);
    const expectedDx = DRAG_SCREEN_DELTA.x / Number(initial.view.scale || 1);
    const expectedDy = DRAG_SCREEN_DELTA.y / Number(initial.view.scale || 1);
    assertNear(moving.item.width, initial.item.width, `${kind}: moving changed element width`, { initial, moving }, 2);
    assertNear(moving.item.height, initial.item.height, `${kind}: moving changed element height`, { initial, moving }, 2);
    if (assertUnifiedPresentation) {
      assert(moving.presentation?.connected && moving.presentation?.visible, `${kind}: presentation disappeared during drag`, moving);
      assertNear(moving.presentation.x, initial.item.x + expectedDx, `${kind}: presentation x did not follow the pointer`, { initial, moving }, 3);
      assertNear(moving.presentation.y, initial.item.y + expectedDy, `${kind}: presentation y did not follow the pointer`, { initial, moving }, 3);
    }
    await session.page.mouse.up({ button: "left" });
    await waitForFrames(session.page, 180);
    const committed = await readState(session.page, fixture.id);
    assertNear(committed.item.x, initial.item.x + expectedDx, `${kind}: committed x diverged from the pointer`, { initial, committed }, 3);
    assertNear(committed.item.y, initial.item.y + expectedDy, `${kind}: committed y diverged from the pointer`, { initial, committed }, 3);
    assertNear(committed.item.width, initial.item.width, `${kind}: move commit changed element width`, { initial, committed }, 2);
    assertNear(committed.item.height, initial.item.height, `${kind}: move commit changed element height`, { initial, committed }, 2);
    if (assertUnifiedPresentation) assertPresentation(committed, `${kind} committed`);

    const movedCenter = await getScreenPoint(session.page, fixture.id);
    await drag(session.page, movedCenter, { x: -DRAG_SCREEN_DELTA.x, y: -DRAG_SCREEN_DELTA.y });
    await session.page.mouse.up({ button: "left" });
    await waitForFrames(session.page, 180);
    const recovered = await readState(session.page, fixture.id);
    assertNear(recovered.item.x, initial.item.x, `${kind}: reverse drag left stale x`, { initial, recovered }, 3);
    assertNear(recovered.item.y, initial.item.y, `${kind}: reverse drag left stale y`, { initial, recovered }, 3);
    assertNear(recovered.item.width, initial.item.width, `${kind}: reverse drag left stale width`, { initial, recovered }, 2);
    assertNear(recovered.item.height, initial.item.height, `${kind}: reverse drag left stale height`, { initial, recovered }, 2);
    if (assertUnifiedPresentation) {
      assertPresentation(recovered, `${kind} recovered`);
      assert(recovered.runtimeMode === "steady", `${kind}: runtime did not recover to steady`, recovered);
      assert(!recovered.scenePhase || recovered.scenePhase === "steady", `${kind}: scene did not recover to steady`, recovered);
    }
    assert(session.errors.length === 0, `${kind}: browser errors`, session.errors);
    return { initial: initial.item, moving: moving.item, committed: committed.item, recovered: recovered.item };
  } finally {
    await session.page.close();
  }
}

async function runResizeContract(browser, url, kind, assertUnifiedPresentation, strictRecovery = true) {
  const fixture = createFixture(kind);
  const session = await createSession(browser, url, fixture.board);
  try {
    if (assertUnifiedPresentation) await waitForUnifiedPresentation(session.page, fixture.id);
    const center = await getScreenPoint(session.page, fixture.id);
    await session.page.mouse.click(center.x, center.y);
    await waitForFrames(session.page, 40);
    const initial = await readState(session.page, fixture.id);
    const recoveryCycles = kind === "formula" || kind === "table" ? 3 : 1;
    const cycles = [];
    for (let cycle = 0; cycle < recoveryCycles; cycle += 1) {
      const handle = await getScreenPoint(session.page, fixture.id, "se");
      await drag(session.page, handle, RESIZE_SCREEN_DELTA, 4);
      await waitForFrames(session.page, 30);
      const resizing = await readState(session.page, fixture.id);
      if (kind === "formula") {
        assertNear(resizing.item.height, initial.item.height, `${kind}: active resize changed settled formula height`, { initial, resizing }, 2);
      }
      if (assertUnifiedPresentation) {
        assert(resizing.presentation?.connected && resizing.presentation?.visible, `${kind}: presentation disappeared during resize`, resizing);
        if (Number.isFinite(resizing.presentation.width) && resizing.presentation.width > 0) {
          assert(resizing.presentation.width > initial.item.width + 20, `${kind}: presentation width did not follow resize`, { initial, resizing });
        }
        if (Number.isFinite(resizing.presentation.height) && resizing.presentation.height > 0) {
          assert(resizing.presentation.height >= initial.item.height, `${kind}: presentation height regressed during resize`, { initial, resizing });
        }
      }
      await session.page.mouse.up({ button: "left" });
      await waitForFrames(session.page, 180);
      const committed = await readState(session.page, fixture.id);
      assert(committed.item.width > initial.item.width + 20, `${kind}: width was not committed after resize`, { initial, committed });
      assert(committed.item.height >= initial.item.height, `${kind}: height regressed after resize commit`, { initial, committed });
      if (assertUnifiedPresentation) assertPresentation(committed, `${kind} resize committed ${cycle + 1}`);

      const reverseHandle = await getScreenPoint(session.page, fixture.id, "se");
      await drag(session.page, reverseHandle, { x: -RESIZE_SCREEN_DELTA.x, y: -RESIZE_SCREEN_DELTA.y }, 4);
      await session.page.mouse.up({ button: "left" });
      await waitForFrames(session.page, 180);
      const recovered = await readState(session.page, fixture.id);
      if (strictRecovery) {
        assertNear(recovered.item.width, initial.item.width, `${kind}: reverse resize left stale width`, { initial, resizing, committed, recovered }, 4);
        assertNear(recovered.item.height, initial.item.height, `${kind}: reverse resize left stale height`, { initial, resizing, committed, recovered }, 4);
      }
      if (assertUnifiedPresentation) assertPresentation(recovered, `${kind} resize recovered ${cycle + 1}`);
      cycles.push({ resizing: resizing.item, committed: committed.item, recovered: recovered.item });
    }
    assert(session.errors.length === 0, `${kind}: resize browser errors`, session.errors);
    return { initial: initial.item, ...cycles[0], cycles };
  } finally {
    await session.page.close();
  }
}

const EDITOR_CONTRACTS = Object.freeze({
  text: { editingType: "text", selector: "#canvas-rich-editor" },
  formula: { editingType: "math", selector: "#canvas-text-editor" },
  codeBlock: { editingType: "code-block", selector: "#canvas-code-block-editor" },
  table: { editingType: "table", selector: "#canvas-table-editor" },
  flowNode: { editingType: "flow-node", selector: "#canvas-rich-editor" },
  mindNode: { editingType: "mind-node", selector: "#canvas-rich-editor" },
});

async function runEditorContract(browser, url, kind, assertUnifiedPresentation) {
  const fixture = createFixture(kind);
  const contract = EDITOR_CONTRACTS[kind];
  const session = await createSession(browser, url, fixture.board);
  try {
    if (assertUnifiedPresentation) await waitForUnifiedPresentation(session.page, fixture.id);
    const cycles = [];
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const center = await getScreenPoint(session.page, fixture.id);
      await session.page.mouse.dblclick(center.x, center.y);
      await waitForFrames(session.page, 80);
      const active = await readState(session.page, fixture.id);
      const editorVisible = await session.page.locator(contract.selector).evaluate((node) => !node.classList.contains("is-hidden") && getComputedStyle(node).display !== "none");
      assert(active.editingId === fixture.id && active.editingType === contract.editingType, `${kind}: editor did not enter expected state`, active);
      assert(editorVisible === true, `${kind}: editor surface is hidden`, active);
      if (assertUnifiedPresentation) {
        const initialMapping = await readElementEditorMapping(session.page, contract.selector, fixture.id);
        assertElementEditorMapping(initialMapping, fixture.id, contract.editingType, `${kind}: editor initial`, { size: kind !== "formula" });
      }
      if (kind === "table") {
        await session.page.locator('#canvas-table-toolbar [data-action="table-done"]').click();
      } else {
        await session.page.keyboard.press("Escape");
      }
      await waitForFrames(session.page, 180);
      const recovered = await readState(session.page, fixture.id);
      assert(!recovered.editingId && !recovered.editingType, `${kind}: editor left stale state after exit`, recovered);
      if (assertUnifiedPresentation) assertPresentation(recovered, `${kind} editor recovered ${cycle + 1}`);
      cycles.push({ active: { editingId: active.editingId, editingType: active.editingType }, recovered: { editingId: recovered.editingId, editingType: recovered.editingType } });
    }
    assert(session.errors.length === 0, `${kind}: editor browser errors`, session.errors);
    return cycles;
  } finally {
    await session.page.close();
  }
}

async function readConnection(page, connectionId, kind) {
  return page.evaluate(({ targetId, connectionKind }) => {
    const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
    const item = snapshot?.board?.items?.find?.((entry) => entry.id === targetId) || null;
    const items = Array.isArray(snapshot?.board?.items) ? snapshot.board.items : [];
    const selector = connectionKind === "flowEdge"
      ? `.canvas2d-scene-flow-edge-item[data-id="${targetId}"] .canvas2d-scene-flow-edge-line`
      : `.canvas2d-scene-mind-relationship-item[data-id="${targetId}"] .canvas2d-scene-mind-relationship-line`;
    const line = document.querySelector(selector);
    const resolvePoint = (node, side = "center") => {
      const x = Number(node?.x || 0);
      const y = Number(node?.y || 0);
      const width = Number(node?.width || 0);
      const height = Number(node?.height || 0);
      if (side === "left") return { x, y: y + height / 2 };
      if (side === "right") return { x: x + width, y: y + height / 2 };
      if (side === "top") return { x: x + width / 2, y };
      if (side === "bottom") return { x: x + width / 2, y: y + height };
      return { x: x + width / 2, y: y + height / 2 };
    };
    const fromItem = item ? items.find((entry) => entry.id === item.fromId) : null;
    const toItem = item ? items.find((entry) => entry.id === item.toId) : null;
    const fromPoint = resolvePoint(fromItem, connectionKind === "flowEdge" ? item?.fromSide : "center");
    const toPoint = resolvePoint(toItem, connectionKind === "flowEdge" ? item?.toSide : "center");
    return {
      exists: Boolean(item),
      selected: snapshot?.board?.selectedIds?.includes?.(targetId) || false,
      line: line ? {
        x1: Number(line.getAttribute("x1")),
        y1: Number(line.getAttribute("y1")),
        x2: Number(line.getAttribute("x2")),
        y2: Number(line.getAttribute("y2")),
        connected: line.isConnected,
      } : item && fromItem && toItem ? {
        x1: fromPoint.x,
        y1: fromPoint.y,
        x2: toPoint.x,
        y2: toPoint.y,
        connected: false,
      } : null,
    };
  }, { targetId: connectionId, connectionKind: kind });
}

async function getConnectionScreenPoint(page, connectionId, ratio = 0.35) {
  const point = await page.evaluate(({ targetId, targetRatio }) => {
    const selector = document.querySelector(`.canvas2d-scene-flow-edge-item[data-id="${targetId}"] .canvas2d-scene-flow-edge-line`)
      || document.querySelector(`.canvas2d-scene-mind-relationship-item[data-id="${targetId}"] .canvas2d-scene-mind-relationship-line`);
    const snapshot = window.__canvas2dEngine?.getSnapshot?.() || null;
    const view = snapshot?.board?.view || { scale: 1, offsetX: 0, offsetY: 0 };
    const canvas = document.querySelector("#canvas-office-canvas");
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const items = Array.isArray(snapshot?.board?.items) ? snapshot.board.items : [];
    const connection = items.find((entry) => entry.id === targetId) || null;
    const resolvePoint = (node, side = "center") => {
      const x = Number(node?.x || 0);
      const y = Number(node?.y || 0);
      const width = Number(node?.width || 0);
      const height = Number(node?.height || 0);
      if (side === "left") return { x, y: y + height / 2 };
      if (side === "right") return { x: x + width, y: y + height / 2 };
      if (side === "top") return { x: x + width / 2, y };
      if (side === "bottom") return { x: x + width / 2, y: y + height };
      return { x: x + width / 2, y: y + height / 2 };
    };
    const fromItem = connection ? items.find((entry) => entry.id === connection.fromId) : null;
    const toItem = connection ? items.find((entry) => entry.id === connection.toId) : null;
    const fromPoint = resolvePoint(fromItem, connection?.type === "flowEdge" ? connection.fromSide : "center");
    const toPoint = resolvePoint(toItem, connection?.type === "flowEdge" ? connection.toSide : "center");
    const x1 = selector ? Number(selector.getAttribute("x1")) : fromPoint.x;
    const y1 = selector ? Number(selector.getAttribute("y1")) : fromPoint.y;
    const x2 = selector ? Number(selector.getAttribute("x2")) : toPoint.x;
    const y2 = selector ? Number(selector.getAttribute("y2")) : toPoint.y;
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    const worldX = x1 + (x2 - x1) * targetRatio;
    const worldY = y1 + (y2 - y1) * targetRatio;
    return {
      x: rect.left + worldX * Number(view.scale || 1) + Number(view.offsetX || 0),
      y: rect.top + worldY * Number(view.scale || 1) + Number(view.offsetY || 0),
    };
  }, { targetId: connectionId, targetRatio: ratio });
  assert(point, `Could not resolve connection point for ${connectionId}`);
  return point;
}

async function runConnectionContract(browser, url, kind, assertUnifiedPresentation) {
  const connectionId = `contract-${kind}`;
  let sourceId;
  let board;
  if (kind === "flowEdge") {
    sourceId = "contract-flow-source";
    const targetId = "contract-flow-target";
    board = createBoard([
      createFlowEdge(connectionId, sourceId, targetId),
      createFlowNode(sourceId, 500, 560, "Source"),
      createFlowNode(targetId, 1000, 560, "Target"),
    ]);
  } else {
    sourceId = "contract-relationship-source";
    const targetId = "contract-relationship-target";
    board = createBoard([
      { id: connectionId, type: "mindRelationship", fromId: sourceId, toId: targetId, createdAt: now() },
      createText(sourceId, 500, 560, "Source"),
      createText(targetId, 1000, 560, "Target"),
    ]);
  }
  const session = await createSession(browser, url, board);
  try {
    const initial = await readConnection(session.page, connectionId, kind);
    if (assertUnifiedPresentation) assert(initial.line?.connected, `${kind}: vector line is missing`, initial);
    const linePoint = await getConnectionScreenPoint(session.page, connectionId, kind === "mindRelationship" ? 0.25 : 0.5);
    await session.page.mouse.click(linePoint.x, linePoint.y);
    await waitForFrames(session.page, 50);
    const selected = await readConnection(session.page, connectionId, kind);
    assert(selected.exists && selected.selected, `${kind}: line hit selection failed`, selected);

    const sourceInitial = await readState(session.page, sourceId);
    const sourceCenter = await getScreenPoint(session.page, sourceId);
    await session.page.mouse.move(sourceCenter.x, sourceCenter.y);
    await waitForFrames(session.page, 40);
    const sourceHovered = await readState(session.page, sourceId);
    await session.page.mouse.down({ button: "left" });
    await waitForFrames(session.page, 20);
    const sourcePressed = await readState(session.page, sourceId);
    assert(
      sourcePressed.selectedIds.length === 1 && sourcePressed.selectedIds[0] === sourceId,
      `${kind}: endpoint pointerdown did not select the source node`,
      { sourceInitial, sourcePressed }
    );
    await session.page.mouse.move(sourceCenter.x + DRAG_SCREEN_DELTA.x, sourceCenter.y + DRAG_SCREEN_DELTA.y, { steps: 5 });
    await waitForFrames(session.page, 30);
    const moving = await readConnection(session.page, connectionId, kind);
    const sourceMoving = await readState(session.page, sourceId);
    if (assertUnifiedPresentation) {
      assert(moving.line?.connected, `${kind}: line disappeared during endpoint drag`, moving);
      assert(
        Math.abs(moving.line.x1 - initial.line.x1) > 20 || Math.abs(moving.line.y1 - initial.line.y1) > 20,
        `${kind}: line endpoint did not update during drag`,
        { initial, moving, sourceInitial, sourceHovered, sourcePressed, sourceMoving }
      );
      assertNear(
        sourceMoving.presentation?.x,
        sourceInitial.item.x + DRAG_SCREEN_DELTA.x / Number(sourceInitial.view.scale || 1),
        `${kind}: source presentation x did not follow the pointer`,
        { sourceInitial, sourceMoving },
        3
      );
      assertNear(
        sourceMoving.presentation?.y,
        sourceInitial.item.y + DRAG_SCREEN_DELTA.y / Number(sourceInitial.view.scale || 1),
        `${kind}: source presentation y did not follow the pointer`,
        { sourceInitial, sourceMoving },
        3
      );
    }
    await session.page.mouse.up({ button: "left" });
    await waitForFrames(session.page, 180);
    const committed = await readConnection(session.page, connectionId, kind);

    const movedCenter = await getScreenPoint(session.page, sourceId);
    await drag(session.page, movedCenter, { x: -DRAG_SCREEN_DELTA.x, y: -DRAG_SCREEN_DELTA.y });
    await session.page.mouse.up({ button: "left" });
    await waitForFrames(session.page, 180);
    const recovered = await readConnection(session.page, connectionId, kind);
    const sourceRecovered = await readState(session.page, sourceId);
    assertNear(sourceRecovered.item.x, sourceInitial.item.x, `${kind}: source reverse drag left stale x`, { sourceInitial, sourceRecovered }, 3);
    assertNear(sourceRecovered.item.y, sourceInitial.item.y, `${kind}: source reverse drag left stale y`, { sourceInitial, sourceRecovered }, 3);
    if (assertUnifiedPresentation) {
      assertNear(recovered.line.x1, initial.line.x1, `${kind}: recovered x1 diverged`, { initial, recovered }, 3);
      assertNear(recovered.line.y1, initial.line.y1, `${kind}: recovered y1 diverged`, { initial, recovered }, 3);
      assertNear(recovered.line.x2, initial.line.x2, `${kind}: recovered x2 diverged`, { initial, recovered }, 3);
      assertNear(recovered.line.y2, initial.line.y2, `${kind}: recovered y2 diverged`, { initial, recovered }, 3);
    }
    assert(session.errors.length === 0, `${kind}: connection browser errors`, session.errors);
    return {
      initial: initial.line,
      moving: moving.line,
      committed: committed.line,
      recovered: recovered.line,
      sourceInitial: sourceInitial.item,
      sourceRecovered: sourceRecovered.item,
    };
  } finally {
    await session.page.close();
  }
}

async function runMemoEditorContract(browser, url, kind, assertUnifiedPresentation) {
  const id = `contract-${kind}-memo`;
  const item = kind === "fileCard" ? createFileCard(id) : createImage(id);
  item.memo = "Memo contract";
  item.memoVisible = true;
  const session = await createSession(browser, url, createBoard([item]));
  try {
    if (assertUnifiedPresentation) await waitForUnifiedPresentation(session.page, id);
    const selector = kind === "fileCard" ? ".canvas2d-scene-file-card-memo" : ".canvas2d-scene-image-memo";
    const editorSelector = kind === "fileCard" ? "#canvas-file-memo-editor" : "#canvas-image-memo-editor";
    const expectedType = kind === "fileCard" ? "file-memo" : "image-memo";
    const cycles = [];
    for (let cycle = 0; cycle < 3; cycle += 1) {
      let memoBox = null;
      if (assertUnifiedPresentation) {
        memoBox = await session.page.locator(`.canvas2d-scene-content-item[data-id="${id}"] ${selector}`).boundingBox();
        assert(memoBox, `${kind}: memo presentation is missing`);
        await session.page.mouse.dblclick(memoBox.x + memoBox.width / 2, memoBox.y + memoBox.height / 2);
      } else {
        const memoPoint = await getScreenPoint(session.page, id, "memo");
        await session.page.mouse.dblclick(memoPoint.x, memoPoint.y);
      }
      await waitForFrames(session.page, 80);
      const active = await readState(session.page, id);
      assert(active.editingId === id && active.editingType === expectedType, `${kind}: memo editor did not enter expected state`, active);
      if (assertUnifiedPresentation) assertPresentation(active, `${kind} memo editing ${cycle + 1}`);
      const visible = await session.page.locator(editorSelector).evaluate((node) => !node.classList.contains("is-hidden"));
      assert(visible, `${kind}: memo editor is hidden`, active);
      if (assertUnifiedPresentation) {
        const editorBox = await session.page.locator(editorSelector).boundingBox();
        const identity = await session.page.locator(editorSelector).evaluate((node) => ({
          placement: node.dataset.editorPlacement || "",
          editorType: node.dataset.editorType || "",
          itemId: node.dataset.itemId || "",
        }));
        assert(identity.placement === "element" && identity.editorType === expectedType && identity.itemId === id, `${kind}: memo editor identity is stale`, identity);
        assertNear(editorBox.x, memoBox.x, `${kind}: memo editor left is detached from the memo`, { editorBox, memoBox });
        assertNear(editorBox.y, memoBox.y, `${kind}: memo editor top is detached from the memo`, { editorBox, memoBox });
        assertNear(editorBox.width, memoBox.width, `${kind}: memo editor width is detached from the memo`, { editorBox, memoBox }, 3);
        assertNear(editorBox.height, memoBox.height, `${kind}: memo editor height is detached from the memo`, { editorBox, memoBox }, 3);
      }
      await session.page.keyboard.press("Escape");
      await waitForFrames(session.page, 180);
      const recovered = await readState(session.page, id);
      assert(!recovered.editingId && !recovered.editingType, `${kind}: memo editor left stale state`, recovered);
      if (assertUnifiedPresentation) assertPresentation(recovered, `${kind} memo recovered ${cycle + 1}`);
      cycles.push({ active: active.editingType, recovered: recovered.editingType });
    }
    assert(session.errors.length === 0, `${kind}: memo browser errors`, session.errors);
    return cycles;
  } finally {
    await session.page.close();
  }
}

async function runCameraGeometryContract(browser, url, assertUnifiedPresentation) {
  const fixture = createFixture("formula");
  const session = await createSession(browser, url, fixture.board);
  try {
    if (assertUnifiedPresentation) await waitForUnifiedPresentation(session.page, fixture.id);
    const initial = await readState(session.page, fixture.id);
    const center = await getScreenPoint(session.page, fixture.id);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await session.page.mouse.move(center.x, center.y);
      await session.page.keyboard.down("Control");
      await session.page.mouse.wheel(0, -160);
      await session.page.keyboard.up("Control");
      await waitForFrames(session.page, 220);
      const zoomed = await readState(session.page, fixture.id);
      assert(Number(zoomed.view.scale) > Number(initial.view.scale), "camera: Ctrl+wheel did not zoom in", { initial, zoomed });
      assertNear(zoomed.item.width, initial.item.width, "camera: zoom changed formula width", { initial, zoomed });
      assertNear(zoomed.item.height, initial.item.height, "camera: zoom changed formula height", { initial, zoomed });
      if (assertUnifiedPresentation) assertPresentation(zoomed, `camera zoomed ${cycle + 1}`);

      await session.page.keyboard.down("Control");
      await session.page.mouse.wheel(0, 160);
      await session.page.keyboard.up("Control");
      await waitForFrames(session.page, 220);
      const recovered = await readState(session.page, fixture.id);
      assertNear(recovered.view.scale, initial.view.scale, "camera: reverse zoom did not restore scale", { initial, recovered }, 0.02);
      assertNear(recovered.item.width, initial.item.width, "camera: reverse zoom left stale formula width", { initial, recovered });
      assertNear(recovered.item.height, initial.item.height, "camera: reverse zoom left stale formula height", { initial, recovered });
      if (assertUnifiedPresentation) assertPresentation(recovered, `camera recovered ${cycle + 1}`);
    }
    const final = await readState(session.page, fixture.id);
    assert(session.errors.length === 0, "camera: browser errors", session.errors);
    return { initial: initial.item, recovered: final.item };
  } finally {
    await session.page.close();
  }
}

function comparable(result) {
  return JSON.parse(JSON.stringify(result), (key, value) => {
    if (["connected", "runtimeMode", "scenePhase"].includes(key)) return undefined;
    return typeof value === "number" ? Math.round(value * 100) / 100 : value;
  });
}

function assertCompatible(current, baseline, label) {
  const currentValue = comparable(current);
  const baselineValue = comparable(baseline);
  assert(JSON.stringify(currentValue) === JSON.stringify(baselineValue), `${label}: current and baseline interaction outcomes diverged`, {
    current: currentValue,
    baseline: baselineValue,
  });
}

function projectCompatibilityResult(group, result) {
  if (group === "movable") {
    return {
      initial: result?.initial || null,
      committed: result?.committed || null,
      recovered: result?.recovered || null,
    };
  }
  if (group === "resize") {
    return {
      initial: result?.initial || null,
      committed: result?.committed || null,
    };
  }
  if (group === "connections") {
    return {
      initial: result?.initial || null,
      committed: result?.committed || null,
      recovered: result?.recovered || null,
      sourceInitial: result?.sourceInitial || null,
      sourceRecovered: result?.sourceRecovered || null,
    };
  }
  return result;
}

async function runSuite(browser, url, { assertUnifiedPresentation = true, strictRecovery = true } = {}) {
  const result = { movable: {}, resize: {}, editors: {}, memos: {}, connections: {}, camera: {} };
  const movableKinds = ["text", "formula", "codeBlock", "image", "table", "fileCard", "shape", "flowNode", "mindNode", "mindSummary"];
  const resizeKinds = ["text", "formula", "codeBlock", "image", "table", "fileCard", "shape", "flowNode", "mindNode", "mindSummary"];
  for (const kind of movableKinds) {
    if (KIND_FILTER.size && !KIND_FILTER.has(kind)) continue;
    result.movable[kind] = await runMovableContract(browser, url, kind, assertUnifiedPresentation);
  }
  for (const kind of resizeKinds) {
    if (KIND_FILTER.size && !KIND_FILTER.has(kind)) continue;
    result.resize[kind] = await runResizeContract(browser, url, kind, assertUnifiedPresentation, strictRecovery);
  }
  for (const kind of Object.keys(EDITOR_CONTRACTS)) {
    if (KIND_FILTER.size && !KIND_FILTER.has(kind)) continue;
    result.editors[kind] = await runEditorContract(browser, url, kind, assertUnifiedPresentation);
  }
  for (const kind of ["fileCard", "image"]) {
    if (KIND_FILTER.size && !KIND_FILTER.has(`${kind}Memo`)) continue;
    result.memos[kind] = await runMemoEditorContract(browser, url, kind, assertUnifiedPresentation);
  }
  for (const kind of ["flowEdge", "mindRelationship"]) {
    if (KIND_FILTER.size && !KIND_FILTER.has(kind)) continue;
    result.connections[kind] = await runConnectionContract(browser, url, kind, assertUnifiedPresentation);
  }
  if (!KIND_FILTER.size || KIND_FILTER.has("camera")) {
    result.camera.formula = await runCameraGeometryContract(browser, url, assertUnifiedPresentation);
  }
  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const report = { currentUrl: CURRENT_URL, baselineUrl: BASELINE_URL || null, current: null, baseline: null };
  try {
    report.current = await runSuite(browser, CURRENT_URL, { assertUnifiedPresentation: true });
    if (BASELINE_URL) {
      report.baseline = await runSuite(browser, BASELINE_URL, { assertUnifiedPresentation: false, strictRecovery: false });
      for (const group of ["movable", "resize", "editors", "memos", "connections", "camera"]) {
        for (const key of Object.keys(report.current[group])) {
          assertCompatible(
            projectCompatibilityResult(group, report.current[group][key]),
            projectCompatibilityResult(group, report.baseline[group][key]),
            `${group}.${key}`
          );
        }
      }
    }
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, ...report, error: error.message || String(error), details: error.details || null }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
