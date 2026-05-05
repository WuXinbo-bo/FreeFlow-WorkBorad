import { createId, fitSize, getFileName } from "../utils.js";
import { getMemoLayout } from "../memoLayout.js";
export { createFileCardElement, normalizeFileCardElement } from "./fileCard.js";

export const IMAGE_STRUCTURED_IMPORT_KIND = "structured-import-v1";

export function normalizeStructuredImageImportMeta(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    kind: IMAGE_STRUCTURED_IMPORT_KIND,
    sourceNodeType: String(value.sourceNodeType || "").trim() || "image",
    canonicalFragment: value.canonicalFragment && typeof value.canonicalFragment === "object"
      ? JSON.parse(JSON.stringify(value.canonicalFragment))
      : null,
    sourceMeta: value.sourceMeta && typeof value.sourceMeta === "object" ? { ...value.sourceMeta } : {},
  };
}

export function createImageElement(file, point, dataUrl = "", dimensions = {}) {
  const size = fitSize(dimensions.width || 320, dimensions.height || 220, 420, 320);
  return {
    id: createId("img"),
    type: "image",
    name: getFileName(file?.name || "图片"),
    mime: String(file?.type || "image/*"),
    source: dataUrl ? "blob" : "path",
    sourcePath: String(file?.path || ""),
    fileId: String(file?.fileId || ""),
    dataUrl,
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    width: size.width,
    height: size.height,
    naturalWidth: Number(dimensions.width) || size.width,
    naturalHeight: Number(dimensions.height) || size.height,
    rotation: 0,
    flipX: false,
    flipY: false,
    brightness: 0,
    contrast: 0,
    crop: null,
    annotations: {
      lines: [],
      texts: [],
      rects: [],
      arrows: [],
    },
    memo: "",
    memoVisible: false,
    createdAt: Date.now(),
    structuredImport: null,
  };
}

export function normalizeImageElement(element = {}) {
  const base = createImageElement(
    { name: element.name || element.fileName || "图片", type: element.mime || element.mimeType || "image/*", path: element.sourcePath || "" },
    { x: Number(element.x) || 0, y: Number(element.y) || 0 },
    element.dataUrl || "",
    { width: Number(element.naturalWidth || element.width) || 320, height: Number(element.naturalHeight || element.height) || 220 }
  );
  return {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "image",
    name: getFileName(element.name || element.fileName || base.name),
    mime: String(element.mime || element.mimeType || base.mime),
    source: element.source || base.source,
    sourcePath: String(element.sourcePath || base.sourcePath),
    fileId: String(element.fileId || base.fileId || ""),
    width: Math.max(72, Number(element.width ?? base.width) || base.width),
    height: Math.max(72, Number(element.height ?? base.height) || base.height),
    naturalWidth: Number(element.naturalWidth ?? base.naturalWidth) || base.naturalWidth,
    naturalHeight: Number(element.naturalHeight ?? base.naturalHeight) || base.naturalHeight,
    rotation: Number(element.rotation ?? base.rotation) || 0,
    flipX: Boolean(element.flipX ?? base.flipX),
    flipY: Boolean(element.flipY ?? base.flipY),
    brightness: Number(element.brightness ?? base.brightness) || 0,
    contrast: Number(element.contrast ?? base.contrast) || 0,
    crop: element.crop ?? base.crop ?? null,
    annotations: {
      lines: Array.isArray(element.annotations?.lines) ? element.annotations.lines : base.annotations.lines,
      texts: Array.isArray(element.annotations?.texts) ? element.annotations.texts : base.annotations.texts,
      rects: Array.isArray(element.annotations?.rects) ? element.annotations.rects : base.annotations.rects,
      arrows: Array.isArray(element.annotations?.arrows) ? element.annotations.arrows : base.annotations.arrows,
    },
    memo: String(element.memo ?? element.note ?? base.memo ?? ""),
    memoVisible: Boolean(element.memoVisible ?? base.memoVisible),
    structuredImport: normalizeStructuredImageImportMeta(element.structuredImport),
  };
}

export function getImageMemoBounds(element = {}) {
  return getMemoLayout(element, { kind: "image" });
}
