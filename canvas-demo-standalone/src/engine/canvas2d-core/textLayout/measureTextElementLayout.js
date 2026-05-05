import { normalizeRichHtml, sanitizeText } from "../utils.js";
import {
  measureRichTextBox,
  resolveRichTextDisplayHtml,
  TEXT_BOLD_WEIGHT,
  TEXT_FONT_FAMILY,
  TEXT_FONT_WEIGHT,
  TEXT_LINE_HEIGHT_RATIO,
} from "../rendererText.js";
import {
  getBlockSpacingEmForTag,
  getHeadingFontSize,
  getLineHeightRatioForTag,
  normalizeTagName,
  TEXT_BLOCK_SPACING_EM,
  TEXT_BODY_LINE_HEIGHT_RATIO,
} from "./typographyTokens.js";
import { createTextMeasureHost } from "./createTextMeasureHost.js";
import {
  TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH,
  TEXT_BOX_LAYOUT_MODE_FIXED_SIZE,
} from "../textModel/textBoxLayoutModel.js";
import {
  createTextMeasurementResultModel,
  normalizeTextMeasurementInput,
} from "./textMeasurementModel.js";

const DEFAULT_MIN_WIDTH = 80;
const DEFAULT_MIN_HEIGHT = 40;
const DEFAULT_MAX_WIDTH = 720;
const DEFAULT_FONT_SIZE = 20;
const DEFAULT_FONT_WEIGHT = TEXT_FONT_WEIGHT;
const DEFAULT_BOLD_WEIGHT = TEXT_BOLD_WEIGHT;
const DEFAULT_FONT_FAMILY = TEXT_FONT_FAMILY;
const BODY_LINE_HEIGHT_RATIO = TEXT_BODY_LINE_HEIGHT_RATIO;

function isHTMLElement(value) {
  return typeof HTMLElement !== "undefined" && value instanceof HTMLElement;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
  const paragraphCount = Math.max(
    1,
    clean
      .split(/\n\s*\n+/)
      .map((segment) => segment.trim())
      .filter(Boolean).length || 1
  );
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const width = clamp(Math.round(24 + longest * (fontSize * 0.6)), minWidth, maxWidth);
  const lineHeight = fontSize * BODY_LINE_HEIGHT_RATIO;
  const paragraphSpacing = Math.max(0, paragraphCount - 1) * fontSize * TEXT_BLOCK_SPACING_EM.paragraph;
  const height = Math.max(Math.round(fontSize * 1.25), Math.round(10 + lines.length * lineHeight + paragraphSpacing));
  return { width, height };
}

function applyMeasurementNodeStyles(node, { fontFamily, fontSize, lineHeightRatio, fontWeight, maxWidth, layoutMode, widthHint }) {
  node.style.fontFamily = String(fontFamily || DEFAULT_FONT_FAMILY);
  node.style.fontSize = `${Math.max(1, fontSize)}px`;
  node.style.fontWeight = String(fontWeight || DEFAULT_FONT_WEIGHT);
  node.style.lineHeight = String(
    Math.max(BODY_LINE_HEIGHT_RATIO, Number(lineHeightRatio || TEXT_LINE_HEIGHT_RATIO))
  );
  node.style.boxSizing = "border-box";
  node.style.overflow = "hidden";
  if (layoutMode !== TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH) {
    node.style.display = "block";
    node.style.width = `${Math.max(1, widthHint)}px`;
    node.style.maxWidth = `${Math.max(widthHint || 0, maxWidth)}px`;
    node.style.whiteSpace = "pre-wrap";
    node.style.wordBreak = "break-word";
    node.style.overflowWrap = "anywhere";
  } else {
    node.style.display = "inline-block";
    node.style.width = "max-content";
    node.style.maxWidth = `${Math.max(widthHint || 0, maxWidth)}px`;
    node.style.whiteSpace = "pre";
    node.style.wordBreak = "normal";
    node.style.overflowWrap = "normal";
  }
}

