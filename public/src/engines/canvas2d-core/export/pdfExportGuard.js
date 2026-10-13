const MIN_EXPORT_SCALE = 0.25;
const DEFAULT_MAX_CANVAS_PIXELS = 16_777_216;
const DEFAULT_MAX_CANVAS_SIDE = 8192;

function toPositiveNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function roundCanvasSize(value) {
  return Math.max(1, Math.round(Number(value) || 0));
}

function buildCanvasMetrics(width, height, scale, pixelRatio) {
  const canvasWidth = roundCanvasSize(width * scale * pixelRatio);
  const canvasHeight = roundCanvasSize(height * scale * pixelRatio);
  return {
    scaleApplied: scale,
    canvasWidth,
    canvasHeight,
    totalPixels: canvasWidth * canvasHeight,
  };
}

export function resolvePdfExportScalePlan(input = {}) {
  const logicalWidth = roundCanvasSize(input.logicalWidth);
  const logicalHeight = roundCanvasSize(input.logicalHeight);
  const requestedScale = toPositiveNumber(input.requestedScale, MIN_EXPORT_SCALE);
  const pixelRatio = toPositiveNumber(input.pixelRatio, 1);
  const maxCanvasPixels = toPositiveNumber(input.maxCanvasPixels, DEFAULT_MAX_CANVAS_PIXELS);
  const maxCanvasSide = toPositiveNumber(input.maxCanvasSide, DEFAULT_MAX_CANVAS_SIDE);
  const basePixels = Math.max(1, logicalWidth * logicalHeight * pixelRatio * pixelRatio);
  const pixelScaleCap = Math.sqrt(maxCanvasPixels / basePixels);
  const sideScaleCap = Math.min(maxCanvasSide / Math.max(1, logicalWidth * pixelRatio), maxCanvasSide / Math.max(1, logicalHeight * pixelRatio));
  const allowedScale = Math.max(MIN_EXPORT_SCALE, Math.min(requestedScale, pixelScaleCap, sideScaleCap));
  // Round down: rounding up could put the allocation above the pixel budget.
  const scaleApplied = Math.max(MIN_EXPORT_SCALE, Math.floor(allowedScale * 10000) / 10000);
  const metrics = buildCanvasMetrics(logicalWidth, logicalHeight, scaleApplied, pixelRatio);
  const withinLimits = metrics.totalPixels <= maxCanvasPixels && Math.max(metrics.canvasWidth, metrics.canvasHeight) <= maxCanvasSide;
  if (!withinLimits) {
    return {
      ok: false,
      code: "EXPORT_SIZE_LIMIT",
      requestedScale,
      logicalWidth,
      logicalHeight,
      pixelRatio,
      maxCanvasPixels,
      maxCanvasSide,
      downgraded: scaleApplied < requestedScale,
      ...metrics,
    };
  }
  return {
    ok: true,
    downgraded: scaleApplied < requestedScale,
    requestedScale,
    scaleApplied,
    logicalWidth,
    logicalHeight,
    pixelRatio,
    maxCanvasPixels,
    maxCanvasSide,
    ...metrics,
  };
}
