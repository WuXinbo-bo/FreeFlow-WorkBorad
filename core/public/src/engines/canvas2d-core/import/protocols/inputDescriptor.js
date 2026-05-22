const INPUT_DESCRIPTOR_VERSION = "1.0.0";

const INPUT_CHANNELS = Object.freeze({
  PASTE_NATIVE: "paste-native",
  PASTE_CONTEXT_MENU: "paste-context-menu",
  DRAG_DROP: "drag-drop",
  INTERNAL_COPY: "internal-copy",
  PROGRAMMATIC: "programmatic",
});

const INPUT_DESCRIPTOR_STATUS = Object.freeze({
  READY: "ready",
  PARTIAL: "partial",
  UNSUPPORTED: "unsupported",
  ERROR: "error",
});

const INPUT_SOURCE_KINDS = Object.freeze({
  PLAIN_TEXT: "plain-text",
  HTML: "html",
  MARKDOWN: "markdown",
  CODE: "code",
  MATH_FORMULA: "math-formula",
  IMAGE_RESOURCE: "image-resource",
  FILE_RESOURCE: "file-resource",
  INTERNAL_ITEMS: "internal-items",
  URI_LIST: "uri-list",
  MIXED: "mixed",
  UNKNOWN: "unknown",
});

const INPUT_ENTRY_KINDS = Object.freeze({
  TEXT: "text",
  HTML: "html",
  MARKDOWN: "markdown",
  CODE: "code",
  MATH: "math",
  IMAGE: "image",
  FILE: "file",
  URI: "uri",
  INTERNAL_PAYLOAD: "internal-payload",
  BINARY: "binary",
  UNKNOWN: "unknown",
});

const INPUT_ERROR_CODES = Object.freeze({
  NONE: "none",
  EMPTY_INPUT: "empty-input",
  READ_FAILED: "read-failed",
  UNSUPPORTED_CHANNEL: "unsupported-channel",
  UNSUPPORTED_SOURCE_KIND: "unsupported-source-kind",
  UNSUPPORTED_MIME_TYPE: "unsupported-mime-type",
  INVALID_DESCRIPTOR: "invalid-descriptor",
  INVALID_ENTRY: "invalid-entry",
  MISSING_RAW_PAYLOAD: "missing-raw-payload",
  FILE_ACCESS_FAILED: "file-access-failed",
  CLIPBOARD_PERMISSION_DENIED: "clipboard-permission-denied",
  BRIDGE_UNAVAILABLE: "bridge-unavailable",
  PAYLOAD_TOO_LARGE: "payload-too-large",
});

function createInputDescriptor(partial) {
  const descriptor = {
    version: INPUT_DESCRIPTOR_VERSION,
    descriptorId: partial && partial.descriptorId ? String(partial.descriptorId) : "",
    channel: partial && partial.channel ? String(partial.channel) : INPUT_CHANNELS.PROGRAMMATIC,
    sourceKind: partial && partial.sourceKind ? String(partial.sourceKind) : INPUT_SOURCE_KINDS.UNKNOWN,
    status: partial && partial.status ? String(partial.status) : INPUT_DESCRIPTOR_STATUS.READY,
    errorCode: partial && partial.errorCode ? String(partial.errorCode) : INPUT_ERROR_CODES.NONE,
    createdAt:
      partial && partial.createdAt ? String(partial.createdAt) : new Date().toISOString(),
    sourceApp: partial && partial.sourceApp ? String(partial.sourceApp) : "",
    sourceUrl: partial && partial.sourceUrl ? String(partial.sourceUrl) : "",
    sourceFilePath: partial && partial.sourceFilePath ? String(partial.sourceFilePath) : "",
    mimeTypes: normalizeStringList(partial && partial.mimeTypes),
    tags: normalizeStringList(partial && partial.tags),
    diagnostics: Array.isArray(partial && partial.diagnostics) ? partial.diagnostics.slice() : [],
    context: normalizeContext(partial && partial.context),
    entries: normalizeEntries(partial && partial.entries),
  };
  return descriptor;
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map(normalizeEntry);
}

function normalizeEntry(entry, index) {
  const safeEntry = entry || {};
  return {
    entryId: safeEntry.entryId ? String(safeEntry.entryId) : `entry-${index || 0}`,
    kind: safeEntry.kind ? String(safeEntry.kind) : INPUT_ENTRY_KINDS.UNKNOWN,
    status: safeEntry.status ? String(safeEntry.status) : INPUT_DESCRIPTOR_STATUS.READY,
    errorCode: safeEntry.errorCode ? String(safeEntry.errorCode) : INPUT_ERROR_CODES.NONE,
    mimeType: safeEntry.mimeType ? String(safeEntry.mimeType) : "",
    name: safeEntry.name ? String(safeEntry.name) : "",
    size: Number.isFinite(safeEntry.size) ? safeEntry.size : null,
    charset: safeEntry.charset ? String(safeEntry.charset) : "",
    raw: normalizeRawPayload(safeEntry.raw),
    meta: normalizeMeta(safeEntry.meta),
  };
}

