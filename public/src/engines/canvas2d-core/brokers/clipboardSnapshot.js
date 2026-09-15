import { parseRichTextClipboardPayload, RICH_TEXT_CLIPBOARD_MIME } from "../textClipboard/richTextClipboard.js";

// DataTransfer is only readable during the native event. Keep every MIME value
// before any await, including selection metadata and internal copy identity.
export function createClipboardDataTransferSnapshot(dataTransfer) {
  const data = {};
  const types = Array.from(new Set([
    ...Array.from(dataTransfer?.types || []),
    "text/plain", "text/html", "text/markdown", "text/x-markdown", "text/uri-list", RICH_TEXT_CLIPBOARD_MIME,
  ]));
  for (const type of types) {
    try {
      const value = String(dataTransfer?.getData?.(type) || "");
      if (value) data[type] = value;
    } catch {
      // One unavailable format must not discard other representations.
    }
  }
  const rich = parseRichTextClipboardPayload(data[RICH_TEXT_CLIPBOARD_MIME] || "");
  const text = data["text/plain"] || data.text || rich?.plainText || "";
  const html = rich?.html || data["text/html"] || "";
  if (text) data["text/plain"] = text;
  if (html) data["text/html"] = html;
  return {
    data,
    text,
    html,
    markdown: data["text/markdown"] || data["text/x-markdown"] || "",
    uriList: data["text/uri-list"] || "",
    types: Object.keys(data),
    files: Array.from(dataTransfer?.files || []),
    dropEffect: dataTransfer?.dropEffect || "",
    effectAllowed: dataTransfer?.effectAllowed || "",
  };
}

export function createClipboardDataTransferFacade(snapshot = {}) {
  const data = {
    "text/plain": snapshot.text || "",
    "text/html": snapshot.html || "",
    "text/markdown": snapshot.markdown || "",
    "text/uri-list": snapshot.uriList || "",
    ...snapshot.data,
  };
  return {
    files: snapshot.files || [],
    types: Object.keys(data).filter((type) => data[type]),
    dropEffect: snapshot.dropEffect || "",
    effectAllowed: snapshot.effectAllowed || "",
    getData: (type) => String(data[type] || (type === "text" ? data["text/plain"] : "") || ""),
  };
}
