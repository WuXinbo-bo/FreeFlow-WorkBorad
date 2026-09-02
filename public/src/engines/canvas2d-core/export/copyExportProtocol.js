import { getCodeBlockLanguageFileExtension } from "../codeBlock/languageRegistry.js";
import { canvasElementRegistry } from "../elements/index.js";
import { getStructuredMathTextState, isStructuredMathTextElement } from "../elements/mathText.js";

function getMathSourceFormat(item = null) {
  if (!item || typeof item !== "object") {
    return "";
  }
  const mathState = getStructuredMathTextState(item);
  return String(
    mathState?.sourceFormat ||
    item?.sourceFormat ||
    item?.structuredImport?.canonicalFragment?.attrs?.sourceFormat ||
    "latex"
  ).trim().toLowerCase();
}

function getImageSource(item = null) {
  if (!item || typeof item !== "object") {
    return "";
  }
  return String(
    item?.structuredImport?.canonicalFragment?.attrs?.src ||
    item?.sourcePath ||
    item?.dataUrl ||
    ""
  ).trim();
}

function hasFileReference(item = null) {
  return Boolean(String(item?.sourcePath || "").trim() || String(item?.fileId || "").trim());
}

function hasRemoteImageSource(item = null) {
  return /^https?:\/\//i.test(getImageSource(item));
}

function runtimeSupports(runtime = {}, key = "") {
  return !runtime || !Object.prototype.hasOwnProperty.call(runtime, key) || runtime[key] !== false;
}

