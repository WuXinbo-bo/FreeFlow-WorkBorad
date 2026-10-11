const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { atomicWriteFile } = require("../utils/atomicWrite");
const { parseBoardFileText, isSupportedBoardFileName } = require("../models/canvasBoardFileFormat");
const { verifyEnvelopeChecksum, addChecksumToEnvelope } = require("../utils/checksum");
const { withFileLock } = require("../utils/fileLock");

const MAX_HISTORY_ENTRIES = 30;
const MAX_HISTORY_BYTES = 200 * 1024 * 1024;
const ID_PATTERN = /^\d{13}-[a-f0-9]{16}$/;
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
let lastRecordTime = 0;

function boardPath(value) {
  if (!String(value || "").trim() || !isSupportedBoardFileName(value)) throw new Error("请选择有效的画布路径");
  return path.resolve(value);
}

function historyRoot(filePath) {
  const resolved = boardPath(filePath);
  const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  return path.join(path.dirname(resolved), ".freeflow-recovery", "history", digest(key));
}

function trashRoot(folderPath) {
  if (!String(folderPath || "").trim()) throw new Error("请先选择工作区");
  return path.join(path.resolve(folderPath), ".freeflow-recovery", "trash");
}

async function regularFile(filePath) {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("恢复操作仅支持普通文件");
  return stat;
}

async function verifyStore(root) {
  // Reject redirected recovery storage instead of reading outside this workspace.
  let current = root;
  while (path.basename(current) !== ".freeflow-recovery") {
    const stat = await fs.lstat(current).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (stat?.isSymbolicLink()) throw new Error("恢复目录不能是符号链接");
    current = path.dirname(current);
  }
  const stat = await fs.lstat(current).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (stat?.isSymbolicLink()) throw new Error("恢复目录不能是符号链接");
}

async function ensureStore(root) {
  await verifyStore(root);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
}

async function listRecords(root) {
  let entries;
  try { await verifyStore(root); entries = await fs.readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const records = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) continue;
    const recordPath = path.join(root, entry.name, "record.json");
    try {
      await regularFile(recordPath);
      const record = JSON.parse(await fs.readFile(recordPath, "utf8"));
      const stored = path.join(root, entry.name, "board.data");
      const stat = await regularFile(stored);
      if (record.id !== entry.name || path.basename(record.name || "") !== record.name || !isSupportedBoardFileName(record.name) || !/^[a-f0-9]{64}$/.test(record.sha256)) continue;
      records.push({ ...record, size: stat.size });
    } catch { /* Incomplete entries stay on disk for manual recovery. */ }
  }
  return records.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
}

async function createRecord(root, filePath, bytes, reason) {
  await ensureStore(root);
  const createdAt = lastRecordTime = Math.max(Date.now(), lastRecordTime + 1);
  const id = `${createdAt}-${crypto.randomBytes(8).toString("hex")}`;
  const directory = path.join(root, id);
  await fs.mkdir(directory, { mode: 0o700 });
  const record = { id, name: path.basename(filePath), originalPath: filePath, createdAt, reason, size: bytes.length, sha256: digest(bytes) };
  for (const [name, data] of [["board.data", bytes], ["record.json", JSON.stringify(record)]]) {
    const result = await atomicWriteFile(path.join(directory, name), data, { mode: 0o600, fsync: true });
    if (!result.ok) throw new Error(result.error || "无法保存恢复副本，已停止文件操作");
  }
  return record;
}

