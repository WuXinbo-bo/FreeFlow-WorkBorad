export const FREEFLOW_BOARD_FILE_EXTENSION = ".freeflow";
export const LEGACY_BOARD_FILE_EXTENSION = ".json";
export const FREEFLOW_BOARD_FILE_KIND = "freeflow.canvas.board";
export const FREEFLOW_BOARD_FILE_FORMAT_VERSION = 1;
export const DEFAULT_BOARD_FILE_NAME = `canvas-board${FREEFLOW_BOARD_FILE_EXTENSION}`;

// \u5B89\u5168\u9650\u5236\u5E38\u91CF
export const MAX_JSON_PARSE_DEPTH = 32; // \u6700\u5927\u5D4C\u5957\u6DF1\u5EA6
export const MAX_BOARD_FILE_SIZE_MB = 50; // \u6587\u4EF6\u5927\u5C0F\u9650\u5236

export function normalizeBoardFileText(value = "") {
  return String(value || "").replace(/^\uFEFF/, "");
}

export function isFreeFlowBoardFileName(value = "") {
  return String(value || "").trim().toLowerCase().endsWith(FREEFLOW_BOARD_FILE_EXTENSION);
}

export function isLegacyJsonBoardFileName(value = "") {
  return String(value || "").trim().toLowerCase().endsWith(LEGACY_BOARD_FILE_EXTENSION);
}

export function isSupportedBoardFileName(value = "") {
  return isFreeFlowBoardFileName(value) || isLegacyJsonBoardFileName(value);
}

export function ensureFreeFlowBoardFileName(value = "") {
  const clean = String(value || "").trim();
  if (!clean) {
    return "";
  }
  if (isFreeFlowBoardFileName(clean)) {
    return clean;
  }
  if (isLegacyJsonBoardFileName(clean)) {
    return clean.replace(/\.json$/i, FREEFLOW_BOARD_FILE_EXTENSION);
  }
  return `${clean}${FREEFLOW_BOARD_FILE_EXTENSION}`;
}

export function deriveFreeFlowBoardPathFromLegacyPath(value = "") {
  const clean = String(value || "").trim();
  if (!clean) {
    return "";
  }
  if (isFreeFlowBoardFileName(clean)) {
    return clean;
  }
  return clean.replace(/\.json$/i, FREEFLOW_BOARD_FILE_EXTENSION);
}

export function wrapFreeFlowBoardPayload(payload = {}, options = {}) {
  const now = Date.now();
  return {
    kind: FREEFLOW_BOARD_FILE_KIND,
    formatVersion: FREEFLOW_BOARD_FILE_FORMAT_VERSION,
    app: "FreeFlow",
    source: "freeflow-desktop",
    createdAt: Number(options.createdAt) || now,
    updatedAt: Number(options.updatedAt) || now,
    payloadKind: String(payload?.kind || "structured-host-board"),
    payload,
  };
}

export function unwrapFreeFlowBoardPayload(raw = {}) {
  if (raw?.kind === FREEFLOW_BOARD_FILE_KIND) {
    return {
      payload: raw.payload && typeof raw.payload === "object" ? raw.payload : {},
      format: "freeflow",
      envelope: raw,
      legacy: false,
    };
  }
  return {
    payload: raw && typeof raw === "object" ? raw : {},
    format: "legacy-json",
    envelope: null,
    legacy: true,
  };
}

/**
 * \u8BA1\u7B97 JSON \u6587\u672C\u7684\u5D4C\u5957\u6DF1\u5EA6\uFF08\u7B80\u5355\u4F30\u7B97\uFF09
 * @param {string} text - JSON \u6587\u672C
 * @returns {number} \u8BA1\u7B97\u7684\u6700\u5927\u6DF1\u5EA6
 */
function estimateJsonDepth(text) {
  let depth = 0;
  let maxDepth = 0;
  let inString = false;
  let escaping = false;
  const cleanText = String(text || "").replace(/^\uFEFF/, "").trim();

  for (let i = 0; i < Math.min(cleanText.length, 100_000); i += 1) {
    const char = cleanText[i];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === "}" || char === "]") {
      depth = Math.max(0, depth - 1);
    }
  }
  return maxDepth;
}

/**
 * \u5B89\u5168\u89E3\u6790 JSON\uFF0C\u5E26\u6DF1\u5EA6\u9650\u5236
 * @param {string} text - \u8981\u89E3\u6790\u7684 JSON \u6587\u672C
 * @param {number} maxDepth - \u6700\u5927\u5141\u8BB8\u7684\u6DF1\u5EA6\uFF08\u9ED8\u8BA432\uFF09
 * @returns {any} \u89E3\u6790\u7ED3\u679C
 * @throws {Error} \u5982\u679C\u6DF1\u5EA6\u8D85\u8FC7\u9650\u5236
 */
function safeJsonParse(text, maxDepth = MAX_JSON_PARSE_DEPTH) {
  const cleanText = normalizeBoardFileText(text) || "{}";

  // \u5FEB\u901F\u68C0\u67E5\u6DF1\u5EA6
  const estimatedDepth = estimateJsonDepth(cleanText);
  if (estimatedDepth > maxDepth) {
    throw new Error(`JSON \u5D4C\u5957\u6DF1\u5EA6\u8D85\u8FC7\u5B89\u5168\u9650\u5236 (${maxDepth})`);
  }

  // \u5B89\u5168\u89E3\u6790
  return JSON.parse(cleanText);
}

/**
 * \u89E3\u6790 board \u6587\u4EF6\u6587\u672C\uFF08\u5E26\u5B89\u5168\u68C0\u67E5\uFF09
 * @param {string} text - \u6587\u4EF6\u5185\u5BB9
 * @returns {object} \u89E3\u6790\u7ED3\u679C
 */
export function parseBoardFileText(text = "") {
  const raw = safeJsonParse(text, MAX_JSON_PARSE_DEPTH);
  return unwrapFreeFlowBoardPayload(raw);
}

/**
 * \u68C0\u67E5\u6587\u4EF6\u5927\u5C0F\u662F\u5426\u5B89\u5168
 * @param {number} sizeBytes - \u6587\u4EF6\u5927\u5C0F\uFF08\u5B57\u8282\uFF09
 * @returns {{safe: boolean, sizeBytes: number, sizeMB: number, exceedsByMB: number|null}}
 */
export function checkFileSizeSafe(sizeBytes) {
  const maxSizeBytes = MAX_BOARD_FILE_SIZE_MB * 1024 * 1024;
  const sizeMB = sizeBytes / (1024 * 1024);

  if (sizeBytes > maxSizeBytes) {
    return {
      safe: false,
      sizeBytes,
      sizeMB,
      exceedsByMB: sizeMB - MAX_BOARD_FILE_SIZE_MB,
    };
  }

  return {
    safe: true,
    sizeBytes,
    sizeMB,
    exceedsByMB: null,
  };
}
