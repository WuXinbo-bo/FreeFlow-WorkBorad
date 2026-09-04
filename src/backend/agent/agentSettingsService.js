const { AGENT_SETTINGS_FILE, AGENT_WORKSPACES_DIR, WORKSPACE_DIR } = require("../config/paths");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const secretStorageService = require("../services/secretStorageService");
const {
  AGENT_SETTINGS_SCHEMA_VERSION,
  AGENT_PROVIDERS,
  getDefaultAgentSettings,
  normalizeAgentSettings,
  normalizeModels,
  providerValidationFingerprint,
} = require("./agentSettingsModel");

let writeQueue = Promise.resolve();

function secretId(provider) {
  return `agent-provider:${provider}:api-key`;
}

function assertProvider(provider) {
  const id = String(provider || "").trim().toLowerCase();
  if (!AGENT_PROVIDERS.includes(id)) throw new Error("不支持的 Agent Provider");
  return id;
}

async function readPersistedSettings() {
  const result = await readVersionedJsonFile(AGENT_SETTINGS_FILE, {
    defaultValue: getDefaultAgentSettings(AGENT_WORKSPACES_DIR),
    normalize: (payload) => normalizeAgentSettings(payload, {
      workspaceRoot: AGENT_WORKSPACES_DIR,
      legacyWorkspaceRoot: WORKSPACE_DIR,
    }),
    currentVersion: AGENT_SETTINGS_SCHEMA_VERSION,
  });
  return result.data;
}

async function configuredSecrets() {
  const entries = await Promise.all(AGENT_PROVIDERS.map(async (provider) => [provider, await secretStorageService.readSecret(secretId(provider))]));
  return Object.fromEntries(entries);
}

async function readAgentSettings() {
  const [settings, secrets] = await Promise.all([readPersistedSettings(), configuredSecrets()]);
  return {
    ...settings,
    providers: Object.fromEntries(AGENT_PROVIDERS.map((provider) => [
      provider,
      { ...settings.providers[provider], apiKeyConfigured: Boolean(secrets[provider]) },
    ])),
  };
}

async function readAgentRuntimeSettings(provider) {
  const id = assertProvider(provider);
  const [settings, apiKey] = await Promise.all([readPersistedSettings(), secretStorageService.readSecret(secretId(id))]);
  return { ...settings.providers[id], apiKey, workspaceRoot: settings.workspaceRoot };
}

function mutateSettings(mutator) {
  const operation = writeQueue.catch(() => {}).then(async () => {
    const current = await readPersistedSettings();
    const draft = structuredClone(current);
    await mutator(draft, current);
    draft.updatedAt = Math.max(Date.now(), Number(current.updatedAt || 0) + 1);
    const next = normalizeAgentSettings(draft, { workspaceRoot: AGENT_WORKSPACES_DIR });
    await writeJsonFile(AGENT_SETTINGS_FILE, next);
    return readAgentSettings();
  });
  writeQueue = operation;
  return operation;
}

