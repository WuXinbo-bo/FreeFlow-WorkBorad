import {
  getTextMinSize,
  normalizeTextResizeMode,
  TEXT_RESIZE_MODE_WRAP,
} from "../elements/text.js";
import { htmlToPlainText, normalizeRichHtml, sanitizeText } from "../utils.js";

function buildExportReadyTextItem(item) {
  if (!item || item.type !== "text") {
    return item;
  }
  const html = normalizeRichHtml(item.html || "");
  const plainText = sanitizeText(item.plainText || item.text || htmlToPlainText(html));
  const resizeMode = normalizeTextResizeMode(item.textResizeMode, item.wrapMode);
  const nextSize = getTextMinSize(
    {
      ...item,
      html,
      plainText,
      text: plainText,
      textResizeMode: resizeMode,
    },
    {
      widthHint: resizeMode === TEXT_RESIZE_MODE_WRAP ? Number(item.width || 0) || undefined : undefined,
      fontSize: item.fontSize,
    }
  );
  const nextWidth =
    resizeMode === TEXT_RESIZE_MODE_WRAP
      ? Math.max(80, Number(item.width || 0) || nextSize.width)
      : Math.max(80, Number(nextSize?.width || 0) || 80);
  const nextHeight = Math.max(40, Number(nextSize?.height || 0) || 40);
  if (
    item.html === html &&
    item.plainText === plainText &&
    item.text === plainText &&
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
