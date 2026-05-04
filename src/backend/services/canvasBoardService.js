const fs = require("fs/promises");
const path = require("path");
const { ROOT_DIR, CANVAS_BOARD_FILE } = require("../config/paths");
const {
  CANVAS_BOARD_SCHEMA_VERSION,
  getDefaultCanvasBoard,
  normalizeCanvasBoard,
} = require("../models/canvasBoardModel");
const {
  DEFAULT_BOARD_FILE_NAME,
  deriveFreeFlowBoardPathFromLegacyPath,
  ensureFreeFlowBoardFileName,
  isFreeFlowBoardFileName,
  isLegacyJsonBoardFileName,
  isSupportedBoardFileName,
  parseBoardFileText,
  wrapFreeFlowBoardPayload,
} = require("../models/canvasBoardFileFormat");
const { readUiSettingsStore, writeUiSettingsStore } = require("./uiSettingsService");
const { repairCanvasBoardFile } = require("./canvasBoardRepairService");

function resolveCanvasBoardFilePath(input = "") {
  const raw = String(input || "").trim();
  if (!raw) {
    return CANVAS_BOARD_FILE;
  }

  const normalized = path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(ROOT_DIR, raw);
  const ext = path.extname(normalized).toLowerCase();
  if (/[\\/]$/.test(raw) || !isSupportedBoardFileName(path.basename(normalized)) || !ext) {
    return path.join(normalized, DEFAULT_BOARD_FILE_NAME);
  }
  return normalized;
}

async function pathExists(targetPath = "") {
  if (!targetPath) {
    return false;
  }
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveExistingCanvasBoardFilePath(input = "") {
  const filePath = resolveCanvasBoardFilePath(input);
  if (await pathExists(filePath)) {
    return filePath;
  }
  if (isLegacyJsonBoardFileName(filePath)) {
    const upgradedPath = deriveFreeFlowBoardPathFromLegacyPath(filePath);
    if (upgradedPath && (await pathExists(upgradedPath))) {
      return upgradedPath;
    }
  }
  if (isFreeFlowBoardFileName(filePath)) {
    const legacyPath = filePath.replace(/\.freeflow$/i, ".json");
    if (legacyPath && (await pathExists(legacyPath))) {
      return legacyPath;
    }
  }
  return filePath;
}

async function getConfiguredCanvasBoardFilePath(explicitPath = "") {
  if (String(explicitPath || "").trim()) {
    return resolveExistingCanvasBoardFilePath(explicitPath);
  }

  try {
    const uiSettings = await readUiSettingsStore();
    const lastOpenedPath = String(uiSettings.canvasLastOpenedBoardPath || "").trim();
    if (lastOpenedPath) {
      return resolveExistingCanvasBoardFilePath(lastOpenedPath);
    }
    return resolveCanvasBoardFilePath(uiSettings.canvasBoardSavePath);
  } catch {
    return CANVAS_BOARD_FILE;
  }
}

function extractBoardPayload(rawPayload = {}) {
  const parsed = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  if (parsed.kind === "structured-host-board" && parsed.board) {
    return parsed.board;
  }
  return parsed.board && typeof parsed.board === "object" ? parsed.board : parsed;
}

async function persistRecentBoardPathIfNeeded(filePath = "") {
  const cleanPath = String(filePath || "").trim();
  if (!cleanPath) {
    return;
  }
  try {
    const settings = await readUiSettingsStore();
    const nextSettings = {
      ...settings,
      canvasBoardSavePath: path.dirname(cleanPath),
      canvasLastOpenedBoardPath: cleanPath,
    };
    await writeUiSettingsStore(nextSettings);
  } catch {
    // Startup can still recover from the returned explicit file path.
  }
}

async function migrateLegacyJsonBoardFile(legacyPath, payload) {
  if (!isLegacyJsonBoardFileName(legacyPath)) {
    return "";
  }
  const upgradedPath = deriveFreeFlowBoardPathFromLegacyPath(legacyPath);
  if (!upgradedPath || upgradedPath === legacyPath) {
    return "";
  }
  if (await pathExists(upgradedPath)) {
    await persistRecentBoardPathIfNeeded(upgradedPath);
    return upgradedPath;
  }
  await fs.mkdir(path.dirname(upgradedPath), { recursive: true });
  const envelope = wrapFreeFlowBoardPayload(payload, { updatedAt: Date.now() });
  await fs.writeFile(upgradedPath, JSON.stringify(envelope, null, 2), "utf8");
  await persistRecentBoardPathIfNeeded(upgradedPath);
  return upgradedPath;
}

async function readCanvasBoard(explicitPath = "") {
  const requestedPath = await getConfiguredCanvasBoardFilePath(explicitPath);
  if (!(await pathExists(requestedPath))) {
    const board = normalizeCanvasBoard(getDefaultCanvasBoard());
    return {
      file: requestedPath,
      canonicalFile: ensureFreeFlowBoardFileName(requestedPath),
      board,
      fileSizeBytes: 0,
      updatedAt: board.updatedAt,
      migrated: false,
      legacy: false,
      format: "missing",
    };
  }

  const [rawText, stat] = await Promise.all([fs.readFile(requestedPath, "utf8"), fs.stat(requestedPath)]);
  const parsed = parseBoardFileText(rawText);
  const board = normalizeCanvasBoard(extractBoardPayload(parsed.payload));
  let canonicalFile = requestedPath;
  let migrated = false;
  if (parsed.legacy || isLegacyJsonBoardFileName(requestedPath)) {
    const migratedPath = await migrateLegacyJsonBoardFile(requestedPath, parsed.payload);
    if (migratedPath) {
      canonicalFile = migratedPath;
      migrated = true;
    }
  }

  return {
    file: canonicalFile,
    sourceFile: requestedPath,
    canonicalFile,
    board,
    fileSizeBytes: stat.size,
    updatedAt: stat.mtimeMs,
    migrated,
    legacy: parsed.legacy,
    format: parsed.format,
  };
}

async function writeCanvasBoard(payload = {}, explicitPath = "") {
  const requestedPath = await getConfiguredCanvasBoardFilePath(explicitPath);
  const filePath = ensureFreeFlowBoardFileName(requestedPath || CANVAS_BOARD_FILE);
  const board = normalizeCanvasBoard({
    ...extractBoardPayload(payload),
    updatedAt: Date.now(),
  });
  const hostPayload =
    payload?.kind === "structured-host-board"
      ? { ...payload, board }
      : {
          kind: "structured-host-board",
          version: "1.0.0",
          createdAt: Number(payload?.createdAt) || Date.now(),
          meta: payload?.meta && typeof payload.meta === "object" ? { ...payload.meta, boardFilePath: filePath } : { boardFilePath: filePath },
          board,
        };
  const envelope = wrapFreeFlowBoardPayload(hostPayload, { updatedAt: board.updatedAt });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(envelope, null, 2);
  await fs.writeFile(filePath, serialized, "utf8");
  await persistRecentBoardPathIfNeeded(filePath);
  return {
    file: filePath,
    canonicalFile: filePath,
    board,
    fileSizeBytes: Buffer.byteLength(serialized, "utf8"),
    updatedAt: board.updatedAt,
    migrated: isLegacyJsonBoardFileName(requestedPath),
    legacy: false,
    format: "freeflow",
  };
}

module.exports = {
  CANVAS_BOARD_FILE,
  DEFAULT_BOARD_FILE_NAME,
  resolveCanvasBoardFilePath,
  readCanvasBoard,
  repairCanvasBoardFile,
  writeCanvasBoard,
};
