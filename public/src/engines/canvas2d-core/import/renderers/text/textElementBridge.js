import { normalizeTextElement, TEXT_STRUCTURED_IMPORT_KIND } from "../../../elements/text.js";

export function buildStructuredTextElementFromRenderOperation(operation = {}, options = {}) {
  const element = operation?.element && typeof operation.element === "object" ? operation.element : {};
  const structure = operation?.structure && typeof operation.structure === "object" ? operation.structure : {};
  const meta = operation?.meta && typeof operation.meta === "object" ? operation.meta : {};
  const nextElement = normalizeTextElement({
    ...element,
    x: Number(options.x) || 0,
    y: Number(options.y) || 0,
    structuredImport: {
      kind: TEXT_STRUCTURED_IMPORT_KIND,
      blockRole: String(operation?.blockRole || structure?.listRole || "paragraph"),
      sourceNodeType: String(operation?.sourceNodeType || "paragraph"),
      listRole: String(structure?.listRole || ""),
      canonicalFragment: buildCanonicalFragment(operation),
      sourceMeta: {
        descriptorId: String(meta.descriptorId || ""),
        parserId: String(meta.parserId || ""),
      },
    },
  });
  return nextElement;
}

function buildCanonicalFragment(operation = {}) {
  if (operation?.type === "render-list-block") {
    return {
      type: String(operation?.sourceNodeType || "bulletList"),
      attrs: {
        role: String(operation?.listRole || ""),
      },
      items: Array.isArray(operation?.structure?.items)
        ? JSON.parse(JSON.stringify(operation.structure.items))
        : [],
    };
  }
  return {
    type: String(operation?.sourceNodeType || "paragraph"),
    role: String(operation?.blockRole || "paragraph"),
    html: String(operation?.element?.html || ""),
    plainText: String(operation?.element?.plainText || operation?.element?.text || ""),
  };
}
