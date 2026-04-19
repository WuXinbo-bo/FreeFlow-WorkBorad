import { normalizeCodeBlockElement, CODE_BLOCK_STRUCTURED_IMPORT_KIND } from "../../../elements/codeBlock.js";

export function buildCodeBlockElementFromRenderOperation(operation = {}, options = {}) {
  const element = operation?.element && typeof operation.element === "object" ? operation.element : {};
  const structure = operation?.structure && typeof operation.structure === "object" ? operation.structure : {};
  const meta = operation?.meta && typeof operation.meta === "object" ? operation.meta : {};

  return normalizeCodeBlockElement({
    ...element,
    x: Number(options.x) || 0,
    y: Number(options.y) || 0,
    structuredImport: {
      kind: CODE_BLOCK_STRUCTURED_IMPORT_KIND,
      sourceNodeType: String(operation?.sourceNodeType || "codeBlock"),
      canonicalFragment: {
        type: "codeBlock",
        attrs: {
          language: String(structure.language || element.language || ""),
        },
        text: String(structure.code || element.text || ""),
      },
      sourceMeta: {
        descriptorId: String(meta.descriptorId || ""),
        parserId: String(meta.parserId || ""),
      },
    },
  });
}
