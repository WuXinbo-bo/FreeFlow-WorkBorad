function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function resolveScreenCornerRadius(
  width,
  height,
  requestedRadius = 12,
  {
    maxRadiusPx = 18,
    maxCornerRatio = 0.22,
    minRadiusPx = 0,
  } = {}
) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const minSide = Math.min(safeWidth, safeHeight);
  const requested = Math.max(0, Number(requestedRadius) || 0);
  const hardCap = Math.max(0, Number(maxRadiusPx) || 0);
  const ratioCap = Math.max(0, minSide * Math.max(0, Number(maxCornerRatio) || 0));
  const geometryCap = minSide / 2;
  const resolved = Math.min(requested, hardCap, ratioCap, geometryCap);
  return clamp(resolved, Math.max(0, Number(minRadiusPx) || 0), geometryCap);
}

export function drawStableRoundedRectPath(
  ctx,
  x,
  y,
  width,
  height,
  requestedRadius = 12,
  options = {}
) {
  const radius = resolveScreenCornerRadius(width, height, requestedRadius, options);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  return radius;
}
