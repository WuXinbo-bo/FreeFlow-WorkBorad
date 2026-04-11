const path = require("path");
const { ROOT_DIR, CANVAS_BOARD_FILE } = require("../config/paths");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const {
  CANVAS_BOARD_SCHEMA_VERSION,
  getDefaultCanvasBoard,
  normalizeCanvasBoard,
} = require("../models/canvasBoardModel");
const { readUiSettingsStore } = require("./uiSettingsService");

function resolveCanvasBoardFilePath(input = "") {
  const raw = String(input || "").trim();
  if (!raw) {
    return CANVAS_BOARD_FILE;
  }

  const normalized = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(ROOT_DIR, raw);
  const ext = path.extname(normalized).toLowerCase();
  if (/[\\/]$/.test(raw) || ext !== ".json") {
    return path.join(normalized, "canvas-board.json");
  }
  return normalized;
}

async function getConfiguredCanvasBoardFilePath(explicitPath = "") {
  if (String(explicitPath || "").trim()) {
    return resolveCanvasBoardFilePath(explicitPath);
  }

  try {
    const uiSettings = await readUiSettingsStore();
    const lastOpenedPath = String(uiSettings.canvasLastOpenedBoardPath || "").trim();
    if (lastOpenedPath) {
      return resolveCanvasBoardFilePath(lastOpenedPath);
    }
    return resolveCanvasBoardFilePath(uiSettings.canvasBoardSavePath);
  } catch {
    return CANVAS_BOARD_FILE;
  }
}

async function readCanvasBoard(explicitPath = "") {
  const filePath = await getConfiguredCanvasBoardFilePath(explicitPath);
  const result = await readVersionedJsonFile(filePath, {
    defaultValue: getDefaultCanvasBoard(),
    normalize: normalizeCanvasBoard,
    currentVersion: CANVAS_BOARD_SCHEMA_VERSION,
  });
  return {
    file: filePath,
    board: result.data,
    fileSizeBytes: result.fileSizeBytes,
    updatedAt: result.updatedAt,
  };
}

async function writeCanvasBoard(payload = {}, explicitPath = "") {
  const filePath = await getConfiguredCanvasBoardFilePath(explicitPath);
  const board = normalizeCanvasBoard({
    ...payload,
    updatedAt: Date.now(),
  });
  await writeJsonFile(filePath, board);
  return {
    file: filePath,
    board,
    fileSizeBytes: Buffer.byteLength(JSON.stringify(board, null, 2), "utf8"),
    updatedAt: board.updatedAt,
  };
}

module.exports = {
  CANVAS_BOARD_FILE,
  resolveCanvasBoardFilePath,
  readCanvasBoard,
  writeCanvasBoard,
};