function normalizeMeasurementMarkup(node, { baseFontSize = DEFAULT_FONT_SIZE } = {}) {
  node.querySelectorAll("div, section, article, thead, tbody, tr").forEach((element) => {
    if (!isHTMLElement(element)) {
      return;
    }
    element.style.margin = "0";
    element.style.padding = "0";
  });
  node.querySelectorAll("p").forEach((element) => {
    if (!isHTMLElement(element)) {
      return;
    }
    const spacing = getBlockSpacingEmForTag("p");
    element.style.marginTop = "0";
    element.style.marginBottom = `${spacing}em`;
  });
  node.querySelectorAll("blockquote").forEach((element) => {
    if (!isHTMLElement(element)) {
      return;
    }
    const spacing = getBlockSpacingEmForTag("blockquote");
    element.style.marginTop = `${spacing}em`;
    element.style.marginBottom = `${spacing}em`;
    element.style.paddingInlineStart = "0.9em";
    element.style.borderLeft = "3px solid rgba(148, 163, 184, 0.55)";
  });
  node.querySelectorAll("pre").forEach((element) => {
    if (!isHTMLElement(element)) {
      return;
    }
    const spacing = getBlockSpacingEmForTag("pre");
    element.style.marginTop = `${spacing}em`;
    element.style.marginBottom = `${spacing}em`;
    element.style.whiteSpace = "pre-wrap";
    element.style.wordBreak = "break-word";
    element.style.overflowWrap = "anywhere";
    element.style.padding = "0.6em 0.8em";
    element.style.border = "1px solid rgba(148, 163, 184, 0.32)";
    element.style.borderRadius = "12px";
    element.style.boxSizing = "border-box";
  });
  node.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((element) => {
    if (!isHTMLElement(element)) {
      return;
    }
    const tag = normalizeTagName(element.tagName);
    element.style.fontSize = `${getHeadingFontSize(tag, baseFontSize)}px`;
    element.style.fontWeight = tag === "h1" || tag === "h2" ? "800" : "700";
    element.style.lineHeight = String(getLineHeightRatioForTag(tag));
    element.style.marginTop = "0";
    element.style.marginBottom = `${getBlockSpacingEmForTag(tag)}em`;
  });
  node.querySelectorAll("ul, ol").forEach((element) => {
    if (!isHTMLElement(element)) {
      return;
    }
    const tag = normalizeTagName(element.tagName);
    const spacing = getBlockSpacingEmForTag(tag);
    element.style.marginTop = `${spacing}em`;
    element.style.marginBottom = `${spacing}em`;
    element.style.paddingInlineStart = "1.25em";
  });
  node.querySelectorAll("li").forEach((element) => {
    if (!isHTMLElement(element)) {
      return;
    }
    const isLastInList = !element.nextElementSibling || normalizeTagName(element.nextElementSibling.tagName) !== "li";
    element.style.marginTop = "0";
    element.style.marginBottom = isLastInList ? "0" : `${TEXT_BLOCK_SPACING_EM.listItem}em`;
    element.style.padding = "0";
  });
  node.querySelectorAll("table").forEach((element) => {
    if (!isHTMLElement(element)) {
      return;
    }
    const spacing = getBlockSpacingEmForTag("table");
    element.style.marginTop = `${spacing}em`;
    element.style.marginBottom = `${spacing}em`;
    element.style.borderCollapse = "collapse";
    element.style.width = "100%";
    element.style.tableLayout = "fixed";
  });
  node.querySelectorAll("td, th").forEach((element) => {
    if (!isHTMLElement(element)) {
      return;
    }
    element.style.border = "1px solid rgba(148, 163, 184, 0.45)";
    element.style.padding = "0.38em 0.5em";
    element.style.verticalAlign = "top";
  });
}

function measureWithHost({
  html,
  fontFamily,
  fontSize,
  lineHeightRatio,
  fontWeight,
  layoutMode,
  widthHint,
  maxWidth,
}) {
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
    whiteSpace: node.style.whiteSpace,
    wordBreak: node.style.wordBreak,
    overflowWrap: node.style.overflowWrap,
    boxSizing: node.style.boxSizing,
    overflow: node.style.overflow,
    innerHTML: node.innerHTML,
  };
  try {
    applyMeasurementNodeStyles(node, {
      fontFamily,
      fontSize,
      lineHeightRatio,
      fontWeight,
      maxWidth,
      layoutMode,
      widthHint,
    });
    node.innerHTML = html;
    normalizeMeasurementMarkup(node, { baseFontSize: fontSize });
    const rect = node.getBoundingClientRect();
    const contentWidth = Math.max(node.scrollWidth || 0, rect.width || 0);
    const contentHeight = Math.max(node.scrollHeight || 0, rect.height || 0);
    if (!contentWidth || !contentHeight) {
      return null;
    }
    return {
      contentWidth,
      contentHeight,
      frameWidth: layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH ? Math.min(contentWidth, maxWidth) : widthHint,
      frameHeight: contentHeight,
    };
  } finally {
    node.style.width = previous.width;
    node.style.maxWidth = previous.maxWidth;
    node.style.display = previous.display;
    node.style.fontSize = previous.fontSize;
    node.style.fontWeight = previous.fontWeight;
    node.style.lineHeight = previous.lineHeight;
    node.style.whiteSpace = previous.whiteSpace;
    node.style.wordBreak = previous.wordBreak;
    node.style.overflowWrap = previous.overflowWrap;
    node.style.boxSizing = previous.boxSizing;
    node.style.overflow = previous.overflow;
    node.innerHTML = previous.innerHTML;
  }
}

