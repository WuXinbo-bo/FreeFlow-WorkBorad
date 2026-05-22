import {
  coerceInteractiveTextBoxLayoutMode,
  deriveTextResizeModeFromLayoutMode,
  getTextMinSize,
  normalizeTextBoxLayoutMode,
  normalizeTextResizeMode,
  TEXT_RESIZE_MODE_WRAP,
} from "../elements/text.js";
import { normalizeFlowNodeElement } from "../elements/flow.js";
import { normalizeFileCardElement } from "../elements/fileCard.js";
import { normalizeImageElement } from "../elements/media.js";
import { normalizeMathElement } from "../elements/math.js";
import { normalizeTableElement } from "../elements/table.js";
import { htmlToPlainText, normalizeRichHtml, sanitizeText } from "../utils.js";
import { downgradeExternalHtmlToCanvasTextSemantics } from "../utils.js";
import { ensureRichTextDocumentFields } from "../textModel/richTextDocument.js";

function buildExportReadyTextItem(item, { safeExport = false } = {}) {
  if (!item || item.type !== "text") {
    return item;
  }
  const content = ensureRichTextDocumentFields(item, {
    html: item.html || "",
    plainText: item.plainText || item.text || "",
    fontSize: item.fontSize,
  });
  const html = normalizeRichHtml(content.html || "");
  const plainText = sanitizeText(content.plainText || item.text || htmlToPlainText(html));
  const textBoxLayoutMode = coerceInteractiveTextBoxLayoutMode(
    normalizeTextBoxLayoutMode(item.textBoxLayoutMode, item.textResizeMode, item.wrapMode)
  );
  const resizeMode = normalizeTextResizeMode(
    item.textResizeMode || deriveTextResizeModeFromLayoutMode(textBoxLayoutMode),
    item.wrapMode
  );
  const nextSize = getTextMinSize(
    {
      ...item,
      html,
      plainText,
      text: plainText,
      richTextDocument: content.richTextDocument,
      textBoxLayoutMode,
      textResizeMode: resizeMode,
    },
    {
      widthHint: resizeMode === TEXT_RESIZE_MODE_WRAP ? Number(item.width || 0) || undefined : undefined,
      heightHint: Number(item.height || 0) || undefined,
      fontSize: item.fontSize,
    }
  );
  const nextWidth =
    textBoxLayoutMode !== "auto-width"
      ? Math.max(80, Number(item.width || 0) || nextSize.width)
      : Math.max(80, Number(nextSize?.width || 0) || 80);
  const nextHeight =
    textBoxLayoutMode === "fixed-size"
      ? Math.max(40, Number(item.height || 0) || nextSize.height)
      : Math.max(40, Number(nextSize?.height || 0) || 40);
  const safeHtml = safeExport ? downgradeExternalHtmlToCanvasTextSemantics(html, item.fontSize) : html;
  const safePlainText = safeExport ? sanitizeText(htmlToPlainText(safeHtml) || plainText) : plainText;
  const safeContent =
    safeExport && safeHtml !== html
      ? ensureRichTextDocumentFields(
          {
            ...item,
            html: safeHtml,
            plainText: safePlainText,
            text: safePlainText,
            fontSize: item.fontSize,
          },
          {
            html: safeHtml,
            plainText: safePlainText,
            fontSize: item.fontSize,
          }
        )
      : content;
  if (
    item.html === safeHtml &&
    item.plainText === safePlainText &&
    item.text === safePlainText &&
    item.richTextDocument === safeContent.richTextDocument &&
    item.textBoxLayoutMode === textBoxLayoutMode &&
    item.textResizeMode === resizeMode &&
    Number(item.width || 0) === nextWidth &&
    Number(item.height || 0) === nextHeight
  ) {
    return item;
  }
  return {
    ...item,
    html: safeHtml,
    plainText: safePlainText,
    text: safePlainText,
    richTextDocument: safeContent.richTextDocument,
    textBoxLayoutMode,
    textResizeMode: resizeMode,
    width: nextWidth,
    height: nextHeight,
  };
}

function buildExportReadyFlowNodeItem(item, { safeExport = false } = {}) {
  if (!item || item.type !== "flowNode") {
    return item;
  }
  const normalized = normalizeFlowNodeElement(item);
  if (!safeExport) {
    return normalized;
  }
  const safeHtml = downgradeExternalHtmlToCanvasTextSemantics(normalized.html || "", normalized.fontSize);
  const safePlainText = sanitizeText(htmlToPlainText(safeHtml) || normalized.plainText || normalized.text || "");
  return {
    ...normalized,
    html: safeHtml,
    plainText: safePlainText,
    text: safePlainText,
  };
}

