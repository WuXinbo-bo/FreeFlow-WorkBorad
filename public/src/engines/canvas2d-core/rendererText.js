export const TEXT_LINE_HEIGHT_RATIO = 1.3;
const DEFAULT_HIGHLIGHT = "#fff4a3";
export const FLOW_NODE_TEXT_LAYOUT = Object.freeze({
  lineHeightRatio: 1.45,
  fontWeight: "400",
  boldWeight: "600",
  paddingX: 14,
  paddingY: 12,
});

export function getFlowNodeTextPadding(scale = 1, bounds = null) {
  const scaleValue = Math.max(0.1, Number(scale) || 1);
  const rawX = FLOW_NODE_TEXT_LAYOUT.paddingX * scaleValue;
  const rawY = FLOW_NODE_TEXT_LAYOUT.paddingY * scaleValue;
  const width = Math.max(0, Number(bounds?.width) || 0);
  const height = Math.max(0, Number(bounds?.height) || 0);
  const limitX = width > 0 ? Math.max(0, width * 0.18) : Number.POSITIVE_INFINITY;
  const limitY = height > 0 ? Math.max(0, height * 0.18) : Number.POSITIVE_INFINITY;
  return {
    x: Math.max(1, Math.min(rawX, limitX)),
    y: Math.max(1, Math.min(rawY, limitY)),
  };
}

