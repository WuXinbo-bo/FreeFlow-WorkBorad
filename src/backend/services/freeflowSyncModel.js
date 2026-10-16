const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { parseBoardFileText, checkFileSizeSafe } = require("../models/canvasBoardFileFormat");
const { atomicWriteFile } = require("../utils/atomicWrite");
const { DATA_DIR } = require("../config/paths");
const { createFileAccessRegistry, isWithinPath } = require("../../../electron/fileAccessRegistry");
const { addChecksumToEnvelope } = require("../utils/checksum");
const { evaluateAttachment, createPlaceholderMetadata, normalizePolicy } = require("./attachmentPolicyService");

const SYNC_SCHEMA_VERSION = 1;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (key === "updatedAt" || key === "checksum" || key === "_relative") return result;
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function hashJson(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

async function ensureBoardIdInFile(filePath, previousBoardId = "") {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = parseBoardFileText(raw);
  const payload = clone(parsed.payload || {});
  const board = payload?.kind === "structured-host-board" && payload.board ? payload.board : payload;
  const existing = String(board?.boardId || payload?.boardId || "").trim();
  if (existing) return existing;
  const boardId = previousBoardId || crypto.randomUUID();
  if (payload?.kind === "structured-host-board" && payload.board) payload.board = { ...payload.board, boardId };
  else payload.boardId = boardId;
  const nextRaw = parsed.envelope
    ? JSON.stringify(addChecksumToEnvelope({ ...parsed.envelope, payload }), null, 2)
    : JSON.stringify(payload, null, 2);
  const result = await atomicWriteFile(filePath, nextRaw, { fsync: true });
  if (!result.ok) throw new Error(result.error || "无法为画布写入稳定 ID");
  return boardId;
}

function parseDataUrl(value = "") {
  const match = String(value || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/is);
  if (!match) return null;
  const mime = String(match[1] || "application/octet-stream");
  const body = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
  return { mime, bytes: body };
}

function extensionFor(name = "", mime = "") {
  const extension = path.extname(String(name || "")).replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 32);
  if (extension) return extension;
  const fallback = String(mime || "").split("/")[1] || "bin";
  return fallback.replace(/[^a-z0-9]+/gi, "").slice(0, 8) || "bin";
}

function itemType(item = {}) {
  return String(item.type || item.kind || "").trim().toLowerCase();
}

function attachmentInput(item = {}) {
  const type = itemType(item);
  if (!["image", "file", "filecard", "file-card", "video", "video-card", "videocard"].includes(type)) return null;
  return {
    name: item.name || item.fileName || item.title || "附件",
    mime: item.mime || item.mimeType || item.detectedMimeType || "",
    sizeBytes: item.size || item.fileSize || 0,
    kind: type === "image" ? "image" : "file",
    sourcePath: item.sourcePath || item.filePath || "",
    dataUrl: item.dataUrl || "",
  };
}

async function readAttachmentBytes(input = {}, baseDir = "", policy, access) {
  const initial = evaluateAttachment(input, { policy });
  if (!initial.syncable) return { blockedReason: initial.reason, sizeBytes: input.sizeBytes };
  const encoded = String(input.dataUrl || "").match(/^data:([^;,]+)?;base64,(.*)$/is);
  if (encoded) {
    const sizeBytes = Math.floor(encoded[2].length * 3 / 4) - (encoded[2].endsWith("==") ? 2 : encoded[2].endsWith("=") ? 1 : 0);
    const evaluation = evaluateAttachment({ ...input, mime: encoded[1] || input.mime, sizeBytes }, { policy });
    if (!evaluation.syncable) return { blockedReason: evaluation.reason, sizeBytes };
  }
  const data = parseDataUrl(input.dataUrl);
  if (data) return data;
  const rawSourcePath = String(input.sourcePath || "").trim();
  const sourcePath = rawSourcePath && !path.isAbsolute(rawSourcePath) && baseDir
    ? path.resolve(baseDir, rawSourcePath)
    : rawSourcePath;
  if (!sourcePath || sourcePath.startsWith("file://")) return null;
  try {
    const realSource = await fs.realpath(sourcePath);
    const realBase = baseDir ? await fs.realpath(baseDir) : "";
    if (!realBase || !isWithinPath(realBase, realSource)) {
      try { access.assert(realSource); }
      catch { return { blockedReason: "local-file-not-authorized", sizeBytes: input.sizeBytes }; }
    }
    const stat = await fs.stat(realSource);
    const evaluation = evaluateAttachment({ ...input, sizeBytes: stat.size }, { policy });
    if (!stat.isFile() || !evaluation.syncable) return { blockedReason: evaluation.reason || "missing-local-file", sizeBytes: stat.size };
    return { mime: input.mime || "application/octet-stream", bytes: await fs.readFile(realSource) };
  } catch {
    return null;
  }
}

function replaceWithPlaceholder(item, input, evaluation) {
  const next = { ...item };
  delete next.dataUrl;
  delete next.sourcePath;
  delete next.filePath;
  delete next.resourcePath;
  delete next.resourceSha256;
  delete next._relative;
  delete next.resourceStatus;
  delete next.syncable;
  return {
    ...next,
    ...createPlaceholderMetadata(input, evaluation),
  };
}

async function buildSyncBundleFromFile(filePath, options = {}) {
  const stat = await fs.stat(filePath);
  checkFileSizeSafe(stat.size);
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = parseBoardFileText(raw);
  return buildSyncBundleFromPayload(parsed.payload, { ...options, baseDir: path.dirname(filePath) });
}

