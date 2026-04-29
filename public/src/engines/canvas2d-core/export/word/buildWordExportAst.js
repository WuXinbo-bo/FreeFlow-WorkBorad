import {
  ensureRichTextDocumentFields,
  normalizeRichTextDocument,
  RICH_TEXT_BLOCK_TYPES,
  RICH_TEXT_INLINE_NODE_TYPES,
  RICH_TEXT_MARK_TYPES,
  serializeRichTextDocumentToPlainText,
} from "../../textModel/richTextDocument.js";
import { htmlToPlainText, sanitizeText } from "../../utils.js";
import { TEXT_FONT_FAMILY } from "../../rendererText.js";
import { flattenTableStructureToMatrix } from "../../elements/table.js";
import { resolveCodeBlockContent } from "../../elements/codeBlock.js";

const WORD_EXPORT_AST_KIND = "freeflow-word-export";
const WORD_EXPORT_AST_VERSION = 1;
const EXPORT_FONT_POLICY_MODE = "restricted";
const SELECTION_SORT_STRATEGY_VERSION = 1;
const SUPPORTED_SELECTION_ITEM_TYPES = new Set(["text", "flowNode", "table", "codeBlock", "mathBlock", "mathInline"]);

const EXPORT_FONT_FAMILIES = Object.freeze({
  latinBody: "Arial",
  latinHeading: "Arial",
  latinSerif: "Times New Roman",
  latinMono: "Consolas",
  eastAsiaBody: "SimSun",
  eastAsiaHeading: "Microsoft YaHei",
  eastAsiaSerif: "SimSun",
  eastAsiaMono: "Consolas",
  math: "Cambria Math",
});

const SERIF_FONT_HINTS = ["times", "georgia", "cambria", "serif", "song", "simsun", "fangsong"];
const MONO_FONT_HINTS = ["mono", "consolas", "cascadia", "courier", "fira code", "jetbrains mono", "menlo"];

