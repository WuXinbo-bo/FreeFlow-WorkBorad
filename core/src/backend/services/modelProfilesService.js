const { MODEL_PROFILES_FILE } = require("../config/paths");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const {
  MODEL_PROFILES_SCHEMA_VERSION,
  getDefaultModelProfiles,
  normalizeModelProfilesStore,
} = require("../models/modelProfilesModel");

async function readModelProfilesStore() {
  const result = await readVersionedJsonFile(MODEL_PROFILES_FILE, {
    defaultValue: getDefaultModelProfiles(),
    normalize: normalizeModelProfilesStore,
    currentVersion: MODEL_PROFILES_SCHEMA_VERSION,
  });
  return result.data;
}

async function writeModelProfilesStore(payload = {}) {
  const next = normalizeModelProfilesStore(payload);
  next.updatedAt = Date.now();
  await writeJsonFile(MODEL_PROFILES_FILE, next);
  return next;
}

module.exports = {
  MODEL_PROFILES_FILE,
  readModelProfilesStore,
  writeModelProfilesStore,
};
