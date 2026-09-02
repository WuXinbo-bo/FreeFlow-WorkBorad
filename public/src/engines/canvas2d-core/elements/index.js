import { DEFAULT_VIEW } from "../constants.js";
import { clone } from "../utils.js";
import {
  normalizeMindNodeElement,
  normalizeMindSummaryElement,
} from "./mind.js";
import { normalizeMindRelationshipElement } from "./mindRelationship.js";
import { getFlowNodeMinSize, normalizeFlowEdgeElement, normalizeFlowNodeElement } from "./flow.js";
import { normalizeImageElement } from "./media.js";
import { normalizeFileCardElement } from "./fileCard.js";
import { isLinearShape, moveShapeElement, normalizeShapeElement } from "./shapes.js";
import {
  TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
  getTextMinSize,
  normalizeTextElement,
  TEXT_RESIZE_MODE_WRAP,
} from "./text.js";
import { normalizeCodeBlockElement, CODE_BLOCK_MIN_HEIGHT, CODE_BLOCK_MIN_WIDTH } from "./codeBlock.js";
import { normalizeTableElement, TABLE_MIN_HEIGHT, TABLE_MIN_WIDTH } from "./table.js";
import { MATH_MIN_HEIGHT, MATH_MIN_WIDTH } from "./math.js";
import { buildTextElementFromMathElement } from "./mathText.js";
import { normalizeCanvasNavigator } from "../canvasNavigator.js";
import { createElementTypeRegistry } from "../runtime/elementTypeRegistry.js";
import { getBuiltinElementUx } from "../uiRuntime/builtinElementUx.js";

function getRectBounds(element = {}) {
  const left = Number(element.x || 0);
  const top = Number(element.y || 0);
  const width = Math.max(1, Number(element.width) || 1);
  const height = Math.max(1, Number(element.height) || 1);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function getShapeBounds(element = {}) {
  if (!isLinearShape(element.shapeType)) {
    return getRectBounds(element);
  }
  const left = Math.min(Number(element.startX || 0), Number(element.endX || 0));
  const top = Math.min(Number(element.startY || 0), Number(element.endY || 0));
  const right = Math.max(Number(element.startX || 0), Number(element.endX || 0));
  const bottom = Math.max(Number(element.startY || 0), Number(element.endY || 0));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    right,
    bottom,
  };
}

function translateRectElement(element, dx, dy) {
  return {
    ...element,
    x: Number(element.x || 0) + (Number(dx) || 0),
    y: Number(element.y || 0) + (Number(dy) || 0),
  };
}

function preserveElement(element) {
  return element;
}

function getResizeRectGeometry(element, handle, point) {
  if (!element || !handle) {
    return null;
  }
  const bounds = getRectBounds(element);
  const anchors = {
    nw: { x: bounds.right, y: bounds.bottom },
    ne: { x: bounds.left, y: bounds.bottom },
    sw: { x: bounds.right, y: bounds.top },
    se: { x: bounds.left, y: bounds.top },
  };
  const anchor = anchors[handle];
  if (!anchor) {
    return null;
  }
  const left = Math.min(anchor.x, Number(point?.x || 0));
  const top = Math.min(anchor.y, Number(point?.y || 0));
  const right = Math.max(anchor.x, Number(point?.x || 0));
  const bottom = Math.max(anchor.y, Number(point?.y || 0));
  return { anchor, left, top, right, bottom };
}

function resizeRectElement(element, handle, point) {
  const geometry = getResizeRectGeometry(element, handle, point);
  if (!geometry) {
    return element;
  }
  return {
    ...element,
    x: geometry.left,
    y: geometry.top,
    width: Math.max(24, geometry.right - geometry.left),
    height: Math.max(24, geometry.bottom - geometry.top),
  };
}

function resizeShape(element, handle, point) {
  if (!isLinearShape(element.shapeType)) {
    const geometry = getResizeRectGeometry(element, handle, point);
    const next = resizeRectElement(element, handle, point);
    if (!geometry || next === element) {
      return element;
    }
    return {
      ...next,
      startX: geometry.left,
      startY: geometry.top,
      endX: geometry.right,
      endY: geometry.bottom,
    };
  }
  const next = {
    ...element,
    startX: handle === "start" ? Number(point?.x || 0) : Number(element.startX || 0),
    startY: handle === "start" ? Number(point?.y || 0) : Number(element.startY || 0),
    endX: handle === "end" ? Number(point?.x || 0) : Number(element.endX || 0),
    endY: handle === "end" ? Number(point?.y || 0) : Number(element.endY || 0),
  };
  next.x = Math.min(next.startX, next.endX);
  next.y = Math.min(next.startY, next.endY);
  next.width = Math.max(1, Math.abs(next.endX - next.startX));
  next.height = Math.max(1, Math.abs(next.endY - next.startY));
  return next;
}