const COPY_EXPORT_PROTOCOL = Object.freeze({
  text: Object.freeze({
    aliases: Object.freeze(["flowNode"]),
    copyInvalidMessage: "仅富文本元素支持此操作",
    exportInvalidMessage: "仅富文本元素支持此导出",
    exportFailureMessage: "导出失败",
    exportScope: "rich-text",
    getDefaultName(item) {
      return String(item?.name || item?.title || "文本").trim() || "文本";
    },
    copyFormats: Object.freeze([
      Object.freeze({ format: "plain", action: "copy-text-plain", menuLabel: "纯文本", statusLabel: "纯文本" }),
      Object.freeze({
        format: "html",
        action: "copy-text-html",
        menuLabel: "富文本（Word 直通）",
        statusLabel: "富文本（Word 直通）",
      }),
      Object.freeze({
        format: "ppt-html",
        action: "copy-text-ppt-html",
        menuLabel: "富文本（PPT直通）",
        statusLabel: "富文本（PPT直通）",
      }),
      Object.freeze({ format: "markdown", action: "copy-text-markdown", menuLabel: "Markdown", statusLabel: "Markdown" }),
      Object.freeze({ format: "object-link", action: "copy-text-object-link", menuLabel: "对象链接", statusLabel: "对象链接" }),
    ]),
    exportFormats: Object.freeze([
      Object.freeze({
        format: "word",
        action: "export-rich-word",
        menuLabel: "导出为 Word",
        historyKind: "word",
        historyTitle: "富文本导出 Word",
        defaultExtension: "docx",
        successMessage: "已导出 Word",
      }),
      Object.freeze({
        format: "pdf",
        action: "export-rich-pdf",
        menuLabel: "导出为 PDF",
        historyKind: "pdf",
        historyTitle: "富文本导出 PDF",
        defaultExtension: "pdf",
        loadingMessage: "正在生成富文本 PDF...",
        successMessage: "PDF 已导出",
      }),
      Object.freeze({
        format: "png",
        action: "export-rich-png",
        menuLabel: "导出为 PNG",
        historyKind: "png",
        historyTitle: "富文本导出 PNG",
        defaultExtension: "png",
        loadingMessage: "正在生成富文本 PNG...",
        successMessage: "PNG 已导出",
      }),
      Object.freeze({
        format: "txt",
        action: "export-text",
        menuLabel: "导出为 TXT",
        historyKind: "txt",
        historyTitle: "富文本导出 TXT",
        defaultExtension: "txt",
        successMessage: "已导出 TXT",
        visible: false,
      }),
    ]),
  }),
  table: Object.freeze({
    copyInvalidMessage: "仅表格元素支持此操作",
    exportInvalidMessage: "仅表格元素支持此导出",
    exportFailureMessage: "表格导出失败",
    exportCancelMessage: "表格导出已取消",
    exportScope: "table",
    getDefaultName(item) {
      return String(item?.title || item?.table?.title || "表格").trim() || "表格";
    },
    copyFormats: Object.freeze([
      Object.freeze({ format: "plain", action: "table-copy-text-plain", menuLabel: "纯文本表格", statusLabel: "纯文本表格" }),
      Object.freeze({ format: "markdown", action: "table-copy-text-markdown", menuLabel: "Markdown 表格", statusLabel: "Markdown 表格" }),
      Object.freeze({
        format: "html",
        action: "table-copy-text-html",
        menuLabel: "HTML 表格（DOCX，Word 直达）",
        statusLabel: "HTML 表格（DOCX，Word 直达）",
      }),
      Object.freeze({ format: "tsv", action: "table-copy-text-tsv", menuLabel: "TSV 表格（Excel 直达）", statusLabel: "TSV 表格" }),
    ]),
    exportFormats: Object.freeze([
      Object.freeze({
        format: "xlsx",
        action: "table-export-xlsx",
        menuLabel: "导出为 XLSX",
        historyKind: "xlsx",
        historyTitle: "表格导出 XLSX",
        defaultExtension: "xlsx",
        successMessage: "已导出表格",
      }),
      Object.freeze({
        format: "md",
        action: "table-export-md",
        menuLabel: "导出为 Markdown",
        historyKind: "md",
        historyTitle: "表格导出 Markdown",
        defaultExtension: "md",
        successMessage: "已导出表格",
      }),
      Object.freeze({
        format: "csv",
        action: "table-export-csv",
        menuLabel: "导出为 CSV",
        historyKind: "csv",
        historyTitle: "表格导出 CSV",
        defaultExtension: "csv",
        successMessage: "已导出表格",
      }),
      Object.freeze({
        format: "txt",
        action: "table-export-txt",
        menuLabel: "导出为 TXT",
        historyKind: "txt",
        historyTitle: "表格导出 TXT",
        defaultExtension: "txt",
        successMessage: "已导出表格",
      }),
    ]),
  }),
  codeBlock: Object.freeze({
    copyInvalidMessage: "仅代码块元素支持此操作",
    exportInvalidMessage: "仅代码块元素支持此导出",
    exportFailureMessage: "代码块导出失败",
    exportCancelMessage: "代码块导出已取消",
    exportScope: "code-block",
    getDefaultName(item) {
      return String(item?.title || "代码块").trim() || "代码块";
    },
    copyFormats: Object.freeze([
      Object.freeze({ format: "plain", action: "code-copy-text-plain", menuLabel: "纯文本", statusLabel: "纯文本" }),
      Object.freeze({ format: "markdown", action: "code-copy-text-markdown", menuLabel: "Markdown", statusLabel: "Markdown" }),
      Object.freeze({ format: "html", action: "code-copy-text-html", menuLabel: "语义化 HTML", statusLabel: "语义化 HTML" }),
    ]),
    exportFormats: Object.freeze([
      Object.freeze({
        format: "source",
        action: "code-export-source",
        menuLabel: "导出为代码文件",
        historyKind(item) {
          return getCodeBlockLanguageFileExtension(item?.language || "");
        },
        historyTitle: "代码块导出代码文件",
        defaultExtension(item) {
          return getCodeBlockLanguageFileExtension(item?.language || "");
        },
        successMessage: "已导出代码块",
      }),
      Object.freeze({
        format: "markdown",
        action: "code-export-markdown",
        menuLabel: "导出为 Markdown",
        historyKind: "md",
        historyTitle: "代码块导出 Markdown",
        defaultExtension: "md",
        successMessage: "已导出代码块",
      }),
    ]),
  }),
  math: Object.freeze({
    copyInvalidMessage: "仅公式元素支持此操作",
    exportInvalidMessage: "仅公式元素支持此导出",
    exportFailureMessage: "公式导出失败",
    exportCancelMessage: "公式导出已取消",
    exportScope: "math",
    getDefaultName(item) {
      return String(item?.title || "公式").trim() || "公式";
    },
    copyFormats: Object.freeze([
      Object.freeze({
        format: "latex",
        action: "math-copy-latex",
        menuLabel: "LaTeX",
        statusLabel: "LaTeX",
        isAvailable: (item) => !item || getMathSourceFormat(item) === "latex",
      }),
      Object.freeze({
        format: "mathml",
        action: "math-copy-mathml",
        menuLabel: "MathML（保留原文）",
        statusLabel: "MathML",
        isAvailable: (item) => !item || getMathSourceFormat(item) === "mathml",
      }),
    ]),
    exportFormats: Object.freeze([
      Object.freeze({
        format: "latex",
        action: "math-export-latex",
        menuLabel: "导出为 LaTeX",
        historyKind: "tex",
        historyTitle: "公式导出 LaTeX",
        defaultExtension: "tex",
        successMessage: "已导出 LaTeX 公式",
        isAvailable: (item) => !item || getMathSourceFormat(item) === "latex",
      }),
      Object.freeze({
        format: "mathml",
        action: "math-export-mathml",
        menuLabel: "导出为 MathML",
        historyKind: "mathml",
        historyTitle: "公式导出 MathML",
        defaultExtension: "mathml",
        successMessage: "已导出 MathML 公式",
        isAvailable: (item) => !item || getMathSourceFormat(item) === "mathml",
      }),
    ]),
  }),
  image: Object.freeze({
    copyInvalidMessage: "仅图片元素支持此操作",
    exportInvalidMessage: "仅图片元素支持此导出",
    exportFailureMessage: "图片导出失败",
    exportCancelMessage: "图片导出已取消",
    exportScope: "image",
    getDefaultName(item) {
      return String(item?.name || item?.title || "图片").trim() || "图片";
    },
    copyFormats: Object.freeze([
      Object.freeze({
        format: "bitmap",
        action: "image-copy-bitmap",
        menuLabel: "复制位图（PNG）",
        statusLabel: "图片位图",
        isAvailable: (item, runtime) => (!item || Boolean(getImageSource(item))) && runtimeSupports(runtime, "bitmapClipboard"),
      }),
      Object.freeze({
        format: "file",
        action: "image-copy-original-file",
        menuLabel: "复制原文件",
        statusLabel: "图片原文件",
        isAvailable: (item, runtime) => (!item || hasFileReference(item)) && runtimeSupports(runtime, "fileClipboard"),
      }),
      Object.freeze({
        format: "source-link",
        action: "image-copy-source-link",
        menuLabel: "复制来源链接",
        statusLabel: "图片来源链接",
        isAvailable: (item) => !item || hasRemoteImageSource(item),
      }),
    ]),
    exportFormats: Object.freeze([
      Object.freeze({
        format: "png",
        action: "image-export-png",
        menuLabel: "导出当前图片（PNG）",
        historyKind: "png",
        historyTitle: "图片导出 PNG",
        defaultExtension: "png",
        successMessage: "已导出图片",
      }),
    ]),
  }),
  fileCard: Object.freeze({
    copyInvalidMessage: "仅文件卡支持此操作",
    exportInvalidMessage: "仅文件卡支持此导出",
    exportFailureMessage: "文件卡导出失败",
    exportScope: "file-card",
    getDefaultName(item) {
      return String(item?.fileName || item?.name || item?.title || "文件").trim() || "文件";
    },
    copyFormats: Object.freeze([
      Object.freeze({
        format: "file",
        action: "file-copy-original",
        menuLabel: "复制原文件",
        statusLabel: "原文件",
        isAvailable: (item, runtime) => (!item || hasFileReference(item)) && runtimeSupports(runtime, "fileClipboard"),
      }),
      Object.freeze({
        format: "path",
        action: "file-copy-path",
        menuLabel: "复制文件路径",
        statusLabel: "文件路径",
        isAvailable: (item) => !item || hasFileReference(item),
      }),
      Object.freeze({ format: "filename", action: "file-copy-name", menuLabel: "复制文件名", statusLabel: "文件名" }),
    ]),
    exportFormats: Object.freeze([]),
  }),
});