function buildExportReadyFileCardItem(item, { safeExport = false } = {}) {
  if (!item || item.type !== "fileCard") {
    return item;
  }
  const normalized = normalizeFileCardElement(item);
  if (!safeExport) {
    return normalized;
  }
  return {
    ...normalized,
    memo: sanitizeText(String(normalized.memo || "")),
    memoVisible: Boolean(normalized.memoVisible),
    previewHtml: "",
    previewDataUrl: "",
  };
}

function buildExportReadyImageItem(item, { safeExport = false } = {}) {
  if (!item || item.type !== "image") {
    return item;
  }
  const normalized = normalizeImageElement(item);
  if (!safeExport) {
    return normalized;
  }
  const dataUrl = String(normalized.dataUrl || "").trim();
  const sourcePath = String(normalized.sourcePath || "").trim();
  const source = String(normalized.source || "").trim().toLowerCase();
  const mime = String(normalized.mime || normalized?.structuredImport?.canonicalFragment?.attrs?.type || "").trim().toLowerCase();
  const isSvg =
    mime.includes("svg") ||
    /^data:image\/svg\+xml/i.test(dataUrl) ||
    /\.svg(?:$|[?#])/i.test(sourcePath) ||
    source === "svg";
  const isSafeRasterDataUrl =
    /^data:image\/(png|jpe?g|webp|gif|bmp|x-icon|vnd\.microsoft\.icon);base64,/i.test(dataUrl);
  if (isSvg || (!isSafeRasterDataUrl && !sourcePath)) {
    return {
      ...normalized,
      ...buildExportFallbackItem(normalized, isSvg ? "unsupported-svg" : "missing-source"),
    };
  }
  if (isSafeRasterDataUrl) {
    return {
      ...normalized,
      dataUrl,
      source: "blob",
    };
  }
  return {
    ...normalized,
    ...buildExportFallbackItem(normalized, "unsafe-image-source"),
  };
}

function buildExportReadyTableItem(item, { safeExport = false } = {}) {
  if (!item || item.type !== "table") {
    return item;
  }
  const normalized = normalizeTableElement(item);
  if (!safeExport) {
    return normalized;
  }
  return normalized;
}

function buildExportReadyMathItem(item, { safeExport = false } = {}) {
  if (!item || (item.type !== "mathBlock" && item.type !== "mathInline")) {
    return item;
  }
  const normalized = normalizeMathElement(item);
  if (!safeExport) {
    return normalized;
  }
  return {
    ...normalized,
    renderState: "fallback",
    fallbackText: String(normalized.fallbackText || normalized.formula || "").trim() || "[公式]",
    formula: String(normalized.formula || "").trim(),
    mathOverlayReady: false,
  };
}

function buildExportFallbackItem(item, reason = "unsupported") {
  const label = String(item?.title || item?.name || item?.fileName || item?.type || "元素").trim() || "元素";
  const plainText = `[${String(item?.type || "元素")}] ${label}`;
  return {
    ...item,
    type: "text",
    html: `<p>${plainText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
    plainText,
    text: plainText,
    exportFallbackPlaceholder: true,
    exportFallbackReason: String(reason || "unsupported"),
  };
}

function buildExportReadyItem(item, options = {}) {
  const type = String(item?.type || "").trim().toLowerCase();
  if (type === "text") {
    return buildExportReadyTextItem(item, options);
  }
  if (type === "flownode") {
    return buildExportReadyFlowNodeItem(item, options);
  }
  if (type === "filecard") {
    return buildExportReadyFileCardItem(item, options);
  }
  if (type === "image") {
    return buildExportReadyImageItem(item, options);
  }
  if (type === "table") {
    return buildExportReadyTableItem(item, options);
  }
  if (type === "mathblock" || type === "mathinline") {
    return buildExportReadyMathItem(item, options);
  }
  if (type === "codeblock") {
    if (!options.safeExport) {
      return item;
    }
    const normalizedCode = String(item?.code ?? item?.text ?? item?.plainText ?? "");
    return {
      ...item,
      code: normalizedCode,
      text: normalizedCode,
      plainText: normalizedCode,
      previewMode: "source",
    };
  }
  if (type === "mindnode" || type === "mindsummary" || type === "mindrelationship" || type === "flowedge" || type === "shape") {
    return item;
  }
  if (options.safeExport) {
    return buildExportFallbackItem(item, "unsupported");
  }
  return item;
}

export function buildExportReadyBoardItems(items = [], options = {}) {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }
  let changed = false;
  const nextItems = items.map((item) => {
    const nextItem = buildExportReadyItem(item, options);
    if (nextItem !== item) {
      changed = true;
    }
    return nextItem;
  });
  return changed ? nextItems : items;
}