function withMinSize(resize, minWidth, minHeight) {
  return (element, handle, point) => {
    const next = resize(element, handle, point);
    if (next === element) {
      return element;
    }
    return {
      ...next,
      width: Math.max(minWidth, next.width),
      height: Math.max(minHeight, next.height),
    };
  };
}

function resizeFlowNode(element, handle, point) {
  const next = resizeRectElement(element, handle, point);
  if (next === element) {
    return element;
  }
  const anchor = {
    nw: { x: Number(element.x || 0) + Number(element.width || 0), y: Number(element.y || 0) + Number(element.height || 0) },
    ne: { x: Number(element.x || 0), y: Number(element.y || 0) + Number(element.height || 0) },
    sw: { x: Number(element.x || 0) + Number(element.width || 0), y: Number(element.y || 0) },
    se: { x: Number(element.x || 0), y: Number(element.y || 0) },
  }[handle];
  const minSize = getFlowNodeMinSize({ ...element, ...next }, { widthHint: next.width });
  next.width = Math.max(minSize.width, next.width);
  next.height = Math.max(minSize.height, next.height);
  if (handle === "nw" || handle === "sw") {
    next.x = anchor.x - next.width;
  }
  if (handle === "nw" || handle === "ne") {
    next.y = anchor.y - next.height;
  }
  return next;
}

function isStandaloneStructuredMathText(element = {}) {
  if (element?.type !== "text") {
    return false;
  }
  const structuredImport = element.structuredImport;
  if (!structuredImport || typeof structuredImport !== "object") {
    return false;
  }
  const blockRole = String(structuredImport.blockRole || "").trim().toLowerCase();
  const sourceNodeType = String(structuredImport.sourceNodeType || "").trim().toLowerCase();
  return blockRole === "math-block" || sourceNodeType === "mathblock";
}

function resizeText(element, handle, point) {
  const next = resizeRectElement(element, handle, point);
  if (next === element) {
    return element;
  }
  const originalTop = Number(element.y || 0);
  next.textBoxLayoutMode = TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT;
  next.textResizeMode = TEXT_RESIZE_MODE_WRAP;
  const minSize = getTextMinSize(
    { ...element, ...next, textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT, textResizeMode: TEXT_RESIZE_MODE_WRAP },
    { widthHint: next.width }
  );
  next.width = Math.max(80, minSize.width, next.width);
  next.height = isStandaloneStructuredMathText(element)
    ? Math.max(40, Number(element.height || 0) || 40, minSize.height)
    : Math.max(40, minSize.height);
  next.y = originalTop;
  return next;
}

function createDefinition(type, options = {}) {
  return {
    type,
    aliases: options.aliases || [],
    schemaVersion: Number(options.schemaVersion || 1),
    normalize: options.normalize,
    getBounds: options.getBounds || getRectBounds,
    translate: options.translate || translateRectElement,
    resize: options.resize || resizeRectElement,
    getPresentationCost: options.getPresentationCost,
    ux: options.ux || getBuiltinElementUx(type),
    capabilities: {
      render: "canvas",
      lod: "full",
      hitTest: "bounds",
      editor: "none",
      overlay: "none",
      resource: "none",
      layer: "scene",
      cache: "tile",
      presentation: "native",
      handles: "bounds",
      marquee: true,
      visibility: "always",
      ...options.capabilities,
    },
  };
}