const VISUAL_EXPORT_FORMATS = Object.freeze({
  png: Object.freeze({ format: "png", action: "export-element-png", menuLabel: "导出为 PNG" }),
  pdf: Object.freeze({ format: "pdf", action: "export-element-pdf", menuLabel: "导出为 PDF" }),
});

function normalizeType(type = "") {
  if (type && typeof type === "object" && isStructuredMathTextElement(type)) {
    return "math";
  }
  const definition = type && typeof type === "object"
    ? canvasElementRegistry.resolveElement(type, { fallback: false })
    : canvasElementRegistry.resolve(type, { fallback: false });
  const protocolType = String(definition?.capabilities?.copyExportProtocol || "").trim();
  return COPY_EXPORT_PROTOCOL[protocolType] ? protocolType : "";
}

function resolveProtocol(type = "") {
  const normalizedType = normalizeType(type);
  return normalizedType ? COPY_EXPORT_PROTOCOL[normalizedType] || null : null;
}

function resolveFormatSpec(formats = [], format = "") {
  const normalizedFormat = String(format || "").trim().toLowerCase();
  return formats.find((entry) => String(entry?.format || "").trim().toLowerCase() === normalizedFormat) || null;
}

function buildDefaultFileName(baseName, extension) {
  const normalizedBase = String(baseName || "").trim();
  const normalizedExtension = String(extension || "").trim().replace(/^\./, "");
  return normalizedExtension ? `${normalizedBase}.${normalizedExtension}` : normalizedBase;
}

