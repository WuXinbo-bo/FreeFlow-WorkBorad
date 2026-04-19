import {
  INPUT_CHANNELS,
  INPUT_ERROR_CODES,
} from "../protocols/inputDescriptor.js";
import {
  DEFAULT_INTERNAL_CLIPBOARD_MIME,
  createDescriptorFromCollection,
  createEntryFromMimeType,
  createErrorDescriptor,
  createFileEntry,
  createInternalPayloadEntry,
  defaultCreateDescriptorId,
  finalizeDescriptor,
  normalizeStringList,
  safeGetData,
} from "./sharedEntryBuilders.js";

export function createPasteGateway(options = {}) {
  const internalClipboardMime =
    typeof options.internalClipboardMime === "string" && options.internalClipboardMime.trim()
      ? options.internalClipboardMime.trim()
      : DEFAULT_INTERNAL_CLIPBOARD_MIME;
  const createDescriptorId =
    typeof options.createDescriptorId === "function"
      ? options.createDescriptorId
      : defaultCreateDescriptorId;

  function fromClipboardEvent(event, context = {}) {
    const clipboardData = event?.clipboardData || null;
    return fromClipboardData(clipboardData, {
      ...context,
      channel: INPUT_CHANNELS.PASTE_NATIVE,
    });
  }

  function fromClipboardData(clipboardData, context = {}) {
    if (!clipboardData) {
      return createErrorDescriptor({
        descriptorId: createDescriptorId("paste"),
        channel: context.channel || INPUT_CHANNELS.PASTE_NATIVE,
        context,
        errorCode: INPUT_ERROR_CODES.READ_FAILED,
      });
    }

    const collected = collectClipboardEntries(clipboardData, { internalClipboardMime });
    const descriptor = createDescriptorFromCollection(collected, {
      descriptorId: createDescriptorId("paste"),
      channel: context.channel || INPUT_CHANNELS.PASTE_NATIVE,
      sourceApp: context.sourceApp || "",
      sourceUrl: context.sourceUrl || "",
      sourceFilePath: context.sourceFilePath || "",
      context,
    });
    return finalizeDescriptor(descriptor);
  }

  function fromSystemClipboardSnapshot(snapshot = {}, context = {}) {
    const collected = collectSnapshotEntries(snapshot, { internalClipboardMime });
    const descriptor = createDescriptorFromCollection(collected, {
      descriptorId: createDescriptorId("paste-system"),
      channel: context.channel || INPUT_CHANNELS.PASTE_CONTEXT_MENU,
      sourceApp: snapshot.sourceApp || context.sourceApp || "",
      sourceUrl: snapshot.sourceUrl || context.sourceUrl || "",
      sourceFilePath: snapshot.sourceFilePath || context.sourceFilePath || "",
      context,
    });

    return finalizeDescriptor(descriptor);
  }

  return {
    fromClipboardEvent,
    fromClipboardData,
    fromSystemClipboardSnapshot,
  };
}

function collectClipboardEntries(clipboardData, { internalClipboardMime }) {
  const entries = [];
  const mimeTypes = normalizeStringList(clipboardData?.types);
  const files = Array.from(clipboardData?.files || []);
  let entryIndex = 0;

  for (const mimeType of mimeTypes) {
    const rawValue = safeGetData(clipboardData, mimeType);
    const maybeEntry = createEntryFromMimeType({
      mimeType,
      value: rawValue,
      entryId: `clipboard-${entryIndex++}`,
      internalClipboardMime,
    });
    if (maybeEntry) {
      entries.push(maybeEntry);
    }
  }

  for (const file of files) {
    entries.push(createFileEntry(file, `clipboard-file-${entryIndex++}`));
  }

  return {
    entries,
    mimeTypes,
  };
}

function collectSnapshotEntries(snapshot, { internalClipboardMime }) {
  const entries = [];
  const mimeTypes = [];
  let entryIndex = 0;

  if (snapshot.html) {
    mimeTypes.push("text/html");
    entries.push(
      createEntryFromMimeType({
        mimeType: "text/html",
        value: snapshot.html,
        entryId: `snapshot-${entryIndex++}`,
        internalClipboardMime,
      })
    );
  }
  if (snapshot.markdown) {
    mimeTypes.push("text/markdown");
    entries.push(
      createEntryFromMimeType({
        mimeType: "text/markdown",
        value: snapshot.markdown,
        entryId: `snapshot-${entryIndex++}`,
        internalClipboardMime,
      })
    );
  }
  if (snapshot.text) {
    mimeTypes.push("text/plain");
    entries.push(
      createEntryFromMimeType({
        mimeType: "text/plain",
        value: snapshot.text,
        entryId: `snapshot-${entryIndex++}`,
        internalClipboardMime,
      })
    );
  }
  if (snapshot.uriList) {
    mimeTypes.push("text/uri-list");
    entries.push(
      createEntryFromMimeType({
        mimeType: "text/uri-list",
        value: snapshot.uriList,
        entryId: `snapshot-${entryIndex++}`,
        internalClipboardMime,
      })
    );
  }
  if (snapshot.internalPayload) {
    mimeTypes.push(internalClipboardMime);
    entries.push(
      createInternalPayloadEntry(snapshot.internalPayload, `snapshot-${entryIndex++}`, internalClipboardMime)
    );
  }
  const filePaths = Array.isArray(snapshot.filePaths) ? snapshot.filePaths : [];
  for (const filePath of filePaths) {
    entries.push(
      createFileEntry(
        {
          name: fileNameFromPath(filePath),
          path: filePath,
          type: "",
          size: null,
        },
        `snapshot-file-${entryIndex++}`
      )
    );
  }

  return {
    entries: entries.filter(Boolean),
    mimeTypes,
  };
}

function fileNameFromPath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || "";
}

export { DEFAULT_INTERNAL_CLIPBOARD_MIME };
