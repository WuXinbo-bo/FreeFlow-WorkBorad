const MODEL_PROFILES_SCHEMA_VERSION = 1;

function getDefaultModelProfiles() {
  return {
    schemaVersion: MODEL_PROFILES_SCHEMA_VERSION,
    profiles: {},
    updatedAt: Date.now(),
  };
}

function normalizeModelProfilesStore(payload = {}) {
  return {
    schemaVersion: MODEL_PROFILES_SCHEMA_VERSION,
    profiles: payload.profiles && typeof payload.profiles === "object" ? payload.profiles : {},
    updatedAt: payload.updatedAt || Date.now(),
  };
}

module.exports = {
  MODEL_PROFILES_SCHEMA_VERSION,
  getDefaultModelProfiles,
  normalizeModelProfilesStore,
};
