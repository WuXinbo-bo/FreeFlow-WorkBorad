const { MODEL_PROVIDER_SETTINGS_FILE } = require("../config/paths");
const { runtime } = require("../config");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const secretStorageService = require("./secretStorageService");
const {
  MODEL_PROVIDER_SETTINGS_SCHEMA_VERSION,
  getDefaultModelProviderSettings,
  normalizeModelProviderSettings,
} = require("../models/modelProviderSettingsModel");

const CLOUD_API_KEY_SECRET_ID = "ai.cloud.apiKey";
let writeQueue = Promise.resolve();

function getPersistedDefaults() {
  const defaults = getDefaultModelProviderSettings(runtime);
  return {
    ...defaults,
    cloud: {
      ...defaults.cloud,
      apiKey: "",
      apiKeyConfigured: Boolean(defaults.cloud.apiKey),
    },
  };
}

function stripSecret(settings = {}) {
  const cloud = settings && typeof settings.cloud === "object" ? settings.cloud : {};
  return {
    ...settings,
    cloud: {
      ...cloud,
      apiKey: "",
      apiKeyConfigured: Boolean(cloud.apiKeyConfigured || String(cloud.apiKey || "").trim()),
    },
  };
}

async function readModelProviderSettingsStore() {
  const result = await readVersionedJsonFile(MODEL_PROVIDER_SETTINGS_FILE, {
    defaultValue: getPersistedDefaults(),
    normalize: (payload) => normalizeModelProviderSettings(payload, runtime),
    currentVersion: MODEL_PROVIDER_SETTINGS_SCHEMA_VERSION,
  });
  const legacyApiKey = String(result.data?.cloud?.apiKey || "").trim();
  let storedApiKey = await secretStorageService.readSecret(CLOUD_API_KEY_SECRET_ID);
  if (legacyApiKey) {
    await secretStorageService.writeSecret(CLOUD_API_KEY_SECRET_ID, legacyApiKey);
    storedApiKey = legacyApiKey;
    await writeJsonFile(MODEL_PROVIDER_SETTINGS_FILE, stripSecret(result.data));
  }
  const fallbackApiKey = String(runtime.BIGMODEL_API_KEY || "").trim();
  const apiKey = storedApiKey || fallbackApiKey;
  return {
    ...result.data,
    cloud: {
      ...(result.data.cloud || {}),
      apiKey,
      apiKeyConfigured: Boolean(apiKey),
    },
  };
}

function writeModelProviderSettingsStore(payload = {}) {
  const operation = writeQueue.catch(() => {}).then(async () => {
    const current = await readModelProviderSettingsStore();
    const incomingCloud = payload && typeof payload.cloud === "object" ? payload.cloud : {};
    const requestedAction = String(incomingCloud.apiKeyAction || payload.apiKeyAction || "").trim().toLowerCase();
    const incomingApiKey = String(incomingCloud.apiKey || "").trim();
    const shouldClear = requestedAction === "clear";
    const shouldReplace = requestedAction === "replace" || Boolean(incomingApiKey);
    const previousApiKey = String(current.cloud?.apiKey || "").trim();
    const nextApiKey = shouldClear ? "" : shouldReplace ? incomingApiKey : previousApiKey;
    const next = normalizeModelProviderSettings(
      {
        ...current,
        ...payload,
        cloud: {
          ...(current.cloud || {}),
          ...incomingCloud,
          apiKey: nextApiKey,
          apiKeyConfigured: Boolean(nextApiKey),
        },
      },
      runtime
    );
    next.updatedAt = Math.max(Date.now(), Number(current.updatedAt || 0) + 1);

    try {
      if (shouldClear) {
        await secretStorageService.clearSecret(CLOUD_API_KEY_SECRET_ID);
      } else if (shouldReplace) {
        if (!incomingApiKey) throw new Error("API Key is required when replacing credentials");
        await secretStorageService.writeSecret(CLOUD_API_KEY_SECRET_ID, incomingApiKey);
      }
      await writeJsonFile(MODEL_PROVIDER_SETTINGS_FILE, stripSecret(next));
    } catch (error) {
      if (previousApiKey) {
        await secretStorageService.writeSecret(CLOUD_API_KEY_SECRET_ID, previousApiKey).catch(() => {});
      } else {
        await secretStorageService.clearSecret(CLOUD_API_KEY_SECRET_ID).catch(() => {});
      }
      throw error;
    }
    return next;
  });
  writeQueue = operation;
  return operation;
}

function toPublicModelProviderSettings(store = {}) {
  const cloud = store && typeof store.cloud === "object" ? store.cloud : {};
  return {
    ...store,
    cloud: {
      ...cloud,
      apiKey: "",
      apiKeyConfigured: Boolean(cloud.apiKeyConfigured || String(cloud.apiKey || "").trim()),
    },
  };
}

module.exports = {
  MODEL_PROVIDER_SETTINGS_FILE,
  readModelProviderSettingsStore,
  toPublicModelProviderSettings,
  writeModelProviderSettingsStore,
};
