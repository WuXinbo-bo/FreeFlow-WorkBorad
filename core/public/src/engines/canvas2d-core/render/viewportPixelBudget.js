export const CANVAS_MAX_BACKING_PIXELS = 8000000;
export const CANVAS_LARGE_VIEWPORT_PIXELS = 4000000;
export const CANVAS_RESIZE_EPSILON_PX = 1;
const CANVAS_MIN_EFFECTIVE_DPR = 0.6;

function toPositiveNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

export function resolveViewportPixelBudget({
  cssWidth = 1,
  cssHeight = 1,
  devicePixelRatio = 1,
  maxBackingPixels = CANVAS_MAX_BACKING_PIXELS,
} = {}) {
  const width = Math.max(1, toPositiveNumber(cssWidth, 1));
  const height = Math.max(1, toPositiveNumber(cssHeight, 1));
  const rawDpr = Math.max(1, toPositiveNumber(devicePixelRatio, 1));
  const maxPixels = Math.max(1, toPositiveNumber(maxBackingPixels, CANVAS_MAX_BACKING_PIXELS));
  const cssPixels = width * height;
  const budgetDpr = Math.sqrt(maxPixels / Math.max(1, cssPixels));
  const effectiveDpr = Math.max(CANVAS_MIN_EFFECTIVE_DPR, Math.min(rawDpr, budgetDpr));
  let pixelWidth = Math.max(1, Math.round(width * effectiveDpr));
  let pixelHeight = Math.max(1, Math.round(height * effectiveDpr));
  if (pixelWidth * pixelHeight > maxPixels) {
    pixelHeight = Math.max(1, Math.floor(maxPixels / pixelWidth));
  }
  if (pixelWidth * pixelHeight > maxPixels) {
    pixelWidth = Math.max(1, Math.floor(maxPixels / pixelHeight));
  }
  const backingPixels = pixelWidth * pixelHeight;

  return {
    cssWidth: width,
    cssHeight: height,
    cssPixels,
    rawDpr,
    effectiveDpr,
    pixelWidth,
    pixelHeight,
    backingPixels,
    maxBackingPixels: maxPixels,
    dprLimited: effectiveDpr < rawDpr,
    isLargeViewport: cssPixels >= CANVAS_LARGE_VIEWPORT_PIXELS || backingPixels >= maxPixels * 0.8,
  };
}

export function hasViewportSizeChanged(previous = null, next = null, epsilon = CANVAS_RESIZE_EPSILON_PX) {
  if (!previous || !next) {
    return true;
  }
  const tolerance = Math.max(0, Number(epsilon) || 0);
  return (
    Math.abs(Number(previous.cssWidth || 0) - Number(next.cssWidth || 0)) > tolerance ||
    Math.abs(Number(previous.cssHeight || 0) - Number(next.cssHeight || 0)) > tolerance ||
    Number(previous.pixelWidth || 0) !== Number(next.pixelWidth || 0) ||
    Number(previous.pixelHeight || 0) !== Number(next.pixelHeight || 0) ||
    Math.abs(Number(previous.effectiveDpr || 1) - Number(next.effectiveDpr || 1)) > 0.001
  );
}
