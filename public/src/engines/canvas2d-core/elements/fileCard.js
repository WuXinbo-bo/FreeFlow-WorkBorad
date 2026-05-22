import { createId, formatBytes, getFileBaseName, getFileExtension, getFileName } from "../utils.js";
import { getMemoLayout } from "../memoLayout.js";

export const FILE_CARD_STRUCTURED_IMPORT_KIND = "structured-import-v1";
export const FILE_CARD_DEFAULT_WIDTH = 336;
export const FILE_CARD_DEFAULT_HEIGHT = 128;
export const FILE_CARD_MIN_WIDTH = 336;
export const FILE_CARD_MIN_HEIGHT = 128;

const FILE_CARD_TYPE_STYLES = {
  word: {
    accent: "#2b579a",
    accentSoft: "rgba(43, 87, 154, 0.12)",
    accentStroke: "rgba(43, 87, 154, 0.18)",
    accentText: "#1f4477",
  },
  pdf: {
    accent: "#ea580c",
    accentSoft: "rgba(234, 88, 12, 0.12)",
    accentStroke: "rgba(234, 88, 12, 0.18)",
    accentText: "#c2410c",
  },
  excel: {
    accent: "#217346",
    accentSoft: "rgba(33, 115, 70, 0.12)",
    accentStroke: "rgba(33, 115, 70, 0.18)",
    accentText: "#185534",
  },
  ppt: {
    accent: "#d24726",
    accentSoft: "rgba(210, 71, 38, 0.12)",
    accentStroke: "rgba(210, 71, 38, 0.18)",
    accentText: "#a53a1f",
  },
  text: {
    accent: "#7c3aed",
    accentSoft: "rgba(124, 58, 237, 0.12)",
    accentStroke: "rgba(124, 58, 237, 0.18)",
    accentText: "#6d28d9",
  },
  code: {
    accent: "#0f766e",
    accentSoft: "rgba(15, 118, 110, 0.12)",
    accentStroke: "rgba(15, 118, 110, 0.18)",
    accentText: "#0f766e",
  },
  archive: {
    accent: "#b45309",
    accentSoft: "rgba(180, 83, 9, 0.12)",
    accentStroke: "rgba(180, 83, 9, 0.18)",
    accentText: "#92400e",
  },
  image: {
    accent: "#db2777",
    accentSoft: "rgba(219, 39, 119, 0.12)",
    accentStroke: "rgba(219, 39, 119, 0.18)",
    accentText: "#be185d",
  },
  default: {
    accent: "#475569",
    accentSoft: "rgba(71, 85, 105, 0.12)",
    accentStroke: "rgba(71, 85, 105, 0.18)",
    accentText: "#334155",
  },
};

function resolveFileCardKind(ext = "", mime = "") {
  const cleanExt = String(ext || "").trim().toLowerCase().replace(/^\./, "");
  const cleanMime = String(mime || "").trim().toLowerCase();
  if (["doc", "docx", "wps", "odt", "rtf"].includes(cleanExt) || cleanMime.includes("word") || cleanMime.includes("officedocument.wordprocessingml")) {
    return "word";
  }
  if (cleanExt === "pdf" || cleanMime === "application/pdf") {
    return "pdf";
  }
  if (["xls", "xlsx", "csv", "numbers", "ods"].includes(cleanExt) || cleanMime.includes("spreadsheet") || cleanMime.includes("excel") || cleanMime.includes("csv")) {
    return "excel";
  }
  if (["ppt", "pptx", "key", "odp"].includes(cleanExt) || cleanMime.includes("presentation") || cleanMime.includes("powerpoint")) {
    return "ppt";
  }
  if (["txt", "md", "markdown", "pages"].includes(cleanExt) || cleanMime.startsWith("text/")) {
    return "text";
  }
  if (["js", "ts", "jsx", "tsx", "json", "html", "css", "py", "java", "cpp", "c", "cs", "go", "rs", "php", "rb", "sh", "bat", "ps1", "yaml", "yml", "xml"].includes(cleanExt)) {
    return "code";
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(cleanExt) || cleanMime.includes("zip") || cleanMime.includes("compressed")) {
    return "archive";
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(cleanExt) || cleanMime.startsWith("image/")) {
    return "image";
  }
  return "default";
}

export function resolveFileCardTypeStyle(ext = "", mime = "") {
  const kind = resolveFileCardKind(ext, mime);
  return {
    kind,
    ...(FILE_CARD_TYPE_STYLES[kind] || FILE_CARD_TYPE_STYLES.default),
  };
}

