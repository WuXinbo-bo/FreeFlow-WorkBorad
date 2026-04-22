import { getElementBounds, normalizeElement } from "../../elements/index.js";
import {
  getTextMinSize,
  TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
  TEXT_RESIZE_MODE_WRAP,
  TEXT_WRAP_MODE_MANUAL,
} from "../../elements/text.js";
import { buildCodeBlockElementFromRenderOperation } from "../renderers/code/codeBlockElementBridge.js";
import { buildMathElementFromRenderOperation } from "../renderers/math/mathElementBridge.js";
import { buildTableElementFromRenderOperation } from "../renderers/table/tableElementBridge.js";

export function applyRenderLayoutWriteback(plan = {}, options = {}) {
  const operations = normalizeOperationsForWriteback(Array.isArray(plan?.operations) ? plan.operations : []);
  const anchorPoint = normalizePoint(options.anchorPoint);
  const defaultGap = normalizePositiveNumber(options.defaultGap, 24);
  const laneGap = normalizePositiveNumber(options.laneGap, 28);
  const committed = [];
  const laneOffsets = new Map();

  operations.forEach((operation, index) => {
    const sourceElement = buildElementForWriteback(operation, index);
    if (!sourceElement) {
      return;
    }
    const normalized = normalizeElement(sourceElement);
    const layout = operation?.layout && typeof operation.layout === "object" ? operation.layout : {};
    const laneKey = String(layout.strategy || "flow-stack");
    const laneState = laneOffsets.get(laneKey) || {
      x: anchorPoint.x,
      y: anchorPoint.y,
      maxWidth: 0,
    };
    const placed = placeElementByLayout(normalized, laneState, layout, {
      anchorPoint,
      defaultGap,
      laneGap,
    });
    laneOffsets.set(laneKey, placed.nextLaneState);

    committed.push({
      operation,
      item: placed.item,
      bounds: getElementBounds(placed.item),
      layout: {
        strategy: laneKey,
        stackIndex: Number(layout.stackIndex) || index,
        quoteDepth: Number(layout.quoteDepth) || 0,
      },
    });
  });

  return {
    kind: "layout-writeback-result",
    items: committed.map((entry) => entry.item),
    commits: committed,
    stats: {
      itemCount: committed.length,
      maxRight: committed.reduce((max, entry) => Math.max(max, entry.bounds.right), anchorPoint.x),
      maxBottom: committed.reduce((max, entry) => Math.max(max, entry.bounds.bottom), anchorPoint.y),
    },
  };
}

function buildElementForWriteback(operation = {}, index = 0) {
  const sourceElement = operation?.element && typeof operation.element === "object" ? operation.element : {};
  const resolvedType = String(sourceElement.type || "").trim() || resolveFallbackElementType(operation);
  const resolvedId = sourceElement.id || `${resolvedType || "item"}-${index + 1}`;
  const bridgeKind = resolveStructuredBridgeKind(operation, sourceElement);
  if (bridgeKind === "codeBlock") {
    return {
      ...buildCodeBlockElementFromRenderOperation(operation, {
        x: Number(sourceElement.x) || 0,
        y: Number(sourceElement.y) || 0,
      }),
      id: resolvedId,
    };
  }
  if (bridgeKind === "math") {
    return {
      ...buildMathElementFromRenderOperation(operation, {
        x: Number(sourceElement.x) || 0,
        y: Number(sourceElement.y) || 0,
      }),
      id: resolvedId,
    };
  }
  if (bridgeKind === "table") {
    return {
      ...buildTableElementFromRenderOperation(operation, {
        x: Number(sourceElement.x) || 0,
        y: Number(sourceElement.y) || 0,
      }),
      id: resolvedId,
    };
  }
  if (!resolvedType) {
    return null;
  }
  return {
    ...sourceElement,
    id: resolvedId,
    type: resolvedType,
  };
}

function resolveStructuredBridgeKind(operation = {}, element = {}) {
  const operationType = String(operation?.type || "").trim().toLowerCase();
  const elementType = String(element?.type || "").trim().toLowerCase();
  if (operationType === "render-code-block" || elementType === "codeblock") {
    return "codeBlock";
  }
  if (operationType === "render-table-block" || elementType === "table") {
    return "table";
  }
  if (operationType === "render-math-block" || operationType === "render-math-inline") {
    return "math";
  }
  if (elementType === "mathblock" || elementType === "mathinline" || elementType === "math") {
    return "math";
  }
  return "";
}

function resolveFallbackElementType(operation = {}) {
  const operationType = String(operation?.type || "").trim().toLowerCase();
  if (operationType === "render-code-block") {
    return "codeBlock";
  }
  if (operationType === "render-table-block") {
    return "table";
  }
  if (operationType === "render-math-inline") {
    return "mathInline";
  }
  if (operationType === "render-math-block") {
    return "mathBlock";
  }
  return "";
}

function normalizeOperationsForWriteback(operations = []) {
  const ordered = (Array.isArray(operations) ? operations : []).slice().sort(compareOperationOrder);
  if (ordered.length <= 1) {
    return ordered;
  }
  const merged = [];
  let cursor = 0;
  while (cursor < ordered.length) {
    const current = ordered[cursor];
    if (!isMergeableTextOperation(current)) {
      merged.push(current);
      cursor += 1;
      continue;
    }
    const group = [current];
    let lookahead = cursor + 1;
    while (lookahead < ordered.length) {
      const next = ordered[lookahead];
      if (!isMergeableTextOperation(next)) {
        break;
      }
      if (String(next?.meta?.descriptorId || "") !== String(current?.meta?.descriptorId || "")) {
        break;
      }
      group.push(next);
      lookahead += 1;
    }
    if (group.length > 1) {
      merged.push(mergeTextOperationGroup(group));
    } else {
      merged.push(current);
    }
    cursor = lookahead;
  }
  return merged;
}

