import { getElementBounds, normalizeElement } from "../../elements/index.js";

export function applyRenderLayoutWriteback(plan = {}, options = {}) {
  const operations = Array.isArray(plan?.operations) ? plan.operations : [];
  const anchorPoint = normalizePoint(options.anchorPoint);
  const defaultGap = normalizePositiveNumber(options.defaultGap, 24);
  const laneGap = normalizePositiveNumber(options.laneGap, 28);
  const committed = [];
  const laneOffsets = new Map();

  operations.forEach((operation, index) => {
    const sourceElement = operation?.element && typeof operation.element === "object" ? operation.element : null;
    if (!sourceElement) {
      return;
    }
    const normalized = normalizeElement({
      ...sourceElement,
      id: sourceElement.id || `${String(sourceElement.type || "item")}-${index + 1}`,
    });
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
