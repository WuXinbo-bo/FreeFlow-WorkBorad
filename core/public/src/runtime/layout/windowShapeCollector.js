export const WINDOW_SHAPE_DATA_ATTR = "data-shape-include";
export const WINDOW_SHAPE_PADDING_ATTR = "data-shape-padding";
export const WINDOW_SHAPE_EXCLUDE_ATTR = "data-shape-exclude";

export const WINDOW_SHAPE_BOUNDARY = Object.freeze({
  BASE_LAYER: "base-layer",
  OVERLAY_LAYER: "overlay-layer",
});

function normalizePadding(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, next) : Math.max(0, Number(fallback) || 0);
}

export function markElementForWindowShape(element, options = {}) {
  if (!(element instanceof Element)) {
    return;
  }
  const padding = normalizePadding(options.padding, 0);
  element.setAttribute(WINDOW_SHAPE_DATA_ATTR, "true");
  element.setAttribute(WINDOW_SHAPE_PADDING_ATTR, String(padding));
  element.removeAttribute(WINDOW_SHAPE_EXCLUDE_ATTR);
}

export function unmarkElementForWindowShape(element) {
  if (!(element instanceof Element)) {
    return;
  }
  element.removeAttribute(WINDOW_SHAPE_DATA_ATTR);
  element.removeAttribute(WINDOW_SHAPE_PADDING_ATTR);
}

export function getElementWindowShapePadding(element, fallback = 0) {
  if (!(element instanceof Element)) {
    return normalizePadding(fallback, 0);
  }
  return normalizePadding(element.getAttribute(WINDOW_SHAPE_PADDING_ATTR), fallback);
}

export function isElementIncludedInWindowShape(element) {
  if (!(element instanceof Element)) {
    return false;
  }
  if (element.getAttribute(WINDOW_SHAPE_EXCLUDE_ATTR) === "true") {
    return false;
  }
  return element.getAttribute(WINDOW_SHAPE_DATA_ATTR) === "true";
}

export function collectOverlayWindowShapeRects({
  overlayRoot,
  getElementShapeRect,
} = {}) {
  if (!(overlayRoot instanceof Element) || typeof getElementShapeRect !== "function") {
    return [];
  }

  return Array.from(overlayRoot.querySelectorAll(`[${WINDOW_SHAPE_DATA_ATTR}="true"]`))
    .filter((element) => isElementIncludedInWindowShape(element))
    .map((element) => getElementShapeRect(element, getElementWindowShapePadding(element, 0)))
    .filter(Boolean);
}

export function collectMarkedWindowShapeRects({
  rootElement,
  getElementShapeRect,
} = {}) {
  if (!(rootElement instanceof Element) || typeof getElementShapeRect !== "function") {
    return [];
  }

  const markedElements = [];
  if (isElementIncludedInWindowShape(rootElement)) {
    markedElements.push(rootElement);
  }

  markedElements.push(...rootElement.querySelectorAll(`[${WINDOW_SHAPE_DATA_ATTR}="true"]`));

  return markedElements
    .filter((element) => isElementIncludedInWindowShape(element))
    .map((element) => getElementShapeRect(element, getElementWindowShapePadding(element, 0)))
    .filter(Boolean);
}

export function collectElementWindowShapeRects(elements = [], getElementShapeRect) {
  if (typeof getElementShapeRect !== "function") {
    return [];
  }

  return elements
    .map((entry) => {
      const element = entry?.element ?? entry;
      const padding = entry && typeof entry === "object" && "padding" in entry ? entry.padding : 0;
      return getElementShapeRect(element, padding);
    })
    .filter(Boolean);
}

export function collectDesktopWindowShapeRects({
  baseElements = [],
  overlayRoot,
  getElementShapeRect,
} = {}) {
  return [
    ...collectElementWindowShapeRects(baseElements, getElementShapeRect),
    ...collectMarkedWindowShapeRects({
      rootElement: overlayRoot,
      getElementShapeRect,
    }),
  ];
}
