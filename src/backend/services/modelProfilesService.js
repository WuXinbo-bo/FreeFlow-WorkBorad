const { MODEL_PROFILES_FILE } = require("../config/paths");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const {
  MODEL_PROFILES_SCHEMA_VERSION,
  getDefaultModelProfiles,
  normalizeModelProfilesStore,
} = require("../models/modelProfilesModel");

let writeQueue = Promise.resolve();

async function readModelProfilesStore() {
  const result = await readVersionedJsonFile(MODEL_PROFILES_FILE, {
    defaultValue: getDefaultModelProfiles(),
    normalize: normalizeModelProfilesStore,
    currentVersion: MODEL_PROFILES_SCHEMA_VERSION,
  });
  return result.data;
}

function writeModelProfilesStore(payload = {}) {
  const operation = writeQueue.catch(() => {}).then(async () => {
    const current = await readModelProfilesStore().catch(() => getDefaultModelProfiles());
    const next = normalizeModelProfilesStore(payload);
    next.updatedAt = Math.max(Date.now(), Number(current.updatedAt || 0) + 1);
    await writeJsonFile(MODEL_PROFILES_FILE, next);
    return next;
  });
  writeQueue = operation;
  return operation;
}

module.exports = {
  MODEL_PROFILES_FILE,
  readModelProfilesStore,
  writeModelProfilesStore,
};
