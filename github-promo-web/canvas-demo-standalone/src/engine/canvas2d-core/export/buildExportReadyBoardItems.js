import {
  coerceInteractiveTextBoxLayoutMode,
  deriveTextResizeModeFromLayoutMode,
  getTextMinSize,
  normalizeTextBoxLayoutMode,
  normalizeTextResizeMode,
  TEXT_RESIZE_MODE_WRAP,
} from "../elements/text.js";
import { htmlToPlainText, normalizeRichHtml, sanitizeText } from "../utils.js";
import { ensureRichTextDocumentFields } from "../textModel/richTextDocument.js";

function buildExportReadyTextItem(item) {
  if (!item || item.type !== "text") {
    return item;
  }
  const content = ensureRichTextDocumentFields(item, {
    html: item.html || "",
    plainText: item.plainText || item.text || "",
    fontSize: item.fontSize,
  });
  const html = normalizeRichHtml(content.html || "");
  const plainText = sanitizeText(content.plainText || item.text || htmlToPlainText(html));
  const textBoxLayoutMode = coerceInteractiveTextBoxLayoutMode(
    normalizeTextBoxLayoutMode(item.textBoxLayoutMode, item.textResizeMode, item.wrapMode)
  );
  const resizeMode = normalizeTextResizeMode(
    item.textResizeMode || deriveTextResizeModeFromLayoutMode(textBoxLayoutMode),
    item.wrapMode
  );
  const nextSize = getTextMinSize(
    {
      ...item,
      html,
      plainText,
      text: plainText,
      richTextDocument: content.richTextDocument,
      textBoxLayoutMode,
      textResizeMode: resizeMode,
    },
    {
      widthHint: resizeMode === TEXT_RESIZE_MODE_WRAP ? Number(item.width || 0) || undefined : undefined,
      heightHint: Number(item.height || 0) || undefined,
      fontSize: item.fontSize,
    }
  );
  const nextWidth =
    textBoxLayoutMode !== "auto-width"
      ? Math.max(80, Number(item.width || 0) || nextSize.width)
      : Math.max(80, Number(nextSize?.width || 0) || 80);
  const nextHeight =
    textBoxLayoutMode === "fixed-size"
      ? Math.max(40, Number(item.height || 0) || nextSize.height)
      : Math.max(40, Number(nextSize?.height || 0) || 40);
  if (
    item.html === html &&
    item.plainText === plainText &&
    item.text === plainText &&
    item.richTextDocument === content.richTextDocument &&
    item.textBoxLayoutMode === textBoxLayoutMode &&
    item.textResizeMode === resizeMode &&
    Number(item.width || 0) === nextWidth &&
    Number(item.height || 0) === nextHeight
  ) {
    return item;
  }
  return {
    ...item,
    html,
    plainText,
    text: plainText,
    richTextDocument: content.richTextDocument,
    textBoxLayoutMode,
    textResizeMode: resizeMode,
    width: nextWidth,
    height: nextHeight,
  };
}

export function buildExportReadyBoardItems(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }
  let changed = false;
  const nextItems = items.map((item) => {
    const nextItem = buildExportReadyTextItem(item);
    if (nextItem !== item) {
      changed = true;
    }
    return nextItem;
  });
  return changed ? nextItems : items;
}