function parseFontSize(value) {
  if (!value) return 0;
  const match = String(value).match(/(\d+(?:\.\d+)?)px/);
  if (match) return Number(match[1]) || 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function applyElementStyle(style, element) {
  if (!element || !style) return style;
  const next = { ...style };
  const tag = element.tagName?.toLowerCase?.() || "";
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
  if (tag === "mark") {
    next.highlight = true;
    if (!next.highlightColor) next.highlightColor = DEFAULT_HIGHLIGHT;
  }
  if (element.getAttribute?.("data-mark") === "highlight") {
    next.highlight = true;
    if (!next.highlightColor) next.highlightColor = DEFAULT_HIGHLIGHT;
  }
  if (element instanceof HTMLElement) {
    const inline = element.style;
    if (inline.color) next.color = inline.color;
    if (inline.backgroundColor) {
      next.highlight = true;
      next.highlightColor = inline.backgroundColor;
    }
    const weight = inline.fontWeight;
    if (weight && (weight === "bold" || Number(weight) >= 600)) {
      next.bold = true;
    }
    if (inline.fontStyle === "italic") {
      next.italic = true;
    }
    const decoration = inline.textDecorationLine || inline.textDecoration || "";
    if (decoration.includes("underline")) next.underline = true;
    if (decoration.includes("line-through")) next.strike = true;
    const size = parseFontSize(inline.fontSize);
    if (size) next.fontSize = size;
  }
  return next;
}

function isBlockTag(tagName = "") {
  return ["div", "p", "section", "article", "li", "ul", "ol"].includes(tagName);
}

function parseRichTextRuns(html = "") {
  if (!html || typeof document === "undefined" || typeof Node === "undefined") {
    return null;
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  const runs = [];
  const pushLineBreak = () => {
    if (!runs.length) {
      return;
    }
    if (runs[runs.length - 1]?.text === "\n") {
      return;
    }
    runs.push({ text: "\n", style: {} });
  };
  const walk = (node, style) => {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const value = String(node.nodeValue || "");
      if (value) {
        runs.push({ text: value, style: { ...style } });
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const element = node;
    const tag = element.tagName.toLowerCase();
    if (tag === "br") {
      pushLineBreak();
      return;
    }
    const nextStyle = applyElementStyle(style, element);
    const block = isBlockTag(tag);
    element.childNodes.forEach((child) => walk(child, nextStyle));
    if (block) {
      pushLineBreak();
    }
  };
  template.content.childNodes.forEach((node) => walk(node, {}));
  while (runs.length && runs[0]?.text === "\n") {
    runs.shift();
  }
  while (runs.length && runs[runs.length - 1]?.text === "\n") {
    runs.pop();
  }
  return runs;
}

function fontForRun(runStyle, baseFontSize, scale = 1, options = {}) {
  const rawFont = Number(runStyle.fontSize || baseFontSize);
  const fontSize = Math.max(10, rawFont) * Math.max(0.1, Number(scale) || 1);
  const weight = runStyle.bold ? String(options.boldWeight || "600") : String(options.fontWeight || "500");
  const fontStyle = runStyle.italic ? "italic" : "normal";
  return `${fontStyle} ${weight} ${Math.max(1, fontSize)}px "Segoe UI", "PingFang SC", sans-serif`;
}

function createLine(baseFontSize, scaleValue, lineHeightRatio) {
  return {
    segments: [],
    width: 0,
    height: Math.max(22, baseFontSize * lineHeightRatio) * scaleValue,
  };
}

function appendSegment(line, text, style, width, baseFontSize, scaleValue, lineHeightRatio) {
  if (!text) return;
  const fontSize = Math.max(10, Number(style.fontSize || baseFontSize)) * scaleValue;
  const lineHeight = Math.max(22, fontSize * lineHeightRatio);
  line.height = Math.max(line.height, lineHeight);
  const previous = line.segments[line.segments.length - 1];
  if (previous && previous.style === style) {
    previous.text += text;
    previous.width += width;
  } else {
    line.segments.push({ text, style, width });
  }
  line.width += width;
}

function isWhitespaceToken(token = "") {
  return /^\s+$/.test(token);
}

function tokenizeWrapText(text = "") {
  const tokens = [];
  let index = 0;
  const value = String(text || "");
  while (index < value.length) {
    const rest = value.slice(index);
    const whitespaceMatch = rest.match(/^[^\S\r\n]+/);
    if (whitespaceMatch) {
      tokens.push(whitespaceMatch[0]);
      index += whitespaceMatch[0].length;
      continue;
    }
    const latinMatch = rest.match(/^[A-Za-z0-9_./:\\\-]+/);
    if (latinMatch) {
      tokens.push(latinMatch[0]);
      index += latinMatch[0].length;
      continue;
    }
    tokens.push(value[index]);
    index += 1;
  }
  return tokens;
}

function splitOversizedToken(token, ctx, maxWidth) {
  const chars = Array.from(String(token || ""));
  const segments = [];
  let buffer = "";
  chars.forEach((char) => {
    const next = buffer + char;
    const nextWidth = ctx.measureText(next).width;
    if (buffer && nextWidth > maxWidth) {
      segments.push(buffer);
      buffer = char;
      return;
    }
    buffer = next;
  });
  if (buffer) {
    segments.push(buffer);
  }
  return segments.length ? segments : chars;
}

function layoutRichRuns(runs, ctx, maxWidth, baseFontSize, scale = 1, options = {}) {
  const lines = [];
  const scaleValue = Math.max(0.1, Number(scale) || 1);
  const lineHeightRatio = Math.max(1, Number(options.lineHeightRatio || TEXT_LINE_HEIGHT_RATIO));
  let current = createLine(baseFontSize, scaleValue, lineHeightRatio);

  const pushLine = () => {
    lines.push(current);
    current = createLine(baseFontSize, scaleValue, lineHeightRatio);
  };

  const pushSegment = (text, style) => {
    if (!text) return;
    const width = ctx.measureText(text).width;
    appendSegment(current, text, style, width, baseFontSize, scaleValue, lineHeightRatio);
  };

  runs.forEach((run) => {
    const text = String(run.text || "");
    if (!text) return;
    if (text === "\n") {
      pushLine();
      return;
    }
    const style = run.style || {};
    ctx.font = fontForRun(style, baseFontSize, scaleValue, options);
    tokenizeWrapText(text).forEach((token) => {
      if (!token) {
        return;
      }
      const whitespace = isWhitespaceToken(token);
      if (whitespace && current.width <= 0) {
        return;
      }
      const tokenWidth = ctx.measureText(token).width;
      if (tokenWidth <= maxWidth && (current.width + tokenWidth <= maxWidth || current.width <= 0)) {
        if (!whitespace || current.width > 0) {
          pushSegment(token, style);
        }
        return;
      }
      if (whitespace) {
        pushLine();
        return;
      }
      pushLine();
      ctx.font = fontForRun(style, baseFontSize, scaleValue, options);
      if (ctx.measureText(token).width <= maxWidth) {
        pushSegment(token, style);
        return;
      }
      splitOversizedToken(token, ctx, maxWidth).forEach((part, partIndex) => {
        if (partIndex > 0) {
          pushLine();
          ctx.font = fontForRun(style, baseFontSize, scaleValue, options);
        }
        pushSegment(part, style);
      });
    });
  });

  if (current.segments.length) {
    lines.push(current);
  }
  return lines;
}

export function drawRichTextInBox(ctx, {
  x,
  y,
  width,
  height,
  html,
  text,
  color,
  fontSize,
  scale = 1,
  lineHeightRatio = TEXT_LINE_HEIGHT_RATIO,
  fontWeight = "500",
  boldWeight = "600",
} = {}) {
  const baseFontSize = Math.max(10, Number(fontSize || 18));
  const scaleValue = Math.max(0.1, Number(scale) || 1);
  const plain = String(text || "");
  const runs = parseRichTextRuns(html);
  if (!runs || !runs.length) {
    return false;
  }
  const maxWidth = Math.max(1, width);
  const lines = layoutRichRuns(runs, ctx, maxWidth, baseFontSize, scaleValue, {
    lineHeightRatio,
    fontWeight,
    boldWeight,
  });
  let cursorY = y;
  for (const line of lines) {
    if (cursorY + line.height > y + height) {
      break;
    }
    let cursorX = x;
    for (const seg of line.segments) {
      const style = seg.style || {};
      ctx.font = fontForRun(style, baseFontSize, scaleValue, { fontWeight, boldWeight });
      const segmentText = seg.text;
      const segmentWidth = seg.width;
      const highlight = style.highlight;
      const highlightColor = style.highlightColor || DEFAULT_HIGHLIGHT;
      if (highlight) {
        ctx.save();
        ctx.fillStyle = highlightColor;
        ctx.fillRect(cursorX, cursorY + 2, segmentWidth, Math.max(4, line.height - 4));
        ctx.restore();
      }
      ctx.fillStyle = style.color || color || "#0f172a";
      ctx.textBaseline = "top";
      ctx.fillText(segmentText, cursorX, cursorY);
      if (style.underline || style.strike) {
        ctx.save();
        ctx.strokeStyle = style.color || color || "#0f172a";
        ctx.lineWidth = Math.max(1, baseFontSize * scaleValue * 0.08);
        const underlineY = cursorY + line.height - 4;
        if (style.underline) {
          ctx.beginPath();
          ctx.moveTo(cursorX, underlineY);
          ctx.lineTo(cursorX + segmentWidth, underlineY);
          ctx.stroke();
        }
        if (style.strike) {
          const strikeY = cursorY + line.height * 0.55;
          ctx.beginPath();
          ctx.moveTo(cursorX, strikeY);
          ctx.lineTo(cursorX + segmentWidth, strikeY);
          ctx.stroke();
        }
        ctx.restore();
      }
      cursorX += segmentWidth;
    }
    cursorY += line.height;
  }
  return Boolean(plain || html);
}

export function measureRichTextBox({
  html = "",
  text = "",
  width = 0,
  fontSize = 18,
  scale = 1,
  lineHeightRatio = TEXT_LINE_HEIGHT_RATIO,
  fontWeight = "500",
  boldWeight = "600",
} = {}) {
  const runs = parseRichTextRuns(html);
  if (!runs || !runs.length || typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  const baseFontSize = Math.max(10, Number(fontSize || 18));
  const maxWidth = Math.max(1, Number(width || 1));
  const lines = layoutRichRuns(runs, ctx, maxWidth, baseFontSize, scale, {
    lineHeightRatio,
    fontWeight,
    boldWeight,
  });
  if (!lines.length) {
    return null;
  }
  const height = lines.reduce((sum, line) => sum + line.height, 0);
  const lineWidth = lines.reduce((max, line) => Math.max(max, line.width), 0);
  return {
    width: Math.max(1, lineWidth),
    height: Math.max(1, height),
  };
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 999) {
  const parts = String(text || "").split("\n");
  let row = 0;
  parts.forEach((part) => {
    const words = part.split(/\s+/).filter(Boolean);
    if (!words.length) {
      row += 1;
      return;
    }
    let line = "";
    words.forEach((word) => {
      const nextLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(nextLine).width > maxWidth && line) {
        if (row < maxLines) {
          ctx.fillText(line, x, y + row * lineHeight);
        }
        line = word;
        row += 1;
      } else {
        line = nextLine;
      }
    });
    if (line && row < maxLines) {
      ctx.fillText(line, x, y + row * lineHeight);
    }
    row += 1;
  });
}

function drawTextBody(ctx, element, view, selected, hover, editing, drawSelectionFrame, drawHandles, options = {}) {
  const scale = Math.max(0.1, Number(view?.scale) || 1);
  const x = Number(element.x || 0) * scale + Number(view?.offsetX || 0);
  const y = Number(element.y || 0) * scale + Number(view?.offsetY || 0);
  const width = Math.max(1, Number(element.width) || 1) * scale;
  const height = Math.max(1, Number(element.height) || 1) * scale;
  const padding = 0;
  const text = String(options.text ?? element.text ?? element.plainText ?? "");
  const placeholder = String(options.placeholder ?? "双击输入文本");
  const logicalFontSize = Math.max(12, Number(element.fontSize || 18));
  const fontSize = logicalFontSize * scale;
  const lineHeight = Math.max(22, logicalFontSize * TEXT_LINE_HEIGHT_RATIO) * scale;

  ctx.save();
  ctx.fillStyle = element.color || "#0f172a";
  ctx.font = `500 ${Math.max(1, fontSize)}px "Segoe UI", "PingFang SC", sans-serif`;
  ctx.textBaseline = "top";
  const hideWhenEditing = Boolean(options.hideWhenEditing);
  const hideText = Boolean(options.hideText);
  if (!hideText && (!editing || !hideWhenEditing)) {
    const html = String(options.html ?? element.html ?? "");
    const rendered = html.trim()
      ? drawRichTextInBox(ctx, {
          x: x + padding,
          y: y + padding,
          width: Math.max(1, width - padding * 2),
          height: Math.max(1, height - padding * 2),
          html,
          text: text || placeholder,
          color: element.color || "#0f172a",
          fontSize: logicalFontSize,
          scale,
        })
      : false;
    if (!rendered) {
      wrapText(
        ctx,
        text || placeholder,
        x + padding,
        y + padding,
        Math.max(1, width - padding * 2),
        lineHeight
      );
    }
  }
  drawSelectionFrame(ctx, x, y, width, height, selected, hover);
  if (selected) {
    drawHandles(ctx, element, view);
  }
  ctx.restore();
}

export function drawTextElement(ctx, element, view, selected, hover, editing, drawSelectionFrame, drawHandles, options = {}) {
  const renderText = Boolean(options.renderText);
  drawTextBody(ctx, element, view, selected, hover, editing, drawSelectionFrame, drawHandles, {
    text: options.text ?? element.text ?? "",
    placeholder: "双击输入文本",
    hideText: !renderText,
    hideWhenEditing: true,
    html: element.html || "",
  });
}
