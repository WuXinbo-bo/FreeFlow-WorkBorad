import { normalizeMathElement, normalizeMathRenderState } from "../../../elements/math.js";
import { buildTextElementFromMathElement } from "../../../elements/mathText.js";

export function buildMathElementFromRenderOperation(operation = {}, options = {}) {
  const element = operation?.element && typeof operation.element === "object" ? operation.element : {};
  const structure = operation?.structure && typeof operation.structure === "object" ? operation.structure : {};
  const meta = operation?.meta && typeof operation.meta === "object" ? operation.meta : {};
  const displayMode = Boolean(structure.displayMode ?? element.displayMode);
  const sourceMeta = {
    ...(element?.sourceMeta && typeof element.sourceMeta === "object" ? element.sourceMeta : {}),
    descriptorId: String(meta.descriptorId || ""),
    parserId: String(meta.parserId || ""),
    entryId: String(meta.entryId || ""),
  };

  const mathElement = normalizeMathElement({
    ...element,
    x: Number(options.x) || 0,
    y: Number(options.y) || 0,
    type: displayMode ? "mathBlock" : "mathInline",
    renderState: normalizeMathRenderState(element.renderState || structure.renderState),
    sourceMeta,
  });
  return buildTextElementFromMathElement({
    ...mathElement,
    structuredImport: {
      ...(mathElement?.structuredImport && typeof mathElement.structuredImport === "object" ? mathElement.structuredImport : {}),
      sourceNodeType: String(operation?.sourceNodeType || (displayMode ? "mathBlock" : "mathInline")),
      canonicalFragment: {
        type: displayMode ? "mathBlock" : "mathInline",
        attrs: {
          sourceFormat: String(structure.sourceFormat || element.sourceFormat || "latex"),
          displayMode,
          renderState: normalizeMathRenderState(element.renderState || structure.renderState),
        },
        text: String(structure.formula || element.formula || ""),
      },
      sourceMeta,
    },
  });
}