export function normalizeStructuredFileCardImportMeta(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    kind: FILE_CARD_STRUCTURED_IMPORT_KIND,
    sourceNodeType: String(value.sourceNodeType || "").trim() || "fileCard",
    compatibilityFragment: value.compatibilityFragment && typeof value.compatibilityFragment === "object"
      ? JSON.parse(JSON.stringify(value.compatibilityFragment))
      : null,
    sourceMeta: value.sourceMeta && typeof value.sourceMeta === "object" ? { ...value.sourceMeta } : {},
  };
}

export function createFileCardElement(file, point) {
  const fileName = getFileName(file?.name || file?.path || "未命名文件");
  const ext = getFileExtension(fileName);
  const mime = String(file?.type || "");
  const typeStyle = resolveFileCardTypeStyle(ext, mime);
  return {
    id: createId("file"),
    type: "fileCard",
    name: fileName,
    fileName,
    title: getFileBaseName(fileName),
    ext,
    mime,
    sourcePath: String(file?.path || ""),
    fileId: String(file?.fileId || ""),
    size: Number(file?.size) || 0,
    sizeLabel: formatBytes(file?.size),
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    width: FILE_CARD_DEFAULT_WIDTH,
    height: FILE_CARD_DEFAULT_HEIGHT,
    marked: false,
    memo: "",
    memoVisible: false,
    createdAt: Date.now(),
    structuredImport: null,
    fileCardKind: typeStyle.kind,
    accentColor: typeStyle.accent,
    accentSoftColor: typeStyle.accentSoft,
    accentStrokeColor: typeStyle.accentStroke,
    accentTextColor: typeStyle.accentText,
  };
}

export function normalizeFileCardElement(element = {}) {
  const base = createFileCardElement(
    { name: element.name || element.fileName || "未命名文件", type: element.mime || element.mimeType || "", path: element.sourcePath || "", size: element.size || element.fileSize || 0 },
    { x: Number(element.x) || 0, y: Number(element.y) || 0 }
  );
  const ext = String(element.ext || element.fileExt || base.ext);
  const mime = String(element.mime || element.mimeType || base.mime);
  const typeStyle = resolveFileCardTypeStyle(ext, mime);
  return {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "fileCard",
    name: getFileName(element.name || element.fileName || base.name),
    title: String(element.title || base.title),
    ext,
    mime,
    sourcePath: String(element.sourcePath || base.sourcePath),
    fileName: getFileName(element.fileName || element.name || base.fileName || base.name),
    fileId: String(element.fileId || base.fileId || ""),
    size: Number(element.size || element.fileSize || base.size) || 0,
    sizeLabel: formatBytes(element.size || element.fileSize || base.size),
    width: Math.max(FILE_CARD_MIN_WIDTH, Number(element.width ?? base.width) || base.width),
    height: Math.max(FILE_CARD_MIN_HEIGHT, Number(element.height ?? base.height) || base.height),
    marked: Boolean(element.marked ?? base.marked),
    memo: String(element.memo ?? element.note ?? base.memo ?? ""),
    memoVisible: Boolean(element.memoVisible ?? base.memoVisible),
    structuredImport: normalizeStructuredFileCardImportMeta(element.structuredImport),
    fileCardKind: String(element.fileCardKind || typeStyle.kind),
    accentColor: String(element.accentColor || typeStyle.accent),
    accentSoftColor: String(element.accentSoftColor || typeStyle.accentSoft),
    accentStrokeColor: String(element.accentStrokeColor || typeStyle.accentStroke),
    accentTextColor: String(element.accentTextColor || typeStyle.accentText),
  };
}

export function getFileCardMemoBounds(element = {}) {
  return getMemoLayout(element, { kind: "fileCard" });
}

export function getFileCardPreviewBounds(element = {}, options = {}) {
  const x = Number(element.x || 0) || 0;
  const y = Number(element.y || 0) || 0;
  const width = Math.max(FILE_CARD_MIN_WIDTH, Number(element.width || FILE_CARD_DEFAULT_WIDTH) || FILE_CARD_DEFAULT_WIDTH);
  const height = Math.max(FILE_CARD_MIN_HEIGHT, Number(element.height || FILE_CARD_DEFAULT_HEIGHT) || FILE_CARD_DEFAULT_HEIGHT);
  const expanded = Boolean(options.expanded);
  const previewWidth = Math.max(Math.min(width - 52, 560), Math.round(width * 0.82));
  const previewHeight = expanded ? 920 : 468;
  const gap = -20;
  const left = x + width / 2 - previewWidth / 2;
  const top = y + height + gap;
  return {
    left,
    top,
    width: previewWidth,
    height: previewHeight,
    gap,
  };
}
