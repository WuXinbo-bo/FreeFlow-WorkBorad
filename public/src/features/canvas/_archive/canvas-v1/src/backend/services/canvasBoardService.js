const path = require("path");
const fs = require("fs/promises");
const { ROOT_DIR, CANVAS_BOARD_FILE } = require("../config/paths");
const { ensureJsonFile, readJsonFile, writeJsonFile, statJsonFile } = require("../utils/jsonStore");
const { getDefaultCanvasBoard, normalizeCanvasBoard } = require("../models/canvasBoardModel");
const { readUiSettingsStore } = require("./uiSettingsService");

function resolveCanvasBoardFilePath(input = "") {
  const raw = String(input || "").trim();
  if (!raw) {
    return CANVAS_BOARD_FILE;
  }

  const normalized = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(ROOT_DIR, raw);
  if (/[\\/]$/.test(raw)) {
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
    return resolveCanvasBoardFilePath(uiSettings.canvasBoardSavePath);
  } catch {
    return CANVAS_BOARD_FILE;
  }
}

async function readCanvasBoard(explicitPath = "") {
  const filePath = await getConfiguredCanvasBoardFilePath(explicitPath);
  const defaults = getDefaultCanvasBoard();
  await ensureJsonFile(filePath, defaults);
  const [parsed, stat] = await Promise.all([
    readJsonFile(filePath, defaults).catch(() => defaults),
    statJsonFile(filePath, defaults),
  ]);
  const board = normalizeCanvasBoard(parsed);
  return {
    file: filePath,
    board,
    fileSizeBytes: stat.size,
    updatedAt: stat.mtimeMs,
  };
}

async function writeCanvasBoard(payload = {}, explicitPath = "") {
  const filePath = await getConfiguredCanvasBoardFilePath(explicitPath);
  const board = normalizeCanvasBoard({
    ...payload,
    updatedAt: Date.now(),
  });
  await writeJsonFile(filePath, board);
  const stat = await fs.stat(filePath);
  return {
    file: filePath,
    board,
    fileSizeBytes: stat.size,
    updatedAt: stat.mtimeMs,
  };
}

module.exports = {
  CANVAS_BOARD_FILE,
  resolveCanvasBoardFilePath,
  readCanvasBoard,
  writeCanvasBoard,
};
