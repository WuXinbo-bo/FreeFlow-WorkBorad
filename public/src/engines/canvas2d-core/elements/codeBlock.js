import { buildTextTitle, createId, sanitizeText } from "../utils.js";
import {
  createCodeBlockLayoutCache,
  estimateCodeBlockSize,
  measureCodeBlockLayout,
  measureCodeBlockLayoutFast,
  resolveCodeBlockAutoHeight,
} from "../codeBlock/measureCodeBlockLayout.js";

export const CODE_BLOCK_MIN_WIDTH = 220;
export const CODE_BLOCK_MIN_HEIGHT = 84;
export const CODE_BLOCK_FONT_SIZE = 16;
export const CODE_BLOCK_DEFAULT_LANGUAGE = "";
export const CODE_BLOCK_DEFAULT_THEME = "default";
export const CODE_BLOCK_DEFAULT_TAB_SIZE = 2;
export const CODE_BLOCK_STRUCTURED_IMPORT_KIND = "structured-import-v1";

const CODE_BLOCK_PREVIEW_MODES = new Set(["preview", "source"]);

export function normalizeStructuredCodeBlockMeta(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    kind: CODE_BLOCK_STRUCTURED_IMPORT_KIND,
    sourceNodeType: String(value.sourceNodeType || "").trim() || "codeBlock",
    canonicalFragment: value.canonicalFragment && typeof value.canonicalFragment === "object"
      ? JSON.parse(JSON.stringify(value.canonicalFragment))
      : null,
    sourceMeta: value.sourceMeta && typeof value.sourceMeta === "object" ? { ...value.sourceMeta } : {},
  };
}

function normalizeCodeSourceMeta(value = {}) {
  if (!value || typeof value !== "object") {
    return {};
  }
  const normalized = {};
  if (value.descriptorId != null && String(value.descriptorId).trim()) {
    normalized.descriptorId = String(value.descriptorId).trim();
  }
  if (value.parserId != null && String(value.parserId).trim()) {
    normalized.parserId = String(value.parserId).trim();
  }
  if (value.entryId != null && String(value.entryId).trim()) {
    normalized.entryId = String(value.entryId).trim();
  }
  return normalized;
}

export function normalizeCodeTheme(value = "") {
  const theme = String(value || "").trim().toLowerCase();
  return theme || CODE_BLOCK_DEFAULT_THEME;
}

export function normalizeCodeBlockLanguage(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function resolveCodeBlockContent(element = {}) {
  return sanitizeText(
    element.code ??
    element.text ??
    element.plainText ??
    ""
  );
}

export function isMermaidCodeBlock(element = {}) {
  return normalizeCodeBlockLanguage(element.language) === "mermaid";
}

export function createCodeBlockElement(point, text = "", language = "", options = {}) {
  const code = sanitizeText(text || "");
  const fontSize = Math.max(12, Number(options.fontSize ?? CODE_BLOCK_FONT_SIZE) || CODE_BLOCK_FONT_SIZE);
  const wrap = options.wrap === true;
  const showLineNumbers = options.showLineNumbers !== false;
  const headerVisible = options.headerVisible !== false;
  const collapsed = options.collapsed === true;
  const autoHeight = options.autoHeight !== false;
  const tabSize = Math.max(2, Math.min(8, Number(options.tabSize ?? CODE_BLOCK_DEFAULT_TAB_SIZE) || CODE_BLOCK_DEFAULT_TAB_SIZE));
  const previewMode = normalizeCodeBlockPreviewMode(options.previewMode);
  const size = estimateCodeBlockSize(code, fontSize, {
    wrap,
    showLineNumbers,
    headerVisible,
    collapsed,
    autoHeight,
    tabSize,
    widthHint: Number(options.width) || 0,
    language,
  });
  const initialLayout = measureCodeBlockLayoutFast(
    {
      code,
      text: code,
      plainText: code,
      fontSize,
      width: size.width,
      wrap,
      showLineNumbers,
      headerVisible,
      collapsed,
      autoHeight,
      tabSize,
      language,
      previewMode,
    },
    { widthHint: size.width }
  );
  return {
    id: createId("code"),
    type: "codeBlock",
    title: buildTextTitle(normalizeCodeBlockLanguage(language) ? `${normalizeCodeBlockLanguage(language)} 代码块` : "代码块"),
    language: normalizeCodeBlockLanguage(language),
    code,
    text: code,
    plainText: code,
    fontSize,
    width: size.width,
    height: size.height,
    wrap,
    showLineNumbers,
    headerVisible,
    collapsed,
    autoHeight,
    tabSize,
    updatedAt: Number(options.updatedAt) || Date.now(),
    theme: normalizeCodeTheme(options.theme || CODE_BLOCK_DEFAULT_THEME),
    previewMode,
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    locked: false,
    createdAt: Date.now(),
    structuredImport: null,
    sourceMeta: {},
    layoutCache: createCodeBlockLayoutCache(initialLayout),
  };
}

export function normalizeCodeBlockPreviewMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return CODE_BLOCK_PREVIEW_MODES.has(normalized) ? normalized : "preview";
}

