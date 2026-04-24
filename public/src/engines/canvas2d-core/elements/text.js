import {
  buildTextTitle,
  clamp,
  createId,
  htmlToPlainText,
  normalizeRichHtmlInlineFontSizes,
  sanitizeText,
} from "../utils.js";
import { TEXT_LINE_HEIGHT_RATIO } from "../rendererText.js";
import { measureTextElementLayout } from "../textLayout/measureTextElementLayout.js";
import {
  coerceInteractiveTextBoxLayoutMode as coerceInteractiveTextBoxLayoutModeModel,
  LEGACY_TEXT_RESIZE_MODE_AUTO_WIDTH,
  LEGACY_TEXT_RESIZE_MODE_WRAP,
  normalizeLegacyTextResizeMode,
  normalizeTextBoxLayoutMode as normalizeTextBoxLayoutModeModel,
  normalizeTextBoxLayoutModel,
  TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT as COMPAT_TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
  TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH as COMPAT_TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH,
  TEXT_BOX_LAYOUT_MODE_FIXED_SIZE as COMPAT_TEXT_BOX_LAYOUT_MODE_FIXED_SIZE,
  toLegacyTextResizeMode,
} from "../textModel/textBoxLayoutModel.js";
import {
  mergeTextLinkSemantics,
  normalizeTextContentModel,
  normalizeLinkTokens,
  normalizeUrlMetaCache,
} from "../textModel/textContentModel.js";

export const TEXT_WRAP_MODE_MANUAL = "manual";
export const TEXT_RESIZE_MODE_AUTO_WIDTH = LEGACY_TEXT_RESIZE_MODE_AUTO_WIDTH;
export const TEXT_RESIZE_MODE_WRAP = LEGACY_TEXT_RESIZE_MODE_WRAP;
export const TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH = COMPAT_TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH;
export const TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT = COMPAT_TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT;
export const TEXT_BOX_LAYOUT_MODE_FIXED_SIZE = COMPAT_TEXT_BOX_LAYOUT_MODE_FIXED_SIZE;
export const TEXT_MIN_FONT_SIZE = 12;
export const TEXT_STRUCTURED_IMPORT_KIND = "structured-import-v1";

export function normalizeStructuredTextImportMeta(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const canonicalFragment = value.canonicalFragment && typeof value.canonicalFragment === "object"
    ? JSON.parse(JSON.stringify(value.canonicalFragment))
    : null;
  const sourceMeta = value.sourceMeta && typeof value.sourceMeta === "object"
    ? { ...value.sourceMeta }
    : {};
  const meta = {
    kind: TEXT_STRUCTURED_IMPORT_KIND,
    blockRole: String(value.blockRole || "").trim() || "paragraph",
    sourceNodeType: String(value.sourceNodeType || "").trim() || "paragraph",
    listRole: String(value.listRole || "").trim() || "",
    canonicalFragment,
    sourceMeta,
  };
  return meta;
}

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
  return normalizeLegacyTextResizeMode(value, legacyWrapMode);
}

export function normalizeTextBoxLayoutMode(value = "", legacyResizeMode = "", legacyWrapMode = "") {
  return normalizeTextBoxLayoutModeModel(value, legacyResizeMode, legacyWrapMode);
}

export function deriveTextResizeModeFromLayoutMode(layoutMode = "") {
  return toLegacyTextResizeMode(layoutMode);
}

export function coerceInteractiveTextBoxLayoutMode(layoutMode = "") {
  return coerceInteractiveTextBoxLayoutModeModel(layoutMode);
}

