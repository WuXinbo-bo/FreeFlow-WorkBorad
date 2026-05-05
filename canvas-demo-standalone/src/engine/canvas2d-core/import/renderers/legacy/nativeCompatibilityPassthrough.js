import { normalizeElement } from "../../../elements/index.js";

export const LEGACY_COMPATIBILITY_KIND = "legacy-compatibility-v1";

export function buildNativeElementFromPassthroughOperation(operation = {}, options = {}) {
  const element = operation?.element && typeof operation.element === "object" ? operation.element : {};
  const structure = operation?.structure && typeof operation.structure === "object" ? operation.structure : {};
  const meta = operation?.meta && typeof operation.meta === "object" ? operation.meta : {};

  return normalizeElement({
    ...element,
    x: Object.prototype.hasOwnProperty.call(options, "x") ? Number(options.x) || 0 : element.x,
    y: Object.prototype.hasOwnProperty.call(options, "y") ? Number(options.y) || 0 : element.y,
    legacyCompatibility: {
      kind: LEGACY_COMPATIBILITY_KIND,
      legacyType: String(operation?.legacyType || structure.legacyType || ""),
      adapterType: "native-items",
      entryId: String(structure.entryId || ""),
      originId: String(structure.originId || ""),
      sourceMeta: {
        descriptorId: String(meta.descriptorId || ""),
        parserId: String(meta.parserId || ""),
      },
    },
  });
}
