const FREEFLOW_BOARD_FILE_EXTENSION = ".freeflow";
const LEGACY_BOARD_FILE_EXTENSION = ".json";
const FREEFLOW_BOARD_FILE_KIND = "freeflow.canvas.board";
const FREEFLOW_BOARD_FILE_FORMAT_VERSION = 1;
const DEFAULT_BOARD_FILE_NAME = `canvas-board${FREEFLOW_BOARD_FILE_EXTENSION}`;
const MAX_JSON_PARSE_DEPTH = 32;
const MAX_BOARD_FILE_SIZE_MB = 50;

function normalizeBoardFileText(value = "") {
  return String(value || "").replace(/^\uFEFF/, "");
}

function isFreeFlowBoardFileName(value = "") {
  return String(value || "").trim().toLowerCase().endsWith(FREEFLOW_BOARD_FILE_EXTENSION);
}

function isLegacyJsonBoardFileName(value = "") {
  return String(value || "").trim().toLowerCase().endsWith(LEGACY_BOARD_FILE_EXTENSION);
}

function isSupportedBoardFileName(value = "") {
  return isFreeFlowBoardFileName(value) || isLegacyJsonBoardFileName(value);
}

function ensureFreeFlowBoardFileName(value = "") {
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

function deriveFreeFlowBoardPathFromLegacyPath(value = "") {
  const clean = String(value || "").trim();
  if (!clean) {
    return "";
  }
  if (isFreeFlowBoardFileName(clean)) {
    return clean;
  }
  return clean.replace(/\.json$/i, FREEFLOW_BOARD_FILE_EXTENSION);
}

function wrapFreeFlowBoardPayload(payload = {}, options = {}) {
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

function unwrapFreeFlowBoardPayload(raw = {}) {
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
 * \u5B89\u5168\u89E3\u6790 JSON \u5E76\u68C0\u67E5\u6DF1\u5EA6\u9650\u5236
 * @param {string} text - \u8981\u89E3\u6790\u7684 JSON \u6587\u672C
 * @param {number} maxDepth - \u6700\u5927\u5141\u8BB8\u7684\u5D4C\u5957\u6DF1\u5EA6\uFF08\u9ED8\u8BA432\uFF09
 * @returns {any} \u89E3\u6790\u7ED3\u679C
 * @throws {Error} \u5982\u679C JSON \u683C\u5F0F\u65E0\u6548\u6216\u6DF1\u5EA6\u8D85\u9650
 */
function safeJsonParse(text, maxDepth = MAX_JSON_PARSE_DEPTH) {
  const cleanText = normalizeBoardFileText(text) || "{}";
  // \u9996\u5148\u68C0\u67E5\u7B80\u5355\u7684\u6DF1\u5EA6\u4F30\u7B97\uFF08\u5FEB\u901F\u5931\u8D25\uFF09
  let depth = 0;
  let maxMeasuredDepth = 0;
  let inString = false;
  let escaping = false;
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
      maxMeasuredDepth = Math.max(maxMeasuredDepth, depth);
      if (depth > maxDepth) {
        throw new Error(`JSON \u5D4C\u5957\u6DF1\u5EA6\u8D85\u8FC7\u5B89\u5168\u9650\u5236 (${maxDepth})`);
      }
    } else if (char === "}" || char === "]") {
      depth = Math.max(0, depth - 1);
    }
  }

  // \u4F7F\u7528\u6807\u51C6 JSON.parse\uFF08\u6DF1\u5EA6\u5DF2\u68C0\u67E5\u901A\u8FC7\uFF09
  const result = JSON.parse(cleanText);
  return result;
}

/**
 * \u68C0\u67E5\u6587\u4EF6\u5927\u5C0F\u662F\u5426\u8D85\u51FA\u5B89\u5168\u9650\u5236
 * @param {number} sizeBytes - \u6587\u4EF6\u5927\u5C0F\uFF08\u5B57\u8282\uFF09
 * @throws {Error} \u5982\u679C\u6587\u4EF6\u8FC7\u5927
 */
function checkFileSizeSafe(sizeBytes) {
  const maxSizeBytes = MAX_BOARD_FILE_SIZE_MB * 1024 * 1024;
  if (sizeBytes > maxSizeBytes) {
    throw new Error(
      `\u753B\u5E03\u6587\u4EF6\u8FC7\u5927 (${(sizeBytes / (1024 * 1024)).toFixed(1)}MB \u2014 \u8D85\u8FC7\u9650\u5236 ${MAX_BOARD_FILE_SIZE_MB}MB)`
    );
  }
}

/**
 * \u89E3\u6790 board \u6587\u4EF6\u6587\u672C
 * \u5E26\u6709\u6DF1\u5EA6\u9650\u5236\u548C\u5B89\u5168\u68C0\u67E5
 * @param {string} text - \u6587\u4EF6\u5185\u5BB9
 * @returns {object} \u89E3\u6790\u7ED3\u679C
 * @throws {Error} \u5982\u679C\u5185\u5BB9\u4E0D\u53EF\u89E3\u6790
 */
function parseBoardFileText(text = "") {
  const raw = safeJsonParse(normalizeBoardFileText(text) || "{}", MAX_JSON_PARSE_DEPTH);
  return unwrapFreeFlowBoardPayload(raw);
}

module.exports = {
  FREEFLOW_BOARD_FILE_EXTENSION,
  LEGACY_BOARD_FILE_EXTENSION,
  FREEFLOW_BOARD_FILE_KIND,
  FREEFLOW_BOARD_FILE_FORMAT_VERSION,
  DEFAULT_BOARD_FILE_NAME,
  MAX_JSON_PARSE_DEPTH,
  MAX_BOARD_FILE_SIZE_MB,
  normalizeBoardFileText,
  isFreeFlowBoardFileName,
  isLegacyJsonBoardFileName,
  isSupportedBoardFileName,
  ensureFreeFlowBoardFileName,
  deriveFreeFlowBoardPathFromLegacyPath,
  wrapFreeFlowBoardPayload,
  unwrapFreeFlowBoardPayload,
  parseBoardFileText,
  safeJsonParse,
  checkFileSizeSafe,
};
