import {
  buildTextTitle,
  clamp,
  createId,
  htmlToPlainText,
  normalizeRichHtml,
  normalizeRichHtmlInlineFontSizes,
  sanitizeText,
} from "../utils.js";
import { TEXT_LINE_HEIGHT_RATIO } from "../rendererText.js";
import { measureTextElementLayout } from "../textLayout/measureTextElementLayout.js";

export const TEXT_WRAP_MODE_MANUAL = "manual";
export const TEXT_RESIZE_MODE_AUTO_WIDTH = "auto-width";
export const TEXT_RESIZE_MODE_WRAP = "wrap";
export const TEXT_MIN_FONT_SIZE = 12;

export function normalizeTextFontSize(value, fallback = 20) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return Math.max(TEXT_MIN_FONT_SIZE, Number(fallback) || 20);
  }
  return Math.max(TEXT_MIN_FONT_SIZE, numericValue);
}

export function normalizeTextWrapMode(value = "") {
  return String(value || "").trim().toLowerCase() === TEXT_WRAP_MODE_MANUAL ? TEXT_WRAP_MODE_MANUAL : TEXT_WRAP_MODE_MANUAL;
}

export function normalizeTextResizeMode(value = "", legacyWrapMode = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === TEXT_RESIZE_MODE_WRAP) {
    return TEXT_RESIZE_MODE_WRAP;
  }
  if (normalized === TEXT_RESIZE_MODE_AUTO_WIDTH) {
    return TEXT_RESIZE_MODE_AUTO_WIDTH;
  }
  return String(legacyWrapMode || "").trim().toLowerCase() === TEXT_RESIZE_MODE_WRAP
    ? TEXT_RESIZE_MODE_WRAP
    : TEXT_RESIZE_MODE_AUTO_WIDTH;
}

function inferLegacyTextResizeMode(element = {}, text = "", fontSize = 20) {
  if (Object.prototype.hasOwnProperty.call(element, "textResizeMode")) {
    return normalizeTextResizeMode(element.textResizeMode, element.wrapMode);
  }
  const natural = measureTextBox(text, { fontSize });
  const width = Math.max(0, Number(element.width ?? 0) || 0);
  const height = Math.max(0, Number(element.height ?? 0) || 0);
  if (width <= 0 && height <= 0) {
    return TEXT_RESIZE_MODE_AUTO_WIDTH;
  }
  const widthDelta = Math.abs(width - natural.width);
  const heightDelta = Math.abs(height - natural.height);
  if (widthDelta >= 24 || heightDelta >= 24) {
    return TEXT_RESIZE_MODE_WRAP;
  }
  return TEXT_RESIZE_MODE_AUTO_WIDTH;
}

export function measureTextBox(text = "", { minWidth = 80, maxWidth = 720, fontSize = 20 } = {}) {
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

export function getTextMinSize(element = {}, options = {}) {
  const html = normalizeRichHtml(element.html || "");
  const plainText = sanitizeText(element.plainText || element.text || htmlToPlainText(html));
  const fontSize = normalizeTextFontSize(element.fontSize ?? options.fontSize ?? 20, options.fontSize ?? 20);
  const resizeMode = normalizeTextResizeMode(element.textResizeMode, element.wrapMode);
  const widthHint = Math.max(80, Number(options.widthHint ?? element.width ?? 80) || 80);
  const measured = measureTextElementLayout({
    html,
    plainText,
    fontSize,
    resizeMode,
    widthHint,
    maxWidth: 720,
    lineHeightRatio: TEXT_LINE_HEIGHT_RATIO,
    fontWeight: "500",
    boldWeight: "700",
  });
  if (measured?.frameWidth && measured?.frameHeight) {
    return {
      width: resizeMode === TEXT_RESIZE_MODE_WRAP ? widthHint : measured.frameWidth,
      height: measured.frameHeight,
    };
  }

  return {
    width:
      resizeMode === TEXT_RESIZE_MODE_WRAP
        ? widthHint
        : measureTextBox(plainText, {
            minWidth: 80,
            maxWidth: 720,
            fontSize,
          }).width,
    height: Math.max(40, measureTextBox(plainText, { minWidth: 80, maxWidth: widthHint, fontSize }).height),
  };
}

export function createTextElement(point, text = "", html = "") {
  const cleanHtml = normalizeRichHtmlInlineFontSizes(html || "");
  const cleanText = sanitizeText(text || htmlToPlainText(cleanHtml));
  const metrics = getTextMinSize(
    {
      html: cleanHtml,
      plainText: cleanText,
      text: cleanText,
      fontSize: 20,
      textResizeMode: TEXT_RESIZE_MODE_AUTO_WIDTH,
    },
    {
      fontSize: 20,
    }
  );
  return {
    id: createId("text"),
    type: "text",
    text: cleanText,
    html: cleanHtml,
    plainText: cleanText,
    wrapMode: TEXT_WRAP_MODE_MANUAL,
    textResizeMode: TEXT_RESIZE_MODE_AUTO_WIDTH,
    title: buildTextTitle(cleanText || "文本"),
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    width: metrics.width,
    height: metrics.height,
    fontSize: 20,
    color: "#0f172a",
    locked: false,
    createdAt: Date.now(),
  };
}

export function normalizeTextElement(element = {}) {
  const base = createTextElement(
    { x: Number(element.x) || 0, y: Number(element.y) || 0 },
    element.text || element.plainText || "",
    element.html || ""
  );
  const nextText = sanitizeText(element.text || element.plainText || htmlToPlainText(element.html || base.html || ""));
  const nextFontSize = normalizeTextFontSize(element.fontSize ?? base.fontSize, base.fontSize);
  const textResizeMode = inferLegacyTextResizeMode(element, nextText, nextFontSize);
  const metrics = getTextMinSize(
    {
      ...element,
      html: normalizeRichHtmlInlineFontSizes(element.html || base.html || ""),
      plainText: nextText,
      text: nextText,
      fontSize: nextFontSize,
      textResizeMode,
    },
    {
      widthHint: Number(element.width ?? 0) || undefined,
      fontSize: nextFontSize,
    }
  );
  const nextWidth =
    textResizeMode === TEXT_RESIZE_MODE_WRAP
      ? Math.max(80, Number(element.width ?? 0) || metrics.width)
      : Math.max(80, metrics.width);
  const nextHeight = Math.max(40, metrics.height);
  return {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "text",
    text: nextText,
    html: normalizeRichHtmlInlineFontSizes(element.html || base.html || ""),
    plainText: sanitizeText(element.plainText || nextText || htmlToPlainText(element.html || base.html || "")),
    wrapMode: normalizeTextWrapMode(element.wrapMode || base.wrapMode),
    textResizeMode,
    title: buildTextTitle(element.title || nextText || element.plainText || element.html || "文本"),
    x: Number(element.x ?? base.x) || 0,
    y: Number(element.y ?? base.y) || 0,
    width: nextWidth,
    height: nextHeight,
    fontSize: nextFontSize,
    color: String(element.color || base.color),
    locked: Boolean(element.locked ?? base.locked),
    createdAt: Number(element.createdAt) || base.createdAt,
  };
}