function inferLegacyTextResizeMode(element = {}, text = "", fontSize = 20) {
  if (Object.prototype.hasOwnProperty.call(element, "textBoxLayoutMode")) {
    return toLegacyTextResizeMode(element.textBoxLayoutMode, element.textResizeMode, element.wrapMode);
  }
  if (Object.prototype.hasOwnProperty.call(element, "textResizeMode")) {
    return normalizeLegacyTextResizeMode(element.textResizeMode, element.wrapMode);
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
  const content = normalizeTextContentModel(element, {
    html: element.html || "",
    plainText: element.plainText || element.text || "",
    fontSize: element.fontSize ?? options.fontSize ?? 20,
  });
  const fontSize = normalizeTextFontSize(element.fontSize ?? options.fontSize ?? 20, options.fontSize ?? 20);
  const resizeMode = normalizeTextResizeMode(element.textResizeMode, element.wrapMode);
  const layout = normalizeTextBoxLayoutModel(
    {
      ...element,
      textBoxLayoutMode: coerceInteractiveTextBoxLayoutMode(
        normalizeTextBoxLayoutMode(element.textBoxLayoutMode, resizeMode, element.wrapMode)
      ),
      textResizeMode: resizeMode,
      widthHint: options.widthHint ?? element.width ?? 80,
      heightHint: options.heightHint ?? element.height ?? 40,
      minWidth: 80,
      minHeight: 40,
      maxWidth: 720,
    },
    {
      fontSize,
      minWidth: 80,
      minHeight: 40,
      maxWidth: 720,
    }
  );
  const measured = measureTextElementLayout({
    ...content,
    fontSize,
    textBoxLayoutMode: layout.layoutMode,
    layoutMode: layout.layoutMode,
    resizeMode: layout.legacyResizeMode,
    widthHint: layout.widthHint,
    heightHint: layout.heightHint,
    minWidth: layout.minWidth,
    minHeight: layout.minHeight,
    maxWidth: layout.maxWidth,
    lineHeightRatio: TEXT_LINE_HEIGHT_RATIO,
    fontWeight: "500",
    boldWeight: "700",
  });
  if (measured?.frameWidth && measured?.frameHeight) {
    const contentHeight = Math.max(40, Number(measured?.contentHeight || measured?.frameHeight || 0) || 40);
    return {
      width:
        layout.layoutMode === TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH
          ? measured.frameWidth
          : Math.max(80, layout.widthHint),
      height:
        layout.layoutMode === TEXT_BOX_LAYOUT_MODE_FIXED_SIZE
          ? Math.max(40, layout.heightHint, contentHeight)
          : measured.frameHeight,
    };
  }

  return {
    width:
      layout.layoutMode !== TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH
        ? layout.widthHint
        : measureTextBox(content.plainText, {
            minWidth: 80,
            maxWidth: 720,
            fontSize,
          }).width,
    height:
      layout.layoutMode === TEXT_BOX_LAYOUT_MODE_FIXED_SIZE
        ? Math.max(40, layout.heightHint, measureTextBox(content.plainText, { minWidth: 80, maxWidth: layout.widthHint, fontSize }).height)
        : Math.max(40, measureTextBox(content.plainText, { minWidth: 80, maxWidth: layout.widthHint, fontSize }).height),
  };
}

export function createTextElement(point, text = "", html = "") {
  const content = normalizeTextContentModel(
    {
      html: normalizeRichHtmlInlineFontSizes(html || ""),
      plainText: text || "",
      text: text || "",
      fontSize: 20,
    },
    { fontSize: 20 }
  );
  const cleanHtml = content.html;
  const cleanText = content.plainText;
  const linkSemantics = mergeTextLinkSemantics(
    {
      plainText: cleanText,
      text: cleanText,
      linkTokens: content.linkTokens,
      urlMetaCache: content.urlMetaCache,
      richTextDocument: content.richTextDocument,
    },
    {}
  );
  const richTextDocument =
    content.richTextDocument && typeof content.richTextDocument === "object"
      ? {
          ...content.richTextDocument,
          meta: {
            ...(content.richTextDocument.meta && typeof content.richTextDocument.meta === "object"
              ? content.richTextDocument.meta
              : {}),
            linkTokens: linkSemantics.linkTokens,
            urlMetaCache: linkSemantics.urlMetaCache,
          },
        }
      : content.richTextDocument;
  const metrics = getTextMinSize(
    {
      html: cleanHtml,
      plainText: cleanText,
      text: cleanText,
      richTextDocument,
      fontSize: 20,
      textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH,
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
    richTextDocument,
    linkTokens: normalizeLinkTokens(linkSemantics.linkTokens, cleanText),
    urlMetaCache: normalizeUrlMetaCache(linkSemantics.urlMetaCache),
    wrapMode: TEXT_WRAP_MODE_MANUAL,
    textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH,
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
    structuredImport: null,
  };
}

export function normalizeTextElement(element = {}) {
  const base = createTextElement(
    { x: Number(element.x) || 0, y: Number(element.y) || 0 },
    element.text || element.plainText || "",
    element.html || ""
  );
  const content = normalizeTextContentModel(
    {
      ...element,
      html: normalizeRichHtmlInlineFontSizes(element.html || base.html || ""),
      plainText: element.plainText || element.text || "",
      text: element.text || element.plainText || "",
    },
    {
      html: base.html || "",
      plainText: base.plainText || base.text || "",
      fontSize: element.fontSize ?? base.fontSize,
    }
  );
  const nextText = content.plainText;
  const linkSemantics = mergeTextLinkSemantics(
    {
      ...element,
      plainText: nextText,
      text: nextText,
      linkTokens: element.linkTokens ?? content.linkTokens,
      urlMetaCache: element.urlMetaCache ?? content.urlMetaCache,
      richTextDocument: content.richTextDocument,
    },
    {
      ...base,
      linkTokens: base.linkTokens,
      urlMetaCache: base.urlMetaCache,
      richTextDocument: base.richTextDocument,
    }
  );
  const normalizedLinkTokens = normalizeLinkTokens(linkSemantics.linkTokens, nextText);
  const normalizedUrlMetaCache = normalizeUrlMetaCache(linkSemantics.urlMetaCache);
  const richTextDocument =
    content.richTextDocument && typeof content.richTextDocument === "object"
      ? {
          ...content.richTextDocument,
          meta: {
            ...(content.richTextDocument.meta && typeof content.richTextDocument.meta === "object"
              ? content.richTextDocument.meta
              : {}),
            linkTokens: normalizedLinkTokens,
            urlMetaCache: normalizedUrlMetaCache,
          },
        }
      : content.richTextDocument;
  const nextFontSize = normalizeTextFontSize(element.fontSize ?? base.fontSize, base.fontSize);
  const inferredResizeMode = inferLegacyTextResizeMode(element, nextText, nextFontSize);
  const hasExplicitLayoutConfig =
    Object.prototype.hasOwnProperty.call(element, "textBoxLayoutMode") ||
    Object.prototype.hasOwnProperty.call(element, "textResizeMode");
  const textResizeMode = hasExplicitLayoutConfig
    ? toLegacyTextResizeMode(element.textBoxLayoutMode, element.textResizeMode, element.wrapMode)
    : inferredResizeMode;
  const textBoxLayoutMode = coerceInteractiveTextBoxLayoutMode(
    normalizeTextBoxLayoutMode(element.textBoxLayoutMode, textResizeMode, element.wrapMode)
  );
  const metrics = getTextMinSize(
    {
      ...element,
      html: content.html,
      plainText: nextText,
      text: nextText,
      richTextDocument,
      fontSize: nextFontSize,
      textBoxLayoutMode,
      textResizeMode,
    },
    {
      widthHint: Number(element.width ?? 0) || undefined,
      heightHint: Number(element.height ?? 0) || undefined,
      fontSize: nextFontSize,
    }
  );
  const nextWidth =
    textBoxLayoutMode !== TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH
      ? Math.max(80, Number(element.width ?? 0) || metrics.width)
      : Math.max(80, metrics.width);
  const nextHeight =
    textBoxLayoutMode === TEXT_BOX_LAYOUT_MODE_FIXED_SIZE
      ? Math.max(40, Number(element.height ?? 0) || metrics.height)
      : Math.max(40, metrics.height);
  const structuredImport = normalizeStructuredTextImportMeta(element.structuredImport);
  return {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "text",
    text: nextText,
    html: content.html,
    plainText: sanitizeText(element.plainText || nextText || htmlToPlainText(element.html || base.html || "")),
    richTextDocument,
    linkTokens: normalizedLinkTokens,
    urlMetaCache: normalizedUrlMetaCache,
    wrapMode: normalizeTextWrapMode(element.wrapMode || base.wrapMode),
    textBoxLayoutMode,
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
    structuredImport,
  };
}
