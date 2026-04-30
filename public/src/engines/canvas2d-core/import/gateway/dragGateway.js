import { INPUT_CHANNELS, INPUT_ERROR_CODES } from "../protocols/inputDescriptor.js";
import {
  DEFAULT_INTERNAL_CLIPBOARD_MIME,
  createDescriptorFromCollection,
  createEntryFromMimeType,
  createErrorDescriptor,
  createFileEntry,
  defaultCreateDescriptorId,
  finalizeDescriptor,
  normalizeStringList,
  safeGetData,
} from "./sharedEntryBuilders.js";

export function createDragGateway(options = {}) {
  const internalClipboardMime =
    typeof options.internalClipboardMime === "string" && options.internalClipboardMime.trim()
      ? options.internalClipboardMime.trim()
      : DEFAULT_INTERNAL_CLIPBOARD_MIME;
  const createDescriptorId =
    typeof options.createDescriptorId === "function"
      ? options.createDescriptorId
      : defaultCreateDescriptorId;

  function fromDropEvent(event, context = {}) {
    const dataTransfer = event?.dataTransfer || null;
    return fromDataTransfer(dataTransfer, {
      ...context,
      channel: INPUT_CHANNELS.DRAG_DROP,
      dropEffect: event?.dataTransfer?.dropEffect || context.dropEffect || "",
      effectAllowed: event?.dataTransfer?.effectAllowed || context.effectAllowed || "",
    });
  }

  function fromDataTransfer(dataTransfer, context = {}) {
    if (!dataTransfer) {
      return createErrorDescriptor({
        descriptorId: createDescriptorId("drag"),
        channel: context.channel || INPUT_CHANNELS.DRAG_DROP,
        context,
        errorCode: INPUT_ERROR_CODES.READ_FAILED,
      });
    }

    const collected = collectDragEntries(dataTransfer, {
      internalClipboardMime,
      preferHtmlText: context.preferHtmlText !== false,
    });
    const descriptor = createDescriptorFromCollection(collected, {
      descriptorId: createDescriptorId("drag"),
      channel: context.channel || INPUT_CHANNELS.DRAG_DROP,
      sourceApp: context.sourceApp || "",
      sourceUrl: context.sourceUrl || "",
      sourceFilePath: context.sourceFilePath || "",
      context,
    });

    if (context.dropEffect || context.effectAllowed) {
      descriptor.diagnostics = [
        ...(Array.isArray(descriptor.diagnostics) ? descriptor.diagnostics : []),
        {
          level: "info",
          message: `dropEffect=${context.dropEffect || ""}; effectAllowed=${context.effectAllowed || ""}`,
        },
      ];
    }

    return finalizeDescriptor(descriptor);
  }

  return {
    fromDropEvent,
    fromDataTransfer,
  };
}

function collectDragEntries(dataTransfer, { internalClipboardMime, preferHtmlText = true }) {
  const entries = [];
  const mimeTypes = normalizeStringList(dataTransfer?.types);
  const files = Array.from(dataTransfer?.files || []);
  let entryIndex = 0;

  for (const file of files) {
    entries.push(createFileEntry(file, `drag-file-${entryIndex++}`));
  }

  if (files.length) {
    return {
      entries,
      mimeTypes,
    };
  }

  const orderedMimeTypes = orderDragMimeTypes(mimeTypes, dataTransfer, { preferHtmlText });
  for (const mimeType of orderedMimeTypes) {
    const rawValue = safeGetData(dataTransfer, mimeType);
    const maybeEntry = createEntryFromMimeType({
      mimeType,
      value: rawValue,
      entryId: `drag-${entryIndex++}`,
      internalClipboardMime,
    });
    if (maybeEntry) {
      entries.push(maybeEntry);
    }
  }

  return {
    entries,
    mimeTypes,
  };
}

function orderDragMimeTypes(mimeTypes = [], dataTransfer, { preferHtmlText = true } = {}) {
  const normalized = normalizeStringList(mimeTypes);
  if (!preferHtmlText || !normalized.includes("text/html")) {
    return normalized;
  }
  const html = safeGetData(dataTransfer, "text/html");
  if (!looksLikeRichDraggedHtml(html)) {
    return normalized;
  }
  const priority = new Map([
    ["text/html", 0],
    [internalSafeMime("text/plain"), 1],
    [internalSafeMime("text"), 2],
  ]);
  return normalized.slice().sort((left, right) => {
    const leftRank = priority.has(left) ? priority.get(left) : 10;
    const rightRank = priority.has(right) ? priority.get(right) : 10;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return 0;
  });
}

function internalSafeMime(value = "") {
  return String(value || "").trim().toLowerCase();
}

function looksLikeRichDraggedHtml(value = "") {
  const html = String(value || "").trim();
  if (!html) {
    return false;
  }
  return /<\/?[a-z][\s\S]*>/i.test(html) && /<(?:span|strong|b|em|i|u|s|a|p|div|section|article|ul|ol|li|h[1-6]|blockquote|pre|table|img)\b/i.test(html);
}
