import {
  INPUT_DESCRIPTOR_STATUS,
  INPUT_ENTRY_KINDS,
  INPUT_ERROR_CODES,
  INPUT_SOURCE_KINDS,
  createInputDescriptor,
  validateInputDescriptor,
} from "../protocols/inputDescriptor.js";
import { detectTextContentType } from "./contentTypeDetector.js";

export const DEFAULT_INTERNAL_CLIPBOARD_MIME = "application/x-freeflow-canvas";

export function createDescriptorFromCollection(collected, options) {
  const entries = Array.isArray(collected?.entries) ? collected.entries.filter(Boolean) : [];
  const status = entries.length ? INPUT_DESCRIPTOR_STATUS.READY : INPUT_DESCRIPTOR_STATUS.UNSUPPORTED;
  const errorCode = entries.length ? INPUT_ERROR_CODES.NONE : INPUT_ERROR_CODES.EMPTY_INPUT;
  const sourceKind = inferSourceKind(entries);
  const tags = buildTags(entries, options.channel);

  return createInputDescriptor({
    descriptorId: options.descriptorId,
    channel: options.channel,
    sourceKind,
    status,
    errorCode,
    sourceApp: options.sourceApp,
    sourceUrl: options.sourceUrl,
    sourceFilePath: options.sourceFilePath,
    mimeTypes: normalizeStringList(collected?.mimeTypes),
    tags,
    context: buildContext(options.context),
    entries,
  });
}

export function finalizeDescriptor(descriptor) {
  const result = validateInputDescriptor(descriptor);
  if (result.ok) {
    return descriptor;
  }
  return createInputDescriptor({
    ...descriptor,
    status: INPUT_DESCRIPTOR_STATUS.ERROR,
    errorCode: INPUT_ERROR_CODES.INVALID_DESCRIPTOR,
    diagnostics: result.issues.map((message) => ({
      level: "error",
      message,
    })),
  });
}

export function createErrorDescriptor({ descriptorId, channel, context, errorCode }) {
  return createInputDescriptor({
    descriptorId,
    channel,
    sourceKind: INPUT_SOURCE_KINDS.UNKNOWN,
    status: INPUT_DESCRIPTOR_STATUS.ERROR,
    errorCode,
    context: buildContext(context),
    entries: [],
  });
}

export function createEntryFromMimeType({ mimeType, value, entryId, internalClipboardMime }) {
  const safeMimeType = String(mimeType || "").trim().toLowerCase();
  const safeValue = typeof value === "string" ? value : "";
  if (!safeMimeType) {
    return null;
  }
  if (safeMimeType === internalClipboardMime) {
    return createInternalPayloadEntry(parseJsonSafely(safeValue), entryId, safeMimeType);
  }
  if (safeMimeType === "text/html") {
    return createForcedPlainTextEntry(entryId, safeMimeType, safeValue, {
      html: safeValue,
    });
  }
  if (safeMimeType === "text/plain" || safeMimeType === "text") {
    return createTextLikeEntry(entryId, safeMimeType, safeValue);
  }
  if (safeMimeType === "text/markdown" || safeMimeType === "text/x-markdown") {
    return createForcedPlainTextEntry(entryId, safeMimeType, safeValue, {
      markdown: safeValue,
    });
  }
  if (safeMimeType === "text/uri-list") {
    return {
      entryId,
      kind: INPUT_ENTRY_KINDS.URI,
      status: safeValue ? INPUT_DESCRIPTOR_STATUS.READY : INPUT_DESCRIPTOR_STATUS.PARTIAL,
      errorCode: safeValue ? INPUT_ERROR_CODES.NONE : INPUT_ERROR_CODES.MISSING_RAW_PAYLOAD,
      mimeType: safeMimeType,
      name: "",
      size: safeValue.length || null,
      charset: "utf-8",
      raw: {
        uri: safeValue,
      },
      meta: {
        isExternal: true,
      },
    };
  }
  if (safeMimeType.startsWith("image/")) {
    return {
      entryId,
      kind: INPUT_ENTRY_KINDS.IMAGE,
      status: INPUT_DESCRIPTOR_STATUS.PARTIAL,
      errorCode: INPUT_ERROR_CODES.UNSUPPORTED_MIME_TYPE,
      mimeType: safeMimeType,
      name: "",
      size: null,
      charset: "",
      raw: {},
      meta: {},
    };
  }
  return {
    entryId,
    kind: INPUT_ENTRY_KINDS.UNKNOWN,
    status: INPUT_DESCRIPTOR_STATUS.PARTIAL,
    errorCode: INPUT_ERROR_CODES.UNSUPPORTED_MIME_TYPE,
    mimeType: safeMimeType,
    name: "",
    size: safeValue.length || null,
    charset: safeValue ? "utf-8" : "",
    raw: safeValue ? { text: safeValue } : {},
    meta: {},
  };
}

export function createFileEntry(file, entryId) {
  const name = typeof file?.name === "string" ? file.name : "";
  const mimeType = typeof file?.type === "string" ? file.type : "";
  const filePath = typeof file?.path === "string" ? file.path : "";
  const size = Number.isFinite(file?.size) ? Number(file.size) : null;
  const kind = mimeType.startsWith("image/") ? INPUT_ENTRY_KINDS.IMAGE : INPUT_ENTRY_KINDS.FILE;
  return {
    entryId,
    kind,
    status: name || filePath ? INPUT_DESCRIPTOR_STATUS.READY : INPUT_DESCRIPTOR_STATUS.PARTIAL,
    errorCode: name || filePath ? INPUT_ERROR_CODES.NONE : INPUT_ERROR_CODES.MISSING_RAW_PAYLOAD,
    mimeType,
    name,
    size,
    charset: "",
    raw: {
      filePath,
    },
    meta: {
      extension: extensionFromName(name),
      displayName: name || basenameFromPath(filePath),
      isFromClipboardFile: true,
    },
  };
}

