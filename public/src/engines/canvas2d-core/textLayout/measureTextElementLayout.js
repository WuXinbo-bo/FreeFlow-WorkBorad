import { htmlToPlainText, normalizeRichHtml, sanitizeText } from "../utils.js";
import { measureRichTextBox, TEXT_LINE_HEIGHT_RATIO } from "../rendererText.js";
import { createTextMeasureHost } from "./createTextMeasureHost.js";

const DEFAULT_MIN_WIDTH = 80;
const DEFAULT_MIN_HEIGHT = 40;
const DEFAULT_MAX_WIDTH = 720;
const DEFAULT_FONT_SIZE = 20;
const DEFAULT_FONT_WEIGHT = "500";
const DEFAULT_BOLD_WEIGHT = "700";
const DEFAULT_FONT_FAMILY = '"Segoe UI", "PingFang SC", sans-serif';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeFontSize(value, fallback = DEFAULT_FONT_SIZE) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return Math.max(12, Number(fallback) || DEFAULT_FONT_SIZE);
  }
  return Math.max(12, numericValue);
}

function normalizeResizeMode(value = "") {
  return String(value || "").trim().toLowerCase() === "wrap" ? "wrap" : "auto-width";
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildMeasureHtml(html = "", plainText = "") {
  const cleanHtml = normalizeRichHtml(html || "");
  if (cleanHtml.trim()) {
    return cleanHtml;
  }
  const cleanText = sanitizeText(plainText || "");
  if (!cleanText) {
    return "";
  }
  return escapeHtml(cleanText).replace(/\n/g, "<br>");
}

function measureFallbackText(text = "", { minWidth = DEFAULT_MIN_WIDTH, maxWidth = DEFAULT_MAX_WIDTH, fontSize = DEFAULT_FONT_SIZE } = {}) {
  const clean = sanitizeText(text);
  const lines = clean ? clean.split("\n") : [""];
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const width = clamp(Math.round(24 + longest * (fontSize * 0.6)), minWidth, maxWidth);
  const height = Math.max(
    Math.round(fontSize * 1.6),
    Math.round(16 + lines.length * Math.max(22, fontSize * TEXT_LINE_HEIGHT_RATIO))
  );
  return { width, height };
}

function normalizeMeasuredResult(result, { minWidth, minHeight, resizeMode, widthHint, measuredWith, reason }) {
  const contentWidth = Math.max(1, Math.ceil(Number(result?.contentWidth || result?.frameWidth || 0) || 1));
  const contentHeight = Math.max(1, Math.ceil(Number(result?.contentHeight || result?.frameHeight || 0) || 1));
  const frameWidth =
    resizeMode === "wrap"
      ? Math.max(minWidth, Number(widthHint || minWidth) || minWidth)
      : Math.max(minWidth, Math.ceil(Number(result?.frameWidth || contentWidth) || contentWidth));
  const frameHeight = Math.max(minHeight, Math.ceil(Number(result?.frameHeight || contentHeight) || contentHeight));
  return {
    contentWidth,
    contentHeight,
    frameWidth,
    frameHeight,
    measuredWith,
    reason,
  };
}

function applyMeasurementNodeStyles(node, { fontSize, lineHeightRatio, fontWeight, maxWidth, resizeMode, widthHint }) {
  node.style.fontFamily = DEFAULT_FONT_FAMILY;
  node.style.fontSize = `${Math.max(1, fontSize)}px`;
  node.style.fontWeight = String(fontWeight || DEFAULT_FONT_WEIGHT);
  node.style.lineHeight = String(Math.max(1, Number(lineHeightRatio || TEXT_LINE_HEIGHT_RATIO)));
  node.style.maxWidth = `${Math.max(widthHint || 0, maxWidth)}px`;
  if (resizeMode === "wrap") {
    node.style.display = "block";
    node.style.width = `${Math.max(1, widthHint)}px`;
  } else {
    node.style.display = "inline-block";
    node.style.width = "max-content";
  }
}

function normalizeMeasurementMarkup(node) {
  node.querySelectorAll("p, div, section, article").forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    element.style.margin = "0";
    element.style.padding = "0";
  });
  node.querySelectorAll("ul, ol").forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    element.style.margin = "0";
    element.style.paddingInlineStart = "1.25em";
  });
  node.querySelectorAll("li").forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    element.style.margin = "0";
    element.style.padding = "0";
  });
}