function writeAgentSettings(payload = {}) {
  return mutateSettings((draft) => {
    const activeProvider = AGENT_PROVIDERS.includes(String(payload.activeProvider))
      ? String(payload.activeProvider)
      : draft.activeProvider;
    draft.activeProvider = activeProvider;
    if (payload.providers && typeof payload.providers === "object") {
      for (const provider of AGENT_PROVIDERS) {
        if (payload.providers[provider] && typeof payload.providers[provider] === "object") {
          draft.providers[provider] = { ...draft.providers[provider], ...payload.providers[provider] };
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, "queueWhileRunning")) draft.queueWhileRunning = payload.queueWhileRunning;
    if (Object.prototype.hasOwnProperty.call(payload, "showReasoning")) draft.showReasoning = payload.showReasoning;

    // Compatibility for the previous flat settings contract during migration.
    const flatKeys = ["cliPath", "defaultModel", "reasoningEffort", "approvalPolicy", "sandboxMode"];
    if (flatKeys.some((key) => Object.prototype.hasOwnProperty.call(payload, key))) {
      const target = draft.providers[activeProvider];
      if (Object.prototype.hasOwnProperty.call(payload, "cliPath")) target.cliPath = payload.cliPath;
      if (Object.prototype.hasOwnProperty.call(payload, "defaultModel")) target.legacyModelHint = payload.defaultModel;
      if (Object.prototype.hasOwnProperty.call(payload, "reasoningEffort")) target.reasoningEffort = payload.reasoningEffort;
      if (Object.prototype.hasOwnProperty.call(payload, "approvalPolicy")) target.approvalPolicy = payload.approvalPolicy;
      if (Object.prototype.hasOwnProperty.call(payload, "sandboxMode")) target.sandboxMode = payload.sandboxMode;
    }
  });
}

function updateProviderRuntime(provider, runtime = {}) {
  const id = assertProvider(provider);
  return mutateSettings((draft) => {
    draft.providers[id] = {
      ...draft.providers[id],
      cliPath: String(runtime.path || "").trim(),
      cliSource: String(runtime.source || "").trim(),
      cliVersion: String(runtime.version || "").trim(),
    };
  });
}

function updateProviderConnection(provider, input = {}) {
  const id = assertProvider(provider);
  const action = String(input.apiKeyAction || "keep").trim().toLowerCase();
  if (!new Set(["keep", "replace", "clear"]).has(action)) throw new Error("API Key 操作无效");
  const incomingKey = String(input.apiKey || "").trim();
  if (action === "replace" && !incomingKey) throw new Error("请输入 API Key");
  const operation = writeQueue.catch(() => {}).then(async () => {
    const current = await readPersistedSettings();
    const previousKey = await secretStorageService.readSecret(secretId(id));
    const nextBaseUrl = String(input.baseUrl || "").trim().replace(/\/+$/, "");
    const connectionChanged = current.providers[id].baseUrl !== nextBaseUrl || action !== "keep";
    const draft = structuredClone(current);
    draft.providers[id] = {
      ...draft.providers[id],
      baseUrl: nextBaseUrl,
      ...(connectionChanged ? {
        models: [],
        modelsFetchedAt: 0,
        selectedModel: "",
        modelValidatedAt: 0,
        validationFingerprint: "",
        connectionRevision: Math.max(0, Number(current.providers[id].connectionRevision) || 0) + 1,
      } : {}),
    };
    draft.updatedAt = Math.max(Date.now(), Number(current.updatedAt || 0) + 1);
    const next = normalizeAgentSettings(draft, { workspaceRoot: AGENT_WORKSPACES_DIR });
    try {
      if (action === "replace") await secretStorageService.writeSecret(secretId(id), incomingKey);
      if (action === "clear") await secretStorageService.clearSecret(secretId(id));
      await writeJsonFile(AGENT_SETTINGS_FILE, next);
    } catch (error) {
      if (previousKey) await secretStorageService.writeSecret(secretId(id), previousKey).catch(() => {});
      else await secretStorageService.clearSecret(secretId(id)).catch(() => {});
      throw error;
    }
    return readAgentSettings();
  });
  writeQueue = operation;
  return operation;
}

function updateProviderModels(provider, models) {
  const id = assertProvider(provider);
  const normalized = normalizeModels(models);
  if (!normalized.length) throw new Error("模型目录不能为空");
  return mutateSettings((draft) => {
    const current = draft.providers[id];
    const selectedStillExists = normalized.some((item) => item.id === current.selectedModel);
    draft.providers[id] = {
      ...current,
      models: normalized,
      modelsFetchedAt: Date.now(),
      selectedModel: selectedStillExists ? current.selectedModel : "",
      modelValidatedAt: 0,
      validationFingerprint: "",
    };
  });
}

function selectProviderModel(provider, model) {
  const id = assertProvider(provider);
  const selectedModel = String(model || "").trim();
  if (!selectedModel) throw new Error("请选择模型");
  return mutateSettings((draft) => {
    if (!draft.providers[id].models.some((item) => item.id === selectedModel)) throw new Error("所选模型不在最新目录中，请重新刷新");
    draft.providers[id] = { ...draft.providers[id], selectedModel, modelValidatedAt: 0, validationFingerprint: "" };
  });
}

function markProviderValidated(provider) {
  const id = assertProvider(provider);
  return mutateSettings((draft) => {
    if (!draft.providers[id].selectedModel) throw new Error("请先选择模型");
    const next = { ...draft.providers[id], modelValidatedAt: Date.now() };
    next.validationFingerprint = providerValidationFingerprint(id, next);
    draft.providers[id] = next;
  });
}

module.exports = {
  AGENT_SETTINGS_FILE,
  readAgentSettings,
  readAgentRuntimeSettings,
  writeAgentSettings,
  updateProviderRuntime,
  updateProviderConnection,
  updateProviderModels,
  selectProviderModel,
  markProviderValidated,
};
