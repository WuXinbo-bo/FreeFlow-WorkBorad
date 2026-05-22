const { CLIPBOARD_STORE_FILE } = require("../config/paths");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const {
  CLIPBOARD_STORE_SCHEMA_VERSION,
  getDefaultClipboardStore,
  normalizeClipboardStore,
} = require("../models/clipboardStoreModel");

async function readClipboardStore() {
  const result = await readVersionedJsonFile(CLIPBOARD_STORE_FILE, {
    defaultValue: getDefaultClipboardStore(),
    normalize: normalizeClipboardStore,
    currentVersion: CLIPBOARD_STORE_SCHEMA_VERSION,
  });
  return result.data;
}

async function writeClipboardStore(payload = {}) {
  const next = normalizeClipboardStore(payload);
  next.updatedAt = Date.now();
  await writeJsonFile(CLIPBOARD_STORE_FILE, next);
  return next;
}

module.exports = {
  CLIPBOARD_STORE_FILE,
  readClipboardStore,
  writeClipboardStore,
};