export function createInternalPayloadEntry(payload, entryId, mimeType) {
  return {
    entryId,
    kind: INPUT_ENTRY_KINDS.INTERNAL_PAYLOAD,
    status: payload ? INPUT_DESCRIPTOR_STATUS.READY : INPUT_DESCRIPTOR_STATUS.PARTIAL,
    errorCode: payload ? INPUT_ERROR_CODES.NONE : INPUT_ERROR_CODES.MISSING_RAW_PAYLOAD,
    mimeType,
    name: "",
    size: null,
    charset: "",
    raw: {
      internalPayload: payload,
    },
    meta: {},
  };
}

export function normalizeStringList(listLike) {
  if (!listLike || typeof listLike[Symbol.iterator] !== "function") {
    return [];
  }
  return Array.from(listLike)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

export function safeGetData(dataTransfer, mimeType) {
  try {
    return dataTransfer.getData(mimeType) || "";
  } catch {
    return "";
  }
}

export function buildContext(context = {}) {
  return {
    origin: stringOrEmpty(context.origin),
    boardId: stringOrEmpty(context.boardId),
    targetElementId: stringOrEmpty(context.targetElementId),
    targetMode: stringOrEmpty(context.targetMode),
    pointer: normalizePointer(context.pointer || context.anchor || null),
  };
}

export function defaultCreateDescriptorId(prefix) {
  return `${prefix || "entry"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTextLikeEntry(entryId, mimeType, value) {
  const normalized = String(value || "");
  const detected = detectTextContentType(normalized);
  void detected;
  return createForcedPlainTextEntry(entryId, mimeType, normalized);
}

function createForcedPlainTextEntry(entryId, mimeType, value, extraRaw = {}) {
  const normalized = String(value || "");
  return {
    entryId,
    kind: INPUT_ENTRY_KINDS.TEXT,
    status: normalized ? INPUT_DESCRIPTOR_STATUS.READY : INPUT_DESCRIPTOR_STATUS.PARTIAL,
    errorCode: normalized ? INPUT_ERROR_CODES.NONE : INPUT_ERROR_CODES.MISSING_RAW_PAYLOAD,
    mimeType,
    name: "",
    size: normalized.length || null,
    charset: "utf-8",
    raw: {
      text: normalized,
      ...extraRaw,
    },
    meta: {},
  };
}

function inferSourceKind(entries) {
  const kinds = new Set((entries || []).map((entry) => entry.kind));
  if (!kinds.size) {
    return INPUT_SOURCE_KINDS.UNKNOWN;
  }
  if (kinds.size > 1) {
    return INPUT_SOURCE_KINDS.MIXED;
  }
  if (kinds.has(INPUT_ENTRY_KINDS.HTML)) return INPUT_SOURCE_KINDS.HTML;
  if (kinds.has(INPUT_ENTRY_KINDS.MARKDOWN)) return INPUT_SOURCE_KINDS.MARKDOWN;
  if (kinds.has(INPUT_ENTRY_KINDS.CODE)) return INPUT_SOURCE_KINDS.CODE;
  if (kinds.has(INPUT_ENTRY_KINDS.MATH)) return INPUT_SOURCE_KINDS.MATH_FORMULA;
  if (kinds.has(INPUT_ENTRY_KINDS.IMAGE)) return INPUT_SOURCE_KINDS.IMAGE_RESOURCE;
  if (kinds.has(INPUT_ENTRY_KINDS.FILE)) return INPUT_SOURCE_KINDS.FILE_RESOURCE;
  if (kinds.has(INPUT_ENTRY_KINDS.INTERNAL_PAYLOAD)) return INPUT_SOURCE_KINDS.INTERNAL_ITEMS;
  if (kinds.has(INPUT_ENTRY_KINDS.URI)) return INPUT_SOURCE_KINDS.URI_LIST;
  if (kinds.has(INPUT_ENTRY_KINDS.TEXT)) return INPUT_SOURCE_KINDS.PLAIN_TEXT;
  return INPUT_SOURCE_KINDS.UNKNOWN;
}

function buildTags(entries, channel) {
  const tags = [channel];
  if ((entries || []).some((entry) => entry.kind === INPUT_ENTRY_KINDS.INTERNAL_PAYLOAD)) {
    tags.push("contains-internal-payload");
  }
  if ((entries || []).some((entry) => entry.kind === INPUT_ENTRY_KINDS.FILE)) {
    tags.push("contains-file");
  }
  if ((entries || []).some((entry) => entry.kind === INPUT_ENTRY_KINDS.IMAGE)) {
    tags.push("contains-image");
  }
  return tags;
}

function normalizePointer(pointer) {
  if (!pointer || typeof pointer !== "object") {
    return null;
  }
  const x = Number(pointer.x);
  const y = Number(pointer.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

function parseJsonSafely(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

function basenameFromPath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || "";
}

function extensionFromName(name) {
  const fileName = String(name || "");
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index) : "";
}
