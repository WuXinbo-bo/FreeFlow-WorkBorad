import { sanitizeText } from "../../../utils.js";
import { ensureRichTextDocumentFields } from "../../../textModel/richTextDocument.js";

const HEADING_FONT_SIZE_MAP = Object.freeze({
  1: 36,
  2: 30,
  3: 26,
  4: 22,
  5: 20,
  6: 18,
});
const IMPORTED_TEXT_WIDTH_SCALE = 2;
const BODY_LINE_HEIGHT_RATIO = 1.5;
const PARAGRAPH_SPACING_EM = 0.6;
const IMPORTED_TEXT_VERTICAL_PADDING_PX = 10;
export const IMPORTED_TEXT_WRAP_TARGET_WIDTH = 760;
export const IMPORTED_TEXT_WRAP_MIN_WIDTH = 560;
export const IMPORTED_TEXT_WRAP_MAX_WIDTH = 860;

export function inferHeadingFontSize(level) {
  return HEADING_FONT_SIZE_MAP[Number(level) || 1] || 18;
}

export function estimateTextWidth(text, fontSize) {
  const lines = sanitizeText(text || "").split("\n");
  const longestUnits = lines.reduce((max, line) => Math.max(max, estimateLineWidthUnits(line)), 0);
  return Math.max(120, Math.min(980, Math.round(40 + longestUnits * Math.max(8, Number(fontSize) || 20))));
}

export function estimateTextHeight(text, fontSize) {
  const clean = sanitizeText(text || "");
  const lines = clean.split("\n");
  const lineCount = Math.max(1, lines.length);
  const paragraphCount = Math.max(
    1,
    clean
      .split(/\n\s*\n+/)
      .map((segment) => segment.trim())
      .filter(Boolean).length || 1
  );
  return estimateHeightFromMetrics({
    lineCount,
    paragraphCount,
    fontSize,
  });
}

export function resolveImportedTextBoxLayout(text, fontSize, options = {}) {
  const cleanText = sanitizeText(text || "");
  const forceWrap = options?.forceWrap === true;
  const lines = cleanText.split("\n");
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const cjkRatio = computeCjkRatio(cleanText);
  const hasExplicitLineBreak = lines.length > 1;
  const isLongParagraph =
    cleanText.length >= 48 ||
    longestLine >= 24 ||
    (cjkRatio >= 0.35 && longestLine >= 16);
  if (!forceWrap && !hasExplicitLineBreak && !isLongParagraph) {
    const width = Math.max(
      240,
      Math.min(1520, Math.round(estimateTextWidth(cleanText, fontSize) * IMPORTED_TEXT_WIDTH_SCALE))
    );
    const height = estimateTextHeight(cleanText, fontSize);
    return {
      textBoxLayoutMode: "auto-width",
      textResizeMode: "auto-width",
      width,
      height,
    };
  }

  const width = Math.max(
    IMPORTED_TEXT_WRAP_MIN_WIDTH,
    Math.min(IMPORTED_TEXT_WRAP_MAX_WIDTH, Math.round(IMPORTED_TEXT_WRAP_TARGET_WIDTH))
  );
  const estimatedLineCount = Math.max(
    lines.length,
    Math.ceil(longestLine / Math.max(10, Math.floor(width / Math.max(fontSize * 0.62, 1))))
  );
  const paragraphCount = Math.max(
    1,
    cleanText
      .split(/\n\s*\n+/)
      .map((segment) => segment.trim())
      .filter(Boolean).length || 1
  );
  const height = estimateHeightFromMetrics({
    lineCount: estimatedLineCount,
    paragraphCount,
    fontSize,
  });
  return {
    textBoxLayoutMode: "auto-height",
    textResizeMode: "wrap",
    width,
    height,
  };
}

export function buildTextElementContentFields(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const safeFallback = fallback && typeof fallback === "object" ? fallback : {};
  const fontSize = firstFiniteNumber(source.fontSize, safeFallback.fontSize, 20);
  return ensureRichTextDocumentFields(
    {
      html: stringOrEmpty(source.html),
      plainText: stringOrEmpty(source.plainText || source.text),
      text: stringOrEmpty(source.text || source.plainText),
      richTextDocument:
        source.richTextDocument && typeof source.richTextDocument === "object"
          ? source.richTextDocument
          : null,
      fontSize,
    },
    {
      html: stringOrEmpty(safeFallback.html || source.html),
      plainText: stringOrEmpty(
        safeFallback.plainText || safeFallback.text || source.plainText || source.text
      ),
      text: stringOrEmpty(
        safeFallback.text || safeFallback.plainText || source.text || source.plainText
      ),
      fontSize,
    }
  );
}

