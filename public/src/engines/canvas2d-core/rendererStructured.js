import { sanitizeText } from "./utils.js";
import {
  getElementScreenBounds,
  getStructuredCodeSceneMetrics,
  getStructuredMathSceneMetrics,
  getStructuredTableSceneGrid,
  normalizeMathRenderState,
  scaleSceneValue,
} from "./viewportMetrics.js";

function drawRoundedRectPath(ctx, x, y, width, height, radius = 12) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapCodeLine(ctx, line, maxWidth) {
  const source = String(line || "");
  if (!source) {
    return [""];
  }
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    return [source];
  }
  if (ctx.measureText(source).width <= maxWidth) {
    return [source];
  }
  const output = [];
  let buffer = "";
  const chars = Array.from(source);
  for (let index = 0; index < chars.length; index += 1) {
    const next = buffer + chars[index];
    if (buffer && ctx.measureText(next).width > maxWidth) {
      output.push(buffer);
      buffer = chars[index];
    } else {
      buffer = next;
    }
  }
  if (buffer) {
    output.push(buffer);
  }
  return output.length ? output : [source];
}

function buildWrappedCodeLines(ctx, lines, maxWidth) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const wrapped = [];
  safeLines.forEach((line) => {
    wrapped.push(...wrapCodeLine(ctx, line, maxWidth));
  });
  return wrapped;
}

function buildWrappedTableCellLines(ctx, text, maxWidth, maxLines = 4) {
  const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!source) {
    return [""];
  }
  const lines = [];
  const commit = (value) => {
    if (lines.length < maxLines) {
      lines.push(String(value || ""));
    }
  };
  source.split("\n").forEach((rawLine) => {
    if (lines.length >= maxLines) {
      return;
    }
    const chars = Array.from(String(rawLine || ""));
    let buffer = "";
    chars.forEach((char) => {
      const next = buffer + char;
      if (buffer && ctx.measureText(next).width > maxWidth) {
        commit(buffer);
        buffer = char;
      } else {
        buffer = next;
      }
    });
    commit(buffer);
  });
  return lines.length ? lines.slice(0, maxLines) : [""];
}

