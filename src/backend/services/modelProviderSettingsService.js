const { MODEL_PROVIDER_SETTINGS_FILE } = require("../config/paths");
const { runtime } = require("../config");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const {
  MODEL_PROVIDER_SETTINGS_SCHEMA_VERSION,
  getDefaultModelProviderSettings,
  normalizeModelProviderSettings,
} = require("../models/modelProviderSettingsModel");

async function readModelProviderSettingsStore() {
  const result = await readVersionedJsonFile(MODEL_PROVIDER_SETTINGS_FILE, {
    defaultValue: getDefaultModelProviderSettings(runtime),
    normalize: (payload) => normalizeModelProviderSettings(payload, runtime),
    currentVersion: MODEL_PROVIDER_SETTINGS_SCHEMA_VERSION,
  });
  return result.data;
}

async function writeModelProviderSettingsStore(payload = {}) {
  const current = await readModelProviderSettingsStore();
  const incomingCloud = payload && typeof payload.cloud === "object" ? payload.cloud : {};
  const incomingApiKey = String(incomingCloud.apiKey || "").trim();
  const nextPayload = {
    ...payload,
    cloud: {
      ...incomingCloud,
      apiKey: incomingApiKey || current.cloud?.apiKey || "",
    },
  };
  const next = normalizeModelProviderSettings(nextPayload, runtime);
  next.updatedAt = Date.now();
  await writeJsonFile(MODEL_PROVIDER_SETTINGS_FILE, next);
  return next;
}

function toPublicModelProviderSettings(store = {}) {
  const cloud = store && typeof store.cloud === "object" ? store.cloud : {};
  return {
    ...store,
    cloud: {
      ...cloud,
      apiKey: "",
      apiKeyConfigured: Boolean(String(cloud.apiKey || "").trim()),
    },
  };
}

module.exports = {
  MODEL_PROVIDER_SETTINGS_FILE,
  readModelProviderSettingsStore,
  toPublicModelProviderSettings,
  writeModelProviderSettingsStore,
};
