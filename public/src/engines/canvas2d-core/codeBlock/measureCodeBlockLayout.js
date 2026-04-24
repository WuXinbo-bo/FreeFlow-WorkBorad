import { sanitizeText } from "../utils.js";
import {
  CODE_BLOCK_DEFAULT_TAB_SIZE,
  CODE_BLOCK_MIN_HEIGHT,
  CODE_BLOCK_MIN_WIDTH,
  isMermaidCodeBlock,
} from "../elements/codeBlock.js";

const MAX_ESTIMATE_WIDTH = 1080;
const MIN_BODY_LINES = 1;
const EMPTY_LAYOUT_CACHE = {
  rawLineCount: 1,
  longestLineChars: 12,
  visualLineCount: 1,
};

function expandTabs(source = "", tabSize = CODE_BLOCK_DEFAULT_TAB_SIZE) {
  const safeTabSize = Math.max(2, Math.min(8, Number(tabSize) || CODE_BLOCK_DEFAULT_TAB_SIZE));
  return String(source || "").replace(/\t/g, " ".repeat(safeTabSize));
}

function getLineCount(code = "") {
  if (!String(code || "").length) {
    return 1;
  }
  return sanitizeText(code).split("\n").length;
}

function getLongestLineLength(code = "", tabSize = CODE_BLOCK_DEFAULT_TAB_SIZE) {
  return sanitizeText(code)
    .split("\n")
    .reduce((max, line) => Math.max(max, expandTabs(line, tabSize).length), 0);
}

function getWrapLineCount(code = "", maxCharsPerLine = 1, tabSize = CODE_BLOCK_DEFAULT_TAB_SIZE) {
  const safeChars = Math.max(1, Math.floor(Number(maxCharsPerLine) || 1));
  const lines = sanitizeText(code).split("\n");
  return Math.max(
    MIN_BODY_LINES,
    lines.reduce((sum, line) => {
      const expanded = expandTabs(line, tabSize);
      return sum + Math.max(1, Math.ceil(expanded.length / safeChars));
    }, 0)
  );
}

export function getCodeBlockSceneMetrics(item = {}, options = {}) {
  const fontSize = Math.max(12, Number(options.fontSize ?? item.fontSize) || 16);
  const lineHeight = Math.max(18, Math.round(fontSize * 1.55));
  const headerHeight = item.headerVisible === false ? 0 : Math.max(34, Math.round(fontSize * 2.1));
  const bodyPaddingX = Math.max(12, Math.round(fontSize * 0.95));
  const bodyPaddingY = Math.max(10, Math.round(fontSize * 0.72));
  const lineNumberDigits = Math.max(2, String(Math.max(1, getLineCount(item.code || item.text || ""))).length);
  const gutterWidth = item.showLineNumbers === false ? 0 : Math.round(fontSize * 0.72 * (lineNumberDigits + 1.8));
  const charWidth = Math.max(7, fontSize * 0.61);
  return {
    fontSize,
    lineHeight,
    headerHeight,
    bodyPaddingX,
    bodyPaddingY,
    gutterWidth,
    charWidth,
  };
}

export function measureCodeBlockLayout(item = {}, options = {}) {
  const code = sanitizeText(item.code ?? item.text ?? item.plainText ?? "");
  const metrics = getCodeBlockSceneMetrics(item, options);
  const widthHint = Math.max(CODE_BLOCK_MIN_WIDTH, Number(options.widthHint ?? item.width) || CODE_BLOCK_MIN_WIDTH);
  const logicalWidth = Math.min(MAX_ESTIMATE_WIDTH, widthHint);
  const contentWidth = Math.max(
    48,
    logicalWidth - metrics.bodyPaddingX * 2 - metrics.gutterWidth
  );
  const rawLineCount = Math.max(MIN_BODY_LINES, getLineCount(code));
  const longestLineChars = getLongestLineLength(code, item.tabSize);
  const wrapCharsPerLine = Math.max(1, Math.floor(contentWidth / metrics.charWidth));
  const visualLineCount = item.wrap === true
    ? getWrapLineCount(code, wrapCharsPerLine, item.tabSize)
    : rawLineCount;
  const mermaidPreviewLines = isMermaidCodeBlock(item) && item.previewMode !== "source"
    ? Math.max(8, Math.min(26, rawLineCount + 2))
    : visualLineCount;
  const bodyLineCount = item.collapsed === true ? 0 : mermaidPreviewLines;
  const bodyHeight = item.collapsed === true
    ? 0
    : Math.max(metrics.lineHeight * Math.max(MIN_BODY_LINES, bodyLineCount), metrics.lineHeight);
  const bodyInnerHeight = item.collapsed === true ? 0 : bodyHeight + metrics.bodyPaddingY * 2;
  const estimatedWidth = Math.max(
    CODE_BLOCK_MIN_WIDTH,
    Math.min(
      MAX_ESTIMATE_WIDTH,
      Math.round(
        metrics.bodyPaddingX * 2 +
        metrics.gutterWidth +
        Math.max(12, longestLineChars) * metrics.charWidth
      )
    )
  );
  const height = Math.max(
    CODE_BLOCK_MIN_HEIGHT,
    Math.round(metrics.headerHeight + bodyInnerHeight)
  );
  return {
    width: Math.max(CODE_BLOCK_MIN_WIDTH, Number(options.fixedWidth ?? logicalWidth) || logicalWidth),
    height,
    estimatedWidth,
    metrics,
    code,
    rawLineCount,
    visualLineCount,
    contentWidth,
    wrapCharsPerLine,
  };
}

