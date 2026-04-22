import {
  createView,
  getViewportCenterScenePoint,
  getZoomToFitView,
  panView,
  sceneToScreen,
  screenToScene,
  zoomAtScenePoint,
} from "./camera.js";
import { createClipboardBroker } from "./brokers/clipboardBroker.js";
import { createDragBroker } from "./brokers/dragBroker.js";
import {
  collectSnapCandidates,
  createAlignmentSnapConfig,
  createAlignmentSnapState,
  hasActiveAlignmentSnap,
  resolveAlignmentSnap,
  resetAlignmentSnapState,
} from "./alignmentSnap.js";
import { DEFAULT_VIEW, DRAW_TOOLS, TOOL_SHORTCUTS } from "./constants.js";
import {
  createEmptyBoard,
  getBoardBounds,
  getElementBounds,
  moveElement,
  normalizeBoard,
  normalizeElement,
  resizeElement,
} from "./elements/index.js";
import { createFileCardElement, getFileCardMemoBounds } from "./elements/fileCard.js";
import { FLOW_NODE_WRAP_MODE, getFlowNodeMinSize } from "./elements/flow.js";
import { getImageMemoBounds } from "./elements/media.js";
import { createMindNodeElement } from "./elements/mind.js";
import {
  createEditableTableElement,
  createTableStructureFromMatrix,
  flattenTableStructureToMatrix,
  updateTableElementStructure,
} from "./elements/table.js";
import { createFlowModule } from "./flowModule.js";
import { getMemoLayout } from "./memoLayout.js";
import { createShapeModule } from "./shapeModule.js";
import {
  coerceInteractiveTextBoxLayoutMode,
  createTextElement,
  deriveTextResizeModeFromLayoutMode,
  getTextMinSize,
  normalizeTextElement,
  normalizeTextBoxLayoutMode,
  normalizeTextFontSize,
  normalizeTextResizeMode,
  TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
  TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH,
  TEXT_BOX_LAYOUT_MODE_FIXED_SIZE,
  TEXT_RESIZE_MODE_AUTO_WIDTH,
  TEXT_MIN_FONT_SIZE,
  TEXT_RESIZE_MODE_WRAP,
  TEXT_WRAP_MODE_MANUAL,
} from "./elements/text.js";
import { measureTextElementLayout } from "./textLayout/measureTextElementLayout.js";
import { createLightImageEditor } from "./editors/lightImageEditor.js";
import { syncFloatingToolbarLayout } from "./editors/floatingToolbarLayout.js";
import { createDrawToolModule } from "./drawToolModule.js";
import {
  FLOW_NODE_TEXT_LAYOUT,
  getFlowNodeTextPadding,
  measureRichTextBox,
  resolveRichTextDisplayHtml,
  TEXT_BOLD_WEIGHT,
  TEXT_FONT_FAMILY,
  TEXT_FONT_WEIGHT,
  TEXT_LINE_HEIGHT_RATIO,
} from "./rendererText.js";
import {
  getLineHeightRatioForTag,
  normalizeTagName,
  TEXT_BLOCK_SPACING_EM,
  TEXT_BODY_LINE_HEIGHT_RATIO,
} from "./textLayout/typographyTokens.js";
import { resolveImportedTextBoxLayout } from "./import/renderers/text/sharedTextRenderUtils.js";
import { renderLatexToStaticHtml } from "./import/renderers/markdown/markdownStaticRenderer.js";
import {
  createHistoryState,
  markHistoryBaseline,
  pushHistory,
  redoHistory,
  takeHistorySnapshot,
  undoHistory,
} from "./history.js";
import { hitTestElement, hitTestHandle, invalidateHitTestSpatialIndex } from "./hitTest.js";
import { getStructuredTableSceneGrid, scaleSceneValue } from "./viewportMetrics.js";
import {
  buildFileCardContextMenuHtml,
  getFileCardHit,
  pasteFileCardsFromClipboard,
  removeFileCardById as removeFileCardEntry,
  toggleFileCardMark as toggleFileCardMarkEntry,
} from "./fileCardModule.js";
import { createRenderer } from "./renderer.js";
import { placeMenuNearPoint, placeSubmenuNearTrigger } from "./menuPositioning.js";
import { clearLegacyBoardStorage, createCanvas2DStore } from "./store.js";
import { createPanPointer } from "./tools/panTool.js";
import { getMarqueeSelection, hasDragExceededThreshold, resolveSelectionTarget } from "./tools/selectTool.js";
import {
  buildTextTitle,
  clone,
  createId,
  getFileBaseName,
  getFileExtension,
  getFileName,
  htmlToPlainText,
  INLINE_FONT_SIZE_ATTR,
  isEditableElement,
  normalizeRichHtml,
  normalizeRichHtmlInlineFontSizes,
  readFileAsDataUrl,
  readImageDimensions,
  sanitizeHtml,
  sanitizeText,
  resolveImageSource,
} from "./utils.js";
import { createImageModule } from "./imageModule.js";
import { createStructuredCanvasRenderer } from "./rendererStructured.js";
import {
  getExportBounds as getCanvasExportBounds,
  renderBoardToCanvas as renderExportBoardToCanvas,
} from "./export/renderBoardToCanvas.js";
import { buildExportReadyBoardItems } from "./export/buildExportReadyBoardItems.js";
import {
  createInputDescriptor,
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "./import/protocols/inputDescriptor.js";
import { createStructuredImportRuntime } from "./import/runtime/createStructuredImportRuntime.js";
import { detectTextContentType, DETECTED_TEXT_TYPES } from "./import/gateway/contentTypeDetector.js";
import {
  ensureRichTextDocumentFields,
  RICH_TEXT_BLOCK_TYPES,
  serializeRichTextBlocksToHtml,
} from "./textModel/richTextDocument.js";
import {
  createRichTextClipboardPayload,
  parseRichTextClipboardPayload,
  RICH_TEXT_CLIPBOARD_MIME,
  readRichTextClipboardPayload,
  stringifyRichTextClipboardPayload,
} from "./textClipboard/richTextClipboard.js";
import { createRichTextEditingSession } from "./textEditing/createRichTextEditingSession.js";
import { renderMarkdownPlainTextToRichHtml } from "./textEditing/renderMarkdownPlainTextToRichHtml.js";
import { refreshTextLinkSemantics } from "./textEditing/linkSemantics.js";
import { resolveUrlMeta } from "./textEditing/linkMetaResolver.js";
import { CONFIG } from "../../config/app.config.js";
import { API_ROUTES, readJsonResponse } from "../../api/http.js";

const TOOL_SET = new Set(["select", "text", ...DRAW_TOOLS]);
const DEFAULT_TEXT_FONT_SIZE = 20;
const TEXT_EDIT_MAX_WIDTH = 3200;
const TEXT_STYLE_PRESETS = Object.freeze({
  body: {
    label: "正文",
    fontSize: DEFAULT_TEXT_FONT_SIZE,
    fontWeight: "400",
  },
  subtitle: {
    label: "副标题",
    fontSize: Math.round(DEFAULT_TEXT_FONT_SIZE * 1.5),
    fontWeight: "400",
  },
  title: {
    label: "标题",
    fontSize: Math.round(DEFAULT_TEXT_FONT_SIZE * 2),
    fontWeight: "700",
  },
});
const BOARD_BACKGROUND_PATTERNS = new Set(["none", "dots", "grid", "lines", "engineering"]);
const RICH_SELECTION_FONT_SIZE_PRESETS = Object.freeze([8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48]);
const RICH_BLOCK_TYPE_OPTIONS = Object.freeze([
  { value: "paragraph", label: "正文" },
  { value: "heading-1", label: "# 一级标题" },
  { value: "heading-2", label: "## 二级标题" },
  { value: "heading-3", label: "### 三级标题" },
  { value: "heading-4", label: "#### 四级标题" },
  { value: "heading-5", label: "##### 五级标题" },
  { value: "heading-6", label: "###### 六级标题" },
]);
const MARKDOWN_SEMANTIC_TEXT_TYPES = new Set([
  DETECTED_TEXT_TYPES.MARKDOWN,
  DETECTED_TEXT_TYPES.TABLE,
  DETECTED_TEXT_TYPES.LIST,
  DETECTED_TEXT_TYPES.QUOTE,
]);

function normalizeBoardBackgroundPattern(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return BOARD_BACKGROUND_PATTERNS.has(normalized) ? normalized : "dots";
}

function getMatchingTextPresetName(fontSize) {
  const size = Math.round(Number(fontSize || 0));
  return (
    Object.entries(TEXT_STYLE_PRESETS).find(([, preset]) => Math.round(Number(preset.fontSize || 0)) === size)?.[0] || "body"
  );
}

function buildRichBlockTypeSelectHtml(dataAction = "block-type", ariaLabel = "文本语义") {
  return `
    <label class="canvas2d-rich-select-wrap">
      <select class="canvas2d-rich-select" data-action="${dataAction}" aria-label="${ariaLabel}">
        ${RICH_BLOCK_TYPE_OPTIONS.map(
          (option) => `<option value="${option.value}">${option.label}</option>`
        ).join("")}
      </select>
    </label>
  `;
}

function buildRichQuoteMenuHtml() {
  return `
    <div class="canvas2d-rich-submenu" data-submenu="blockquote">
      <button type="button" class="canvas2d-rich-btn" data-action="blockquote" title="引用">❝</button>
      <button
        type="button"
        class="canvas2d-rich-btn canvas2d-rich-submenu-toggle"
        data-action="toggle-blockquote-menu"
        aria-label="引用层级菜单"
        aria-expanded="false"
        title="引用层级"
      >▾</button>
      <div class="canvas2d-rich-submenu-panel is-hidden" role="menu" aria-label="引用层级菜单">
        <button type="button" class="canvas2d-rich-btn canvas2d-rich-submenu-item" data-action="blockquote-indent" title="引用层级加一">层级 +</button>
        <button type="button" class="canvas2d-rich-btn canvas2d-rich-submenu-item" data-action="blockquote-outdent" title="引用层级减一">层级 -</button>
      </div>
    </div>
  `;
}

function buildRichMathMenuHtml() {
  return `
    <div class="canvas2d-rich-submenu" data-submenu="math">
      <button
        type="button"
        class="canvas2d-rich-btn canvas2d-rich-submenu-toggle"
        data-action="toggle-math-menu"
        aria-label="公式菜单"
        aria-expanded="false"
        title="公式"
      >fx</button>
      <div class="canvas2d-rich-submenu-panel is-hidden" role="menu" aria-label="公式菜单">
        <button type="button" class="canvas2d-rich-btn canvas2d-rich-submenu-item" data-action="insert-math-inline" title="插入行内公式">行内公式</button>
        <button type="button" class="canvas2d-rich-btn canvas2d-rich-submenu-item" data-action="insert-math-block" title="插入独行公式">独行公式</button>
        <button type="button" class="canvas2d-rich-btn canvas2d-rich-submenu-item" data-action="edit-math-source" title="编辑当前公式">编辑公式</button>
      </div>
    </div>
  `;
}

function escapeRichTextHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMathMarkup(formula = "", { displayMode = false } = {}) {
  return renderLatexToStaticHtml(formula, { displayMode });
}

function hasRenderedKatexMarkup(markup = "") {
  return /\bkatex(?:-display)?\b/i.test(String(markup || ""));
}

function convertPlainClipboardTextToSemanticHtml(text = "", baseFontSize = DEFAULT_TEXT_FONT_SIZE) {
  const source = sanitizeText(text || "").trim();
  if (!source) {
    return "";
  }
  const detected = detectTextContentType(source);
  if (MARKDOWN_SEMANTIC_TEXT_TYPES.has(detected?.type)) {
    return sanitizeHtml(normalizeRichHtmlInlineFontSizes(renderMarkdownPlainTextToRichHtml(source), baseFontSize)).trim();
  }
  if (detected?.type === DETECTED_TEXT_TYPES.CODE && shouldFenceAsCodeMarkdown(detected)) {
    const markdownCodeBlock = `\`\`\`\n${source.replace(/\r\n/g, "\n").replace(/\r/g, "\n")}\n\`\`\``;
    return sanitizeHtml(
      normalizeRichHtmlInlineFontSizes(renderMarkdownPlainTextToRichHtml(markdownCodeBlock), baseFontSize)
    ).trim();
  }
  return "";
}

function shouldFenceAsCodeMarkdown(detected = null) {
  if (!detected || detected.type !== DETECTED_TEXT_TYPES.CODE) {
    return false;
  }
  const confidence = String(detected.confidence || "").toLowerCase();
  const matchedRule = String(detected.matchedRule || "").toLowerCase();
  const features = detected.features && typeof detected.features === "object" ? detected.features : {};
  const scores = detected.scores && typeof detected.scores === "object" ? detected.scores : {};
  const codeScore = Number(scores.code || 0);
  const markdownScore = Number(scores.markdown || 0);
  const nonEmptyLineCount = Number(features.nonEmptyLineCount || 0);
  if (matchedRule === "strong-code-signal") {
    return true;
  }
  if (confidence !== "high") {
    return false;
  }
  if (codeScore - markdownScore < 20) {
    return false;
  }
  return nonEmptyLineCount >= 2;
}

function isWeakCodeLanguageTag(language = "") {
  const normalized = String(language || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "text" ||
    normalized === "plain" ||
    normalized === "plaintext" ||
    normalized === "markdown" ||
    normalized === "md" ||
    normalized === "mdx" ||
    normalized === "gfm" ||
    normalized === "txt" ||
    normalized === "none"
  );
}

function convertMisclassifiedCodeBlockToText(item, fontSizeFallback = DEFAULT_TEXT_FONT_SIZE) {
  const plainText = sanitizeText(String(item?.plainText || item?.text || ""));
  if (!plainText.trim()) {
    return item;
  }
  const language = String(item?.language || "");
  if (!isWeakCodeLanguageTag(language)) {
    return item;
  }
  const detected = detectTextContentType(plainText);
  if (detected?.type === DETECTED_TEXT_TYPES.CODE) {
    return item;
  }
  const semanticHtml = convertPlainClipboardTextToSemanticHtml(
    plainText,
    Number(item?.fontSize || fontSizeFallback) || fontSizeFallback
  );
  const html = String(semanticHtml || "").trim();
  const normalized = normalizeElement({
    ...item,
    type: "text",
    html: html || item?.html || "",
    plainText,
    text: plainText,
    language: undefined,
    textBoxLayoutMode: item?.textBoxLayoutMode || TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
    textResizeMode: item?.textResizeMode || TEXT_RESIZE_MODE_WRAP,
    wrapMode: item?.wrapMode || TEXT_WRAP_MODE_MANUAL,
  });
  return normalized;
}

function repairMisclassifiedCodeBlocksOnBoard(board, fontSizeFallback = DEFAULT_TEXT_FONT_SIZE) {
  if (!board || !Array.isArray(board.items) || !board.items.length) {
    return board;
  }
  let changed = false;
  const items = board.items.map((item) => {
    if (!item || item.type !== "codeBlock") {
      return item;
    }
    const next = convertMisclassifiedCodeBlockToText(item, fontSizeFallback);
    if (next !== item) {
      changed = true;
    }
    return next;
  });
  if (!changed) {
    return board;
  }
  return {
    ...board,
    items,
  };
}

const AUTOSAVE_INTERVAL_MS = 30000;
const AUTOSAVE_ENABLED_KEY = "ai_worker_canvas2d_autosave_v1";
const DEFAULT_BOARD_FILE_NAME = "canvas-board.json";
const DEFAULT_NEW_BOARD_BASE = "FreeFlowBoard";
const RENDER_TEXT_IN_CANVAS = false;
const CANVAS_CLIPBOARD_MIME = "application/x-freeflow-canvas2d";
const CANVAS_CLIPBOARD_MARKER_TYPE = "canvas2d";
const CLIPBOARD_SOURCE_CANVAS = "canvas";
const CLIPBOARD_SOURCE_RICH_EDITOR = "rich-editor";
const CLIPBOARD_KIND_ITEMS = "items";
const CLIPBOARD_KIND_RICH_TEXT = "rich-text";
const RICH_OVERLAY_CULL_PADDING_PX = 160;
const RICH_OVERLAY_SCALE_BUCKET_STEP = 0.02;
const INTERNAL_DRAG_MARKER_ATTR = "data-freeflow-canvas2d-marker";
const LINK_SEMANTIC_ENABLED_KEY = "ai_worker_canvas2d_link_semantic_enabled_v1";

function buildInternalClipboardMarker({ copiedAt = Date.now(), itemCount = 0, source = "", kind = "" } = {}) {
  return JSON.stringify({
    type: CANVAS_CLIPBOARD_MARKER_TYPE,
    copiedAt: Number(copiedAt) || Date.now(),
    itemCount: Math.max(0, Number(itemCount) || 0),
    source: String(source || ""),
    kind: String(kind || ""),
  });
}

function parseInternalClipboardMarker(rawValue = "") {
  try {
    const parsed = JSON.parse(String(rawValue || "").trim());
    return parsed && parsed.type === CANVAS_CLIPBOARD_MARKER_TYPE ? parsed : null;
  } catch {
    return null;
  }
}

function buildInternalDragHtmlPayload({ marker = "", text = "" } = {}) {
  const markerValue = encodeURIComponent(String(marker || "").trim());
  const safeText = escapeRichTextHtml(String(text || "").trim()).replace(/\n/g, "<br>");
  return `<div ${INTERNAL_DRAG_MARKER_ATTR}="${markerValue}">${safeText || "&nbsp;"}</div>`;
}

function parseInternalClipboardMarkerFromHtml(html = "") {
  const source = String(html || "");
  if (!source) {
    return null;
  }
  const matcher = new RegExp(`${INTERNAL_DRAG_MARKER_ATTR}\\s*=\\s*([\"'])(.*?)\\1`, "i");
  const match = source.match(matcher);
  if (!match || !match[2]) {
    return null;
  }
  try {
    return parseInternalClipboardMarker(decodeURIComponent(match[2]));
  } catch {
    return null;
  }
}

function normalizeRichEditorFontSize(value, fallback = DEFAULT_TEXT_FONT_SIZE) {
  return normalizeTextFontSize(value, fallback);
}

function getTextBoxLayoutMode(item) {
  return coerceInteractiveTextBoxLayoutMode(
    normalizeTextBoxLayoutMode(item?.textBoxLayoutMode, item?.textResizeMode, item?.wrapMode)
  );
}

function getLinkSemanticSignature(item) {
  const tokens = Array.isArray(item?.linkTokens) ? item.linkTokens : [];
  const cache = item?.urlMetaCache && typeof item.urlMetaCache === "object" ? item.urlMetaCache : {};
  return JSON.stringify({
    tokens: tokens.map((token) => ({
      url: String(token?.url || "").trim(),
      start: Number(token?.rangeStart ?? token?.start ?? -1),
      end: Number(token?.rangeEnd ?? token?.end ?? -1),
      kindHint: String(token?.kindHint || "").trim(),
      fetchState: String(token?.fetchState || token?.state || "").trim().toLowerCase(),
    })),
    cache: Object.entries(cache)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([url, meta]) => [
        url,
        {
          title: String(meta?.title || "").trim(),
          fetchState: String(meta?.fetchState || meta?.state || "").trim().toLowerCase(),
          siteName: String(meta?.siteName || "").trim(),
        },
      ]),
  });
}

function getTextResizeMode(item) {
  return normalizeTextResizeMode(
    item?.textResizeMode || deriveTextResizeModeFromLayoutMode(getTextBoxLayoutMode(item)),
    item?.wrapMode
  );
}

function isWrapTextItem(item) {
  return item?.type === "text" && getTextResizeMode(item) === TEXT_RESIZE_MODE_WRAP;
}

function isFixedSizeTextItem(item) {
  return item?.type === "text" && getTextBoxLayoutMode(item) === TEXT_BOX_LAYOUT_MODE_FIXED_SIZE;
}

function resolveSessionFontSize(session, fallback = DEFAULT_TEXT_FONT_SIZE) {
  return normalizeRichEditorFontSize(session?.getFontSize?.() || fallback, fallback);
}

function hasSemanticTextBlocks(documentValue) {
  const blocks = Array.isArray(documentValue?.blocks) ? documentValue.blocks : [];
  return blocks.some((block) => String(block?.type || "") !== RICH_TEXT_BLOCK_TYPES.HTML);
}

function shouldUseSemanticTextLayout(content = {}) {
  const blocks = Array.isArray(content?.richTextDocument?.blocks) ? content.richTextDocument.blocks : [];
  if (!blocks.length || !hasSemanticTextBlocks(content.richTextDocument)) {
    return false;
  }
  if (blocks.length > 1) {
    return true;
  }
  const firstType = String(blocks[0]?.type || "");
  if (
    firstType &&
    firstType !== RICH_TEXT_BLOCK_TYPES.HTML &&
    firstType !== RICH_TEXT_BLOCK_TYPES.PARAGRAPH
  ) {
    return true;
  }
  return String(content?.plainText || "").includes("\n");
}

function getCanonicalRichTextHtml(content = {}, fallbackHtml = "") {
  const blocks = Array.isArray(content?.richTextDocument?.blocks) ? content.richTextDocument.blocks : [];
  if (!blocks.length || !hasSemanticTextBlocks(content.richTextDocument)) {
    return String(content?.html || fallbackHtml || "");
  }
  const canonical = serializeRichTextBlocksToHtml(blocks);
  return String(canonical || content?.html || fallbackHtml || "");
}

function shouldRemapPlainTextToSemanticHtml(content = {}, plainText = "") {
  const detected = detectTextContentType(plainText || "");
  if (!MARKDOWN_SEMANTIC_TEXT_TYPES.has(detected?.type) && detected?.type !== DETECTED_TEXT_TYPES.CODE) {
    return false;
  }
  const blocks = Array.isArray(content?.richTextDocument?.blocks) ? content.richTextDocument.blocks : [];
  if (!blocks.length) {
    return true;
  }
  return blocks.every((block) => {
    const type = String(block?.type || "");
    return type === RICH_TEXT_BLOCK_TYPES.HTML || type === RICH_TEXT_BLOCK_TYPES.PARAGRAPH;
  });
}

function normalizeEditedRichTextContent(item, html, fontSize) {
  const initialContent = ensureRichTextDocumentFields(
    {
      ...item,
      html,
      plainText: htmlToPlainText(html),
      text: htmlToPlainText(html),
    },
    {
      fontSize,
    }
  );
  const plainText = initialContent.plainText;
  if (!shouldRemapPlainTextToSemanticHtml(initialContent, plainText)) {
    return initialContent;
  }
  const remappedHtml = convertPlainClipboardTextToSemanticHtml(plainText, fontSize);
  if (!String(remappedHtml || "").trim()) {
    return initialContent;
  }
  return ensureRichTextDocumentFields(
    {
      ...item,
      html: remappedHtml,
      plainText,
      text: plainText,
    },
    {
      fontSize,
    }
  );
}

function resolveEditedTextLayoutConfig(item, content, fallbackFontSize = DEFAULT_TEXT_FONT_SIZE) {
  const currentLayoutMode = getTextBoxLayoutMode(item);
  const currentWidth = Math.max(80, Number(item?.width || 0) || 80);
  const currentHeight = Math.max(40, Number(item?.height || 0) || 40);
  if (!shouldUseSemanticTextLayout(content)) {
    return {
      layoutMode: currentLayoutMode,
      resizeMode: deriveTextResizeModeFromLayoutMode(currentLayoutMode),
      widthHint: currentWidth,
      heightHint: currentHeight,
    };
  }
  const importedLayout = resolveImportedTextBoxLayout(
    content?.plainText || "",
    Number(item?.fontSize || fallbackFontSize) || fallbackFontSize
  );
  return {
    layoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
    resizeMode: TEXT_RESIZE_MODE_WRAP,
    widthHint: Math.max(240, currentWidth, Number(importedLayout?.width || 0) || 0),
    heightHint: currentHeight,
  };
}

function syncTextLinkSemanticFields(item, plainText = "", richTextDocument = null, options = {}) {
  if (!item || item.type !== "text") {
    return { linkTokens: [], urlMetaCache: {}, richTextDocument };
  }
  const semanticEnabled = options?.semanticEnabled !== false;
  if (!semanticEnabled) {
    const fallbackDocument =
      richTextDocument && typeof richTextDocument === "object"
        ? richTextDocument
        : item.richTextDocument && typeof item.richTextDocument === "object"
          ? item.richTextDocument
          : null;
    return {
      linkTokens: Array.isArray(item.linkTokens) ? item.linkTokens : [],
      urlMetaCache: item.urlMetaCache && typeof item.urlMetaCache === "object" ? item.urlMetaCache : {},
      richTextDocument: fallbackDocument,
    };
  }
  const semanticData = refreshTextLinkSemantics(
    {
      ...item,
      richTextDocument: richTextDocument || item.richTextDocument || null,
    },
    plainText
  );
  const documentValue =
    richTextDocument && typeof richTextDocument === "object"
      ? richTextDocument
      : item.richTextDocument && typeof item.richTextDocument === "object"
        ? item.richTextDocument
        : null;
  const nextDocument = documentValue
    ? {
        ...documentValue,
        meta: {
          ...(documentValue.meta && typeof documentValue.meta === "object" ? documentValue.meta : {}),
          linkTokens: semanticData.linkTokens,
          urlMetaCache: semanticData.urlMetaCache,
        },
      }
    : documentValue;
  item.linkTokens = semanticData.linkTokens;
  item.urlMetaCache = semanticData.urlMetaCache;
  if (nextDocument) {
    item.richTextDocument = nextDocument;
  }
  return {
    linkTokens: semanticData.linkTokens,
    urlMetaCache: semanticData.urlMetaCache,
    richTextDocument: nextDocument,
  };
}

function applyRichEditorLayoutStyles(editor, item, scale) {
  if (!(editor instanceof HTMLDivElement) || !item) {
    return;
  }
  const isFlowNode = item.type === "flowNode";
  const isWrapText = isWrapTextItem(item);
  const width = Math.max(1, Number(item.width || 1)) * Math.max(0.1, Number(scale) || 1);
  const height = Math.max(1, Number(item.height || 1)) * Math.max(0.1, Number(scale) || 1);
  const padding = isFlowNode ? getFlowNodeTextPadding(scale, { width, height }) : { x: 0, y: 0 };
  const lineHeightRatio = isFlowNode ? FLOW_NODE_TEXT_LAYOUT.lineHeightRatio : TEXT_BODY_LINE_HEIGHT_RATIO;
  editor.classList.toggle("is-flow-node", isFlowNode);
  editor.classList.toggle("is-wrap-mode", isWrapText);
  editor.classList.toggle("is-fixed-size", isFixedSizeTextItem(item));
  editor.style.padding = `${padding.y}px ${padding.x}px`;
  editor.style.lineHeight = String(lineHeightRatio);
  editor.style.fontFamily = TEXT_FONT_FAMILY;
  editor.style.fontWeight = isFlowNode ? FLOW_NODE_TEXT_LAYOUT.fontWeight : TEXT_FONT_WEIGHT;
  editor.style.color = item.color || "#0f172a";
  editor.style.boxSizing = "border-box";
  editor.style.overflow = isFixedSizeTextItem(item) ? "hidden" : "visible";
  applyRichEditorTypographyTokens(editor);
}

function applyRichTypographyTokens(container) {
  if (!(container instanceof HTMLDivElement)) {
    return;
  }
  const blockSelector = "p,div,section,article,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,table";
  const blocks = container.querySelectorAll(blockSelector);
  blocks.forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const tag = normalizeTagName(node.tagName);
    node.style.lineHeight = String(getLineHeightRatioForTag(tag));
    if (tag === "ul" || tag === "ol") {
      node.style.marginTop = `${TEXT_BLOCK_SPACING_EM.listBlock}em`;
      node.style.marginBottom = `${TEXT_BLOCK_SPACING_EM.listBlock}em`;
      return;
    }
    if (tag === "li") {
      const isLastInList = !node.nextElementSibling || normalizeTagName(node.nextElementSibling.tagName) !== "li";
      node.style.marginTop = "0";
      node.style.marginBottom = isLastInList ? "0" : `${TEXT_BLOCK_SPACING_EM.listItem}em`;
      return;
    }
    if (tag === "blockquote" || tag === "pre" || tag === "table") {
      node.style.marginTop = `${TEXT_BLOCK_SPACING_EM.block}em`;
      node.style.marginBottom = `${TEXT_BLOCK_SPACING_EM.block}em`;
      return;
    }
    node.style.marginTop = "0";
    node.style.marginBottom = `${TEXT_BLOCK_SPACING_EM.paragraph}em`;
  });
}

function applyRichEditorTypographyTokens(editor) {
  applyRichTypographyTokens(editor);
}

function getRichOverlayViewportBounds(surface, fallbackWidth = 0, fallbackHeight = 0, cullPadding = RICH_OVERLAY_CULL_PADDING_PX) {
  const surfaceRect = surface?.getBoundingClientRect?.();
  const width = Math.max(
    1,
    Number(surfaceRect?.width || 0) ||
      Number(surface?.clientWidth || 0) ||
      Number(fallbackWidth || 0) ||
      1
  );
  const height = Math.max(
    1,
    Number(surfaceRect?.height || 0) ||
      Number(surface?.clientHeight || 0) ||
      Number(fallbackHeight || 0) ||
      1
  );
  const padding = Math.max(0, Number(cullPadding || 0));
  return {
    left: -padding,
    top: -padding,
    right: width + padding,
    bottom: height + padding,
  };
}

function hasScreenRectIntersection(rect, bounds) {
  if (!rect || !bounds) {
    return false;
  }
  return !(
    Number(rect.right || 0) < Number(bounds.left || 0) ||
    Number(rect.left || 0) > Number(bounds.right || 0) ||
    Number(rect.bottom || 0) < Number(bounds.top || 0) ||
    Number(rect.top || 0) > Number(bounds.bottom || 0)
  );
}

function setStyleIfNeeded(node, prop, value) {
  if (!(node instanceof HTMLElement)) {
    return;
  }
  if (node.style[prop] === value) {
    return;
  }
  node.style[prop] = value;
}

function getRichOverlayScaleBucket(scale = 1) {
  const normalized = Math.max(0.1, Number(scale) || 1);
  const step = Math.max(0.001, Number(RICH_OVERLAY_SCALE_BUCKET_STEP) || 0.02);
  return String(Math.round(normalized / step) * step);
}

function getRichOverlayClassSignature(item) {
  return JSON.stringify({
    flow: item?.type === "flowNode",
    wrap: isWrapTextItem(item),
    fixed: isFixedSizeTextItem(item),
  });
}

function getRichOverlayStyleSignature({
  left = 0,
  top = 0,
  fontSize = 12,
  paddingX = 0,
  paddingY = 0,
  lineHeightRatio = TEXT_LINE_HEIGHT_RATIO,
  fontWeight = TEXT_FONT_WEIGHT,
  color = "#0f172a",
  widthCss = "",
  heightCss = "",
  minHeightCss = "",
  maxWidthCss = "",
  display = "block",
  whiteSpace = "",
  wordBreak = "",
  overflowWrap = "",
  overflow = "visible",
} = {}) {
  return [
    Math.round(Number(left || 0) * 100) / 100,
    Math.round(Number(top || 0) * 100) / 100,
    Math.round(Number(fontSize || 0) * 100) / 100,
    Math.round(Number(paddingX || 0) * 100) / 100,
    Math.round(Number(paddingY || 0) * 100) / 100,
    Number(lineHeightRatio || TEXT_LINE_HEIGHT_RATIO),
    String(fontWeight || TEXT_FONT_WEIGHT),
    String(color || "#0f172a"),
    String(widthCss || ""),
    String(heightCss || ""),
    String(minHeightCss || ""),
    String(maxWidthCss || ""),
    String(display || "block"),
    String(whiteSpace || ""),
    String(wordBreak || ""),
    String(overflowWrap || ""),
    String(overflow || "visible"),
  ].join("|");
}

function getAutoSizedTextWritebackSignature(item, html = "") {
  return JSON.stringify({
    id: String(item?.id || ""),
    html: String(html || ""),
    text: String(item?.plainText || item?.text || ""),
    width: Math.round(Math.max(1, Number(item?.width || 1) || 1) * 100) / 100,
    height: Math.round(Math.max(1, Number(item?.height || 1) || 1) * 100) / 100,
    fontSize: Math.round(Math.max(1, Number(item?.fontSize || DEFAULT_TEXT_FONT_SIZE) || DEFAULT_TEXT_FONT_SIZE) * 100) / 100,
    color: String(item?.color || "#0f172a"),
    layoutMode: String(item?.textBoxLayoutMode || ""),
    resizeMode: String(item?.textResizeMode || ""),
  });
}

function getMathOverlaySignature(item) {
  return JSON.stringify({
    id: String(item?.id || ""),
    formula: String(item?.formula || "").trim(),
    fallbackText: String(item?.fallbackText || "").trim(),
    displayMode: item?.displayMode !== false,
    renderState: String(item?.renderState || ""),
    width: Math.round(Math.max(1, Number(item?.width || 1) || 1) * 100) / 100,
    height: Math.round(Math.max(1, Number(item?.height || 1) || 1) * 100) / 100,
  });
}

function getMathOverlayTypography(item, scale = 1) {
  const displayMode = item?.displayMode !== false;
  return {
    fontSize: displayMode ? Math.max(1, scaleSceneValue({ scale }, 22, { min: 14 })) : Math.max(1, scaleSceneValue({ scale }, 18, { min: 12 })),
    paddingX: displayMode ? 16 * Math.max(0.1, Number(scale || 1) || 1) : 10 * Math.max(0.1, Number(scale || 1) || 1),
    paddingY: displayMode ? 12 * Math.max(0.1, Number(scale || 1) || 1) : 8 * Math.max(0.1, Number(scale || 1) || 1),
  };
}

function getMathOverlayStyleSignature({ left = 0, top = 0, fontSize = 16, paddingX = 0, paddingY = 0 } = {}) {
  return [
    Math.round(Number(left || 0) * 100) / 100,
    Math.round(Number(top || 0) * 100) / 100,
    Math.round(Number(fontSize || 0) * 100) / 100,
    Math.round(Number(paddingX || 0) * 100) / 100,
    Math.round(Number(paddingY || 0) * 100) / 100,
  ].join("|");
}

function readMathOverlayFrame(node, scale = 1) {
  if (!(node instanceof HTMLDivElement)) {
    return null;
  }
  const normalizedScale = Math.max(0.1, Number(scale || 1) || 1);
  const rect = node.getBoundingClientRect();
  const widthPx = Math.max(node.scrollWidth || 0, rect.width || 0);
  const heightPx = Math.max(node.scrollHeight || 0, rect.height || 0);
  if (!widthPx || !heightPx) {
    return null;
  }
  return {
    width: Math.max(1, Math.ceil(widthPx / normalizedScale)),
    height: Math.max(1, Math.ceil(heightPx / normalizedScale)),
  };
}

function maybeWritebackMathOverlayFrame(item, node, scale = 1) {
  if (!item || (item.type !== "mathBlock" && item.type !== "mathInline")) {
    return false;
  }
  const measured = readMathOverlayFrame(node, scale);
  if (!measured) {
    return false;
  }
  const nextWidth = Math.max(56, measured.width);
  const nextHeight = Math.max(28, measured.height);
  const currentWidth = Math.max(56, Math.ceil(Number(item.width || 0) || 56));
  const currentHeight = Math.max(28, Math.ceil(Number(item.height || 0) || 28));
  if (Math.abs(nextWidth - currentWidth) <= 2 && Math.abs(nextHeight - currentHeight) <= 2) {
    return false;
  }
  item.width = nextWidth;
  item.height = nextHeight;
  return true;
}

function getAutoWidthOverlayMaxWidthPx(item, scale = 1) {
  const currentWidth = Math.max(80, Number(item?.width || 0) || 80);
  return Math.max(currentWidth, Math.min(TEXT_EDIT_MAX_WIDTH, 3200)) * Math.max(0.1, Number(scale || 1) || 1);
}

function getRichOverlayBoxStyles(item, scale = 1) {
  const layoutMode = getTextBoxLayoutMode(item);
  const currentWidth = Math.max(1, Number(item?.width || 1) || 1) * Math.max(0.1, Number(scale || 1) || 1);
  const currentHeight = Math.max(1, Number(item?.height || 1) || 1) * Math.max(0.1, Number(scale || 1) || 1);
  if (layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH) {
    return {
      display: "inline-block",
      widthCss: "max-content",
      heightCss: "auto",
      minHeightCss: "",
      maxWidthCss: `${getAutoWidthOverlayMaxWidthPx(item, scale)}px`,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
      overflow: "visible",
    };
  }
  if (layoutMode === TEXT_BOX_LAYOUT_MODE_FIXED_SIZE) {
    return {
      display: "block",
      widthCss: `${currentWidth}px`,
      heightCss: `${currentHeight}px`,
      minHeightCss: "",
      maxWidthCss: `${currentWidth}px`,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      overflowWrap: "anywhere",
      overflow: "hidden",
    };
  }
  return {
    display: "block",
    widthCss: `${currentWidth}px`,
    heightCss: "auto",
    minHeightCss: "",
    maxWidthCss: `${currentWidth}px`,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    overflow: "visible",
  };
}

function readSceneTextOverlayFrame(node, scale = 1) {
  if (!(node instanceof HTMLDivElement)) {
    return null;
  }
  const normalizedScale = Math.max(0.1, Number(scale || 1) || 1);
  const rect = node.getBoundingClientRect();
  const widthPx = Math.max(node.scrollWidth || 0, rect.width || 0);
  const heightPx = Math.max(node.scrollHeight || 0, rect.height || 0);
  if (!widthPx || !heightPx) {
    return null;
  }
  return {
    width: Math.max(1, Math.ceil(widthPx / normalizedScale)),
    height: Math.max(1, Math.ceil(heightPx / normalizedScale)),
  };
}

function maybeWritebackTextOverlayFrame(item, node, scale = 1) {
  if (!item || item.type !== "text") {
    return false;
  }
  const layoutMode = getTextBoxLayoutMode(item);
  if (layoutMode === TEXT_BOX_LAYOUT_MODE_FIXED_SIZE) {
    return false;
  }
  const measuredFrame = readSceneTextOverlayFrame(node, scale);
  if (!measuredFrame) {
    return false;
  }
  const nextWidth =
    layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH
      ? Math.max(80, measuredFrame.width)
      : Math.max(80, Number(item.width || 0) || 80);
  const nextHeight = Math.max(40, measuredFrame.height);
  const currentWidth = Math.max(80, Math.ceil(Number(item.width || 0) || 80));
  const currentHeight = Math.max(40, Math.ceil(Number(item.height || 0) || 40));
  const widthDelta = Math.abs(nextWidth - currentWidth);
  const heightDelta = Math.abs(nextHeight - currentHeight);
  const widthThreshold = layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH ? 2 : 0;
  const heightThreshold = layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH ? 2 : 6;
  if (widthDelta <= widthThreshold && heightDelta < heightThreshold) {
    return false;
  }
  if (layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH) {
    item.width = nextWidth;
  }
  item.height = nextHeight;
  return true;
}

function getEditingTextBoxMetrics(editor, item, view, plainText = "") {
  const fontSize = Math.max(12, Number(item?.fontSize || DEFAULT_TEXT_FONT_SIZE) || DEFAULT_TEXT_FONT_SIZE);
  const layoutMode = getTextBoxLayoutMode(item);
  const isWrapText = layoutMode !== TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH;
  const isFlowNode = item?.type === "flowNode";
  const measured = measureTextElementLayout({
    html: editor?.innerHTML || item?.html || "",
    plainText,
    linkTokens: Array.isArray(item?.linkTokens) ? item.linkTokens : [],
    fontSize,
    layoutMode,
    resizeMode: isWrapText ? TEXT_RESIZE_MODE_WRAP : TEXT_RESIZE_MODE_AUTO_WIDTH,
    widthHint: isWrapText ? Number(item?.width || 0) || 80 : undefined,
    heightHint: layoutMode === TEXT_BOX_LAYOUT_MODE_FIXED_SIZE ? Number(item?.height || 0) || 40 : undefined,
    maxWidth: TEXT_EDIT_MAX_WIDTH,
    lineHeightRatio: isFlowNode ? FLOW_NODE_TEXT_LAYOUT.lineHeightRatio : TEXT_LINE_HEIGHT_RATIO,
    fontWeight: isFlowNode ? FLOW_NODE_TEXT_LAYOUT.fontWeight : TEXT_FONT_WEIGHT,
    boldWeight: isFlowNode ? FLOW_NODE_TEXT_LAYOUT.boldWeight : TEXT_BOLD_WEIGHT,
  });

  return {
    width: Math.max(80, Math.ceil(Number(measured?.frameWidth || 0) || 80)),
    height: Math.max(40, Math.ceil(Number(measured?.frameHeight || 0) || 40)),
  };
}

function getRichEditableItemSignature(item) {
  if (!item || (item.type !== "text" && item.type !== "flowNode")) {
    return "";
  }
  return JSON.stringify({
    type: item.type,
    html: item.html || "",
    plainText: item.plainText || "",
    text: item.text || "",
    richTextDocument: item.richTextDocument || null,
    title: item.title || "",
    width: Number(item.width || 0) || 0,
    height: Number(item.height || 0) || 0,
    fontSize: Number(item.fontSize || 0) || 0,
    textBoxLayoutMode: item.textBoxLayoutMode || "",
    textResizeMode: item.textResizeMode || "",
  });
}

  function syncEditingRichEditorFrame(editor, item, view) {
  if (!(editor instanceof HTMLDivElement) || !item) {
    return;
  }
  const scale = Math.max(0.1, Number(view?.scale || 1));
  const left = Number(item.x || 0) * scale + Number(view?.offsetX || 0);
  const top = Number(item.y || 0) * scale + Number(view?.offsetY || 0);
  editor.style.left = `${left}px`;
  editor.style.top = `${top}px`;
  editor.style.width = `${Math.max(1, Number(item.width || 1) * scale)}px`;
  editor.style.height = `${Math.max(1, Number(item.height || 1) * scale)}px`;
  editor.style.fontSize = `${Math.max(1, Number(item.fontSize || DEFAULT_TEXT_FONT_SIZE) * scale)}px`;
  applyRichEditorLayoutStyles(editor, item, scale);
  applyInlineFontSizingToContainer(editor, scale);
}

function getCanvasOfficeEngineMode() {
  const raw = document.documentElement.dataset.canvasOfficeMode || document.body.dataset.canvasOfficeMode || "canvas2d";
  const mode = String(raw || "").trim().toLowerCase();
  return mode === "excalidraw" ? "excalidraw" : "canvas2d";
}

function isWebglRenderMode() {
  const raw =
    document.documentElement.dataset.canvasRenderMode ||
    document.body.dataset.canvasRenderMode ||
    document.documentElement.dataset.canvasRenderer ||
    document.body.dataset.canvasRenderer ||
    globalThis.__canvasRenderMode ||
    "";
  return String(raw || "").trim().toLowerCase() === "webgl";
}

function normalizeMode(value = "") {
  return String(value || "").trim().toLowerCase() === "excalidraw" ? "excalidraw" : "canvas2d";
}

function normalizeTool(value = "") {
  const next = String(value || "").trim().toLowerCase();
  if (TOOL_SET.has(next)) {
    return next;
  }
  return TOOL_SHORTCUTS[next] || "select";
}

function isTinyShape(element) {
  if (!element || element.type !== "shape") {
    return true;
  }
  if (element.shapeType === "line" || element.shapeType === "arrow") {
    const dx = Number(element.endX || 0) - Number(element.startX || 0);
    const dy = Number(element.endY || 0) - Number(element.startY || 0);
    return Math.hypot(dx, dy) < 6;
  }
  return Math.max(Number(element.width || 0), Number(element.height || 0)) < 6;
}

function getHandleCursor(handle) {
  if (typeof handle === "string" && handle.startsWith("round-")) {
    return "grab";
  }
  if (handle === "rotate-shape") {
    return "grab";
  }
  if (handle === "nw" || handle === "se") {
    return "nwse-resize";
  }
  if (handle === "ne" || handle === "sw") {
    return "nesw-resize";
  }
  if (handle === "rotate-image") {
    return "grab";
  }
  if (handle === "flow-connector") {
    return "crosshair";
  }
  if (handle === "start" || handle === "end") {
    return "crosshair";
  }
  return "default";
}

function isLockedText(item) {
  return item?.type === "text" && Boolean(item.locked);
}

function isLockedItem(item) {
  return Boolean(item?.locked);
}

function isExportableItem(item) {
  return item?.type === "fileCard" || item?.type === "image" || item?.type === "text";
}

  function normalizeExportName(value, fallback) {
    const base = String(value || "").trim() || fallback;
    return base.replace(/[\\/:*?"<>|]+/g, "_");
  }

  function clonePointerBase(item) {
    if (!item || typeof item !== "object") {
      return item;
    }
    const dataUrl = typeof item.dataUrl === "string" ? item.dataUrl : "";
    if (item.type === "image" && dataUrl.length > 4096) {
      return { ...item };
    }
    return clone(item);
  }

  async function resolveImportImageFolder() {
    if (!useLocalFileSystem || typeof globalThis?.desktopShell?.writeFile !== "function") {
      return "";
    }
    let baseFolder = resolveBoardFolderPath(state.boardFilePath);
    if (!baseFolder) {
      const settingsPath = await resolveCanvasBoardSavePath();
      baseFolder = resolveBoardFolderPath(settingsPath) || String(settingsPath || "").trim();
    }
    if (!baseFolder) {
      const configuredPath = await resolveCanvasImageSavePath();
      baseFolder = String(configuredPath || "").trim();
    }
    if (!baseFolder) {
      return "";
    }
    const normalizedFolder = stripTrailingSeparators(baseFolder);
    if (getFileNameFromPath(normalizedFolder).toLowerCase() === "importimage") {
      return normalizedFolder;
    }
    return joinPath(normalizedFolder, "importImage");
  }

  async function ensureImportImageFolderExists() {
    if (!useLocalFileSystem || typeof globalThis?.desktopShell?.writeFile !== "function") {
      return false;
    }
    const folder = await resolveImportImageFolder();
    if (!folder) {
      return false;
    }
    const markerPath = joinPath(folder, ".keep");
    const result = await globalThis.desktopShell.writeFile(markerPath, new Uint8Array());
    return Boolean(result?.ok);
  }

  async function saveImageDataToImportFolder({ dataUrl = "", sourcePath = "", name = "image", mime = "" } = {}) {
    const folder = await resolveImportImageFolder();
    if (!folder) {
      return { ok: false, filePath: "", mime: "", error: "未找到当前画布目录" };
    }
    let payload = { data: "", mime: mime || "" };
    if (dataUrl) {
      payload = await readDataUrlAsBase64(dataUrl);
    }
    if (!payload.data && sourcePath && typeof globalThis?.desktopShell?.readFileBase64 === "function") {
      try {
        const result = await globalThis.desktopShell.readFileBase64(sourcePath);
        if (result?.ok && result.data) {
          payload = { data: result.data, mime: String(result.mime || payload.mime || "") };
        }
      } catch {
        // ignore read failures
      }
    }
    if (!payload.data) {
      return { ok: false, filePath: "", mime: "", error: "图片数据为空" };
    }
    const ext = getImageExtensionFromMime(payload.mime, name, sourcePath);
    const cleanName = normalizeExportName(name || "image", "image");
    const filename = `${cleanName}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${ext}`;
    const filePath = joinPath(folder, filename);
    let bytes;
    try {
      bytes = base64ToBytes(payload.data);
    } catch {
      try {
        const response = await fetch(dataUrl);
        const buffer = await response.arrayBuffer();
        bytes = new Uint8Array(buffer);
      } catch {
        return { ok: false, filePath: "", mime: "", error: "图片编码失败" };
      }
    }
    const result = await globalThis.desktopShell.writeFile(filePath, bytes);
    if (!result?.ok) {
      return { ok: false, filePath: "", mime: "", error: result?.error || "写入文件失败" };
    }
    return { ok: true, filePath, mime: payload.mime || `image/${ext === "jpg" ? "jpeg" : ext}` };
  }

  async function saveImageItemToImportFolder(item, { dataUrlOverride = "", nameOverride = "", resetTransforms = false } = {}) {
    if (!item || item.type !== "image") {
      return false;
    }
    const name = String(nameOverride || item.name || item.fileName || "image").trim() || "image";
    const dataUrl = String(dataUrlOverride || item.dataUrl || "").trim();
    const sourcePath = String(item.sourcePath || "").trim();
    const result = await saveImageDataToImportFolder({ dataUrl, sourcePath, name, mime: item.mime || "" });
    if (!result?.ok || !result.filePath) {
      return false;
    }
    item.sourcePath = result.filePath;
    item.source = "path";
    item.dataUrl = "";
    item.fileId = "";
    if (result.mime) {
      item.mime = result.mime;
    }
    if (resetTransforms) {
      item.crop = null;
      item.rotation = 0;
      item.flipX = false;
      item.flipY = false;
      item.brightness = 0;
      item.contrast = 0;
    }
    const dimensions = await readImageDimensions("", result.filePath, { allowLocalFileAccess: true });
    if (dimensions?.width && dimensions?.height) {
      item.naturalWidth = dimensions.width;
      item.naturalHeight = dimensions.height;
    }
    return true;
  }

  async function persistImportedImages(items = []) {
    if (!Array.isArray(items) || !items.length) {
      return false;
    }
    let saved = 0;
    for (const item of items) {
      if (item?.type !== "image") {
        continue;
      }
      const ok = await saveImageItemToImportFolder(item);
      if (ok) {
        saved += 1;
      }
    }
    if (saved) {
      setSaveToast("图片已保存至当前画布目录下的 importImage 文件夹");
    }
    return saved > 0;
  }

  async function saveCroppedImageItem(itemId) {
    const item = getImageItemById(itemId);
    if (!item) {
      return false;
    }
    const source = resolveImageSource(item.dataUrl, item.sourcePath, { allowLocalFileAccess: true });
    if (!source) {
      return false;
    }
    const image = await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = source;
    });
    if (!image) {
      return false;
    }
    const canvas = renderImageToCanvas(item, image);
    if (!canvas) {
      return false;
    }
    const dataUrl = safeCanvasToDataUrl(canvas);
    if (!dataUrl) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    const ok = await saveImageItemToImportFolder(item, {
      dataUrlOverride: dataUrl,
      nameOverride: `${item.name || "image"}-crop`,
      resetTransforms: true,
    });
    if (!ok) {
      return false;
    }
    commitHistory(before, "保存裁剪图片");
    setSaveToast("图片已保存至当前画布目录下的 importImage 文件夹");
    return true;
  }

function getDataUrlMime(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:([^;]+);/i);
  return match ? match[1] : "";
}

async function readDataUrlAsBase64(dataUrl = "") {
  const raw = String(dataUrl || "").trim();
  if (!raw) {
    return { data: "", mime: "" };
  }
  if (raw.startsWith("data:")) {
    const mime = getDataUrlMime(raw);
    const data = raw.split(",")[1] || "";
    return { data, mime };
  }
  const response = await fetch(raw);
  if (!response.ok) {
    throw new Error("图片读取失败");
  }
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { data: btoa(binary), mime: blob.type || "" };
}

function base64ToBytes(base64 = "") {
  const clean = String(base64 || "");
  if (!clean) {
    return new Uint8Array();
  }
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getImageExtensionFromMime(mime = "", name = "", sourcePath = "") {
  const cleanMime = String(mime || "").toLowerCase();
  if (cleanMime.includes("png")) return "png";
  if (cleanMime.includes("jpeg") || cleanMime.includes("jpg")) return "jpg";
  if (cleanMime.includes("webp")) return "webp";
  if (cleanMime.includes("gif")) return "gif";
  if (cleanMime.includes("bmp")) return "bmp";
  const nameExt = getFileExtension(name || "");
  if (nameExt) {
    return nameExt.replace(/^\./, "");
  }
  const pathExt = getFileExtension(sourcePath || "");
  if (pathExt) {
    return pathExt.replace(/^\./, "");
  }
  return "png";
}

function escapeHtml(text = "") {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function unwrapNode(node) {
  const parent = node?.parentNode;
  if (!parent) {
    return;
  }
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  parent.removeChild(node);
}

function buildTextPresetHtml(item, preset) {
  const plainText = sanitizeText(item?.plainText || item?.text || htmlToPlainText(item?.html || ""));
  const sourceHtml = item?.html?.trim() ? item.html : escapeHtml(plainText);
  const style = `font-weight: ${preset.fontWeight};`;
  if (typeof document === "undefined") {
    return `<div style="${style}">${sourceHtml}</div>`;
  }
  const template = document.createElement("template");
  template.innerHTML = sourceHtml;
  template.content.querySelectorAll("strong,b").forEach((node) => unwrapNode(node));
  template.content.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    if (node.style.fontSize) {
      node.style.fontSize = "";
    }
    if (node.style.fontWeight) {
      node.style.fontWeight = "";
    }
    if (!node.getAttribute("style")) {
      node.removeAttribute("style");
    }
  });
  return `<div style="${style}">${template.innerHTML || escapeHtml(plainText)}</div>`;
}

function applyInlineFontSizingToContainer(container, scale = 1) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const safeScale = Math.max(0.1, Number(scale || 1));
  container.querySelectorAll(`[${INLINE_FONT_SIZE_ATTR}]`).forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const logicalSize = Number.parseFloat(String(node.getAttribute(INLINE_FONT_SIZE_ATTR) || ""));
    if (!Number.isFinite(logicalSize) || logicalSize <= 0) {
      node.style.fontSize = "";
      if (!node.getAttribute("style")) {
        node.removeAttribute("style");
      }
      return;
    }
    node.style.fontSize = `${Math.max(1, Math.round(logicalSize * safeScale * 100) / 100)}px`;
  });
}

export function createCanvas2DEngine(options = {}) {
  const useLocalFileSystem = typeof globalThis?.desktopShell?.writeFile === "function";
  const store = createCanvas2DStore({ ...options, disableLocalStorage: useLocalFileSystem });
  const { state } = store;
  state.alignmentSnapConfig = createAlignmentSnapConfig(options.alignmentSnap);
  state.alignmentSnap = createAlignmentSnapState();

  state.board.items = state.board.items.map((item) => {
    if (item?.type === "text") {
      const html = normalizeRichHtmlInlineFontSizes(item.html || "", item.fontSize || DEFAULT_TEXT_FONT_SIZE);
      const plainText = sanitizeText(item.plainText || item.text || htmlToPlainText(html));
      return {
        ...item,
        html,
        plainText,
        text: plainText,
        wrapMode: item.wrapMode || TEXT_WRAP_MODE_MANUAL,
        textResizeMode: normalizeTextResizeMode(item.textResizeMode, item.wrapMode),
        title: buildTextTitle(plainText || "文本"),
      };
    }
    if (item?.type === "flowNode") {
      const html = normalizeRichHtmlInlineFontSizes(item.html || "", item.fontSize || 18);
      const plainText = sanitizeText(item.plainText || htmlToPlainText(html));
      return {
        ...item,
        html,
        plainText,
        wrapMode: item.wrapMode || FLOW_NODE_WRAP_MODE,
      };
    }
    return item;
  });

  function normalizeExportName(value, fallback) {
    const base = String(value || "").trim() || fallback;
    return base.replace(/[\\/:*?"<>|]+/g, "_");
  }

  function clonePointerBase(item) {
    if (!item || typeof item !== "object") {
      return item;
    }
    const dataUrl = typeof item.dataUrl === "string" ? item.dataUrl : "";
    if (item.type === "image" && dataUrl.length > 4096) {
      return { ...item };
    }
    return clone(item);
  }

  async function resolveImportImageFolder() {
    if (!useLocalFileSystem || typeof globalThis?.desktopShell?.writeFile !== "function") {
      return "";
    }
    let baseFolder = resolveBoardFolderPath(state.boardFilePath);
    if (!baseFolder) {
      const settingsPath = await resolveCanvasBoardSavePath();
      baseFolder = resolveBoardFolderPath(settingsPath) || String(settingsPath || "").trim();
    }
    if (!baseFolder) {
      const configuredPath = await resolveCanvasImageSavePath();
      baseFolder = String(configuredPath || "").trim();
    }
    if (!baseFolder) {
      return "";
    }
    const normalizedFolder = stripTrailingSeparators(baseFolder);
    if (getFileNameFromPath(normalizedFolder).toLowerCase() === "importimage") {
      return normalizedFolder;
    }
    return joinPath(normalizedFolder, "importImage");
  }

  async function ensureImportImageFolderExists() {
    if (!useLocalFileSystem || typeof globalThis?.desktopShell?.writeFile !== "function") {
      return false;
    }
    const folder = await resolveImportImageFolder();
    if (!folder) {
      return false;
    }
    const markerPath = joinPath(folder, ".keep");
    const result = await globalThis.desktopShell.writeFile(markerPath, new Uint8Array());
    return Boolean(result?.ok);
  }

  async function saveImageDataToImportFolder({ dataUrl = "", sourcePath = "", name = "image", mime = "" } = {}) {
    const folder = await resolveImportImageFolder();
    if (!folder) {
      return { ok: false, filePath: "", mime: "", error: "未找到当前画布目录" };
    }
    let payload = { data: "", mime: mime || "" };
    if (dataUrl) {
      payload = await readDataUrlAsBase64(dataUrl);
    }
    if (!payload.data && sourcePath && typeof globalThis?.desktopShell?.readFileBase64 === "function") {
      try {
        const result = await globalThis.desktopShell.readFileBase64(sourcePath);
        if (result?.ok && result.data) {
          payload = { data: result.data, mime: String(result.mime || payload.mime || "") };
        }
      } catch {
        // ignore read failures
      }
    }
    if (!payload.data) {
      return { ok: false, filePath: "", mime: "", error: "图片数据为空" };
    }
    const ext = getImageExtensionFromMime(payload.mime, name, sourcePath);
    const cleanName = normalizeExportName(name || "image", "image");
    const filename = `${cleanName}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${ext}`;
    const filePath = joinPath(folder, filename);
    let bytes;
    try {
      bytes = base64ToBytes(payload.data);
    } catch {
      try {
        const response = await fetch(dataUrl);
        const buffer = await response.arrayBuffer();
        bytes = new Uint8Array(buffer);
      } catch {
        return { ok: false, filePath: "", mime: "", error: "图片编码失败" };
      }
    }
    const result = await globalThis.desktopShell.writeFile(filePath, bytes);
    if (!result?.ok) {
      return { ok: false, filePath: "", mime: "", error: result?.error || "写入文件失败" };
    }
    return {
      ok: true,
      filePath: String(result.filePath || filePath),
      mime: payload.mime || `image/${ext === "jpg" ? "jpeg" : ext}`,
      size: Number(result.size || bytes.byteLength || 0),
    };
  }

  async function saveImageItemToImportFolder(item, { dataUrlOverride = "", nameOverride = "", resetTransforms = false } = {}) {
    if (!item || item.type !== "image") {
      return false;
    }
    const name = String(nameOverride || item.name || item.fileName || "image").trim() || "image";
    const dataUrl = String(dataUrlOverride || item.dataUrl || "").trim();
    const sourcePath = String(item.sourcePath || "").trim();
    const result = await saveImageDataToImportFolder({ dataUrl, sourcePath, name, mime: item.mime || "" });
    if (!result?.ok || !result.filePath) {
      return false;
    }
    item.sourcePath = result.filePath;
    item.source = "path";
    item.dataUrl = "";
    item.fileId = "";
    if (result.mime) {
      item.mime = result.mime;
    }
    if (resetTransforms) {
      item.crop = null;
      item.rotation = 0;
      item.flipX = false;
      item.flipY = false;
      item.brightness = 0;
      item.contrast = 0;
    }
    const dimensions = await readImageDimensions("", result.filePath, { allowLocalFileAccess: true });
    if (dimensions?.width && dimensions?.height) {
      item.naturalWidth = dimensions.width;
      item.naturalHeight = dimensions.height;
    }
    return true;
  }

  async function persistImportedImages(items = []) {
    if (!Array.isArray(items) || !items.length) {
      return false;
    }
    let saved = 0;
    for (const item of items) {
      if (item?.type !== "image") {
        continue;
      }
      const ok = await saveImageItemToImportFolder(item);
      if (ok) {
        saved += 1;
      }
    }
    if (saved) {
      setSaveToast("图片已保存至当前画布目录下的 importImage 文件夹");
    }
    return saved > 0;
  }

  async function saveCroppedImageItem(itemId) {
    const item = getImageItemById(itemId);
    if (!item) {
      return false;
    }
    const source = resolveImageSource(item.dataUrl, item.sourcePath, { allowLocalFileAccess: true });
    if (!source) {
      return false;
    }
    const image = await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = source;
    });
    if (!image) {
      return false;
    }
    const canvas = renderImageToCanvas(item, image);
    if (!canvas) {
      return false;
    }
    const dataUrl = safeCanvasToDataUrl(canvas);
    if (!dataUrl) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    const ok = await saveImageItemToImportFolder(item, {
      dataUrlOverride: dataUrl,
      nameOverride: `${item.name || "image"}-crop`,
      resetTransforms: true,
    });
    if (!ok) {
      return false;
    }
    commitHistory(before, "保存裁剪图片");
    setSaveToast("图片已保存至当前画布目录下的 importImage 文件夹");
    return true;
  }

  const getAllowLocalFileAccess = () => state.board?.preferences?.allowLocalFileAccess !== false;
  const getBoardBackgroundPattern = () => normalizeBoardBackgroundPattern(state.board?.preferences?.backgroundPattern);
  const imageModule = createImageModule();
  const shapeModule = createShapeModule();
  const flowModule = createFlowModule({
    getItemById: (id) => state.board.items.find((entry) => entry.id === id),
  });
  const elementRenderers = [
    shapeModule.createRenderer(),
    flowModule.createRenderer(),
    imageModule.createRenderer(),
    createStructuredCanvasRenderer(),
  ];
  const pasteHandlers = [];
  const dragHandlers = [];
  const commandHandlers = new Map();
  const renderer = createRenderer({ customRenderers: elementRenderers });
  const clipboardBroker = createClipboardBroker({
    readClipboardText: async () => {
      if (typeof globalThis?.desktopShell?.readClipboardText === "function") {
        const result = await globalThis.desktopShell.readClipboardText();
        return String(result?.text || "");
      }
      if (navigator.clipboard?.readText) {
        return navigator.clipboard.readText();
      }
      return "";
    },
    writeClipboardPayload: async (payload) => {
      if (!(navigator.clipboard?.write) || typeof ClipboardItem === "undefined") {
        return false;
      }
      const text = String(payload?.text || "");
      const html = String(payload?.html || "");
      const marker = buildInternalClipboardMarker({
        copiedAt: Number(payload?.copiedAt) || Date.now(),
        itemCount: Array.isArray(payload?.items) ? payload.items.length : 0,
        source: CLIPBOARD_SOURCE_CANVAS,
        kind: CLIPBOARD_KIND_ITEMS,
      });
      const item = new ClipboardItem({
        [CANVAS_CLIPBOARD_MIME]: new Blob([marker], { type: CANVAS_CLIPBOARD_MIME }),
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      });
      await navigator.clipboard.write([item]);
      return true;
    },
    writeClipboardText: async (text) => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(text || ""));
        return true;
      }
      return false;
    },
    writeClipboardHtml: async (html, text) => {
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        const cleanHtml = String(html || "");
        const cleanText = String(text || "");
        const item = new ClipboardItem({
          "text/html": new Blob([cleanHtml], { type: "text/html" }),
          "text/plain": new Blob([cleanText], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
        return true;
      }
      return false;
    },
    readClipboardFiles: async () => {
      if (typeof globalThis?.desktopShell?.readClipboardFiles === "function") {
        const result = await globalThis.desktopShell.readClipboardFiles();
        return Array.isArray(result?.paths) ? result.paths : [];
      }
      return [];
    },
    copyFilesToClipboard: async (paths = []) => {
      if (typeof globalThis?.desktopShell?.copyFilesToClipboard === "function") {
        return globalThis.desktopShell.copyFilesToClipboard(paths);
      }
      return { ok: false };
    },
  });
  const dragBroker = createDragBroker({
    createImageElement: imageModule.createElement,
    createFileCardElement,
    createTextElement,
    readFileAsDataUrl,
    readImageDimensions: (dataUrl, sourcePath) =>
      readImageDimensions(dataUrl, sourcePath, { allowLocalFileAccess: getAllowLocalFileAccess() }),
    sanitizeText,
    sanitizeHtml,
    htmlToPlainText,
    isImageFile: imageModule.isImageFile,
    getFilePath: (file) => {
      if (typeof globalThis?.desktopShell?.getPathForFile === "function") {
        return globalThis.desktopShell.getPathForFile(file);
      }
      return "";
    },
    getFileId: async (path) => {
      if (typeof globalThis?.desktopShell?.getFileId === "function") {
        const result = await globalThis.desktopShell.getFileId(String(path || ""));
        return String(result?.fileId || result || "");
      }
      return "";
    },
  });
  const refs = {
    host: null,
    surface: null,
    canvas: null,
    ctx: null,
    editor: null,
    richEditor: null,
    richToolbar: null,
    richSelectionToolbar: null,
    richDisplayHost: null,
    mathDisplayHost: null,
    imageToolbar: null,
    fileMemoEditor: null,
    imageMemoEditor: null,
    tableEditor: null,
    tableToolbar: null,
    uiHost: null,
    contextMenu: null,
    linkTooltip: null,
    dragIndicator: null,
    fileImportInput: null,
    imageImportInput: null,
  };
  const cleanupFns = [];
  let resizeObserver = null;
  let mounted = false;
  let renderFrame = 0;
  let lastContextMenuPoint = null;
  let lastContextMenuTargetId = null;
  let pendingImportAnchor = null;
  let suppressNativeDrag = false;
  let suppressBlankCanvasContextMenuUntil = 0;
  let lastExportDragAt = 0;
  let captureMode = null;
  let autosaveTimer = null;
  let suppressDirtyTracking = false;
  let boardLoadInFlight = null;
  let boardSaveInFlight = null;
  let boardSelectionPersistPromise = Promise.resolve();
  const urlMetaHydrationTasks = new Map();
  let linkSemanticEnabled = true;
  let lastEditorItemId = null;
  let lastFileMemoItemId = null;
  let lastImageMemoItemId = null;
  let lastTableEditItemId = null;
  let tableEditSelection = { rowIndex: 0, columnIndex: 0 };
  let flowDraft = null;
  const richDisplayMap = new Map();
  const mathDisplayMap = new Map();
  let pointerOverCanvas = false;
  let editBaselineSnapshot = null;
  linkSemanticEnabled = readLinkSemanticEnabled();
  const richTextSession = createRichTextEditingSession({
    editorElement: refs.richEditor,
    onSelectionChange: () => syncRichTextToolbar(),
    onRequestCommit: () => commitRichEdit(),
    onRequestCancel: () => cancelRichEdit(),
  });
  let richFontSize = DEFAULT_TEXT_FONT_SIZE;
  let richEditorComposing = false;
  let shouldExitTextToolAfterEdit = false;
  const onHintLogoLoaded = () => scheduleRender();
  const lightImageEditor = createLightImageEditor({
    getImageItemById: (id) => state.board.items.find((entry) => entry.id === id && entry.type === "image"),
    isLockedItem,
    updateImageItem: (id, updater, reason, statusText) => updateImageItem(id, updater, reason, statusText),
    setStatus,
    sanitizeText,
    resolveImageSource: (item, allowLocal = true) =>
      resolveImageSource(item?.dataUrl, item?.sourcePath, { allowLocalFileAccess: allowLocal }),
    onCropCommit: (itemId) => {
      void saveCroppedImageItem(itemId);
    },
    pickImageSavePath: (payload) =>
      typeof globalThis?.desktopShell?.pickImageSavePath === "function"
        ? globalThis.desktopShell.pickImageSavePath(payload)
        : null,
    writeFile: (targetPath, data) =>
      typeof globalThis?.desktopShell?.writeFile === "function"
        ? globalThis.desktopShell.writeFile(targetPath, data)
        : null,
    allowLocalFileAccess: () => getAllowLocalFileAccess(),
  });
  const drawToolModule = createDrawToolModule({
    createTextElement,
    createImageElement: imageModule.createElement,
    readImageDimensions,
    readFileAsDataUrl,
  });
  const structuredImportRuntime = createStructuredImportRuntime({
    internalClipboardMime: CANVAS_CLIPBOARD_MIME,
    readClipboardText: () => clipboardBroker.readSystemClipboardText(),
    readClipboardFiles: () => clipboardBroker.readSystemClipboardFiles(),
    getInternalPayload: () => clipboardBroker.getPayload(),
  });

  function isInteractiveMode() {
    return state.mode === "canvas2d" && getCanvasOfficeEngineMode() === "canvas2d";
  }

  function scheduleRender() {
    if (renderFrame || !refs.canvas || !refs.ctx) {
      return;
    }
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      renderer.render({
        ctx: refs.ctx,
        canvas: refs.canvas,
        view: state.board.view,
        items: state.board.items,
        selectedIds: state.board.selectedIds,
        hoverId: state.hoverId,
        selectionRect: state.selectionRect,
        draftElement: state.draftElement,
        editingId: state.editingId,
        imageEditState: lightImageEditor.getState(),
        flowDraft,
        alignmentSnap: state.alignmentSnap,
        alignmentSnapConfig: state.alignmentSnapConfig,
        allowLocalFileAccess: getAllowLocalFileAccess(),
        backgroundStyle: {
          fill: "#ffffff",
          pattern: getBoardBackgroundPattern(),
        },
        renderTextInCanvas: RENDER_TEXT_IN_CANVAS,
      });
      syncEditorLayout();
      syncRichTextToolbar();
      syncRichTextOverlays();
      syncMathOverlays();
      syncImageToolbar();
      syncCanvasCursor();
    });
  }

  function syncBoard({ persist = true, emit = true, markDirty = persist } = {}) {
    if (markDirty) {
      markBoardDirty();
    }
    if (persist) {
      store.persist();
    }
    if (emit) {
      store.emit();
    }
    scheduleRender();
  }

  function clearAlignmentSnap(reason = "reset", { render = false } = {}) {
    const hadActiveSnap = hasActiveAlignmentSnap(state.alignmentSnap);
    resetAlignmentSnapState(state.alignmentSnap, reason);
    if (render && hadActiveSnap) {
      scheduleRender();
    }
  }

  function setAlignmentSnapConfig(patch = {}, { emit = true, render = false } = {}) {
    if (!patch || typeof patch !== "object") {
      return state.alignmentSnapConfig;
    }
    state.alignmentSnapConfig = createAlignmentSnapConfig({
      ...state.alignmentSnapConfig,
      ...patch,
    });
    if (emit) {
      store.emit();
    }
    if (render) {
      scheduleRender();
    }
    return state.alignmentSnapConfig;
  }

  function setAlignmentSnapEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    setAlignmentSnapConfig({ enabled: nextEnabled }, { emit: true, render: true });
    if (!nextEnabled) {
      clearAlignmentSnap("disabled", { render: true });
    }
    return nextEnabled;
  }

  function getAlignmentSnapCandidates(activeId = "", options = {}) {
    return collectSnapCandidates(state.board.items, activeId, {
      view: state.board.view,
      excludeIds: Array.isArray(options.excludeIds) ? options.excludeIds : [],
    });
  }

  function setStatus(text, tone = "neutral") {
    state.statusText = String(text || "");
    state.statusTone = tone;
    store.emit();
  }

  function openExternalUrl(url = "") {
    const targetUrl = String(url || "").trim();
    if (!targetUrl) {
      return false;
    }
    try {
      // Validate URL before trying to open.
      // eslint-disable-next-line no-new
      new URL(targetUrl);
    } catch (_error) {
      return false;
    }
    if (typeof globalThis?.desktopShell?.openExternal === "function") {
      void globalThis.desktopShell.openExternal(targetUrl);
      return true;
    }
    if (typeof window?.open === "function") {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
      return true;
    }
    return false;
  }

  function waitForUiPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  }

  function findTextItemById(itemId = "") {
    const targetId = String(itemId || "").trim();
    if (!targetId) {
      return null;
    }
    return state.board.items.find((entry) => entry.id === targetId && entry.type === "text") || null;
  }

  function mergeTextItemUrlMeta(itemId = "", url = "", meta = null) {
    const item = findTextItemById(itemId);
    if (!item || !url || !meta || typeof meta !== "object") {
      return false;
    }
    const nextCache = {
      ...(item.urlMetaCache && typeof item.urlMetaCache === "object" ? item.urlMetaCache : {}),
      [url]: {
        ...(item.urlMetaCache?.[url] && typeof item.urlMetaCache[url] === "object" ? item.urlMetaCache[url] : {}),
        ...meta,
        url,
      },
    };
    item.urlMetaCache = nextCache;
    if (item.richTextDocument && typeof item.richTextDocument === "object") {
      item.richTextDocument = {
        ...item.richTextDocument,
        meta: {
          ...(item.richTextDocument.meta && typeof item.richTextDocument.meta === "object"
            ? item.richTextDocument.meta
            : {}),
          linkTokens: Array.isArray(item.linkTokens) ? item.linkTokens : [],
          urlMetaCache: nextCache,
        },
      };
    }
    markBoardDirty();
    syncBoard({ persist: false, emit: true, markDirty: false });
    return true;
  }

  async function hydrateUrlMetaForItem(itemId = "", token = null, existingMeta = null) {
    const url = String(token?.url || "").trim();
    if (!url) {
      return;
    }
    const taskKey = `${String(itemId || "").trim()}::${url}`;
    if (!taskKey || urlMetaHydrationTasks.has(taskKey)) {
      return;
    }
    const pendingMeta =
      existingMeta && typeof existingMeta === "object"
        ? existingMeta
        : {
            url,
            domain: String(token?.domain || "").trim().toLowerCase(),
            title: "",
            description: "",
            image: "",
            siteName: "",
            status: "",
            fetchState: "pending",
            updatedAt: Date.now(),
            embeddable: token?.kindHint === "embed-candidate",
          };
    mergeTextItemUrlMeta(itemId, url, pendingMeta);
    const task = (async () => {
      try {
        const resolvedMeta = await resolveUrlMeta(url, { timeoutMs: 4500 });
        if (!resolvedMeta) {
          mergeTextItemUrlMeta(itemId, url, {
            ...pendingMeta,
            fetchState: "error",
            status: "meta-unavailable",
            updatedAt: Date.now(),
          });
          return;
        }
        mergeTextItemUrlMeta(itemId, url, {
          ...pendingMeta,
          ...resolvedMeta,
          fetchState: "ready",
          updatedAt: Date.now(),
        });
      } catch (_error) {
        mergeTextItemUrlMeta(itemId, url, {
          ...pendingMeta,
          fetchState: "error",
          status: "meta-error",
          updatedAt: Date.now(),
        });
      } finally {
        urlMetaHydrationTasks.delete(taskKey);
      }
    })();
    urlMetaHydrationTasks.set(taskKey, task);
  }

  function scheduleUrlMetaHydrationForItem(item = null) {
    if (!linkSemanticEnabled || !item || item.type !== "text") {
      return;
    }
    const tokens = Array.isArray(item.linkTokens) ? item.linkTokens : [];
    if (!tokens.length) {
      return;
    }
    const metaCache = item.urlMetaCache && typeof item.urlMetaCache === "object" ? item.urlMetaCache : {};
    tokens.forEach((token) => {
      const url = String(token?.url || "").trim();
      if (!url) {
        return;
      }
      const metaEntry = metaCache[url];
      const hasRichMeta = Boolean(String(metaEntry?.title || "").trim() || String(metaEntry?.description || "").trim());
      const isResolved = String(metaEntry?.fetchState || "").trim().toLowerCase() === "ready";
      if (hasRichMeta && isResolved) {
        return;
      }
      void hydrateUrlMetaForItem(item.id, token, metaEntry);
    });
  }

  function hideLinkMetaTooltip() {
    if (!(refs.linkTooltip instanceof HTMLDivElement)) {
      return;
    }
    refs.linkTooltip.classList.add("is-hidden");
    refs.linkTooltip.style.left = "-9999px";
    refs.linkTooltip.style.top = "-9999px";
    refs.linkTooltip.innerHTML = "";
  }

  function normalizeComparableUrl(url = "") {
    const raw = String(url || "").trim();
    if (!raw) {
      return "";
    }
    try {
      return new URL(raw, window.location.href).toString();
    } catch {
      return raw;
    }
  }

  function resolveLinkDescriptorFromAnchor(target) {
    const linkEl = target instanceof Element ? target.closest("a[href], a[data-link-token='1']") : null;
    if (!(linkEl instanceof HTMLAnchorElement)) {
      return null;
    }
    const richItemEl = linkEl.closest(".canvas2d-rich-item[data-id]");
    const itemId = String(richItemEl?.getAttribute("data-id") || "").trim();
    if (!itemId) {
      return null;
    }
    const item = state.board.items.find((entry) => entry.id === itemId && entry.type === "text");
    if (!item || state.editingId === item.id) {
      return null;
    }
    const rawUrl = String(linkEl.getAttribute("data-link-url") || linkEl.getAttribute("href") || linkEl.href || "").trim();
    const normalizedUrl = normalizeComparableUrl(rawUrl);
    if (!normalizedUrl) {
      return null;
    }
    const tokens = Array.isArray(item.linkTokens) ? item.linkTokens : [];
    const rangeStart = Number(linkEl.getAttribute("data-link-range-start"));
    const rangeEnd = Number(linkEl.getAttribute("data-link-range-end"));
    const token =
      tokens.find((entry) => {
        const entryUrl = normalizeComparableUrl(entry?.url || "");
        if (!entryUrl || entryUrl !== normalizedUrl) {
          return false;
        }
        if (Number.isFinite(rangeStart) && Number.isFinite(rangeEnd)) {
          return Number(entry?.rangeStart) === rangeStart && Number(entry?.rangeEnd) === rangeEnd;
        }
        return true;
      }) ||
      tokens.find((entry) => normalizeComparableUrl(entry?.url || "") === normalizedUrl) ||
      null;
    const metaCache = item.urlMetaCache && typeof item.urlMetaCache === "object" ? item.urlMetaCache : {};
    const meta = metaCache[rawUrl] && typeof metaCache[rawUrl] === "object"
      ? metaCache[rawUrl]
      : metaCache[normalizedUrl] && typeof metaCache[normalizedUrl] === "object"
        ? metaCache[normalizedUrl]
        : {};
    return {
      item,
      linkEl,
      url: rawUrl || normalizedUrl,
      normalizedUrl,
      token,
      meta,
    };
  }

  function applyLinkSemanticsToRichDisplayNode(node, item) {
    if (!(node instanceof HTMLDivElement) || !item || item.type !== "text") {
      return;
    }
    const anchors = Array.from(node.querySelectorAll("a[href]"));
    if (!anchors.length) {
      return;
    }
    const tokens = Array.isArray(item.linkTokens) ? item.linkTokens : [];
    const metaCache = item.urlMetaCache && typeof item.urlMetaCache === "object" ? item.urlMetaCache : {};
    anchors.forEach((anchor) => {
      const href = String(anchor.getAttribute("href") || anchor.href || "").trim();
      const normalizedHref = normalizeComparableUrl(href);
      if (!normalizedHref) {
        return;
      }
      const matchedToken = tokens.find((token) => normalizeComparableUrl(token?.url || "") === normalizedHref) || null;
      const meta = metaCache[href] && typeof metaCache[href] === "object"
        ? metaCache[href]
        : metaCache[normalizedHref] && typeof metaCache[normalizedHref] === "object"
          ? metaCache[normalizedHref]
          : {};
      anchor.setAttribute("data-link-token", "1");
      anchor.setAttribute("data-link-url", href || normalizedHref);
      anchor.setAttribute("data-link-kind", String(matchedToken?.kindHint || "link").trim() || "link");
      anchor.setAttribute(
        "data-link-state",
        String(meta?.fetchState || matchedToken?.fetchState || "unknown").trim().toLowerCase() || "unknown"
      );
      if (Number.isFinite(Number(matchedToken?.rangeStart))) {
        anchor.setAttribute("data-link-range-start", String(Number(matchedToken.rangeStart)));
      }
      if (Number.isFinite(Number(matchedToken?.rangeEnd))) {
        anchor.setAttribute("data-link-range-end", String(Number(matchedToken.rangeEnd)));
      }
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
      const title = String(meta?.title || href || normalizedHref).trim();
      if (title) {
        anchor.setAttribute("title", title);
      }
    });
  }

  function updateLinkMetaTooltip(descriptor = null, clientX = 0, clientY = 0) {
    if (!(refs.linkTooltip instanceof HTMLDivElement) || !refs.surface) {
      return;
    }
    if (!descriptor?.item || descriptor.item.type !== "text" || state.editingId === descriptor.item.id) {
      hideLinkMetaTooltip();
      return;
    }
    const url = String(descriptor.url || descriptor.normalizedUrl || "").trim();
    if (!url) {
      hideLinkMetaTooltip();
      return;
    }
    const token = descriptor.token && typeof descriptor.token === "object" ? descriptor.token : {};
    const meta = descriptor.meta && typeof descriptor.meta === "object" ? descriptor.meta : {};
    const title = String(meta.title || url).trim();
    const desc = String(meta.description || meta.siteName || meta.domain || "").trim();
    const stateText = String(meta.fetchState || token.fetchState || "pending").trim().toLowerCase();
    refs.linkTooltip.innerHTML = `
      <div class="canvas2d-link-tooltip-title">${escapeRichTextHtml(title)}</div>
      <div class="canvas2d-link-tooltip-desc">${escapeRichTextHtml(desc || url)}</div>
      <div class="canvas2d-link-tooltip-state">${escapeRichTextHtml(stateText)}</div>
    `;
    refs.linkTooltip.classList.remove("is-hidden");
    const hostRect = refs.surface.getBoundingClientRect();
    const panelWidth = Math.max(200, Math.min(360, refs.linkTooltip.offsetWidth || 260));
    const panelHeight = Math.max(56, refs.linkTooltip.offsetHeight || 82);
    const left = Math.min(Math.max(12, Number(clientX || 0) - hostRect.left + 12), Math.max(12, hostRect.width - panelWidth - 12));
    const top = Math.min(Math.max(12, Number(clientY || 0) - hostRect.top + 12), Math.max(12, hostRect.height - panelHeight - 12));
    refs.linkTooltip.style.left = `${left}px`;
    refs.linkTooltip.style.top = `${top}px`;
  }

  async function mapWithConcurrency(items = [], iteratee, concurrency = 4) {
    const list = Array.isArray(items) ? items : [];
    const task = typeof iteratee === "function" ? iteratee : async (value) => value;
    const limit = Math.max(1, Math.floor(Number(concurrency) || 1));
    const results = new Array(list.length);
    let cursor = 0;

    async function worker() {
      while (cursor < list.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await task(list[index], index);
      }
    }

    const workers = Array.from({ length: Math.min(limit, Math.max(1, list.length)) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  function readUiSettingsCache() {
    try {
      const raw = localStorage.getItem(CONFIG.uiSettingsCacheKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function writeUiSettingsCache(payload = {}) {
    try {
      localStorage.setItem(CONFIG.uiSettingsCacheKey, JSON.stringify(payload));
    } catch {
      // Ignore ui settings cache failures.
    }
  }

  function readStartupContext() {
    const context = globalThis.__FREEFLOW_STARTUP_CONTEXT;
    return context && typeof context === "object" && context.ok ? context : null;
  }

  function readStartupUiSettings() {
    return readStartupContext()?.uiSettings || null;
  }

  async function fetchUiSettings() {
    try {
      const response = await fetch(API_ROUTES.uiSettings);
      const data = await readJsonResponse(response, "界面设置");
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || data?.details || "界面设置读取失败");
      }
      return data;
    } catch {
      return null;
    }
  }

  async function resolveCanvasBoardSavePath() {
    const startup = readStartupUiSettings();
    if (startup?.canvasBoardSavePath) {
      const raw = String(startup.canvasBoardSavePath || "").trim();
      return resolveBoardFolderPath(raw) || raw;
    }
    const cached = readUiSettingsCache();
    if (cached?.canvasBoardSavePath) {
      const raw = String(cached.canvasBoardSavePath || "").trim();
      return resolveBoardFolderPath(raw) || raw;
    }
    const remote = await fetchUiSettings();
    if (remote?.canvasBoardSavePath) {
      const raw = String(remote.canvasBoardSavePath || "").trim();
      return resolveBoardFolderPath(raw) || raw;
    }
    return "";
  }

  async function resolveCanvasLastOpenedBoardPath() {
    const startup = readStartupContext();
    if (startup?.uiSettings?.canvasLastOpenedBoardPath) {
      return String(startup.uiSettings.canvasLastOpenedBoardPath || "").trim();
    }
    const cached = readUiSettingsCache();
    if (cached?.canvasLastOpenedBoardPath) {
      return String(cached.canvasLastOpenedBoardPath || "").trim();
    }
    const remote = await fetchUiSettings();
    if (remote?.canvasLastOpenedBoardPath) {
      return String(remote.canvasLastOpenedBoardPath || "").trim();
    }
    return "";
  }

  async function resolveCanvasImageSavePath() {
    const startup = readStartupUiSettings();
    if (startup?.canvasImageSavePath) {
      return normalizeCanvasImageSavePathValue(startup.canvasImageSavePath);
    }
    const cached = readUiSettingsCache();
    if (cached?.canvasImageSavePath) {
      return normalizeCanvasImageSavePathValue(cached.canvasImageSavePath);
    }
    const remote = await fetchUiSettings();
    if (remote?.canvasImageSavePath) {
      return normalizeCanvasImageSavePathValue(remote.canvasImageSavePath);
    }
    return "";
  }

  function getPathSeparator(pathValue) {
    return String(pathValue || "").includes("\\") ? "\\" : "/";
  }

  function stripTrailingSeparators(pathValue) {
    return String(pathValue || "").replace(/[\\/]+$/, "");
  }

  function splitPathSegments(pathValue) {
    return stripTrailingSeparators(pathValue).split(/[\\/]/).filter(Boolean);
  }

  function getFileNameFromPath(pathValue) {
    const segments = splitPathSegments(pathValue);
    return segments[segments.length - 1] || "";
  }

  function getFolderFromPath(pathValue) {
    const segments = splitPathSegments(pathValue);
    if (segments.length <= 1) {
      return "";
    }
    const separator = getPathSeparator(pathValue);
    return segments.slice(0, -1).join(separator);
  }

  function isJsonFileName(name) {
    return String(name || "").toLowerCase().endsWith(".json");
  }

  function resolveBoardFolderPath(rawPath) {
    const cleanPath = String(rawPath || "").trim();
    if (!cleanPath) {
      return "";
    }
    const fileName = getFileNameFromPath(cleanPath);
    if (isJsonFileName(fileName)) {
      return getFolderFromPath(cleanPath);
    }
    return stripTrailingSeparators(cleanPath);
  }

  function joinPath(folder, name) {
    const cleanFolder = stripTrailingSeparators(folder);
    if (!cleanFolder) {
      return name;
    }
    const separator = getPathSeparator(cleanFolder);
    return `${cleanFolder}${separator}${name}`;
  }

  function resolveBoardFilePathFromSettings(rawPath) {
    const cleanPath = String(rawPath || "").trim();
    if (!cleanPath) {
      return "";
    }
    const fileName = getFileNameFromPath(cleanPath);
    if (isJsonFileName(fileName)) {
      return cleanPath;
    }
    return joinPath(cleanPath, DEFAULT_BOARD_FILE_NAME);
  }

  function normalizeCanvasImageSavePathValue(value = "") {
    const clean = String(value || "").trim();
    if (!clean) {
      return "";
    }
    return clean.replace(/[\\/]+$/, "");
  }

  function notifyCanvasBoardPathChange(nextPath) {
    window.dispatchEvent(
      new CustomEvent("canvas-board-path-changed", {
        detail: { canvasBoardSavePath: nextPath },
      })
    );
  }

  function notifyCanvasLastOpenedBoardPathChange(nextPath) {
    const cleanPath = String(nextPath || "").trim();
    if (!cleanPath) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent("canvas-last-opened-board-path-changed", {
        detail: { canvasLastOpenedBoardPath: cleanPath },
      })
    );
  }

  function notifyCanvasImagePathChange(nextPath) {
    window.dispatchEvent(
      new CustomEvent("canvas-image-path-changed", {
        detail: { canvasImageSavePath: nextPath },
      })
    );
  }

  async function updateCanvasImageSavePathSetting(nextPath) {
    const cleanPath = normalizeCanvasImageSavePathValue(nextPath);
    const cached = readUiSettingsCache();
    const remote = await fetchUiSettings();
    const base = remote || cached || {};
    const payload = { ...base, canvasImageSavePath: cleanPath };
    try {
      const response = await fetch(API_ROUTES.uiSettings, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJsonResponse(response, "界面设置");
      if (response.ok && data?.ok) {
        writeUiSettingsCache({ ...payload, updatedAt: data.updatedAt || Date.now() });
      }
    } catch {
      // Ignore ui settings persistence failures.
    }
    notifyCanvasImagePathChange(cleanPath);
  }

  async function persistBoardSelectionSetting(nextPath) {
    const cleanPath = String(nextPath || "").trim();
    if (!cleanPath) {
      return;
    }
    const cleanFolderPath = resolveBoardFolderPath(cleanPath);
    boardSelectionPersistPromise = boardSelectionPersistPromise
      .catch(() => {})
      .then(async () => {
        const cached = readUiSettingsCache();
        const remote = await fetchUiSettings();
        const base = remote || cached || {};
        const payload = {
          ...base,
          canvasBoardSavePath: cleanFolderPath || base.canvasBoardSavePath || "",
          canvasLastOpenedBoardPath: cleanPath,
        };
        try {
          const response = await fetch(API_ROUTES.uiSettings, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await readJsonResponse(response, "界面设置");
          if (!response.ok || !data?.ok) {
            throw new Error(data?.details || data?.error || "界面设置写入失败");
          }
          const nextCache = { ...payload, ...data, updatedAt: data.updatedAt || Date.now() };
          writeUiSettingsCache(nextCache);
          notifyCanvasBoardPathChange(resolveBoardFolderPath(nextCache.canvasBoardSavePath || cleanFolderPath));
          notifyCanvasLastOpenedBoardPathChange(String(nextCache.canvasLastOpenedBoardPath || cleanPath).trim());
        } catch {
          // Ignore ui settings persistence failures.
        }
      });
    return boardSelectionPersistPromise;
  }

  function setBoardFilePath(nextPath, { emit = true, updateSettings = false } = {}) {
    const cleanPath = String(nextPath || "").trim();
    if (state.boardFilePath === cleanPath) {
      if (updateSettings && cleanPath) {
        void persistBoardSelectionSetting(cleanPath);
      }
      return;
    }
    state.boardFilePath = cleanPath;
    state.boardFileName = cleanPath ? getFileName(cleanPath) : "未命名画布";
    if (emit) {
      store.emit();
    }
    if (updateSettings) {
      void persistBoardSelectionSetting(cleanPath);
    }
  }

  function setBoardDirty(nextDirty, { emit = true } = {}) {
    const dirty = Boolean(nextDirty);
    if (state.boardDirty === dirty) {
      return;
    }
    state.boardDirty = dirty;
    if (emit) {
      store.emit();
    }
  }

  function setCanvasImageSavePath(nextPath, { emit = true, updateSettings = false } = {}) {
    const cleanPath = normalizeCanvasImageSavePathValue(nextPath);
    if (state.canvasImageSavePath === cleanPath) {
      return;
    }
    state.canvasImageSavePath = cleanPath;
    if (updateSettings) {
      void updateCanvasImageSavePathSetting(cleanPath);
    }
    if (emit) {
      store.emit();
    }
  }

  function markBoardDirty() {
    if (suppressDirtyTracking) {
      return;
    }
    if (!state.boardDirty) {
      state.boardDirty = true;
      store.emit();
    }
  }

  function setSaveToast(message) {
    state.boardSaveToastAt = Date.now();
    state.boardSaveToastMessage = String(message || "").trim();
    store.emit();
  }

  function readAutosaveEnabled() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_ENABLED_KEY);
      if (raw === "0" || raw === "false") {
        return false;
      }
      if (raw === "1" || raw === "true") {
        return true;
      }
    } catch {
      // Ignore read failures.
    }
    return true;
  }

  function persistAutosaveEnabled(enabled) {
    try {
      localStorage.setItem(AUTOSAVE_ENABLED_KEY, enabled ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }

  function readLinkSemanticEnabled() {
    try {
      const raw = localStorage.getItem(LINK_SEMANTIC_ENABLED_KEY);
      if (raw === "0" || raw === "false") {
        return false;
      }
      if (raw === "1" || raw === "true") {
        return true;
      }
    } catch {
      // Ignore storage failures.
    }
    return true;
  }

  function persistLinkSemanticEnabled(enabled) {
    try {
      localStorage.setItem(LINK_SEMANTIC_ENABLED_KEY, enabled ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }

  function setLinkSemanticEnabled(enabled) {
    linkSemanticEnabled = Boolean(enabled);
    persistLinkSemanticEnabled(linkSemanticEnabled);
    setStatus(linkSemanticEnabled ? "已启用链接语义化" : "已关闭链接语义化（纯文本模式）");
  }

  function stopAutosaveTimer() {
    if (!autosaveTimer) {
      return;
    }
    clearInterval(autosaveTimer);
    autosaveTimer = null;
  }

  function startAutosaveTimer() {
    stopAutosaveTimer();
    autosaveTimer = setInterval(() => {
      if (!state.boardAutosaveEnabled || !state.boardDirty) {
        return;
      }
      void saveBoard({ autosave: true });
    }, AUTOSAVE_INTERVAL_MS);
  }

  function setAutosaveEnabled(enabled, { emit = true, persist = true } = {}) {
    const next = Boolean(enabled);
    state.boardAutosaveEnabled = next;
    if (persist) {
      persistAutosaveEnabled(next);
    }
    if (next) {
      startAutosaveTimer();
    } else {
      stopAutosaveTimer();
    }
    if (emit) {
      store.emit();
    }
  }

  function ensureJsonExtension(name) {
    const raw = String(name || "").trim();
    if (!raw) {
      return "";
    }
    return raw.toLowerCase().endsWith(".json") ? raw : `${raw}.json`;
  }

  async function pickSavePath(defaultPath) {
    if (typeof globalThis?.desktopShell?.pickCanvasBoardPath !== "function") {
      return "";
    }
    const result = await globalThis.desktopShell.pickCanvasBoardPath({
      defaultPath: defaultPath || "",
    });
    if (result?.canceled || !result?.filePath) {
      return "";
    }
    return String(result.filePath || "").trim();
  }

  async function pickOpenPath(defaultPath) {
    if (typeof globalThis?.desktopShell?.pickCanvasBoardOpenPath !== "function") {
      return "";
    }
    const result = await globalThis.desktopShell.pickCanvasBoardOpenPath({
      defaultPath: defaultPath || "",
    });
    if (result?.canceled || !result?.filePath) {
      return "";
    }
    return String(result.filePath || "").trim();
  }

  async function saveBoard({ saveAs = false, autosave = false, silent = false } = {}) {
    if (!useLocalFileSystem) {
      if (!silent) {
        setStatus("当前环境不支持本地保存");
      }
      return false;
    }
    syncActiveDraftEditingState({ markDirty: true });
    if (boardSaveInFlight) {
      return boardSaveInFlight;
    }
    boardSaveInFlight = (async () => {
      if (!state.boardDirty && !saveAs && !autosave) {
        if (!silent) {
          setSaveToast("画布已保存");
        }
        return true;
      }
      const settingsPath = await resolveCanvasBoardSavePath();
      const boardFolder = resolveBoardFolderPath(settingsPath);
      let targetPath = state.boardFilePath;
      if (targetPath && boardFolder) {
        const name = getFileName(targetPath);
        targetPath = joinPath(boardFolder, name);
      }
      if (saveAs) {
        const defaultPath = targetPath || resolveBoardFilePathFromSettings(settingsPath) || DEFAULT_BOARD_FILE_NAME;
        const picked = await pickSavePath(defaultPath);
        if (!picked) {
          return false;
        }
        const pickedName = getFileName(picked);
        targetPath = boardFolder ? joinPath(boardFolder, pickedName) : picked;
      } else if (!targetPath) {
        if (autosave) {
          return false;
        }
        const defaultPath = resolveBoardFilePathFromSettings(settingsPath) || DEFAULT_BOARD_FILE_NAME;
        const picked = await pickSavePath(defaultPath);
        if (!picked) {
          return false;
        }
        const pickedName = getFileName(picked);
        targetPath = boardFolder ? joinPath(boardFolder, pickedName) : picked;
      }
      if (!targetPath && boardFolder) {
        targetPath = joinPath(boardFolder, DEFAULT_BOARD_FILE_NAME);
      }
      if (!targetPath) {
        if (!silent) {
          setStatus("未选择画布保存位置");
        }
        return false;
      }
      targetPath = ensureJsonExtension(targetPath);
      const payload = JSON.stringify(
        structuredImportRuntime.serializeBoard(state.board, {
          meta: {
            boardFilePath: targetPath,
          },
        }),
        null,
        2
      );
      const result = await globalThis.desktopShell.writeFile(targetPath, payload);
      if (!result?.ok) {
        if (!silent) {
          setStatus(result?.error || "画布保存失败", "warning");
        }
        return false;
      }
      setBoardFilePath(targetPath, { emit: false, updateSettings: true });
      setBoardDirty(false, { emit: false });
      if (autosave) {
        state.boardAutosaveAt = Date.now();
      } else {
        state.boardLastSavedAt = Date.now();
        if (!silent) {
          setSaveToast("画布已保存");
        }
      }
      if (state.editingId) {
        editBaselineSnapshot = takeHistorySnapshot(state);
        richTextSession.setBaselineSnapshot(editBaselineSnapshot);
      }
      store.emit();
      return true;
    })()
      .catch((error) => {
        if (!silent) {
          setStatus(error?.message || "画布保存失败", "warning");
        }
        return false;
      })
      .finally(() => {
        boardSaveInFlight = null;
      });
    return boardSaveInFlight;
  }

  async function loadBoardFromPath(filePath, { silent = false, updateSettings = true } = {}) {
    if (!useLocalFileSystem) {
      if (!silent) {
        setStatus("当前环境不支持加载本地画布", "warning");
      }
      return false;
    }
    let targetPath = String(filePath || "").trim();
    if (!targetPath) {
      return false;
    }
    if (boardLoadInFlight) {
      return boardLoadInFlight;
    }
    boardLoadInFlight = (async () => {
      if (typeof globalThis?.desktopShell?.pathExists === "function") {
        const exists = await globalThis.desktopShell.pathExists(targetPath);
        if (!exists) {
          if (!silent) {
            setStatus("画布文件不存在", "warning");
          }
          return false;
        }
      }
      if (typeof globalThis?.desktopShell?.readFile !== "function") {
        if (!silent) {
          setStatus("当前环境不支持读取文件", "warning");
        }
        return false;
      }
      const readResult = await globalThis.desktopShell.readFile(targetPath);
      if (!readResult?.ok) {
        if (!silent) {
          setStatus(readResult?.error || "画布读取失败", "warning");
        }
        return false;
      }
      let parsed = null;
      try {
        parsed = JSON.parse(readResult?.text || "");
      } catch (error) {
        if (!silent) {
          setStatus("画布 JSON 解析失败", "warning");
        }
        return false;
      }
      suppressDirtyTracking = true;
      const restoredBoard = structuredImportRuntime.deserializeBoard(parsed).board;
      state.board = normalizeBoard(
        repairMisclassifiedCodeBlocksOnBoard(restoredBoard, DEFAULT_TEXT_FONT_SIZE)
      );
      state.board.selectedIds = [];
      state.history = createHistoryState();
      markHistoryBaseline(state.history, takeHistorySnapshot(state));
      cancelTextEdit();
      cancelFlowNodeEdit();
      cancelFileMemoEdit();
      cancelImageMemoEdit();
      finishImageEdit();
      syncBoard({ persist: false, emit: true, markDirty: false });
      suppressDirtyTracking = false;
      setBoardFilePath(targetPath, { emit: false, updateSettings });
      setBoardDirty(false, { emit: false });
      store.emit();
      void resolveFileCardSources();
      if (!silent) {
        setStatus("画布已加载");
      }
      return true;
    })()
      .catch((error) => {
        if (!silent) {
          setStatus(error?.message || "画布读取失败", "warning");
        }
        return false;
      })
      .finally(() => {
        boardLoadInFlight = null;
      });
    return boardLoadInFlight;
  }

  async function resolveUniqueBoardFilePath(folderPath) {
    const cleanFolder = stripTrailingSeparators(folderPath);
    const baseName = DEFAULT_NEW_BOARD_BASE;
    const existsFn = typeof globalThis?.desktopShell?.pathExists === "function"
      ? globalThis.desktopShell.pathExists
      : null;
    let index = 0;
    while (index < 9999) {
      const name = index === 0 ? baseName : `${baseName}_${index}`;
      const filePath = joinPath(cleanFolder || "", `${name}.json`);
      if (!existsFn) {
        return filePath;
      }
      const exists = await existsFn(filePath);
      if (!exists) {
        return filePath;
      }
      index += 1;
    }
    return joinPath(cleanFolder || "", `${baseName}_${Date.now()}.json`);
  }

  async function maybeSaveBeforeSwitch() {
    if (!state.boardDirty) {
      return true;
    }
    return saveBoard({ silent: true });
  }

  function persistCommittedBoardIfPossible() {
    if (!useLocalFileSystem) {
      return;
    }
    if (!state.boardDirty) {
      return;
    }
    if (!String(state.boardFilePath || "").trim()) {
      return;
    }
    void saveBoard({ autosave: true, silent: true });
  }

  async function newBoard() {
    const ok = await maybeSaveBeforeSwitch();
    if (!ok) {
      return false;
    }
    const settingsPath = await resolveCanvasBoardSavePath();
    const folderPath = resolveBoardFolderPath(settingsPath) || settingsPath;
    const nextPath = await resolveUniqueBoardFilePath(folderPath);
    suppressDirtyTracking = true;
    state.board = createEmptyBoard();
    state.board.selectedIds = [];
    state.history = createHistoryState();
    markHistoryBaseline(state.history, takeHistorySnapshot(state));
    cancelTextEdit();
    cancelFlowNodeEdit();
    cancelFileMemoEdit();
    cancelImageMemoEdit();
    finishImageEdit();
    syncBoard({ persist: false, emit: true, markDirty: false });
    suppressDirtyTracking = false;
    if (nextPath) {
      setBoardFilePath(nextPath, { emit: false, updateSettings: true });
    }
    setBoardDirty(true);
    setStatus("已新建画布");
    return true;
  }

  async function openBoard() {
    const ok = await maybeSaveBeforeSwitch();
    if (!ok) {
      return false;
    }
    const settingsPath = await resolveCanvasBoardSavePath();
    const defaultPath =
      state.boardFilePath || resolveBoardFilePathFromSettings(settingsPath) || DEFAULT_BOARD_FILE_NAME;
    const picked = await pickOpenPath(defaultPath);
    if (!picked) {
      return false;
    }
    return loadBoardFromPath(picked);
  }

  async function openBoardAtPath(filePath, { silent = false, updateSettings = true } = {}) {
    const cleanPath = String(filePath || "").trim();
    if (!cleanPath) {
      return false;
    }
    const ok = await maybeSaveBeforeSwitch();
    if (!ok) {
      return false;
    }
    return loadBoardFromPath(cleanPath, { silent, updateSettings });
  }

  async function ensureTutorialBoard() {
    if (!useLocalFileSystem || typeof globalThis?.desktopShell?.ensureTutorialBoard !== "function") {
      setStatus("当前环境不支持教程画布", "warning");
      return { ok: false, error: "当前环境不支持教程画布" };
    }
    const previousBoardPath = String(state.boardFilePath || "").trim();
    const result = await globalThis.desktopShell.ensureTutorialBoard();
    if (!result?.ok || !result?.filePath) {
      setStatus(result?.error || "无法准备教程画布", "warning");
      return {
        ok: false,
        error: result?.error || "无法准备教程画布",
        previousBoardPath,
      };
    }
    const loaded = await openBoardAtPath(result.filePath, { silent: true, updateSettings: false });
    if (!loaded) {
      setStatus("教程画布打开失败", "warning");
      return {
        ok: false,
        error: "教程画布打开失败",
        filePath: result.filePath,
        previousBoardPath,
      };
    }
    setStatus("教程画布已打开");
    return {
      ok: true,
      filePath: String(result.filePath || "").trim(),
      previousBoardPath,
    };
  }

  async function saveBoardAs() {
    return saveBoard({ saveAs: true });
  }

  async function renameBoard(nextName) {
    if (!useLocalFileSystem) {
      setStatus("当前环境不支持重命名", "warning");
      return false;
    }
    const currentPath = String(state.boardFilePath || "").trim();
    if (!currentPath) {
      return saveBoardAs();
    }
    const currentName = getFileName(currentPath);
    const providedName = typeof nextName === "string" && nextName.trim() ? nextName.trim() : currentName;
    const cleanName = ensureJsonExtension(providedName);
    if (!cleanName || cleanName === currentName) {
      return false;
    }
    const separator = currentPath.includes("\\") ? "\\" : "/";
    const parts = currentPath.split(/[\\/]/);
    parts[parts.length - 1] = cleanName;
    const nextPath = parts.join(separator);
    if (typeof globalThis?.desktopShell?.renamePath !== "function") {
      setStatus("当前环境不支持重命名", "warning");
      return false;
    }
    const result = await globalThis.desktopShell.renamePath(currentPath, nextPath);
    if (!result?.ok) {
      setStatus(result?.error || "画布重命名失败", "warning");
      return false;
    }
    setBoardFilePath(nextPath, { updateSettings: true });
    setStatus("画布已重命名");
    return true;
  }

  function revealBoardInFolder() {
    const targetPath = String(state.boardFilePath || "").trim();
    if (!targetPath) {
      setStatus("画布路径为空");
      return false;
    }
    if (typeof globalThis?.desktopShell?.revealPath === "function") {
      void globalThis.desktopShell.revealPath(targetPath);
      return true;
    }
    setStatus("当前环境不支持打开文件夹");
    return false;
  }

  function revealCanvasImageSavePath() {
    const targetPath = String(state.canvasImageSavePath || "").trim();
    if (!targetPath) {
        setStatus("画布图片位置为空");
      return false;
    }
    if (typeof globalThis?.desktopShell?.revealPath === "function") {
      void globalThis.desktopShell.revealPath(targetPath);
      return true;
    }
    setStatus("当前环境不支持打开文件夹");
    return false;
  }

  async function pickCanvasImageSavePath() {
    if (typeof globalThis?.desktopShell?.pickDirectory !== "function") {
      setStatus("当前环境不支持选择目录", "warning");
      return "";
    }
    const result = await globalThis.desktopShell.pickDirectory({
      defaultPath: state.canvasImageSavePath || (await resolveCanvasImageSavePath()) || "",
    });
    if (result?.canceled || !result?.filePath) {
      return "";
    }
    const nextPath = normalizeCanvasImageSavePathValue(result.filePath);
    setCanvasImageSavePath(nextPath, { updateSettings: true });
      setStatus("画布图片位置已更新");
    return nextPath;
  }

  async function pickCanvasBoardSavePath() {
    if (typeof globalThis?.desktopShell?.pickDirectory !== "function") {
      setStatus("当前环境不支持选择目录", "warning");
      return "";
    }
    const defaultPath =
      resolveBoardFolderPath(state.boardFilePath) ||
      (await resolveCanvasBoardSavePath()) ||
      "";
    const result = await globalThis.desktopShell.pickDirectory({
      defaultPath,
    });
    if (result?.canceled || !result?.filePath) {
      return "";
    }
    const nextFolder = resolveBoardFolderPath(result.filePath);
    if (!nextFolder) {
      return "";
    }
    const currentName = isJsonFileName(getFileName(state.boardFilePath))
      ? getFileName(state.boardFilePath)
      : DEFAULT_BOARD_FILE_NAME;
    const nextFilePath = joinPath(nextFolder, currentName);
    setBoardFilePath(nextFilePath, { updateSettings: true });
    setStatus("画布保存位置已更新");
    void ensureImportImageFolderExists();
    return nextFolder;
  }

  function onCanvasBoardPathChanged(event) {
    const nextPath = String(event?.detail?.canvasBoardSavePath || "").trim();
    if (!nextPath || nextPath === state.boardFilePath) {
      return;
    }
    const folderPath = resolveBoardFolderPath(nextPath);
    if (folderPath) {
      const currentName = getFileName(state.boardFilePath) || DEFAULT_BOARD_FILE_NAME;
      const nextFilePath = joinPath(folderPath, currentName);
      setBoardFilePath(nextFilePath, { updateSettings: false });
    } else {
      setBoardFilePath(nextPath, { updateSettings: false });
    }
    setStatus("画布保存路径已更新");
    void ensureImportImageFolderExists();
  }

  function onCanvasImagePathChanged(event) {
    const nextPath = normalizeCanvasImageSavePathValue(event?.detail?.canvasImageSavePath || "");
    if (nextPath === state.canvasImageSavePath) {
      return;
    }
    setCanvasImageSavePath(nextPath, { updateSettings: false });
      setStatus("画布图片位置已更新");
  }

  async function initBoardFileState() {
    state.boardAutosaveEnabled = readAutosaveEnabled();
    const startupContext = readStartupContext();
    const lastOpenedPath =
      String(startupContext?.startup?.initialBoardPath || "").trim() || (await resolveCanvasLastOpenedBoardPath());
    const boardSavePath =
      String(startupContext?.startup?.boardSavePath || "").trim() || (await resolveCanvasBoardSavePath());
    const fallbackPath = boardSavePath ? resolveBoardFilePathFromSettings(boardSavePath) : "";
    const initialPath = lastOpenedPath || fallbackPath;
    if (initialPath) {
      setBoardFilePath(initialPath, { emit: false, updateSettings: false });
    } else {
      state.boardFileName = "未命名画布";
    }
    state.canvasImageSavePath =
      normalizeCanvasImageSavePathValue(startupContext?.startup?.canvasImageSavePath || "") ||
      (await resolveCanvasImageSavePath());
    store.emit();
    if (useLocalFileSystem && state.boardFilePath) {
      const loaded = await loadBoardFromPath(state.boardFilePath, { silent: true });
      if (!loaded && fallbackPath && fallbackPath !== state.boardFilePath) {
        setBoardFilePath(fallbackPath, { emit: false, updateSettings: false });
        const fallbackLoaded = await loadBoardFromPath(fallbackPath, { silent: true });
        if (!fallbackLoaded) {
          setStatus("当前画布加载失败，已停留在空白画布", "warning");
        }
      } else if (!loaded && state.boardFilePath) {
        setStatus("当前画布加载失败，已停留在空白画布", "warning");
      }
    }
    void ensureImportImageFolderExists();
    if (state.boardAutosaveEnabled) {
      startAutosaveTimer();
    }
  }

  function showDragIndicator(clientX, clientY) {
    if (!(refs.dragIndicator instanceof HTMLDivElement)) {
      return;
    }
    refs.dragIndicator.style.transform = `translate(${Math.round(clientX + 14)}px, ${Math.round(clientY + 14)}px)`;
    refs.dragIndicator.classList.remove("is-hidden");
  }

  function hideDragIndicator() {
    if (!(refs.dragIndicator instanceof HTMLDivElement)) {
      return;
    }
    refs.dragIndicator.classList.add("is-hidden");
  }

  async function writePlainTextToClipboard(text) {
    const value = String(text || "");
    if (!value) {
      return false;
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // ignore clipboard failures
      }
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }

  function pushItems(items = [], { reason = "", statusText = "" } = {}) {
    if (!Array.isArray(items) || !items.length) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    state.board.items.push(...items);
    state.board.selectedIds = items.map((item) => item.id);
    void hydrateFileCardIds(items);
    commitHistory(before, reason);
    if (statusText) {
      setStatus(statusText);
    }
    return true;
  }

  async function hydrateFileCardIds(items = []) {
    if (typeof globalThis?.desktopShell?.getFileId !== "function") {
      return;
    }
    const targets = items.filter(
      (item) => (item?.type === "fileCard" || item?.type === "image") && item.sourcePath && !item.fileId
    );
    if (!targets.length) {
      return;
    }
    let changed = false;
    for (const item of targets) {
      try {
        const result = await globalThis.desktopShell.getFileId(String(item.sourcePath || ""));
        const fileId = String(result?.fileId || result || "");
        if (fileId && item.fileId !== fileId) {
          item.fileId = fileId;
          changed = true;
        }
      } catch {
        // Ignore file id resolution failures.
      }
    }
    if (changed) {
      syncBoard({ persist: true, emit: true });
    }
  }

  async function resolveFileCardSourcesForItems(fileCards = []) {
    if (typeof globalThis?.desktopShell?.pathExists !== "function") {
      return false;
    }
    if (!fileCards.length) {
      return false;
    }
    if (!fileCards.length) {
      return;
    }
    let changed = false;
    for (const item of fileCards) {
      const sourcePath = String(item.sourcePath || "").trim();
      if (sourcePath) {
        try {
          const exists = await globalThis.desktopShell.pathExists(sourcePath);
          if (exists) {
            continue;
          }
        } catch {
          // Ignore path checks.
        }
      }
      const fileId = String(item.fileId || "").trim();
      if (!fileId || typeof globalThis?.desktopShell?.findPathByFileId !== "function") {
        continue;
      }
      try {
        const result = await globalThis.desktopShell.findPathByFileId(fileId);
        const resolvedPath = String(result?.path || result || "").trim();
        if (!resolvedPath) {
          continue;
        }
        const fileName = getFileName(resolvedPath);
        item.sourcePath = resolvedPath;
        item.fileName = fileName;
        item.name = fileName;
        item.title = getFileBaseName(fileName);
        item.ext = getFileExtension(fileName);
        changed = true;
      } catch {
        // Ignore lookup failures.
      }
    }
    return changed;
  }

  async function resolveFileCardSources() {
    const fileCards = state.board.items.filter((item) => item.type === "fileCard" || item.type === "image");
    const changed = await resolveFileCardSourcesForItems(fileCards);
    if (changed) {
      syncBoard({ persist: true, emit: true });
    }
  }

  function applyHistorySnapshot(snapshot, { persist = true } = {}) {
    if (!snapshot) {
      return false;
    }
    state.board.items = Array.isArray(snapshot.items) ? snapshot.items.map((item) => normalizeElement(item)) : [];
    state.board.selectedIds = Array.isArray(snapshot.selectedIds)
      ? snapshot.selectedIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    state.board.view = createView(snapshot.view || DEFAULT_VIEW);
    state.editingId = snapshot.editingId || null;
    state.editingType = snapshot.editingType || null;
    if (!state.editingId) {
      refs.editor?.classList.add("is-hidden");
      refs.richEditor?.classList.add("is-hidden");
      refs.tableEditor?.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
    }
    syncBoard({ persist, emit: true });
    return true;
  }

  function commitHistory(before, reason = "") {
    const after = takeHistorySnapshot(state);
    const changed = pushHistory(state.history, before, after, reason);
    syncBoard({ persist: true, emit: true, markDirty: changed });
    return changed;
  }

  function getCanvasRect() {
    return refs.canvas?.getBoundingClientRect() || refs.surface?.getBoundingClientRect() || { left: 0, top: 0, width: 1, height: 1 };
  }

  function getCenterScenePoint() {
    return getViewportCenterScenePoint(state.board.view, getCanvasRect());
  }

  function toScenePoint(clientX, clientY) {
    return screenToScene(state.board.view, { x: clientX, y: clientY }, getCanvasRect());
  }

  function updateLastPointerPoint(point) {
    state.lastPointerScenePoint = {
      x: Number(point?.x || 0),
      y: Number(point?.y || 0),
    };
  }

  function resize() {
    if (!refs.canvas) {
      return;
    }
    const rect = refs.canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    refs.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    refs.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    scheduleRender();
  }

  function syncCanvasCursor() {
    if (!refs.canvas) {
      return;
    }
    if (!isInteractiveMode()) {
      refs.canvas.style.cursor = "default";
      return;
    }
    if (state.pointer?.type === "resize-selection") {
      refs.canvas.style.cursor = getHandleCursor(state.pointer.handle);
      return;
    }
    if (state.pointer?.type === "rotate-image") {
      refs.canvas.style.cursor = "grabbing";
      return;
    }
    if (state.pointer?.type === "rotate-shape") {
      refs.canvas.style.cursor = "grabbing";
      return;
    }
    if (state.pointer?.type === "flow-connect") {
      refs.canvas.style.cursor = "crosshair";
      return;
    }
    if (state.pointer?.type === "pan") {
      refs.canvas.style.cursor = "grab";
      return;
    }
    if (state.editingType === "image" && lightImageEditor.getState()?.mode && state.editingId) {
      refs.canvas.style.cursor = "crosshair";
      return;
    }
    if (state.hoverHandle) {
      refs.canvas.style.cursor = getHandleCursor(state.hoverHandle);
      return;
    }
    refs.canvas.style.cursor = state.tool === "select" ? "default" : "crosshair";
  }

  function ensureDom(host) {
    refs.host = host instanceof HTMLElement ? host : refs.host;
    refs.surface = refs.host;
    if (!(refs.surface instanceof HTMLElement)) {
      throw new Error("工作白板宿主不存在");
    }

    refs.uiHost = refs.surface.querySelector("#canvas2d-react-ui-host");
    if (!(refs.uiHost instanceof HTMLElement)) {
      refs.uiHost = document.createElement("div");
      refs.uiHost.id = "canvas2d-react-ui-host";
      refs.uiHost.className = "canvas2d-react-ui-host";
      refs.surface.appendChild(refs.uiHost);
    }

    refs.canvas = refs.surface.querySelector("#canvas-office-canvas");
    if (!(refs.canvas instanceof HTMLCanvasElement)) {
      refs.canvas = document.createElement("canvas");
      refs.canvas.id = "canvas-office-canvas";
      refs.canvas.className = "canvas-office-canvas";
      refs.surface.appendChild(refs.canvas);
    }
    refs.canvas.tabIndex = 0;
    refs.canvas.draggable = true;

    refs.editor = refs.surface.querySelector("#canvas-text-editor");
    if (!(refs.editor instanceof HTMLTextAreaElement)) {
      refs.editor = document.createElement("textarea");
      refs.editor.id = "canvas-text-editor";
      refs.editor.className = "canvas-text-editor is-hidden";
      refs.editor.setAttribute("aria-label", "编辑文本");
      refs.surface.appendChild(refs.editor);
    }

    refs.fileMemoEditor = refs.surface.querySelector("#canvas-file-memo-editor");
    if (!(refs.fileMemoEditor instanceof HTMLTextAreaElement)) {
      refs.fileMemoEditor = document.createElement("textarea");
      refs.fileMemoEditor.id = "canvas-file-memo-editor";
      refs.fileMemoEditor.className = "canvas-file-memo-editor is-hidden";
      refs.fileMemoEditor.setAttribute("aria-label", "编辑文件卡备注");
      refs.fileMemoEditor.setAttribute("wrap", "soft");
      refs.surface.appendChild(refs.fileMemoEditor);
    }

    refs.imageMemoEditor = refs.surface.querySelector("#canvas-image-memo-editor");
    if (!(refs.imageMemoEditor instanceof HTMLTextAreaElement)) {
      refs.imageMemoEditor = document.createElement("textarea");
      refs.imageMemoEditor.id = "canvas-image-memo-editor";
      refs.imageMemoEditor.className = "canvas-image-memo-editor is-hidden";
      refs.imageMemoEditor.setAttribute("aria-label", "编辑图片备注");
      refs.imageMemoEditor.setAttribute("wrap", "soft");
      refs.surface.appendChild(refs.imageMemoEditor);
    }

    refs.tableEditor = refs.surface.querySelector("#canvas-table-editor");
    if (!(refs.tableEditor instanceof HTMLDivElement)) {
      refs.tableEditor = document.createElement("div");
      refs.tableEditor.id = "canvas-table-editor";
      refs.tableEditor.className = "canvas-table-editor is-hidden";
      refs.tableEditor.setAttribute("aria-label", "编辑表格");
      refs.surface.appendChild(refs.tableEditor);
    }

    refs.tableToolbar = refs.surface.querySelector("#canvas-table-toolbar");
    if (!(refs.tableToolbar instanceof HTMLDivElement)) {
      refs.tableToolbar = document.createElement("div");
      refs.tableToolbar.id = "canvas-table-toolbar";
      refs.tableToolbar.className = "canvas-table-toolbar is-hidden";
      refs.tableToolbar.innerHTML = `
        <button type="button" class="canvas2d-rich-btn" data-action="table-add-row">+ 行</button>
        <button type="button" class="canvas2d-rich-btn" data-action="table-add-column">+ 列</button>
        <button type="button" class="canvas2d-rich-btn" data-action="table-delete-row">- 行</button>
        <button type="button" class="canvas2d-rich-btn" data-action="table-delete-column">- 列</button>
        <button type="button" class="canvas2d-rich-btn" data-action="table-toggle-header">表头</button>
        <button type="button" class="canvas2d-rich-btn" data-action="table-done">完成</button>
      `;
      refs.surface.appendChild(refs.tableToolbar);
    }

    refs.richEditor = refs.surface.querySelector("#canvas-rich-editor");
    if (!(refs.richEditor instanceof HTMLDivElement)) {
      refs.richEditor = document.createElement("div");
      refs.richEditor.id = "canvas-rich-editor";
      refs.richEditor.className = "canvas-rich-editor is-hidden";
      refs.richEditor.setAttribute("aria-label", "编辑富文本");
      refs.richEditor.setAttribute("contenteditable", "true");
      refs.richEditor.setAttribute("spellcheck", "false");
      refs.richEditor.dataset.ffManagedPaste = "true";
      refs.surface.appendChild(refs.richEditor);
    }
    refs.richEditor.dataset.ffManagedPaste = "true";
    richTextSession.setEditorElement(refs.richEditor);

    refs.contextMenu = refs.surface.querySelector("#canvas2d-context-menu");
    if (!(refs.contextMenu instanceof HTMLDivElement)) {
      refs.contextMenu = document.createElement("div");
      refs.contextMenu.id = "canvas2d-context-menu";
      refs.contextMenu.className = "canvas2d-context-menu is-hidden";
      refs.contextMenu.innerHTML = `
          <button type="button" class="canvas2d-context-menu-item" data-action="add-text">添加文本</button>
          <div class="canvas2d-context-submenu">
            <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">添加图形</button>
            <div class="canvas2d-context-submenu-panel" role="menu" aria-label="添加图形">
              <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-rect">矩形</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-ellipse">椭圆</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-arrow">箭头</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-line">直线</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-highlight">高亮</button>
            </div>
          </div>
          <button type="button" class="canvas2d-context-menu-item" data-action="add-node">添加节点</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="add-file">添加文件</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="add-image">添加图片</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="add-table">添加表格</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="clear-board">清空画布</button>
        `;
      refs.contextMenu.style.position = "absolute";
      refs.contextMenu.style.zIndex = "40";
      refs.contextMenu.style.minWidth = "120px";
      refs.contextMenu.style.padding = "6px";
      refs.contextMenu.style.borderRadius = "10px";
      refs.contextMenu.style.background = "rgba(255,255,255,0.96)";
      refs.contextMenu.style.boxShadow = "0 12px 24px rgba(15, 23, 42, 0.18)";
      refs.contextMenu.style.border = "1px solid rgba(203, 213, 225, 0.7)";
      refs.contextMenu.style.display = "flex";
      refs.contextMenu.style.flexDirection = "column";
      refs.contextMenu.style.gap = "4px";
      refs.surface.appendChild(refs.contextMenu);
    }

    refs.linkTooltip = refs.surface.querySelector("#canvas2d-link-meta-tooltip");
    if (!(refs.linkTooltip instanceof HTMLDivElement)) {
      refs.linkTooltip = document.createElement("div");
      refs.linkTooltip.id = "canvas2d-link-meta-tooltip";
      refs.linkTooltip.className = "canvas2d-link-meta-tooltip is-hidden";
      refs.linkTooltip.setAttribute("aria-hidden", "true");
      refs.linkTooltip.style.position = "absolute";
      refs.linkTooltip.style.zIndex = "39";
      refs.linkTooltip.style.maxWidth = "360px";
      refs.linkTooltip.style.padding = "8px 10px";
      refs.linkTooltip.style.borderRadius = "8px";
      refs.linkTooltip.style.background = "rgba(248, 250, 252, 0.97)";
      refs.linkTooltip.style.border = "1px solid rgba(148, 163, 184, 0.45)";
      refs.linkTooltip.style.boxShadow = "0 8px 20px rgba(15, 23, 42, 0.15)";
      refs.linkTooltip.style.pointerEvents = "none";
      refs.linkTooltip.style.left = "-9999px";
      refs.linkTooltip.style.top = "-9999px";
      refs.surface.appendChild(refs.linkTooltip);
    }

    refs.dragIndicator = refs.surface.querySelector("#canvas2d-export-drag-indicator");
    if (!(refs.dragIndicator instanceof HTMLDivElement)) {
      refs.dragIndicator = document.createElement("div");
      refs.dragIndicator.id = "canvas2d-export-drag-indicator";
      refs.dragIndicator.className = "canvas2d-export-drag-indicator is-hidden";
      refs.dragIndicator.setAttribute("aria-hidden", "true");
      refs.dragIndicator.innerHTML = `
        <span class="canvas2d-export-drag-icon"></span>
        <span class="canvas2d-export-drag-text">拖拽导出中</span>
      `;
      refs.surface.appendChild(refs.dragIndicator);
    }

    refs.fileImportInput = refs.surface.querySelector("#canvas2d-file-import");
    if (!(refs.fileImportInput instanceof HTMLInputElement)) {
      refs.fileImportInput = document.createElement("input");
      refs.fileImportInput.id = "canvas2d-file-import";
      refs.fileImportInput.className = "canvas2d-file-input";
      refs.fileImportInput.type = "file";
      refs.fileImportInput.multiple = true;
      refs.fileImportInput.style.display = "none";
      refs.fileImportInput.addEventListener("change", (event) => {
        const files = Array.from(event.target.files || []);
        if (files.length) {
          void importFiles(files, pendingImportAnchor || getCenterScenePoint());
        }
        pendingImportAnchor = null;
        event.target.value = "";
      });
      refs.surface.appendChild(refs.fileImportInput);
    }

    refs.imageImportInput = refs.surface.querySelector("#canvas2d-image-import");
    if (!(refs.imageImportInput instanceof HTMLInputElement)) {
      refs.imageImportInput = document.createElement("input");
      refs.imageImportInput.id = "canvas2d-image-import";
      refs.imageImportInput.className = "canvas2d-file-input";
      refs.imageImportInput.type = "file";
      refs.imageImportInput.accept = "image/*";
      refs.imageImportInput.multiple = true;
      refs.imageImportInput.style.display = "none";
      refs.imageImportInput.addEventListener("change", (event) => {
        const files = Array.from(event.target.files || []);
        if (files.length) {
          void importFiles(files, pendingImportAnchor || getCenterScenePoint());
        }
        pendingImportAnchor = null;
        event.target.value = "";
      });
      refs.surface.appendChild(refs.imageImportInput);
    }

    refs.richDisplayHost = refs.surface.querySelector("#canvas2d-rich-display");
    if (!(refs.richDisplayHost instanceof HTMLDivElement)) {
      refs.richDisplayHost = document.createElement("div");
      refs.richDisplayHost.id = "canvas2d-rich-display";
      refs.richDisplayHost.className = "canvas2d-rich-display";
      refs.surface.appendChild(refs.richDisplayHost);
    }
    if (RENDER_TEXT_IN_CANVAS) {
      refs.richDisplayHost.classList.add("is-hidden");
      refs.richDisplayHost.style.display = "none";
    }

    refs.mathDisplayHost = refs.surface.querySelector("#canvas2d-math-display");
    if (!(refs.mathDisplayHost instanceof HTMLDivElement)) {
      refs.mathDisplayHost = document.createElement("div");
      refs.mathDisplayHost.id = "canvas2d-math-display";
      refs.mathDisplayHost.className = "canvas2d-math-display";
      refs.mathDisplayHost.style.position = "absolute";
      refs.mathDisplayHost.style.inset = "0";
      refs.mathDisplayHost.style.pointerEvents = "none";
      refs.mathDisplayHost.style.zIndex = "15";
      refs.surface.appendChild(refs.mathDisplayHost);
    }
    refs.mathDisplayHost.classList.add("is-hidden");
    refs.mathDisplayHost.style.display = "none";
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.dataset.canvasMathOverlay = "1";
    }

    refs.richToolbar = refs.surface.querySelector("#canvas2d-rich-toolbar");
    if (!(refs.richToolbar instanceof HTMLDivElement)) {
      refs.richToolbar = document.createElement("div");
      refs.richToolbar.id = "canvas2d-rich-toolbar";
      refs.richToolbar.className = "canvas2d-rich-toolbar is-hidden";
      refs.richToolbar.innerHTML = `
        ${buildRichBlockTypeSelectHtml("block-type", "Markdown 语义块")}
        <button type="button" class="canvas2d-rich-btn" data-action="bold">B</button>
        <button type="button" class="canvas2d-rich-btn" data-action="italic"><em>I</em></button>
        <button type="button" class="canvas2d-rich-btn" data-action="strike"><s>S</s></button>
        <button type="button" class="canvas2d-rich-btn" data-action="highlight" title="高亮">HL</button>
        <button type="button" class="canvas2d-rich-btn" data-action="underline" title="下划线"><u>U</u></button>
        <button type="button" class="canvas2d-rich-btn" data-action="inline-code" title="行内代码">&lt;/&gt;</button>
        ${buildRichMathMenuHtml()}
        ${buildRichQuoteMenuHtml()}
        <button type="button" class="canvas2d-rich-btn" data-action="unordered-list" title="无序列表">•</button>
        <button type="button" class="canvas2d-rich-btn" data-action="ordered-list" title="有序列表">1.</button>
        <button type="button" class="canvas2d-rich-btn" data-action="task-list" title="任务列表">☐</button>
        <button type="button" class="canvas2d-rich-btn" data-action="horizontal-rule" title="分割线">—</button>
        <button type="button" class="canvas2d-rich-btn" data-action="link">🔗</button>
        <button type="button" class="canvas2d-rich-btn color-swatch" data-action="color" data-color="#0f172a" title="黑色"></button>
        <button type="button" class="canvas2d-rich-btn color-swatch" data-action="color" data-color="#dc2626" title="红色"></button>
        <button type="button" class="canvas2d-rich-btn color-swatch" data-action="color" data-color="#2563eb" title="蓝色"></button>
      `;
      refs.surface.appendChild(refs.richToolbar);
    }
    syncRichToolbarEnhancements(refs.richToolbar);

    refs.richSelectionToolbar = refs.surface.querySelector("#canvas2d-rich-selection-toolbar");
    if (!(refs.richSelectionToolbar instanceof HTMLDivElement)) {
      refs.richSelectionToolbar = document.createElement("div");
      refs.richSelectionToolbar.id = "canvas2d-rich-selection-toolbar";
      refs.richSelectionToolbar.className = "canvas2d-rich-toolbar canvas2d-rich-selection-toolbar is-hidden";
      refs.richSelectionToolbar.innerHTML = `
        ${buildRichBlockTypeSelectHtml("block-type", "块级语义")}
        <button type="button" class="canvas2d-rich-btn" data-action="bold" title="加粗">B</button>
        <button type="button" class="canvas2d-rich-btn" data-action="italic" title="斜体"><em>I</em></button>
        <button type="button" class="canvas2d-rich-btn" data-action="strike" title="删除线"><s>S</s></button>
        <button type="button" class="canvas2d-rich-btn" data-action="highlight" title="高亮">HL</button>
        <button type="button" class="canvas2d-rich-btn" data-action="underline" title="下划线"><u>U</u></button>
        <button type="button" class="canvas2d-rich-btn" data-action="inline-code" title="行内代码">&lt;/&gt;</button>
        ${buildRichMathMenuHtml()}
        ${buildRichQuoteMenuHtml()}
        <button type="button" class="canvas2d-rich-btn" data-action="unordered-list" title="无序列表">•</button>
        <button type="button" class="canvas2d-rich-btn" data-action="ordered-list" title="有序列表">1.</button>
        <button type="button" class="canvas2d-rich-btn" data-action="task-list" title="任务列表">☐</button>
        <button type="button" class="canvas2d-rich-btn" data-action="horizontal-rule" title="分割线">—</button>
        <button type="button" class="canvas2d-rich-btn color-swatch" data-action="color" data-color="#0f172a" title="黑色"></button>
        <button type="button" class="canvas2d-rich-btn color-swatch" data-action="color" data-color="#dc2626" title="红色"></button>
        <button type="button" class="canvas2d-rich-btn color-swatch" data-action="color" data-color="#2563eb" title="蓝色"></button>
        <button type="button" class="canvas2d-rich-btn" data-action="link" title="链接">🔗</button>
      `;
      refs.surface.appendChild(refs.richSelectionToolbar);
    }
    syncRichToolbarEnhancements(refs.richSelectionToolbar);

    refs.imageToolbar = lightImageEditor.mount(refs.surface);

    refs.ctx = refs.canvas.getContext("2d", { alpha: true });
    if (!refs.ctx) {
      throw new Error("无法获取 Canvas2D 上下文");
    }
  }

  function syncEditorLayout() {
    const hasEditing = Boolean(state.editingId);
    if (!hasEditing) {
      refs.editor?.classList.add("is-hidden");
      refs.richEditor?.classList.add("is-hidden");
      refs.richSelectionToolbar?.classList.add("is-hidden");
      refs.fileMemoEditor?.classList.add("is-hidden");
      refs.imageMemoEditor?.classList.add("is-hidden");
      refs.tableEditor?.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
      lastEditorItemId = null;
      lastFileMemoItemId = null;
      lastImageMemoItemId = null;
      lastTableEditItemId = null;
      lightImageEditor.finishEdit();
      richTextSession.clear({ destroyAdapter: false });
      return;
    }

    if (state.editingType === "file-memo") {
      syncFileMemoLayout();
      return;
    }
    if (state.editingType === "image-memo") {
      syncImageMemoLayout();
      return;
    }
    if (state.editingType === "image") {
      refs.editor?.classList.add("is-hidden");
      refs.richEditor?.classList.add("is-hidden");
      refs.fileMemoEditor?.classList.add("is-hidden");
      refs.imageMemoEditor?.classList.add("is-hidden");
      refs.tableEditor?.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
      return;
    }

    if (state.editingType === "table") {
      syncTableEditorLayout();
      return;
    }

    if (!(refs.richEditor instanceof HTMLDivElement)) {
      return;
    }
    const isFlowNode = state.editingType === "flow-node";
    const item = state.board.items.find(
      (entry) => entry.id === state.editingId && (isFlowNode ? entry.type === "flowNode" : entry.type === "text")
    );
    if (!item) {
      state.editingId = null;
      state.editingType = null;
      refs.richEditor.classList.add("is-hidden");
      richTextSession.clear({ destroyAdapter: false });
      return;
    }
    if (isFlowNode ? isLockedItem(item) : isLockedText(item)) {
      isFlowNode ? cancelFlowNodeEdit() : cancelTextEdit();
      return;
    }
    richTextSession.syncContent({
      itemId: item.id,
      html: normalizeRichHtmlInlineFontSizes(item.html || "", item.fontSize || richFontSize || DEFAULT_TEXT_FONT_SIZE),
      plainText: item.plainText || item.text || "",
      fontSize: item.fontSize || DEFAULT_TEXT_FONT_SIZE,
    });
    richFontSize = normalizeRichEditorFontSize(item.fontSize || DEFAULT_TEXT_FONT_SIZE, DEFAULT_TEXT_FONT_SIZE);
    syncRichTextFontSize();
    syncEditingRichEditorFrame(refs.richEditor, item, state.board.view);
    applyInlineFontSizingToContainer(refs.richEditor, state.board.view.scale);
    refs.editor?.classList.add("is-hidden");
    refs.richEditor.classList.remove("is-hidden");
    syncRichTextToolbar();
  }

  function getActiveRichEditingItem() {
    if (!state.editingId || (state.editingType !== "text" && state.editingType !== "flow-node")) {
      return null;
    }
    return (
      state.board.items.find(
        (entry) => entry.id === state.editingId && (entry.type === "text" || entry.type === "flowNode")
      ) || null
    );
  }

  function getRichTextSelectionState() {
    const editingItem = getActiveRichEditingItem();
    const snapshot = richTextSession.getSelectionSnapshot() || null;
    const hasExpandedSelection = Boolean(
      editingItem &&
        snapshot?.inside &&
        !snapshot?.collapsed &&
        snapshot?.rect &&
        Number(snapshot.rect.width || 0) >= 0 &&
        Number(snapshot.rect.height || 0) >= 0
    );
    return {
      editingItem,
      snapshot,
      hasExpandedSelection,
      formatState: richTextSession.getFormatState() || {},
    };
  }

function syncRichToolbarButtons(toolbar, formatState = {}, { editingItem = null } = {}) {
  if (!(toolbar instanceof HTMLDivElement)) {
    return;
  }
  toolbar.querySelectorAll(".canvas2d-rich-btn").forEach((button) => {
    const action = button.getAttribute("data-action");
    if (action === "bold") {
      button.classList.toggle("is-active", Boolean(formatState.bold));
      } else if (action === "italic") {
        button.classList.toggle("is-active", Boolean(formatState.italic));
      } else if (action === "strike") {
        button.classList.toggle("is-active", Boolean(formatState.strike));
      } else if (action === "inline-code") {
        button.classList.toggle("is-active", Boolean(formatState.inlineCode));
      } else if (action === "highlight") {
        button.classList.toggle("is-active", Boolean(formatState.highlight));
      } else if (action === "unordered-list") {
        button.classList.toggle("is-active", Boolean(formatState.unorderedList));
      } else if (action === "ordered-list") {
        button.classList.toggle("is-active", Boolean(formatState.orderedList));
      } else if (action === "task-list") {
        button.classList.toggle("is-active", Boolean(formatState.taskList));
      } else if (action === "blockquote") {
        button.classList.toggle("is-active", formatState.blockType === "blockquote");
      } else if (action === "horizontal-rule") {
        button.classList.toggle("is-active", formatState.blockType === "horizontal-rule");
      } else if (action === "underline") {
        button.classList.toggle("is-active", Boolean(formatState.underline));
      }
    });
  toolbar.querySelectorAll(".canvas2d-rich-submenu").forEach((submenu) => {
    if (!(submenu instanceof HTMLElement)) {
      return;
    }
    const submenuType = String(submenu.getAttribute("data-submenu") || "").trim().toLowerCase();
    const isActive =
      submenuType === "blockquote"
        ? formatState.blockType === "blockquote"
        : submenuType === "math"
          ? Boolean(formatState.canEditMath)
          : false;
    submenu.classList.toggle("is-active", isActive);
  });
  toolbar.querySelectorAll('[data-action="block-type"]').forEach((input) => {
    if (!(input instanceof HTMLSelectElement)) {
      return;
    }
      const value = String(formatState.blockType || "paragraph");
      input.value = /^heading-[1-6]$/.test(value) || value === "paragraph" ? value : "paragraph";
    });
  }

  function getRichSelectionFontSizeControl() {
    return refs.richSelectionToolbar?.querySelector?.("[data-size-control]") || null;
  }

  function centerActiveRichSelectionFontSizePreset() {
    const control = getRichSelectionFontSizeControl();
    if (!(control instanceof HTMLElement) || !control.classList.contains("is-open")) {
      return;
    }
    const container = control.querySelector('[data-role="font-size-presets"]');
    const activePreset = control.querySelector('[data-action="font-size-preset"].is-active');
    if (!(container instanceof HTMLElement) || !(activePreset instanceof HTMLElement)) {
      return;
    }
    const targetTop =
      activePreset.offsetTop - Math.max(0, Math.round((container.clientHeight - activePreset.offsetHeight) / 2));
    container.scrollTop = Math.max(0, targetTop);
  }

function closeRichSelectionFontSizePanel() {
  const control = getRichSelectionFontSizeControl();
  if (!(control instanceof HTMLElement)) {
    return;
  }
    control.classList.remove("is-open");
    control.querySelectorAll('[data-role="font-size-panel"]').forEach((panel) => panel.classList.add("is-hidden"));
  }

  function toggleRichSelectionFontSizePanel(force) {
    const control = getRichSelectionFontSizeControl();
    if (!(control instanceof HTMLElement)) {
      return;
    }
    const nextOpen = typeof force === "boolean" ? force : !control.classList.contains("is-open");
    control.classList.toggle("is-open", nextOpen);
    control.querySelectorAll('[data-role="font-size-panel"]').forEach((panel) =>
      panel.classList.toggle("is-hidden", !nextOpen)
    );
    if (nextOpen) {
      requestAnimationFrame(() => centerActiveRichSelectionFontSizePreset());
  }
}

function getRichToolbarSubmenuRoots() {
  const toolbars = [refs.richToolbar, refs.richSelectionToolbar].filter((entry) => entry instanceof HTMLDivElement);
  return toolbars.flatMap((toolbar) => Array.from(toolbar.querySelectorAll(".canvas2d-rich-submenu")));
}

function closeRichToolbarSubmenus({ except = null } = {}) {
  getRichToolbarSubmenuRoots().forEach((submenu) => {
    if (!(submenu instanceof HTMLElement)) {
      return;
    }
    const shouldKeepOpen = except instanceof HTMLElement && submenu === except;
    submenu.classList.toggle("is-open", shouldKeepOpen);
    const panel = submenu.querySelector(".canvas2d-rich-submenu-panel");
    const toggle = submenu.querySelector(".canvas2d-rich-submenu-toggle");
    if (panel instanceof HTMLElement) {
      panel.classList.toggle("is-hidden", !shouldKeepOpen);
      panel.style.display = shouldKeepOpen ? "flex" : "none";
    }
    if (toggle instanceof HTMLElement) {
      toggle.setAttribute("aria-expanded", shouldKeepOpen ? "true" : "false");
    }
  });
}

function toggleRichToolbarSubmenu(submenu) {
  if (!(submenu instanceof HTMLElement)) {
    return;
  }
  const nextOpen = !submenu.classList.contains("is-open");
  closeRichToolbarSubmenus({ except: nextOpen ? submenu : null });
}

function syncRichToolbarEnhancements(toolbar) {
  if (!(toolbar instanceof HTMLDivElement)) {
    return;
  }
  toolbar.querySelectorAll(".canvas2d-rich-submenu").forEach((submenu) => {
    if (!(submenu instanceof HTMLElement)) {
      return;
    }
    submenu.style.position = "relative";
    submenu.style.display = "inline-flex";
    submenu.style.alignItems = "center";
    submenu.style.gap = "4px";
    const panel = submenu.querySelector(".canvas2d-rich-submenu-panel");
    if (panel instanceof HTMLElement) {
      panel.style.position = "absolute";
      panel.style.top = "calc(100% + 8px)";
      panel.style.left = "0";
      panel.style.display = panel.classList.contains("is-hidden") ? "none" : "flex";
      panel.style.flexDirection = "column";
      panel.style.gap = "4px";
      panel.style.padding = "8px";
      panel.style.minWidth = "92px";
      panel.style.borderRadius = "12px";
      panel.style.background = "rgba(255,255,255,0.98)";
      panel.style.border = "1px solid rgba(203, 213, 225, 0.9)";
      panel.style.boxShadow = "0 12px 24px rgba(15, 23, 42, 0.16)";
      panel.style.zIndex = "4";
    }
    const toggle = submenu.querySelector(".canvas2d-rich-submenu-toggle");
    if (toggle instanceof HTMLElement) {
      toggle.style.minWidth = "28px";
      toggle.style.paddingInline = "8px";
    }
  });
}

  function getActiveRichSelectionFontSize() {
    const input = refs.richSelectionToolbar?.querySelector?.('[data-action="selection-font-size-input"]');
    if (input instanceof HTMLInputElement) {
      const value = Number(input.value || 0);
      if (Number.isFinite(value) && value > 0) {
        return Math.max(8, Math.round(value));
      }
    }
    const label = refs.richSelectionToolbar?.querySelector?.('[data-role="font-size-label"]');
    if (label instanceof HTMLElement) {
      const value = Number(label.textContent || 0);
      if (Number.isFinite(value) && value > 0) {
        return Math.max(8, Math.round(value));
      }
    }
    const formatState = richTextSession.getFormatState() || {};
    const logicalValue =
      (Number(formatState.fontSize || 0) || Math.max(8, Number(richFontSize || 16) || 16)) /
      Math.max(0.1, Number(state.board.view?.scale || 1));
    return Math.max(8, Math.round(logicalValue || 16));
  }

  function applyRichSelectionFontSize(nextSize) {
    const value = Math.max(8, Math.round(Number(nextSize || 0) || 0));
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    const renderedSize =
      value * Math.max(0.1, Number(state.board.view?.scale || 1));
    applyRichTextCommand("fontSize", {
      logicalSize: value,
      renderedSize,
    });
  }

  function stepRichSelectionFontSize(delta) {
    const current = getActiveRichSelectionFontSize();
    applyRichSelectionFontSize(current + delta);
  }

  function applyRichSelectionFontSizeFromInput(input) {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const value = Number(input.value || 0);
    if (value > 0) {
      applyRichSelectionFontSize(value);
    }
  }

  function positionRichSelectionToolbar(toolbar, { rect = null, point = null } = {}) {
    if (!(toolbar instanceof HTMLDivElement) || !(refs.surface instanceof HTMLDivElement)) {
      return;
    }
    const hostRect = refs.surface.getBoundingClientRect();
    const margin = 8;
    const gap = 10;
    const width = Math.max(1, toolbar.offsetWidth || toolbar.getBoundingClientRect().width || 0);
    const height = Math.max(1, toolbar.offsetHeight || toolbar.getBoundingClientRect().height || 0);
    let anchorCenterX = hostRect.width / 2;
    let anchorTop = margin;
    let anchorBottom = margin;
    let preferBelow = false;
    if (point) {
      anchorCenterX = Number(point.clientX || 0) - hostRect.left;
      anchorTop = Number(point.clientY || 0) - hostRect.top;
      anchorBottom = anchorTop;
      preferBelow = true;
    } else if (rect) {
      anchorCenterX = ((Number(rect.left || 0) + Number(rect.right || 0)) / 2) - hostRect.left;
      anchorTop = Number(rect.top || 0) - hostRect.top;
      anchorBottom = Number(rect.bottom || 0) - hostRect.top;
    }
    let left = Math.round(anchorCenterX - width / 2);
    let top = Math.round(anchorTop - height - gap);
    if (preferBelow || top < margin) {
      top = Math.round(anchorBottom + gap);
    }
    const maxLeft = Math.max(margin, hostRect.width - width - margin);
    const maxTop = Math.max(margin, hostRect.height - height - margin);
    left = Math.max(margin, Math.min(left, maxLeft));
    top = Math.max(margin, Math.min(top, maxTop));
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }

  function syncRichTextToolbar(options = {}) {
    if (!(refs.richToolbar instanceof HTMLDivElement)) {
      return;
    }
    if (!(refs.richSelectionToolbar instanceof HTMLDivElement)) {
      return;
    }
    if (!isInteractiveMode()) {
      refs.richToolbar.classList.add("is-hidden");
      refs.richSelectionToolbar.classList.add("is-hidden");
      closeRichSelectionFontSizePanel();
      return;
    }
    const { editingItem, snapshot, hasExpandedSelection, formatState } = getRichTextSelectionState();
    const shouldShow = state.tool === "text" || Boolean(editingItem);
    if (!shouldShow || !refs.surface) {
      refs.richToolbar.classList.add("is-hidden");
      refs.richSelectionToolbar.classList.add("is-hidden");
      closeRichSelectionFontSizePanel();
      return;
    }
    refs.richToolbar.classList.remove("is-hidden");
    syncFloatingToolbarLayout(refs.richToolbar, refs.surface, {
      minScale: 0.72,
      hardMinScale: 0.56,
      preferAboveZoom: false,
      gap: 14,
      margin: 8,
    });
    if (!editingItem) {
      refs.richToolbar.querySelectorAll(".canvas2d-rich-btn").forEach((button) => {
        button.classList.remove("is-active");
      });
      refs.richToolbar.querySelectorAll('[data-action="preset"]').forEach((input) => {
        if (input instanceof HTMLSelectElement) {
          input.value = "body";
        }
      });
      refs.richSelectionToolbar.classList.add("is-hidden");
      closeRichSelectionFontSizePanel();
      return;
    }
    syncRichToolbarButtons(refs.richToolbar, formatState, { editingItem });
    syncRichToolbarButtons(refs.richSelectionToolbar, formatState, { editingItem });
    if (hasExpandedSelection) {
      refs.richSelectionToolbar.classList.remove("is-hidden");
      positionRichSelectionToolbar(refs.richSelectionToolbar, {
        rect: snapshot?.rect || null,
        point: options?.point || null,
      });
    } else {
      refs.richSelectionToolbar.classList.add("is-hidden");
      closeRichSelectionFontSizePanel();
    }
  }

  function syncRichTextFontSize() {
    if (!(refs.richToolbar instanceof HTMLDivElement)) {
      return;
    }
    const value = String(normalizeRichEditorFontSize(richFontSize || 20, 20));
    refs.richToolbar.querySelectorAll('[data-action="font-size"]').forEach((input) => {
      if (input instanceof HTMLInputElement && input.value !== value) {
        input.value = value;
      }
    });
  }

  function syncEditingTextItemSize(item) {
    if (!item || item.type !== "text" || !(refs.richEditor instanceof HTMLDivElement)) {
      return false;
    }
    const beforeSignature = getRichEditableItemSignature(item);
    const html = normalizeRichHtmlInlineFontSizes(
      richTextSession.getHTML() || refs.richEditor.innerHTML || "",
      item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_TEXT_FONT_SIZE)
    );
    const content = normalizeEditedRichTextContent(
      item,
      html,
      item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_TEXT_FONT_SIZE)
    );
    const plainText = content.plainText;
    const canonicalHtml = normalizeRichHtmlInlineFontSizes(
      getCanonicalRichTextHtml(content, html),
      item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_TEXT_FONT_SIZE)
    );
    const layoutConfig = resolveEditedTextLayoutConfig(
      item,
      { ...content, html: canonicalHtml },
      item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_TEXT_FONT_SIZE)
    );
    const layoutMode = layoutConfig.layoutMode;
    const measureItem = {
      ...item,
      width: layoutConfig.widthHint,
      height: layoutConfig.heightHint,
      textBoxLayoutMode: layoutMode,
      textResizeMode: layoutConfig.resizeMode,
    };
    const nextSize = getEditingTextBoxMetrics(refs.richEditor, measureItem, state.board.view, plainText);
    item.html = canonicalHtml;
    item.plainText = plainText;
    item.text = plainText;
    item.richTextDocument = content.richTextDocument;
    const semanticState = syncTextLinkSemanticFields(item, plainText, content.richTextDocument, {
      semanticEnabled: linkSemanticEnabled,
    });
    if (semanticState?.linkTokens?.length) {
      scheduleUrlMetaHydrationForItem(item);
    }
    item.title = buildTextTitle(plainText || "文本");
    item.textBoxLayoutMode = layoutMode;
    item.textResizeMode = layoutConfig.resizeMode;
    if (layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH) {
      item.width = Math.max(80, Math.ceil(Number(nextSize?.width || 0) || 80));
      item.height = Math.max(40, Math.ceil(Number(nextSize?.height || 0) || 40));
    } else if (layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT) {
      item.width = Math.max(80, Math.ceil(Number(layoutConfig.widthHint || item.width || 0) || 80));
      item.height = Math.max(40, Math.ceil(Number(nextSize?.height || 0) || 40));
    } else {
      item.width = Math.max(
        80,
        Math.ceil(Number(layoutConfig.widthHint || item.width || 0) || Number(nextSize?.width || 0) || 80)
      );
      item.height = Math.max(
        40,
        Math.ceil(Number(layoutConfig.heightHint || item.height || 0) || Number(nextSize?.height || 0) || 40)
      );
    }
    syncEditingRichEditorFrame(refs.richEditor, item, state.board.view);
    return beforeSignature !== getRichEditableItemSignature(item);
  }

  function syncEditingFlowNodeState(item) {
    if (!item || item.type !== "flowNode" || !(refs.richEditor instanceof HTMLDivElement)) {
      return false;
    }
    const beforeSignature = getRichEditableItemSignature(item);
    const html = normalizeRichHtmlInlineFontSizes(
      richTextSession.getHTML() || refs.richEditor.innerHTML || "",
      item.fontSize || resolveSessionFontSize(richTextSession, 18)
    );
    const content = ensureRichTextDocumentFields(
      {
        ...item,
        html,
        plainText: htmlToPlainText(html),
      },
      {
        fontSize: item.fontSize || resolveSessionFontSize(richTextSession, 18),
      }
    );
    const plainText = content.plainText;
    item.html = content.html;
    item.plainText = plainText;
    item.richTextDocument = content.richTextDocument;
    item.fontSize = normalizeRichEditorFontSize(item.fontSize || resolveSessionFontSize(richTextSession, 18), 18);
    const minNodeSize = getFlowNodeMinSize(item, { widthHint: item.width });
    item.width = Math.max(Number(item.width || 0) || 0, minNodeSize.width);
    item.height = Math.max(Number(item.height || 0) || 0, minNodeSize.height);
    syncEditingRichEditorFrame(refs.richEditor, item, state.board.view);
    return beforeSignature !== getRichEditableItemSignature(item);
  }

  function syncActiveRichEditingItemState({ emit = true, refreshToolbar = true, markDirty = true } = {}) {
    const item = getActiveRichEditingItem();
    if (!item) {
      return null;
    }
    let changed = false;
    if (item.type === "text") {
      changed = syncEditingTextItemSize(item);
    } else if (item.type === "flowNode") {
      changed = syncEditingFlowNodeState(item);
    }
    if (emit && changed) {
      syncBoard({ persist: false, emit: true });
    } else {
      scheduleRender();
    }
    if (markDirty && changed) {
      markBoardDirty();
    }
    if (refreshToolbar) {
      requestAnimationFrame(() => syncRichTextToolbar());
    }
    return {
      item,
      changed,
    };
  }

  function syncActiveDraftEditingState({ markDirty = true } = {}) {
    if (state.editingType === "text" || state.editingType === "flow-node") {
      return syncActiveRichEditingItemState({
        emit: false,
        refreshToolbar: false,
        markDirty,
      });
    }
    if (state.editingType === "file-memo" && state.editingId && refs.fileMemoEditor instanceof HTMLTextAreaElement) {
      const item = state.board.items.find((entry) => entry.id === state.editingId && entry.type === "fileCard");
      if (!item) {
        return null;
      }
      const nextMemo = sanitizeText(refs.fileMemoEditor.value || "");
      if (item.memo !== nextMemo) {
        item.memo = nextMemo;
        if (markDirty) {
          markBoardDirty();
        }
      }
      scheduleRender();
      return item;
    }
    if (state.editingType === "image-memo" && state.editingId && refs.imageMemoEditor instanceof HTMLTextAreaElement) {
      const item = state.board.items.find((entry) => entry.id === state.editingId && entry.type === "image");
      if (!item) {
        return null;
      }
      const nextMemo = sanitizeText(refs.imageMemoEditor.value || "");
      if (item.memo !== nextMemo) {
        item.memo = nextMemo;
        if (markDirty) {
          markBoardDirty();
        }
      }
      scheduleRender();
      return item;
    }
    return null;
  }

  function syncImageToolbar() {
    if (!refs.surface) {
      return;
    }
    if (state.editingType === "image" && state.editingId && !getImageItemById(state.editingId)) {
      finishImageEdit();
    }
    lightImageEditor.syncToolbarLayout({
      surface: refs.surface,
      isInteractive: isInteractiveMode(),
    });
  }

  function syncRichTextOverlays() {
    if (!(refs.richDisplayHost instanceof HTMLDivElement)) {
      return;
    }
    if (!isInteractiveMode()) {
      refs.richDisplayHost.classList.add("is-hidden");
      return;
    }
    if (RENDER_TEXT_IN_CANVAS) {
      refs.richDisplayHost.classList.add("is-hidden");
      refs.richDisplayHost.style.display = "none";
      if (richDisplayMap.size) {
        richDisplayMap.forEach((node) => node.remove());
        richDisplayMap.clear();
      }
      return;
    }
    const items = state.board.items.filter((item) => item.type === "text" || item.type === "flowNode");
    if (!items.length) {
      refs.richDisplayHost.classList.add("is-hidden");
      return;
    }
    refs.richDisplayHost.classList.remove("is-hidden");

    const scale = Math.max(0.1, Number(state.board.view.scale || 1));
    const offsetX = Number(state.board.view.offsetX || 0);
    const offsetY = Number(state.board.view.offsetY || 0);
    const scaleBucket = getRichOverlayScaleBucket(scale);
    const editingId = state.editingId;
    const viewportBounds = getRichOverlayViewportBounds(
      refs.surface,
      refs.canvas?.clientWidth || refs.canvas?.width || 0,
      refs.canvas?.clientHeight || refs.canvas?.height || 0
    );

    const activeIds = new Set(items.map((item) => item.id));
    const visibleItems = [];
    let textLayoutWritebackChanged = false;
    items.forEach((item) => {
      const left = Number(item.x || 0) * scale + offsetX;
      const top = Number(item.y || 0) * scale + offsetY;
      const width = Math.max(1, Number(item.width || 1)) * scale;
      const height = Math.max(1, Number(item.height || 1)) * scale;
      if (!hasScreenRectIntersection({ left, top, right: left + width, bottom: top + height }, viewportBounds)) {
        const node = richDisplayMap.get(item.id);
        if (node) {
          setStyleIfNeeded(node, "display", "none");
        }
        return;
      }
      visibleItems.push({
        item,
        left,
        top,
        width,
        height,
      });
    });

    for (const [id, node] of richDisplayMap.entries()) {
      if (!activeIds.has(id)) {
        node.remove();
        richDisplayMap.delete(id);
      }
    }

    visibleItems.forEach(({ item, left, top, width, height }) => {
      if (editingId && editingId === item.id) {
        const existing = richDisplayMap.get(item.id);
        if (existing) {
          setStyleIfNeeded(existing, "display", "none");
        }
        return;
      }
      let node = richDisplayMap.get(item.id);
      if (!node) {
        node = document.createElement("div");
        node.className = "canvas2d-rich-item";
        node.dataset.id = item.id;
        refs.richDisplayHost.appendChild(node);
        richDisplayMap.set(item.id, node);
      }
      const classSignature = getRichOverlayClassSignature(item);
      if (node.dataset.classSignature !== classSignature) {
        node.classList.toggle("is-flow-node", item.type === "flowNode");
        node.classList.toggle("is-wrap-mode", isWrapTextItem(item));
        node.classList.toggle("is-fixed-size", isFixedSizeTextItem(item));
        node.classList.remove("is-locked");
        node.dataset.classSignature = classSignature;
      }

      const fontSize = Math.max(12, Number(item.fontSize || 18)) * scale;
      const padding = item.type === "flowNode" ? getFlowNodeTextPadding(scale, { width, height }) : { x: 0, y: 0 };
      const lineHeightRatio = item.type === "flowNode" ? FLOW_NODE_TEXT_LAYOUT.lineHeightRatio : TEXT_LINE_HEIGHT_RATIO;
      const linkSignature = item.type === "text" ? getLinkSemanticSignature(item) : "";
      const html = normalizeRichHtmlInlineFontSizes(
        resolveRichTextDisplayHtml({
          text: item.plainText || item.text || "",
          html: item.html || "",
          linkTokens: item.linkTokens || [],
        }),
        item.fontSize || DEFAULT_TEXT_FONT_SIZE
      );
      let contentMutated = false;
      if (html.trim()) {
        if (node.dataset.html !== html) {
          node.innerHTML = html;
          node.dataset.html = html;
          node.dataset.text = "";
          contentMutated = true;
        }
        if (item.type === "text" && (contentMutated || node.dataset.linkSignature !== linkSignature)) {
          applyLinkSemanticsToRichDisplayNode(node, item);
          node.dataset.linkSignature = linkSignature;
        }
        if (contentMutated || node.dataset.inlineScaleBucket !== scaleBucket) {
          applyInlineFontSizingToContainer(node, scale);
          node.dataset.inlineScaleBucket = scaleBucket;
        }
        if (contentMutated) {
          applyRichTypographyTokens(node);
        }
      } else {
        const text = item.plainText || item.text || "";
        if (node.dataset.text !== text) {
          node.textContent = text;
          node.dataset.text = text;
          node.dataset.html = "";
          node.dataset.inlineScaleBucket = "";
          node.dataset.linkSignature = "";
          contentMutated = true;
        }
      }
      setStyleIfNeeded(node, "display", "block");
      const boxStyles = getRichOverlayBoxStyles(item, scale);
      const fontWeight = item.type === "flowNode" ? FLOW_NODE_TEXT_LAYOUT.fontWeight : TEXT_FONT_WEIGHT;
      const styleSignature = getRichOverlayStyleSignature({
        left,
        top,
        fontSize,
        paddingX: padding.x,
        paddingY: padding.y,
        lineHeightRatio,
        fontWeight,
        color: item.color || "#0f172a",
        widthCss: boxStyles.widthCss,
        heightCss: boxStyles.heightCss,
        minHeightCss: boxStyles.minHeightCss,
        maxWidthCss: boxStyles.maxWidthCss,
        display: boxStyles.display,
        whiteSpace: boxStyles.whiteSpace,
        wordBreak: boxStyles.wordBreak,
        overflowWrap: boxStyles.overflowWrap,
        overflow: boxStyles.overflow,
      });
      if (node.dataset.styleSignature !== styleSignature) {
        setStyleIfNeeded(node, "left", `${left}px`);
        setStyleIfNeeded(node, "top", `${top}px`);
        setStyleIfNeeded(node, "display", boxStyles.display);
        setStyleIfNeeded(node, "width", boxStyles.widthCss);
        setStyleIfNeeded(node, "height", boxStyles.heightCss);
        setStyleIfNeeded(node, "minHeight", boxStyles.minHeightCss);
        setStyleIfNeeded(node, "maxWidth", boxStyles.maxWidthCss);
        setStyleIfNeeded(node, "fontSize", `${fontSize}px`);
        setStyleIfNeeded(node, "fontFamily", TEXT_FONT_FAMILY);
        setStyleIfNeeded(node, "padding", `${padding.y}px ${padding.x}px`);
        setStyleIfNeeded(node, "lineHeight", String(lineHeightRatio));
        setStyleIfNeeded(node, "fontWeight", fontWeight);
        setStyleIfNeeded(node, "color", item.color || "#0f172a");
        setStyleIfNeeded(node, "whiteSpace", boxStyles.whiteSpace);
        setStyleIfNeeded(node, "wordBreak", boxStyles.wordBreak);
        setStyleIfNeeded(node, "overflowWrap", boxStyles.overflowWrap);
        setStyleIfNeeded(node, "overflow", boxStyles.overflow);
        node.dataset.styleSignature = styleSignature;
      }
      if (item.type === "text") {
        const writebackSignature = getAutoSizedTextWritebackSignature(item, html);
        if (node.dataset.layoutWritebackSignature !== writebackSignature) {
          node.dataset.layoutWritebackSignature = writebackSignature;
          if (maybeWritebackTextOverlayFrame(item, node, scale)) {
            textLayoutWritebackChanged = true;
          }
        }
      }
    });
    if (textLayoutWritebackChanged) {
      invalidateHitTestSpatialIndex(state.board.items);
      syncBoard({ persist: false, emit: true, markDirty: false });
    }
  }

  function syncMathOverlays() {
    if (!(refs.mathDisplayHost instanceof HTMLDivElement)) {
      return;
    }
    if (!isInteractiveMode()) {
      refs.mathDisplayHost.classList.add("is-hidden");
      refs.mathDisplayHost.style.display = "none";
      if (mathDisplayMap.size) {
        mathDisplayMap.forEach((node) => node.remove());
        mathDisplayMap.clear();
      }
      return;
    }

    const items = state.board.items.filter((item) => item.type === "mathBlock" || item.type === "mathInline");
    if (!items.length) {
      refs.mathDisplayHost.classList.add("is-hidden");
      refs.mathDisplayHost.style.display = "none";
      if (mathDisplayMap.size) {
        mathDisplayMap.forEach((node) => node.remove());
        mathDisplayMap.clear();
      }
      return;
    }

    refs.mathDisplayHost.classList.remove("is-hidden");
    refs.mathDisplayHost.style.display = "block";
    const scale = Math.max(0.1, Number(state.board.view.scale || 1));
    const offsetX = Number(state.board.view.offsetX || 0);
    const offsetY = Number(state.board.view.offsetY || 0);
    const viewportBounds = getRichOverlayViewportBounds(
      refs.surface,
      refs.canvas?.clientWidth || refs.canvas?.width || 0,
      refs.canvas?.clientHeight || refs.canvas?.height || 0
    );
    const activeIds = new Set(items.map((item) => item.id));
    let mathLayoutWritebackChanged = false;

    for (const [id, node] of mathDisplayMap.entries()) {
      if (!activeIds.has(id)) {
        node.remove();
        mathDisplayMap.delete(id);
      }
    }

    items.forEach((item) => {
      const left = Number(item.x || 0) * scale + offsetX;
      const top = Number(item.y || 0) * scale + offsetY;
      const width = Math.max(1, Number(item.width || 1)) * scale;
      const height = Math.max(1, Number(item.height || 1)) * scale;
      if (!hasScreenRectIntersection({ left, top, right: left + width, bottom: top + height }, viewportBounds)) {
        const hiddenNode = mathDisplayMap.get(item.id);
        if (hiddenNode) {
          setStyleIfNeeded(hiddenNode, "display", "none");
        }
        return;
      }

      let node = mathDisplayMap.get(item.id);
      if (!node) {
        node = document.createElement("div");
        node.className = "canvas2d-math-item";
        node.dataset.id = item.id;
        refs.mathDisplayHost.appendChild(node);
        mathDisplayMap.set(item.id, node);
      }

      const displayMode = item.displayMode !== false;
      const katexReady = Boolean(globalThis?.katex && typeof globalThis.katex.renderToString === "function");
      const shouldRetryRender = item.mathOverlayReady !== true && katexReady;
      const markup = renderMathMarkup(item.formula || "", { displayMode });
      const stateToken = normalizeMathRenderState(item);
      const fallbackText = String(item.fallbackText || item.formula || "").trim() || (displayMode ? "[公式]" : "[行内公式]");
      const contentSignature = getMathOverlaySignature(item);
      if (node.dataset.contentSignature !== contentSignature || shouldRetryRender) {
        if (markup && hasRenderedKatexMarkup(markup)) {
          node.innerHTML = markup;
          item.renderState = "ready";
          item.mathOverlayReady = true;
        } else {
          node.innerHTML = markup || "";
          if (!markup) {
            node.textContent = fallbackText;
          }
          item.renderState = stateToken === "error" ? "error" : "fallback";
          item.mathOverlayReady = false;
        }
        node.dataset.contentSignature = contentSignature;
      }

      const { fontSize, paddingX, paddingY } = getMathOverlayTypography(item, scale);
      setStyleIfNeeded(node, "display", displayMode ? "block" : "inline-flex");
      const styleSignature = getMathOverlayStyleSignature({ left, top, fontSize, paddingX, paddingY });
      if (node.dataset.styleSignature !== styleSignature) {
        setStyleIfNeeded(node, "position", "absolute");
        setStyleIfNeeded(node, "left", `${left}px`);
        setStyleIfNeeded(node, "top", `${top}px`);
        setStyleIfNeeded(node, "padding", `${paddingY}px ${paddingX}px`);
        setStyleIfNeeded(node, "fontSize", `${fontSize}px`);
        setStyleIfNeeded(node, "lineHeight", displayMode ? "normal" : "1.1");
        setStyleIfNeeded(node, "alignItems", "center");
        setStyleIfNeeded(node, "justifyContent", displayMode ? "center" : "flex-start");
        setStyleIfNeeded(node, "whiteSpace", displayMode ? "normal" : "nowrap");
        setStyleIfNeeded(node, "color", "rgba(15, 23, 42, 0.96)");
        node.dataset.styleSignature = styleSignature;
      }

      if (node.dataset.layoutWritebackSignature !== contentSignature) {
        node.dataset.layoutWritebackSignature = contentSignature;
      }
      if (maybeWritebackMathOverlayFrame(item, node, scale)) {
        mathLayoutWritebackChanged = true;
      }
    });

    if (mathLayoutWritebackChanged) {
      invalidateHitTestSpatialIndex(state.board.items);
      syncBoard({ persist: false, emit: true, markDirty: false });
    }
  }

  function beginTextEdit(itemId) {
    const item = state.board.items.find((entry) => entry.id === itemId && entry.type === "text");
    if (!item || !(refs.richEditor instanceof HTMLDivElement)) {
      return false;
    }
    if (isLockedText(item)) {
      setStatus("文本已锁定，无法编辑");
      return false;
    }
    finishImageEdit();
    cancelFlowNodeEdit();
    if (!editBaselineSnapshot) {
      editBaselineSnapshot = takeHistorySnapshot(state);
    }
    state.editingId = item.id;
    state.editingType = "text";
    state.board.selectedIds = [item.id];
    richTextSession.begin({
      itemId: item.id,
      itemType: "text",
      html: item.html || "",
      plainText: item.plainText || item.text || "",
      fontSize: item.fontSize || DEFAULT_TEXT_FONT_SIZE,
      baselineSnapshot: editBaselineSnapshot,
    });
    richFontSize = normalizeRichEditorFontSize(item.fontSize || DEFAULT_TEXT_FONT_SIZE, DEFAULT_TEXT_FONT_SIZE);
    syncRichTextFontSize();
    syncEditingRichEditorFrame(refs.richEditor, item, state.board.view);
    applyInlineFontSizingToContainer(refs.richEditor, state.board.view.scale);
    refs.richEditor.classList.remove("is-hidden");
    refs.editor?.classList.add("is-hidden");
    syncBoard({ persist: false, emit: true });
    requestAnimationFrame(() => {
      richTextSession.focus();
      syncRichTextToolbar();
    });
    return true;
  }

  function beginFlowNodeEdit(itemId) {
    const item = state.board.items.find((entry) => entry.id === itemId && entry.type === "flowNode");
    if (!item || !(refs.richEditor instanceof HTMLDivElement)) {
      return false;
    }
    if (isLockedItem(item)) {
      setStatus("节点已锁定，无法编辑");
      return false;
    }
    finishImageEdit();
    cancelFileMemoEdit();
    cancelImageMemoEdit();
    if (!editBaselineSnapshot) {
      editBaselineSnapshot = takeHistorySnapshot(state);
    }
    state.editingId = item.id;
    state.editingType = "flow-node";
    state.board.selectedIds = [item.id];
    richTextSession.begin({
      itemId: item.id,
      itemType: "flow-node",
      html: normalizeRichHtmlInlineFontSizes(item.html || "", item.fontSize || resolveSessionFontSize(richTextSession, 18)),
      plainText: item.plainText || "",
      fontSize: item.fontSize || 18,
      baselineSnapshot: editBaselineSnapshot,
    });
    richFontSize = normalizeRichEditorFontSize(item.fontSize || 18, 18);
    syncRichTextFontSize();
    syncEditingRichEditorFrame(refs.richEditor, item, state.board.view);
    applyInlineFontSizingToContainer(refs.richEditor, state.board.view.scale);
    refs.richEditor.classList.remove("is-hidden");
    refs.editor?.classList.add("is-hidden");
    syncBoard({ persist: false, emit: true });
    requestAnimationFrame(() => {
      richTextSession.focus();
      syncRichTextToolbar();
    });
    return true;
  }

  function commitTextEdit() {
    if (!state.editingId || state.editingType !== "text") {
      return false;
    }
    const item = state.board.items.find((entry) => entry.id === state.editingId && entry.type === "text");
    if (!item || !(refs.richEditor instanceof HTMLDivElement)) {
      state.editingId = null;
      state.editingType = null;
      refs.richEditor?.classList.add("is-hidden");
      richTextSession.clear({ destroyAdapter: false });
      if (state.tool === "text" && shouldExitTextToolAfterEdit) {
        shouldExitTextToolAfterEdit = false;
        setTool("select");
      }
      return false;
    }
    const before = editBaselineSnapshot || richTextSession.getBaselineSnapshot() || takeHistorySnapshot(state);
    const html = normalizeRichHtmlInlineFontSizes(
      richTextSession.getHTML() || refs.richEditor.innerHTML || "",
      item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_TEXT_FONT_SIZE)
    );
    const content = normalizeEditedRichTextContent(
      item,
      html,
      item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_TEXT_FONT_SIZE)
    );
    const plainText = content.plainText;
    const canonicalHtml = normalizeRichHtmlInlineFontSizes(
      getCanonicalRichTextHtml(content, html),
      item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_TEXT_FONT_SIZE)
    );
    if (!plainText.trim()) {
      state.board.items = state.board.items.filter((entry) => {
        if (entry.id === item.id) {
          return false;
        }
        return true;
      });
      if (state.hoverId === item.id) {
        state.hoverId = null;
      }
      state.editingId = null;
      state.editingType = null;
      state.board.selectedIds = [];
      refs.richEditor.classList.add("is-hidden");
      richTextSession.clear({ destroyAdapter: false });
      editBaselineSnapshot = null;
      commitHistory(before, "删除空白文本");
      setStatus("已删除空白文本");
      if (state.tool === "text" && shouldExitTextToolAfterEdit) {
        shouldExitTextToolAfterEdit = false;
        setTool("select");
      }
      return true;
    }
    syncEditingTextItemSize(item);
    const currentWidth = Math.max(80, Number(item.width || 0) || 80);
    const currentHeight = Math.max(40, Number(item.height || 0) || 40);
    const refreshedLinkSemantics = linkSemanticEnabled
      ? refreshTextLinkSemantics(
          {
            ...item,
            richTextDocument: content.richTextDocument,
          },
          plainText
        )
      : {
          linkTokens: Array.isArray(item.linkTokens) ? item.linkTokens : [],
          urlMetaCache: item.urlMetaCache && typeof item.urlMetaCache === "object" ? item.urlMetaCache : {},
        };
    const richTextDocumentWithMeta =
      content.richTextDocument && typeof content.richTextDocument === "object"
        ? {
            ...content.richTextDocument,
            meta: {
              ...(content.richTextDocument.meta && typeof content.richTextDocument.meta === "object"
                ? content.richTextDocument.meta
                : {}),
              linkTokens: refreshedLinkSemantics.linkTokens,
              urlMetaCache: refreshedLinkSemantics.urlMetaCache,
            },
          }
        : content.richTextDocument;
    const finalLayoutConfig = resolveEditedTextLayoutConfig(
      item,
      { ...content, html: canonicalHtml },
      item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_TEXT_FONT_SIZE)
    );
    const normalizedItem = normalizeTextElement({
      ...item,
      html: canonicalHtml,
      plainText,
      text: plainText,
      richTextDocument: richTextDocumentWithMeta,
      linkTokens: refreshedLinkSemantics.linkTokens,
      urlMetaCache: refreshedLinkSemantics.urlMetaCache,
      textBoxLayoutMode: finalLayoutConfig.layoutMode,
      textResizeMode: finalLayoutConfig.resizeMode,
      title: buildTextTitle(plainText || "文本"),
      width:
        finalLayoutConfig.layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT
          ? Math.max(80, Math.ceil(Number(finalLayoutConfig.widthHint || currentWidth) || currentWidth))
          : currentWidth,
      height: currentHeight,
    });
    Object.assign(item, normalizedItem);
    scheduleUrlMetaHydrationForItem(item);
    state.editingId = null;
    state.editingType = null;
    state.board.selectedIds = [item.id];
    refs.richEditor.classList.add("is-hidden");
    richTextSession.clear({ destroyAdapter: false });
    editBaselineSnapshot = null;
    const changed = commitHistory(before, "更新文本");
    if (!changed) {
      syncBoard({ persist: false, emit: true, markDirty: false });
      if (state.tool === "text" && shouldExitTextToolAfterEdit) {
        shouldExitTextToolAfterEdit = false;
        setTool("select");
      }
      return true;
    }
    setStatus("文本已更新");
    persistCommittedBoardIfPossible();
    if (state.tool === "text" && shouldExitTextToolAfterEdit) {
      shouldExitTextToolAfterEdit = false;
      setTool("select");
    }
    return true;
  }

  function commitFlowNodeEdit() {
    if (!state.editingId || state.editingType !== "flow-node") {
      return false;
    }
    const item = state.board.items.find((entry) => entry.id === state.editingId && entry.type === "flowNode");
    if (!item || !(refs.richEditor instanceof HTMLDivElement)) {
      state.editingId = null;
      state.editingType = null;
      refs.richEditor?.classList.add("is-hidden");
      richTextSession.clear({ destroyAdapter: false });
      return false;
    }
    const before = editBaselineSnapshot || richTextSession.getBaselineSnapshot() || takeHistorySnapshot(state);
    const html = normalizeRichHtmlInlineFontSizes(
      richTextSession.getHTML() || refs.richEditor.innerHTML || "",
      item.fontSize || resolveSessionFontSize(richTextSession, 18)
    );
    const content = ensureRichTextDocumentFields(
      {
        ...item,
        html,
        plainText: htmlToPlainText(html),
      },
      {
        fontSize: item.fontSize || resolveSessionFontSize(richTextSession, 18),
      }
    );
    const plainText = content.plainText;
    if (!plainText.trim()) {
      state.board.items = state.board.items.filter((entry) => entry.id !== item.id);
      if (state.hoverId === item.id) {
        state.hoverId = null;
      }
      state.editingId = null;
      state.editingType = null;
      state.board.selectedIds = [];
      refs.richEditor.classList.add("is-hidden");
      richTextSession.clear({ destroyAdapter: false });
      editBaselineSnapshot = null;
      commitHistory(before, "删除空白节点");
      setStatus("已删除空白节点");
      return true;
    }
    item.html = content.html;
    item.plainText = plainText;
    item.richTextDocument = content.richTextDocument;
    item.fontSize = resolveSessionFontSize(richTextSession, 18);
    const minNodeSize = getFlowNodeMinSize(item, { widthHint: item.width });
    item.width = Math.max(Number(item.width || 0) || 0, minNodeSize.width);
    item.height = Math.max(Number(item.height || 0) || 0, minNodeSize.height);
    state.editingId = null;
    state.editingType = null;
    state.board.selectedIds = [item.id];
    refs.richEditor.classList.add("is-hidden");
    richTextSession.clear({ destroyAdapter: false });
    editBaselineSnapshot = null;
    const changed = commitHistory(before, "更新节点");
    if (!changed) {
      syncBoard({ persist: false, emit: true, markDirty: false });
      return true;
    }
    setStatus("节点已更新");
    persistCommittedBoardIfPossible();
    return true;
  }

  function cancelFlowNodeEdit() {
    if (state.editingType !== "flow-node") {
      return false;
    }
    state.editingId = null;
    state.editingType = null;
    refs.richEditor?.classList.add("is-hidden");
    richTextSession.clear({ destroyAdapter: false });
    editBaselineSnapshot = null;
    syncBoard({ persist: false, emit: true });
    return true;
  }

  function commitRichEdit() {
    if (state.editingType === "flow-node") {
      return commitFlowNodeEdit();
    }
    return commitTextEdit();
  }

  function cancelRichEdit() {
    if (state.editingType === "flow-node") {
      return cancelFlowNodeEdit();
    }
    return cancelTextEdit();
  }

  function getTableEditItem() {
    return state.editingType === "table"
      ? state.board.items.find((entry) => entry.id === state.editingId && entry.type === "table") || null
      : null;
  }

  function buildTableEditorHtml(item) {
    const matrix = flattenTableStructureToMatrix(item?.table || {});
    return `
      <div class="canvas-table-editor-scroll">
        <table class="canvas-table-editor-grid">
          <tbody>
            ${matrix
              .map(
                (row, rowIndex) => `
                  <tr data-row-index="${rowIndex}">
                    ${row
                      .map((cell, columnIndex) => {
                        const tag = cell.header ? "th" : "td";
                        return `
                          <${tag}
                            contenteditable="true"
                            spellcheck="false"
                            data-row-index="${rowIndex}"
                            data-column-index="${columnIndex}"
                            data-header="${cell.header ? "1" : "0"}"
                          >${escapeRichTextHtml(cell.plainText || "")}</${tag}>
                        `;
                      })
                      .join("")}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function getTableEditorCellElement(rowIndex = 0, columnIndex = 0) {
    return refs.tableEditor?.querySelector?.(
      `[data-row-index="${Math.max(0, Number(rowIndex) || 0)}"][data-column-index="${Math.max(0, Number(columnIndex) || 0)}"]`
    ) || null;
  }

  function syncTableEditorSelectionUI() {
    if (!(refs.tableEditor instanceof HTMLDivElement)) {
      return;
    }
    refs.tableEditor.querySelectorAll("[data-row-index][data-column-index]").forEach((cell) => {
      if (!(cell instanceof HTMLElement)) {
        return;
      }
      const rowIndex = Number(cell.getAttribute("data-row-index"));
      const columnIndex = Number(cell.getAttribute("data-column-index"));
      cell.classList.toggle(
        "is-selected",
        rowIndex === Number(tableEditSelection.rowIndex) && columnIndex === Number(tableEditSelection.columnIndex)
      );
    });
    const editingItem = getTableEditItem();
    if (!(refs.tableToolbar instanceof HTMLDivElement) || !editingItem) {
      return;
    }
    const hasHeader = editingItem?.table?.hasHeader !== false;
    refs.tableToolbar
      .querySelectorAll('[data-action="table-toggle-header"]')
      .forEach((button) => button.classList.toggle("is-active", hasHeader));
  }

  function focusTableEditorCell(rowIndex = 0, columnIndex = 0, { placeAtEnd = false } = {}) {
    const cell = getTableEditorCellElement(rowIndex, columnIndex);
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    tableEditSelection = {
      rowIndex: Math.max(0, Number(rowIndex) || 0),
      columnIndex: Math.max(0, Number(columnIndex) || 0),
    };
    syncTableEditorSelectionUI();
    cell.focus();
    const selection = window.getSelection?.();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(!placeAtEnd);
    if (placeAtEnd) {
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function buildTableMatrixFromEditor() {
    if (!(refs.tableEditor instanceof HTMLDivElement)) {
      return [];
    }
    const rows = Array.from(refs.tableEditor.querySelectorAll("tr[data-row-index]"));
    return rows.map((rowEl, rowIndex) =>
      Array.from(rowEl.querySelectorAll("[data-column-index]")).map((cellEl, columnIndex) => ({
        plainText: sanitizeText(cellEl.textContent || ""),
        header: String(cellEl.getAttribute("data-header") || "") === "1",
        rowIndex,
        columnIndex,
      }))
    );
  }

  function syncTableToolbarLayout(item) {
    if (!(refs.tableToolbar instanceof HTMLDivElement) || !(refs.surface instanceof HTMLElement) || !item) {
      return;
    }
    const scale = Math.max(0.1, Number(state.board.view.scale || 1));
    const left = Number(item.x || 0) * scale + Number(state.board.view.offsetX || 0);
    const top = Number(item.y || 0) * scale + Number(state.board.view.offsetY || 0);
    const width = Math.max(1, Number(item.width || 1)) * scale;
    const hostRect = refs.surface.getBoundingClientRect();
    const toolbarWidth = Math.max(1, refs.tableToolbar.offsetWidth || 320);
    const toolbarHeight = Math.max(1, refs.tableToolbar.offsetHeight || 38);
    const nextLeft = Math.max(8, Math.min(left + width / 2 - toolbarWidth / 2, hostRect.width - toolbarWidth - 8));
    const nextTop = Math.max(8, Math.min(top - toolbarHeight - 10, hostRect.height - toolbarHeight - 8));
    refs.tableToolbar.style.left = `${Math.round(nextLeft)}px`;
    refs.tableToolbar.style.top = `${Math.round(nextTop)}px`;
    refs.tableToolbar.classList.remove("is-hidden");
  }

  function syncTableEditorLayout() {
    if (!(refs.tableEditor instanceof HTMLDivElement)) {
      return;
    }
    if (!state.editingId || state.editingType !== "table") {
      refs.tableEditor.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
      return;
    }
    refs.editor?.classList.add("is-hidden");
    refs.richEditor?.classList.add("is-hidden");
    refs.fileMemoEditor?.classList.add("is-hidden");
    refs.imageMemoEditor?.classList.add("is-hidden");
    richTextSession.clear({ destroyAdapter: false });
    const item = getTableEditItem();
    if (!item) {
      state.editingId = null;
      state.editingType = null;
      refs.tableEditor.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
      lastTableEditItemId = null;
      return;
    }
    const scale = Math.max(0.1, Number(state.board.view.scale || 1));
    const left = Number(item.x || 0) * scale + Number(state.board.view.offsetX || 0);
    const top = Number(item.y || 0) * scale + Number(state.board.view.offsetY || 0);
    const width = Math.max(1, Number(item.width || 1)) * scale;
    const height = Math.max(1, Number(item.height || 1)) * scale;
    if (lastTableEditItemId !== item.id || !refs.tableEditor.querySelector("table")) {
      refs.tableEditor.innerHTML = buildTableEditorHtml(item);
      lastTableEditItemId = item.id;
    }
    refs.tableEditor.style.left = `${Math.round(left)}px`;
    refs.tableEditor.style.top = `${Math.round(top)}px`;
    refs.tableEditor.style.width = `${Math.round(width)}px`;
    refs.tableEditor.style.height = `${Math.round(height)}px`;
    refs.tableEditor.style.fontSize = `${Math.max(9, scaleSceneValue(state.board.view, 12, { min: 9 }))}px`;
    refs.tableEditor.classList.remove("is-hidden");
    syncTableToolbarLayout(item);
    syncTableEditorSelectionUI();
  }

  function beginTableEdit(itemId, selection = null) {
    const item = state.board.items.find((entry) => entry.id === itemId && entry.type === "table");
    if (!item || !(refs.tableEditor instanceof HTMLDivElement)) {
      return false;
    }
    if (isLockedItem(item)) {
      setStatus("表格已锁定，无法编辑");
      return false;
    }
    finishImageEdit();
    cancelTextEdit();
    cancelFlowNodeEdit();
    cancelFileMemoEdit();
    cancelImageMemoEdit();
    if (!editBaselineSnapshot) {
      editBaselineSnapshot = takeHistorySnapshot(state);
    }
    state.editingId = item.id;
    state.editingType = "table";
    state.board.selectedIds = [item.id];
    tableEditSelection = {
      rowIndex: Math.max(0, Number(selection?.rowIndex) || 0),
      columnIndex: Math.max(0, Number(selection?.columnIndex) || 0),
    };
    lastTableEditItemId = null;
    syncTableEditorLayout();
    syncBoard({ persist: false, emit: true });
    requestAnimationFrame(() => {
      focusTableEditorCell(tableEditSelection.rowIndex, tableEditSelection.columnIndex);
    });
    return true;
  }

  function commitTableEdit() {
    if (!state.editingId || state.editingType !== "table") {
      return false;
    }
    const item = getTableEditItem();
    if (!item || !(refs.tableEditor instanceof HTMLDivElement)) {
      state.editingId = null;
      state.editingType = null;
      refs.tableEditor?.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
      lastTableEditItemId = null;
      return false;
    }
    const before = editBaselineSnapshot || takeHistorySnapshot(state);
    const matrix = buildTableMatrixFromEditor();
    const structure = createTableStructureFromMatrix(matrix, {
      title: item?.table?.title || item?.title || "表格",
      hasHeader: item?.table?.hasHeader !== false,
    });
    const normalizedItem = updateTableElementStructure(item, structure);
    Object.assign(item, normalizedItem);
    state.editingId = null;
    state.editingType = null;
    state.board.selectedIds = [item.id];
    refs.tableEditor.classList.add("is-hidden");
    refs.tableToolbar?.classList.add("is-hidden");
    lastTableEditItemId = null;
    editBaselineSnapshot = null;
    const changed = commitHistory(before, "更新表格");
    if (!changed) {
      syncBoard({ persist: false, emit: true, markDirty: false });
      return true;
    }
    setStatus("表格已更新");
    persistCommittedBoardIfPossible();
    return true;
  }

  function cancelTableEdit() {
    if (state.editingType !== "table") {
      return false;
    }
    state.editingId = null;
    state.editingType = null;
    refs.tableEditor?.classList.add("is-hidden");
    refs.tableToolbar?.classList.add("is-hidden");
    lastTableEditItemId = null;
    editBaselineSnapshot = null;
    syncBoard({ persist: false, emit: true });
    return true;
  }

  function mutateTableEditor(mutator) {
    const item = getTableEditItem();
    if (!(refs.tableEditor instanceof HTMLDivElement) || !item || typeof mutator !== "function") {
      return;
    }
    const matrix = buildTableMatrixFromEditor();
    const mutationResult = mutator(matrix.map((row) => row.map((cell) => ({ ...cell })))) || matrix;
    const nextMatrix = Array.isArray(mutationResult) ? mutationResult : mutationResult?.matrix || matrix;
    const nextHasHeader =
      typeof mutationResult?.hasHeader === "boolean" ? mutationResult.hasHeader : item?.table?.hasHeader !== false;
    const structure = createTableStructureFromMatrix(nextMatrix, {
      title: item?.table?.title || item?.title || "表格",
      hasHeader: nextHasHeader,
    });
    item.table = structure;
    item.columns = structure.columns;
    item.rows = structure.rows.length;
    const normalizedItem = updateTableElementStructure(item, structure);
    Object.assign(item, normalizedItem);
    refs.tableEditor.innerHTML = buildTableEditorHtml(item);
    syncTableEditorLayout();
    requestAnimationFrame(() => {
      focusTableEditorCell(
        Math.min(tableEditSelection.rowIndex, Math.max(0, structure.rows.length - 1)),
        Math.min(tableEditSelection.columnIndex, Math.max(0, structure.columns - 1))
      );
    });
  }

  function getTableCellSelectionFromScenePoint(item, scenePoint) {
    const grid = getStructuredTableSceneGrid(item);
    const bounds = grid.bounds;
    if (
      Number(scenePoint?.x || 0) < bounds.left ||
      Number(scenePoint?.x || 0) > bounds.right ||
      Number(scenePoint?.y || 0) < bounds.top ||
      Number(scenePoint?.y || 0) > bounds.bottom
    ) {
      return { rowIndex: 0, columnIndex: 0 };
    }
    const localX = Math.min(Math.max(Number(scenePoint?.x || 0) - bounds.left, 0), Math.max(0, bounds.width - 0.001));
    const localY = Math.min(Math.max(Number(scenePoint?.y || 0) - bounds.top, 0), Math.max(0, bounds.height - 0.001));
    return {
      rowIndex: Math.min(grid.rowCount - 1, Math.floor(localY / Math.max(grid.rowHeight, 1e-6))),
      columnIndex: Math.min(grid.columnCount - 1, Math.floor(localX / Math.max(grid.columnWidth, 1e-6))),
    };
  }

  function syncFileMemoLayout() {
    if (!(refs.fileMemoEditor instanceof HTMLTextAreaElement)) {
      return;
    }
    if (!state.editingId || state.editingType !== "file-memo") {
      refs.fileMemoEditor.classList.add("is-hidden");
      return;
    }
    refs.editor?.classList.add("is-hidden");
    refs.richEditor?.classList.add("is-hidden");
    refs.imageMemoEditor?.classList.add("is-hidden");
    richTextSession.clear({ destroyAdapter: false });
    const item = state.board.items.find((entry) => entry.id === state.editingId && entry.type === "fileCard");
    if (!item) {
      state.editingId = null;
      state.editingType = null;
      refs.fileMemoEditor.classList.add("is-hidden");
      return;
    }
    const scale = Math.max(0.1, Number(state.board.view.scale || 1));
    const draftMemoText =
      document.activeElement === refs.fileMemoEditor ? String(refs.fileMemoEditor.value || item.memo || "") : String(item.memo || "");
    const memoLayout = getMemoLayout(item, { kind: "fileCard", textOverride: draftMemoText });
    const left = Number(memoLayout.left || 0) * scale + Number(state.board.view.offsetX || 0);
    const top = Number(memoLayout.top || 0) * scale + Number(state.board.view.offsetY || 0);
    const memoWidth = Number(memoLayout.width || 0) * scale;
    const memoHeight = Number(memoLayout.height || 0) * scale;
    if (lastFileMemoItemId !== item.id || document.activeElement !== refs.fileMemoEditor) {
      refs.fileMemoEditor.value = String(item.memo || "");
      lastFileMemoItemId = item.id;
    }
    refs.fileMemoEditor.style.left = `${left}px`;
    refs.fileMemoEditor.style.top = `${top}px`;
    refs.fileMemoEditor.style.width = `${memoWidth}px`;
    refs.fileMemoEditor.style.height = `${memoHeight}px`;
    refs.fileMemoEditor.style.fontSize = `${Math.max(12, Number(memoLayout.fontSize || 14) * scale)}px`;
    refs.fileMemoEditor.classList.remove("is-hidden");
  }

  function beginFileMemoEdit(itemId) {
    const item = state.board.items.find((entry) => entry.id === itemId && entry.type === "fileCard");
    if (!item || !(refs.fileMemoEditor instanceof HTMLTextAreaElement)) {
      return false;
    }
    finishImageEdit();
    cancelImageMemoEdit();
    item.memoVisible = true;
    if (!editBaselineSnapshot) {
      editBaselineSnapshot = takeHistorySnapshot(state);
    }
    state.editingId = item.id;
    state.editingType = "file-memo";
    state.board.selectedIds = [item.id];
    refs.fileMemoEditor.value = String(item.memo || "");
    lastFileMemoItemId = item.id;
    syncFileMemoLayout();
    syncBoard({ persist: false, emit: true });
    requestAnimationFrame(() => {
      refs.fileMemoEditor?.focus();
      refs.fileMemoEditor?.select();
    });
    return true;
  }

  function commitFileMemoEdit() {
    if (!state.editingId || state.editingType !== "file-memo") {
      return false;
    }
    const item = state.board.items.find((entry) => entry.id === state.editingId && entry.type === "fileCard");
    if (!item || !(refs.fileMemoEditor instanceof HTMLTextAreaElement)) {
      state.editingId = null;
      state.editingType = null;
      refs.fileMemoEditor?.classList.add("is-hidden");
      lastFileMemoItemId = null;
      return false;
    }
    const before = editBaselineSnapshot || takeHistorySnapshot(state);
    const value = sanitizeText(refs.fileMemoEditor.value || "");
    item.memo = value;
    state.editingId = null;
    state.editingType = null;
    state.board.selectedIds = [item.id];
    refs.fileMemoEditor.classList.add("is-hidden");
    lastFileMemoItemId = null;
    richTextSession.clear({ destroyAdapter: false });
    editBaselineSnapshot = null;
    const changed = commitHistory(before, "更新文件卡备注");
    if (!changed) {
      syncBoard({ persist: false, emit: true, markDirty: false });
      return true;
    }
    setStatus("文件卡备注已更新");
    persistCommittedBoardIfPossible();
    return true;
  }

  function cancelFileMemoEdit() {
    if (state.editingType !== "file-memo") {
      return false;
    }
    state.editingId = null;
    state.editingType = null;
    refs.fileMemoEditor?.classList.add("is-hidden");
    lastFileMemoItemId = null;
    richTextSession.clear({ destroyAdapter: false });
    editBaselineSnapshot = null;
    syncBoard({ persist: false, emit: true });
    return true;
  }

  function syncImageMemoLayout() {
    if (!(refs.imageMemoEditor instanceof HTMLTextAreaElement)) {
      return;
    }
    if (!state.editingId || state.editingType !== "image-memo") {
      refs.imageMemoEditor.classList.add("is-hidden");
      return;
    }
    refs.editor?.classList.add("is-hidden");
    refs.richEditor?.classList.add("is-hidden");
    refs.fileMemoEditor?.classList.add("is-hidden");
    richTextSession.clear({ destroyAdapter: false });
    const item = state.board.items.find((entry) => entry.id === state.editingId && entry.type === "image");
    if (!item) {
      state.editingId = null;
      state.editingType = null;
      refs.imageMemoEditor.classList.add("is-hidden");
      return;
    }
    const scale = Math.max(0.1, Number(state.board.view.scale || 1));
    const draftMemoText =
      document.activeElement === refs.imageMemoEditor ? String(refs.imageMemoEditor.value || item.memo || "") : String(item.memo || "");
    const memoLayout = getMemoLayout(item, { kind: "image", textOverride: draftMemoText });
    const left = Number(memoLayout.left || 0) * scale + Number(state.board.view.offsetX || 0);
    const top = Number(memoLayout.top || 0) * scale + Number(state.board.view.offsetY || 0);
    const memoWidth = Number(memoLayout.width || 0) * scale;
    const memoHeight = Number(memoLayout.height || 0) * scale;
    if (lastImageMemoItemId !== item.id || document.activeElement !== refs.imageMemoEditor) {
      refs.imageMemoEditor.value = String(item.memo || "");
      lastImageMemoItemId = item.id;
    }
    refs.imageMemoEditor.style.left = `${left}px`;
    refs.imageMemoEditor.style.top = `${top}px`;
    refs.imageMemoEditor.style.width = `${memoWidth}px`;
    refs.imageMemoEditor.style.height = `${memoHeight}px`;
    refs.imageMemoEditor.style.fontSize = `${Math.max(12, Number(memoLayout.fontSize || 14) * scale)}px`;
    refs.imageMemoEditor.classList.remove("is-hidden");
  }

  function beginImageMemoEdit(itemId) {
    const item = state.board.items.find((entry) => entry.id === itemId && entry.type === "image");
    if (!item || !(refs.imageMemoEditor instanceof HTMLTextAreaElement)) {
      return false;
    }
    finishImageEdit();
    cancelFileMemoEdit();
    item.memoVisible = true;
    if (!editBaselineSnapshot) {
      editBaselineSnapshot = takeHistorySnapshot(state);
    }
    state.editingId = item.id;
    state.editingType = "image-memo";
    state.board.selectedIds = [item.id];
    refs.imageMemoEditor.value = String(item.memo || "");
    lastImageMemoItemId = item.id;
    syncImageMemoLayout();
    syncBoard({ persist: false, emit: true });
    requestAnimationFrame(() => {
      refs.imageMemoEditor?.focus();
      refs.imageMemoEditor?.select();
    });
    return true;
  }

  function commitImageMemoEdit() {
    if (!state.editingId || state.editingType !== "image-memo") {
      return false;
    }
    const item = state.board.items.find((entry) => entry.id === state.editingId && entry.type === "image");
    if (!item || !(refs.imageMemoEditor instanceof HTMLTextAreaElement)) {
      state.editingId = null;
      state.editingType = null;
      refs.imageMemoEditor?.classList.add("is-hidden");
      lastImageMemoItemId = null;
      return false;
    }
    const before = editBaselineSnapshot || takeHistorySnapshot(state);
    const value = sanitizeText(refs.imageMemoEditor.value || "");
    item.memo = value;
    state.editingId = null;
    state.editingType = null;
    state.board.selectedIds = [item.id];
    refs.imageMemoEditor.classList.add("is-hidden");
    lastImageMemoItemId = null;
    richTextSession.clear({ destroyAdapter: false });
    editBaselineSnapshot = null;
    const changed = commitHistory(before, "更新图片备注");
    if (!changed) {
      syncBoard({ persist: false, emit: true, markDirty: false });
      return true;
    }
    setStatus("图片备注已更新");
    persistCommittedBoardIfPossible();
    return true;
  }

  function cancelImageMemoEdit() {
    if (state.editingType !== "image-memo") {
      return false;
    }
    state.editingId = null;
    state.editingType = null;
    refs.imageMemoEditor?.classList.add("is-hidden");
    lastImageMemoItemId = null;
    richTextSession.clear({ destroyAdapter: false });
    editBaselineSnapshot = null;
    syncBoard({ persist: false, emit: true });
    return true;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getImageRotateHandle(item, view) {
    if (!item || item.type !== "image") {
      return null;
    }
    const scale = Math.max(0.1, Number(view?.scale) || 1);
    const offsetScreen = 26;
    const radiusScreen = 8;
    const offsetScene = offsetScreen / scale;
    const radiusScene = radiusScreen / scale;
    const centerX = Number(item.x || 0) + Number(item.width || 0) / 2;
    const centerY = Number(item.y || 0) - offsetScene;
    return {
      x: centerX,
      y: centerY,
      r: radiusScene,
    };
  }

  function hitTestImageRotateHandle(item, scenePoint, view) {
    const handle = getImageRotateHandle(item, view);
    if (!handle) {
      return false;
    }
    const dx = Number(scenePoint.x || 0) - handle.x;
    const dy = Number(scenePoint.y || 0) - handle.y;
    return Math.hypot(dx, dy) <= handle.r;
  }

  function hitTestShapeRotateHandle(item, scenePoint, view) {
    if (!item || item.type !== "shape") {
      return false;
    }
    const bounds = getElementBounds(item);
    const scale = Math.max(0.1, Number(view?.scale) || 1);
    const handleOffset = 26 / scale;
    const radius = 10 / scale;
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top - handleOffset;
    const dx = Number(scenePoint?.x || 0) - centerX;
    const dy = Number(scenePoint?.y || 0) - centerY;
    return Math.hypot(dx, dy) <= radius;
  }

  function getRectCornerRadius(baseItem, handle, scenePoint) {
    if (!baseItem || baseItem.shapeType !== "rect") {
      return Number(baseItem?.radius || 0);
    }
    const rawHandle = String(handle || "");
    const handleKey = rawHandle.startsWith("round-") ? rawHandle.slice(6) : rawHandle;
    const bounds = getElementBounds(baseItem);
    const maxRadius = Math.max(0, Math.min(bounds.width, bounds.height) / 2);
    const corners = {
      nw: { x: bounds.left, y: bounds.top },
      ne: { x: bounds.right, y: bounds.top },
      sw: { x: bounds.left, y: bounds.bottom },
      se: { x: bounds.right, y: bounds.bottom },
    };
    const corner = corners[handleKey];
    if (!corner) {
      return clamp(Number(baseItem.radius || 0), 0, maxRadius);
    }
    const center = {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
    const dirX = center.x - corner.x;
    const dirY = center.y - corner.y;
    const len = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / len;
    const uy = dirY / len;
    const vx = Number(scenePoint?.x || 0) - corner.x;
    const vy = Number(scenePoint?.y || 0) - corner.y;
    const projection = vx * ux + vy * uy;
    return clamp(projection, 0, maxRadius);
  }

  function resizeImageWithAspect(baseItem, handle, scenePoint) {
    const bounds = getElementBounds(baseItem);
    const anchors = {
      nw: { x: bounds.right, y: bounds.bottom },
      ne: { x: bounds.left, y: bounds.bottom },
      sw: { x: bounds.right, y: bounds.top },
      se: { x: bounds.left, y: bounds.top },
    };
    const anchor = anchors[handle];
    if (!anchor) {
      return baseItem;
    }
    const ratio = Math.max(0.1, Number(baseItem.width || 1) / Math.max(1, Number(baseItem.height || 1)));
    const rawWidth = Math.abs(Number(scenePoint.x || 0) - anchor.x);
    const rawHeight = Math.abs(Number(scenePoint.y || 0) - anchor.y);
    let width = rawWidth;
    let height = rawHeight;
    if (rawWidth / Math.max(1, rawHeight) > ratio) {
      height = width / ratio;
    } else {
      width = height * ratio;
    }
    width = Math.max(24, width);
    height = Math.max(24, height);
    let left = anchor.x;
    let top = anchor.y;
    if (handle === "nw") {
      left = anchor.x - width;
      top = anchor.y - height;
    }
    if (handle === "ne") {
      left = anchor.x;
      top = anchor.y - height;
    }
    if (handle === "sw") {
      left = anchor.x - width;
      top = anchor.y;
    }
    if (handle === "se") {
      left = anchor.x;
      top = anchor.y;
    }
    return {
      ...baseItem,
      x: left,
      y: top,
      width,
      height,
    };
  }

  function resizeShapeWithAspect(baseItem, handle, scenePoint) {
    const bounds = getElementBounds(baseItem);
    const anchors = {
      nw: { x: bounds.right, y: bounds.bottom },
      ne: { x: bounds.left, y: bounds.bottom },
      sw: { x: bounds.right, y: bounds.top },
      se: { x: bounds.left, y: bounds.top },
    };
    const anchor = anchors[handle];
    if (!anchor) {
      return baseItem;
    }
    const ratio = Math.max(0.1, Number(baseItem.width || 1) / Math.max(1, Number(baseItem.height || 1)));
    const rawWidth = Math.abs(Number(scenePoint?.x || 0) - anchor.x);
    const rawHeight = Math.abs(Number(scenePoint?.y || 0) - anchor.y);
    let width = rawWidth;
    let height = rawHeight;
    if (rawWidth / Math.max(1, rawHeight) > ratio) {
      height = width / ratio;
    } else {
      width = height * ratio;
    }
    width = Math.max(24, width);
    height = Math.max(24, height);
    let left = anchor.x;
    let top = anchor.y;
    if (handle === "nw") {
      left = anchor.x - width;
      top = anchor.y - height;
    }
    if (handle === "ne") {
      left = anchor.x;
      top = anchor.y - height;
    }
    if (handle === "sw") {
      left = anchor.x - width;
      top = anchor.y;
    }
    if (handle === "se") {
      left = anchor.x;
      top = anchor.y;
    }
    return {
      ...baseItem,
      x: left,
      y: top,
      width,
      height,
      startX: left,
      startY: top,
      endX: left + width,
      endY: top + height,
    };
  }

  function getImageItemById(itemId) {
    return state.board.items.find((entry) => entry.id === itemId && entry.type === "image");
  }

  function beginImageEdit(itemId) {
    const item = getImageItemById(itemId);
    if (!item) {
      return false;
    }
    if (isLockedItem(item)) {
      setStatus("图片已锁定，无法编辑");
      return false;
    }
    cancelTextEdit();
    cancelFileMemoEdit();
    cancelImageMemoEdit();
    store.setTool("select");
    state.editingId = item.id;
    state.editingType = "image";
    state.board.selectedIds = [item.id];
    lightImageEditor.beginEdit(item.id);
    syncBoard({ persist: false, emit: true });
    return true;
  }

  function finishImageEdit() {
    if (state.editingType !== "image") {
      return false;
    }
    state.editingId = null;
    state.editingType = null;
    lightImageEditor.finishEdit();
    syncBoard({ persist: false, emit: true });
    return true;
  }

  function updateImageItem(itemId, updater, reason, statusText) {
    const item = getImageItemById(itemId);
    if (!item) {
      return false;
    }
    if (isLockedItem(item)) {
      setStatus("图片已锁定，无法修改");
      return false;
    }
    const before = takeHistorySnapshot(state);
    updater(item);
    commitHistory(before, reason);
    if (statusText) {
      setStatus(statusText);
    }
    return true;
  }

  function renderImageToCanvas(item, image) {
    const crop = item?.crop;
    const srcWidth = image?.naturalWidth || item?.naturalWidth || 1;
    const srcHeight = image?.naturalHeight || item?.naturalHeight || 1;
    const sx = crop ? crop.x * srcWidth : 0;
    const sy = crop ? crop.y * srcHeight : 0;
    const sw = crop ? crop.w * srcWidth : srcWidth;
    const sh = crop ? crop.h * srcHeight : srcHeight;
    const baseWidth = Math.max(1, Math.round(sw));
    const baseHeight = Math.max(1, Math.round(sh));
    const angle = ((Number(item.rotation || 0) % 360) + 360) % 360;
    const swapped = angle === 90 || angle === 270;
    const outWidth = swapped ? baseHeight : baseWidth;
    const outHeight = swapped ? baseWidth : baseHeight;

    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    const brightness = clamp(Number(item.brightness || 0), -100, 100);
    const contrast = clamp(Number(item.contrast || 0), -100, 100);
    ctx.filter = `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100})`;
    ctx.translate(outWidth / 2, outHeight / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
    ctx.translate(-baseWidth / 2, -baseHeight / 2);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, baseWidth, baseHeight);
    ctx.filter = "none";

    const annotations = item.annotations || { lines: [], texts: [] };
    const scale = 1;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2 * Math.max(0.6, scale);
    (annotations.lines || []).forEach((line) => {
      const x1 = Number(line?.x1 || 0) * baseWidth;
      const y1 = Number(line?.y1 || 0) * baseHeight;
      const x2 = Number(line?.x2 || 0) * baseWidth;
      const y2 = Number(line?.y2 || 0) * baseHeight;
      ctx.strokeStyle = line?.color || "rgba(239, 68, 68, 0.92)";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
    (annotations.texts || []).forEach((entry) => {
      const text = String(entry?.text || "");
      if (!text) {
        return;
      }
      const x = Number(entry?.x || 0) * baseWidth;
      const y = Number(entry?.y || 0) * baseHeight;
      const fontSize = Math.max(12, Number(entry?.fontSize || 16));
      ctx.fillStyle = entry?.color || "rgba(15, 23, 42, 0.95)";
      ctx.font = `600 ${fontSize}px "Segoe UI", "PingFang SC", sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(text, x, y);
    });
    (annotations.rects || []).forEach((rect) => {
      const x = Number(rect?.x || 0) * baseWidth;
      const y = Number(rect?.y || 0) * baseHeight;
      const w = Number(rect?.w || 0) * baseWidth;
      const h = Number(rect?.h || 0) * baseHeight;
      if (!w || !h) {
        return;
      }
      const radius = Math.max(0, Number(rect?.radius || 0)) * Math.min(baseWidth, baseHeight);
      ctx.strokeStyle = rect?.color || "rgba(15, 23, 42, 0.95)";
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
      ctx.stroke();
    });
    (annotations.arrows || []).forEach((arrow) => {
      const x1 = Number(arrow?.x1 || 0) * baseWidth;
      const y1 = Number(arrow?.y1 || 0) * baseHeight;
      const x2 = Number(arrow?.x2 || 0) * baseWidth;
      const y2 = Number(arrow?.y2 || 0) * baseHeight;
      ctx.strokeStyle = arrow?.color || "rgba(15, 23, 42, 0.95)";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = 10;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    });
    ctx.restore();
    return canvas;
  }

  async function exportImageElement(itemId) {
    return lightImageEditor.exportImage(itemId, renderImageToCanvas);
  }

  function getFlowEdgeBounds(edge) {
    if (!edge || edge.type !== "flowEdge") {
      return null;
    }
    const fromNode = state.board.items.find((entry) => entry.id === edge.fromId && entry.type === "flowNode");
    const toNode = state.board.items.find((entry) => entry.id === edge.toId && entry.type === "flowNode");
    if (!fromNode || !toNode) {
      return null;
    }
    const fromConnectors = flowModule.getConnectors(fromNode);
    const toConnectors = flowModule.getConnectors(toNode);
    const fromPoint = fromConnectors[edge.fromSide] || fromConnectors.right || fromNode;
    const toPoint = toConnectors[edge.toSide] || toConnectors.left || toNode;
    const left = Math.min(fromPoint.x, toPoint.x);
    const top = Math.min(fromPoint.y, toPoint.y);
    const right = Math.max(fromPoint.x, toPoint.x);
    const bottom = Math.max(fromPoint.y, toPoint.y);
    return {
      left,
      top,
      right,
      bottom,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }

  function getExportBounds(items = []) {
    return getCanvasExportBounds(items, {
      getElementBounds,
      getFlowEdgeBounds,
    });
  }

  function getCardPairId(item, itemMap = new Map()) {
    if (!item || (item.type !== "fileCard" && item.type !== "image")) {
      return "";
    }
    const sourcePath = String(item.sourcePath || "").trim();
    const fileId = String(item.fileId || "").trim();
    for (const candidate of itemMap.values()) {
      if (!candidate || candidate.id === item.id) {
        continue;
      }
      if (candidate.type !== "fileCard" && candidate.type !== "image") {
        continue;
      }
      if (candidate.type === item.type) {
        continue;
      }
      const candidateFileId = String(candidate.fileId || "").trim();
      const candidateSourcePath = String(candidate.sourcePath || "").trim();
      if (fileId && candidateFileId && fileId === candidateFileId) {
        return candidate.id;
      }
      if (sourcePath && candidateSourcePath && sourcePath === candidateSourcePath) {
        return candidate.id;
      }
    }
    return "";
  }

  function isCardLinkedItem(item) {
    return Boolean(getCardPairId(item, new Map(state.board.items.map((entry) => [entry.id, entry]))));
  }

  function collectCardLinkedItems(items = []) {
    const itemMap = new Map(state.board.items.map((entry) => [entry.id, entry]));
    const map = new Map();
    items.forEach((item) => {
      if (item) {
        map.set(item.id, item);
        const pairId = getCardPairId(item, itemMap);
        if (pairId && itemMap.has(pairId)) {
          map.set(pairId, itemMap.get(pairId));
        }
      }
    });
    return Array.from(map.values());
  }

  function renderItemsToCanvas(items = [], options = {}) {
    const exportItems = collectCardLinkedItems(items);
    return renderExportBoardToCanvas(exportItems, {
      renderer,
      getElementBounds,
      getFlowEdgeBounds,
      allowLocalFileAccess: getAllowLocalFileAccess(),
      backgroundFill: options.backgroundFill ?? "transparent",
      backgroundGrid: Boolean(options.backgroundGrid),
      backgroundPattern: options.backgroundPattern,
      renderTextInCanvas: true,
      scale: options.scale ?? 1,
    });
  }

  function resolveExportBackgroundPattern(options = {}) {
    if (options?.includeBackground === false) {
      return "none";
    }
    return normalizeBoardBackgroundPattern(options?.backgroundPattern || getBoardBackgroundPattern());
  }

  function getSelectionSceneBounds(selectionRect = null) {
    const start = selectionRect?.start || selectionRect?.current || null;
    const current = selectionRect?.current || selectionRect?.start || null;
    if (!start || !current) {
      return null;
    }
    const left = Math.min(Number(start.x || 0), Number(current.x || 0));
    const top = Math.min(Number(start.y || 0), Number(current.y || 0));
    const right = Math.max(Number(start.x || 0), Number(current.x || 0));
    const bottom = Math.max(Number(start.y || 0), Number(current.y || 0));
    return {
      left,
      top,
      right,
      bottom,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }

  function doBoundsIntersect(a, b) {
    if (!a || !b) {
      return false;
    }
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  function collectItemsInSceneBounds(bounds, items = state.board.items) {
    if (!bounds || !Array.isArray(items) || !items.length) {
      return [];
    }
    const matches = items.filter((item) => {
      if (!item) {
        return false;
      }
      const itemBounds = item.type === "flowEdge" ? getFlowEdgeBounds(item) : getElementBounds(item);
      return doBoundsIntersect(itemBounds, bounds);
    });
    return collectCardLinkedItems(matches);
  }

  async function renderSceneBoundsToCanvas(bounds, options = {}) {
    if (!bounds) {
      return null;
    }
    const reportProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const exportLabel = String(options.exportLabel || "导出").trim() || "导出";
    if (reportProgress) {
      await reportProgress("正在准备画布资源...");
    }
    const selectedItems = collectItemsInSceneBounds(bounds, state.board.items);
    if (!selectedItems.length) {
      return null;
    }
    const hydratedItems = await hydrateImageItems(selectedItems);
    const exportItems = buildExportReadyBoardItems(hydratedItems);
    if (reportProgress) {
      await reportProgress("正在预加载图片资源...");
    }
    await preloadImagesForItems(exportItems);
    if (reportProgress) {
      await reportProgress("正在渲染离屏画布...");
    }
    const baseRenderOptions = {
      renderer,
      getElementBounds,
      getFlowEdgeBounds,
      allowLocalFileAccess: getAllowLocalFileAccess(),
      backgroundFill: options.backgroundFill ?? "#ffffff",
      backgroundGrid: Boolean(options.backgroundGrid),
      backgroundPattern: options.backgroundPattern,
      renderTextInCanvas: true,
      scale: options.scale ?? 1,
      devicePixelRatio: 1,
      exportBounds: bounds,
    };
    const initialRenderResult = renderExportBoardToCanvas(exportItems, baseRenderOptions);
    const isOversizedExport =
      initialRenderResult?.errorCode === "PDF_EXPORT_CANVAS_SIDE_EXCEEDED" ||
      initialRenderResult?.errorCode === "PDF_EXPORT_CANVAS_PIXELS_EXCEEDED";
    if (!isOversizedExport) {
      return initialRenderResult;
    }
    const requestedWidth = Math.max(1, Math.round(Number(initialRenderResult?.requestedCanvasWidth || 0) || 1));
    const requestedHeight = Math.max(1, Math.round(Number(initialRenderResult?.requestedCanvasHeight || 0) || 1));
    const requestedPixels = Math.max(1, Math.round(Number(initialRenderResult?.requestedTotalPixels || 0) || 1));
    const continueExport =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(
            [
              `当前${exportLabel}尺寸过大，可能导出很慢、占用大量内存，或最终生成失败。`,
              "",
              `目标画布像素：${requestedWidth} × ${requestedHeight}`,
              `总像素：${requestedPixels.toLocaleString("zh-CN")}`,
              "",
              "是否仍然继续导出？",
            ].join("\n")
          )
        : false;
    if (!continueExport) {
      return {
        canceled: true,
        code: options.cancelCode || "PNG_EXPORT_CANCELED",
      };
    }
    if (reportProgress) {
      await reportProgress(`正在按大尺寸继续${exportLabel}...`);
    }
    return renderExportBoardToCanvas(exportItems, {
      ...baseRenderOptions,
      allowUnsafeSize: true,
    });
  }

  async function renderBoardToCanvas(options = {}) {
    const reportProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const exportLabel = String(options.exportLabel || "导出").trim() || "导出";
    if (reportProgress) {
      await reportProgress("正在准备画布资源...");
    }
    const hydratedItems = await hydrateImageItems(state.board.items);
    const exportItems = buildExportReadyBoardItems(hydratedItems);
    if (reportProgress) {
      await reportProgress("正在预加载图片资源...");
    }
    await preloadImagesForItems(exportItems);
    if (reportProgress) {
      await reportProgress("正在渲染离屏画布...");
    }
    const baseRenderOptions = {
      renderer,
      getElementBounds,
      getFlowEdgeBounds,
      allowLocalFileAccess: getAllowLocalFileAccess(),
      backgroundFill: options.backgroundFill ?? "#ffffff",
      backgroundGrid: Boolean(options.backgroundGrid),
      backgroundPattern: options.backgroundPattern,
      renderTextInCanvas: true,
      scale: options.scale ?? 1,
      devicePixelRatio: 1,
    };
    const initialRenderResult = renderExportBoardToCanvas(exportItems, baseRenderOptions);
    const isOversizedPdfExport =
      initialRenderResult?.errorCode === "PDF_EXPORT_CANVAS_SIDE_EXCEEDED" ||
      initialRenderResult?.errorCode === "PDF_EXPORT_CANVAS_PIXELS_EXCEEDED";
    if (!isOversizedPdfExport) {
      return initialRenderResult;
    }

    const requestedWidth = Math.max(1, Math.round(Number(initialRenderResult?.requestedCanvasWidth || 0) || 1));
    const requestedHeight = Math.max(1, Math.round(Number(initialRenderResult?.requestedCanvasHeight || 0) || 1));
    const requestedPixels = Math.max(1, Math.round(Number(initialRenderResult?.requestedTotalPixels || 0) || 1));
    const continueExport =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(
            [
              `当前${exportLabel}尺寸过大，可能导出很慢、占用大量内存，或最终生成失败。`,
              "",
              `目标画布像素：${requestedWidth} × ${requestedHeight}`,
              `总像素：${requestedPixels.toLocaleString("zh-CN")}`,
              "",
              "是否仍然继续导出？",
            ].join("\n")
          )
        : false;
    if (!continueExport) {
      return {
        canceled: true,
        code: "PDF_EXPORT_CANCELED",
      };
    }
    if (reportProgress) {
      await reportProgress(`正在按大尺寸继续${exportLabel}...`);
    }
    return renderExportBoardToCanvas(exportItems, {
      ...baseRenderOptions,
      allowUnsafeSize: true,
    });
  }

  async function exportBoardAsPdf(options = {}) {
    try {
      setStatus("正在生成 PDF...");
      await waitForUiPaint();
      const { exportBoardAsPdf: runPdfExport } = await import("./export/exportBoardAsPdf.js");
      const result = await runPdfExport(
        (renderOptions) =>
          renderBoardToCanvas({
            ...renderOptions,
            backgroundPattern: resolveExportBackgroundPattern(options),
            exportLabel: "PDF 导出",
            onProgress: async (message) => {
              setStatus(message);
              await waitForUiPaint();
            },
          }),
        options,
        {
          defaultFileName: getFileBaseName(state.boardFileName || state.boardFilePath || "freeflow-board"),
        }
      );
      if (result?.ok) {
        setStatus(result.message || "PDF 已导出");
        return result;
      }
      if (result?.canceled) {
        setStatus("PDF 导出已取消", "warning");
        return result;
      }
      setStatus(result?.message || "导出失败", "warning");
      return result;
    } catch (error) {
      const message = error?.message || "导出失败";
      setStatus(message, "warning");
      return {
        ok: false,
        canceled: false,
        code: "PDF_EXPORT_UNKNOWN_ERROR",
        message,
        fileName: "",
        filePath: "",
        bytes: 0,
        pageWidth: 0,
        pageHeight: 0,
        scaleApplied: 0,
      };
    }
  }

  async function exportBoardAsPng(options = {}) {
    try {
      setStatus("正在生成 PNG...");
      await waitForUiPaint();
      const renderResult = await renderBoardToCanvas({
        scale: options.scale,
        backgroundFill: options.background === "transparent" ? "transparent" : "#ffffff",
        backgroundGrid: options.includeGrid,
        backgroundPattern: resolveExportBackgroundPattern(options),
        exportLabel: "PNG 导出",
        onProgress: async (message) => {
          setStatus(message);
          await waitForUiPaint();
        },
      });
      if (renderResult?.canceled) {
        setStatus("PNG 导出已取消", "warning");
        return {
          ok: false,
          canceled: true,
          code: renderResult.code || "PNG_EXPORT_CANCELED",
          message: "",
          fileName: "",
          filePath: "",
          bytes: 0,
        };
      }
      if (renderResult?.errorCode) {
        const message = renderResult.errorMessage || "PNG 导出失败";
        setStatus(message, "warning");
        return {
          ok: false,
          canceled: false,
          code: renderResult.errorCode,
          message,
          fileName: "",
          filePath: "",
          bytes: 0,
        };
      }
      const dataUrl = renderResult?.canvas?.toDataURL?.("image/png") || "";
      const saveResult = await saveDataUrlAsImage(dataUrl, {
        defaultName: getFileBaseName(state.boardFileName || state.boardFilePath || "freeflow-board"),
      });
      if (saveResult?.ok) {
        setStatus(saveResult.message || "PNG 已导出");
        return {
          ok: true,
          canceled: false,
          code: "PNG_EXPORT_OK",
          message: saveResult.message || "PNG 已导出",
          fileName: `${getFileBaseName(state.boardFileName || state.boardFilePath || "freeflow-board")}.png`,
          filePath: String(saveResult.path || "").trim(),
          bytes: Number(saveResult.size) || 0,
        };
      }
      if (saveResult?.canceled) {
        setStatus("PNG 导出已取消", "warning");
        return {
          ok: false,
          canceled: true,
          code: "PNG_EXPORT_CANCELED",
          message: "",
          fileName: "",
          filePath: "",
          bytes: 0,
        };
      }
      const message = saveResult?.error || "PNG 导出失败";
      setStatus(message, "warning");
      return {
        ok: false,
        canceled: false,
        code: "PNG_EXPORT_WRITE_FAILED",
        message,
        fileName: "",
        filePath: "",
        bytes: 0,
      };
    } catch (error) {
      const message = error?.message || "PNG 导出失败";
      setStatus(message, "warning");
      return {
        ok: false,
        canceled: false,
        code: "PNG_EXPORT_UNKNOWN_ERROR",
        message,
        fileName: "",
        filePath: "",
        bytes: 0,
      };
    }
  }

  function captureCanvasRegionToDataUrl(rect = null, sourceCanvas = null) {
    const baseCanvas = sourceCanvas || refs.canvas;
    if (!baseCanvas) {
      return "";
    }
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let sx = 0;
    let sy = 0;
    let sw = baseCanvas.width;
    let sh = baseCanvas.height;
    if (rect) {
      const left = Math.max(0, Number(rect.left) || 0);
      const top = Math.max(0, Number(rect.top) || 0);
      const width = Math.max(1, Number(rect.width) || 1);
      const height = Math.max(1, Number(rect.height) || 1);
      sx = Math.max(0, Math.min(baseCanvas.width - 1, Math.round(left * dpr)));
      sy = Math.max(0, Math.min(baseCanvas.height - 1, Math.round(top * dpr)));
      sw = Math.max(1, Math.min(baseCanvas.width - sx, Math.round(width * dpr)));
      sh = Math.max(1, Math.min(baseCanvas.height - sy, Math.round(height * dpr)));
    }
    if (sw <= 0 || sh <= 0) {
      return "";
    }
    const output = document.createElement("canvas");
    output.width = sw;
    output.height = sh;
    const outCtx = output.getContext("2d");
    if (!outCtx) {
      return "";
    }
    outCtx.drawImage(baseCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    try {
      return output.toDataURL("image/png");
    } catch {
      return "";
    }
  }

  function renderViewportToCanvas(items = state.board.items, view = state.board.view) {
    const rect = getCanvasRect();
    const width = Math.max(1, Number(rect.width) || 1);
    const height = Math.max(1, Number(rect.height) || 1);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    renderer.render({
      ctx,
      canvas,
      view,
      items,
      selectedIds: [],
      hoverId: null,
      selectionRect: null,
      draftElement: null,
      editingId: null,
      imageEditState: null,
      flowDraft: null,
      allowLocalFileAccess: getAllowLocalFileAccess(),
      backgroundStyle: {
        fill: "#ffffff",
        grid: true,
      },
      renderTextInCanvas: true,
    });
    return { canvas, width, height };
  }

  function safeCanvasToDataUrl(canvas) {
    if (!canvas) {
      return "";
    }
    try {
      return canvas.toDataURL("image/png");
    } catch {
      return "";
    }
  }

  function preloadImageSource(source, timeoutMs = 2000) {
    return new Promise((resolve) => {
      if (!source) {
        resolve(false);
        return;
      }
      let done = false;
      const image = new Image();
      image.crossOrigin = "anonymous";
      const finish = (ok) => {
        if (done) return;
        done = true;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      image.onload = () => {
        clearTimeout(timer);
        finish(true);
      };
      image.onerror = () => {
        clearTimeout(timer);
        finish(false);
      };
      image.src = source;
    });
  }

  async function preloadImagesForItems(items = []) {
    const sources = new Set();
    items.forEach((item) => {
      if (item?.type !== "image") {
        return;
      }
      const source = resolveImageSource(item.dataUrl, item.sourcePath, {
        allowLocalFileAccess: getAllowLocalFileAccess(),
      });
      if (source) {
        sources.add(source);
      }
    });
    if (!sources.size) {
      return true;
    }
    const tasks = Array.from(sources, (src) => preloadImageSource(src));
    await Promise.all(tasks);
    return true;
  }

  async function hydrateImageItems(items = []) {
    const list = Array.isArray(items) ? items : [];
    const readCache = new Map();
    return mapWithConcurrency(
      list,
      async (item) => {
        if (!item || item.type !== "image") {
          return item;
        }
        if (item.dataUrl) {
          return item;
        }
        const sourcePath = String(item.sourcePath || "").trim();
        if (!sourcePath || typeof globalThis?.desktopShell?.readFileBase64 !== "function") {
          return item;
        }
        try {
          if (!readCache.has(sourcePath)) {
            readCache.set(
              sourcePath,
              globalThis.desktopShell.readFileBase64(sourcePath).catch(() => null)
            );
          }
          const result = await readCache.get(sourcePath);
          if (!result?.ok || !result?.data) {
            return item;
          }
          const mime = String(result.mime || "image/png");
          const dataUrl = `data:${mime};base64,${result.data}`;
          return {
            ...item,
            dataUrl,
            source: "blob",
          };
        } catch {
          return item;
        }
      },
      4
    );
  }

  function getExportAnchor(items = []) {
    const bounds = getExportBounds(items);
    if (!bounds) {
      return getCenterScenePoint();
    }
    return {
      x: bounds.right + 24,
      y: bounds.top,
    };
  }

  async function insertImageFromDataUrl(dataUrl, options = {}) {
    const raw = String(dataUrl || "").trim();
    if (!raw) {
      return false;
    }
    const dimensions = await readImageDimensions(raw, "", { allowLocalFileAccess: true });
    if (!dimensions?.width || !dimensions?.height) {
      setStatus("图片生成失败：无有效图像数据");
      return false;
    }
    const point = options.anchorPoint || getCenterScenePoint();
    const file = {
      name: String(options.name || "截图").trim() || "截图",
      type: "image/png",
    };
    const item = imageModule.createElement(file, point, raw, dimensions);
    item.source = "blob";
    item.dataUrl = raw;
    item.sourcePath = "";
    item.fileId = "";
    item.locked = false;
    item.memoVisible = false;
    item.memo = "";
    item.groupId = "";
    if (useLocalFileSystem && options.persistToImportFolder !== false) {
      const ok = await saveImageItemToImportFolder(item, { dataUrlOverride: raw, nameOverride: file.name });
      if (ok) {
        setSaveToast("图片已保存至当前画布目录下的 importImage 文件夹");
      }
    }
    pushItems([item], { reason: "插入截图", statusText: "截图已插入画布" });
    state.lastSelectionSource = "click";
    return true;
  }

  async function saveDataUrlAsImage(dataUrl, options = {}) {
    const name = normalizeExportName(options.defaultName || "freeflow-export", "freeflow-export");
    const raw = String(dataUrl || "").trim();
    if (!raw.startsWith("data:image/png") || raw.length < 128) {
      return { ok: false, error: "图片生成失败：无效 PNG 数据" };
    }
    if (useLocalFileSystem) {
      const result = await saveImageDataToImportFolder({
        dataUrl: raw,
        name,
        mime: "image/png",
      });
      if (result?.ok) {
        const message = "图片已保存至当前画布目录下的 importImage 文件夹";
        setSaveToast(message);
        return { ok: true, path: result.filePath, message, size: result.size || 0 };
      }
      return { ok: false, error: result?.error || "图片保存失败" };
    }
    const blob = await (await fetch(raw)).blob();
    const filename = `${name}.png`;
    if (typeof globalThis?.desktopShell?.pickImageSavePath === "function" && typeof globalThis?.desktopShell?.writeFile === "function") {
      const picked = await globalThis.desktopShell.pickImageSavePath({ defaultName: filename });
      if (!picked || picked.canceled || !picked.filePath) {
        return { ok: false, canceled: true };
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const writeResult = await globalThis.desktopShell.writeFile(picked.filePath, bytes);
      if (!writeResult?.ok) {
        return { ok: false, error: writeResult?.error || "写入文件失败" };
      }
      return { ok: true, path: picked.filePath, message: "图片已导出" };
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { ok: true, message: "图片已导出" };
  }

  async function saveTextAsFile(text, options = {}) {
    const name = normalizeExportName(options.defaultName || "freeflow-text", "freeflow-text");
    const filename = `${name}.txt`;
    if (typeof globalThis?.desktopShell?.pickTextSavePath === "function" && typeof globalThis?.desktopShell?.writeFile === "function") {
      const result = await globalThis.desktopShell.pickTextSavePath({ defaultName: filename });
      if (!result || result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }
      const encoder = new TextEncoder();
      const writeResult = await globalThis.desktopShell.writeFile(result.filePath, encoder.encode(String(text || "")));
      if (!writeResult?.ok) {
        return { ok: false, error: writeResult?.error || "写入文件失败" };
      }
      return { ok: true, path: result.filePath };
    }
    const blob = new Blob([String(text || "")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  }

  async function exportItemsAsImage(items = [], options = {}) {
    try {
      if (!items.length) {
        return false;
      }
      const exportItems = collectCardLinkedItems(items);
      const exportBounds = getExportBounds(exportItems);
      if (!exportBounds) {
        setStatus("导出失败：无法确定导出范围");
        return false;
      }
      const hydratedItems = await hydrateImageItems(exportItems);
      const preparedItems = buildExportReadyBoardItems(hydratedItems);
      await preloadImagesForItems(preparedItems);
      const baseRenderOptions = {
        renderer,
        getElementBounds,
        getFlowEdgeBounds,
        allowLocalFileAccess: getAllowLocalFileAccess(),
        backgroundFill: options.forceWhiteBackground ? "#ffffff" : "transparent",
        backgroundGrid: false,
        renderTextInCanvas: true,
        scale: options.scale ?? 1,
        devicePixelRatio: 1,
        exportBounds,
      };
      let renderResult = renderExportBoardToCanvas(preparedItems, baseRenderOptions);
      const isOversizedExport =
        renderResult?.errorCode === "PDF_EXPORT_CANVAS_SIDE_EXCEEDED" ||
        renderResult?.errorCode === "PDF_EXPORT_CANVAS_PIXELS_EXCEEDED";
      if (isOversizedExport) {
        const requestedWidth = Math.max(1, Math.round(Number(renderResult?.requestedCanvasWidth || 0) || 1));
        const requestedHeight = Math.max(1, Math.round(Number(renderResult?.requestedCanvasHeight || 0) || 1));
        const requestedPixels = Math.max(1, Math.round(Number(renderResult?.requestedTotalPixels || 0) || 1));
        const continueExport =
          typeof window !== "undefined" && typeof window.confirm === "function"
            ? window.confirm(
                [
                  "当前图片导出尺寸过大，可能导出很慢、占用大量内存，或最终生成失败。",
                  "",
                  `目标画布像素：${requestedWidth} × ${requestedHeight}`,
                  `总像素：${requestedPixels.toLocaleString("zh-CN")}`,
                  "",
                  "是否仍然继续导出？",
                ].join("\n")
              )
            : false;
        if (!continueExport) {
          setStatus("图片导出已取消", "warning");
          return false;
        }
        renderResult = renderExportBoardToCanvas(preparedItems, {
          ...baseRenderOptions,
          allowUnsafeSize: true,
        });
      }
      if (!renderResult?.canvas) {
        setStatus("导出失败：无法生成图像");
        return false;
      }
      const dataUrl = safeCanvasToDataUrl(renderResult.canvas);
      if (!dataUrl) {
        setStatus("导出失败：存在无法捕获的图片内容");
        return false;
      }
      const result = await saveDataUrlAsImage(dataUrl, {
        defaultName: options.defaultName || "freeflow-export",
      });
      if (result?.ok) {
        setStatus(result.message || "图片已导出");
        return true;
      }
      if (result?.canceled) {
        return false;
      }
      setStatus(result?.error || "导出失败");
      return false;
    } catch (error) {
      setStatus(error?.message || "导出失败");
      return false;
    }
  }

  async function exportTextItem(item) {
    if (!item) {
      return false;
    }
    const plain = sanitizeText(item.plainText || item.text || htmlToPlainText(item.html || ""));
    if (!plain) {
      setStatus("文本为空");
      return false;
    }
    const result = await saveTextAsFile(plain, { defaultName: item.name || "文本" });
    if (result?.ok) {
      setStatus("已导出 TXT");
      return true;
    }
    if (result?.canceled) {
      return false;
    }
    setStatus(result?.error || "导出失败");
    return false;
  }

  async function startCanvasCapture() {
    if (!refs.canvas) {
      return;
    }
    captureMode = "canvas";
    state.selectionRect = null;
    setStatus("拖动框选截图区域，单击直接截取当前画布");
    scheduleRender();
  }

  async function runCanvasCapture(pointer) {
    try {
      const start = pointer?.startScenePoint;
      const current = pointer?.currentScenePoint || start;
      const hasDrag = start && current && hasDragExceededThreshold(start, current, 6);
      let dataUrl = "";
      let anchorPoint = getCenterScenePoint();
      if (hasDrag) {
        const selectionBounds = getSelectionSceneBounds({
          start,
          current,
        });
        const renderResult = await renderSceneBoundsToCanvas(selectionBounds, {
          backgroundFill: "transparent",
          backgroundGrid: false,
          exportLabel: "截图导出",
          cancelCode: "CAPTURE_EXPORT_CANCELED",
          onProgress: async (message) => {
            setStatus(message);
            await waitForUiPaint();
          },
        });
        if (renderResult?.canceled) {
          return;
        }
        if (!renderResult?.canvas) {
          setStatus(renderResult?.errorMessage || "截图失败");
          return;
        }
        dataUrl = safeCanvasToDataUrl(renderResult.canvas);
        anchorPoint = {
          x: Math.max(start.x, current.x) + 24,
          y: Math.min(start.y, current.y),
        };
      } else {
        const hydratedItems = await hydrateImageItems(state.board.items);
        await preloadImagesForItems(hydratedItems);
        const viewportCanvas = renderViewportToCanvas(hydratedItems, state.board.view);
        if (!viewportCanvas?.canvas) {
          setStatus("截图失败");
          return;
        }
        dataUrl = safeCanvasToDataUrl(viewportCanvas.canvas);
      }
      if (!dataUrl) {
        setStatus("截图失败：存在无法捕获的图片内容");
        return;
      }
      setStatus("正在生成截图...");
      const result = await saveDataUrlAsImage(dataUrl, { defaultName: "画布截图" });
      if (result?.ok) {
        const inserted = await insertImageFromDataUrl(dataUrl, {
          name: "画布截图",
          anchorPoint,
          persistToImportFolder: false,
        });
        if (!inserted) {
          setStatus("截图已保存，但插回画布失败");
          return;
        }
        setStatus(result.message || "图片已导出");
        return;
      }
      if (!result?.canceled) {
        setStatus(result?.error || "截图失败：无法生成图片");
      }
    } catch (error) {
      setStatus(error?.message || "截图失败");
    } finally {
      state.selectionRect = null;
      captureMode = null;
      scheduleRender();
    }
  }

  function setLocalFileAccess(enabled) {
    const next = Boolean(enabled);
    if (!state.board.preferences || typeof state.board.preferences !== "object") {
      state.board.preferences = { allowLocalFileAccess: next };
    } else {
      state.board.preferences.allowLocalFileAccess = next;
    }
    syncBoard({ persist: true, emit: true });
  }

  function toggleLocalFileAccess() {
    setLocalFileAccess(!getAllowLocalFileAccess());
  }

  function setBoardBackgroundPattern(pattern = "dots") {
    const next = normalizeBoardBackgroundPattern(pattern);
    if (!state.board.preferences || typeof state.board.preferences !== "object") {
      state.board.preferences = {
        allowLocalFileAccess: getAllowLocalFileAccess(),
        backgroundPattern: next,
      };
    } else {
      state.board.preferences.backgroundPattern = next;
    }
    syncBoard({ persist: true, emit: true });
    setStatus(`画布背景已切换为${next === "none" ? "无背景" : next === "dots" ? "点阵" : next === "grid" ? "方格" : next === "lines" ? "横线" : "工程网格"}`);
  }

  function cancelTextEdit() {
    if (!state.editingId || state.editingType !== "text") {
      return false;
    }
    state.editingId = null;
    state.editingType = null;
    refs.editor?.classList.add("is-hidden");
    refs.richEditor?.classList.add("is-hidden");
    richTextSession.clear({ destroyAdapter: false });
    if (state.tool === "text" && shouldExitTextToolAfterEdit) {
      shouldExitTextToolAfterEdit = false;
      setTool("select");
      return true;
    }
    syncBoard({ persist: false, emit: true });
    return true;
  }

  function clearTransientState() {
    state.pointer = null;
    state.selectionRect = null;
    state.draftElement = null;
    state.hoverId = null;
    state.hoverHandle = null;
    state.hoverConnector = null;
    flowDraft = null;
    clearAlignmentSnap("clear-transient");
  }

  function getAggregateBounds(items = []) {
    const boundsList = items
      .filter(Boolean)
      .map((item) => getElementBounds(item))
      .filter((bounds) => Number.isFinite(bounds.left) && Number.isFinite(bounds.top));
    if (!boundsList.length) {
      return null;
    }
    const result = boundsList.reduce(
      (acc, bounds) => {
        acc.left = Math.min(acc.left, bounds.left);
        acc.top = Math.min(acc.top, bounds.top);
        acc.right = Math.max(acc.right, bounds.right);
        acc.bottom = Math.max(acc.bottom, bounds.bottom);
        return acc;
      },
      { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
    );
    result.width = Math.max(1, result.right - result.left);
    result.height = Math.max(1, result.bottom - result.top);
    return result;
  }

  function setTool(nextTool = "select") {
    const normalized = normalizeTool(nextTool);
    clearAlignmentSnap("tool-change");
    store.setTool(normalized);
    shouldExitTextToolAfterEdit = normalized === "text";
    if (state.tool !== "text") {
      cancelTextEdit();
      cancelFlowNodeEdit();
      cancelTableEdit();
      cancelFileMemoEdit();
      cancelImageMemoEdit();
      finishImageEdit();
    }
    syncBoard({ persist: false, emit: true });
  }

  function setMode(nextMode = "canvas2d") {
    store.setMode(normalizeMode(nextMode));
    if (!isInteractiveMode()) {
      clearTransientState();
      cancelTextEdit();
      cancelFlowNodeEdit();
      cancelTableEdit();
      cancelFileMemoEdit();
      cancelImageMemoEdit();
      finishImageEdit();
    }
    syncBoard({ persist: false, emit: true });
  }

  function removeSelected() {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    const remove = new Set(state.board.selectedIds);
    const nextItems = [];
    let removedCount = 0;
    let lockedCount = 0;
    state.board.items.forEach((item) => {
      if (!remove.has(item.id)) {
        nextItems.push(item);
        return;
      }
      if (isLockedItem(item)) {
        lockedCount += 1;
        nextItems.push(item);
        return;
      }
      removedCount += 1;
    });
    if (!removedCount) {
      syncBoard({ persist: false, emit: true });
      if (lockedCount) {
        setStatus("存在锁定文本，未删除");
      }
      return false;
    }
    state.board.items = nextItems;
    state.board.selectedIds = state.board.selectedIds.filter((id) => {
      const item = nextItems.find((entry) => entry.id === id);
      return Boolean(item);
    });
    commitHistory(before, "删除元素");
    setStatus(`已删除 ${removedCount} 个元素`);
    if (lockedCount) {
      setStatus(`已删除 ${removedCount} 个元素（${lockedCount} 个锁定未删除）`);
    }
    return true;
  }

  function removeFileCardById(id) {
    const before = takeHistorySnapshot(state);
    const result = removeFileCardEntry(state.board.items, id);
    if (!result.removed) {
      return false;
    }
    state.board.items = result.items;
    state.board.selectedIds = state.board.selectedIds.filter((itemId) => itemId !== id);
    commitHistory(before, "删除文件卡");
    setStatus("已删除文件卡");
    return true;
  }

  async function copySelection() {
    const items = state.board.items.filter((item) => state.board.selectedIds.includes(item.id));
    if (!items.length) {
      return null;
    }
    const fileBacked = items.filter((item) => item.type === "fileCard" || item.type === "image");
    if (fileBacked.length) {
      const changed = await resolveFileCardSourcesForItems(fileBacked);
      if (changed) {
        syncBoard({ persist: true, emit: true });
      }
    }
    const copied = await clipboardBroker.copyItemsToClipboard(items);
    const flowback = shouldBuildStructuredFlowback(items)
      ? structuredImportRuntime.buildFlowbackPayload(items)
      : null;
    const externalOutput = flowback?.externalOutput || {};
    const nextClipboard = copied
      ? {
          ...copied,
          text: String(externalOutput.text || copied.text || ""),
          html: String(externalOutput.html || copied.html || ""),
          filePaths:
            Array.isArray(externalOutput.filePaths) && externalOutput.filePaths.length
              ? externalOutput.filePaths.slice()
              : Array.isArray(copied.filePaths)
                ? copied.filePaths.slice()
                : [],
          structuredFlowback: flowback,
        }
      : copied;
    if (nextClipboard) {
      clipboardBroker.setPayload(nextClipboard);
    }
    state.clipboard = nextClipboard ? { ...nextClipboard, pasteCount: 0 } : nextClipboard;
    if (fileBacked.length && fileBacked.length === items.length) {
      const hasPaths = (state.clipboard?.filePaths || []).length > 0;
      if (!hasPaths) {
        setStatus("复制失败：图片/文件缺少本地路径");
        return state.clipboard;
      }
    }
    setStatus(`已复制 ${items.length} 个元素`);
    return state.clipboard;
  }

  function shouldBuildStructuredFlowback(items = []) {
    return (Array.isArray(items) ? items : []).some((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      if (item.structuredImport && typeof item.structuredImport === "object") {
        return true;
      }
      return (
        item.type === "flowNode" ||
        item.type === "codeBlock" ||
        item.type === "table" ||
        item.type === "mathBlock" ||
        item.type === "mathInline"
      );
    });
  }

  function duplicateElementsWithDelta(items = [], deltaX = 0, deltaY = 0, options = {}) {
    const forceWrapText = options?.forceWrapText === true;
    const duplicatedItems = (Array.isArray(items) ? items : []).map((item) => {
      const duplicated = clone(item);
      duplicated.id = createId(duplicated?.type || "item");
      const moved = moveElement(duplicated, deltaX, deltaY);
      if (forceWrapText && moved?.type === "text") {
        const widthHint = Math.max(160, Number(moved.width || 0) || 0) || 320;
        const fontSize = Math.max(12, Number(moved.fontSize || DEFAULT_TEXT_FONT_SIZE) || DEFAULT_TEXT_FONT_SIZE);
        const measured = getTextMinSize(
          {
            ...moved,
            textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
            textResizeMode: TEXT_RESIZE_MODE_WRAP,
            wrapMode: TEXT_WRAP_MODE_MANUAL,
            fontSize,
          },
          {
            widthHint,
            fontSize,
          }
        );
        return normalizeElement({
          ...moved,
          textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
          textResizeMode: TEXT_RESIZE_MODE_WRAP,
          wrapMode: TEXT_WRAP_MODE_MANUAL,
          width: Math.max(160, widthHint),
          height: Math.max(40, Number(measured?.height || 0) || Number(moved.height || 0) || 40),
        });
      }
      return normalizeElement(moved);
    });
    return buildExportReadyBoardItems(duplicatedItems);
  }

  function pasteInternalClipboard(anchorPoint = getCenterScenePoint(), options = {}) {
    const payload = state.clipboard;
    if (!payload?.items?.length) {
      return false;
    }
    const stagger = options?.stagger !== false;
    const historyReason = String(options?.historyReason || "粘贴元素");
    const statusPrefix = String(options?.statusPrefix || "已粘贴");
    const before = takeHistorySnapshot(state);
    const bounds = getBoardBounds(payload.items);
    const pasteCount = Math.max(0, Number(payload.pasteCount) || 0);
    const groupOffset = stagger ? 28 + pasteCount * 20 : 0;
    const anchorX = Number(anchorPoint?.x || 0) + groupOffset;
    const anchorY = Number(anchorPoint?.y || 0) + groupOffset;
    const deltaX = anchorX - Number(bounds?.left || 0);
    const deltaY = anchorY - Number(bounds?.top || 0);
    const pasted = duplicateElementsWithDelta(payload.items, deltaX, deltaY, {
      forceWrapText: options?.forceWrapText === true,
    });
    payload.pasteCount = stagger ? pasteCount + 1 : pasteCount;
    state.board.items.push(...pasted);
    state.board.selectedIds = pasted.map((item) => item.id);
    void hydrateFileCardIds(pasted);
    commitHistory(before, historyReason);
    setStatus(`${statusPrefix} ${pasted.length} 个元素`);
    return true;
  }

  function clearInternalClipboard() {
    state.clipboard = null;
  }

  function normalizeClipboardPathValue(value = "") {
    return String(value || "").trim().replace(/\//g, "\\").toLowerCase();
  }

  function normalizeClipboardTextValue(value = "") {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function areClipboardPathListsEqual(left = [], right = []) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((entry, index) => entry === right[index]);
  }

  function matchesInternalClipboardByMarker(dataTransfer) {
    if (!state.clipboard?.items?.length || !dataTransfer?.types) {
      return false;
    }
    try {
      const customRaw = String(dataTransfer.getData(CANVAS_CLIPBOARD_MIME) || "").trim();
      const htmlRaw = String(dataTransfer.getData("text/html") || "");
      const parsed = parseInternalClipboardMarker(customRaw) || parseInternalClipboardMarkerFromHtml(htmlRaw);
      if (!parsed) {
        return false;
      }
      return Number(parsed?.copiedAt) === Number(state.clipboard?.copiedAt);
    } catch {
      return false;
    }
  }

  async function shouldUseInternalClipboard() {
    const payload = state.clipboard;
    if (!payload?.items?.length) {
      return false;
    }

    const payloadPaths = Array.isArray(payload.filePaths)
      ? payload.filePaths.map((entry) => normalizeClipboardPathValue(entry)).filter(Boolean)
      : [];
    const clipboardPaths = (await clipboardBroker.readSystemClipboardFiles())
      .map((entry) => normalizeClipboardPathValue(entry))
      .filter(Boolean);

    if (clipboardPaths.length || payloadPaths.length) {
      const sameFiles = areClipboardPathListsEqual(payloadPaths, clipboardPaths);
      if (!sameFiles) {
        clearInternalClipboard();
        return false;
      }
      return true;
    }

    const payloadText = normalizeClipboardTextValue(payload.text || "");
    const clipboardText = normalizeClipboardTextValue(await clipboardBroker.readSystemClipboardText());

    if (!payloadText) {
      clearInternalClipboard();
      return false;
    }
    if (clipboardText !== payloadText) {
      clearInternalClipboard();
      return false;
    }
    return true;
  }

  async function cutSelection() {
    const copied = await copySelection();
    if (!copied) {
      return false;
    }
    removeSelected();
    return true;
  }

  async function importFiles(files, anchorPoint = getCenterScenePoint()) {
    const structuredDescriptor = buildProgrammaticFileDescriptor(files, anchorPoint);
    if (structuredDescriptor) {
      const handled = await tryStructuredImportDescriptor(structuredDescriptor, anchorPoint, {
        reason: "导入文件",
        statusText: `已导入 ${Array.isArray(files) ? files.length : 0} 个文件`,
        context: {
          origin: "engine-import-files",
        },
      });
      if (handled) {
        return true;
      }
    }
    const items = await dragBroker.createElementsFromFiles(files, anchorPoint);
    try {
      await persistImportedImages(items);
    } catch {
      // ignore import persistence failures
    }
    return pushItems(items, { reason: "导入文件", statusText: `已导入 ${items.length} 个文件` });
  }

  function insertTextAt(anchorPoint, text) {
    const items = dragBroker.createElementsFromText(text, anchorPoint).map((entry) => {
      if (!entry || entry.type !== "text") {
        return entry;
      }
      const plainText = sanitizeText(entry.plainText || entry.text || htmlToPlainText(entry.html || ""));
      syncTextLinkSemanticFields(entry, plainText, entry.richTextDocument || null, {
        semanticEnabled: linkSemanticEnabled,
      });
      scheduleUrlMetaHydrationForItem(entry);
      return entry;
    });
    return pushItems(items, { reason: "插入文本", statusText: "已插入文本" });
  }

  function buildStructuredImportContext(anchorPoint, extra = {}) {
    const pointer =
      anchorPoint && Number.isFinite(anchorPoint.x) && Number.isFinite(anchorPoint.y)
        ? { x: Number(anchorPoint.x), y: Number(anchorPoint.y) }
        : null;
    return {
      environment: "engine-live",
      origin: String(extra.origin || "createCanvas2DEngine"),
      boardId: String(state.boardFilePath || ""),
      targetMode: String(state.mode || ""),
      targetElementId: String(state.editingId || ""),
      pointer,
      tags: ["engine-live", "full-cutover"],
      ...extra,
    };
  }

  async function applyStructuredCommitResult(commitResult, { reason = "", statusText = "" } = {}) {
    if (!commitResult?.ok || !Array.isArray(commitResult.items) || !commitResult.items.length) {
      return false;
    }
    try {
      await persistImportedImages(commitResult.items);
    } catch {
      // ignore import persistence failures
    }
    const before = takeHistorySnapshot(state);
    state.board = normalizeBoard(
      repairMisclassifiedCodeBlocksOnBoard(commitResult.board || state.board, DEFAULT_TEXT_FONT_SIZE)
    );
    void hydrateFileCardIds(commitResult.items);
    commitHistory(before, reason || "结构化导入");
    if (statusText) {
      setStatus(statusText);
    }
    return true;
  }

  async function tryStructuredImportDescriptor(descriptor, anchorPoint, { reason = "", statusText = "", context = {} } = {}) {
    if (!descriptor || descriptor.status === "error" || descriptor.status === "unsupported") {
      return false;
    }
    try {
      const result = await structuredImportRuntime.runDescriptor({
        descriptor,
        board: state.board,
        anchorPoint,
        context: buildStructuredImportContext(anchorPoint, context),
      });
      if (result?.pipeline === "structured" && result?.commitResult?.ok) {
        return applyStructuredCommitResult(result.commitResult, { reason, statusText });
      }
    } catch {
      // fall back to legacy pipeline
    }
    return false;
  }

  function buildProgrammaticFileDescriptor(files, anchorPoint) {
    const entries = Array.isArray(files)
      ? files
          .map((file, index) => {
            const filePath = typeof file?.path === "string" ? file.path : "";
            const name = typeof file?.name === "string" ? file.name : "";
            if (!filePath && !name) {
              return null;
            }
            const mimeType = typeof file?.type === "string" ? file.type : "";
            return {
              entryId: `programmatic-file-${index}`,
              kind: mimeType.startsWith("image/") ? INPUT_ENTRY_KINDS.IMAGE : INPUT_ENTRY_KINDS.FILE,
              status: "ready",
              mimeType,
              name,
              size: Number.isFinite(file?.size) ? Number(file.size) : null,
              raw: {
                filePath,
              },
              meta: {
                displayName: name,
              },
            };
          })
          .filter(Boolean)
      : [];
    if (!entries.length) {
      return null;
    }
    return createInputDescriptor({
      descriptorId: `programmatic-file-${Date.now()}`,
      channel: INPUT_CHANNELS.PROGRAMMATIC,
      sourceKind: entries.some((entry) => entry.kind === INPUT_ENTRY_KINDS.IMAGE)
        ? INPUT_SOURCE_KINDS.IMAGE_RESOURCE
        : INPUT_SOURCE_KINDS.FILE_RESOURCE,
      status: "ready",
      context: {
        origin: "engine-import-files",
        pointer: anchorPoint,
      },
      entries,
    });
  }


  function createEmptyText(anchorPoint) {
    const before = takeHistorySnapshot(state);
    const item = createTextElement(anchorPoint, "", "");
    state.board.items.push(item);
    state.board.selectedIds = [item.id];
    commitHistory(before, "创建文本");
    beginTextEdit(item.id);
    return true;
  }


  function createMindNode(anchorPoint) {
    const before = takeHistorySnapshot(state);
    const item = createMindNodeElement(anchorPoint, "节点");
    state.board.items.push(item);
    state.board.selectedIds = [item.id];
    commitHistory(before, "创建节点");
    setStatus("已添加节点");
    return true;
  }

  function createFlowNode(anchorPoint) {
    const before = takeHistorySnapshot(state);
    const item = flowModule.createNode(anchorPoint);
    state.board.items.push(item);
    state.board.selectedIds = [item.id];
    commitHistory(before, "创建节点");
    setStatus("已添加节点");
    beginFlowNodeEdit(item.id);
    return true;
  }

  async function buildExportDragPayload(items) {
    const payload = { paths: [], texts: [], images: [] };
    for (const item of items) {
      if (item.type === "fileCard") {
        const path = String(item?.sourcePath || "").trim();
        if (path) {
          payload.paths.push(path);
        }
      }
      if (item.type === "text") {
        const content = sanitizeText(item.plainText || item.text || htmlToPlainText(item.html || "")).trim();
        if (content) {
          payload.texts.push({
            name: normalizeExportName(item.name || "Text", "Text"),
            content,
          });
        }
      }
      if (item.type === "image") {
        const path = String(item?.sourcePath || "").trim();
        if (path) {
          payload.paths.push(path);
          continue;
        }
        const dataUrl = String(item?.dataUrl || "").trim();
        if (!dataUrl) {
          continue;
        }
        try {
          const { data, mime } = await readDataUrlAsBase64(dataUrl);
          if (data) {
            payload.images.push({
              name: normalizeExportName(item.name || "Image", "Image"),
              mime: mime || item?.mime || "image/png",
              data,
            });
          }
        } catch {
          // ignore image conversion failures
        }
      }
    }
    payload.paths = [...new Set(payload.paths.filter(Boolean))];
    payload.texts = payload.texts.filter((entry) => entry?.content);
    payload.images = payload.images.filter((entry) => entry?.data);
    return payload;
  }

  async function startExportDragForSelection() {
    if (typeof globalThis?.desktopShell?.startExportDrag !== "function") {
      setStatus("无法拖拽：当前环境不支持导出拖拽");
      return false;
    }
    const selectedItems = state.board.items.filter((item) => state.board.selectedIds.includes(item.id));
    const exportables = selectedItems.filter((item) => isExportableItem(item));
    if (!exportables.length) {
      setStatus("无法拖拽：未选中可导出的内容");
      return false;
    }
    const payload = await buildExportDragPayload(exportables);
    if (!payload.paths.length && !payload.texts.length && !payload.images.length) {
      setStatus("无法拖拽：内容缺少可导出数据");
      return false;
    }
    try {
      const result = await globalThis.desktopShell.startExportDrag(payload);
      if (!result?.ok) {
        setStatus(result?.error || "拖拽失败");
        return false;
      }
      return true;
    } catch (error) {
      setStatus(error?.message || "拖拽失败");
      return false;
    }
  }

  function createShapeAt(anchorPoint, shapeType) {
    const before = takeHistorySnapshot(state);
    const start = { x: Number(anchorPoint?.x) || 0, y: Number(anchorPoint?.y) || 0 };
    const presets = {
      rect: { width: 200, height: 120 },
      ellipse: { width: 200, height: 120 },
      highlight: { width: 240, height: 80 },
      line: { width: 220, height: 0 },
      arrow: { width: 220, height: 0 },
    };
    const preset = presets[shapeType] || presets.rect;
    const end = {
      x: start.x + preset.width,
      y: start.y + preset.height,
    };
    const item = shapeModule.createElement(shapeType, start, end);
    state.board.items.push(item);
    state.board.selectedIds = [item.id];
    commitHistory(before, "创建图形");
    setStatus("已添加图案");
    return true;
  }

  function updateHover(scenePoint) {
    let nextHoverHandle = null;
    let nextHoverConnector = null;
    let hit = null;
    if (isInteractiveMode()) {
      const selectedId = state.tool === "select" && state.board.selectedIds.length === 1 ? state.board.selectedIds[0] : "";
      const selectedItem = selectedId ? state.board.items.find((item) => item.id === selectedId) : null;
      if (selectedItem && selectedItem.type === "image" && hitTestImageRotateHandle(selectedItem, scenePoint, state.board.view)) {
        nextHoverHandle = "rotate-image";
      } else if (selectedItem && selectedItem.type === "shape" && hitTestShapeRotateHandle(selectedItem, scenePoint, state.board.view)) {
        nextHoverHandle = "rotate-shape";
      } else if (selectedItem && selectedItem.type === "flowNode") {
        const side = flowModule.getConnectorHit(selectedItem, scenePoint, state.board.view);
        if (side) {
          nextHoverHandle = "flow-connector";
          nextHoverConnector = { id: selectedItem.id, side };
        } else {
          nextHoverHandle = hitTestHandle(selectedItem, scenePoint, state.board.view.scale);
        }
      } else {
        nextHoverHandle = selectedItem ? hitTestHandle(selectedItem, scenePoint, state.board.view.scale) : null;
      }
      hit = hitTestElement(state.board.items, scenePoint, state.board.view.scale);
      if (hit?.type === "flowNode" && !nextHoverConnector) {
        const side = flowModule.getConnectorHit(hit, scenePoint, state.board.view);
        if (side) {
          nextHoverHandle = "flow-connector";
          nextHoverConnector = { id: hit.id, side };
        }
      }
    }
    const nextHoverId = hit?.id || null;
    if (
      state.hoverId !== nextHoverId ||
      state.hoverHandle !== nextHoverHandle ||
      state.hoverConnector?.id !== nextHoverConnector?.id ||
      state.hoverConnector?.side !== nextHoverConnector?.side
    ) {
      state.hoverId = nextHoverId;
      state.hoverHandle = nextHoverHandle;
      state.hoverConnector = nextHoverConnector;
      scheduleRender();
    }
  }

  function onPointerDown(event) {
    if (!isInteractiveMode() || (event.button !== 0 && event.button !== 1 && event.button !== 2)) {
      return;
    }
    if (event.button === 0) {
      suppressNativeDrag = true;
    }
    refs.canvas?.focus();
    const scenePoint = toScenePoint(event.clientX, event.clientY);
    updateLastPointerPoint(scenePoint);
    clearAlignmentSnap("pointer-down");

    if (captureMode === "canvas" && event.button === 0) {
      event.preventDefault();
      state.pointer = {
        type: "capture",
        startScenePoint: scenePoint,
        currentScenePoint: scenePoint,
        startClientX: Number(event.clientX || 0),
        startClientY: Number(event.clientY || 0),
      };
      state.selectionRect = { start: scenePoint, current: scenePoint };
      refs.canvas?.setPointerCapture?.(event.pointerId);
      scheduleRender();
      return;
    }

    if (state.editingType === "file-memo") {
      const memoItem = state.board.items.find((item) => item.id === state.editingId && item.type === "fileCard");
      if (memoItem) {
        const memoBounds = getFileCardMemoBounds(memoItem);
        const insideMemo =
          scenePoint.x >= memoBounds.left &&
          scenePoint.x <= memoBounds.right &&
          scenePoint.y >= memoBounds.top &&
          scenePoint.y <= memoBounds.bottom;
        if (!insideMemo) {
          commitFileMemoEdit();
        }
      } else {
        cancelFileMemoEdit();
      }
    }
    if (state.editingType === "image-memo") {
      const memoItem = state.board.items.find((item) => item.id === state.editingId && item.type === "image");
      if (memoItem) {
        const memoBounds = getImageMemoBounds(memoItem);
        const insideMemo =
          scenePoint.x >= memoBounds.left &&
          scenePoint.x <= memoBounds.right &&
          scenePoint.y >= memoBounds.top &&
          scenePoint.y <= memoBounds.bottom;
        if (!insideMemo) {
          commitImageMemoEdit();
        }
      } else {
        cancelImageMemoEdit();
      }
    }

    if (event.button === 1) {
      event.preventDefault();
      state.pointer = createPanPointer(event);
      refs.canvas?.setPointerCapture?.(event.pointerId);
      syncCanvasCursor();
      return;
    }

    if (state.editingType === "image" && state.editingId && event.button === 0 && lightImageEditor.isEditing(state.editingId)) {
      const result = lightImageEditor.handlePointerDown({ event, scenePoint });
      if (result?.handled) {
        event.preventDefault();
        if (result.pointer) {
          state.pointer = result.pointer;
          refs.canvas?.setPointerCapture?.(event.pointerId);
        }
        return;
      }
    }

    if (event.button === 0) {
      const flowTarget = hitTestElement(state.board.items, scenePoint, state.board.view.scale);
      if (flowTarget?.type === "flowNode") {
        const side = flowModule.getConnectorHit(flowTarget, scenePoint, state.board.view);
        if (side) {
          if (isLockedItem(flowTarget)) {
            return;
          }
          const style = event.altKey ? "arrow" : event.shiftKey ? "dashed" : "solid";
          state.pointer = {
            type: "flow-connect",
            pointerId: event.pointerId,
            fromId: flowTarget.id,
            fromSide: side,
            style,
          };
          flowDraft = {
            fromId: flowTarget.id,
            fromSide: side,
            toPoint: scenePoint,
            style,
          };
          refs.canvas?.setPointerCapture?.(event.pointerId);
          scheduleRender();
          return;
        }
      }
    }

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const singleSelectedId = state.tool === "select" && state.board.selectedIds.length === 1 ? state.board.selectedIds[0] : "";
    const singleSelectedItem = singleSelectedId ? state.board.items.find((item) => item.id === singleSelectedId) : null;
    const rotateHandleHit =
      event.button === 0 &&
      singleSelectedItem?.type === "image" &&
      hitTestImageRotateHandle(singleSelectedItem, scenePoint, state.board.view);
    if (rotateHandleHit) {
      if (isLockedItem(singleSelectedItem)) {
        return;
      }
      const center = {
        x: Number(singleSelectedItem.x || 0) + Number(singleSelectedItem.width || 0) / 2,
        y: Number(singleSelectedItem.y || 0) + Number(singleSelectedItem.height || 0) / 2,
      };
      const startAngle = Math.atan2(scenePoint.y - center.y, scenePoint.x - center.x);
      state.pointer = {
        type: "rotate-image",
        pointerId: event.pointerId,
        itemId: singleSelectedItem.id,
        center,
        startAngle,
        startRotation: Number(singleSelectedItem.rotation || 0),
        before: takeHistorySnapshot(state),
      };
      refs.canvas?.setPointerCapture?.(event.pointerId);
      state.hoverHandle = "rotate-image";
      syncCanvasCursor();
      return;
    }
    const shapeRotateHit =
      event.button === 0 &&
      singleSelectedItem?.type === "shape" &&
      hitTestShapeRotateHandle(singleSelectedItem, scenePoint, state.board.view);
    if (shapeRotateHit) {
      if (isLockedItem(singleSelectedItem)) {
        return;
      }
      const bounds = getElementBounds(singleSelectedItem);
      const center = {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      };
      const startAngle = Math.atan2(scenePoint.y - center.y, scenePoint.x - center.x);
      state.pointer = {
        type: "rotate-shape",
        pointerId: event.pointerId,
        itemId: singleSelectedItem.id,
        center,
        startAngle,
        startRotation: Number(singleSelectedItem.rotation || 0),
        before: takeHistorySnapshot(state),
      };
      refs.canvas?.setPointerCapture?.(event.pointerId);
      state.hoverHandle = "rotate-shape";
      syncCanvasCursor();
      return;
    }
    const activeHandle = event.button === 0 && singleSelectedItem ? hitTestHandle(singleSelectedItem, scenePoint, state.board.view.scale) : null;
    if (activeHandle) {
      if (isLockedItem(singleSelectedItem)) {
        return;
      }
      if (singleSelectedItem.type === "shape" && singleSelectedItem.shapeType === "rect" && String(activeHandle).startsWith("round-")) {
        state.pointer = {
          type: "round-rect",
          pointerId: event.pointerId,
          handle: activeHandle,
          before: takeHistorySnapshot(state),
          baseItem: clonePointerBase(singleSelectedItem),
          itemId: singleSelectedItem.id,
        };
        refs.canvas?.setPointerCapture?.(event.pointerId);
        state.hoverHandle = activeHandle;
        syncCanvasCursor();
        return;
      }
      state.pointer = {
        type: "resize-selection",
        pointerId: event.pointerId,
        handle: activeHandle,
        before: takeHistorySnapshot(state),
        baseItem: clonePointerBase(singleSelectedItem),
        itemId: singleSelectedItem.id,
      };
      refs.canvas?.setPointerCapture?.(event.pointerId);
      state.hoverHandle = activeHandle;
      syncCanvasCursor();
      return;
    }

    const target = resolveSelectionTarget(state.board.items, scenePoint, state.board.view.scale);
    if (event.button === 2 && !target) {
      event.preventDefault();
      if (!additive) {
        state.board.selectedIds = [];
        state.lastSelectionSource = null;
      }
      state.selectionRect = null;
      state.pointer = {
        type: "blank-pan-intent",
        pointerId: event.pointerId,
        startScene: scenePoint,
        lastClientX: Number(event.clientX) || 0,
        lastClientY: Number(event.clientY) || 0,
      };
      refs.canvas?.setPointerCapture?.(event.pointerId);
      syncBoard({ persist: false, emit: true });
      syncCanvasCursor();
      return;
    }

    if (state.tool === "text") {
      event.preventDefault();
      createEmptyText(scenePoint);
      return;
    }

    if (DRAW_TOOLS.includes(state.tool)) {
      event.preventDefault();
      state.pointer = {
        type: "create-shape",
        pointerId: event.pointerId,
        startScene: scenePoint,
        before: takeHistorySnapshot(state),
      };
      state.draftElement = shapeModule.createDraftElement(state.tool, scenePoint);
      refs.canvas?.setPointerCapture?.(event.pointerId);
      scheduleRender();
      return;
    }

    if (target) {
      const targetGroupId = target.groupId;
      if (!additive && targetGroupId && !isCardLinkedItem(target)) {
        const groupIds = state.board.items.filter((item) => item.groupId === targetGroupId).map((item) => item.id);
        if (groupIds.length) {
          state.board.selectedIds = groupIds;
        }
      }
      if (event.button === 0) {
        state.lastSelectionSource = "click";
      }
      if (event.button === 2 && isExportableItem(target)) {
        event.preventDefault();
        state.pointer = {
          type: "native-export-drag",
          pointerId: event.pointerId,
          startScene: scenePoint,
          itemId: target.id,
          dragged: false,
          started: false,
          pressedAt: Date.now(),
        };
      }
      if (!state.board.selectedIds.includes(target.id)) {
        state.board.selectedIds = additive ? Array.from(new Set([...state.board.selectedIds, target.id])) : [target.id];
      }
      if (event.button === 2) {
        syncBoard({ persist: false, emit: true });
        return;
      }
      const selectedIds = state.board.selectedIds.slice();
      const selectedItems = state.board.items.filter((item) => selectedIds.includes(item.id));
      const allText = selectedItems.length && selectedItems.every((item) => item.type === "text");
      const rightButtonPressed = event.button === 2 && (event.buttons & 2) === 2;
      if (rightButtonPressed && allText) {
        syncBoard({ persist: false, emit: true });
        return;
      }

      const baseItems = new Map(selectedItems.map((item) => [item.id, clonePointerBase(item)]));
      state.pointer = {
        type: "move-selection",
        pointerId: event.pointerId,
        startScene: scenePoint,
        before: takeHistorySnapshot(state),
        baseItems,
      };
      refs.canvas?.setPointerCapture?.(event.pointerId);
      syncBoard({ persist: false, emit: true });
      return;
    }

    if (!additive) {
      state.board.selectedIds = [];
      state.lastSelectionSource = null;
    }
    state.selectionRect = {
      start: scenePoint,
      current: scenePoint,
    };
    state.pointer = {
      type: "marquee",
      pointerId: event.pointerId,
      startScene: scenePoint,
      baseSelectedIds: additive ? state.board.selectedIds.slice() : [],
    };
    state.lastSelectionSource = "marquee";
    refs.canvas?.setPointerCapture?.(event.pointerId);
    syncBoard({ persist: false, emit: true });
  }

  function onPointerMove(event) {
    const scenePoint = toScenePoint(event.clientX, event.clientY);
    updateLastPointerPoint(scenePoint);
    if (!isInteractiveMode()) {
      return;
    }

    const pointer = state.pointer;
    if (pointer?.type === "capture") {
      pointer.currentScenePoint = scenePoint;
      state.selectionRect = { start: pointer.startScenePoint, current: scenePoint };
      scheduleRender();
      return;
    }
    if (!pointer) {
      hideDragIndicator();
      updateHover(scenePoint);
      hideLinkMetaTooltip();
      return;
    }
    hideLinkMetaTooltip();

    if (pointer.type === "pan") {
      const deltaX = Number(event.clientX || 0) - Number(pointer.lastClientX || 0);
      const deltaY = Number(event.clientY || 0) - Number(pointer.lastClientY || 0);
      pointer.lastClientX = Number(event.clientX || 0);
      pointer.lastClientY = Number(event.clientY || 0);
      state.board.view = panView(state.board.view, deltaX, deltaY);
      scheduleRender();
      return;
    }

    if (pointer.type === "blank-pan-intent") {
      const moved = hasDragExceededThreshold(pointer.startScene, scenePoint, 3 / Math.max(0.1, state.board.view.scale));
      if (!moved) {
        return;
      }
      suppressBlankCanvasContextMenuUntil = Date.now() + 600;
      pointer.type = "pan";
      const deltaX = Number(event.clientX || 0) - Number(pointer.lastClientX || 0);
      const deltaY = Number(event.clientY || 0) - Number(pointer.lastClientY || 0);
      pointer.lastClientX = Number(event.clientX || 0);
      pointer.lastClientY = Number(event.clientY || 0);
      state.board.view = panView(state.board.view, deltaX, deltaY);
      scheduleRender();
      return;
    }

    if (pointer.type === "image-crop") {
      lightImageEditor.handlePointerMove(pointer, scenePoint);
      scheduleRender();
      return;
    }

    if (pointer.type === "flow-connect") {
      flowDraft = {
        ...flowDraft,
        toPoint: scenePoint,
      };
      scheduleRender();
      return;
    }

    if (pointer.type === "rotate-image") {
      const item = getImageItemById(pointer.itemId);
      if (!item) {
        return;
      }
      const angle = Math.atan2(scenePoint.y - pointer.center.y, scenePoint.x - pointer.center.x);
      const delta = (angle - pointer.startAngle) * (180 / Math.PI);
      const nextRotation = (Number(pointer.startRotation || 0) + delta + 360) % 360;
      state.board.items = state.board.items.map((entry) =>
        entry.id === pointer.itemId ? { ...entry, rotation: nextRotation } : entry
      );
      scheduleRender();
      return;
    }

    if (pointer.type === "move-selection") {
      let deltaX = Number(scenePoint.x || 0) - Number(pointer.startScene?.x || 0);
      let deltaY = Number(scenePoint.y || 0) - Number(pointer.startScene?.y || 0);
      const itemMap = new Map(state.board.items.map((item) => [item.id, item]));
      const movedIds = new Set();
      const snapEligibleItems = Array.from(pointer.baseItems.values()).filter(
        (item) => item && item.type !== "flowEdge" && !isLockedItem(item)
      );
      const snapBlockedByEditing = Boolean(state.editingId && (state.editingType === "text" || state.editingType === "flow-node"));
      if (!snapBlockedByEditing && snapEligibleItems.length >= 1 && state.alignmentSnapConfig?.enabled) {
        const excludeIds = Array.from(pointer.baseItems.keys());
        snapEligibleItems.forEach((item) => {
          const pairId = getCardPairId(item, itemMap);
          if (pairId) {
            excludeIds.push(pairId);
          }
        });
        const activeSnapItem =
          snapEligibleItems.length === 1
            ? snapEligibleItems[0]
            : (() => {
                const bounds = getAggregateBounds(snapEligibleItems);
                if (!bounds) {
                  return null;
                }
                return {
                  id: `selection:${Array.from(pointer.baseItems.keys()).join(",")}`,
                  type: "selection-group",
                  x: bounds.left,
                  y: bounds.top,
                  width: bounds.width,
                  height: bounds.height,
                };
              })();
        const snapResult = activeSnapItem
          ? resolveAlignmentSnap({
              view: state.board.view,
              activeItem: activeSnapItem,
              rawDelta: { x: deltaX, y: deltaY },
              candidates: getAlignmentSnapCandidates(activeSnapItem.id, {
                excludeIds,
              }),
              config: state.alignmentSnapConfig,
            })
          : null;
        if (snapResult) {
          deltaX = Number(snapResult.adjustedDelta?.x || deltaX);
          deltaY = Number(snapResult.adjustedDelta?.y || deltaY);
          state.alignmentSnap.active = true;
          state.alignmentSnap.sourceId = snapResult.sourceId;
          state.alignmentSnap.sourceType = snapResult.sourceType;
          state.alignmentSnap.targetId = snapResult.targetId;
          state.alignmentSnap.targetType = snapResult.targetType;
          state.alignmentSnap.axisX = snapResult.axisX;
          state.alignmentSnap.axisY = snapResult.axisY;
          state.alignmentSnap.snappedScenePoint = snapResult.snappedScenePoint;
          state.alignmentSnap.guides = snapResult.guides || [];
          state.alignmentSnap.lastReason = snapEligibleItems.length > 1 ? "move-selection-group" : "move-selection";
        } else {
          clearAlignmentSnap(snapEligibleItems.length > 1 ? "move-selection-group-miss" : "move-selection-miss");
        }
      } else {
        clearAlignmentSnap(
          snapBlockedByEditing
            ? "move-selection-editing"
            : snapEligibleItems.length > 1
              ? "move-selection-group-disabled"
              : "move-selection-disabled"
        );
      }
      let nextItems = state.board.items.map((item) => {
        const base = pointer.baseItems.get(item.id);
        if (!base) {
          return item;
        }
        if (isLockedItem(base)) {
          return base;
        }
        const pairId = getCardPairId(base, itemMap);
        if (pairId) {
          const pair = itemMap.get(pairId);
          if (pair && isLockedItem(pair)) {
            return base;
          }
        }
        movedIds.add(item.id);
        return moveElement(base, deltaX, deltaY);
      });
      movedIds.forEach((movedId) => {
        const base = itemMap.get(movedId);
        const pairId = getCardPairId(base, itemMap);
        if (!pairId || movedIds.has(pairId)) {
          return;
        }
        const pairBase = itemMap.get(pairId);
        if (!pairBase) {
          return;
        }
        nextItems = nextItems.map((item) => (item.id === pairId ? moveElement(pairBase, deltaX, deltaY) : item));
      });
      state.board.items = nextItems;
      scheduleRender();
      return;
    }

    if (pointer.type === "native-export-drag") {
      const moved = hasDragExceededThreshold(pointer.startScene, scenePoint, 3 / Math.max(0.1, state.board.view.scale));
      const elapsed = Date.now() - Number(pointer.pressedAt || 0);
      if (moved && elapsed >= 180) {
        pointer.dragged = true;
        if (!pointer.started) {
          pointer.started = true;
          suppressNativeDrag = true;
          lastExportDragAt = Date.now();
          void startExportDragForSelection();
        }
        showDragIndicator(event.clientX, event.clientY);
      } else {
        hideDragIndicator();
      }
      return;
    }

    if (pointer.type === "copy-selection") {
      return;
    }

    if (pointer.type === "resize-selection") {
      if (isLockedItem(pointer.baseItem)) {
        scheduleRender();
        return;
      }
      const useAspect =
        (pointer.baseItem?.type === "image" && event.shiftKey) ||
        (pointer.baseItem?.type === "shape" &&
          (pointer.baseItem.shapeType === "rect" || pointer.baseItem.shapeType === "ellipse") &&
          event.shiftKey);
      state.board.items = state.board.items.map((item) => {
        if (item.id !== pointer.itemId) {
          return item;
        }
        if (useAspect) {
          if (pointer.baseItem?.type === "shape") {
            return resizeShapeWithAspect(pointer.baseItem, pointer.handle, scenePoint);
          }
          return resizeImageWithAspect(pointer.baseItem, pointer.handle, scenePoint);
        }
        return resizeElement(pointer.baseItem, pointer.handle, scenePoint);
      });
      state.hoverHandle = pointer.handle;
      scheduleRender();
      return;
    }

    if (pointer.type === "rotate-shape") {
      const item = state.board.items.find((entry) => entry.id === pointer.itemId && entry.type === "shape");
      if (!item || isLockedItem(item)) {
        scheduleRender();
        return;
      }
      const angle = Math.atan2(scenePoint.y - pointer.center.y, scenePoint.x - pointer.center.x);
      const delta = ((angle - pointer.startAngle) * 180) / Math.PI;
      const nextRotation = pointer.startRotation + delta;
      state.board.items = state.board.items.map((entry) => {
        if (entry.id !== pointer.itemId) {
          return entry;
        }
        return {
          ...entry,
          rotation: nextRotation,
        };
      });
      state.hoverHandle = "rotate-shape";
      scheduleRender();
      return;
    }

    if (pointer.type === "round-rect") {
      if (isLockedItem(pointer.baseItem)) {
        scheduleRender();
        return;
      }
      const nextRadius = getRectCornerRadius(pointer.baseItem, pointer.handle, scenePoint);
      state.board.items = state.board.items.map((item) => {
        if (item.id !== pointer.itemId) {
          return item;
        }
        return {
          ...item,
          radius: nextRadius,
        };
      });
      state.hoverHandle = pointer.handle;
      scheduleRender();
      return;
    }

    if (pointer.type === "marquee") {
      state.selectionRect = {
        start: pointer.startScene,
        current: scenePoint,
      };
      state.board.selectedIds = getMarqueeSelection(
        state.board.items,
        pointer.startScene,
        scenePoint,
        pointer.baseSelectedIds
      );
      scheduleRender();
      return;
    }

    if (pointer.type === "create-shape") {
      state.draftElement = shapeModule.updateDraftElement(
        state.draftElement || shapeModule.createElement(state.tool, pointer.startScene, pointer.startScene),
        pointer.startScene,
        scenePoint
      );
      scheduleRender();
    }
  }

  function onPointerUp(event) {
    const pointer = state.pointer;
    if (!pointer) {
      return;
    }
    const scenePoint = toScenePoint(event.clientX, event.clientY);
    updateLastPointerPoint(scenePoint);
    refs.canvas?.releasePointerCapture?.(event.pointerId);
    state.pointer = null;
    clearAlignmentSnap("pointer-up");
    suppressNativeDrag = false;

    if (pointer.type === "capture") {
      void runCanvasCapture(pointer);
      return;
    }

    if (pointer.type === "pan") {
      syncBoard({ persist: true, emit: true });
      return;
    }

    if (pointer.type === "blank-pan-intent") {
      syncBoard({ persist: false, emit: true });
      return;
    }

    if (pointer.type === "image-crop") {
      lightImageEditor.handlePointerUp(pointer);
      return;
    }

    if (pointer.type === "flow-connect") {
      const target = hitTestElement(state.board.items, state.lastPointerScenePoint || scenePoint, state.board.view.scale);
      const toNode = target?.type === "flowNode" ? target : null;
      const toSide = toNode
        ? flowModule.getConnectorHit(toNode, state.lastPointerScenePoint || scenePoint, state.board.view)
        : null;
      if (toNode && toSide && pointer.fromId && pointer.fromId !== toNode.id) {
        const before = takeHistorySnapshot(state);
        const edge = flowModule.createEdge(
          { id: pointer.fromId, side: pointer.fromSide },
          { id: toNode.id, side: toSide },
          pointer.style
        );
        state.board.items.unshift(edge);
        commitHistory(before, "创建连线");
      } else {
        syncBoard({ persist: false, emit: true });
      }
      flowDraft = null;
      return;
    }

    if (pointer.type === "rotate-image") {
      commitHistory(pointer.before, "旋转图片");
      return;
    }

    if (pointer.type === "rotate-shape") {
      commitHistory(pointer.before, "旋转图形");
      return;
    }

    if (pointer.type === "round-rect") {
      commitHistory(pointer.before, "调整圆角");
      return;
    }

    if (pointer.type === "move-selection") {
      const moved = hasDragExceededThreshold(pointer.startScene, state.lastPointerScenePoint, 3 / Math.max(0.1, state.board.view.scale));
      if (moved) {
        commitHistory(pointer.before, "移动元素");
      } else {
        syncBoard({ persist: false, emit: true });
      }
      return;
    }

    if (pointer.type === "native-export-drag") {
      suppressNativeDrag = false;
      hideDragIndicator();
      syncBoard({ persist: false, emit: true });
      return;
    }

    if (pointer.type === "copy-selection") {
      const moved = hasDragExceededThreshold(pointer.startScene, state.lastPointerScenePoint, 3 / Math.max(0.1, state.board.view.scale));
      if (moved) {
        const deltaX = Number(state.lastPointerScenePoint.x || 0) - Number(pointer.startScene?.x || 0);
        const deltaY = Number(state.lastPointerScenePoint.y || 0) - Number(pointer.startScene?.y || 0);
        const pasted = duplicateElementsWithDelta(Array.from(pointer.baseItems.values()), deltaX, deltaY);
        state.board.items.push(...pasted);
        state.board.selectedIds = pasted.map((item) => item.id);
        commitHistory(pointer.before, "复制元素");
      } else {
        syncBoard({ persist: false, emit: true });
      }
      suppressNativeDrag = false;
      return;
    }

    if (pointer.type === "resize-selection") {
      const resized = state.board.items.find((item) => item.id === pointer.itemId);
      if (resized) {
        commitHistory(pointer.before, "调整元素尺寸");
      } else {
        syncBoard({ persist: false, emit: true });
      }
      return;
    }

    if (pointer.type === "marquee") {
      state.selectionRect = null;
      if (state.board.selectedIds.length >= 2) {
        state.lastSelectionSource = "marquee";
      } else {
        state.lastSelectionSource = null;
      }
      syncBoard({ persist: false, emit: true });
      return;
    }

    if (pointer.type === "create-shape") {
      const draft = state.draftElement;
      state.draftElement = null;
      if (!isTinyShape(draft)) {
        state.board.items.push(draft);
        state.board.selectedIds = [draft.id];
        commitHistory(pointer.before, "创建图形");
      } else {
        syncBoard({ persist: false, emit: true });
      }
    }
  }

  function onPointerCancel(event) {
    if (!state.pointer) {
      return;
    }
    refs.canvas?.releasePointerCapture?.(event.pointerId);
    suppressNativeDrag = false;
    if (state.pointer?.type === "image-crop") {
      lightImageEditor.clearTransientState();
    }
    clearTransientState();
    syncBoard({ persist: false, emit: true });
  }

  function onPointerEnter() {
    pointerOverCanvas = true;
    if (!state.editingId && !isEditableElement(document.activeElement)) {
      refs.canvas?.focus();
    }
  }

  function onPointerLeave() {
    pointerOverCanvas = false;
    if (state.hoverId || state.hoverHandle) {
      state.hoverId = null;
      state.hoverHandle = null;
      scheduleRender();
    }
    hideLinkMetaTooltip();
  }

  function onDoubleClick(event) {
    if (!isInteractiveMode()) {
      return;
    }
    const scenePoint = toScenePoint(event.clientX, event.clientY);
    const target = hitTestElement(state.board.items, scenePoint, state.board.view.scale);
    if (target?.type === "fileCard" && target.memoVisible) {
      const memoBounds = getFileCardMemoBounds(target);
      if (
        scenePoint.x >= memoBounds.left &&
        scenePoint.x <= memoBounds.right &&
        scenePoint.y >= memoBounds.top &&
        scenePoint.y <= memoBounds.bottom
      ) {
        beginFileMemoEdit(target.id);
        return;
      }
    }
    if (target?.type === "image" && target.memoVisible) {
      const memoBounds = getImageMemoBounds(target);
      if (
        scenePoint.x >= memoBounds.left &&
        scenePoint.x <= memoBounds.right &&
        scenePoint.y >= memoBounds.top &&
        scenePoint.y <= memoBounds.bottom
      ) {
        beginImageMemoEdit(target.id);
        return;
      }
    }
    if (target?.type === "text") {
      beginTextEdit(target.id);
      return;
    }
    if (target?.type === "flowNode") {
      beginFlowNodeEdit(target.id);
      return;
    }
    if (target?.type === "table") {
      beginTableEdit(target.id, getTableCellSelectionFromScenePoint(target, scenePoint));
      return;
    }
    if (!target) {
      createEmptyText(scenePoint);
    }
  }

  function onWheel(event) {
    if (!isInteractiveMode()) {
      return;
    }
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const focusPoint = toScenePoint(event.clientX, event.clientY);
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      state.board.view = zoomAtScenePoint(state.board.view, state.board.view.scale * zoomFactor, focusPoint);
      syncBoard({ persist: true, emit: true });
      return;
    }
    state.board.view = panView(state.board.view, -event.deltaX, -event.deltaY);
    syncBoard({ persist: true, emit: true });
  }

  function onDragOver(event) {
    if (!isInteractiveMode()) {
      return;
    }
    event.preventDefault();
    drawToolModule.handleDragOver({
      event,
      surface: refs.surface,
    });
  }

  function onDragLeave(event) {
    if (!isInteractiveMode()) {
      return;
    }
    if (event.target !== refs.canvas) {
      return;
    }
    drawToolModule.handleDragLeave();
  }

  function hideContextMenu() {
    if (refs.contextMenu) {
      closeContextSubmenus();
      refs.contextMenu.classList.add("is-hidden");
      refs.contextMenu.classList.remove("is-webgl-menu");
      refs.contextMenu.style.left = "-9999px";
      refs.contextMenu.style.top = "-9999px";
    }
  }

  function getContextSubmenuElements() {
    if (!(refs.contextMenu instanceof HTMLElement)) {
      return [];
    }
    return Array.from(refs.contextMenu.querySelectorAll(".canvas2d-context-submenu"));
  }

  function closeContextSubmenus({ exceptSubmenu = null } = {}) {
    for (const submenu of getContextSubmenuElements()) {
      if (!(submenu instanceof HTMLElement)) continue;
      const isActive = exceptSubmenu instanceof HTMLElement && submenu === exceptSubmenu;
      submenu.classList.toggle("is-open", isActive);
      submenu.classList.toggle("is-open-left", false);
      submenu.classList.toggle("is-open-right", false);
      submenu.classList.toggle("is-open-up", false);
      submenu.classList.toggle("is-open-down", false);
      const trigger = submenu.querySelector(".canvas2d-context-submenu-trigger");
      const panel = submenu.querySelector(".canvas2d-context-submenu-panel");
      if (trigger instanceof HTMLElement) {
        trigger.setAttribute("aria-expanded", isActive ? "true" : "false");
      }
      if (panel instanceof HTMLElement && !isActive) {
        panel.style.removeProperty("left");
        panel.style.removeProperty("top");
        panel.style.removeProperty("max-width");
        panel.style.removeProperty("max-height");
      }
    }
  }

  function openContextSubmenu(submenu) {
    if (!(submenu instanceof HTMLElement) || !(refs.contextMenu instanceof HTMLElement) || !(refs.surface instanceof HTMLElement)) {
      return;
    }
    const trigger = submenu.querySelector(".canvas2d-context-submenu-trigger");
    const panel = submenu.querySelector(".canvas2d-context-submenu-panel");
    if (!(trigger instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      return;
    }

    closeContextSubmenus({ exceptSubmenu: submenu });

    const placement = placeSubmenuNearTrigger({
      panelEl: panel,
      triggerRect: trigger.getBoundingClientRect(),
      containerRect: submenu.getBoundingClientRect(),
      hostRect: refs.surface.getBoundingClientRect(),
      viewportPadding: 12,
      gap: 6,
      offsetTop: -6,
      minWidth: 120,
      minHeight: 120,
      hiddenClass: "is-hidden",
    });

    submenu.classList.add("is-open");
    submenu.classList.toggle("is-open-left", placement?.placementX === "left");
    submenu.classList.toggle("is-open-right", placement?.placementX !== "left");
    submenu.classList.toggle("is-open-up", placement?.placementY === "up");
    submenu.classList.toggle("is-open-down", placement?.placementY !== "up");
    trigger.setAttribute("aria-expanded", "true");
  }

  function onContextMenu(event) {
    if (!isInteractiveMode() || !refs.contextMenu || !refs.surface) {
      return;
    }
    if (Date.now() < suppressBlankCanvasContextMenuUntil) {
      event.preventDefault();
      return;
    }
    if (lastExportDragAt && Date.now() - lastExportDragAt < 800) {
      event.preventDefault();
      return;
    }
    if (state.pointer?.type === "native-export-drag" && state.pointer.dragged) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    if (isWebglRenderMode()) {
      refs.contextMenu.classList.add("is-webgl-menu");
      refs.contextMenu.innerHTML = `
        <div class="canvas2d-webgl-context-header">
          <span class="canvas2d-webgl-context-title">画布操作</span>
          <span class="canvas2d-webgl-context-caption">WebGL Context</span>
        </div>
        <div class="canvas2d-context-submenu canvas2d-webgl-context-submenu">
          <button
            type="button"
            class="canvas2d-context-menu-item canvas2d-context-submenu-trigger canvas2d-webgl-context-item"
            aria-haspopup="menu"
            aria-expanded="false"
          >
            <span class="canvas2d-webgl-context-icon" aria-hidden="true">◫</span>
            <span class="canvas2d-webgl-context-copy">
              <span class="canvas2d-webgl-context-label">本地菜单</span>
              <span class="canvas2d-webgl-context-note">展开复制内容与导入画布</span>
            </span>
          </button>
          <div class="canvas2d-context-submenu-panel canvas2d-webgl-context-panel" role="menu" aria-label="WebGL 本地菜单">
            <button type="button" class="canvas2d-context-menu-item canvas2d-webgl-context-item" data-action="webgl-copy">
              <span class="canvas2d-webgl-context-icon" aria-hidden="true">⧉</span>
              <span class="canvas2d-webgl-context-copy">
                <span class="canvas2d-webgl-context-label">复制内容</span>
                <span class="canvas2d-webgl-context-note">复制当前画布显示内容</span>
              </span>
            </button>
            <button type="button" class="canvas2d-context-menu-item canvas2d-webgl-context-item" data-action="webgl-import">
              <span class="canvas2d-webgl-context-icon" aria-hidden="true">⇪</span>
              <span class="canvas2d-webgl-context-copy">
                <span class="canvas2d-webgl-context-label">导入画布</span>
                <span class="canvas2d-webgl-context-note">从本地导入新的画布内容</span>
              </span>
            </button>
          </div>
        </div>
      `;
      placeMenuNearPoint({
        panelEl: refs.contextMenu,
        clientX: Number(event.clientX),
        clientY: Number(event.clientY),
        containerRect: refs.surface.getBoundingClientRect(),
        viewportPadding: 12,
        minWidth: 220,
        minHeight: 120,
        hiddenClass: "is-hidden",
      });
      lastContextMenuPoint = { x: event.clientX, y: event.clientY };
      return;
    }
    refs.contextMenu.classList.remove("is-webgl-menu");
    const scenePoint = toScenePoint(event.clientX, event.clientY);
    const hitTarget = hitTestElement(state.board.items, scenePoint, state.board.view.scale);
    lastContextMenuTargetId = hitTarget?.id || null;
    if (!hitTarget && state.board.selectedIds.length) {
      state.board.selectedIds = [];
      state.lastSelectionSource = null;
    }
    const selectionCount = state.board.selectedIds.length;
    const multiSelectActive = selectionCount >= 2 && state.lastSelectionSource === "marquee";

    if (multiSelectActive) {
      const selectedItems = state.board.items.filter((item) => state.board.selectedIds.includes(item.id));
      const hasGrouped = selectedItems.some((item) => item.groupId);
      const groupLabel = hasGrouped ? "取消组合" : "组合";
      refs.contextMenu.innerHTML = `
        <button type="button" class="canvas2d-context-menu-item" data-action="copy-selected">复制所选</button>
        <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
        <button type="button" class="canvas2d-context-menu-item" data-action="export-selection-image">导出为图片</button>
        <button type="button" class="canvas2d-context-menu-item" data-action="group-toggle">${groupLabel}</button>
        <div class="canvas2d-context-submenu">
          <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">对齐</button>
          <div class="canvas2d-context-submenu-panel" role="menu" aria-label="对齐">
            <button type="button" class="canvas2d-context-menu-item" data-action="align-left">左对齐</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="align-top">上对齐</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="align-center">居中对齐</button>
          </div>
        </div>
        <div class="canvas2d-context-submenu">
          <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">均匀分布</button>
          <div class="canvas2d-context-submenu-panel" role="menu" aria-label="均匀分布">
            <button type="button" class="canvas2d-context-menu-item" data-action="distribute-horizontal">水平等距</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="distribute-vertical">垂直等距</button>
          </div>
        </div>
        <div class="canvas2d-context-submenu">
          <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">图层</button>
          <div class="canvas2d-context-submenu-panel" role="menu" aria-label="图层">
            <button type="button" class="canvas2d-context-menu-item" data-action="layer-front">置于顶层</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="layer-back">置于底层</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="layer-up">上移一层</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="layer-down">下移一层</button>
          </div>
        </div>
        <button type="button" class="canvas2d-context-menu-item" data-action="toggle-lock">锁定/解锁所选</button>
        <button type="button" class="canvas2d-context-menu-item" data-action="delete-selected">删除所选</button>
      `;
    } else if (selectionCount === 1 || hitTarget) {
        if (hitTarget && selectionCount !== 1) {
          state.board.selectedIds = [hitTarget.id];
        }
        const selectedId = state.board.selectedIds[0];
        const selectedItem = state.board.items.find((item) => item.id === selectedId) || hitTarget;
        lastContextMenuTargetId = selectedItem?.id || lastContextMenuTargetId;
        const lockLabel = selectedItem?.locked ? "解锁" : "锁定";
        if (selectedItem?.type === "fileCard") {
          refs.contextMenu.innerHTML = buildFileCardContextMenuHtml(selectedItem);
        } else if (selectedItem?.type === "image") {
          refs.contextMenu.innerHTML = imageModule.buildContextMenuHtml(selectedItem);
        } else if (selectedItem?.type === "flowEdge") {
          refs.contextMenu.innerHTML = `
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">线条样式</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="线条样式">
                <button type="button" class="canvas2d-context-menu-item" data-action="edge-solid">实线</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="edge-dashed">虚线</button>
              </div>
            </div>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">箭头方向</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="箭头方向">
                <button type="button" class="canvas2d-context-menu-item" data-action="edge-arrow-forward">正向箭头</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="edge-arrow-backward">反向箭头</button>
              </div>
            </div>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">图层</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="图层">
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-front">置于顶层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-back">置于底层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-up">上移一层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-down">下移一层</button>
              </div>
            </div>
            <button type="button" class="canvas2d-context-menu-item" data-action="toggle-lock">${lockLabel}</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="edge-delete">删除</button>
          `;
        } else if (selectedItem?.type === "shape" && selectedItem.shapeType === "rect") {
          refs.contextMenu.innerHTML = `
            <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="shape-fill-toggle">填充切换</button>
            <div class="canvas2d-context-swatch-row" role="menu" aria-label="边框颜色">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-swatch" data-action="shape-color" data-color="#0f172a" title="黑色"></button>
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-swatch" data-action="shape-color" data-color="#dc2626" title="红色"></button>
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-swatch" data-action="shape-color" data-color="#2563eb" title="蓝色"></button>
            </div>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">图层</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="图层">
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-front">置于顶层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-back">置于底层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-up">上移一层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-down">下移一层</button>
              </div>
            </div>
            <button type="button" class="canvas2d-context-menu-item" data-action="toggle-lock">${lockLabel}</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="delete">删除</button>
          `;
        } else if (selectedItem?.type === "shape" && selectedItem.shapeType === "ellipse") {
          refs.contextMenu.innerHTML = `
            <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="shape-fill-toggle">填充切换</button>
            <div class="canvas2d-context-swatch-row" role="menu" aria-label="边框颜色">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-swatch" data-action="shape-color" data-color="#0f172a" title="黑色"></button>
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-swatch" data-action="shape-color" data-color="#dc2626" title="红色"></button>
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-swatch" data-action="shape-color" data-color="#2563eb" title="蓝色"></button>
            </div>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">图层</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="图层">
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-front">置于顶层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-back">置于底层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-up">上移一层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-down">下移一层</button>
              </div>
            </div>
            <button type="button" class="canvas2d-context-menu-item" data-action="toggle-lock">${lockLabel}</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="delete">删除</button>
          `;
        } else if (selectedItem?.type === "shape" && selectedItem.shapeType === "arrow") {
          refs.contextMenu.innerHTML = `
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="arrow-reverse">反转方向</button>
            <div class="canvas2d-context-swatch-row" role="menu" aria-label="线条颜色">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-swatch" data-action="shape-color" data-color="#0f172a" title="黑色"></button>
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-swatch" data-action="shape-color" data-color="#dc2626" title="红色"></button>
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-swatch" data-action="shape-color" data-color="#2563eb" title="蓝色"></button>
            </div>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">图层</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="图层">
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-front">置于顶层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-back">置于底层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-up">上移一层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-down">下移一层</button>
              </div>
            </div>
            <button type="button" class="canvas2d-context-menu-item" data-action="toggle-lock">${lockLabel}</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="delete">删除</button>
          `;
        } else if (selectedItem?.type === "shape" && selectedItem.shapeType === "line") {
          refs.contextMenu.innerHTML = `
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">线条样式</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="线条样式">
                <button type="button" class="canvas2d-context-menu-item" data-action="line-dash-toggle">切换虚线</button>
              </div>
            </div>
            <div class="canvas2d-context-swatch-row" role="menu" aria-label="线条颜色">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-swatch" data-action="shape-color" data-color="#0f172a" title="黑色"></button>
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-swatch" data-action="shape-color" data-color="#dc2626" title="红色"></button>
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-swatch" data-action="shape-color" data-color="#2563eb" title="蓝色"></button>
            </div>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">图层</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="图层">
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-front">置于顶层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-back">置于底层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-up">上移一层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-down">下移一层</button>
              </div>
            </div>
            <button type="button" class="canvas2d-context-menu-item" data-action="toggle-lock">${lockLabel}</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="delete">删除</button>
          `;
        } else if (selectedItem?.type === "mindNode") {
          refs.contextMenu.innerHTML = `
            <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">图层</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="图层">
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-front">置于顶层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-back">置于底层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-up">上移一层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-down">下移一层</button>
              </div>
            </div>
            <button type="button" class="canvas2d-context-menu-item" data-action="toggle-lock">${lockLabel}</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="delete">删除</button>
          `;
        } else if (selectedItem?.type === "table") {
          refs.contextMenu.innerHTML = `
            <button type="button" class="canvas2d-context-menu-item" data-action="table-edit">编辑表格</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="table-add-row">新增一行</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="table-add-column">新增一列</button>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">图层</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="图层">
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-front">置于顶层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-back">置于底层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-up">上移一层</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="layer-down">下移一层</button>
              </div>
            </div>
            <button type="button" class="canvas2d-context-menu-item" data-action="toggle-lock">${lockLabel}</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="delete">删除</button>
          `;
        } else if (selectedItem?.type === "text" || selectedItem?.type === "flowNode") {
          const isNode = selectedItem?.type === "flowNode";
        const nodeLabel = isNode ? "转为普通文本" : "转为节点文本";
        refs.contextMenu.innerHTML = `
          <button type="button" class="canvas2d-context-menu-item" data-action="cut">剪切</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="text-node-toggle">${nodeLabel}</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="toggle-link-semantic">${linkSemanticEnabled ? "关闭链接语义化（纯文本模式）" : "开启链接语义化"}</button>
          <div class="canvas2d-context-submenu">
            <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">文本样式</button>
            <div class="canvas2d-context-submenu-panel" role="menu" aria-label="文本样式">
              <button type="button" class="canvas2d-context-menu-item" data-action="style-body">正文</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="style-subtitle">副标题</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="style-title">标题</button>
            </div>
          </div>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">文本标记</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="文本标记">
                <button type="button" class="canvas2d-context-menu-item" data-action="mark-highlight">高亮</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="mark-underline">下划线</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="mark-strike">删除线</button>
              </div>
            </div>
            <button type="button" class="canvas2d-context-menu-item" data-action="export-text">导出 TXT</button>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">图层</button>
            <div class="canvas2d-context-submenu-panel" role="menu" aria-label="图层">
              <button type="button" class="canvas2d-context-menu-item" data-action="layer-front">置于顶层</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="layer-back">置于底层</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="layer-up">上移一层</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="layer-down">下移一层</button>
            </div>
          </div>
          <button type="button" class="canvas2d-context-menu-item" data-action="toggle-lock">${lockLabel}</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="delete">删除</button>
        `;
      } else if (selectedItem) {
        refs.contextMenu.innerHTML = `
          <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="delete">删除</button>
        `;
      } else {
        refs.contextMenu.innerHTML = `
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="add-text">添加文本</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="add-node">添加节点</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="add-image">添加图片</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="add-file">添加文件</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="add-table">添加表格</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="toggle-link-semantic">${linkSemanticEnabled ? "关闭链接语义化（纯文本模式）" : "开启链接语义化"}</button>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">添加图形</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="添加图形">
                <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-rect">矩形</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-ellipse">椭圆</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-arrow">箭头</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-line">直线</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-highlight">高亮</button>
              </div>
            </div>
            <button type="button" class="canvas2d-context-menu-item" data-action="clear-board">清空画布</button>
          `;
      }
    } else {
      refs.contextMenu.innerHTML = `
          <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="add-text">添加文本</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="add-node">添加节点</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="add-image">添加图片</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="add-file">添加文件</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="add-table">添加表格</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="toggle-link-semantic">${linkSemanticEnabled ? "关闭链接语义化（纯文本模式）" : "开启链接语义化"}</button>
          <div class="canvas2d-context-submenu">
            <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">添加图形</button>
            <div class="canvas2d-context-submenu-panel" role="menu" aria-label="添加图形">
              <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-rect">矩形</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-ellipse">椭圆</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-arrow">箭头</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-line">直线</button>
              <button type="button" class="canvas2d-context-menu-item" data-action="add-shape-highlight">高亮</button>
            </div>
          </div>
          <button type="button" class="canvas2d-context-menu-item" data-action="clear-board">清空画布</button>
        `;
    }
    placeMenuNearPoint({
      panelEl: refs.contextMenu,
      clientX: Number(event.clientX),
      clientY: Number(event.clientY),
      containerRect: refs.surface.getBoundingClientRect(),
      viewportPadding: 12,
      minWidth: 220,
      minHeight: 220,
      hiddenClass: "is-hidden",
    });
    lastContextMenuPoint = { x: event.clientX, y: event.clientY };
  }

  function getContextMenuScenePoint() {
    const point = lastContextMenuPoint || {
      x: Number(refs.canvas?.getBoundingClientRect?.().left || 0) + 32,
      y: Number(refs.canvas?.getBoundingClientRect?.().top || 0) + 32,
    };
    return toScenePoint(point.x, point.y);
  }

  function onContextMenuClick(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) {
      return;
    }
    const action = target.getAttribute("data-action");
    if (action === "webgl-copy" || action === "webgl-import") {
      hideContextMenu();
      return;
    }
    if (action === "add-text") {
      createEmptyText(getContextMenuScenePoint());
      hideContextMenu();
    }
    if (action === "add-node") {
      createFlowNode(getContextMenuScenePoint());
      hideContextMenu();
    }
    if (action === "add-shape-rect") {
      createShapeAt(getContextMenuScenePoint(), "rect");
      hideContextMenu();
    }
    if (action === "add-shape-ellipse") {
      createShapeAt(getContextMenuScenePoint(), "ellipse");
      hideContextMenu();
    }
    if (action === "add-shape-arrow") {
      createShapeAt(getContextMenuScenePoint(), "arrow");
      hideContextMenu();
    }
    if (action === "add-shape-line") {
      createShapeAt(getContextMenuScenePoint(), "line");
      hideContextMenu();
    }
    if (action === "add-shape-highlight") {
      createShapeAt(getContextMenuScenePoint(), "highlight");
      hideContextMenu();
    }
    if (action === "add-file") {
      pendingImportAnchor = getContextMenuScenePoint();
      refs.fileImportInput?.click();
      hideContextMenu();
    }
    if (action === "add-image") {
      pendingImportAnchor = getContextMenuScenePoint();
      refs.imageImportInput?.click();
      hideContextMenu();
    }
    if (action === "add-table") {
      const item = createEditableTableElement(getContextMenuScenePoint(), { columns: 3, rows: 3 });
      pushItems([item], { reason: "创建表格", statusText: "已添加表格" });
      beginTableEdit(item.id, { rowIndex: 0, columnIndex: 0 });
      hideContextMenu();
    }
    if (action === "clear-board") {
      clearBoard();
      hideContextMenu();
    }
    if (action === "copy-selected") {
      void copySelection();
      hideContextMenu();
    }
    if (action === "delete-selected") {
      removeSelected();
      hideContextMenu();
    }
    if (action === "toggle-lock") {
      toggleLockOnSelection();
      hideContextMenu();
    }
    if (action === "group-toggle") {
      const selectedItems = state.board.items.filter((item) => state.board.selectedIds.includes(item.id));
      const hasGrouped = selectedItems.some((item) => item.groupId);
      if (hasGrouped) {
        ungroupSelection();
      } else {
        groupSelection();
      }
      hideContextMenu();
    }
    if (action === "bring-front") {
      moveSelectionToFront();
      hideContextMenu();
    }
    if (action === "send-back") {
      moveSelectionToBack();
      hideContextMenu();
    }
    if (action === "export-selection-image") {
      const selectedItems = state.board.items.filter((item) => state.board.selectedIds.includes(item.id));
      void exportItemsAsImage(selectedItems, {
        forceWhiteBackground: true,
        defaultName: "freeflow-selection",
        anchorPoint: getExportAnchor(selectedItems),
      });
      hideContextMenu();
    }
    if (action === "export-text") {
      const selectedItem = state.board.items.find(
        (item) => state.board.selectedIds.includes(item.id) && (item.type === "text" || item.type === "flowNode")
      );
      void exportTextItem(selectedItem);
      hideContextMenu();
    }
    if (action === "align-left") {
      alignSelection("left");
      hideContextMenu();
    }
    if (action === "align-top") {
      alignSelection("top");
      hideContextMenu();
    }
    if (action === "align-center") {
      alignSelection("center");
      hideContextMenu();
    }
    if (action === "distribute-horizontal") {
      distributeSelection("horizontal");
      hideContextMenu();
    }
    if (action === "distribute-vertical") {
      distributeSelection("vertical");
      hideContextMenu();
    }
    if (action === "copy") {
      void copySelection();
      hideContextMenu();
    }
    if (action === "cut") {
      void cutSelection();
      hideContextMenu();
    }
    if (action === "paste") {
      void pasteFromSystemClipboard(getContextMenuScenePoint());
      hideContextMenu();
    }
    if (action === "delete") {
      removeSelected();
      hideContextMenu();
    }
    if (action === "layer-front") {
      moveSelectionToFront();
      hideContextMenu();
    }
    if (action === "layer-back") {
      moveSelectionToBack();
      hideContextMenu();
    }
    if (action === "layer-up") {
      moveSelectionByStep("up");
      hideContextMenu();
    }
    if (action === "layer-down") {
      moveSelectionByStep("down");
      hideContextMenu();
    }
    if (action === "arrow-reverse") {
      reverseArrowSelection();
      hideContextMenu();
    }
    if (action === "line-dash-toggle") {
      toggleLineDash();
      hideContextMenu();
    }
    if (action === "shape-fill-toggle") {
      toggleShapeFill();
      hideContextMenu();
    }
    if (action === "shape-color") {
      const color = target.getAttribute("data-color") || "";
      applyShapeStrokeColor(color);
      hideContextMenu();
    }
    if (action === "edge-solid") {
      updateFlowEdgeStyle("solid");
      hideContextMenu();
    }
    if (action === "edge-dashed") {
      updateFlowEdgeStyle("dashed");
      hideContextMenu();
    }
    if (action === "edge-arrow-forward") {
      updateFlowEdgeStyle("arrow", "forward");
      hideContextMenu();
    }
    if (action === "edge-arrow-backward") {
      updateFlowEdgeStyle("arrow", "backward");
      hideContextMenu();
    }
    if (action === "edge-delete") {
      removeFlowEdges();
      hideContextMenu();
    }
    if (action === "text-node-toggle") {
      toggleNodeText();
      hideContextMenu();
    }
    if (action === "table-edit") {
      if (state.board.selectedIds.length === 1) {
        beginTableEdit(state.board.selectedIds[0], tableEditSelection);
      }
      hideContextMenu();
    }
    if (action === "table-add-row") {
      if (state.editingType !== "table" && state.board.selectedIds.length === 1) {
        beginTableEdit(state.board.selectedIds[0], tableEditSelection);
      }
      mutateTableEditor((matrix) => {
        const columnCount = Math.max(1, matrix[0]?.length || 1);
        const insertIndex = Math.max(0, Number(tableEditSelection.rowIndex) || 0) + 1;
        matrix.splice(
          Math.min(insertIndex, matrix.length),
          0,
          Array.from({ length: columnCount }, (_, columnIndex) => ({
            plainText: "",
            header: false,
            columnIndex,
          }))
        );
        tableEditSelection.rowIndex = Math.min(insertIndex, matrix.length - 1);
        return matrix;
      });
      hideContextMenu();
    }
    if (action === "table-add-column") {
      if (state.editingType !== "table" && state.board.selectedIds.length === 1) {
        beginTableEdit(state.board.selectedIds[0], tableEditSelection);
      }
      mutateTableEditor((matrix) => {
        const insertIndex = Math.max(0, Number(tableEditSelection.columnIndex) || 0) + 1;
        matrix.forEach((row, rowIndex) => {
          row.splice(
            Math.min(insertIndex, row.length),
            0,
            {
              plainText: rowIndex === 0 && getTableEditItem()?.table?.hasHeader !== false ? `列 ${insertIndex + 1}` : "",
              header: rowIndex === 0 && getTableEditItem()?.table?.hasHeader !== false,
            }
          );
        });
        tableEditSelection.columnIndex = Math.min(insertIndex, Math.max(0, matrix[0]?.length - 1));
        return matrix;
      });
      hideContextMenu();
    }
    if (action === "table-delete-row") {
      mutateTableEditor((matrix) => {
        if (matrix.length <= 1) {
          return matrix;
        }
        const removeIndex = Math.max(0, Math.min(matrix.length - 1, Number(tableEditSelection.rowIndex) || 0));
        matrix.splice(removeIndex, 1);
        tableEditSelection.rowIndex = Math.max(0, Math.min(removeIndex - 1, matrix.length - 1));
        return matrix;
      });
      hideContextMenu();
    }
    if (action === "table-delete-column") {
      mutateTableEditor((matrix) => {
        if (!matrix.length || (matrix[0] || []).length <= 1) {
          return matrix;
        }
        const removeIndex = Math.max(0, Math.min((matrix[0] || []).length - 1, Number(tableEditSelection.columnIndex) || 0));
        matrix.forEach((row) => row.splice(removeIndex, 1));
        tableEditSelection.columnIndex = Math.max(0, Math.min(removeIndex - 1, (matrix[0] || []).length - 1));
        return matrix;
      });
      hideContextMenu();
    }
    if (action === "table-toggle-header") {
      mutateTableEditor((matrix) => {
        const editingItem = getTableEditItem();
        const nextHasHeader = editingItem?.table?.hasHeader === false;
        matrix.forEach((row, rowIndex) => {
          row.forEach((cell) => {
            cell.header = nextHasHeader ? rowIndex === 0 : false;
          });
        });
        return { matrix, hasHeader: nextHasHeader };
      });
      hideContextMenu();
    }
    if (action === "table-done") {
      commitTableEdit();
      hideContextMenu();
    }
    if (action === "toggle-link-semantic") {
      setLinkSemanticEnabled(!linkSemanticEnabled);
      hideContextMenu();
    }
    if (action === "mark-highlight") {
      applyHighlightToSelection();
      hideContextMenu();
    }
    if (action === "mark-underline") {
      applyUnderlineToSelection();
      hideContextMenu();
    }
    if (action === "mark-strike") {
      applyStrikeToSelection();
      hideContextMenu();
    }
    if (action === "style-body") {
      applyTextPresetToSelection("body");
      hideContextMenu();
    }
    if (action === "style-subtitle") {
      applyTextPresetToSelection("subtitle");
      hideContextMenu();
    }
    if (action === "style-title") {
      applyTextPresetToSelection("title");
      hideContextMenu();
    }
    if (action === "image-copy") {
      void copySelection();
      hideContextMenu();
    }
    if (action === "image-reveal") {
      if (state.board.selectedIds.length === 1) {
        const selected = state.board.items.find((entry) => entry.id === state.board.selectedIds[0] && entry.type === "image");
        const path = String(selected?.sourcePath || "").trim();
        if (!path) {
          setStatus("图片路径为空");
        } else if (typeof globalThis?.desktopShell?.revealPath === "function") {
          void globalThis.desktopShell.revealPath(path);
        } else {
          setStatus("当前环境不支持打开文件夹");
        }
      }
      hideContextMenu();
    }
    if (action === "image-memo") {
      if (state.board.selectedIds.length === 1) {
        const selected = state.board.items.find((entry) => entry.id === state.board.selectedIds[0] && entry.type === "image");
        if (selected) {
          if (selected.memoVisible) {
            const memoText = String(selected.memo || "").trim();
            if (memoText) {
              const ok = window.confirm("标签已有内容，确认删除？");
              if (!ok) {
                hideContextMenu();
                return;
              }
            }
            const before = takeHistorySnapshot(state);
            selected.memoVisible = false;
            selected.memo = "";
            commitHistory(before, "删除图片标签");
          } else {
            const before = takeHistorySnapshot(state);
            selected.memoVisible = true;
            commitHistory(before, "显示图片标签");
          }
        }
      }
      hideContextMenu();
    }
    if (action === "image-restore") {
      if (state.board.selectedIds.length === 1) {
        lightImageEditor.resetTransform(state.board.selectedIds[0]);
      }
      hideContextMenu();
    }
    if (action === "image-edit") {
      if (state.board.selectedIds.length === 1) {
        const imageId = state.board.selectedIds[0];
        if (state.editingType === "image" && state.editingId === imageId) {
          finishImageEdit();
        } else {
          beginImageEdit(imageId);
        }
      }
      hideContextMenu();
    }
    if (action === "image-export") {
      if (state.board.selectedIds.length === 1) {
        void exportImageElement(state.board.selectedIds[0]);
      }
      hideContextMenu();
    }
    if (action === "file-mark") {
      toggleFileCardMark();
      hideContextMenu();
    }
    if (action === "file-memo") {
      if (state.board.selectedIds.length === 1) {
        const selected = state.board.items.find((entry) => entry.id === state.board.selectedIds[0] && entry.type === "fileCard");
        if (selected) {
          if (selected.memoVisible) {
            const memoText = String(selected.memo || "").trim();
            if (memoText) {
              const ok = window.confirm("标签已有内容，确认删除？");
              if (!ok) {
                hideContextMenu();
                return;
              }
            }
            const before = takeHistorySnapshot(state);
            selected.memoVisible = false;
            selected.memo = "";
            commitHistory(before, "删除文件卡标签");
          } else {
            const before = takeHistorySnapshot(state);
            selected.memoVisible = true;
            commitHistory(before, "显示文件卡标签");
          }
        }
      }
      hideContextMenu();
    }
    if (action === "file-reveal") {
      if (state.board.selectedIds.length === 1) {
        const selected = state.board.items.find((entry) => entry.id === state.board.selectedIds[0] && entry.type === "fileCard");
        const path = String(selected?.sourcePath || "").trim();
        if (!path) {
          setStatus("文件路径为空");
        } else if (typeof globalThis?.desktopShell?.revealPath === "function") {
          void globalThis.desktopShell.revealPath(path);
        } else {
          setStatus("当前环境不支持打开文件夹");
        }
      }
      hideContextMenu();
    }
  }

  function applyRichTextCommand(action, color) {
    if (!state.board.selectedIds.length) {
      return;
    }
    const selectedId = state.board.selectedIds[0];
    const item = state.board.items.find(
      (entry) => entry.id === selectedId && (entry.type === "text" || entry.type === "flowNode")
    );
    if (!item) {
      return;
    }
    if (state.editingId !== item.id) {
      if (item.type === "flowNode") {
        beginFlowNodeEdit(item.id);
      } else {
        beginTextEdit(item.id);
      }
    }
    if (action === "link") {
      const url = window.prompt("输入链接");
      requestAnimationFrame(() => {
        if (!richTextSession.isActive()) {
          return;
        }
        if (url) {
          richTextSession.command("createLink", url);
        } else {
          richTextSession.command("unlink");
        }
        applyInlineFontSizingToContainer(refs.richEditor, state.board.view.scale);
        syncActiveRichEditingItemState();
      });
      return;
    }
    if (action === "insert-math-inline" || action === "insert-math-block") {
      const isBlockMath = action === "insert-math-block";
      const formula = window.prompt(isBlockMath ? "输入独行公式 LaTeX" : "输入行内公式 LaTeX");
      if (formula === null) {
        return;
      }
      requestAnimationFrame(() => {
        if (!richTextSession.isActive()) {
          return;
        }
        const source = String(formula || "").trim();
        if (!source) {
          return;
        }
        richTextSession.command(isBlockMath ? "insertMathBlock" : "insertMathInline", source);
        richTextSession.focus();
        richTextSession.captureSelection();
        applyInlineFontSizingToContainer(refs.richEditor, state.board.view.scale);
        syncActiveRichEditingItemState();
      });
      return;
    }
    if (action === "edit-math-source") {
      requestAnimationFrame(() => {
        if (!richTextSession.isActive()) {
          return;
        }
        const formatState = richTextSession.getFormatState() || {};
        if (!formatState.canEditMath) {
          setStatus("请先将光标放到公式内");
          return;
        }
        const currentSource = String(formatState.currentMathSource || "");
        const formula = window.prompt("编辑当前公式 LaTeX", currentSource);
        if (formula === null) {
          return;
        }
        const nextSource = String(formula || "").trim();
        if (!nextSource) {
          return;
        }
        richTextSession.command("updateCurrentMath", nextSource);
        richTextSession.focus();
        richTextSession.captureSelection();
        applyInlineFontSizingToContainer(refs.richEditor, state.board.view.scale);
        syncActiveRichEditingItemState();
      });
      return;
    }
    requestAnimationFrame(() => {
      if (!richTextSession.isActive()) {
        return;
      }
      if (action === "bold") {
        richTextSession.command("bold");
      } else if (action === "italic") {
        richTextSession.command("italic");
      } else if (action === "inline-code") {
        richTextSession.command("toggleInlineCode");
      } else if (action === "underline") {
        richTextSession.command("underline");
      } else if (action === "strike") {
        richTextSession.command("strikeThrough");
      } else if (action === "blockquote") {
        richTextSession.command("setBlockType", "blockquote");
      } else if (action === "blockquote-indent") {
        const formatState = richTextSession.getFormatState() || {};
        if (formatState.blockType !== "blockquote") {
          richTextSession.command("setBlockType", "blockquote");
        } else {
          richTextSession.command("indent");
        }
      } else if (action === "blockquote-outdent") {
        richTextSession.command("outdent");
      } else if (action === "unordered-list") {
        richTextSession.command("insertUnorderedList");
      } else if (action === "ordered-list") {
        richTextSession.command("insertOrderedList");
      } else if (action === "task-list") {
        richTextSession.command("toggleTaskList");
      } else if (action === "horizontal-rule") {
        richTextSession.command("insertHorizontalRule");
      } else if (action === "color") {
        if (color) {
          richTextSession.command("foreColor", color);
        }
      } else if (action === "highlight") {
        richTextSession.command("highlight", "#fff4a3");
      } else if (action === "fontSize") {
        if (color) {
          richTextSession.command("fontSize", color);
        }
      }
      richTextSession.focus();
      richTextSession.captureSelection();
      applyInlineFontSizingToContainer(refs.richEditor, state.board.view.scale);
      syncActiveRichEditingItemState();
    });
  }

  function onGlobalPointerDown(event) {
    hideLinkMetaTooltip();
    if (
      state.editingType === "table" &&
      event.target instanceof Element &&
      !(refs.tableEditor?.contains(event.target) || refs.tableToolbar?.contains(event.target))
    ) {
      commitTableEdit();
    }
    if (refs.richSelectionToolbar && event.target instanceof Element && !refs.richSelectionToolbar.contains(event.target)) {
      const activeInput = document.activeElement;
      if (
        activeInput instanceof HTMLInputElement &&
        refs.richSelectionToolbar.contains(activeInput) &&
        activeInput.getAttribute("data-action") === "selection-font-size-input"
      ) {
        applyRichSelectionFontSizeFromInput(activeInput);
      }
    }
    if (refs.richSelectionToolbar && event.target instanceof Element && !refs.richSelectionToolbar.contains(event.target)) {
      closeRichSelectionFontSizePanel();
    }
    if (
      event.target instanceof Element &&
      !refs.richToolbar?.contains(event.target) &&
      !refs.richSelectionToolbar?.contains(event.target)
    ) {
      closeRichToolbarSubmenus();
    }
    if (refs.contextMenu?.classList.contains("is-hidden")) {
      return;
    }
    if (refs.contextMenu && event.target instanceof Element && refs.contextMenu.contains(event.target)) {
      return;
    }
    hideContextMenu();
  }

  function onContextMenuPointerOver(event) {
    const target = event.target instanceof Element ? event.target : null;
    const submenu = target?.closest?.(".canvas2d-context-submenu");
    if (submenu instanceof HTMLElement) {
      openContextSubmenu(submenu);
      return;
    }
    if (!target?.closest?.(".canvas2d-context-submenu-panel")) {
      closeContextSubmenus();
    }
  }

  function onContextMenuPointerLeave() {
    closeContextSubmenus();
  }

  function onContextMenuFocusIn(event) {
    const target = event.target instanceof Element ? event.target : null;
    const submenu = target?.closest?.(".canvas2d-context-submenu");
    if (submenu instanceof HTMLElement) {
      openContextSubmenu(submenu);
    }
  }

  function onContextMenuFocusOut(event) {
    const nextTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (nextTarget && refs.contextMenu?.contains(nextTarget)) {
      return;
    }
    closeContextSubmenus();
  }

  function onRichToolbarClick(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) {
      return;
    }
    const action = target.getAttribute("data-action");
    if (!action) {
      return;
    }
    if (target instanceof HTMLSelectElement) {
      return;
    }
    event.preventDefault();
    if (action !== "toggle-blockquote-menu" && action !== "toggle-math-menu") {
      closeRichToolbarSubmenus();
    }
    if (action === "toggle-blockquote-menu" || action === "toggle-math-menu") {
      toggleRichToolbarSubmenu(target.closest(".canvas2d-rich-submenu"));
      return;
    }
    if (action === "toggle-font-size-panel") {
      toggleRichSelectionFontSizePanel();
      return;
    }
    if (action === "font-size-step-down") {
      stepRichSelectionFontSize(-1);
      return;
    }
    if (action === "font-size-step-up") {
      stepRichSelectionFontSize(1);
      return;
    }
    if (action === "font-size-preset") {
      const size = Number(target.getAttribute("data-size") || 0);
      if (size > 0) {
        applyRichSelectionFontSize(size);
        closeRichSelectionFontSizePanel();
      }
      return;
    }
    if (action === "color") {
      const color = target.getAttribute("data-color");
      applyRichTextCommand(action, color);
      return;
    }
    applyRichTextCommand(action);
  }

  function onImageToolbarClick(event) {
    if (!state.editingId || state.editingType !== "image") {
      return;
    }
    event.preventDefault();
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    const action = target?.getAttribute("data-action") || "";
    if (action === "image-done") {
      finishImageEdit();
      return;
    }
    lightImageEditor.handleToolbarClick(event, renderImageToCanvas);
  }

  function onRichToolbarPointerDown(event) {
    const target = event.target instanceof Element ? event.target.closest("button, [data-action]") : null;
    if (target instanceof HTMLButtonElement) {
      event.preventDefault();
    }
    richTextSession.captureSelection();
  }

  function setRichFontSize(nextSize) {
    const value = normalizeRichEditorFontSize(nextSize, richFontSize);
    richFontSize = value;
    if (state.editingId) {
      const item = state.board.items.find(
        (entry) => entry.id === state.editingId && (entry.type === "text" || entry.type === "flowNode")
      );
      if (item && !isLockedItem(item)) {
        item.fontSize = value;
        const scale = Math.max(0.1, Number(state.board.view.scale || 1));
        refs.richEditor.style.fontSize = `${Math.max(1, value * scale)}px`;
        applyRichEditorLayoutStyles(refs.richEditor, item, scale);
        richTextSession.setFontSize(value, { normalize: true });
        syncActiveRichEditingItemState();
      }
    }
    syncRichTextFontSize();
  }

  function applyHighlightToSelection() {
    return applyTextMarkToSelection({
      mark: "highlight",
      style: "background-color: #fff4a3;",
      tagName: "mark",
      label: "高光",
    });
  }

  function applyUnderlineToSelection() {
    return applyTextMarkToSelection({
      mark: "underline",
      style: "text-decoration: underline;",
      label: "下划线",
    });
  }

  function applyStrikeToSelection() {
    return applyTextMarkToSelection({
      mark: "strike",
      style: "text-decoration: line-through;",
      label: "删除线",
    });
  }

  function applyTextMarkToSelection({ mark, style, label, tagName = "span" }) {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selectedIds = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    let changed = false;
    state.board.items = state.board.items.map((item) => {
      if (!selectedIds.has(item.id)) {
        return item;
      }
      if (item.type === "text") {
        if (isLockedText(item)) {
          return item;
        }
      } else if (item.type === "flowNode") {
        if (isLockedItem(item)) {
          return item;
        }
      } else {
        return item;
      }
      const html = item.html?.trim() ? item.html : escapeHtml(item.plainText || item.text || "");
      const nextHtml = toggleMarkHtml(html, mark, style, tagName);
      if (nextHtml === html) {
        return item;
      }
      const plainText = htmlToPlainText(nextHtml);
      changed = true;
      if (item.type === "text") {
        const nextResizeMode = getTextResizeMode(item);
        const nextSize = getTextMinSize(
          {
            ...item,
            html: sanitizeHtml(nextHtml),
            plainText,
            text: plainText,
            textResizeMode: nextResizeMode,
          },
          {
            widthHint: nextResizeMode === TEXT_RESIZE_MODE_WRAP ? Number(item.width || 0) || undefined : undefined,
            fontSize: item.fontSize || DEFAULT_TEXT_FONT_SIZE,
          }
        );
        return {
          ...item,
          html: sanitizeHtml(nextHtml),
          plainText,
          text: plainText,
          wrapMode: item.wrapMode || TEXT_WRAP_MODE_MANUAL,
          textResizeMode: nextResizeMode,
          title: buildTextTitle(plainText || "文本"),
          width: nextResizeMode === TEXT_RESIZE_MODE_WRAP ? Math.max(80, Number(item.width || 0) || nextSize.width) : nextSize.width,
          height: nextSize.height,
        };
      }
      return {
        ...item,
        html: sanitizeHtml(nextHtml),
        plainText,
        wrapMode: item.wrapMode || FLOW_NODE_WRAP_MODE,
      };
    });
    if (!changed) {
      return false;
    }
    commitHistory(before, `${label}文本`);
    setStatus(`已切换${label}`);
    return true;
  }

  function toggleMarkHtml(html = "", mark, style, tagName = "span") {
    const safeHtml = String(html || "");
    if (typeof document === "undefined") {
      const marker = `data-mark="${mark}"`;
      if (safeHtml.includes(marker)) {
        return safeHtml.replace(new RegExp(`<span[^>]*${marker}[^>]*>([\\s\\S]*?)<\\/span>`, "gi"), "$1");
      }
      return `<${tagName} data-mark="${mark}" style="${style}">${safeHtml}</${tagName}>`;
    }
    const template = document.createElement("template");
    template.innerHTML = safeHtml;
    const marked = template.content.querySelector(`[data-mark="${mark}"]`);
    if (marked) {
      unwrapNode(marked);
      return template.innerHTML || "";
    }
    const wrapper = document.createElement(tagName);
    wrapper.setAttribute("data-mark", mark);
    wrapper.setAttribute("style", style);
    while (template.content.firstChild) {
      wrapper.appendChild(template.content.firstChild);
    }
    template.content.appendChild(wrapper);
    return template.innerHTML || "";
  }

  function applyTextPresetToSelection(presetName = "body") {
    const preset = TEXT_STYLE_PRESETS[presetName];
    if (!preset || !state.board.selectedIds.length) {
      return false;
    }
    const selectedIds = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    let changed = false;
    state.board.items = state.board.items.map((item) => {
      if (!selectedIds.has(item.id)) {
        return item;
      }
      if (item.type === "text") {
        if (isLockedText(item)) {
          return item;
        }
      } else if (item.type === "flowNode") {
        if (isLockedItem(item)) {
          return item;
        }
      } else {
        return item;
      }
      const plainText = sanitizeText(item.plainText || item.text || htmlToPlainText(item.html || ""));
      const nextHtml = sanitizeHtml(buildTextPresetHtml(item, preset));
      changed = true;
      if (item.type === "text") {
        const nextResizeMode = getTextResizeMode(item);
        const nextSize = getTextMinSize(
          {
            ...item,
            html: nextHtml,
            plainText,
            text: plainText,
            fontSize: preset.fontSize,
            textResizeMode: nextResizeMode,
          },
          {
            widthHint: nextResizeMode === TEXT_RESIZE_MODE_WRAP ? Number(item.width || 0) || undefined : undefined,
            fontSize: preset.fontSize,
          }
        );
        return {
          ...item,
          fontSize: preset.fontSize,
          html: nextHtml,
          plainText,
          text: plainText,
          wrapMode: item.wrapMode || TEXT_WRAP_MODE_MANUAL,
          textResizeMode: nextResizeMode,
          title: buildTextTitle(plainText || "文本"),
          width: nextResizeMode === TEXT_RESIZE_MODE_WRAP ? Math.max(80, Number(item.width || 0) || nextSize.width) : nextSize.width,
          height: nextSize.height,
        };
      }
      const nextNode = {
        ...item,
        fontSize: preset.fontSize,
        html: nextHtml,
        plainText,
        wrapMode: item.wrapMode || FLOW_NODE_WRAP_MODE,
      };
      const minNodeSize = getFlowNodeMinSize(nextNode, { widthHint: nextNode.width });
      nextNode.width = Math.max(Number(nextNode.width || 0) || 0, minNodeSize.width);
      nextNode.height = Math.max(Number(nextNode.height || 0) || 0, minNodeSize.height);
      return nextNode;
    });
    if (!changed) {
      return false;
    }
    if (state.editingId && (state.editingType === "text" || state.editingType === "flow-node")) {
      const editingItem = state.board.items.find(
        (entry) => entry.id === state.editingId && (entry.type === "text" || entry.type === "flowNode")
      );
      if (editingItem && richTextSession.isActive()) {
        richFontSize = preset.fontSize;
        richTextSession.syncContent({
          itemId: editingItem.id,
          html: editingItem.html || "",
          plainText: editingItem.plainText || editingItem.text || "",
          fontSize: preset.fontSize,
          force: true,
        });
        richTextSession.setFontSize(preset.fontSize, { normalize: true });
        syncRichTextFontSize();
        syncEditingRichEditorFrame(refs.richEditor, editingItem, state.board.view);
      }
    }
    commitHistory(before, `设置${preset.label}`);
    setStatus(`已应用${preset.label}样式`);
    return true;
  }


  function convertTextToFlowNode() {
    if (state.board.selectedIds.length !== 1) {
      return false;
    }
    const selectedId = state.board.selectedIds[0];
    const textItem = state.board.items.find((item) => item.id === selectedId);
    if (!textItem) {
      return false;
    }
    if (textItem.type === "flowNode") {
      setStatus("已是节点文本");
      return false;
    }
    if (textItem.type !== "text") {
      setStatus("仅文本可转换为节点");
      return false;
    }
    if (isLockedText(textItem)) {
      setStatus("文本已锁定，无法转换");
      return false;
    }
    const before = takeHistorySnapshot(state);
    const node = flowModule.createNode({ x: Number(textItem.x || 0), y: Number(textItem.y || 0) });
    const plainText = String(textItem.plainText || textItem.text || "");
    const html = String(textItem.html || "");
    node.id = textItem.id;
    node.html = html;
    node.plainText = plainText;
    node.wrapMode = FLOW_NODE_WRAP_MODE;
    node.fontSize = Number(textItem.fontSize || node.fontSize || 18);
    node.color = String(textItem.color || node.color || "#0f172a");
    node.width = Math.max(Number(textItem.width || node.width), node.width);
    node.height = Math.max(Number(textItem.height || node.height), node.height);
    const minNodeSize = getFlowNodeMinSize(node, { widthHint: node.width });
    node.width = Math.max(node.width, minNodeSize.width);
    node.height = Math.max(node.height, minNodeSize.height);
    if (textItem.groupId) {
      node.groupId = textItem.groupId;
    }
    state.board.items = state.board.items.map((item) => {
      if (item.id !== textItem.id) {
        return item;
      }
      return { ...node };
    });
    state.board.selectedIds = [node.id];
    commitHistory(before, "节点文本");
    setStatus("已转换为节点文本");
    return true;
  }

  function convertFlowNodeToText() {
    if (state.board.selectedIds.length !== 1) {
      return false;
    }
    const selectedId = state.board.selectedIds[0];
    const nodeItem = state.board.items.find((item) => item.id === selectedId);
    if (!nodeItem) {
      return false;
    }
    if (nodeItem.type !== "flowNode") {
      setStatus("仅节点文本可转换为普通文本");
      return false;
    }
    if (isLockedItem(nodeItem)) {
      setStatus("节点已锁定，无法转换");
      return false;
    }
    const before = takeHistorySnapshot(state);
    const textItem = createTextElement({ x: Number(nodeItem.x || 0), y: Number(nodeItem.y || 0) }, "", "");
    const plainText = String(nodeItem.plainText || nodeItem.text || "");
    const html = String(nodeItem.html || "");
    const size = getTextMinSize({
      ...textItem,
      html,
      plainText,
      text: plainText,
      fontSize: nodeItem.fontSize || textItem.fontSize || 18,
      textResizeMode: TEXT_RESIZE_MODE_AUTO_WIDTH,
    });
    const next = {
      ...textItem,
      id: nodeItem.id,
      html,
      plainText,
      text: plainText,
      wrapMode: TEXT_WRAP_MODE_MANUAL,
      textResizeMode: TEXT_RESIZE_MODE_AUTO_WIDTH,
      fontSize: Number(nodeItem.fontSize || textItem.fontSize || 18),
      color: String(nodeItem.color || textItem.color || "#0f172a"),
      width: size.width,
      height: size.height,
      title: buildTextTitle(plainText || "文本"),
    };
    if (nodeItem.groupId) {
      next.groupId = nodeItem.groupId;
    }
    state.board.items = state.board.items.map((item) => (item.id === nodeItem.id ? next : item));
    state.board.selectedIds = [next.id];
    commitHistory(before, "恢复普通文本");
    setStatus("已恢复为普通文本");
    return true;
  }

  function toggleNodeText() {
    if (state.board.selectedIds.length !== 1) {
      return false;
    }
    const selectedId = state.board.selectedIds[0];
    const item = state.board.items.find((entry) => entry.id === selectedId);
    if (!item) {
      return false;
    }
    if (item.type === "flowNode") {
      return convertFlowNodeToText();
    }
    return convertTextToFlowNode();
  }

  function updateFlowEdgeStyle(style, arrowDirection = "forward") {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const nextStyle = style === "dashed" || style === "arrow" || style === "solid" ? style : "solid";
    const nextArrowDirection = arrowDirection === "backward" ? "backward" : "forward";
    const selectedIds = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    let changed = false;
    state.board.items = state.board.items.map((item) => {
      if (item.type !== "flowEdge" || !selectedIds.has(item.id)) {
        return item;
      }
      if (item.style === nextStyle && item.arrowDirection === nextArrowDirection) {
        return item;
      }
      changed = true;
      return {
        ...item,
        style: nextStyle,
        arrowDirection: nextStyle === "arrow" ? nextArrowDirection : "forward",
      };
    });
    if (!changed) {
      return false;
    }
    commitHistory(before, "更新连线");
    setStatus("已更新连线样式");
    return true;
  }

  function removeFlowEdges() {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selectedIds = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    const nextItems = state.board.items.filter((item) => !(item.type === "flowEdge" && selectedIds.has(item.id)));
    if (nextItems.length === state.board.items.length) {
      return false;
    }
    state.board.items = nextItems;
    state.board.selectedIds = state.board.selectedIds.filter((id) => !selectedIds.has(id));
    commitHistory(before, "删除连线");
    setStatus("已删除连线");
    return true;
  }

  function onRichToolbarInput(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) {
      return;
    }
    const action = target.getAttribute("data-action");
    if (action === "block-type" && target instanceof HTMLSelectElement) {
      requestAnimationFrame(() => {
        if (!richTextSession.isActive()) {
          return;
        }
        richTextSession.command("setBlockType", target.value || "paragraph");
        syncActiveRichEditingItemState();
      });
      return;
    }
    if (action === "selection-font-size-input" && target instanceof HTMLInputElement) {
      if (event.type !== "change") {
        return;
      }
      applyRichSelectionFontSizeFromInput(target);
    }
  }

  function onRichSelectionToolbarWheel(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest?.("[data-size-control]")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const deltaY = Number(event.deltaY || 0);
    const legacyDelta = Number(event.wheelDelta || 0);
    const resolvedDelta = deltaY !== 0 ? deltaY : legacyDelta !== 0 ? -legacyDelta : 0;
    if (!resolvedDelta) {
      return;
    }
    const step = resolvedDelta < 0 ? 1 : -1;
    stepRichSelectionFontSize(step);
  }

  function onRichSelectionToolbarKeyDown(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!(target instanceof HTMLInputElement) || target.getAttribute("data-action") !== "selection-font-size-input") {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      applyRichSelectionFontSizeFromInput(target);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      stepRichSelectionFontSize(1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      stepRichSelectionFontSize(-1);
    }
  }

  function onRichSelectionToolbarFocusOut(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!(target instanceof HTMLInputElement) || target.getAttribute("data-action") !== "selection-font-size-input") {
      return;
    }
    applyRichSelectionFontSizeFromInput(target);
  }

  function onRichEditorContextMenu(event) {
    const { hasExpandedSelection } = getRichTextSelectionState();
    if (!hasExpandedSelection) {
      return;
    }
    event.preventDefault();
    hideContextMenu();
    richTextSession.captureSelection();
    syncRichTextToolbar({
      point: {
        clientX: Number(event.clientX || 0),
        clientY: Number(event.clientY || 0),
      },
    });
  }

  function onRichEditorPointerDown(event) {
    if (Number(event.button) === 2) {
      richTextSession.captureSelection();
      const { hasExpandedSelection } = getRichTextSelectionState();
      if (hasExpandedSelection) {
        event.preventDefault();
        hideContextMenu();
        syncRichTextToolbar({
          point: {
            clientX: Number(event.clientX || 0),
            clientY: Number(event.clientY || 0),
          },
        });
      }
    }
  }

  function onRichEditorWheel(event) {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }
    onWheel(event);
  }

  function writeClipboardDataWithProtocols(
    dataTransfer,
    { marker = "", html = "", text = "", richTextPayload = null } = {}
  ) {
    if (!dataTransfer) {
      return false;
    }
    const cleanHtml = String(html || "").trim();
    const plainText = sanitizeText(String(text || ""));
    const cleanText = plainText || (cleanHtml ? sanitizeText(htmlToPlainText(cleanHtml)) : "");
    if (!cleanHtml && !cleanText) {
      return false;
    }
    if (marker) {
      dataTransfer.setData(CANVAS_CLIPBOARD_MIME, String(marker));
    }
    if (richTextPayload) {
      dataTransfer.setData(RICH_TEXT_CLIPBOARD_MIME, stringifyRichTextClipboardPayload(richTextPayload));
    }
    if (cleanHtml) {
      dataTransfer.setData("text/html", cleanHtml);
    }
    if (cleanText) {
      dataTransfer.setData("text/plain", cleanText);
    }
    return true;
  }

  function getRichEditorSelectionClipboardPayload(item) {
    const baseFontSize = item?.fontSize || richFontSize || DEFAULT_TEXT_FONT_SIZE;
    const rawHtml =
      richTextSession.getSelectionHtml({
        baseFontSize,
      }) || "";
    const html = sanitizeHtml(normalizeRichHtmlInlineFontSizes(normalizeRichHtml(rawHtml), baseFontSize)).trim();
    const text = sanitizeText(richTextSession.getSelectionText() || "") || sanitizeText(htmlToPlainText(html));
    if (!html && !text) {
      return null;
    }
    const richTextPayload = createRichTextClipboardPayload({
      html,
      plainText: text,
      baseFontSize,
      source: CLIPBOARD_SOURCE_RICH_EDITOR,
      itemType: item?.type || "text",
    });
    return {
      html,
      text,
      richTextPayload,
    };
  }

  function getRichEditorPasteClipboardPayload(dataTransfer, item) {
    if (!dataTransfer) {
      return null;
    }
    const marker = parseInternalClipboardMarker(dataTransfer.getData(CANVAS_CLIPBOARD_MIME));
    const baseFontSize = item?.fontSize || richFontSize || DEFAULT_TEXT_FONT_SIZE;
    const richPayload =
      readRichTextClipboardPayload(dataTransfer) ||
      parseRichTextClipboardPayload(dataTransfer.getData(RICH_TEXT_CLIPBOARD_MIME));
    let html = String(richPayload?.html || dataTransfer.getData("text/html") || "");
    let text = String(richPayload?.plainText || dataTransfer.getData("text/plain") || "");
    if (html) {
      html = sanitizeHtml(normalizeRichHtmlInlineFontSizes(normalizeRichHtml(html), baseFontSize)).trim();
    }
    text = sanitizeText(text || "") || sanitizeText(htmlToPlainText(html));
    if (!html && text) {
      html = convertPlainClipboardTextToSemanticHtml(text, baseFontSize);
    }
    if (!html && !text && marker?.source === CLIPBOARD_SOURCE_CANVAS && state.clipboard?.items?.length) {
      html = sanitizeHtml(
        normalizeRichHtmlInlineFontSizes(normalizeRichHtml(String(state.clipboard?.html || "")), baseFontSize)
      ).trim();
      text = sanitizeText(state.clipboard?.text || "") || sanitizeText(htmlToPlainText(html));
    }
    if (!html && !text) {
      return null;
    }
    return {
      marker,
      html,
      text,
      richTextPayload: richPayload,
    };
  }

  function insertRichEditorClipboardPayload(payload) {
    const html = String(payload?.html || "").trim();
    const text = sanitizeText(payload?.text || "");
    if (!html && !text) {
      return false;
    }
    if (!(refs.richEditor instanceof HTMLDivElement)) {
      return false;
    }
    refs.richEditor.focus();
    let inserted = false;
    if (typeof document?.execCommand === "function") {
      if (html) {
        inserted = document.execCommand("insertHTML", false, html);
      }
      if (!inserted && text) {
        inserted = document.execCommand("insertText", false, text);
      }
    }
    if (!inserted) {
      const selection = document.getSelection?.();
      if (selection?.rangeCount) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        if (html) {
          const template = document.createElement("template");
          template.innerHTML = html;
          const fragment = template.content.cloneNode(true);
          const tail = fragment.lastChild;
          range.insertNode(fragment);
          if (tail) {
            range.setStartAfter(tail);
            range.setEndAfter(tail);
          }
        } else {
          const textNode = document.createTextNode(text);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.setEndAfter(textNode);
        }
        selection.removeAllRanges();
        selection.addRange(range);
        inserted = true;
      }
    }
    if (inserted) {
      syncActiveRichEditingItemState();
      syncRichTextToolbar();
    }
    return inserted;
  }

  function onRichEditorCopy(event) {
    if (!event.clipboardData) {
      return;
    }
    const item = getActiveRichEditingItem();
    if (!item) {
      return;
    }
    const payload = getRichEditorSelectionClipboardPayload(item);
    if (!payload) {
      return;
    }
    const marker = buildInternalClipboardMarker({
      copiedAt: Date.now(),
      itemCount: 1,
      source: CLIPBOARD_SOURCE_RICH_EDITOR,
      kind: CLIPBOARD_KIND_RICH_TEXT,
    });
    clearInternalClipboard();
    event.preventDefault();
    writeClipboardDataWithProtocols(event.clipboardData, {
      marker,
      html: payload.html,
      text: payload.text,
      richTextPayload: payload.richTextPayload,
    });
  }

  function onRichEditorDoubleClick(event) {
    const selection = document.getSelection?.();
    const anchorNode = selection?.anchorNode || event.target;
    const anchorElement =
      anchorNode instanceof Element
        ? anchorNode
        : anchorNode?.parentElement instanceof Element
          ? anchorNode.parentElement
          : null;
    const linkEl = anchorElement?.closest?.("a[href]");
    if (!(linkEl instanceof HTMLAnchorElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const currentHref = String(linkEl.getAttribute("href") || linkEl.href || "").trim();
    const nextHref = window.prompt("编辑链接 URL（留空移除链接）", currentHref);
    if (nextHref == null) {
      return;
    }
    if (!richTextSession.isActive()) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(linkEl);
    selection?.removeAllRanges();
    selection?.addRange(range);
    richTextSession.captureSelection();
    if (String(nextHref || "").trim()) {
      richTextSession.command("createLink", String(nextHref || "").trim());
    } else {
      richTextSession.command("unlink");
    }
    syncActiveRichEditingItemState();
    syncRichTextToolbar();
  }

  function onRichDisplayClick(event) {
    const descriptor = resolveLinkDescriptorFromAnchor(event.target);
    if (!descriptor?.linkEl) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (!(event.ctrlKey || event.metaKey)) {
      setStatus("按 Ctrl/Cmd+点击链接可打开网页");
      return;
    }
    const opened = openExternalUrl(descriptor.url || descriptor.normalizedUrl || "");
    setStatus(opened ? "已打开链接" : "链接打开失败");
  }

  function onRichDisplayPointerMove(event) {
    onPointerMove(event);
    const descriptor = resolveLinkDescriptorFromAnchor(event.target);
    if (!descriptor) {
      hideLinkMetaTooltip();
      return;
    }
    updateLinkMetaTooltip(descriptor, Number(event.clientX || 0), Number(event.clientY || 0));
  }

  function onRichDisplayPointerLeave() {
    hideLinkMetaTooltip();
  }

  function onRichDisplayPointerDown(event) {
    if (!(event.target instanceof Element) || !event.target.closest("a[href], a[data-link-token='1']")) {
      return;
    }
    event.preventDefault();
    onPointerDown(event);
  }

  function onRichDisplayPointerUp(event) {
    if (!(event.target instanceof Element) || !event.target.closest("a[href], a[data-link-token='1']")) {
      return;
    }
    onPointerUp(event);
  }

  function onRichDisplayDoubleClick(event) {
    if (!(event.target instanceof Element) || !event.target.closest("a[href], a[data-link-token='1']")) {
      return;
    }
    event.preventDefault();
    onDoubleClick(event);
  }

  function onRichEditorCut(event) {
    if (!event.clipboardData) {
      return;
    }
    const item = getActiveRichEditingItem();
    if (!item) {
      return;
    }
    const payload = getRichEditorSelectionClipboardPayload(item);
    if (!payload) {
      return;
    }
    const marker = buildInternalClipboardMarker({
      copiedAt: Date.now(),
      itemCount: 1,
      source: CLIPBOARD_SOURCE_RICH_EDITOR,
      kind: CLIPBOARD_KIND_RICH_TEXT,
    });
    clearInternalClipboard();
    event.preventDefault();
    writeClipboardDataWithProtocols(event.clipboardData, {
      marker,
      html: payload.html,
      text: payload.text,
      richTextPayload: payload.richTextPayload,
    });
    richTextSession.deleteSelection();
    syncActiveRichEditingItemState();
  }

  function onRichEditorPaste(event) {
    if (!event.clipboardData) {
      return;
    }
    const item = getActiveRichEditingItem();
    if (!item) {
      return;
    }
    const payload = getRichEditorPasteClipboardPayload(event.clipboardData, item);
    if (!payload) {
      return;
    }
    const inserted = insertRichEditorClipboardPayload(payload);
    if (!inserted) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function onRichEditorBlur(event) {
    richTextSession.handleBlur(event, {
      ignoreTargets: [refs.richToolbar, refs.richSelectionToolbar],
      onCommit: () => commitRichEdit(),
    });
  }

  function onRichEditorInput() {
    if (!state.editingId || !(refs.richEditor instanceof HTMLDivElement)) {
      return;
    }
    const item = getActiveRichEditingItem();
    if (!item || (item.type === "text" && isLockedText(item)) || (item.type === "flowNode" && isLockedItem(item))) {
      return;
    }
    richTextSession.handleInput(() => {
      syncActiveRichEditingItemState({ emit: false, refreshToolbar: false, markDirty: true });
      requestAnimationFrame(() => syncRichTextToolbar());
    });
  }

  function onFileMemoBlur() {
    commitFileMemoEdit();
  }

  function onFileMemoKeyDown(event) {
    const key = String(event.key || "").toLowerCase();
    if (key === "enter" && !event.shiftKey) {
      event.preventDefault();
      commitFileMemoEdit();
      return;
    }
    if (key === "escape") {
      event.preventDefault();
      cancelFileMemoEdit();
    }
  }

  function onFileMemoInput() {
    syncActiveDraftEditingState({ markDirty: true });
    syncFileMemoLayout();
  }

  function onImageMemoBlur() {
    commitImageMemoEdit();
  }

  function onImageMemoKeyDown(event) {
    const key = String(event.key || "").toLowerCase();
    if (key === "enter" && !event.shiftKey) {
      event.preventDefault();
      commitImageMemoEdit();
      return;
    }
    if (key === "escape") {
      event.preventDefault();
      cancelImageMemoEdit();
    }
  }

  function onImageMemoInput() {
    syncActiveDraftEditingState({ markDirty: true });
    syncImageMemoLayout();
  }

  function onTableEditorPointerDown(event) {
    event.stopPropagation();
    const cell = event.target instanceof Element ? event.target.closest("[data-row-index][data-column-index]") : null;
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    tableEditSelection = {
      rowIndex: Math.max(0, Number(cell.getAttribute("data-row-index")) || 0),
      columnIndex: Math.max(0, Number(cell.getAttribute("data-column-index")) || 0),
    };
    syncTableEditorSelectionUI();
  }

  function onTableEditorInput() {
    syncActiveDraftEditingState({ markDirty: true });
    syncTableEditorSelectionUI();
  }

  function onTableEditorKeyDown(event) {
    const cell = event.target instanceof Element ? event.target.closest("[data-row-index][data-column-index]") : null;
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    const rowIndex = Math.max(0, Number(cell.getAttribute("data-row-index")) || 0);
    const columnIndex = Math.max(0, Number(cell.getAttribute("data-column-index")) || 0);
    const key = String(event.key || "").toLowerCase();
    if (key === "escape") {
      event.preventDefault();
      cancelTableEdit();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "enter") {
      event.preventDefault();
      commitTableEdit();
      return;
    }
    if (key === "tab") {
      event.preventDefault();
      const matrix = buildTableMatrixFromEditor();
      const rowCount = Math.max(1, matrix.length);
      const columnCount = Math.max(1, matrix[0]?.length || 1);
      const movingBackward = Boolean(event.shiftKey);
      const rawColumn = movingBackward ? columnIndex - 1 : columnIndex + 1;
      const rawRow = movingBackward ? rowIndex - (rawColumn < 0 ? 1 : 0) : rowIndex + (rawColumn >= columnCount ? 1 : 0);
      const nextRow = Math.max(0, Math.min(rowCount - 1, rawRow));
      const nextColumn = movingBackward
        ? (rawColumn < 0 ? columnCount - 1 : rawColumn)
        : (rawColumn >= columnCount ? 0 : rawColumn);
      focusTableEditorCell(nextRow, nextColumn, { placeAtEnd: true });
    }
  }

  function onTableToolbarPointerDown(event) {
    event.stopPropagation();
  }

  function onTableToolbarClick(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) {
      return;
    }
    event.preventDefault();
    onContextMenuClick(event);
  }

  function onDragStart(event) {
    if (!isInteractiveMode() || !event.dataTransfer) {
      return;
    }
    if (suppressNativeDrag) {
      event.preventDefault();
      return;
    }
    const selected = state.board.items.filter((item) => state.board.selectedIds.includes(item.id));
    const hoverItem = state.hoverId ? state.board.items.find((item) => item.id === state.hoverId) : null;
    const textItems = selected.filter((item) => item.type === "text");
    const fallbackItems = !textItems.length && hoverItem?.type === "text" ? [hoverItem] : [];
    if (!textItems.length) {
      if (!fallbackItems.length) {
        event.preventDefault();
        return;
      }
    }
    const dragItems = textItems.length ? textItems : fallbackItems;
    const text = dragItems
      .map((item) => sanitizeText(item.plainText || item.text || ""))
      .join("\n")
      .trim();
    if (!text) {
      event.preventDefault();
      return;
    }
    const dragPayload = clipboardBroker.buildPayloadFromItems(dragItems);
    const copiedAt = Number(dragPayload?.copiedAt) || Date.now();
    const marker = buildInternalClipboardMarker({
      copiedAt,
      itemCount: Array.isArray(dragPayload?.items) ? dragPayload.items.length : 0,
      source: CLIPBOARD_SOURCE_CANVAS,
      kind: CLIPBOARD_KIND_ITEMS,
    });
    clipboardBroker.setPayload(dragPayload);
    state.clipboard = dragPayload ? { ...dragPayload, pasteCount: 0 } : null;
    event.dataTransfer.clearData();
    event.dataTransfer.setData(CANVAS_CLIPBOARD_MIME, marker);
    event.dataTransfer.setData(
      "text/html",
      buildInternalDragHtmlPayload({
        marker,
        text,
      })
    );
    event.dataTransfer.setData("text/plain", text);
    event.dataTransfer.effectAllowed = "copy";
  }

  async function onDrop(event) {
    if (!isInteractiveMode()) {
      return;
    }
    event.preventDefault();
    const scenePoint = toScenePoint(event.clientX, event.clientY);
    if (matchesInternalClipboardByMarker(event.dataTransfer)) {
      pasteInternalClipboard(scenePoint, {
        stagger: false,
        forceWrapText: true,
        historyReason: "拖拽复制",
        statusPrefix: "已拖拽复制",
      });
      return;
    }
    for (const handler of dragHandlers) {
      const result = await handler?.({
        event,
        dataTransfer: event.dataTransfer,
        anchor: scenePoint,
        state,
      });
      if (result?.handled) {
        if (Array.isArray(result.items) && result.items.length) {
          try {
            await persistImportedImages(result.items);
          } catch {
            // ignore import persistence failures
          }
          pushItems(result.items, { reason: "拖拽导入", statusText: `已导入 ${result.items.length} 个内容` });
        }
        return;
      }
    }
    const structuredHandled = await tryStructuredImportDescriptor(
      structuredImportRuntime.dragGateway.fromDropEvent(event, {
        origin: "engine-drop",
        anchor: scenePoint,
      }),
      scenePoint,
      {
        reason: "拖拽导入",
        statusText: "已通过新导入链路导入内容",
        context: {
          origin: "engine-drop",
        },
      }
    );
    if (structuredHandled) {
      return;
    }
    const result = await dragBroker.importFromDataTransfer(event.dataTransfer, scenePoint);
    if (result?.handled && result.items?.length) {
      try {
        await persistImportedImages(result.items);
      } catch {
        // ignore import persistence failures
      }
      pushItems(result.items, { reason: "拖拽导入", statusText: `已导入 ${result.items.length} 个内容` });
      return;
    }
  }

  async function onCopy(event) {
    if (!isInteractiveMode() || !state.board.selectedIds.length) {
      return;
    }
    event.preventDefault();
    const payload = await copySelection();
    if (payload && event.clipboardData) {
      event.clipboardData.setData(
        CANVAS_CLIPBOARD_MIME,
        buildInternalClipboardMarker({
          copiedAt: Number(payload.copiedAt) || Date.now(),
          itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
          source: CLIPBOARD_SOURCE_CANVAS,
          kind: CLIPBOARD_KIND_ITEMS,
        })
      );
      if (payload.text) {
        event.clipboardData.setData("text/plain", payload.text);
      }
      if (payload.html) {
        event.clipboardData.setData("text/html", payload.html);
      }
    }
  }

  async function onCut(event) {
    if (!isInteractiveMode() || !state.board.selectedIds.length) {
      return;
    }
    event.preventDefault();
    await cutSelection();
  }

  async function onPaste(event) {
    if (!isInteractiveMode() || state.editingId) {
      return;
    }
    const anchor = state.lastPointerScenePoint || getCenterScenePoint();
    if (matchesInternalClipboardByMarker(event.clipboardData) || (await shouldUseInternalClipboard())) {
      event.preventDefault();
      pasteInternalClipboard(anchor);
      return;
    }
    for (const handler of pasteHandlers) {
      const result = await handler?.({
        event,
        dataTransfer: event.clipboardData,
        anchor,
        state,
      });
      if (result?.handled) {
        event.preventDefault();
        if (Array.isArray(result.items) && result.items.length) {
          try {
            await persistImportedImages(result.items);
          } catch {
            // ignore import persistence failures
          }
          pushItems(result.items, { reason: "粘贴内容", statusText: `已粘贴 ${result.items.length} 个内容` });
        }
        return;
      }
    }
    const structuredHandled = await tryStructuredImportDescriptor(
      structuredImportRuntime.pasteGateway.fromClipboardEvent(event, {
        origin: "engine-paste",
        anchor,
      }),
      anchor,
      {
        reason: "粘贴内容",
        statusText: "已通过新导入链路粘贴内容",
        context: {
          origin: "engine-paste",
        },
      }
    );
    if (structuredHandled) {
      event.preventDefault();
      return;
    }
    const result = await dragBroker.importFromDataTransfer(event.clipboardData, anchor);
    if (result?.handled && result.items?.length) {
      event.preventDefault();
      try {
        await persistImportedImages(result.items);
      } catch {
        // ignore import persistence failures
      }
      pushItems(result.items, { reason: "粘贴内容", statusText: `已粘贴 ${result.items.length} 个内容` });
      return;
    }
    const filePaths = await clipboardBroker.readSystemClipboardFiles();
    if (filePaths.length) {
      event.preventDefault();
      const items = await dragBroker.createFileCardsFromPaths(filePaths, anchor);
      try {
        await persistImportedImages(items);
      } catch {
        // ignore import persistence failures
      }
      pushItems(items, { reason: "粘贴文件", statusText: `已粘贴 ${items.length} 个文件` });
      return;
    }

    const text = await clipboardBroker.readSystemClipboardText();
    if (text.trim()) {
      event.preventDefault();
      insertTextAt(anchor, text);
    }
  }

  async function pasteFromSystemClipboard(anchorPoint = getCenterScenePoint()) {
    if (await shouldUseInternalClipboard()) {
      return pasteInternalClipboard(anchorPoint);
    }
    const structuredHandled = await tryStructuredImportDescriptor(
      await structuredImportRuntime.contextMenuPasteAdapter.createDescriptor({
        origin: "engine-context-menu-paste",
        anchor: anchorPoint,
      }),
      anchorPoint,
      {
        reason: "粘贴内容",
        statusText: "已通过新导入链路粘贴内容",
        context: {
          origin: "engine-context-menu-paste",
        },
      }
    );
    if (structuredHandled) {
      return true;
    }
    const { items } = await pasteFileCardsFromClipboard({ clipboardBroker, dragBroker, anchor: anchorPoint });
    if (items.length) {
      return pushItems(items, { reason: "粘贴文件", statusText: `已粘贴 ${items.length} 个文件` });
    }
    const text = await clipboardBroker.readSystemClipboardText();
    if (text.trim()) {
      return insertTextAt(anchorPoint, text);
    }
    return false;
  }

  function onWindowKeyDown(event) {
    if (!isInteractiveMode()) {
      return;
    }
    const key = String(event.key || "").toLowerCase();
    const isSaveShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && key === "s";
    const target = event.target instanceof Element ? event.target : null;
    const withinCanvas =
      refs.surface?.contains(target) ||
      refs.surface?.contains(document.activeElement) ||
      document.activeElement === refs.canvas ||
      pointerOverCanvas;
    if (!withinCanvas) {
      return;
    }
    if (!isSaveShortcut && state.editingId && (target === refs.richEditor || target === refs.fileMemoEditor || refs.tableEditor?.contains(target))) {
      return;
    }
    if (!isSaveShortcut && isEditableElement(target)) {
      return;
    }
    if (key === "escape" && captureMode === "canvas") {
      event.preventDefault();
      captureMode = null;
      state.selectionRect = null;
      setStatus("已取消截图");
      scheduleRender();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "s") {
      event.preventDefault();
      void saveBoard();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "c") {
      event.preventDefault();
      if (!state.board.selectedIds.length && state.hoverId) {
        const hoverItem = state.board.items.find((item) => item.id === state.hoverId && item.type === "text");
        if (hoverItem) {
          state.board.selectedIds = [hoverItem.id];
        }
      }
      void copySelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "x") {
      event.preventDefault();
      void cutSelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "v") {
      if (document.activeElement === refs.canvas) {
        return;
      }
      event.preventDefault();
      const hoverItem = state.hoverId ? state.board.items.find((item) => item.id === state.hoverId) : null;
      const anchor = hoverItem ? { x: hoverItem.x + hoverItem.width + 24, y: hoverItem.y + 24 } : (state.lastPointerScenePoint || getCenterScenePoint());
      void pasteFromSystemClipboard(anchor);
      return;
    }
    if (key === "enter" && state.board.selectedIds.length === 1 && !state.editingId && state.tool === "select") {
      const selected = state.board.items.find((item) => item.id === state.board.selectedIds[0]);
      if (selected?.type === "text") {
        event.preventDefault();
        beginTextEdit(selected.id);
        return;
      }
      if (selected?.type === "flowNode") {
        event.preventDefault();
        beginFlowNodeEdit(selected.id);
        return;
      }
      if (selected?.type === "table") {
        event.preventDefault();
        beginTableEdit(selected.id, tableEditSelection);
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && key === "l") {
      event.preventDefault();
      toggleLockOnSelection();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (key === "f") {
      event.preventDefault();
      pendingImportAnchor = getCenterScenePoint();
      refs.fileImportInput?.click();
      return;
    }
    if (key === "i") {
      event.preventDefault();
      pendingImportAnchor = getCenterScenePoint();
      refs.imageImportInput?.click();
      return;
    }
    if (key === "n") {
      event.preventDefault();
      createFlowNode(getCenterScenePoint());
      return;
    }
    if (key === "p") {
      event.preventDefault();
      void startCanvasCapture();
      return;
    }
    if (key === "delete" || key === "backspace") {
      event.preventDefault();
      if (!state.board.selectedIds.length && state.hoverId) {
        const hoverItem = state.board.items.find((item) => item.id === state.hoverId);
        if (hoverItem?.type === "fileCard") {
          removeFileCardById(hoverItem.id);
          return;
        }
      }
      removeSelected();
      return;
    }
    if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      if (key === "arrowup") {
        nudgeSelection(0, -step);
      } else if (key === "arrowdown") {
        nudgeSelection(0, step);
      } else if (key === "arrowleft") {
        nudgeSelection(-step, 0);
      } else if (key === "arrowright") {
        nudgeSelection(step, 0);
      }
      return;
    }
    if (key === "escape") {
      event.preventDefault();
      hideContextMenu();
      clearTransientState();
      cancelTextEdit();
      cancelFlowNodeEdit();
      cancelFileMemoEdit();
      cancelImageMemoEdit();
      finishImageEdit();
      setTool("select");
      return;
    }
    if (TOOL_SHORTCUTS[key]) {
      event.preventDefault();
      setTool(TOOL_SHORTCUTS[key]);
    }
  }

  function onWindowKeyUp(event) {
  }

  function onModeChange(event) {
    setMode(event?.detail?.mode || getCanvasOfficeEngineMode());
  }

  function bind(target, type, handler, optionsValue) {
    target?.addEventListener?.(type, handler, optionsValue);
    cleanupFns.push(() => target?.removeEventListener?.(type, handler, optionsValue));
  }

  function bindEvents() {
    bind(refs.canvas, "pointerdown", onPointerDown);
    bind(refs.canvas, "pointermove", onPointerMove);
    bind(refs.canvas, "pointerup", onPointerUp);
    bind(refs.canvas, "pointercancel", onPointerCancel);
    bind(refs.canvas, "pointerenter", onPointerEnter);
    bind(refs.canvas, "pointerleave", onPointerLeave);
    bind(refs.canvas, "dblclick", onDoubleClick);
    bind(refs.canvas, "wheel", onWheel, { passive: false });
    bind(refs.canvas, "contextmenu", onContextMenu);
    bind(refs.canvas, "dragstart", onDragStart);
    bind(refs.canvas, "dragover", onDragOver);
    bind(refs.canvas, "dragleave", onDragLeave);
    bind(refs.canvas, "drop", onDrop);
    bind(refs.canvas, "copy", onCopy);
    bind(refs.canvas, "cut", onCut);
    bind(refs.canvas, "paste", onPaste);
    bind(refs.richEditor, "blur", onRichEditorBlur);
    bind(refs.richEditor, "input", onRichEditorInput);
    bind(refs.richEditor, "pointerdown", onRichEditorPointerDown, true);
    bind(refs.richEditor, "copy", onRichEditorCopy);
    bind(refs.richEditor, "cut", onRichEditorCut);
    bind(refs.richEditor, "dblclick", onRichEditorDoubleClick);
    bind(refs.richEditor, "paste", onRichEditorPaste);
    bind(refs.richEditor, "wheel", onRichEditorWheel, { passive: false });
    bind(refs.richEditor, "contextmenu", onRichEditorContextMenu);
    bind(refs.fileMemoEditor, "wheel", onRichEditorWheel, { passive: false });
    bind(refs.fileMemoEditor, "blur", onFileMemoBlur);
    bind(refs.fileMemoEditor, "input", onFileMemoInput);
    bind(refs.fileMemoEditor, "keydown", onFileMemoKeyDown);
    bind(refs.imageMemoEditor, "wheel", onRichEditorWheel, { passive: false });
    bind(refs.imageMemoEditor, "blur", onImageMemoBlur);
    bind(refs.imageMemoEditor, "input", onImageMemoInput);
    bind(refs.imageMemoEditor, "keydown", onImageMemoKeyDown);
    bind(refs.tableEditor, "pointerdown", onTableEditorPointerDown, true);
    bind(refs.tableEditor, "input", onTableEditorInput);
    bind(refs.tableEditor, "keydown", onTableEditorKeyDown);
    bind(refs.tableToolbar, "pointerdown", onTableToolbarPointerDown, true);
    bind(refs.tableToolbar, "click", onTableToolbarClick);
    bind(window, "keydown", onWindowKeyDown, true);
    bind(window, "keyup", onWindowKeyUp, true);
    bind(window, "resize", resize);
    bind(window, "canvas-office:mode-change", onModeChange);
    bind(window, "canvas-board-path-changed", onCanvasBoardPathChanged);
    bind(window, "canvas-image-path-changed", onCanvasImagePathChanged);
    bind(window, "pointerdown", onGlobalPointerDown, true);
    bind(window, "canvas2d-hint-logo-loaded", onHintLogoLoaded);
    bind(refs.contextMenu, "click", onContextMenuClick);
    bind(refs.contextMenu, "pointerover", onContextMenuPointerOver);
    bind(refs.contextMenu, "pointerleave", onContextMenuPointerLeave);
    bind(refs.contextMenu, "focusin", onContextMenuFocusIn);
    bind(refs.contextMenu, "focusout", onContextMenuFocusOut);
    bind(refs.richToolbar, "click", onRichToolbarClick);
    bind(refs.richToolbar, "pointerdown", onRichToolbarPointerDown, true);
    bind(refs.richToolbar, "input", onRichToolbarInput);
    bind(refs.richToolbar, "change", onRichToolbarInput);
    bind(refs.richSelectionToolbar, "click", onRichToolbarClick);
    bind(refs.richSelectionToolbar, "pointerdown", onRichToolbarPointerDown, true);
    bind(refs.richSelectionToolbar, "input", onRichToolbarInput);
    bind(refs.richSelectionToolbar, "change", onRichToolbarInput);
    bind(refs.richSelectionToolbar, "wheel", onRichSelectionToolbarWheel, { passive: false, capture: true });
    bind(refs.richSelectionToolbar, "keydown", onRichSelectionToolbarKeyDown);
    bind(refs.richSelectionToolbar, "focusout", onRichSelectionToolbarFocusOut);
    bind(refs.imageToolbar, "click", onImageToolbarClick);
    bind(refs.richDisplayHost, "pointermove", onRichDisplayPointerMove);
    bind(refs.richDisplayHost, "pointerleave", onRichDisplayPointerLeave);
    bind(refs.richDisplayHost, "pointerdown", onRichDisplayPointerDown, true);
    bind(refs.richDisplayHost, "pointerup", onRichDisplayPointerUp, true);
    bind(refs.richDisplayHost, "dblclick", onRichDisplayDoubleClick);
    bind(refs.richDisplayHost, "click", onRichDisplayClick);
  }

  function mount(hostElement) {
    if (mounted && refs.host === hostElement) {
      return api;
    }
    if (mounted) {
      unmount();
    }
    clearLegacyBoardStorage();
    ensureDom(hostElement);
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(refs.surface);
    cleanupFns.push(() => {
      resizeObserver?.disconnect();
      resizeObserver = null;
    });
    mounted = true;
    clearAlignmentSnap("mount");
    bindEvents();
    state.mode = normalizeMode(getCanvasOfficeEngineMode());
    markHistoryBaseline(state.history, takeHistorySnapshot(state));
    resize();
    store.emit();
    scheduleRender();
    void initBoardFileState();
    void resolveFileCardSources();
    window.dispatchEvent(new CustomEvent("canvas2d-engine-ready"));
    return api;
  }

  function unmount() {
    cleanupFns.splice(0).forEach((cleanup) => {
      try {
        cleanup();
      } catch {
        // Ignore teardown failures.
      }
    });
    richTextSession.destroy();
    cancelTextEdit();
    cancelFlowNodeEdit();
    cancelFileMemoEdit();
    cancelImageMemoEdit();
    finishImageEdit();
    clearAlignmentSnap("unmount");
    stopAutosaveTimer();
    mounted = false;
    refs.ctx = null;
    return api;
  }

  function undo() {
    const snapshot = undoHistory(state.history, takeHistorySnapshot(state));
    if (!snapshot) {
      return false;
    }
    applyHistorySnapshot(snapshot);
    setStatus("已撤销");
    return true;
  }

  function redo() {
    const snapshot = redoHistory(state.history, takeHistorySnapshot(state));
    if (!snapshot) {
      return false;
    }
    applyHistorySnapshot(snapshot);
    setStatus("已重做");
    return true;
  }

  function zoomIn() {
    state.board.view = zoomAtScenePoint(state.board.view, state.board.view.scale * 1.12, getCenterScenePoint());
    syncBoard({ persist: true, emit: true });
  }

  function zoomOut() {
    state.board.view = zoomAtScenePoint(state.board.view, state.board.view.scale / 1.12, getCenterScenePoint());
    syncBoard({ persist: true, emit: true });
  }

  function zoomToFit() {
    state.board.view = getZoomToFitView(state.board.items, getCanvasRect());
    syncBoard({ persist: true, emit: true });
    setStatus("已回到内容");
  }

  function resetView() {
    state.board.view = createView(DEFAULT_VIEW);
    syncBoard({ persist: true, emit: true });
    setStatus("已重置视图");
  }

  let focusAnimationFrame = null;

  function cancelFocusAnimation() {
    if (focusAnimationFrame) {
      cancelAnimationFrame(focusAnimationFrame);
      focusAnimationFrame = null;
    }
  }

  function animateViewTo(nextView, options = {}) {
    cancelFocusAnimation();
    const startView = createView(state.board.view);
    const targetView = createView(nextView);
    const duration = Math.max(120, Number(options?.duration ?? 240));
    const startAt = performance.now();

    const step = (now) => {
      const progress = Math.min(1, (now - startAt) / duration);
      const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const view = createView({
        scale: startView.scale + (targetView.scale - startView.scale) * ease,
        offsetX: startView.offsetX + (targetView.offsetX - startView.offsetX) * ease,
        offsetY: startView.offsetY + (targetView.offsetY - startView.offsetY) * ease,
      });
      state.board.view = view;
      syncBoard({ persist: false, emit: true });
      if (progress < 1) {
        focusAnimationFrame = requestAnimationFrame(step);
      } else {
        focusAnimationFrame = null;
        syncBoard({ persist: true, emit: true });
      }
    };

    focusAnimationFrame = requestAnimationFrame(step);
  }

  function focusOnBounds(bounds, options = {}) {
    if (!bounds) {
      return false;
    }
    const rect = getCanvasRect();
    if (!rect?.width || !rect?.height) {
      return false;
    }
    const currentScale = Number(state.board.view.scale ?? 1);
    const padding = Number(options?.padding ?? 96);
    const maxScale = Number(options?.maxScale ?? 1.4);
    const minScale = Number(options?.minScale ?? 0.2);
    const availableWidth = Math.max(120, rect.width - padding * 2);
    const availableHeight = Math.max(120, rect.height - padding * 2);
    const targetScale = Math.min(
      maxScale,
      availableWidth / Math.max(1, Number(bounds.width || 1)),
      availableHeight / Math.max(1, Number(bounds.height || 1))
    );
    const widthOnScreen = Number(bounds.width || 0) * currentScale;
    const heightOnScreen = Number(bounds.height || 0) * currentScale;
    const shouldAdjustScale =
      options?.mode === "fit" ||
      (widthOnScreen > rect.width * 0.7 || heightOnScreen > rect.height * 0.7) ||
      (widthOnScreen < rect.width * 0.18 && heightOnScreen < rect.height * 0.18);
    const scale = Number(
      options?.scale ??
        (shouldAdjustScale ? Math.max(minScale, Math.min(maxScale, targetScale)) : currentScale)
    );
    const centerX = Number(bounds.left || 0) + Number(bounds.width || 0) / 2;
    const centerY = Number(bounds.top || 0) + Number(bounds.height || 0) / 2;
    const offsetX = rect.width / 2 - centerX * scale;
    const offsetY = rect.height / 2 - centerY * scale;
    const nextView = createView({ scale, offsetX, offsetY });
    if (options?.animate) {
      animateViewTo(nextView, options);
    } else {
      state.board.view = nextView;
      syncBoard({ persist: true, emit: true });
    }
    return true;
  }

  function clearBoard() {
    if (!state.board.items.length) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    state.board = createEmptyBoard();
    pushHistory(state.history, before, takeHistorySnapshot(state), "清空白板");
    syncBoard({ persist: true, emit: true });
    setStatus("已清空白板");
    return true;
  }

  function toggleLockOnSelection() {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selectedIds = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    state.board.items = state.board.items.map((item) => {
      if (!selectedIds.has(item.id)) {
        return item;
      }
      return {
        ...item,
        locked: !item.locked,
      };
    });
    commitHistory(before, "切换锁定");
    setStatus("已切换锁定状态");
    return true;
  }

  function toggleFileCardMark() {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    const result = toggleFileCardMarkEntry(state.board.items, state.board.selectedIds);
    if (!result.changed) {
      return false;
    }
    state.board.items = result.items;
    commitHistory(before, "标记文件卡");
    setStatus("已标记文件卡");
    return true;
  }

  function nudgeSelection(dx, dy) {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selectedIds = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    state.board.items = state.board.items.map((item) => {
      if (!selectedIds.has(item.id)) {
        return item;
      }
      if (isLockedItem(item)) {
        return item;
      }
      return moveElement(item, dx, dy);
    });
    commitHistory(before, "微移元素");
    return true;
  }

  function alignSelection(direction = "left") {
    const selectedIds = state.board.selectedIds.slice();
    if (selectedIds.length < 2) {
      return false;
    }
    const selectedItems = state.board.items.filter((item) => selectedIds.includes(item.id));
    const boundsList = selectedItems.map((item) => ({ item, bounds: getElementBounds(item) }));
    if (!boundsList.length) {
      return false;
    }
    const groupBounds = boundsList.reduce(
      (acc, entry) => {
        acc.left = Math.min(acc.left, entry.bounds.left);
        acc.top = Math.min(acc.top, entry.bounds.top);
        acc.right = Math.max(acc.right, entry.bounds.right);
        acc.bottom = Math.max(acc.bottom, entry.bounds.bottom);
        return acc;
      },
      { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
    );
    groupBounds.width = Math.max(1, groupBounds.right - groupBounds.left);
    groupBounds.height = Math.max(1, groupBounds.bottom - groupBounds.top);

    const before = takeHistorySnapshot(state);
    state.board.items = state.board.items.map((item) => {
      const entry = boundsList.find((candidate) => candidate.item.id === item.id);
      if (!entry) {
        return item;
      }
      const bounds = entry.bounds;
      let dx = 0;
      let dy = 0;
      if (direction === "left") {
        dx = groupBounds.left - bounds.left;
      } else if (direction === "right") {
        dx = groupBounds.right - bounds.right;
      } else if (direction === "center") {
        dx = groupBounds.left + groupBounds.width / 2 - (bounds.left + bounds.width / 2);
      } else if (direction === "top") {
        dy = groupBounds.top - bounds.top;
      } else if (direction === "bottom") {
        dy = groupBounds.bottom - bounds.bottom;
      } else if (direction === "middle") {
        dy = groupBounds.top + groupBounds.height / 2 - (bounds.top + bounds.height / 2);
      }
      return moveElement(item, dx, dy);
    });
    commitHistory(before, "对齐元素");
    setStatus("已对齐选中元素");
    return true;
  }

  function distributeSelection(axis = "horizontal") {
    const selectedIds = state.board.selectedIds.slice();
    if (selectedIds.length < 3) {
      return false;
    }
    const selectedItems = state.board.items.filter((item) => selectedIds.includes(item.id));
    const boundsList = selectedItems
      .map((item) => ({ item, bounds: getElementBounds(item) }))
      .filter((entry) => !isLockedItem(entry.item));
    if (boundsList.length < 3) {
      return false;
    }
    const sorted = boundsList.slice().sort((a, b) => {
      return axis === "vertical" ? a.bounds.top - b.bounds.top : a.bounds.left - b.bounds.left;
    });
    const totalSize = sorted.reduce((acc, entry) => {
      return acc + (axis === "vertical" ? entry.bounds.height : entry.bounds.width);
    }, 0);
    const minPos = axis === "vertical" ? sorted[0].bounds.top : sorted[0].bounds.left;
    const maxPos = axis === "vertical" ? sorted[sorted.length - 1].bounds.bottom : sorted[sorted.length - 1].bounds.right;
    const space = (maxPos - minPos - totalSize) / (sorted.length - 1);
    if (!Number.isFinite(space)) {
      return false;
    }
    let cursor = minPos;
    const before = takeHistorySnapshot(state);
    state.board.items = state.board.items.map((item) => {
      const entry = sorted.find((candidate) => candidate.item.id === item.id);
      if (!entry) {
        return item;
      }
      const bounds = entry.bounds;
      let dx = 0;
      let dy = 0;
      if (axis === "vertical") {
        dy = cursor - bounds.top;
        cursor += bounds.height + space;
      } else {
        dx = cursor - bounds.left;
        cursor += bounds.width + space;
      }
      return moveElement(item, dx, dy);
    });
    commitHistory(before, "均匀分布");
    setStatus("已均匀分布选中元素");
    return true;
  }

  function groupSelection() {
    if (state.board.selectedIds.length < 2) {
      return false;
    }
    const groupId = createId("group");
    const selectedIds = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    state.board.items = state.board.items.map((item) => {
      if (!selectedIds.has(item.id)) {
        return item;
      }
      return { ...item, groupId };
    });
    commitHistory(before, "组合元素");
    setStatus("已组合选中元素");
    return true;
  }

  function ungroupSelection() {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selectedIds = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    let changed = false;
    state.board.items = state.board.items.map((item) => {
      if (!selectedIds.has(item.id) || !item.groupId) {
        return item;
      }
      changed = true;
      const next = { ...item };
      delete next.groupId;
      return next;
    });
    if (!changed) {
      return false;
    }
    commitHistory(before, "取消组合");
    setStatus("已取消组合");
    return true;
  }

  function moveSelectionToFront() {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selected = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    const front = [];
    const back = [];
    state.board.items.forEach((item) => {
      if (selected.has(item.id)) {
        front.push(item);
      } else {
        back.push(item);
      }
    });
    state.board.items = back.concat(front);
    commitHistory(before, "置顶元素");
    setStatus("已置顶选中元素");
    return true;
  }

  function moveSelectionToBack() {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selected = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    const front = [];
    const back = [];
    state.board.items.forEach((item) => {
      if (selected.has(item.id)) {
        back.push(item);
      } else {
        front.push(item);
      }
    });
    state.board.items = back.concat(front);
    commitHistory(before, "置底元素");
    setStatus("已置底选中元素");
    return true;
  }

  function moveSelectionByStep(direction = "up") {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selected = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    const items = state.board.items.slice();
    let changed = false;
    if (direction === "down") {
      for (let i = 1; i < items.length; i += 1) {
        if (selected.has(items[i].id) && !selected.has(items[i - 1].id)) {
          const temp = items[i - 1];
          items[i - 1] = items[i];
          items[i] = temp;
          changed = true;
        }
      }
    } else {
      for (let i = items.length - 2; i >= 0; i -= 1) {
        if (selected.has(items[i].id) && !selected.has(items[i + 1].id)) {
          const temp = items[i + 1];
          items[i + 1] = items[i];
          items[i] = temp;
          changed = true;
        }
      }
    }
    if (!changed) {
      return false;
    }
    state.board.items = items;
    commitHistory(before, direction === "down" ? "下移一层" : "上移一层");
    setStatus(direction === "down" ? "已下移一层" : "已上移一层");
    return true;
  }

  function reverseArrowSelection() {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selectedIds = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    let changed = false;
    state.board.items = state.board.items.map((item) => {
      if (item.type !== "shape" || item.shapeType !== "arrow" || !selectedIds.has(item.id)) {
        return item;
      }
      changed = true;
      const next = {
        ...item,
        startX: Number(item.endX || 0),
        startY: Number(item.endY || 0),
        endX: Number(item.startX || 0),
        endY: Number(item.startY || 0),
      };
      next.x = Math.min(next.startX, next.endX);
      next.y = Math.min(next.startY, next.endY);
      next.width = Math.max(1, Math.abs(next.endX - next.startX));
      next.height = Math.max(1, Math.abs(next.endY - next.startY));
      return next;
    });
    if (!changed) {
      return false;
    }
    commitHistory(before, "反向箭头");
    setStatus("已反向箭头");
    return true;
  }

  function toggleLineDash() {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selectedIds = new Set(state.board.selectedIds);
    const targets = state.board.items.filter(
      (item) => item.type === "shape" && item.shapeType === "line" && selectedIds.has(item.id)
    );
    if (!targets.length) {
      return false;
    }
    const nextDash = !targets.every((item) => Boolean(item.lineDash));
    const before = takeHistorySnapshot(state);
    state.board.items = state.board.items.map((item) => {
      if (item.type !== "shape" || item.shapeType !== "line" || !selectedIds.has(item.id)) {
        return item;
      }
      return {
        ...item,
        lineDash: nextDash,
      };
    });
    commitHistory(before, "切换虚线");
    setStatus(nextDash ? "已切换为虚线" : "已切换为实线");
    return true;
  }

  function applyLineColor(color) {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selectedIds = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    let changed = false;
    state.board.items = state.board.items.map((item) => {
      if (item.type !== "shape" || item.shapeType !== "line" || !selectedIds.has(item.id)) {
        return item;
      }
      if (item.strokeColor === color) {
        return item;
      }
      changed = true;
      return {
        ...item,
        strokeColor: color,
      };
    });
    if (!changed) {
      return false;
    }
    commitHistory(before, "设置线条颜色");
    setStatus("已更新线条颜色");
    return true;
  }

  function applyShapeStrokeColor(color) {
    const nextColor = String(color || "").trim();
    if (!nextColor || !state.board.selectedIds.length) {
      return false;
    }
    const allowed = new Set(["rect", "ellipse", "line", "arrow"]);
    const selectedIds = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    let changed = false;
    state.board.items = state.board.items.map((item) => {
      if (item.type !== "shape" || !allowed.has(item.shapeType) || !selectedIds.has(item.id)) {
        return item;
      }
      if (item.strokeColor === nextColor) {
        return item;
      }
      changed = true;
      return {
        ...item,
        strokeColor: nextColor,
      };
    });
    if (!changed) {
      return false;
    }
    commitHistory(before, "设置边框颜色");
    setStatus("已更新边框颜色");
    return true;
  }

  function toggleShapeFill() {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const allowed = new Set(["rect", "ellipse"]);
    const selectedIds = new Set(state.board.selectedIds);
    const before = takeHistorySnapshot(state);
    let changed = false;
    state.board.items = state.board.items.map((item) => {
      if (item.type !== "shape" || !allowed.has(item.shapeType) || !selectedIds.has(item.id)) {
        return item;
      }
      const isTransparent = String(item.fillColor || "").trim().toLowerCase() === "transparent";
      changed = true;
      return {
        ...item,
        fillColor: isTransparent ? "#ffffff" : "transparent",
      };
    });
    if (!changed) {
      return false;
    }
    commitHistory(before, "切换填充");
    setStatus("已切换填充");
    return true;
  }

  function exportSelectedItems() {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selected = state.board.items.filter((item) => state.board.selectedIds.includes(item.id));
    if (!selected.length) {
      return false;
    }
    void exportItemsAsImage(selected, { forceWhiteBackground: true, defaultName: "freeflow-selection" });
    return true;
  }

  function registerElementRenderer(handler) {
    if (typeof handler !== "function") {
      return () => {};
    }
    elementRenderers.push(handler);
    return () => {
      const index = elementRenderers.indexOf(handler);
      if (index >= 0) {
        elementRenderers.splice(index, 1);
      }
    };
  }

  function registerPasteHandler(handler) {
    if (typeof handler !== "function") {
      return () => {};
    }
    pasteHandlers.push(handler);
    return () => {
      const index = pasteHandlers.indexOf(handler);
      if (index >= 0) {
        pasteHandlers.splice(index, 1);
      }
    };
  }

  function registerDragHandler(handler) {
    if (typeof handler !== "function") {
      return () => {};
    }
    dragHandlers.push(handler);
    return () => {
      const index = dragHandlers.indexOf(handler);
      if (index >= 0) {
        dragHandlers.splice(index, 1);
      }
    };
  }

  function registerCommand(name, handler) {
    const key = String(name || "").trim();
    if (!key || typeof handler !== "function") {
      return () => {};
    }
    commandHandlers.set(key, handler);
    return () => {
      commandHandlers.delete(key);
    };
  }

  function runCommand(name, ...args) {
    const key = String(name || "").trim();
    const handler = commandHandlers.get(key);
    if (typeof handler === "function") {
      return handler(...args);
    }
    return null;
  }

  const api = {
    mount,
    unmount,
    destroy: unmount,
    resize,
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
    setTool,
    setMode,
    setStatus,
    setLocalFileAccess,
    toggleLocalFileAccess,
    undo,
    redo,
    zoomIn,
    zoomOut,
    resetView,
    zoomToFit,
    focusOnBounds,
    startCanvasCapture,
    renderBoardToCanvas,
    exportBoardAsPdf,
    exportBoardAsPng,
    addFlowNode() {
      return createFlowNode(getCenterScenePoint());
    },
    newBoard,
    openBoard,
    openBoardAtPath,
    ensureTutorialBoard,
    saveBoard,
    saveBoardAs,
    renameBoard,
    revealBoardInFolder,
    pickCanvasBoardSavePath,
    revealCanvasImageSavePath,
    pickCanvasImageSavePath,
    setBoardBackgroundPattern,
    toggleAutosave() {
      setAutosaveEnabled(!state.boardAutosaveEnabled);
    },
    setAlignmentSnapConfig,
    setAlignmentSnapEnabled,
    clearAlignmentSnap,
    getAlignmentSnapCandidates,
    setAutosaveEnabled,
    importFiles,
    clearBoard,
    alignSelection,
    registerElementRenderer,
    registerPasteHandler,
    registerDragHandler,
    registerCommand,
    runCommand,
    getSnapshotData() {
      return clone(state.board);
    },
    searchStructuredItems(query, limit = 10) {
      return structuredImportRuntime.buildSearchResults(state.board.items, query, limit);
    },
    buildStructuredExportSnapshot(options = {}) {
      return structuredImportRuntime.buildExportSnapshot(state.board, options);
    },
    serializeStructuredBoard() {
      return structuredImportRuntime.serializeBoard(state.board, {
        meta: {
          boardFilePath: state.boardFilePath,
        },
      });
    },
    getStructuredImportLogs() {
      return structuredImportRuntime.getLogs();
    },
    clearStructuredImportLogs() {
      structuredImportRuntime.clearLogs();
    },
    getStructuredImportSwitchConfig() {
      return structuredImportRuntime.switchboard.getConfig();
    },
    setStructuredImportSwitchConfig(config = {}) {
      return structuredImportRuntime.switchboard.setConfig(config);
    },
    updateStructuredImportSwitchConfig(patch = {}) {
      return structuredImportRuntime.switchboard.updateConfig(patch);
    },
    getStructuredImportKillSwitchConfig() {
      return structuredImportRuntime.killSwitch.getConfig();
    },
    setStructuredImportKillSwitchConfig(config = {}) {
      return structuredImportRuntime.killSwitch.setConfig(config);
    },
    updateStructuredImportKillSwitchConfig(patch = {}) {
      return structuredImportRuntime.killSwitch.updateConfig(patch);
    },
    buildStructuredFlowbackPayload(items = null) {
      const targets = Array.isArray(items)
        ? items
        : state.board.items.filter((item) => state.board.selectedIds.includes(item.id));
      return structuredImportRuntime.buildFlowbackPayload(targets);
    },
  };

  registerDragHandler(drawToolModule.handleDrop);

  return api;
}