async function buildSyncBundleFromPayload(inputPayload, options = {}) {
  const policy = normalizePolicy(options.policy);
  const access = createFileAccessRegistry({ storagePath: path.join(DATA_DIR, "file-access-grants.json") });
  const payload = clone(inputPayload || {});
  const board = payload?.kind === "structured-host-board" && payload.board ? payload.board : payload;
  const resources = [];
  const resourcesByPath = new Map();
  const resourcesByHash = new Map();
  let skippedCount = 0;
  let assetBytes = 0;

  if (Array.isArray(board?.items)) {
    for (let index = 0; index < board.items.length; index += 1) {
      const item = board.items[index];
      const input = attachmentInput(item);
      if (!input) continue;
      const bytes = options.resourceBytes?.get(input.sourcePath)
        || await readAttachmentBytes(input, options.baseDir || "", policy, access);
      const sizeBytes = bytes?.bytes?.length || bytes?.sizeBytes || input.sizeBytes || 0;
      const sha256 = bytes?.bytes ? crypto.createHash("sha256").update(bytes.bytes).digest("hex") : "";
      const extension = bytes?.bytes ? extensionFor(input.name, bytes.mime || input.mime) : "";
      const computedAssetPath = sha256 ? `.freeflow/assets/${sha256}.${extension}` : "";
      const assetPath = (sha256 && resourcesByHash.get(sha256)?.path) || computedAssetPath;
      const duplicateResource = Boolean(assetPath && resourcesByPath.has(assetPath));
      const uniqueBytes = duplicateResource ? 0 : (bytes?.bytes?.length || 0);
      const evaluation = evaluateAttachment({ ...input, mime: bytes?.mime || input.mime, sizeBytes }, {
        policy,
        repositoryBytes: duplicateResource ? Math.max(0, assetBytes - sizeBytes) : assetBytes,
      });
      if (bytes?.blockedReason) {
        board.items[index] = replaceWithPlaceholder(item, { ...input, sizeBytes }, { ...evaluation, reason: bytes.blockedReason });
        skippedCount += 1;
        continue;
      }
      if (!evaluation.syncable) {
        board.items[index] = replaceWithPlaceholder(item, input, evaluation);
        skippedCount += 1;
        continue;
      }
      if (!bytes?.bytes) {
        board.items[index] = replaceWithPlaceholder(item, { ...input, sizeBytes }, { ...evaluation, reason: "missing-local-file" });
        skippedCount += 1;
        continue;
      }
      if (assetBytes + uniqueBytes > policy.batchMaxBytes) {
        board.items[index] = replaceWithPlaceholder(item, { ...input, sizeBytes: bytes.bytes.length }, { ...evaluation, reason: "batch-quota" });
        skippedCount += 1;
        continue;
      }
      if (!resourcesByPath.has(assetPath)) {
        const resource = { path: assetPath, sha256, sizeBytes: bytes.bytes.length, mime: bytes.mime || input.mime, bytes: bytes.bytes };
        resourcesByPath.set(assetPath, resource);
        if (sha256) resourcesByHash.set(sha256, resource);
        resources.push(resource);
        assetBytes += bytes.bytes.length;
      }
      board.items[index] = {
        ...item,
        dataUrl: "",
        sourcePath: assetPath,
        _relative: true,
        resourceStatus: "synced",
        resourceSha256: sha256,
        resourcePath: assetPath,
      };
    }
  }

  const boardId = String(board?.boardId || payload?.boardId || crypto.randomUUID());
  const normalizedBoard = { ...board, boardId };
  if (payload?.kind === "structured-host-board") payload.board = normalizedBoard;
  else payload.boardId = boardId;
  const manifest = {
    schemaVersion: SYNC_SCHEMA_VERSION,
    boardId,
    generatedAt: new Date().toISOString(),
    boardHash: hashJson(payload),
    assetBytes,
    resources: resources.map(({ bytes, ...resource }) => resource),
    skippedCount,
    policy: {
      imageMaxBytes: policy.imageMaxBytes,
      fileMaxBytes: policy.fileMaxBytes,
      videoMaxBytes: policy.videoMaxBytes,
    },
  };
  const boardText = JSON.stringify(payload, null, 2);
  const manifestText = JSON.stringify(manifest, null, 2);
  return {
    boardId,
    boardText,
    boardHash: hashJson(payload),
    manifestText,
    manifest,
    files: [
      { path: `.freeflow/boards/${boardId}/board.freeflow`, content: Buffer.from(boardText, "utf8") },
      { path: `.freeflow/boards/${boardId}/manifest.json`, content: Buffer.from(manifestText, "utf8") },
      ...resources.map((resource) => ({ path: resource.path, content: resource.bytes })),
    ],
  };
}

async function writeDownloadedBoard(filePath, boardText) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const result = await atomicWriteFile(filePath, String(boardText || "{}"), { fsync: true });
  if (!result.ok) throw new Error(result.error || "无法写入下载的画布");
  return { filePath, bytesWritten: result.bytesWritten };
}

module.exports = {
  SYNC_SCHEMA_VERSION,
  stableValue,
  hashJson,
  ensureBoardIdInFile,
  parseDataUrl,
  buildSyncBundleFromFile,
  buildSyncBundleFromPayload,
  writeDownloadedBoard,
};