export function createCodeBlockLayoutCache(layout = {}) {
  return {
    rawLineCount: Math.max(MIN_BODY_LINES, Number(layout.rawLineCount) || MIN_BODY_LINES),
    longestLineChars: Math.max(12, Number(layout.longestLineChars) || 12),
    visualLineCount: Math.max(MIN_BODY_LINES, Number(layout.visualLineCount) || MIN_BODY_LINES),
  };
}

export function measureCodeBlockLayoutFast(item = {}, options = {}) {
  const metrics = getCodeBlockSceneMetrics(item, options);
  const widthHint = Math.max(CODE_BLOCK_MIN_WIDTH, Number(options.widthHint ?? item.width) || CODE_BLOCK_MIN_WIDTH);
  const logicalWidth = Math.min(MAX_ESTIMATE_WIDTH, widthHint);
  const cache = item?.layoutCache && typeof item.layoutCache === "object" ? item.layoutCache : EMPTY_LAYOUT_CACHE;
  const rawLineCount = Math.max(MIN_BODY_LINES, Number(cache.rawLineCount) || MIN_BODY_LINES);
  const visualLineCount = Math.max(MIN_BODY_LINES, Number(cache.visualLineCount) || rawLineCount);
  const bodyLineCount = item.collapsed === true ? 0 : (
    isMermaidCodeBlock(item) && item.previewMode !== "source"
      ? Math.max(8, Math.min(26, rawLineCount + 2))
      : visualLineCount
  );
  const bodyHeight = item.collapsed === true
    ? 0
    : Math.max(metrics.lineHeight * Math.max(MIN_BODY_LINES, bodyLineCount), metrics.lineHeight);
  const bodyInnerHeight = item.collapsed === true ? 0 : bodyHeight + metrics.bodyPaddingY * 2;
  const estimatedWidth = Math.max(
    CODE_BLOCK_MIN_WIDTH,
    Math.min(
      MAX_ESTIMATE_WIDTH,
      Math.round(
        metrics.bodyPaddingX * 2 +
        metrics.gutterWidth +
        Math.max(12, Number(cache.longestLineChars) || 12) * metrics.charWidth
      )
    )
  );
  return {
    width: Math.max(CODE_BLOCK_MIN_WIDTH, Number(options.fixedWidth ?? logicalWidth) || logicalWidth),
    height: Math.max(CODE_BLOCK_MIN_HEIGHT, Math.round(metrics.headerHeight + bodyInnerHeight)),
    estimatedWidth,
    metrics,
    code: sanitizeText(item.code ?? item.text ?? item.plainText ?? ""),
    rawLineCount,
    visualLineCount,
    contentWidth: Math.max(48, logicalWidth - metrics.bodyPaddingX * 2 - metrics.gutterWidth),
    wrapCharsPerLine: 0,
  };
}

export function resolveCodeBlockAutoHeight(item = {}, options = {}) {
  return measureCodeBlockLayout(item, options).height;
}

export function estimateCodeBlockSize(text = "", fontSize = 16, options = {}) {
  const baseItem = {
    code: sanitizeText(text),
    text: sanitizeText(text),
    fontSize,
    wrap: options.wrap === true,
    showLineNumbers: options.showLineNumbers !== false,
    headerVisible: options.headerVisible !== false,
    collapsed: options.collapsed === true,
    autoHeight: options.autoHeight !== false,
    tabSize: Math.max(2, Math.min(8, Number(options.tabSize) || CODE_BLOCK_DEFAULT_TAB_SIZE)),
    language: String(options.language || "").trim().toLowerCase(),
    previewMode: String(options.previewMode || "preview").trim().toLowerCase() || "preview",
    width: Number(options.widthHint) || 0,
  };
  const layout = measureCodeBlockLayout(baseItem, {
    widthHint: Math.max(CODE_BLOCK_MIN_WIDTH, Number(options.widthHint) || 0) || undefined,
  });
  return {
    width: Number(options.widthHint) > 0 ? Math.max(CODE_BLOCK_MIN_WIDTH, Number(options.widthHint)) : layout.estimatedWidth,
    height: layout.height,
  };
}
