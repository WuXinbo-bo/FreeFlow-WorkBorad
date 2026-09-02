import { createImageElement, normalizeImageElement } from "./elements/media.js";
import { createImageRenderer } from "./rendererImage.js";
import { buildImageContextMenuHtml as buildSharedImageContextMenuHtml } from "./contextMenu/menuSchemaBuilders.js";

export { createImageElement, normalizeImageElement };

export function isImageFile(file) {
  return String(file?.type || "").startsWith("image/");
}

export function buildImageContextMenuHtml(item = {}, runtime = {}) {
  return buildSharedImageContextMenuHtml(item, runtime);
}

export function createImageModule() {
  return {
    createElement: createImageElement,
    normalizeElement: normalizeImageElement,
    isImageFile,
    createRenderer: createImageRenderer,
    buildContextMenuHtml: buildImageContextMenuHtml,
  };
}
