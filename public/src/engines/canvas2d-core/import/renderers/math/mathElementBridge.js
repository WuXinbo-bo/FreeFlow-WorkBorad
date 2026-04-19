import { normalizeMathElement, MATH_STRUCTURED_IMPORT_KIND } from "../../../elements/math.js";

export function buildMathElementFromRenderOperation(operation = {}, options = {}) {
  const element = operation?.element && typeof operation.element === "object" ? operation.element : {};
  const structure = operation?.structure && typeof operation.structure === "object" ? operation.structure : {};
  const meta = operation?.meta && typeof operation.meta === "object" ? operation.meta : {};
  const displayMode = Boolean(structure.displayMode ?? element.displayMode);

  return normalizeMathElement({
    ...element,
    x: Number(options.x) || 0,
    y: Number(options.y) || 0,
    type: displayMode ? "mathBlock" : "mathInline",
    structuredImport: {
      kind: MATH_STRUCTURED_IMPORT_KIND,
      sourceNodeType: String(operation?.sourceNodeType || (displayMode ? "mathBlock" : "mathInline")),
      canonicalFragment: {
        type: displayMode ? "mathBlock" : "mathInline",
        attrs: {
          sourceFormat: String(structure.sourceFormat || element.sourceFormat || "latex"),
          displayMode,
        },
        text: String(structure.formula || element.formula || ""),
      },
      sourceMeta: {
        descriptorId: String(meta.descriptorId || ""),
        parserId: String(meta.parserId || ""),
      },
    },
  });
}