function createBuiltinElementRegistry() {
  const registry = createElementTypeRegistry({ fallbackType: "text" });
  [
    createDefinition("shape", {
      normalize: normalizeShapeElement,
      getBounds: getShapeBounds,
      translate: moveShapeElement,
      resize: resizeShape,
      capabilities: { lod: "shape", hitTest: "shape-path", handles: "shape", editor: "shape", layer: "scene", cache: "tile" },
    }),
    createDefinition("image", {
      normalize: normalizeImageElement,
      capabilities: { lod: "image", hitTest: "bounds-image-memo", editor: "image", overlay: "image-memo", resource: "image", cache: "live" },
    }),
    createDefinition("fileCard", {
      aliases: ["file"],
      normalize: normalizeFileCardElement,
      resize: withMinSize(resizeRectElement, 200, 96),
      capabilities: { lod: "file-card", hitTest: "bounds-file-memo", editor: "file-memo", overlay: "file-preview", resource: "file", cache: "live", minimumReadableTextPx: 3.5, nominalFontSizePx: 14 },
    }),
    createDefinition("codeBlock", {
      aliases: ["code"],
      normalize: normalizeCodeBlockElement,
      resize: withMinSize(resizeRectElement, CODE_BLOCK_MIN_WIDTH, CODE_BLOCK_MIN_HEIGHT),
      capabilities: { render: "canvas-dom", lod: "code-block", editor: "code-block", overlay: "code", cache: "tile", presentation: "layout-snapshot", minimumReadableTextPx: 3.5, nominalFontSizePx: 18 },
    }),
    createDefinition("table", {
      normalize: normalizeTableElement,
      resize: withMinSize(resizeRectElement, TABLE_MIN_WIDTH, TABLE_MIN_HEIGHT),
      getPresentationCost: (item) => (Array.isArray(item?.table?.rows) ? item.table.rows : [])
        .reduce((total, row) => total + (Array.isArray(row?.cells) ? row.cells.length : 0), 0),
      capabilities: { render: "canvas-dom", lod: "table", editor: "table", overlay: "table-editor", cache: "live", presentation: "cost-snapshot", exactSnapshotCost: 64, minimumReadableTextPx: 3.5, nominalFontSizePx: 14 },
    }),
    createDefinition("mathBlock", {
      aliases: ["math"],
      normalize: buildTextElementFromMathElement,
      resize: withMinSize(resizeRectElement, MATH_MIN_WIDTH, MATH_MIN_HEIGHT),
      capabilities: { render: "canvas-dom", lod: "math", editor: "math", overlay: "math", cache: "tile", presentation: "layout-snapshot", minimumReadableTextPx: 4, nominalFontSizePx: 22 },
    }),
    createDefinition("mathInline", {
      normalize: buildTextElementFromMathElement,
      resize: withMinSize(resizeRectElement, MATH_MIN_WIDTH, MATH_MIN_HEIGHT),
      capabilities: { render: "canvas-dom", lod: "math", editor: "math", overlay: "math", cache: "tile", presentation: "layout-snapshot", minimumReadableTextPx: 4, nominalFontSizePx: 22 },
    }),
    createDefinition("mindNode", {
      aliases: ["mind"],
      normalize: normalizeMindNodeElement,
      resize: withMinSize(resizeRectElement, 160, 72),
      capabilities: { render: "canvas-dom", lod: "mind-node", hitTest: "mind-node", handles: "mind-node", editor: "mind-node", overlay: "rich", cache: "live", visibility: "mind-map", presentation: "layout-snapshot", minimumReadableTextPx: 3.5, nominalFontSizePx: 18 },
    }),
    createDefinition("mindSummary", {
      aliases: ["mind-summary"],
      normalize: normalizeMindSummaryElement,
      resize: withMinSize(resizeRectElement, 160, 72),
      capabilities: { render: "canvas-dom", lod: "mind-summary", editor: "mind-node", overlay: "rich", cache: "live", visibility: "mind-map", presentation: "layout-snapshot", minimumReadableTextPx: 3.5, nominalFontSizePx: 18 },
    }),
    createDefinition("mindRelationship", {
      aliases: ["mind-relationship"],
      normalize: normalizeMindRelationshipElement,
      translate: preserveElement,
      resize: preserveElement,
      capabilities: { hitTest: "relationship", handles: "relationship", layer: "mind-connections", cache: "live", marquee: false },
    }),
    createDefinition("flowNode", {
      aliases: ["flow-node", "node"],
      normalize: normalizeFlowNodeElement,
      resize: resizeFlowNode,
      capabilities: { render: "canvas-dom", lod: "flow-node", hitTest: "flow-node", editor: "flow-node", overlay: "rich", cache: "tile", presentation: "layout-snapshot", minimumReadableTextPx: 3.5, nominalFontSizePx: 18 },
    }),
    createDefinition("flowEdge", {
      aliases: ["flow-edge", "edge"],
      normalize: normalizeFlowEdgeElement,
      translate: preserveElement,
      resize: preserveElement,
      capabilities: { hitTest: "line", handles: "none", layer: "scene-connections", cache: "tile", marquee: false },
    }),
    createDefinition("text", {
      aliases: ["richText", "rich"],
      normalize: (element) => normalizeTextElement({ ...element, type: "text" }),
      resize: resizeText,
      capabilities: { render: "canvas-dom", lod: "text", editor: "text", overlay: "rich", cache: "tile", presentation: "layout-snapshot", minimumReadableTextPx: 4, nominalFontSizePx: 18 },
    }),
  ].forEach((definition) => registry.register(definition));
  return registry;
}

