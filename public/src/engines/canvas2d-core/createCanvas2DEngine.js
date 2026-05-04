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
  getSnapAnchors,
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
import {
  createMindNodeElement,
  createMindSummaryElement,
} from "./elements/mind.js";
import {
  applyMindMapAutoLayout,
  collectMindMapVisibleConnections,
  isMindMapItemVisible,
  isMindMapNode,
  isMindSummaryItem,
  MIND_BRANCH_AUTO,
  MIND_BRANCH_LEFT,
  MIND_BRANCH_RIGHT,
  normalizeMindBranchSide,
  syncMindNodeTextMetrics,
} from "./elements/mindMap.js";
import {
  createMindRelationshipElement,
  getMindRelationshipGeometry,
  isMindRelationshipItem,
} from "./elements/mindRelationship.js";
import {
  createEditableTableElement,
  createTableStructureFromMatrix,
  flattenTableStructureToMatrix,
  TABLE_MIN_HEIGHT,
  TABLE_MIN_WIDTH,
  updateTableElementStructure,
} from "./elements/table.js";
import {
  serializeTableMatrixToMarkdown,
  serializeTableMatrixToPlainText,
  serializeTableMatrixToTsv,
} from "./elements/tableFormats.js";
import {
  CODE_BLOCK_MIN_HEIGHT,
  CODE_BLOCK_MIN_WIDTH,
  createCodeBlockElement,
  isMermaidCodeBlock,
  normalizeCodeBlockElement,
  updateCodeBlockElement,
} from "./elements/codeBlock.js";
import { MATH_MIN_HEIGHT, MATH_MIN_WIDTH } from "./elements/math.js";
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
import { buildTextElementFromMathElement } from "./elements/mathText.js";
import { measureTextElementLayout } from "./textLayout/measureTextElementLayout.js";
import { createLightImageEditor } from "./editors/lightImageEditor.js";
import { createCodeBlockEditor } from "./editors/codeBlockEditor.js";
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
import { measureCodeBlockLayout } from "./codeBlock/measureCodeBlockLayout.js";
import { cleanupCodeBlockStaticNode, renderCodeBlockStatic } from "./codeBlock/renderCodeBlockStatic.js";
import {
  CODE_BLOCK_LANGUAGE_OPTIONS,
  getCodeBlockLanguageDisplayLabel,
  getCodeBlockLanguageFileExtension,
  isWeakCodeLanguageTag as isWeakCodeLanguageTagFromRegistry,
  normalizeCodeBlockLanguageTag,
} from "./codeBlock/languageRegistry.js";
import {
  createHistoryState,
  markHistoryBaseline,
  pushHistory,
  pushPatchHistory,
  redoHistory,
  takeHistoryMetadataSnapshot,
  takeHistorySnapshot,
  undoHistory,
} from "./history.js";
import { hitTestElement, hitTestHandle, invalidateHitTestSpatialIndex } from "./hitTest.js";
import {
  getElementScreenBounds,
  getStructuredTableSceneGrid,
  normalizeMathRenderState,
  scaleSceneValue,
} from "./viewportMetrics.js";
import {
  getSceneRecord,
  invalidateSceneIndex,
  querySceneIndex,
  queryVisibleSceneItems,
  resolveSceneIndex,
} from "./scene/sceneIndex.js";
import { createSceneRegistry } from "./scene/sceneRegistry.js";
import { createOverlayVirtualizer } from "./overlay/overlayVirtualizer.js";
import { createStaticDisplayEventBridge } from "./overlay/staticDisplayEventBridge.js";
import { createSceneEventBridge } from "./overlay/sceneEventBridge.js";
import {
  computeMultiSelectionResizedBounds,
  getHandleCursorKey,
  getMultiSelectionBounds,
  hitTestMultiSelectionHandle,
  isScenePointInsideBounds as isPointInsideMultiSelectionBounds,
} from "./multiSelectionTransform.js";
import { createRenderScheduler } from "./render/renderScheduler.js";
import { buildUnifiedPreviewSummaryMarkup } from "./previewSummaryMarkup.js";
import {
  buildFileCardContextMenuHtml,
  getFileCardHit,
  pasteFileCardsFromClipboard,
  removeFileCardById as removeFileCardEntry,
  toggleFileCardMark as toggleFileCardMarkEntry,
} from "./fileCardModule.js";
import { createRenderer } from "./renderer.js";
import { placeMenuNearPoint, placeSubmenuNearTrigger } from "./menuPositioning.js";
import {
  buildCodeBlockContextMenuHtml,
  buildLockDeleteTailHtml,
  buildMathContextMenuHtml,
  buildRichEditorContextMenuHtml,
  buildRichTextItemContextMenuHtml,
  buildTableContextMenuHtml,
} from "./contextMenu/menuSchemaBuilders.js";
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
  downgradeExternalHtmlToCanvasTextSemantics,
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
import { createCanvasWorkspaceManager } from "./workspace/createCanvasWorkspaceManager.js";
import { createCanvasExportHistoryManager } from "./export/createCanvasExportHistoryManager.js";
import { createCanvasImageStorageManager } from "./storage/createCanvasImageStorageManager.js";
import {
  getExportBounds as getCanvasExportBounds,
  renderBoardToCanvas as renderExportBoardToCanvas,
} from "./export/renderBoardToCanvas.js";
import { buildExportReadyBoardItems } from "./export/buildExportReadyBoardItems.js";
import { createHostExportAssetAdapter } from "./export/host/hostExportAssetAdapter.js";
import { createHostExportFileAdapter } from "./export/host/hostExportFileAdapter.js";
import {
  getCopyOperationMeta,
  getExportOperationMeta,
  resolveCopyExportAction,
} from "./export/copyExportProtocol.js";
import { buildSelectionWordExportPlan } from "./export/word/buildWordExportAst.js";
import { buildWordExportPreviewModel } from "./export/word/buildWordExportPreviewModel.js";
import { createStructuredExportRuntime } from "./export/runtime/createStructuredExportRuntime.js";
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
  createRichTextDocument,
  RICH_TEXT_BLOCK_TYPES,
  serializeRichTextBlocksToHtml,
  serializeRichTextDocumentToHtml,
  serializeRichTextDocumentToPlainText,
} from "./textModel/richTextDocument.js";
import { normalizeTextContentModel } from "./textModel/textContentModel.js";
import { serializeRichTextDocumentToMarkdown } from "./textModel/serializeRichTextDocumentToMarkdown.js";
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
import {
  DEFAULT_BOARD_FILE_NAME,
  deriveFreeFlowBoardPathFromLegacyPath,
  ensureFreeFlowBoardFileName,
  isLegacyJsonBoardFileName,
  isSupportedBoardFileName,
  parseBoardFileText,
  wrapFreeFlowBoardPayload,
} from "./boardFileFormat.js";

const TOOL_SET = new Set(["select", "text", ...DRAW_TOOLS]);
const DEFAULT_TEXT_FONT_SIZE = 20;
const DEFAULT_MIND_NODE_FONT_SIZE = 18;
const TEXT_EDIT_MAX_WIDTH = 3200;
const IMPORTED_PASTE_FRAME_WIDTH = 760;
const TEXT_BLOCK_SPLIT_GAP = 12;
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
const RICH_TOOLBAR_DEFAULT_COLOR_SLOTS = Object.freeze(["#0f172a", "#dc2626", "#2563eb"]);
const RICH_TOOLBAR_DEFAULT_PRESET_COLORS = Object.freeze([
  "#0f172a",
  "#334155",
  "#dc2626",
  "#f97316",
  "#ca8a04",
  "#16a34a",
  "#0ea5e9",
  "#2563eb",
  "#7c3aed",
  "#db2777",
]);
const RICH_TOOLBAR_PRESET_COLOR_LIMIT = 16;
const RICH_TOOLBAR_COLOR_LABELS = Object.freeze({
  "#0f172a": "黑色",
  "#dc2626": "红色",
  "#2563eb": "蓝色",
});
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

  function getBoardParseErrorMessage(error) {
    const rawMessage = String(error?.message || "").trim();
    if (!rawMessage) {
      return "画布文件解析失败";
    }
    if (/unterminated string/i.test(rawMessage) || /unexpected end/i.test(rawMessage)) {
      return "画布文件已损坏或保存被中断（JSON 内容被截断）";
    }
    if (/position\s+\d+/i.test(rawMessage)) {
      return `画布文件解析失败：${rawMessage}`;
    }
    return `画布文件解析失败：${rawMessage}`;
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
      <button
        type="button"
        class="canvas2d-rich-btn canvas2d-rich-submenu-toggle"
        data-action="toggle-blockquote-menu"
        aria-label="引用菜单"
        aria-expanded="false"
        title="引用"
      >❝</button>
      <div class="canvas2d-rich-submenu-panel is-hidden" role="menu" aria-label="引用菜单">
        <button type="button" class="canvas2d-rich-btn canvas2d-rich-submenu-item" data-action="blockquote" title="引用">引用</button>
        <button type="button" class="canvas2d-rich-btn canvas2d-rich-submenu-item" data-action="blockquote-indent" title="引用层级加一">层级 +</button>
        <button type="button" class="canvas2d-rich-btn canvas2d-rich-submenu-item" data-action="blockquote-outdent" title="引用层级减一">层级 -</button>
      </div>
    </div>
  `;
}

function buildRichSubmenuActionButton(action, title, icon, label) {
  return `
    <button
      type="button"
      class="canvas2d-rich-btn canvas2d-rich-submenu-item canvas2d-rich-submenu-item-wide"
      data-action="${action}"
      aria-label="${title}"
      title="${title}"
      style="display:flex;align-items:center;justify-content:flex-start;gap:8px;min-width:132px;padding:0 10px;"
    ><span class="canvas2d-rich-submenu-item-icon" style="display:inline-flex;align-items:center;justify-content:center;min-width:16px;">${icon}</span><span class="canvas2d-rich-submenu-item-label" style="white-space:nowrap;">${label}</span></button>
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
      <div class="canvas2d-rich-submenu-panel is-hidden" role="menu" aria-label="公式菜单" style="min-width:148px;display:flex;flex-direction:column;gap:6px;">
        ${buildRichSubmenuActionButton("insert-math-inline", "行内公式", "fx", "行内公式")}
        ${buildRichSubmenuActionButton("insert-math-block", "独立公式", "∑", "独立公式")}
      </div>
    </div>
  `;
}

function buildRichLinkMenuHtml() {
  return `
    <div class="canvas2d-rich-submenu" data-submenu="link">
      <button
        type="button"
        class="canvas2d-rich-btn canvas2d-rich-submenu-toggle"
        data-action="toggle-link-menu"
        aria-label="链接菜单"
        aria-expanded="false"
        title="链接"
      >🔗</button>
      <div class="canvas2d-rich-submenu-panel is-hidden" role="menu" aria-label="链接菜单" style="min-width:148px;display:flex;flex-direction:column;gap:6px;">
        ${buildRichSubmenuActionButton("link", "外部链接", "↗", "外部链接")}
        ${buildRichSubmenuActionButton("link-canvas", "画布链接", "◎", "画布链接")}
        ${buildRichSubmenuActionButton("link-remove", "删除链接", "✕", "删除链接")}
      </div>
    </div>
  `;
}

function buildRichColorControlsHtml() {
  const slotsHtml = RICH_TOOLBAR_DEFAULT_COLOR_SLOTS.map(
    (color, index) =>
      `<button type="button" class="canvas2d-rich-btn color-swatch" data-action="color" data-role="rich-color-slot" data-slot-index="${index}" data-color="${color}" title="${
        RICH_TOOLBAR_COLOR_LABELS[String(color || "").toLowerCase()] || "文本颜色"
      }"></button>`
  ).join("");
  return `
    ${slotsHtml}
    <div class="canvas2d-rich-color-control" data-role="rich-color-control">
      <button
        type="button"
        class="canvas2d-rich-btn canvas2d-rich-color-toggle"
        data-action="toggle-color-panel"
        aria-label="自定义颜色"
        aria-expanded="false"
        title="自定义颜色"
      >+</button>
      <div class="canvas2d-rich-color-panel is-hidden" data-role="rich-color-panel" aria-label="颜色面板">
        <div class="canvas2d-rich-color-panel-head" data-role="rich-color-panel-head">
          <label class="canvas2d-rich-color-picker-wrap" data-role="rich-color-picker-wrap">
            <input type="color" class="canvas2d-rich-color-picker" data-action="color-picker" value="${RICH_TOOLBAR_DEFAULT_COLOR_SLOTS[2]}"/>
          </label>
          <button type="button" class="canvas2d-rich-btn canvas2d-rich-color-reset" data-action="color-reset-default">恢复默认</button>
        </div>
        <div class="canvas2d-rich-color-presets" data-role="rich-color-presets">
          <div class="canvas2d-rich-color-presets-grid" data-role="rich-color-presets-grid"></div>
        </div>
        <div class="canvas2d-rich-color-panel-foot" data-role="rich-color-panel-foot">
          <button type="button" class="canvas2d-rich-btn canvas2d-rich-color-add" data-action="color-add-preset" title="保存到常用预设">+</button>
        </div>
      </div>
    </div>
  `;
}

function buildCodeBlockLanguageSelectHtml() {
  return CODE_BLOCK_LANGUAGE_OPTIONS.map(
    (option) => `<option value="${option.value}">${option.label}</option>`
  ).join("");
}

function buildPersistentRichToolbarHtml() {
  return `
    <div class="canvas2d-rich-toolbar-row canvas2d-rich-toolbar-row-single">
      ${buildRichBlockTypeSelectHtml("block-type", "Markdown 语义块")}
      <button type="button" class="canvas2d-rich-btn" data-action="bold">B</button>
      <button type="button" class="canvas2d-rich-btn is-align-icon is-align-left" data-action="align-left" title="左对齐" aria-label="左对齐"></button>
      <button type="button" class="canvas2d-rich-btn is-align-icon is-align-center" data-action="align-center" title="居中对齐" aria-label="居中对齐"></button>
      <button type="button" class="canvas2d-rich-btn is-align-icon is-align-right" data-action="align-right" title="右对齐" aria-label="右对齐"></button>
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
      <button type="button" class="canvas2d-rich-btn canvas2d-rich-btn-icon" data-action="text-split" title="拆分文本" aria-label="拆分文本">
        <svg viewBox="0 0 24 24" aria-hidden="true" class="canvas2d-rich-btn-svg">
          <path d="M3.5 8.25h6.75M3.5 15.75h6.75M13.75 8.25h6.75M13.75 15.75h6.75" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M10.75 8.75l2.5 2.5m0-2.5-2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M10.75 13.75l2.5 2.5m0-2.5-2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
      ${buildRichLinkMenuHtml()}
      ${buildRichColorControlsHtml()}
    </div>
  `;
}

function buildSelectionRichToolbarHtml(variant = "rich-text") {
  const normalizedVariant = String(variant || "").trim().toLowerCase() === "mind-node" ? "mind-node" : "rich-text";
  if (normalizedVariant === "mind-node") {
    return `
      <div class="canvas2d-rich-toolbar-row canvas2d-rich-toolbar-row-top" data-row-variant="mind-node">
        <button type="button" class="canvas2d-rich-btn" data-action="bold" title="加粗">B</button>
        <button type="button" class="canvas2d-rich-btn is-align-icon is-align-left" data-action="align-left" title="左对齐" aria-label="左对齐"></button>
        <button type="button" class="canvas2d-rich-btn is-align-icon is-align-center" data-action="align-center" title="居中对齐" aria-label="居中对齐"></button>
        <button type="button" class="canvas2d-rich-btn is-align-icon is-align-right" data-action="align-right" title="右对齐" aria-label="右对齐"></button>
        <button type="button" class="canvas2d-rich-btn" data-action="unordered-list" title="无序列表">•</button>
      </div>
      <div class="canvas2d-rich-toolbar-row canvas2d-rich-toolbar-row-bottom" data-row-variant="mind-node">
        <button type="button" class="canvas2d-rich-btn" data-action="ordered-list" title="有序列表">1.</button>
        <button type="button" class="canvas2d-rich-btn" data-action="task-list" title="任务列表">☐</button>
        ${buildRichColorControlsHtml()}
      </div>
    `;
  }
  return `
    <div class="canvas2d-rich-toolbar-row canvas2d-rich-toolbar-row-top" data-row-variant="rich-text">
      ${buildRichBlockTypeSelectHtml("block-type", "块级语义")}
      <button type="button" class="canvas2d-rich-btn" data-action="bold" title="加粗">B</button>
      <button type="button" class="canvas2d-rich-btn is-align-icon is-align-left" data-action="align-left" title="左对齐" aria-label="左对齐"></button>
      <button type="button" class="canvas2d-rich-btn is-align-icon is-align-center" data-action="align-center" title="居中对齐" aria-label="居中对齐"></button>
      <button type="button" class="canvas2d-rich-btn is-align-icon is-align-right" data-action="align-right" title="右对齐" aria-label="右对齐"></button>
      <button type="button" class="canvas2d-rich-btn" data-action="italic" title="斜体"><em>I</em></button>
      <button type="button" class="canvas2d-rich-btn" data-action="strike" title="删除线"><s>S</s></button>
    </div>
    <div class="canvas2d-rich-toolbar-row canvas2d-rich-toolbar-row-bottom" data-row-variant="rich-text">
      <button type="button" class="canvas2d-rich-btn" data-action="unordered-list" title="无序列表">•</button>
      <button type="button" class="canvas2d-rich-btn" data-action="ordered-list" title="有序列表">1.</button>
      <button type="button" class="canvas2d-rich-btn" data-action="task-list" title="任务列表">☐</button>
      <button type="button" class="canvas2d-rich-btn" data-action="highlight" title="高亮">HL</button>
      <button type="button" class="canvas2d-rich-btn" data-action="underline" title="下划线"><u>U</u></button>
      ${buildRichMathMenuHtml()}
      ${buildRichQuoteMenuHtml()}
      <button type="button" class="canvas2d-rich-btn" data-action="inline-code" title="行内代码">&lt;/&gt;</button>
      ${buildRichColorControlsHtml()}
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

function getMathWorkerUrl() {
  if (typeof document !== "undefined" && document.baseURI) {
    return new URL("./vendor/katex/katex-render-worker.js", document.baseURI).toString();
  }
  if (typeof location !== "undefined" && location.href) {
    return new URL("./vendor/katex/katex-render-worker.js", location.href).toString();
  }
  return "";
}

function canScheduleMathMarkupUpgrade(formula = "") {
  return Boolean(String(formula || "").trim());
}

function getCodeBlockContent(item) {
  return sanitizeText(String(item?.code ?? item?.text ?? item?.plainText ?? ""));
}

function serializeCodeBlockToMarkdown(item) {
  const code = getCodeBlockContent(item);
  const language = normalizeCodeBlockLanguageTag(item?.language || "");
  const fence = language || "";
  return `\`\`\`${fence}\n${code}\n\`\`\``;
}

function getCodeBlockItemTitle(item) {
  const language = normalizeCodeBlockLanguageTag(item?.language || "");
  return buildTextTitle(language ? `${getCodeBlockLanguageDisplayLabel(language)} 代码块` : "代码块");
}

function describeCodeBlockToolbarState(item, { dirty = false } = {}) {
  const language = normalizeCodeBlockLanguageTag(item?.language || "");
  const parts = [getCodeBlockLanguageDisplayLabel(language)];
  if (isMermaidCodeBlock(item)) {
    parts.push(item?.previewMode === "source" ? "源码" : "预览");
  }
  parts.push(item?.wrap === true ? "换行" : "单行");
  parts.push(item?.showLineNumbers === false ? "无行号" : "行号");
  if (dirty) {
    parts.push("未保存");
  }
  return parts.join(" · ");
}

function getCodeBlockPreviewControlState(item) {
  const mermaid = isMermaidCodeBlock(item);
  const previewing = mermaid && item?.previewMode !== "source";
  return {
    enabled: mermaid,
    active: previewing,
    label: mermaid ? (previewing ? "源码" : "预览") : "预览",
    title: mermaid ? (previewing ? "切换到源码" : "切换到预览") : "仅 Mermaid 支持预览",
  };
}

function convertPlainClipboardTextToSemanticHtml(text = "", baseFontSize = DEFAULT_TEXT_FONT_SIZE) {
  const source = sanitizeText(text || "").trim();
  if (!source) {
    return "";
  }
  const cached = readClipboardSemanticHtmlCache(source, baseFontSize);
  if (cached !== null) {
    return cached;
  }
  let result = "";
  const detected = detectTextContentType(source);
  if (MARKDOWN_SEMANTIC_TEXT_TYPES.has(detected?.type) || hasMarkdownMathSyntax(source)) {
    result = sanitizeHtml(normalizeRichHtmlInlineFontSizes(renderMarkdownPlainTextToRichHtml(source), baseFontSize)).trim();
    writeClipboardSemanticHtmlCache(source, baseFontSize, result);
    return result;
  }
  if (detected?.type === DETECTED_TEXT_TYPES.CODE && shouldFenceAsCodeMarkdown(detected)) {
    const markdownCodeBlock = `\`\`\`\n${source.replace(/\r\n/g, "\n").replace(/\r/g, "\n")}\n\`\`\``;
    result = sanitizeHtml(
      normalizeRichHtmlInlineFontSizes(renderMarkdownPlainTextToRichHtml(markdownCodeBlock), baseFontSize)
    ).trim();
    writeClipboardSemanticHtmlCache(source, baseFontSize, result);
    return result;
  }
  writeClipboardSemanticHtmlCache(source, baseFontSize, "");
  return "";
}

function hasMarkdownMathSyntax(text = "") {
  const source = sanitizeText(String(text || ""));
  if (!source) {
    return false;
  }
  return (
    /\$[^$\n]+?\$/.test(source) ||
    /\\\([^()\n]+?\\\)/.test(source) ||
    /^\s*\$\$\s*$/m.test(source) ||
    /^\s*\\\[\s*$/m.test(source) ||
    /^\s*\$\$[\s\S]+?\$\$\s*$/m.test(source) ||
    /^\s*\\\[[\s\S]+?\\\]\s*$/m.test(source)
  );
}

function htmlContainsRenderableMath(html = "") {
  const source = String(html || "");
  if (!source) {
    return false;
  }
  return (
    /\bkatex(?:-display)?\b/i.test(source) ||
    /data-role=(?:"|')math-(?:inline|block)(?:"|')/i.test(source) ||
    /data-ff-rich-math=(?:"|')(?:inline|block)(?:"|')/i.test(source)
  );
}

async function convertPlainClipboardTextToSemanticHtmlAsync(text = "", baseFontSize = DEFAULT_TEXT_FONT_SIZE) {
  const source = sanitizeText(text || "").trim();
  if (!source) {
    return "";
  }
  return convertPlainClipboardTextToSemanticHtml(source, baseFontSize);
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
  return isWeakCodeLanguageTagFromRegistry(language);
}

function convertMisclassifiedCodeBlockToText(item, fontSizeFallback = DEFAULT_TEXT_FONT_SIZE) {
  return item;
}

function repairMisclassifiedCodeBlocksOnBoard(board, fontSizeFallback = DEFAULT_TEXT_FONT_SIZE) {
  return board;
}

const AUTOSAVE_INTERVAL_MS = 30000;
const AUTOSAVE_ENABLED_KEY = "ai_worker_canvas2d_autosave_v1";
const DEFAULT_NEW_BOARD_BASE = "FreeFlowBoard";
const RENDER_TEXT_IN_CANVAS = false;
const CANVAS_CLIPBOARD_MIME = "application/x-freeflow-canvas2d";
const CANVAS_CLIPBOARD_MARKER_TYPE = "canvas2d";
const CLIPBOARD_SOURCE_CANVAS = "canvas";
const CLIPBOARD_SOURCE_RICH_EDITOR = "rich-editor";
const CLIPBOARD_KIND_ITEMS = "items";
const CLIPBOARD_KIND_RICH_TEXT = "rich-text";
const CLIPBOARD_SEMANTIC_CACHE_MAX_SIZE = 24;
const CLIPBOARD_SEMANTIC_HEAVY_TEXT_THRESHOLD = 20000;
const CLIPBOARD_SEMANTIC_VERY_HEAVY_TEXT_THRESHOLD = 80000;
const CLIPBOARD_SEMANTIC_DEGRADE_THRESHOLD = 12000;
const RICH_OVERLAY_CULL_PADDING_PX = 160;
const RICH_OVERLAY_SCALE_BUCKET_STEP = 0.02;
const RICH_OVERLAY_DETAIL_CACHE_LIMIT = 180;
const RICH_OVERLAY_DETAIL_MIN_SCALE = 0.15;
const RICH_OVERLAY_PREVIEW_MIN_SCALE = 0.15;
const MATH_OVERLAY_DETAIL_MIN_SCALE = 0.15;
const MATH_OVERLAY_PREVIEW_MIN_SCALE = 0.15;
const CODE_BLOCK_OVERLAY_SYNTAX_MIN_SCALE = 0.15;
const CODE_BLOCK_OVERLAY_LINE_NUMBERS_MIN_SCALE = 0.15;
const CODE_BLOCK_OVERLAY_HEADER_MIN_SCALE = 0.15;
const CODE_BLOCK_OVERLAY_SUMMARY_MIN_SCALE = 0.15;
const MATH_MARKUP_CACHE_LIMIT = 160;
const OVERLAY_IDLE_TASK_TIMEOUT_MS = 96;
const OVERLAY_IDLE_MIN_TIME_REMAINING_MS = 4;
const OVERLAY_IDLE_FLUSH_BUDGET_MS = 10;
const RICH_OVERLAY_IDLE_BATCH_LIMIT = 4;
const MATH_OVERLAY_IDLE_BATCH_LIMIT = 3;
const HISTORY_AUTO_PATCH_ITEM_LIMIT = 64;
const HISTORY_AUTO_PATCH_ORDER_LIMIT = 256;
const PASTE_BATCH_YIELD_ITEM_THRESHOLD = 24;
const PASTE_BATCH_YIELD_CHUNK_SIZE = 24;
const PASTE_NON_BLOCKING_TEXT_THRESHOLD = 8000;
const PASTE_NON_BLOCKING_HTML_THRESHOLD = 16000;
const INTERNAL_DRAG_MARKER_ATTR = "data-freeflow-canvas2d-marker";
const LINK_SEMANTIC_ENABLED_KEY = "ai_worker_canvas2d_link_semantic_enabled_v1";
const EXPORT_HISTORY_STORAGE_KEY = "ai_worker_canvas2d_export_history_v1";
const EXPORT_HISTORY_LIMIT = 10;
const CANVAS_INTERNAL_LINK_SCHEME = "freeflow://canvas/item/";
const CANVAS_INTERNAL_LINK_TYPE = "canvas-item";
const EXTERNAL_LINK_TYPE = "external";
const TABLE_EDITOR_MIN_SCREEN_WIDTH = 320;
const TABLE_EDITOR_MIN_SCREEN_HEIGHT = 168;
const TABLE_EDITOR_MAX_SCREEN_WIDTH = 1120;
const TABLE_EDITOR_MAX_SCREEN_HEIGHT = 760;
const TABLE_EDITOR_VIEWPORT_PADDING = 16;
const clipboardSemanticHtmlCache = new Map();
const mathMarkupCache = new Map();
const pendingMathRenderTasks = new WeakMap();
const pendingMathRenderByCacheKey = new Map();
const richOverlayDetailHtmlCache = new Map();
const pendingRichOverlayDetailTasks = new WeakMap();
const pendingRichOverlayDetailByCacheKey = new Map();
let mathWorkerState = {
  supported: typeof Worker !== "undefined",
  disabled: false,
  worker: null,
  nextRequestId: 0,
  requestsById: new Map(),
};

function getClipboardSemanticCacheKey(text = "", baseFontSize = DEFAULT_TEXT_FONT_SIZE) {
  return `${Math.max(8, Number(baseFontSize) || DEFAULT_TEXT_FONT_SIZE)}::${String(text || "")}`;
}

function readClipboardSemanticHtmlCache(text = "", baseFontSize = DEFAULT_TEXT_FONT_SIZE) {
  const key = getClipboardSemanticCacheKey(text, baseFontSize);
  if (!clipboardSemanticHtmlCache.has(key)) {
    return null;
  }
  const value = clipboardSemanticHtmlCache.get(key);
  clipboardSemanticHtmlCache.delete(key);
  clipboardSemanticHtmlCache.set(key, value);
  return value;
}

function writeClipboardSemanticHtmlCache(text = "", baseFontSize = DEFAULT_TEXT_FONT_SIZE, html = "") {
  const key = getClipboardSemanticCacheKey(text, baseFontSize);
  clipboardSemanticHtmlCache.set(key, String(html || ""));
  while (clipboardSemanticHtmlCache.size > CLIPBOARD_SEMANTIC_CACHE_MAX_SIZE) {
    const oldestKey = clipboardSemanticHtmlCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    clipboardSemanticHtmlCache.delete(oldestKey);
  }
}

function normalizeExportHistoryBoardKey(value = "") {
  return String(value || "").trim().replace(/\\/g, "/").toLowerCase();
}

function readExportHistoryStorage() {
  try {
    const raw = localStorage.getItem(EXPORT_HISTORY_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeExportHistoryStorage(cache = {}) {
  try {
    localStorage.setItem(EXPORT_HISTORY_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore export history persistence failures.
  }
}

function normalizeExportHistoryEntry(entry = {}) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const exportedAt = Number(entry.exportedAt || entry.timestamp || Date.now()) || Date.now();
  const kind = String(entry.kind || "").trim().toLowerCase();
  const scope = String(entry.scope || "").trim().toLowerCase();
  const title = String(entry.title || "").trim();
  const filePath = String(entry.filePath || "").trim();
  const fileName = String(entry.fileName || "").trim();
  const jumpTarget = String(entry.jumpTarget || filePath || "").trim();
  const id = String(entry.id || `${exportedAt}_${kind}_${scope}_${fileName || title}`.replace(/\s+/g, "_"));
  return {
    id,
    exportedAt,
    kind,
    scope,
    title: title || fileName || "导出记录",
    filePath,
    fileName,
    jumpTarget,
  };
}

function normalizeExportHistoryList(list = []) {
  return (Array.isArray(list) ? list : [])
    .map((entry) => normalizeExportHistoryEntry(entry))
    .filter(Boolean)
    .sort((left, right) => Number(right.exportedAt || 0) - Number(left.exportedAt || 0))
    .slice(0, EXPORT_HISTORY_LIMIT);
}

function createIdleBatchQueue({ process, perFlushLimit = 4, timeout = OVERLAY_IDLE_TASK_TIMEOUT_MS } = {}) {
  const queuedKeys = [];
  const queuedSet = new Set();
  let cancelScheduledFlush = null;

  function ensureFlushScheduled() {
    if (cancelScheduledFlush || !queuedKeys.length) {
      return;
    }
    cancelScheduledFlush = scheduleIdleTask((deadline) => {
      cancelScheduledFlush = null;
      flush(deadline);
    }, timeout);
  }

  function flush(deadline = null) {
    const startTime =
      typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    let processed = 0;
    while (queuedKeys.length) {
      if (processed >= perFlushLimit) {
        break;
      }
      if (
        processed > 0 &&
        deadline &&
        typeof deadline.timeRemaining === "function" &&
        deadline.timeRemaining() < OVERLAY_IDLE_MIN_TIME_REMAINING_MS
      ) {
        break;
      }
      const now =
        typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
      if (processed > 0 && now - startTime >= OVERLAY_IDLE_FLUSH_BUDGET_MS) {
        break;
      }
      const key = queuedKeys.shift();
      queuedSet.delete(key);
      process?.(key);
      processed += 1;
    }
    if (queuedKeys.length) {
      ensureFlushScheduled();
    }
  }

  return {
    enqueue(key) {
      if (!key || queuedSet.has(key)) {
        return;
      }
      queuedSet.add(key);
      queuedKeys.push(key);
      ensureFlushScheduled();
    },
    remove(key) {
      if (!key || !queuedSet.has(key)) {
        return;
      }
      queuedSet.delete(key);
      const index = queuedKeys.indexOf(key);
      if (index >= 0) {
        queuedKeys.splice(index, 1);
      }
    },
    clear() {
      queuedKeys.length = 0;
      queuedSet.clear();
      if (typeof cancelScheduledFlush === "function") {
        cancelScheduledFlush();
      }
      cancelScheduledFlush = null;
    },
  };
}

function yieldToNextFrame() {
  if (typeof requestAnimationFrame === "function") {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return Promise.resolve();
}

function yieldToIdleWindow(timeout = 32) {
  if (typeof requestIdleCallback === "function") {
    return new Promise((resolve) => requestIdleCallback(() => resolve(), { timeout }));
  }
  return yieldToNextFrame();
}

function shouldDeferSemanticUpgradeForText(text = "") {
  const source = sanitizeText(String(text || ""));
  if (!source || source.length < CLIPBOARD_SEMANTIC_DEGRADE_THRESHOLD) {
    return false;
  }
  return /```|^\s*[-*+]\s+|^\s*\d+\.\s+|^\s*#{1,6}\s+|^\s*>\s+|\|.+\||\$\$|\\\[|\\\(/m.test(source);
}

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

function normalizeComparableUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) {
    return "";
  }
  try {
    return new URL(raw, globalThis?.location?.href || "https://freeflow.local/").toString();
  } catch {
    return raw;
  }
}

function isCanvasInternalLinkUrl(url = "") {
  return String(url || "").trim().toLowerCase().startsWith(CANVAS_INTERNAL_LINK_SCHEME);
}

function buildCanvasInternalLinkUrl(itemId = "") {
  const normalizedItemId = String(itemId || "").trim();
  if (!normalizedItemId) {
    return "";
  }
  return `${CANVAS_INTERNAL_LINK_SCHEME}${encodeURIComponent(normalizedItemId)}`;
}

function resolveCanvasInternalLinkTargetId(url = "") {
  const raw = String(url || "").trim();
  if (!isCanvasInternalLinkUrl(raw)) {
    return "";
  }
  const encodedTarget = raw.slice(CANVAS_INTERNAL_LINK_SCHEME.length);
  if (!encodedTarget) {
    return "";
  }
  try {
    return decodeURIComponent(encodedTarget).trim();
  } catch {
    return encodedTarget.trim();
  }
}

function normalizeUserLinkInput(value = "") {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (isCanvasInternalLinkUrl(raw)) {
    return raw;
  }
  if (/^file:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch {
      return "";
    }
  }
  if (/^[a-zA-Z]:[\\/]/.test(raw)) {
    const normalizedPath = raw.replace(/\\/g, "/");
    return encodeURI(`file:///${normalizedPath}`);
  }
  if (/^\\\\[^\\]+\\[^\\]+/.test(raw)) {
    const normalizedPath = raw.replace(/\\/g, "/");
    return encodeURI(`file:${normalizedPath}`);
  }
  if (/^\/[^/]/.test(raw)) {
    return encodeURI(`file://${raw}`);
  }
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:", "mailto:", "tel:", "file:", "freeflow:"].includes(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch {
    if (/^www\./i.test(raw)) {
      try {
        return new URL(`https://${raw}`).toString();
      } catch {
        return "";
      }
    }
    if (/^[^\s]+\.[^\s]+/.test(raw) && !raw.includes("://")) {
      try {
        return new URL(`https://${raw}`).toString();
      } catch {
        return "";
      }
    }
    return "";
  }
}

function applyLinkSemanticsToRichDisplayNode(node, item) {
  if (!(node instanceof HTMLDivElement) || !item || (item.type !== "text" && !isMindNodeTextItem(item))) {
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
    const meta =
      metaCache[href] && typeof metaCache[href] === "object"
        ? metaCache[href]
        : metaCache[normalizedHref] && typeof metaCache[normalizedHref] === "object"
          ? metaCache[normalizedHref]
          : {};
    const canvasTargetId = resolveCanvasInternalLinkTargetId(href || normalizedHref);
    const linkType = canvasTargetId ? CANVAS_INTERNAL_LINK_TYPE : EXTERNAL_LINK_TYPE;
    const kindHint = canvasTargetId
      ? "canvas-link"
      : String(matchedToken?.kindHint || "link").trim().toLowerCase() || "link";
    anchor.setAttribute("data-link-token", "1");
    anchor.setAttribute("data-link-url", href || normalizedHref);
    anchor.setAttribute("data-link-kind", kindHint);
    anchor.setAttribute("data-link-type", linkType);
    if (canvasTargetId) {
      anchor.setAttribute("data-link-target-id", canvasTargetId);
    } else {
      anchor.removeAttribute("data-link-target-id");
    }
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
    if (linkType === EXTERNAL_LINK_TYPE) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    } else {
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
    }
    const title = String(meta?.title || href || normalizedHref).trim();
    if (title) {
      anchor.setAttribute("title", title);
    }
  });
}

function getTextResizeMode(item) {
  return normalizeTextResizeMode(
    item?.textResizeMode || deriveTextResizeModeFromLayoutMode(getTextBoxLayoutMode(item)),
    item?.wrapMode
  );
}

function isMindNodeTextItem(item) {
  return item?.type === "mindNode" || item?.type === "mindSummary";
}

function isWrapTextItem(item) {
  return (item?.type === "text" || isMindNodeTextItem(item)) && getTextResizeMode(item) === TEXT_RESIZE_MODE_WRAP;
}

function isFixedSizeTextItem(item) {
  return (item?.type === "text" || isMindNodeTextItem(item)) && getTextBoxLayoutMode(item) === TEXT_BOX_LAYOUT_MODE_FIXED_SIZE;
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
  // Keep explicit anchor mappings stable:
  // when user edits href without changing displayed text, remapping from plain text
  // would rebuild links from text content and overwrite the edited href.
  if (/<a\b[^>]*href\s*=/i.test(String(html || ""))) {
    return initialContent;
  }
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

function normalizeEditedTableCellContent(cell, html, fontSize = DEFAULT_TEXT_FONT_SIZE) {
  return ensureRichTextDocumentFields(
    {
      ...(cell && typeof cell === "object" ? cell : {}),
      html,
      plainText: htmlToPlainText(html),
      text: htmlToPlainText(html),
      richTextDocument: cell?.richTextDocument || null,
    },
    {
      fontSize,
    }
  );
}

function renderTableCellStaticHtml(cell = {}, fontSize = DEFAULT_TEXT_FONT_SIZE) {
  const normalizedHtml = sanitizeHtml(
    normalizeRichHtmlInlineFontSizes(normalizeRichHtml(String(cell?.html || "").trim()), fontSize)
  ).trim();
  if (normalizedHtml) {
    return normalizedHtml;
  }
  return escapeRichTextHtml(String(cell?.plainText || "")).replace(/\n/g, "<br>");
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

function extractStandaloneMathBlockSegments(html = "") {
  if (typeof document === "undefined") {
    return [];
  }
  const source = String(html || "").trim();
  if (!source) {
    return [];
  }
  const root = document.createElement("div");
  root.innerHTML = source;
  const segments = [];
  const textBuffer = document.createElement("div");
  const flushTextBuffer = () => {
    const bufferHtml = String(textBuffer.innerHTML || "").trim();
    textBuffer.innerHTML = "";
    if (!bufferHtml) {
      return;
    }
    const plainText = sanitizeText(htmlToPlainText(bufferHtml));
    if (!plainText.trim() && !/<(?:img|table|blockquote|pre|ul|ol|hr)\b/i.test(bufferHtml)) {
      return;
    }
    segments.push({
      type: "text",
      html: bufferHtml,
      plainText,
    });
  };
  Array.from(root.childNodes).forEach((node) => {
    if (node instanceof HTMLElement && String(node.getAttribute("data-role") || "").trim().toLowerCase() === "math-block") {
      flushTextBuffer();
      const formula = sanitizeText(String(node.textContent || "")).trim();
      if (formula) {
        segments.push({
          type: "math-block",
          formula,
        });
      }
      return;
    }
    textBuffer.appendChild(node.cloneNode(true));
  });
  flushTextBuffer();
  return segments;
}

function extractTextSplitSegments(html = "") {
  if (typeof document === "undefined") {
    return [];
  }
  const source = String(html || "").trim();
  if (!source) {
    return [];
  }
  const root = document.createElement("div");
  root.innerHTML = source;
  const markerNodes = Array.from(root.querySelectorAll('[data-ff-text-split="true"]'));
  if (!markerNodes.length) {
    return [];
  }
  Array.from(root.querySelectorAll('[data-ff-text-split-spacer="true"]')).forEach((node) => {
    node.remove();
  });
  const segments = [];
  const pushRangeSegment = (range) => {
    if (!(range instanceof Range) || range.collapsed) {
      return;
    }
    const bufferRoot = document.createElement("div");
    bufferRoot.appendChild(range.cloneContents());
    const htmlValue = sanitizeHtml(String(bufferRoot.innerHTML || "").trim());
    if (!htmlValue) {
      return;
    }
    const plainText = sanitizeText(htmlToPlainText(htmlValue));
    if (!plainText.trim() && !/<(?:img|table|blockquote|pre|ul|ol|hr)\b/i.test(htmlValue)) {
      return;
    }
    segments.push({
      type: "text",
      html: htmlValue,
      plainText,
    });
  };
  let startContainer = root;
  let startOffset = 0;
  markerNodes.forEach((marker) => {
    const parentNode = marker.parentNode;
    if (!(parentNode instanceof Node)) {
      return;
    }
    const markerIndex = Array.prototype.indexOf.call(parentNode.childNodes, marker);
    const range = document.createRange();
    range.setStart(startContainer, startOffset);
    range.setEndBefore(marker);
    pushRangeSegment(range);
    startContainer = parentNode;
    startOffset = Math.max(0, markerIndex);
    marker.remove();
  });
  const tailRange = document.createRange();
  tailRange.setStart(startContainer, startOffset);
  tailRange.setEnd(root, root.childNodes.length);
  pushRangeSegment(tailRange);
  return segments;
}

function buildSplitTextSegmentItem(baseItem, segment, { x = 0, y = 0, width = 240, fontSize = DEFAULT_TEXT_FONT_SIZE } = {}) {
  const html = normalizeRichHtmlInlineFontSizes(String(segment?.html || ""), fontSize).trim();
  const plainText = sanitizeText(segment?.plainText || htmlToPlainText(html));
  const content = ensureRichTextDocumentFields(
    {
      ...baseItem,
      html,
      plainText,
      text: plainText,
      fontSize,
      x,
      y,
      width,
      textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
      textResizeMode: TEXT_RESIZE_MODE_WRAP,
    },
    {
      fontSize,
    }
  );
  const measured = measureTextElementLayout(
    {
      ...baseItem,
      html: content.html,
      plainText: content.plainText,
      text: content.plainText,
      richTextDocument: content.richTextDocument,
      fontSize,
      width,
      height: Math.max(40, Number(baseItem?.height || 0) || 40),
      textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
      textResizeMode: TEXT_RESIZE_MODE_WRAP,
    },
    {
      includeHtmlMeasurement: true,
      widthHint: width,
    }
  );
  const normalizedItem = normalizeTextElement({
    ...baseItem,
    id: createId("text"),
    x,
    y,
    width,
    height: Math.max(40, Math.ceil(Number(measured.height || 0) || 40)),
    fontSize,
    html: content.html,
    plainText: content.plainText,
    text: content.plainText,
    richTextDocument: content.richTextDocument,
    textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
    textResizeMode: TEXT_RESIZE_MODE_WRAP,
    wrapMode: TEXT_WRAP_MODE_MANUAL,
    title: buildTextTitle(content.plainText || "文本"),
    linkTokens: Array.isArray(baseItem?.linkTokens) ? baseItem.linkTokens : [],
    urlMetaCache: baseItem?.urlMetaCache && typeof baseItem.urlMetaCache === "object" ? baseItem.urlMetaCache : {},
  });
  const semanticData = syncTextLinkSemanticFields(normalizedItem, content.plainText, content.richTextDocument, {
    semanticEnabled: true,
  });
  normalizedItem.linkTokens = semanticData.linkTokens;
  normalizedItem.urlMetaCache = semanticData.urlMetaCache;
  if (semanticData.richTextDocument) {
    normalizedItem.richTextDocument = semanticData.richTextDocument;
  }
  normalizedItem.width = width;
  normalizedItem.height = Math.max(40, Math.ceil(Number(measured.height || normalizedItem.height || 0) || 40));
  return normalizedItem;
}

function buildSplitMathBlockItem(baseItem, formula = "", { x = 0, y = 0, width = 240, fontSize = DEFAULT_TEXT_FONT_SIZE } = {}) {
  const mathItem = buildTextElementFromMathElement(
    {
      formula,
      displayMode: true,
      sourceFormat: "latex",
      renderState: "ready",
      locked: Boolean(baseItem?.locked),
    },
    {
      x,
      y,
      width,
      fontSize: Math.max(fontSize, 22),
    }
  );
  const measured = measureTextElementLayout(
    {
      ...mathItem,
      width,
      height: Math.max(72, Number(mathItem.height || 0) || 72),
      textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
      textResizeMode: TEXT_RESIZE_MODE_WRAP,
    },
    {
      includeHtmlMeasurement: true,
      widthHint: width,
    }
  );
  const normalizedItem = normalizeTextElement({
    ...mathItem,
    x,
    y,
    width,
    height: Math.max(72, Math.ceil(Number(measured.height || mathItem.height || 0) || 72)),
    textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
    textResizeMode: TEXT_RESIZE_MODE_WRAP,
    wrapMode: TEXT_WRAP_MODE_MANUAL,
    color: baseItem?.color || "#0f172a",
  });
  normalizedItem.width = width;
  normalizedItem.height = Math.max(72, Math.ceil(Number(measured.height || normalizedItem.height || 0) || 72));
  return normalizedItem;
}

function buildStandaloneMathBlockSplitItems(baseItem, html = "", options = {}) {
  const segments = extractStandaloneMathBlockSegments(html);
  const hasStandaloneMath = segments.some((segment) => segment.type === "math-block");
  if (!hasStandaloneMath) {
    return null;
  }
  const x = Number(baseItem?.x || 0) || 0;
  const startY = Number(baseItem?.y || 0) || 0;
  const width = Math.max(160, Number(options.width || baseItem?.width || 0) || 240);
  const fontSize = Number(options.fontSize || baseItem?.fontSize || DEFAULT_TEXT_FONT_SIZE) || DEFAULT_TEXT_FONT_SIZE;
  const items = [];
  let cursorY = startY;
  segments.forEach((segment) => {
    const nextItem =
      segment.type === "math-block"
        ? buildSplitMathBlockItem(baseItem, segment.formula, { x, y: cursorY, width, fontSize })
        : buildSplitTextSegmentItem(baseItem, segment, { x, y: cursorY, width, fontSize });
    if (!nextItem) {
      return;
    }
    items.push(nextItem);
    cursorY += Math.max(40, Number(nextItem.height || 0) || 40) + TEXT_BLOCK_SPLIT_GAP;
  });
  return items.length ? items : null;
}

function buildTextSplitItems(baseItem, html = "", options = {}) {
  const rawHtml = String(html || "");
  if (!/data-ff-text-split\s*=\s*["']?true["']?/i.test(rawHtml)) {
    return null;
  }
  const segments = extractTextSplitSegments(rawHtml);
  if (segments.length < 2) {
    return null;
  }
  const x = Number(baseItem?.x || 0) || 0;
  const startY = Number(baseItem?.y || 0) || 0;
  const width = Math.max(160, Number(options.width || baseItem?.width || 0) || 240);
  const fontSize = Number(options.fontSize || baseItem?.fontSize || DEFAULT_TEXT_FONT_SIZE) || DEFAULT_TEXT_FONT_SIZE;
  const items = [];
  let cursorY = startY;
  segments.forEach((segment) => {
    const nextItem = buildSplitTextSegmentItem(baseItem, segment, { x, y: cursorY, width, fontSize });
    if (!nextItem) {
      return;
    }
    items.push(nextItem);
    cursorY += Math.max(40, Number(nextItem.height || 0) || 40) + TEXT_BLOCK_SPLIT_GAP;
  });
  return items.length >= 2 ? items : null;
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
  const isMindNode = item.type === "mindNode" || item.type === "mindSummary";
  const isWrapText = isWrapTextItem(item);
  const width = Math.max(1, Number(item.width || 1)) * Math.max(0.1, Number(scale) || 1);
  const height = Math.max(1, Number(item.height || 1)) * Math.max(0.1, Number(scale) || 1);
  const padding = isFlowNode ? getFlowNodeTextPadding(scale, { width, height }) : { x: 0, y: 0 };
  const lineHeightRatio = isFlowNode ? FLOW_NODE_TEXT_LAYOUT.lineHeightRatio : TEXT_BODY_LINE_HEIGHT_RATIO;
  editor.classList.toggle("is-flow-node", isFlowNode);
  editor.classList.toggle("is-mind-node", isMindNode);
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
  const measuredWidth =
    Number(surfaceRect?.width || 0) ||
    Number(surface?.clientWidth || 0) ||
    Number(fallbackWidth || 0) ||
    0;
  const measuredHeight =
    Number(surfaceRect?.height || 0) ||
    Number(surface?.clientHeight || 0) ||
    Number(fallbackHeight || 0) ||
    0;
  const viewportFallbackWidth =
    typeof window !== "undefined"
      ? Math.max(
          Number(window.innerWidth || 0) || 0,
          Number(document?.documentElement?.clientWidth || 0) || 0
        )
      : 0;
  const viewportFallbackHeight =
    typeof window !== "undefined"
      ? Math.max(
          Number(window.innerHeight || 0) || 0,
          Number(document?.documentElement?.clientHeight || 0) || 0
        )
      : 0;
  const width = Math.max(1, measuredWidth > 4 ? measuredWidth : Math.max(measuredWidth, viewportFallbackWidth, 1));
  const height = Math.max(
    1,
    measuredHeight > 4 ? measuredHeight : Math.max(measuredHeight, viewportFallbackHeight, 1)
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

function getCanvasLodScalePercent(scale = 1) {
  return Math.round(Math.max(0.1, Number(scale) || 1) * 100);
}

function isDetailedOverlayScale(scale = 1, minScale = 0.5) {
  return getCanvasLodScalePercent(scale) > Math.round(Math.max(0.1, Number(minScale) || 0.5) * 100);
}

function isCanvasLodScale(scale = 1, minScale = 0.15) {
  return getCanvasLodScalePercent(scale) <= Math.round(Math.max(0.1, Number(minScale) || 0.15) * 100);
}

function hideOverlayHost(host, virtualizer, { onRemove = null } = {}) {
  if (!(host instanceof HTMLDivElement)) {
    return;
  }
  host.classList.add("is-hidden");
  host.style.display = "none";
  virtualizer?.clear?.({
    removeNodes: true,
    onRemove,
  });
}

function showOverlayHost(host) {
  if (!(host instanceof HTMLDivElement)) {
    return;
  }
  host.classList.remove("is-hidden");
  host.style.display = "block";
}

function buildOverlayTextPreview(text = "", maxLength = 240) {
  const source = sanitizeText(String(text || ""));
  if (!source) {
    return "";
  }
  const normalized = source.replace(/\n{3,}/g, "\n\n");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildFileCardPreviewDiagnostics(patch = {}) {
  const merged = {
    loadState: "待开始",
    parseState: "待开始",
    pageCount: 0,
    contentNodeCount: 0,
    runtimeLabel: "待命",
    ...(patch && typeof patch === "object" ? patch : {}),
  };
  return {
    loadState: String(merged.loadState || "").trim() || "待开始",
    parseState: String(merged.parseState || "").trim() || "待开始",
    pageCount: Math.max(0, Number(merged.pageCount || 0) || 0),
    contentNodeCount: Math.max(0, Number(merged.contentNodeCount || 0) || 0),
    runtimeLabel: String(merged.runtimeLabel || "").trim() || "待命",
  };
}

function hashOverlayContent(value = "") {
  const source = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function readRichOverlayDetailHtmlCache(key = "") {
  if (!key || !richOverlayDetailHtmlCache.has(key)) {
    return "";
  }
  const cached = richOverlayDetailHtmlCache.get(key) || "";
  richOverlayDetailHtmlCache.delete(key);
  richOverlayDetailHtmlCache.set(key, cached);
  return cached;
}

function writeRichOverlayDetailHtmlCache(key = "", html = "") {
  if (!key) {
    return;
  }
  if (richOverlayDetailHtmlCache.has(key)) {
    richOverlayDetailHtmlCache.delete(key);
  }
  richOverlayDetailHtmlCache.set(key, html);
  while (richOverlayDetailHtmlCache.size > RICH_OVERLAY_DETAIL_CACHE_LIMIT) {
    const oldestKey = richOverlayDetailHtmlCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    richOverlayDetailHtmlCache.delete(oldestKey);
  }
}

function getRichOverlayDetailHtmlCacheKey(item, linkSignature = "") {
  const plainText = String(item?.plainText || item?.text || "");
  const rawHtml = String(item?.html || "");
  return [
    String(item?.id || ""),
    Number(item?.updatedAt || 0),
    Number(item?.fontSize || 0),
    rawHtml.length,
    hashOverlayContent(rawHtml),
    plainText.length,
    hashOverlayContent(plainText),
    hashOverlayContent(linkSignature),
  ].join("|");
}

function resolveCachedRichOverlayDetailHtml(item, linkSignature = "") {
  const cacheKey = getRichOverlayDetailHtmlCacheKey(item, linkSignature);
  const cached = readRichOverlayDetailHtmlCache(cacheKey);
  if (cached) {
    return cached;
  }
  const html = normalizeRichHtmlInlineFontSizes(
    resolveRichTextDisplayHtml({
      text: item?.plainText || item?.text || "",
      html: item?.html || "",
      linkTokens: item?.linkTokens || [],
    }),
    item?.fontSize || DEFAULT_TEXT_FONT_SIZE
  );
  writeRichOverlayDetailHtmlCache(cacheKey, html);
  return html;
}

function cancelPendingRichOverlayDetail(node) {
  const pending = pendingRichOverlayDetailTasks.get(node);
  if (pending?.cancel) {
    pending.cancel();
  }
  pendingRichOverlayDetailTasks.delete(node);
}

function applyRichOverlayDetailHtmlToNode(
  node,
  {
    detailRenderSignature = "",
    html = "",
    item = null,
    linkSignature = "",
    scale = 1,
    scaleBucket = "1",
  } = {}
) {
  if (!(node instanceof HTMLDivElement)) {
    return false;
  }
  if (node.dataset.detailRenderSignature !== detailRenderSignature) {
    return false;
  }
  if (!html.trim()) {
    return false;
  }
  const contentMutated = node.dataset.contentMode !== "detail" || node.dataset.html !== html;
  if (contentMutated) {
    node.innerHTML = html;
    node.dataset.html = html;
    node.dataset.text = "";
    node.dataset.contentMode = "detail";
  }
  if (item?.type === "text" && (contentMutated || node.dataset.linkSignature !== linkSignature)) {
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
  return contentMutated;
}

function scheduleRichOverlayDetailHtml(
  node,
  {
    cacheKey = "",
    detailRenderSignature = "",
    item = null,
    linkSignature = "",
    scale = 1,
    scaleBucket = "1",
  } = {}
) {
  if (!(node instanceof HTMLDivElement) || !cacheKey || !item) {
    return;
  }
  const activeTask = pendingRichOverlayDetailTasks.get(node);
  if (activeTask?.detailRenderSignature === detailRenderSignature) {
    return;
  }
  cancelPendingRichOverlayDetail(node);
  const cachedHtml = readRichOverlayDetailHtmlCache(cacheKey);
  if (cachedHtml) {
    applyRichOverlayDetailHtmlToNode(node, {
      detailRenderSignature,
      html: cachedHtml,
      item,
      linkSignature,
      scale,
      scaleBucket,
    });
    return;
  }
  const existing = pendingRichOverlayDetailByCacheKey.get(cacheKey);
  if (existing) {
    existing.subscribers.push({ node, detailRenderSignature, item, linkSignature, scale, scaleBucket });
    pendingRichOverlayDetailTasks.set(node, {
      cacheKey,
      detailRenderSignature,
      cancel: () => {
        const entry = pendingRichOverlayDetailByCacheKey.get(cacheKey);
        if (!entry) {
          return;
        }
        entry.subscribers = entry.subscribers.filter((subscriber) => subscriber.node !== node);
        if (!entry.subscribers.length) {
          pendingRichOverlayDetailByCacheKey.delete(cacheKey);
          richOverlayDetailQueue.remove(cacheKey);
        }
      },
    });
    return;
  }
  const entry = {
    item,
    subscribers: [{ node, detailRenderSignature, item, linkSignature, scale, scaleBucket }],
  };
  pendingRichOverlayDetailByCacheKey.set(cacheKey, entry);
  richOverlayDetailQueue.enqueue(cacheKey);
  pendingRichOverlayDetailTasks.set(node, {
    cacheKey,
    detailRenderSignature,
    cancel: () => {
      const activeEntry = pendingRichOverlayDetailByCacheKey.get(cacheKey);
      if (!activeEntry) {
        return;
      }
      activeEntry.subscribers = activeEntry.subscribers.filter((subscriber) => subscriber.node !== node);
      if (!activeEntry.subscribers.length) {
        pendingRichOverlayDetailByCacheKey.delete(cacheKey);
        richOverlayDetailQueue.remove(cacheKey);
      }
    },
  });
}

function getMathMarkupCacheKey(formula = "", displayMode = false) {
  return `${displayMode ? "block" : "inline"}::${String(formula || "").trim()}`;
}

function readMathMarkupCache(key = "") {
  if (!key || !mathMarkupCache.has(key)) {
    return "";
  }
  const cached = mathMarkupCache.get(key) || "";
  mathMarkupCache.delete(key);
  mathMarkupCache.set(key, cached);
  return cached;
}

function writeMathMarkupCache(key = "", markup = "") {
  if (!key) {
    return;
  }
  if (mathMarkupCache.has(key)) {
    mathMarkupCache.delete(key);
  }
  mathMarkupCache.set(key, markup);
  while (mathMarkupCache.size > MATH_MARKUP_CACHE_LIMIT) {
    const oldestKey = mathMarkupCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    mathMarkupCache.delete(oldestKey);
  }
}

function applyMathRenderResultToSubscribers(entry, cacheKey, markup = "", { transport = "", fallbackToMainThread = false } = {}) {
  const hasMarkup = markup && hasRenderedKatexMarkup(markup);
  if (hasMarkup) {
    writeMathMarkupCache(cacheKey, markup);
  }
  entry?.subscribers?.forEach((subscriber) => {
    pendingMathRenderTasks.delete(subscriber.node);
    const finalMarkup =
      hasMarkup || !fallbackToMainThread ? markup : renderMathMarkup(entry?.formula, { displayMode: entry?.displayMode === true });
    const finalHasMarkup = finalMarkup && hasRenderedKatexMarkup(finalMarkup);
    if (finalHasMarkup) {
      writeMathMarkupCache(cacheKey, finalMarkup);
    }
    if (subscriber.item && typeof subscriber.item === "object") {
      subscriber.item.renderState = finalHasMarkup ? "ready" : "fallback";
      // Mark the overlay as settled so detail mode does not retry indefinitely on fallback-only hosts.
      subscriber.item.mathOverlayReady = true;
    }
    applyMathMarkupToNode(subscriber.node, subscriber.contentSignature, finalHasMarkup ? finalMarkup : "", {
      fallbackText: subscriber.fallbackText,
      state: finalHasMarkup ? "ready" : "fallback",
      transport: transport || (finalHasMarkup ? "main-thread" : "fallback"),
    });
  });
}

function scheduleIdleTask(callback, timeout = OVERLAY_IDLE_TASK_TIMEOUT_MS) {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback((deadline) => callback(deadline || null), { timeout });
    return () => cancelIdleCallback(handle);
  }
  if (typeof requestAnimationFrame === "function") {
    const handle = requestAnimationFrame(() => callback(null));
    return () => cancelAnimationFrame(handle);
  }
  const handle = setTimeout(() => callback(null), 0);
  return () => clearTimeout(handle);
}

function scheduleAnimationFrameTask(callback) {
  if (typeof requestAnimationFrame === "function") {
    const handle = requestAnimationFrame(() => callback());
    return () => cancelAnimationFrame(handle);
  }
  const handle = setTimeout(() => callback(), 0);
  return () => clearTimeout(handle);
}

const richOverlayDetailQueue = createIdleBatchQueue({
  perFlushLimit: RICH_OVERLAY_IDLE_BATCH_LIMIT,
  process: (cacheKey) => {
    const entry = pendingRichOverlayDetailByCacheKey.get(cacheKey);
    if (!entry) {
      return;
    }
    pendingRichOverlayDetailByCacheKey.delete(cacheKey);
    const item = entry.item;
    const html = normalizeRichHtmlInlineFontSizes(
      resolveRichTextDisplayHtml({
        text: item?.plainText || item?.text || "",
        html: item?.html || "",
        linkTokens: item?.linkTokens || [],
      }),
      item?.fontSize || DEFAULT_TEXT_FONT_SIZE
    );
    writeRichOverlayDetailHtmlCache(cacheKey, html);
    entry.subscribers.forEach((subscriber) => {
      pendingRichOverlayDetailTasks.delete(subscriber.node);
      applyRichOverlayDetailHtmlToNode(subscriber.node, {
        detailRenderSignature: subscriber.detailRenderSignature,
        html,
        item: subscriber.item,
        linkSignature: subscriber.linkSignature,
        scale: subscriber.scale,
        scaleBucket: subscriber.scaleBucket,
      });
    });
  },
});

const mathOverlayRenderQueue = createIdleBatchQueue({
  perFlushLimit: MATH_OVERLAY_IDLE_BATCH_LIMIT,
  process: (cacheKey) => {
    const entry = pendingMathRenderByCacheKey.get(cacheKey);
    if (!entry) {
      return;
    }
    if (scheduleMathWorkerRender(cacheKey, entry)) {
      return;
    }
    pendingMathRenderByCacheKey.delete(cacheKey);
    applyMathRenderResultToSubscribers(entry, cacheKey, renderMathMarkup(entry.formula, { displayMode: entry.displayMode }), {
      transport: "main-thread",
    });
  },
});

function markMathWorkerUnavailable() {
  mathWorkerState.disabled = true;
  if (mathWorkerState.worker) {
    try {
      mathWorkerState.worker.terminate();
    } catch {
      // Ignore worker terminate failures and keep fallback path alive.
    }
  }
  mathWorkerState.worker = null;
}

function flushPendingMathWorkerRequestsToMainThread() {
  const pendingRequests = Array.from(mathWorkerState.requestsById.entries());
  mathWorkerState.requestsById.clear();
  pendingRequests.forEach(([, request]) => {
    const entry = pendingMathRenderByCacheKey.get(request.cacheKey);
    if (!entry) {
      return;
    }
    pendingMathRenderByCacheKey.delete(request.cacheKey);
    applyMathRenderResultToSubscribers(entry, request.cacheKey, "", {
      transport: "main-thread",
      fallbackToMainThread: true,
    });
  });
}

function settleMathWorkerRequest(requestId, response = {}) {
  const request = mathWorkerState.requestsById.get(requestId);
  if (!request) {
    return;
  }
  mathWorkerState.requestsById.delete(requestId);
  const entry = pendingMathRenderByCacheKey.get(request.cacheKey);
  if (!entry) {
    return;
  }
  pendingMathRenderByCacheKey.delete(request.cacheKey);
  applyMathRenderResultToSubscribers(entry, request.cacheKey, String(response.markup || ""), {
    transport: String(response.transport || "worker"),
    fallbackToMainThread: response.ok !== true,
  });
}

function getMathWorker() {
  if (!mathWorkerState.supported || mathWorkerState.disabled) {
    return null;
  }
  if (mathWorkerState.worker) {
    return mathWorkerState.worker;
  }
  const workerUrl = getMathWorkerUrl();
  if (!workerUrl) {
    mathWorkerState.disabled = true;
    return null;
  }
  try {
    const worker = new Worker(workerUrl);
    worker.onmessage = (event) => {
      const payload = event?.data || {};
      const requestId = Number(payload.id);
      if (!Number.isFinite(requestId)) {
        return;
      }
      settleMathWorkerRequest(requestId, payload);
    };
    worker.onerror = () => {
      markMathWorkerUnavailable();
      flushPendingMathWorkerRequestsToMainThread();
    };
    mathWorkerState.worker = worker;
    return worker;
  } catch {
    mathWorkerState.disabled = true;
    return null;
  }
}

function scheduleMathWorkerRender(cacheKey, entry) {
  const worker = getMathWorker();
  if (!worker || !cacheKey || !entry?.formula) {
    return false;
  }
  const requestId = ++mathWorkerState.nextRequestId;
  mathWorkerState.requestsById.set(requestId, {
    cacheKey,
    formula: entry.formula,
    displayMode: entry.displayMode === true,
  });
  try {
    worker.postMessage({
      id: requestId,
      cacheKey,
      formula: entry.formula,
      displayMode: entry.displayMode === true,
    });
    entry.subscribers?.forEach((subscriber) => {
      if (subscriber?.node instanceof HTMLDivElement) {
        subscriber.node.dataset.mathRenderTransport = "worker";
      }
    });
    return true;
  } catch {
    mathWorkerState.requestsById.delete(requestId);
    markMathWorkerUnavailable();
    return false;
  }
}

function cancelPendingMathRender(node) {
  const pending = pendingMathRenderTasks.get(node);
  if (pending?.cancel) {
    pending.cancel();
  }
  pendingMathRenderTasks.delete(node);
}

function applyMathMarkupToNode(node, contentSignature, markup = "", { fallbackText = "", state = "ready", transport = "" } = {}) {
  if (!(node instanceof HTMLDivElement)) {
    return;
  }
  if (node.dataset.contentSignature !== contentSignature) {
    return;
  }
  if (markup) {
    node.innerHTML = markup;
  } else {
    node.textContent = fallbackText;
  }
  node.dataset.mathRenderState = state;
  node.dataset.mathRenderTransport = String(transport || "");
}

function scheduleMathMarkupUpgrade(node, { cacheKey = "", formula = "", displayMode = false, contentSignature = "", fallbackText = "", item = null } = {}) {
  if (!(node instanceof HTMLDivElement) || !cacheKey || !formula) {
    return;
  }
  const activeTask = pendingMathRenderTasks.get(node);
  if (activeTask?.cacheKey === cacheKey && activeTask?.contentSignature === contentSignature) {
    return;
  }
  cancelPendingMathRender(node);
  const cached = readMathMarkupCache(cacheKey);
  if (cached) {
    applyMathMarkupToNode(node, contentSignature, cached, { fallbackText, state: "ready", transport: "cache" });
    return;
  }
  const existing = pendingMathRenderByCacheKey.get(cacheKey);
  if (existing) {
    existing.subscribers.push({ node, contentSignature, fallbackText, item });
    pendingMathRenderTasks.set(node, {
      cacheKey,
      contentSignature,
      cancel: () => {
        const entry = pendingMathRenderByCacheKey.get(cacheKey);
        if (!entry) {
          return;
        }
        entry.subscribers = entry.subscribers.filter((subscriber) => subscriber.node !== node);
        if (!entry.subscribers.length) {
          pendingMathRenderByCacheKey.delete(cacheKey);
          mathOverlayRenderQueue.remove(cacheKey);
        }
      },
    });
    node.dataset.mathRenderState = "pending";
    return;
  }
  const entry = {
    formula,
    displayMode,
    subscribers: [{ node, contentSignature, fallbackText, item }],
  };
  pendingMathRenderByCacheKey.set(cacheKey, entry);
  mathOverlayRenderQueue.enqueue(cacheKey);
  pendingMathRenderTasks.set(node, {
    cacheKey,
    contentSignature,
    cancel: () => {
      const activeEntry = pendingMathRenderByCacheKey.get(cacheKey);
      if (!activeEntry) {
        return;
      }
      activeEntry.subscribers = activeEntry.subscribers.filter((subscriber) => subscriber.node !== node);
      if (!activeEntry.subscribers.length) {
        pendingMathRenderByCacheKey.delete(cacheKey);
        mathOverlayRenderQueue.remove(cacheKey);
      }
    },
  });
  node.dataset.mathRenderState = "pending";
}

function resolveRichOverlaySkeletonLayout({ width = 120, height = 48, isFlowNode = false } = {}) {
  const safeWidth = Math.max(32, Number(width) || 120);
  const safeHeight = Math.max(24, Number(height) || 48);
  const area = safeWidth * safeHeight;
  const lineCount = area >= 120000 ? 4 : area >= 4200 ? 3 : 2;
  const aspectRatio = safeWidth / Math.max(1, safeHeight);
  const clusterWidth = Math.max(
    isFlowNode ? 28 : 34,
    Math.min(
      isFlowNode ? 54 : 60,
      Math.round(aspectRatio > 1.6 ? (isFlowNode ? 34 : 38) : (isFlowNode ? 44 : 48))
    )
  );
  const lineHeight = area >= 120000 ? 8 : area >= 4200 ? 7 : 6;
  const gap = lineCount >= 4 ? 8 : 10;
  const ratios = isFlowNode
    ? [0.88, 0.62, 0.74, 0.56]
    : [0.96, 0.7, 0.82, 0.6];
  return {
    lineCount,
    clusterWidth,
    lineHeight,
    gap,
    widths: Array.from({ length: lineCount }, (_, index) => Math.max(18, Math.round(clusterWidth * (ratios[index] || 0.64)))),
  };
}

function buildRichOverlaySkeletonMarkup({ width = 120, height = 48, isFlowNode = false, showPanel = false } = {}) {
  const layout = resolveRichOverlaySkeletonLayout({ width, height, isFlowNode });
  const widthRatios = layout.widths.map((lineWidth) => {
    const denominator = Math.max(layout.clusterWidth || 1, lineWidth || 1);
    return Math.max(0.24, Math.min(0.96, lineWidth / denominator));
  });
  return buildUnifiedPreviewSummaryMarkup({
    width,
    height,
    showHeader: showPanel,
    lineCount: layout.lineCount,
    widths: widthRatios,
    align: "left",
  });
}

function resolveRichOverlaySummaryMode({ scale = 1, width = 0, height = 0 } = {}) {
  const normalizedScale = Math.max(0.1, Number(scale) || 1);
  const area = Math.max(1, Number(width || 0) || 0) * Math.max(1, Number(height || 0) || 0);
  if (normalizedScale < RICH_OVERLAY_PREVIEW_MIN_SCALE || area < 2600) {
    return "summary-skeleton";
  }
  return "summary-skeleton";
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

function getMathOverlayStyleSignature({
  left = 0,
  top = 0,
  fontSize = 16,
  paddingX = 0,
  paddingY = 0,
  widthCss = "",
  minHeightCss = "",
  whiteSpace = "normal",
  justifyContent = "center",
} = {}) {
  return [
    Math.round(Number(left || 0) * 100) / 100,
    Math.round(Number(top || 0) * 100) / 100,
    Math.round(Number(fontSize || 0) * 100) / 100,
    Math.round(Number(paddingX || 0) * 100) / 100,
    Math.round(Number(paddingY || 0) * 100) / 100,
    String(widthCss || ""),
    String(minHeightCss || ""),
    String(whiteSpace || "normal"),
    String(justifyContent || "center"),
  ].join("|");
}

function resolveMathOverlaySummaryMode({ scale = 1, width = 0, height = 0, displayMode = false } = {}) {
  const normalizedScale = Math.max(0.1, Number(scale) || 1);
  const safeWidth = Math.max(1, Number(width || 0) || 0);
  const safeHeight = Math.max(1, Number(height || 0) || 0);
  const area = safeWidth * safeHeight;
  if (normalizedScale < MATH_OVERLAY_PREVIEW_MIN_SCALE || area < (displayMode ? 2200 : 1200)) {
    return "summary-skeleton";
  }
  return "summary-skeleton";
}

function buildMathOverlaySummaryMarkup({
  displayMode = false,
  width = 0,
  height = 0,
} = {}) {
  return buildRichOverlaySkeletonMarkup({
    width: Math.max(24, Number(width || 0) || 0),
    height: Math.max(18, Number(height || 0) || 0),
    isFlowNode: false,
    showPanel: displayMode,
  });
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
  if (!item || (item.type !== "text" && item.type !== "mindNode" && item.type !== "mindSummary")) {
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
  const minWidth = item.type === "text" ? 80 : 180;
  const minHeight = item.type === "text" ? 40 : 72;
  const nextWidth =
    layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH
      ? Math.max(minWidth, measuredFrame.width)
      : Math.max(minWidth, Number(item.width || 0) || minWidth);
  const nextHeight = Math.max(minHeight, measuredFrame.height);
  const currentWidth = Math.max(minWidth, Math.ceil(Number(item.width || 0) || minWidth));
  const currentHeight = Math.max(minHeight, Math.ceil(Number(item.height || 0) || minHeight));
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
  if (item.type === "mindNode" || item.type === "mindSummary") {
    Object.assign(item, syncMindNodeTextMetrics(item));
  }
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
  if (!item || (item.type !== "text" && item.type !== "flowNode" && item.type !== "mindNode" && item.type !== "mindSummary")) {
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
  const normalizedHandle = getHandleCursorKey(handle);
  if (typeof handle === "string" && handle.startsWith("round-")) {
    return "grab";
  }
  if (handle === "rotate-shape") {
    return "grab";
  }
  if (normalizedHandle === "nw" || normalizedHandle === "se") {
    return "nwse-resize";
  }
  if (normalizedHandle === "ne" || normalizedHandle === "sw") {
    return "nesw-resize";
  }
  if (normalizedHandle === "n" || normalizedHandle === "s") {
    return "ns-resize";
  }
  if (normalizedHandle === "e" || normalizedHandle === "w") {
    return "ew-resize";
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

function isMindNodeEditingType(value = "") {
  return String(value || "").trim().toLowerCase() === "mind-node";
}

function isExportableItem(item) {
  return item?.type === "fileCard" || item?.type === "image" || item?.type === "text";
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
  state.exportHistory = [];
  state.exportHistoryUpdatedAt = 0;
  state.wordExportPreviewRequest = null;

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

  const exportHistoryManager = createCanvasExportHistoryManager({
    state,
    store,
    normalizeExportHistoryBoardKey,
    normalizeExportHistoryEntry,
    normalizeExportHistoryList,
    readExportHistoryStorage,
    writeExportHistoryStorage,
  });
  const imageStorageManager = createCanvasImageStorageManager({
    state,
    useLocalFileSystem,
    resolveCanvasBoardSavePath,
    resolveCanvasImageSavePath,
    resolveBoardFolderPath,
    joinPath,
    stripTrailingSeparators,
    getFileNameFromPath,
    getFileExtension,
    readImageDimensions,
    resolveImageSource,
    setSaveToast,
    getImageItemById: (itemId) => getImageItemById(itemId),
    renderImageToCanvas,
    safeCanvasToDataUrl,
    takeHistorySnapshot: () => takeHistorySnapshot(state),
    commitHistory,
  });
  const {
    syncExportHistoryForActiveBoard,
    recordExportHistory,
  } = exportHistoryManager;
  const {
    normalizeExportName,
    ensureImportImageFolderExists,
    ensureCanvasImageManagerFolderExists,
    resolveCanvasImageManagerFolder,
    saveImageDataToImportFolder,
    saveImageItemToImportFolder,
    persistImportedImages,
    saveCroppedImageItem,
    listManagedImages,
  } = imageStorageManager;

  syncExportHistoryForActiveBoard({ emit: false });

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

  const getAllowLocalFileAccess = () => state.board?.preferences?.allowLocalFileAccess !== false;
  const getBoardBackgroundPattern = () => normalizeBoardBackgroundPattern(state.board?.preferences?.backgroundPattern);
  const sceneRegistry = createSceneRegistry({
    getSceneIndex: () => getSceneIndexRuntime(),
    getSelectedIds: () => state.board.selectedIds,
  });
  const imageModule = createImageModule();
  const shapeModule = createShapeModule();
  const flowModule = createFlowModule({
    getItemById: (id) => sceneRegistry.getItemById(id),
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
    readClipboardItems: async () => {
      if (navigator.clipboard?.read) {
        return navigator.clipboard.read();
      }
      return [];
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
    downgradeExternalHtmlToCanvasTextSemantics: (html) =>
      downgradeExternalHtmlToCanvasTextSemantics(html, DEFAULT_TEXT_FONT_SIZE),
    hasMarkdownMathText: hasMarkdownMathSyntax,
    htmlContainsRenderableMath,
    convertPlainTextToSemanticHtml: (text) =>
      convertPlainClipboardTextToSemanticHtmlAsync(text, DEFAULT_TEXT_FONT_SIZE),
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
    fixedOverlayHost: null,
    canvasLinkBindingOverlay: null,
    canvasLinkBindingHint: null,
    richExternalLinkPanel: null,
    canvas: null,
    ctx: null,
    editor: null,
    richEditor: null,
    richToolbar: null,
    richSelectionToolbar: null,
    richDisplayHost: null,
    codeBlockDisplayHost: null,
    mathDisplayHost: null,
    codeBlockEditor: null,
    codeBlockToolbar: null,
    imageToolbar: null,
    fileMemoEditor: null,
    imageMemoEditor: null,
    tableEditor: null,
    tableCellRichEditor: null,
    tableToolbar: null,
    mindNodeLinkPanel: null,
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
  let renderScheduler = null;
  let lastContextMenuPoint = null;
  let lastContextMenuTargetId = null;
  let lastContextMenuSource = "canvas";
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
  let deferredStoreEmitHandle = 0;
  let cancelDeferredStoreEmit = null;
  let deferredStoreEmitPending = false;
  const urlMetaHydrationTasks = new Map();
  const queuedUrlMetaHydrationTasks = new Map();
  const fileCardIdHydrationInFlight = new Set();
  const fileCardSourceHydrationInFlight = new Set();
  const pendingHydrationSyncItemIds = new Set();
  let pendingHydrationSyncSceneChange = false;
  let pendingHydrationSyncReason = "";
  let cancelPendingHydrationSync = null;
  const deferredTextSemanticUpgradeTasks = new Map();
  let clipboardProcessingStatusToken = 0;
  let deferredImportedAssetPersistPromise = Promise.resolve();
  let linkSemanticEnabled = true;
  let lastEditorItemId = null;
  let lastFileMemoItemId = null;
  let lastImageMemoItemId = null;
  let lastTableEditItemId = null;
  let lastCodeBlockEditItemId = null;
  const codeBlockCopyFeedbackTimers = new Map();
  let codeBlockEditorLayoutFrame = 0;
  let codeBlockEditorPreciseLayoutTimer = 0;
  let pendingCodeBlockEditorLayoutMode = "precise";
let tableEditSelection = { rowIndex: 0, columnIndex: 0 };
let tableEditRange = null;
let tableEditFrame = null;
let tableEditSelectionMode = "cell";
let tableCellEditState = {
  active: false,
  rowIndex: 0,
  columnIndex: 0,
};
let tableInteractionUiState = {
  pointerInsideEditor: false,
  pointerInsideToolbar: false,
  hoveredCell: null,
};
  let tableStructureDragState = {
    kind: "",
  pointerId: null,
  active: false,
  anchorIndex: -1,
  targetIndex: -1,
  startPrimary: 0,
  startSecondary: 0,
  startRow: 0,
  endRow: 0,
  startColumn: 0,
    endColumn: 0,
  };
  let mindNodeChromePointerInside = false;
  const MIND_MAP_REPARENT_HIT_PAD = 26;
let tablePointerSelectionState = {
  pointerId: null,
  anchor: null,
  pendingCell: null,
  multiSelectActive: false,
  nativeTextSelection: false,
  draggingRange: false,
};
  let flowDraft = null;
  let relationshipDraft = null;
  let pendingMindRelationshipSourceId = "";
  const richDisplayMap = new Map();
  const codeBlockDisplayMap = new Map();
  const codeBlockOverlayDirtyIds = new Set();
  const codeBlockVisibleIds = new Set();
  const codeBlockItemsById = new Map();
  const codeBlockEditLayoutCache = new Map();
  const mathDisplayMap = new Map();
  const richOverlayVirtualizer = createOverlayVirtualizer({ nodeMap: richDisplayMap });
  const mathOverlayVirtualizer = createOverlayVirtualizer({ nodeMap: mathDisplayMap });
  const codeBlockOverlayVirtualizer = createOverlayVirtualizer({
    nodeMap: codeBlockDisplayMap,
    visibleIds: codeBlockVisibleIds,
  });
  let fileCardPreviewSurfaceHost = null;
  let fileCardPreviewSurfaceRoot = null;
  let fileCardPreviewSurfaceStyleRoot = null;
  let fileCardPreviewSurfaceContentRoot = null;
  let fileCardPreviewWheelCleanup = null;
  let fileCardPreviewRenderToken = 0;
  let fileCardPreviewDeferredHydrationTimer = 0;
  let fileCardPreviewVisibilityRetryTimer = 0;
  let fileCardPreviewDocxModulePromise = null;
  const FILE_CARD_PREVIEW_MIN_SCALE = 0.34;
  const FILE_CARD_PREVIEW_MAX_SCALE = 1.9;
  const nonEditingSceneEventBridge = createSceneEventBridge({
    resolveScenePoint: (event) => toScenePoint(Number(event?.clientX || 0), Number(event?.clientY || 0)),
    resolveTarget: (scenePoint) => hitTestCanvasElement(scenePoint, state.board.view.scale),
  });
  const richDisplayEventBridge = createStaticDisplayEventBridge({
    itemSelector: ".canvas2d-rich-item[data-id]",
    resolveItemById: (itemId) =>
      sceneRegistry.getItemById(itemId, "text") ||
      sceneRegistry.getItemById(itemId, "flowNode") ||
      sceneRegistry.getItemById(itemId, "mindNode") ||
      sceneRegistry.getItemById(itemId, "mindSummary") ||
      null,
    selectItem: ({ itemId, reason }) => {
      if (reason === "contextmenu" && shouldPreserveMultiSelectionForContextTarget(itemId)) {
        state.lastSelectionSource = state.lastSelectionSource || "marquee";
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
        return;
      }
      state.board.selectedIds = [itemId];
      state.lastSelectionSource = null;
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    },
    hideContextMenu: () => hideContextMenu(),
    onPointerDownForward: (event) => onPointerDown(event),
    onContextMenuForward: (event) => onContextMenu(event),
    onDoubleClickItem: (_event, context) => {
      if (context.item?.type === "text") {
        beginTextEdit(context.itemId);
        return;
      }
      if (context.item?.type === "flowNode") {
        beginFlowNodeEdit(context.itemId);
        return;
      }
      if (context.item?.type === "mindNode" || context.item?.type === "mindSummary") {
        beginMindNodeEdit(context.itemId);
      }
    },
    onClickItem: (_event, context) => {
      state.board.selectedIds = [context.itemId];
      state.lastSelectionSource = null;
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    },
    stopDoubleClickPropagation: true,
  });
  const codeBlockDisplayEventBridge = createStaticDisplayEventBridge({
    itemSelector: ".canvas2d-code-block-item",
    actionSelector: "[data-action]",
    resolveItemById: (itemId) => sceneRegistry.getItemById(itemId, "codeBlock") || null,
    selectItem: ({ itemId, reason }) => {
      if (reason === "contextmenu" && shouldPreserveMultiSelectionForContextTarget(itemId)) {
        state.lastSelectionSource = state.lastSelectionSource || "marquee";
        markCodeBlockOverlayDirty(itemId);
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
        return;
      }
      state.board.selectedIds = [itemId];
      if (reason === "contextmenu") {
        state.lastSelectionSource = null;
      }
      markCodeBlockOverlayDirty(itemId);
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    },
    hideContextMenu: () => hideContextMenu(),
    onPointerDownForward: (event) => onPointerDown(event),
    onContextMenuForward: (event) => onContextMenu(event),
    onDoubleClickItem: (_event, context) => {
      beginCodeBlockEdit(context.itemId);
    },
    onClickItem: (_event, context) => {
      state.board.selectedIds = [context.itemId];
      markCodeBlockOverlayDirty(context.itemId);
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    },
  });
  let codeBlockOverlayNeedsFullRescan = true;
  let lastCodeBlockOverlayViewportKey = "";
  let lastCodeBlockOverlayHoverId = "";
  let lastCodeBlockOverlaySelectionKey = "";
  let lastCodeBlockOverlayEditingId = "";
  let lastCodeBlockOverlayInteractive = true;
  let pendingSceneIndexInvalidation = false;
  let pendingHitTestInvalidation = false;
  let pointerOverCanvas = false;
  let editBaselineSnapshot = null;
  let deferredBlankEditExit = null;
  let deferredBlankEditExitFrame = 0;
  let blockedCanvasPointerDown = null;
  linkSemanticEnabled = readLinkSemanticEnabled();
  const richTextSession = createRichTextEditingSession({
    editorElement: refs.richEditor,
    onSelectionChange: () => syncRichTextToolbar(),
    onRequestCommit: () => commitRichEdit(),
    onRequestCancel: () => cancelRichEdit(),
    onRequestExternalLink: () => runRichLinkCommand(),
  });
  const tableCellRichTextSession = createRichTextEditingSession({
    editorElement: refs.tableCellRichEditor,
    onSelectionChange: () => syncRichTextToolbar(),
    onRequestCommit: () => commitActiveTableCellRichEdit(),
    onRequestCancel: () => cancelActiveTableCellRichEdit(),
    onRequestExternalLink: () => runRichLinkCommand(),
  });
  let richFontSize = DEFAULT_TEXT_FONT_SIZE;
  let richToolbarColorSlots = RICH_TOOLBAR_DEFAULT_COLOR_SLOTS.slice();
  let richToolbarPresetColors = RICH_TOOLBAR_DEFAULT_PRESET_COLORS.slice();
  let pendingRichColorPreview = "";
  let richColorPreviewFrame = 0;
  let richColorPreviewCommitTimer = 0;
  let richEditorComposing = false;
  let shouldExitTextToolAfterEdit = false;
  let pendingCanvasLinkBinding = false;
  let activeMindNodeLinkHoverId = "";
  let mindNodeLinkPanelPinnedNodeId = "";
  let activeMindNodeLinkMenuTargetId = "";
  let mindNodeLinkMenuCloseTimer = 0;
  let pendingRichExternalLinkEdit = null;
  function clearCodeBlockEditLayoutCache(itemId = "") {
    if (!itemId) {
      codeBlockEditLayoutCache.clear();
      return;
    }
    codeBlockEditLayoutCache.delete(String(itemId || ""));
  }

  function getCodeBlockLayoutCacheKey(item = {}) {
    return String(item?.id || "");
  }

  function readCodeBlockEditLayoutCache(item = {}, draftCode = "", widthHint = 0) {
    const key = getCodeBlockLayoutCacheKey(item);
    if (!key || !codeBlockEditLayoutCache.has(key)) {
      return null;
    }
    const cached = codeBlockEditLayoutCache.get(key) || null;
    if (!cached) {
      return null;
    }
    const nextWidthHint = Math.max(1, Number(widthHint || item?.width || 0) || 1);
    const nextSignature = [
      nextWidthHint,
      Math.max(12, Number(item?.fontSize || 16)),
      item?.wrap === true ? 1 : 0,
      item?.showLineNumbers === false ? 0 : 1,
      item?.headerVisible === false ? 0 : 1,
      item?.collapsed === true ? 1 : 0,
      Math.max(2, Math.min(8, Number(item?.tabSize || 2) || 2)),
      String(item?.language || "").trim().toLowerCase(),
      String(item?.previewMode || "preview").trim().toLowerCase() || "preview",
      String(draftCode || ""),
    ].join("|");
    if (cached.signature !== nextSignature) {
      return null;
    }
    return cached;
  }

  function writeCodeBlockEditLayoutCache(item = {}, draftCode = "", widthHint = 0, layout = null, mode = "precise") {
    const key = getCodeBlockLayoutCacheKey(item);
    if (!key || !layout) {
      return;
    }
    const nextWidthHint = Math.max(1, Number(widthHint || item?.width || 0) || 1);
    const signature = [
      nextWidthHint,
      Math.max(12, Number(item?.fontSize || 16)),
      item?.wrap === true ? 1 : 0,
      item?.showLineNumbers === false ? 0 : 1,
      item?.headerVisible === false ? 0 : 1,
      item?.collapsed === true ? 1 : 0,
      Math.max(2, Math.min(8, Number(item?.tabSize || 2) || 2)),
      String(item?.language || "").trim().toLowerCase(),
      String(item?.previewMode || "preview").trim().toLowerCase() || "preview",
      String(draftCode || ""),
    ].join("|");
    const previous = codeBlockEditLayoutCache.get(key) || {};
    codeBlockEditLayoutCache.set(key, {
      ...previous,
      signature,
      code: String(draftCode || ""),
      widthHint: nextWidthHint,
      updatedAt: Date.now(),
      fastLayout: mode === "fast" ? layout : previous.fastLayout || layout,
      preciseLayout: mode === "precise" ? layout : previous.preciseLayout || null,
    });
  }

  function buildFastCodeBlockLayout(item = {}, draftCode = "", options = {}) {
    const widthHint = Math.max(1, Number(options.widthHint || item.width || 0) || 1);
    const cached = readCodeBlockEditLayoutCache(item, draftCode, widthHint);
    if (cached?.preciseLayout) {
      return {
        ...cached.preciseLayout,
        layoutMode: "fast",
      };
    }
    const code = sanitizeText(draftCode || "");
    const rawLineCount = Math.max(1, code ? code.split("\n").length : 1);
    const fontSize = Math.max(12, Number(item.fontSize || 16) || 16);
    const lineHeight = Math.max(18, Math.round(fontSize * 1.55));
    const headerHeight = item.headerVisible === false ? 0 : Math.max(34, Math.round(fontSize * 2.1));
    const bodyPaddingX = Math.max(12, Math.round(fontSize * 0.95));
    const bodyPaddingY = Math.max(10, Math.round(fontSize * 0.72));
    const lineNumberDigits = Math.max(2, String(rawLineCount).length);
    const gutterWidth = item.showLineNumbers === false ? 0 : Math.round(fontSize * 0.72 * (lineNumberDigits + 1.8));
    const charWidth = Math.max(7, fontSize * 0.61);
    const metrics = cached?.fastLayout?.metrics || {
      fontSize,
      lineHeight,
      headerHeight,
      bodyPaddingX,
      bodyPaddingY,
      gutterWidth,
      charWidth,
    };
    const contentWidth = Math.max(48, widthHint - metrics.bodyPaddingX * 2 - metrics.gutterWidth);
    const wrapCharsPerLine = Math.max(1, Math.floor(contentWidth / Math.max(metrics.charWidth, 1)));
    const approxVisualLineCount = item.wrap === true
      ? Math.max(rawLineCount, Math.ceil(Math.max(code.length, rawLineCount) / Math.max(wrapCharsPerLine, 1)))
      : rawLineCount;
    const bodyLineCount = item.collapsed === true ? 0 : approxVisualLineCount;
    const bodyHeight = item.collapsed === true
      ? 0
      : Math.max(metrics.lineHeight * Math.max(1, bodyLineCount), metrics.lineHeight);
    const bodyInnerHeight = item.collapsed === true ? 0 : bodyHeight + metrics.bodyPaddingY * 2;
    const layout = {
      width: Math.max(1, widthHint),
      height: Math.max(84, Math.round(metrics.headerHeight + bodyInnerHeight)),
      estimatedWidth: cached?.preciseLayout?.estimatedWidth || Math.max(220, widthHint),
      metrics,
      code,
      rawLineCount,
      visualLineCount: approxVisualLineCount,
      contentWidth,
      wrapCharsPerLine,
      layoutMode: "fast",
    };
    writeCodeBlockEditLayoutCache(item, code, widthHint, layout, "fast");
    return layout;
  }

  function measureCodeBlockEditorLayout(item = {}, draftCode = "", options = {}) {
    const widthHint = Math.max(1, Number(options.widthHint || item.width || 0) || 1);
    if (options.mode === "fast") {
      return buildFastCodeBlockLayout(item, draftCode, { widthHint });
    }
    const cached = readCodeBlockEditLayoutCache(item, draftCode, widthHint);
    if (cached?.preciseLayout) {
      return {
        ...cached.preciseLayout,
        layoutMode: "precise",
      };
    }
    const preciseLayout = measureCodeBlockLayout(
      {
        ...item,
        code: draftCode,
        text: draftCode,
        plainText: draftCode,
      },
      {
        widthHint,
      }
    );
    const layout = {
      ...preciseLayout,
      layoutMode: "precise",
    };
    writeCodeBlockEditLayoutCache(item, draftCode, widthHint, layout, "precise");
    return layout;
  }

  function scheduleCodeBlockEditorLayoutSync(mode = "fast") {
    if (mode === "precise") {
      pendingCodeBlockEditorLayoutMode = "precise";
      if (codeBlockEditorPreciseLayoutTimer) {
        clearTimeout(codeBlockEditorPreciseLayoutTimer);
      }
      codeBlockEditorPreciseLayoutTimer = setTimeout(() => {
        codeBlockEditorPreciseLayoutTimer = 0;
        if (state.editingType !== "code-block" || !state.editingId) {
          return;
        }
        syncCodeBlockEditorLayout("precise");
      }, 96);
      return;
    }
    pendingCodeBlockEditorLayoutMode = pendingCodeBlockEditorLayoutMode === "precise" ? "precise" : "fast";
    if (codeBlockEditorLayoutFrame) {
      return;
    }
    codeBlockEditorLayoutFrame = requestAnimationFrame(() => {
      const nextMode = pendingCodeBlockEditorLayoutMode;
      pendingCodeBlockEditorLayoutMode = "fast";
      codeBlockEditorLayoutFrame = 0;
      syncCodeBlockEditorLayout(nextMode);
    });
  }

  function cancelCodeBlockEditorLayoutSync() {
    if (!codeBlockEditorLayoutFrame) {
      pendingCodeBlockEditorLayoutMode = "fast";
    } else {
      cancelAnimationFrame(codeBlockEditorLayoutFrame);
      codeBlockEditorLayoutFrame = 0;
    }
    if (codeBlockEditorPreciseLayoutTimer) {
      clearTimeout(codeBlockEditorPreciseLayoutTimer);
      codeBlockEditorPreciseLayoutTimer = 0;
    }
  }

  function markCodeBlockOverlayDirty(itemIds = [], { fullRescan = false } = {}) {
    if (fullRescan) {
      codeBlockOverlayNeedsFullRescan = true;
    }
    const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
    ids.forEach((itemId) => {
      const normalizedId = String(itemId || "");
      if (normalizedId) {
        codeBlockOverlayDirtyIds.add(normalizedId);
      }
    });
  }

  function resetCodeBlockOverlayState({ clearNodes = false } = {}) {
    codeBlockOverlayDirtyIds.clear();
    codeBlockVisibleIds.clear();
    codeBlockItemsById.clear();
    codeBlockOverlayNeedsFullRescan = true;
    lastCodeBlockOverlayViewportKey = "";
    lastCodeBlockOverlayHoverId = "";
    lastCodeBlockOverlaySelectionKey = "";
    lastCodeBlockOverlayEditingId = "";
    lastCodeBlockOverlayInteractive = isInteractiveMode();
    if (clearNodes) {
      codeBlockOverlayVirtualizer.clear({ removeNodes: true });
    }
  }

  function getCodeBlockOverlayViewportKey(viewportBounds, scale) {
    return [
      Math.round(scale * 100),
      Math.round(Number(state.board.view.offsetX || 0) / 12),
      Math.round(Number(state.board.view.offsetY || 0) / 12),
      Math.round(Number(viewportBounds.left || 0) / 24),
      Math.round(Number(viewportBounds.top || 0) / 24),
      Math.round(Number(viewportBounds.right || 0) / 24),
      Math.round(Number(viewportBounds.bottom || 0) / 24),
    ].join("|");
  }

  function getSelectedCodeBlockIds() {
    return state.board.selectedIds.filter((itemId) => {
      const item = codeBlockItemsById.get(itemId);
      return item?.type === "codeBlock";
    });
  }

  function syncCodeBlockOverlayNode(item, viewportBounds, scale, offsetX, offsetY) {
    const itemId = String(item?.id || "");
    if (!itemId) {
      return;
    }
    const left = Number(item.x || 0) * scale + offsetX;
    const top = Number(item.y || 0) * scale + offsetY;
    const width = Math.max(1, Number(item.width || 1)) * scale;
    const height = Math.max(1, Number(item.height || 1)) * scale;
    const isVisible = hasScreenRectIntersection({ left, top, right: left + width, bottom: top + height }, viewportBounds);
    const isEditing = state.editingId === item.id && state.editingType === "code-block";
    const syntaxHighlighting = isDetailedOverlayScale(scale, CODE_BLOCK_OVERLAY_SYNTAX_MIN_SCALE);
    const showLineNumbers = isDetailedOverlayScale(scale, CODE_BLOCK_OVERLAY_LINE_NUMBERS_MIN_SCALE);
    const showHeader = isDetailedOverlayScale(scale, CODE_BLOCK_OVERLAY_HEADER_MIN_SCALE);
    const summaryMode = !isDetailedOverlayScale(scale, CODE_BLOCK_OVERLAY_SUMMARY_MIN_SCALE);
    if (!isVisible) {
      codeBlockOverlayVirtualizer.hideNode(item.id);
      return;
    }
    const node = codeBlockOverlayVirtualizer.ensureNode(item.id, () => {
      const nextNode = document.createElement("div");
      refs.codeBlockDisplayHost.appendChild(nextNode);
      return nextNode;
    });
    if (!node) {
      return;
    }
    codeBlockOverlayVirtualizer.showNode(item.id);
    node.style.pointerEvents = isEditing ? "none" : "auto";
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
    node.style.width = `${Math.round(width)}px`;
    node.style.height = `${Math.round(height)}px`;
    const contentSignature = [
      Number(item.updatedAt || 0),
      String(item.language || "").trim().toLowerCase(),
      item.wrap ? 1 : 0,
      item.showLineNumbers === false ? 0 : 1,
      item.headerVisible === false ? 0 : 1,
      item.collapsed ? 1 : 0,
      Number(item.fontSize || 16),
      String(item.previewMode || "preview"),
    ].join("|");
    const renderSignature = [
      Math.round(scale * 1000),
      summaryMode ? 1 : 0,
      syntaxHighlighting ? 1 : 0,
      showLineNumbers ? 1 : 0,
      showHeader ? 1 : 0,
      state.hoverId === item.id ? 1 : 0,
      state.board.selectedIds.includes(item.id) ? 1 : 0,
      item.locked === true ? 1 : 0,
      isEditing ? 1 : 0,
    ].join("|");
    if (node.dataset.renderContentSignature !== contentSignature || node.dataset.renderSignature !== renderSignature) {
      renderCodeBlockStatic(node, item, {
        scale,
        hover: state.hoverId === item.id,
        selected: state.board.selectedIds.includes(item.id),
        editing: isEditing,
        summaryMode,
        syntaxHighlighting,
        showLineNumbers,
        showHeader,
      });
      node.dataset.renderContentSignature = contentSignature;
      node.dataset.renderSignature = renderSignature;
    }
    node.style.pointerEvents = isEditing ? "none" : "auto";
    node.style.opacity = isEditing ? "0.82" : "1";
  }

  const codeBlockEditor = createCodeBlockEditor(null, {
    onChange: () => {
      scheduleCodeBlockEditorLayoutSync("fast");
      scheduleCodeBlockEditorLayoutSync("precise");
      syncCodeBlockToolbar();
    },
    onBlur: () => {
      if (state.editingType === "code-block") {
        commitCodeBlockEdit();
      }
    },
  });
  const onHintLogoLoaded = () => scheduleRender();
  const lightImageEditor = createLightImageEditor({
    getImageItemById: (id) => sceneRegistry.getItemById(id, "image"),
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
    getInternalPayload: async () => ((await shouldUseInternalClipboard()) ? clipboardBroker.getPayload() : null),
  });
  const exportAssetAdapter = createHostExportAssetAdapter({
    allowLocalFileAccess: () => getAllowLocalFileAccess(),
    readFileBase64: (sourcePath) =>
      typeof globalThis?.desktopShell?.readFileBase64 === "function"
        ? globalThis.desktopShell.readFileBase64(sourcePath)
        : null,
  });
  const exportFileAdapter = createHostExportFileAdapter({
    useLocalFileSystem: () => useLocalFileSystem,
    saveImageDataToImportFolder,
    setSaveToast,
  });
  const structuredExportRuntime = createStructuredExportRuntime({
    renderer,
    getElementBounds,
    getFlowEdgeBounds,
    allowLocalFileAccess: () => getAllowLocalFileAccess(),
    assetAdapter: exportAssetAdapter,
    fileAdapter: exportFileAdapter,
    resolveDefaultFileName: () => getFileBaseName(state.boardFileName || state.boardFilePath || "freeflow-board"),
  });

  function isInteractiveMode() {
    return state.mode === "canvas2d" && getCanvasOfficeEngineMode() === "canvas2d";
  }

  let sceneRevision = 1;

  function flushDeferredStoreEmit() {
    deferredStoreEmitPending = false;
    if (typeof cancelDeferredStoreEmit === "function") {
      cancelDeferredStoreEmit();
    }
    cancelDeferredStoreEmit = null;
    deferredStoreEmitHandle = 0;
    store.emit();
  }

  function scheduleDeferredStoreEmit() {
    deferredStoreEmitPending = true;
    if (deferredStoreEmitHandle || typeof cancelDeferredStoreEmit === "function") {
      return;
    }
    cancelDeferredStoreEmit = scheduleAnimationFrameTask(() => {
      flushDeferredStoreEmit();
    });
    deferredStoreEmitHandle = 1;
  }

  function flushPendingSceneGraphInvalidation() {
    if (pendingSceneIndexInvalidation) {
      invalidateSceneIndex(state.board.items);
      pendingSceneIndexInvalidation = false;
    }
    if (pendingHitTestInvalidation) {
      invalidateHitTestSpatialIndex(state.board.items);
      pendingHitTestInvalidation = false;
    }
  }

  function markSceneGraphDirty({ hitTest = true } = {}) {
    sceneRevision += 1;
    pendingSceneIndexInvalidation = true;
    if (hitTest) {
      pendingHitTestInvalidation = true;
    }
  }

  function markHitTestDirty() {
    pendingHitTestInvalidation = true;
  }

  function getSceneIndexRuntime(options = {}) {
    flushPendingSceneGraphInvalidation();
    return resolveSceneIndex(state.board.items, {
      revision: sceneRevision,
      forceRebuild: Boolean(options.forceRebuild),
    });
  }

  function hitTestCanvasElement(point, scale = 1) {
    flushPendingSceneGraphInvalidation();
    return hitTestElement(state.board.items, point, scale);
  }

  function getMindRelationshipItems() {
    return state.board.items.filter(isMindRelationshipItem);
  }

  function getMindRelationshipById(itemId = "") {
    const normalizedId = String(itemId || "").trim();
    if (!normalizedId) {
      return null;
    }
    return getMindRelationshipItems().find((item) => String(item.id || "") === normalizedId) || null;
  }

  function clearMindRelationshipDraft() {
    pendingMindRelationshipSourceId = "";
    relationshipDraft = null;
  }

  function getMindRelationshipSourceItem() {
    if (!pendingMindRelationshipSourceId) {
      return null;
    }
    const item = sceneRegistry.getItemById(pendingMindRelationshipSourceId) || null;
    return isMindRelationshipSourceEligible(item) ? item : null;
  }

  function isMindRelationshipSourceEligible(item = null) {
    return Boolean(
      item &&
        [
          "text",
          "fileCard",
          "image",
          "codeBlock",
          "table",
          "mathBlock",
          "mathInline",
          "shape",
        ].includes(String(item.type || ""))
    );
  }

  function isMindRelationshipTargetEligible(item = null) {
    return Boolean(item && (item.type === "mindNode" || item.type === "text"));
  }

  function getMindRelationshipDeleteHitId(scenePoint) {
    const relationships = getMindRelationshipItems();
    if (!relationships.length) {
      return "";
    }
    const itemById = new Map((Array.isArray(state.board.items) ? state.board.items : []).map((item) => [String(item?.id || ""), item]));
    const tolerance = Math.max(10, 12 / Math.max(0.1, Number(state.board.view.scale || 1)));
    for (let index = relationships.length - 1; index >= 0; index -= 1) {
      const relationship = relationships[index];
      const geometry = getMindRelationshipGeometry(relationship, itemById);
      if (!geometry?.midpoint) {
        continue;
      }
      const distance = Math.hypot(
        Number(scenePoint?.x || 0) - Number(geometry.midpoint.x || 0),
        Number(scenePoint?.y || 0) - Number(geometry.midpoint.y || 0)
      );
      if (distance <= tolerance) {
        return String(relationship.id || "");
      }
    }
    return "";
  }

  function beginMindRelationshipConnection() {
    if (state.board.selectedIds.length !== 1) {
      return false;
    }
    const item = getSingleSelectedItemFast();
    if (!isMindRelationshipSourceEligible(item)) {
      setStatus("当前元素暂不支持连接节点");
      return false;
    }
    if (isLockedItem(item)) {
      setStatus("元素已锁定，无法连接节点");
      return false;
    }
    pendingMindRelationshipSourceId = String(item.id || "");
    const bounds = getElementBounds(item);
    relationshipDraft = {
      fromId: item.id,
      toId: "",
      fromPoint: {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      },
      toPoint: {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      },
    };
    hideContextMenu();
    setStatus("正在连接节点，点击节点或富文本完成");
    scheduleRender();
    return true;
  }

  function updateMindRelationshipDraft(scenePoint) {
    if (!pendingMindRelationshipSourceId) {
      relationshipDraft = null;
      return false;
    }
    const source = getMindRelationshipSourceItem();
    if (!source) {
      clearMindRelationshipDraft();
      return false;
    }
    const bounds = getElementBounds(source);
    const hit = hitTestCanvasElement(scenePoint, state.board.view.scale);
    const targetNode = isMindRelationshipTargetEligible(hit) ? hit : null;
    const targetBounds = targetNode ? getElementBounds(targetNode) : null;
    const nextToPoint = targetBounds
      ? {
          x: targetBounds.left + targetBounds.width / 2,
          y: targetBounds.top + targetBounds.height / 2,
        }
      : scenePoint;
    const previous = relationshipDraft;
    const unchanged =
      previous &&
      String(previous.fromId || "") === String(source.id || "") &&
      String(previous.toId || "") === String(targetNode?.id || "") &&
      Math.round(Number(previous.toPoint?.x || 0) * 10) === Math.round(Number(nextToPoint.x || 0) * 10) &&
      Math.round(Number(previous.toPoint?.y || 0) * 10) === Math.round(Number(nextToPoint.y || 0) * 10);
    if (unchanged) {
      return false;
    }
    relationshipDraft = {
      fromId: source.id,
      toId: targetNode?.id || "",
      fromPoint: {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      },
      toPoint: nextToPoint,
    };
    return true;
  }

  function createMindRelationship(sourceId, targetId) {
    const normalizedSourceId = String(sourceId || "").trim();
    const normalizedTargetId = String(targetId || "").trim();
    if (!normalizedSourceId || !normalizedTargetId || normalizedSourceId === normalizedTargetId) {
      return false;
    }
    const exists = state.board.items.some(
      (item) =>
        isMindRelationshipItem(item) &&
        String(item.fromId || "") === normalizedSourceId &&
        String(item.toId || "") === normalizedTargetId
    );
    if (exists) {
      setStatus("该关系线已存在");
      return false;
    }
    const before = takeHistorySnapshot(state);
    const relationship = createMindRelationshipElement(normalizedSourceId, normalizedTargetId);
    state.board.items.unshift(relationship);
    state.board.selectedIds = [relationship.id];
    markSceneGraphDirty({ hitTest: true });
    commitHistory(before, "创建关系线");
    setStatus("已连接节点");
    return true;
  }

  function addMindRelationship(sourceId, targetId) {
    const source = sceneRegistry.getItemById(String(sourceId || "").trim()) || null;
    const target = sceneRegistry.getItemById(String(targetId || "").trim()) || null;
    if (!isMindRelationshipSourceEligible(source)) {
      return false;
    }
    if (!isMindRelationshipTargetEligible(target)) {
      return false;
    }
    if (isLockedItem(source) || isLockedItem(target)) {
      return false;
    }
    return createMindRelationship(source.id, target.id);
  }

  function removeMindRelationship(relationshipId = "") {
    const normalizedId = String(relationshipId || "").trim();
    if (!normalizedId) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    const nextItems = state.board.items.filter(
      (item) => !(isMindRelationshipItem(item) && String(item.id || "") === normalizedId)
    );
    if (nextItems.length === state.board.items.length) {
      return false;
    }
    state.board.items = nextItems;
    state.board.selectedIds = state.board.selectedIds.filter((id) => String(id || "") !== normalizedId);
    markSceneGraphDirty({ hitTest: true });
    commitHistory(before, "删除关系线");
    setStatus("已删除关系线");
    return true;
  }

  function getViewportPixelSize() {
    return {
      width: Math.max(1, Number(refs.canvas?.clientWidth || refs.canvas?.width || refs.surface?.clientWidth || 0) || 1),
      height: Math.max(1, Number(refs.canvas?.clientHeight || refs.canvas?.height || refs.surface?.clientHeight || 0) || 1),
    };
  }

  function queryVisibleItemsByTypes(types = [], options = {}) {
    const viewport = getViewportPixelSize();
    const sceneIndex = getSceneIndexRuntime(options);
    return queryVisibleSceneItems(sceneIndex, state.board.view, viewport.width, viewport.height, {
      marginPx: Number(options.marginPx ?? 220) || 220,
      types,
      excludeIds: Array.isArray(options.excludeIds) ? options.excludeIds : [],
    });
  }

  function buildVisibleSceneRecordBuckets(records = []) {
    const buckets = new Map();
    (Array.isArray(records) ? records : []).forEach((record) => {
      const itemType = String(record?.itemType || record?.item?.type || "").trim();
      if (!itemType) {
        return;
      }
      const bucket = buckets.get(itemType) || [];
      bucket.push(record);
      buckets.set(itemType, bucket);
    });
    return buckets;
  }

  function getVisibleSceneRecordsByTypes(visibleScene = null, types = [], options = {}) {
    const targetTypes = Array.from(
      new Set((Array.isArray(types) ? types : []).map((type) => String(type || "").trim()).filter(Boolean))
    );
    if (!targetTypes.length) {
      return [];
    }
    if (visibleScene?.recordsByType instanceof Map) {
      return targetTypes.flatMap((type) => visibleScene.recordsByType.get(type) || []);
    }
    return queryVisibleItemsByTypes(targetTypes, options).records;
  }

  function getItemByIdFast(itemId = "", expectedType = "") {
    return sceneRegistry.getItemById(itemId, expectedType);
  }

  function getHoverItemFast(expectedType = "") {
    return sceneRegistry.getItemById(state.hoverId, expectedType);
  }

  function getSelectedItemsFast(expectedType = "") {
    return sceneRegistry.getSelectedItems(expectedType);
  }

  function getSingleSelectedItemFast(expectedType = "") {
    return sceneRegistry.getSingleSelectedItem(expectedType);
  }

  function shouldPreserveMultiSelectionForContextTarget(itemId = "") {
    const normalizedId = String(itemId || "").trim();
    return Boolean(
      normalizedId &&
      state.board.selectedIds.length >= 2 &&
      state.board.selectedIds.map((id) => String(id || "").trim()).includes(normalizedId)
    );
  }

  function getSelectedItemsBounds() {
    const selectedItems = getSelectedItemsFast();
    return getMultiSelectionBounds(selectedItems);
  }

  function createMultiSelectionPointerBase(items = []) {
    const selectedItems = Array.isArray(items) ? items : [];
    const bounds = getMultiSelectionBounds(selectedItems);
    return {
      bounds,
      items: new Map(selectedItems.map((item) => [item.id, clonePointerBase(item)])),
    };
  }

  function constrainMultiSelectionBoundsToWidthOnly(baseBounds, nextBounds, handle) {
    if (!baseBounds || !nextBounds) {
      return nextBounds;
    }
    const normalizedHandle = String(handle || "").trim().toLowerCase();
    const fixedLeft = Number(baseBounds.left || 0);
    const fixedRight = Number(baseBounds.right ?? (fixedLeft + Number(baseBounds.width || 0)));
    const fixedTop = Number(baseBounds.top || 0);
    const fixedHeight = Math.max(1, Number(baseBounds.height || (baseBounds.bottom - baseBounds.top) || 1));
    const fixedBottom = fixedTop + fixedHeight;
    let left = Number(nextBounds.left || fixedLeft);
    let right = Number(nextBounds.right ?? (left + Number(nextBounds.width || 0)));

    if (normalizedHandle === "multi-n" || normalizedHandle === "multi-s") {
      left = fixedLeft;
      right = fixedRight;
    }

    return {
      left: Math.min(left, right),
      right: Math.max(left, right),
      top: fixedTop,
      bottom: fixedBottom,
      width: Math.max(1, Math.abs(right - left)),
      height: fixedHeight,
    };
  }

  function applyMultiSelectionResize(baseSelection, nextBounds) {
    const baseBounds = baseSelection?.bounds || null;
    const baseItemsMap = baseSelection?.items instanceof Map ? baseSelection.items : new Map();
    if (!baseBounds || !nextBounds || !baseItemsMap.size) {
      return false;
    }
    const safeBaseWidth = Math.max(1, Number(baseBounds.width || (baseBounds.right - baseBounds.left) || 1));
    const safeBaseHeight = Math.max(1, Number(baseBounds.height || (baseBounds.bottom - baseBounds.top) || 1));
    const nextWidth = Math.max(1, Number(nextBounds.width || (nextBounds.right - nextBounds.left) || 1));
    const updatedItems = new Map();

    for (const [itemId, baseItem] of baseItemsMap.entries()) {
      if (!baseItem || baseItem.type === "flowEdge" || isLockedItem(baseItem)) {
        continue;
      }
      const itemBounds = getElementBounds(baseItem);
      const relLeft = (itemBounds.left - baseBounds.left) / safeBaseWidth;
      const relTop = (itemBounds.top - baseBounds.top) / safeBaseHeight;
      const relRight = (itemBounds.right - baseBounds.left) / safeBaseWidth;
      const relBottom = (itemBounds.bottom - baseBounds.top) / safeBaseHeight;
      let left = nextBounds.left + relLeft * nextWidth;
      let top = baseBounds.top + relTop * safeBaseHeight;
      let right = nextBounds.left + relRight * nextWidth;
      let bottom = baseBounds.top + relBottom * safeBaseHeight;
      let width = Math.max(1, right - left);
      let height = Math.max(1, bottom - top);

      if (baseItem.type === "text") {
        const minSize = getTextMinSize(
          {
            ...baseItem,
            x: left,
            y: top,
            width,
            height,
            textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
            textResizeMode: TEXT_RESIZE_MODE_WRAP,
          },
          { widthHint: width }
        );
        width = Math.max(80, minSize.width, width);
        height = Math.max(40, minSize.height);
      } else if (baseItem.type === "flowNode") {
        const minSize = getFlowNodeMinSize(
          {
            ...baseItem,
            x: left,
            y: top,
            width,
            height,
          },
          { widthHint: width }
        );
        width = Math.max(minSize.width, width);
        height = Math.max(minSize.height, height);
      } else if (baseItem.type === "codeBlock") {
        width = Math.max(CODE_BLOCK_MIN_WIDTH, width);
        height = Math.max(CODE_BLOCK_MIN_HEIGHT, height);
      } else if (baseItem.type === "table") {
        width = Math.max(TABLE_MIN_WIDTH, width);
        height = Math.max(TABLE_MIN_HEIGHT, height);
      } else if (baseItem.type === "mathBlock" || baseItem.type === "mathInline") {
        width = Math.max(MATH_MIN_WIDTH, width);
        height = Math.max(MATH_MIN_HEIGHT, height);
      } else if (baseItem.type === "fileCard") {
        width = Math.max(200, width);
        height = Math.max(96, height);
      } else if (baseItem.type === "mindNode") {
        width = Math.max(160, width);
        height = Math.max(72, height);
      }

      if (baseItem.type === "shape" && isLinearShape(baseItem.shapeType)) {
        const startRelX = (Number(baseItem.startX || 0) - baseBounds.left) / safeBaseWidth;
        const startRelY = (Number(baseItem.startY || 0) - baseBounds.top) / safeBaseHeight;
        const endRelX = (Number(baseItem.endX || 0) - baseBounds.left) / safeBaseWidth;
        const endRelY = (Number(baseItem.endY || 0) - baseBounds.top) / safeBaseHeight;
        const startX = nextBounds.left + startRelX * nextWidth;
        const startY = baseBounds.top + startRelY * safeBaseHeight;
        const endX = nextBounds.left + endRelX * nextWidth;
        const endY = baseBounds.top + endRelY * safeBaseHeight;
        updatedItems.set(itemId, {
          ...baseItem,
          startX,
          startY,
          endX,
          endY,
          x: Math.min(startX, endX),
          y: Math.min(startY, endY),
          width: Math.max(1, Math.abs(endX - startX)),
          height: Math.max(1, Math.abs(endY - startY)),
        });
        continue;
      }

      if (baseItem.type === "shape") {
        updatedItems.set(itemId, {
          ...baseItem,
          x: left,
          y: top,
          width,
          height,
          startX: left,
          startY: top,
          endX: left + width,
          endY: top + height,
        });
        continue;
      }

      updatedItems.set(itemId, {
        ...baseItem,
        x: left,
        y: top,
        width,
        height,
        ...(baseItem.type === "text"
          ? {
              textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
              textResizeMode: TEXT_RESIZE_MODE_WRAP,
            }
          : null),
      });
    }

    if (!updatedItems.size) {
      return false;
    }

    state.board.items = state.board.items.map((item) => updatedItems.get(item.id) || item);
    return true;
  }

  function isScenePointInsideBounds(point, bounds, padding = 0) {
    if (!point || !bounds) {
      return false;
    }
    const pad = Math.max(0, Number(padding || 0) || 0);
    const x = Number(point.x || 0);
    const y = Number(point.y || 0);
    return x >= bounds.left - pad && x <= bounds.right + pad && y >= bounds.top - pad && y <= bounds.bottom + pad;
  }

  function collectRenderFrameInput({ dirtyState = null, layerState = null } = {}) {
    if (!refs.canvas || !refs.ctx) {
      return null;
    }
    const sceneIndex = getSceneIndexRuntime();
    const sceneKey = "board-scene-cache-v3";
    const visibleScene = queryVisibleSceneItems(
      sceneIndex,
      state.board.view,
      Math.max(1, Number(refs.canvas?.clientWidth || refs.canvas?.width || 0) || 1),
      Math.max(1, Number(refs.canvas?.clientHeight || refs.canvas?.height || 0) || 1),
      { marginPx: 220 }
    );
    visibleScene.recordsByType = buildVisibleSceneRecordBuckets(visibleScene.records);
    return {
      sceneIndex,
      sceneKey,
      visibleScene,
      dirtyState,
      layerState,
    };
  }

  function performRenderFrame({ sceneIndex, sceneKey, visibleScene, dirtyState = null, layerState = null } = {}) {
    if (!refs.canvas || !refs.ctx) {
      return null;
    }
    renderer.render({
      ctx: refs.ctx,
      canvas: refs.canvas,
      view: state.board.view,
      items: state.board.items,
      visibleItems: visibleScene?.items || [],
      sceneIndex,
      sceneKey,
      selectedIds: state.board.selectedIds,
      hoverId: state.hoverId,
      hoverHandle: state.hoverHandle,
      selectionRect: state.selectionRect,
      mindMapDropTargetId: state.mindMapDropTargetId,
      mindMapDropHint: state.mindMapDropHint,
      draftElement: state.draftElement,
      editingId: state.editingId,
      imageEditState: lightImageEditor.getState(),
      flowDraft,
      relationshipDraft,
      alignmentSnap: state.alignmentSnap,
      alignmentSnapConfig: state.alignmentSnapConfig,
      allowLocalFileAccess: getAllowLocalFileAccess(),
      backgroundStyle: {
        fill: "#ffffff",
        pattern: getBoardBackgroundPattern(),
      },
      renderTextInCanvas: RENDER_TEXT_IN_CANVAS,
      dirtyState,
      layerState,
    });
    syncEditorLayout();
    syncRichTextToolbar();
    syncRichTextOverlays(visibleScene);
    syncCodeBlockOverlays(visibleScene);
    // File-card Word previews are rendered by the Canvas2D React UI from state.
    syncMathOverlays(visibleScene);
    syncCodeBlockToolbar();
    syncImageToolbar();
    syncMindNodeChrome();
    syncCanvasCursor();
    return refs.canvas?.__ffRenderStats || null;
  }

  function ensureRenderScheduler() {
    if (renderScheduler) {
      return renderScheduler;
    }
    renderScheduler = createRenderScheduler({
      collectFrameInput: collectRenderFrameInput,
      renderFrame: performRenderFrame,
    });
    return renderScheduler;
  }

  function scheduleRender(options = {}) {
    if (!refs.canvas || !refs.ctx) {
      return 0;
    }
    return ensureRenderScheduler().schedule({
      reason: String(options.reason || "render").trim() || "render",
      backgroundDirty: Boolean(options.backgroundDirty),
      sceneDirty: Boolean(options.sceneDirty),
      viewDirty: Boolean(options.viewDirty),
      interactionDirty: options.interactionDirty !== false,
      overlayDirty: Boolean(options.overlayDirty),
      hitTestDirty: Boolean(options.hitTestDirty),
      fullOverlayRescan: Boolean(options.fullOverlayRescan),
      itemIds: Array.isArray(options.itemIds) ? options.itemIds : [],
    });
  }

  function syncBoard({
    persist = true,
    emit = true,
    markDirty = persist,
    sceneChange = true,
    backgroundChange = false,
    viewChange = false,
    interactionChange = (!sceneChange && !backgroundChange) || viewChange,
    boardChange = sceneChange || viewChange,
    hitTestChange = sceneChange,
    fullOverlayRescan = sceneChange,
    reason = "",
    itemIds = [],
  } = {}) {
    if (sceneChange) {
      markSceneGraphDirty({ hitTest: hitTestChange });
    } else if (hitTestChange) {
      markHitTestDirty();
    }
    if (boardChange) {
      store.touchBoard?.();
    }
    if (fullOverlayRescan) {
      markCodeBlockOverlayDirty([], { fullRescan: true });
    }
    if (markDirty) {
      markBoardDirty();
    }
    if (persist) {
      store.persist();
    }
    if (emit) {
      scheduleDeferredStoreEmit();
    }
    scheduleRender({
      reason:
        String(reason || "").trim() ||
        (sceneChange ? "scene-sync" : viewChange ? "view-sync" : hitTestChange ? "hit-test-sync" : "ui-sync"),
      backgroundDirty: backgroundChange,
      sceneDirty: sceneChange,
      viewDirty: viewChange,
      interactionDirty: Boolean(interactionChange),
      overlayDirty: fullOverlayRescan,
      hitTestDirty: hitTestChange,
      fullOverlayRescan,
      itemIds,
    });
  }

  function clearAlignmentSnap(reason = "reset", { render = false } = {}) {
    const hadActiveSnap = hasActiveAlignmentSnap(state.alignmentSnap);
    resetAlignmentSnapState(state.alignmentSnap, reason);
    if (render && hadActiveSnap) {
      scheduleRender({ reason: "pointer-pan", viewDirty: true, interactionDirty: false });
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
      scheduleRender({ reason: "pointer-pan-intent", viewDirty: true, interactionDirty: false });
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
    const activeRecord = getSceneRecord(getSceneIndexRuntime(), activeId);
    if (!activeRecord?.bounds) {
      return collectSnapCandidates(state.board.items, activeId, {
        view: state.board.view,
        excludeIds: Array.isArray(options.excludeIds) ? options.excludeIds : [],
      });
    }
    const scale = Math.max(0.1, Number(state.board.view.scale || 1) || 1);
    const thresholdPx = Math.max(
      24,
      Number(options.thresholdPx || state.alignmentSnapConfig?.thresholdPx || 8) * 4
    );
    const paddingScene = thresholdPx / scale;
    const queryBounds = {
      left: activeRecord.bounds.left - paddingScene,
      top: activeRecord.bounds.top - paddingScene,
      right: activeRecord.bounds.right + paddingScene,
      bottom: activeRecord.bounds.bottom + paddingScene,
    };
    const candidateRecords = querySceneIndex(getSceneIndexRuntime(), queryBounds, {
      excludeIds: [activeId, ...(Array.isArray(options.excludeIds) ? options.excludeIds : [])],
    });
    return collectSnapCandidates(
      candidateRecords.map((record) => record.item),
      activeId,
      {
        view: state.board.view,
        excludeIds: Array.isArray(options.excludeIds) ? options.excludeIds : [],
      }
    );
  }

  function applyHorizontalResizeSnap({
    activeItem = null,
    rawBounds = null,
    handle = "",
    excludeIds = [],
    reason = "resize",
  } = {}) {
    if (!state.alignmentSnapConfig?.enabled || !activeItem || !rawBounds) {
      clearAlignmentSnap(`${reason}-disabled`);
      return rawBounds;
    }
    const normalizedHandle = String(handle || "").trim().toLowerCase();
    const affectsLeft = normalizedHandle === "nw" || normalizedHandle === "sw" || normalizedHandle === "multi-nw" || normalizedHandle === "multi-sw" || normalizedHandle === "multi-w";
    const affectsRight = normalizedHandle === "ne" || normalizedHandle === "se" || normalizedHandle === "multi-ne" || normalizedHandle === "multi-se" || normalizedHandle === "multi-e";
    if (!affectsLeft && !affectsRight) {
      clearAlignmentSnap(`${reason}-axis-miss`);
      return rawBounds;
    }

    const candidates = getAlignmentSnapCandidates(activeItem.id, { excludeIds });
    if (!candidates.length) {
      clearAlignmentSnap(`${reason}-candidate-miss`);
      return rawBounds;
    }

    const rawAnchors = getSnapAnchors(rawBounds);
    const activeKey = affectsLeft ? "left" : "right";
    const screenValue = sceneToScreen(state.board.view, {
      x: rawAnchors[activeKey],
      y: rawAnchors.top,
    }).x;
    const thresholdPx = Math.max(
      1,
      Number(state.alignmentSnapConfig?.thresholdPx || 8) || 1
    );

    let bestHit = null;
    candidates.forEach((candidate) => {
      ["left", "centerX", "right"].forEach((targetKey) => {
        const targetValue = Number(candidate?.screenAnchors?.[targetKey]);
        if (!Number.isFinite(targetValue)) {
          return;
        }
        const distancePx = targetValue - screenValue;
        if (Math.abs(distancePx) > thresholdPx) {
          return;
        }
        if (!bestHit || Math.abs(distancePx) < Math.abs(bestHit.distancePx)) {
          bestHit = {
            candidate,
            targetKey,
            distancePx,
            targetScreenValue: targetValue,
          };
        }
      });
    });

    if (!bestHit) {
      clearAlignmentSnap(`${reason}-miss`);
      return rawBounds;
    }

    const sceneDeltaX = Number(bestHit.distancePx || 0) / Math.max(0.1, Number(state.board.view.scale || 1) || 1);
    const nextBounds = {
      ...rawBounds,
      left: affectsLeft ? Number(rawBounds.left || 0) + sceneDeltaX : Number(rawBounds.left || 0),
      right: affectsRight ? Number(rawBounds.right || 0) + sceneDeltaX : Number(rawBounds.right || 0),
    };
    nextBounds.width = Math.max(1, Number(nextBounds.right || 0) - Number(nextBounds.left || 0));
    nextBounds.height = Math.max(1, Number(nextBounds.height || (Number(nextBounds.bottom || 0) - Number(nextBounds.top || 0)) || 1));

    const movedScreenBounds = {
      left: sceneToScreen(state.board.view, { x: nextBounds.left, y: nextBounds.top }).x,
      top: sceneToScreen(state.board.view, { x: nextBounds.left, y: nextBounds.top }).y,
      right: sceneToScreen(state.board.view, { x: nextBounds.right, y: nextBounds.top }).x,
      bottom: sceneToScreen(state.board.view, { x: nextBounds.left, y: nextBounds.bottom }).y,
    };
    const guide = {
      axis: "x",
      x: bestHit.targetScreenValue,
      y1: Math.min(movedScreenBounds.top, Number(bestHit.candidate?.screenBounds?.top || movedScreenBounds.top)) - 10,
      y2: Math.max(movedScreenBounds.bottom, Number(bestHit.candidate?.screenBounds?.bottom || movedScreenBounds.bottom)) + 10,
    };

    state.alignmentSnap.active = true;
    state.alignmentSnap.sourceId = String(activeItem.id || "");
    state.alignmentSnap.sourceType = String(activeItem.type || "");
    state.alignmentSnap.targetId = String(bestHit.candidate?.id || "");
    state.alignmentSnap.targetType = String(bestHit.candidate?.type || "");
    state.alignmentSnap.axisX = {
      axis: "x",
      sourceKey: activeKey,
      targetKey: bestHit.targetKey,
      distancePx: bestHit.distancePx,
      screenValue: bestHit.targetScreenValue,
      sceneValue: Number(bestHit.candidate?.anchors?.[bestHit.targetKey] || 0),
      targetId: String(bestHit.candidate?.id || ""),
      targetType: String(bestHit.candidate?.type || ""),
    };
    state.alignmentSnap.axisY = null;
    state.alignmentSnap.snappedScenePoint = {
      x: affectsLeft ? nextBounds.left : nextBounds.right,
      y: nextBounds.top,
    };
    state.alignmentSnap.guides = state.alignmentSnapConfig?.showGuides ? [guide] : [];
    state.alignmentSnap.lastReason = reason;
    return nextBounds;
  }

  function setStatus(text, tone = "neutral") {
    state.statusText = String(text || "");
    state.statusTone = tone;
    store.emit();
  }

  async function runClipboardOperationWithStatus(statusText = "处理中…", operation) {
    if (typeof operation !== "function") {
      return null;
    }
    const marker = String(statusText || "处理中…");
    const previousText = String(state.statusText || "");
    const previousTone = String(state.statusTone || "neutral");
    const token = ++clipboardProcessingStatusToken;
    setStatus(marker);
    try {
      // Ensure the processing hint can paint before heavy clipboard work starts.
      await yieldToNextFrame();
      return await operation();
    } finally {
      if (token === clipboardProcessingStatusToken && state.statusText === marker) {
        state.statusText = previousText;
        state.statusTone = previousTone;
        store.emit();
      }
    }
  }

  function openExternalUrl(url = "") {
    const rawUrl = String(url || "").trim();
    if (!rawUrl) {
      return false;
    }
    const looksLikeLocalPath =
      /^[a-zA-Z]:[\\/]/.test(rawUrl) || /^\\\\[^\\]+\\[^\\]+/.test(rawUrl) || /^\/[^/]/.test(rawUrl);
    if (looksLikeLocalPath && typeof globalThis?.desktopShell?.revealPath === "function") {
      void globalThis.desktopShell.revealPath(rawUrl);
      return true;
    }
    if (looksLikeLocalPath && typeof globalThis?.desktopShell?.openPath === "function") {
      void globalThis.desktopShell.openPath(rawUrl);
      return true;
    }
    const targetUrl = normalizeUserLinkInput(rawUrl) || rawUrl;
    let parsedUrl = null;
    try {
      // Validate URL before trying to open.
      parsedUrl = new URL(targetUrl);
    } catch (_error) {
      if (typeof globalThis?.desktopShell?.revealPath === "function") {
        void globalThis.desktopShell.revealPath(rawUrl);
        return true;
      }
      if (typeof globalThis?.desktopShell?.openPath === "function") {
        void globalThis.desktopShell.openPath(rawUrl);
        return true;
      }
      return false;
    }
    if (!parsedUrl || !["http:", "https:", "mailto:", "tel:", "file:"].includes(parsedUrl.protocol)) {
      return false;
    }
    if (parsedUrl.protocol === "file:") {
      const normalizedPathname = decodeURIComponent(String(parsedUrl.pathname || ""));
      const localPath = normalizedPathname.replace(/^\/([a-zA-Z]:\/)/, "$1").replace(/\//g, "\\");
      const filePath = parsedUrl.host
        ? `\\\\${parsedUrl.host}${normalizedPathname.replace(/\//g, "\\")}`
        : localPath;
      if (typeof globalThis?.desktopShell?.revealPath === "function") {
        void globalThis.desktopShell.revealPath(filePath || rawUrl);
        return true;
      }
      if (typeof globalThis?.desktopShell?.openPath === "function") {
        void globalThis.desktopShell.openPath(filePath || rawUrl);
        return true;
      }
      if (typeof window?.open === "function") {
        window.open(parsedUrl.toString(), "_blank", "noopener,noreferrer");
        return true;
      }
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
    return getItemByIdFast(itemId, "text");
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

  function flushPendingHydrationSync() {
    if (typeof cancelPendingHydrationSync === "function") {
      cancelPendingHydrationSync();
    }
    cancelPendingHydrationSync = null;
    if (!pendingHydrationSyncItemIds.size && !pendingHydrationSyncSceneChange) {
      pendingHydrationSyncReason = "";
      return false;
    }
    const itemIds = Array.from(pendingHydrationSyncItemIds);
    const sceneChange = pendingHydrationSyncSceneChange;
    const reason = pendingHydrationSyncReason || (sceneChange ? "hydrate-deferred-scene" : "hydrate-deferred-meta");
    pendingHydrationSyncItemIds.clear();
    pendingHydrationSyncSceneChange = false;
    pendingHydrationSyncReason = "";
    syncBoard({
      persist: true,
      emit: true,
      sceneChange,
      fullOverlayRescan: false,
      reason,
      itemIds,
    });
    return true;
  }

  function scheduleDeferredHydrationSync(itemIds = [], { sceneChange = false, reason = "" } = {}) {
    const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
    ids.forEach((itemId) => {
      const normalizedId = String(itemId || "").trim();
      if (normalizedId) {
        pendingHydrationSyncItemIds.add(normalizedId);
      }
    });
    pendingHydrationSyncSceneChange = pendingHydrationSyncSceneChange || Boolean(sceneChange);
    if (!pendingHydrationSyncReason && reason) {
      pendingHydrationSyncReason = String(reason || "").trim();
    }
    if (typeof cancelPendingHydrationSync === "function") {
      return;
    }
    cancelPendingHydrationSync = scheduleIdleTask(() => {
      flushPendingHydrationSync();
    }, 96);
  }

  async function processDeferredFileCardIdHydration(itemId = "") {
    const normalizedId = String(itemId || "").trim();
    if (!normalizedId || fileCardIdHydrationInFlight.has(normalizedId)) {
      return;
    }
    const item = sceneRegistry.getItemById(normalizedId) || state.board.items.find((entry) => String(entry?.id || "") === normalizedId);
    if (!item || (item.type !== "fileCard" && item.type !== "image") || !item.sourcePath || item.fileId) {
      return;
    }
    if (typeof globalThis?.desktopShell?.getFileId !== "function") {
      return;
    }
    fileCardIdHydrationInFlight.add(normalizedId);
    try {
      const result = await globalThis.desktopShell.getFileId(String(item.sourcePath || ""));
      const fileId = String(result?.fileId || result || "");
      if (fileId && item.fileId !== fileId) {
        item.fileId = fileId;
        scheduleDeferredHydrationSync(normalizedId, {
          sceneChange: false,
          reason: "resolve-file-card-id",
        });
      }
    } catch {
      // Ignore file id resolution failures.
    } finally {
      fileCardIdHydrationInFlight.delete(normalizedId);
    }
  }

  const fileCardIdHydrationQueue = createIdleBatchQueue({
    perFlushLimit: 3,
    timeout: 96,
    process: (itemId) => {
      void processDeferredFileCardIdHydration(itemId);
    },
  });

  async function processDeferredFileCardSourceHydration(itemId = "") {
    const normalizedId = String(itemId || "").trim();
    if (!normalizedId || fileCardSourceHydrationInFlight.has(normalizedId)) {
      return;
    }
    const item = sceneRegistry.getItemById(normalizedId) || state.board.items.find((entry) => String(entry?.id || "") === normalizedId);
    if (!item || (item.type !== "fileCard" && item.type !== "image")) {
      return;
    }
    fileCardSourceHydrationInFlight.add(normalizedId);
    try {
      const changed = await resolveFileCardSourcesForItems([item]);
      if (changed) {
        scheduleDeferredHydrationSync(normalizedId, {
          sceneChange: true,
          reason: "resolve-file-card-paths",
        });
      }
    } finally {
      fileCardSourceHydrationInFlight.delete(normalizedId);
    }
  }

  const fileCardSourceHydrationQueue = createIdleBatchQueue({
    perFlushLimit: 2,
    timeout: 144,
    process: (itemId) => {
      void processDeferredFileCardSourceHydration(itemId);
    },
  });

  const urlMetaHydrationQueue = createIdleBatchQueue({
    perFlushLimit: 2,
    timeout: 96,
    process: (taskKey) => {
      const entry = queuedUrlMetaHydrationTasks.get(taskKey);
      if (!entry) {
        return;
      }
      queuedUrlMetaHydrationTasks.delete(taskKey);
      void hydrateUrlMetaForItem(entry.itemId, entry.token, entry.existingMeta);
    },
  });

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
    if (!linkSemanticEnabled || !item || (item.type !== "text" && !isMindNodeTextItem(item))) {
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
      const taskKey = `${String(item.id || "").trim()}::${url}`;
      if (!taskKey || urlMetaHydrationTasks.has(taskKey) || queuedUrlMetaHydrationTasks.has(taskKey)) {
        return;
      }
      queuedUrlMetaHydrationTasks.set(taskKey, {
        itemId: item.id,
        token,
        existingMeta: metaEntry,
      });
      urlMetaHydrationQueue.enqueue(taskKey);
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
    const item = sceneRegistry.getItemById(itemId);
    if (!item || (item.type !== "text" && item.type !== "flowNode") || state.editingId === item.id) {
      return null;
    }
    const rawUrl = String(linkEl.getAttribute("data-link-url") || linkEl.getAttribute("href") || linkEl.href || "").trim();
    const normalizedUrl = normalizeComparableUrl(rawUrl);
    if (!normalizedUrl) {
      return null;
    }
    const canvasTargetIdFromAttr = String(linkEl.getAttribute("data-link-target-id") || "").trim();
    const canvasTargetId = canvasTargetIdFromAttr || resolveCanvasInternalLinkTargetId(rawUrl || normalizedUrl);
    const linkType = canvasTargetId ? CANVAS_INTERNAL_LINK_TYPE : EXTERNAL_LINK_TYPE;
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
      linkType,
      canvasTargetId,
      token,
      meta,
    };
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
    if (descriptor.linkType === CANVAS_INTERNAL_LINK_TYPE) {
      const targetItem = descriptor.canvasTargetId ? sceneRegistry.getItemById(descriptor.canvasTargetId) : null;
      const title = targetItem
        ? String(targetItem.title || targetItem.name || targetItem.id || "画布元素")
        : "画布元素";
      const desc = targetItem
        ? `点击跳转到 ${String(targetItem.type || "item")}`
        : "目标元素不存在";
      refs.linkTooltip.innerHTML = `
        <div class="canvas2d-link-tooltip-title">${escapeRichTextHtml(title)}</div>
        <div class="canvas2d-link-tooltip-desc">${escapeRichTextHtml(desc)}</div>
        <div class="canvas2d-link-tooltip-state">canvas-link</div>
      `;
      refs.linkTooltip.classList.remove("is-hidden");
      const hostRect = refs.surface.getBoundingClientRect();
      const panelWidth = Math.max(160, Math.min(280, refs.linkTooltip.offsetWidth || 220));
      const panelHeight = Math.max(44, refs.linkTooltip.offsetHeight || 64);
      const left = Math.min(Math.max(12, Number(clientX || 0) - hostRect.left + 12), Math.max(12, hostRect.width - panelWidth - 12));
      const top = Math.min(Math.max(12, Number(clientY || 0) - hostRect.top + 12), Math.max(12, hostRect.height - panelHeight - 12));
      refs.linkTooltip.style.left = `${left}px`;
      refs.linkTooltip.style.top = `${top}px`;
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
    const panelWidth = Math.max(160, Math.min(280, refs.linkTooltip.offsetWidth || 220));
    const panelHeight = Math.max(44, refs.linkTooltip.offsetHeight || 64);
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

  function updateStartupContextUiSettings(patch = {}) {
    const context = readStartupContext();
    if (!context) {
      return;
    }
    const nextUiSettings = {
      ...(context.uiSettings || {}),
      ...patch,
    };
    const nextStartup = {
      ...(context.startup || {}),
    };
    if (typeof patch.canvasBoardSavePath === "string") {
      nextStartup.boardSavePath = patch.canvasBoardSavePath;
    }
    if (typeof patch.canvasImageSavePath === "string") {
      nextStartup.canvasImageSavePath = patch.canvasImageSavePath;
    }
    if (typeof patch.canvasLastOpenedBoardPath === "string") {
      nextStartup.lastOpenedBoardPath = patch.canvasLastOpenedBoardPath;
      nextStartup.initialBoardPath = patch.canvasLastOpenedBoardPath;
    }
    globalThis.__FREEFLOW_STARTUP_CONTEXT = {
      ...context,
      uiSettings: nextUiSettings,
      startup: nextStartup,
    };
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
    const remote = await fetchUiSettings();
    if (remote?.canvasBoardSavePath) {
      const raw = String(remote.canvasBoardSavePath || "").trim();
      return resolveBoardFolderPath(raw) || raw;
    }
    const cached = readUiSettingsCache();
    if (cached?.canvasBoardSavePath) {
      const raw = String(cached.canvasBoardSavePath || "").trim();
      return resolveBoardFolderPath(raw) || raw;
    }
    const startup = readStartupUiSettings();
    if (startup?.canvasBoardSavePath) {
      const raw = String(startup.canvasBoardSavePath || "").trim();
      return resolveBoardFolderPath(raw) || raw;
    }
    return "";
  }

  async function resolveCanvasLastOpenedBoardPath() {
    const startup = readStartupContext();
    if (startup?.startup?.initialBoardPath) {
      return String(startup.startup.initialBoardPath || "").trim();
    }
    if (startup?.uiSettings?.canvasLastOpenedBoardPath) {
      return String(startup.uiSettings.canvasLastOpenedBoardPath || "").trim();
    }
    const remote = await fetchUiSettings();
    if (remote?.canvasLastOpenedBoardPath) {
      return String(remote.canvasLastOpenedBoardPath || "").trim();
    }
    const cached = readUiSettingsCache();
    if (cached?.canvasLastOpenedBoardPath) {
      return String(cached.canvasLastOpenedBoardPath || "").trim();
    }
    return "";
  }

  async function resolveCanvasImageSavePath() {
    const remote = await fetchUiSettings();
    if (remote?.canvasImageSavePath) {
      return normalizeCanvasImageSavePathValue(remote.canvasImageSavePath);
    }
    const cached = readUiSettingsCache();
    if (cached?.canvasImageSavePath) {
      return normalizeCanvasImageSavePathValue(cached.canvasImageSavePath);
    }
    const startup = readStartupUiSettings();
    if (startup?.canvasImageSavePath) {
      return normalizeCanvasImageSavePathValue(startup.canvasImageSavePath);
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

  function isBoardFileName(name) {
    return isSupportedBoardFileName(name);
  }

  function resolveBoardFolderPath(rawPath) {
    const cleanPath = String(rawPath || "").trim();
    if (!cleanPath) {
      return "";
    }
    const fileName = getFileNameFromPath(cleanPath);
    if (isBoardFileName(fileName)) {
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
    if (isBoardFileName(fileName)) {
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
          updateStartupContextUiSettings({
            canvasBoardSavePath: resolveBoardFolderPath(nextCache.canvasBoardSavePath || cleanFolderPath),
            canvasLastOpenedBoardPath: String(nextCache.canvasLastOpenedBoardPath || cleanPath).trim(),
          });
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
        return persistBoardSelectionSetting(cleanPath);
      }
      return Promise.resolve();
    }
    state.boardFilePath = cleanPath;
    state.boardFileName = cleanPath ? getFileName(cleanPath) : "未命名画布";
    syncExportHistoryForActiveBoard({ emit: false });
    if (emit) {
      store.emit();
    }
    if (updateSettings) {
      return persistBoardSelectionSetting(cleanPath);
    }
    return Promise.resolve();
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
      scheduleDeferredStoreEmit();
    }
  }

  function setSaveToast(message) {
    state.boardSaveToastAt = Date.now();
    state.boardSaveToastMessage = String(message || "").trim();
    store.emit();
  }

  function setCanvasImageManagerState(patch = {}, { emit = true } = {}) {
    const current = state.canvasImageManager && typeof state.canvasImageManager === "object"
      ? state.canvasImageManager
      : {
          folderPath: "",
          items: [],
          loading: false,
          error: "",
          lastScannedAt: 0,
          missingCount: 0,
        };
    state.canvasImageManager = {
      ...current,
      ...patch,
    };
    if (emit) {
      store.emit();
    }
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

  function ensureBoardFileExtension(name) {
    const raw = String(name || "").trim();
    if (!raw) {
      return "";
    }
    return ensureFreeFlowBoardFileName(raw);
  }

  function buildBoardFilePayload(targetPath) {
    const payload = structuredImportRuntime.serializeBoard(state.board, {
      meta: {
        boardFilePath: targetPath,
      },
    });
    return wrapFreeFlowBoardPayload(payload, {
      updatedAt: Date.now(),
    });
  }

  async function findAvailableMigrationPath(legacyPath) {
    const basePath = deriveFreeFlowBoardPathFromLegacyPath(legacyPath);
    if (!basePath) {
      return "";
    }
    if (typeof globalThis?.desktopShell?.pathExists !== "function") {
      return basePath;
    }
    const exists = await globalThis.desktopShell.pathExists(basePath);
    if (!exists) {
      return basePath;
    }
    const folder = getFolderFromPath(basePath);
    const fileName = getFileName(basePath).replace(/\.freeflow$/i, "");
    let index = 1;
    while (index < 9999) {
      const candidate = joinPath(folder, `${fileName}-migrated-${index}.freeflow`);
      const candidateExists = await globalThis.desktopShell.pathExists(candidate);
      if (!candidateExists) {
        return candidate;
      }
      index += 1;
    }
    return joinPath(folder, `${fileName}-migrated-${Date.now()}.freeflow`);
  }

  async function migrateLegacyBoardFileIfNeeded(sourcePath, payload) {
    if (!isLegacyJsonBoardFileName(sourcePath) || typeof globalThis?.desktopShell?.writeFile !== "function") {
      return "";
    }
    const targetPath = await findAvailableMigrationPath(sourcePath);
    if (!targetPath) {
      return "";
    }
    const envelope = wrapFreeFlowBoardPayload(payload, { updatedAt: Date.now() });
    const result = await globalThis.desktopShell.writeFile(targetPath, JSON.stringify(envelope, null, 2));
    return result?.ok ? String(result.filePath || targetPath).trim() : "";
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

  async function saveBoard({ saveAs = false, autosave = false, silent = false, exactPath = false } = {}) {
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
      if (targetPath && boardFolder && !exactPath) {
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
      targetPath = ensureBoardFileExtension(targetPath);
      const payload = JSON.stringify(buildBoardFilePayload(targetPath), null, 2);
      const result = await globalThis.desktopShell.writeFile(targetPath, payload);
      if (!result?.ok) {
        if (!silent) {
          setStatus(result?.error || "画布保存失败", "warning");
        }
        return false;
      }
      await setBoardFilePath(targetPath, { emit: false, updateSettings: true });
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
      const hasDesktopReadBridge = typeof globalThis?.desktopShell?.readFile === "function";
      const hasDesktopExistsBridge = typeof globalThis?.desktopShell?.pathExists === "function";
      if (hasDesktopExistsBridge) {
        const exists = await globalThis.desktopShell.pathExists(targetPath);
        if (!exists) {
          if (!silent) {
            setStatus("画布文件不存在", "warning");
          }
          return false;
        }
      }
      let parsed = null;
      let boardPayload = null;
      if (hasDesktopReadBridge) {
        const readResult = await globalThis.desktopShell.readFile(targetPath);
        if (!readResult?.ok) {
          if (!silent) {
            setStatus(readResult?.error || "画布读取失败", "warning");
          }
          return false;
        }
        try {
          parsed = parseBoardFileText(readResult?.text || "");
          boardPayload = parsed.payload;
        } catch (error) {
          if (!silent) {
            setStatus(getBoardParseErrorMessage(error), "warning");
          }
          return false;
        }
      } else {
        try {
          const requestUrl = `${API_ROUTES.canvasBoard}?filePath=${encodeURIComponent(targetPath)}`;
          const response = await fetch(requestUrl, { method: "GET" });
          const data = await readJsonResponse(response, "画布读取");
          if (!response.ok || !data?.ok) {
            if (!silent) {
              setStatus(data?.error || "画布读取失败", "warning");
            }
            return false;
          }
          const returnedSourcePath = String(data?.sourceFile || data?.file || data?.canonicalFile || "").trim();
          const normalizedRequestedPath = String(targetPath || "").trim().toLowerCase();
          const normalizedReturnedPath = returnedSourcePath.toLowerCase();
          if (normalizedRequestedPath && normalizedReturnedPath && normalizedRequestedPath !== normalizedReturnedPath) {
            if (!silent) {
              setStatus("画布读取接口未返回目标文件，请重启应用或开发服务后重试", "warning");
            }
            return false;
          }
          boardPayload = {
            kind: "structured-host-board",
            version: "1.0.0",
            createdAt: Number(data?.board?.updatedAt || Date.now()) || Date.now(),
            meta: {
              boardFilePath: String(data?.file || data?.canonicalFile || targetPath).trim(),
            },
            board: data?.board || {},
          };
          parsed = {
            payload: boardPayload,
            legacy: Boolean(data?.legacy),
            format: String(data?.format || "backend-api").trim() || "backend-api",
            envelope: null,
          };
        } catch (error) {
          if (!silent) {
            setStatus(error?.message || "画布读取失败", "warning");
          }
          return false;
        }
      }
      suppressDirtyTracking = true;
      const restoredBoard = structuredImportRuntime.deserializeBoard(boardPayload).board;
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
      let canonicalPath = targetPath;
      if (parsed.legacy || isLegacyJsonBoardFileName(targetPath)) {
        const migratedPath = await migrateLegacyBoardFileIfNeeded(targetPath, boardPayload);
        if (migratedPath) {
          canonicalPath = migratedPath;
        }
      }
      await setBoardFilePath(canonicalPath, { emit: false, updateSettings });
      setBoardDirty(false, { emit: false });
      store.emit();
      void resolveFileCardSources();
      if (!silent) {
        setStatus(canonicalPath !== targetPath ? "旧画布已升级为 FreeFlow 格式" : "画布已加载");
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
    return resolveUniqueBoardFilePathByBaseName(folderPath, DEFAULT_NEW_BOARD_BASE);
  }

  function sanitizeBoardFileBaseName(value) {
    const clean = String(value || "")
      .trim()
      .replace(/\.(?:freeflow|json)$/i, "")
      .replace(/[\\/:"*?<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim();
    return clean || DEFAULT_NEW_BOARD_BASE;
  }

  async function resolveUniqueBoardFilePathByBaseName(folderPath, baseName) {
    const cleanFolder = stripTrailingSeparators(folderPath);
    const cleanBaseName = sanitizeBoardFileBaseName(baseName);
    const existsFn = typeof globalThis?.desktopShell?.pathExists === "function"
      ? globalThis.desktopShell.pathExists
      : null;
    let index = 0;
    while (index < 9999) {
      const name = index === 0 ? cleanBaseName : `${cleanBaseName}_${index}`;
      const filePath = joinPath(cleanFolder || "", `${name}.freeflow`);
      if (!existsFn) {
        return filePath;
      }
      const exists = await existsFn(filePath);
      if (!exists) {
        return filePath;
      }
      index += 1;
    }
    return joinPath(cleanFolder || "", `${cleanBaseName}_${Date.now()}.freeflow`);
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
      await setBoardFilePath(nextPath, { emit: false, updateSettings: true });
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

  async function repairBoardAtPath(filePath) {
    const cleanPath = String(filePath || "").trim();
    if (!cleanPath) {
      return { ok: false, error: "画布路径为空" };
    }
    try {
      const response = await fetch(API_ROUTES.canvasBoardRepair, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filePath: cleanPath }),
      });
      const data = await readJsonResponse(response, "画布修复");
      if (!response.ok || !data?.ok) {
        return {
          ok: false,
          error: data?.error || "画布修复失败",
          repairedFile: String(data?.repairedFile || "").trim(),
          recoveredItemCount: Number(data?.recoveredItemCount || 0),
        };
      }
      setStatus(`已生成修复副本，恢复 ${Number(data?.recoveredItemCount || 0)} 个节点`);
      return data;
    } catch (error) {
      return {
        ok: false,
        error: error?.message || "画布修复失败",
      };
    }
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
    void refreshCanvasImageManager({ silent: true });
  }

  async function buildCanvasImageManagerItems(folderPath = "") {
    const listing = await listManagedImages(folderPath);
    if (!listing?.ok) {
      return listing;
    }
    const boardItems = Array.isArray(state.board?.items) ? state.board.items : [];
    const normalizedManagedItems = listing.images.map((entry) => {
      const filePath = String(entry?.filePath || "").trim();
      const references = boardItems.filter(
        (item) => item?.type === "image" && String(item.sourcePath || "").trim() === filePath
      );
      return {
        ...entry,
        referenced: references.length > 0,
        referenceCount: references.length,
        lastPlacedAt:
          references.reduce((maxValue, item) => Math.max(maxValue, Number(item?.createdAt || 0) || 0), 0) || 0,
      };
    });
    const missingCanvasItems = boardItems
      .filter((item) => item?.type === "image")
      .filter((item) => {
        const path = String(item.sourcePath || "").trim();
        if (!path) {
          return false;
        }
        return !normalizedManagedItems.some((entry) => entry.filePath === path);
      })
      .map((item) => ({
        id: `missing:${item.id}`,
        name: String(item.name || "未命名图片").trim() || "未命名图片",
        filePath: String(item.sourcePath || "").trim(),
        size: 0,
        modifiedAt: Number(item.createdAt || 0) || 0,
        extension: getFileExtension(item.sourcePath || "").replace(/^\./, ""),
        mime: String(item.mime || "").trim(),
        referenced: true,
        referenceCount: 1,
        missing: true,
        itemId: String(item.id || "").trim(),
      }));
    return {
      ok: true,
      folderPath: listing.folderPath,
      images: [...normalizedManagedItems, ...missingCanvasItems],
      error: "",
      missingCount: missingCanvasItems.length,
    };
  }

  async function refreshCanvasImageManager({ silent = false, folderPath = "" } = {}) {
    if (!silent) {
      setCanvasImageManagerState({ loading: true, error: "" });
    } else {
      setCanvasImageManagerState({ loading: true, error: "" }, { emit: false });
    }
    try {
      await ensureCanvasImageManagerFolderExists();
      const result = await buildCanvasImageManagerItems(folderPath);
      if (!result?.ok) {
        setCanvasImageManagerState({
          loading: false,
          error: result?.error || "读取画布图片失败",
          folderPath: String(result?.folderPath || folderPath || "").trim(),
          items: [],
          lastScannedAt: Date.now(),
          missingCount: 0,
        });
        return result;
      }
      setCanvasImageManagerState({
        loading: false,
        error: "",
        folderPath: String(result.folderPath || "").trim(),
        items: Array.isArray(result.images) ? result.images : [],
        lastScannedAt: Date.now(),
        missingCount: Number(result.missingCount || 0) || 0,
      });
      return { ok: true, folderPath: result.folderPath, items: result.images };
    } catch (error) {
      const message = error?.message || "读取画布图片失败";
      setCanvasImageManagerState({
        loading: false,
        error: message,
        folderPath: String(folderPath || "").trim(),
        items: [],
        lastScannedAt: Date.now(),
        missingCount: 0,
      });
      return { ok: false, folderPath: String(folderPath || "").trim(), items: [], error: message };
    }
  }

  async function insertManagedCanvasImage(filePath, options = {}) {
    const targetPath = String(filePath || "").trim();
    if (!targetPath) {
      return false;
    }
    const dimensions = await readImageDimensions("", targetPath, { allowLocalFileAccess: true });
    if (!dimensions?.width || !dimensions?.height) {
      setStatus("图片读取失败", "warning");
      return false;
    }
    const file = {
      name: getFileName(targetPath) || "图片",
      type: formatImageMimeFromPath(targetPath),
      path: targetPath,
    };
    const point = options.anchorPoint || getCenterScenePoint();
    const item = imageModule.createElement(file, point, "", dimensions);
    item.source = "path";
    item.sourcePath = targetPath;
    item.fileId = "";
    item.locked = false;
    item.memoVisible = false;
    item.memo = "";
    item.groupId = "";
    const pushed = pushItems([item], {
      reason: "插入画布图片",
      statusText: "图片已插入画布",
    });
    if (pushed) {
      state.lastSelectionSource = "click";
      void refreshCanvasImageManager({ silent: true });
    }
    return pushed;
  }

  function formatImageMimeFromPath(filePath = "") {
    const ext = String(getFileExtension(filePath) || "").trim().toLowerCase().replace(/^\./, "");
    if (!ext) {
      return "image/*";
    }
    if (ext === "jpg") {
      return "image/jpeg";
    }
    if (ext === "svg") {
      return "image/svg+xml";
    }
    return `image/${ext}`;
  }

  async function importCanvasImagesFromClipboard(anchorPoint = getCenterScenePoint()) {
    if (typeof globalThis?.desktopShell?.readClipboardImageDataUrl !== "function") {
      setStatus("当前环境不支持读取剪贴板图片", "warning");
      return false;
    }
    const result = await globalThis.desktopShell.readClipboardImageDataUrl();
    const dataUrl = String(result?.dataUrl || "").trim();
    if (!dataUrl) {
      setStatus(result?.error || "剪贴板中没有图片", "warning");
      return false;
    }
    const inserted = await insertImageFromDataUrl(dataUrl, {
      name: "剪贴板图片",
      anchorPoint,
      persistToImportFolder: true,
    });
    if (inserted) {
      void refreshCanvasImageManager({ silent: true });
    }
    return inserted;
  }

  async function captureCanvasImageToManager(anchorPoint = getCenterScenePoint()) {
    if (typeof globalThis?.desktopShell?.captureScreenImage !== "function") {
      setStatus("当前环境不支持系统截图", "warning");
      return false;
    }
    setStatus("等待系统截图完成...");
    const result = await globalThis.desktopShell.captureScreenImage();
    const dataUrl = String(result?.dataUrl || "").trim();
    if (!result?.ok || !dataUrl) {
      setStatus(result?.error || "截图失败", "warning");
      return false;
    }
    const inserted = await insertImageFromDataUrl(dataUrl, {
      name: "系统截图",
      anchorPoint,
      persistToImportFolder: true,
    });
    if (inserted) {
      void refreshCanvasImageManager({ silent: true });
    }
    return inserted;
  }

  const workspaceManager = createCanvasWorkspaceManager({
    state,
    store,
    useLocalFileSystem,
    setSuppressDirtyTracking(nextValue) {
      suppressDirtyTracking = Boolean(nextValue);
    },
    getFileApi() {
      return {
        setStatus,
        setBoardFilePath,
        setBoardDirty,
        setCanvasImageSavePath,
        resolveCanvasBoardSavePath,
        resolveCanvasImageSavePath,
        ensureBoardFileExtension,
        normalizeCanvasImageSavePathValue,
        resolveBoardFolderPath,
        joinPath,
        isBoardFileName,
        resolveUniqueBoardFilePath,
        resolveUniqueBoardFilePathByBaseName,
        sanitizeBoardFileBaseName,
      };
    },
    getBoardOps() {
      return {
        saveBoard,
        maybeSaveBeforeSwitch,
        syncBoard,
        ensureImportImageFolderExists,
      };
    },
    getEditApi() {
      return {
        cancelTextEdit,
        cancelFlowNodeEdit,
        cancelFileMemoEdit,
        cancelImageMemoEdit,
        finishImageEdit,
      };
    },
  });

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
    state.canvasImageManager.folderPath = (await resolveCanvasImageManagerFolder()) || state.canvasImageSavePath || "";
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
    void refreshCanvasImageManager({ silent: true });
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

  function commitInsertedItemsPatchHistory(beforeSnapshot, insertedItems = [], reason = "", patchKind = "item-insert-batch", options = {}) {
    const normalizedItems = Array.isArray(insertedItems) ? insertedItems.filter(Boolean) : [];
    const insertedItemIds = Array.from(
      new Set(
        normalizedItems
          .map((item) => String(item?.id || "").trim())
          .filter(Boolean)
      )
    );
    if (!beforeSnapshot || !insertedItemIds.length) {
      return false;
    }
    const changed = pushPatchHistory(
      state.history,
      {
        patchKind,
        itemId: insertedItemIds[0] || "",
        itemIds: insertedItemIds,
        beforeItems: Array.isArray(options.beforeItems) ? options.beforeItems : [],
        afterItems: normalizedItems,
        beforeOrderIds: Array.isArray(options.beforeOrderIds) ? options.beforeOrderIds : [],
        afterOrderIds: Array.isArray(options.afterOrderIds) ? options.afterOrderIds : [],
        beforeSelectedIds: Array.isArray(beforeSnapshot.selectedIds) ? beforeSnapshot.selectedIds : [],
        afterSelectedIds: Array.isArray(state.board.selectedIds) ? state.board.selectedIds : [],
        beforeView: beforeSnapshot.view || DEFAULT_VIEW,
        afterView: state.board.view || DEFAULT_VIEW,
        beforeEditingId: beforeSnapshot.editingId || null,
        beforeEditingType: beforeSnapshot.editingType || null,
        afterEditingId: state.editingId || null,
        afterEditingType: state.editingType || null,
      },
      reason
    );
    syncBoard({
      persist: true,
      emit: true,
      markDirty: changed,
      sceneChange: true,
      fullOverlayRescan: options.fullOverlayRescan !== false,
      itemIds: insertedItemIds,
      reason: patchKind,
    });
    return changed;
  }

  function pushItems(items = [], { reason = "", statusText = "" } = {}) {
    if (!Array.isArray(items) || !items.length) {
      return false;
    }
    const insertItems = normalizeImportedPasteFrameItems(items);
    const before = takeHistoryMetadataSnapshot(state);
    state.board.items.push(...insertItems);
    state.board.selectedIds = insertItems.map((item) => item.id);
    void hydrateFileCardIds(insertItems);
    commitInsertedItemsPatchHistory(before, insertItems, reason, "item-insert-batch", {
      fullOverlayRescan: true,
    });
    if (statusText) {
      setStatus(statusText);
    }
    return true;
  }

  function isMergeableRichTextItem(item) {
    return Boolean(item && item.type === "text");
  }

  function sortItemsForDocumentMerge(items = []) {
    const threshold = 28;
    return [...items].sort((left, right) => {
      const leftBounds = getElementBounds(left);
      const rightBounds = getElementBounds(right);
      const deltaY = Number(leftBounds.top || 0) - Number(rightBounds.top || 0);
      if (Math.abs(deltaY) > threshold) {
        return deltaY;
      }
      const deltaX = Number(leftBounds.left || 0) - Number(rightBounds.left || 0);
      if (Math.abs(deltaX) > 1) {
        return deltaX;
      }
      return String(left.id || "").localeCompare(String(right.id || ""));
    });
  }

  function mergeSelectedRichTextItems() {
    const selectedItems = getSelectedItemsFast();
    if (selectedItems.length < 2) {
      setStatus("请至少选中两个富文本框", "warning");
      return false;
    }
    if (!selectedItems.every((item) => isMergeableRichTextItem(item))) {
      setStatus("合并文本仅支持纯富文本框，多选中存在表格或其他独立元素", "warning");
      return false;
    }
    const sortedItems = sortItemsForDocumentMerge(selectedItems);
    const before = takeHistorySnapshot(state);
    const bounds = getMultiSelectionBounds(sortedItems);
    if (!bounds) {
      setStatus("无法计算合并范围", "warning");
      return false;
    }
    const baseItem = sortedItems[0];
    const fontSize = Number(baseItem?.fontSize || DEFAULT_TEXT_FONT_SIZE) || DEFAULT_TEXT_FONT_SIZE;
    const width = Math.max(240, Math.ceil(Number(bounds.width || 0) || Number(baseItem?.width || 0) || 240));
    const mergedHtml = sortedItems
      .map((item) =>
        sanitizeHtml(
          normalizeRichHtmlInlineFontSizes(String(item?.html || ""), Number(item?.fontSize || fontSize) || fontSize)
        ).trim()
      )
      .filter(Boolean)
      .join("");
    if (!mergedHtml) {
      setStatus("选中的文本内容为空，无法合并", "warning");
      return false;
    }
    const mergedPlainText = sanitizeText(
      sortedItems.map((item) => item?.plainText || item?.text || htmlToPlainText(item?.html || "")).join("")
    );
    const mergedItem = buildSplitTextSegmentItem(
      {
        ...baseItem,
        x: Number(bounds.left || baseItem?.x || 0) || 0,
        y: Number((bounds.top || baseItem?.y || 0)) + Math.max(32, Number(bounds.height || 0) || 32),
        width,
        height: Math.max(40, Math.ceil(Number(bounds.height || baseItem?.height || 0) || 40)),
      },
      {
        html: mergedHtml,
        plainText: mergedPlainText,
      },
      {
        x: Number(bounds.left || baseItem?.x || 0) || 0,
        y: Number((bounds.top || baseItem?.y || 0)) + Math.max(32, Number(bounds.height || 0) || 32),
        width,
        fontSize,
      }
    );
    state.board.items.push(mergedItem);
    state.board.selectedIds = [mergedItem.id];
    state.hoverId = mergedItem.id;
    scheduleUrlMetaHydrationForItem(mergedItem);
    const beforeOrderIds = Array.isArray(before?.items)
      ? before.items.map((entry) => String(entry?.id || "")).filter(Boolean)
      : [];
    const afterOrderIds = state.board.items.map((entry) => String(entry?.id || "")).filter(Boolean);
    const changed = commitItemsPatchHistory(before, [mergedItem.id], "合并文本", "text-merge", {
      beforeOrderIds,
      afterOrderIds,
      fullOverlayRescan: true,
    });
    if (!changed) {
      syncBoard({ persist: false, emit: true, markDirty: false });
      return false;
    }
    setStatus("已合并文本");
    persistCommittedBoardIfPossible();
    return true;
  }

  function splitActiveRichTextNow() {
    if (!state.editingId || state.editingType !== "text") {
      setStatus("请先进入富文本编辑态", "warning");
      return false;
    }
    const item = sceneRegistry.getItemById(state.editingId, "text");
    if (!item || !(refs.richEditor instanceof HTMLDivElement)) {
      setStatus("当前文本不可拆分", "warning");
      return false;
    }
    const activeSession = getActiveRichSession();
    if (!activeSession?.isActive?.()) {
      setStatus("当前文本不可拆分", "warning");
      return false;
    }
    activeSession.command("insertTextSplitMarker");
    return commitTextEdit();
  }

  function shouldNormalizeImportedPasteFrameItem(item = {}) {
    if (!item || typeof item !== "object") {
      return false;
    }
    return item.type === "text" || item.type === "codeBlock" || item.type === "table" || item.type === "mathBlock" || item.type === "mathInline";
  }

  function normalizeImportedPasteFrameItem(item = {}) {
    if (!shouldNormalizeImportedPasteFrameItem(item)) {
      return normalizeElement(item);
    }
    const width = IMPORTED_PASTE_FRAME_WIDTH;
    if (item.type === "text" || item.type === "mathBlock" || item.type === "mathInline") {
      return normalizeElement({
        ...item,
        width,
        textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
        textResizeMode: TEXT_RESIZE_MODE_WRAP,
        wrapMode: TEXT_WRAP_MODE_MANUAL,
        structuredImport: {
          ...(item.structuredImport && typeof item.structuredImport === "object" ? item.structuredImport : {}),
          initialFrameWidth: width,
        },
      });
    }
    if (item.type === "codeBlock") {
      return {
        ...normalizeElement({
        ...item,
        width,
        autoHeight: true,
        structuredImport: {
          ...(item.structuredImport && typeof item.structuredImport === "object" ? item.structuredImport : {}),
          initialFrameWidth: width,
        },
        }),
        width,
      };
    }
    if (item.type === "table") {
      return normalizeElement({
        ...item,
        width,
        structuredImport: {
          ...(item.structuredImport && typeof item.structuredImport === "object" ? item.structuredImport : {}),
          initialFrameWidth: width,
        },
      });
    }
    return normalizeElement(item);
  }

  function normalizeImportedPasteFrameItems(items = []) {
    return buildExportReadyBoardItems((Array.isArray(items) ? items : []).map((item) => normalizeImportedPasteFrameItem(item)));
  }

  function scheduleDeferredImportedAssetPersistence(items = [], { reason = "clipboard-import-asset-persist" } = {}) {
    const targets = (Array.isArray(items) ? items : []).filter((item) => item?.type === "image");
    if (!targets.length) {
      return false;
    }
    deferredImportedAssetPersistPromise = deferredImportedAssetPersistPromise
      .then(async () => {
        await yieldToIdleWindow(120);
        let saved = 0;
        const changedIds = [];
        for (const item of targets) {
          try {
            const ok = await saveImageItemToImportFolder(item);
            if (!ok) {
              continue;
            }
            saved += 1;
            const itemId = String(item?.id || "").trim();
            if (itemId) {
              changedIds.push(itemId);
            }
          } catch {
            // Ignore background asset persistence failures for pasted content.
          }
        }
        if (saved) {
          if (changedIds.length) {
            scheduleDeferredHydrationSync(changedIds, {
              sceneChange: true,
              reason,
            });
          }
          setSaveToast("图片已保存至当前画布目录下的 importImage 文件夹");
        }
      })
      .catch(() => {});
    return true;
  }

  function hydrateFileCardIds(items = []) {
    if (typeof globalThis?.desktopShell?.getFileId !== "function") {
      return;
    }
    const targets = items.filter(
      (item) => (item?.type === "fileCard" || item?.type === "image") && item.sourcePath && !item.fileId
    );
    if (!targets.length) {
      return false;
    }
    targets.forEach((item) => {
      const itemId = String(item?.id || "").trim();
      if (itemId) {
        fileCardIdHydrationQueue.enqueue(itemId);
      }
    });
    return true;
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
    fileCards.forEach((item) => {
      const itemId = String(item?.id || "").trim();
      if (itemId) {
        fileCardSourceHydrationQueue.enqueue(itemId);
      }
    });
    return false;
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
      refs.codeBlockEditor?.classList.add("is-hidden");
      refs.codeBlockToolbar?.classList.add("is-hidden");
      refs.tableEditor?.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
    }
    clearCodeBlockEditLayoutCache();
    markCodeBlockOverlayDirty([], { fullRescan: true });
    syncBoard({ persist, emit: true });
    return true;
  }

  function applyHistoryPatchEntry(entry, targetKey = "after", { persist = true } = {}) {
    if (!entry || entry.kind !== "patch") {
      return false;
    }
    const itemIds = Array.isArray(entry.itemIds) && entry.itemIds.length
      ? entry.itemIds.map((itemId) => String(itemId || "").trim()).filter(Boolean)
      : [String(entry.itemId || entry[`${targetKey}Item`]?.id || "").trim()].filter(Boolean);
    const patchItems = Array.isArray(entry[`${targetKey}Items`]) && entry[`${targetKey}Items`].length
      ? entry[`${targetKey}Items`].map((item) => normalizeElement(clone(item)))
      : entry[`${targetKey}Item`]
        ? [normalizeElement(clone(entry[`${targetKey}Item`]))]
        : [];
    const patchItemMap = new Map(
      patchItems
        .map((item) => [String(item?.id || "").trim(), item])
        .filter(([itemId]) => Boolean(itemId))
    );
    itemIds.forEach((itemId) => {
      const nextItem = patchItemMap.get(itemId) || null;
      const currentIndex = state.board.items.findIndex((item) => String(item?.id || "") === itemId);
      if (nextItem) {
        if (currentIndex >= 0) {
          state.board.items[currentIndex] = nextItem;
        } else {
          state.board.items.push(nextItem);
        }
        return;
      }
      if (currentIndex >= 0) {
        state.board.items.splice(currentIndex, 1);
      }
    });
    const orderIds = Array.isArray(entry[`${targetKey}OrderIds`])
      ? entry[`${targetKey}OrderIds`].map((itemId) => String(itemId || "").trim()).filter(Boolean)
      : [];
    if (orderIds.length) {
      const itemMap = new Map(
        state.board.items
          .map((item) => [String(item?.id || "").trim(), item])
          .filter(([itemId]) => Boolean(itemId))
      );
      const reordered = [];
      const visited = new Set();
      orderIds.forEach((itemId) => {
        const item = itemMap.get(itemId);
        if (!item || visited.has(itemId)) {
          return;
        }
        reordered.push(item);
        visited.add(itemId);
      });
      state.board.items.forEach((item) => {
        const itemId = String(item?.id || "").trim();
        if (!itemId || visited.has(itemId)) {
          return;
        }
        reordered.push(item);
      });
      state.board.items = reordered;
    }
    state.board.selectedIds = Array.isArray(entry[`${targetKey}SelectedIds`])
      ? entry[`${targetKey}SelectedIds`].map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    state.board.view = createView(entry[`${targetKey}View`] || DEFAULT_VIEW);
    state.editingId = entry[`${targetKey}EditingId`] || null;
    state.editingType = entry[`${targetKey}EditingType`] || null;
    if (!state.editingId) {
      refs.editor?.classList.add("is-hidden");
      refs.richEditor?.classList.add("is-hidden");
      refs.codeBlockEditor?.classList.add("is-hidden");
      refs.codeBlockToolbar?.classList.add("is-hidden");
      refs.tableEditor?.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
    }
    clearCodeBlockEditLayoutCache();
    markCodeBlockOverlayDirty([], { fullRescan: true });
    syncBoard({ persist, emit: true, sceneChange: true, fullOverlayRescan: true, itemIds });
    return true;
  }

  function commitHistory(before, reason = "") {
    const after = takeHistorySnapshot(state);
    const changedItemIds = getChangedHistorySnapshotItemIds(before, after);
    const beforeOrderIds = Array.isArray(before?.items)
      ? before.items.map((item) => String(item?.id || "").trim()).filter(Boolean)
      : [];
    const afterOrderIds = Array.isArray(after?.items)
      ? after.items.map((item) => String(item?.id || "").trim()).filter(Boolean)
      : [];
    const orderChanged = beforeOrderIds.join("|") !== afterOrderIds.join("|");
    const selectionChanged =
      (Array.isArray(before?.selectedIds) ? before.selectedIds : []).join("|") !==
      (Array.isArray(after?.selectedIds) ? after.selectedIds : []).join("|");
    const viewChanged =
      JSON.stringify(before?.view || DEFAULT_VIEW) !== JSON.stringify(after?.view || DEFAULT_VIEW);
    const editingChanged =
      String(before?.editingId || "") !== String(after?.editingId || "") ||
      String(before?.editingType || "") !== String(after?.editingType || "");
    const canPatchOrder =
      !orderChanged || Math.max(beforeOrderIds.length, afterOrderIds.length) <= HISTORY_AUTO_PATCH_ORDER_LIMIT;
    const hasPatchableMetaChange = selectionChanged || viewChanged || editingChanged || orderChanged;
    const shouldUsePatchHistory =
      canPatchOrder &&
      ((changedItemIds.length > 0 && changedItemIds.length <= HISTORY_AUTO_PATCH_ITEM_LIMIT) ||
        (!changedItemIds.length && hasPatchableMetaChange));
    const changed = shouldUsePatchHistory
      ? pushPatchHistory(
          state.history,
          {
            patchKind: "history-auto-patch",
            itemId: changedItemIds[0] || "",
            itemIds: changedItemIds,
            beforeItems: getHistorySnapshotItems(before, changedItemIds),
            afterItems: getHistorySnapshotItems(after, changedItemIds),
            beforeOrderIds: orderChanged && canPatchOrder ? beforeOrderIds : [],
            afterOrderIds: orderChanged && canPatchOrder ? afterOrderIds : [],
            beforeSelectedIds: Array.isArray(before?.selectedIds) ? before.selectedIds : [],
            afterSelectedIds: Array.isArray(after?.selectedIds) ? after.selectedIds : [],
            beforeView: before?.view || DEFAULT_VIEW,
            afterView: after?.view || DEFAULT_VIEW,
            beforeEditingId: before?.editingId || null,
            beforeEditingType: before?.editingType || null,
            afterEditingId: after?.editingId || null,
            afterEditingType: after?.editingType || null,
          },
          reason
        )
      : pushHistory(state.history, before, after, reason);
    syncBoard({
      persist: true,
      emit: true,
      markDirty: changed,
      sceneChange: true,
      fullOverlayRescan: true,
      itemIds: changedItemIds,
      reason: "history-commit",
    });
    return changed;
  }

  function getHistorySnapshotItem(snapshot, itemId) {
    if (!snapshot || !Array.isArray(snapshot.items)) {
      return null;
    }
    return snapshot.items.find((entry) => String(entry?.id || "") === String(itemId || "")) || null;
  }

  function getHistorySnapshotItems(snapshot, itemIds = []) {
    if (!snapshot || !Array.isArray(snapshot.items)) {
      return [];
    }
    const targetIds = Array.from(
      new Set(
        (Array.isArray(itemIds) ? itemIds : [])
          .map((itemId) => String(itemId || "").trim())
          .filter(Boolean)
      )
    );
    if (!targetIds.length) {
      return [];
    }
    const targetSet = new Set(targetIds);
    return snapshot.items.filter((entry) => targetSet.has(String(entry?.id || "").trim()));
  }

  function getCurrentBoardItemsByIds(itemIds = []) {
    const targetIds = Array.from(
      new Set(
        (Array.isArray(itemIds) ? itemIds : [])
          .map((itemId) => String(itemId || "").trim())
          .filter(Boolean)
      )
    );
    if (!targetIds.length) {
      return [];
    }
    const targetSet = new Set(targetIds);
    return state.board.items.filter((entry) => targetSet.has(String(entry?.id || "").trim()));
  }

  function getSnapshotItemSignatureMap(snapshot) {
    const signatureMap = new Map();
    const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
    items.forEach((item) => {
      const itemId = String(item?.id || "").trim();
      if (!itemId) {
        return;
      }
      let signature = "";
      try {
        signature = JSON.stringify(item);
      } catch {
        signature = String(item?.updatedAt || item?.createdAt || "") || itemId;
      }
      signatureMap.set(itemId, signature);
    });
    return signatureMap;
  }

  function getChangedHistorySnapshotItemIds(beforeSnapshot, afterSnapshot) {
    const beforeMap = getSnapshotItemSignatureMap(beforeSnapshot);
    const afterMap = getSnapshotItemSignatureMap(afterSnapshot);
    if (!beforeMap.size && !afterMap.size) {
      return [];
    }
    const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    const changedIds = [];
    allIds.forEach((itemId) => {
      if (beforeMap.get(itemId) !== afterMap.get(itemId)) {
        changedIds.push(itemId);
      }
    });
    return changedIds;
  }

  function commitItemsPatchHistory(beforeSnapshot, itemIds = [], reason = "", patchKind = "items-edit", options = {}) {
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(itemIds) ? itemIds : [])
          .map((itemId) => String(itemId || "").trim())
          .filter(Boolean)
      )
    );
    if (!beforeSnapshot || !normalizedIds.length) {
      return false;
    }
    const changed = pushPatchHistory(
      state.history,
      {
        patchKind,
        itemId: normalizedIds[0] || "",
        itemIds: normalizedIds,
        beforeItems: getHistorySnapshotItems(beforeSnapshot, normalizedIds),
        afterItems: getCurrentBoardItemsByIds(normalizedIds),
        beforeOrderIds: Array.isArray(options.beforeOrderIds) ? options.beforeOrderIds : [],
        afterOrderIds: Array.isArray(options.afterOrderIds) ? options.afterOrderIds : [],
        beforeSelectedIds: Array.isArray(beforeSnapshot.selectedIds) ? beforeSnapshot.selectedIds : [],
        afterSelectedIds: Array.isArray(state.board.selectedIds) ? state.board.selectedIds : [],
        beforeView: beforeSnapshot.view || DEFAULT_VIEW,
        afterView: state.board.view || DEFAULT_VIEW,
        beforeEditingId: beforeSnapshot.editingId || null,
        beforeEditingType: beforeSnapshot.editingType || null,
        afterEditingId: state.editingId || null,
        afterEditingType: state.editingType || null,
      },
      reason
    );
    syncBoard({
      persist: true,
      emit: true,
      markDirty: changed,
      sceneChange: true,
      fullOverlayRescan: options.fullOverlayRescan !== false,
      itemIds: normalizedIds,
      reason: patchKind,
    });
    return changed;
  }

  function commitOrderPatchHistory(beforeSnapshot, itemIds = [], reason = "", patchKind = "item-reorder") {
    const beforeOrderIds = Array.isArray(beforeSnapshot?.items)
      ? beforeSnapshot.items.map((item) => String(item?.id || "").trim()).filter(Boolean)
      : [];
    const afterOrderIds = state.board.items.map((item) => String(item?.id || "").trim()).filter(Boolean);
    return commitItemsPatchHistory(beforeSnapshot, itemIds, reason, patchKind, {
      beforeOrderIds,
      afterOrderIds,
    });
  }

  function commitItemPatchHistory(beforeSnapshot, itemId, afterItem, reason = "", patchKind = "item-edit") {
    if (!beforeSnapshot || !itemId) {
      return false;
    }
    return commitItemsPatchHistory(beforeSnapshot, [itemId], reason, patchKind, {
      beforeOrderIds: [],
      afterOrderIds: [],
      fullOverlayRescan: true,
    });
  }

  function commitCodeBlockPatchHistory(beforeSnapshot, itemId, afterItem, reason = "") {
    if (!beforeSnapshot || !itemId) {
      return false;
    }
    return commitItemsPatchHistory(beforeSnapshot, [itemId], reason, "codeBlock-edit", {
      beforeOrderIds: [],
      afterOrderIds: [],
      fullOverlayRescan: false,
    });
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
    const nextWidth = Math.max(1, Math.round(rect.width * dpr));
    const nextHeight = Math.max(1, Math.round(rect.height * dpr));
    const sizeChanged = refs.canvas.width !== nextWidth || refs.canvas.height !== nextHeight;
    refs.canvas.width = nextWidth;
    refs.canvas.height = nextHeight;
    scheduleRender({
      reason: sizeChanged ? "resize" : "resize-sync",
      backgroundDirty: true,
      viewDirty: true,
      interactionDirty: true,
      overlayDirty: true,
    });
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
    if (state.pointer?.type === "resize-multi-selection") {
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
    if (state.pointer?.type === "move-selection" || state.pointer?.type === "duplicate-multi-selection") {
      refs.canvas.style.cursor = "grabbing";
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

    const overlayParent =
      refs.surface.parentElement instanceof HTMLElement ? refs.surface.parentElement : refs.surface;
    refs.fixedOverlayHost = overlayParent.querySelector("#canvas-fixed-overlay-host");
    if (!(refs.fixedOverlayHost instanceof HTMLDivElement)) {
      refs.fixedOverlayHost = document.createElement("div");
      refs.fixedOverlayHost.id = "canvas-fixed-overlay-host";
      refs.fixedOverlayHost.className = "canvas-fixed-overlay-host";
      overlayParent.appendChild(refs.fixedOverlayHost);
      cleanupFns.push(() => {
        refs.fixedOverlayHost?.remove?.();
        refs.fixedOverlayHost = null;
      });
    }

    refs.canvasLinkBindingOverlay = refs.fixedOverlayHost.querySelector("#canvas2d-link-binding-overlay");
    if (!(refs.canvasLinkBindingOverlay instanceof HTMLDivElement)) {
      refs.canvasLinkBindingOverlay = document.createElement("div");
      refs.canvasLinkBindingOverlay.id = "canvas2d-link-binding-overlay";
      refs.canvasLinkBindingOverlay.className = "canvas2d-link-binding-overlay is-hidden";
      refs.canvasLinkBindingOverlay.setAttribute("aria-hidden", "true");
      refs.fixedOverlayHost.appendChild(refs.canvasLinkBindingOverlay);
    }

    refs.canvasLinkBindingHint = refs.fixedOverlayHost.querySelector("#canvas2d-link-binding-hint");
    if (!(refs.canvasLinkBindingHint instanceof HTMLDivElement)) {
      refs.canvasLinkBindingHint = document.createElement("div");
      refs.canvasLinkBindingHint.id = "canvas2d-link-binding-hint";
      refs.canvasLinkBindingHint.className = "canvas2d-link-binding-hint is-hidden";
      refs.canvasLinkBindingHint.setAttribute("aria-hidden", "true");
      refs.canvasLinkBindingHint.innerHTML = `
        <div class="canvas2d-link-binding-hint-title">正在绑定画布链接</div>
        <div class="canvas2d-link-binding-hint-text">点击任意画布元素作为跳转目标</div>
        <div class="canvas2d-link-binding-hint-chips" aria-hidden="true">
          <span class="canvas2d-link-binding-hint-chip">已进入绑定模式</span>
          <span class="canvas2d-link-binding-hint-chip">点击目标元素</span>
          <span class="canvas2d-link-binding-hint-chip">Esc 取消</span>
        </div>
      `;
      refs.fixedOverlayHost.appendChild(refs.canvasLinkBindingHint);
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

    refs.tableEditor =
      refs.surface.querySelector("#canvas-table-editor") || refs.fixedOverlayHost.querySelector("#canvas-table-editor");
    if (!(refs.tableEditor instanceof HTMLDivElement)) {
      refs.tableEditor = document.createElement("div");
      refs.tableEditor.id = "canvas-table-editor";
      refs.tableEditor.className = "canvas-table-editor is-hidden";
      refs.tableEditor.setAttribute("aria-label", "编辑表格");
      refs.surface.appendChild(refs.tableEditor);
    } else if (refs.tableEditor.parentElement !== refs.surface) {
      refs.surface.appendChild(refs.tableEditor);
    }
    ensureTableCellRichEditorHost();

    refs.tableToolbar = refs.fixedOverlayHost.querySelector("#canvas-table-toolbar");
    if (!(refs.tableToolbar instanceof HTMLDivElement)) {
      refs.tableToolbar = document.createElement("div");
      refs.tableToolbar.id = "canvas-table-toolbar";
      refs.tableToolbar.className = "canvas-table-toolbar is-hidden";
      refs.tableToolbar.innerHTML = `
        <div class="canvas-table-toolbar-group">
          <button type="button" class="canvas-table-tool is-toggle-header" data-action="table-toggle-header" aria-label="切换表头" title="切换表头"></button>
          <button type="button" class="canvas-table-tool is-more" data-action="table-more" aria-label="更多表格操作" title="更多表格操作"></button>
          <button type="button" class="canvas-table-tool is-done" data-action="table-done" aria-label="完成表格编辑" title="完成表格编辑"></button>
        </div>
      `;
      refs.fixedOverlayHost.appendChild(refs.tableToolbar);
    }
    ensureMindNodeChrome();

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

    refs.codeBlockEditor = refs.surface.querySelector("#canvas-code-block-editor");
    if (!(refs.codeBlockEditor instanceof HTMLDivElement)) {
      refs.codeBlockEditor = document.createElement("div");
      refs.codeBlockEditor.id = "canvas-code-block-editor";
      refs.codeBlockEditor.className = "canvas-code-block-editor is-hidden";
      refs.codeBlockEditor.setAttribute("aria-label", "编辑代码块");
      refs.surface.appendChild(refs.codeBlockEditor);
    }
    codeBlockEditor.setHost(refs.codeBlockEditor);

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
      refs.linkTooltip.style.maxWidth = "280px";
      refs.linkTooltip.style.padding = "6px 8px";
      refs.linkTooltip.style.borderRadius = "7px";
      refs.linkTooltip.style.background = "rgba(248, 250, 252, 0.97)";
      refs.linkTooltip.style.border = "1px solid rgba(148, 163, 184, 0.45)";
      refs.linkTooltip.style.boxShadow = "0 8px 20px rgba(15, 23, 42, 0.15)";
      refs.linkTooltip.style.pointerEvents = "none";
      refs.linkTooltip.style.left = "-9999px";
      refs.linkTooltip.style.top = "-9999px";
      refs.surface.appendChild(refs.linkTooltip);
    }

    refs.richExternalLinkPanel = refs.fixedOverlayHost.querySelector("#canvas2d-rich-link-panel");
    if (!(refs.richExternalLinkPanel instanceof HTMLDivElement)) {
      refs.richExternalLinkPanel = document.createElement("div");
      refs.richExternalLinkPanel.id = "canvas2d-rich-link-panel";
      refs.richExternalLinkPanel.className = "canvas2d-rich-link-panel is-hidden";
      refs.richExternalLinkPanel.setAttribute("aria-hidden", "true");
      refs.richExternalLinkPanel.innerHTML = `
        <label class="canvas2d-rich-link-panel-field">
          <span class="canvas2d-rich-link-panel-label">链接地址</span>
          <input
            type="text"
            class="canvas2d-rich-link-panel-input"
            data-role="rich-link-input"
            placeholder="输入 https://example.com 或本地文件路径"
            spellcheck="false"
          />
        </label>
        <div class="canvas2d-rich-link-panel-actions">
          <button type="button" class="canvas2d-rich-btn" data-action="rich-link-apply">应用</button>
          <button type="button" class="canvas2d-rich-btn" data-action="rich-link-remove">移除</button>
          <button type="button" class="canvas2d-rich-btn" data-action="rich-link-close">完成</button>
        </div>
      `;
      refs.fixedOverlayHost.appendChild(refs.richExternalLinkPanel);
    }

    refs.mindNodeLinkPanel = refs.fixedOverlayHost.querySelector("#canvas2d-mind-node-link-panel");
    if (!(refs.mindNodeLinkPanel instanceof HTMLDivElement)) {
      refs.mindNodeLinkPanel = document.createElement("div");
      refs.mindNodeLinkPanel.id = "canvas2d-mind-node-link-panel";
      refs.mindNodeLinkPanel.className = "canvas2d-mind-node-link-panel is-hidden";
      refs.mindNodeLinkPanel.setAttribute("aria-hidden", "true");
      refs.mindNodeLinkPanel.innerHTML = `
        <div class="canvas2d-mind-node-link-strip" data-role="mind-link-strip"></div>
        <div class="canvas2d-mind-node-link-hover-menu is-hidden" data-role="mind-link-hover-menu"></div>
      `;
      refs.fixedOverlayHost.appendChild(refs.mindNodeLinkPanel);
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

    refs.codeBlockDisplayHost = refs.surface.querySelector("#canvas2d-code-block-display");
    if (!(refs.codeBlockDisplayHost instanceof HTMLDivElement)) {
      refs.codeBlockDisplayHost = document.createElement("div");
      refs.codeBlockDisplayHost.id = "canvas2d-code-block-display";
      refs.codeBlockDisplayHost.className = "canvas2d-code-block-display";
      refs.surface.appendChild(refs.codeBlockDisplayHost);
    }
    refs.codeBlockDisplayHost.classList.add("is-hidden");
    refs.codeBlockDisplayHost.style.display = "none";
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.dataset.canvasCodeBlockOverlay = "1";
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
      refs.richToolbar.className = "canvas2d-rich-toolbar canvas2d-rich-toolbar-persistent is-hidden";
      refs.richToolbar.innerHTML = buildPersistentRichToolbarHtml();
      refs.surface.appendChild(refs.richToolbar);
    }
    syncRichToolbarEnhancements(refs.richToolbar);

    refs.codeBlockToolbar = refs.surface.querySelector("#canvas-code-block-toolbar");
    if (!(refs.codeBlockToolbar instanceof HTMLDivElement)) {
      refs.codeBlockToolbar = document.createElement("div");
      refs.codeBlockToolbar.id = "canvas-code-block-toolbar";
      refs.codeBlockToolbar.className = "canvas-code-block-toolbar is-hidden";
      refs.codeBlockToolbar.innerHTML = `
        <label class="canvas2d-rich-select-wrap">
          <select class="canvas2d-rich-select" data-action="code-language" aria-label="代码语言">
            ${buildCodeBlockLanguageSelectHtml()}
          </select>
        </label>
        <button type="button" class="canvas2d-rich-btn" data-action="code-copy" aria-label="复制代码" title="复制代码">复制</button>
        <button type="button" class="canvas2d-rich-btn" data-action="code-wrap" aria-label="切换自动换行" title="切换自动换行">换行</button>
        <button type="button" class="canvas2d-rich-btn" data-action="code-line-numbers" aria-label="切换行号" title="切换行号">行号</button>
        <label class="canvas2d-rich-select-wrap">
          <select class="canvas2d-rich-select" data-action="code-font-size" aria-label="代码字号">
            <option value="12">12</option>
            <option value="14">14</option>
            <option value="16">16</option>
            <option value="18">18</option>
            <option value="20">20</option>
            <option value="24">24</option>
          </select>
        </label>
        <button type="button" class="canvas2d-rich-btn" data-action="code-preview-toggle" aria-label="切换预览">预览</button>
        <div class="canvas-code-block-toolbar-meta" data-role="code-block-meta" aria-live="polite"></div>
        <button type="button" class="canvas2d-rich-btn" data-action="code-done" aria-label="完成代码编辑" title="完成代码编辑">完成</button>
      `;
      refs.surface.appendChild(refs.codeBlockToolbar);
    }
    const codeBlockToolbarMeta = refs.codeBlockToolbar.querySelector('[data-role="code-block-meta"]');
    if (codeBlockToolbarMeta instanceof HTMLElement) {
      codeBlockToolbarMeta.style.display = "inline-flex";
      codeBlockToolbarMeta.style.alignItems = "center";
      codeBlockToolbarMeta.style.justifyContent = "center";
      codeBlockToolbarMeta.style.minWidth = "88px";
      codeBlockToolbarMeta.style.maxWidth = "180px";
      codeBlockToolbarMeta.style.height = "28px";
      codeBlockToolbarMeta.style.padding = "0 10px";
      codeBlockToolbarMeta.style.borderRadius = "999px";
      codeBlockToolbarMeta.style.background = "rgba(241, 245, 249, 0.92)";
      codeBlockToolbarMeta.style.border = "1px solid rgba(203, 213, 225, 0.92)";
      codeBlockToolbarMeta.style.color = "#475569";
      codeBlockToolbarMeta.style.fontSize = "12px";
      codeBlockToolbarMeta.style.fontWeight = "600";
      codeBlockToolbarMeta.style.whiteSpace = "nowrap";
      codeBlockToolbarMeta.style.overflow = "hidden";
      codeBlockToolbarMeta.style.textOverflow = "ellipsis";
      codeBlockToolbarMeta.textContent = "代码块";
    }

    refs.richSelectionToolbar = refs.surface.querySelector("#canvas2d-rich-selection-toolbar");
    if (!(refs.richSelectionToolbar instanceof HTMLDivElement)) {
      refs.richSelectionToolbar = document.createElement("div");
      refs.richSelectionToolbar.id = "canvas2d-rich-selection-toolbar";
      refs.richSelectionToolbar.className = "canvas2d-rich-toolbar canvas2d-rich-selection-toolbar is-hidden";
      refs.richSelectionToolbar.innerHTML = buildSelectionRichToolbarHtml("rich-text");
      refs.richSelectionToolbar.dataset.variant = "rich-text";
      refs.surface.appendChild(refs.richSelectionToolbar);
    }
    syncRichToolbarEnhancements(refs.richSelectionToolbar);
    syncAllRichToolbarColorControls();

    refs.imageToolbar = lightImageEditor.mount(refs.surface);

    refs.ctx = refs.canvas.getContext("2d", { alpha: true });
    if (!refs.ctx) {
      throw new Error("无法获取 Canvas2D 上下文");
    }
    syncCanvasLinkBindingUi();
  }

  function syncCanvasLinkBindingUi() {
    const active = Boolean(resolvePendingCanvasLinkBindingMode());
    refs.surface?.classList.toggle("is-canvas-link-binding", active);
    if (refs.canvasLinkBindingOverlay instanceof HTMLDivElement) {
      refs.canvasLinkBindingOverlay.classList.toggle("is-hidden", !active);
      refs.canvasLinkBindingOverlay.setAttribute("aria-hidden", active ? "false" : "true");
    }
    if (refs.canvasLinkBindingHint instanceof HTMLDivElement) {
      refs.canvasLinkBindingHint.classList.toggle("is-hidden", !active);
      refs.canvasLinkBindingHint.setAttribute("aria-hidden", active ? "false" : "true");
    }
  }

  function hideMindNodeLinkPanel() {
    if (!(refs.mindNodeLinkPanel instanceof HTMLDivElement)) {
      return;
    }
    cancelMindNodeLinkMenuCloseTimer();
    refs.mindNodeLinkPanel.classList.add("is-hidden");
    refs.mindNodeLinkPanel.setAttribute("aria-hidden", "true");
    refs.mindNodeLinkPanel.removeAttribute("data-node-id");
  }

  function clearMindNodeLinkPanelState() {
    cancelMindNodeLinkMenuCloseTimer();
    mindNodeLinkPanelPinnedNodeId = "";
    activeMindNodeLinkMenuTargetId = "";
  }

  function updateMindNodeLinkTooltip(node = null, clientX = 0, clientY = 0) {
    if (!(refs.linkTooltip instanceof HTMLDivElement) || !(refs.surface instanceof HTMLDivElement)) {
      return;
    }
    const entries = resolveMindNodeLinkEntries(node).filter((entry) => entry.target);
    if (!entries.length) {
      hideLinkMetaTooltip();
      return;
    }
    refs.linkTooltip.innerHTML = `
      <div class="canvas2d-link-tooltip-title">节点链接 ${entries.length}</div>
      <div class="canvas2d-link-tooltip-desc">${entries
        .slice(0, 4)
        .map((entry) => escapeRichTextHtml(entry.title))
        .join(" / ")}</div>
      <div class="canvas2d-link-tooltip-state">canvas-link</div>
    `;
    refs.linkTooltip.classList.remove("is-hidden");
    const hostRect = refs.surface.getBoundingClientRect();
    const panelWidth = Math.max(160, Math.min(280, refs.linkTooltip.offsetWidth || 220));
    const panelHeight = Math.max(44, refs.linkTooltip.offsetHeight || 64);
    const left = Math.min(Math.max(12, Number(clientX || 0) - hostRect.left + 12), Math.max(12, hostRect.width - panelWidth - 12));
    const top = Math.min(Math.max(12, Number(clientY || 0) - hostRect.top + 12), Math.max(12, hostRect.height - panelHeight - 12));
    refs.linkTooltip.style.left = `${left}px`;
    refs.linkTooltip.style.top = `${top}px`;
  }

  function syncMindNodeLinkPanel() {
    if (!(refs.mindNodeLinkPanel instanceof HTMLDivElement) || !(refs.fixedOverlayHost instanceof HTMLDivElement)) {
      return;
    }
    const selectedItem = state.tool === "select" ? resolveMindNodeChromeTarget() : null;
    const pinnedNodeId = String(mindNodeLinkPanelPinnedNodeId || "").trim();
    const node = (pinnedNodeId && getMindNodeById(pinnedNodeId)) || selectedItem;
    if (!node || node.type !== "mindNode" || pinnedNodeId !== String(node.id || "").trim()) {
      clearMindNodeLinkPanelState();
      hideMindNodeLinkPanel();
      return;
    }
    const entries = resolveMindNodeLinkEntries(node);
    const nodeRect = getElementScreenBounds(state.board.view, node);
    const overlayWidth = Math.max(
      Number(refs.fixedOverlayHost?.clientWidth || 0) || 0,
      Number(refs.surface?.clientWidth || 0) || 0
    );
    const overlayHeight = Math.max(
      Number(refs.fixedOverlayHost?.clientHeight || 0) || 0,
      Number(refs.surface?.clientHeight || 0) || 0
    );
    const visibleRect = getViewportClampedScreenRect(nodeRect, overlayWidth, overlayHeight);
    if (!visibleRect) {
      clearMindNodeLinkPanelState();
      hideMindNodeLinkPanel();
      return;
    }
    const iconSize = Math.max(18, Math.round((Number(getComputedStyle(refs.mindNodeChrome).getPropertyValue("--mind-link-anchor-size").replace("px", "")) || 18) * 1.08));
    const gap = 2;
    const stripWidth = Math.max(iconSize, iconSize * (entries.length + 1) + gap * Math.max(0, entries.length));
    const stripHeight = iconSize;
    const hoverMenuWidth = iconSize * 2 + gap;
    const hoverMenuHeight = iconSize;
    const panelHeight = Math.max(stripHeight, hoverMenuHeight);
    const panelWidth = Math.max(stripWidth, hoverMenuWidth);
    const anchorInset = Math.max(2, Math.round(Number(getComputedStyle(refs.mindNodeChrome).getPropertyValue("--mind-link-anchor-inset").replace("px", "")) || gap));
    const anchorLeft = Math.round(visibleRect.left + visibleRect.width - anchorInset - iconSize);
    const anchorTop = Math.round(visibleRect.top + visibleRect.height - anchorInset - iconSize - 4);
    const anchorCenterY = Math.round(anchorTop + iconSize / 2 - 6);
    const left = clampTableEditorValue(
      Math.round(anchorLeft - gap - panelWidth),
      12,
      Math.max(12, overlayWidth - panelWidth - 12)
    );
    const top = clampTableEditorValue(
      Math.round(anchorCenterY - panelHeight / 2),
      12,
      Math.max(12, overlayHeight - panelHeight - 12)
    );
    refs.mindNodeLinkPanel.style.left = `${left}px`;
    refs.mindNodeLinkPanel.style.top = `${top}px`;
    refs.mindNodeLinkPanel.style.width = `${panelWidth}px`;
    refs.mindNodeLinkPanel.style.minWidth = `${panelWidth}px`;
    refs.mindNodeLinkPanel.style.height = `${panelHeight}px`;
    refs.mindNodeLinkPanel.style.setProperty("--mind-link-strip-icon-size", `${iconSize}px`);
    refs.mindNodeLinkPanel.style.setProperty("--mind-link-strip-gap", `${gap}px`);
    refs.mindNodeLinkPanel.style.setProperty("--mind-link-strip-loop-width", `${Math.max(6, Math.round(iconSize * 0.33))}px`);
    refs.mindNodeLinkPanel.style.setProperty("--mind-link-strip-loop-height", `${Math.max(4, Math.round(iconSize * 0.2))}px`);
    refs.mindNodeLinkPanel.style.setProperty("--mind-link-strip-stroke", `${Math.max(1.5, Math.round(iconSize * 0.08))}px`);
    refs.mindNodeLinkPanel.setAttribute("data-node-id", String(node.id || ""));
    const strip = refs.mindNodeLinkPanel.querySelector('[data-role="mind-link-strip"]');
    if (strip instanceof HTMLDivElement) {
      const nextMarkup = `
        ${entries
          .map((entry) => {
            const missing = !entry.target;
            const active = activeMindNodeLinkMenuTargetId === entry.targetId;
            return `
              <button
                type="button"
                class="canvas2d-mind-node-link-glyph is-link${missing ? " is-missing" : ""}${active ? " is-active" : ""}"
                data-action="mind-link-open-menu"
                data-target-id="${escapeHtml(entry.targetId)}"
                aria-label="链接"
                title="${escapeHtml(entry.title)}"
                ${missing ? "disabled" : ""}
              ></button>
            `;
          })
          .join("")}
        <button type="button" class="canvas2d-mind-node-link-glyph is-add" data-action="mind-link-add" aria-label="添加链接" title="添加链接"></button>
      `;
      if (strip.innerHTML !== nextMarkup) {
        strip.innerHTML = nextMarkup;
      } else {
        strip.querySelectorAll('[data-action="mind-link-open-menu"]').forEach((button) => {
          if (!(button instanceof HTMLButtonElement)) {
            return;
          }
          const targetId = String(button.getAttribute("data-target-id") || "").trim();
          button.classList.toggle("is-active", targetId === activeMindNodeLinkMenuTargetId);
        });
      }
    }
    const hoverMenu = refs.mindNodeLinkPanel.querySelector('[data-role="mind-link-hover-menu"]');
    if (hoverMenu instanceof HTMLDivElement) {
      const activeEntry = entries.find((entry) => entry.targetId === activeMindNodeLinkMenuTargetId && entry.target);
      if (!activeEntry) {
        hoverMenu.classList.add("is-hidden");
        hoverMenu.innerHTML = "";
      } else {
        hoverMenu.classList.remove("is-hidden");
        hoverMenu.innerHTML = `
          <button type="button" class="canvas2d-mind-node-link-glyph is-jump" data-action="mind-link-focus" data-target-id="${escapeHtml(activeEntry.targetId)}" aria-label="跳转" title="跳转"></button>
          <button type="button" class="canvas2d-mind-node-link-glyph is-delete" data-action="mind-link-remove" data-target-id="${escapeHtml(activeEntry.targetId)}" aria-label="删除链接" title="删除链接"></button>
        `;
      }
    }
    refs.mindNodeLinkPanel.classList.remove("is-hidden");
    refs.mindNodeLinkPanel.setAttribute("aria-hidden", "false");
  }

  function syncEditorLayout() {
    const hasEditing = Boolean(state.editingId);
    if (!hasEditing) {
      if (richColorPreviewFrame) {
        cancelAnimationFrame(richColorPreviewFrame);
        richColorPreviewFrame = 0;
      }
      if (richColorPreviewCommitTimer) {
        clearTimeout(richColorPreviewCommitTimer);
        richColorPreviewCommitTimer = 0;
      }
      pendingRichColorPreview = "";
      if (!resolvePendingCanvasLinkBindingMode()) {
        pendingCanvasLinkBinding = false;
        syncCanvasLinkBindingUi();
      }
      closeRichExternalLinkEditor();
      clearMindNodeLinkPanelState();
      hideMindNodeLinkPanel();
      refs.editor?.classList.add("is-hidden");
      refs.richEditor?.classList.add("is-hidden");
      refs.codeBlockEditor?.classList.add("is-hidden");
      refs.richSelectionToolbar?.classList.add("is-hidden");
      refs.fileMemoEditor?.classList.add("is-hidden");
      refs.imageMemoEditor?.classList.add("is-hidden");
      refs.tableEditor?.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
      refs.codeBlockToolbar?.classList.add("is-hidden");
      lastEditorItemId = null;
      lastFileMemoItemId = null;
      lastImageMemoItemId = null;
      lastTableEditItemId = null;
      tableEditRange = null;
      tableEditFrame = null;
      lastCodeBlockEditItemId = null;
      lightImageEditor.finishEdit();
      richTextSession.clear({ destroyAdapter: false });
      codeBlockEditor.clear();
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
      refs.codeBlockEditor?.classList.add("is-hidden");
      refs.fileMemoEditor?.classList.add("is-hidden");
      refs.imageMemoEditor?.classList.add("is-hidden");
      refs.tableEditor?.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
      refs.codeBlockToolbar?.classList.add("is-hidden");
      return;
    }

    if (state.editingType === "table") {
      syncTableEditorLayout();
      return;
    }

    if (state.editingType === "code-block") {
      syncCodeBlockEditorLayout();
      return;
    }

    if (!(refs.richEditor instanceof HTMLDivElement)) {
      return;
    }
    const isFlowNode = state.editingType === "flow-node";
    const isMindNode = isMindNodeEditingType(state.editingType);
    const item = isMindNode
      ? sceneRegistry.getItemById(state.editingId, "mindNode") || sceneRegistry.getItemById(state.editingId, "mindSummary")
      : sceneRegistry.getItemById(state.editingId, isFlowNode ? "flowNode" : "text");
    if (!item) {
      state.editingId = null;
      state.editingType = null;
      refs.richEditor.classList.add("is-hidden");
      richTextSession.clear({ destroyAdapter: false });
      return;
    }
    if (isFlowNode ? isLockedItem(item) : isMindNode ? isLockedItem(item) : isLockedText(item)) {
      if (isFlowNode) {
        cancelFlowNodeEdit();
      } else if (isMindNode) {
        cancelMindNodeEdit();
      } else {
        cancelTextEdit();
      }
      return;
    }
    const editingContent = isMindNode ? normalizeMindNodeTextContentForEditor(item, { preserveEmpty: true }) : null;
    richTextSession.syncContent({
      itemId: item.id,
      html: isMindNode
        ? editingContent.html
        : normalizeRichHtmlInlineFontSizes(item.html || "", item.fontSize || richFontSize || DEFAULT_TEXT_FONT_SIZE),
      plainText: isMindNode ? editingContent.plainText : item.plainText || item.text || "",
      fontSize: item.fontSize || (isMindNode ? DEFAULT_MIND_NODE_FONT_SIZE : DEFAULT_TEXT_FONT_SIZE),
    });
    richFontSize = normalizeRichEditorFontSize(
      item.fontSize || (isMindNode ? DEFAULT_MIND_NODE_FONT_SIZE : DEFAULT_TEXT_FONT_SIZE),
      isMindNode ? DEFAULT_MIND_NODE_FONT_SIZE : DEFAULT_TEXT_FONT_SIZE
    );
    syncRichTextFontSize();
    syncEditingRichEditorFrame(refs.richEditor, item, state.board.view);
    applyInlineFontSizingToContainer(refs.richEditor, state.board.view.scale);
    refs.editor?.classList.add("is-hidden");
    refs.richEditor.classList.remove("is-hidden");
    syncRichTextToolbar();
  }

  function getActiveRichEditingItem() {
    if (!state.editingId || (state.editingType !== "text" && state.editingType !== "flow-node" && !isMindNodeEditingType(state.editingType))) {
      return null;
    }
    return sceneRegistry.getItemById(state.editingId) || null;
  }

  function getMindNodeDepth(item = null) {
    if (!item) {
      return 0;
    }
    if (Number.isFinite(Number(item.depth))) {
      return Math.max(0, Number(item.depth));
    }
    let depth = 0;
    let current = item;
    const visited = new Set();
    while (current?.parentId) {
      const parentId = String(current.parentId || "").trim();
      if (!parentId || visited.has(parentId)) {
        break;
      }
      visited.add(parentId);
      const parent = sceneRegistry.getItemById(parentId, "mindNode");
      if (!parent) {
        break;
      }
      depth += 1;
      current = parent;
    }
    return depth;
  }

  function resolveMindNodeDefaultBlockType(item = null) {
    const depth = getMindNodeDepth(item);
    if (depth <= 0) {
      return "heading-1";
    }
    if (depth === 1) {
      return "heading-3";
    }
    return "paragraph";
  }

  function resolveMindNodeFixedFontSize(item = null) {
    const depth = getMindNodeDepth(item);
    if (depth <= 0) {
      return 18;
    }
    if (depth === 1) {
      return 16;
    }
    return 14;
  }

  function buildEmptyMindNodeEditorHtml(item = null) {
    const targetBlockType = resolveMindNodeDefaultBlockType(item);
    if (targetBlockType === "heading-1") {
      return "<h1><br></h1>";
    }
    if (targetBlockType === "heading-3") {
      return "<h3><br></h3>";
    }
    return "<p><br></p>";
  }

  function ensureMindNodeRichTextSemanticDefaults(item = null) {
    if (!item || !richTextSession.isActive()) {
      return;
    }
    const targetBlockType = resolveMindNodeDefaultBlockType(item);
    const formatState = richTextSession.getFormatState?.() || {};
    const currentBlockType = String(formatState.blockType || "").trim().toLowerCase();
    if (currentBlockType !== targetBlockType) {
      richTextSession.command?.("setBlockType", targetBlockType);
    }
  }

  function isMindNodeRichEditingActive() {
    const item = getActiveRichEditingItem();
    return item?.type === "mindNode" || item?.type === "mindSummary";
  }

  function normalizeMindNodeRichTextDocumentForLevel(documentValue = null, item = null) {
    const targetBlockType = resolveMindNodeDefaultBlockType(item);
    const targetHeadingLevel = targetBlockType === "heading-1" ? 1 : targetBlockType === "heading-3" ? 3 : 0;
    const sourceBlocks = Array.isArray(documentValue?.blocks) ? documentValue.blocks : [];
    const normalizedBlocks = sourceBlocks
      .map((block) => {
        if (!block || typeof block !== "object") {
          return null;
        }
        const inlineContent = Array.isArray(block.content) ? block.content.filter(Boolean) : [];
        if (targetHeadingLevel > 0) {
          return {
            type: "heading",
            attrs: {
              level: targetHeadingLevel,
            },
            content: inlineContent,
          };
        }
        return {
          type: "paragraph",
          content: inlineContent,
        };
      })
      .filter((block) => Array.isArray(block?.content) && block.content.length);
    if (!normalizedBlocks.length) {
      normalizedBlocks.push(
        targetHeadingLevel > 0
          ? { type: "heading", attrs: { level: targetHeadingLevel }, content: [] }
          : { type: "paragraph", content: [] }
      );
    }
    return {
      ...(documentValue && typeof documentValue === "object" ? documentValue : {}),
      blocks: normalizedBlocks,
    };
  }

  function normalizeMindNodeTextContentForEditor(item = null, { preserveEmpty = true } = {}) {
    const fixedFontSize = resolveMindNodeFixedFontSize(item);
    if (!item) {
      return {
        html: "",
        plainText: "",
        text: "",
        richTextDocument: normalizeMindNodeRichTextDocumentForLevel(null, item),
        linkTokens: [],
        urlMetaCache: {},
        fontSize: fixedFontSize,
        textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
        textResizeMode: TEXT_RESIZE_MODE_WRAP,
      };
    }
    const fallbackPlainText = preserveEmpty
      ? String(item.plainText || item.text || item.title || "")
      : String(item.plainText || item.text || item.title || "").trim();
    const content = normalizeTextContentModel(
      {
        ...item,
        plainText: fallbackPlainText,
        text: fallbackPlainText,
        html: item.html || "",
        textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
        textResizeMode: TEXT_RESIZE_MODE_WRAP,
      },
      {
        ...item,
        plainText: fallbackPlainText,
        text: fallbackPlainText,
        html: item.html || "",
        fontSize: item.fontSize || DEFAULT_MIND_NODE_FONT_SIZE,
      }
    );
    const richTextDocument = normalizeMindNodeRichTextDocumentForLevel(content.richTextDocument, item);
    const serializedHtml = serializeRichTextDocumentToHtml(richTextDocument, content.html || "");
    const html = normalizeRichHtmlInlineFontSizes(
      serializedHtml.trim() ? serializedHtml : buildEmptyMindNodeEditorHtml(item),
      fixedFontSize
    );
    const plainText = serializeRichTextDocumentToPlainText(richTextDocument, content.plainText || fallbackPlainText);
    return {
      ...content,
      html,
      plainText,
      text: plainText,
      richTextDocument,
      fontSize: normalizeRichEditorFontSize(fixedFontSize, fixedFontSize),
      textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
      textResizeMode: TEXT_RESIZE_MODE_WRAP,
    };
  }

  function applyMindNodeTextContent(item, content) {
    if (!item || !content) {
      return item;
    }
    item.html = content.html || "";
    item.text = content.plainText || "";
    item.plainText = content.plainText || "";
    item.richTextDocument = content.richTextDocument || null;
    item.linkTokens = Array.isArray(content.linkTokens) ? content.linkTokens : [];
    item.urlMetaCache = content.urlMetaCache && typeof content.urlMetaCache === "object" ? content.urlMetaCache : {};
    item.fontSize = resolveMindNodeFixedFontSize(item);
    item.textBoxLayoutMode = TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT;
    item.textResizeMode = TEXT_RESIZE_MODE_WRAP;
    item.title = buildTextTitle(content.plainText || "");
    return Object.assign(item, syncMindNodeTextMetrics(item));
  }

  function getTableCellKey(rowIndex = 0, columnIndex = 0) {
    return `${Math.max(0, Number(rowIndex) || 0)}:${Math.max(0, Number(columnIndex) || 0)}`;
  }

  function getActiveTableCellRichEditingContext() {
    if (state.editingType !== "table" || !tableCellEditState.active) {
      return null;
    }
    const item = getTableEditItem();
    if (!item) {
      return null;
    }
    return {
      item,
      rowIndex: Math.max(0, Number(tableCellEditState.rowIndex) || 0),
      columnIndex: Math.max(0, Number(tableCellEditState.columnIndex) || 0),
      cellKey: getTableCellKey(tableCellEditState.rowIndex, tableCellEditState.columnIndex),
      session: tableCellRichTextSession,
      editorElement: refs.tableCellRichEditor,
    };
  }

  function getActiveRichSessionContext() {
    const tableCellContext = getActiveTableCellRichEditingContext();
    if (tableCellContext) {
      return tableCellContext;
    }
    const item = getActiveRichEditingItem();
    if (!item || !richTextSession.isActive()) {
      return null;
    }
    return {
      item,
      rowIndex: -1,
      columnIndex: -1,
      cellKey: "",
      session: richTextSession,
      editorElement: refs.richEditor,
    };
  }

  function getActiveRichSession() {
    return getActiveRichSessionContext()?.session || null;
  }

  function getActiveRichSessionIdentity() {
    const context = getActiveRichSessionContext();
    if (!context) {
      return null;
    }
    return {
      itemId: String(context.item?.id || ""),
      itemType: String(context.item?.type || context.session?.getItemType?.() || ""),
      cellKey: String(context.cellKey || ""),
    };
  }

  function resolveRichCommandTarget() {
    const active = getActiveRichEditingItem();
    if (active && (active.type === "text" || active.type === "flowNode" || active.type === "mindNode")) {
      return active;
    }
    const selected = getSingleSelectedItemFast();
    if (!selected || (selected.type !== "text" && selected.type !== "flowNode" && selected.type !== "mindNode")) {
      return null;
    }
    if (state.editingId !== selected.id) {
      if (selected.type === "flowNode") {
        beginFlowNodeEdit(selected.id);
      } else if (selected.type === "mindNode") {
        beginMindNodeEdit(selected.id);
      } else {
        beginTextEdit(selected.id);
      }
    }
    const rebound = getActiveRichEditingItem();
    return rebound && (rebound.type === "text" || rebound.type === "flowNode" || rebound.type === "mindNode") ? rebound : null;
  }

  function isRecognizedExternalLinkValue(value = "") {
    const raw = String(value || "").trim();
    if (!raw || isCanvasInternalLinkUrl(raw)) {
      return false;
    }
    return Boolean(normalizeUserLinkInput(raw));
  }

  function closeRichExternalLinkEditor({ restoreFocus = false } = {}) {
    pendingRichExternalLinkEdit = null;
    if (refs.richExternalLinkPanel instanceof HTMLDivElement) {
      refs.richExternalLinkPanel.classList.add("is-hidden");
      refs.richExternalLinkPanel.setAttribute("aria-hidden", "true");
    }
    const activeSession = getActiveRichSession();
    if (restoreFocus && activeSession?.isActive?.()) {
      requestAnimationFrame(() => {
        activeSession.focus();
        activeSession.captureSelection?.();
      });
    }
  }

  function syncRichExternalLinkEditorUi() {
    if (!(refs.richExternalLinkPanel instanceof HTMLDivElement) || !(refs.surface instanceof HTMLDivElement)) {
      return;
    }
    const stateValue = pendingRichExternalLinkEdit;
    const activeContext = getActiveRichSessionContext();
    const activeIdentity = getActiveRichSessionIdentity();
    if (
      !stateValue ||
      !activeContext ||
      !activeIdentity ||
      !activeContext.session?.isActive?.() ||
      stateValue.itemId !== activeIdentity.itemId ||
      stateValue.itemType !== activeIdentity.itemType ||
      stateValue.cellKey !== activeIdentity.cellKey
    ) {
      refs.richExternalLinkPanel.classList.add("is-hidden");
      refs.richExternalLinkPanel.setAttribute("aria-hidden", "true");
      return;
    }
    const input = refs.richExternalLinkPanel.querySelector('[data-role="rich-link-input"]');
    const removeButton = refs.richExternalLinkPanel.querySelector('[data-action="rich-link-remove"]');
    if (input instanceof HTMLInputElement) {
      if (document.activeElement !== input || input.value !== String(stateValue.rawValue || "")) {
        input.value = String(stateValue.rawValue || "");
      }
    }
    if (removeButton instanceof HTMLButtonElement) {
      removeButton.disabled = !stateValue.editingExistingLink && !String(stateValue.rawValue || "").trim();
    }
    refs.richExternalLinkPanel.classList.remove("is-hidden");
    refs.richExternalLinkPanel.setAttribute("aria-hidden", "false");
    const hostRect = refs.surface.getBoundingClientRect();
    const anchorRect = stateValue.anchorRect || null;
    const width = Math.max(280, refs.richExternalLinkPanel.offsetWidth || refs.richExternalLinkPanel.getBoundingClientRect().width || 320);
    const height = Math.max(1, refs.richExternalLinkPanel.offsetHeight || refs.richExternalLinkPanel.getBoundingClientRect().height || 0);
    const margin = 12;
    const gap = 12;
    let anchorCenterX = hostRect.width / 2;
    let anchorTop = margin;
    let anchorBottom = margin;
    if (anchorRect) {
      anchorCenterX = ((Number(anchorRect.left || 0) + Number(anchorRect.right || 0)) / 2) - hostRect.left;
      anchorTop = Number(anchorRect.top || 0) - hostRect.top;
      anchorBottom = Number(anchorRect.bottom || 0) - hostRect.top;
    } else if (refs.richSelectionToolbar instanceof HTMLDivElement && !refs.richSelectionToolbar.classList.contains("is-hidden")) {
      const toolbarRect = refs.richSelectionToolbar.getBoundingClientRect();
      anchorCenterX = ((toolbarRect.left + toolbarRect.right) / 2) - hostRect.left;
      anchorTop = toolbarRect.top - hostRect.top;
      anchorBottom = toolbarRect.bottom - hostRect.top;
    } else if (refs.richToolbar instanceof HTMLDivElement && !refs.richToolbar.classList.contains("is-hidden")) {
      const toolbarRect = refs.richToolbar.getBoundingClientRect();
      anchorCenterX = ((toolbarRect.left + toolbarRect.right) / 2) - hostRect.left;
      anchorTop = toolbarRect.top - hostRect.top;
      anchorBottom = toolbarRect.bottom - hostRect.top;
    }
    let left = Math.round(anchorCenterX - width / 2);
    let top = Math.round(anchorBottom + gap);
    if (top + height > hostRect.height - margin) {
      top = Math.round(anchorTop - height - gap);
    }
    const maxLeft = Math.max(margin, hostRect.width - width - margin);
    const maxTop = Math.max(margin, hostRect.height - height - margin);
    left = Math.max(margin, Math.min(left, maxLeft));
    top = Math.max(margin, Math.min(top, maxTop));
    refs.richExternalLinkPanel.style.left = `${left}px`;
    refs.richExternalLinkPanel.style.top = `${top}px`;
  }

  function focusRichExternalLinkEditorInput({ select = true } = {}) {
    const input = refs.richExternalLinkPanel?.querySelector?.('[data-role="rich-link-input"]');
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    requestAnimationFrame(() => {
      input.focus();
      if (select) {
        input.select();
      }
    });
  }

  function openRichExternalLinkEditor({ prefill = "", selectionText = "", editingExistingLink = false, anchorRect = null } = {}) {
    const activeContext = getActiveRichSessionContext();
    const activeSession = activeContext?.session || null;
    const targetItem = activeContext?.item || resolveRichCommandTarget();
    if (!targetItem || !activeSession?.isActive?.()) {
      setStatus("请先选中文本或进入文本编辑态");
      return false;
    }
    const normalizedSelectionText = String(selectionText || "").trim();
    const normalizedPrefill = String(prefill || "").trim();
    pendingRichExternalLinkEdit = {
      itemId: targetItem.id,
      itemType: String(activeContext?.item?.type || activeSession.getItemType?.() || ""),
      cellKey: String(activeContext?.cellKey || ""),
      selectionText: normalizedSelectionText,
      rawValue: normalizedPrefill,
      editingExistingLink: Boolean(editingExistingLink),
      autoDetected: Boolean(!editingExistingLink && normalizedSelectionText && normalizedPrefill && normalizedSelectionText === normalizedPrefill),
      anchorRect:
        anchorRect && Number.isFinite(Number(anchorRect.left)) && Number.isFinite(Number(anchorRect.top))
          ? {
              left: Number(anchorRect.left || 0),
              top: Number(anchorRect.top || 0),
              right: Number(anchorRect.right || 0),
              bottom: Number(anchorRect.bottom || 0),
            }
          : null,
    };
    closeRichToolbarSubmenus();
    syncRichExternalLinkEditorUi();
    focusRichExternalLinkEditorInput();
    setStatus("外部链接模式：输入链接后应用，Esc 可关闭");
    return true;
  }

  function applyRichExternalLinkEditor({ closeAfterApply = false, remove = false } = {}) {
    const activeContext = getActiveRichSessionContext();
    const activeIdentity = getActiveRichSessionIdentity();
    const activeSession = activeContext?.session || null;
    if (
      !pendingRichExternalLinkEdit ||
      !activeContext ||
      !activeIdentity ||
      !activeSession?.isActive?.() ||
      pendingRichExternalLinkEdit.itemId !== activeIdentity.itemId ||
      pendingRichExternalLinkEdit.itemType !== activeIdentity.itemType ||
      pendingRichExternalLinkEdit.cellKey !== activeIdentity.cellKey
    ) {
      return false;
    }
    const input = refs.richExternalLinkPanel?.querySelector?.('[data-role="rich-link-input"]');
    const raw = remove ? "" : String(input instanceof HTMLInputElement ? input.value : pendingRichExternalLinkEdit.rawValue || "").trim();
    pendingRichExternalLinkEdit.rawValue = raw;
    const normalizedUrl = normalizeUserLinkInput(raw);
    if (raw && !normalizedUrl) {
      setStatus("链接格式无效（支持 http/https/mailto/tel/file/本地路径）");
      focusRichExternalLinkEditorInput({ select: true });
      return false;
    }
    const selection = activeSession.getSelectionSnapshot?.() || null;
    const hasEditableSelection = Boolean(selection?.inside && !selection?.collapsed);
    if (normalizedUrl && !pendingRichExternalLinkEdit.editingExistingLink && !hasEditableSelection) {
      setStatus("请先选中要加链接的文本");
      focusRichExternalLinkEditorInput({ select: true });
      return false;
    }
    activeSession.focus();
    if (normalizedUrl && hasEditableSelection) {
      activeSession.command("unlink");
    }
    const ok = normalizedUrl ? activeSession.command("createLink", normalizedUrl) : activeSession.command("unlink");
    if (!ok) {
      setStatus("链接创建失败，请重新选中文本后再试");
      focusRichExternalLinkEditorInput({ select: true });
      return false;
    }
    pendingRichExternalLinkEdit.editingExistingLink = Boolean(normalizedUrl);
    pendingRichExternalLinkEdit.rawValue = normalizedUrl || "";
    pendingRichExternalLinkEdit.autoDetected = false;
    if (activeContext?.editorElement) {
      applyInlineFontSizingToContainer(activeContext.editorElement, state.board.view.scale);
    }
    syncActiveRichEditingItemState();
    syncRichTextToolbar();
    syncRichExternalLinkEditorUi();
    setStatus(normalizedUrl ? "已更新外部链接" : "已移除外部链接");
    if (closeAfterApply) {
      closeRichExternalLinkEditor({ restoreFocus: true });
    } else {
      focusRichExternalLinkEditorInput({ select: true });
    }
    return true;
  }

  function runRichLinkCommand() {
    const activeContext = getActiveRichSessionContext();
    const activeSession = activeContext?.session || null;
    const targetItem = activeContext?.item || resolveRichCommandTarget();
    if (!targetItem || !activeSession?.isActive?.()) {
      setStatus("请先选中文本或进入文本编辑态");
      return;
    }
    activeSession.captureSelection?.();
    const formatState = activeSession.getFormatState() || {};
    const selection = activeSession.getSelectionSnapshot?.() || null;
    const hasEditableSelection = Boolean(selection?.inside && !selection?.collapsed);
    const editingExistingLink = Boolean(formatState.link && formatState.currentLinkHref);
    if (!hasEditableSelection && !editingExistingLink) {
      setStatus("请先选中要加链接的文本，或将光标放到已有链接内");
      return;
    }
    activeSession.focus();
    const currentHref = String(formatState.currentLinkHref || "").trim();
    const selectionText = String(selection?.text || "").trim();
    const suggestedUrl =
      (!isCanvasInternalLinkUrl(currentHref) && currentHref) ||
      (isRecognizedExternalLinkValue(selectionText) ? selectionText : "");
    openRichExternalLinkEditor({
      prefill: suggestedUrl,
      selectionText,
      editingExistingLink: Boolean(editingExistingLink && !isCanvasInternalLinkUrl(currentHref)),
      anchorRect: selection?.rect || null,
    });
  }

  function runRichCanvasLinkCommand() {
    const activeContext = getActiveRichSessionContext();
    const activeSession = activeContext?.session || null;
    const targetItem = activeContext?.item || resolveRichCommandTarget();
    if (!targetItem || !activeSession?.isActive?.()) {
      setStatus("请先选中文本或进入文本编辑态");
      return;
    }
    const selection = activeSession.getSelectionSnapshot?.() || null;
    if (!selection?.inside || selection?.collapsed) {
      setStatus("请先选中要绑定链接的文本");
      return;
    }
    activeSession.focus();
    activeSession.captureSelection?.();
    pendingCanvasLinkBinding = true;
    syncCanvasLinkBindingUi();
    closeRichToolbarSubmenus();
    setStatus("画布链接模式：请在画布中点击目标元素（Esc 取消）");
  }

  function focusCanvasLinkTarget(itemId = "") {
    const targetId = String(itemId || "").trim();
    if (!targetId) {
      return false;
    }
    const item =
      state.board.items.find((entry) => String(entry?.id || "") === targetId) ||
      sceneRegistry.getItemById(targetId);
    if (!item) {
      setStatus("目标元素不存在或已删除");
      return false;
    }
    const bounds = getElementBounds(item);
    const center = {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
    const rect = getCanvasRect();
    const scale = Math.max(0.1, Number(state.board.view.scale || 1));
    const nextView = {
      ...state.board.view,
      offsetX: rect.width / 2 - center.x * scale,
      offsetY: rect.height / 2 - center.y * scale,
    };
    const applyJumpState = ({ emit = true } = {}) => {
      state.board.view = {
        ...nextView,
      };
      state.board.selectedIds = [item.id];
      state.lastSelectionSource = "link-jump";
      syncBoard({ persist: false, emit, sceneChange: false, viewChange: true, fullOverlayRescan: false });
    };
    applyJumpState();
    requestAnimationFrame(() => {
      if (
        state.board.selectedIds.length === 1 &&
        state.board.selectedIds[0] === item.id &&
        Number(state.board.view.offsetX || 0) === Number(nextView.offsetX || 0) &&
        Number(state.board.view.offsetY || 0) === Number(nextView.offsetY || 0)
      ) {
        return;
      }
      applyJumpState();
    });
    setTimeout(() => {
      if (
        state.board.selectedIds.length === 1 &&
        state.board.selectedIds[0] === item.id &&
        Number(state.board.view.offsetX || 0) === Number(nextView.offsetX || 0) &&
        Number(state.board.view.offsetY || 0) === Number(nextView.offsetY || 0)
      ) {
        return;
      }
      applyJumpState();
    }, 80);
    setStatus("已跳转到画布链接目标");
    return true;
  }

  function scheduleFocusCanvasLinkTarget(itemId = "") {
    const targetId = String(itemId || "").trim();
    if (!targetId) {
      return;
    }
    requestAnimationFrame(() => {
      focusCanvasLinkTarget(targetId);
    });
  }

  function bindCanvasLinkToSelection(itemId = "") {
    const targetId = String(itemId || "").trim();
    if (!targetId) {
      setStatus("未选中有效目标元素");
      return false;
    }
    const activeContext = getActiveRichSessionContext();
    const activeSession = activeContext?.session || null;
    const editingItem = activeContext?.item || getActiveRichEditingItem();
    if (!editingItem || !activeSession?.isActive?.()) {
      setStatus("请先进入文本编辑态");
      return false;
    }
    if (editingItem?.id && editingItem.id === targetId) {
      setStatus("不能把画布链接绑定到当前正在编辑的元素");
      return false;
    }
    const linkUrl = buildCanvasInternalLinkUrl(targetId);
    if (!linkUrl) {
      setStatus("画布链接生成失败");
      return false;
    }
    activeSession.focus();
    activeSession.command("unlink");
    const ok = activeSession.command("createLink", linkUrl);
    if (!ok) {
      setStatus("画布链接创建失败，请重新选中文本后再试");
      return false;
    }
    syncActiveRichEditingItemState();
    if (activeContext?.editorElement) {
      applyInlineFontSizingToContainer(activeContext.editorElement, state.board.view.scale);
    }
    setStatus("已创建画布链接");
    return true;
  }

  function getRichTextSelectionState() {
    const activeContext = getActiveRichSessionContext();
    const editingItem = activeContext?.item && activeContext.item.type !== "table" ? activeContext.item : null;
    const activeSession = activeContext?.session || null;
    const snapshot = activeSession?.getSelectionSnapshot?.() || null;
    const hasExpandedSelection = Boolean(
      activeContext &&
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
      formatState: activeSession?.getFormatState?.() || {},
    };
  }

  function normalizeRichToolbarColorValue(value = "", fallback = "") {
    const source = String(value || "").trim();
    const fallbackValue = String(fallback || "").trim();
    if (!source) {
      return fallbackValue;
    }
    if (typeof document === "undefined") {
      return source.toLowerCase();
    }
    const probe = document.createElement("span");
    probe.style.color = "";
    probe.style.color = source;
    if (!probe.style.color) {
      return fallbackValue || source.toLowerCase();
    }
    return probe.style.color;
  }

  function toComparableRichToolbarColor(value = "", fallback = "") {
    return normalizeRichToolbarColorValue(value, fallback).replace(/\s+/g, "").toLowerCase();
  }

  function getRichToolbarColorLabel(color = "", slotIndex = -1) {
    const normalized = toComparableRichToolbarColor(color);
    const defaultLabels = ["黑色", "红色", "蓝色"];
    if (slotIndex >= 0 && slotIndex < defaultLabels.length) {
      const defaultColor = toComparableRichToolbarColor(RICH_TOOLBAR_DEFAULT_COLOR_SLOTS[slotIndex]);
      if (normalized === defaultColor) {
        return defaultLabels[slotIndex];
      }
    }
    return `自定义色 ${String(color || "").trim() || "#"}`;
  }

  function normalizeRichToolbarPresetColors(colors = []) {
    const seen = new Set();
    const normalized = [];
    (Array.isArray(colors) ? colors : []).forEach((entry) => {
      const color = normalizeRichToolbarColorValue(entry, "");
      if (!color) {
        return;
      }
      const key = toComparableRichToolbarColor(color);
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      normalized.push(color);
    });
    return normalized.slice(0, RICH_TOOLBAR_PRESET_COLOR_LIMIT);
  }

  function renderRichToolbarPresetButtons(toolbar) {
    if (!(toolbar instanceof HTMLDivElement)) {
      return;
    }
    const normalizedPresets = normalizeRichToolbarPresetColors(richToolbarPresetColors);
    richToolbarPresetColors = normalizedPresets.length
      ? normalizedPresets
      : RICH_TOOLBAR_DEFAULT_PRESET_COLORS.slice(0, RICH_TOOLBAR_PRESET_COLOR_LIMIT);
    const markup = richToolbarPresetColors
      .map(
        (color) =>
          `<button type="button" class="canvas2d-rich-btn color-swatch canvas2d-rich-color-preset-btn" data-action="color-preset" data-color="${color}" title="${color}"></button>`
      )
      .join("");
    toolbar.querySelectorAll('[data-role="rich-color-presets-grid"]').forEach((grid) => {
      if (!(grid instanceof HTMLElement)) {
        return;
      }
      if (grid.innerHTML !== markup) {
        grid.innerHTML = markup;
      }
    });
  }

  function syncRichToolbarColorControls(toolbar, formatState = {}) {
    if (!(toolbar instanceof HTMLDivElement)) {
      return;
    }
    const activeComparableColor = toComparableRichToolbarColor(formatState.color, richToolbarColorSlots[0]);
    toolbar.querySelectorAll('[data-role="rich-color-slot"]').forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const slotIndex = Number(button.getAttribute("data-slot-index") || -1);
      const slotColor = normalizeRichToolbarColorValue(
        richToolbarColorSlots[slotIndex] || RICH_TOOLBAR_DEFAULT_COLOR_SLOTS[slotIndex] || RICH_TOOLBAR_DEFAULT_COLOR_SLOTS[0],
        RICH_TOOLBAR_DEFAULT_COLOR_SLOTS[0]
      );
      button.setAttribute("data-color", slotColor);
      button.style.background = slotColor;
      button.style.backgroundColor = slotColor;
      button.title = getRichToolbarColorLabel(slotColor, slotIndex);
      button.classList.toggle("is-active", activeComparableColor && activeComparableColor === toComparableRichToolbarColor(slotColor));
    });
    toolbar.querySelectorAll('[data-action="color-picker"]').forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      const value = normalizeRichToolbarColorValue(richToolbarColorSlots[2], RICH_TOOLBAR_DEFAULT_COLOR_SLOTS[2]);
      if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
        input.value = value;
      }
    });
    renderRichToolbarPresetButtons(toolbar);
    toolbar.querySelectorAll('[data-action="color-preset"]').forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const color = normalizeRichToolbarColorValue(button.getAttribute("data-color"), RICH_TOOLBAR_DEFAULT_COLOR_SLOTS[2]);
      button.style.background = color;
      button.style.backgroundColor = color;
      button.classList.toggle("is-active", activeComparableColor && activeComparableColor === toComparableRichToolbarColor(color));
    });
  }

  function syncAllRichToolbarColorControls(formatState = null) {
    const resolved = formatState || getActiveRichSession()?.getFormatState?.() || {};
    syncRichToolbarColorControls(refs.richToolbar, resolved);
    syncRichToolbarColorControls(refs.richSelectionToolbar, resolved);
  }

  function setRichToolbarCustomColor(nextColor = "", { apply = true, closePanel = true } = {}) {
    const normalized = normalizeRichToolbarColorValue(nextColor, "");
    if (!normalized) {
      return false;
    }
    richToolbarColorSlots[2] = normalized;
    syncAllRichToolbarColorControls();
    if (apply) {
      applyRichTextCommand("color", normalized);
    }
    if (closePanel) {
      closeRichToolbarSubmenus();
    }
    return true;
  }

  function scheduleRichColorPreview() {
    if (richColorPreviewFrame) {
      return;
    }
    richColorPreviewFrame = requestAnimationFrame(() => {
      richColorPreviewFrame = 0;
      const color = normalizeRichToolbarColorValue(pendingRichColorPreview, "");
      const activeSession = getActiveRichSession();
      if (!color || !activeSession?.isActive?.()) {
        return;
      }
      activeSession.focus();
      activeSession.command("foreColor", color);
      activeSession.captureSelection();
      syncRichToolbarButtons(refs.richToolbar, activeSession.getFormatState() || {}, { editingItem: getActiveRichEditingItem() });
      syncRichToolbarButtons(refs.richSelectionToolbar, activeSession.getFormatState() || {}, { editingItem: getActiveRichEditingItem() });
      if (richColorPreviewCommitTimer) {
        clearTimeout(richColorPreviewCommitTimer);
      }
      richColorPreviewCommitTimer = setTimeout(() => {
        richColorPreviewCommitTimer = 0;
        syncActiveRichEditingItemState({ emit: false, refreshToolbar: true, markDirty: true });
      }, 90);
    });
  }

  function previewRichToolbarCustomColor(nextColor = "") {
    const normalized = normalizeRichToolbarColorValue(nextColor, "");
    if (!normalized) {
      return false;
    }
    richToolbarColorSlots[2] = normalized;
    pendingRichColorPreview = normalized;
    syncAllRichToolbarColorControls();
    scheduleRichColorPreview();
    return true;
  }

  function addRichToolbarPresetColor(nextColor = "") {
    const normalized = normalizeRichToolbarColorValue(nextColor, richToolbarColorSlots[2]);
    if (!normalized) {
      return false;
    }
    const comparable = toComparableRichToolbarColor(normalized);
    if (richToolbarPresetColors.some((entry) => toComparableRichToolbarColor(entry) === comparable)) {
      return false;
    }
    const next = normalizeRichToolbarPresetColors([...richToolbarPresetColors, normalized]);
    richToolbarPresetColors = next.length ? next : richToolbarPresetColors;
    syncAllRichToolbarColorControls();
    return true;
  }

  function resetRichToolbarDefaultColors({ apply = false } = {}) {
    richToolbarColorSlots = RICH_TOOLBAR_DEFAULT_COLOR_SLOTS.slice();
    richToolbarPresetColors = RICH_TOOLBAR_DEFAULT_PRESET_COLORS.slice();
    syncAllRichToolbarColorControls();
    if (apply) {
      applyRichTextCommand("color", richToolbarColorSlots[0]);
    }
  }

function syncRichToolbarButtons(toolbar, formatState = {}, { editingItem = null } = {}) {
  if (!(toolbar instanceof HTMLDivElement)) {
    return;
  }
  const isMindNodeEditor = editingItem?.type === "mindNode" || editingItem?.type === "mindSummary";
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
      } else if (action === "toggle-blockquote-menu") {
        button.classList.toggle("is-active", formatState.blockType === "blockquote");
      } else if (action === "horizontal-rule") {
        button.classList.toggle("is-active", formatState.blockType === "horizontal-rule");
      } else if (action === "text-split") {
        button.classList.remove("is-active");
      } else if (action === "insert-math" || action === "toggle-math-menu") {
        button.classList.toggle("is-active", Boolean(formatState.canEditMath));
      } else if (action === "underline") {
        button.classList.toggle("is-active", Boolean(formatState.underline));
      } else if (action === "color") {
        const buttonColor = button.getAttribute("data-color") || "";
        button.classList.toggle(
          "is-active",
          toComparableRichToolbarColor(buttonColor) &&
            toComparableRichToolbarColor(buttonColor) ===
              toComparableRichToolbarColor(formatState.color, richToolbarColorSlots[0])
        );
      } else if (action === "align-left") {
        button.classList.toggle("is-active", String(formatState.align || "left") === "left");
      } else if (action === "align-center") {
        button.classList.toggle("is-active", String(formatState.align || "") === "center");
      } else if (action === "align-right") {
        button.classList.toggle("is-active", String(formatState.align || "") === "right");
      }
    });
  syncRichToolbarColorControls(toolbar, formatState);
  toolbar.querySelectorAll(".canvas2d-rich-submenu").forEach((submenu) => {
    if (!(submenu instanceof HTMLElement)) {
      return;
    }
    const submenuType = String(submenu.getAttribute("data-submenu") || "").trim().toLowerCase();
    const currentLinkHref = String(formatState.currentLinkHref || "").trim();
    const isActive =
      submenuType === "blockquote"
        ? formatState.blockType === "blockquote"
        : submenuType === "math"
          ? Boolean(formatState.canEditMath)
        : submenuType === "link"
            ? Boolean(formatState.link)
          : false;
    submenu.classList.toggle("is-active", isActive);
    if (submenuType === "link") {
      submenu.classList.toggle("is-canvas-link", isCanvasInternalLinkUrl(currentLinkHref));
    }
  });
  toolbar.querySelectorAll('[data-action="block-type"]').forEach((input) => {
    if (!(input instanceof HTMLSelectElement)) {
      return;
    }
      const value = String(formatState.blockType || "paragraph");
      input.value = /^heading-[1-6]$/.test(value) || value === "paragraph" ? value : "paragraph";
      input.disabled = isMindNodeEditor;
      input.classList.toggle("is-disabled", isMindNodeEditor);
      input.setAttribute("aria-disabled", isMindNodeEditor ? "true" : "false");
    });
  toolbar.querySelectorAll("[data-size-control], [data-action=\"selection-font-size-input\"], [data-action=\"toggle-font-size-panel\"], [data-action=\"font-size-preset\"]").forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    if (isMindNodeEditor) {
      node.setAttribute("aria-disabled", "true");
      if ("disabled" in node) {
        node.disabled = true;
      }
      node.classList.add("is-disabled");
    } else {
      node.removeAttribute("aria-disabled");
      if ("disabled" in node) {
        node.disabled = false;
      }
      node.classList.remove("is-disabled");
    }
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

function syncRichToolbarWrapState(toolbar, { forceWrapped = false, availableWidth = 0, widthBuffer = 0 } = {}) {
  if (!(toolbar instanceof HTMLDivElement)) {
    return;
  }
  const width = Math.max(0, Number(availableWidth || 0));
  const buffer = Math.max(0, Number(widthBuffer || 0));
  const primaryRow = toolbar.querySelector(".canvas2d-rich-toolbar-row-single");
  const naturalWidth =
    primaryRow instanceof HTMLElement
      ? Math.max(
          Math.ceil(primaryRow.scrollWidth || 0),
          Math.ceil(primaryRow.getBoundingClientRect().width || 0)
        )
      : Math.max(
          Math.ceil(toolbar.scrollWidth || 0),
          Math.ceil(toolbar.getBoundingClientRect().width || 0)
        );
  const effectiveWidth = width > 0 ? Math.max(0, width - buffer) : 0;
  const shouldWrapByWidth = effectiveWidth > 0 && naturalWidth > effectiveWidth + 1;
  toolbar.classList.toggle("is-wrapped", forceWrapped || shouldWrapByWidth);
}

function getRichToolbarSubmenuRoots() {
  const toolbars = [refs.richToolbar, refs.richSelectionToolbar].filter((entry) => entry instanceof HTMLDivElement);
  return toolbars.flatMap((toolbar) => Array.from(toolbar.querySelectorAll(".canvas2d-rich-submenu")));
}

function getRichToolbarColorControlRoots() {
  const toolbars = [refs.richToolbar, refs.richSelectionToolbar].filter((entry) => entry instanceof HTMLDivElement);
  return toolbars.flatMap((toolbar) => Array.from(toolbar.querySelectorAll('[data-role="rich-color-control"]')));
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
  getRichToolbarColorControlRoots().forEach((control) => {
    if (!(control instanceof HTMLElement)) {
      return;
    }
    const shouldKeepOpen = except instanceof HTMLElement && control === except;
    control.classList.toggle("is-open", shouldKeepOpen);
    const panel = control.querySelector('[data-role="rich-color-panel"]');
    const toggle = control.querySelector('[data-action="toggle-color-panel"]');
    if (panel instanceof HTMLElement) {
      panel.classList.toggle("is-hidden", !shouldKeepOpen);
      panel.style.display = shouldKeepOpen ? "grid" : "none";
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
  if (nextOpen) {
    syncRichToolbarSubmenuPanelPosition(submenu);
  }
}

function syncRichToolbarColorPanelPosition(control) {
  if (!(control instanceof HTMLElement)) {
    return;
  }
  const panel = control.querySelector('[data-role="rich-color-panel"]');
  if (!(panel instanceof HTMLElement) || !(refs.surface instanceof HTMLDivElement)) {
    return;
  }
  const gap = 8;
  const margin = 8;
  const hostRect = refs.surface.getBoundingClientRect();
  panel.style.top = "calc(100% + 8px)";
  panel.style.bottom = "auto";
  panel.style.left = "0";
  panel.style.right = "auto";
  panel.style.maxHeight = "";
  panel.style.overflowY = "";
  const controlRect = control.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const panelWidth = Math.max(1, Number(panelRect.width || 0));
  const panelHeight = Math.max(1, Number(panelRect.height || 0));
  const hostWidth = Math.max(1, Number(hostRect.width || 0));
  const hostHeight = Math.max(1, Number(hostRect.height || 0));

  const controlLeftInHost = controlRect.left - hostRect.left;
  const controlRightInHost = controlRect.right - hostRect.left;
  const controlTopInHost = controlRect.top - hostRect.top;
  const controlBottomInHost = controlRect.bottom - hostRect.top;
  const controlHeight = Math.max(1, Number(controlRect.height || 0));

  let leftOffset = 0;
  const initialLeft = controlLeftInHost + leftOffset;
  const initialRight = initialLeft + panelWidth;
  if (initialRight > hostWidth - margin) {
    leftOffset -= initialRight - (hostWidth - margin);
  }
  if (controlLeftInHost + leftOffset < margin) {
    leftOffset += margin - (controlLeftInHost + leftOffset);
  }
  panel.style.left = `${Math.round(leftOffset)}px`;
  panel.style.right = "auto";

  const availableBelow = hostHeight - controlBottomInHost - gap - margin;
  const availableAbove = controlTopInHost - gap - margin;
  if (panelHeight <= availableBelow) {
    panel.style.top = `${gap}px`;
    panel.style.bottom = "auto";
    return;
  }
  if (panelHeight <= availableAbove) {
    panel.style.top = "auto";
    panel.style.bottom = `${controlRect.height + gap}px`;
    return;
  }
  const placeAbove = availableAbove > availableBelow;
  const maxHeight = Math.max(120, Math.floor(placeAbove ? availableAbove : availableBelow));
  panel.style.maxHeight = `${maxHeight}px`;
  panel.style.overflowY = "auto";
  if (placeAbove) {
    panel.style.top = "auto";
    panel.style.bottom = `${controlHeight + gap}px`;
  } else {
    panel.style.top = `${gap}px`;
    panel.style.bottom = "auto";
  }
}

function toggleRichToolbarColorPanel(control) {
  if (!(control instanceof HTMLElement)) {
    return;
  }
  const nextOpen = !control.classList.contains("is-open");
  closeRichToolbarSubmenus({ except: nextOpen ? control : null });
  if (nextOpen) {
    syncRichToolbarColorPanelPosition(control);
  }
}

function syncRichToolbarSubmenuPanelPosition(submenu) {
  if (!(submenu instanceof HTMLElement)) {
    return;
  }
  const panel = submenu.querySelector(".canvas2d-rich-submenu-panel");
  if (!(panel instanceof HTMLElement)) {
    return;
  }
  const gap = 8;
  panel.style.top = "calc(100% + 8px)";
  panel.style.bottom = "auto";
  panel.style.left = "0";
  panel.style.right = "auto";
  const viewportWidth =
    Math.max(
      Number(window.innerWidth || 0) || 0,
      Number(document.documentElement?.clientWidth || 0) || 0
    ) || 0;
  const viewportHeight =
    Math.max(
      Number(window.innerHeight || 0) || 0,
      Number(document.documentElement?.clientHeight || 0) || 0
    ) || 0;
  const panelRect = panel.getBoundingClientRect();
  if (viewportHeight > 0 && panelRect.bottom > viewportHeight - 8) {
    panel.style.top = "auto";
    panel.style.bottom = `calc(100% + ${gap}px)`;
  }
  const adjustedRect = panel.getBoundingClientRect();
  if (viewportWidth > 0 && adjustedRect.right > viewportWidth - 8) {
    panel.style.left = "auto";
    panel.style.right = "0";
  }
  const finalRect = panel.getBoundingClientRect();
  if (finalRect.left < 8) {
    panel.style.left = "0";
    panel.style.right = "auto";
  }
}

function syncRichToolbarEnhancements(toolbar) {
  if (!(toolbar instanceof HTMLDivElement)) {
    return;
  }
  toolbar.querySelectorAll(".color-swatch").forEach((swatch) => {
    if (!(swatch instanceof HTMLElement)) {
      return;
    }
    const color = normalizeRichToolbarColorValue(swatch.getAttribute("data-color"), "#0f172a");
    swatch.style.background = color;
    swatch.style.backgroundColor = color;
  });
  toolbar.querySelectorAll(".canvas2d-rich-submenu").forEach((submenu) => {
    if (!(submenu instanceof HTMLElement)) {
      return;
    }
    const panel = submenu.querySelector(".canvas2d-rich-submenu-panel");
    if (panel instanceof HTMLElement) {
      panel.style.display = panel.classList.contains("is-hidden") ? "none" : "flex";
    }
  });
  toolbar.querySelectorAll('[data-role="rich-color-control"]').forEach((control) => {
    if (!(control instanceof HTMLElement)) {
      return;
    }
    const panel = control.querySelector('[data-role="rich-color-panel"]');
    if (panel instanceof HTMLElement) {
      panel.style.display = panel.classList.contains("is-hidden") ? "none" : "grid";
    }
  });
  syncRichToolbarColorControls(toolbar, getActiveRichSession()?.getFormatState?.() || {});
}

function getRichSelectionToolbarVariant(editingItem = null) {
  return editingItem?.type === "mindNode" || editingItem?.type === "mindSummary" ? "mind-node" : "rich-text";
}

function ensureRichSelectionToolbarVariant(editingItem = null) {
  if (!(refs.richSelectionToolbar instanceof HTMLDivElement)) {
    return;
  }
  const nextVariant = getRichSelectionToolbarVariant(editingItem);
  const currentVariant = String(refs.richSelectionToolbar.dataset.variant || "").trim().toLowerCase();
  if (currentVariant === nextVariant) {
    return;
  }
  refs.richSelectionToolbar.innerHTML = buildSelectionRichToolbarHtml(nextVariant);
  refs.richSelectionToolbar.dataset.variant = nextVariant;
  syncRichToolbarEnhancements(refs.richSelectionToolbar);
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
    const formatState = getActiveRichSession()?.getFormatState?.() || {};
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
    toolbar.classList.remove("is-wrapped");
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
      closeRichToolbarSubmenus();
      closeRichSelectionFontSizePanel();
      closeRichExternalLinkEditor();
      return;
    }
    const activeRichContext = getActiveRichSessionContext();
    const { editingItem, snapshot, hasExpandedSelection, formatState } = getRichTextSelectionState();
    const shouldShow = state.tool === "text" || Boolean(editingItem) || Boolean(activeRichContext);
    if (!shouldShow || !refs.surface) {
      refs.richToolbar.classList.add("is-hidden");
      refs.richSelectionToolbar.classList.add("is-hidden");
      closeRichToolbarSubmenus();
      closeRichSelectionFontSizePanel();
      closeRichExternalLinkEditor();
      return;
    }
    if (editingItem) {
      refs.richToolbar.classList.remove("is-hidden");
      const layout = syncFloatingToolbarLayout(refs.richToolbar, refs.surface, {
        minScale: 0.72,
        hardMinScale: 0.56,
        preferAboveZoom: false,
        gap: 14,
        margin: 8,
        anchor: "bottom-left",
      });
      syncRichToolbarWrapState(refs.richToolbar, {
        availableWidth: Number(layout?.maxWidth || 0),
        widthBuffer: 88,
      });
    } else {
      refs.richToolbar.classList.add("is-hidden");
      refs.richToolbar.classList.remove("is-wrapped");
    }
    if (!editingItem && !(state.editingType === "table" && tableCellEditState.active)) {
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
      syncRichExternalLinkEditorUi();
      return;
    }
    syncRichToolbarButtons(refs.richToolbar, formatState, { editingItem });
    ensureRichSelectionToolbarVariant(editingItem);
    syncRichToolbarButtons(refs.richSelectionToolbar, formatState, { editingItem });
    if (hasExpandedSelection) {
      refs.richSelectionToolbar.classList.remove("is-hidden");
      positionRichSelectionToolbar(refs.richSelectionToolbar, {
        rect: snapshot?.rect || null,
        point: options?.point || null,
      });
    } else {
      refs.richSelectionToolbar.classList.add("is-hidden");
      refs.richSelectionToolbar.classList.remove("is-wrapped");
      closeRichSelectionFontSizePanel();
    }
    syncRichExternalLinkEditorUi();
  }

  function syncRichTextFontSize() {
    if (!(refs.richToolbar instanceof HTMLDivElement)) {
      return;
    }
    if (isMindNodeRichEditingActive()) {
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

  function syncEditingMindNodeState(item) {
    if (!item || (item.type !== "mindNode" && item.type !== "mindSummary") || !(refs.richEditor instanceof HTMLDivElement)) {
      return false;
    }
    const beforeSignature = getRichEditableItemSignature(item);
    const html = normalizeRichHtmlInlineFontSizes(
      richTextSession.getHTML() || refs.richEditor.innerHTML || "",
      item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_MIND_NODE_FONT_SIZE)
    );
    const content = normalizeMindNodeTextContentForEditor(
      {
        ...item,
        html,
        plainText: htmlToPlainText(html),
        text: htmlToPlainText(html),
        fontSize: item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_MIND_NODE_FONT_SIZE),
      },
      { preserveEmpty: true }
    );
    applyMindNodeTextContent(item, content);
    syncEditingRichEditorFrame(refs.richEditor, item, state.board.view);
    return beforeSignature !== getRichEditableItemSignature(item);
  }

  function syncEditingTableCellState({ emit = true, refreshToolbar = true, markDirty = true } = {}) {
    const context = getActiveTableCellRichEditingContext();
    if (!context) {
      return null;
    }
    const html = sanitizeHtml(
      normalizeRichHtmlInlineFontSizes(
        normalizeRichHtml(tableCellRichTextSession.getHTML() || refs.tableCellRichEditor?.innerHTML || ""),
        Math.max(12, Number(getTableEditItem()?.fontSize || 16) || 16)
      )
    ).trim();
    const content = normalizeEditedTableCellContent(
      getTableCellDraftContent(context.rowIndex, context.columnIndex) || {},
      html,
      Math.max(12, Number(getTableEditItem()?.fontSize || 16) || 16)
    );
    const changed = writeTableCellDraftContent(context.rowIndex, context.columnIndex, content);
    if (changed) {
      if (markDirty) {
        markBoardDirty();
      }
      if (emit) {
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
      } else {
        scheduleRender();
      }
    }
    if (refreshToolbar) {
      requestAnimationFrame(() => syncRichTextToolbar());
    }
    return {
      item: context.item,
      changed,
      rowIndex: context.rowIndex,
      columnIndex: context.columnIndex,
    };
  }

  function commitActiveTableCellRichEdit({ keepFocus = false } = {}) {
    if (!tableCellEditState.active) {
      return false;
    }
    syncEditingTableCellState({ emit: false, refreshToolbar: true, markDirty: true });
    const rowIndex = tableCellEditState.rowIndex;
    const columnIndex = tableCellEditState.columnIndex;
    deactivateTableCellEditing({ keepFocus });
    getTableEditorCellElement(rowIndex, columnIndex)?.focus?.();
    return true;
  }

  function cancelActiveTableCellRichEdit({ keepFocus = false } = {}) {
    if (!tableCellEditState.active) {
      return false;
    }
    deactivateTableCellEditing({ keepFocus });
    return true;
  }

  function syncActiveRichEditingItemState({ emit = true, refreshToolbar = true, markDirty = true } = {}) {
    if (state.editingType === "table" && tableCellEditState.active) {
      return syncEditingTableCellState({ emit, refreshToolbar, markDirty });
    }
    const item = getActiveRichEditingItem();
    if (!item) {
      return null;
    }
    let changed = false;
    if (item.type === "text") {
      changed = syncEditingTextItemSize(item);
    } else if (item.type === "flowNode") {
      changed = syncEditingFlowNodeState(item);
    } else if (item.type === "mindNode" || item.type === "mindSummary") {
      changed = syncEditingMindNodeState(item);
    }
    if (emit && changed) {
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
      const item = sceneRegistry.getItemById(state.editingId, "fileCard");
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
      const item = sceneRegistry.getItemById(state.editingId, "image");
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

  function syncRichTextOverlays(visibleScene = null) {
    if (!(refs.richDisplayHost instanceof HTMLDivElement)) {
      return;
    }
    if (!isInteractiveMode()) {
      hideOverlayHost(refs.richDisplayHost, richOverlayVirtualizer, {
        onRemove: (node) => {
          cancelPendingRichOverlayDetail(node);
          node.remove?.();
        },
      });
      return;
    }
    if (RENDER_TEXT_IN_CANVAS) {
      hideOverlayHost(refs.richDisplayHost, richOverlayVirtualizer, {
        onRemove: (node) => {
          cancelPendingRichOverlayDetail(node);
          node.remove?.();
        },
      });
      return;
    }
    const scale = Math.max(0.1, Number(state.board.view.scale || 1));
    if (isCanvasLodScale(scale, RICH_OVERLAY_PREVIEW_MIN_SCALE)) {
      hideOverlayHost(refs.richDisplayHost, richOverlayVirtualizer, {
        onRemove: (node) => {
          cancelPendingRichOverlayDetail(node);
          node.remove?.();
        },
      });
      return;
    }
    const sceneIndex = getSceneIndexRuntime();
    const items = [
      ...(sceneIndex.recordsByType.get("text") || []),
      ...(sceneIndex.recordsByType.get("flowNode") || []),
      ...(sceneIndex.recordsByType.get("mindNode") || []),
      ...(sceneIndex.recordsByType.get("mindSummary") || []),
    ].map((record) => record.item);
    if (!items.length) {
      hideOverlayHost(refs.richDisplayHost, richOverlayVirtualizer, {
        onRemove: (node) => {
          cancelPendingRichOverlayDetail(node);
          node.remove?.();
        },
      });
      return;
    }
    showOverlayHost(refs.richDisplayHost);

    const detailMode = isDetailedOverlayScale(scale, RICH_OVERLAY_DETAIL_MIN_SCALE);
    const offsetX = Number(state.board.view.offsetX || 0);
    const offsetY = Number(state.board.view.offsetY || 0);
    const scaleBucket = getRichOverlayScaleBucket(scale);
    const editingId = state.editingId;
    const viewportBounds = getRichOverlayViewportBounds(
      refs.surface,
      refs.canvas?.clientWidth || refs.canvas?.width || 0,
      refs.canvas?.clientHeight || refs.canvas?.height || 0
    );

    const visibleItems = [];
    let textLayoutWritebackChanged = false;
    const candidateRecords = getVisibleSceneRecordsByTypes(visibleScene, ["text", "flowNode", "mindNode", "mindSummary"], { marginPx: 120 });
    candidateRecords.forEach((record) => {
      const item = record.item;
      const left = Number(item.x || 0) * scale + offsetX;
      const top = Number(item.y || 0) * scale + offsetY;
      const width = Math.max(1, Number(item.width || 1)) * scale;
      const height = Math.max(1, Number(item.height || 1)) * scale;
      visibleItems.push({
        item,
        left,
        top,
        width,
        height,
        visible: hasScreenRectIntersection({ left, top, right: left + width, bottom: top + height }, viewportBounds),
      });
    });
    const activeOverlayItems = visibleItems.filter(
      ({ item, visible }) => visible || (editingId && editingId === item.id)
    );

    richOverlayVirtualizer.syncCollection({
      items: activeOverlayItems,
      activeIds: activeOverlayItems.map(({ item }) => item.id),
      getId: ({ item }) => item.id,
      hideUnprocessed: true,
      createNode: ({ item }) => {
        const nextNode = document.createElement("div");
        nextNode.className = "canvas2d-rich-item";
        nextNode.dataset.id = item.id;
        refs.richDisplayHost.appendChild(nextNode);
        return nextNode;
      },
      shouldHide: ({ item, visible }) => {
        if (!visible || (editingId && editingId === item.id)) {
          return true;
        }
        if (item.type === "mindNode" || item.type === "mindSummary") {
          return !isMindMapItemVisible(item, state.board.items);
        }
        return false;
      },
      onRemove: (node) => {
        cancelPendingRichOverlayDetail(node);
        node.remove?.();
      },
      onHide: (node) => {
        cancelPendingRichOverlayDetail(node);
        setStyleIfNeeded(node, "display", "none");
      },
      onShow: (node) => setStyleIfNeeded(node, "display", "block"),
      syncNode: (node, { item, left, top, width, height }) => {
      const classSignature = getRichOverlayClassSignature(item);
      if (node.dataset.classSignature !== classSignature) {
        node.classList.toggle("is-flow-node", item.type === "flowNode");
        node.classList.toggle("is-mind-node", item.type === "mindNode" || item.type === "mindSummary");
        node.classList.toggle("is-wrap-mode", isWrapTextItem(item));
        node.classList.toggle("is-fixed-size", isFixedSizeTextItem(item));
        node.classList.remove("is-locked");
        node.dataset.classSignature = classSignature;
      }

      const fontSize = Math.max(12, Number(item.fontSize || 18)) * scale;
      const isFlowNode = item.type === "flowNode";
      const isMindNode = item.type === "mindNode" || item.type === "mindSummary";
      const padding = isFlowNode ? getFlowNodeTextPadding(scale, { width, height }) : { x: 0, y: 0 };
      const lineHeightRatio = isFlowNode ? FLOW_NODE_TEXT_LAYOUT.lineHeightRatio : TEXT_LINE_HEIGHT_RATIO;
      const linkSignature = item.type === "text" || isMindNode ? getLinkSemanticSignature(item) : "";
      const overlayMode = detailMode ? "detail" : resolveRichOverlaySummaryMode({ scale, width, height });
      const detailCacheKey = getRichOverlayDetailHtmlCacheKey(item, linkSignature);
      const detailRenderSignature = `${detailCacheKey}|${scaleBucket}`;
      node.classList.toggle("is-summary-skeleton", overlayMode === "summary-skeleton");
      let contentMutated = false;
      if (overlayMode === "detail") {
        node.dataset.detailRenderSignature = detailRenderSignature;
        const cachedHtml = readRichOverlayDetailHtmlCache(detailCacheKey);
        if (cachedHtml.trim()) {
          contentMutated = applyRichOverlayDetailHtmlToNode(node, {
            detailRenderSignature,
            html: cachedHtml,
            item,
            linkSignature,
            scale,
            scaleBucket,
          }) || contentMutated;
        } else {
          cancelPendingRichOverlayDetail(node);
          const text = item.plainText || item.text || "";
          if (node.dataset.contentMode !== "detail-pending" || node.dataset.text !== text) {
            node.textContent = text;
            node.dataset.text = text;
            node.dataset.html = "";
            node.dataset.inlineScaleBucket = "";
            node.dataset.linkSignature = "";
            node.dataset.contentMode = "detail-pending";
            contentMutated = true;
          }
          scheduleRichOverlayDetailHtml(node, {
            cacheKey: detailCacheKey,
            detailRenderSignature,
            item,
            linkSignature,
            scale,
            scaleBucket,
          });
        }
      } else {
        cancelPendingRichOverlayDetail(node);
        const logicalSummaryWidth = Math.max(24, Number(item.width || 0) || 24);
        const logicalSummaryHeight = Math.max(18, Number(item.height || 0) || 18);
        const logicalSummaryPaddingX = isFlowNode ? FLOW_NODE_TEXT_LAYOUT.paddingX : 0;
        const logicalSummaryPaddingY = isFlowNode ? FLOW_NODE_TEXT_LAYOUT.paddingY : 0;
        const summarySignature = [
          overlayMode,
          isFlowNode ? "flow" : isMindNode ? "mind-node" : "text",
          Math.round(logicalSummaryWidth),
          Math.round(logicalSummaryHeight),
          Math.round(logicalSummaryPaddingX),
          Math.round(logicalSummaryPaddingY),
          hashOverlayContent(String(item.plainText || item.text || "")),
        ].join("|");
        if (node.dataset.contentMode !== overlayMode || node.dataset.text !== summarySignature) {
          node.innerHTML = buildRichOverlaySkeletonMarkup({
            width: Math.max(24, logicalSummaryWidth - logicalSummaryPaddingX * 2),
            height: Math.max(18, logicalSummaryHeight - logicalSummaryPaddingY * 2),
            isFlowNode,
            showPanel: false,
          });
          node.dataset.text = summarySignature;
          node.dataset.html = "";
          node.dataset.inlineScaleBucket = "";
          node.dataset.linkSignature = "";
          node.dataset.contentMode = overlayMode;
          contentMutated = true;
        }
      }
      setStyleIfNeeded(node, "display", "block");
      const baseBoxStyles = getRichOverlayBoxStyles(item, scale);
      const boxStyles = overlayMode !== "detail"
        ? {
            ...baseBoxStyles,
            display: "block",
            widthCss: `${Math.round(width)}px`,
            heightCss: `${Math.round(height)}px`,
            minHeightCss: `${Math.round(height)}px`,
            maxWidthCss: `${Math.round(width)}px`,
            overflow: "hidden",
          }
        : baseBoxStyles;
      const fontWeight = isFlowNode ? FLOW_NODE_TEXT_LAYOUT.fontWeight : TEXT_FONT_WEIGHT;
      const appliedPaddingX = overlayMode === "detail" ? padding.x : 0;
      const appliedPaddingY = overlayMode === "detail" ? padding.y : 0;
      const styleSignature = getRichOverlayStyleSignature({
        left,
        top,
        fontSize,
        paddingX: appliedPaddingX,
        paddingY: appliedPaddingY,
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
        setStyleIfNeeded(node, "padding", `${appliedPaddingY}px ${appliedPaddingX}px`);
        setStyleIfNeeded(node, "lineHeight", String(lineHeightRatio));
        setStyleIfNeeded(node, "fontWeight", fontWeight);
        setStyleIfNeeded(node, "color", item.color || "#0f172a");
        setStyleIfNeeded(node, "whiteSpace", boxStyles.whiteSpace);
        setStyleIfNeeded(node, "wordBreak", boxStyles.wordBreak);
        setStyleIfNeeded(node, "overflowWrap", boxStyles.overflowWrap);
        setStyleIfNeeded(node, "overflow", boxStyles.overflow);
        node.dataset.styleSignature = styleSignature;
      }
      if (overlayMode === "detail" && (item.type === "text" || isMindNode)) {
        const html = node.dataset.html || "";
        const writebackSignature = getAutoSizedTextWritebackSignature(item, html);
        if (node.dataset.layoutWritebackSignature !== writebackSignature) {
          node.dataset.layoutWritebackSignature = writebackSignature;
          if (maybeWritebackTextOverlayFrame(item, node, scale)) {
            textLayoutWritebackChanged = true;
          }
        }
      }
      },
    });
    if (textLayoutWritebackChanged) {
      markSceneGraphDirty();
      syncBoard({ persist: false, emit: true, markDirty: false, sceneChange: false, fullOverlayRescan: false });
    }
  }

  function syncMathOverlays(visibleScene = null) {
    if (!(refs.mathDisplayHost instanceof HTMLDivElement)) {
      return;
    }
    if (state.editingType === "table") {
      hideOverlayHost(refs.mathDisplayHost, mathOverlayVirtualizer, {
        onRemove: (node) => {
          cancelPendingMathRender(node);
          node.remove?.();
        },
      });
      return;
    }
    if (!isInteractiveMode()) {
      hideOverlayHost(refs.mathDisplayHost, mathOverlayVirtualizer, {
        onRemove: (node) => {
          cancelPendingMathRender(node);
          node.remove?.();
        },
      });
      return;
    }

    const sceneIndex = getSceneIndexRuntime();
    const items = [
      ...(sceneIndex.recordsByType.get("mathBlock") || []),
      ...(sceneIndex.recordsByType.get("mathInline") || []),
    ].map((record) => record.item);
    if (!items.length) {
      hideOverlayHost(refs.mathDisplayHost, mathOverlayVirtualizer, {
        onRemove: (node) => {
          cancelPendingMathRender(node);
          node.remove?.();
        },
      });
      return;
    }

    const scale = Math.max(0.1, Number(state.board.view.scale || 1));
    if (isCanvasLodScale(scale, MATH_OVERLAY_PREVIEW_MIN_SCALE)) {
      hideOverlayHost(refs.mathDisplayHost, mathOverlayVirtualizer, {
        onRemove: (node) => {
          cancelPendingMathRender(node);
          node.remove?.();
        },
      });
      return;
    }
    showOverlayHost(refs.mathDisplayHost);
    const detailMode = isDetailedOverlayScale(scale, MATH_OVERLAY_DETAIL_MIN_SCALE);
    const offsetX = Number(state.board.view.offsetX || 0);
    const offsetY = Number(state.board.view.offsetY || 0);
    const viewportBounds = getRichOverlayViewportBounds(
      refs.surface,
      refs.canvas?.clientWidth || refs.canvas?.width || 0,
      refs.canvas?.clientHeight || refs.canvas?.height || 0
    );
    let mathLayoutWritebackChanged = false;

    const candidateRecords = getVisibleSceneRecordsByTypes(visibleScene, ["mathBlock", "mathInline"], {
      marginPx: 120,
    });
    const visibleItems = candidateRecords.map((record) => {
      const item = record.item;
      const left = Number(item.x || 0) * scale + offsetX;
      const top = Number(item.y || 0) * scale + offsetY;
      const width = Math.max(1, Number(item.width || 1)) * scale;
      const height = Math.max(1, Number(item.height || 1)) * scale;
      return {
        item,
        left,
        top,
        width,
        height,
        visible: hasScreenRectIntersection({ left, top, right: left + width, bottom: top + height }, viewportBounds),
      };
    });
    const activeMathItems = visibleItems.filter(({ visible }) => visible);

    mathOverlayVirtualizer.syncCollection({
      items: activeMathItems,
      activeIds: activeMathItems.map(({ item }) => item.id),
      getId: ({ item }) => item.id,
      hideUnprocessed: true,
      createNode: ({ item }) => {
        const nextNode = document.createElement("div");
        nextNode.className = "canvas2d-math-item";
        nextNode.dataset.id = item.id;
        refs.mathDisplayHost.appendChild(nextNode);
        return nextNode;
      },
      onRemove: (node) => {
        cancelPendingMathRender(node);
        node.remove?.();
      },
      shouldHide: ({ visible }) => !visible,
      onHide: (node) => {
        cancelPendingMathRender(node);
        setStyleIfNeeded(node, "display", "none");
      },
      syncNode: (node, { item, left, top, width, height }) => {
      const displayMode = item.displayMode !== false;
      const formula = String(item.formula || "");
      const overlayMode = detailMode ? "detail" : resolveMathOverlaySummaryMode({ scale, width, height, displayMode });
      const shouldRetryRender =
        overlayMode === "detail" &&
        item.mathOverlayReady !== true &&
        canScheduleMathMarkupUpgrade(formula) &&
        node.dataset.mathRenderState !== "pending";
      const stateToken = normalizeMathRenderState(item);
      const fallbackText = String(item.fallbackText || item.formula || "").trim() || (displayMode ? "[公式]" : "[行内公式]");
      const contentSignature = `${getMathOverlaySignature(item)}|${overlayMode}`;
      if (node.dataset.contentSignature !== contentSignature || shouldRetryRender) {
        if (overlayMode === "detail") {
          const cacheKey = getMathMarkupCacheKey(formula, displayMode);
          const cachedMarkup = readMathMarkupCache(cacheKey);
          if (cachedMarkup && hasRenderedKatexMarkup(cachedMarkup)) {
            applyMathMarkupToNode(node, contentSignature, cachedMarkup, {
              fallbackText,
              state: "ready",
              transport: "cache",
            });
            item.renderState = "ready";
            item.mathOverlayReady = true;
          } else {
            node.textContent = fallbackText;
            node.dataset.mathRenderState = "pending";
            node.dataset.mathRenderTransport = "";
            item.renderState = stateToken === "error" ? "error" : "fallback";
            item.mathOverlayReady = false;
            if (canScheduleMathMarkupUpgrade(formula)) {
              scheduleMathMarkupUpgrade(node, {
                cacheKey,
                formula,
                displayMode,
                contentSignature,
                fallbackText,
                item,
              });
            }
          }
        } else {
          cancelPendingMathRender(node);
          node.innerHTML = buildMathOverlaySummaryMarkup({
            displayMode,
            width,
            height,
          });
          node.dataset.mathRenderState = "summary";
          node.dataset.mathRenderTransport = "summary";
        }
        node.dataset.contentSignature = contentSignature;
        node.dataset.contentMode = overlayMode;
      }

      const { fontSize, paddingX, paddingY } = getMathOverlayTypography(item, scale);
      setStyleIfNeeded(node, "display", displayMode ? "block" : "inline-flex");
      const widthCss = overlayMode === "detail" ? "auto" : `${Math.round(width)}px`;
      const minHeightCss = `${Math.max(1, Math.round(height))}px`;
      const appliedPaddingX = overlayMode === "detail" ? paddingX : 0;
      const appliedPaddingY = overlayMode === "detail" ? paddingY : 0;
      const whiteSpace = overlayMode === "detail" ? (displayMode ? "normal" : "nowrap") : "normal";
      const justifyContent = overlayMode === "detail" ? (displayMode ? "center" : "flex-start") : "center";
      const styleSignature = getMathOverlayStyleSignature({
        left,
        top,
        fontSize,
        paddingX: appliedPaddingX,
        paddingY: appliedPaddingY,
        widthCss,
        minHeightCss,
        whiteSpace,
        justifyContent,
      });
      if (node.dataset.styleSignature !== styleSignature) {
        setStyleIfNeeded(node, "position", "absolute");
        setStyleIfNeeded(node, "left", `${left}px`);
        setStyleIfNeeded(node, "top", `${top}px`);
        setStyleIfNeeded(node, "width", widthCss);
        setStyleIfNeeded(node, "minHeight", minHeightCss);
        setStyleIfNeeded(node, "padding", `${appliedPaddingY}px ${appliedPaddingX}px`);
        setStyleIfNeeded(node, "fontSize", `${fontSize}px`);
        setStyleIfNeeded(node, "lineHeight", overlayMode === "detail" && !displayMode ? "1.1" : "normal");
        setStyleIfNeeded(node, "alignItems", "center");
        setStyleIfNeeded(node, "justifyContent", justifyContent);
        setStyleIfNeeded(node, "whiteSpace", whiteSpace);
        setStyleIfNeeded(node, "color", "rgba(15, 23, 42, 0.96)");
        node.dataset.styleSignature = styleSignature;
      }

      if (node.dataset.layoutWritebackSignature !== contentSignature) {
        node.dataset.layoutWritebackSignature = contentSignature;
      }
      if (overlayMode === "detail" && node.dataset.mathRenderState === "ready" && maybeWritebackMathOverlayFrame(item, node, scale)) {
        mathLayoutWritebackChanged = true;
      }
      },
    });

    if (mathLayoutWritebackChanged) {
      markSceneGraphDirty();
      syncBoard({ persist: false, emit: true, markDirty: false, sceneChange: false, fullOverlayRescan: false });
    }
  }

  function clearInlineFileCardPreviewNode() {
    // Legacy imperative file-card preview DOM was replaced by the React-owned preview surface.
  }

  function syncCodeBlockOverlays(visibleScene = null) {
    if (!(refs.codeBlockDisplayHost instanceof HTMLDivElement)) {
      return;
    }
    if (state.editingType === "table") {
      refs.codeBlockDisplayHost.classList.add("is-hidden");
      refs.codeBlockDisplayHost.style.display = "none";
      resetCodeBlockOverlayState({ clearNodes: true });
      lastCodeBlockOverlayInteractive = false;
      return;
    }
    const interactive = isInteractiveMode();
    if (!interactive) {
      refs.codeBlockDisplayHost.classList.add("is-hidden");
      refs.codeBlockDisplayHost.style.display = "none";
      resetCodeBlockOverlayState({ clearNodes: true });
      lastCodeBlockOverlayInteractive = interactive;
      return;
    }
    const sceneIndex = getSceneIndexRuntime();
    const items = (sceneIndex.recordsByType.get("codeBlock") || []).map((record) => record.item);
    if (!items.length) {
      refs.codeBlockDisplayHost.classList.add("is-hidden");
      refs.codeBlockDisplayHost.style.display = "none";
      resetCodeBlockOverlayState({ clearNodes: true });
      lastCodeBlockOverlayInteractive = interactive;
      return;
    }
    refs.codeBlockDisplayHost.classList.remove("is-hidden");
    refs.codeBlockDisplayHost.style.display = "block";
    const scale = Math.max(0.1, Number(state.board.view.scale || 1));
    if (isCanvasLodScale(scale, CODE_BLOCK_OVERLAY_SUMMARY_MIN_SCALE)) {
      refs.codeBlockDisplayHost.classList.add("is-hidden");
      refs.codeBlockDisplayHost.style.display = "none";
      resetCodeBlockOverlayState({ clearNodes: true });
      lastCodeBlockOverlayInteractive = interactive;
      return;
    }
    const offsetX = Number(state.board.view.offsetX || 0);
    const offsetY = Number(state.board.view.offsetY || 0);
    const viewportBounds = getRichOverlayViewportBounds(
      refs.surface,
      refs.canvas?.clientWidth || refs.canvas?.width || 0,
      refs.canvas?.clientHeight || refs.canvas?.height || 0
    );
    const viewportKey = getCodeBlockOverlayViewportKey(viewportBounds, scale);
    const shouldRescan =
      codeBlockOverlayNeedsFullRescan ||
      !lastCodeBlockOverlayInteractive ||
      viewportKey !== lastCodeBlockOverlayViewportKey ||
      items.length !== codeBlockItemsById.size;

    codeBlockItemsById.clear();
    items.forEach((item) => {
      codeBlockItemsById.set(item.id, item);
    });

    const nextHoverId = codeBlockItemsById.has(state.hoverId) ? String(state.hoverId || "") : "";
    const nextEditingId =
      state.editingType === "code-block" && codeBlockItemsById.has(state.editingId) ? String(state.editingId || "") : "";
    const selectedCodeBlockIds = getSelectedCodeBlockIds();
    const selectionKey = selectedCodeBlockIds.join("|");
    if (lastCodeBlockOverlayHoverId !== nextHoverId) {
      markCodeBlockOverlayDirty([lastCodeBlockOverlayHoverId, nextHoverId]);
    }
    if (lastCodeBlockOverlayEditingId !== nextEditingId) {
      markCodeBlockOverlayDirty([lastCodeBlockOverlayEditingId, nextEditingId]);
    }
    if (lastCodeBlockOverlaySelectionKey !== selectionKey) {
      markCodeBlockOverlayDirty([
        ...lastCodeBlockOverlaySelectionKey.split("|").filter(Boolean),
        ...selectedCodeBlockIds,
      ]);
    }
    lastCodeBlockOverlayHoverId = nextHoverId;
    lastCodeBlockOverlayEditingId = nextEditingId;
    lastCodeBlockOverlaySelectionKey = selectionKey;

    let candidateItems = getVisibleSceneRecordsByTypes(visibleScene, ["codeBlock"], { marginPx: 160 }).map(
      (record) => record.item
    );
    if (!candidateItems.length && items.length) {
      const fallbackVisible = queryVisibleItemsByTypes(["codeBlock"], { marginPx: 320 });
      candidateItems = Array.isArray(fallbackVisible?.items) ? fallbackVisible.items : [];
    }
    if (!candidateItems.length && items.length && viewportBounds.bottom - viewportBounds.top <= 12) {
      candidateItems = items.slice();
    }
    const activeVisibleItems = candidateItems.filter((item) => {
      const left = Number(item.x || 0) * scale + offsetX;
      const top = Number(item.y || 0) * scale + offsetY;
      const width = Math.max(1, Number(item.width || 1)) * scale;
      const height = Math.max(1, Number(item.height || 1)) * scale;
      return hasScreenRectIntersection({ left, top, right: left + width, bottom: top + height }, viewportBounds);
    });
    const activeIds = activeVisibleItems.map((item) => item.id);
    codeBlockOverlayVirtualizer.syncActiveIds(activeIds, {
      onRemove: (node) => {
        cleanupCodeBlockStaticNode(node);
        node.remove?.();
      },
    });

    if (shouldRescan) {
      codeBlockVisibleIds.clear();
      codeBlockOverlayVirtualizer.syncCollection({
        items: activeVisibleItems,
        activeIds,
        getId: (item) => item.id,
        hideUnprocessed: true,
        createNode: () => {
          const nextNode = document.createElement("div");
          refs.codeBlockDisplayHost.appendChild(nextNode);
          return nextNode;
        },
        onRemove: (node) => {
          cleanupCodeBlockStaticNode(node);
          node.remove?.();
        },
        onHide: (node) => {
          cleanupCodeBlockStaticNode(node);
          setStyleIfNeeded(node, "display", "none");
        },
        syncNode: (_, item) => {
          syncCodeBlockOverlayNode(item, viewportBounds, scale, offsetX, offsetY);
        },
      });
    } else {
      const idsToUpdate = new Set([
        ...codeBlockVisibleIds,
        ...codeBlockOverlayDirtyIds,
        ...selectedCodeBlockIds,
      ]);
      if (nextHoverId) {
        idsToUpdate.add(nextHoverId);
      }
      if (nextEditingId) {
        idsToUpdate.add(nextEditingId);
      }
      idsToUpdate.forEach((itemId) => {
        const item = codeBlockItemsById.get(itemId);
        if (!item) {
          codeBlockOverlayVirtualizer.removeNode(itemId, {
            onRemove: (node) => {
              cleanupCodeBlockStaticNode(node);
              node.remove?.();
            },
          });
          return;
        }
        syncCodeBlockOverlayNode(item, viewportBounds, scale, offsetX, offsetY);
      });
    }

    codeBlockOverlayDirtyIds.clear();
    codeBlockOverlayNeedsFullRescan = false;
    lastCodeBlockOverlayViewportKey = viewportKey;
    lastCodeBlockOverlayInteractive = interactive;
  }

  function beginTextEdit(itemId) {
    const item = sceneRegistry.getItemById(itemId, "text");
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
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    requestAnimationFrame(() => {
      richTextSession.focus();
      syncRichTextToolbar();
    });
    return true;
  }

  function beginFlowNodeEdit(itemId) {
    const item = sceneRegistry.getItemById(itemId, "flowNode");
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
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    requestAnimationFrame(() => {
      richTextSession.focus();
      syncRichTextToolbar();
    });
    return true;
  }

  function beginMindNodeEdit(itemId) {
    const item = sceneRegistry.getItemById(itemId, "mindNode") || sceneRegistry.getItemById(itemId, "mindSummary");
    if (!item || !(refs.richEditor instanceof HTMLDivElement)) {
      return false;
    }
    if (isLockedItem(item)) {
      setStatus("思维节点已锁定，无法编辑");
      return false;
    }
    finishImageEdit();
    cancelFileMemoEdit();
    cancelImageMemoEdit();
    const initialContent = normalizeMindNodeTextContentForEditor(item, { preserveEmpty: true });
    applyMindNodeTextContent(item, initialContent);
    if (!editBaselineSnapshot) {
      editBaselineSnapshot = takeHistorySnapshot(state);
    }
    state.editingId = item.id;
    state.editingType = "mind-node";
    state.board.selectedIds = [item.id];
    richTextSession.begin({
      itemId: item.id,
      itemType: "mind-node",
      html: initialContent.html,
      plainText: initialContent.plainText,
      fontSize: item.fontSize || DEFAULT_MIND_NODE_FONT_SIZE,
      baselineSnapshot: editBaselineSnapshot,
    });
    richFontSize = normalizeRichEditorFontSize(item.fontSize || DEFAULT_MIND_NODE_FONT_SIZE, DEFAULT_MIND_NODE_FONT_SIZE);
    syncRichTextFontSize();
    syncEditingRichEditorFrame(refs.richEditor, item, state.board.view);
    applyInlineFontSizingToContainer(refs.richEditor, state.board.view.scale);
    refs.richEditor.classList.remove("is-hidden");
    refs.editor?.classList.add("is-hidden");
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    const focusMindNodeEditor = () => {
      refs.richEditor?.focus?.({ preventScroll: true });
      richTextSession.focus();
      richTextSession.moveCaretToEnd?.();
    };
    focusMindNodeEditor();
    requestAnimationFrame(() => {
      ensureMindNodeRichTextSemanticDefaults(item);
      syncActiveRichEditingItemState({ emit: true, refreshToolbar: true, markDirty: false });
      focusMindNodeEditor();
      requestAnimationFrame(() => focusMindNodeEditor());
      syncRichTextToolbar();
    });
    return true;
  }

  function commitTextEdit() {
    if (!state.editingId || state.editingType !== "text") {
      return false;
    }
    const item = sceneRegistry.getItemById(state.editingId, "text");
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
      commitItemPatchHistory(before, item.id, null, "删除空白文本", "text-edit");
      setStatus("已删除空白文本");
      if (state.tool === "text" && shouldExitTextToolAfterEdit) {
        shouldExitTextToolAfterEdit = false;
        setTool("select");
      }
      return true;
    }
    const textSplitItems = buildTextSplitItems(item, html, {
      width: Math.max(80, Number(item.width || 0) || 80),
      fontSize: item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_TEXT_FONT_SIZE),
    });
    if (Array.isArray(textSplitItems) && textSplitItems.length) {
      textSplitItems.forEach((entry) => {
        if (entry?.type === "text") {
          scheduleUrlMetaHydrationForItem(entry);
        }
      });
      const itemIndex = state.board.items.findIndex((entry) => entry.id === item.id);
      if (itemIndex >= 0) {
        state.board.items.splice(itemIndex, 1, ...textSplitItems);
      } else {
        state.board.items.push(...textSplitItems);
      }
      if (state.hoverId === item.id) {
        state.hoverId = textSplitItems[0]?.id || null;
      }
      state.editingId = null;
      state.editingType = null;
      state.board.selectedIds = textSplitItems.map((entry) => entry.id);
      refs.richEditor.classList.add("is-hidden");
      richTextSession.clear({ destroyAdapter: false });
      editBaselineSnapshot = null;
      const changedIds = [item.id, ...textSplitItems.map((entry) => entry.id)];
      const beforeOrderIds = Array.isArray(before?.items)
        ? before.items.map((entry) => String(entry?.id || "")).filter(Boolean)
        : [];
      const afterOrderIds = state.board.items.map((entry) => String(entry?.id || "")).filter(Boolean);
      const changed = commitItemsPatchHistory(before, changedIds, "拆分文本", "text-split", {
        beforeOrderIds,
        afterOrderIds,
        fullOverlayRescan: true,
      });
      if (!changed) {
        syncBoard({ persist: false, emit: true, markDirty: false });
      } else {
        setStatus("已拆分文本");
        persistCommittedBoardIfPossible();
      }
      if (state.tool === "text" && shouldExitTextToolAfterEdit) {
        shouldExitTextToolAfterEdit = false;
        setTool("select");
      }
      return true;
    }
    const splitItems = buildStandaloneMathBlockSplitItems(item, canonicalHtml, {
      width: Math.max(80, Number(item.width || 0) || 80),
      fontSize: item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_TEXT_FONT_SIZE),
    });
    if (Array.isArray(splitItems) && splitItems.length) {
      splitItems.forEach((entry) => {
        if (entry?.type === "text") {
          scheduleUrlMetaHydrationForItem(entry);
        }
      });
      const itemIndex = state.board.items.findIndex((entry) => entry.id === item.id);
      if (itemIndex >= 0) {
        state.board.items.splice(itemIndex, 1, ...splitItems);
      } else {
        state.board.items.push(...splitItems);
      }
      if (state.hoverId === item.id) {
        state.hoverId = splitItems[0]?.id || null;
      }
      state.editingId = null;
      state.editingType = null;
      state.board.selectedIds = splitItems.map((entry) => entry.id);
      refs.richEditor.classList.add("is-hidden");
      richTextSession.clear({ destroyAdapter: false });
      editBaselineSnapshot = null;
      const changedIds = [item.id, ...splitItems.map((entry) => entry.id)];
      const beforeOrderIds = Array.isArray(before?.items)
        ? before.items.map((entry) => String(entry?.id || "")).filter(Boolean)
        : [];
      const afterOrderIds = state.board.items.map((entry) => String(entry?.id || "")).filter(Boolean);
      const changed = commitItemsPatchHistory(before, changedIds, "拆分独立公式", "text-math-block-split", {
        beforeOrderIds,
        afterOrderIds,
        fullOverlayRescan: true,
      });
      if (!changed) {
        syncBoard({ persist: false, emit: true, markDirty: false });
      } else {
        setStatus("已拆分独立公式");
        persistCommittedBoardIfPossible();
      }
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
            html: canonicalHtml,
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
    const changed = commitItemPatchHistory(before, item.id, item, "更新文本", "text-edit");
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
    const item = sceneRegistry.getItemById(state.editingId, "flowNode");
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
      commitItemPatchHistory(before, item.id, null, "删除空白节点", "flow-node-edit");
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
    const changed = commitItemPatchHistory(before, item.id, item, "更新节点", "flow-node-edit");
    if (!changed) {
      syncBoard({ persist: false, emit: true, markDirty: false });
      return true;
    }
    setStatus("节点已更新");
    persistCommittedBoardIfPossible();
    return true;
  }

  function relayoutMindMapFromNode(item) {
    if (!isMindMapNode(item)) {
      return;
    }
    const rootId = String(item.rootId || item.id || "").trim() || String(item.id || "").trim();
    state.board.items = applyMindMapAutoLayout(state.board.items, rootId);
  }

  function commitMindNodeEdit() {
    if (!state.editingId || state.editingType !== "mind-node") {
      return false;
    }
    const item = sceneRegistry.getItemById(state.editingId, "mindNode") || sceneRegistry.getItemById(state.editingId, "mindSummary");
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
      item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_MIND_NODE_FONT_SIZE)
    );
    const content = normalizeMindNodeTextContentForEditor(
      {
        ...item,
        html,
        plainText: htmlToPlainText(html),
        text: htmlToPlainText(html),
        fontSize: item.fontSize || resolveSessionFontSize(richTextSession, DEFAULT_MIND_NODE_FONT_SIZE),
      },
      { preserveEmpty: false }
    );
    const plainText = content.plainText;
    if (!plainText.trim()) {
      if (item.type === "mindSummary") {
        state.board.items = state.board.items.filter((entry) => entry.id !== item.id);
        if (state.hoverId === item.id) {
          state.hoverId = null;
        }
        state.editingId = null;
        state.editingType = null;
        refs.richEditor.classList.add("is-hidden");
        richTextSession.clear({ destroyAdapter: false });
        editBaselineSnapshot = null;
        commitItemPatchHistory(before, item.id, null, "删除空白摘要节点", "mind-node-edit");
        setStatus("已删除空白摘要节点");
        return true;
      }
      state.board.items = state.board.items.filter((entry) => entry.id !== item.id);
      if (item.parentId) {
        const parent = sceneRegistry.getItemById(item.parentId, "mindNode");
        if (parent) {
          parent.childrenIds = (Array.isArray(parent.childrenIds) ? parent.childrenIds : []).filter((childId) => childId !== item.id);
          relayoutMindMapFromNode(parent);
          state.board.selectedIds = [parent.id];
        } else {
          state.board.selectedIds = [];
        }
      } else {
        state.board.selectedIds = [];
      }
      if (state.hoverId === item.id) {
        state.hoverId = null;
      }
      state.editingId = null;
      state.editingType = null;
      refs.richEditor.classList.add("is-hidden");
      richTextSession.clear({ destroyAdapter: false });
      editBaselineSnapshot = null;
      commitItemPatchHistory(before, item.id, null, "删除空白思维节点", "mind-node-edit");
      setStatus("已删除空白思维节点");
      return true;
    }
    applyMindNodeTextContent(item, {
      ...content,
      fontSize: resolveSessionFontSize(richTextSession, DEFAULT_MIND_NODE_FONT_SIZE),
    });
    scheduleUrlMetaHydrationForItem(item);
    relayoutMindMapFromNode(item);
    state.editingId = null;
    state.editingType = null;
    state.board.selectedIds = [item.id];
    refs.richEditor.classList.add("is-hidden");
    richTextSession.clear({ destroyAdapter: false });
    editBaselineSnapshot = null;
    const changed = commitItemPatchHistory(before, item.id, item, "更新思维节点", "mind-node-edit");
    if (!changed) {
      syncBoard({ persist: false, emit: true, markDirty: false });
      return true;
    }
    setStatus("思维节点已更新");
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
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    return true;
  }

  function cancelMindNodeEdit() {
    if (state.editingType !== "mind-node") {
      return false;
    }
    state.editingId = null;
    state.editingType = null;
    refs.richEditor?.classList.add("is-hidden");
    richTextSession.clear({ destroyAdapter: false });
    editBaselineSnapshot = null;
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    return true;
  }

  function commitRichEdit() {
    if (state.editingType === "flow-node") {
      return commitFlowNodeEdit();
    }
    if (state.editingType === "mind-node") {
      return commitMindNodeEdit();
    }
    return commitTextEdit();
  }

  function cancelRichEdit() {
    if (state.editingType === "flow-node") {
      return cancelFlowNodeEdit();
    }
    if (state.editingType === "mind-node") {
      return cancelMindNodeEdit();
    }
    return cancelTextEdit();
  }

  function getTableEditItem() {
    return state.editingType === "table" ? sceneRegistry.getItemById(state.editingId, "table") || null : null;
  }

  function clampTableEditorValue(value, min, max) {
    const safeMin = Number.isFinite(min) ? min : value;
    const safeMax = Number.isFinite(max) ? max : value;
    return Math.min(safeMax, Math.max(safeMin, value));
  }

  function getTableEditorViewportSize() {
    const surfaceWidth = Math.max(
      240,
      Number(refs.fixedOverlayHost?.clientWidth || refs.surface?.clientWidth || refs.canvas?.clientWidth || refs.canvas?.width || 0) || 240
    );
    const surfaceHeight = Math.max(
      180,
      Number(refs.fixedOverlayHost?.clientHeight || refs.surface?.clientHeight || refs.canvas?.clientHeight || refs.canvas?.height || 0) || 180
    );
    return { width: surfaceWidth, height: surfaceHeight };
  }

  function resolveTableEditorDimension(value, minSize, availableSize, preferredMax) {
    const preferred = Math.min(preferredMax, Math.max(minSize, Number(value || 0) || minSize));
    const lowerBound = Math.min(minSize, availableSize);
    return clampTableEditorValue(preferred, lowerBound, availableSize);
  }

  function getTableEditorScreenRect(item) {
    const scale = Math.max(0.1, Number(state.board.view.scale || 1));
    const left = Number(item.x || 0) * scale + Number(state.board.view.offsetX || 0);
    const top = Number(item.y || 0) * scale + Number(state.board.view.offsetY || 0);
    const width = Math.max(1, Number(item.width || 1)) * scale;
    const height = Math.max(1, Number(item.height || 1)) * scale;
    return { left, top, width, height };
  }

  function resolveTableEditFrame(item, { baseFrame = null } = {}) {
    const screenRect = getTableEditorScreenRect(item);
    const width = Math.max(1, Math.round(Number(screenRect?.width || baseFrame?.width || 0) || 1));
    const height = Math.max(1, Math.round(Number(screenRect?.height || baseFrame?.height || 0) || 1));
    const left = Math.round(Number(screenRect?.left || baseFrame?.left || 0) || 0);
    const top = Math.round(Number(screenRect?.top || baseFrame?.top || 0) || 0);
    return {
      left,
      top,
      width,
      height,
    };
  }

  function ensureTableEditFrame(item, options = {}) {
    if (!item) {
      tableEditFrame = null;
      return null;
    }
    if (!tableEditFrame || options.force) {
      tableEditFrame = resolveTableEditFrame(item, { baseFrame: options.baseFrame || tableEditFrame });
      return tableEditFrame;
    }
    tableEditFrame = resolveTableEditFrame(item, { baseFrame: tableEditFrame });
    return tableEditFrame;
  }

  function buildTableEditorHtml(item) {
  const matrix = flattenTableStructureToMatrix(item?.table || {});
  return `
      <div class="canvas-table-editor-rails" data-role="table-rails" aria-hidden="false">
        <button
          type="button"
          class="canvas-table-corner-handle"
          data-role="table-corner-handle"
          data-table-handle-kind="all"
          aria-label="全选表格"
          title="全选表格"
        ></button>
        <div class="canvas-table-column-rail" data-role="table-column-rail"></div>
        <div class="canvas-table-row-rail" data-role="table-row-rail"></div>
      </div>
      <div class="canvas-table-editor-scroll" data-role="table-scroll">
        <table class="canvas-table-editor-grid">
          <tbody>
            ${matrix
              .map(
                (row, rowIndex) => `
                  <tr data-row-index="${rowIndex}">
                    ${row
                      .map((cell, columnIndex) => {
                        const tag = cell.header ? "th" : "td";
                        const cellHtml = renderTableCellStaticHtml(cell);
                        const cellPlainText = sanitizeText(String(cell?.plainText || htmlToPlainText(cellHtml)));
                        return `
                          <${tag}
                            spellcheck="false"
                            tabindex="-1"
                            data-row-index="${rowIndex}"
                            data-column-index="${columnIndex}"
                            data-header="${cell.header ? "1" : "0"}"
                            data-cell-html="${escapeRichTextHtml(String(cell?.html || ""))}"
                            data-cell-plain-text="${escapeRichTextHtml(cellPlainText)}"
                          ><div class="canvas-table-cell-static" data-role="table-cell-static">${cellHtml}</div></${tag}>
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
      <button
        type="button"
        class="canvas-table-edge-btn is-row"
        data-role="table-add-row"
        data-action="table-add-row"
        aria-label="在当前行后插入一行"
        title="在当前行后插入一行"
      ></button>
      <button
        type="button"
        class="canvas-table-edge-btn is-column"
        data-role="table-add-column"
        data-action="table-add-column"
        aria-label="在当前列后插入一列"
        title="在当前列后插入一列"
      ></button>
    `;
  }

  function ensureMindNodeChrome() {
    refs.mindNodeChrome = refs.fixedOverlayHost?.querySelector?.("#canvas-mind-node-chrome") || null;
    if (!(refs.mindNodeChrome instanceof HTMLDivElement)) {
      refs.mindNodeChrome = document.createElement("div");
      refs.mindNodeChrome.id = "canvas-mind-node-chrome";
      refs.mindNodeChrome.className = "canvas-mind-node-chrome is-hidden";
      refs.mindNodeChrome.innerHTML = `
        <div class="canvas-mind-node-side-control is-left">
          <button type="button" class="canvas-mind-node-side-btn is-detach" data-action="mind-detach-branch" aria-label="拆分为独立分支" title="拆分为独立分支"></button>
        </div>
        <div class="canvas-mind-node-chrome-group">
          <button type="button" class="canvas-mind-node-tool is-add-child" data-action="mind-add-child" aria-label="添加子节点" title="添加子节点"></button>
          <button type="button" class="canvas-mind-node-tool is-add-sibling" data-action="mind-add-sibling" aria-label="添加同级节点" title="添加同级节点"></button>
          <button type="button" class="canvas-mind-node-tool is-insert-bridge" data-action="mind-insert-intermediate" aria-label="插入中间节点" title="插入中间节点"></button>
          <button type="button" class="canvas-mind-node-tool is-summary" data-action="mind-add-summary" aria-label="添加摘要节点" title="添加摘要节点"></button>
          <button type="button" class="canvas-mind-node-tool is-demote" data-action="mind-demote" aria-label="降级层级" title="降级层级"></button>
          <button type="button" class="canvas-mind-node-tool is-promote" data-action="mind-promote" aria-label="提升层级" title="提升层级"></button>
          <button type="button" class="canvas-mind-node-tool is-toggle-collapse" data-action="mind-toggle-collapse" aria-label="折叠或展开分支" title="折叠或展开分支"></button>
          <button type="button" class="canvas-mind-node-tool is-relayout" data-action="mind-relayout" aria-label="整理布局" title="整理布局"></button>
        </div>
        <div class="canvas-mind-node-side-control is-right">
          <button type="button" class="canvas-mind-node-side-btn is-add-child" data-action="mind-quick-add-child" aria-label="快速添加子节点" title="快速添加子节点"></button>
        </div>
        <div class="canvas-mind-node-corner-control">
          <button type="button" class="canvas-mind-node-link-anchor" data-action="mind-manage-links" aria-label="节点链接" title="节点链接"></button>
        </div>
      `;
      refs.fixedOverlayHost?.appendChild?.(refs.mindNodeChrome);
    }
    return refs.mindNodeChrome;
  }

  function ensureTableCellRichEditorHost() {
    if (!(refs.tableEditor instanceof HTMLDivElement)) {
      return null;
    }
    refs.tableCellRichEditor = refs.tableEditor.querySelector("#canvas-table-cell-rich-editor");
    if (!(refs.tableCellRichEditor instanceof HTMLDivElement)) {
      refs.tableCellRichEditor = document.createElement("div");
      refs.tableCellRichEditor.id = "canvas-table-cell-rich-editor";
      refs.tableCellRichEditor.className = "canvas-table-cell-rich-editor is-hidden";
      refs.tableCellRichEditor.setAttribute("aria-label", "编辑表格单元格");
      refs.tableEditor.appendChild(refs.tableCellRichEditor);
    }
    tableCellRichTextSession.setEditorElement(refs.tableCellRichEditor);
    return refs.tableCellRichEditor;
  }

  function getTableEditorCellElement(rowIndex = 0, columnIndex = 0) {
    return refs.tableEditor?.querySelector?.(
      `[data-row-index="${Math.max(0, Number(rowIndex) || 0)}"][data-column-index="${Math.max(0, Number(columnIndex) || 0)}"]`
    ) || null;
  }

  function normalizeTableCellCoordinate(rowIndex = 0, columnIndex = 0) {
    return {
      rowIndex: Math.max(0, Number(rowIndex) || 0),
      columnIndex: Math.max(0, Number(columnIndex) || 0),
    };
  }

  function createTableSelectionRange(anchor = tableEditSelection, focus = tableEditSelection) {
    const normalizedAnchor = normalizeTableCellCoordinate(anchor?.rowIndex, anchor?.columnIndex);
    const normalizedFocus = normalizeTableCellCoordinate(focus?.rowIndex, focus?.columnIndex);
    return {
      anchor: normalizedAnchor,
      focus: normalizedFocus,
      startRow: Math.min(normalizedAnchor.rowIndex, normalizedFocus.rowIndex),
      endRow: Math.max(normalizedAnchor.rowIndex, normalizedFocus.rowIndex),
      startColumn: Math.min(normalizedAnchor.columnIndex, normalizedFocus.columnIndex),
      endColumn: Math.max(normalizedAnchor.columnIndex, normalizedFocus.columnIndex),
    };
  }

  function getTableEditSelectionRange() {
    return tableEditRange || createTableSelectionRange(tableEditSelection, tableEditSelection);
  }

  function deriveTableSelectionMode(matrix = null, range = getTableEditSelectionRange()) {
    const rowCount = Math.max(1, Array.isArray(matrix) ? matrix.length : 1);
    const columnCount = Math.max(1, Array.isArray(matrix) && matrix.length ? matrix[0]?.length || 1 : 1);
    const startRow = Math.max(0, Math.min(rowCount - 1, Number(range?.startRow) || 0));
    const endRow = Math.max(0, Math.min(rowCount - 1, Number(range?.endRow) || 0));
    const startColumn = Math.max(0, Math.min(columnCount - 1, Number(range?.startColumn) || 0));
    const endColumn = Math.max(0, Math.min(columnCount - 1, Number(range?.endColumn) || 0));
    const coversAllRows = startRow === 0 && endRow === rowCount - 1;
    const coversAllColumns = startColumn === 0 && endColumn === columnCount - 1;
    if (coversAllRows && coversAllColumns) {
      return "all";
    }
    if (coversAllColumns) {
      return "row";
    }
    if (coversAllRows) {
      return "column";
    }
    return "cell";
  }

  function syncTableSelectionMode(matrix = null, explicitMode = "") {
    tableEditSelectionMode = explicitMode || deriveTableSelectionMode(matrix);
    return tableEditSelectionMode;
  }

  function clearTablePointerSelectionTimer() {}

  function resetTablePointerSelectionState() {
    tablePointerSelectionState.pointerId = null;
    tablePointerSelectionState.anchor = null;
    tablePointerSelectionState.pendingCell = null;
    tablePointerSelectionState.multiSelectActive = false;
    tablePointerSelectionState.nativeTextSelection = false;
    tablePointerSelectionState.draggingRange = false;
  }

  function resetTableInteractionUiState() {
    tableInteractionUiState.pointerInsideEditor = false;
    tableInteractionUiState.pointerInsideToolbar = false;
    tableInteractionUiState.hoveredCell = null;
  }

  function resetTableStructureDragState() {
    tableStructureDragState = {
      kind: "",
      pointerId: null,
      active: false,
      anchorIndex: -1,
      targetIndex: -1,
      startPrimary: 0,
      startSecondary: 0,
      startRow: 0,
      endRow: 0,
      startColumn: 0,
      endColumn: 0,
    };
    refs.tableEditor?.classList.remove("is-row-dragging", "is-column-dragging");
  }

  function setTableInteractionPointerState(source = "editor", active = false) {
    if (source === "toolbar") {
      tableInteractionUiState.pointerInsideToolbar = Boolean(active);
    } else {
      tableInteractionUiState.pointerInsideEditor = Boolean(active);
      if (!active) {
        tableInteractionUiState.hoveredCell = null;
      }
    }
  }

  function setTableHoveredCell(rowIndex = 0, columnIndex = 0) {
    tableInteractionUiState.hoveredCell = normalizeTableCellCoordinate(rowIndex, columnIndex);
  }

  function getTableUiAnchorCell() {
    if (tableInteractionUiState.pointerInsideEditor && tableInteractionUiState.hoveredCell) {
      return tableInteractionUiState.hoveredCell;
    }
    return normalizeTableCellCoordinate(tableEditSelection.rowIndex, tableEditSelection.columnIndex);
  }

  function isTableInteractionChromeRevealed() {
    return (
      tableInteractionUiState.pointerInsideEditor ||
      tableInteractionUiState.pointerInsideToolbar ||
      tableCellEditState.active ||
      tablePointerSelectionState.multiSelectActive ||
      tableStructureDragState.active
    );
  }

  function selectEntireTable(matrix = buildTableMatrixFromEditor()) {
    const rowCount = Math.max(1, Array.isArray(matrix) ? matrix.length : 1);
    const columnCount = Math.max(1, Array.isArray(matrix) && matrix.length ? matrix[0]?.length || 1 : 1);
    tableEditSelection = normalizeTableCellCoordinate(0, 0);
    tableEditRange = createTableSelectionRange(
      { rowIndex: 0, columnIndex: 0 },
      { rowIndex: rowCount - 1, columnIndex: columnCount - 1 }
    );
    syncTableSelectionMode(matrix, "all");
    syncTableEditorSelectionUI();
  }

  function selectTableRow(rowIndex = 0, matrix = buildTableMatrixFromEditor()) {
    const rowCount = Math.max(1, Array.isArray(matrix) ? matrix.length : 1);
    const columnCount = Math.max(1, Array.isArray(matrix) && matrix.length ? matrix[0]?.length || 1 : 1);
    const safeRowIndex = Math.max(0, Math.min(rowCount - 1, Number(rowIndex) || 0));
    tableEditSelection = normalizeTableCellCoordinate(safeRowIndex, 0);
    tableEditRange = createTableSelectionRange(
      { rowIndex: safeRowIndex, columnIndex: 0 },
      { rowIndex: safeRowIndex, columnIndex: columnCount - 1 }
    );
    syncTableSelectionMode(matrix, "row");
    syncTableEditorSelectionUI();
  }

  function selectTableColumn(columnIndex = 0, matrix = buildTableMatrixFromEditor()) {
    const rowCount = Math.max(1, Array.isArray(matrix) ? matrix.length : 1);
    const columnCount = Math.max(1, Array.isArray(matrix) && matrix.length ? matrix[0]?.length || 1 : 1);
    const safeColumnIndex = Math.max(0, Math.min(columnCount - 1, Number(columnIndex) || 0));
    tableEditSelection = normalizeTableCellCoordinate(0, safeColumnIndex);
    tableEditRange = createTableSelectionRange(
      { rowIndex: 0, columnIndex: safeColumnIndex },
      { rowIndex: rowCount - 1, columnIndex: safeColumnIndex }
    );
    syncTableSelectionMode(matrix, "column");
    syncTableEditorSelectionUI();
  }

  function setTableCellEditingState(rowIndex = 0, columnIndex = 0, active = false) {
    tableCellEditState = {
      active: Boolean(active),
      rowIndex: Math.max(0, Number(rowIndex) || 0),
      columnIndex: Math.max(0, Number(columnIndex) || 0),
    };
  }

  function isTableCellEditing(rowIndex = 0, columnIndex = 0) {
    return (
      tableCellEditState.active &&
      tableCellEditState.rowIndex === Math.max(0, Number(rowIndex) || 0) &&
      tableCellEditState.columnIndex === Math.max(0, Number(columnIndex) || 0)
    );
  }

  function setTableEditSelection(rowIndex = 0, columnIndex = 0, { extend = false } = {}) {
    const focus = normalizeTableCellCoordinate(rowIndex, columnIndex);
    const anchor = extend ? tableEditRange?.anchor || tableEditSelection || focus : focus;
    tableEditSelection = focus;
    tableEditRange = createTableSelectionRange(anchor, focus);
    syncTableSelectionMode(null, extend ? "" : "cell");
    return tableEditRange;
  }

  function getTableEditSelectionBounds(matrix = null) {
    const range = getTableEditSelectionRange();
    const rowCount = Math.max(1, Array.isArray(matrix) ? matrix.length : 1);
    const columnCount = Math.max(1, Array.isArray(matrix) && matrix.length ? matrix[0]?.length || 1 : 1);
    return {
      startRow: Math.max(0, Math.min(rowCount - 1, Number(range.startRow) || 0)),
      endRow: Math.max(0, Math.min(rowCount - 1, Number(range.endRow) || 0)),
      startColumn: Math.max(0, Math.min(columnCount - 1, Number(range.startColumn) || 0)),
      endColumn: Math.max(0, Math.min(columnCount - 1, Number(range.endColumn) || 0)),
      anchor: range.anchor,
      focus: range.focus,
    };
  }

  function isTableSelectionMultiCell(matrix = null) {
    const bounds = getTableEditSelectionBounds(matrix);
    return bounds.startRow !== bounds.endRow || bounds.startColumn !== bounds.endColumn;
  }

  function getTableRowOperationBounds(matrix = buildTableMatrixFromEditor()) {
    const rowCount = Math.max(1, Array.isArray(matrix) ? matrix.length : 1);
    const bounds = getTableEditSelectionBounds(matrix);
    const mode = syncTableSelectionMode(matrix);
    if (mode === "row" || mode === "all") {
      return {
        startRow: bounds.startRow,
        endRow: bounds.endRow,
      };
    }
    const safeRowIndex = Math.max(0, Math.min(rowCount - 1, Number(tableEditSelection.rowIndex) || 0));
    return {
      startRow: safeRowIndex,
      endRow: safeRowIndex,
    };
  }

  function getTableColumnOperationBounds(matrix = buildTableMatrixFromEditor()) {
    const columnCount = Math.max(1, Array.isArray(matrix) && matrix.length ? matrix[0]?.length || 1 : 1);
    const bounds = getTableEditSelectionBounds(matrix);
    const mode = syncTableSelectionMode(matrix);
    if (mode === "column" || mode === "all") {
      return {
        startColumn: bounds.startColumn,
        endColumn: bounds.endColumn,
      };
    }
    const safeColumnIndex = Math.max(0, Math.min(columnCount - 1, Number(tableEditSelection.columnIndex) || 0));
    return {
      startColumn: safeColumnIndex,
      endColumn: safeColumnIndex,
    };
  }

  function setTableSelectionFromAnchorCell(anchorCell = null, { preserveMode = false } = {}) {
    const focus = normalizeTableCellCoordinate(anchorCell?.rowIndex, anchorCell?.columnIndex);
    tableEditSelection = focus;
    tableEditRange = createTableSelectionRange(focus, focus);
    syncTableSelectionMode(null, preserveMode ? "" : "cell");
    return focus;
  }

  function syncTableSelectionToUiAnchor() {
    return setTableSelectionFromAnchorCell(getTableUiAnchorCell());
  }

  function getTableActionAnchorCellFromTarget(target = null) {
    const actionTarget = target instanceof Element ? target.closest("[data-action]") : null;
    const rowIndex = Number(actionTarget?.getAttribute?.("data-anchor-row-index"));
    const columnIndex = Number(actionTarget?.getAttribute?.("data-anchor-column-index"));
    if (Number.isFinite(rowIndex) && Number.isFinite(columnIndex)) {
      return normalizeTableCellCoordinate(rowIndex, columnIndex);
    }
    return getTableUiAnchorCell();
  }

  function cloneTableMatrix(matrix = []) {
    return (Array.isArray(matrix) ? matrix : []).map((row, rowIndex) =>
      (Array.isArray(row) ? row : []).map((cell, columnIndex) => ({
        plainText: String(cell?.plainText || ""),
        html: String(cell?.html || ""),
        richTextDocument:
          cell?.richTextDocument && typeof cell.richTextDocument === "object"
            ? JSON.parse(JSON.stringify(cell.richTextDocument))
            : null,
        header: Boolean(cell?.header),
        align: String(cell?.align || ""),
        rowIndex,
        columnIndex,
      }))
    );
  }

  function createBlankTableCell(rowIndex = 0, columnIndex = 0, { hasHeader = false } = {}) {
    return {
      plainText: rowIndex === 0 && hasHeader ? `列 ${columnIndex + 1}` : "",
      html: "",
      richTextDocument: null,
      header: rowIndex === 0 && hasHeader,
      align: "",
      rowIndex,
      columnIndex,
    };
  }

  function reindexTableMatrix(matrix = [], { hasHeader = false } = {}) {
    return cloneTableMatrix(matrix).map((row, rowIndex) =>
      row.map((cell, columnIndex) => ({
        ...cell,
        rowIndex,
        columnIndex,
        header: Boolean(hasHeader && rowIndex === 0),
      }))
    );
  }

  function ensureTableMatrixSize(matrix = [], rowCount = 1, columnCount = 1, { hasHeader = false } = {}) {
    const nextMatrix = cloneTableMatrix(matrix);
    const targetRowCount = Math.max(1, Number(rowCount) || 1);
    const targetColumnCount = Math.max(1, Number(columnCount) || 1);
    while (nextMatrix.length < targetRowCount) {
      const rowIndex = nextMatrix.length;
      nextMatrix.push(
        Array.from({ length: targetColumnCount }, (_, columnIndex) =>
          createBlankTableCell(rowIndex, columnIndex, { hasHeader })
        )
      );
    }
    nextMatrix.forEach((row, rowIndex) => {
      while (row.length < targetColumnCount) {
        row.push(createBlankTableCell(rowIndex, row.length, { hasHeader }));
      }
    });
    return reindexTableMatrix(nextMatrix, { hasHeader });
  }

  function getTableSelectionMatrix(matrix = buildTableMatrixFromEditor()) {
    const bounds = getTableEditSelectionBounds(matrix);
    return matrix.slice(bounds.startRow, bounds.endRow + 1).map((row) =>
      row.slice(bounds.startColumn, bounds.endColumn + 1).map((cell) => ({
        plainText: String(cell?.plainText || ""),
        html: String(cell?.html || ""),
        richTextDocument:
          cell?.richTextDocument && typeof cell.richTextDocument === "object"
            ? JSON.parse(JSON.stringify(cell.richTextDocument))
            : null,
        header: Boolean(cell?.header),
        align: String(cell?.align || ""),
      }))
    );
  }

  function parseTableDelimitedText(text = "") {
    const normalizedText = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
    if (!normalizedText) {
      return [];
    }
    const lines = normalizedText.split("\n");
    return lines.map((line) => {
      if (line.includes("\t")) {
        return line.split("\t");
      }
      if (line.includes(",")) {
        return line.split(",").map((part) => part.replace(/^"(.*)"$/, "$1"));
      }
      return [line];
    });
  }

  function applyTableClipboardMatrix(matrix = [], pastedMatrix = [], { hasHeader = false } = {}) {
    const baseMatrix = cloneTableMatrix(matrix);
    const clipboardMatrix = (Array.isArray(pastedMatrix) ? pastedMatrix : []).filter((row) => Array.isArray(row));
    if (!clipboardMatrix.length) {
      return baseMatrix;
    }
    const bounds = getTableEditSelectionBounds(baseMatrix);
    const requiredRowCount = Math.max(baseMatrix.length, bounds.startRow + clipboardMatrix.length);
    const maxClipboardColumnCount = clipboardMatrix.reduce((max, row) => Math.max(max, row.length), 0);
    const requiredColumnCount = Math.max(baseMatrix[0]?.length || 0, bounds.startColumn + maxClipboardColumnCount, 1);
    const nextMatrix = ensureTableMatrixSize(baseMatrix, requiredRowCount, requiredColumnCount, { hasHeader });
    clipboardMatrix.forEach((row, rowOffset) => {
      row.forEach((value, columnOffset) => {
        const targetRow = bounds.startRow + rowOffset;
        const targetColumn = bounds.startColumn + columnOffset;
        if (!nextMatrix[targetRow]?.[targetColumn]) {
          return;
        }
        nextMatrix[targetRow][targetColumn].plainText = sanitizeText(value);
        nextMatrix[targetRow][targetColumn].html = "";
        nextMatrix[targetRow][targetColumn].richTextDocument = null;
        nextMatrix[targetRow][targetColumn].header = Boolean(hasHeader && targetRow === 0);
      });
    });
    tableEditSelection = normalizeTableCellCoordinate(bounds.startRow, bounds.startColumn);
    tableEditRange = createTableSelectionRange(
      { rowIndex: bounds.startRow, columnIndex: bounds.startColumn },
      {
        rowIndex: bounds.startRow + Math.max(0, clipboardMatrix.length - 1),
        columnIndex: bounds.startColumn + Math.max(0, maxClipboardColumnCount - 1),
      }
    );
    return reindexTableMatrix(nextMatrix, { hasHeader });
  }

  function clearTableSelectionContent(matrix = [], { hasHeader = false } = {}) {
    const nextMatrix = cloneTableMatrix(matrix);
    const bounds = getTableEditSelectionBounds(nextMatrix);
    for (let rowIndex = bounds.startRow; rowIndex <= bounds.endRow; rowIndex += 1) {
      for (let columnIndex = bounds.startColumn; columnIndex <= bounds.endColumn; columnIndex += 1) {
        if (!nextMatrix[rowIndex]?.[columnIndex]) {
          continue;
        }
        nextMatrix[rowIndex][columnIndex].plainText = "";
        nextMatrix[rowIndex][columnIndex].html = "";
        nextMatrix[rowIndex][columnIndex].richTextDocument = null;
        nextMatrix[rowIndex][columnIndex].header = Boolean(hasHeader && rowIndex === 0);
      }
    }
    return reindexTableMatrix(nextMatrix, { hasHeader });
  }

  function insertTableRows(matrix = [], insertIndex = 0, count = 1, { hasHeader = false } = {}) {
    const nextMatrix = cloneTableMatrix(matrix);
    const columnCount = Math.max(1, nextMatrix[0]?.length || 1);
    const safeInsertIndex = Math.max(0, Math.min(nextMatrix.length, Number(insertIndex) || 0));
    const safeCount = Math.max(1, Number(count) || 1);
    const rows = Array.from({ length: safeCount }, (_, offset) =>
      Array.from({ length: columnCount }, (_, columnIndex) =>
        createBlankTableCell(safeInsertIndex + offset, columnIndex, { hasHeader })
      )
    );
    nextMatrix.splice(safeInsertIndex, 0, ...rows);
    tableEditSelection = normalizeTableCellCoordinate(safeInsertIndex, tableEditSelection.columnIndex);
    tableEditRange = createTableSelectionRange(
      { rowIndex: safeInsertIndex, columnIndex: 0 },
      { rowIndex: safeInsertIndex + safeCount - 1, columnIndex: Math.max(0, columnCount - 1) }
    );
    syncTableSelectionMode(nextMatrix, "row");
    return reindexTableMatrix(nextMatrix, { hasHeader });
  }

  function insertTableColumns(matrix = [], insertIndex = 0, count = 1, { hasHeader = false } = {}) {
    const nextMatrix = cloneTableMatrix(matrix);
    const safeCount = Math.max(1, Number(count) || 1);
    const safeInsertIndex = Math.max(0, Math.min(nextMatrix[0]?.length || 0, Number(insertIndex) || 0));
    nextMatrix.forEach((row, rowIndex) => {
      const cells = Array.from({ length: safeCount }, (_, offset) =>
        createBlankTableCell(rowIndex, safeInsertIndex + offset, { hasHeader })
      );
      row.splice(safeInsertIndex, 0, ...cells);
    });
    tableEditSelection = normalizeTableCellCoordinate(tableEditSelection.rowIndex, safeInsertIndex);
    tableEditRange = createTableSelectionRange(
      { rowIndex: 0, columnIndex: safeInsertIndex },
      { rowIndex: Math.max(0, nextMatrix.length - 1), columnIndex: safeInsertIndex + safeCount - 1 }
    );
    syncTableSelectionMode(nextMatrix, "column");
    return reindexTableMatrix(nextMatrix, { hasHeader });
  }

  function deleteSelectedTableRows(matrix = [], { hasHeader = false } = {}) {
    const nextMatrix = cloneTableMatrix(matrix);
    if (nextMatrix.length <= 1) {
      return nextMatrix;
    }
    const bounds = getTableEditSelectionBounds(nextMatrix);
    const deleteCount = bounds.endRow - bounds.startRow + 1;
    nextMatrix.splice(bounds.startRow, deleteCount);
    if (!nextMatrix.length) {
      nextMatrix.push(
        Array.from({ length: Math.max(1, matrix[0]?.length || 1) }, (_, columnIndex) =>
          createBlankTableCell(0, columnIndex, { hasHeader })
        )
      );
    }
    tableEditSelection = normalizeTableCellCoordinate(Math.max(0, Math.min(bounds.startRow, nextMatrix.length - 1)), bounds.startColumn);
    tableEditRange = createTableSelectionRange(tableEditSelection, tableEditSelection);
    syncTableSelectionMode(nextMatrix, "cell");
    return reindexTableMatrix(nextMatrix, { hasHeader });
  }

  function deleteSelectedTableColumns(matrix = [], { hasHeader = false } = {}) {
    const nextMatrix = cloneTableMatrix(matrix);
    if (!nextMatrix.length || (nextMatrix[0] || []).length <= 1) {
      return nextMatrix;
    }
    const bounds = getTableEditSelectionBounds(nextMatrix);
    const deleteCount = bounds.endColumn - bounds.startColumn + 1;
    nextMatrix.forEach((row) => row.splice(bounds.startColumn, deleteCount));
    nextMatrix.forEach((row, rowIndex) => {
      if (!row.length) {
        row.push(createBlankTableCell(rowIndex, 0, { hasHeader }));
      }
    });
    tableEditSelection = normalizeTableCellCoordinate(bounds.startRow, Math.max(0, Math.min(bounds.startColumn, (nextMatrix[0] || []).length - 1)));
    tableEditRange = createTableSelectionRange(tableEditSelection, tableEditSelection);
    syncTableSelectionMode(nextMatrix, "cell");
    return reindexTableMatrix(nextMatrix, { hasHeader });
  }

  function moveSelectedTableRows(matrix = [], direction = "down", { hasHeader = false } = {}) {
    const nextMatrix = cloneTableMatrix(matrix);
    const bounds = getTableEditSelectionBounds(nextMatrix);
    const blockSize = bounds.endRow - bounds.startRow + 1;
    const minRow = hasHeader ? 1 : 0;
    if (direction === "up") {
      if (bounds.startRow <= minRow) {
        return nextMatrix;
      }
      const block = nextMatrix.splice(bounds.startRow, blockSize);
      nextMatrix.splice(bounds.startRow - 1, 0, ...block);
      tableEditSelection = normalizeTableCellCoordinate(tableEditSelection.rowIndex - 1, tableEditSelection.columnIndex);
    } else {
      if (bounds.endRow >= nextMatrix.length - 1) {
        return nextMatrix;
      }
      const block = nextMatrix.splice(bounds.startRow, blockSize);
      nextMatrix.splice(bounds.startRow + 1, 0, ...block);
      tableEditSelection = normalizeTableCellCoordinate(tableEditSelection.rowIndex + 1, tableEditSelection.columnIndex);
    }
    tableEditRange = createTableSelectionRange(
      { rowIndex: direction === "up" ? bounds.startRow - 1 : bounds.startRow + 1, columnIndex: bounds.startColumn },
      { rowIndex: direction === "up" ? bounds.endRow - 1 : bounds.endRow + 1, columnIndex: bounds.endColumn }
    );
    syncTableSelectionMode(nextMatrix, "row");
    return reindexTableMatrix(nextMatrix, { hasHeader });
  }

  function moveSelectedTableColumns(matrix = [], direction = "right", { hasHeader = false } = {}) {
    const nextMatrix = cloneTableMatrix(matrix);
    const bounds = getTableEditSelectionBounds(nextMatrix);
    const blockSize = bounds.endColumn - bounds.startColumn + 1;
    if (direction === "left") {
      if (bounds.startColumn <= 0) {
        return nextMatrix;
      }
      nextMatrix.forEach((row) => {
        const block = row.splice(bounds.startColumn, blockSize);
        row.splice(bounds.startColumn - 1, 0, ...block);
      });
      tableEditSelection = normalizeTableCellCoordinate(tableEditSelection.rowIndex, tableEditSelection.columnIndex - 1);
    } else {
      if (bounds.endColumn >= (nextMatrix[0] || []).length - 1) {
        return nextMatrix;
      }
      nextMatrix.forEach((row) => {
        const block = row.splice(bounds.startColumn, blockSize);
        row.splice(bounds.startColumn + 1, 0, ...block);
      });
      tableEditSelection = normalizeTableCellCoordinate(tableEditSelection.rowIndex, tableEditSelection.columnIndex + 1);
    }
    tableEditRange = createTableSelectionRange(
      { rowIndex: bounds.startRow, columnIndex: direction === "left" ? bounds.startColumn - 1 : bounds.startColumn + 1 },
      { rowIndex: bounds.endRow, columnIndex: direction === "left" ? bounds.endColumn - 1 : bounds.endColumn + 1 }
    );
    syncTableSelectionMode(nextMatrix, "column");
    return reindexTableMatrix(nextMatrix, { hasHeader });
  }

  function moveTableRowBlockToIndex(matrix = [], startRow = 0, endRow = 0, targetIndex = 0, { hasHeader = false } = {}) {
    const nextMatrix = cloneTableMatrix(matrix);
    const safeStart = Math.max(0, Math.min(nextMatrix.length - 1, Number(startRow) || 0));
    const safeEnd = Math.max(safeStart, Math.min(nextMatrix.length - 1, Number(endRow) || 0));
    const safeTarget = Math.max(0, Math.min(nextMatrix.length - 1, Number(targetIndex) || 0));
    const blockSize = safeEnd - safeStart + 1;
    const headerLockedRow = hasHeader ? 0 : -1;
    if (safeStart <= headerLockedRow || safeTarget <= headerLockedRow) {
      return nextMatrix;
    }
    if (safeTarget >= safeStart && safeTarget <= safeEnd) {
      return nextMatrix;
    }
    const block = nextMatrix.splice(safeStart, blockSize);
    const insertIndex = safeTarget < safeStart ? safeTarget : safeTarget - blockSize + 1;
    nextMatrix.splice(Math.max(hasHeader ? 1 : 0, insertIndex), 0, ...block);
    const nextStart = Math.max(hasHeader ? 1 : 0, insertIndex);
    const columnCount = Math.max(1, nextMatrix[0]?.length || 1);
    tableEditSelection = normalizeTableCellCoordinate(nextStart, tableEditSelection.columnIndex);
    tableEditRange = createTableSelectionRange(
      { rowIndex: nextStart, columnIndex: 0 },
      { rowIndex: nextStart + blockSize - 1, columnIndex: columnCount - 1 }
    );
    syncTableSelectionMode(nextMatrix, "row");
    return reindexTableMatrix(nextMatrix, { hasHeader });
  }

  function moveTableColumnBlockToIndex(matrix = [], startColumn = 0, endColumn = 0, targetIndex = 0, { hasHeader = false } = {}) {
    const nextMatrix = cloneTableMatrix(matrix);
    const columnCount = Math.max(1, nextMatrix[0]?.length || 1);
    const safeStart = Math.max(0, Math.min(columnCount - 1, Number(startColumn) || 0));
    const safeEnd = Math.max(safeStart, Math.min(columnCount - 1, Number(endColumn) || 0));
    const safeTarget = Math.max(0, Math.min(columnCount - 1, Number(targetIndex) || 0));
    const blockSize = safeEnd - safeStart + 1;
    if (safeTarget >= safeStart && safeTarget <= safeEnd) {
      return nextMatrix;
    }
    nextMatrix.forEach((row) => {
      const block = row.splice(safeStart, blockSize);
      const insertIndex = safeTarget < safeStart ? safeTarget : safeTarget - blockSize + 1;
      row.splice(Math.max(0, insertIndex), 0, ...block);
    });
    const nextStart = safeTarget < safeStart ? safeTarget : safeTarget - blockSize + 1;
    tableEditSelection = normalizeTableCellCoordinate(tableEditSelection.rowIndex, nextStart);
    tableEditRange = createTableSelectionRange(
      { rowIndex: 0, columnIndex: nextStart },
      { rowIndex: Math.max(0, nextMatrix.length - 1), columnIndex: nextStart + blockSize - 1 }
    );
    syncTableSelectionMode(nextMatrix, "column");
    return reindexTableMatrix(nextMatrix, { hasHeader });
  }

  function syncTableEditorRails(matrix = buildTableMatrixFromEditor()) {
    if (!(refs.tableEditor instanceof HTMLDivElement)) {
      return;
    }
    const columnRail = refs.tableEditor.querySelector('[data-role="table-column-rail"]');
    const rowRail = refs.tableEditor.querySelector('[data-role="table-row-rail"]');
    const cornerHandle = refs.tableEditor.querySelector('[data-role="table-corner-handle"]');
    if (!(columnRail instanceof HTMLDivElement) || !(rowRail instanceof HTMLDivElement) || !(cornerHandle instanceof HTMLButtonElement)) {
      return;
    }
    const rowCount = Math.max(1, Array.isArray(matrix) ? matrix.length : 1);
    const columnCount = Math.max(1, Array.isArray(matrix) && matrix.length ? matrix[0]?.length || 1 : 1);
    const bounds = getTableEditSelectionBounds(matrix);
    const editorRect = refs.tableEditor.getBoundingClientRect();
    cornerHandle.classList.toggle(
      "is-selected",
      bounds.startRow === 0 && bounds.endRow === rowCount - 1 && bounds.startColumn === 0 && bounds.endColumn === columnCount - 1
    );

    const columnHandles = Array.from({ length: columnCount }, (_, columnIndex) => {
      const cell = getTableEditorCellElement(0, columnIndex);
      if (!(cell instanceof HTMLElement)) {
        return "";
      }
      const rect = cell.getBoundingClientRect();
      const left = Math.round(rect.left - editorRect.left);
      const width = Math.max(18, Math.round(rect.width));
      const isSelected = bounds.startColumn <= columnIndex && bounds.endColumn >= columnIndex && bounds.startRow === 0 && bounds.endRow === rowCount - 1;
      const isDropTarget =
        tableStructureDragState.active && tableStructureDragState.kind === "column" && tableStructureDragState.targetIndex === columnIndex;
      return `
        <button
          type="button"
          class="canvas-table-axis-handle is-column${isSelected ? " is-selected" : ""}${isDropTarget ? " is-drop-target" : ""}"
          data-role="table-column-handle"
          data-table-handle-kind="column"
          data-column-index="${columnIndex}"
          title="选择第 ${columnIndex + 1} 列，长拖可移动"
          style="left:${left}px;width:${width}px;"
        ></button>
      `;
    }).join("");
    const rowHandles = Array.from({ length: rowCount }, (_, rowIndex) => {
      const cell = getTableEditorCellElement(rowIndex, 0);
      if (!(cell instanceof HTMLElement)) {
        return "";
      }
      const rect = cell.getBoundingClientRect();
      const top = Math.round(rect.top - editorRect.top);
      const height = Math.max(18, Math.round(rect.height));
      const isSelected = bounds.startRow <= rowIndex && bounds.endRow >= rowIndex && bounds.startColumn === 0 && bounds.endColumn === columnCount - 1;
      const isDropTarget =
        tableStructureDragState.active && tableStructureDragState.kind === "row" && tableStructureDragState.targetIndex === rowIndex;
      return `
        <button
          type="button"
          class="canvas-table-axis-handle is-row${isSelected ? " is-selected" : ""}${isDropTarget ? " is-drop-target" : ""}"
          data-role="table-row-handle"
          data-table-handle-kind="row"
          data-row-index="${rowIndex}"
          title="选择第 ${rowIndex + 1} 行，长拖可移动"
          style="top:${top}px;height:${height}px;"
        ></button>
      `;
    }).join("");
    columnRail.innerHTML = columnHandles;
    rowRail.innerHTML = rowHandles;
    refs.tableEditor.classList.toggle("is-row-dragging", tableStructureDragState.active && tableStructureDragState.kind === "row");
    refs.tableEditor.classList.toggle("is-column-dragging", tableStructureDragState.active && tableStructureDragState.kind === "column");
  }

  function beginTableStructureDrag(kind = "", index = 0, event = null, matrix = buildTableMatrixFromEditor()) {
    const safeKind = kind === "column" ? "column" : kind === "row" ? "row" : "";
    if (!safeKind || !event) {
      return false;
    }
    deactivateTableCellEditing({ keepFocus: false });
    const bounds = getTableEditSelectionBounds(matrix);
    const rowCount = Math.max(1, matrix.length || 1);
    const columnCount = Math.max(1, matrix[0]?.length || 1);
    const safeIndex =
      safeKind === "row"
        ? Math.max(0, Math.min(rowCount - 1, Number(index) || 0))
        : Math.max(0, Math.min(columnCount - 1, Number(index) || 0));
    if (safeKind === "row") {
      const reusingRange =
        bounds.startColumn === 0 && bounds.endColumn === columnCount - 1 && safeIndex >= bounds.startRow && safeIndex <= bounds.endRow;
      if (reusingRange) {
        tableEditSelection = normalizeTableCellCoordinate(bounds.startRow, 0);
        tableEditRange = createTableSelectionRange(
          { rowIndex: bounds.startRow, columnIndex: 0 },
          { rowIndex: bounds.endRow, columnIndex: columnCount - 1 }
        );
      } else {
        selectTableRow(safeIndex, matrix);
      }
    } else {
      const reusingRange =
        bounds.startRow === 0 && bounds.endRow === rowCount - 1 && safeIndex >= bounds.startColumn && safeIndex <= bounds.endColumn;
      if (reusingRange) {
        tableEditSelection = normalizeTableCellCoordinate(0, bounds.startColumn);
        tableEditRange = createTableSelectionRange(
          { rowIndex: 0, columnIndex: bounds.startColumn },
          { rowIndex: rowCount - 1, columnIndex: bounds.endColumn }
        );
      } else {
        selectTableColumn(safeIndex, matrix);
      }
    }
    const refreshedBounds = getTableEditSelectionBounds(matrix);
    tableStructureDragState = {
      kind: safeKind,
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
      active: false,
      anchorIndex: safeIndex,
      targetIndex: safeIndex,
      startPrimary: Number(event.clientX || 0),
      startSecondary: Number(event.clientY || 0),
      startRow: refreshedBounds.startRow,
      endRow: refreshedBounds.endRow,
      startColumn: refreshedBounds.startColumn,
      endColumn: refreshedBounds.endColumn,
    };
    syncTableEditorSelectionUI();
    return true;
  }

  function updateTableStructureDrag(event) {
    if (!tableStructureDragState.kind) {
      return false;
    }
    if (tableStructureDragState.pointerId != null && event.pointerId !== tableStructureDragState.pointerId) {
      return false;
    }
    const deltaPrimary = Math.abs(Number(event.clientX || 0) - Number(tableStructureDragState.startPrimary || 0));
    const deltaSecondary = Math.abs(Number(event.clientY || 0) - Number(tableStructureDragState.startSecondary || 0));
    if (!tableStructureDragState.active) {
      const threshold = 6;
      if (Math.max(deltaPrimary, deltaSecondary) < threshold) {
        return false;
      }
      tableStructureDragState.active = true;
    }
    const selector =
      tableStructureDragState.kind === "row" ? '[data-role="table-row-handle"]' : '[data-role="table-column-handle"]';
    const target =
      (event.target instanceof Element ? event.target.closest(selector) : null) ||
      (document.elementFromPoint?.(Number(event.clientX || 0), Number(event.clientY || 0))?.closest?.(selector) || null);
    const attrName = tableStructureDragState.kind === "row" ? "data-row-index" : "data-column-index";
    if (target instanceof HTMLElement) {
      tableStructureDragState.targetIndex = Math.max(0, Number(target.getAttribute(attrName) || 0));
      syncTableEditorSelectionUI();
      return true;
    }
    return false;
  }

  function finishTableStructureDrag() {
    if (!tableStructureDragState.kind) {
      return false;
    }
    const drag = { ...tableStructureDragState };
    resetTableStructureDragState();
    if (!drag.active || drag.targetIndex < 0) {
      syncTableEditorSelectionUI();
      return false;
    }
    mutateTableEditor((matrix) => {
      const hasHeader = getTableEditItem()?.table?.hasHeader !== false;
      if (drag.kind === "row") {
        return moveTableRowBlockToIndex(matrix, drag.startRow, drag.endRow, drag.targetIndex, { hasHeader });
      }
      return moveTableColumnBlockToIndex(matrix, drag.startColumn, drag.endColumn, drag.targetIndex, { hasHeader });
    });
    setStatus(drag.kind === "row" ? "已移动所选行" : "已移动所选列");
    return true;
  }

  async function copyTableSelectionToClipboard({ cut = false } = {}) {
    const matrix = buildTableMatrixFromEditor();
    const selectedMatrix = getTableSelectionMatrix(matrix);
    const text = serializeTableMatrixToTsv(selectedMatrix);
    if (!text.trim()) {
      return false;
    }
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // ignore clipboard permission failures
      }
    }
    if (cut) {
      mutateTableEditor((draftMatrix) =>
        clearTableSelectionContent(draftMatrix, { hasHeader: getTableEditItem()?.table?.hasHeader !== false })
      );
      setStatus("已剪切表格选区");
    } else {
      setStatus("已复制表格选区");
    }
    return true;
  }

  function openRichEditorContextMenuAt(clientX, clientY) {
    if (!(refs.contextMenu instanceof HTMLDivElement) || !(refs.surface instanceof HTMLElement)) {
      return;
    }
    refs.contextMenu.innerHTML = buildRichEditorContextMenuHtml();
    refs.contextMenu.classList.remove("is-hidden");
    placeMenuNearPoint({
      panelEl: refs.contextMenu,
      clientX: Number(clientX || 0),
      clientY: Number(clientY || 0),
      containerRect: refs.surface.getBoundingClientRect(),
      viewportPadding: 12,
      minWidth: 220,
      minHeight: 220,
      hiddenClass: "is-hidden",
    });
    lastContextMenuPoint = { x: Number(clientX || 0), y: Number(clientY || 0) };
    lastContextMenuSource = "rich-editor";
  }

  function openTableEditorContextMenuAt(clientX, clientY) {
    if (!(refs.contextMenu instanceof HTMLDivElement) || !(refs.surface instanceof HTMLElement)) {
      return;
    }
    refs.contextMenu.innerHTML = buildTableContextMenuHtml({
      editing: true,
      selectionMode: syncTableSelectionMode(buildTableMatrixFromEditor()),
    });
    refs.contextMenu.classList.remove("is-hidden");
    placeMenuNearPoint({
      panelEl: refs.contextMenu,
      clientX: Number(clientX || 0),
      clientY: Number(clientY || 0),
      containerRect: refs.surface.getBoundingClientRect(),
      viewportPadding: 12,
      minWidth: 220,
      minHeight: 220,
      hiddenClass: "is-hidden",
    });
    lastContextMenuPoint = { x: Number(clientX || 0), y: Number(clientY || 0) };
    lastContextMenuSource = "table-editor";
  }

  function ensureTableEditorReadyForAction({ syncToUiAnchor = false, anchorCell = null } = {}) {
    if (anchorCell) {
      setTableSelectionFromAnchorCell(anchorCell);
    } else if (syncToUiAnchor) {
      syncTableSelectionToUiAnchor();
    }
    if (state.editingType === "table" && state.editingId) {
      return true;
    }
    if (state.board.selectedIds.length !== 1) {
      return false;
    }
    beginTableEdit(state.board.selectedIds[0], tableEditSelection);
    return true;
  }

  function handleTableActionPress(event) {
    const actionTarget = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!actionTarget || actionTarget.getAttribute("data-pointer-action-handled") === "1") {
      return false;
    }
    actionTarget.setAttribute("data-pointer-action-handled", "1");
    event.preventDefault();
    event.stopPropagation();
    onContextMenuClick(event);
    return true;
  }

  function focusTableRowOperationRange(matrix = buildTableMatrixFromEditor()) {
    const { startRow, endRow } = getTableRowOperationBounds(matrix);
    tableEditSelection = normalizeTableCellCoordinate(startRow, 0);
    tableEditRange = createTableSelectionRange(
      { rowIndex: startRow, columnIndex: 0 },
      { rowIndex: endRow, columnIndex: Math.max(0, (matrix[0]?.length || 1) - 1) }
    );
    syncTableSelectionMode(matrix, "row");
    return { startRow, endRow };
  }

  function focusTableColumnOperationRange(matrix = buildTableMatrixFromEditor()) {
    const { startColumn, endColumn } = getTableColumnOperationBounds(matrix);
    tableEditSelection = normalizeTableCellCoordinate(0, startColumn);
    tableEditRange = createTableSelectionRange(
      { rowIndex: 0, columnIndex: startColumn },
      { rowIndex: Math.max(0, matrix.length - 1), columnIndex: endColumn }
    );
    syncTableSelectionMode(matrix, "column");
    return { startColumn, endColumn };
  }

  function triggerTableEdgeInsert(kind = "row", anchorCell = null) {
    const axis = kind === "column" ? "column" : "row";
    if (!ensureTableEditorReadyForAction({ anchorCell })) {
      return false;
    }
    mutateTableEditor((matrix) => {
      const hasHeader = getTableEditItem()?.table?.hasHeader !== false;
      if (axis === "column") {
        const { endColumn } = getTableColumnOperationBounds(matrix);
        return insertTableColumns(matrix, endColumn + 1, 1, { hasHeader });
      }
      const { endRow } = getTableRowOperationBounds(matrix);
      return insertTableRows(matrix, endRow + 1, 1, { hasHeader });
    });
    return true;
  }

  function onTableEdgeInsertMouseDown(event, kind = "row") {
    event.preventDefault();
    event.stopPropagation();
    triggerTableEdgeInsert(kind, getTableActionAnchorCellFromTarget(event.currentTarget));
  }

  function onTableEdgeInsertClick(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function hideMindNodeChrome() {
    if (!(refs.mindNodeChrome instanceof HTMLDivElement)) {
      return;
    }
    refs.mindNodeChrome.classList.add("is-hidden");
    refs.mindNodeChrome.removeAttribute("data-node-id");
    if (!mindNodeChromePointerInside) {
      hideMindNodeLinkPanel();
    }
  }

  function resolveMindNodeChromeTarget() {
    const selectedIds = Array.isArray(state.board.selectedIds)
      ? state.board.selectedIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    if (!selectedIds.length) {
      return null;
    }
    const selectedIdSet = new Set(selectedIds);
    const selectedMindNodes = selectedIds
      .map((id) => getMindNodeById(id))
      .filter(Boolean);
    if (!selectedMindNodes.length) {
      return null;
    }
    const rootCandidates = selectedMindNodes.filter((node) => !selectedIdSet.has(String(node.parentId || "").trim()));
    if (rootCandidates.length !== 1) {
      return null;
    }
    return rootCandidates[0];
  }

  function clearMindMapDropFeedback() {
    if (!state.mindMapDropTargetId && !state.mindMapDropHint) {
      return false;
    }
    state.mindMapDropTargetId = null;
    state.mindMapDropHint = "";
    return true;
  }

  function setMindMapDropFeedback(targetId = "", hint = "") {
    const nextTargetId = String(targetId || "").trim() || null;
    const nextHint = String(hint || "").trim();
    if (state.mindMapDropTargetId === nextTargetId && state.mindMapDropHint === nextHint) {
      return false;
    }
    state.mindMapDropTargetId = nextTargetId;
    state.mindMapDropHint = nextHint;
    return true;
  }

  function getViewportClampedScreenRect(rect = null, viewportWidth = 0, viewportHeight = 0) {
    const width = Math.max(0, Number(viewportWidth || 0) || 0);
    const height = Math.max(0, Number(viewportHeight || 0) || 0);
    if (!rect || !width || !height) {
      return null;
    }
    const left = Math.max(0, Math.min(width, Number(rect.left || 0)));
    const top = Math.max(0, Math.min(height, Number(rect.top || 0)));
    const right = Math.max(0, Math.min(width, Number(rect.left || 0) + Number(rect.width || 0)));
    const bottom = Math.max(0, Math.min(height, Number(rect.top || 0) + Number(rect.height || 0)));
    const clampedWidth = Math.max(0, right - left);
    const clampedHeight = Math.max(0, bottom - top);
    if (!clampedWidth || !clampedHeight) {
      return null;
    }
    return {
      left,
      top,
      width: clampedWidth,
      height: clampedHeight,
      right,
      bottom,
    };
  }

  function syncMindNodeChrome() {
    const chrome = ensureMindNodeChrome();
    if (!(chrome instanceof HTMLDivElement) || !(refs.fixedOverlayHost instanceof HTMLDivElement)) {
      return;
    }
    const selectedItem = state.tool === "select" ? resolveMindNodeChromeTarget() : null;
    if (
      !selectedItem ||
      selectedItem.type !== "mindNode" ||
      state.editingType === "mind-node" ||
      state.editingType === "table" ||
      state.editingType === "codeBlock" ||
      state.editingType === "file-memo" ||
      state.editingType === "image-memo"
    ) {
      hideMindNodeChrome();
      return;
    }
    const nodeRect = getElementScreenBounds(state.board.view, selectedItem);
    const overlayWidth = Math.max(
      Number(refs.fixedOverlayHost?.clientWidth || 0) || 0,
      Number(refs.surface?.clientWidth || 0) || 0,
      Number(refs.canvas?.clientWidth || 0) || 0
    );
    const overlayHeight = Math.max(
      Number(refs.fixedOverlayHost?.clientHeight || 0) || 0,
      Number(refs.surface?.clientHeight || 0) || 0,
      Number(refs.canvas?.clientHeight || 0) || 0
    );
    if (!overlayWidth || !overlayHeight) {
      hideMindNodeChrome();
      return;
    }
    const visibleRect = getViewportClampedScreenRect(nodeRect, overlayWidth, overlayHeight);
    if (!visibleRect) {
      hideMindNodeChrome();
      return;
    }
    const linkCount = getMindNodeLinks(selectedItem).length;
    if (!linkCount && mindNodeLinkPanelPinnedNodeId === selectedItem.id && !mindNodeChromePointerInside) {
      mindNodeLinkPanelPinnedNodeId = "";
    }
    const toolbar = chrome.querySelector(".canvas-mind-node-chrome-group");
    const leftSideControl = chrome.querySelector(".canvas-mind-node-side-control.is-left");
    const rightSideControl = chrome.querySelector(".canvas-mind-node-side-control.is-right");
    const toolbarWidth = Math.max(152, Number(toolbar?.clientWidth || 168) || 168);
    const toolbarHeight = Math.max(28, Number(toolbar?.clientHeight || 30) || 30);
    const sideButtonSize = Math.round(Math.max(16, Math.min(30, scaleSceneValue(state.board.view, 24))));
    const sideButtonInset = Math.max(1, Math.round(sideButtonSize * 0.08));
    const sideIconSpan = Math.max(8, Math.round(sideButtonSize * 0.4));
    const sideIconStroke = Math.max(2, Math.round(sideButtonSize * 0.067));
    const linkAnchorSize = Math.max(14, Math.round(sideButtonSize * 0.72));
    const linkAnchorInset = Math.max(2, Math.round(sideButtonInset + sideButtonSize * 0.08));
    const linkAnchorLoopWidth = Math.max(6, Math.round(linkAnchorSize * 0.33));
    const linkAnchorLoopHeight = Math.max(4, Math.round(linkAnchorSize * 0.2));
    const linkAnchorStroke = Math.max(1.5, Math.round(linkAnchorSize * 0.08));
    const sideControlCenterY = Math.round(Math.max(1, visibleRect.height) / 2);
    const left = clampTableEditorValue(Math.round(visibleRect.left), 0, Math.max(0, overlayWidth - Math.max(1, Math.round(visibleRect.width))));
    const top = clampTableEditorValue(Math.round(visibleRect.top), 0, Math.max(0, overlayHeight - Math.max(1, Math.round(visibleRect.height))));
    chrome.style.left = `${left}px`;
    chrome.style.top = `${top}px`;
    chrome.style.width = `${Math.max(1, Math.round(visibleRect.width))}px`;
    chrome.style.height = `${Math.max(1, Math.round(visibleRect.height))}px`;
    chrome.style.setProperty("--mind-toolbar-width", `${toolbarWidth}px`);
    chrome.style.setProperty("--mind-toolbar-height", `${toolbarHeight}px`);
    chrome.style.setProperty("--mind-side-btn-size", `${sideButtonSize}px`);
    chrome.style.setProperty("--mind-side-btn-inset", `${sideButtonInset}px`);
    chrome.style.setProperty("--mind-side-icon-span", `${sideIconSpan}px`);
    chrome.style.setProperty("--mind-side-icon-stroke", `${sideIconStroke}px`);
    chrome.style.setProperty("--mind-side-control-center-y", `${sideControlCenterY}px`);
    chrome.style.setProperty("--mind-link-anchor-size", `${linkAnchorSize}px`);
    chrome.style.setProperty("--mind-link-anchor-inset", `${linkAnchorInset}px`);
    chrome.style.setProperty("--mind-link-anchor-loop-width", `${linkAnchorLoopWidth}px`);
    chrome.style.setProperty("--mind-link-anchor-loop-height", `${linkAnchorLoopHeight}px`);
    chrome.style.setProperty("--mind-link-anchor-stroke", `${linkAnchorStroke}px`);
    if (leftSideControl instanceof HTMLDivElement) {
      leftSideControl.style.left = `${sideButtonInset}px`;
      leftSideControl.style.right = "auto";
      leftSideControl.style.top = `${sideControlCenterY}px`;
    }
    if (rightSideControl instanceof HTMLDivElement) {
      rightSideControl.style.left = "auto";
      rightSideControl.style.right = `${sideButtonInset}px`;
      rightSideControl.style.top = `${sideControlCenterY}px`;
    }
    chrome.setAttribute("data-node-id", String(selectedItem.id || ""));
    chrome.classList.remove("is-hidden");
    chrome.classList.toggle("is-hover-active", state.hoverId === selectedItem.id || mindNodeChromePointerInside);
    const toggleButton = chrome.querySelector('[data-action="mind-toggle-collapse"]');
    if (toggleButton instanceof HTMLButtonElement) {
      toggleButton.classList.toggle("is-collapsed", selectedItem.collapsed === true);
      toggleButton.setAttribute("aria-label", selectedItem.collapsed ? "展开分支" : "折叠分支");
      toggleButton.setAttribute("title", selectedItem.collapsed ? "展开分支" : "折叠分支");
    }
    const detachButton = chrome.querySelector('[data-action="mind-detach-branch"]');
    if (detachButton instanceof HTMLButtonElement) {
      const canDetach = Boolean(selectedItem.parentId);
      detachButton.disabled = !canDetach;
      detachButton.setAttribute("aria-disabled", canDetach ? "false" : "true");
      detachButton.setAttribute("title", canDetach ? "拆分为独立分支" : "根节点无法拆分");
    }
    const linkButton = chrome.querySelector('[data-action="mind-manage-links"]');
    if (linkButton instanceof HTMLButtonElement) {
      const hasLinks = linkCount > 0;
      linkButton.classList.toggle("has-links", hasLinks);
      linkButton.setAttribute("title", "节点链接");
      linkButton.setAttribute("aria-label", "节点链接");
      linkButton.style.opacity = hasLinks || mindNodeChromePointerInside || state.hoverId === selectedItem.id ? "1" : "0.86";
    }
    syncMindNodeLinkPanel();
  }

  function syncTableEditorSelectionUI() {
    if (!(refs.tableEditor instanceof HTMLDivElement)) {
      return;
    }
    const currentMatrix = buildTableMatrixFromEditor();
    syncTableSelectionMode(currentMatrix);
    const bounds = getTableEditSelectionBounds(currentMatrix);
    refs.tableEditor.querySelectorAll("[data-row-index][data-column-index]").forEach((cell) => {
      if (!(cell instanceof HTMLElement)) {
        return;
      }
      const rowIndex = Number(cell.getAttribute("data-row-index"));
      const columnIndex = Number(cell.getAttribute("data-column-index"));
      const isInRange =
        rowIndex >= bounds.startRow &&
        rowIndex <= bounds.endRow &&
        columnIndex >= bounds.startColumn &&
        columnIndex <= bounds.endColumn;
      cell.classList.toggle("is-selected", isInRange);
      cell.classList.toggle(
        "is-active",
        rowIndex === Number(tableEditSelection.rowIndex) && columnIndex === Number(tableEditSelection.columnIndex)
      );
      const isEditing = isTableCellEditing(rowIndex, columnIndex);
      cell.classList.toggle("is-editing", isEditing);
      cell.tabIndex = rowIndex === Number(tableEditSelection.rowIndex) && columnIndex === Number(tableEditSelection.columnIndex) ? 0 : -1;
    });
    const anchorCellState = getTableUiAnchorCell();
    const selectedCell = getTableEditorCellElement(anchorCellState.rowIndex, anchorCellState.columnIndex);
    const rowAddButton = refs.tableEditor.querySelector('[data-role="table-add-row"]');
    const columnAddButton = refs.tableEditor.querySelector('[data-role="table-add-column"]');
    if (selectedCell instanceof HTMLElement && rowAddButton instanceof HTMLElement && columnAddButton instanceof HTMLElement) {
      const editorRect = refs.tableEditor.getBoundingClientRect();
      const cellRect = selectedCell.getBoundingClientRect();
      const buttonSize = 22;
      const chromeRevealed = isTableInteractionChromeRevealed();
      refs.tableEditor.classList.toggle("is-chrome-revealed", chromeRevealed);
      const rowButtonTop = clampTableEditorValue(
        Math.round(cellRect.top - editorRect.top + cellRect.height / 2 - buttonSize / 2),
        6,
        Math.max(6, refs.tableEditor.clientHeight - buttonSize - 6)
      );
      const columnButtonLeft = clampTableEditorValue(
        Math.round(cellRect.left - editorRect.left + cellRect.width / 2 - buttonSize / 2),
        6,
        Math.max(6, refs.tableEditor.clientWidth - buttonSize - 6)
      );
      if (chromeRevealed) {
        rowAddButton.setAttribute("data-anchor-row-index", String(anchorCellState.rowIndex));
        rowAddButton.setAttribute("data-anchor-column-index", String(anchorCellState.columnIndex));
        rowAddButton.onmousedown = (event) => onTableEdgeInsertMouseDown(event, "row");
        rowAddButton.onclick = onTableEdgeInsertClick;
        rowAddButton.style.top = `${rowButtonTop}px`;
        rowAddButton.style.right = "4px";
        rowAddButton.classList.remove("is-hidden");
        columnAddButton.setAttribute("data-anchor-row-index", String(anchorCellState.rowIndex));
        columnAddButton.setAttribute("data-anchor-column-index", String(anchorCellState.columnIndex));
        columnAddButton.onmousedown = (event) => onTableEdgeInsertMouseDown(event, "column");
        columnAddButton.onclick = onTableEdgeInsertClick;
        columnAddButton.style.left = `${columnButtonLeft}px`;
        columnAddButton.style.bottom = "4px";
        columnAddButton.classList.remove("is-hidden");
      } else {
        rowAddButton.classList.add("is-hidden");
        columnAddButton.classList.add("is-hidden");
      }
    } else {
      refs.tableEditor.classList.remove("is-chrome-revealed");
      rowAddButton?.removeAttribute("data-anchor-row-index");
      rowAddButton?.removeAttribute("data-anchor-column-index");
      columnAddButton?.removeAttribute("data-anchor-row-index");
      columnAddButton?.removeAttribute("data-anchor-column-index");
      rowAddButton?.classList.add("is-hidden");
      columnAddButton?.classList.add("is-hidden");
    }
    syncTableEditorRails(currentMatrix);
    const editingItem = getTableEditItem();
    if (!(refs.tableToolbar instanceof HTMLDivElement) || !editingItem) {
      return;
    }
    const hasHeader = editingItem?.table?.hasHeader !== false;
    refs.tableToolbar
      .querySelectorAll('[data-action="table-toggle-header"]')
      .forEach((button) => button.classList.toggle("is-active", hasHeader));
    syncTableCellRichEditorLayout();
  }

  function focusTableEditorCell(rowIndex = 0, columnIndex = 0, { placeAtEnd = false, extend = false } = {}) {
    const cell = getTableEditorCellElement(rowIndex, columnIndex);
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    setTableEditSelection(rowIndex, columnIndex, { extend });
    syncTableEditorSelectionUI();
    cell.focus();
    if (!isTableCellEditing(rowIndex, columnIndex)) {
      return;
    }
    tableCellRichTextSession.focus();
    tableCellRichTextSession.captureSelection();
  }

  function getTableCellDraftContent(rowIndex = 0, columnIndex = 0) {
    const targetCell = getTableEditorCellElement(rowIndex, columnIndex);
    if (!(targetCell instanceof HTMLElement)) {
      return null;
    }
    const rawHtml = String(targetCell.getAttribute("data-cell-html") || "").trim();
    const plainText = sanitizeText(
      targetCell.getAttribute("data-cell-plain-text") || htmlToPlainText(rawHtml) || targetCell.textContent || ""
    );
    return normalizeEditedTableCellContent(
      {
        plainText,
        html: rawHtml,
      },
      rawHtml || renderTableCellStaticHtml({ plainText }, Math.max(12, Number(getTableEditItem()?.fontSize || 16) || 16)),
      Math.max(12, Number(getTableEditItem()?.fontSize || 16) || 16)
    );
  }

  function writeTableCellDraftContent(rowIndex = 0, columnIndex = 0, content = null) {
    const targetCell = getTableEditorCellElement(rowIndex, columnIndex);
    if (!(targetCell instanceof HTMLElement) || !content) {
      return false;
    }
    const normalized = normalizeEditedTableCellContent(content, content.html || "", Math.max(12, Number(getTableEditItem()?.fontSize || 16) || 16));
    targetCell.setAttribute("data-cell-html", String(normalized.html || ""));
    targetCell.setAttribute("data-cell-plain-text", String(normalized.plainText || ""));
    const staticNode = targetCell.querySelector('[data-role="table-cell-static"]');
    if (staticNode instanceof HTMLElement) {
      staticNode.innerHTML = renderTableCellStaticHtml(normalized, Math.max(12, Number(getTableEditItem()?.fontSize || 16) || 16));
    } else {
      targetCell.innerHTML = `<div class="canvas-table-cell-static" data-role="table-cell-static">${renderTableCellStaticHtml(
        normalized,
        Math.max(12, Number(getTableEditItem()?.fontSize || 16) || 16)
      )}</div>`;
    }
    return true;
  }

  function syncTableCellRichEditorLayout() {
    const context = getActiveTableCellRichEditingContext();
    if (!(refs.tableCellRichEditor instanceof HTMLDivElement)) {
      return;
    }
    if (!context) {
      refs.tableCellRichEditor.classList.add("is-hidden");
      return;
    }
    const cell = getTableEditorCellElement(context.rowIndex, context.columnIndex);
    if (!(cell instanceof HTMLElement) || !(refs.tableEditor instanceof HTMLDivElement)) {
      refs.tableCellRichEditor.classList.add("is-hidden");
      return;
    }
    const editorRect = refs.tableEditor.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const tableFontSize = Math.max(1, Number(refs.tableEditor.style.fontSize.replace("px", "")) || 13);
    refs.tableCellRichEditor.classList.remove("is-hidden");
    tableCellRichTextSession.applyFrame({
      left: Math.round(cellRect.left - editorRect.left),
      top: Math.round(cellRect.top - editorRect.top),
      width: Math.round(cellRect.width),
      height: Math.round(cellRect.height),
      fontSize: tableFontSize,
      padding: `${refs.tableEditor.style.getPropertyValue("--canvas-table-editor-cell-pad-y") || "7px"} ${
        refs.tableEditor.style.getPropertyValue("--canvas-table-editor-cell-pad-x") || "10px"
      }`,
      lineHeight: refs.tableEditor.style.getPropertyValue("--canvas-table-editor-line-height") || "1.35",
      fontFamily: `"Segoe UI", "PingFang SC", sans-serif`,
      color: "#0f172a",
      overflow: "auto",
    });
  }

  function buildTableMatrixFromEditor() {
    if (!(refs.tableEditor instanceof HTMLDivElement)) {
      return [];
    }
    const rows = Array.from(refs.tableEditor.querySelectorAll("tr[data-row-index]"));
    return rows.map((rowEl, rowIndex) =>
      Array.from(rowEl.querySelectorAll("[data-column-index]")).map((cellEl, columnIndex) => {
        const rawHtml = String(cellEl.getAttribute("data-cell-html") || "").trim();
        const plainText = sanitizeText(
          cellEl.getAttribute("data-cell-plain-text") || htmlToPlainText(rawHtml) || cellEl.textContent || ""
        );
        const content = rawHtml
          ? normalizeEditedTableCellContent(
              {
                plainText,
                html: rawHtml,
              },
              rawHtml,
              Math.max(12, Number(getTableEditItem()?.fontSize || 16) || 16)
            )
          : null;
        return {
          plainText: content?.plainText || plainText,
          html: content?.html || rawHtml,
          richTextDocument: content?.richTextDocument || null,
          header: String(cellEl.getAttribute("data-header") || "") === "1",
          rowIndex,
          columnIndex,
        };
      })
    );
  }

  function getTableEditorCellFromEventTarget(target) {
    return target instanceof Element ? target.closest("[data-row-index][data-column-index]") : null;
  }

  function selectTableEditorCell(rowIndex = 0, columnIndex = 0, { extend = false, keepEditing = false } = {}) {
    const safeRowIndex = Math.max(0, Number(rowIndex) || 0);
    const safeColumnIndex = Math.max(0, Number(columnIndex) || 0);
    setTableHoveredCell(safeRowIndex, safeColumnIndex);
    if (!keepEditing) {
      deactivateTableCellEditing({ keepFocus: false });
    }
    setTableEditSelection(safeRowIndex, safeColumnIndex, { extend });
    syncTableEditorSelectionUI();
  }

  function beginTableCellPointerSelection(event, rowIndex = 0, columnIndex = 0) {
    tablePointerSelectionState.pointerId = Number.isFinite(event?.pointerId) ? event.pointerId : null;
    tablePointerSelectionState.anchor = { rowIndex, columnIndex };
    tablePointerSelectionState.pendingCell = { rowIndex, columnIndex };
    tablePointerSelectionState.multiSelectActive = false;
    tablePointerSelectionState.nativeTextSelection = false;
    tablePointerSelectionState.draggingRange = false;
  }

  function activateTableCellEditing(rowIndex = 0, columnIndex = 0, { placeAtEnd = true, reason = "" } = {}) {
    const normalizedReason = String(reason || "").trim().toLowerCase();
    if (!["dblclick", "keyboard"].includes(normalizedReason)) {
      return false;
    }
    tablePointerSelectionState.multiSelectActive = false;
    tablePointerSelectionState.nativeTextSelection = false;
    tablePointerSelectionState.draggingRange = false;
    const draft = getTableCellDraftContent(rowIndex, columnIndex);
    const fontSize = Math.max(12, Number(getTableEditItem()?.fontSize || 16) || 16);
    setTableCellEditingState(rowIndex, columnIndex, true);
    setTableEditSelection(rowIndex, columnIndex, { extend: false });
    tableCellRichTextSession.begin({
      itemId: String(getTableEditItem()?.id || ""),
      itemType: "table-cell",
      html: draft?.html || renderTableCellStaticHtml({ plainText: draft?.plainText || "" }, fontSize),
      plainText: draft?.plainText || "",
      fontSize,
      baselineSnapshot: editBaselineSnapshot || null,
    });
    syncTableEditorSelectionUI();
    requestAnimationFrame(() => {
      if (isTableCellEditing(rowIndex, columnIndex)) {
        syncTableCellRichEditorLayout();
        if (placeAtEnd) {
          tableCellRichTextSession.moveCaretToEnd?.();
        } else {
          tableCellRichTextSession.focus();
        }
        tableCellRichTextSession.captureSelection();
      }
    });
    return true;
  }

  function deactivateTableCellEditing({ keepFocus = false } = {}) {
    const activeRow = tableCellEditState.rowIndex;
    const activeColumn = tableCellEditState.columnIndex;
    const wasEditing = tableCellEditState.active;
    setTableCellEditingState(activeRow, activeColumn, false);
    tableCellRichTextSession.clear({ destroyAdapter: false });
    refs.tableCellRichEditor?.classList.add("is-hidden");
    syncTableEditorSelectionUI();
    if (keepFocus) {
      getTableEditorCellElement(activeRow, activeColumn)?.focus?.();
    }
    return wasEditing;
  }

  function syncTableToolbarLayout(item) {
    if (!(refs.tableToolbar instanceof HTMLDivElement) || !(refs.surface instanceof HTMLElement) || !item) {
      return;
    }
    const frame = ensureTableEditFrame(item);
    if (!frame) {
      refs.tableToolbar.classList.add("is-hidden");
      return;
    }
    const hostRect = refs.surface.getBoundingClientRect();
    const toolbarWidth = Math.max(1, refs.tableToolbar.offsetWidth || 132);
    const toolbarHeight = Math.max(1, refs.tableToolbar.offsetHeight || 34);
    const chromeRevealed = isTableInteractionChromeRevealed();
    if (!chromeRevealed) {
      refs.tableToolbar.classList.add("is-hidden");
      return;
    }
    const nextLeft = Math.max(8, Math.min(frame.left + frame.width - toolbarWidth - 10, hostRect.width - toolbarWidth - 8));
    const nextTop = Math.max(8, Math.min(frame.top - toolbarHeight - 10, hostRect.height - toolbarHeight - 8));
    refs.tableToolbar.style.left = `${Math.round(nextLeft)}px`;
    refs.tableToolbar.style.top = `${Math.round(nextTop)}px`;
    refs.tableToolbar.classList.remove("is-hidden");
  }

  function syncTableEditorLayout() {
    if (!(refs.tableEditor instanceof HTMLDivElement)) {
      return;
    }
    if (!state.editingId || state.editingType !== "table") {
      resetTableInteractionUiState();
      refs.tableEditor.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
      return;
    }
    refs.editor?.classList.add("is-hidden");
    refs.richEditor?.classList.add("is-hidden");
    refs.richSelectionToolbar?.classList.add("is-hidden");
    refs.fileMemoEditor?.classList.add("is-hidden");
    refs.imageMemoEditor?.classList.add("is-hidden");
    refs.codeBlockEditor?.classList.add("is-hidden");
    refs.codeBlockToolbar?.classList.add("is-hidden");
    richTextSession.clear({ destroyAdapter: false });
    const item = getTableEditItem();
    if (!item) {
      state.editingId = null;
      state.editingType = null;
      resetTableInteractionUiState();
      refs.tableEditor.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
      lastTableEditItemId = null;
      tableEditRange = null;
      tableEditFrame = null;
      resetTablePointerSelectionState();
      setTableCellEditingState(0, 0, false);
      return;
    }
    const frame = ensureTableEditFrame(item);
    if (!frame) {
      resetTableInteractionUiState();
      refs.tableEditor.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
      return;
    }
    if (lastTableEditItemId !== item.id || !refs.tableEditor.querySelector("table")) {
      refs.tableEditor.innerHTML = buildTableEditorHtml(item);
      ensureTableCellRichEditorHost();
      lastTableEditItemId = item.id;
    }
    const tableScrollHost = refs.tableEditor.querySelector('[data-role="table-scroll"]');
    if (tableScrollHost instanceof HTMLElement && tableScrollHost.dataset.scrollBound !== "1") {
      tableScrollHost.addEventListener("scroll", onTableEditorScroll, { passive: true });
      tableScrollHost.dataset.scrollBound = "1";
    }
    refs.tableEditor.style.left = `${frame.left}px`;
    refs.tableEditor.style.top = `${frame.top}px`;
    refs.tableEditor.style.width = `${frame.width}px`;
    refs.tableEditor.style.height = `${frame.height}px`;
    const tableGrid = getStructuredTableSceneGrid(item);
    const scale = Math.max(0.1, Number(state.board.view?.scale || 1));
    const tableFontSize = Math.max(1, scaleSceneValue({ scale }, 12, { min: 9 }));
    const cellPadX = scaleSceneValue({ scale }, 8, { min: 5 });
    const cellPadY = scaleSceneValue({ scale }, 6, { min: 4 });
    const lineHeight = Math.max(tableFontSize * 1.35, scaleSceneValue({ scale }, 15, { min: 11 }));
    const rowHeight = Math.max(1, Number(frame.height || 0) / Math.max(1, Number(tableGrid?.rowCount || 1)));
    refs.tableEditor.style.fontSize = `${tableFontSize}px`;
    refs.tableEditor.style.setProperty("--canvas-table-editor-font-size", `${tableFontSize}px`);
    refs.tableEditor.style.setProperty("--canvas-table-editor-cell-pad-x", `${cellPadX}px`);
    refs.tableEditor.style.setProperty("--canvas-table-editor-cell-pad-y", `${cellPadY}px`);
    refs.tableEditor.style.setProperty("--canvas-table-editor-line-height", `${lineHeight}px`);
    refs.tableEditor.style.setProperty("--canvas-table-editor-row-height", `${rowHeight}px`);
    refs.tableEditor.classList.remove("is-hidden");
    syncTableToolbarLayout(item);
    syncTableEditorSelectionUI();
  }

  function getCodeBlockEditItem() {
    return state.editingType === "code-block" ? sceneRegistry.getItemById(state.editingId, "codeBlock") || null : null;
  }

  function getSelectedCodeBlockItem() {
    return sceneRegistry.getSingleSelectedItem("codeBlock");
  }

  function getCodeBlockDraftDirtyState(item) {
    if (!item || state.editingType !== "code-block" || !codeBlockEditor.isEditing(item.id)) {
      return false;
    }
    return sanitizeText(codeBlockEditor.getValue() || "") !== getCodeBlockContent(item);
  }

  function syncCodeBlockToolbarMeta(item) {
    const meta = refs.codeBlockToolbar?.querySelector?.('[data-role="code-block-meta"]');
    if (!(meta instanceof HTMLElement) || !item) {
      return;
    }
    const dirty = getCodeBlockDraftDirtyState(item);
    meta.textContent = describeCodeBlockToolbarState(item, { dirty });
    meta.title = describeCodeBlockToolbarState(item, { dirty });
    meta.dataset.dirty = dirty ? "1" : "0";
    meta.style.background = dirty ? "rgba(254, 249, 195, 0.96)" : "rgba(241, 245, 249, 0.92)";
    meta.style.borderColor = dirty ? "rgba(245, 158, 11, 0.45)" : "rgba(203, 213, 225, 0.92)";
    meta.style.color = dirty ? "#92400e" : "#475569";
  }

  function setCodeBlockCopyButtonFeedback(button, copied = false) {
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const defaultLabel = String(button.dataset.copyDefaultLabel || button.textContent || "复制").trim() || "复制";
    button.dataset.copyDefaultLabel = defaultLabel;
    button.classList.toggle("is-copied", copied);
    button.textContent = copied ? "已复制" : defaultLabel;
    button.setAttribute("aria-label", copied ? "代码已复制" : defaultLabel);
    button.setAttribute("title", copied ? "代码已复制" : defaultLabel);
  }

  async function writeClipboardTextWithFallback(text = "") {
    const content = String(text || "");
    if (!content) {
      return false;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        return true;
      }
    } catch {
      // Fall through to execCommand-based fallback for older/electron-limited runtimes.
    }
    if (typeof document === "undefined" || typeof document.execCommand !== "function") {
      return false;
    }
    const helper = document.createElement("textarea");
    helper.value = content;
    helper.setAttribute("readonly", "true");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    helper.style.pointerEvents = "none";
    helper.style.left = "-9999px";
    helper.style.top = "-9999px";
    document.body.appendChild(helper);
    helper.focus();
    helper.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    helper.remove();
    return copied;
  }

  function collectCodeBlockCopyButtons(itemId = "") {
    const buttons = [];
    const normalizedId = String(itemId || "").trim();
    if (normalizedId && refs.codeBlockDisplayHost instanceof HTMLElement) {
      const staticButton = refs.codeBlockDisplayHost.querySelector(
        `.canvas2d-code-block-item[data-id="${normalizedId}"] [data-action="copy-code"]`
      );
      if (staticButton instanceof HTMLElement) {
        buttons.push(staticButton);
      }
    }
    const toolbarItem = getCodeBlockEditItem() || getSelectedCodeBlockItem();
    if (
      refs.codeBlockToolbar instanceof HTMLElement &&
      toolbarItem &&
      (!normalizedId || String(toolbarItem.id || "") === normalizedId)
    ) {
      const toolbarButton = refs.codeBlockToolbar.querySelector('[data-action="code-copy"]');
      if (toolbarButton instanceof HTMLElement) {
        buttons.push(toolbarButton);
      }
    }
    return buttons;
  }

  function flashCodeBlockCopyFeedback(itemId = "") {
    const normalizedId = String(itemId || "").trim();
    if (!normalizedId) {
      return;
    }
    const previousTimer = codeBlockCopyFeedbackTimers.get(normalizedId);
    if (previousTimer) {
      clearTimeout(previousTimer);
    }
    const buttons = collectCodeBlockCopyButtons(normalizedId);
    buttons.forEach((button) => setCodeBlockCopyButtonFeedback(button, true));
    const timer = setTimeout(() => {
      collectCodeBlockCopyButtons(normalizedId).forEach((button) => setCodeBlockCopyButtonFeedback(button, false));
      codeBlockCopyFeedbackTimers.delete(normalizedId);
    }, 1400);
    codeBlockCopyFeedbackTimers.set(normalizedId, timer);
  }

  async function copyCodeBlockContent(item) {
    const content = getCodeBlockContent(item);
    if (!content.trim()) {
      setStatus("代码块为空");
      return false;
    }
    const copied = await writeClipboardTextWithFallback(content);
    if (!copied) {
      setStatus("代码复制失败", "warning");
      return false;
    }
    flashCodeBlockCopyFeedback(item.id);
    setStatus("代码已复制");
    return true;
  }

  async function copyCodeBlockTextContent(item, format = "plain") {
    const meta = getCopyOperationMeta(item?.type, format);
    const content = (meta?.format || format) === "markdown" ? serializeCodeBlockToMarkdown(item) : getCodeBlockContent(item);
    if (!content.trim()) {
      setStatus("代码块为空");
      return false;
    }
    const copied = await writeClipboardTextWithFallback(content);
    if (!copied) {
      setStatus("复制失败", "warning");
      return false;
    }
    flashCodeBlockCopyFeedback(item?.id || "");
    setStatus(`已复制${meta?.label || "纯文本"}`);
    return true;
  }

  function syncCodeBlockToolbar() {
    if (!(refs.codeBlockToolbar instanceof HTMLDivElement) || !(refs.surface instanceof HTMLElement)) {
      return;
    }
    const item = getCodeBlockEditItem() || getSelectedCodeBlockItem();
    if (!isInteractiveMode() || !item || (state.editingId && state.editingType !== "code-block")) {
      refs.codeBlockToolbar.classList.add("is-hidden");
      return;
    }
    refs.codeBlockToolbar.querySelectorAll('[data-action="code-wrap"]').forEach((button) => {
      const active = item.wrap === true;
      button.classList.toggle("is-active", active);
      if (button instanceof HTMLElement) {
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.setAttribute("title", active ? "关闭自动换行" : "开启自动换行");
      }
    });
    refs.codeBlockToolbar.querySelectorAll('[data-action="code-line-numbers"]').forEach((button) => {
      const active = item.showLineNumbers !== false;
      button.classList.toggle("is-active", active);
      if (button instanceof HTMLElement) {
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.setAttribute("title", active ? "隐藏行号" : "显示行号");
      }
    });
    refs.codeBlockToolbar.querySelectorAll('[data-action="code-preview-toggle"]').forEach((button) => {
      const previewState = getCodeBlockPreviewControlState(item);
      const active = previewState.active;
      button.classList.toggle("is-active", active);
      if (button instanceof HTMLElement) {
        button.textContent = previewState.label;
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.setAttribute("title", previewState.title);
        button.setAttribute("aria-label", previewState.title);
        button.toggleAttribute("disabled", !previewState.enabled);
        button.style.opacity = previewState.enabled ? "1" : "0.45";
        button.style.cursor = previewState.enabled ? "pointer" : "not-allowed";
      }
    });
    refs.codeBlockToolbar.querySelectorAll('[data-action="code-language"]').forEach((input) => {
      if (input instanceof HTMLSelectElement) {
        input.value = normalizeCodeBlockLanguageTag(item.language || "");
      }
    });
    refs.codeBlockToolbar.querySelectorAll('[data-action="code-font-size"]').forEach((input) => {
      if (input instanceof HTMLSelectElement) {
        input.value = String(Math.max(12, Number(item.fontSize || 16)));
      }
    });
    const copyButton = refs.codeBlockToolbar.querySelector('[data-action="code-copy"]');
    if (copyButton instanceof HTMLElement) {
      setCodeBlockCopyButtonFeedback(copyButton, codeBlockCopyFeedbackTimers.has(String(item.id || "")));
    }
    syncCodeBlockToolbarMeta(item);
    refs.codeBlockToolbar.style.left = "18px";
    refs.codeBlockToolbar.style.bottom = "18px";
    refs.codeBlockToolbar.style.top = "auto";
    refs.codeBlockToolbar.style.right = "auto";
    refs.codeBlockToolbar.style.transform = "none";
    refs.codeBlockToolbar.classList.remove("is-hidden");
  }

  function syncCodeBlockEditorLayout(layoutMode = "precise") {
    if (!(refs.codeBlockEditor instanceof HTMLDivElement)) {
      return;
    }
    if (!state.editingId || state.editingType !== "code-block") {
      refs.codeBlockEditor.classList.add("is-hidden");
      return;
    }
    refs.editor?.classList.add("is-hidden");
    refs.richEditor?.classList.add("is-hidden");
    refs.fileMemoEditor?.classList.add("is-hidden");
    refs.imageMemoEditor?.classList.add("is-hidden");
    refs.tableEditor?.classList.add("is-hidden");
    refs.tableToolbar?.classList.add("is-hidden");
    richTextSession.clear({ destroyAdapter: false });
    const item = getCodeBlockEditItem();
    if (!item) {
      state.editingId = null;
      state.editingType = null;
      refs.codeBlockEditor.classList.add("is-hidden");
      lastCodeBlockEditItemId = null;
      codeBlockEditor.clear();
      return;
    }
    const scale = Math.max(0.1, Number(state.board.view.scale || 1));
    const left = Number(item.x || 0) * scale + Number(state.board.view.offsetX || 0);
    const top = Number(item.y || 0) * scale + Number(state.board.view.offsetY || 0);
    const width = Math.max(1, Number(item.width || 1)) * scale;
    const hasEditorDraft = codeBlockEditor.isEditing(item.id);
    const draftCode = hasEditorDraft ? codeBlockEditor.getValue() : "";
    const sessionCode = hasEditorDraft ? draftCode : getCodeBlockContent(item);
    if (lastCodeBlockEditItemId !== item.id || !codeBlockEditor.isEditing(item.id)) {
      codeBlockEditor.begin({
        itemId: item.id,
        code: sessionCode,
        language: item.language,
        showLineNumbers: item.showLineNumbers !== false,
        wrap: item.wrap === true,
        tabSize: Math.max(1, Math.min(8, Number(item.tabSize || 2) || 2)),
      });
      lastCodeBlockEditItemId = item.id;
    } else {
      codeBlockEditor.setLanguage(item.language);
      codeBlockEditor.setWrap(item.wrap === true);
    }
    const currentCode = hasEditorDraft ? codeBlockEditor.getValue() : sessionCode;
    const draftLayout = measureCodeBlockEditorLayout(item, currentCode, {
      widthHint: Number(item.width || 0),
      mode: layoutMode,
    });
    refs.codeBlockEditor.style.left = `${Math.round(left)}px`;
    refs.codeBlockEditor.style.top = `${Math.round(top)}px`;
    refs.codeBlockEditor.style.width = `${Math.round(width)}px`;
    refs.codeBlockEditor.style.height = `${Math.round(Math.max(item.autoHeight !== false ? draftLayout.height : item.height, 48) * scale)}px`;
    refs.codeBlockEditor.style.setProperty("--code-editor-font-size", `${Math.max(12, Number(item.fontSize || 16)) * scale}px`);
    refs.codeBlockEditor.style.setProperty("background", "#ffffff", "important");
    refs.codeBlockEditor.style.setProperty("border-color", "rgba(203, 213, 225, 0.95)", "important");
    refs.codeBlockEditor.style.setProperty("color", "#0f172a", "important");
    refs.codeBlockEditor.style.setProperty("box-shadow", "0 8px 24px rgba(15, 23, 42, 0.12)", "important");
    refs.codeBlockEditor.dataset.layoutMode = String(draftLayout.layoutMode || layoutMode || "precise");
    refs.codeBlockEditor.dataset.dirty = getCodeBlockDraftDirtyState(item) ? "1" : "0";
    refs.codeBlockEditor.setAttribute(
      "title",
      getCodeBlockDraftDirtyState(item) ? "代码块正在编辑，存在未提交改动" : "代码块正在编辑"
    );
    refs.codeBlockEditor.classList.remove("is-hidden");
    syncCodeBlockToolbar();
  }

  function beginCodeBlockEdit(itemId) {
    const item = sceneRegistry.getItemById(itemId, "codeBlock");
    if (!item || !(refs.codeBlockEditor instanceof HTMLDivElement)) {
      return false;
    }
    if (isLockedItem(item)) {
      setStatus("代码块已锁定，无法编辑");
      return false;
    }
    finishImageEdit();
    cancelTextEdit();
    cancelFlowNodeEdit();
    cancelFileMemoEdit();
    cancelImageMemoEdit();
    cancelTableEdit();
    if (!editBaselineSnapshot) {
      editBaselineSnapshot = takeHistorySnapshot(state);
    }
    state.editingId = item.id;
    state.editingType = "code-block";
    state.board.selectedIds = [item.id];
    markCodeBlockOverlayDirty(item.id);
    lastCodeBlockEditItemId = null;
    cancelCodeBlockEditorLayoutSync();
    syncCodeBlockEditorLayout("fast");
    scheduleCodeBlockEditorLayoutSync("precise");
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    requestAnimationFrame(() => {
      codeBlockEditor.focus();
      syncCodeBlockToolbar();
    });
    return true;
  }

  function commitCodeBlockEdit() {
    if (!state.editingId || state.editingType !== "code-block") {
      return false;
    }
    cancelCodeBlockEditorLayoutSync();
    const item = getCodeBlockEditItem();
    if (!item) {
      state.editingId = null;
      state.editingType = null;
      refs.codeBlockEditor?.classList.add("is-hidden");
      refs.codeBlockToolbar?.classList.add("is-hidden");
      lastCodeBlockEditItemId = null;
      codeBlockEditor.clear();
      markCodeBlockOverlayDirty([], { fullRescan: true });
      return false;
    }
    const before = editBaselineSnapshot || null;
    const fallbackBefore = before || takeHistorySnapshot(state);
    const code = sanitizeText(codeBlockEditor.getValue() || "");
    if (!code.trim()) {
      const deletedItemId = item.id;
      state.board.items = state.board.items.filter((entry) => entry.id !== item.id);
      state.board.selectedIds = [];
      state.editingId = null;
      state.editingType = null;
      refs.codeBlockEditor?.classList.add("is-hidden");
      refs.codeBlockToolbar?.classList.add("is-hidden");
      lastCodeBlockEditItemId = null;
      clearCodeBlockEditLayoutCache(deletedItemId);
      codeBlockEditor.clear();
      editBaselineSnapshot = null;
      markCodeBlockOverlayDirty(deletedItemId, { fullRescan: true });
      before
        ? commitCodeBlockPatchHistory(before, deletedItemId, null, "删除空白代码块")
        : commitHistory(fallbackBefore, "删除空白代码块");
      setStatus("已删除空白代码块");
      return true;
    }
    const normalized = updateCodeBlockElement(
      item,
      {
        code,
        text: code,
        plainText: code,
        title: getCodeBlockItemTitle({ ...item, code }),
      },
      {
        remeasure: true,
      }
    );
    Object.assign(item, normalized);
    state.editingId = null;
    state.editingType = null;
    state.board.selectedIds = [item.id];
    markCodeBlockOverlayDirty(item.id);
    refs.codeBlockEditor?.classList.add("is-hidden");
    lastCodeBlockEditItemId = null;
    codeBlockEditor.clear();
    editBaselineSnapshot = null;
    const changed = before
      ? commitCodeBlockPatchHistory(before, item.id, item, "更新代码块")
      : commitHistory(fallbackBefore, "更新代码块");
    if (!changed) {
      syncBoard({ persist: false, emit: true, markDirty: false });
      return true;
    }
    setStatus("代码块已更新");
    persistCommittedBoardIfPossible();
    return true;
  }

  function cancelCodeBlockEdit() {
    if (state.editingType !== "code-block") {
      return false;
    }
    const activeItemId = state.editingId;
    cancelCodeBlockEditorLayoutSync();
    state.editingId = null;
    state.editingType = null;
    refs.codeBlockEditor?.classList.add("is-hidden");
    lastCodeBlockEditItemId = null;
    codeBlockEditor.clear();
    editBaselineSnapshot = null;
    markCodeBlockOverlayDirty(activeItemId);
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    return true;
  }

  function beginTableEdit(itemId, selection = null) {
    const item = sceneRegistry.getItemById(itemId, "table");
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
    setTableEditSelection(selection?.rowIndex, selection?.columnIndex);
    setTableCellEditingState(tableEditSelection.rowIndex, tableEditSelection.columnIndex, false);
    resetTablePointerSelectionState();
    tableEditFrame = resolveTableEditFrame(item, { baseFrame: null });
    lastTableEditItemId = null;
    syncTableEditorLayout();
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    requestAnimationFrame(() => {
      focusTableEditorCell(tableEditSelection.rowIndex, tableEditSelection.columnIndex);
    });
    return true;
  }

  function commitTableEdit() {
    if (!state.editingId || state.editingType !== "table") {
      return false;
    }
    if (tableCellEditState.active) {
      commitActiveTableCellRichEdit({ keepFocus: false });
    }
    const item = getTableEditItem();
    if (!item || !(refs.tableEditor instanceof HTMLDivElement)) {
      state.editingId = null;
      state.editingType = null;
      refs.tableEditor?.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
      lastTableEditItemId = null;
      tableEditRange = null;
      tableEditFrame = null;
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
    tableEditRange = null;
    tableEditFrame = null;
    resetTablePointerSelectionState();
    setTableCellEditingState(0, 0, false);
    editBaselineSnapshot = null;
    const changed = commitItemPatchHistory(before, item.id, item, "更新表格", "table-edit");
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
    if (tableCellEditState.active) {
      cancelActiveTableCellRichEdit({ keepFocus: false });
    }
    state.editingId = null;
    state.editingType = null;
    refs.tableEditor?.classList.add("is-hidden");
    refs.tableToolbar?.classList.add("is-hidden");
    lastTableEditItemId = null;
    tableEditRange = null;
    tableEditFrame = null;
    resetTablePointerSelectionState();
    setTableCellEditingState(0, 0, false);
    editBaselineSnapshot = null;
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    return true;
  }

  function mutateTableEditor(mutator) {
    const item = getTableEditItem();
    if (!(refs.tableEditor instanceof HTMLDivElement) || !item || typeof mutator !== "function") {
      return;
    }
    if (tableCellEditState.active) {
      commitActiveTableCellRichEdit({ keepFocus: false });
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
    tableEditFrame = resolveTableEditFrame(item, { baseFrame: tableEditFrame });
    refs.tableEditor.innerHTML = buildTableEditorHtml(item);
    ensureTableCellRichEditorHost();
    syncTableEditorLayout();
    const preservedRange = tableEditRange ? createTableSelectionRange(tableEditRange.anchor, tableEditRange.focus) : null;
    const preservedSelectionMode = tableEditSelectionMode;
    const focusRowIndex = Math.min(tableEditSelection.rowIndex, Math.max(0, structure.rows.length - 1));
    const focusColumnIndex = Math.min(tableEditSelection.columnIndex, Math.max(0, structure.columns - 1));
    requestAnimationFrame(() => {
      focusTableEditorCell(focusRowIndex, focusColumnIndex);
      if (preservedRange) {
        tableEditRange = createTableSelectionRange(
          {
            rowIndex: Math.min(preservedRange.anchor.rowIndex, Math.max(0, structure.rows.length - 1)),
            columnIndex: Math.min(preservedRange.anchor.columnIndex, Math.max(0, structure.columns - 1)),
          },
          {
            rowIndex: Math.min(preservedRange.focus.rowIndex, Math.max(0, structure.rows.length - 1)),
            columnIndex: Math.min(preservedRange.focus.columnIndex, Math.max(0, structure.columns - 1)),
          }
        );
        syncTableSelectionMode(nextMatrix, preservedSelectionMode);
        syncTableEditorSelectionUI();
      }
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
    const item = sceneRegistry.getItemById(state.editingId, "fileCard");
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
    const item = sceneRegistry.getItemById(itemId, "fileCard");
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
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
    const item = sceneRegistry.getItemById(state.editingId, "fileCard");
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
    const changed = commitItemPatchHistory(before, item.id, item, "更新文件卡备注", "file-memo-edit");
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
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
    const item = sceneRegistry.getItemById(state.editingId, "image");
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
    const item = sceneRegistry.getItemById(itemId, "image");
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
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
    const item = sceneRegistry.getItemById(state.editingId, "image");
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
    const changed = commitItemPatchHistory(before, item.id, item, "更新图片备注", "image-memo-edit");
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
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
    return sceneRegistry.getItemById(itemId, "image");
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
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    return true;
  }

  function finishImageEdit() {
    if (state.editingType !== "image") {
      return false;
    }
    state.editingId = null;
    state.editingType = null;
    lightImageEditor.finishEdit();
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
    const fromNode = sceneRegistry.getItemById(edge.fromId, "flowNode");
    const toNode = sceneRegistry.getItemById(edge.toId, "flowNode");
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
    const matches =
      items === state.board.items
        ? querySceneIndex(getSceneIndexRuntime(), bounds).map((record) => record.item)
        : items.filter((item) => {
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

  function buildExportHistoryEntry({
    result = null,
    kind = "",
    scope = "",
    title = "",
    defaultFileName = "",
  } = {}) {
    if (!result?.ok) {
      return null;
    }
    const filePath = String(result.filePath || result.path || "").trim();
    const fileName = String(result.fileName || (filePath ? getFileName(filePath) : defaultFileName || "")).trim();
    return {
      exportedAt: Date.now(),
      kind: String(kind || "").trim().toLowerCase(),
      scope: String(scope || "").trim().toLowerCase(),
      title: String(title || "").trim() || fileName || "导出记录",
      filePath,
      fileName,
      jumpTarget: filePath || "",
    };
  }

  async function exportBoardAsPdf(options = {}) {
    try {
      setStatus("正在生成 PDF...");
      await waitForUiPaint();
      const result = await structuredExportRuntime.exportBoardAsPdf(state.board, {
        ...options,
        background: "white",
        includeGrid: false,
        backgroundPattern: resolveExportBackgroundPattern(options),
        onOversizeConfirm: ({ requestedCanvasWidth, requestedCanvasHeight, requestedTotalPixels }) => {
          if (typeof window === "undefined" || typeof window.confirm !== "function") {
            return false;
          }
          return window.confirm(
            [
              "当前 PDF 导出尺寸过大，可能导出很慢、占用大量内存，或最终生成失败。",
              "",
              `目标画布像素：${Math.max(1, Math.round(Number(requestedCanvasWidth || 0) || 1))} × ${Math.max(
                1,
                Math.round(Number(requestedCanvasHeight || 0) || 1)
              )}`,
              `总像素：${Math.max(1, Math.round(Number(requestedTotalPixels || 0) || 1)).toLocaleString("zh-CN")}`,
              "",
              "是否仍然继续导出？",
            ].join("\n")
          );
        },
      });
      if (result?.ok) {
        recordExportHistory(
          buildExportHistoryEntry({
            result,
            kind: "pdf",
            scope: "board",
            title: "画布导出 PDF",
            defaultFileName: "freeflow-board.pdf",
          })
        );
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
      const result = await structuredExportRuntime.exportBoardAsPng(state.board, {
        ...options,
        background: "white",
        includeGrid: false,
        backgroundPattern: resolveExportBackgroundPattern(options),
        onOversizeConfirm: ({ requestedCanvasWidth, requestedCanvasHeight, requestedTotalPixels }) => {
          if (typeof window === "undefined" || typeof window.confirm !== "function") {
            return false;
          }
          return window.confirm(
            [
              "当前图片导出尺寸过大，可能导出很慢、占用大量内存，或最终生成失败。",
              "",
              `目标画布像素：${Math.max(1, Math.round(Number(requestedCanvasWidth || 0) || 1))} × ${Math.max(
                1,
                Math.round(Number(requestedCanvasHeight || 0) || 1)
              )}`,
              `总像素：${Math.max(1, Math.round(Number(requestedTotalPixels || 0) || 1)).toLocaleString("zh-CN")}`,
              "",
              "是否仍然继续导出？",
            ].join("\n")
          );
        },
      });
      if (result?.canceled) {
        setStatus("PNG 导出已取消", "warning");
        return result;
      }
      if (result?.ok) {
        recordExportHistory(
          buildExportHistoryEntry({
            result,
            kind: "png",
            scope: "board",
            title: "画布导出 PNG",
            defaultFileName: "freeflow-board.png",
          })
        );
        setStatus(result.message || "PNG 已导出");
        return result;
      }
      setStatus(result?.message || "PNG 导出失败", "warning");
      return result;
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
      hoverHandle: null,
      selectionRect: null,
      mindMapDropTargetId: null,
      mindMapDropHint: "",
      draftElement: null,
      editingId: null,
      imageEditState: null,
      flowDraft: null,
      relationshipDraft: null,
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
    const persistedSourcePath = String(options.sourcePath || "").trim();
    item.source = persistedSourcePath ? "path" : "blob";
    item.dataUrl = persistedSourcePath ? "" : raw;
    item.sourcePath = persistedSourcePath;
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
    void refreshCanvasImageManager({ silent: true });
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
      const result = await structuredExportRuntime.exportItemsAsImage(state.board, items, {
        ...options,
        onOversizeConfirm: ({ requestedCanvasWidth, requestedCanvasHeight, requestedTotalPixels }) => {
          if (typeof window === "undefined" || typeof window.confirm !== "function") {
            return false;
          }
          return window.confirm(
            [
              "当前图片导出尺寸过大，可能导出很慢、占用大量内存，或最终生成失败。",
              "",
              `目标画布像素：${Math.max(1, Math.round(Number(requestedCanvasWidth || 0) || 1))} × ${Math.max(
                1,
                Math.round(Number(requestedCanvasHeight || 0) || 1)
              )}`,
              `总像素：${Math.max(1, Math.round(Number(requestedTotalPixels || 0) || 1)).toLocaleString("zh-CN")}`,
              "",
              "是否仍然继续导出？",
            ].join("\n")
          );
        },
      });
      if (result?.ok) {
        recordExportHistory(
          buildExportHistoryEntry({
            result,
            kind: "png",
            scope: "selection",
            title: "选区导出图片",
            defaultFileName: "freeflow-selection.png",
          })
        );
        setStatus(result.message || "图片已导出");
        return true;
      }
      if (result?.canceled) {
        setStatus("图片导出已取消", "warning");
        return false;
      }
      setStatus(result?.message || "导出失败");
      return false;
    } catch (error) {
      setStatus(error?.message || "导出失败");
      return false;
    }
  }

  function notifyExportToast(message, fallback = "") {
    const text = String(message || fallback || "").trim();
    if (!text) {
      return;
    }
    setSaveToast(text);
  }

  function clearWordExportPreviewRequest(requestId = "") {
    const activeRequestId = String(state.wordExportPreviewRequest?.id || "").trim();
    const expectedRequestId = String(requestId || "").trim();
    if (expectedRequestId && activeRequestId && expectedRequestId !== activeRequestId) {
      return false;
    }
    state.wordExportPreviewRequest = null;
    store.emit();
    return true;
  }

  function getFileCardPreviewRequests() {
    return Array.isArray(state.fileCardPreviewRequests) ? state.fileCardPreviewRequests : [];
  }

  function findFileCardPreviewRequestIndex(requestId = "") {
    const expectedRequestId = String(requestId || "").trim();
    if (!expectedRequestId) {
      return -1;
    }
    return getFileCardPreviewRequests().findIndex((entry) => String(entry?.id || "").trim() === expectedRequestId);
  }

  function findFileCardPreviewRequest(requestId = "") {
    const index = findFileCardPreviewRequestIndex(requestId);
    return index >= 0 ? getFileCardPreviewRequests()[index] || null : null;
  }

  function patchFileCardPreviewRequest(requestId = "", patch = null) {
    const index = findFileCardPreviewRequestIndex(requestId);
    if (index < 0) {
      return null;
    }
    const requests = getFileCardPreviewRequests().slice();
    const current = requests[index];
    const nextPatch = patch && typeof patch === "object" ? patch : {};
    requests[index] = {
      ...current,
      ...nextPatch,
    };
    state.fileCardPreviewRequests = requests;
    return requests[index];
  }

  function clearFileCardPreviewRequest(requestId = "") {
    const expectedRequestId = String(requestId || "").trim();
    const requests = getFileCardPreviewRequests();
    if (!requests.length) {
      return false;
    }
    const targetIndex = expectedRequestId ? findFileCardPreviewRequestIndex(expectedRequestId) : requests.length - 1;
    if (targetIndex < 0) {
      return false;
    }
    const targetRequest = requests[targetIndex];
    const activeItemId = String(targetRequest?.itemId || "").trim();
    const restoreMemoVisible = Boolean(targetRequest?.restoreMemoVisible);
    if (restoreMemoVisible && activeItemId) {
      const item = sceneRegistry.getItemById(activeItemId, "fileCard");
      if (item) {
        item.memoVisible = true;
      }
    }
    const nextRequests = requests.slice();
    nextRequests.splice(targetIndex, 1);
    state.fileCardPreviewRequests = nextRequests;
    clearInlineFileCardPreviewNode();
    store.emit();
    scheduleRender({ overlayDirty: true });
    return true;
  }

  function resolveFileCardPreviewSpec(item = null) {
    if (!item || item.type !== "fileCard") {
      return null;
    }
    const ext = String(item.ext || getFileExtension(item.fileName || item.name || "") || "").trim().toLowerCase();
    if (ext === "docx") {
      return {
        kind: "docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        readRoute: API_ROUTES.filePreviewDocxBase64,
        fileLabel: "Word",
        badgeLabel: "DOCX",
      };
    }
    if (ext === "pdf") {
      return {
        kind: "pdf",
        mimeType: "application/pdf",
        readRoute: API_ROUTES.filePreviewPdfBase64,
        fileLabel: "PDF",
        badgeLabel: "PDF",
      };
    }
    return null;
  }

  async function hydrateFileCardPreviewFile(requestId = "", filePath = "") {
    const activeRequestId = String(requestId || "").trim();
    const targetPath = String(filePath || "").trim();
    if (!activeRequestId || !targetPath) {
      return false;
    }
    try {
      const current = findFileCardPreviewRequest(activeRequestId);
      const previewSpec = current?.previewKind ? {
        kind: String(current.previewKind || "").trim().toLowerCase(),
        mimeType: String(current.previewMime || "").trim().toLowerCase(),
        readRoute:
          String(current.previewKind || "").trim().toLowerCase() === "pdf"
            ? API_ROUTES.filePreviewPdfBase64
            : API_ROUTES.filePreviewDocxBase64,
        fileLabel: String(current.previewKind || "").trim().toLowerCase() === "pdf" ? "PDF" : "Word",
      } : null;
      const fileName = String(current?.fileName || "").trim();
      const mimeType = String(previewSpec?.mimeType || "").trim();
      let result = null;
      const isMissingFileForPreview =
        /^c:[/\\]missing[/\\]/i.test(targetPath) ||
        /^__ff_missing_preview__/i.test(targetPath);
      if (typeof globalThis?.desktopShell?.readFileBase64 === "function") {
        result = await globalThis.desktopShell.readFileBase64(targetPath).catch(() => null);
      }
      if (!result?.ok && isMissingFileForPreview) {
        result = {
          ok: false,
          error: "QA missing preview file",
          data: "",
          mime: mimeType,
        };
      }
      if (!result?.ok && !isMissingFileForPreview) {
        const response = await fetch(previewSpec?.readRoute || API_ROUTES.filePreviewDocxBase64, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filePath: targetPath,
            fileName,
            mimeType,
          }),
        });
        const payload = await readJsonResponse(response, `${previewSpec?.fileLabel || "文件"}预览文件读取`);
        result = {
          ok: response.ok && Boolean(payload?.ok),
          ...payload,
        };
      }
      const latestRequest = findFileCardPreviewRequest(activeRequestId);
      if (!latestRequest) {
        return false;
      }
      const mime = String(result?.mime || "").trim().toLowerCase();
      const fileBase64 = String(result?.data || "").trim();
      const expectedMime = String(previewSpec?.mimeType || "").trim().toLowerCase();
      const mimeAccepted = !mime || mime === expectedMime || mime === "application/octet-stream";
      patchFileCardPreviewRequest(activeRequestId, {
        previewStatus: result?.ok && fileBase64 && mimeAccepted ? "ready" : "failed",
        previewMessage:
          result?.ok && fileBase64 && mimeAccepted
            ? `${previewSpec?.fileLabel || "文件"}预览已加载`
            : String(result?.error || "当前文件暂不支持预览").trim() || "当前文件暂不支持预览",
        previewFileBase64: result?.ok && mimeAccepted ? fileBase64 : "",
        previewMime: mimeAccepted ? expectedMime : "",
        previewDiagnostics: buildFileCardPreviewDiagnostics({
          loadState: result?.ok && fileBase64 && mimeAccepted ? "文档已加载" : "加载失败",
          parseState: "待开始",
          pageCount: 0,
          contentNodeCount: 0,
          runtimeLabel: result?.ok && fileBase64 && mimeAccepted ? "加载中" : "渲染失败",
        }),
      });
      store.emit();
      scheduleRender({ overlayDirty: true });
      if (!(result?.ok && fileBase64 && mimeAccepted)) {
        setStatus(String(result?.error || "当前文件暂不支持预览").trim() || "当前文件暂不支持预览", "warning");
      }
      return Boolean(result?.ok && fileBase64 && mimeAccepted);
    } catch (error) {
      const current = findFileCardPreviewRequest(activeRequestId);
      if (current) {
        patchFileCardPreviewRequest(activeRequestId, {
          previewStatus: "failed",
          previewMessage: String(error?.message || "文件预览加载失败").trim() || "文件预览加载失败",
          previewFileBase64: "",
          previewDiagnostics: buildFileCardPreviewDiagnostics({
            loadState: "加载失败",
            parseState: "否",
            pageCount: 0,
            contentNodeCount: 0,
            runtimeLabel: "渲染失败",
          }),
        });
        store.emit();
        scheduleRender({ overlayDirty: true });
      }
      setStatus(String(error?.message || "文件预览加载失败").trim() || "文件预览加载失败", "warning");
      return false;
    }
  }

  function openFileCardPreview(item = null) {
    const previewSpec = resolveFileCardPreviewSpec(item);
    if (!previewSpec) {
      setStatus("当前仅支持 DOCX / PDF 文件卡预览", "warning");
      return false;
    }
    const sourcePath = String(item?.sourcePath || "").trim();
    if (!sourcePath) {
      setStatus("文件路径为空，无法预览", "warning");
      return false;
    }
    const hasDesktopFileBridge = typeof globalThis?.desktopShell?.readFileBase64 === "function";
    const requestId = createId("file-card-preview");
    const restoreMemoVisible = Boolean(item.memoVisible);
    if (restoreMemoVisible) {
      item.memoVisible = false;
    }
    const anchorWidth = Math.max(1, Number(item.width || 336) || 336);
    const anchorHeight = Math.max(1, Number(item.height || 128) || 128);
    const requests = getFileCardPreviewRequests();
    const existingIndex = requests.findIndex((entry) => String(entry?.itemId || "").trim() === String(item.id || "").trim());
    const nextRequest = {
      id: requestId,
      open: true,
      createdAt: Date.now(),
      itemId: String(item.id || "").trim(),
      fileName: String(item.fileName || item.name || "未命名文件").trim() || "未命名文件",
      sourcePath,
      anchor: {
        x: Number(item.x || 0) || 0,
        y: Number(item.y || 0) || 0,
        width: anchorWidth,
        height: anchorHeight,
      },
      previewStatus: "loading",
      previewMessage: hasDesktopFileBridge ? `正在加载 ${previewSpec.fileLabel} 文件预览...` : `正在通过后端读取 ${previewSpec.fileLabel} 文件预览...`,
      previewRenderState: "loading",
      previewRenderMessage: hasDesktopFileBridge ? `正在准备 ${previewSpec.fileLabel} 预览...` : `正在通过后端读取 ${previewSpec.fileLabel} 文件预览...`,
      previewDiagnostics: buildFileCardPreviewDiagnostics({
        loadState: hasDesktopFileBridge ? "读取中" : "后端读取中",
        parseState: "待开始",
        pageCount: 0,
        contentNodeCount: 0,
        runtimeLabel: "加载中",
      }),
      previewKind: previewSpec.kind,
      previewBadgeLabel: previewSpec.badgeLabel,
      previewMime: previewSpec.mimeType,
      previewFileBase64: "",
      expanded: false,
      previewZoom: 0.82,
      restoreMemoVisible,
    };
    if (existingIndex >= 0) {
      const nextRequests = requests.slice();
      const existingRequest = nextRequests[existingIndex];
      nextRequests[existingIndex] = {
        ...existingRequest,
        ...nextRequest,
      };
      state.fileCardPreviewRequests = nextRequests;
    } else {
      state.fileCardPreviewRequests = [...requests, nextRequest];
    }
    store.emit();
    setStatus(hasDesktopFileBridge ? `正在加载 ${previewSpec.fileLabel} 预览...` : `正在通过后端读取 ${previewSpec.fileLabel} 预览...`);
    scheduleRender({ overlayDirty: true });
    void hydrateFileCardPreviewFile(requestId, sourcePath);
    return true;
  }

  function toggleFileCardPreviewExpanded(requestId = "") {
    const expectedRequestId = String(requestId || "").trim();
    if (!expectedRequestId) {
      return false;
    }
    const activeRequest = findFileCardPreviewRequest(expectedRequestId);
    if (!activeRequest) {
      return false;
    }
    patchFileCardPreviewRequest(expectedRequestId, {
      expanded: !activeRequest.expanded,
    });
    store.emit();
    scheduleRender({ overlayDirty: true });
    return true;
  }

  function setFileCardPreviewZoom(requestId = "", zoom = 0.82) {
    const expectedRequestId = String(requestId || "").trim();
    if (!expectedRequestId) {
      return false;
    }
    const activeRequest = findFileCardPreviewRequest(expectedRequestId);
    if (!activeRequest) {
      return false;
    }
    const nextZoom = Math.min(1.9, Math.max(0.34, Number(zoom || 0.82) || 0.82));
    patchFileCardPreviewRequest(expectedRequestId, {
      previewZoom: nextZoom,
    });
    store.emit();
    scheduleRender({ overlayDirty: true });
    return true;
  }

  async function hydrateWordExportPreviewDocx(requestId = "", ast = null, options = {}) {
    const activeRequestId = String(requestId || "").trim();
    if (!activeRequestId || !ast || typeof globalThis?.desktopShell?.previewWordDocx !== "function") {
      const current = state.wordExportPreviewRequest;
      if (current && String(current.id || "") === activeRequestId) {
        state.wordExportPreviewRequest = {
          ...current,
          previewStatus: "unavailable",
          previewMessage: "当前环境不支持 Word 预览生成，仍可直接导出 Word",
        };
        store.emit();
      }
      return false;
    }
    try {
      const result = await globalThis.desktopShell.previewWordDocx({
        ast,
        defaultName: options.defaultName || "freeflow-word-preview",
      });
      const current = state.wordExportPreviewRequest;
      if (!current || String(current.id || "") !== activeRequestId) {
        return false;
      }
      const docxBase64 = String(result?.docxBase64 || "").trim();
      state.wordExportPreviewRequest = {
        ...current,
        previewStatus: result?.ok && docxBase64 ? "ready" : "failed",
        previewMessage: String(result?.message || (result?.ok ? "Word 预览已生成" : "Word 预览生成失败")).trim(),
        previewDocxBase64: docxBase64,
        previewDocxSize: Number(result?.size || 0) || 0,
      };
      store.emit();
      return Boolean(result?.ok && docxBase64);
    } catch (error) {
      const rawMessage = String(error?.message || error || "").trim();
      const handlerMissing = /No handler registered/i.test(rawMessage) && /preview-word-docx/i.test(rawMessage);
      const current = state.wordExportPreviewRequest;
      if (current && String(current.id || "") === activeRequestId) {
        state.wordExportPreviewRequest = {
          ...current,
          previewStatus: handlerMissing ? "unavailable" : "failed",
          previewMessage: handlerMissing
            ? "当前桌面主进程尚未加载 Word 预览接口，请重启应用后再试；正式 Word 导出不受影响"
            : rawMessage || "Word 预览生成失败",
          previewDocxBase64: "",
        };
        store.emit();
      }
      return false;
    }
  }

  function buildWordExportPreviewRequest(items = [], options = {}) {
    const selectedItems = (Array.isArray(items) ? items : []).filter((entry) => entry && typeof entry === "object");
    const requestId = createId("word-export-preview");
    const preview = buildWordExportPreviewModel(selectedItems, {
      title: options.title || "导出 Word",
    });
    const ast = preview.ast && typeof preview.ast === "object" ? preview.ast : null;
    const previewModel = {
      ...preview,
      ast: undefined,
    };
    return {
      id: requestId,
      open: true,
      createdAt: Date.now(),
      mode: selectedItems.length === 1 ? "rich-text" : "selection",
      title: String(options.title || "导出 Word").trim() || "导出 Word",
      itemIds: selectedItems.map((entry) => String(entry.id || "").trim()).filter(Boolean),
      preview: previewModel,
      previewStatus: ast ? "loading" : "failed",
      previewMessage: ast ? "正在生成临时 Word 预览..." : "没有可用于生成预览的 Word AST",
      previewDocxBase64: "",
      previewDocxSize: 0,
      previewAst: ast,
      exporting: false,
    };
  }

  function openWordExportPreview(items = [], options = {}) {
    const selectedItems = (Array.isArray(items) ? items : []).filter((entry) => entry && typeof entry === "object");
    if (!selectedItems.length) {
      setStatus("未选中可导出内容", "warning");
      notifyExportToast("未选中可导出内容");
      return false;
    }
    try {
      const request = buildWordExportPreviewRequest(selectedItems, options);
      if (!Number(request?.preview?.exportableCount || 0)) {
        setStatus("当前选择中没有可导出到 Word 的元素", "warning");
        notifyExportToast("当前选择中没有可导出到 Word 的元素");
        return false;
      }
      state.wordExportPreviewRequest = request;
      store.emit();
      void hydrateWordExportPreviewDocx(request.id, request.previewAst, {
        defaultName: request.mode === "rich-text" ? "freeflow-rich-text-preview" : "freeflow-selection-word-preview",
      });
      return true;
    } catch (error) {
      const message = String(error?.message || "Word 预览生成失败").trim() || "Word 预览生成失败";
      setStatus(message, "warning");
      notifyExportToast(message);
      return false;
    }
  }

  async function confirmWordExportPreview(requestId = "") {
    const request = state.wordExportPreviewRequest;
    const expectedRequestId = String(requestId || "").trim();
    const activeRequestId = String(request?.id || "").trim();
    if (!request || (expectedRequestId && expectedRequestId !== activeRequestId)) {
      return false;
    }
    const itemIdSet = new Set((Array.isArray(request.itemIds) ? request.itemIds : []).map((id) => String(id || "").trim()));
    const items = state.board.items.filter((item) => itemIdSet.has(String(item?.id || "").trim()));
    if (!items.length) {
      setStatus("可导出内容已不存在", "warning");
      notifyExportToast("可导出内容已不存在");
      clearWordExportPreviewRequest(activeRequestId);
      return false;
    }
    state.wordExportPreviewRequest = {
      ...request,
      exporting: true,
    };
    store.emit();
    const success =
      request.mode === "rich-text" && items.length === 1
        ? await exportRichTextItem(items[0], "word", { skipPreview: true })
        : await exportSelectionAsWord(items, { skipPreview: true });
    if (success) {
      clearWordExportPreviewRequest(activeRequestId);
      return true;
    }
    state.wordExportPreviewRequest = {
      ...request,
      exporting: false,
    };
    store.emit();
    return false;
  }

  async function exportRichTextItem(item, format = "word", options = {}) {
    try {
      const meta = getExportOperationMeta(item?.type, format, item);
      if (!item || !meta) {
        setStatus("仅富文本元素支持此导出");
        notifyExportToast("仅富文本元素支持此导出");
        return false;
      }
      if (meta.format === "word" && !options.skipPreview) {
        return openWordExportPreview([item], {
          title: "富文本导出 Word",
        });
      }
      let result = null;
      if (meta.loadingMessage) {
        setStatus(meta.loadingMessage);
        await waitForUiPaint();
      }
      if (meta.format === "word") {
        result = await structuredExportRuntime.exportRichTextItemAsWordFile(item, {
          defaultName: meta.defaultName,
        });
      } else if (meta.format === "pdf") {
        result = await structuredExportRuntime.exportRichTextItemAsPdf(state.board, item, {
          defaultName: meta.defaultName,
          background: "white",
          includeGrid: false,
        });
      } else if (meta.format === "png") {
        result = await structuredExportRuntime.exportRichTextItemAsPng(state.board, item, {
          defaultName: meta.defaultName,
          forceWhiteBackground: true,
          onOversizeConfirm: ({ requestedCanvasWidth, requestedCanvasHeight, requestedTotalPixels }) => {
            if (typeof window === "undefined" || typeof window.confirm !== "function") {
              return false;
            }
            return window.confirm(
              [
                "当前图片导出尺寸过大，可能导出很慢、占用大量内存，或最终生成失败。",
                "",
                `目标画布像素：${Math.max(1, Math.round(Number(requestedCanvasWidth || 0) || 1))} × ${Math.max(
                  1,
                  Math.round(Number(requestedCanvasHeight || 0) || 1)
                )}`,
                `总像素：${Math.max(1, Math.round(Number(requestedTotalPixels || 0) || 1)).toLocaleString("zh-CN")}`,
                "",
                "是否仍然继续导出？",
              ].join("\n")
            );
          },
        });
      } else if (meta.format === "txt") {
        result = await structuredExportRuntime.exportTextItem(item, { defaultName: meta.defaultName });
      }
      if (result?.ok) {
        recordExportHistory(
          buildExportHistoryEntry({
            result,
            kind: meta.historyKind,
            scope: meta.scope,
            title: meta.historyTitle,
            defaultFileName: meta.defaultFileName,
          })
        );
        const successMessage = result.message || meta.successMessage;
        setStatus(successMessage, "success");
        notifyExportToast(successMessage, meta.successMessage);
        return true;
      }
      if (result?.canceled) {
        const cancelMessage = meta.cancelMessage || "导出已取消";
        setStatus(cancelMessage, "warning");
        notifyExportToast(cancelMessage);
        return false;
      }
      const failureMessage = result?.message || meta.failureMessage;
      setStatus(failureMessage, "warning");
      notifyExportToast(failureMessage, meta.failureMessage);
      return false;
    } catch (error) {
      const message = String(error?.message || "导出失败").trim() || "导出失败";
      setStatus(message, "warning");
      notifyExportToast(message);
      return false;
    }
  }

  async function exportTableItem(item, format = "xlsx") {
    const meta = getExportOperationMeta(item?.type, format, item);
    if (!item || !meta) {
      setStatus("仅表格元素支持此导出");
      return false;
    }
    const result = await structuredExportRuntime.exportTableItem(item, meta.format, {
      defaultName: meta.defaultName,
    });
    if (result?.ok) {
      recordExportHistory(
        buildExportHistoryEntry({
          result,
          kind: meta.historyKind,
          scope: meta.scope,
          title: meta.historyTitle,
          defaultFileName: meta.defaultFileName,
        })
      );
      setStatus(result.message || meta.successMessage);
      return true;
    }
    if (result?.canceled) {
      setStatus(meta.cancelMessage || "表格导出已取消", "warning");
      return false;
    }
    setStatus(result?.message || meta.failureMessage, "warning");
    return false;
  }

  async function exportCodeBlockItem(item, format = "source") {
    const meta = getExportOperationMeta(item?.type, format, item);
    if (!item || !meta) {
      setStatus("仅代码块元素支持此导出");
      return false;
    }
    const result = await structuredExportRuntime.exportCodeBlockItem(item, meta.format, {
      defaultName: meta.defaultName,
    });
    if (result?.ok) {
      recordExportHistory(
        buildExportHistoryEntry({
          result,
          kind: meta.historyKind,
          scope: meta.scope,
          title: meta.historyTitle,
          defaultFileName: meta.defaultFileName,
        })
      );
      setStatus(result.message || meta.successMessage);
      return true;
    }
    if (result?.canceled) {
      setStatus(meta.cancelMessage || "代码块导出已取消", "warning");
      return false;
    }
    setStatus(result?.message || meta.failureMessage, "warning");
    return false;
  }

  async function exportSelectionAsWord(items = [], options = {}) {
    const selectedItems = (Array.isArray(items) ? items : []).filter((item) => item && typeof item === "object");
    if (!selectedItems.length) {
      setStatus("未选中可导出内容", "warning");
      notifyExportToast("未选中可导出内容");
      return false;
    }
    if (!options.skipPreview) {
      return openWordExportPreview(selectedItems, {
        title: "多选元素导出 Word",
      });
    }
    try {
      const result = await structuredExportRuntime.exportSelectionAsWordFile(selectedItems, {
        defaultName: "freeflow-selection-word",
        title: "导出 Word",
      });
      if (result?.ok) {
        recordExportHistory(
          buildExportHistoryEntry({
            result,
            kind: "docx",
            scope: "selection-word",
            title: "多选元素导出 Word",
            defaultFileName: "freeflow-selection-word.docx",
          })
        );
        const message = String(result.message || "已导出 Word").trim() || "已导出 Word";
        setStatus(message, "success");
        notifyExportToast(message, "已导出 Word");
        return true;
      }
      if (result?.canceled) {
        setStatus("导出已取消", "warning");
        notifyExportToast("导出已取消");
        return false;
      }
      const message = String(result?.message || "导出失败").trim() || "导出失败";
      setStatus(message, "warning");
      notifyExportToast(message);
      return false;
    } catch (error) {
      const message = String(error?.message || "导出失败").trim() || "导出失败";
      setStatus(message, "warning");
      notifyExportToast(message);
      return false;
    }
  }

  function buildRichTextClipboardContent(item) {
    if (!item || (item.type !== "text" && item.type !== "flowNode")) {
      return null;
    }
    const content = ensureRichTextDocumentFields(item, {
      html: item.html || "",
      plainText: item.plainText || item.text || "",
      fontSize: item.fontSize || DEFAULT_TEXT_FONT_SIZE,
    });
    const richTextDocument = content.richTextDocument || null;
    const html = sanitizeHtml(
      normalizeRichHtmlInlineFontSizes(
        serializeRichTextDocumentToHtml(richTextDocument, content.html || item.html || ""),
        item.fontSize || DEFAULT_TEXT_FONT_SIZE
      )
    ).trim();
    const plainText = sanitizeText(
      serializeRichTextDocumentToPlainText(
        richTextDocument,
        content.plainText || item.plainText || item.text || htmlToPlainText(html)
      )
    ).trim();
    const markdown = sanitizeText(
      serializeRichTextDocumentToMarkdown(richTextDocument, {
        html,
        plainText,
        text: plainText,
        fontSize: item.fontSize || DEFAULT_TEXT_FONT_SIZE,
      })
    ).trim();
    const objectLink = buildCanvasInternalLinkUrl(item.id);
    return {
      html,
      plainText,
      markdown,
      objectLink,
    };
  }

  async function writeClipboardTextAndHtml({ text = "", html = "" } = {}) {
    const plainText = sanitizeText(String(text || ""));
    const richHtml = String(html || "").trim();
    if (!plainText && !richHtml) {
      return false;
    }
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            ...(richHtml ? { "text/html": new Blob([richHtml], { type: "text/html" }) } : {}),
            "text/plain": new Blob([plainText || htmlToPlainText(richHtml)], { type: "text/plain" }),
          }),
        ]);
        return true;
      } catch {
        // fallback below
      }
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(plainText || htmlToPlainText(richHtml));
        return true;
      } catch {
        // fallback below
      }
    }
    if (typeof document?.execCommand === "function") {
      const textarea = document.createElement("textarea");
      textarea.value = plainText || htmlToPlainText(richHtml);
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      let copied = false;
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      textarea.remove();
      return copied;
    }
    return false;
  }

  async function copyRichTextContent(item, format = "plain") {
    const meta = getCopyOperationMeta(item?.type, format);
    const payload = buildRichTextClipboardContent(item);
    if (!payload || !meta) {
      setStatus("仅富文本元素支持此操作");
      return false;
    }
    let copied = false;
    if (meta.format === "html" || meta.format === "ppt-html") {
      copied = await writeClipboardTextAndHtml({
        text: payload.plainText || htmlToPlainText(payload.html || ""),
        html: payload.html,
      });
    } else if (meta.format === "markdown") {
      copied = await writeClipboardTextAndHtml({ text: payload.markdown });
    } else if (meta.format === "object-link") {
      copied = await writeClipboardTextAndHtml({ text: payload.objectLink });
    } else {
      copied = await writeClipboardTextAndHtml({ text: payload.plainText });
    }
    if (!copied) {
      setStatus("复制失败");
      return false;
    }
    setStatus(`已复制${meta.label}`);
    return true;
  }

  function buildTableClipboardContent(item) {
    if (!item || item.type !== "table") {
      return null;
    }
    const matrix = flattenTableStructureToMatrix(item.table || {});
    if (!Array.isArray(matrix) || !matrix.length) {
      return null;
    }
    return {
      plain: serializeTableMatrixToPlainText(matrix, { hasHeader: item.table?.hasHeader !== false }),
      markdown: serializeTableMatrixToMarkdown(matrix),
      tsv: serializeTableMatrixToTsv(matrix),
    };
  }

  function buildSelectionRichTextClipboardContent(items = []) {
    const plan = buildSelectionWordExportPlan(items);
    const orderedItems = plan.orderedEntries.map((entry) => entry.item).filter(Boolean);
    if (!orderedItems.length) {
      return null;
    }
    const htmlParts = [];
    const markdownParts = [];
    const plainParts = [];

    orderedItems.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }
      if (item.type === "text" || item.type === "flowNode") {
        const payload = buildRichTextClipboardContent(item);
        if (payload?.html) {
          htmlParts.push(payload.html);
        }
        if (payload?.markdown) {
          markdownParts.push(payload.markdown);
        }
        if (payload?.plainText) {
          plainParts.push(payload.plainText);
        }
        return;
      }
      if (item.type === "table") {
        const payload = buildTableClipboardContent(item);
        if (payload?.plain) {
          const plain = sanitizeText(payload.plain).trim();
          const markdown = sanitizeText(payload.markdown || payload.plain).trim();
          const rows = plain.split("\n").filter(Boolean);
          const htmlRows = rows
            .map((row, rowIndex) => {
              const cells = row.split("\t");
              const cellTag = rowIndex === 0 ? "th" : "td";
              return `<tr>${cells.map((cell) => `<${cellTag}>${escapeHtml(cell)}</${cellTag}>`).join("")}</tr>`;
            })
            .join("");
          htmlParts.push(`<table>${htmlRows}</table>`);
          markdownParts.push(markdown);
          plainParts.push(plain);
        }
        return;
      }
      if (item.type === "codeBlock") {
        const plain = getCodeBlockContent(item);
        const markdown = serializeCodeBlockToMarkdown(item);
        htmlParts.push(`<pre><code>${escapeHtml(plain)}</code></pre>`);
        markdownParts.push(markdown);
        plainParts.push(plain);
        return;
      }
      if (item.type === "mathBlock" || item.type === "mathInline") {
        const formula = sanitizeText(String(item.formula || item.plainText || item.text || "")).trim();
        if (formula) {
          htmlParts.push(`<p>${escapeHtml(formula)}</p>`);
          markdownParts.push(item.type === "mathBlock" ? `$$\n${formula}\n$$` : `$${formula}$`);
          plainParts.push(formula);
        }
      }
    });

    const html = htmlParts.join("<p></p>").trim();
    const markdown = sanitizeText(markdownParts.join("\n\n")).trim();
    const plainText = sanitizeText(plainParts.join("\n\n")).trim();
    return html || markdown || plainText
      ? {
          html,
          markdown,
          plainText,
        }
      : null;
  }

  async function copySelectedItemsContent(format = "html") {
    const items = getSelectedItemsFast();
    const payload = buildSelectionRichTextClipboardContent(items);
    if (!payload) {
      setStatus("未选中可复制内容", "warning");
      return false;
    }
    let copied = false;
    if (format === "markdown") {
      copied = await writeClipboardTextAndHtml({ text: payload.markdown || payload.plainText });
    } else if (format === "plain") {
      copied = await writeClipboardTextAndHtml({ text: payload.plainText });
    } else {
      copied = await writeClipboardTextAndHtml({
        text: payload.plainText || htmlToPlainText(payload.html || ""),
        html: payload.html,
      });
    }
    if (!copied) {
      setStatus("复制失败", "warning");
      return false;
    }
    const label = format === "markdown" ? "Markdown" : format === "plain" ? "纯文本" : "富文本";
    setStatus(`已复制所选${label}`);
    return true;
  }

  async function copyTableTextContent(item, format = "plain") {
    const meta = getCopyOperationMeta(item?.type, format);
    const payload = buildTableClipboardContent(item);
    if (!payload || !meta) {
      setStatus("仅表格元素支持此操作");
      return false;
    }
    const text =
      meta.format === "markdown"
        ? payload.markdown
        : meta.format === "tsv"
          ? payload.tsv
          : payload.plain;
    const copied = await writeClipboardTextAndHtml({ text });
    if (!copied) {
      setStatus("复制失败");
      return false;
    }
    setStatus(`已复制${meta.label}`);
    return true;
  }

  async function startCanvasCapture() {
    if (!refs.canvas) {
      return;
    }
    captureMode = "canvas";
    state.captureModeActive = true;
    state.captureModeDragging = false;
    state.selectionRect = null;
    setStatus("拖动框选分享区域，单击直接分享当前画布");
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
        recordExportHistory(
          buildExportHistoryEntry({
            result,
            kind: "png",
            scope: "capture",
            title: "画布截图导出",
            defaultFileName: "画布截图.png",
          })
        );
        const inserted = await insertImageFromDataUrl(dataUrl, {
          name: "画布截图",
          anchorPoint,
          sourcePath: result.path || "",
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
      state.captureModeActive = false;
      state.captureModeDragging = false;
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
    const affectedItemIds = state.board.items
      .filter((item) => item?.type === "fileCard" || item?.type === "image")
      .map((item) => String(item?.id || "").trim())
      .filter(Boolean);
    syncBoard({
      persist: true,
      emit: true,
      sceneChange: true,
      boardChange: true,
      fullOverlayRescan: false,
      reason: "set-local-file-access",
      itemIds: affectedItemIds,
    });
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
    syncBoard({
      persist: true,
      emit: true,
      sceneChange: false,
      backgroundChange: true,
      boardChange: true,
      fullOverlayRescan: false,
      reason: "set-background-pattern",
    });
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
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    return true;
  }

  function clearTransientState() {
    state.pointer = null;
    state.selectionRect = null;
    state.draftElement = null;
    state.hoverId = null;
    state.hoverHandle = null;
    state.hoverConnector = null;
    clearMindMapDropFeedback();
    flowDraft = null;
    clearAlignmentSnap("clear-transient");
  }

  function clearBlockedCanvasPointerDown() {
    blockedCanvasPointerDown = null;
  }

  function matchesBlockedCanvasPointerDown(event) {
    if (!blockedCanvasPointerDown) {
      return false;
    }
    const pointerId = Number(event?.pointerId);
    const blockedPointerId = Number(blockedCanvasPointerDown.pointerId);
    if (Number.isFinite(pointerId) && Number.isFinite(blockedPointerId) && pointerId === blockedPointerId) {
      return true;
    }
    const timestamp = Number(event?.timeStamp || 0);
    return Number.isFinite(timestamp) && timestamp <= Number(blockedCanvasPointerDown.expiresAt || 0);
  }

  function hideEditingUiForDeferredBlankExit(editingType = "") {
    if (editingType === "text" || editingType === "flow-node" || editingType === "mind-node") {
      refs.editor?.classList.add("is-hidden");
      refs.richEditor?.classList.add("is-hidden");
      refs.richToolbar?.classList.add("is-hidden");
      refs.richSelectionToolbar?.classList.add("is-hidden");
      return;
    }
    if (editingType === "code-block") {
      refs.codeBlockEditor?.classList.add("is-hidden");
      refs.codeBlockToolbar?.classList.add("is-hidden");
      return;
    }
    if (editingType === "table") {
      refs.tableEditor?.classList.add("is-hidden");
      refs.tableToolbar?.classList.add("is-hidden");
      return;
    }
    if (editingType === "file-memo") {
      refs.fileMemoEditor?.classList.add("is-hidden");
      return;
    }
    if (editingType === "image-memo") {
      refs.imageMemoEditor?.classList.add("is-hidden");
      return;
    }
  }

  function flushDeferredBlankEditExit() {
    const pending = deferredBlankEditExit;
    deferredBlankEditExit = null;
    deferredBlankEditExitFrame = 0;
    clearBlockedCanvasPointerDown();
    if (!pending) {
      return false;
    }
    let committed = false;
    if (pending.editingType === "text" || pending.editingType === "flow-node" || pending.editingType === "mind-node") {
      committed = commitRichEdit();
    } else if (pending.editingType === "code-block") {
      committed = commitCodeBlockEdit();
    } else if (pending.editingType === "table") {
      committed = commitTableEdit();
    } else if (pending.editingType === "file-memo") {
      committed = commitFileMemoEdit();
    } else if (pending.editingType === "image-memo") {
      committed = commitImageMemoEdit();
    }
    if (!pending.clearSelectionAfterCommit) {
      return committed;
    }
    if (state.board.selectedIds.length) {
      state.board.selectedIds = [];
      state.lastSelectionSource = null;
      state.selectionRect = null;
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    }
    return committed;
  }

  function scheduleDeferredBlankEditExit(editingType, event) {
    if (!editingType || deferredBlankEditExit) {
      return false;
    }
    const pointerId = Number(event?.pointerId);
    const timeStamp = Number(event?.timeStamp || 0);
    deferredBlankEditExit = {
      editingType,
      clearSelectionAfterCommit: !(event?.shiftKey || event?.metaKey || event?.ctrlKey),
    };
    blockedCanvasPointerDown = {
      pointerId: Number.isFinite(pointerId) ? pointerId : null,
      expiresAt: (Number.isFinite(timeStamp) ? timeStamp : 0) + 64,
    };
    hideEditingUiForDeferredBlankExit(editingType);
    deferredBlankEditExitFrame = requestAnimationFrame(() => {
      deferredBlankEditExitFrame = 0;
      flushDeferredBlankEditExit();
    });
    return true;
  }

  function shouldDeferBlankPointerExit(event) {
    if (resolvePendingCanvasLinkBindingMode()) {
      return "";
    }
    if (!state.editingType || !(event?.target instanceof Element) || event.button !== 0) {
      return "";
    }
    if (!refs.canvas || event.target !== refs.canvas) {
      return "";
    }
    const scenePoint = toScenePoint(event.clientX, event.clientY);
    const target = resolveSelectionTarget(state.board.items, scenePoint, state.board.view.scale);
    if (target) {
      return "";
    }
    return String(state.editingType || "");
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
      cancelMindNodeEdit();
      cancelTableEdit();
      cancelFileMemoEdit();
      cancelImageMemoEdit();
      finishImageEdit();
    }
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
  }

  function setMode(nextMode = "canvas2d") {
    store.setMode(normalizeMode(nextMode));
    if (!isInteractiveMode()) {
      clearTransientState();
      cancelTextEdit();
      cancelFlowNodeEdit();
      cancelMindNodeEdit();
      cancelTableEdit();
      cancelFileMemoEdit();
      cancelImageMemoEdit();
      finishImageEdit();
    }
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
    commitItemsPatchHistory(before, Array.from(remove), "删除元素", "item-delete-batch", {
      beforeOrderIds: Array.isArray(before.items) ? before.items.map((item) => item.id) : [],
      afterOrderIds: nextItems.map((item) => item.id),
    });
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
    const items = sceneRegistry.getSelectedItems();
    if (!items.length) {
      return null;
    }
    if (items.length >= 24) {
      await yieldToNextFrame();
    }
    const fileBacked = items.filter((item) => item.type === "fileCard" || item.type === "image");
    if (fileBacked.length) {
      const changed = await resolveFileCardSourcesForItems(fileBacked);
      if (changed) {
        syncBoard({
          persist: true,
          emit: true,
          sceneChange: true,
          fullOverlayRescan: false,
          reason: "copy-selection-resolve-sources",
          itemIds: fileBacked.map((item) => String(item?.id || "").trim()).filter(Boolean),
        });
      }
    }
    const baseClipboardPayload = clipboardBroker.buildPayloadFromItems(items);
    const flowback = shouldBuildStructuredFlowback(items)
      ? structuredImportRuntime.buildFlowbackPayload(items)
      : null;
    const externalOutput = flowback?.externalOutput || {};
    const nextClipboard = baseClipboardPayload
      ? {
          ...baseClipboardPayload,
          text: String(externalOutput.text || baseClipboardPayload.text || ""),
          html: String(externalOutput.html || baseClipboardPayload.html || ""),
          filePaths:
            Array.isArray(externalOutput.filePaths) && externalOutput.filePaths.length
              ? externalOutput.filePaths.slice()
              : Array.isArray(baseClipboardPayload.filePaths)
                ? baseClipboardPayload.filePaths.slice()
                : [],
          structuredFlowback: flowback,
        }
      : null;
    const copied = nextClipboard
      ? await clipboardBroker.copyPayloadToClipboard(nextClipboard)
      : null;
    if (items.length >= 24) {
      await yieldToNextFrame();
    }
    state.clipboard = copied ? { ...copied, pasteCount: 0 } : copied;
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

  async function duplicateElementsWithDeltaAsync(items = [], deltaX = 0, deltaY = 0, options = {}) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return [];
    }
    if (list.length < PASTE_BATCH_YIELD_ITEM_THRESHOLD) {
      return duplicateElementsWithDelta(list, deltaX, deltaY, options);
    }
    const duplicatedItems = [];
    const chunkSize = Math.max(1, Number(options?.chunkSize) || PASTE_BATCH_YIELD_CHUNK_SIZE);
    for (let index = 0; index < list.length; index += chunkSize) {
      duplicatedItems.push(...duplicateElementsWithDelta(list.slice(index, index + chunkSize), deltaX, deltaY, options));
      if (index + chunkSize < list.length) {
        await yieldToNextFrame();
      }
    }
    return duplicatedItems;
  }

  function pasteInternalClipboard(anchorPoint = getCenterScenePoint(), options = {}) {
    const payload = state.clipboard;
    if (!payload?.items?.length) {
      return false;
    }
    const stagger = options?.stagger !== false;
    const historyReason = String(options?.historyReason || "粘贴元素");
    const statusPrefix = String(options?.statusPrefix || "已粘贴");
    const before = takeHistoryMetadataSnapshot(state);
    const beforeOrderIds = state.board.items.map((item) => String(item?.id || "").trim()).filter(Boolean);
    const bounds = getBoardBounds(payload.items);
    const pasteCount = Math.max(0, Number(payload.pasteCount) || 0);
    const groupOffset = stagger ? 28 + pasteCount * 20 : 0;
    const anchorX = Number(anchorPoint?.x || 0) + groupOffset;
    const anchorY = Number(anchorPoint?.y || 0) + groupOffset;
    const deltaX = anchorX - Number(bounds?.left || 0);
    const deltaY = anchorY - Number(bounds?.top || 0);
    const pasted = normalizeImportedPasteFrameItems(duplicateElementsWithDelta(payload.items, deltaX, deltaY, {
      forceWrapText: options?.forceWrapText === true,
    }));
    payload.pasteCount = stagger ? pasteCount + 1 : pasteCount;
    state.board.items.push(...pasted);
    state.board.selectedIds = pasted.map((item) => item.id);
    void hydrateFileCardIds(pasted);
    commitItemsPatchHistory(before, pasted.map((item) => item.id), historyReason, "item-insert-batch", {
      beforeOrderIds,
      afterOrderIds: state.board.items.map((item) => String(item?.id || "").trim()).filter(Boolean),
    });
    setStatus(`${statusPrefix} ${pasted.length} 个元素`);
    return true;
  }

  async function pasteInternalClipboardAsync(anchorPoint = getCenterScenePoint(), options = {}) {
    const payload = state.clipboard;
    if (!payload?.items?.length) {
      return false;
    }
    const stagger = options?.stagger !== false;
    const historyReason = String(options?.historyReason || "粘贴元素");
    const statusPrefix = String(options?.statusPrefix || "已粘贴");
    const before = takeHistoryMetadataSnapshot(state);
    const bounds = getBoardBounds(payload.items);
    const pasteCount = Math.max(0, Number(payload.pasteCount) || 0);
    const groupOffset = stagger ? 28 + pasteCount * 20 : 0;
    const anchorX = Number(anchorPoint?.x || 0) + groupOffset;
    const anchorY = Number(anchorPoint?.y || 0) + groupOffset;
    const deltaX = anchorX - Number(bounds?.left || 0);
    const deltaY = anchorY - Number(bounds?.top || 0);
    const pasted = normalizeImportedPasteFrameItems(await duplicateElementsWithDeltaAsync(payload.items, deltaX, deltaY, {
      forceWrapText: options?.forceWrapText === true,
    }));
    payload.pasteCount = stagger ? pasteCount + 1 : pasteCount;
    state.board.items.push(...pasted);
    state.board.selectedIds = pasted.map((item) => item.id);
    void hydrateFileCardIds(pasted);
    commitInsertedItemsPatchHistory(before, pasted, historyReason, "item-insert-batch", {
      fullOverlayRescan: true,
    });
    setStatus(`${statusPrefix} ${pasted.length} 个元素`);
    return true;
  }

  function clearInternalClipboard() {
    state.clipboard = null;
    clipboardBroker.clearPayload?.();
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

  async function readSystemClipboardInternalMarker() {
    const clipboardItems = await clipboardBroker.readSystemClipboardItems();
    for (const clipboardItem of clipboardItems) {
      const types = Array.isArray(clipboardItem?.types) ? clipboardItem.types : [];
      if (types.includes(CANVAS_CLIPBOARD_MIME) && typeof clipboardItem.getType === "function") {
        try {
          const blob = await clipboardItem.getType(CANVAS_CLIPBOARD_MIME);
          const marker = parseInternalClipboardMarker(await blob.text());
          if (marker) {
            return marker;
          }
        } catch {
          // Ignore unreadable custom clipboard payloads and continue fallback probes.
        }
      }
      if (types.includes("text/html") && typeof clipboardItem.getType === "function") {
        try {
          const blob = await clipboardItem.getType("text/html");
          const marker = parseInternalClipboardMarkerFromHtml(await blob.text());
          if (marker) {
            return marker;
          }
        } catch {
          // Ignore unreadable HTML clipboard payloads and continue scanning.
        }
      }
    }
    return null;
  }

  function hasStructuredClipboardItems(payload = null) {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items.some((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      return (
        item.type === "codeBlock" ||
        item.type === "table" ||
        item.type === "mathBlock" ||
        item.type === "mathInline" ||
        item.type === "flowNode" ||
        (item.structuredImport && typeof item.structuredImport === "object")
      );
    });
  }

  async function shouldUseInternalClipboard() {
    const payload = state.clipboard;
    if (!payload?.items?.length) {
      return false;
    }

    const marker = await readSystemClipboardInternalMarker();
    if (marker && Number(marker?.copiedAt) === Number(payload?.copiedAt)) {
      return true;
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
    if (hasStructuredClipboardItems(payload) && clipboardText && clipboardText === payloadText) {
      return true;
    }
    if (hasStructuredClipboardItems(payload) && !clipboardText) {
      return true;
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

  function scheduleDeferredSemanticUpgradeForTextItem(itemId, sourceText = "") {
    const targetItemId = String(itemId || "").trim();
    const plainSourceText = sanitizeText(String(sourceText || ""));
    if (!targetItemId || !plainSourceText.trim() || deferredTextSemanticUpgradeTasks.has(targetItemId)) {
      return;
    }
    const task = (async () => {
      await yieldToIdleWindow(120);
      const item = sceneRegistry.getItemById(targetItemId, "text");
      if (!item || isLockedText(item)) {
        return;
      }
      const currentPlainText = sanitizeText(item.plainText || item.text || htmlToPlainText(item.html || ""));
      if (currentPlainText !== plainSourceText) {
        return;
      }
      const semanticHtml = await convertPlainClipboardTextToSemanticHtmlAsync(
        plainSourceText,
        item.fontSize || DEFAULT_TEXT_FONT_SIZE
      );
      if (!String(semanticHtml || "").trim()) {
        return;
      }
      const content = normalizeEditedRichTextContent(item, semanticHtml, item.fontSize || DEFAULT_TEXT_FONT_SIZE);
      const plainText = content.plainText;
      const canonicalHtml = normalizeRichHtmlInlineFontSizes(
        getCanonicalRichTextHtml(content, semanticHtml),
        item.fontSize || DEFAULT_TEXT_FONT_SIZE
      );
      const refreshedLinkSemantics = linkSemanticEnabled
        ? refreshTextLinkSemantics(
            {
              ...item,
              html: canonicalHtml,
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
        item.fontSize || DEFAULT_TEXT_FONT_SIZE
      );
      const widthHint =
        finalLayoutConfig.layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT
          ? Math.max(80, Number(finalLayoutConfig.widthHint || item.width || 0) || 80)
          : Math.max(80, Number(item.width || 0) || 80);
      const measured = measureTextElementLayout(
        {
          ...item,
          html: canonicalHtml,
          plainText,
          text: plainText,
          richTextDocument: richTextDocumentWithMeta,
          textBoxLayoutMode: finalLayoutConfig.layoutMode,
          textResizeMode: finalLayoutConfig.resizeMode,
          width: widthHint,
          height: Math.max(40, Number(item.height || 0) || 40),
        },
        {
          includeHtmlMeasurement: true,
          widthHint,
        }
      );
      const nextWidth =
        finalLayoutConfig.layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH
          ? Math.max(80, Math.ceil(Number(measured.width || item.width || 0) || 80))
          : widthHint;
      const nextHeight = Math.max(40, Math.ceil(Number(measured.height || item.height || 0) || 40));
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
        width: nextWidth,
        height: nextHeight,
      });
      Object.assign(item, normalizedItem);
      scheduleUrlMetaHydrationForItem(item);
      syncBoard({
        persist: true,
        emit: true,
        sceneChange: true,
        fullOverlayRescan: false,
        reason: "deferred-text-semantic-upgrade",
        itemIds: [targetItemId],
      });
    })()
      .catch(() => {})
      .finally(() => {
        deferredTextSemanticUpgradeTasks.delete(targetItemId);
      });
    deferredTextSemanticUpgradeTasks.set(targetItemId, task);
  }

  function insertTextAt(anchorPoint, text, options = {}) {
    const deferSemanticUpgrade = options?.deferSemanticUpgrade === true;
    const statusText = String(options?.statusText || "已插入文本");
    const sourceText = sanitizeText(text || "");
    const items = dragBroker.createElementsFromText(sourceText, anchorPoint).map((entry) => {
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
    const textItemIds = items.filter((entry) => entry?.type === "text").map((entry) => String(entry.id || ""));
    const pushed = pushItems(items, { reason: "插入文本", statusText });
    if (pushed && deferSemanticUpgrade && textItemIds.length) {
      textItemIds.forEach((id) => scheduleDeferredSemanticUpgradeForTextItem(id, sourceText));
    }
    return pushed;
  }

  function finalizeInsertedTextItems(items = []) {
    return items.map((entry) => {
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
  }

  function shouldPreferStructuredClipboardTextImport(text = "") {
    const source = sanitizeText(String(text || ""));
    if (!source.trim()) {
      return false;
    }
    if (hasMarkdownMathSyntax(source)) {
      return true;
    }
    const detected = detectTextContentType(source);
    return (
      detected?.type === DETECTED_TEXT_TYPES.CODE ||
      detected?.type === DETECTED_TEXT_TYPES.MATH ||
      MARKDOWN_SEMANTIC_TEXT_TYPES.has(detected?.type)
    );
  }

  async function tryStructuredClipboardTextImport(anchorPoint, text, options = {}) {
    const sourceText = sanitizeText(text || "");
    if (!shouldPreferStructuredClipboardTextImport(sourceText)) {
      return false;
    }
    const descriptor = structuredImportRuntime.pasteGateway.fromSystemClipboardSnapshot(
      {
        text: sourceText,
      },
      buildStructuredImportContext(anchorPoint, {
        origin: String(options?.origin || "clipboard-text-fallback"),
      })
    );
    return tryStructuredImportDescriptor(descriptor, anchorPoint, {
      reason: String(options?.reason || "粘贴内容"),
      statusText: String(options?.statusText || "已粘贴内容"),
      context: {
        origin: String(options?.origin || "clipboard-text-fallback"),
      },
    });
  }

  function insertHtmlTextAt(anchorPoint, html, options = {}) {
    const statusText = String(options?.statusText || "已粘贴内容");
    const items = finalizeInsertedTextItems(dragBroker.createElementsFromHtml(html, anchorPoint));
    return pushItems(items, { reason: "粘贴内容", statusText });
  }

  async function insertClipboardTextAt(anchorPoint, text, options = {}) {
    const sourceText = sanitizeText(text || "");
    if (!sourceText.trim()) {
      return false;
    }
    const statusText = String(options?.statusText || "已粘贴内容");
    const structuredImported = await tryStructuredClipboardTextImport(anchorPoint, sourceText, {
      origin: String(options?.origin || "clipboard-text-insert"),
      reason: String(options?.reason || "粘贴内容"),
      statusText,
    });
    if (structuredImported) {
      return true;
    }
    const semanticHtml = await convertPlainClipboardTextToSemanticHtmlAsync(
      sourceText,
      options?.baseFontSize || DEFAULT_TEXT_FONT_SIZE
    );
    if (String(semanticHtml || "").trim()) {
      return insertHtmlTextAt(anchorPoint, semanticHtml, { statusText });
    }
    const deferSemanticUpgrade = options?.deferSemanticUpgrade === true;
    return insertTextAt(anchorPoint, sourceText, {
      deferSemanticUpgrade,
      statusText,
    });
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
    const committedItems = normalizeImportedPasteFrameItems(Array.isArray(commitResult.items) ? commitResult.items : []);
    const before = takeHistoryMetadataSnapshot(state);
    state.board.items.push(...committedItems);
    state.board.selectedIds = committedItems.map((item) => item.id);
    void hydrateFileCardIds(committedItems);
    commitInsertedItemsPatchHistory(before, committedItems, reason || "结构化导入", "structured-import-batch", {
      fullOverlayRescan: true,
    });
    scheduleDeferredImportedAssetPersistence(committedItems, {
      reason: "structured-import-asset-persist",
    });
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
      const shouldYieldDuringCommit = shouldYieldDuringStructuredImportDescriptor(descriptor);
      const result = await structuredImportRuntime.runDescriptor({
        descriptor,
        board: state.board,
        anchorPoint,
        context: buildStructuredImportContext(anchorPoint, {
          ...context,
          yieldControl: shouldYieldDuringCommit ? () => yieldToNextFrame() : null,
        }),
      });
      if (result?.pipeline === "structured" && result?.commitResult?.ok) {
        return applyStructuredCommitResult(result.commitResult, { reason, statusText });
      }
    } catch {
      // fall back to legacy pipeline
    }
    return false;
  }

  function createFileDescriptorEntriesFromFiles(files, entryPrefix = "file") {
    return Array.from(files || [])
      .map((file, index) => {
        const resolvedPath =
          typeof file?.path === "string" && file.path
            ? file.path
            : typeof globalThis?.desktopShell?.getPathForFile === "function"
              ? globalThis.desktopShell.getPathForFile(file)
              : "";
        const name = typeof file?.name === "string" ? file.name : getFileName(resolvedPath);
        if (!resolvedPath && !name) {
          return null;
        }
        const mimeType = typeof file?.type === "string" ? file.type : "";
        return {
          entryId: `${entryPrefix}-${index}`,
          kind: mimeType.startsWith("image/") ? INPUT_ENTRY_KINDS.IMAGE : INPUT_ENTRY_KINDS.FILE,
          status: "ready",
          errorCode: "none",
          mimeType,
          name,
          size: Number.isFinite(file?.size) ? Number(file.size) : null,
          charset: "",
          raw: {
            filePath: resolvedPath,
          },
          meta: {
            extension: getFileExtension(name),
            displayName: name || getFileName(resolvedPath),
            isFromClipboardFile: false,
          },
        };
      })
      .filter(Boolean);
  }

  function buildDragFileDescriptor(files, anchorPoint) {
    const entries = createFileDescriptorEntriesFromFiles(files, "drag-file");
    if (!entries.length) {
      return null;
    }
    return createInputDescriptor({
      descriptorId: `drag-files-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channel: INPUT_CHANNELS.DRAG_DROP,
      sourceKind: entries.some((entry) => entry.kind === INPUT_ENTRY_KINDS.IMAGE)
        ? INPUT_SOURCE_KINDS.IMAGE_RESOURCE
        : INPUT_SOURCE_KINDS.FILE_RESOURCE,
      status: "ready",
      errorCode: "none",
      mimeTypes: Array.from(new Set(entries.map((entry) => entry.mimeType).filter(Boolean))),
      tags: entries.some((entry) => entry.kind === INPUT_ENTRY_KINDS.IMAGE) ? ["drag-drop", "contains-image"] : ["drag-drop", "contains-file"],
      context: buildStructuredImportContext(anchorPoint, {
        origin: "engine-drop-files",
      }),
      entries,
    });
  }

  function buildDragHtmlDescriptor(dataTransfer, anchorPoint) {
    const html = String(dataTransfer?.getData?.("text/html") || "").trim();
    if (!html || !/<\/?[a-z][\s\S]*>/i.test(html)) {
      return null;
    }
    const text = String(dataTransfer?.getData?.("text/plain") || dataTransfer?.getData?.("text") || "");
    const entries = [
      {
        entryId: "drag-html-0",
        kind: INPUT_ENTRY_KINDS.HTML,
        status: "ready",
        errorCode: "none",
        mimeType: "text/html",
        name: "",
        size: html.length,
        charset: "utf-8",
        raw: {
          html,
          text: htmlToPlainText(html),
        },
        meta: {},
      },
    ];
    if (text.trim()) {
      entries.push({
        entryId: "drag-html-text-1",
        kind: INPUT_ENTRY_KINDS.TEXT,
        status: "ready",
        errorCode: "none",
        mimeType: "text/plain",
        name: "",
        size: text.length,
        charset: "utf-8",
        raw: {
          text,
        },
        meta: {},
      });
    }
    return createInputDescriptor({
      descriptorId: `drag-html-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channel: INPUT_CHANNELS.DRAG_DROP,
      sourceKind: INPUT_SOURCE_KINDS.HTML,
      status: "ready",
      errorCode: "none",
      mimeTypes: ["text/html", ...(text.trim() ? ["text/plain"] : [])],
      tags: ["drag-drop", "contains-html", "rich-html"],
      context: buildStructuredImportContext(anchorPoint, {
        origin: "engine-drop-html",
      }),
      entries,
    });
  }

  function buildProgrammaticFileDescriptor(files, anchorPoint) {
    const entries = createFileDescriptorEntriesFromFiles(files, "programmatic-file");
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
    item.rootId = item.id;
    item.branchSide = MIND_BRANCH_RIGHT;
    state.board.items.push(item);
    state.board.selectedIds = [item.id];
    commitHistory(before, "创建节点");
    setStatus("已添加节点");
    refs.canvas?.focus?.();
    return true;
  }

  function normalizeMindNodeLinks(links = []) {
    if (!Array.isArray(links)) {
      return [];
    }
    const seen = new Set();
    return links
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const targetId = String(entry.targetId || entry.id || "").trim();
        if (!targetId || seen.has(targetId)) {
          return null;
        }
        seen.add(targetId);
        return {
          id: String(entry.id || `mind-link-${targetId}-${index}`),
          targetId,
          targetType: String(entry.targetType || entry.type || "").trim(),
          title: String(entry.title || entry.label || "").trim(),
          createdAt: Number(entry.createdAt) || Date.now(),
        };
      })
      .filter(Boolean);
  }

  function getMindNodeById(itemId) {
    return sceneRegistry.getItemById(itemId, "mindNode");
  }

  function getMindNodeLinks(node = null) {
    return normalizeMindNodeLinks(node?.links || []);
  }

  function resolvePendingCanvasLinkBindingMode() {
    if (!pendingCanvasLinkBinding) {
      return "";
    }
    if (pendingCanvasLinkBinding === true) {
      return "rich-text";
    }
    if (pendingCanvasLinkBinding && typeof pendingCanvasLinkBinding === "object") {
      return String(pendingCanvasLinkBinding.mode || "").trim().toLowerCase();
    }
    return "";
  }

  function beginMindNodeCanvasLinkBinding(nodeId = "") {
    const node = getMindNodeById(nodeId);
    if (!node) {
      setStatus("未找到节点");
      return false;
    }
    pendingCanvasLinkBinding = {
      mode: "mind-node",
      sourceId: node.id,
    };
    syncCanvasLinkBindingUi();
    setStatus("节点链接模式：请在画布中点击目标元素（Esc 取消）");
    return true;
  }

  function addMindNodeCanvasLink(nodeId = "", targetId = "") {
    const node = getMindNodeById(nodeId);
    const target = sceneRegistry.getItemById(targetId) || state.board.items.find((item) => String(item?.id || "").trim() === String(targetId || "").trim());
    if (!node || !target) {
      setStatus("链接目标不存在");
      return false;
    }
    if (String(node.id || "") === String(target.id || "")) {
      setStatus("不能链接到当前节点自身");
      return false;
    }
    const links = getMindNodeLinks(node);
    if (links.some((entry) => entry.targetId === target.id)) {
      setStatus("该节点已存在此链接");
      return false;
    }
    const before = takeHistorySnapshot(state);
    node.links = [
      ...links,
      {
        id: `mind-link-${target.id}-${Date.now()}`,
        targetId: String(target.id || ""),
        targetType: String(target.type || ""),
        title: String(target.title || target.name || target.id || "").trim(),
        createdAt: Date.now(),
      },
    ];
    state.board.selectedIds = [node.id];
    mindNodeLinkPanelPinnedNodeId = node.id;
    commitHistory(before, "添加节点链接");
    setStatus("已创建节点链接");
    refs.canvas?.focus?.();
    return true;
  }

  function removeMindNodeCanvasLink(nodeId = "", targetId = "") {
    const node = getMindNodeById(nodeId);
    if (!node) {
      return false;
    }
    const links = getMindNodeLinks(node);
    const nextLinks = links.filter((entry) => String(entry.targetId || "").trim() !== String(targetId || "").trim());
    if (nextLinks.length === links.length) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    node.links = nextLinks;
    state.board.selectedIds = [node.id];
    commitHistory(before, "删除节点链接");
    setStatus("已删除节点链接");
    refs.canvas?.focus?.();
    return true;
  }

  function clearMindNodeCanvasLinks(nodeId = "") {
    const node = getMindNodeById(nodeId);
    if (!node || !getMindNodeLinks(node).length) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    node.links = [];
    state.board.selectedIds = [node.id];
    commitHistory(before, "清空节点链接");
    setStatus("已清空节点链接");
    refs.canvas?.focus?.();
    return true;
  }

  function resolveMindNodeLinkEntries(node = null) {
    return getMindNodeLinks(node).map((entry) => {
      const target =
        sceneRegistry.getItemById(entry.targetId) ||
        state.board.items.find((item) => String(item?.id || "").trim() === String(entry.targetId || "").trim()) ||
        null;
      return {
        ...entry,
        target,
        title: String(entry.title || target?.title || target?.name || entry.targetId || "未命名元素").trim(),
        desc: target ? `跳转到 ${String(target.type || "item")}` : "目标元素不存在",
      };
    });
  }

  function getMindSubtreeNodeIds(rootId = "") {
    const safeRootId = String(rootId || "").trim();
    if (!safeRootId) {
      return [];
    }
    const nodeIds = [];
    const queue = [safeRootId];
    const seen = new Set();
    while (queue.length) {
      const currentId = String(queue.shift() || "").trim();
      if (!currentId || seen.has(currentId)) {
        continue;
      }
      seen.add(currentId);
      const node = getMindNodeById(currentId);
      if (!node) {
        continue;
      }
      nodeIds.push(currentId);
      const children = Array.isArray(node.childrenIds) ? node.childrenIds : [];
      children.forEach((childId) => {
        const safeChildId = String(childId || "").trim();
        if (safeChildId && !seen.has(safeChildId)) {
          queue.push(safeChildId);
        }
      });
    }
    return nodeIds;
  }

  function appendMindChild(parent, child, options = {}) {
    const side = normalizeMindBranchSide(options.branchSide, MIND_BRANCH_AUTO);
    child.parentId = parent.id;
    child.rootId = String(parent.rootId || parent.id || "");
    child.depth = Math.max(0, Number(parent.depth || 0) + 1);
    child.order = Array.isArray(parent.childrenIds) ? parent.childrenIds.length : 0;
    child.branchSide = side === MIND_BRANCH_AUTO ? normalizeMindBranchSide(parent.branchSide, MIND_BRANCH_RIGHT) : side;
    parent.childrenIds = [...(Array.isArray(parent.childrenIds) ? parent.childrenIds : []), child.id];
    state.board.items.push(child);
  }

  function createMindChildNode(parentId, options = {}) {
    const parent = getMindNodeById(parentId);
    if (!parent) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    const side =
      normalizeMindBranchSide(options.branchSide, MIND_BRANCH_AUTO) === MIND_BRANCH_AUTO
        ? (!parent.parentId
            ? MIND_BRANCH_RIGHT
            : normalizeMindBranchSide(parent.branchSide, MIND_BRANCH_RIGHT))
        : normalizeMindBranchSide(options.branchSide, MIND_BRANCH_RIGHT);
    const child = createMindNodeElement(
      {
        x: Number(parent.x || 0) + Number(parent.width || 220) + 88,
        y: Number(parent.y || 0) + Number(parent.height || 96) + 24,
      },
      String(options.title || "")
    );
    appendMindChild(parent, child, { branchSide: side });
    parent.collapsed = false;
    relayoutMindMapFromNode(parent);
    state.board.selectedIds = [child.id];
    commitHistory(before, "创建思维子节点");
    refs.canvas?.focus?.();
    beginMindNodeEdit(child.id);
    return true;
  }

  function createMindSiblingNode(nodeId, options = {}) {
    const node = getMindNodeById(nodeId);
    const parent = node?.parentId ? getMindNodeById(node.parentId) : null;
    if (!node || !parent) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    const sibling = createMindNodeElement(
      {
        x: Number(node.x || 0),
        y: Number(node.y || 0) + Number(node.height || 96) + 24,
      },
      String(options.title || "")
    );
    appendMindChild(parent, sibling, { branchSide: node.branchSide });
    relayoutMindMapFromNode(parent);
    state.board.selectedIds = [sibling.id];
    commitHistory(before, "创建思维同级节点");
    refs.canvas?.focus?.();
    beginMindNodeEdit(sibling.id);
    return true;
  }

  function createMindSummaryNode(nodeId, options = {}) {
    const node = getMindNodeById(nodeId);
    const parent = node?.parentId ? getMindNodeById(node.parentId) : null;
    if (!node || !parent) {
      return false;
    }
    const siblingIds = Array.isArray(parent.childrenIds) ? parent.childrenIds.slice() : [];
    const nodeIndex = siblingIds.indexOf(node.id);
    if (nodeIndex < 0) {
      return false;
    }
    const summaryTargetIds =
      Array.isArray(options.siblingIds) && options.siblingIds.length
        ? siblingIds.filter((id) => options.siblingIds.includes(id))
        : siblingIds.slice(nodeIndex);
    if (summaryTargetIds.length < 2) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    const summary = createMindSummaryElement(node, {
      label: String(options.title || ""),
      siblingIds: summaryTargetIds,
      summaryOwnerId: parent.id,
      branchSide: node.branchSide,
      rootId: node.rootId,
      depth: node.depth,
      order: node.order,
    });
    state.board.items.push(summary);
    relayoutMindMapFromNode(parent);
    state.board.selectedIds = [summary.id];
    commitHistory(before, "创建思维摘要节点");
    refs.canvas?.focus?.();
    beginMindNodeEdit(summary.id);
    return true;
  }

  function promoteMindNode(nodeId) {
    const node = getMindNodeById(nodeId);
    const parent = node?.parentId ? getMindNodeById(node.parentId) : null;
    const grandParent = parent?.parentId ? getMindNodeById(parent.parentId) : null;
    if (!node || !parent || !grandParent) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    parent.childrenIds = (Array.isArray(parent.childrenIds) ? parent.childrenIds : []).filter((childId) => childId !== node.id);
    const grandChildren = Array.isArray(grandParent.childrenIds) ? grandParent.childrenIds.slice() : [];
    const parentIndex = grandChildren.indexOf(parent.id);
    const insertIndex = parentIndex >= 0 ? parentIndex + 1 : grandChildren.length;
    grandChildren.splice(insertIndex, 0, node.id);
    grandParent.childrenIds = grandChildren;
    node.parentId = grandParent.id;
    node.rootId = String(grandParent.rootId || grandParent.id || "");
    node.branchSide = parent.branchSide;
    relayoutMindMapFromNode(node);
    state.board.selectedIds = [node.id];
    commitHistory(before, "提升思维节点层级");
    setStatus("已提升分支层级");
    refs.canvas?.focus?.();
    return true;
  }

  function setMindBranchSide(nodeId, side) {
    const node = getMindNodeById(nodeId);
    if (!node) {
      return false;
    }
    const nextSide = normalizeMindBranchSide(side, MIND_BRANCH_AUTO);
    const before = takeHistorySnapshot(state);
    node.branchSide = nextSide;
    relayoutMindMapFromNode(node);
    state.board.selectedIds = [node.id];
    commitHistory(before, "调整分支方向");
    setStatus(nextSide === MIND_BRANCH_LEFT ? "已切换到左侧分支" : nextSide === MIND_BRANCH_RIGHT ? "已切换到右侧分支" : "已恢复自动分支");
    refs.canvas?.focus?.();
    return true;
  }

  function relayoutMindMapByNodeId(nodeId) {
    const node = getMindNodeById(nodeId);
    if (!node) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    relayoutMindMapFromNode(node);
    state.board.selectedIds = [node.id];
    commitHistory(before, "整理思维导图");
    setStatus("已整理思维导图");
    refs.canvas?.focus?.();
    return true;
  }

  function toggleMindNodeCollapsed(nodeId) {
    const node = getMindNodeById(nodeId);
    if (!node) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    node.collapsed = !node.collapsed;
    relayoutMindMapFromNode(node);
    commitHistory(before, node.collapsed ? "折叠思维节点" : "展开思维节点");
    setStatus(node.collapsed ? "已折叠分支" : "已展开分支");
    refs.canvas?.focus?.();
    return true;
  }

  function demoteMindNode(nodeId) {
    const node = getMindNodeById(nodeId);
    const parent = node?.parentId ? getMindNodeById(node.parentId) : null;
    if (!node || !parent) {
      return false;
    }
    const siblings = Array.isArray(parent.childrenIds) ? parent.childrenIds.slice() : [];
    const nodeIndex = siblings.indexOf(node.id);
    if (nodeIndex <= 0) {
      return false;
    }
    const previousSiblingId = siblings[nodeIndex - 1];
    const previousSibling = getMindNodeById(previousSiblingId);
    if (!previousSibling) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    siblings.splice(nodeIndex, 1);
    parent.childrenIds = siblings;
    previousSibling.childrenIds = [...(Array.isArray(previousSibling.childrenIds) ? previousSibling.childrenIds : []), node.id];
    previousSibling.collapsed = false;
    node.parentId = previousSibling.id;
    node.rootId = String(previousSibling.rootId || previousSibling.id || "");
    node.depth = Math.max(0, Number(previousSibling.depth || 0) + 1);
    node.order = Math.max(0, previousSibling.childrenIds.length - 1);
    node.branchSide = !previousSibling.parentId
      ? normalizeMindBranchSide(node.branchSide, MIND_BRANCH_RIGHT)
      : normalizeMindBranchSide(previousSibling.branchSide, MIND_BRANCH_RIGHT);
    relayoutMindMapFromNode(parent);
    relayoutMindMapFromNode(previousSibling);
    state.board.selectedIds = [node.id];
    commitHistory(before, "降级思维节点层级");
    setStatus("已降级到上一个同级节点下");
    refs.canvas?.focus?.();
    return true;
  }

  function detachMindBranch(nodeId) {
    const node = getMindNodeById(nodeId);
    const parent = node?.parentId ? getMindNodeById(node.parentId) : null;
    if (!node || !parent) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    const subtreeNodeIds = getMindSubtreeNodeIds(node.id);
    const previousDepth = Math.max(0, Number(node.depth || 0) || 0);
    parent.childrenIds = (Array.isArray(parent.childrenIds) ? parent.childrenIds : []).filter((childId) => childId !== node.id);
    node.parentId = "";
    node.rootId = node.id;
    node.depth = 0;
    node.order = 0;
    node.branchSide = MIND_BRANCH_RIGHT;
    if (subtreeNodeIds.length >= 2) {
      const nextRootId = String(node.id || "");
      state.board.items = state.board.items.map((item) => {
        const itemId = String(item?.id || "").trim();
        if (!subtreeNodeIds.includes(itemId) || itemId === node.id || !isMindMapNode(item)) {
          return item;
        }
        return {
          ...item,
          rootId: nextRootId,
          depth: Math.max(0, Number(item.depth || 0) - previousDepth),
        };
      });
    }
    relayoutMindMapFromNode(parent);
    relayoutMindMapFromNode(node);
    state.board.selectedIds = [node.id];
    commitHistory(before, "拆分思维分支");
    setStatus("已拆分为独立分支");
    refs.canvas?.focus?.();
    return true;
  }

  function insertMindIntermediateNode(nodeId, options = {}) {
    const node = getMindNodeById(nodeId);
    const parent = node?.parentId ? getMindNodeById(node.parentId) : null;
    if (!node || !parent) {
      return false;
    }
    const before = takeHistorySnapshot(state);
    const bridge = createMindNodeElement(
      {
        x: Number(node.x || 0) - 64,
        y: Number(node.y || 0),
      },
      String(options.title || "中间节点")
    );
    bridge.parentId = parent.id;
    bridge.rootId = String(parent.rootId || parent.id || "");
    bridge.depth = Math.max(0, Number(parent.depth || 0) + 1);
    bridge.branchSide = normalizeMindBranchSide(node.branchSide, MIND_BRANCH_RIGHT);
    bridge.childrenIds = [node.id];
    bridge.collapsed = false;
    const siblings = Array.isArray(parent.childrenIds) ? parent.childrenIds.slice() : [];
    const nodeIndex = siblings.indexOf(node.id);
    if (nodeIndex < 0) {
      return false;
    }
    siblings.splice(nodeIndex, 1, bridge.id);
    parent.childrenIds = siblings;
    bridge.order = nodeIndex;
    node.parentId = bridge.id;
    node.rootId = String(bridge.rootId || bridge.id || "");
    node.depth = Math.max(0, Number(bridge.depth || 0) + 1);
    node.order = 0;
    state.board.items.push(bridge);
    relayoutMindMapFromNode(parent);
    state.board.selectedIds = [bridge.id];
    commitHistory(before, "插入思维中间节点");
    refs.canvas?.focus?.();
    beginMindNodeEdit(bridge.id);
    return true;
  }

  function isMindNodeDescendantOf(nodeId = "", ancestorId = "") {
    const safeNodeId = String(nodeId || "").trim();
    const safeAncestorId = String(ancestorId || "").trim();
    if (!safeNodeId || !safeAncestorId || safeNodeId === safeAncestorId) {
      return false;
    }
    let current = getMindNodeById(safeNodeId);
    while (current?.parentId) {
      const parentId = String(current.parentId || "").trim();
      if (!parentId) {
        return false;
      }
      if (parentId === safeAncestorId) {
        return true;
      }
      current = getMindNodeById(parentId);
    }
    return false;
  }

  function reparentMindNode(nodeId, nextParentId) {
    const node = getMindNodeById(nodeId);
    const nextParent = getMindNodeById(nextParentId);
    const prevParent = node?.parentId ? getMindNodeById(node.parentId) : null;
    if (!node || !nextParent) {
      return false;
    }
    if (node.id === nextParent.id) {
      return false;
    }
    if (String(node.parentId || "").trim() === String(nextParent.id || "").trim()) {
      return false;
    }
    if (isMindNodeDescendantOf(nextParent.id, node.id)) {
      return false;
    }
    if (prevParent) {
      prevParent.childrenIds = (Array.isArray(prevParent.childrenIds) ? prevParent.childrenIds : []).filter((childId) => childId !== node.id);
    }
    const subtreeNodeIds = getMindSubtreeNodeIds(node.id);
    const previousDepth = Math.max(0, Number(node.depth || 0) || 0);
    node.parentId = nextParent.id;
    node.rootId = String(nextParent.rootId || nextParent.id || "");
    node.depth = Math.max(0, Number(nextParent.depth || 0) + 1);
    node.order = Array.isArray(nextParent.childrenIds) ? nextParent.childrenIds.length : 0;
    node.branchSide = !nextParent.parentId
      ? normalizeMindBranchSide(node.branchSide, MIND_BRANCH_RIGHT)
      : normalizeMindBranchSide(nextParent.branchSide, MIND_BRANCH_RIGHT);
    nextParent.childrenIds = [...(Array.isArray(nextParent.childrenIds) ? nextParent.childrenIds : []), node.id];
    if (subtreeNodeIds.length >= 2) {
      const depthDelta = Math.max(0, Number(node.depth || 0) || 0) - previousDepth;
      const nextRootId = String(node.rootId || nextParent.rootId || nextParent.id || "");
      state.board.items = state.board.items.map((item) => {
        const itemId = String(item?.id || "").trim();
        if (!subtreeNodeIds.includes(itemId) || itemId === node.id || !isMindMapNode(item)) {
          return item;
        }
        return {
          ...item,
          rootId: nextRootId,
          depth: Math.max(0, Number(item.depth || 0) + depthDelta),
        };
      });
    }
    if (prevParent) {
      relayoutMindMapFromNode(prevParent);
    }
    relayoutMindMapFromNode(nextParent);
    state.board.selectedIds = [node.id];
    return true;
  }

  function resolveMindMapDropTargetForPointer(nodeId, scenePoint) {
    const movingNode = getMindNodeById(nodeId);
    if (!movingNode || !scenePoint) {
      return null;
    }
    const candidates = state.board.items.filter((item) => item?.type === "mindNode" && item.id !== movingNode.id);
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      if (!candidate || isMindNodeDescendantOf(candidate.id, movingNode.id)) {
        continue;
      }
      if (String(movingNode.parentId || "").trim() === String(candidate.id || "").trim()) {
        continue;
      }
      const bounds = getElementBounds(candidate);
      if (
        scenePoint.x >= bounds.left - MIND_MAP_REPARENT_HIT_PAD &&
        scenePoint.x <= bounds.right + MIND_MAP_REPARENT_HIT_PAD &&
        scenePoint.y >= bounds.top - MIND_MAP_REPARENT_HIT_PAD &&
        scenePoint.y <= bounds.bottom + MIND_MAP_REPARENT_HIT_PAD
      ) {
        return candidate;
      }
    }
    return null;
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

  function addTable(options = {}) {
    const columns = Math.max(1, Math.min(12, Math.floor(Number(options?.columns) || 3)));
    const rows = Math.max(1, Math.min(24, Math.floor(Number(options?.rows) || 3)));
    const item = createEditableTableElement(getCenterScenePoint(), { columns, rows });
    const inserted = pushItems([item], { reason: "创建表格", statusText: "已添加表格" });
    if (inserted) {
      beginTableEdit(item.id, { rowIndex: 0, columnIndex: 0 });
    }
    return inserted;
  }

  function addCodeBlock(options = {}) {
    const language = String(options?.language || "javascript").trim();
    const code = String(options?.code ?? "// 在这里编写代码").trimEnd();
    const item = createCodeBlockElement(getCenterScenePoint(), code, language, {
      previewMode: "source",
      width: 520,
    });
    const inserted = pushItems([item], { reason: "创建代码块", statusText: "已添加代码块" });
    if (inserted) {
      beginCodeBlockEdit(item.id);
    }
    return inserted;
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
    const selectedItems = sceneRegistry.getSelectedItems();
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
    let feedbackChanged = false;
    let nextHoverHandle = null;
    let nextHoverConnector = null;
    let hit = null;
    if (isInteractiveMode()) {
      const multiSelectedItems = state.tool === "select" && state.board.selectedIds.length >= 2 ? getSelectedItemsFast() : [];
      const multiSelectedBounds = multiSelectedItems.length >= 2 ? getSelectedItemsBounds() : null;
      if (multiSelectedBounds) {
        nextHoverHandle = hitTestMultiSelectionHandle(multiSelectedBounds, scenePoint, state.board.view.scale);
      }
      const selectedItem = state.tool === "select" ? sceneRegistry.getSingleSelectedItem() : null;
      if (!nextHoverHandle && selectedItem && selectedItem.type === "image" && hitTestImageRotateHandle(selectedItem, scenePoint, state.board.view)) {
        nextHoverHandle = "rotate-image";
      } else if (!nextHoverHandle && selectedItem && selectedItem.type === "shape" && hitTestShapeRotateHandle(selectedItem, scenePoint, state.board.view)) {
        nextHoverHandle = "rotate-shape";
      } else if (!nextHoverHandle && selectedItem && selectedItem.type === "flowNode") {
        const side = flowModule.getConnectorHit(selectedItem, scenePoint, state.board.view);
        if (side) {
          nextHoverHandle = "flow-connector";
          nextHoverConnector = { id: selectedItem.id, side };
        } else {
          nextHoverHandle = hitTestHandle(selectedItem, scenePoint, state.board.view.scale);
        }
      } else if (!nextHoverHandle) {
        nextHoverHandle = selectedItem ? hitTestHandle(selectedItem, scenePoint, state.board.view.scale) : null;
      }
      hit = hitTestCanvasElement(scenePoint, state.board.view.scale);
      if (isMindRelationshipItem(hit)) {
        const relationHandle = hitTestHandle(hit, scenePoint, state.board.view.scale);
        if (relationHandle) {
          nextHoverHandle = relationHandle;
        }
      }
      const hoveredRelationshipDeleteId = getMindRelationshipDeleteHitId(scenePoint);
      if (hoveredRelationshipDeleteId) {
        hit = getMindRelationshipById(hoveredRelationshipDeleteId) || hit;
        nextHoverHandle = "mind-relationship-delete";
      }
      if (hit?.type === "flowNode" && !nextHoverConnector) {
        const side = flowModule.getConnectorHit(hit, scenePoint, state.board.view);
        if (side) {
          nextHoverHandle = "flow-connector";
          nextHoverConnector = { id: hit.id, side };
        }
      }
      if (state.pointer?.type !== "move-selection") {
        feedbackChanged = clearMindMapDropFeedback();
      }
    }
    const nextHoverId = hit?.id || null;
    if (
      feedbackChanged ||
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
    if (matchesBlockedCanvasPointerDown(event)) {
      event.preventDefault();
      clearBlockedCanvasPointerDown();
      return;
    }
    if (event.button === 0) {
      suppressNativeDrag = true;
    }
    refs.canvas?.focus();
    if (globalThis.__FREEFLOW_KEYBOARD_FOCUS_OWNER !== "canvas") {
      globalThis.__FREEFLOW_KEYBOARD_FOCUS_OWNER = "canvas";
    }
    const scenePoint = toScenePoint(event.clientX, event.clientY);
    updateLastPointerPoint(scenePoint);
    clearAlignmentSnap("pointer-down");

    if (pendingMindRelationshipSourceId && event.button === 0) {
      const target = hitTestCanvasElement(scenePoint, state.board.view.scale);
      if (isMindRelationshipTargetEligible(target)) {
        event.preventDefault();
        const created = createMindRelationship(pendingMindRelationshipSourceId, target.id);
        clearMindRelationshipDraft();
        if (!created) {
          syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
        }
        return;
      }
      clearMindRelationshipDraft();
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
      return;
    }

    if (resolvePendingCanvasLinkBindingMode() && event.button === 0) {
      const target = hitTestCanvasElement(scenePoint, state.board.view.scale);
      if (target && target.id) {
        event.preventDefault();
        const bindingMode = resolvePendingCanvasLinkBindingMode();
        const bindingContext = pendingCanvasLinkBinding;
        pendingCanvasLinkBinding = false;
        syncCanvasLinkBindingUi();
        if (bindingMode === "mind-node") {
          addMindNodeCanvasLink(String(bindingContext?.sourceId || ""), target.id);
          syncMindNodeLinkPanel();
        } else {
          bindCanvasLinkToSelection(target.id);
          richTextSession.focus();
        }
        return;
      }
    }

    if (captureMode === "canvas" && event.button === 0) {
      event.preventDefault();
      state.captureModeActive = true;
      state.captureModeDragging = false;
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
      const memoItem = sceneRegistry.getItemById(state.editingId, "fileCard");
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
      const memoItem = sceneRegistry.getItemById(state.editingId, "image");
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
      const flowTarget = hitTestCanvasElement(scenePoint, state.board.view.scale);
      const relationshipDeleteId = getMindRelationshipDeleteHitId(scenePoint);
      if (relationshipDeleteId) {
        event.preventDefault();
        removeMindRelationship(relationshipDeleteId);
        return;
      }
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
    const multiSelectedItems =
      state.tool === "select" && state.board.selectedIds.length >= 2 ? getSelectedItemsFast() : [];
    const multiSelectedBounds = multiSelectedItems.length >= 2 ? getSelectedItemsBounds() : null;
    const multiSelectionHandle =
      event.button === 0 && !additive && multiSelectedBounds
        ? hitTestMultiSelectionHandle(multiSelectedBounds, scenePoint, state.board.view.scale)
        : null;
    if (multiSelectionHandle) {
      const baseSelection = createMultiSelectionPointerBase(multiSelectedItems);
      state.pointer = {
        type: "resize-multi-selection",
        pointerId: event.pointerId,
        handle: multiSelectionHandle,
        before: takeHistorySnapshot(state),
        baseSelection,
        preserveAspect: Boolean(event.shiftKey),
        scaleFromCenter: Boolean(event.altKey),
      };
      refs.canvas?.setPointerCapture?.(event.pointerId);
      state.hoverHandle = multiSelectionHandle;
      syncCanvasCursor();
      return;
    }

    const singleSelectedItem = state.tool === "select" ? sceneRegistry.getSingleSelectedItem() : null;
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
      if (activeHandle === "mind-link-anchor" && singleSelectedItem?.type === "mindNode") {
        mindNodeLinkPanelPinnedNodeId = singleSelectedItem.id;
        activeMindNodeLinkMenuTargetId = "";
        syncMindNodeLinkPanel();
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
        return;
      }
      const selectedIds = state.board.selectedIds.slice();
      const selectedItems = sceneRegistry.getItemsByIds(selectedIds);
      const allText = selectedItems.length && selectedItems.every((item) => item.type === "text");
      const rightButtonPressed = event.button === 2 && (event.buttons & 2) === 2;
      if (rightButtonPressed && allText) {
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
        return;
      }

      const baseItems = new Map(selectedItems.map((item) => [item.id, clonePointerBase(item)]));
      state.pointer = {
        type: event.button === 0 && event.altKey && selectedItems.length >= 2 ? "duplicate-multi-selection" : "move-selection",
        pointerId: event.pointerId,
        startScene: scenePoint,
        before: takeHistorySnapshot(state),
        baseSelectedIds: selectedIds.slice(),
        baseItems,
        mindSubtreeRootId: target?.type === "mindNode" ? String(target.id || "").trim() : "",
      };
      refs.canvas?.setPointerCapture?.(event.pointerId);
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
  }

  function onPointerMove(event) {
    const scenePoint = toScenePoint(event.clientX, event.clientY);
    updateLastPointerPoint(scenePoint);
    if (!isInteractiveMode()) {
      return;
    }

    if (pendingMindRelationshipSourceId) {
      const draftChanged = updateMindRelationshipDraft(scenePoint);
      if (draftChanged && !state.pointer) {
        scheduleRender({ reason: "mind-relationship-draft-move", sceneDirty: false, interactionDirty: true });
      }
    }

    const pointer = state.pointer;
    if (pointer?.type === "capture") {
      pointer.currentScenePoint = scenePoint;
      state.captureModeDragging = hasDragExceededThreshold(pointer.startScenePoint, scenePoint, 6);
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
      scheduleRender({ reason: "pointer-pan-move", viewDirty: true, interactionDirty: false });
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
      scheduleRender({ reason: "pointer-pan-start", viewDirty: true, interactionDirty: false });
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
      const movedMindNode = pointer.mindSubtreeRootId ? getMindNodeById(pointer.mindSubtreeRootId) : null;
      const dropTarget = movedMindNode ? resolveMindMapDropTargetForPointer(movedMindNode.id, scenePoint) : null;
      setMindMapDropFeedback(dropTarget?.id || "", dropTarget ? "将成为子节点" : "");
      const movedCodeBlockIds = Array.from(movedIds).filter((itemId) => {
        const movedItem = nextItems.find((item) => item.id === itemId);
        return movedItem?.type === "codeBlock";
      });
      if (movedCodeBlockIds.length) {
        markCodeBlockOverlayDirty(movedCodeBlockIds);
        markSceneGraphDirty({ hitTest: false });
        scheduleRender({
          reason: "move-selection-code-block",
          sceneDirty: true,
          interactionDirty: true,
          itemIds: movedCodeBlockIds,
        });
      } else {
        scheduleRender();
      }
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

    if (pointer.type === "resize-multi-selection") {
      const resizedBounds = computeMultiSelectionResizedBounds(pointer.baseSelection?.bounds, pointer.handle, scenePoint, {
        preserveAspect: Boolean(event.shiftKey),
        scaleFromCenter: Boolean(event.altKey),
      });
      const constrainedBounds = constrainMultiSelectionBoundsToWidthOnly(
        pointer.baseSelection?.bounds,
        resizedBounds,
        pointer.handle
      );
      const selectionIds = pointer.baseSelection?.items instanceof Map ? Array.from(pointer.baseSelection.items.keys()) : [];
      const nextBounds = applyHorizontalResizeSnap({
        activeItem: {
          id: `selection:${selectionIds.join(",")}`,
          type: "selection-group",
          x: constrainedBounds.left,
          y: constrainedBounds.top,
          width: constrainedBounds.width,
          height: constrainedBounds.height,
        },
        rawBounds: constrainedBounds,
        handle: pointer.handle,
        excludeIds: selectionIds,
        reason: "resize-selection-group",
      });
      applyMultiSelectionResize(pointer.baseSelection, nextBounds);
      state.hoverHandle = pointer.handle;
      scheduleRender();
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
        const resizedItem = resizeElement(pointer.baseItem, pointer.handle, scenePoint);
        const snappedBounds = applyHorizontalResizeSnap({
          activeItem: resizedItem,
          rawBounds: getElementBounds(resizedItem),
          handle: pointer.handle,
          excludeIds: [pointer.itemId],
          reason: "resize-selection",
        });
        const snappedPoint = {
          x: pointer.handle === "nw" || pointer.handle === "sw" ? snappedBounds.left : snappedBounds.right,
          y: pointer.handle === "nw" || pointer.handle === "ne" ? snappedBounds.top : snappedBounds.bottom,
        };
        return resizeElement(pointer.baseItem, pointer.handle, snappedPoint);
      });
      state.hoverHandle = pointer.handle;
      scheduleRender();
      return;
    }

    if (pointer.type === "rotate-shape") {
      const item = sceneRegistry.getItemById(pointer.itemId, "shape");
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
      syncBoard({ persist: true, emit: true, sceneChange: false, viewChange: true, fullOverlayRescan: false, reason: "pointer-pan-commit" });
      return;
    }

    if (pointer.type === "blank-pan-intent") {
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
      return;
    }

    if (pointer.type === "image-crop") {
      lightImageEditor.handlePointerUp(pointer);
      return;
    }

    if (pointer.type === "flow-connect") {
      const target = hitTestCanvasElement(state.lastPointerScenePoint || scenePoint, state.board.view.scale);
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
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
      }
      flowDraft = null;
      return;
    }

    if (pointer.type === "mind-relationship-connect") {
      clearMindRelationshipDraft();
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
      return;
    }

    if (pointer.type === "rotate-image") {
      commitItemPatchHistory(pointer.before, pointer.itemId, getImageItemById(pointer.itemId), "旋转图片", "image-rotate");
      return;
    }

    if (pointer.type === "rotate-shape") {
      const rotated = getItemByIdFast(pointer.itemId) || null;
      commitItemPatchHistory(pointer.before, pointer.itemId, rotated, "旋转图形", "shape-rotate");
      return;
    }

    if (pointer.type === "round-rect") {
      const rounded = getItemByIdFast(pointer.itemId) || null;
      commitItemPatchHistory(pointer.before, pointer.itemId, rounded, "调整圆角", "shape-radius");
      return;
    }

    if (pointer.type === "move-selection") {
      const moved = hasDragExceededThreshold(pointer.startScene, state.lastPointerScenePoint, 3 / Math.max(0.1, state.board.view.scale));
      const pendingDropTargetId = String(state.mindMapDropTargetId || "").trim();
      clearMindMapDropFeedback();
      if (moved) {
        const movedIds = Array.from(pointer.baseItems.keys());
        const movedMindNode = pointer.mindSubtreeRootId ? getMindNodeById(pointer.mindSubtreeRootId) : null;
        const dropTarget = pendingDropTargetId
          ? getMindNodeById(pendingDropTargetId)
          : hitTestCanvasElement(state.lastPointerScenePoint || scenePoint, state.board.view.scale);
        const nextParent =
          movedMindNode &&
          dropTarget?.type === "mindNode" &&
          String(dropTarget.id || "").trim() !== String(movedMindNode.id || "").trim()
            ? dropTarget
            : null;
      if (movedMindNode && nextParent && reparentMindNode(movedMindNode.id, nextParent.id)) {
          commitItemsPatchHistory(pointer.before, movedIds, "调整思维导图层级", "mind-node-reparent");
        } else {
          commitItemsPatchHistory(pointer.before, movedIds, "移动元素", "item-transform-batch");
        }
        markSceneGraphDirty({ hitTest: true });
        scheduleRender({
          reason: "move-selection-commit",
          sceneDirty: true,
          interactionDirty: true,
          overlayDirty: true,
          fullOverlayRescan: true,
        });
      } else {
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
      }
      return;
    }

    if (pointer.type === "duplicate-multi-selection") {
      const moved = hasDragExceededThreshold(pointer.startScene, state.lastPointerScenePoint, 3 / Math.max(0.1, state.board.view.scale));
      if (moved) {
        const deltaX = Number(state.lastPointerScenePoint.x || 0) - Number(pointer.startScene?.x || 0);
        const deltaY = Number(state.lastPointerScenePoint.y || 0) - Number(pointer.startScene?.y || 0);
        const pasted = duplicateElementsWithDelta(Array.from(pointer.baseItems.values()), deltaX, deltaY);
        state.board.items.push(...pasted);
        state.board.selectedIds = pasted.map((item) => item.id);
        commitItemsPatchHistory(pointer.before, pasted.map((item) => item.id), "复制元素", "item-insert-batch", {
          beforeOrderIds: Array.isArray(pointer.before?.items) ? pointer.before.items.map((item) => item.id) : [],
          afterOrderIds: state.board.items.map((item) => item.id),
        });
      } else {
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
      }
      return;
    }

    if (pointer.type === "native-export-drag") {
      suppressNativeDrag = false;
      hideDragIndicator();
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
        commitItemsPatchHistory(pointer.before, pasted.map((item) => item.id), "复制元素", "item-insert-batch", {
          beforeOrderIds: Array.isArray(pointer.before?.items) ? pointer.before.items.map((item) => item.id) : [],
          afterOrderIds: state.board.items.map((item) => item.id),
        });
      } else {
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
      }
      suppressNativeDrag = false;
      return;
    }

    if (pointer.type === "resize-selection") {
      const resized = getItemByIdFast(pointer.itemId);
      if (resized) {
        commitItemPatchHistory(pointer.before, pointer.itemId, resized, "调整元素尺寸", "item-resize");
      } else {
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
      }
      return;
    }

    if (pointer.type === "resize-multi-selection") {
      const resizedIds = Array.from(pointer.baseSelection?.items?.keys?.() || []);
      if (resizedIds.length) {
        commitItemsPatchHistory(pointer.before, resizedIds, "调整多选尺寸", "item-transform-batch");
      } else {
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
      syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
        syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
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
    const sceneEventContext = nonEditingSceneEventBridge.resolveEventContext(event);
    const scenePoint = sceneEventContext?.scenePoint || toScenePoint(event.clientX, event.clientY);
    const target = sceneEventContext?.target || null;
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
    if (target?.type === "mindNode" || target?.type === "mindSummary") {
      beginMindNodeEdit(target.id);
      return;
    }
    if (target?.type === "table") {
      beginTableEdit(target.id, getTableCellSelectionFromScenePoint(target, scenePoint));
      return;
    }
    if (target?.type === "codeBlock") {
      beginCodeBlockEdit(target.id);
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
      syncBoard({ persist: true, emit: true, sceneChange: false, viewChange: true, fullOverlayRescan: false, reason: "wheel-zoom" });
      return;
    }
    state.board.view = panView(state.board.view, -event.deltaX, -event.deltaY);
    syncBoard({ persist: true, emit: true, sceneChange: false, viewChange: true, fullOverlayRescan: false, reason: "wheel-pan" });
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

  const CONTEXT_SUBMENU_CLOSE_DELAY_MS = 180;
  let contextSubmenuCloseTimer = 0;

  function cancelContextSubmenuClose() {
    if (contextSubmenuCloseTimer) {
      window.clearTimeout(contextSubmenuCloseTimer);
      contextSubmenuCloseTimer = 0;
    }
  }

  function scheduleContextSubmenuClose() {
    cancelContextSubmenuClose();
    contextSubmenuCloseTimer = window.setTimeout(() => {
      contextSubmenuCloseTimer = 0;
      closeContextSubmenus();
    }, CONTEXT_SUBMENU_CLOSE_DELAY_MS);
  }

  function hideContextMenu() {
    if (refs.contextMenu) {
      cancelContextSubmenuClose();
      closeContextSubmenus();
      refs.contextMenu.classList.add("is-hidden");
      refs.contextMenu.classList.remove("is-webgl-menu");
      refs.contextMenu.style.left = "-9999px";
      refs.contextMenu.style.top = "-9999px";
    }
    lastContextMenuSource = "canvas";
  }

  function getContextSubmenuElements() {
    if (!(refs.contextMenu instanceof HTMLElement)) {
      return [];
    }
    return Array.from(refs.contextMenu.querySelectorAll(".canvas2d-context-submenu"));
  }

  function closeContextSubmenus({ exceptSubmenu = null } = {}) {
    cancelContextSubmenuClose();
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
    cancelContextSubmenuClose();
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
    lastContextMenuSource = "canvas";
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
    const sceneEventContext = nonEditingSceneEventBridge.resolveEventContext(event);
    const scenePoint = sceneEventContext?.scenePoint || toScenePoint(event.clientX, event.clientY);
    const hitTarget = sceneEventContext?.target || null;
    const selectedIdsBeforeContext = state.board.selectedIds.map((id) => String(id || "").trim()).filter(Boolean);
    const hitTargetId = String(hitTarget?.id || "").trim();
    const hitSelectedTarget = Boolean(hitTargetId && selectedIdsBeforeContext.includes(hitTargetId));
    const selectedBounds = selectedIdsBeforeContext.length >= 2 ? getSelectedItemsBounds() : null;
    const blankInsideMultiSelection =
      !hitTarget &&
      selectedIdsBeforeContext.length >= 2 &&
      isScenePointInsideBounds(scenePoint, selectedBounds, 8 / Math.max(0.1, Number(state.board.view.scale || 1)));
    const contextTargetElement = event.target instanceof Element ? event.target : null;
    const isOverlayContextMenu =
      Boolean(contextTargetElement) &&
      (
        refs.richDisplayHost?.contains(contextTargetElement) ||
        refs.codeBlockDisplayHost?.contains(contextTargetElement)
      );
    const overlayContextTargetId =
      !hitTarget &&
      isOverlayContextMenu &&
      selectedIdsBeforeContext.length === 1
        ? selectedIdsBeforeContext[0]
        : "";
    lastContextMenuTargetId = hitTarget?.id || overlayContextTargetId || null;
    if (!hitTarget && state.board.selectedIds.length && !blankInsideMultiSelection && !overlayContextTargetId) {
      state.board.selectedIds = [];
      state.lastSelectionSource = null;
    }
    const selectionCount = state.board.selectedIds.length;
    const multiSelectActive =
      selectionCount >= 2 &&
      (!hitTarget || hitSelectedTarget || blankInsideMultiSelection);

    if (multiSelectActive) {
      state.lastSelectionSource = state.lastSelectionSource || "marquee";
      const selectedItems = getSelectedItemsFast();
      const hasGrouped = selectedItems.some((item) => item.groupId);
      const groupLabel = hasGrouped ? "取消组合" : "组合";
      const canMergeTexts = selectedItems.length >= 2 && selectedItems.every((item) => isMergeableRichTextItem(item));
      refs.contextMenu.innerHTML = `
        <button type="button" class="canvas2d-context-menu-item" data-action="copy-selected">复制</button>
        <div class="canvas2d-context-submenu">
          <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">复制所选</button>
          <div class="canvas2d-context-submenu-panel" role="menu" aria-label="复制所选">
            <button type="button" class="canvas2d-context-menu-item" data-action="copy-selected-html">富文本（Word 直通）</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="copy-selected-markdown">Markdown</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="copy-selected-plain">纯文本</button>
          </div>
        </div>
        <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
        <div class="canvas2d-context-submenu">
          <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">导出</button>
          <div class="canvas2d-context-submenu-panel" role="menu" aria-label="导出">
            <button type="button" class="canvas2d-context-menu-item" data-action="export-selection-word">导出为 Word</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="export-selection-image">导出为图片</button>
          </div>
        </div>
        <button type="button" class="canvas2d-context-menu-item" data-action="group-toggle">${groupLabel}</button>
        ${
          canMergeTexts
            ? `
        <div class="canvas2d-context-submenu">
          <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">文本结构</button>
          <div class="canvas2d-context-submenu-panel" role="menu" aria-label="文本结构">
            <button type="button" class="canvas2d-context-menu-item" data-action="merge-selected-text">合并文本</button>
          </div>
        </div>
        `
            : ""
        }
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
        if (hitTarget) {
          const currentSelectedId = selectionCount === 1 ? String(state.board.selectedIds[0] || "").trim() : "";
          if (currentSelectedId !== String(hitTarget.id || "").trim()) {
            state.board.selectedIds = [hitTarget.id];
            state.lastSelectionSource = "context-menu";
          }
        }
        const selectedItem = getSingleSelectedItemFast() || hitTarget;
        lastContextMenuTargetId = selectedItem?.id || lastContextMenuTargetId;
        const lockLabel = selectedItem?.locked ? "解锁" : "锁定";
        if (selectedItem?.type === "fileCard") {
          refs.contextMenu.innerHTML = buildFileCardContextMenuHtml(selectedItem);
        } else if (selectedItem?.type === "image") {
          refs.contextMenu.innerHTML = imageModule.buildContextMenuHtml(selectedItem);
        } else if (selectedItem?.type === "flowEdge") {
          refs.contextMenu.innerHTML = `
            <button type="button" class="canvas2d-context-menu-item" data-action="cut">剪切</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
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
            <button type="button" class="canvas2d-context-menu-item" data-action="cut">剪切</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="connect-node">连接节点</button>
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
            <button type="button" class="canvas2d-context-menu-item" data-action="cut">剪切</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="connect-node">连接节点</button>
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
            <button type="button" class="canvas2d-context-menu-item" data-action="cut">剪切</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="connect-node">连接节点</button>
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
            <button type="button" class="canvas2d-context-menu-item" data-action="cut">剪切</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="connect-node">连接节点</button>
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
            <button type="button" class="canvas2d-context-menu-item" data-action="cut">剪切</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="mind-add-child">添加子节点</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="mind-add-sibling">添加同级节点</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="mind-insert-intermediate">插入中间节点</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="mind-add-summary">添加摘要节点</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="mind-promote">提升层级</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="mind-demote">降级层级</button>
            <div class="canvas2d-context-submenu">
              <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">分支方向</button>
              <div class="canvas2d-context-submenu-panel" role="menu" aria-label="分支方向">
                <button type="button" class="canvas2d-context-menu-item" data-action="mind-branch-left">靠左</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="mind-branch-right">靠右</button>
                <button type="button" class="canvas2d-context-menu-item" data-action="mind-branch-auto">自动</button>
              </div>
            </div>
            <button type="button" class="canvas2d-context-menu-item" data-action="mind-relayout">整理布局</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="mind-toggle-collapse">${
              selectedItem?.collapsed ? "展开分支" : "折叠分支"
            }</button>
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
          const isEditingTable = state.editingType === "table" && state.editingId === selectedItem.id;
          if (isEditingTable) {
            syncTableSelectionMode(buildTableMatrixFromEditor());
          } else {
            setTableSelectionFromAnchorCell(getTableCellSelectionFromScenePoint(selectedItem, scenePoint));
          }
          refs.contextMenu.innerHTML =
            buildTableContextMenuHtml({ editing: isEditingTable, selectionMode: tableEditSelectionMode }) +
            buildLockDeleteTailHtml(lockLabel);
        } else if (selectedItem?.type === "codeBlock") {
          refs.contextMenu.innerHTML = buildCodeBlockContextMenuHtml() + buildLockDeleteTailHtml(lockLabel);
        } else if (selectedItem?.type === "mathBlock" || selectedItem?.type === "mathInline") {
          refs.contextMenu.innerHTML = buildMathContextMenuHtml() + buildLockDeleteTailHtml(lockLabel);
        } else if (selectedItem?.type === "text" || selectedItem?.type === "flowNode") {
          const isNode = selectedItem?.type === "flowNode";
          refs.contextMenu.innerHTML =
            buildRichTextItemContextMenuHtml({ isNode }) + buildLockDeleteTailHtml(lockLabel);
      } else if (selectedItem) {
        refs.contextMenu.innerHTML = `
          <button type="button" class="canvas2d-context-menu-item" data-action="cut">剪切</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
          <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
          ${isMindRelationshipSourceEligible(selectedItem) ? '<button type="button" class="canvas2d-context-menu-item" data-action="connect-node">连接节点</button>' : ""}
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
      } else {
        refs.contextMenu.innerHTML = `
            <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="add-text">添加文本</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="add-node">添加节点</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="add-image">添加图片</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="add-file">添加文件</button>
            <button type="button" class="canvas2d-context-menu-item" data-action="add-table">添加表格</button>
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

  function getContextMenuTargetItem(expectedTypes = []) {
    const typeList = Array.isArray(expectedTypes)
      ? expectedTypes.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
    const targetId = String(lastContextMenuTargetId || "").trim();
    if (targetId) {
      const item = sceneRegistry.getItemById(targetId);
      if (item && (!typeList.length || typeList.includes(String(item.type || "")))) {
        return item;
      }
    }
    const selected = getSingleSelectedItemFast();
    if (selected && (!typeList.length || typeList.includes(String(selected.type || "")))) {
      return selected;
    }
    return null;
  }

  function alignSelectionWithContextMenuTarget(expectedTypes = []) {
    const target = getContextMenuTargetItem(expectedTypes);
    if (!target) {
      return null;
    }
    const targetId = String(target.id || "").trim();
    const selectedIds = state.board.selectedIds.map((id) => String(id || "").trim()).filter(Boolean);
    if (targetId && selectedIds.includes(targetId)) {
      return target;
    }
    state.board.selectedIds = targetId ? [targetId] : [];
    state.lastSelectionSource = null;
    syncBoard({ persist: false, emit: true, sceneChange: false, fullOverlayRescan: false });
    return target;
  }

  function onContextMenuClick(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) {
      return;
    }
    const action = target.getAttribute("data-action");
    if (lastContextMenuSource === "rich-editor") {
      Promise.resolve(handleRichEditorContextMenuAction(action)).then((handled) => {
        if (handled) {
          hideContextMenu();
        }
      });
      return;
    }
    if (action === "webgl-copy" || action === "webgl-import") {
      hideContextMenu();
      return;
    }
    if (action === "add-text") {
      createEmptyText(getContextMenuScenePoint());
      hideContextMenu();
    }
    if (action === "add-node") {
      createMindNode(getContextMenuScenePoint());
      hideContextMenu();
    }
    if (action === "mind-add-child") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        createMindChildNode(targetItem.id);
      }
      hideContextMenu();
    }
    if (action === "mind-add-sibling") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        createMindSiblingNode(targetItem.id);
      }
      hideContextMenu();
    }
    if (action === "mind-quick-add-child") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        createMindChildNode(targetItem.id);
      }
      hideContextMenu();
    }
    if (action === "mind-manage-links") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        mindNodeLinkPanelPinnedNodeId = targetItem.id;
        syncMindNodeLinkPanel();
      }
      hideContextMenu();
    }
    if (action === "mind-detach-branch") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        detachMindBranch(targetItem.id);
      }
      hideContextMenu();
    }
    if (action === "mind-add-summary") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        createMindSummaryNode(targetItem.id);
      }
      hideContextMenu();
    }
    if (action === "mind-promote") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        promoteMindNode(targetItem.id);
      }
      hideContextMenu();
    }
    if (action === "mind-demote") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        demoteMindNode(targetItem.id);
      }
      hideContextMenu();
    }
    if (action === "mind-insert-intermediate") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        insertMindIntermediateNode(targetItem.id);
      }
      hideContextMenu();
    }
    if (action === "mind-branch-left") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        setMindBranchSide(targetItem.id, MIND_BRANCH_LEFT);
      }
      hideContextMenu();
    }
    if (action === "mind-branch-right") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        setMindBranchSide(targetItem.id, MIND_BRANCH_RIGHT);
      }
      hideContextMenu();
    }
    if (action === "mind-branch-auto") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        setMindBranchSide(targetItem.id, MIND_BRANCH_AUTO);
      }
      hideContextMenu();
    }
    if (action === "mind-relayout") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        relayoutMindMapByNodeId(targetItem.id);
      }
      hideContextMenu();
    }
    if (action === "mind-toggle-collapse") {
      const targetItem = getMindNodeActionTargetItem() || getContextMenuTargetItem(["mindNode"]);
      if (targetItem) {
        toggleMindNodeCollapsed(targetItem.id);
      }
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
    if (action === "copy-selected-html") {
      void copySelectedItemsContent("html");
      hideContextMenu();
    }
    if (action === "copy-selected-markdown") {
      void copySelectedItemsContent("markdown");
      hideContextMenu();
    }
    if (action === "copy-selected-plain") {
      void copySelectedItemsContent("plain");
      hideContextMenu();
    }
    if (action === "delete-selected") {
      removeSelected();
      hideContextMenu();
    }
    if (action === "toggle-lock") {
      alignSelectionWithContextMenuTarget();
      toggleLockOnSelection();
      hideContextMenu();
    }
    if (action === "group-toggle") {
      const selectedItems = getSelectedItemsFast();
      const hasGrouped = selectedItems.some((item) => item.groupId);
      if (hasGrouped) {
        ungroupSelection();
      } else {
        groupSelection();
      }
      hideContextMenu();
    }
    if (action === "merge-selected-text") {
      mergeSelectedRichTextItems();
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
      const selectedItems = getSelectedItemsFast();
      void exportItemsAsImage(selectedItems, {
        forceWhiteBackground: true,
        defaultName: "freeflow-selection",
        anchorPoint: getExportAnchor(selectedItems),
      });
      hideContextMenu();
    }
    if (action === "export-selection-word") {
      const selectedItems = getSelectedItemsFast();
      void exportSelectionAsWord(selectedItems);
      hideContextMenu();
    }
    const copyExportAction = resolveCopyExportAction(action);
    if (copyExportAction) {
      const selectedItem = getContextMenuTargetItem(copyExportAction.targetTypes);
      if (copyExportAction.operation === "copy") {
        if (copyExportAction.type === "text") {
          void copyRichTextContent(selectedItem, copyExportAction.format);
        } else if (copyExportAction.type === "table") {
          void copyTableTextContent(selectedItem, copyExportAction.format);
        } else if (copyExportAction.type === "codeBlock") {
          void copyCodeBlockTextContent(selectedItem, copyExportAction.format);
        }
      } else if (copyExportAction.type === "text") {
        void exportRichTextItem(selectedItem, copyExportAction.format);
      } else if (copyExportAction.type === "table") {
        void exportTableItem(selectedItem, copyExportAction.format);
      } else if (copyExportAction.type === "codeBlock") {
        void exportCodeBlockItem(selectedItem, copyExportAction.format);
      }
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
      alignSelectionWithContextMenuTarget();
      void copySelection();
      hideContextMenu();
    }
    if (action === "cut") {
      alignSelectionWithContextMenuTarget();
      void cutSelection();
      hideContextMenu();
    }
    if (action === "paste") {
      void pasteFromSystemClipboard(getContextMenuScenePoint());
      hideContextMenu();
    }
    if (action === "delete") {
      alignSelectionWithContextMenuTarget();
      removeSelected();
      hideContextMenu();
    }
    if (action === "layer-front") {
      alignSelectionWithContextMenuTarget();
      moveSelectionToFront();
      hideContextMenu();
    }
    if (action === "layer-back") {
      alignSelectionWithContextMenuTarget();
      moveSelectionToBack();
      hideContextMenu();
    }
    if (action === "layer-up") {
      alignSelectionWithContextMenuTarget();
      moveSelectionByStep("up");
      hideContextMenu();
    }
    if (action === "layer-down") {
      alignSelectionWithContextMenuTarget();
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
    if (action === "connect-node" || action === "text-connect-mind-node") {
      beginMindRelationshipConnection();
      hideContextMenu();
    }
    if (action === "table-edit") {
      alignSelectionWithContextMenuTarget(["table"]);
      if (state.board.selectedIds.length === 1) {
        beginTableEdit(state.board.selectedIds[0], tableEditSelection);
      }
      hideContextMenu();
    }
    if (action === "table-copy-selection") {
      void copyTableSelectionToClipboard({ cut: false });
      hideContextMenu();
    }
    if (action === "table-cut-selection") {
      void copyTableSelectionToClipboard({ cut: true });
      hideContextMenu();
    }
    if (action === "table-clear-selection") {
      mutateTableEditor((matrix) =>
        clearTableSelectionContent(matrix, { hasHeader: getTableEditItem()?.table?.hasHeader !== false })
      );
      hideContextMenu();
    }
    if (action === "table-add-row") {
      if (!ensureTableEditorReadyForAction({ anchorCell: getTableActionAnchorCellFromTarget(target) })) {
        hideContextMenu();
        return;
      }
      mutateTableEditor((matrix) => {
        const { endRow } = getTableRowOperationBounds(matrix);
        return insertTableRows(matrix, endRow + 1, 1, {
          hasHeader: getTableEditItem()?.table?.hasHeader !== false,
        });
      });
      hideContextMenu();
    }
    if (action === "table-add-row-above") {
      if (!ensureTableEditorReadyForAction()) {
        hideContextMenu();
        return;
      }
      mutateTableEditor((matrix) =>
        insertTableRows(matrix, getTableRowOperationBounds(matrix).startRow, 1, {
          hasHeader: getTableEditItem()?.table?.hasHeader !== false,
        })
      );
      hideContextMenu();
    }
    if (action === "table-add-row-below") {
      if (!ensureTableEditorReadyForAction()) {
        hideContextMenu();
        return;
      }
      mutateTableEditor((matrix) =>
        insertTableRows(matrix, getTableRowOperationBounds(matrix).endRow + 1, 1, {
          hasHeader: getTableEditItem()?.table?.hasHeader !== false,
        })
      );
      hideContextMenu();
    }
    if (action === "table-add-column") {
      if (!ensureTableEditorReadyForAction({ anchorCell: getTableActionAnchorCellFromTarget(target) })) {
        hideContextMenu();
        return;
      }
      mutateTableEditor((matrix) => {
        const { endColumn } = getTableColumnOperationBounds(matrix);
        return insertTableColumns(matrix, endColumn + 1, 1, {
          hasHeader: getTableEditItem()?.table?.hasHeader !== false,
        });
      });
      hideContextMenu();
    }
    if (action === "table-add-column-left") {
      if (!ensureTableEditorReadyForAction()) {
        hideContextMenu();
        return;
      }
      mutateTableEditor((matrix) =>
        insertTableColumns(matrix, getTableColumnOperationBounds(matrix).startColumn, 1, {
          hasHeader: getTableEditItem()?.table?.hasHeader !== false,
        })
      );
      hideContextMenu();
    }
    if (action === "table-add-column-right") {
      if (!ensureTableEditorReadyForAction()) {
        hideContextMenu();
        return;
      }
      mutateTableEditor((matrix) =>
        insertTableColumns(matrix, getTableColumnOperationBounds(matrix).endColumn + 1, 1, {
          hasHeader: getTableEditItem()?.table?.hasHeader !== false,
        })
      );
      hideContextMenu();
    }
    if (action === "table-delete-row") {
      if (!ensureTableEditorReadyForAction()) {
        hideContextMenu();
        return;
      }
      mutateTableEditor((matrix) => {
        focusTableRowOperationRange(matrix);
        return deleteSelectedTableRows(matrix, {
          hasHeader: getTableEditItem()?.table?.hasHeader !== false,
        });
      });
      hideContextMenu();
    }
    if (action === "table-delete-column") {
      if (!ensureTableEditorReadyForAction()) {
        hideContextMenu();
        return;
      }
      mutateTableEditor((matrix) => {
        focusTableColumnOperationRange(matrix);
        return deleteSelectedTableColumns(matrix, {
          hasHeader: getTableEditItem()?.table?.hasHeader !== false,
        });
      });
      hideContextMenu();
    }
    if (action === "table-move-row-up") {
      if (!ensureTableEditorReadyForAction()) {
        hideContextMenu();
        return;
      }
      mutateTableEditor((matrix) => {
        const hasHeader = getTableEditItem()?.table?.hasHeader !== false;
        const { startRow } = getTableRowOperationBounds(matrix);
        const minRow = hasHeader ? 1 : 0;
        if (startRow <= minRow) {
          setStatus("当前行已经在顶部");
          return matrix;
        }
        focusTableRowOperationRange(matrix);
        return moveSelectedTableRows(matrix, "up", { hasHeader });
      });
      hideContextMenu();
    }
    if (action === "table-move-row-down") {
      if (!ensureTableEditorReadyForAction()) {
        hideContextMenu();
        return;
      }
      mutateTableEditor((matrix) => {
        const hasHeader = getTableEditItem()?.table?.hasHeader !== false;
        const { endRow } = getTableRowOperationBounds(matrix);
        if (endRow >= matrix.length - 1) {
          setStatus("当前行已经在底部");
          return matrix;
        }
        focusTableRowOperationRange(matrix);
        return moveSelectedTableRows(matrix, "down", { hasHeader });
      });
      hideContextMenu();
    }
    if (action === "table-move-column-left") {
      if (!ensureTableEditorReadyForAction()) {
        hideContextMenu();
        return;
      }
      mutateTableEditor((matrix) => {
        const { startColumn } = getTableColumnOperationBounds(matrix);
        if (startColumn <= 0) {
          setStatus("当前列已经在最左侧");
          return matrix;
        }
        focusTableColumnOperationRange(matrix);
        return moveSelectedTableColumns(matrix, "left", { hasHeader: getTableEditItem()?.table?.hasHeader !== false });
      });
      hideContextMenu();
    }
    if (action === "table-move-column-right") {
      if (!ensureTableEditorReadyForAction()) {
        hideContextMenu();
        return;
      }
      mutateTableEditor((matrix) => {
        const { endColumn } = getTableColumnOperationBounds(matrix);
        if (endColumn >= (matrix[0] || []).length - 1) {
          setStatus("当前列已经在最右侧");
          return matrix;
        }
        focusTableColumnOperationRange(matrix);
        return moveSelectedTableColumns(matrix, "right", { hasHeader: getTableEditItem()?.table?.hasHeader !== false });
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
    if (action === "image-copy") {
      void copySelection();
      hideContextMenu();
    }
    if (action === "image-reveal") {
      const selected = alignSelectionWithContextMenuTarget(["image"]) || getSingleSelectedItemFast("image");
      if (selected) {
        const path = String(selected?.sourcePath || "").trim();
        if (!path) {
          setStatus("该图片尚未保存到本地位置");
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
        const selected = getSingleSelectedItemFast("image");
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
        const selected = getSingleSelectedItemFast("fileCard");
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
        const selected = getSingleSelectedItemFast("fileCard");
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
    if (action === "file-preview") {
      if (state.board.selectedIds.length === 1) {
        const selected = getSingleSelectedItemFast("fileCard");
        if (!openFileCardPreview(selected)) {
          hideContextMenu();
          return;
        }
      }
      hideContextMenu();
    }
  }

  function applyRichTextCommand(action, color) {
    const activeContext = getActiveRichSessionContext();
    const activeSession = activeContext?.session || null;
    const item = activeContext?.item || resolveRichCommandTarget();
    if (!item || !activeSession) {
      return;
    }
    const isMindNodeEditor = item.type === "mindNode" || item.type === "mindSummary";
    if (action === "link") {
      if (state.editingType === "table" && tableCellEditState.active) {
        const url = window.prompt("输入链接地址", "");
        if (url) {
          activeSession.command("createLink", url);
          activeSession.focus();
          activeSession.captureSelection();
          syncActiveRichEditingItemState();
        }
      } else {
        runRichLinkCommand();
      }
      return;
    }
    if (action === "link-canvas") {
      runRichCanvasLinkCommand();
      return;
    }
    if (action === "link-remove") {
      requestAnimationFrame(() => {
        if (!activeSession.isActive()) {
          return;
        }
        activeSession.command("unlink");
        activeSession.focus();
        activeSession.captureSelection();
        if (activeContext?.editorElement) {
          applyInlineFontSizingToContainer(activeContext.editorElement, state.board.view.scale);
        }
        syncActiveRichEditingItemState();
        setStatus("已移除链接");
      });
      return;
    }
    if (action === "insert-math" || action === "insert-math-inline" || action === "insert-math-block") {
      requestAnimationFrame(() => {
        if (!activeSession.isActive()) {
          return;
        }
        const formatState = activeSession.getFormatState() || {};
        const selectionSnapshot = activeSession.getSelectionSnapshot?.() || null;
        const selectionText = String(selectionSnapshot?.text || "").trim();
        const hasExpandedSelection = Boolean(selectionSnapshot?.inside && !selectionSnapshot?.collapsed && selectionText);
        const isBlockInsert = action === "insert-math-block";
        if (formatState.canEditMath) {
          richTextSession.focus();
          richTextSession.captureSelection();
          applyInlineFontSizingToContainer(refs.richEditor, state.board.view.scale);
          syncActiveRichEditingItemState();
          setStatus("当前处于公式内，直接编辑公式内容");
          return;
        }
        if (isBlockInsert) {
          if (hasExpandedSelection) {
            activeSession.command("insertMathBlock", selectionText);
          } else {
            activeSession.command("insertMathBlockTemplate");
          }
        } else {
          if (hasExpandedSelection) {
            activeSession.command("insertMathInline", selectionText);
          } else {
            activeSession.command("insertMathInlineTemplate");
          }
        }
        activeSession.focus();
        activeSession.captureSelection();
        if (activeContext?.editorElement) {
          applyInlineFontSizingToContainer(activeContext.editorElement, state.board.view.scale);
        }
        syncActiveRichEditingItemState();
        if (isBlockInsert) {
          setStatus(hasExpandedSelection ? "已将选中文本转为独立公式" : "已插入独立公式，退出编辑后将拆分为独立元素");
        } else {
          setStatus(hasExpandedSelection ? "已将选中文本转为行内公式" : "已插入行内公式，直接在 $ 中输入 LaTeX");
        }
      });
      return;
    }
    if (action === "edit-math-source") {
      requestAnimationFrame(() => {
        if (!activeSession.isActive()) {
          return;
        }
        const formatState = activeSession.getFormatState() || {};
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
        activeSession.command("updateCurrentMath", nextSource);
        activeSession.focus();
        activeSession.captureSelection();
        if (activeContext?.editorElement) {
          applyInlineFontSizingToContainer(activeContext.editorElement, state.board.view.scale);
        }
        syncActiveRichEditingItemState();
      });
      return;
    }
    requestAnimationFrame(() => {
      if (!activeSession.isActive()) {
        return;
      }
      if (action === "bold") {
        activeSession.command("bold");
      } else if (action === "italic") {
        activeSession.command("italic");
      } else if (action === "inline-code") {
        activeSession.command("toggleInlineCode");
      } else if (action === "underline") {
        activeSession.command("underline");
      } else if (action === "strike") {
        activeSession.command("strikeThrough");
      } else if (action === "blockquote") {
        activeSession.command("setBlockType", "blockquote");
      } else if (action === "blockquote-indent") {
        const formatState = activeSession.getFormatState() || {};
        if (formatState.blockType !== "blockquote") {
          activeSession.command("setBlockType", "blockquote");
        } else {
          activeSession.command("indent");
        }
      } else if (action === "blockquote-outdent") {
        activeSession.command("outdent");
      } else if (action === "unordered-list") {
        activeSession.command("insertUnorderedList");
      } else if (action === "ordered-list") {
        activeSession.command("insertOrderedList");
      } else if (action === "task-list") {
        activeSession.command("toggleTaskList");
      } else if (action === "horizontal-rule") {
        activeSession.command("insertHorizontalRule");
      } else if (action === "text-split") {
        splitActiveRichTextNow();
        return;
      } else if (action === "color") {
        if (color) {
          activeSession.command("foreColor", color);
        }
      } else if (action === "highlight") {
        activeSession.command("highlight", "#fff4a3");
      } else if (action === "fontSize") {
        if (isMindNodeEditor) {
          return;
        }
        if (color) {
          activeSession.command("fontSize", color);
        }
      } else if (action === "align-left") {
        activeSession.command("align", "left");
      } else if (action === "align-center") {
        activeSession.command("align", "center");
      } else if (action === "align-right") {
        activeSession.command("align", "right");
      }
      activeSession.focus();
      activeSession.captureSelection();
      if (activeContext?.editorElement) {
        applyInlineFontSizingToContainer(activeContext.editorElement, state.board.view.scale);
      }
      syncActiveRichEditingItemState();
    });
  }

  function onGlobalPointerDown(event) {
    hideLinkMetaTooltip();
    if (event.target instanceof Element) {
      const insideMindNodeLinkUi =
        refs.mindNodeLinkPanel?.contains(event.target) ||
        refs.mindNodeChrome?.contains(event.target);
      if (!insideMindNodeLinkUi && (mindNodeLinkPanelPinnedNodeId || activeMindNodeLinkMenuTargetId)) {
        clearMindNodeLinkPanelState();
        hideMindNodeLinkPanel();
      }
    }
    const deferredEditingType = shouldDeferBlankPointerExit(event);
    if (deferredEditingType) {
      scheduleDeferredBlankEditExit(deferredEditingType, event);
      return;
    }
    if (
      state.editingType === "table" &&
      event.target instanceof Element &&
      !(
        refs.tableEditor?.contains(event.target) ||
        refs.tableToolbar?.contains(event.target) ||
        refs.richToolbar?.contains(event.target) ||
        refs.richSelectionToolbar?.contains(event.target) ||
        refs.richExternalLinkPanel?.contains(event.target)
      )
    ) {
      commitTableEdit();
    }
    if (
      state.editingType === "code-block" &&
      event.target instanceof Element &&
      !(refs.codeBlockEditor?.contains(event.target) || refs.codeBlockToolbar?.contains(event.target))
    ) {
      commitCodeBlockEdit();
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
      pendingRichExternalLinkEdit &&
      event.target instanceof Element &&
      !refs.richExternalLinkPanel?.contains(event.target) &&
      !refs.richToolbar?.contains(event.target) &&
      !refs.richSelectionToolbar?.contains(event.target)
    ) {
      closeRichExternalLinkEditor();
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
      scheduleContextSubmenuClose();
    }
  }

  function onContextMenuPointerLeave() {
    scheduleContextSubmenuClose();
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
    scheduleContextSubmenuClose();
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
    if (target instanceof HTMLInputElement && action === "color-picker") {
      return;
    }
    event.preventDefault();
    if (
      action !== "toggle-blockquote-menu" &&
      action !== "toggle-math-menu" &&
      action !== "toggle-link-menu" &&
      action !== "toggle-color-panel"
    ) {
      closeRichToolbarSubmenus();
    }
    if (action === "toggle-blockquote-menu" || action === "toggle-math-menu" || action === "toggle-link-menu") {
      toggleRichToolbarSubmenu(target.closest(".canvas2d-rich-submenu"));
      return;
    }
    if (action === "toggle-color-panel") {
      toggleRichToolbarColorPanel(target.closest('[data-role="rich-color-control"]'));
      return;
    }
    if (action === "toggle-font-size-panel") {
      if (isMindNodeRichEditingActive()) {
        return;
      }
      if (isMindNodeRichEditingActive()) {
        return;
      }
      toggleRichSelectionFontSizePanel();
      return;
    }
    if (action === "font-size-step-down") {
      if (isMindNodeRichEditingActive()) {
        return;
      }
      stepRichSelectionFontSize(-1);
      return;
    }
    if (action === "font-size-step-up") {
      if (isMindNodeRichEditingActive()) {
        return;
      }
      stepRichSelectionFontSize(1);
      return;
    }
    if (action === "font-size-preset") {
      if (isMindNodeRichEditingActive()) {
        return;
      }
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
    if (action === "color-preset") {
      const color = target.getAttribute("data-color");
      setRichToolbarCustomColor(color, { apply: true, closePanel: true });
      return;
    }
    if (action === "color-add-preset") {
      const control = target.closest('[data-role="rich-color-control"]');
      const colorInput = control?.querySelector?.('[data-action="color-picker"]');
      const color = colorInput instanceof HTMLInputElement ? colorInput.value : richToolbarColorSlots[2];
      const added = addRichToolbarPresetColor(color);
      setStatus(added ? "已保存到常用预设" : "该颜色已在常用预设中");
      return;
    }
    if (action === "color-reset-default") {
      resetRichToolbarDefaultColors({ apply: false });
      setStatus("已恢复默认颜色");
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
    getActiveRichSession()?.captureSelection?.();
  }

  function onRichExternalLinkPanelPointerDown(event) {
    if (event.target instanceof HTMLButtonElement) {
      event.preventDefault();
    }
    getActiveRichSession()?.captureSelection?.();
  }

  function onRichExternalLinkPanelInput(event) {
    if (!pendingRichExternalLinkEdit) {
      return;
    }
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    pendingRichExternalLinkEdit.rawValue = String(input.value || "");
  }

  function onRichExternalLinkPanelKeyDown(event) {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      applyRichExternalLinkEditor();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeRichExternalLinkEditor({ restoreFocus: true });
    }
  }

  function onRichExternalLinkPanelClick(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    const action = String(target?.getAttribute?.("data-action") || "").trim();
    if (!action) {
      return;
    }
    event.preventDefault();
    if (action === "rich-link-apply") {
      applyRichExternalLinkEditor();
      return;
    }
    if (action === "rich-link-remove") {
      applyRichExternalLinkEditor({ remove: true });
      return;
    }
    if (action === "rich-link-close") {
      closeRichExternalLinkEditor({ restoreFocus: true });
    }
  }

  function setRichFontSize(nextSize) {
    const value = normalizeRichEditorFontSize(nextSize, richFontSize);
    richFontSize = value;
    if (state.editingId) {
      const item = getActiveRichEditingItem();
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
    commitItemsPatchHistory(before, Array.from(selectedIds), `${label}文本`, "text-style-batch");
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
      const editingItem = getActiveRichEditingItem();
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
    commitItemsPatchHistory(before, Array.from(selectedIds), `设置${preset.label}`, "text-style-batch");
    setStatus(`已应用${preset.label}样式`);
    return true;
  }


  function convertTextToFlowNode() {
    if (state.board.selectedIds.length !== 1) {
      return false;
    }
    const textItem = getSingleSelectedItemFast();
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
    commitItemPatchHistory(before, node.id, node, "节点文本", "item-convert");
    setStatus("已转换为节点文本");
    return true;
  }

  function convertFlowNodeToText() {
    if (state.board.selectedIds.length !== 1) {
      return false;
    }
    const nodeItem = getSingleSelectedItemFast();
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
    commitItemPatchHistory(before, next.id, next, "恢复普通文本", "item-convert");
    setStatus("已恢复为普通文本");
    return true;
  }

  function toggleNodeText() {
    if (state.board.selectedIds.length !== 1) {
      return false;
    }
    const item = getSingleSelectedItemFast();
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
    commitItemsPatchHistory(before, Array.from(selectedIds), "更新连线", "flow-edge-edit");
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
    commitItemsPatchHistory(before, Array.from(selectedIds), "删除连线", "item-delete-batch", {
      beforeOrderIds: Array.isArray(before.items) ? before.items.map((item) => item.id) : [],
      afterOrderIds: state.board.items.map((item) => item.id),
    });
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
      if (isMindNodeRichEditingActive()) {
        return;
      }
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
      if (isMindNodeRichEditingActive()) {
        return;
      }
      if (event.type !== "change") {
        return;
      }
      applyRichSelectionFontSizeFromInput(target);
      return;
    }
    if (action === "color-picker" && target instanceof HTMLInputElement) {
      if (event.type !== "input" && event.type !== "change") {
        return;
      }
      if (event.type === "input") {
        previewRichToolbarCustomColor(target.value || "");
      } else {
        setRichToolbarCustomColor(target.value || "", { apply: true, closePanel: false });
      }
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
    event.preventDefault();
    event.stopPropagation();
    hideContextMenu();
    richTextSession.captureSelection();
    openRichEditorContextMenuAt(Number(event.clientX || 0), Number(event.clientY || 0));
  }

  function onRichEditorPointerDown(event) {
    if (Number(event.button) === 2) {
      richTextSession.captureSelection();
      closeRichToolbarSubmenus();
      hideContextMenu();
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

  async function getRichEditorPasteClipboardPayload(dataTransfer, item) {
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
    if (text && hasMarkdownMathSyntax(text) && !htmlContainsRenderableMath(html)) {
      const semanticMathHtml = await convertPlainClipboardTextToSemanticHtmlAsync(text, baseFontSize);
      if (semanticMathHtml) {
        html = semanticMathHtml;
      }
    }
    if (!html && text) {
      html = await convertPlainClipboardTextToSemanticHtmlAsync(text, baseFontSize);
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

  async function copyActiveRichSelectionToClipboard({ cut = false } = {}) {
    const item = getActiveRichEditingItem();
    if (!item) {
      return false;
    }
    const payload = getRichEditorSelectionClipboardPayload(item);
    if (!payload) {
      return false;
    }
    const marker = buildInternalClipboardMarker({
      copiedAt: Date.now(),
      itemCount: 1,
      source: CLIPBOARD_SOURCE_RICH_EDITOR,
      kind: CLIPBOARD_KIND_RICH_TEXT,
    });
    clearInternalClipboard();
    let copied = false;
    let usedNativeCut = false;
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            [CANVAS_CLIPBOARD_MIME]: new Blob([marker], { type: CANVAS_CLIPBOARD_MIME }),
            [RICH_TEXT_CLIPBOARD_MIME]: new Blob([stringifyRichTextClipboardPayload(payload.richTextPayload)], {
              type: RICH_TEXT_CLIPBOARD_MIME,
            }),
            "text/html": new Blob([payload.html], { type: "text/html" }),
            "text/plain": new Blob([payload.text], { type: "text/plain" }),
          }),
        ]);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied && navigator.clipboard?.writeText && payload.text) {
      try {
        await navigator.clipboard.writeText(payload.text);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied && typeof document?.execCommand === "function") {
      refs.richEditor?.focus();
      richTextSession.captureSelection();
      copied = document.execCommand(cut ? "cut" : "copy");
      usedNativeCut = cut && copied;
    }
    if (cut) {
      if (!usedNativeCut) {
        richTextSession.deleteSelection();
      }
      syncActiveRichEditingItemState();
    }
    if (copied) {
      setStatus(cut ? "已剪切选中文本" : "已复制选中文本");
    }
    return copied;
  }

  async function readSystemClipboardRichPayload(item) {
    const baseFontSize = item?.fontSize || richFontSize || DEFAULT_TEXT_FONT_SIZE;
    let html = "";
    let text = "";
    if (navigator.clipboard?.read) {
      try {
        const entries = await navigator.clipboard.read();
        for (const entry of entries) {
          if (!html && entry.types.includes("text/html")) {
            const blob = await entry.getType("text/html");
            html = await blob.text();
          }
          if (!text && entry.types.includes("text/plain")) {
            const blob = await entry.getType("text/plain");
            text = await blob.text();
          }
          if (html || text) {
            break;
          }
        }
      } catch {
        html = "";
        text = "";
      }
    }
    if (!text) {
      text = await clipboardBroker.readSystemClipboardText();
    }
    if (html) {
      html = sanitizeHtml(normalizeRichHtmlInlineFontSizes(normalizeRichHtml(html), baseFontSize)).trim();
    }
    text = sanitizeText(text || "") || sanitizeText(htmlToPlainText(html));
    if (text && hasMarkdownMathSyntax(text) && !htmlContainsRenderableMath(html)) {
      const semanticMathHtml = await convertPlainClipboardTextToSemanticHtmlAsync(text, baseFontSize);
      if (semanticMathHtml) {
        html = semanticMathHtml;
      }
    }
    if (!html && text) {
      html = await convertPlainClipboardTextToSemanticHtmlAsync(text, baseFontSize);
    }
    if (!html && !text) {
      return null;
    }
    return { html, text };
  }

  async function pasteIntoActiveRichEditorFromClipboard() {
    const item = getActiveRichEditingItem();
    if (!item) {
      return false;
    }
    const payload = await readSystemClipboardRichPayload(item);
    if (!payload) {
      return false;
    }
    const formatState = richTextSession.getFormatState?.() || {};
    if (formatState.canEditMath) {
      const insertedIntoMath = richTextSession.command(
        "insertIntoCurrentMath",
        payload.text || htmlToPlainText(payload.html || "")
      );
      if (insertedIntoMath) {
        syncActiveRichEditingItemState();
        syncRichTextToolbar();
        setStatus("已粘贴到公式");
        return true;
      }
    }
    const inserted = insertRichEditorClipboardPayload(payload);
    if (inserted) {
      setStatus("已粘贴到文本");
    }
    return inserted;
  }

  async function handleRichEditorContextMenuAction(action) {
    if (action === "rich-copy") {
      return copyActiveRichSelectionToClipboard({ cut: false });
    }
    if (action === "rich-cut") {
      return copyActiveRichSelectionToClipboard({ cut: true });
    }
    if (action === "rich-paste") {
      return pasteIntoActiveRichEditorFromClipboard();
    }
    if (action === "rich-select-all") {
      richTextSession.focus();
      richTextSession.selectAll();
      richTextSession.captureSelection();
      syncRichTextToolbar();
      return true;
    }
    if (action === "rich-finish-edit") {
      commitRichEdit();
      return true;
    }
    if (
      [
        "bold",
        "italic",
        "underline",
        "strike",
        "highlight",
        "inline-code",
        "blockquote",
        "blockquote-indent",
        "blockquote-outdent",
        "unordered-list",
        "ordered-list",
        "task-list",
        "horizontal-rule",
        "text-split",
        "link",
        "link-canvas",
        "link-remove",
        "insert-math-inline",
        "insert-math-block",
      ].includes(action)
    ) {
      applyRichTextCommand(action);
      return true;
    }
    return false;
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
    if (isCanvasInternalLinkUrl(currentHref)) {
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
    openRichExternalLinkEditor({
      prefill: currentHref,
      selectionText: String(linkEl.textContent || "").trim(),
      editingExistingLink: true,
      anchorRect: range.getBoundingClientRect?.() || null,
    });
  }

  function onRichDisplayClick(event) {
    const descriptor = resolveLinkDescriptorFromAnchor(event.target);
    if (!descriptor?.linkEl) {
      richDisplayEventBridge.handleClick(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (descriptor.linkType === CANVAS_INTERNAL_LINK_TYPE) {
      scheduleFocusCanvasLinkTarget(descriptor.canvasTargetId);
      return;
    }
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
    if (!(event.target instanceof Element)) {
      return;
    }
    const linkTarget = event.target.closest("a[href], a[data-link-token='1']");
    if (linkTarget) {
      const pointerId = Number(event.pointerId);
      const timeStamp = Number(event.timeStamp || 0);
      blockedCanvasPointerDown = {
        pointerId: Number.isFinite(pointerId) ? pointerId : null,
        expiresAt: (Number.isFinite(timeStamp) ? timeStamp : 0) + 180,
      };
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return;
    }
    richDisplayEventBridge.handlePointerDown(event);
  }

  function onRichDisplayPointerUp(event) {
    if (!(event.target instanceof Element)) {
      return;
    }
    const linkTarget = event.target.closest("a[href], a[data-link-token='1']");
    if (linkTarget) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return;
    }
    const richItemNode = event.target.closest(".canvas2d-rich-item[data-id]");
    if (!(richItemNode instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    onPointerUp(event);
  }

  function onRichDisplayContextMenu(event) {
    richDisplayEventBridge.handleContextMenu(event);
  }

  function onRichDisplayDoubleClick(event) {
    if (!(event.target instanceof Element)) {
      return;
    }
    const linkTarget = event.target.closest("a[href], a[data-link-token='1']");
    if (linkTarget instanceof Element) {
      event.preventDefault();
      const descriptor = resolveLinkDescriptorFromAnchor(linkTarget);
      if (descriptor?.linkType === CANVAS_INTERNAL_LINK_TYPE) {
        scheduleFocusCanvasLinkTarget(descriptor.canvasTargetId);
        return;
      }
      onDoubleClick(event);
      return;
    }
    richDisplayEventBridge.handleDoubleClick(event);
  }

  function onCodeBlockDisplayPointerMove(event) {
    onPointerMove(event);
  }

  function onCodeBlockDisplayPointerLeave() {
    if (state.hoverId) {
      markCodeBlockOverlayDirty(state.hoverId);
      state.hoverId = null;
      scheduleRender();
    }
  }

  function onCodeBlockDisplayPointerDown(event) {
    const actionTarget = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (actionTarget instanceof HTMLElement) {
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return;
    }
    codeBlockDisplayEventBridge.handlePointerDown(event);
  }

  function onCodeBlockDisplayPointerUp(event) {
    const actionTarget = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (actionTarget instanceof HTMLElement) {
      const action = String(actionTarget.getAttribute("data-action") || "").trim().toLowerCase();
      if (action === "copy-code") {
        const itemNode = actionTarget.closest(".canvas2d-code-block-item");
        const itemId = itemNode instanceof HTMLElement ? String(itemNode.dataset.id || "") : "";
        const item = itemId ? sceneRegistry.getItemById(itemId, "codeBlock") : null;
        if (item) {
          actionTarget.dataset.pointerHandledAt = String(Date.now());
          void copyCodeBlockContent(item);
        }
      }
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return;
    }
    const target = event.target instanceof Element ? event.target.closest(".canvas2d-code-block-item") : null;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    onPointerUp(event);
  }

  function onCodeBlockDisplayClick(event) {
    const actionTarget = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (actionTarget instanceof HTMLElement) {
      const bridgeContext = codeBlockDisplayEventBridge.resolveTarget(event.target, { includeAction: true });
      const item = bridgeContext?.item || null;
      if (!item) {
        return;
      }
      const action = String(actionTarget.getAttribute("data-action") || "").trim().toLowerCase();
      if (action === "copy-code") {
        const handledAt = Number(actionTarget.dataset.pointerHandledAt || 0);
        if (handledAt && Date.now() - handledAt < 450) {
          actionTarget.dataset.pointerHandledAt = "";
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void copyCodeBlockContent(item);
      }
      return;
    }
    codeBlockDisplayEventBridge.handleClick(event);
  }

  function onCodeBlockDisplayContextMenu(event) {
    if (!(event.target instanceof Element)) {
      return;
    }
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget instanceof HTMLElement) {
      return;
    }
    codeBlockDisplayEventBridge.handleContextMenu(event);
  }

  function onCodeBlockDisplayDoubleClick(event) {
    codeBlockDisplayEventBridge.handleDoubleClick(event);
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

  async function onRichEditorPaste(event) {
    if (!event.clipboardData) {
      return;
    }
    const item = getActiveRichEditingItem();
    if (!item) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const payload = await getRichEditorPasteClipboardPayload(event.clipboardData, item);
    if (!payload) {
      return;
    }
    const formatState = richTextSession.getFormatState?.() || {};
    if (formatState.canEditMath) {
      const insertedIntoMath = richTextSession.command(
        "insertIntoCurrentMath",
        payload.text || htmlToPlainText(payload.html || "")
      );
      if (insertedIntoMath) {
        syncActiveRichEditingItemState();
        syncRichTextToolbar();
        return;
      }
    }
    const inserted = insertRichEditorClipboardPayload(payload);
    if (!inserted) {
      return;
    }
  }

  function onRichEditorBlur(event) {
    if (
      resolvePendingCanvasLinkBindingMode() ||
      (deferredBlankEditExit &&
        (state.editingType === "text" || state.editingType === "flow-node" || isMindNodeEditingType(state.editingType)))
    ) {
      return;
    }
    richTextSession.handleBlur(event, {
      ignoreTargets: [refs.richToolbar, refs.richSelectionToolbar, refs.richExternalLinkPanel],
      onCommit: () => commitRichEdit(),
    });
  }

  function onRichEditorInput() {
    if (!state.editingId || !(refs.richEditor instanceof HTMLDivElement)) {
      return;
    }
    const item = getActiveRichEditingItem();
    if (
      !item ||
      (item.type === "text" && isLockedText(item)) ||
      ((item.type === "flowNode" || item.type === "mindNode") && isLockedItem(item))
    ) {
      return;
    }
    richTextSession.handleInput(() => {
      syncActiveRichEditingItemState({ emit: false, refreshToolbar: false, markDirty: true });
      requestAnimationFrame(() => syncRichTextToolbar());
    });
  }

  function onRichEditorBeforeInput(event) {
    const inputType = String(event?.inputType || "").toLowerCase();
    if (inputType === "insertfrompaste" || inputType === "insertfromdrop") {
      event.preventDefault();
    }
  }

  function onFileMemoBlur() {
    if (deferredBlankEditExit && state.editingType === "file-memo") {
      return;
    }
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
    if (deferredBlankEditExit && state.editingType === "image-memo") {
      return;
    }
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
    setTableInteractionPointerState("editor", true);
    if (handleTableActionPress(event)) {
      return;
    }
    if (tableCellEditState.active && !(refs.tableCellRichEditor?.contains?.(event.target))) {
      commitActiveTableCellRichEdit({ keepFocus: false });
    }
    const axisHandle = event.target instanceof Element ? event.target.closest("[data-table-handle-kind]") : null;
    if (axisHandle instanceof HTMLElement) {
      event.preventDefault();
      const kind = String(axisHandle.getAttribute("data-table-handle-kind") || "").trim().toLowerCase();
      const matrix = buildTableMatrixFromEditor();
      if (kind === "all") {
        selectEntireTable(matrix);
        return;
      }
      if (kind === "row") {
        beginTableStructureDrag("row", Number(axisHandle.getAttribute("data-row-index") || 0), event, matrix);
        return;
      }
      if (kind === "column") {
        beginTableStructureDrag("column", Number(axisHandle.getAttribute("data-column-index") || 0), event, matrix);
        return;
      }
    }
    const cell = getTableEditorCellFromEventTarget(event.target);
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    const rowIndex = Number(cell.getAttribute("data-row-index"));
    const columnIndex = Number(cell.getAttribute("data-column-index"));
    if (isTableCellEditing(rowIndex, columnIndex) && Number(event.button) !== 2) {
      tablePointerSelectionState.pointerId = null;
      tablePointerSelectionState.anchor = null;
      tablePointerSelectionState.pendingCell = null;
      tablePointerSelectionState.multiSelectActive = false;
      tablePointerSelectionState.nativeTextSelection = true;
      tablePointerSelectionState.draggingRange = false;
      return;
    }
    if (tableCellEditState.active) {
      commitActiveTableCellRichEdit({ keepFocus: false });
    }
    selectTableEditorCell(rowIndex, columnIndex, { extend: Boolean(event.shiftKey), keepEditing: false });
    beginTableCellPointerSelection(event, rowIndex, columnIndex);
  }

  function onTableEditorMouseDown(event) {
    setTableInteractionPointerState("editor", true);
    handleTableActionPress(event);
  }

  function onTableEditorClick(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (target?.getAttribute("data-pointer-action-handled") === "1") {
      target.removeAttribute("data-pointer-action-handled");
      event.preventDefault();
      return;
    }
    if (!target) {
      const axisHandle = event.target instanceof Element ? event.target.closest("[data-table-handle-kind]") : null;
      if (axisHandle instanceof HTMLElement) {
        const kind = String(axisHandle.getAttribute("data-table-handle-kind") || "").trim().toLowerCase();
        const matrix = buildTableMatrixFromEditor();
        if (kind === "all") {
          selectEntireTable(matrix);
        } else if (kind === "row") {
          selectTableRow(Number(axisHandle.getAttribute("data-row-index") || 0), matrix);
        } else if (kind === "column") {
          selectTableColumn(Number(axisHandle.getAttribute("data-column-index") || 0), matrix);
        }
        return;
      }
      const cell = getTableEditorCellFromEventTarget(event.target);
      if (cell instanceof HTMLElement) {
        const rowIndex = Number(cell.getAttribute("data-row-index"));
        const columnIndex = Number(cell.getAttribute("data-column-index"));
        if (isTableCellEditing(rowIndex, columnIndex)) {
          return;
        }
        selectTableEditorCell(rowIndex, columnIndex, { extend: Boolean(event.shiftKey), keepEditing: false });
        cell.focus();
      }
      return;
    }
    event.preventDefault();
    onContextMenuClick(event);
  }

  function onTableEditorDoubleClick(event) {
    const cell = getTableEditorCellFromEventTarget(event.target);
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    tablePointerSelectionState.multiSelectActive = false;
    tablePointerSelectionState.nativeTextSelection = false;
    tablePointerSelectionState.draggingRange = false;
    activateTableCellEditing(
      Number(cell.getAttribute("data-row-index")),
      Number(cell.getAttribute("data-column-index")),
      { placeAtEnd: true, reason: "dblclick" }
    );
  }

  function onTableEditorContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    setTableInteractionPointerState("editor", true);
    const axisHandle = event.target instanceof Element ? event.target.closest("[data-table-handle-kind]") : null;
    if (axisHandle instanceof HTMLElement) {
      const kind = String(axisHandle.getAttribute("data-table-handle-kind") || "").trim().toLowerCase();
      const matrix = buildTableMatrixFromEditor();
      if (kind === "all") {
        selectEntireTable(matrix);
      } else if (kind === "row") {
        selectTableRow(Number(axisHandle.getAttribute("data-row-index") || 0), matrix);
      } else if (kind === "column") {
        selectTableColumn(Number(axisHandle.getAttribute("data-column-index") || 0), matrix);
      }
    }
    const cell = getTableEditorCellFromEventTarget(event.target);
    if (cell instanceof HTMLElement) {
      selectTableEditorCell(Number(cell.getAttribute("data-row-index")), Number(cell.getAttribute("data-column-index")), {
        extend: Boolean(event.shiftKey),
        keepEditing: false,
      });
    }
    openTableEditorContextMenuAt(event.clientX, event.clientY);
  }

  function onTableEditorInput() {
    if (tableCellEditState.active) {
      syncActiveDraftEditingState({ markDirty: true });
    }
  }

  function onTableEditorScroll() {
    syncTableEditorSelectionUI();
  }

  function onTableEditorPointerMove(event) {
    setTableInteractionPointerState("editor", true);
    if (tableStructureDragState.kind) {
      updateTableStructureDrag(event);
    }
    const hoveredCell = getTableEditorCellFromEventTarget(event.target);
    if (hoveredCell instanceof HTMLElement) {
      setTableHoveredCell(
        Number(hoveredCell.getAttribute("data-row-index")),
        Number(hoveredCell.getAttribute("data-column-index"))
      );
      if (!tablePointerSelectionState.multiSelectActive) {
        syncTableEditorSelectionUI();
      }
    }
    if (tableCellEditState.active || !tablePointerSelectionState.anchor || Number(event.buttons || 0) !== 1) {
      return;
    }
    const cell = hoveredCell;
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    const focus = {
      rowIndex: Number(cell.getAttribute("data-row-index")),
      columnIndex: Number(cell.getAttribute("data-column-index")),
    };
    tablePointerSelectionState.multiSelectActive = true;
    tablePointerSelectionState.draggingRange = true;
    tableEditSelection = normalizeTableCellCoordinate(focus.rowIndex, focus.columnIndex);
    tableEditRange = createTableSelectionRange(tablePointerSelectionState.anchor, focus);
    syncTableEditorSelectionUI();
  }

  function onTableEditorPointerUp(event) {
    if (tablePointerSelectionState.nativeTextSelection) {
      resetTablePointerSelectionState();
      finishTableStructureDrag();
      return;
    }
    resetTablePointerSelectionState();
    finishTableStructureDrag();
  }

  function onTableEditorPointerEnter(event) {
    setTableInteractionPointerState("editor", true);
    const cell = getTableEditorCellFromEventTarget(event.target);
    if (cell instanceof HTMLElement) {
      setTableHoveredCell(Number(cell.getAttribute("data-row-index")), Number(cell.getAttribute("data-column-index")));
    }
    syncTableEditorSelectionUI();
  }

  function onTableEditorPointerLeave() {
    setTableInteractionPointerState("editor", false);
    if (!tableStructureDragState.kind) {
      resetTableStructureDragState();
    }
    syncTableEditorSelectionUI();
  }

  function onMindNodeChromePointerEnter() {
    mindNodeChromePointerInside = true;
  }

  function onMindNodeChromePointerLeave() {
    mindNodeChromePointerInside = false;
    hideLinkMetaTooltip();
  }

  function onMindNodeChromePointerDown(event) {
    const actionTarget = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!(actionTarget instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onContextMenuClick(event);
  }

  function getMindNodeActionTargetItem() {
    const chromeNodeId = String(refs.mindNodeChrome?.getAttribute?.("data-node-id") || "").trim();
    if (chromeNodeId) {
      const byChrome = getMindNodeById(chromeNodeId);
      if (byChrome) {
        return byChrome;
      }
    }
    return getSingleSelectedItemFast()?.type === "mindNode" ? getSingleSelectedItemFast() : null;
  }

  function cancelMindNodeLinkMenuCloseTimer() {
    if (!mindNodeLinkMenuCloseTimer) {
      return;
    }
    clearTimeout(mindNodeLinkMenuCloseTimer);
    mindNodeLinkMenuCloseTimer = 0;
  }

  function scheduleMindNodeLinkMenuClose() {
    cancelMindNodeLinkMenuCloseTimer();
    mindNodeLinkMenuCloseTimer = setTimeout(() => {
      mindNodeLinkMenuCloseTimer = 0;
      clearMindNodeLinkPanelState();
      hideMindNodeLinkPanel();
    }, 160);
  }

  function onMindNodeLinkPanelPointerDown(event) {
    const actionTarget = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!(actionTarget instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function onMindNodeLinkPanelClick(event) {
    cancelMindNodeLinkMenuCloseTimer();
    const actionTarget = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!(actionTarget instanceof HTMLElement) || !(refs.mindNodeLinkPanel instanceof HTMLDivElement)) {
      return;
    }
    const action = String(actionTarget.getAttribute("data-action") || "").trim();
    const nodeId = String(refs.mindNodeLinkPanel.getAttribute("data-node-id") || "").trim();
    const targetId = String(actionTarget.getAttribute("data-target-id") || "").trim();
    if (action === "mind-link-add") {
      const started = beginMindNodeCanvasLinkBinding(nodeId);
      if (!started) {
        syncMindNodeLinkPanel();
        return;
      }
      clearMindNodeLinkPanelState();
      hideMindNodeLinkPanel();
      return;
    }
    if (action === "mind-link-open-menu") {
      activeMindNodeLinkMenuTargetId = activeMindNodeLinkMenuTargetId === targetId ? "" : targetId;
      syncMindNodeLinkPanel();
      return;
    }
    if (action === "mind-link-focus") {
      clearMindNodeLinkPanelState();
      hideMindNodeLinkPanel();
      scheduleFocusCanvasLinkTarget(targetId);
      return;
    }
    if (action === "mind-link-remove") {
      removeMindNodeCanvasLink(nodeId, targetId);
      activeMindNodeLinkMenuTargetId = "";
      const node = nodeId ? getMindNodeById(nodeId) : null;
      if (!node || !getMindNodeLinks(node).length) {
        clearMindNodeLinkPanelState();
        hideMindNodeLinkPanel();
        return;
      }
      syncMindNodeLinkPanel();
    }
  }

  function onMindNodeLinkPanelPointerMove(event) {
    cancelMindNodeLinkMenuCloseTimer();
    const actionTarget = event.target instanceof Element
      ? event.target.closest('[data-action="mind-link-open-menu"], [data-action="mind-link-focus"], [data-action="mind-link-remove"]')
      : null;
    if (!(actionTarget instanceof HTMLElement)) {
      return;
    }
    const menuAction = String(actionTarget?.getAttribute?.("data-action") || "").trim();
    const targetId =
      menuAction === "mind-link-focus" || menuAction === "mind-link-remove"
        ? String(actionTarget?.getAttribute?.("data-target-id") || "").trim()
        : String(actionTarget?.getAttribute?.("data-target-id") || "").trim();
    if (targetId === activeMindNodeLinkMenuTargetId) {
      return;
    }
    activeMindNodeLinkMenuTargetId = targetId;
    requestAnimationFrame(() => {
      if (targetId !== activeMindNodeLinkMenuTargetId) {
        return;
      }
      syncMindNodeLinkPanel();
    });
  }

  function onMindNodeLinkPanelPointerLeave() {
    scheduleMindNodeLinkMenuClose();
  }

  function onMindNodeChromePointerMove(event) {
    const actionTarget = event.target instanceof Element ? event.target.closest('[data-action="mind-manage-links"]') : null;
    const nodeId = String(refs.mindNodeChrome?.getAttribute?.("data-node-id") || "").trim();
    if (!(actionTarget instanceof HTMLElement) || !nodeId) {
      activeMindNodeLinkHoverId = "";
      hideLinkMetaTooltip();
      return;
    }
    const node = getMindNodeById(nodeId);
    if (!node || !getMindNodeLinks(node).length) {
      activeMindNodeLinkHoverId = "";
      hideLinkMetaTooltip();
      return;
    }
    activeMindNodeLinkHoverId = node.id;
    updateMindNodeLinkTooltip(node, Number(event.clientX || 0), Number(event.clientY || 0));
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
    if ((key === "enter" || key === "f2") && !tableCellEditState.active) {
      event.preventDefault();
      activateTableCellEditing(rowIndex, columnIndex, { placeAtEnd: true, reason: "keyboard" });
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "a") {
      if (tableCellEditState.active) {
        return;
      }
      event.preventDefault();
      const matrix = buildTableMatrixFromEditor();
      if (!matrix.length) {
        return;
      }
      setTableEditSelection(0, 0);
      tableEditRange = createTableSelectionRange(
        { rowIndex: 0, columnIndex: 0 },
        { rowIndex: Math.max(0, matrix.length - 1), columnIndex: Math.max(0, (matrix[0] || []).length - 1) }
      );
      syncTableEditorSelectionUI();
      return;
    }
    if (key === "tab") {
      event.preventDefault();
      deactivateTableCellEditing({ keepFocus: false });
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
      return;
    }
    if (event.shiftKey && ["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
      deactivateTableCellEditing({ keepFocus: false });
      const matrix = buildTableMatrixFromEditor();
      const rowCount = Math.max(1, matrix.length);
      const columnCount = Math.max(1, matrix[0]?.length || 1);
      const nextRow =
        key === "arrowup" ? Math.max(0, rowIndex - 1) : key === "arrowdown" ? Math.min(rowCount - 1, rowIndex + 1) : rowIndex;
      const nextColumn =
        key === "arrowleft"
          ? Math.max(0, columnIndex - 1)
          : key === "arrowright"
            ? Math.min(columnCount - 1, columnIndex + 1)
            : columnIndex;
      focusTableEditorCell(nextRow, nextColumn, { placeAtEnd: true, extend: true });
      return;
    }
    if (!tableCellEditState.active && ["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
      const matrix = buildTableMatrixFromEditor();
      const rowCount = Math.max(1, matrix.length);
      const columnCount = Math.max(1, matrix[0]?.length || 1);
      const nextRow =
        key === "arrowup" ? Math.max(0, rowIndex - 1) : key === "arrowdown" ? Math.min(rowCount - 1, rowIndex + 1) : rowIndex;
      const nextColumn =
        key === "arrowleft"
          ? Math.max(0, columnIndex - 1)
          : key === "arrowright"
            ? Math.min(columnCount - 1, columnIndex + 1)
            : columnIndex;
      focusTableEditorCell(nextRow, nextColumn, { placeAtEnd: false, extend: false });
    }
  }

  function onTableEditorCopy(event) {
    if (tableCellEditState.active && refs.tableCellRichEditor?.contains?.(event.target)) {
      return;
    }
    const selectionText = window.getSelection?.()?.toString?.() || "";
    if (!isTableSelectionMultiCell(buildTableMatrixFromEditor()) && selectionText.trim()) {
      return;
    }
    event.preventDefault();
    const text = serializeTableMatrixToTsv(getTableSelectionMatrix(buildTableMatrixFromEditor()));
    if (!text.trim()) {
      return;
    }
    event.clipboardData?.setData?.("text/plain", text);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setStatus("已复制表格选区");
  }

  function onTableEditorCut(event) {
    if (tableCellEditState.active && refs.tableCellRichEditor?.contains?.(event.target)) {
      return;
    }
    const selectionText = window.getSelection?.()?.toString?.() || "";
    if (!isTableSelectionMultiCell(buildTableMatrixFromEditor()) && selectionText.trim()) {
      return;
    }
    event.preventDefault();
    const text = serializeTableMatrixToTsv(getTableSelectionMatrix(buildTableMatrixFromEditor()));
    if (text.trim()) {
      event.clipboardData?.setData?.("text/plain", text);
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
    }
    mutateTableEditor((matrix) =>
      clearTableSelectionContent(matrix, { hasHeader: getTableEditItem()?.table?.hasHeader !== false })
    );
    setStatus("已剪切表格选区");
  }

  function onTableEditorPaste(event) {
    if (tableCellEditState.active && refs.tableCellRichEditor?.contains?.(event.target)) {
      return;
    }
    const clipboardText = event.clipboardData?.getData?.("text/plain") || "";
    const parsedMatrix = parseTableDelimitedText(clipboardText);
    const shouldIntercept = Boolean(isTableSelectionMultiCell(buildTableMatrixFromEditor()) || clipboardText.includes("\t") || clipboardText.includes("\n"));
    if (!shouldIntercept || !parsedMatrix.length) {
      return;
    }
    event.preventDefault();
    mutateTableEditor((matrix) =>
      applyTableClipboardMatrix(matrix, parsedMatrix, { hasHeader: getTableEditItem()?.table?.hasHeader !== false })
    );
    setStatus("已粘贴表格矩阵");
  }

  function onTableToolbarPointerDown(event) {
    event.stopPropagation();
    setTableInteractionPointerState("toolbar", true);
  }

  function onTableToolbarClick(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) {
      return;
    }
    event.preventDefault();
    if (target.getAttribute("data-action") === "table-more") {
      const rect = target.getBoundingClientRect();
      openTableEditorContextMenuAt(rect.left + rect.width / 2, rect.bottom + 6);
      return;
    }
    onContextMenuClick(event);
  }

  function onTableToolbarPointerEnter() {
    setTableInteractionPointerState("toolbar", true);
    syncTableEditorSelectionUI();
  }

  function onTableToolbarPointerLeave() {
    setTableInteractionPointerState("toolbar", false);
    syncTableEditorSelectionUI();
  }

  function onCodeBlockEditorPointerDown(event) {
    event.stopPropagation();
  }

  function onCodeBlockEditorKeyDown(event) {
    const key = String(event.key || "").toLowerCase();
    if (key === "escape") {
      event.preventDefault();
      cancelCodeBlockEdit();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "enter") {
      event.preventDefault();
      commitCodeBlockEdit();
    }
  }

  function onCodeBlockToolbarPointerDown(event) {
    event.stopPropagation();
  }

  function onCodeBlockToolbarClick(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) {
      return;
    }
    event.preventDefault();
    const action = String(target.getAttribute("data-action") || "").trim().toLowerCase();
    const item = getCodeBlockEditItem() || getSelectedCodeBlockItem();
    if (!item) {
      return;
    }
    if (action === "code-copy") {
      void copyCodeBlockContent(item);
      return;
    }
    if (action === "code-wrap") {
      const before = takeHistorySnapshot(state);
      Object.assign(item, updateCodeBlockElement(item, { wrap: item.wrap !== true }, { remeasure: true }));
      clearCodeBlockEditLayoutCache(item.id);
      markCodeBlockOverlayDirty(item.id);
      commitCodeBlockPatchHistory(before, item.id, item, "切换代码自动换行");
      return;
    }
    if (action === "code-line-numbers") {
      const before = takeHistorySnapshot(state);
      Object.assign(
        item,
        updateCodeBlockElement(item, { showLineNumbers: item.showLineNumbers === false }, { remeasure: true })
      );
      clearCodeBlockEditLayoutCache(item.id);
      markCodeBlockOverlayDirty(item.id);
      commitCodeBlockPatchHistory(before, item.id, item, "切换代码行号");
      return;
    }
    if (action === "code-preview-toggle") {
      const before = takeHistorySnapshot(state);
      Object.assign(
        item,
        updateCodeBlockElement(
          item,
          { previewMode: item.previewMode === "source" ? "preview" : "source" },
          { remeasure: true }
        )
      );
      clearCodeBlockEditLayoutCache(item.id);
      markCodeBlockOverlayDirty(item.id);
      commitCodeBlockPatchHistory(before, item.id, item, "切换代码预览");
      return;
    }
    if (action === "code-done") {
      if (state.editingType === "code-block") {
        commitCodeBlockEdit();
      }
    }
  }

  function onCodeBlockToolbarInput(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) {
      return;
    }
    const action = String(target.getAttribute("data-action") || "").trim().toLowerCase();
    const item = getCodeBlockEditItem() || getSelectedCodeBlockItem();
    if (!item) {
      return;
    }
    if (action === "code-language" && target instanceof HTMLSelectElement) {
      const before = takeHistorySnapshot(state);
      const language = normalizeCodeBlockLanguageTag(target.value || "");
      Object.assign(
        item,
        updateCodeBlockElement(
          item,
          {
            language,
            previewMode: language === "mermaid" ? item.previewMode || "preview" : "source",
            title: getCodeBlockItemTitle({ ...item, language }),
          },
          { remeasure: true }
        )
      );
      if (state.editingType === "code-block") {
        lastCodeBlockEditItemId = null;
        clearCodeBlockEditLayoutCache(item.id);
        syncCodeBlockEditorLayout("fast");
        scheduleCodeBlockEditorLayoutSync("precise");
      }
      markCodeBlockOverlayDirty(item.id);
      commitCodeBlockPatchHistory(before, item.id, item, "切换代码语言");
      return;
    }
    if (action === "code-font-size" && target instanceof HTMLSelectElement) {
      const before = takeHistorySnapshot(state);
      Object.assign(item, updateCodeBlockElement(item, { fontSize: Number(target.value) || 16 }, { remeasure: true }));
      clearCodeBlockEditLayoutCache(item.id);
      markCodeBlockOverlayDirty(item.id);
      commitCodeBlockPatchHistory(before, item.id, item, "调整代码字号");
    }
  }

  function onDragStart(event) {
    if (!isInteractiveMode() || !event.dataTransfer) {
      return;
    }
    if (suppressNativeDrag) {
      event.preventDefault();
      return;
    }
    const selected = sceneRegistry.getSelectedItems();
    const hoverItem = state.hoverId ? sceneRegistry.getItemById(state.hoverId) : null;
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
    drawToolModule.hidePreview();
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
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    if (droppedFiles.length) {
      const structuredFileHandled = await tryStructuredImportDescriptor(
        buildDragFileDescriptor(droppedFiles, scenePoint),
        scenePoint,
        {
          reason: "拖拽导入",
          statusText: `已导入 ${droppedFiles.length} 个文件`,
          context: {
            origin: "engine-drop-files",
          },
        }
      );
      if (structuredFileHandled) {
        return;
      }
    }
    const html = String(event.dataTransfer?.getData?.("text/html") || "");
    const text = String(event.dataTransfer?.getData?.("text/plain") || event.dataTransfer?.getData?.("text") || "");
    if (html.trim() && !(text && hasMarkdownMathSyntax(text) && !htmlContainsRenderableMath(html))) {
      const structuredHtmlHandled = await tryStructuredImportDescriptor(
        buildDragHtmlDescriptor(event.dataTransfer, scenePoint),
        scenePoint,
        {
          reason: "拖拽导入",
          statusText: "已导入网页富文本",
          context: {
            origin: "engine-drop-html",
          },
        }
      );
      if (structuredHtmlHandled) {
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
    await runClipboardOperationWithStatus("复制处理中…", async () => {
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
      return payload;
    });
  }

  async function onCut(event) {
    if (!isInteractiveMode() || !state.board.selectedIds.length) {
      return;
    }
    event.preventDefault();
    await cutSelection();
  }

  function createClipboardDataTransferSnapshot(dataTransfer) {
    const snapshot = {
      text: String(dataTransfer?.getData?.("text/plain") || dataTransfer?.getData?.("text") || ""),
      html: String(dataTransfer?.getData?.("text/html") || ""),
      uriList: String(dataTransfer?.getData?.("text/uri-list") || ""),
      types: Array.from(dataTransfer?.types || []).map((type) => String(type || "")).filter(Boolean),
      files: Array.from(dataTransfer?.files || []),
    };
    return snapshot;
  }

  function createClipboardDataTransferFacade(snapshot = {}) {
    const typeValueMap = new Map();
    const text = String(snapshot?.text || "");
    const html = String(snapshot?.html || "");
    const uriList = String(snapshot?.uriList || "");
    const types = Array.isArray(snapshot?.types) ? snapshot.types.slice() : [];
    if (text) {
      typeValueMap.set("text/plain", text);
      typeValueMap.set("text", text);
    }
    if (html) {
      typeValueMap.set("text/html", html);
    }
    if (uriList) {
      typeValueMap.set("text/uri-list", uriList);
    }
    return {
      files: Array.isArray(snapshot?.files) ? snapshot.files.slice() : [],
      types,
      getData(type) {
        return typeValueMap.get(String(type || "").trim()) || "";
      },
    };
  }

  function shouldPreferNonBlockingClipboardImport(snapshot = {}) {
    const fileCount = Array.isArray(snapshot?.files) ? snapshot.files.length : 0;
    if (fileCount > 0) {
      return true;
    }
    const textLength = String(snapshot?.text || "").length;
    const htmlLength = String(snapshot?.html || "").length;
    const uriLength = String(snapshot?.uriList || "").length;
    return (
      textLength >= PASTE_NON_BLOCKING_TEXT_THRESHOLD ||
      htmlLength >= PASTE_NON_BLOCKING_HTML_THRESHOLD ||
      uriLength >= PASTE_NON_BLOCKING_TEXT_THRESHOLD
    );
  }

  function shouldYieldDuringStructuredImportDescriptor(descriptor = {}) {
    const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
    if (entries.length >= PASTE_BATCH_YIELD_ITEM_THRESHOLD) {
      return true;
    }
    let aggregateTextLength = 0;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      aggregateTextLength += String(entry?.raw?.text || entry?.raw?.html || entry?.raw?.markdown || "").length;
      if (aggregateTextLength >= PASTE_NON_BLOCKING_HTML_THRESHOLD) {
        return true;
      }
    }
    return false;
  }

  async function onPaste(event) {
    if (!isInteractiveMode() || state.editingId) {
      return;
    }
    const markerMatched = matchesInternalClipboardByMarker(event.clipboardData);
    const clipboardSnapshot = markerMatched ? null : createClipboardDataTransferSnapshot(event.clipboardData);
    const clipboardFacade = clipboardSnapshot ? createClipboardDataTransferFacade(clipboardSnapshot) : null;
    const preferNonBlockingImport = shouldPreferNonBlockingClipboardImport(clipboardSnapshot || {});
    event.preventDefault();
    void runClipboardOperationWithStatus("粘贴处理中…", async () => {
      const anchor = state.lastPointerScenePoint || getCenterScenePoint();
      if (markerMatched || (await shouldUseInternalClipboard())) {
        await pasteInternalClipboardAsync(anchor);
        return true;
      }
      if (preferNonBlockingImport) {
        await yieldToNextFrame();
      }
      for (const handler of pasteHandlers) {
        const result = await handler?.({
          event,
          dataTransfer: clipboardFacade || event.clipboardData,
          clipboardSnapshot,
          anchor,
          state,
        });
        if (result?.handled) {
          if (Array.isArray(result.items) && result.items.length) {
            pushItems(result.items, { reason: "粘贴内容", statusText: `已粘贴 ${result.items.length} 个内容` });
            scheduleDeferredImportedAssetPersistence(result.items, {
              reason: "paste-handler-asset-persist",
            });
          }
          return true;
        }
      }
      const result = await dragBroker.importFromDataTransfer(clipboardFacade || event.clipboardData, anchor);
      if (result?.handled && result.items?.length) {
        pushItems(result.items, { reason: "粘贴内容", statusText: `已粘贴 ${result.items.length} 个内容` });
        scheduleDeferredImportedAssetPersistence(result.items, {
          reason: "paste-drag-broker-asset-persist",
        });
        return true;
      }
      const structuredDescriptor =
        !markerMatched && (clipboardFacade || event.clipboardData)
          ? structuredImportRuntime.pasteGateway.fromClipboardData(clipboardFacade || event.clipboardData, {
              origin: "engine-paste",
              anchor,
            })
          : null;
      if (structuredDescriptor) {
        if (preferNonBlockingImport) {
          await yieldToNextFrame();
        }
        const structuredHandled = await tryStructuredImportDescriptor(structuredDescriptor, anchor, {
          reason: "粘贴内容",
          statusText: "已通过新导入链路粘贴内容",
          context: {
            origin: "engine-paste",
          },
        });
        if (structuredHandled) {
          return true;
        }
      }
      const filePaths = await clipboardBroker.readSystemClipboardFiles();
      if (filePaths.length) {
        const items = await dragBroker.createFileCardsFromPaths(filePaths, anchor);
        pushItems(items, { reason: "粘贴文件", statusText: `已粘贴 ${items.length} 个文件` });
        scheduleDeferredImportedAssetPersistence(items, {
          reason: "paste-file-path-asset-persist",
        });
        return true;
      }

      const text = await clipboardBroker.readSystemClipboardText();
      if (text.trim()) {
        const deferSemanticUpgrade = shouldDeferSemanticUpgradeForText(text);
        await insertClipboardTextAt(anchor, text, {
          deferSemanticUpgrade,
          origin: "engine-paste-system-text-fallback",
          reason: "粘贴内容",
          statusText: deferSemanticUpgrade ? "已粘贴文本，后台结构化处理中" : "已粘贴内容",
        });
      }
      return true;
    });
  }

  async function pasteFromSystemClipboard(anchorPoint = getCenterScenePoint()) {
    return runClipboardOperationWithStatus("粘贴处理中…", async () => {
      if (await shouldUseInternalClipboard()) {
        return pasteInternalClipboardAsync(anchorPoint);
      }
      const textHint = await clipboardBroker.readSystemClipboardText();
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
        const pushed = pushItems(items, { reason: "粘贴文件", statusText: `已粘贴 ${items.length} 个文件` });
        scheduleDeferredImportedAssetPersistence(items, {
          reason: "context-menu-paste-file-asset-persist",
        });
        return pushed;
      }
      const text = textHint;
      if (text.trim()) {
        const deferSemanticUpgrade = shouldDeferSemanticUpgradeForText(text);
        return insertClipboardTextAt(anchorPoint, text, {
          deferSemanticUpgrade,
          origin: "engine-context-menu-paste-text-fallback",
          reason: "粘贴内容",
          statusText: deferSemanticUpgrade ? "已粘贴文本，后台结构化处理中" : "已粘贴内容",
        });
      }
      return false;
    });
  }

  function onWindowKeyDown(event) {
    if (!isInteractiveMode()) {
      return;
    }
    if (globalThis.__FREEFLOW_KEYBOARD_FOCUS_OWNER === "ai-mirror") {
      return;
    }
    const key = String(event.key || "").toLowerCase();
    if (key === "escape" && pendingRichExternalLinkEdit) {
      event.preventDefault();
      closeRichExternalLinkEditor({ restoreFocus: true });
      return;
    }
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
    if (
      !isSaveShortcut &&
      state.editingId &&
      (
        target === refs.richEditor ||
        target === refs.fileMemoEditor ||
        refs.tableEditor?.contains(target) ||
        refs.codeBlockEditor?.contains(target)
      )
    ) {
      return;
    }
    if (!isSaveShortcut && isEditableElement(target)) {
      return;
    }
    if (key === "escape" && captureMode === "canvas") {
      event.preventDefault();
      captureMode = null;
      state.captureModeActive = false;
      state.captureModeDragging = false;
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
        const hoverItem = getHoverItemFast("text");
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
      const hoverItem = getHoverItemFast();
      const anchor = hoverItem ? { x: hoverItem.x + hoverItem.width + 24, y: hoverItem.y + 24 } : (state.lastPointerScenePoint || getCenterScenePoint());
      void pasteFromSystemClipboard(anchor);
      return;
    }
    if (key === "enter" && state.board.selectedIds.length === 1 && !state.editingId && state.tool === "select") {
      const selected = getSingleSelectedItemFast();
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
      if (selected?.type === "mindNode") {
        event.preventDefault();
        beginMindNodeEdit(selected.id);
        return;
      }
      if (selected?.type === "table") {
        event.preventDefault();
        beginTableEdit(selected.id, tableEditSelection);
        return;
      }
      if (selected?.type === "codeBlock") {
        event.preventDefault();
        beginCodeBlockEdit(selected.id);
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && key === "l") {
      event.preventDefault();
      toggleLockOnSelection();
      return;
    }
    if (state.board.selectedIds.length === 1 && state.tool === "select") {
      const selected = getSingleSelectedItemFast();
      if (selected?.type === "mindNode") {
        if (key === "tab" && event.shiftKey) {
          event.preventDefault();
          promoteMindNode(selected.id);
          return;
        }
        if (key === "tab" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          demoteMindNode(selected.id);
          return;
        }
        if (key === "tab") {
          event.preventDefault();
          createMindChildNode(selected.id);
          return;
        }
        if (key === " " || key === "spacebar") {
          event.preventDefault();
          toggleMindNodeCollapsed(selected.id);
          return;
        }
        if (key === "enter" && event.shiftKey) {
          event.preventDefault();
          createMindSiblingNode(selected.id);
          return;
        }
      }
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
      const created = createMindNode(getCenterScenePoint());
      if (created) {
        const selected = getSingleSelectedItemFast();
        if (selected?.type === "mindNode") {
          beginMindNodeEdit(selected.id);
        }
      }
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
        const hoverItem = getHoverItemFast();
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
      if (resolvePendingCanvasLinkBindingMode()) {
        pendingCanvasLinkBinding = false;
        syncCanvasLinkBindingUi();
        setStatus("已取消画布链接绑定");
        return;
      }
      hideContextMenu();
      clearTransientState();
      cancelTextEdit();
      cancelFlowNodeEdit();
      cancelCodeBlockEdit();
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
    bind(refs.richEditor, "beforeinput", onRichEditorBeforeInput);
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
    bind(refs.tableEditor, "mousedown", onTableEditorMouseDown, true);
    bind(refs.tableEditor, "pointerenter", onTableEditorPointerEnter);
    bind(refs.tableEditor, "pointermove", onTableEditorPointerMove);
    bind(refs.tableEditor, "pointerup", onTableEditorPointerUp, true);
    bind(refs.tableEditor, "pointerleave", onTableEditorPointerLeave);
    bind(refs.tableEditor, "click", onTableEditorClick);
    bind(refs.tableEditor, "dblclick", onTableEditorDoubleClick);
    bind(refs.tableEditor, "contextmenu", onTableEditorContextMenu);
    bind(refs.tableEditor, "input", onTableEditorInput);
    bind(refs.tableEditor, "keydown", onTableEditorKeyDown);
    bind(refs.tableEditor, "copy", onTableEditorCopy);
    bind(refs.tableEditor, "cut", onTableEditorCut);
    bind(refs.tableEditor, "paste", onTableEditorPaste);
    bind(refs.tableEditor, "scroll", onTableEditorScroll);
    bind(refs.tableToolbar, "pointerdown", onTableToolbarPointerDown, true);
    bind(refs.tableToolbar, "pointerenter", onTableToolbarPointerEnter);
    bind(refs.tableToolbar, "pointerleave", onTableToolbarPointerLeave);
    bind(refs.tableToolbar, "click", onTableToolbarClick);
    bind(refs.mindNodeChrome, "pointerenter", onMindNodeChromePointerEnter);
    bind(refs.mindNodeChrome, "pointerleave", onMindNodeChromePointerLeave);
    bind(refs.mindNodeChrome, "pointermove", onMindNodeChromePointerMove);
    bind(refs.mindNodeChrome, "pointerdown", onMindNodeChromePointerDown, true);
    bind(refs.mindNodeLinkPanel, "pointerdown", onMindNodeLinkPanelPointerDown, true);
    bind(refs.mindNodeLinkPanel, "pointermove", onMindNodeLinkPanelPointerMove);
    bind(refs.mindNodeLinkPanel, "pointerleave", onMindNodeLinkPanelPointerLeave);
    bind(refs.mindNodeLinkPanel, "click", onMindNodeLinkPanelClick);
    bind(refs.codeBlockEditor, "pointerdown", onCodeBlockEditorPointerDown, true);
    bind(refs.codeBlockEditor, "keydown", onCodeBlockEditorKeyDown);
    bind(refs.codeBlockToolbar, "pointerdown", onCodeBlockToolbarPointerDown, true);
    bind(refs.codeBlockToolbar, "click", onCodeBlockToolbarClick);
    bind(refs.codeBlockToolbar, "input", onCodeBlockToolbarInput);
    bind(refs.codeBlockToolbar, "change", onCodeBlockToolbarInput);
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
    bind(refs.richExternalLinkPanel, "pointerdown", onRichExternalLinkPanelPointerDown, true);
    bind(refs.richExternalLinkPanel, "click", onRichExternalLinkPanelClick);
    bind(refs.richExternalLinkPanel, "input", onRichExternalLinkPanelInput);
    bind(refs.richExternalLinkPanel, "keydown", onRichExternalLinkPanelKeyDown);
    bind(refs.imageToolbar, "click", onImageToolbarClick);
    bind(refs.richDisplayHost, "pointermove", onRichDisplayPointerMove);
    bind(refs.richDisplayHost, "pointerleave", onRichDisplayPointerLeave);
    bind(refs.richDisplayHost, "pointerdown", onRichDisplayPointerDown, true);
    bind(refs.richDisplayHost, "pointerup", onRichDisplayPointerUp, true);
    bind(refs.richDisplayHost, "contextmenu", onRichDisplayContextMenu);
    bind(refs.richDisplayHost, "dblclick", onRichDisplayDoubleClick);
    bind(refs.richDisplayHost, "click", onRichDisplayClick);
    bind(refs.codeBlockDisplayHost, "pointermove", onCodeBlockDisplayPointerMove);
    bind(refs.codeBlockDisplayHost, "pointerleave", onCodeBlockDisplayPointerLeave);
    bind(refs.codeBlockDisplayHost, "pointerdown", onCodeBlockDisplayPointerDown, true);
    bind(refs.codeBlockDisplayHost, "pointerup", onCodeBlockDisplayPointerUp, true);
    bind(refs.codeBlockDisplayHost, "dblclick", onCodeBlockDisplayDoubleClick);
    bind(refs.codeBlockDisplayHost, "click", onCodeBlockDisplayClick);
    bind(refs.codeBlockDisplayHost, "contextmenu", onCodeBlockDisplayContextMenu);
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
    scheduleRender({ reason: "mount", sceneDirty: true, overlayDirty: true, fullOverlayRescan: true });
    void initBoardFileState();
    void resolveFileCardSources();
    window.dispatchEvent(new CustomEvent("canvas2d-engine-ready"));
    return api;
  }

  function unmount() {
    if (typeof cancelPendingHydrationSync === "function") {
      cancelPendingHydrationSync();
      cancelPendingHydrationSync = null;
    }
    pendingHydrationSyncItemIds.clear();
    pendingHydrationSyncSceneChange = false;
    pendingHydrationSyncReason = "";
    if (typeof cancelDeferredStoreEmit === "function") {
      cancelDeferredStoreEmit();
    }
    cancelDeferredStoreEmit = null;
    deferredStoreEmitHandle = 0;
    deferredStoreEmitPending = false;
    store.flushPersist?.();
    cleanupFns.splice(0).forEach((cleanup) => {
      try {
        cleanup();
      } catch {
        // Ignore teardown failures.
      }
    });
    if (deferredBlankEditExitFrame) {
      cancelAnimationFrame(deferredBlankEditExitFrame);
      deferredBlankEditExitFrame = 0;
    }
    deferredBlankEditExit = null;
    clearBlockedCanvasPointerDown();
    richTextSession.destroy();
    codeBlockEditor.clear();
    cancelTextEdit();
    cancelFlowNodeEdit();
    cancelCodeBlockEdit();
    cancelFileMemoEdit();
    cancelImageMemoEdit();
    finishImageEdit();
    clearAlignmentSnap("unmount");
    stopAutosaveTimer();
    renderScheduler?.dispose?.();
    renderScheduler = null;
    fileCardIdHydrationQueue.clear();
    fileCardSourceHydrationQueue.clear();
    urlMetaHydrationQueue.clear();
    store.dispose?.();
    mounted = false;
    refs.ctx = null;
    return api;
  }

  function undo() {
    const entry = undoHistory(state.history, takeHistorySnapshot(state));
    if (!entry) {
      return false;
    }
    if (entry.kind === "patch") {
      applyHistoryPatchEntry(entry.entry, "before");
    } else {
      applyHistorySnapshot(entry.snapshot);
    }
    setStatus("已撤销");
    return true;
  }

  function redo() {
    const entry = redoHistory(state.history, takeHistorySnapshot(state));
    if (!entry) {
      return false;
    }
    if (entry.kind === "patch") {
      applyHistoryPatchEntry(entry.entry, "after");
    } else {
      applyHistorySnapshot(entry.snapshot);
    }
    setStatus("已重做");
    return true;
  }

  function zoomIn() {
    state.board.view = zoomAtScenePoint(state.board.view, state.board.view.scale * 1.12, getCenterScenePoint());
    syncBoard({ persist: true, emit: true, sceneChange: false, viewChange: true, fullOverlayRescan: false, reason: "zoom-in" });
  }

  function zoomOut() {
    state.board.view = zoomAtScenePoint(state.board.view, state.board.view.scale / 1.12, getCenterScenePoint());
    syncBoard({ persist: true, emit: true, sceneChange: false, viewChange: true, fullOverlayRescan: false, reason: "zoom-out" });
  }

  function zoomToFit() {
    state.board.view = getZoomToFitView(state.board.items, getCanvasRect());
    syncBoard({ persist: true, emit: true, sceneChange: false, viewChange: true, fullOverlayRescan: false, reason: "zoom-to-fit" });
    setStatus("已回到内容");
  }

  function resetView() {
    state.board.view = createView(DEFAULT_VIEW);
    syncBoard({ persist: true, emit: true, sceneChange: false, viewChange: true, fullOverlayRescan: false, reason: "reset-view" });
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
      syncBoard({ persist: false, emit: true, sceneChange: false, viewChange: true, fullOverlayRescan: false, reason: "focus-animate" });
      if (progress < 1) {
        focusAnimationFrame = requestAnimationFrame(step);
      } else {
        focusAnimationFrame = null;
        syncBoard({ persist: true, emit: true, sceneChange: false, viewChange: true, fullOverlayRescan: false, reason: "focus-animate-end" });
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
      syncBoard({ persist: true, emit: true, sceneChange: false, viewChange: true, fullOverlayRescan: false, reason: "focus-on-bounds" });
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
    commitItemsPatchHistory(before, Array.from(selectedIds), "切换锁定", "item-lock-batch");
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
    commitItemsPatchHistory(before, state.board.selectedIds.slice(), "标记文件卡", "file-card-mark-batch");
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
    commitItemsPatchHistory(before, Array.from(selectedIds), "微移元素", "item-transform-batch");
    return true;
  }

  function alignSelection(direction = "left") {
    const selectedIds = state.board.selectedIds.slice();
    if (selectedIds.length < 2) {
      return false;
    }
    const selectedItems = sceneRegistry.getItemsByIds(selectedIds);
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
    commitItemsPatchHistory(before, selectedIds, "对齐元素", "item-transform-batch");
    setStatus("已对齐选中元素");
    return true;
  }

  function distributeSelection(axis = "horizontal") {
    const selectedIds = state.board.selectedIds.slice();
    if (selectedIds.length < 3) {
      return false;
    }
    const selectedItems = sceneRegistry.getItemsByIds(selectedIds);
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
    commitItemsPatchHistory(before, selectedIds, "均匀分布", "item-transform-batch");
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
    commitItemsPatchHistory(before, Array.from(selectedIds), "组合元素", "item-group-batch");
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
    commitItemsPatchHistory(before, Array.from(selectedIds), "取消组合", "item-group-batch");
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
    commitOrderPatchHistory(before, Array.from(selected), "置顶元素", "item-reorder");
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
    commitOrderPatchHistory(before, Array.from(selected), "置底元素", "item-reorder");
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
    commitOrderPatchHistory(before, Array.from(selected), direction === "down" ? "下移一层" : "上移一层", "item-reorder");
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
    commitItemsPatchHistory(before, Array.from(selectedIds), "反向箭头", "shape-edit-batch");
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
    commitItemsPatchHistory(before, Array.from(selectedIds), "切换虚线", "shape-style-batch");
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
    commitItemsPatchHistory(before, Array.from(selectedIds), "设置线条颜色", "shape-style-batch");
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
    commitItemsPatchHistory(before, Array.from(selectedIds), "设置边框颜色", "shape-style-batch");
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
    commitItemsPatchHistory(before, Array.from(selectedIds), "切换填充", "shape-style-batch");
    setStatus("已切换填充");
    return true;
  }

  function exportSelectedItems() {
    if (!state.board.selectedIds.length) {
      return false;
    }
    const selected = sceneRegistry.getSelectedItems();
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
    openFileCardPreview,
    confirmWordExportPreview,
    closeWordExportPreview: clearWordExportPreviewRequest,
    closeFileCardPreview: clearFileCardPreviewRequest,
    toggleFileCardPreviewExpanded,
    setFileCardPreviewZoom,
    addMindMapRoot() {
      const created = createMindNode(getCenterScenePoint());
      if (created) {
        const selected = getSingleSelectedItemFast();
        if (selected?.type === "mindNode") {
          beginMindNodeEdit(selected.id);
        }
      }
      return created;
    },
    addFlowNode() {
      return this.addMindMapRoot();
    },
    addMindChildNode(nodeId) {
      return createMindChildNode(nodeId);
    },
    addMindRelationship(sourceId, targetId) {
      return addMindRelationship(sourceId, targetId);
    },
    addMindSiblingNode(nodeId) {
      return createMindSiblingNode(nodeId);
    },
    addMindSummaryNode(nodeId, options) {
      return createMindSummaryNode(nodeId, options);
    },
    promoteMindNode(nodeId) {
      return promoteMindNode(nodeId);
    },
    demoteMindNode(nodeId) {
      return demoteMindNode(nodeId);
    },
    insertMindIntermediateNode(nodeId) {
      return insertMindIntermediateNode(nodeId);
    },
    setMindBranchSide(nodeId, side) {
      return setMindBranchSide(nodeId, side);
    },
    relayoutMindMapByNodeId(nodeId) {
      return relayoutMindMapByNodeId(nodeId);
    },
    toggleMindNodeCollapsed(nodeId) {
      return toggleMindNodeCollapsed(nodeId);
    },
    addTable,
    addCodeBlock,
    newBoard,
    openBoard,
    openBoardAtPath,
    repairBoardAtPath,
    ensureTutorialBoard,
    saveBoard,
    saveBoardAs,
    renameBoard: workspaceManager.renameBoard,
    renameBoardAtPath: workspaceManager.renameBoardAtPath,
    deleteBoardAtPath: workspaceManager.deleteBoardAtPath,
    revealBoardInFolder: workspaceManager.revealBoardInFolder,
    revealBoardPathInFolder: workspaceManager.revealBoardPathInFolder,
    openExternalUrl,
    pickCanvasBoardSavePath: workspaceManager.pickCanvasBoardSavePath,
    getCanvasBoardWorkspace: workspaceManager.getCanvasBoardWorkspace,
    pickCanvasWorkspaceFolder: workspaceManager.pickCanvasWorkspaceFolder,
    listCanvasBoards: workspaceManager.listCanvasBoards,
    createBoardInWorkspace: workspaceManager.createBoardInWorkspace,
    revealCanvasImageSavePath: workspaceManager.revealCanvasImageSavePath,
    pickCanvasImageSavePath: workspaceManager.pickCanvasImageSavePath,
    refreshCanvasImageManager,
    insertManagedCanvasImage,
    importCanvasImagesFromClipboard,
    captureCanvasImageToManager,
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
      return structuredExportRuntime.buildSnapshot(state.board, options);
    },
    getStructuredExportRuntime() {
      return structuredExportRuntime;
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
      const targets = Array.isArray(items) ? items : getSelectedItemsFast();
      return structuredImportRuntime.buildFlowbackPayload(targets);
    },
  };

  registerDragHandler(drawToolModule.handleDrop);

  return api;
}