export function normalizeCodeBlockElement(element = {}) {
  const content = resolveCodeBlockContent(element);
  const fontSize = Math.max(12, Number(element.fontSize ?? CODE_BLOCK_FONT_SIZE) || CODE_BLOCK_FONT_SIZE);
  const base = createCodeBlockElement(
    { x: Number(element.x) || 0, y: Number(element.y) || 0 },
    content,
    element.language || CODE_BLOCK_DEFAULT_LANGUAGE,
    {
      fontSize,
      width: element.width,
      wrap: element.wrap,
      showLineNumbers: element.showLineNumbers,
      headerVisible: element.headerVisible,
      collapsed: element.collapsed,
      autoHeight: element.autoHeight,
      tabSize: element.tabSize,
      theme: element.theme,
      previewMode: element.previewMode,
      updatedAt: element.updatedAt,
    }
  );
  const structuredImport = normalizeStructuredCodeBlockMeta(element.structuredImport);
  const sourceMeta = normalizeCodeSourceMeta(element.sourceMeta);
  const mergedSourceMeta = {
    ...normalizeCodeSourceMeta(structuredImport?.sourceMeta),
    ...sourceMeta,
  };
  const resolvedStructuredImport = structuredImport
    ? {
      ...structuredImport,
      sourceMeta: mergedSourceMeta,
    }
    : null;
  const normalized = {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "codeBlock",
    title: String(element.title || base.title),
    language: normalizeCodeBlockLanguage(element.language || base.language),
    code: content,
    text: content,
    plainText: content,
    fontSize,
    width: Math.max(CODE_BLOCK_MIN_WIDTH, Number(element.width ?? base.width) || base.width),
    height: Math.max(CODE_BLOCK_MIN_HEIGHT, Number(element.height ?? base.height) || base.height),
    wrap: element.wrap === true,
    showLineNumbers: element.showLineNumbers !== false,
    headerVisible: element.headerVisible !== false,
    collapsed: element.collapsed === true,
    autoHeight: element.autoHeight !== false,
    tabSize: Math.max(2, Math.min(8, Number(element.tabSize ?? base.tabSize) || base.tabSize)),
    updatedAt: Number(element.updatedAt) || Number(element.createdAt) || base.updatedAt,
    theme: normalizeCodeTheme(element.theme || base.theme),
    previewMode: normalizeCodeBlockPreviewMode(element.previewMode || base.previewMode),
    x: Number(element.x ?? base.x) || 0,
    y: Number(element.y ?? base.y) || 0,
    locked: Boolean(element.locked ?? base.locked),
    createdAt: Number(element.createdAt) || base.createdAt,
    sourceMeta: mergedSourceMeta,
    structuredImport: resolvedStructuredImport,
    layoutCache: resolveCodeBlockLayoutCache(element.layoutCache),
  };
  if (normalized.autoHeight) {
    const layout = measureCodeBlockLayout(normalized, { widthHint: normalized.width });
    normalized.width = Math.max(CODE_BLOCK_MIN_WIDTH, Number(layout.estimatedWidth || normalized.width) || normalized.width);
    normalized.height = Math.max(CODE_BLOCK_MIN_HEIGHT, Number(layout.height || normalized.height) || normalized.height);
    normalized.layoutCache = createCodeBlockLayoutCache(layout);
  } else {
    normalized.layoutCache = resolveCodeBlockLayoutCache(
      normalized.layoutCache,
      measureCodeBlockLayoutFast(normalized, { widthHint: normalized.width })
    );
  }
  return normalized;
}

function resolveCodeBlockLayoutCache(value = null, fallbackLayout = null) {
  if (value && typeof value === "object") {
    const rawLineCount = Math.max(1, Number(value.rawLineCount) || 0);
    const longestLineChars = Math.max(12, Number(value.longestLineChars) || 0);
    const visualLineCount = Math.max(1, Number(value.visualLineCount) || 0);
    if (rawLineCount > 0 && visualLineCount > 0) {
      return { rawLineCount, longestLineChars, visualLineCount };
    }
  }
  return createCodeBlockLayoutCache(fallbackLayout || measureCodeBlockLayoutFast({}));
}

export function createCodeBlockElementFromLegacyText(point, text = "", language = "", options = {}) {
  return normalizeCodeBlockElement(createCodeBlockElement(point, text, language, options));
}

export function updateCodeBlockElement(element = {}, patch = {}, options = {}) {
  const next = normalizeCodeBlockElement({
    ...element,
    ...patch,
    updatedAt: Number(options.updatedAt) || Date.now(),
  });
  if (next.autoHeight && options.remeasure !== false) {
    const layout = measureCodeBlockLayout(next, {
      widthHint: Number(next.width || 0),
      forceAutoHeight: true,
    });
    const widthExplicit = Object.prototype.hasOwnProperty.call(patch || {}, "width");
    const targetWidth = widthExplicit ? Number(layout.width || next.width) || next.width : layout.estimatedWidth;
    next.width = Math.max(CODE_BLOCK_MIN_WIDTH, Number(targetWidth || next.width) || next.width);
    next.height = Math.max(CODE_BLOCK_MIN_HEIGHT, Number(layout.height || next.height) || next.height);
    next.layoutCache = createCodeBlockLayoutCache(layout);
  } else if (!next.layoutCache) {
    next.layoutCache = resolveCodeBlockLayoutCache(
      next.layoutCache,
      measureCodeBlockLayoutFast(next, { widthHint: next.width })
    );
  }
  return next;
}