export function normalizeCopyExportElementType(type = "") {
  return normalizeType(type);
}

export function getCopyFormatSpec(type = "", format = "") {
  const protocol = resolveProtocol(type);
  return protocol ? resolveFormatSpec(protocol.copyFormats, format) : null;
}

export function getExportFormatSpec(type = "", format = "") {
  const protocol = resolveProtocol(type);
  return protocol ? resolveFormatSpec(protocol.exportFormats, format) : null;
}

export function getCopyMenuItems(type = "", { visibleOnly = true, item = null, runtime = {} } = {}) {
  const protocol = resolveProtocol(type);
  if (!protocol) {
    return [];
  }
  const targetItem = item || (type && typeof type === "object" ? type : null);
  return protocol.copyFormats.filter((entry) =>
    (!visibleOnly || entry.visible !== false) &&
    (typeof entry.isAvailable !== "function" || entry.isAvailable(targetItem, runtime))
  );
}

export function getExportMenuItems(type = "", { visibleOnly = true, item = null, runtime = {} } = {}) {
  const protocol = resolveProtocol(type);
  const targetItem = item || (type && typeof type === "object" ? type : null);
  const semanticFormats = protocol
    ? protocol.exportFormats.filter((entry) =>
        (!visibleOnly || entry.visible !== false) &&
        (typeof entry.isAvailable !== "function" || entry.isAvailable(targetItem, runtime))
      )
    : [];
  const semanticFormatIds = new Set(semanticFormats.map((entry) => String(entry.format || "").toLowerCase()));
  const capabilities = getElementTransferCapabilities(type);
  const visualFormats = (Array.isArray(capabilities?.visualExport) ? capabilities.visualExport : [])
    .map((format) => VISUAL_EXPORT_FORMATS[String(format || "").toLowerCase()] || null)
    .filter((entry) => entry && !semanticFormatIds.has(entry.format));
  return [...semanticFormats, ...visualFormats];
}

