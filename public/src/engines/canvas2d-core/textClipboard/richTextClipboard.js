import {
  createRichTextDocumentFromHtml,
  createRichTextFragmentFromHtml,
  normalizeRichTextDocument,
  serializeRichTextDocumentToHtml,
  serializeRichTextDocumentToPlainText,
} from "../textModel/richTextDocument.js";
import { normalizeRichHtmlInlineFontSizes, sanitizeText } from "../utils.js";

export const RICH_TEXT_CLIPBOARD_MIME = "application/x-freeflow-rich-text";

function safeParseJson(value = "") {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function createRichTextClipboardPayload({
  html = "",
  plainText = "",
  baseFontSize = 20,
  source = "editor-selection",
  itemType = "text",
} = {}) {
  const normalizedHtml = normalizeRichHtmlInlineFontSizes(html, baseFontSize);
  const normalizedText = sanitizeText(plainText || "");
  const fragment = createRichTextFragmentFromHtml(normalizedHtml, normalizedText, {
    baseFontSize,
    source,
    itemType,
  });
  const documentValue = createRichTextDocumentFromHtml(normalizedHtml, normalizedText, {
    baseFontSize,
    source,
    itemType,
  });
  return {
    version: 1,
    kind: "freeflow-rich-text-clipboard",
    source,
    itemType,
    baseFontSize,
    fragment,
    document: documentValue,
    html: serializeRichTextDocumentToHtml(documentValue, normalizedHtml),
    plainText: serializeRichTextDocumentToPlainText(documentValue, normalizedText),
  };
}

export function stringifyRichTextClipboardPayload(payload = {}) {
  return JSON.stringify(payload);
}

export function parseRichTextClipboardPayload(raw = "") {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const documentValue = normalizeRichTextDocument(parsed.document || parsed.fragment, {
    html: parsed.html || "",
    plainText: parsed.plainText || "",
    baseFontSize: parsed.baseFontSize || 20,
  });
  return {
    version: Number(parsed.version) || 1,
    kind: "freeflow-rich-text-clipboard",
    source: String(parsed.source || "external"),
    itemType: String(parsed.itemType || "text"),
    baseFontSize: Number(parsed.baseFontSize || 20) || 20,
    fragment: parsed.fragment && typeof parsed.fragment === "object" ? parsed.fragment : null,
    document: documentValue,
    html: serializeRichTextDocumentToHtml(documentValue, parsed.html || ""),
    plainText: serializeRichTextDocumentToPlainText(documentValue, parsed.plainText || ""),
  };
}

export function readRichTextClipboardPayload(dataTransfer) {
  if (!dataTransfer || typeof dataTransfer.getData !== "function") {
    return null;
  }
  const raw = dataTransfer.getData(RICH_TEXT_CLIPBOARD_MIME);
  return parseRichTextClipboardPayload(raw);
}