export const canvasElementRegistry = createBuiltinElementRegistry();

export function getElementDefinition(elementOrType = "") {
  return typeof elementOrType === "string"
    ? canvasElementRegistry.resolve(elementOrType)
    : canvasElementRegistry.resolveElement(elementOrType);
}

export function registerElementType(definition, options = {}) {
  return canvasElementRegistry.register(definition, options);
}

function normalizeBoardBackgroundPattern(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["none", "dots", "grid", "lines", "engineering"].includes(normalized)) {
    return normalized;
  }
  return "dots";
}

export function createEmptyBoard() {
  return {
    items: [],
    selectedIds: [],
    view: clone(DEFAULT_VIEW),
    preferences: {
      allowLocalFileAccess: true,
      backgroundPattern: "dots",
    },
    navigator: normalizeCanvasNavigator({}),
  };
}

export function normalizeElement(element = {}) {
  const definition = canvasElementRegistry.resolveElement(element, { fallback: false });
  if (!definition) {
    return normalizeUnknownElementPlaceholder(element);
  }
  return canvasElementRegistry.invoke(element, "normalize");
}

function normalizeUnknownElementPlaceholder(element = {}) {
  const originalType = String(element?.type || element?.kind || "unknown").trim() || "unknown";
  const label = `暂不支持的元素 (${originalType})`;
  return normalizeTextElement({
    ...element,
    type: "text",
    title: label,
    text: label,
    plainText: label,
    html: "",
    width: Math.max(240, Number(element?.width || 0) || 240),
    height: Math.max(56, Number(element?.height || 0) || 56),
    unknownElement: {
      kind: "unknown-element-placeholder-v1",
      originalType,
      payload: clone(element),
    },
  });
}

export function normalizeBoard(input = {}) {
  const board = input && typeof input === "object" ? input : {};
  return {
    items: Array.isArray(board.items)
      ? board.items
          .map((item) => normalizeElement(item))
      : [],
    selectedIds: Array.isArray(board.selectedIds)
      ? board.selectedIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [],
    view: {
      scale: Number(board.view?.scale) || DEFAULT_VIEW.scale,
      offsetX: Number(board.view?.offsetX) || DEFAULT_VIEW.offsetX,
      offsetY: Number(board.view?.offsetY) || DEFAULT_VIEW.offsetY,
    },
    preferences: {
      allowLocalFileAccess:
        typeof board.preferences?.allowLocalFileAccess === "boolean" ? board.preferences.allowLocalFileAccess : true,
      backgroundPattern: normalizeBoardBackgroundPattern(board.preferences?.backgroundPattern),
    },
    navigator: normalizeCanvasNavigator(board.navigator),
  };
}

export function getElementBounds(element = {}) {
  return canvasElementRegistry.invoke(element, "getBounds") || getRectBounds(element);
}

export function moveElement(element, dx, dy) {
  return canvasElementRegistry.invoke(element, "translate", dx, dy) || element;
}

export function resizeElement(element, handle, point) {
  return canvasElementRegistry.invoke(element, "resize", handle, point) || element;
}

export function getBoardBounds(items = []) {
  if (!items.length) {
    return null;
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  items.forEach((item) => {
    if (item?.type === "flowEdge") {
      return;
    }
    if (item?.type === "mindRelationship") {
      return;
    }
    const bounds = getElementBounds(item);
    left = Math.min(left, bounds.left);
    top = Math.min(top, bounds.top);
    right = Math.max(right, bounds.right);
    bottom = Math.max(bottom, bounds.bottom);
  });
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    return null;
  }
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
