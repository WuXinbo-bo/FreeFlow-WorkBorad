const AGENT_SETTINGS_SCHEMA_VERSION = 2;
const AGENT_PROVIDERS = Object.freeze(["codex", "claude"]);
const APPROVAL_POLICIES = new Set(["untrusted", "on-request", "on-failure", "never"]);
const SANDBOX_MODES = new Set(["read-only", "workspace-write", "danger-full-access"]);
const CODEX_REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"]);
const CLAUDE_REASONING_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const REASONING_EFFORTS = new Set([...CODEX_REASONING_EFFORTS, ...CLAUDE_REASONING_EFFORTS, ""]);

function normalizeModels(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const entry of value) {
    const item = typeof entry === "string" ? { id: entry } : entry && typeof entry === "object" ? entry : null;
    const id = String(item?.id || item?.model || item?.name || "").trim().slice(0, 200);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      displayName: String(item?.displayName || item?.display_name || item?.name || id).trim().slice(0, 240) || id,
    });
  }
  return result;
}

function getDefaultProviderSettings(provider) {
  return {
    cliPath: "",
    cliSource: "",
    cliVersion: "",
    baseUrl: "",
    apiKeyConfigured: false,
    models: [],
    modelsFetchedAt: 0,
    selectedModel: "",
    modelValidatedAt: 0,
    legacyModelHint: "",
    reasoningEffort: "high",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    provider,
  };
}

function getDefaultAgentSettings(workspaceRoot = "") {
  return {
    schemaVersion: AGENT_SETTINGS_SCHEMA_VERSION,
    activeProvider: "codex",
    providers: {
      codex: getDefaultProviderSettings("codex"),
      claude: getDefaultProviderSettings("claude"),
    },
    workspaceRoot: String(workspaceRoot || "").trim(),
    queueWhileRunning: true,
    showReasoning: true,
    updatedAt: Date.now(),
  };
}

function normalizeProviderSettings(provider, payload = {}) {
  const defaults = getDefaultProviderSettings(provider);
  const efforts = provider === "claude" ? CLAUDE_REASONING_EFFORTS : CODEX_REASONING_EFFORTS;
  const reasoningEffort = String(payload.reasoningEffort ?? defaults.reasoningEffort).trim();
  const approvalPolicy = String(payload.approvalPolicy || defaults.approvalPolicy).trim();
  const sandboxMode = String(payload.sandboxMode || defaults.sandboxMode).trim();
  const models = normalizeModels(payload.models);
  const selectedModel = String(payload.selectedModel || "").trim().slice(0, 200);
  const selectedIsKnown = models.some((item) => item.id === selectedModel);
  return {
    provider,
    cliPath: String(payload.cliPath || "").trim().slice(0, 1000),
    cliSource: String(payload.cliSource || "").trim().slice(0, 40),
    cliVersion: String(payload.cliVersion || "").trim().slice(0, 160),
    baseUrl: String(payload.baseUrl || "").trim().replace(/\/+$/, "").slice(0, 1000),
    apiKeyConfigured: payload.apiKeyConfigured === true,
    models,
    modelsFetchedAt: Math.max(0, Number(payload.modelsFetchedAt) || 0),
    selectedModel: selectedIsKnown ? selectedModel : "",
    modelValidatedAt: selectedIsKnown ? Math.max(0, Number(payload.modelValidatedAt) || 0) : 0,
    legacyModelHint: String(payload.legacyModelHint || "").trim().slice(0, 200),
    reasoningEffort: efforts.has(reasoningEffort) ? reasoningEffort : defaults.reasoningEffort,
    approvalPolicy: APPROVAL_POLICIES.has(approvalPolicy) ? approvalPolicy : defaults.approvalPolicy,
    sandboxMode: SANDBOX_MODES.has(sandboxMode) ? sandboxMode : defaults.sandboxMode,
  };
}

function migrateLegacySettings(payload, defaults) {
  const codex = normalizeProviderSettings("codex", {
    cliPath: payload.cliPath,
    reasoningEffort: payload.reasoningEffort,
    approvalPolicy: payload.approvalPolicy,
    sandboxMode: payload.sandboxMode,
    legacyModelHint: payload.defaultModel,
  });
  return {
    ...defaults,
    activeProvider: "codex",
    providers: { ...defaults.providers, codex },
    workspaceRoot: String(payload.workspaceRoot || defaults.workspaceRoot).trim().slice(0, 1000),
    queueWhileRunning: payload.queueWhileRunning !== false,
    showReasoning: payload.showReasoning !== false,
    updatedAt: Number(payload.updatedAt) || Date.now(),
  };
}

function normalizeAgentSettings(payload = {}, options = {}) {
  const defaults = getDefaultAgentSettings(options.workspaceRoot);
  if (!payload.providers || typeof payload.providers !== "object") {
    return migrateLegacySettings(payload, defaults);
  }
  const activeProvider = AGENT_PROVIDERS.includes(String(payload.activeProvider))
    ? String(payload.activeProvider)
    : defaults.activeProvider;
  return {
    schemaVersion: AGENT_SETTINGS_SCHEMA_VERSION,
    activeProvider,
    providers: {
      codex: normalizeProviderSettings("codex", payload.providers.codex),
      claude: normalizeProviderSettings("claude", payload.providers.claude),
    },
    workspaceRoot: String(payload.workspaceRoot || defaults.workspaceRoot).trim().slice(0, 1000),
    queueWhileRunning: payload.queueWhileRunning !== false,
    showReasoning: payload.showReasoning !== false,
    updatedAt: Number(payload.updatedAt) || Date.now(),
  };
}

module.exports = {
  AGENT_SETTINGS_SCHEMA_VERSION,
  AGENT_PROVIDERS,
  APPROVAL_POLICIES,
  SANDBOX_MODES,
  REASONING_EFFORTS,
  getDefaultAgentSettings,
  getDefaultProviderSettings,
  normalizeAgentSettings,
  normalizeModels,
  normalizeProviderSettings,
};
