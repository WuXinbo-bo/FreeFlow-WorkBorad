const FREEFLOW_BOARD_FILE_EXTENSION = ".freeflow";
const LEGACY_BOARD_FILE_EXTENSION = ".json";
const FREEFLOW_BOARD_FILE_KIND = "freeflow.canvas.board";
const FREEFLOW_BOARD_FILE_FORMAT_VERSION = 1;
const DEFAULT_BOARD_FILE_NAME = `canvas-board${FREEFLOW_BOARD_FILE_EXTENSION}`;

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

function parseBoardFileText(text = "") {
  const raw = JSON.parse(normalizeBoardFileText(text) || "{}");
  return unwrapFreeFlowBoardPayload(raw);
}

module.exports = {
  FREEFLOW_BOARD_FILE_EXTENSION,
  LEGACY_BOARD_FILE_EXTENSION,
  FREEFLOW_BOARD_FILE_KIND,
  FREEFLOW_BOARD_FILE_FORMAT_VERSION,
  DEFAULT_BOARD_FILE_NAME,
  normalizeBoardFileText,
  isFreeFlowBoardFileName,
  isLegacyJsonBoardFileName,
  isSupportedBoardFileName,
  ensureFreeFlowBoardFileName,
  deriveFreeFlowBoardPathFromLegacyPath,
  wrapFreeFlowBoardPayload,
  unwrapFreeFlowBoardPayload,
  parseBoardFileText,
};
