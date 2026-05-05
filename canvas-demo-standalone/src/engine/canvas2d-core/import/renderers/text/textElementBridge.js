import { normalizeTextElement, TEXT_STRUCTURED_IMPORT_KIND } from "../../../elements/text.js";
import { buildTextElementContentFields } from "./sharedTextRenderUtils.js";

export function buildStructuredTextElementFromRenderOperation(operation = {}, options = {}) {
  const element = operation?.element && typeof operation.element === "object" ? operation.element : {};
  const structure = operation?.structure && typeof operation.structure === "object" ? operation.structure : {};
  const meta = operation?.meta && typeof operation.meta === "object" ? operation.meta : {};
  const legacyPlainText = String(element?.plainText || element?.text || "");
  const hasLegacyContent = Boolean(String(element?.html || "").trim() || legacyPlainText.trim());
  const content = buildTextElementContentFields(
    {
      html: String(element?.html || ""),
      plainText: legacyPlainText,
      text: String(element?.text || legacyPlainText),
      richTextDocument:
        !hasLegacyContent && element?.richTextDocument && typeof element.richTextDocument === "object"
          ? element.richTextDocument
          : null,
      fontSize: Number(element?.fontSize) || 20,
    },
    {
      fontSize: Number(element?.fontSize) || 20,
    }
  );
  const nextElement = normalizeTextElement({
    ...element,
    text: content.text,
    plainText: content.plainText,
    html: content.html,
    richTextDocument: content.richTextDocument,
    x: Number(options.x) || 0,
    y: Number(options.y) || 0,
    structuredImport: {
      kind: TEXT_STRUCTURED_IMPORT_KIND,
      blockRole: String(operation?.blockRole || structure?.listRole || "paragraph"),
      sourceNodeType: String(operation?.sourceNodeType || "paragraph"),
      listRole: String(structure?.listRole || ""),
      canonicalFragment: buildCanonicalFragment(operation, content),
      sourceMeta: {
        descriptorId: String(meta.descriptorId || ""),
        parserId: String(meta.parserId || ""),
      },
    },
  });
  return nextElement;
}

function buildCanonicalFragment(operation = {}, content = {}) {
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
    html: String(content?.html || operation?.element?.html || ""),
    plainText: String(content?.plainText || operation?.element?.plainText || operation?.element?.text || ""),
  };
}