export function inlineNodesToPlainText(nodes = []) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const parts = [];
  safeNodes.forEach((node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "text") {
      parts.push(String(node.text || ""));
      return;
    }
    if (node.type === "hardBreak") {
      parts.push("\n");
      return;
    }
    if (node.type === "inlineCode" || node.type === "mathInline") {
      parts.push(String(node.text || ""));
      return;
    }
    if (node.type === "link") {
      parts.push(inlineNodesToPlainText(node.content || []));
      return;
    }
    if (node.type === "footnoteRef") {
      const refId = String(node?.attrs?.refId || "").trim();
      parts.push(refId ? `[${refId}]` : "[*]");
    }
  });
  return sanitizeText(parts.join(""));
}

export function inlineNodesToHtml(nodes = []) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  return safeNodes.map((node) => renderInlineNodeToHtml(node)).join("");
}

export function renderInlineNodeToHtml(node) {
  if (!node || typeof node !== "object") {
    return "";
  }
  if (node.type === "text") {
    return applyMarksToHtml(escapeHtml(String(node.text || "")), node.marks || []);
  }
  if (node.type === "hardBreak") {
    return "<br>";
  }
  if (node.type === "inlineCode") {
    return `<code>${escapeHtml(String(node.text || ""))}</code>`;
  }
  if (node.type === "mathInline") {
    const math = escapeHtml(String(node.text || ""));
    return `<span data-role="math-inline">${math}</span>`;
  }
  if (node.type === "link") {
    const inner = inlineNodesToHtml(node.content || []);
    const href = escapeAttribute(String(node?.attrs?.href || ""));
    const title = String(node?.attrs?.title || "").trim();
    const titleAttr = title ? ` title="${escapeAttribute(title)}"` : "";
    return `<a href="${href}"${titleAttr}>${inner}</a>`;
  }
  if (node.type === "footnoteRef") {
    const refId = String(node?.attrs?.refId || "").trim();
    return `<sup data-footnote-ref="${escapeAttribute(refId || "*")}">${escapeHtml(refId || "*")}</sup>`;
  }
  return "";
}

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function applyMarksToHtml(html, marks = []) {
  let output = html;
  const safeMarks = Array.isArray(marks) ? marks : [];
  safeMarks.forEach((mark) => {
    const type = String(mark?.type || "");
    if (type === "bold") {
      output = `<strong>${output}</strong>`;
    } else if (type === "italic") {
      output = `<em>${output}</em>`;
    } else if (type === "underline") {
      output = `<u>${output}</u>`;
    } else if (type === "strike") {
      output = `<s>${output}</s>`;
    } else if (type === "highlight") {
      output = `<mark>${output}</mark>`;
    } else if (type === "textColor") {
      const color = escapeAttribute(String(mark?.attrs?.color || ""));
      output = `<span style="color:${color};">${output}</span>`;
    } else if (type === "backgroundColor") {
      const color = escapeAttribute(String(mark?.attrs?.color || ""));
      output = `<span style="background-color:${color};">${output}</span>`;
    } else if (type === "code") {
      output = `<code>${output}</code>`;
    } else if (type === "link") {
      const href = escapeAttribute(String(mark?.attrs?.href || ""));
      output = `<a href="${href}">${output}</a>`;
    }
  });
  return output;
}

function firstFiniteNumber(...values) {
  for (let index = 0; index < values.length; index += 1) {
    const number = Number(values[index]);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return 20;
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

function estimateHeightFromMetrics({ lineCount = 1, paragraphCount = 1, fontSize = 20 } = {}) {
  const safeFontSize = Math.max(8, Number(fontSize) || 20);
  const safeLineCount = Math.max(1, Number(lineCount) || 1);
  const safeParagraphCount = Math.max(1, Number(paragraphCount) || 1);
  const lineHeight = safeFontSize * BODY_LINE_HEIGHT_RATIO;
  const paragraphSpacing = Math.max(0, safeParagraphCount - 1) * safeFontSize * PARAGRAPH_SPACING_EM;
  return Math.max(
    Math.round(Math.max(28, safeFontSize * 1.2)),
    Math.round(IMPORTED_TEXT_VERTICAL_PADDING_PX + safeLineCount * lineHeight + paragraphSpacing)
  );
}

function estimateLineWidthUnits(line = "") {
  const text = String(line || "");
  let units = 0;
  for (const char of text) {
    if (/\s/.test(char)) {
      units += 0.32;
      continue;
    }
    if (/[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\uAC00-\uD7AF]/.test(char)) {
      units += 1;
      continue;
    }
    if (/[A-Za-z0-9]/.test(char)) {
      units += 0.56;
      continue;
    }
    if (/[.,;:'"!?()[\]{}\-_/\\|`~]/.test(char)) {
      units += 0.4;
      continue;
    }
    units += 0.72;
  }
  return units;
}

function computeCjkRatio(text = "") {
  const source = String(text || "");
  if (!source) {
    return 0;
  }
  const chars = Array.from(source).filter((char) => !/\s/.test(char));
  if (!chars.length) {
    return 0;
  }
  const cjkCount = chars.filter((char) => /[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\uAC00-\uD7AF]/.test(char)).length;
  return cjkCount / chars.length;
}