function normalizeRawPayload(raw) {
  const safeRaw = raw || {};
  return {
    text: ensureString(safeRaw.text),
    html: ensureString(safeRaw.html),
    markdown: ensureString(safeRaw.markdown),
    code: ensureString(safeRaw.code),
    latex: ensureString(safeRaw.latex),
    mathml: ensureString(safeRaw.mathml),
    officeFormula: ensureString(safeRaw.officeFormula),
    uri: ensureString(safeRaw.uri),
    filePath: ensureString(safeRaw.filePath),
    imageDataUrl: ensureString(safeRaw.imageDataUrl),
    internalPayload: safeRaw.internalPayload || null,
    binaryBase64: ensureString(safeRaw.binaryBase64),
  };
}

function normalizeMeta(meta) {
  const safeMeta = meta || {};
  return {
    language: ensureString(safeMeta.language),
    extension: ensureString(safeMeta.extension),
    title: ensureString(safeMeta.title),
    displayName: ensureString(safeMeta.displayName),
    isExternal: Boolean(safeMeta.isExternal),
    isFromClipboardFile: Boolean(safeMeta.isFromClipboardFile),
  };
}

function normalizeContext(context) {
  const safeContext = context || {};
  return {
    origin: ensureString(safeContext.origin),
    boardId: ensureString(safeContext.boardId),
    targetElementId: ensureString(safeContext.targetElementId),
    targetMode: ensureString(safeContext.targetMode),
    pointer: normalizePointer(safeContext.pointer),
  };
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

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => ensureString(item))
    .filter(Boolean);
}

function ensureString(value) {
  return typeof value === "string" ? value : "";
}

function validateInputDescriptor(descriptor) {
  const issues = [];
  if (!descriptor || typeof descriptor !== "object") {
    return {
      ok: false,
      issues: ["descriptor must be an object"],
    };
  }
  if (descriptor.version !== INPUT_DESCRIPTOR_VERSION) {
    issues.push(`version must be ${INPUT_DESCRIPTOR_VERSION}`);
  }
  if (!hasEnumValue(INPUT_CHANNELS, descriptor.channel)) {
    issues.push(`unsupported channel: ${descriptor.channel}`);
  }
  if (!hasEnumValue(INPUT_SOURCE_KINDS, descriptor.sourceKind)) {
    issues.push(`unsupported sourceKind: ${descriptor.sourceKind}`);
  }
  if (!hasEnumValue(INPUT_DESCRIPTOR_STATUS, descriptor.status)) {
    issues.push(`unsupported status: ${descriptor.status}`);
  }
  if (!hasEnumValue(INPUT_ERROR_CODES, descriptor.errorCode)) {
    issues.push(`unsupported errorCode: ${descriptor.errorCode}`);
  }
  if (!Array.isArray(descriptor.entries)) {
    issues.push("entries must be an array");
  } else if (descriptor.entries.length === 0 && descriptor.status === INPUT_DESCRIPTOR_STATUS.READY) {
    issues.push("ready descriptor must include at least one entry");
  }

  if (Array.isArray(descriptor.entries)) {
    descriptor.entries.forEach((entry, index) => {
      validateEntry(entry, index, issues);
    });
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function validateEntry(entry, index, issues) {
  if (!entry || typeof entry !== "object") {
    issues.push(`entry[${index}] must be an object`);
    return;
  }
  if (!hasEnumValue(INPUT_ENTRY_KINDS, entry.kind)) {
    issues.push(`entry[${index}] unsupported kind: ${entry.kind}`);
  }
  if (!hasEnumValue(INPUT_DESCRIPTOR_STATUS, entry.status)) {
    issues.push(`entry[${index}] unsupported status: ${entry.status}`);
  }
  if (!hasEnumValue(INPUT_ERROR_CODES, entry.errorCode)) {
    issues.push(`entry[${index}] unsupported errorCode: ${entry.errorCode}`);
  }
  if (!entry.raw || typeof entry.raw !== "object") {
    issues.push(`entry[${index}] raw payload missing`);
    return;
  }
  if (!hasAnyRawPayload(entry.raw) && entry.status === INPUT_DESCRIPTOR_STATUS.READY) {
    issues.push(`entry[${index}] ready entry must provide raw payload`);
  }
}

function hasAnyRawPayload(raw) {
  return Boolean(
    raw.text ||
      raw.html ||
      raw.markdown ||
      raw.code ||
      raw.latex ||
      raw.mathml ||
      raw.officeFormula ||
      raw.uri ||
      raw.filePath ||
      raw.imageDataUrl ||
      raw.internalPayload ||
      raw.binaryBase64
  );
}

function hasEnumValue(enumObject, value) {
  return Object.values(enumObject).includes(value);
}

export {
  INPUT_CHANNELS,
  INPUT_DESCRIPTOR_STATUS,
  INPUT_DESCRIPTOR_VERSION,
  INPUT_ENTRY_KINDS,
  INPUT_ERROR_CODES,
  INPUT_SOURCE_KINDS,
  createInputDescriptor,
  validateInputDescriptor,
};

export default {
  INPUT_CHANNELS,
  INPUT_DESCRIPTOR_STATUS,
  INPUT_DESCRIPTOR_VERSION,
  INPUT_ENTRY_KINDS,
  INPUT_ERROR_CODES,
  INPUT_SOURCE_KINDS,
  createInputDescriptor,
  validateInputDescriptor,
};
