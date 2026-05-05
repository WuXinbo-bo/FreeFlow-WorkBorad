import { normalizeImageElement, IMAGE_STRUCTURED_IMPORT_KIND } from "../../../elements/media.js";

export function buildImageElementFromRenderOperation(operation = {}, options = {}) {
  const element = operation?.element && typeof operation.element === "object" ? operation.element : {};
  const structure = operation?.structure && typeof operation.structure === "object" ? operation.structure : {};
  const meta = operation?.meta && typeof operation.meta === "object" ? operation.meta : {};

  return normalizeImageElement({
    ...element,
    x: Number(options.x) || 0,
    y: Number(options.y) || 0,
    structuredImport: {
      kind: IMAGE_STRUCTURED_IMPORT_KIND,
      sourceNodeType: String(operation?.sourceNodeType || "image"),
      canonicalFragment: {
        type: "image",
        attrs: {
          src: String(structure.src || element.sourcePath || element.dataUrl || ""),
          alt: String(structure.alt || ""),
          title: String(structure.title || element.name || ""),
          resourceId: String(structure.resourceId || element.fileId || ""),
          width: Number(element.width || 0) || undefined,
          height: Number(element.height || 0) || undefined,
        },
      },
      sourceMeta: {
        descriptorId: String(meta.descriptorId || ""),
        parserId: String(meta.parserId || ""),
      },
    },
  });
}