export function resolveCopyExportAction(action = "") {
  const normalizedAction = String(action || "").trim();
  if (!normalizedAction) {
    return null;
  }
  for (const [type, protocol] of Object.entries(COPY_EXPORT_PROTOCOL)) {
    const copySpec = protocol.copyFormats.find((entry) => entry.action === normalizedAction);
    if (copySpec) {
      return {
        operation: "copy",
        type,
        format: copySpec.format,
        spec: copySpec,
        targetTypes: getProtocolTargetTypes(type),
      };
    }
    const exportSpec = protocol.exportFormats.find((entry) => entry.action === normalizedAction);
    if (exportSpec) {
      return {
        operation: "export",
        type,
        format: exportSpec.format,
        spec: exportSpec,
        targetTypes: getProtocolTargetTypes(type),
      };
    }
  }
  return null;
}

function getProtocolTargetTypes(protocolType = "") {
  const targetTypes = canvasElementRegistry
    .list()
    .filter((definition) => definition.capabilities?.copyExportProtocol === protocolType)
    .map((definition) => definition.type);
  if (protocolType === "math" && !targetTypes.includes("text")) {
    targetTypes.push("text");
  }
  return targetTypes;
}

export function getElementTransferCapabilities(type = "") {
  const definition = type && typeof type === "object"
    ? canvasElementRegistry.resolveElement(type, { fallback: false })
    : canvasElementRegistry.resolve(type, { fallback: false });
  if (!definition) {
    return null;
  }
  const capabilities = definition.capabilities || {};
  const protocolType = normalizeType(type);
  const protocol = COPY_EXPORT_PROTOCOL[protocolType] || null;
  return {
    type: definition.type,
    objectCopy: capabilities.objectCopy === true,
    contentCopy: String(protocolType === "math" ? "math" : capabilities.contentCopy || "none"),
    selectionCopy: String(capabilities.selectionCopy || "none"),
    copyExportProtocol: String(protocolType || capabilities.copyExportProtocol || "none"),
    visualExport: Array.isArray(capabilities.visualExport) ? [...capabilities.visualExport] : [],
    semanticExport: protocol
      ? protocol.exportFormats.map((entry) => String(entry.format || "")).filter(Boolean)
      : Array.isArray(capabilities.semanticExport) ? [...capabilities.semanticExport] : [],
    dependencyClosure: String(capabilities.dependencyClosure || "none"),
    measurement: String(capabilities.measurement || "bounds"),
    persistence: String(capabilities.persistence || "inline"),
  };
}

export function getCopyOperationMeta(type = "", format = "") {
  const normalizedType = normalizeType(type);
  const protocol = resolveProtocol(normalizedType);
  const spec = getCopyFormatSpec(normalizedType, format);
  if (!protocol || !spec) {
    return null;
  }
  return {
    type: normalizedType,
    format: spec.format,
    action: spec.action,
    label: spec.statusLabel || spec.menuLabel || "",
    invalidMessage: protocol.copyInvalidMessage || "当前元素不支持此操作",
  };
}

export function getExportOperationMeta(type = "", format = "", item = null) {
  const normalizedType = normalizeType(type);
  const protocol = resolveProtocol(normalizedType);
  const spec = getExportFormatSpec(normalizedType, format);
  if (!protocol || !spec) {
    return null;
  }
  const defaultName = protocol.getDefaultName(item);
  const extension = typeof spec.defaultExtension === "function" ? spec.defaultExtension(item) : spec.defaultExtension;
  const historyKind = typeof spec.historyKind === "function" ? spec.historyKind(item) : spec.historyKind;
  return {
    type: normalizedType,
    format: spec.format,
    action: spec.action,
    defaultName,
    defaultFileName: buildDefaultFileName(defaultName, extension),
    historyKind: String(historyKind || extension || "").trim(),
    historyTitle: spec.historyTitle || "",
    successMessage: spec.successMessage || "导出成功",
    loadingMessage: spec.loadingMessage || "",
    cancelMessage: protocol.exportCancelMessage || "",
    failureMessage: protocol.exportFailureMessage || "导出失败",
    invalidMessage: protocol.exportInvalidMessage || "当前元素不支持此导出",
    scope: protocol.exportScope || normalizedType,
  };
}