function measureWithCanvas({
  html,
  plainText,
  fontSize,
  lineHeightRatio,
  fontWeight,
  boldWeight,
  layoutMode,
  widthHint,
  maxWidth,
}) {
  const richSize = measureRichTextBox({
    html,
    text: plainText,
    width: layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH ? maxWidth : widthHint,
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
    frameWidth: layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH ? Math.min(richSize.width, maxWidth) : widthHint,
    frameHeight: richSize.height,
  };
}

export function measureTextLayoutModel(input = {}) {
  const measurementInput = normalizeTextMeasurementInput(input, {
    minWidth: DEFAULT_MIN_WIDTH,
    minHeight: DEFAULT_MIN_HEIGHT,
    maxWidth: DEFAULT_MAX_WIDTH,
    fontSize: DEFAULT_FONT_SIZE,
    fontWeight: DEFAULT_FONT_WEIGHT,
    boldWeight: DEFAULT_BOLD_WEIGHT,
    fontFamily: DEFAULT_FONT_FAMILY,
    lineHeightRatio: BODY_LINE_HEIGHT_RATIO,
  });
  const { content, layout, typography } = measurementInput;
  const measureHtml = buildMeasureHtml(
    resolveRichTextDisplayHtml({
      text: content.plainText,
      html: content.html,
      linkTokens: Array.isArray(content.linkTokens) ? content.linkTokens : [],
    }),
    content.plainText
  );

  if (!measureHtml.trim() && !content.plainText.trim()) {
    return createTextMeasurementResultModel(
      measurementInput,
      {
        contentWidth: 1,
        contentHeight: 1,
        frameWidth: layout.autoWidth ? layout.minWidth : layout.widthHint,
        frameHeight: layout.fixedSize ? layout.heightHint : layout.minHeight,
      },
      {
        measuredWith: "fallback",
        reason: "empty-content",
      }
    );
  }

  const hostMeasured = measureWithHost({
    html: measureHtml,
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize,
    lineHeightRatio: typography.lineHeightRatio,
    fontWeight: typography.fontWeight,
    layoutMode: layout.layoutMode,
    widthHint: layout.widthHint,
    maxWidth: layout.maxWidth,
  });
  if (hostMeasured) {
    return createTextMeasurementResultModel(
      measurementInput,
      hostMeasured,
      {
        measuredWith: "dom",
        reason: "measurement-host",
      }
    );
  }

  const canvasMeasured = measureWithCanvas({
    html: measureHtml,
    plainText: content.plainText,
    fontSize: typography.fontSize,
    lineHeightRatio: typography.lineHeightRatio,
    fontWeight: typography.fontWeight,
    boldWeight: typography.boldWeight,
    layoutMode: layout.layoutMode,
    widthHint: layout.widthHint,
    maxWidth: layout.maxWidth,
  });
  if (canvasMeasured) {
    return createTextMeasurementResultModel(
      measurementInput,
      canvasMeasured,
      {
        measuredWith: "canvas",
        reason: "canvas-runs",
      }
    );
  }

  const fallback = measureFallbackText(content.plainText, {
    minWidth: layout.minWidth,
    maxWidth: layout.autoWidth ? layout.maxWidth : layout.widthHint,
    fontSize: typography.fontSize,
  });
  return createTextMeasurementResultModel(
    measurementInput,
    {
      contentWidth: fallback.width,
      contentHeight: fallback.height,
      frameWidth: layout.autoWidth ? fallback.width : layout.widthHint,
      frameHeight: layout.fixedSize ? layout.heightHint : fallback.height,
    },
    {
      measuredWith: "fallback",
      reason: "heuristic",
    }
  );
}

export function measureTextElementLayout(input = {}) {
  return measureTextLayoutModel(input);
}
