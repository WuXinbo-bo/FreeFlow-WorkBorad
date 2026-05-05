import { sceneToScreen } from "./camera.js";
import { getElementBounds } from "./elements/index.js";

export function getViewScale(view) {
  return Math.max(0.1, Number(view?.scale) || 1);
}

export function scaleSceneValue(view, value, { min = null, max = null, fallback = 0 } = {}) {
  let logical = Number(value);
  if (!Number.isFinite(logical)) {
    logical = Number(fallback) || 0;
  }
  if (Number.isFinite(min)) {
    logical = Math.max(Number(min), logical);
  }
  if (Number.isFinite(max)) {
    logical = Math.min(Number(max), logical);
  }
  return logical * getViewScale(view);
}

export function scenePxFromScreenPx(view, pixels, { fallback = 0 } = {}) {
  const value = Number(pixels);
  return (Number.isFinite(value) ? value : Number(fallback) || 0) / getViewScale(view);
}

export function getElementScreenBounds(view, element = {}) {
  const bounds = getElementBounds(element);
  return sceneRectToScreenRect(view, bounds);
}

export function getScreenPoint(view, point) {
  return sceneToScreen(view, point);
}

export function getScreenFixed(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : Number(fallback) || 0;
}

export function sceneRectToScreenRect(view, rect = {}) {
  const scale = getViewScale(view);
  const left = Number(rect.left);
  const top = Number(rect.top);
  const width = Number(rect.width);
  const height = Number(rect.height);
  const topLeft = sceneToScreen(view, {
    x: Number.isFinite(left) ? left : 0,
    y: Number.isFinite(top) ? top : 0,
  });
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  return {
    left: topLeft.x,
    top: topLeft.y,
    width: safeWidth * scale,
    height: safeHeight * scale,
    right: topLeft.x + safeWidth * scale,
    bottom: topLeft.y + safeHeight * scale,
    scale,
  };
}

export function getStructuredTableSceneGrid(item = {}) {
  const bounds = getElementBounds(item);
  const rows = Array.isArray(item?.table?.rows) ? item.table.rows : [];
  const rowCount = Math.max(1, rows.length || 1);
  const columnCount = Math.max(1, Number(item?.columns || item?.table?.columns || 1));
  return {
    bounds,
    rows,
    rowCount,
    columnCount,
    rowHeight: bounds.height / rowCount,
    columnWidth: bounds.width / columnCount,
  };
}

export function getStructuredCodeSceneMetrics(item = {}) {
  const bounds = getElementBounds(item);
  return {
    bounds,
    paddingX: 12,
    paddingY: 12,
    contentInsetX: 12,
    contentInsetBottom: 12,
    languageLabelOffsetY: 6,
    contentTop: 28,
  };
}

export function getStructuredMathSceneMetrics(item = {}) {
  const bounds = getElementBounds(item);
  const displayMode = item?.displayMode !== false;
  return {
    bounds,
    displayMode,
    insetX: displayMode ? 16 : 10,
    insetY: displayMode ? 12 : 8,
  };
}

export function normalizeMathRenderState(item = {}) {
  const raw = String(item?.renderState || item?.mathRenderState || "").trim().toLowerCase();
  if (raw === "ready") {
    return "ready";
  }
  if (raw === "error" || raw === "failed") {
    return "error";
  }
  if (raw === "fallback" || raw === "fallback-text" || raw === "fallback_text") {
    return "fallback";
  }
  const formula = String(item?.formula || "").trim();
  return formula ? "ready" : "fallback";
}
