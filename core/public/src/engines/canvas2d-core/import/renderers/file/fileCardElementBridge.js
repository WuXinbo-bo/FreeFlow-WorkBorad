import { normalizeFileCardElement, FILE_CARD_STRUCTURED_IMPORT_KIND } from "../../../elements/fileCard.js";

export function buildFileCardElementFromBridgeOperation(operation = {}, options = {}) {
  const element = operation?.element && typeof operation.element === "object" ? operation.element : {};
  const structure = operation?.structure && typeof operation.structure === "object" ? operation.structure : {};
  const meta = operation?.meta && typeof operation.meta === "object" ? operation.meta : {};

  return normalizeFileCardElement({
    ...element,
    x: Number(options.x) || 0,
    y: Number(options.y) || 0,
    structuredImport: {
      kind: FILE_CARD_STRUCTURED_IMPORT_KIND,
      sourceNodeType: String(operation?.legacyType || "fileCard"),
      compatibilityFragment: {
        adapterType: "fileCard",
        entryId: String(structure.entryId || ""),
        originId: String(structure.originId || ""),
        resourceId: String(structure.resourceId || ""),
        sourcePath: String(structure.sourcePath || ""),
        ext: String(structure.ext || ""),
        mime: String(structure.mime || ""),
        size: Number(structure.size || 0) || 0,
        sizeLabel: String(structure.sizeLabel || ""),
      },
      sourceMeta: {
        descriptorId: String(meta.descriptorId || ""),
        parserId: String(meta.parserId || ""),
      },
    },
  });
}
