import { INPUT_CHANNELS } from "../protocols/inputDescriptor.js";
import { createPasteGateway } from "./pasteGateway.js";

export function createContextMenuPasteAdapter(options = {}) {
  const pasteGateway = options.pasteGateway || createPasteGateway(options);
  const readClipboardText = asAsyncFunction(options.readClipboardText);
  const readClipboardFiles = asAsyncFunction(options.readClipboardFiles);
  const readClipboardHtml = asAsyncFunction(options.readClipboardHtml);
  const readClipboardMarkdown = asAsyncFunction(options.readClipboardMarkdown);
  const readClipboardUriList = asAsyncFunction(options.readClipboardUriList);
  const getInternalPayload = asAsyncFunction(options.getInternalPayload);

  async function readSnapshot(context = {}) {
    const [
      text,
      filePaths,
      html,
      markdown,
      uriList,
      internalPayload,
    ] = await Promise.all([
      readClipboardText(),
      readClipboardFiles(),
      readClipboardHtml(),
      readClipboardMarkdown(),
      readClipboardUriList(),
      getInternalPayload(),
    ]);

    return {
      text: stringOrEmpty(text),
      html: stringOrEmpty(html),
      markdown: stringOrEmpty(markdown),
      uriList: stringOrEmpty(uriList),
      filePaths: normalizeStringArray(filePaths),
      internalPayload: internalPayload || null,
      sourceApp: stringOrEmpty(context.sourceApp),
      sourceUrl: stringOrEmpty(context.sourceUrl),
      sourceFilePath: stringOrEmpty(context.sourceFilePath),
    };
  }

  async function createDescriptor(context = {}) {
    const snapshot = await readSnapshot(context);
    return pasteGateway.fromSystemClipboardSnapshot(snapshot, {
      ...context,
      channel: INPUT_CHANNELS.PASTE_CONTEXT_MENU,
    });
  }

  return {
    readSnapshot,
    createDescriptor,
  };
}

function asAsyncFunction(value) {
  if (typeof value === "function") {
    return async () => value();
  }
  return async () => null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}
