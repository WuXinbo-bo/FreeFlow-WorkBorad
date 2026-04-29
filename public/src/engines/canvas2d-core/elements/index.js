import { DEFAULT_VIEW } from "../constants.js";
import { clone } from "../utils.js";
import { normalizeMindNodeElement } from "./mind.js";
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
  };
}

export function normalizeElement(element = {}) {
  const legacyKind = String(element.kind || "").trim().toLowerCase();
  const type = String(element.type || legacyKind || "").trim().toLowerCase();
  if (type === "shape") {
    return normalizeShapeElement(element);
  }
  if (type === "image") {
    return normalizeImageElement(element);
  }
  if (type === "filecard" || type === "file") {
    return normalizeFileCardElement(element);
  }
  if (type === "codeblock" || type === "code") {
    return normalizeCodeBlockElement(element);
  }
  if (type === "table") {
    return normalizeTableElement(element);
  }
  if (type === "mathblock" || type === "mathinline" || type === "math") {
    return buildTextElementFromMathElement(element);
  }
  if (type === "mindnode" || type === "mind") {
    return normalizeMindNodeElement(element);
  }
  if (type === "flownode" || type === "flow-node" || type === "node") {
    return normalizeFlowNodeElement(element);
  }
  if (type === "flowedge" || type === "flow-edge" || type === "edge") {
    return normalizeFlowEdgeElement(element);
  }
  if (type === "richtext" || type === "rich") {
    return normalizeTextElement({
      ...element,
      type: "text",
    });
  }
  return normalizeTextElement({
    ...element,
    type: "text",
  });
}

export function normalizeBoard(input = {}) {
  const board = input && typeof input === "object" ? input : {};
  return {
    items: Array.isArray(board.items) ? board.items.map((item) => normalizeElement(item)) : [],
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
  };
}

export function getElementBounds(element = {}) {
  if (element.type === "shape" && isLinearShape(element.shapeType)) {
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

export function moveElement(element, dx, dy) {
  if (element.type === "shape") {
    return moveShapeElement(element, dx, dy);
  }
  if (element.type === "flowEdge") {
    return element;
  }
  return {
    ...element,
    x: Number(element.x || 0) + (Number(dx) || 0),
    y: Number(element.y || 0) + (Number(dy) || 0),
  };
}

export function resizeElement(element, handle, point) {
  if (!element || !handle) {
    return element;
  }
  if (element.type === "shape" && isLinearShape(element.shapeType)) {
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

  const bounds = getElementBounds(element);
  const anchors = {
    nw: { x: bounds.right, y: bounds.bottom },
    ne: { x: bounds.left, y: bounds.bottom },
    sw: { x: bounds.right, y: bounds.top },
    se: { x: bounds.left, y: bounds.top },
  };
  const anchor = anchors[handle];
  if (!anchor) {
    return element;
  }
  const left = Math.min(anchor.x, Number(point?.x || 0));
  const top = Math.min(anchor.y, Number(point?.y || 0));
  const right = Math.max(anchor.x, Number(point?.x || 0));
  const bottom = Math.max(anchor.y, Number(point?.y || 0));
  const width = Math.max(24, right - left);
  const height = Math.max(24, bottom - top);
  const next = {
    ...element,
    x: left,
    y: top,
    width,
    height,
  };
  if (element.type === "fileCard") {
    next.width = Math.max(200, next.width);
    next.height = Math.max(96, next.height);
  }
  if (element.type === "mindNode") {
    next.width = Math.max(160, next.width);
    next.height = Math.max(72, next.height);
  }
  if (element.type === "codeBlock") {
    next.width = Math.max(CODE_BLOCK_MIN_WIDTH, next.width);
    next.height = Math.max(CODE_BLOCK_MIN_HEIGHT, next.height);
  }
  if (element.type === "table") {
    next.width = Math.max(TABLE_MIN_WIDTH, next.width);
    next.height = Math.max(TABLE_MIN_HEIGHT, next.height);
  }
  if (element.type === "mathBlock" || element.type === "mathInline") {
    next.width = Math.max(MATH_MIN_WIDTH, next.width);
    next.height = Math.max(MATH_MIN_HEIGHT, next.height);
  }
  if (element.type === "flowNode") {
    const minSize = getFlowNodeMinSize(
      {
        ...element,
        width: next.width,
        height: next.height,
      },
      {
        widthHint: next.width,
      }
    );
    next.width = Math.max(minSize.width, next.width);
    next.height = Math.max(minSize.height, next.height);
    if (handle === "nw" || handle === "sw") {
      next.x = anchor.x - next.width;
    }
    if (handle === "nw" || handle === "ne") {
      next.y = anchor.y - next.height;
    }
  }
  if (element.type === "text") {
    const originalTop = Number(element.y || 0);
    next.textBoxLayoutMode = TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT;
    next.textResizeMode = TEXT_RESIZE_MODE_WRAP;
    const minSize = getTextMinSize(
      {
        ...element,
        ...next,
        textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
        textResizeMode: TEXT_RESIZE_MODE_WRAP,
      },
      {
        widthHint: next.width,
      }
    );
    next.width = Math.max(80, minSize.width, next.width);
    next.height = Math.max(40, minSize.height);
    // Text boxes should resize from the top edge and grow/shrink downward.
    // Reflow caused by width changes must not recenter the box vertically.
    next.y = originalTop;
  }
  if (element.type === "shape") {
    next.startX = left;
    next.startY = top;
    next.endX = right;
    next.endY = bottom;
  }
  return next;
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