function normalizePrimaryFontName(fontFamily = "") {
  const raw = String(fontFamily || "").trim();
  if (!raw) {
    return EXPORT_FONT_FAMILIES.latinBody;
  }
  const first = raw.split(",")[0] || raw;
  const cleaned = first.trim().replace(/^['"]+|['"]+$/g, "").trim();
  return cleaned || EXPORT_FONT_FAMILIES.latinBody;
}

function detectRequestedFontRole(fontFamily = "") {
  const normalized = String(fontFamily || "").trim().toLowerCase();
  if (!normalized) {
    return "sans";
  }
  if (MONO_FONT_HINTS.some((token) => normalized.includes(token))) {
    return "mono";
  }
  if (SERIF_FONT_HINTS.some((token) => normalized.includes(token))) {
    return "serif";
  }
  return "sans";
}

function pxToPt(value, fallback = 12) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Number((numeric * 0.75).toFixed(2));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToNearest(value, step = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isFinite(step) || step <= 0) {
    return value;
  }
  return Math.round(numeric / step) * step;
}

function normalizeHexColor(value = "", fallback = "") {
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }
  const hexMatch = raw.match(/#([0-9a-f]{6}|[0-9a-f]{3})/i);
  if (!hexMatch) {
    return fallback;
  }
  let hex = hexMatch[1].toUpperCase();
  if (hex.length === 3) {
    hex = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return hex;
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeSelectionType(type = "") {
  const normalized = String(type || "").trim();
  if (normalized === "flowNode") {
    return "text";
  }
  return normalized;
}

function buildWordTheme(item = null, options = {}) {
  const sourceBodyPt = clamp(pxToPt(item?.fontSize || options.fontSize || 18, 12), 11, 18);
  const mildScale = clamp(sourceBodyPt / 13.5, 0.94, 1.08);
  const bodyPt = roundToNearest(11.25 * mildScale, 0.5);
  const headingBase = [16, 14, 13, 12, 11, 10.5].map((size) => roundToNearest(size * mildScale, 0.5));
  const requestedRole = detectRequestedFontRole(item?.fontFamily || options.fontFamily || "");
  const latinBodyFont = requestedRole === "serif" ? EXPORT_FONT_FAMILIES.latinSerif : EXPORT_FONT_FAMILIES.latinBody;
  const eastAsiaBodyFont = requestedRole === "serif" ? EXPORT_FONT_FAMILIES.eastAsiaSerif : EXPORT_FONT_FAMILIES.eastAsiaBody;
  return {
    defaultFont: normalizePrimaryFontName(options.defaultFont || latinBodyFont),
    headingFont: normalizePrimaryFontName(options.headingFont || EXPORT_FONT_FAMILIES.latinHeading),
    eastAsiaFont: normalizePrimaryFontName(options.eastAsiaFont || eastAsiaBodyFont),
    eastAsiaHeadingFont: normalizePrimaryFontName(options.eastAsiaHeadingFont || EXPORT_FONT_FAMILIES.eastAsiaHeading),
    codeFont: normalizePrimaryFontName(options.codeFont || EXPORT_FONT_FAMILIES.latinMono),
    codeEastAsiaFont: normalizePrimaryFontName(options.codeEastAsiaFont || EXPORT_FONT_FAMILIES.eastAsiaMono),
    mathFont: normalizePrimaryFontName(options.mathFont || EXPORT_FONT_FAMILIES.math),
    baseFontSizePt: bodyPt,
    baseColor: normalizeHexColor(item?.color, "111827"),
    linkColor: "2563EB",
    quoteBorderColor: "CBD5E1",
    quoteTextColor: "475569",
    codeBackgroundColor: "F8FAFC",
    codeBorderColor: "D7DEE8",
    tableBorderColor: "CBD5E1",
    tableHeaderBackgroundColor: "F8FAFC",
    page: {
      widthMm: 210,
      heightMm: 297,
      marginTopMm: 25.4,
      marginRightMm: 25.4,
      marginBottomMm: 25.4,
      marginLeftMm: 25.4,
      headerMm: 12.7,
      footerMm: 12.7,
    },
    fontPolicy: {
      mode: EXPORT_FONT_POLICY_MODE,
      requestedRole,
      requestedSourceFont: normalizePrimaryFontName(item?.fontFamily || options.fontFamily || ""),
      allowedFamilies: { ...EXPORT_FONT_FAMILIES },
    },
    typography: {
      bodyPt,
      headingPts: headingBase,
      codePt: roundToNearest(Math.max(9.5, bodyPt - 1), 0.5),
      inlineCodePt: roundToNearest(Math.max(9.5, bodyPt - 0.5), 0.5),
      footnotePt: roundToNearest(Math.max(9, bodyPt - 1.5), 0.5),
      lineMultiple: 1.24,
      quoteLineMultiple: 1.22,
      codeLineMultiple: 1.15,
    },
    spacing: {
      paragraphAfterPt: 6,
      paragraphBeforePt: 0,
      listParagraphAfterPt: 2.5,
      listBlockAfterPt: 1,
      headingBeforePt: 12,
      headingAfterPt: 4,
      headingSpacingPts: [18, 15, 13, 11, 9, 8],
      blockAfterPt: 8,
      codeLineAfterPt: 0,
      codeBlockBeforePt: 4,
      codeBlockAfterPt: 9,
      quoteAfterPt: 5,
      quoteInnerAfterPt: 3,
      tableAfterPt: 8,
      tableCellAfterPt: 1.5,
      thematicBreakBeforePt: 8,
      thematicBreakAfterPt: 10,
    },
    table: {
      cellPaddingTopPt: 4,
      cellPaddingBottomPt: 4,
      cellPaddingLeftPt: 5,
      cellPaddingRightPt: 5,
      headerMinHeightPt: 18,
    },
    sourceMetrics: {
      canvasBodyPx: Number(item?.fontSize || options.fontSize || 18) || 18,
      canvasBodyPt: sourceBodyPt,
      mildScale,
    },
  };
}

function buildAstMeta(item = null, options = {}) {
  return {
    title: String(options.title || item?.name || item?.title || "文本").trim() || "文本",
    creator: String(options.creator || "FreeFlow").trim() || "FreeFlow",
    lastModifiedBy: String(options.lastModifiedBy || "FreeFlow").trim() || "FreeFlow",
    source: "canvas-rich-text",
    sourceItemIds: item?.id ? [String(item.id)] : [],
  };
}

function createCompilerContext() {
  return {
    footnotes: new Map(),
    footnoteNamespace: "",
  };
}

function resolveNamespacedFootnoteId(refId = "", context = {}) {
  const normalizedRefId = String(refId || "").trim();
  if (!normalizedRefId) {
    return "";
  }
  const namespace = String(context?.footnoteNamespace || "").trim();
  return namespace ? `${namespace}::${normalizedRefId}` : normalizedRefId;
}

function mapMark(mark = null) {
  if (!mark || typeof mark !== "object") {
    return null;
  }
  const type = String(mark.type || "").trim();
  if (!type) {
    return null;
  }
  if (type === RICH_TEXT_MARK_TYPES.BOLD) {
    return { type: "bold" };
  }
  if (type === RICH_TEXT_MARK_TYPES.ITALIC) {
    return { type: "italic" };
  }
  if (type === RICH_TEXT_MARK_TYPES.UNDERLINE) {
    return { type: "underline" };
  }
  if (type === RICH_TEXT_MARK_TYPES.STRIKE) {
    return { type: "strike" };
  }
  if (type === RICH_TEXT_MARK_TYPES.CODE) {
    return { type: "code" };
  }
  if (type === RICH_TEXT_MARK_TYPES.TEXT_COLOR) {
    return { type: "textColor", color: normalizeHexColor(mark?.attrs?.color, "") };
  }
  if (type === RICH_TEXT_MARK_TYPES.HIGHLIGHT) {
    return { type: "highlight", color: normalizeHexColor(mark?.attrs?.color, "FFF4A3") };
  }
  if (type === RICH_TEXT_MARK_TYPES.BACKGROUND_COLOR) {
    return { type: "backgroundColor", color: normalizeHexColor(mark?.attrs?.color, "") };
  }
  return null;
}

function mapInlineNodes(nodes = [], context) {
  return (Array.isArray(nodes) ? nodes : [])
    .map((node) => mapInlineNode(node, context))
    .flat()
    .filter(Boolean);
}

function mapInlineNode(node = null, context) {
  if (!node || typeof node !== "object") {
    return [];
  }
  const type = String(node.type || "").trim();
  if (type === RICH_TEXT_INLINE_NODE_TYPES.TEXT) {
    const text = sanitizeText(String(node.text || ""));
    if (!text) {
      return [];
    }
    return [{
      type: "text",
      text,
      marks: (Array.isArray(node.marks) ? node.marks : []).map((mark) => mapMark(mark)).filter(Boolean),
    }];
  }
  if (type === RICH_TEXT_INLINE_NODE_TYPES.HARD_BREAK) {
    return [{ type: "break" }];
  }
  if (type === RICH_TEXT_INLINE_NODE_TYPES.INLINE_CODE) {
    const text = sanitizeText(String(node.text || ""));
    return text ? [{ type: "inlineCode", text }] : [];
  }
  if (type === RICH_TEXT_INLINE_NODE_TYPES.LINK) {
    const href = String(node?.attrs?.href || "").trim();
    const children = mapInlineNodes(node.content || [], context);
    if (!href) {
      return children;
    }
    return [{
      type: "link",
      href,
      title: String(node?.attrs?.title || "").trim(),
      children: children.length ? children : [{ type: "text", text: href, marks: [] }],
    }];
  }
  if (type === RICH_TEXT_INLINE_NODE_TYPES.MATH_INLINE) {
    const latex = sanitizeText(String(node.text || "")).trim();
    return latex ? [{ type: "mathInline", latex }] : [];
  }
  if (type === RICH_TEXT_INLINE_NODE_TYPES.FOOTNOTE_REF) {
    const refId = resolveNamespacedFootnoteId(node?.attrs?.refId || "", context);
    return refId ? [{ type: "footnoteRef", refId }] : [];
  }
  if (type === RICH_TEXT_INLINE_NODE_TYPES.IMAGE) {
    const src = String(node?.attrs?.src || "").trim();
    return [{
      type: "image",
      src,
      alt: sanitizeText(String(node?.attrs?.alt || node?.attrs?.title || src || "图片")),
      title: sanitizeText(String(node?.attrs?.title || "")),
    }];
  }
  return [];
}

function mapAlign(align = "") {
  const value = String(align || "").trim().toLowerCase();
  return ["left", "center", "right", "justify"].includes(value) ? value : "left";
}

function buildParagraphNode(block = {}, context) {
  return {
    type: "paragraph",
    align: mapAlign(block?.attrs?.align || "left"),
    children: mapInlineNodes(block.content || [], context),
  };
}

function buildHeadingNode(block = {}, context) {
  return {
    type: "heading",
    level: clamp(Number(block?.attrs?.level || 1) || 1, 1, 6),
    align: mapAlign(block?.attrs?.align || "left"),
    children: mapInlineNodes(block.content || [], context),
  };
}

function buildListItemNode(block = {}, context) {
  const children = [];
  const inlineChildren = mapInlineNodes(block.content || [], context);
  if (inlineChildren.length) {
    children.push({
      type: "paragraph",
      align: "left",
      children: inlineChildren,
    });
  }
  (Array.isArray(block.blocks) ? block.blocks : []).forEach((childBlock) => {
    const mapped = mapBlockNode(childBlock, context);
    if (Array.isArray(mapped)) {
      children.push(...mapped);
    } else if (mapped) {
      children.push(mapped);
    }
  });
  if (!children.length) {
    children.push({ type: "paragraph", align: "left", children: [] });
  }
  return {
    type: "listItem",
    checked: block?.attrs?.checked === true,
    children,
  };
}

function buildListNode(block = {}, context) {
  return {
    type: "list",
    ordered: block?.attrs?.ordered === true,
    task: block?.attrs?.task === true,
    start: Math.max(1, Number(block?.attrs?.start || 1) || 1),
    items: (Array.isArray(block.blocks) ? block.blocks : []).map((child) => buildListItemNode(child, context)),
  };
}

function buildBlockquoteNode(block = {}, context) {
  return {
    type: "blockquote",
    children: (Array.isArray(block.blocks) ? block.blocks : [])
      .map((child) => mapBlockNode(child, context))
      .flat()
      .filter(Boolean),
  };
}

function buildCodeBlockNode(block = {}) {
  return {
    type: "codeBlock",
    language: String(block?.attrs?.language || "").trim().toLowerCase(),
    text: sanitizeText(String(block?.plainText || "")),
  };
}

function buildMathBlockNode(block = {}) {
  return {
    type: "mathBlock",
    latex: sanitizeText(String(block?.plainText || "")).trim(),
    align: mapAlign(block?.attrs?.align || "center"),
  };
}

function buildTableNode(block = {}, context) {
  return {
    type: "table",
    rows: (Array.isArray(block.blocks) ? block.blocks : []).map((row) => ({
      type: "tableRow",
      header: row?.attrs?.headerRow === true,
      cells: (Array.isArray(row.blocks) ? row.blocks : []).map((cell) => ({
        type: "tableCell",
        header: cell?.attrs?.header === true,
        align: mapAlign(cell?.attrs?.align || "left"),
        colSpan: Math.max(1, Number(cell?.attrs?.colSpan || 1) || 1),
        rowSpan: Math.max(1, Number(cell?.attrs?.rowSpan || 1) || 1),
        children: [{
          type: "paragraph",
          align: mapAlign(cell?.attrs?.align || "left"),
          children: mapInlineNodes(cell.content || [], context),
        }],
      })),
    })),
  };
}

function registerFootnoteDefinition(block = {}, context) {
  const refId = resolveNamespacedFootnoteId(block?.attrs?.id || block?.attrs?.identifier || "", context);
  if (!refId) {
    return null;
  }
  const children = (Array.isArray(block.blocks) ? block.blocks : [])
    .map((child) => mapBlockNode(child, context))
    .flat()
    .filter(Boolean);
  context.footnotes.set(refId, {
    id: refId,
    children: children.length ? children : [{
      type: "paragraph",
      align: "left",
      children: [],
    }],
  });
  return null;
}

function buildHtmlFallbackNode(block = {}) {
  const plainText = sanitizeText(
    String(
      block?.plainText ||
        serializeRichTextDocumentToPlainText({ blocks: [block] }, "") ||
        htmlToPlainText(String(block?.html || ""))
    )
  ).trim();
  if (!plainText) {
    return null;
  }
  return {
    type: "paragraph",
    align: "left",
    children: [{ type: "text", text: plainText, marks: [] }],
  };
}

function mapBlockNode(block = null, context) {
  if (!block || typeof block !== "object") {
    return null;
  }
  const type = String(block.type || "").trim();
  if (type === RICH_TEXT_BLOCK_TYPES.PARAGRAPH) {
    return buildParagraphNode(block, context);
  }
  if (type === RICH_TEXT_BLOCK_TYPES.HEADING) {
    return buildHeadingNode(block, context);
  }
  if (type === RICH_TEXT_BLOCK_TYPES.BLOCKQUOTE) {
    return buildBlockquoteNode(block, context);
  }
  if (type === RICH_TEXT_BLOCK_TYPES.LIST) {
    return buildListNode(block, context);
  }
  if (type === RICH_TEXT_BLOCK_TYPES.CODE_BLOCK) {
    return buildCodeBlockNode(block);
  }
  if (type === RICH_TEXT_BLOCK_TYPES.THEMATIC_BREAK) {
    return { type: "thematicBreak" };
  }
  if (type === RICH_TEXT_BLOCK_TYPES.TABLE) {
    return buildTableNode(block, context);
  }
  if (type === RICH_TEXT_BLOCK_TYPES.MATH_BLOCK) {
    return buildMathBlockNode(block);
  }
  if (type === RICH_TEXT_BLOCK_TYPES.FOOTNOTE_DEFINITION) {
    return registerFootnoteDefinition(block, context);
  }
  if (type === RICH_TEXT_BLOCK_TYPES.HTML) {
    return buildHtmlFallbackNode(block);
  }
  return buildHtmlFallbackNode(block);
}

function buildAstChildrenFromDocument(documentValue, context) {
  return (Array.isArray(documentValue?.blocks) ? documentValue.blocks : [])
    .map((block) => mapBlockNode(block, context))
    .flat()
    .filter(Boolean);
}

function buildFallbackParagraph(item = null) {
  const plainText = sanitizeText(String(item?.plainText || item?.text || htmlToPlainText(item?.html || ""))).trim();
  if (!plainText) {
    return [];
  }
  return [{
    type: "paragraph",
    align: "left",
    children: [{ type: "text", text: plainText, marks: [] }],
  }];
}

function resolveSourceRichTextDocument(source = {}, fallback = {}) {
  if (source?.richTextDocument && typeof source.richTextDocument === "object") {
    return normalizeRichTextDocument(source.richTextDocument, {
      html: source?.html || fallback?.html || "",
      plainText: source?.plainText || source?.text || fallback?.plainText || fallback?.text || "",
      baseFontSize: Number(source?.fontSize || fallback?.fontSize || 18) || 18,
    });
  }
  return null;
}

function appendItemChildren(targetChildren, item, options = {}) {
  const context = options.context || createCompilerContext();
  const directDocument = resolveSourceRichTextDocument(item, {
    html: item?.html || "",
    plainText: item?.plainText || item?.text || "",
    fontSize: item?.fontSize || 18,
  });
  if (directDocument) {
    const children = buildAstChildrenFromDocument(directDocument, context);
    targetChildren.push(...(children.length ? children : buildFallbackParagraph(item)));
    return context;
  }
  const content = ensureRichTextDocumentFields(item, {
    html: item?.html || "",
    plainText: item?.plainText || item?.text || "",
    fontSize: item?.fontSize || 18,
  });
  const richTextDocument = content.richTextDocument || null;
  const children = richTextDocument
    ? buildAstChildrenFromDocument(richTextDocument, context)
    : buildFallbackParagraph(item);
  targetChildren.push(...(children.length ? children : buildFallbackParagraph(item)));
  return context;
}

function buildTableCellChildren(cell = {}, context) {
  const directDocument = resolveSourceRichTextDocument(cell, {
    html: cell?.html || "",
    plainText: cell?.plainText || cell?.text || "",
    fontSize: 16,
  });
  if (directDocument) {
    const directChildren = buildAstChildrenFromDocument(directDocument, context);
    if (directChildren.length) {
      return directChildren;
    }
  }
  const content = ensureRichTextDocumentFields(
    {
      html: cell?.html || "",
      plainText: cell?.plainText || cell?.text || "",
      richTextDocument: cell?.richTextDocument && typeof cell.richTextDocument === "object"
        ? JSON.parse(JSON.stringify(cell.richTextDocument))
        : null,
    },
    {
      html: cell?.html || "",
      plainText: cell?.plainText || cell?.text || "",
      fontSize: 16,
    }
  );
  const richTextDocument = content.richTextDocument || null;
  const children = richTextDocument
    ? buildAstChildrenFromDocument(richTextDocument, context)
    : [];
  if (children.length) {
    return children;
  }
  const plainText = sanitizeText(String(content.plainText || cell?.plainText || "")).trim();
  return [{
    type: "paragraph",
    align: mapAlign(cell?.align || "left"),
    children: plainText ? [{ type: "text", text: plainText, marks: [] }] : [],
  }];
}

function buildSelectionTableNode(item, context) {
  const matrix = flattenTableStructureToMatrix(item?.table || {});
  if (!Array.isArray(matrix) || !matrix.length) {
    return null;
  }
  const rows = matrix.map((row, rowIndex) => ({
    type: "tableRow",
    header: rowIndex === 0 && item?.table?.hasHeader !== false,
    cells: (Array.isArray(row) ? row : []).map((cell) => ({
      type: "tableCell",
      header: Boolean(cell?.header),
      align: mapAlign(cell?.align || "left"),
      colSpan: 1,
      rowSpan: 1,
      children: buildTableCellChildren(cell, context),
    })),
  }));
  return rows.length ? { type: "table", rows } : null;
}

function buildSelectionCodeBlockNode(item) {
  const text = sanitizeText(resolveCodeBlockContent(item)).trim();
  if (!text) {
    return null;
  }
  return {
    type: "codeBlock",
    language: String(item?.language || "").trim().toLowerCase(),
    text,
  };
}

function buildSelectionMathBlockNode(item) {
  const latex = sanitizeText(String(item?.formula || item?.plainText || item?.text || "")).trim();
  if (!latex) {
    return null;
  }
  return {
    type: "mathBlock",
    latex,
    align: item?.displayMode === false ? "left" : "center",
  };
}

function buildSelectionTextChildren(item, context) {
  const targetChildren = [];
  appendItemChildren(targetChildren, item, { context });
  return targetChildren;
}

function createSeparatorParagraph() {
  return {
    type: "paragraph",
    align: "left",
    children: [],
  };
}

function getSelectionItemBounds(item = {}) {
  const left = toFiniteNumber(item?.x, 0);
  const top = toFiniteNumber(item?.y, 0);
  const width = Math.max(1, toFiniteNumber(item?.width, 1));
  const height = Math.max(1, toFiniteNumber(item?.height, 1));
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    centerY: top + height / 2,
  };
}

function measureVerticalOverlapRatio(a, b) {
  const overlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const reference = Math.max(1, Math.min(a.height, b.height));
  return overlap / reference;
}

function sortVisualSelectionEntries(entries = []) {
  const prepared = (Array.isArray(entries) ? entries : [])
    .map((entry, index) => ({
      ...entry,
      sortIndex: index,
      bounds: getSelectionItemBounds(entry.item),
    }))
    .sort((a, b) => (
      a.bounds.top - b.bounds.top ||
      a.bounds.left - b.bounds.left ||
      a.sortIndex - b.sortIndex
    ));
  const rows = [];
  prepared.forEach((entry) => {
    const lastRow = rows[rows.length - 1];
    if (!lastRow) {
      rows.push({
        entries: [entry],
        top: entry.bounds.top,
        bottom: entry.bounds.bottom,
        centerY: entry.bounds.centerY,
      });
      return;
    }
    const centerDelta = Math.abs(entry.bounds.centerY - lastRow.centerY);
    const minHeight = Math.max(1, Math.min(entry.bounds.height, lastRow.bottom - lastRow.top));
    const overlapRatio = measureVerticalOverlapRatio(entry.bounds, {
      top: lastRow.top,
      bottom: lastRow.bottom,
      height: Math.max(1, lastRow.bottom - lastRow.top),
    });
    const sameRow = centerDelta <= minHeight * 0.35 || overlapRatio >= 0.45;
    if (!sameRow) {
      rows.push({
        entries: [entry],
        top: entry.bounds.top,
        bottom: entry.bounds.bottom,
        centerY: entry.bounds.centerY,
      });
      return;
    }
    lastRow.entries.push(entry);
    lastRow.top = Math.min(lastRow.top, entry.bounds.top);
    lastRow.bottom = Math.max(lastRow.bottom, entry.bounds.bottom);
    lastRow.centerY = (lastRow.top + lastRow.bottom) / 2;
  });
  rows.forEach((row) => {
    row.entries.sort((a, b) => (
      a.bounds.left - b.bounds.left ||
      a.bounds.top - b.bounds.top ||
      a.sortIndex - b.sortIndex
    ));
  });
  rows.sort((a, b) => a.top - b.top || a.entries[0].sortIndex - b.entries[0].sortIndex);
  return rows.flatMap((row) => row.entries);
}

function createSelectionPlanEntry(item, originalIndex) {
  const type = normalizeSelectionType(item?.type || "");
  return {
    item,
    id: String(item?.id || "").trim(),
    type,
    originalIndex,
  };
}

function buildSelectionPlanMeta(orderedEntries, skippedEntries) {
  return {
    orderedItemIds: orderedEntries.map((entry) => entry.id).filter(Boolean),
    skippedItems: skippedEntries.map((entry) => ({
      id: entry.id,
      type: entry.type || "unknown",
      reason: entry.reason || "unsupported",
    })),
    sortStrategy: "visual-reading-order",
    sortStrategyVersion: SELECTION_SORT_STRATEGY_VERSION,
  };
}

export function buildSelectionWordExportPlan(items = [], options = {}) {
  const normalizedItems = (Array.isArray(items) ? items : []).filter((item) => item && typeof item === "object");
  const sortableEntries = [];
  const skippedEntries = [];
  normalizedItems.forEach((item, index) => {
    const entry = createSelectionPlanEntry(item, index);
    if (!entry.id) {
      skippedEntries.push({ ...entry, reason: "missing-id" });
      return;
    }
    if (!SUPPORTED_SELECTION_ITEM_TYPES.has(entry.type)) {
      skippedEntries.push({ ...entry, reason: "unsupported-type" });
      return;
    }
    sortableEntries.push(entry);
  });
  const orderedEntries = sortVisualSelectionEntries(sortableEntries);
  return {
    orderedEntries,
    skippedEntries,
    meta: buildSelectionPlanMeta(orderedEntries, skippedEntries),
  };
}

function convertSelectionEntryToAstNodes(entry, context) {
  const item = entry?.item || null;
  const type = normalizeSelectionType(entry?.type || item?.type || "");
  if (!item || !type) {
    return [];
  }
  if (type === "text") {
    return buildSelectionTextChildren(item, context);
  }
  if (type === "table") {
    const tableNode = buildSelectionTableNode(item, context);
    return tableNode ? [tableNode] : [];
  }
  if (type === "codeBlock") {
    const codeBlockNode = buildSelectionCodeBlockNode(item);
    return codeBlockNode ? [codeBlockNode] : [];
  }
  if (type === "mathBlock" || type === "mathInline") {
    const mathNode = buildSelectionMathBlockNode(item);
    return mathNode ? [mathNode] : [];
  }
  return [];
}

function buildCanvasSelectionMeta(plan, options = {}) {
  return {
    title: String(options.title || "画布导出").trim() || "画布导出",
    creator: String(options.creator || "FreeFlow").trim() || "FreeFlow",
    lastModifiedBy: String(options.lastModifiedBy || "FreeFlow").trim() || "FreeFlow",
    source: "canvas-selection-mixed",
    sourceItemIds: plan.orderedEntries.map((entry) => entry.id).filter(Boolean),
    orderedItemIds: plan.meta.orderedItemIds,
    skippedItems: plan.meta.skippedItems,
    sortStrategyVersion: SELECTION_SORT_STRATEGY_VERSION,
  };
}

export function buildWordExportAstFromRichTextItem(item, options = {}) {
  const context = createCompilerContext();
  context.footnoteNamespace = item?.id ? String(item.id) : "";
  const children = [];
  appendItemChildren(children, item, { context });
  return {
    kind: WORD_EXPORT_AST_KIND,
    version: WORD_EXPORT_AST_VERSION,
    meta: buildAstMeta(item, options),
    theme: buildWordTheme(item, options),
    sections: [
      {
        id: "section-1",
        children,
      },
    ],
    footnotes: Array.from(context.footnotes.values()),
  };
}

export function buildWordExportAstFromCanvasSelection(items = [], options = {}) {
  const plan = buildSelectionWordExportPlan(items, options);
  const theme = buildWordTheme(null, {
    ...options,
    defaultFont: options.defaultFont || TEXT_FONT_FAMILY,
  });
  const context = createCompilerContext();
  const children = [];
  plan.orderedEntries.forEach((entry, index) => {
    context.footnoteNamespace = entry.id;
    const nextChildren = convertSelectionEntryToAstNodes(entry, context);
    if (!nextChildren.length) {
      plan.skippedEntries.push({ ...entry, reason: "empty-content" });
      return;
    }
    if (children.length && index > 0) {
      children.push(createSeparatorParagraph());
    }
    children.push(...nextChildren);
  });
  const finalPlanMeta = buildSelectionPlanMeta(plan.orderedEntries, plan.skippedEntries);
  const footnotes = Array.from(context.footnotes.values());
  return {
    kind: WORD_EXPORT_AST_KIND,
    version: WORD_EXPORT_AST_VERSION,
    meta: {
      ...buildCanvasSelectionMeta(plan, options),
      skippedItems: finalPlanMeta.skippedItems,
    },
    theme,
    sections: [
      {
        id: "section-1",
        children,
      },
    ],
    footnotes,
    selectionPlan: {
      orderedItemIds: finalPlanMeta.orderedItemIds,
      skippedItems: finalPlanMeta.skippedItems,
      sortStrategyVersion: SELECTION_SORT_STRATEGY_VERSION,
    },
  };
}

export function buildWordExportAstFromItems(items = [], options = {}) {
  const normalizedItems = (Array.isArray(items) ? items : []).filter((item) => item && typeof item === "object");
  if (normalizedItems.length === 1 && normalizeSelectionType(normalizedItems[0]?.type || "") === "text") {
    return buildWordExportAstFromRichTextItem(normalizedItems[0], options);
  }
  return buildWordExportAstFromCanvasSelection(normalizedItems, options);
}

export { WORD_EXPORT_AST_KIND, WORD_EXPORT_AST_VERSION };