function measureWithHost({ html, fontSize, lineHeightRatio, fontWeight, resizeMode, widthHint, maxWidth }) {
  const host = createTextMeasureHost();
  if (!host?.content) {
    return null;
  }
  const node = host.content;
  const previous = {
    width: node.style.width,
    maxWidth: node.style.maxWidth,
    display: node.style.display,
    fontSize: node.style.fontSize,
    fontWeight: node.style.fontWeight,
    lineHeight: node.style.lineHeight,
    innerHTML: node.innerHTML,
  };
  try {
    applyMeasurementNodeStyles(node, {
      fontSize,
      lineHeightRatio,
      fontWeight,
      maxWidth,
      resizeMode,
      widthHint,
    });
    node.innerHTML = html;
    normalizeMeasurementMarkup(node);
    const rect = node.getBoundingClientRect();
    const contentWidth = Math.max(node.scrollWidth || 0, rect.width || 0);
    const contentHeight = Math.max(node.scrollHeight || 0, rect.height || 0);
    if (!contentWidth || !contentHeight) {
      return null;
    }
    return {
      contentWidth,
      contentHeight,
      frameWidth: resizeMode === "wrap" ? widthHint : Math.min(contentWidth, maxWidth),
      frameHeight: contentHeight,
    };
  } finally {
    node.style.width = previous.width;
    node.style.maxWidth = previous.maxWidth;
    node.style.display = previous.display;
    node.style.fontSize = previous.fontSize;
    node.style.fontWeight = previous.fontWeight;
    node.style.lineHeight = previous.lineHeight;
    node.innerHTML = previous.innerHTML;
  }
}

function measureWithEditorElement({
  editorElement,
  fontSize,
  lineHeightRatio,
  resizeMode,
  widthHint,
  scale,
  maxWidth,
  minWidth,
  minHeight,
  plainText,
}) {
  if (!(editorElement instanceof HTMLElement)) {
    return null;
  }
  const scaleValue = Math.max(0.1, Number(scale) || 1);
  const previous = {
    width: editorElement.style.width,
    height: editorElement.style.height,
    maxWidth: editorElement.style.maxWidth,
  };
  try {
    editorElement.style.width =
      resizeMode === "wrap" ? `${Math.max(1, widthHint) * scaleValue}px` : "max-content";
    editorElement.style.height = "auto";
    editorElement.style.maxWidth = `${Math.max(widthHint || 0, maxWidth) * scaleValue}px`;
    const rect = editorElement.getBoundingClientRect();
    const contentWidth =
      resizeMode === "wrap"
        ? Math.max(1, Number(widthHint || minWidth) || minWidth)
        : Math.max(
            minWidth,
            Math.min(
              maxWidth,
              Math.ceil(Math.max(editorElement.scrollWidth || 0, rect.width || 0) / scaleValue)
            )
          );
    const lineCount = Math.max(1, String(plainText || "").split("\n").length);
    const lineHeight = Math.max(22, fontSize * lineHeightRatio);
    const contentHeight = Math.max(
      minHeight,
      Math.ceil(
        Math.max(editorElement.scrollHeight || 0, rect.height || 0, lineCount * lineHeight) / scaleValue
      )
    );
    return {
      contentWidth,
      contentHeight,
      frameWidth: resizeMode === "wrap" ? widthHint : contentWidth,
      frameHeight: contentHeight,
    };
  } finally {
    editorElement.style.width = previous.width;
    editorElement.style.height = previous.height;
    editorElement.style.maxWidth = previous.maxWidth;
  }
}

