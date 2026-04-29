import { getCodeBlockLanguageFileExtension } from "../codeBlock/languageRegistry.js";

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
      Object.freeze({ format: "html", action: "copy-text-html", menuLabel: "富文本 HTML", statusLabel: "富文本 HTML" }),
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
});

function normalizeType(type = "") {
  const raw = String(type || "").trim();
  if (!raw) {
    return "";
  }
  if (COPY_EXPORT_PROTOCOL[raw]) {
    return raw;
  }
  const entry = Object.entries(COPY_EXPORT_PROTOCOL).find(([, value]) => Array.isArray(value.aliases) && value.aliases.includes(raw));
  return entry ? entry[0] : "";
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

export function getCopyMenuItems(type = "", { visibleOnly = true } = {}) {
  const protocol = resolveProtocol(type);
  if (!protocol) {
    return [];
  }
  return protocol.copyFormats.filter((entry) => !visibleOnly || entry.visible !== false);
}

export function getExportMenuItems(type = "", { visibleOnly = true } = {}) {
  const protocol = resolveProtocol(type);
  if (!protocol) {
    return [];
  }
  return protocol.exportFormats.filter((entry) => !visibleOnly || entry.visible !== false);
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
        targetTypes: type === "text" ? ["text", "flowNode"] : [type],
      };
    }
    const exportSpec = protocol.exportFormats.find((entry) => entry.action === normalizedAction);
    if (exportSpec) {
      return {
        operation: "export",
        type,
        format: exportSpec.format,
        spec: exportSpec,
        targetTypes: type === "text" ? ["text", "flowNode"] : [type],
      };
    }
  }
  return null;
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
