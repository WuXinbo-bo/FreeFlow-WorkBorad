const DEFAULT_MAX_CANVAS_PIXELS = 28_000_000;
const DEFAULT_MAX_CANVAS_SIDE = 16_384;
const MIN_EXPORT_SCALE = 1;

function toPositiveNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function roundCanvasSize(value) {
  return Math.max(1, Math.round(Number(value) || 0));
}

function buildScaleCandidates(requestedScale) {
  const start = Math.max(MIN_EXPORT_SCALE, Math.round(Number(requestedScale) || MIN_EXPORT_SCALE));
  const candidates = [];
  for (let scale = start; scale >= MIN_EXPORT_SCALE; scale -= 1) {
    candidates.push(scale);
  }
  if (!candidates.length) {
    candidates.push(MIN_EXPORT_SCALE);
  }
  return candidates;
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
  const maxCanvasPixels = Math.max(1, Math.round(toPositiveNumber(input.maxCanvasPixels, DEFAULT_MAX_CANVAS_PIXELS)));
  const maxCanvasSide = Math.max(1, Math.round(toPositiveNumber(input.maxCanvasSide, DEFAULT_MAX_CANVAS_SIDE)));

  const requestedMetrics = buildCanvasMetrics(logicalWidth, logicalHeight, requestedScale, pixelRatio);
  const candidates = buildScaleCandidates(requestedScale);

  for (const scaleApplied of candidates) {
    const metrics = buildCanvasMetrics(logicalWidth, logicalHeight, scaleApplied, pixelRatio);
    if (
      metrics.canvasWidth <= maxCanvasSide &&
      metrics.canvasHeight <= maxCanvasSide &&
      metrics.totalPixels <= maxCanvasPixels
    ) {
      return {
        ok: true,
        downgraded: scaleApplied !== requestedScale,
        requestedScale,
        maxCanvasPixels,
        maxCanvasSide,
        logicalWidth,
        logicalHeight,
        pixelRatio,
        ...metrics,
      };
    }
  }

  const overSide = requestedMetrics.canvasWidth > maxCanvasSide || requestedMetrics.canvasHeight > maxCanvasSide;
  return {
    ok: false,
    downgraded: false,
    requestedScale,
    maxCanvasPixels,
    maxCanvasSide,
    logicalWidth,
    logicalHeight,
    pixelRatio,
    ...requestedMetrics,
    errorCode: overSide ? "PDF_EXPORT_CANVAS_SIDE_EXCEEDED" : "PDF_EXPORT_CANVAS_PIXELS_EXCEEDED",
    errorMessage: overSide
      ? "导出失败：画布过大，单页 PDF 超出安全尺寸限制"
      : "导出失败：画布内容过大，当前无法安全生成单页 PDF",
  };
}
