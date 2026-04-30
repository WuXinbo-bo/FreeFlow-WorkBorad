const MEMO_MAX_LINES = 4;
let memoMeasureContext = null;

function getMeasureContext() {
  if (memoMeasureContext) {
    return memoMeasureContext;
  }
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  memoMeasureContext = canvas.getContext("2d");
  return memoMeasureContext;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getLogicalFontSize(kind, logicalHeight) {
  if (kind === "image") {
    return Math.min(Math.max(10, logicalHeight * 0.12), 22);
  }
  return Math.min(Math.max(10, logicalHeight * 0.12), 22);
}

function measureLongestLine(text, fontSize) {
  const ctx = getMeasureContext();
  if (!ctx) {
    return Math.max(0, String(text || "").length * fontSize * 0.56);
  }
  ctx.font = `500 ${fontSize}px "Segoe UI", "PingFang SC", sans-serif`;
  return String(text || "")
    .split("\n")
    .reduce((maxWidth, line) => Math.max(maxWidth, ctx.measureText(line).width), 0);
}

function countWrappedLines(text, maxWidth, fontSize, maxLines = MEMO_MAX_LINES) {
  const ctx = getMeasureContext();
  const raw = String(text || "");
  if (!raw.trim()) {
    return 1;
  }
  if (!ctx) {
    return Math.max(1, Math.min(maxLines, Math.ceil(raw.length / Math.max(1, Math.floor(maxWidth / Math.max(1, fontSize * 0.56))))));
  }
  ctx.font = `500 ${fontSize}px "Segoe UI", "PingFang SC", sans-serif`;
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
        if (row >= maxLines) {
          return maxLines;
        }
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

export function getMemoLayout(element = {}, { kind = "fileCard", textOverride = null } = {}) {
  const logicalWidth = Math.max(1, Number(element.width) || 1);
  const logicalHeight = Math.max(1, Number(element.height) || 1);
  const text = String((textOverride ?? element.memo) || "").trim();
  const baseWidth = Math.max(160, logicalWidth * 0.92);
  const baseHeight = Math.max(52, logicalHeight * 0.55);
  const overlap = Math.max(10, logicalHeight * 0.12);
  const fontSize = getLogicalFontSize(kind, logicalHeight);
  const lineHeight = Math.max(16, fontSize * 1.2);
  const padding = clamp(Math.max(10, logicalWidth * 0.06), 10, 18);
  const width = baseWidth;
  const textWidth = Math.max(48, width - padding * 2);
  const lineCount = countWrappedLines(text, textWidth, fontSize, MEMO_MAX_LINES);
  const textHeight = lineCount * lineHeight;
  const maxHeight = Math.max(baseHeight, Math.min(Math.max(logicalHeight * 0.9, 96), 220));
  const height = clamp(Math.max(baseHeight, textHeight + padding * 2), baseHeight, maxHeight);
  const left = Number(element.x || 0) + (logicalWidth - width) / 2;
  const top = Number(element.y || 0) + logicalHeight - overlap;

  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    padding,
    overlap,
    fontSize,
    lineHeight,
    textWidth,
    lineCount,
    maxLines: MEMO_MAX_LINES,
    radius: clamp(Math.max(10, height * 0.14), 10, 18),
  };
}
