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
  const requestedMetrics = buildCanvasMetrics(logicalWidth, logicalHeight, requestedScale, pixelRatio);
  return {
    ok: true,
    downgraded: false,
    requestedScale,
    logicalWidth,
    logicalHeight,
    pixelRatio,
    ...requestedMetrics,
  };
}
