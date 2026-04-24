import {
  INPUT_DESCRIPTOR_STATUS,
  INPUT_ENTRY_KINDS,
  INPUT_ERROR_CODES,
  INPUT_SOURCE_KINDS,
  createInputDescriptor,
  validateInputDescriptor,
} from "../protocols/inputDescriptor.js";
import {
  detectTextContentType,
  DETECTED_TEXT_TYPES,
  CODE_ENTRY_STRATEGIES,
} from "./contentTypeDetector.js";
import {
  parseRichTextClipboardPayload,
  RICH_TEXT_CLIPBOARD_MIME,
} from "../../textClipboard/richTextClipboard.js";

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

export function createEntryFromMimeType({
  mimeType,
  value,
  entryId,
  internalClipboardMime,
  textDetectionOptions,
  codeEntryStrategy,
}) {
  const safeMimeType = String(mimeType || "").trim().toLowerCase();
  const safeValue = typeof value === "string" ? value : "";
  const normalizedTextDetectionOptions = normalizeTextDetectionOptions(
    textDetectionOptions,
    codeEntryStrategy
  );
  if (!safeMimeType) {
    return null;
  }
  if (safeMimeType === RICH_TEXT_CLIPBOARD_MIME) {
    const payload = parseRichTextClipboardPayload(safeValue);
    if (payload) {
      return createTypedTextEntry(entryId, safeMimeType, INPUT_ENTRY_KINDS.TEXT, payload.plainText || payload.html || "", {
        text: payload.plainText || "",
        html: payload.html || "",
      });
    }
  }
  if (safeMimeType === internalClipboardMime) {
    return createInternalPayloadEntry(parseJsonSafely(safeValue), entryId, safeMimeType);
  }
  if (safeMimeType === "text/html") {
    return createTypedTextEntry(entryId, safeMimeType, INPUT_ENTRY_KINDS.HTML, safeValue, {
      text: String(safeValue || ""),
      html: safeValue,
    });
  }
  if (safeMimeType === "text/plain" || safeMimeType === "text") {
    return createTextLikeEntry(
      entryId,
      safeMimeType,
      safeValue,
      normalizedTextDetectionOptions
    );
  }
  if (safeMimeType === "text/markdown" || safeMimeType === "text/x-markdown") {
    return createTypedTextEntry(entryId, safeMimeType, INPUT_ENTRY_KINDS.MARKDOWN, safeValue, {
      markdown: safeValue,
      text: safeValue,
    });
  }
  if (safeMimeType === "application/x-latex" || safeMimeType === "text/x-tex" || safeMimeType === "application/x-tex") {
    // Freeze native math entry: keep latex-like payload in markdown inline-code style.
    const markdownPayload = buildMathMarkdownPayload(safeValue);
    return createTypedTextEntry(
      entryId,
      safeMimeType,
      INPUT_ENTRY_KINDS.MARKDOWN,
      markdownPayload,
      {
        markdown: markdownPayload,
        text: safeValue,
      }
    );
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

function createTextLikeEntry(entryId, mimeType, value, detectionOptions = null) {
  const normalized = String(value || "");
  const detected = detectTextContentType(normalized, detectionOptions || undefined);
  const routed = resolveTextLikeDetectedKind(detected);
  if (routed === INPUT_ENTRY_KINDS.MARKDOWN) {
    const markdownPayload = buildDetectedMarkdownPayload(normalized, detected);
    return createTypedTextEntry(
      entryId,
      mimeType,
      INPUT_ENTRY_KINDS.MARKDOWN,
      markdownPayload,
      {
        markdown: markdownPayload,
        text: normalized,
      },
      detected
    );
  }
  if (routed === INPUT_ENTRY_KINDS.CODE) {
    return createTypedTextEntry(
      entryId,
      mimeType,
      INPUT_ENTRY_KINDS.CODE,
      normalized,
      {
        code: normalized,
        text: normalized,
      },
      detected
    );
  }
  if (routed === INPUT_ENTRY_KINDS.MATH) {
    return createTypedTextEntry(
      entryId,
      mimeType,
      INPUT_ENTRY_KINDS.MATH,
      normalized,
      {
        latex: normalized,
        text: normalized,
      },
      detected
    );
  }
  return createTypedTextEntry(entryId, mimeType, INPUT_ENTRY_KINDS.TEXT, normalized, {
    text: normalized,
  }, detected);
}

function resolveTextLikeDetectedKind(detected = null) {
  if (!detected || typeof detected !== "object") {
    return INPUT_ENTRY_KINDS.TEXT;
  }
  const detectedType = String(detected.type || "").toLowerCase();
  const confidence = String(detected.confidence || "").toLowerCase();
  const matchedRule = String(detected.matchedRule || "").toLowerCase();
  const entryKind = String(detected.entryKind || "").toLowerCase();
  const scores = detected.scores && typeof detected.scores === "object" ? detected.scores : {};
  const features = detected.features && typeof detected.features === "object" ? detected.features : {};
  const codeScore = Number(scores.code || 0);
  const markdownScore = Number(scores.markdown || 0);
  const mathScore = Number(scores.math || 0);
  const textScore = Number(scores.text || 0);
  const nonEmptyLineCount = Number(features.nonEmptyLineCount || 0);
  const strongSignal = matchedRule.startsWith("strong-");

  if (detectedType === DETECTED_TEXT_TYPES.MARKDOWN || detectedType === DETECTED_TEXT_TYPES.TABLE || detectedType === DETECTED_TEXT_TYPES.LIST || detectedType === DETECTED_TEXT_TYPES.QUOTE) {
    if (strongSignal || confidence === "high" || confidence === "medium") {
      return INPUT_ENTRY_KINDS.MARKDOWN;
    }
    return INPUT_ENTRY_KINDS.TEXT;
  }

  if (detectedType === DETECTED_TEXT_TYPES.CODE) {
    const confidentCode = confidence === "high" && codeScore >= 100 && codeScore - markdownScore >= 20 && nonEmptyLineCount >= 2;
    if (strongSignal || confidentCode) {
      if (entryKind === INPUT_ENTRY_KINDS.CODE || entryKind === INPUT_ENTRY_KINDS.MARKDOWN) {
        return entryKind;
      }
      return INPUT_ENTRY_KINDS.MARKDOWN;
    }
    return INPUT_ENTRY_KINDS.TEXT;
  }

  if (detectedType === DETECTED_TEXT_TYPES.MATH) {
    const confidentMath = confidence === "high" && mathScore >= 95 && mathScore - textScore >= 20;
    if (strongSignal || confidentMath) {
      return INPUT_ENTRY_KINDS.MARKDOWN;
    }
    return INPUT_ENTRY_KINDS.TEXT;
  }

  return INPUT_ENTRY_KINDS.TEXT;
}

function buildDetectedMarkdownPayload(text = "", detected = null) {
  const source = String(text || "");
  if (detected?.type === DETECTED_TEXT_TYPES.MATH) {
    return buildMathMarkdownPayload(source);
  }
  if (detected?.type !== DETECTED_TEXT_TYPES.CODE || !shouldFenceAsCodeMarkdown(detected)) {
    return source;
  }
  return normalizeCodeFenceMarkdown(source);
}

function shouldFenceAsCodeMarkdown(detected = null) {
  if (!detected || detected.type !== DETECTED_TEXT_TYPES.CODE) {
    return false;
  }
  const confidence = String(detected.confidence || "").toLowerCase();
  const matchedRule = String(detected.matchedRule || "").toLowerCase();
  const features = detected.features && typeof detected.features === "object" ? detected.features : {};
  const scores = detected.scores && typeof detected.scores === "object" ? detected.scores : {};
  const codeScore = Number(scores.code || 0);
  const markdownScore = Number(scores.markdown || 0);
  const nonEmptyLineCount = Number(features.nonEmptyLineCount || 0);
  if (matchedRule === "strong-code-signal") {
    return true;
  }
  if (confidence !== "high") {
    return false;
  }
  if (codeScore - markdownScore < 20) {
    return false;
  }
  return nonEmptyLineCount >= 2;
}

function normalizeCodeFenceMarkdown(source = "") {
  const value = String(source || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const tripleQuoteMatch = value.match(/^\s*'''([\w-]*)\s*\n([\s\S]*?)\n'''(?:\s*)$/);
  if (tripleQuoteMatch) {
    const language = String(tripleQuoteMatch[1] || "").trim();
    const body = String(tripleQuoteMatch[2] || "");
    return `\`\`\`${language ? language : ""}\n${body}\n\`\`\``;
  }
  const backtickMatch = value.match(/^\s*```([\w-]*)\s*\n([\s\S]*?)\n```(?:\s*)$/);
  if (backtickMatch) {
    const language = String(backtickMatch[1] || "").trim();
    const body = String(backtickMatch[2] || "");
    return `\`\`\`${language ? language : ""}\n${body}\n\`\`\``;
  }
  return `\`\`\`\n${value}\n\`\`\``;
}

function buildMathMarkdownPayload(value = "") {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }
  const escaped = source.replace(/`/g, "\\`");
  return `\`${escaped}\``;
}

function createTypedTextEntry(entryId, mimeType, kind, value, raw = {}, detected = null) {
  const normalized = String(value || "");
  return {
    entryId,
    kind,
    status: normalized ? INPUT_DESCRIPTOR_STATUS.READY : INPUT_DESCRIPTOR_STATUS.PARTIAL,
    errorCode: normalized ? INPUT_ERROR_CODES.NONE : INPUT_ERROR_CODES.MISSING_RAW_PAYLOAD,
    mimeType,
    name: "",
    size: normalized.length || null,
    charset: "utf-8",
    raw,
    meta: detected && typeof detected === "object"
      ? {
          detectedType: String(detected.type || ""),
          detectedConfidence: String(detected.confidence || ""),
          detectedRule: String(detected.matchedRule || ""),
        }
      : {},
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

function normalizeTextDetectionOptions(textDetectionOptions, codeEntryStrategy) {
  const normalized = textDetectionOptions && typeof textDetectionOptions === "object"
    ? { ...textDetectionOptions }
    : {};
  const strategy = String(codeEntryStrategy || "").trim().toLowerCase();
  if (strategy === CODE_ENTRY_STRATEGIES.NATIVE_CODE || strategy === CODE_ENTRY_STRATEGIES.MARKDOWN_FENCED) {
    normalized.codeEntryStrategy = strategy;
  }
  return normalized;
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
