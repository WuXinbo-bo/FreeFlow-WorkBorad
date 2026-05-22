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
const { atomicWriteFile } = require("../utils/atomicWrite");
const { acquireFileLock, withFileLock } = require("../utils/fileLock");
const { addChecksumToEnvelope, verifyEnvelopeChecksum, CHECKSUM_ALGORITHMS } = require("../utils/checksum");

const BOARD_FILE_CHECKSUM_ALGORITHM = CHECKSUM_ALGORITHMS.CRC32;

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

  // 验证文件完整性校验和
  let checksumValid = null;
  if (parsed.envelope && parsed.envelope.meta?.checksum) {
    const checksumResult = verifyEnvelopeChecksum(parsed.envelope);
    checksumValid = checksumResult.valid;
    if (!checksumValid) {
      console.warn(`[canvasBoardService] 文件校验和验证失败: ${requestedPath}`, checksumResult.error);
    }
  }

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
    checksumValid: parsed.envelope?.meta?.checksum ? checksumValid : null,
  };
}

async function writeCanvasBoard(payload = {}, explicitPath = "") {
  const requestedPath = await getConfiguredCanvasBoardFilePath(explicitPath);
  const filePath = ensureFreeFlowBoardFileName(requestedPath || CANVAS_BOARD_FILE);

  // 使用文件锁保护写入操作
  return await withFileLock(filePath, async () => {
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
    let envelope = wrapFreeFlowBoardPayload(hostPayload, { updatedAt: board.updatedAt });
    // 添加校验和
    envelope = addChecksumToEnvelope(envelope, { algorithm: BOARD_FILE_CHECKSUM_ALGORITHM });

    // 使用原子写入：先写入临时文件，然后原子重命名
    const serialized = JSON.stringify(envelope, null, 2);
    const atomicResult = await atomicWriteFile(filePath, serialized, {
      fsync: true,
      preserveTempOnFailure: false,
    });

    if (!atomicResult.ok) {
      throw new Error(`原子写入失败: ${atomicResult.error || "未知错误"}`);
    }

    await persistRecentBoardPathIfNeeded(filePath);
    return {
      file: filePath,
      canonicalFile: filePath,
      board,
      fileSizeBytes: atomicResult.bytesWritten,
      updatedAt: board.updatedAt,
      migrated: isLegacyJsonBoardFileName(requestedPath),
      legacy: false,
      format: "freeflow",
    };
  }, {
    // 锁配置：30秒超时，1分钟锁过期
    lockTimeoutMs: 30_000,
    lockExpiryMs: 60_000,
  });
}

module.exports = {
  CANVAS_BOARD_FILE,
  DEFAULT_BOARD_FILE_NAME,
  resolveCanvasBoardFilePath,
  readCanvasBoard,
  repairCanvasBoardFile,
  writeCanvasBoard,
};
