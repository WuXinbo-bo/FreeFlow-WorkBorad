import { getMemoLayout } from "./memoLayout.js";

function drawRoundedRect(ctx, x, y, width, height, radius = 18) {
  const nextRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + nextRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, nextRadius);
  ctx.arcTo(x + width, y + height, x, y + height, nextRadius);
  ctx.arcTo(x, y + height, x, y, nextRadius);
  ctx.arcTo(x, y, x + width, y, nextRadius);
  ctx.closePath();
}

function wrapTextWithEllipsis(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
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
    const words = part.split(/\s+/).filter(Boolean);
    if (!words.length) {
      row += 1;
      continue;
    }
    let line = "";
    for (const word of words) {
      const nextLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(nextLine).width > maxWidth && line) {
        if (row === maxLines - 1) {
          ctx.fillText(addEllipsis(line), x, y + row * lineHeight);
          return;
        }
        ctx.fillText(line, x, y + row * lineHeight);
        line = word;
        row += 1;
        if (row >= maxLines) return;
      } else {
        line = nextLine;
      }
    }
    if (row === maxLines - 1) {
      ctx.fillText(addEllipsis(line), x, y + row * lineHeight);
      return;
    }
    ctx.fillText(line, x, y + row * lineHeight);
    row += 1;
  }
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

export function drawFileCard(ctx, element, view, selected, hover, { drawSelectionFrame, drawHandles } = {}) {
  const layout = {
    nameFontRatio: 0.15,
    metaFontRatio: 0.12,
    tagFontRatio: 0.12,
    paddingXRatio: 0.06,
    paddingYRatio: 0.14,
    tagWidthRatio: 0.22,
    tagHeightRatio: 0.18,
    minFont: 10,
    maxFont: 28,
    minPadding: 6,
    minTagWidth: 36,
    minTagHeight: 18,
  };
  const scale = Math.max(0.1, Number(view?.scale) || 1);
  const x = Number(element.x || 0) * scale + Number(view?.offsetX || 0);
  const y = Number(element.y || 0) * scale + Number(view?.offsetY || 0);
  const logicalWidth = Math.max(1, Number(element.width) || 1);
  const logicalHeight = Math.max(1, Number(element.height) || 1);
  const width = logicalWidth * scale;
  const height = logicalHeight * scale;
  const ext = String(element.ext || "").toUpperCase() || "FILE";
  const name = element.name || "未命名文件";
  const nameFontLogical = Math.min(
    Math.max(layout.minFont, logicalHeight * layout.nameFontRatio),
    layout.maxFont
  );
  const metaFontLogical = Math.min(
    Math.max(layout.minFont, logicalHeight * layout.metaFontRatio),
    layout.maxFont - 4
  );
  const tagFontLogical = Math.min(
    Math.max(layout.minFont, logicalHeight * layout.tagFontRatio),
    layout.maxFont - 2
  );
  const paddingX = Math.max(layout.minPadding, logicalWidth * layout.paddingXRatio) * scale;
  const paddingY = Math.max(layout.minPadding, logicalHeight * layout.paddingYRatio) * scale;
  const tagWidth = Math.max(layout.minTagWidth, logicalWidth * layout.tagWidthRatio) * scale;
  const tagHeight = Math.max(layout.minTagHeight, logicalHeight * layout.tagHeightRatio) * scale;
  const nameFontSize = nameFontLogical * scale;
  const metaFontSize = metaFontLogical * scale;
  const tagFontSize = tagFontLogical * scale;
  const lineHeight = Math.max(16, nameFontLogical * 1.2) * scale;

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
      const memoPadding = memoLayout.padding * scale;
      const memoFontSize = memoLayout.fontSize * scale;
      const memoLineHeight = memoLayout.lineHeight * scale;
      const memoTextWidth = memoLayout.textWidth * scale;
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

  drawRoundedRect(ctx, x, y, width, height, 18);
  ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
  ctx.strokeStyle = "rgba(203, 213, 225, 0.96)";
  ctx.lineWidth = 1.25;
  ctx.shadowColor = "rgba(15, 23, 42, 0.08)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.stroke();

  ctx.save();
  drawRoundedRect(ctx, x, y, width, height, 18);
  ctx.clip();

  const contentWidth = Math.max(80, width - paddingX * 2);

  drawRoundedRect(ctx, x + paddingX, y + paddingY, Math.min(tagWidth, contentWidth), tagHeight, Math.max(8, tagHeight * 0.45));
  ctx.fillStyle = "rgba(59, 130, 246, 0.12)";
  ctx.strokeStyle = "rgba(59, 130, 246, 0.18)";
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1d4ed8";
  ctx.font = `600 ${tagFontSize}px "Segoe UI", "PingFang SC", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(ext, x + paddingX + Math.min(tagWidth, contentWidth) * 0.2, y + paddingY + tagHeight / 2);

  ctx.fillStyle = "#0f172a";
  ctx.font = `600 ${nameFontSize}px "Segoe UI", "PingFang SC", sans-serif`;
  wrapTextWithEllipsis(
    ctx,
    name,
    x + paddingX,
    y + paddingY + tagHeight + paddingY * 0.8,
    contentWidth,
    lineHeight,
    2
  );

  ctx.fillStyle = "rgba(71, 85, 105, 0.92)";
  ctx.font = `500 ${metaFontSize}px "Segoe UI", "PingFang SC", sans-serif`;
  ctx.fillText(ext || "FILE", x + paddingX, y + height - paddingY * 0.7 - metaFontSize);

  if (element.marked) {
    const ringInset = Math.max(4, Math.min(10, Math.min(width, height) * 0.04));
    ctx.save();
    drawRoundedRect(ctx, x + ringInset, y + ringInset, width - ringInset * 2, height - ringInset * 2, 16);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
    ctx.lineWidth = Math.max(1, Math.min(3, ringInset * 0.35));
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  drawSelectionFrame?.(ctx, x, y, width, height, selected, hover);
  if (selected) {
    drawHandles?.(ctx, element, view);
  }
  ctx.restore();
}
