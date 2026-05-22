import { collectElementsInRect, hitTestElement } from "../hitTest.js";
import { pointDistance } from "../utils.js";

export function resolveSelectionTarget(items, point, scale) {
  return hitTestElement(items, point, scale);
}

export function hasDragExceededThreshold(startPoint, currentPoint, threshold = 4) {
  return pointDistance(startPoint, currentPoint) >= threshold;
}

export function getMarqueeSelection(items, startPoint, currentPoint, additiveIds = []) {
  const next = collectElementsInRect(items, startPoint, currentPoint);
  if (!additiveIds.length) {
    return next;
  }
  return Array.from(new Set([...additiveIds, ...next]));
}
