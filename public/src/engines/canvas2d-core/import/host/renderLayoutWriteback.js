import { getElementBounds, normalizeElement } from "../../elements/index.js";
import { createId } from "../../utils.js";
import {
  getTextMinSize,
  TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
  TEXT_RESIZE_MODE_WRAP,
  TEXT_WRAP_MODE_MANUAL,
} from "../../elements/text.js";
import { buildCodeBlockElementFromRenderOperation } from "../renderers/code/codeBlockElementBridge.js";
import { buildMathElementFromRenderOperation } from "../renderers/math/mathElementBridge.js";
import { buildTableElementFromRenderOperation } from "../renderers/table/tableElementBridge.js";
import {
  IMPORTED_TEXT_WRAP_TARGET_WIDTH,
} from "../renderers/text/sharedTextRenderUtils.js";

const IMPORTED_PASTE_FRAME_WIDTH = IMPORTED_TEXT_WRAP_TARGET_WIDTH;

export function applyRenderLayoutWriteback(plan = {}, options = {}) {
  const operations = normalizeOperationsForWriteback(Array.isArray(plan?.operations) ? plan.operations : []);
  return buildRenderLayoutWritebackResult(operations, options);
}

export async function applyRenderLayoutWritebackAsync(plan = {}, options = {}) {
  const operations = normalizeOperationsForWriteback(Array.isArray(plan?.operations) ? plan.operations : []);
  return buildRenderLayoutWritebackResultAsync(operations, options);
}

function createWritebackRuntime(options = {}) {
  const anchorPoint = normalizePoint(options.anchorPoint);
  const defaultGap = normalizePositiveNumber(options.defaultGap, 24);
  const laneGap = normalizePositiveNumber(options.laneGap, 28);
  return {
    anchorPoint,
    defaultGap,
    laneGap,
    committed: [],
    laneOffsets: new Map(),
  };
}

function appendWritebackOperation(runtime, operation, index) {
  const sourceElement = buildElementForWriteback(operation, index);
  if (!sourceElement) {
    return;
  }
  const normalized = normalizeElement(sourceElement);
  const framed = normalizeImportedPasteFrame(normalized);
  const layout = operation?.layout && typeof operation.layout === "object" ? operation.layout : {};
  const laneKey = String(layout.strategy || "flow-stack");
  const laneState = runtime.laneOffsets.get(laneKey) || {
    x: runtime.anchorPoint.x,
    y: runtime.anchorPoint.y,
    maxWidth: 0,
  };
  const placed = placeElementByLayout(framed, laneState, layout, {
    anchorPoint: runtime.anchorPoint,
    defaultGap: runtime.defaultGap,
    laneGap: runtime.laneGap,
  });
  runtime.laneOffsets.set(laneKey, placed.nextLaneState);

  runtime.committed.push({
    operation,
    item: placed.item,
    bounds: getElementBounds(placed.item),
    layout: {
      strategy: laneKey,
      stackIndex: Number(layout.stackIndex) || index,
      quoteDepth: Number(layout.quoteDepth) || 0,
    },
  });
}

function finalizeWritebackRuntime(runtime) {
  const committed = Array.isArray(runtime?.committed) ? runtime.committed : [];
  const anchorPoint = normalizePoint(runtime?.anchorPoint);
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

function buildRenderLayoutWritebackResult(operations = [], options = {}) {
  const runtime = createWritebackRuntime(options);
  operations.forEach((operation, index) => {
    appendWritebackOperation(runtime, operation, index);
  });
  return finalizeWritebackRuntime(runtime);
}

async function buildRenderLayoutWritebackResultAsync(operations = [], options = {}) {
  const runtime = createWritebackRuntime(options);
  const yieldControl = typeof options.yieldControl === "function" ? options.yieldControl : null;
  const yieldBatchSize = Math.max(1, Number(options.yieldBatchSize) || 16);
  const yieldBudgetMs = Math.max(4, Number(options.yieldBudgetMs) || 8);
  let batchStartedAt =
    typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

  for (let index = 0; index < operations.length; index += 1) {
    appendWritebackOperation(runtime, operations[index], index);
    if (!yieldControl || index >= operations.length - 1) {
      continue;
    }
    const processedCount = index + 1;
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    const shouldYield = processedCount % yieldBatchSize === 0 || now - batchStartedAt >= yieldBudgetMs;
    if (!shouldYield) {
      continue;
    }
    await yieldControl({
      processedCount,
      totalCount: operations.length,
    });
    batchStartedAt =
      typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  }

  return finalizeWritebackRuntime(runtime);
}

function buildElementForWriteback(operation = {}, index = 0) {
  const sourceElement = operation?.element && typeof operation.element === "object" ? operation.element : {};
  const resolvedType = String(sourceElement.type || "").trim() || resolveFallbackElementType(operation);
  const shouldRegenerateId = operation?.meta?.regenerateId === true;
  const resolvedId = shouldRegenerateId
    ? createId(resolvedType || "item")
    : (sourceElement.id || createId(resolvedType || "item"));
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

function normalizeImportedPasteFrame(item = {}) {
  if (!item || typeof item !== "object") {
    return item;
  }
  const type = String(item.type || "").trim();
  const width = IMPORTED_PASTE_FRAME_WIDTH;
  if (type === "text") {
    return normalizeElement({
      ...item,
      width,
      textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
      textResizeMode: TEXT_RESIZE_MODE_WRAP,
      wrapMode: TEXT_WRAP_MODE_MANUAL,
      structuredImport: {
        ...(item.structuredImport && typeof item.structuredImport === "object" ? item.structuredImport : {}),
        initialFrameWidth: width,
      },
    });
  }
  if (type === "codeBlock") {
    return {
      ...normalizeElement({
      ...item,
      width,
      autoHeight: true,
      structuredImport: {
        ...(item.structuredImport && typeof item.structuredImport === "object" ? item.structuredImport : {}),
        initialFrameWidth: width,
      },
      }),
      width,
    };
  }
  if (type === "table") {
    return normalizeElement({
      ...item,
      width,
      structuredImport: {
        ...(item.structuredImport && typeof item.structuredImport === "object" ? item.structuredImport : {}),
        initialFrameWidth: width,
      },
    });
  }
  if (type === "mathBlock" || type === "mathInline") {
    return normalizeElement({
      ...item,
      width,
      textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
      textResizeMode: TEXT_RESIZE_MODE_WRAP,
      wrapMode: TEXT_WRAP_MODE_MANUAL,
      structuredImport: {
        ...(item.structuredImport && typeof item.structuredImport === "object" ? item.structuredImport : {}),
        initialFrameWidth: width,
      },
    });
  }
  return item;
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
    const nextItem = normalizeImportedPasteFrame(normalizeElement({
      ...item,
      x: laneState.x || indentX,
      y: laneState.y || options.anchorPoint.y,
    }));
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
  const nextItem = normalizeImportedPasteFrame(normalizeElement({
    ...item,
    x: indentX,
    y: nextY,
  }));
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
