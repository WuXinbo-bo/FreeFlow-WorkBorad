import { getFileCardLayout, getFileCardNameLines, FILE_CARD_FONT } from "./fileCardLayout.js";
import { getMemoLayout } from "./memoLayout.js";
import { scaleSceneValue } from "./viewportMetrics.js";
import { drawStableRoundedRectPath } from "./render/cornerRadius.js";

function drawRoundedRect(ctx, x, y, width, height, radius = 18) {
  drawStableRoundedRectPath(ctx, x, y, width, height, radius, { maxRadiusPx: Infinity, maxCornerRatio: 0.5 });
}

function wrapTextByChar(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const raw = String(text || "");
  const lines = raw.split("\n");
  let row = 0;
  const addEllipsis = (value) => {
    const ellipsis = "…";
    let trimmed = value;
    while (trimmed && ctx.measureText(`${trimmed}${ellipsis}`).width > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    return `${trimmed}${ellipsis}`;
  };

  for (const part of lines) {
    if (row >= maxLines) break;
    if (!part) {
      row += 1;
      continue;
    }
    let line = "";
    for (const char of Array.from(part)) {
      const nextLine = line + char;
      if (ctx.measureText(nextLine).width > maxWidth && line) {
        if (row === maxLines - 1) {
          ctx.fillText(addEllipsis(line), x, y + row * lineHeight);
          return;
        }
        ctx.fillText(line, x, y + row * lineHeight);
        line = char;
        row += 1;
        if (row >= maxLines) return;
      } else {
        line = nextLine;
      }
    }
    if (!line) {
      row += 1;
      continue;
    }
    if (row === maxLines - 1) {
      ctx.fillText(addEllipsis(line), x, y + row * lineHeight);
      return;
    }
    ctx.fillText(line, x, y + row * lineHeight);
    row += 1;
  }
}

function countWrappedTextLines(ctx, text, maxWidth, maxLines = 4) {
  const raw = String(text || "");
  const lines = raw.split("\n");
  let row = 0;

  for (const part of lines) {
    if (row >= maxLines) break;
    if (!part) {
      row += 1;
      continue;
    }

    let line = "";
    for (const char of Array.from(part)) {
      const nextLine = line + char;
      if (ctx.measureText(nextLine).width > maxWidth && line) {
        row += 1;
        line = char;
        if (row >= maxLines) return maxLines;
      } else {
        line = nextLine;
      }
    }

    if (line) {
      row += 1;
    }
  }

  return Math.max(1, Math.min(row, maxLines));
}

const fileNameLayouts = new Map();
function getCachedNameLines(name, width, ctx) {
  const key = `${width}:${name}`;
  let lines = fileNameLayouts.get(key);
  if (!lines) {
    lines = getFileCardNameLines(name, width, text => ctx.measureText(text).width);
    fileNameLayouts.set(key, lines);
    if (fileNameLayouts.size > 512) fileNameLayouts.delete(fileNameLayouts.keys().next().value);
  }
  return lines;
}

export function drawFileCard(ctx, element, view, selected, hover, { drawSelectionFrame, drawHandles } = {}) {
  const layout = getFileCardLayout(element);
  const scale = Math.max(0.01, Number(view?.scale) || 1);
  const x = Number(element.x || 0) * scale + Number(view?.offsetX || 0);
  const y = Number(element.y || 0) * scale + Number(view?.offsetY || 0);
  const width = Number(element.width) * scale;
  const height = Number(element.height) * scale;
  const unit = layout.scale * scale;
  const accentSoftColor = String(element.accentSoftColor || "rgba(59, 130, 246, 0.12)");
  const accentStrokeColor = String(element.accentStrokeColor || "rgba(59, 130, 246, 0.18)");
  const accentTextColor = String(element.accentTextColor || "#1d4ed8");

  const memoLayout = getMemoLayout(element, { kind: "fileCard" });
  const memoX = memoLayout.left * scale + Number(view?.offsetX || 0);
  const memoY = memoLayout.top * scale + Number(view?.offsetY || 0);
  const memoWidth = memoLayout.width * scale;
  const memoHeight = memoLayout.height * scale;

  ctx.save();
  ctx.textBaseline = "top";
  if (element.memoVisible) {
    drawRoundedRect(ctx, memoX, memoY, memoWidth, memoHeight, memoLayout.radius * scale);
    ctx.fillStyle = "rgba(248, 250, 252, 0.98)";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.shadowColor = "rgba(15, 23, 42, 0.12)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.stroke();
    const memoText = String(element.memo || "").trim();
    if (memoText) {
    const memoPadding = scaleSceneValue(view, memoLayout.padding);
    const memoFontSize = scaleSceneValue(view, memoLayout.fontSize);
    const memoLineHeight = scaleSceneValue(view, memoLayout.lineHeight);
    const memoTextWidth = scaleSceneValue(view, memoLayout.textWidth);
      ctx.fillStyle = "rgba(51, 65, 85, 0.92)";
      ctx.font = `500 ${memoFontSize}px "Segoe UI", "PingFang SC", sans-serif`;
      const memoLineCount = countWrappedTextLines(ctx, memoText, memoTextWidth, memoLayout.maxLines);
      const memoTextHeight = memoLineCount * memoLineHeight;
      const memoTextTop = memoY + Math.max(memoPadding, (memoHeight - memoTextHeight) / 2);
      wrapTextByChar(
        ctx,
        memoText,
        memoX + memoPadding,
        memoTextTop,
        memoTextWidth,
        memoLineHeight,
        memoLayout.maxLines
      );
    }
  }

  drawRoundedRect(ctx, x, y, width, height, layout.radius * scale);
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.strokeStyle = "rgba(203, 213, 225, 0.8)";
  ctx.lineWidth = unit;
  ctx.shadowColor = "rgba(15, 23, 42, 0.04)";
  ctx.shadowBlur = 8 * unit;
  ctx.shadowOffsetY = 2 * unit;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.stroke();
  ctx.save();
  drawRoundedRect(ctx, x, y, width, height, layout.radius * scale);
  ctx.clip();

  const tag = layout.tag;
  drawRoundedRect(ctx, x + tag.x * scale, y + tag.y * scale, tag.width * scale, tag.height * scale, 10 * unit);
  ctx.fillStyle = accentSoftColor;
  ctx.strokeStyle = accentStrokeColor;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accentTextColor;
  ctx.font = `600 ${tag.font * scale}px ${FILE_CARD_FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(layout.extension, x + (tag.x + tag.width / 2) * scale, y + (tag.y + tag.height / 2) * scale, (tag.width - 8 * layout.scale) * scale);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#0f172a";
  // Measure in base coordinates: changing viewport zoom cannot change line breaks.
  ctx.font = `600 16px ${FILE_CARD_FONT}`;
  const lines = getCachedNameLines(element.name || element.fileName, Math.round(layout.name.width / layout.scale * 1000) / 1000, ctx);
  ctx.font = `600 ${layout.name.font * scale}px ${FILE_CARD_FONT}`;
  lines.forEach((line, index) => ctx.fillText(line, x + layout.name.x * scale, y + (layout.name.y + index * layout.name.lineHeight + 2 * layout.scale) * scale));
  ctx.fillStyle = "rgba(71, 85, 105, 0.92)";
  ctx.font = `500 ${layout.meta.font * scale}px ${FILE_CARD_FONT}`;
  ctx.fillText(layout.metadata, x + layout.meta.x * scale, y + layout.meta.y * scale);
  if (element.marked) {
    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(x + width - 12 * unit, y + 12 * unit, 3 * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  drawSelectionFrame?.(ctx, x, y, width, height, selected, hover);
  if (selected) {
    drawHandles?.(ctx, element, view);
  }
  ctx.restore();
}
