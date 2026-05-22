import { getElementBounds } from "./elements/index.js";

const MULTI_SELECTION_MIN_SIZE = 24;
const MULTI_SELECTION_HANDLE_RADIUS_PX = 7;
const MULTI_SELECTION_HANDLE_HIT_RADIUS_PX = 12;
const MULTI_SELECTION_EDGE_HANDLE_MIN_SIDE_PX = 56;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeBounds(bounds = null) {
  if (!bounds) {
    return null;
  }
  const left = Number(bounds.left || 0);
  const top = Number(bounds.top || 0);
  const right = Number(bounds.right ?? (left + Number(bounds.width || 0)));
  const bottom = Number(bounds.bottom ?? (top + Number(bounds.height || 0)));
  return {
    left: Math.min(left, right),
    top: Math.min(top, bottom),
    right: Math.max(left, right),
    bottom: Math.max(top, bottom),
    width: Math.max(1, Math.abs(right - left)),
    height: Math.max(1, Math.abs(bottom - top)),
  };
}

export function getMultiSelectionBounds(items = []) {
  const records = (Array.isArray(items) ? items : [])
    .map((item) => ({ item, bounds: normalizeBounds(getElementBounds(item)) }))
    .filter((entry) => entry.bounds);
  if (!records.length) {
    return null;
  }
  return records.reduce((acc, entry) => {
    if (!acc) {
      return { ...entry.bounds };
    }
    return {
      left: Math.min(acc.left, entry.bounds.left),
      top: Math.min(acc.top, entry.bounds.top),
      right: Math.max(acc.right, entry.bounds.right),
      bottom: Math.max(acc.bottom, entry.bounds.bottom),
      width: Math.max(1, Math.max(acc.right, entry.bounds.right) - Math.min(acc.left, entry.bounds.left)),
      height: Math.max(1, Math.max(acc.bottom, entry.bounds.bottom) - Math.min(acc.top, entry.bounds.top)),
    };
  }, null);
}

export function getMultiSelectionHandleMap(bounds = null) {
  const normalized = normalizeBounds(bounds);
  if (!normalized) {
    return {};
  }
  const centerX = normalized.left + normalized.width / 2;
  const centerY = normalized.top + normalized.height / 2;
  return {
    "multi-nw": { x: normalized.left, y: normalized.top, axis: "corner" },
    "multi-n": { x: centerX, y: normalized.top, axis: "edge-y" },
    "multi-ne": { x: normalized.right, y: normalized.top, axis: "corner" },
    "multi-e": { x: normalized.right, y: centerY, axis: "edge-x" },
    "multi-se": { x: normalized.right, y: normalized.bottom, axis: "corner" },
    "multi-s": { x: centerX, y: normalized.bottom, axis: "edge-y" },
    "multi-sw": { x: normalized.left, y: normalized.bottom, axis: "corner" },
    "multi-w": { x: normalized.left, y: centerY, axis: "edge-x" },
  };
}

export function shouldShowMultiSelectionEdgeHandles(bounds = null, scale = 1) {
  const normalized = normalizeBounds(bounds);
  if (!normalized) {
    return false;
  }
  const safeScale = Math.max(0.1, Number(scale) || 1);
  return (
    normalized.width * safeScale >= MULTI_SELECTION_EDGE_HANDLE_MIN_SIDE_PX &&
    normalized.height * safeScale >= MULTI_SELECTION_EDGE_HANDLE_MIN_SIDE_PX
  );
}

export function hitTestMultiSelectionHandle(bounds, scenePoint, scale = 1) {
  const normalized = normalizeBounds(bounds);
  if (!normalized || !scenePoint) {
    return null;
  }
  const safeScale = Math.max(0.1, Number(scale) || 1);
  const radius = MULTI_SELECTION_HANDLE_HIT_RADIUS_PX / safeScale;
  const allowEdges = shouldShowMultiSelectionEdgeHandles(normalized, safeScale);
  const handles = getMultiSelectionHandleMap(normalized);
  const orderedHandles = [
    "multi-nw",
    "multi-ne",
    "multi-se",
    "multi-sw",
    ...(allowEdges ? ["multi-n", "multi-e", "multi-s", "multi-w"] : []),
  ];
  for (const handle of orderedHandles) {
    const point = handles[handle];
    if (!point) {
      continue;
    }
    const dx = Number(scenePoint.x || 0) - point.x;
    const dy = Number(scenePoint.y || 0) - point.y;
    if (Math.hypot(dx, dy) <= radius) {
      return handle;
    }
  }
  return null;
}

export function isScenePointInsideBounds(point, bounds, padding = 0) {
  const normalized = normalizeBounds(bounds);
  if (!point || !normalized) {
    return false;
  }
  const safePadding = Math.max(0, Number(padding || 0) || 0);
  const x = Number(point.x || 0);
  const y = Number(point.y || 0);
  return (
    x >= normalized.left - safePadding &&
    x <= normalized.right + safePadding &&
    y >= normalized.top - safePadding &&
    y <= normalized.bottom + safePadding
  );
}