function measureWithCanvas({ html, plainText, fontSize, lineHeightRatio, fontWeight, boldWeight, resizeMode, widthHint, maxWidth }) {
  const richSize = measureRichTextBox({
    html,
    text: plainText,
    width: resizeMode === "wrap" ? widthHint : maxWidth,
    fontSize,
    scale: 1,
    lineHeightRatio,
    fontWeight,
    boldWeight,
  });
  if (!richSize?.width || !richSize?.height) {
    return null;
  }
  return {
    contentWidth: richSize.width,
    contentHeight: richSize.height,
    frameWidth: resizeMode === "wrap" ? widthHint : Math.min(richSize.width, maxWidth),
    frameHeight: richSize.height,
  };
}

export function measureTextElementLayout(input = {}) {
  const html = normalizeRichHtml(input.html || "");
  const plainText = sanitizeText(input.plainText || input.text || htmlToPlainText(html));
  const fontSize = normalizeFontSize(input.fontSize, DEFAULT_FONT_SIZE);
  const resizeMode = normalizeResizeMode(input.resizeMode);
  const minWidth = Math.max(1, Number(input.minWidth || DEFAULT_MIN_WIDTH) || DEFAULT_MIN_WIDTH);
  const minHeight = Math.max(1, Number(input.minHeight || DEFAULT_MIN_HEIGHT) || DEFAULT_MIN_HEIGHT);
  const maxWidth = Math.max(minWidth, Number(input.maxWidth || DEFAULT_MAX_WIDTH) || DEFAULT_MAX_WIDTH);
  const widthHint = Math.max(minWidth, Number(input.widthHint || minWidth) || minWidth);
  const lineHeightRatio = Math.max(1, Number(input.lineHeightRatio || TEXT_LINE_HEIGHT_RATIO));
  const fontWeight = String(input.fontWeight || DEFAULT_FONT_WEIGHT);
  const boldWeight = String(input.boldWeight || DEFAULT_BOLD_WEIGHT);
  const measureHtml = buildMeasureHtml(html, plainText);

  if (!measureHtml.trim() && !plainText.trim()) {
    return {
      contentWidth: 1,
      contentHeight: 1,
      frameWidth: minWidth,
      frameHeight: minHeight,
      measuredWith: "fallback",
      reason: "empty-content",
    };
  }

  const editorMeasured = measureWithEditorElement({
    editorElement: input.editorElement,
    fontSize,
    lineHeightRatio,
    resizeMode,
    widthHint,
    scale: input.scale,
    maxWidth,
    minWidth,
    minHeight,
    plainText,
  });
  if (editorMeasured) {
    return normalizeMeasuredResult(editorMeasured, {
      minWidth,
      minHeight,
      resizeMode,
      widthHint,
      measuredWith: "dom",
      reason: "editor-element",
    });
  }

  const hostMeasured = measureWithHost({
    html: measureHtml,
    fontSize,
    lineHeightRatio,
    fontWeight,
    resizeMode,
    widthHint,
    maxWidth,
  });
  if (hostMeasured) {
    return normalizeMeasuredResult(hostMeasured, {
      minWidth,
      minHeight,
      resizeMode,
      widthHint,
      measuredWith: "dom",
      reason: "measurement-host",
    });
  }

  const canvasMeasured = measureWithCanvas({
    html: measureHtml,
    plainText,
    fontSize,
    lineHeightRatio,
    fontWeight,
    boldWeight,
    resizeMode,
    widthHint,
    maxWidth,
  });
  if (canvasMeasured) {
    return normalizeMeasuredResult(canvasMeasured, {
      minWidth,
      minHeight,
      resizeMode,
      widthHint,
      measuredWith: "canvas",
      reason: "canvas-runs",
    });
  }

  const fallback = measureFallbackText(plainText, {
    minWidth,
    maxWidth: resizeMode === "wrap" ? widthHint : maxWidth,
    fontSize,
  });
  return normalizeMeasuredResult(
    {
      contentWidth: fallback.width,
      contentHeight: fallback.height,
      frameWidth: resizeMode === "wrap" ? widthHint : fallback.width,
      frameHeight: fallback.height,
    },
    {
      minWidth,
      minHeight,
      resizeMode,
      widthHint,
      measuredWith: "fallback",
      reason: "heuristic",
    }
  );
}
