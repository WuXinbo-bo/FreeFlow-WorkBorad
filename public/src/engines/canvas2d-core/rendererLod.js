import { resolveLodHeaderLayout, resolveLodShellGeometry, resolveLodTextBarLayout } from "./lodPreviewLayout.js";

export const LOD_CARD_RADIUS_PX = 12;

export function drawRoundedRectPath(ctx, x, y, width, height, radius = LOD_CARD_RADIUS_PX) {
  const nextRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + nextRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, nextRadius);
  ctx.arcTo(x + width, y + height, x, y + height, nextRadius);
  ctx.arcTo(x, y + height, x, y, nextRadius);
  ctx.arcTo(x, y, x + width, y, nextRadius);
  ctx.closePath();
}

export function getLodInset(width, height, ratio = 0.06) {
  return Math.max(4, Math.min(width, height) * ratio);
}

export function drawTableStyleLodShell(ctx, x, y, width, height, options = {}) {
  const radius = Math.max(0, Number(options.radius ?? LOD_CARD_RADIUS_PX) || LOD_CARD_RADIUS_PX);
  const inset = Math.max(0, Number(options.inset ?? 0));
  const rect = resolveLodShellGeometry({
    x,
    y,
    width,
    height,
    radius,
    inset,
    panelRadius: options.panelRadius ?? Math.max(0, radius - 4),
  });

  drawRoundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, rect.radius);
  ctx.fillStyle = options.outerFill || (inset > 0 ? "rgba(255, 255, 255, 0.985)" : "rgba(248, 250, 252, 0.92)");
  ctx.fill();
  ctx.strokeStyle = options.outerStroke || "rgba(148, 163, 184, 0.38)";
  ctx.lineWidth = Number(options.outerLineWidth || 1) || 1;
  ctx.stroke();

  if (inset > 0) {
    drawRoundedRectPath(ctx, rect.panelX, rect.panelY, rect.panelWidth, rect.panelHeight, rect.panelRadius);
    ctx.fillStyle = options.panelFill || "rgba(248, 250, 252, 0.92)";
    ctx.fill();
  }

  return rect;
}

export function drawLodHeaderStrip(ctx, rect, options = {}) {
  const layout = resolveLodHeaderLayout(rect, options);
  if (layout.height <= 0) {
    return 0;
  }
  ctx.save();
  drawRoundedRectPath(ctx, rect.panelX, rect.panelY, rect.panelWidth, rect.panelHeight, rect.panelRadius);
  ctx.clip();
  ctx.fillStyle = options.fill || "rgba(226, 232, 240, 0.84)";
  ctx.fillRect(rect.panelX, rect.panelY, rect.panelWidth, layout.height);
  ctx.restore();
  return layout.height;
}

export function drawLodTextBars(ctx, rect, options = {}) {
  const layout = resolveLodTextBarLayout(rect, options);
  if (layout.fitLineCount <= 0) {
    return 0;
  }
  ctx.save();
  drawRoundedRectPath(ctx, rect.panelX, rect.panelY, rect.panelWidth, rect.panelHeight, rect.panelRadius);
  ctx.clip();
  ctx.fillStyle = options.fill || "rgba(100, 116, 139, 0.12)";
  for (const line of layout.lines) {
    drawRoundedRectPath(ctx, line.x, line.y, line.width, line.height, line.radius);
    ctx.fill();
  }
  ctx.restore();
  return layout.fitLineCount;
}
