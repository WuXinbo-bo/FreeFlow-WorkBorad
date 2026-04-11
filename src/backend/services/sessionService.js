const { SESSIONS_FILE } = require("../config/paths");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const {
  SESSION_STORE_SCHEMA_VERSION,
  getDefaultSessionStore,
  normalizeSessionStore,
} = require("../models/sessionStoreModel");

async function readSessionStore() {
  const result = await readVersionedJsonFile(SESSIONS_FILE, {
    defaultValue: getDefaultSessionStore(),
    normalize: normalizeSessionStore,
    currentVersion: SESSION_STORE_SCHEMA_VERSION,
  });
  return {
    ...result.data,
    fileSizeBytes: result.fileSizeBytes,
    updatedAt: result.updatedAt,
  };
}

async function writeSessionStore(payload = {}) {
  const normalized = normalizeSessionStore(payload);
  await writeJsonFile(SESSIONS_FILE, normalized);
  return {
    schemaVersion: normalized.schemaVersion,
    fileSizeBytes: Buffer.byteLength(JSON.stringify(normalized, null, 2), "utf8"),
    updatedAt: normalized.updatedAt || Date.now(),
  };
}

module.exports = {
  SESSIONS_FILE,
  readSessionStore,
  writeSessionStore,
};
