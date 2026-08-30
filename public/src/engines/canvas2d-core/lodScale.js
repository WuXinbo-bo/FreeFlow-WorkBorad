export function getCanvasLodScalePercent(scale = 1) {
  return Math.round(Math.max(0.1, Number(scale) || 1) * 100);
}

export function isDetailedOverlayScale(scale = 1, minScale = 0.5) {
  return getCanvasLodScalePercent(scale) > Math.round(Math.max(0.1, Number(minScale) || 0.5) * 100);
}

export function isCanvasLodScale(scale = 1, minScale = 0.15) {
  return getCanvasLodScalePercent(scale) <= Math.round(Math.max(0.1, Number(minScale) || 0.15) * 100);
}

export function resolveCanvasLodHysteresis(
  scale = 1,
  { active = false, enterScale = 0.15, exitScale = 0.17 } = {}
) {
  const scalePercent = getCanvasLodScalePercent(scale);
  const enterPercent = Math.round(Math.max(0.1, Number(enterScale) || 0.15) * 100);
  const exitPercent = Math.max(
    enterPercent + 1,
    Math.round(Math.max(0.1, Number(exitScale) || 0.17) * 100)
  );
  return active ? scalePercent < exitPercent : scalePercent <= enterPercent;
}

export function getOverlayScaleBucket(scale = 1, bucketStep = 0.02) {
  const normalized = Math.max(0.1, Number(scale) || 1);
  const step = Math.max(0.001, Number(bucketStep) || 0.02);
  return String(Math.round(normalized / step) * step);
}
