import { normalizeRichTextDocument as normalizeRichTextDocumentValue } from "./richTextDocument.js";
import { normalizeTextContentModel } from "./textContentModel.js";
export {
  LEGACY_TEXT_RESIZE_MODE_AUTO_WIDTH,
  LEGACY_TEXT_RESIZE_MODE_WRAP,
  TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
  TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH,
  TEXT_BOX_LAYOUT_MODE_FIXED_SIZE,
  coerceInteractiveTextBoxLayoutMode,
  normalizeLegacyTextResizeMode,
  normalizeTextBoxLayoutMode,
  normalizeTextBoxLayoutModel,
  toLegacyTextResizeMode,
} from "./textBoxLayoutModel.js";
export {
  RICH_TEXT_BLOCK_TYPES,
  RICH_TEXT_DOCUMENT_KIND,
  RICH_TEXT_DOCUMENT_VERSION,
  RICH_TEXT_INLINE_NODE_TYPES,
  RICH_TEXT_MARK_TYPES,
  createRichTextBlock,
  createRichTextDocument,
  createRichTextDocumentFromHtml,
  createRichTextFragmentFromHtml,
  createRichTextTextNode,
  isSemanticRichTextBlock,
  normalizeRichTextBlock,
  normalizeRichTextBlockType,
  normalizeRichTextInlineNode,
  normalizeRichTextInlineNodeType,
  normalizeRichTextMark,
  serializeRichTextBlockToHtml,
  serializeRichTextBlockToPlainText,
  serializeRichTextBlocksToHtml,
  serializeRichTextBlocksToPlainText,
  serializeRichTextDocumentToHtml,
  serializeRichTextDocumentToPlainText,
  serializeRichTextInlineNodeToHtml,
  serializeRichTextInlineNodesToHtml,
  serializeRichTextInlineNodesToPlainText,
} from "./richTextDocument.js";

export function normalizeRichTextDocument(value = null, fallback = {}) {
  return normalizeRichTextDocumentValue(value, fallback);
}

export function resolveTextContentFromModel(input = {}) {
  return normalizeTextContentModel(input, input);
}
