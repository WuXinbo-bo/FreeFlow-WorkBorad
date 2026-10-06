const fs = require("fs/promises");
const { SYNC_LEDGER_FILE } = require("../config/paths");
const { atomicWriteJsonFile } = require("../utils/atomicWrite");

const DEFAULT_LEDGER = Object.freeze({ schemaVersion: 1, repository: null, boards: {}, updatedAt: 0 });

async function readLedger(filePath = SYNC_LEDGER_FILE) {
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

async function writeLedger(value, filePath = SYNC_LEDGER_FILE) {
  const next = { ...DEFAULT_LEDGER, ...(value || {}), updatedAt: Date.now() };
  const result = await atomicWriteJsonFile(filePath, next, { mode: 0o600, fsync: true });
  if (!result.ok) throw new Error(result.error || "无法保存同步账本");
  return next;
}

async function updateLedger(mutator, filePath = SYNC_LEDGER_FILE) {
  const current = await readLedger(filePath);
  const next = await mutator({ ...current, boards: { ...current.boards } });
  return writeLedger(next || current, filePath);
}

module.exports = { DEFAULT_LEDGER, readLedger, writeLedger, updateLedger };
