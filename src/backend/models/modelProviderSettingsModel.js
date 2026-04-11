function normalizeString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

const MODEL_PROVIDER_SETTINGS_SCHEMA_VERSION = 1;

function normalizeCloudProviderKind(value, fallback = "bigmodel") {
  const provider = normalizeString(value, fallback).toLowerCase();
  return provider === "openai_compatible" ? "openai_compatible" : "bigmodel";
}

function normalizeModelNameList(input = []) {
  const next = [];
  const seen = new Set();

  const values = Array.isArray(input)
    ? input
    : String(input || "")
        .split(/[\n,]+/g)
        .map((item) => item.trim());

  for (const item of values) {
    const name = normalizeString(item);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(name);
  }

  return next;
}

function getDefaultModelProviderSettings(runtime = {}) {
  const envModels = normalizeModelNameList(runtime.BIGMODEL_MODELS || []);
  const envDefaultModel = normalizeString(runtime.DEFAULT_MODEL || runtime.BIGMODEL_MODEL || envModels[0] || "");

  return {
    schemaVersion: MODEL_PROVIDER_SETTINGS_SCHEMA_VERSION,
    cloud: {
      provider: "bigmodel",
      baseUrl: normalizeString(runtime.BIGMODEL_BASE_URL || "https://open.bigmodel.cn/api/paas/v4"),
      apiKey: normalizeString(runtime.BIGMODEL_API_KEY || ""),
      models: envModels,
      defaultModel: envDefaultModel,
    },
    updatedAt: Date.now(),
  };
}

function normalizeModelProviderSettings(payload = {}, runtime = {}) {
  const defaults = getDefaultModelProviderSettings(runtime);
  const incomingCloud = payload && typeof payload.cloud === "object" ? payload.cloud : {};
  const provider = normalizeCloudProviderKind(incomingCloud.provider, defaults.cloud.provider);
  const fallbackBaseUrl =
    provider === "openai_compatible"
      ? normalizeString(runtime.OPENAI_COMPAT_BASE_URL || "https://api.openai.com/v1")
      : defaults.cloud.baseUrl;
  const models = normalizeModelNameList(incomingCloud.models ?? defaults.cloud.models);
  const defaultModelCandidate = normalizeString(incomingCloud.defaultModel || defaults.cloud.defaultModel || models[0] || "");
  const defaultModel =
    defaultModelCandidate && models.some((item) => item.toLowerCase() === defaultModelCandidate.toLowerCase())
      ? models.find((item) => item.toLowerCase() === defaultModelCandidate.toLowerCase()) || defaultModelCandidate
      : models[0] || defaultModelCandidate;

  return {
    schemaVersion: MODEL_PROVIDER_SETTINGS_SCHEMA_VERSION,
    cloud: {
      provider,
      baseUrl: normalizeString(incomingCloud.baseUrl, fallbackBaseUrl),
      apiKey: normalizeString(incomingCloud.apiKey, defaults.cloud.apiKey),
      models,
      defaultModel,
    },
    updatedAt: payload.updatedAt || Date.now(),
  };
}

module.exports = {
  MODEL_PROVIDER_SETTINGS_SCHEMA_VERSION,
  getDefaultModelProviderSettings,
  normalizeCloudProviderKind,
  normalizeModelProviderSettings,
  normalizeModelNameList,
};
