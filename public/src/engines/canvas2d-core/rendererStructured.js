import { sceneToScreen } from "./camera.js";
import { sanitizeText } from "./utils.js";

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

function drawWrappedLines(ctx, lines, x, y, lineHeight, maxLines) {
  const safeLines = Array.isArray(lines) ? lines.slice(0, maxLines) : [];
  safeLines.forEach((line, index) => {
    ctx.fillText(String(line || ""), x, y + index * lineHeight);
  });
}

function toScreenRect(item, view) {
  const scale = Math.max(0.1, Number(view?.scale) || 1);
  const x = Number(item?.x || 0) * scale + Number(view?.offsetX || 0);
  const y = Number(item?.y || 0) * scale + Number(view?.offsetY || 0);
  const width = Math.max(1, Number(item?.width || 1)) * scale;
  const height = Math.max(1, Number(item?.height || 1)) * scale;
  return { scale, x, y, width, height };
}

function drawCodeBlock(ctx, item, view, selected, hover, helpers) {
  const { scale, x, y, width, height } = toScreenRect(item, view);
  const padding = Math.max(10, 12 * scale);
  const lines = String(item?.plainText || item?.text || "").split("\n");
  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, 14 * scale);
  ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
  ctx.fill();
  ctx.strokeStyle = "rgba(100, 116, 139, 0.65)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = "rgba(226, 232, 240, 0.95)";
  ctx.font = `${Math.max(10, Number(item?.fontSize || 16) * scale)}px Consolas, "Courier New", monospace`;
  ctx.textBaseline = "top";
  drawWrappedLines(ctx, lines, x + padding, y + padding + 16 * scale, Math.max(16, 20 * scale), 12);
  if (item?.language) {
    ctx.fillStyle = "rgba(148, 163, 184, 0.95)";
    ctx.font = `600 ${Math.max(8, 11 * scale)}px "Segoe UI", sans-serif`;
    ctx.fillText(String(item.language).toUpperCase(), x + padding, y + padding * 0.5);
  }
  helpers.drawSelectionFrame(ctx, x, y, width, height, selected, hover);
  if (selected) {
    helpers.drawHandles(ctx, item, view);
  }
  ctx.restore();
}

function drawTable(ctx, item, view, selected, hover, helpers) {
  const { scale, x, y, width, height } = toScreenRect(item, view);
  const rows = Array.isArray(item?.table?.rows) ? item.table.rows : [];
  const columns = Math.max(1, Number(item?.columns || item?.table?.columns || 1));
  const rowHeight = Math.max(28, height / Math.max(1, rows.length || 1));
  const colWidth = Math.max(42, width / columns);
  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, 12 * scale);
  ctx.fillStyle = "rgba(255,255,255,0.98)";
  ctx.fill();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.78)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const lineY = y + rowIndex * rowHeight;
    ctx.moveTo(x, lineY);
    ctx.lineTo(x + width, lineY);
  }
  for (let colIndex = 1; colIndex < columns; colIndex += 1) {
    const lineX = x + colIndex * colWidth;
    ctx.moveTo(lineX, y);
    ctx.lineTo(lineX, y + height);
  }
  ctx.stroke();
  ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
  ctx.font = `${Math.max(9, 12 * scale)}px "Segoe UI", "PingFang SC", sans-serif`;
  ctx.textBaseline = "top";
  rows.forEach((row, rowIndex) => {
    const cells = Array.isArray(row?.cells) ? row.cells : [];
    cells.forEach((cell, cellIndex) => {
      const text = sanitizeText(cell?.plainText || "").split("\n")[0] || "";
      const cellX = x + cellIndex * colWidth + 8 * scale;
      const cellY = y + rowIndex * rowHeight + 6 * scale;
      ctx.fillText(text, cellX, cellY);
    });
  });
  helpers.drawSelectionFrame(ctx, x, y, width, height, selected, hover);
  if (selected) {
    helpers.drawHandles(ctx, item, view);
  }
  ctx.restore();
}

function drawMath(ctx, item, view, selected, hover, helpers) {
  const { scale, x, y, width, height } = toScreenRect(item, view);
  const displayMode = item?.displayMode !== false;
  const text = String(item?.formula || item?.fallbackText || "").trim() || (displayMode ? "[公式]" : "[行内公式]");
  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, displayMode ? 14 * scale : 999);
  ctx.fillStyle = displayMode ? "rgba(248, 250, 252, 0.98)" : "rgba(241, 245, 249, 0.96)";
  ctx.fill();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.72)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "rgba(15, 23, 42, 0.96)";
  ctx.font = `${displayMode ? "600" : "500"} ${Math.max(11, (displayMode ? 18 : 15) * scale)}px "Cambria Math", "Times New Roman", serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = displayMode ? "center" : "left";
  if (displayMode) {
    ctx.fillText(text, x + width / 2, y + height / 2);
  } else {
    ctx.fillText(text, x + 10 * scale, y + height / 2);
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