function toScreenRect(item, view) {
  const rect = getElementScreenBounds(view, item);
  return {
    scale: Number(rect.scale) || Math.max(0.1, Number(view?.scale) || 1),
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function drawCodeBlock(ctx, item, view, selected, hover, helpers) {
  const sceneMetrics = getStructuredCodeSceneMetrics(item);
  const { x, y, width, height } = toScreenRect(item, view);
  const hideReadyTextForOverlay =
    typeof document !== "undefined" && document.documentElement?.dataset?.canvasCodeBlockOverlay === "1";
  const paddingX = scaleSceneValue(view, sceneMetrics.paddingX);
  const paddingY = scaleSceneValue(view, sceneMetrics.paddingY);
  const lineHeight = scaleSceneValue(view, 20, { min: 14 });
  const lines = String(item?.plainText || item?.text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const language = String(item?.language || "").trim().toUpperCase();
  const hasLanguage = Boolean(language);
  const headerHeight = hasLanguage ? scaleSceneValue(view, 22, { min: 16 }) : 0;
  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, scaleSceneValue(view, 14));
  // Use an opaque light theme in canvas fallback mode to avoid dark tinting over dark stage backgrounds.
  ctx.fillStyle = "rgba(248, 250, 252, 0.99)";
  ctx.fill();
  ctx.strokeStyle = "rgba(203, 213, 225, 0.95)";
  ctx.lineWidth = 1;
  ctx.stroke();
  if (hasLanguage) {
    ctx.save();
    drawRoundedRectPath(ctx, x, y, width, Math.max(1, headerHeight), scaleSceneValue(view, 14));
    ctx.fillStyle = "rgba(241, 245, 249, 0.99)";
    ctx.fill();
    ctx.restore();
  }
  const fontPx = Math.max(1, scaleSceneValue(view, Number(item?.fontSize || 16), { min: 12 }));
  ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
  ctx.font = `${fontPx}px Consolas, "Courier New", monospace`;
  ctx.textBaseline = "top";
  const labelFontPx = Math.max(1, scaleSceneValue(view, 11, { min: 9 }));
  const labelHeight = hasLanguage ? Math.max(headerHeight, labelFontPx + scaleSceneValue(view, 6)) : 0;
  const contentLeft = x + paddingX;
  const contentTop = y + paddingY + labelHeight;
  const contentWidth = Math.max(1, width - paddingX * 2);
  const contentBottom = y + height - paddingY;
  const maxVisibleLines = Math.max(1, Math.floor((contentBottom - contentTop) / lineHeight));
  const wrappedLines = buildWrappedCodeLines(ctx, lines, contentWidth);
  if (hasLanguage) {
    ctx.fillStyle = "rgba(51, 65, 85, 0.95)";
    ctx.font = `600 ${labelFontPx}px "Segoe UI", sans-serif`;
    ctx.fillText(language, contentLeft, y + scaleSceneValue(view, sceneMetrics.languageLabelOffsetY));
    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.font = `${fontPx}px Consolas, "Courier New", monospace`;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(contentLeft, contentTop, contentWidth, Math.max(1, contentBottom - contentTop));
  ctx.clip();
  if (!hideReadyTextForOverlay) {
    wrappedLines.slice(0, maxVisibleLines).forEach((line, index) => {
      ctx.fillText(String(line || ""), contentLeft, contentTop + index * lineHeight);
    });
  }
  ctx.restore();
  helpers.drawSelectionFrame(ctx, x, y, width, height, selected, hover);
  if (selected) {
    helpers.drawHandles(ctx, item, view);
  }
  ctx.restore();
}

function drawTable(ctx, item, view, selected, hover, helpers) {
  const tableGrid = getStructuredTableSceneGrid(item);
  const { x, y, width, height } = toScreenRect(item, view);
  const rows = tableGrid.rows;
  const rowHeight = scaleSceneValue(view, tableGrid.rowHeight, { min: 0.5 });
  const colWidth = scaleSceneValue(view, tableGrid.columnWidth, { min: 0.5 });
  const headerFill = "rgba(241, 245, 249, 0.98)";
  const cellFill = "rgba(255, 255, 255, 0.985)";
  const stroke = "rgba(148, 163, 184, 0.38)";
  const textColor = "#0f172a";
  const fontPx = Math.max(1, scaleSceneValue(view, 12, { min: 9 }));
  const lineHeight = Math.max(fontPx * 1.35, scaleSceneValue(view, 15, { min: 11 }));
  const padX = scaleSceneValue(view, 8, { min: 5 });
  const padY = scaleSceneValue(view, 6, { min: 4 });
  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, scaleSceneValue(view, 12));
  ctx.fillStyle = cellFill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `${fontPx}px "Segoe UI", "PingFang SC", sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  rows.forEach((row, rowIndex) => {
    const cells = Array.isArray(row?.cells) ? row.cells : [];
    cells.forEach((cell, cellIndex) => {
      const cellLeft = x + cellIndex * colWidth;
      const cellTop = y + rowIndex * rowHeight;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cellLeft, cellTop, colWidth, rowHeight);
      ctx.clip();
      ctx.fillStyle = cell.header ? headerFill : cellFill;
      ctx.fillRect(cellLeft, cellTop, colWidth, rowHeight);
      ctx.strokeStyle = stroke;
      ctx.strokeRect(cellLeft, cellTop, colWidth, rowHeight);
      ctx.fillStyle = textColor;
      ctx.font = `${cell.header ? "700" : "500"} ${fontPx}px "Segoe UI", "PingFang SC", sans-serif`;
      const text = sanitizeText(cell?.plainText || "");
      const lines = buildWrappedTableCellLines(
        ctx,
        text,
        Math.max(8, colWidth - padX * 2),
        Math.max(1, Math.floor((rowHeight - padY * 2) / Math.max(1, lineHeight)))
      );
      lines.forEach((line, index) => {
        const lineY = cellTop + padY + index * lineHeight;
        if (lineY + lineHeight <= cellTop + rowHeight - padY + 1) {
          ctx.fillText(line, cellLeft + padX, lineY);
        }
      });
      ctx.restore();
    });
  });
  helpers.drawSelectionFrame(ctx, x, y, width, height, selected, hover);
  if (selected) {
    helpers.drawHandles(ctx, item, view);
  }
  ctx.restore();
}

function drawMath(ctx, item, view, selected, hover, helpers) {
  const state = normalizeMathRenderState(item);
  const mathMetrics = getStructuredMathSceneMetrics(item);
  const { scale, x, y, width, height } = toScreenRect(item, view);
  const displayMode = mathMetrics.displayMode;
  const hideReadyTextForOverlay =
    state === "ready" &&
    item?.mathOverlayReady === true &&
    typeof document !== "undefined" &&
    document.documentElement?.dataset?.canvasMathOverlay === "1";
  const formulaText = String(item?.formula || "").trim();
  const fallbackText = String(item?.fallbackText || "").trim();
  const text =
    (state === "ready" ? formulaText : fallbackText || formulaText).trim() ||
    (displayMode ? "[公式]" : "[行内公式]");

  let fillStyle = displayMode ? "rgba(248, 250, 252, 0.98)" : "rgba(241, 245, 249, 0.96)";
  let strokeStyle = "rgba(148, 163, 184, 0.72)";
  let textColor = "rgba(15, 23, 42, 0.96)";
  if (state === "fallback") {
    fillStyle = "rgba(254, 252, 232, 0.98)";
    strokeStyle = "rgba(202, 138, 4, 0.55)";
    textColor = "rgba(113, 63, 18, 0.95)";
  } else if (state === "error") {
    fillStyle = "rgba(254, 242, 242, 0.98)";
    strokeStyle = "rgba(220, 38, 38, 0.58)";
    textColor = "rgba(127, 29, 29, 0.96)";
  }

  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, displayMode ? scaleSceneValue(view, 14) : 999);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1;
  ctx.stroke();
  if (!hideReadyTextForOverlay) {
    ctx.fillStyle = textColor;
    ctx.font = `${displayMode ? "600" : "500"} ${Math.max(
      1,
      scaleSceneValue(view, displayMode ? 18 : 15, { min: 10 })
    )}px "Cambria Math", "Times New Roman", serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = displayMode ? "center" : "left";
    if (displayMode) {
      ctx.fillText(text, x + width / 2, y + height / 2);
    } else {
      ctx.fillText(text, x + scaleSceneValue(view, mathMetrics.insetX), y + height / 2);
    }
  }
  if (state !== "ready") {
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = state === "error" ? "rgba(153, 27, 27, 0.95)" : "rgba(146, 64, 14, 0.95)";
    ctx.font = `600 ${Math.max(1, scaleSceneValue(view, 10, { min: 8 }))}px "Segoe UI", sans-serif`;
    ctx.fillText(
      state === "error" ? "RENDER ERROR" : "FALLBACK",
      x + scaleSceneValue(view, mathMetrics.insetX),
      y + scaleSceneValue(view, 4)
    );
  }
  helpers.drawSelectionFrame(ctx, x, y, width, height, selected, hover);
  if (selected) {
    helpers.drawHandles(ctx, item, view);
  }
  ctx.restore();
}

export function createStructuredCanvasRenderer() {
  return function renderStructuredElement({ ctx, item, view, selected, hover, helpers }) {
    if (!item || !ctx || !view || !helpers) {
      return false;
    }
    if (item.type === "codeBlock") {
      drawCodeBlock(ctx, item, view, selected, hover, helpers);
      return true;
    }
    if (item.type === "table") {
      drawTable(ctx, item, view, selected, hover, helpers);
      return true;
    }
    if (item.type === "mathBlock" || item.type === "mathInline") {
      drawMath(ctx, item, view, selected, hover, helpers);
      return true;
    }
    return false;
  };
}