function isMergeableTextOperation(operation) {
  if (!operation || typeof operation !== "object") {
    return false;
  }
  const element = operation.element && typeof operation.element === "object" ? operation.element : null;
  if (!element || String(element.type || "") !== "text") {
    return false;
  }
  const parserId = String(operation?.meta?.parserId || "");
  return parserId === "plain-text-parser" || parserId === "markdown-parser" || parserId === "html-parser";
}

function mergeTextOperationGroup(group = []) {
  const sorted = group.slice().sort(compareOperationOrder);
  const base = sorted[0];
  const textElements = sorted.map((entry) => entry.element || {}).filter(Boolean);
  const mergedPlainText = textElements
    .map((element) => String(element.plainText || element.text || ""))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n");
  const mergedHtml = textElements.map((element) => String(element.html || "")).filter(Boolean).join("");
  const mergedWidth = textElements.reduce((max, element) => Math.max(max, Number(element.width) || 0), 0);
  const mergedHeightSeed = Math.max(
    textElements.reduce((sum, element) => sum + (Number(element.height) || 0), 0) + Math.max(0, textElements.length - 1) * 6,
    Number(base?.element?.height) || 0
  );
  const widthHint = Math.max(160, Number(mergedWidth || base?.element?.width || 0) || 160);
  const measuredTextSize = getTextMinSize(
    {
      ...(base?.element && typeof base.element === "object" ? base.element : {}),
      text: mergedPlainText,
      plainText: mergedPlainText,
      html: mergedHtml || base?.element?.html || "",
      textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
      textResizeMode: TEXT_RESIZE_MODE_WRAP,
      wrapMode: TEXT_WRAP_MODE_MANUAL,
      width: widthHint,
    },
    {
      widthHint,
      fontSize: Number(base?.element?.fontSize || 0) || undefined,
    }
  );
  const mergedHeight = Math.max(
    40,
    Number(measuredTextSize?.height || 0) || 0,
    Number(mergedHeightSeed || 0) || 0
  );
  const mergedSourceOrder = sorted.reduce((min, entry) => {
    const value = Number(entry?.sourceOrder);
    if (!Number.isFinite(value)) {
      return min;
    }
    return Number.isFinite(min) ? Math.min(min, value) : value;
  }, NaN);
  return {
    ...base,
    sourceOrder: Number.isFinite(mergedSourceOrder) ? mergedSourceOrder : base?.sourceOrder,
    element: {
      ...base.element,
      text: mergedPlainText,
      plainText: mergedPlainText,
      html: mergedHtml || base?.element?.html || "",
      title: String(base?.element?.title || textElements[0]?.title || "文本"),
      textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
      textResizeMode: TEXT_RESIZE_MODE_WRAP,
      wrapMode: TEXT_WRAP_MODE_MANUAL,
      width: widthHint,
      height: mergedHeight || base?.element?.height,
      structuredImport: {
        ...(base?.element?.structuredImport && typeof base.element.structuredImport === "object"
          ? base.element.structuredImport
          : {}),
        mergedFromOperationCount: sorted.length,
      },
    },
  };
}

function compareOperationOrder(left, right) {
  const leftSourceOrder = Number(left?.sourceOrder);
  const rightSourceOrder = Number(right?.sourceOrder);
  const leftHasSourceOrder = Number.isFinite(leftSourceOrder);
  const rightHasSourceOrder = Number.isFinite(rightSourceOrder);
  if (leftHasSourceOrder && rightHasSourceOrder && leftSourceOrder !== rightSourceOrder) {
    return leftSourceOrder - rightSourceOrder;
  }
  const leftOrder = Number(left?.order);
  const rightOrder = Number(right?.order);
  const leftHasOrder = Number.isFinite(leftOrder);
  const rightHasOrder = Number.isFinite(rightOrder);
  if (leftHasOrder && rightHasOrder && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return 0;
}

function placeElementByLayout(item, laneState, layout, options) {
  const strategy = String(layout?.strategy || "flow-stack");
  const quoteDepth = Math.max(0, Number(layout?.quoteDepth) || 0);
  const stackGap = normalizePositiveNumber(layout?.gap, options.defaultGap);
  const indentX = options.anchorPoint.x + quoteDepth * 20;

  if (strategy === "inline-anchor") {
    const nextItem = normalizeElement({
      ...item,
      x: laneState.x || indentX,
      y: laneState.y || options.anchorPoint.y,
    });
    const bounds = getElementBounds(nextItem);
    return {
      item: nextItem,
      nextLaneState: {
        x: bounds.right + 12,
        y: bounds.top,
        maxWidth: Math.max(laneState.maxWidth || 0, bounds.width),
      },
    };
  }

  const nextY = laneState.y || options.anchorPoint.y;
  const nextItem = normalizeElement({
    ...item,
    x: indentX,
    y: nextY,
  });
  const bounds = getElementBounds(nextItem);
  return {
    item: nextItem,
    nextLaneState: {
      x: options.anchorPoint.x + ((laneState.maxWidth || 0) > 0 ? options.laneGap : 0),
      y: bounds.bottom + stackGap,
      maxWidth: Math.max(laneState.maxWidth || 0, bounds.width),
    },
  };
}

function normalizePoint(point) {
  return {
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
  };
}

function normalizePositiveNumber(value, fallback) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}
