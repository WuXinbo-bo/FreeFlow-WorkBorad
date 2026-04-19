import { createId, formatBytes, getFileBaseName, getFileExtension, getFileName } from "../utils.js";
import { getMemoLayout } from "../memoLayout.js";

export const FILE_CARD_STRUCTURED_IMPORT_KIND = "structured-import-v1";

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
  return {
    id: createId("file"),
    type: "fileCard",
    name: fileName,
    fileName,
    title: getFileBaseName(fileName),
    ext: getFileExtension(fileName),
    mime: String(file?.type || ""),
    sourcePath: String(file?.path || ""),
    fileId: String(file?.fileId || ""),
    size: Number(file?.size) || 0,
    sizeLabel: formatBytes(file?.size),
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    width: 320,
    height: 120,
    marked: false,
    memo: "",
    memoVisible: false,
    createdAt: Date.now(),
    structuredImport: null,
  };
}

export function normalizeFileCardElement(element = {}) {
  const base = createFileCardElement(
    { name: element.name || element.fileName || "未命名文件", type: element.mime || element.mimeType || "", path: element.sourcePath || "", size: element.size || element.fileSize || 0 },
    { x: Number(element.x) || 0, y: Number(element.y) || 0 }
  );
  return {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "fileCard",
    name: getFileName(element.name || element.fileName || base.name),
    title: String(element.title || base.title),
    ext: String(element.ext || element.fileExt || base.ext),
    mime: String(element.mime || element.mimeType || base.mime),
    sourcePath: String(element.sourcePath || base.sourcePath),
    fileName: getFileName(element.fileName || element.name || base.fileName || base.name),
    fileId: String(element.fileId || base.fileId || ""),
    size: Number(element.size || element.fileSize || base.size) || 0,
    sizeLabel: formatBytes(element.size || element.fileSize || base.size),
    width: Math.max(220, Number(element.width ?? base.width) || base.width),
    height: Math.max(96, Number(element.height ?? base.height) || base.height),
    marked: Boolean(element.marked ?? base.marked),
    memo: String(element.memo ?? element.note ?? base.memo ?? ""),
    memoVisible: Boolean(element.memoVisible ?? base.memoVisible),
    structuredImport: normalizeStructuredFileCardImportMeta(element.structuredImport),
  };
}

export function getFileCardMemoBounds(element = {}) {
  return getMemoLayout(element, { kind: "fileCard" });
}
