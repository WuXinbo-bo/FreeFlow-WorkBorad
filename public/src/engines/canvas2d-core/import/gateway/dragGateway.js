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

    const collected = collectDragEntries(dataTransfer, { internalClipboardMime });
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

function collectDragEntries(dataTransfer, { internalClipboardMime }) {
  const entries = [];
  const mimeTypes = normalizeStringList(dataTransfer?.types);
  const files = Array.from(dataTransfer?.files || []);
  let entryIndex = 0;

  for (const file of files) {
    entries.push(createFileEntry(file, `drag-file-${entryIndex++}`));
  }

  for (const mimeType of mimeTypes) {
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