async function snapshotBoardHistory(filePath, { reason = "save", nextData = null } = {}) {
  const resolved = boardPath(filePath);
  let bytes;
  try { await regularFile(resolved); bytes = await fs.readFile(resolved); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (nextData != null && bytes.equals(Buffer.from(nextData))) return null;
  const root = historyRoot(resolved);
  const entries = await listRecords(root);
  if (entries[0]?.sha256 === digest(bytes)) return entries[0];
  const record = await createRecord(root, resolved, bytes, reason);
  let totalBytes = record.size;
  let count = 1;
  for (const entry of entries) {
    totalBytes += entry.size; count += 1;
    if (count > MAX_HISTORY_ENTRIES || totalBytes > MAX_HISTORY_BYTES) {
      await fs.rm(path.join(root, entry.id), { recursive: true, force: true });
    }
  }
  return record;
}

async function readRecord(root, id) {
  if (!ID_PATTERN.test(String(id || ""))) throw new Error("恢复记录无效");
  const entry = (await listRecords(root)).find((candidate) => candidate.id === id);
  if (!entry) throw new Error("恢复记录不存在，请刷新后重试");
  const bytes = await fs.readFile(path.join(root, id, "board.data"));
  if (digest(bytes) !== entry.sha256) throw new Error("恢复副本校验失败，当前画布已保留");
  return { entry, bytes };
}

async function listCanvasHistory(filePath) {
  return { ok: true, entries: await listRecords(historyRoot(filePath)) };
}

async function restoreHistoryUnlocked(filePath, id) {
  const resolved = boardPath(filePath);
  const { bytes } = await readRecord(historyRoot(resolved), id);
  const parsed = parseBoardFileText(bytes.toString("utf8"));
  const board = parsed.payload?.board || parsed.payload;
  if (!Array.isArray(board?.items) || (parsed.envelope?.meta?.checksum && !verifyEnvelopeChecksum(parsed.envelope).valid)) throw new Error("历史画布损坏，已停止恢复");
  await snapshotBoardHistory(resolved, { reason: "before-restore", nextData: bytes });
  // A version restore changes contents while keeping this canvas' current sync identity.
  try {
    const current = parseBoardFileText(await fs.readFile(resolved, "utf8")).payload;
    const currentBoard = current?.board || current;
    if (currentBoard?.boardId) board.boardId = currentBoard.boardId;
    if (parsed.payload.boardId && board.boardId) parsed.payload.boardId = board.boardId;
  } catch { /* A valid historical version can also repair a corrupt current file. */ }
  if (parsed.payload.meta) parsed.payload.meta.boardFilePath = resolved;
  const restored = parsed.envelope ? addChecksumToEnvelope({ ...parsed.envelope, payload: parsed.payload }) : parsed.payload;
  const result = await atomicWriteFile(resolved, JSON.stringify(restored, null, 2), { fsync: true });
  if (!result.ok) throw new Error(result.error || "恢复失败，当前画布已保留");
  return { ok: true, filePath: resolved };
}

async function restoreCanvasHistory(filePath, id) {
  const resolved = boardPath(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  return withFileLock(resolved, () => restoreHistoryUnlocked(resolved, id));
}

async function previewCanvasHistory(filePath, id) {
  const { entry, bytes } = await readRecord(historyRoot(filePath), id);
  const parsed = parseBoardFileText(bytes.toString("utf8"));
  const board = parsed.payload?.board || parsed.payload;
  if (!Array.isArray(board?.items) || (parsed.envelope?.meta?.checksum && !verifyEnvelopeChecksum(parsed.envelope).valid)) throw new Error("历史画布损坏，不能恢复");
  return { ok: true, entry, itemCount: board.items.length, samples: board.items.slice(0, 5).map((item) => String(item.text || item.title || item.name || item.type || "节点").replace(/<[^>]*>/g, "").slice(0, 160)) };
}

async function trashBoardUnlocked(filePath) {
  const resolved = boardPath(filePath);
  await regularFile(resolved);
  const bytes = await fs.readFile(resolved);
  const record = await createRecord(trashRoot(path.dirname(resolved)), resolved, bytes, "delete");
  // Remove the original only after the complete recovery copy is durable.
  if (!(await fs.readFile(resolved)).equals(bytes)) throw new Error("删除期间画布已更新，已取消删除");
  await fs.unlink(resolved);
  return { ok: true, filePath: resolved, trashId: record.id };
}

async function trashCanvasBoard(filePath) {
  const resolved = boardPath(filePath);
  return withFileLock(resolved, () => trashBoardUnlocked(resolved));
}

async function listCanvasTrash(folderPath) {
  return { ok: true, items: await listRecords(trashRoot(folderPath)) };
}

async function restoreCanvasTrash(folderPath, id) {
  const root = trashRoot(folderPath);
  if (!ID_PATTERN.test(String(id || ""))) throw new Error("回收站记录无效");
  await verifyStore(root);
  return withFileLock(path.join(root, id), () => restoreTrashUnlocked(folderPath, id));
}

async function restoreTrashUnlocked(folderPath, id) {
  const root = trashRoot(folderPath);
  const { entry, bytes } = await readRecord(root, id);
  // The stored name determines the destination. Never accept a renderer-supplied path.
  const base = path.basename(entry.name);
  const stem = base.replace(/\.(freeflow|json)$/i, "");
  const extension = path.extname(base);
  for (let index = 0; index < 1000; index += 1) {
    const target = path.join(path.resolve(folderPath), index ? `${stem} 恢复${index > 1 ? ` ${index}` : ""}${extension}` : base);
    try {
      // Exclusive create preserves existing files even if another process creates one concurrently.
      const handle = await fs.open(target, "wx", 0o600);
      let restoredBytes = bytes;
      if (index) {
        try {
          const parsed = parseBoardFileText(bytes.toString("utf8"));
          const board = parsed.payload?.board || parsed.payload;
          if (Array.isArray(board.items)) {
            board.boardId = crypto.randomUUID();
            if (parsed.payload.boardId) parsed.payload.boardId = board.boardId;
            if (parsed.payload.meta) parsed.payload.meta.boardFilePath = target;
            restoredBytes = Buffer.from(JSON.stringify(parsed.envelope ? addChecksumToEnvelope({ ...parsed.envelope, payload: parsed.payload }) : parsed.payload, null, 2));
          }
        } catch { /* Corrupt boards can still be restored for the repair workflow. */ }
      }
      try { await handle.writeFile(restoredBytes); await handle.sync(); }
      catch (error) { await handle.close(); await fs.unlink(target).catch(() => {}); throw error; }
      await handle.close();
      await fs.rm(path.join(root, id), { recursive: true, force: true });
      return { ok: true, filePath: target, renamed: index > 0 };
    } catch (error) { if (error.code !== "EEXIST") throw error; }
  }
  throw new Error("恢复位置存在过多同名文件，请先整理工作区");
}

async function purgeCanvasTrash(folderPath, id) {
  const root = trashRoot(folderPath);
  if (!ID_PATTERN.test(String(id || ""))) throw new Error("回收站记录无效");
  await verifyStore(root);
  return withFileLock(path.join(root, id), async () => {
    if (!(await listRecords(root)).some((entry) => entry.id === id)) throw new Error("回收站记录不存在");
    await fs.rm(path.join(root, id), { recursive: true });
    return { ok: true };
  });
}

async function moveCanvasHistory(sourcePath, targetPath) {
  const source = historyRoot(sourcePath);
  const target = historyRoot(targetPath);
  if (source === target) return;
  let entries;
  await verifyStore(source);
  try { entries = await fs.readdir(source, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  await ensureStore(target);
  const moved = [];
  try {
    for (const entry of entries) {
      if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) continue;
      await fs.rename(path.join(source, entry.name), path.join(target, entry.name));
      moved.push(entry.name);
    }
    await fs.rmdir(source);
  } catch (error) {
    for (const name of moved.reverse()) await fs.rename(path.join(target, name), path.join(source, name));
    throw error;
  }
}

module.exports = { MAX_HISTORY_ENTRIES, MAX_HISTORY_BYTES, snapshotBoardHistory, listCanvasHistory, previewCanvasHistory, restoreCanvasHistory, trashCanvasBoard, listCanvasTrash, restoreCanvasTrash, purgeCanvasTrash, moveCanvasHistory };