function getAnchorForHandle(bounds, handle, scaleFromCenter = false) {
  const normalized = normalizeBounds(bounds);
  if (!normalized) {
    return null;
  }
  const centerX = normalized.left + normalized.width / 2;
  const centerY = normalized.top + normalized.height / 2;
  if (scaleFromCenter) {
    return { x: centerX, y: centerY };
  }
  const anchors = {
    "multi-nw": { x: normalized.right, y: normalized.bottom },
    "multi-n": { x: centerX, y: normalized.bottom },
    "multi-ne": { x: normalized.left, y: normalized.bottom },
    "multi-e": { x: normalized.left, y: centerY },
    "multi-se": { x: normalized.left, y: normalized.top },
    "multi-s": { x: centerX, y: normalized.top },
    "multi-sw": { x: normalized.right, y: normalized.top },
    "multi-w": { x: normalized.right, y: centerY },
  };
  return anchors[handle] || null;
}

export function computeMultiSelectionResizedBounds(
  baseBounds,
  handle,
  scenePoint,
  {
    preserveAspect = false,
    scaleFromCenter = false,
    minWidth = MULTI_SELECTION_MIN_SIZE,
    minHeight = MULTI_SELECTION_MIN_SIZE,
  } = {}
) {
  const normalized = normalizeBounds(baseBounds);
  const anchor = getAnchorForHandle(normalized, handle, scaleFromCenter);
  if (!normalized || !anchor || !scenePoint) {
    return normalized;
  }

  const centerX = normalized.left + normalized.width / 2;
  const centerY = normalized.top + normalized.height / 2;
  let left = normalized.left;
  let top = normalized.top;
  let right = normalized.right;
  let bottom = normalized.bottom;
  const x = Number(scenePoint.x || 0);
  const y = Number(scenePoint.y || 0);

  if (scaleFromCenter) {
    const halfWidth = Math.max(minWidth / 2, Math.abs(x - centerX));
    const halfHeight = Math.max(minHeight / 2, Math.abs(y - centerY));
    left = centerX - halfWidth;
    right = centerX + halfWidth;
    top = centerY - halfHeight;
    bottom = centerY + halfHeight;
  } else {
    switch (handle) {
      case "multi-nw":
        left = Math.min(anchor.x - minWidth, x);
        top = Math.min(anchor.y - minHeight, y);
        right = anchor.x;
        bottom = anchor.y;
        break;
      case "multi-ne":
        left = anchor.x;
        top = Math.min(anchor.y - minHeight, y);
        right = Math.max(anchor.x + minWidth, x);
        bottom = anchor.y;
        break;
      case "multi-se":
        left = anchor.x;
        top = anchor.y;
        right = Math.max(anchor.x + minWidth, x);
        bottom = Math.max(anchor.y + minHeight, y);
        break;
      case "multi-sw":
        left = Math.min(anchor.x - minWidth, x);
        top = anchor.y;
        right = anchor.x;
        bottom = Math.max(anchor.y + minHeight, y);
        break;
      case "multi-n":
        top = Math.min(anchor.y - minHeight, y);
        bottom = anchor.y;
        break;
      case "multi-e":
        left = anchor.x;
        right = Math.max(anchor.x + minWidth, x);
        break;
      case "multi-s":
        top = anchor.y;
        bottom = Math.max(anchor.y + minHeight, y);
        break;
      case "multi-w":
        left = Math.min(anchor.x - minWidth, x);
        right = anchor.x;
        break;
      default:
        break;
    }
  }

  let nextWidth = Math.max(minWidth, right - left);
  let nextHeight = Math.max(minHeight, bottom - top);

  if (preserveAspect) {
    const ratio = Math.max(0.0001, normalized.width / Math.max(1, normalized.height));
    if (nextWidth / Math.max(1, nextHeight) > ratio) {
      nextHeight = nextWidth / ratio;
    } else {
      nextWidth = nextHeight * ratio;
    }
    if (scaleFromCenter) {
      left = centerX - nextWidth / 2;
      right = centerX + nextWidth / 2;
      top = centerY - nextHeight / 2;
      bottom = centerY + nextHeight / 2;
    } else {
      if (handle === "multi-nw") {
        left = anchor.x - nextWidth;
        top = anchor.y - nextHeight;
      } else if (handle === "multi-ne") {
        left = anchor.x;
        right = anchor.x + nextWidth;
        top = anchor.y - nextHeight;
      } else if (handle === "multi-se") {
        left = anchor.x;
        right = anchor.x + nextWidth;
        top = anchor.y;
        bottom = anchor.y + nextHeight;
      } else if (handle === "multi-sw") {
        left = anchor.x - nextWidth;
        right = anchor.x;
        top = anchor.y;
        bottom = anchor.y + nextHeight;
      } else {
        left = centerX - nextWidth / 2;
        right = centerX + nextWidth / 2;
        top = centerY - nextHeight / 2;
        bottom = centerY + nextHeight / 2;
      }
    }
  }

  return normalizeBounds({
    left,
    top,
    right,
    bottom,
  });
}

export function getHandleCursorKey(handle = "") {
  const normalized = String(handle || "").trim().toLowerCase();
  return normalized.startsWith("multi-") ? normalized.slice(6) : normalized;
}

export function getMultiSelectionHandleRadiusPx() {
  return MULTI_SELECTION_HANDLE_RADIUS_PX;
}
