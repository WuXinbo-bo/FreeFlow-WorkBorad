const fs = require("fs/promises");
const path = require("path");
const { SYNC_LEDGER_FILE } = require("../config/paths");
const { atomicWriteJsonFile } = require("../utils/atomicWrite");

const DEFAULT_LEDGER = Object.freeze({ schemaVersion: 2, repository: null, workspaceId: "", remoteWorkspace: null, boards: {}, updatedAt: 0 });
const pendingWrites = new Map();

async function readLedgerFile(filePath) {
  try {
    const value = JSON.parse(await fs.readFile(filePath, "utf8"));
    return {
      ...DEFAULT_LEDGER,
      ...(value && typeof value === "object" ? value : {}),
      boards: value?.boards && typeof value.boards === "object" ? value.boards : {},
    };
  } catch {
    return { ...DEFAULT_LEDGER, boards: {} };
  }
}

async function writeLedgerFile(value, filePath) {
  const next = { ...DEFAULT_LEDGER, ...(value || {}), updatedAt: Date.now() };
  const result = await atomicWriteJsonFile(filePath, next, { mode: 0o600, fsync: true });
  if (!result.ok) throw new Error(result.error || "无法保存同步账本");
  return next;
}

function serializeWrite(filePath, operation) {
  const key = path.resolve(filePath);
  const previous = pendingWrites.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  pendingWrites.set(key, next);
  next.finally(() => {
    if (pendingWrites.get(key) === next) pendingWrites.delete(key);
  }).catch(() => {});
  return next;
}

async function readLedger(filePath = SYNC_LEDGER_FILE) {
  await pendingWrites.get(path.resolve(filePath))?.catch(() => {});
  return readLedgerFile(filePath);
}

async function writeLedger(value, filePath = SYNC_LEDGER_FILE) {
  return serializeWrite(filePath, () => writeLedgerFile(value, filePath));
}

async function updateLedger(mutator, filePath = SYNC_LEDGER_FILE) {
  return serializeWrite(filePath, async () => {
    const current = await readLedgerFile(filePath);
    const next = await mutator({ ...current, boards: { ...current.boards } });
    return writeLedgerFile(next || current, filePath);
  });
}

module.exports = { DEFAULT_LEDGER, readLedger, writeLedger, updateLedger };
