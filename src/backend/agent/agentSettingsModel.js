const AGENT_SETTINGS_SCHEMA_VERSION = 1;
const APPROVAL_POLICIES = new Set(["untrusted", "on-request", "never"]);
const SANDBOX_MODES = new Set(["read-only", "workspace-write", "danger-full-access"]);
const REASONING_EFFORTS = new Set(["", "low", "medium", "high", "xhigh"]);

function getDefaultAgentSettings(workspaceRoot = "") {
  return {
    schemaVersion: AGENT_SETTINGS_SCHEMA_VERSION,
    provider: "codex",
    cliPath: "",
    defaultModel: "",
    reasoningEffort: "high",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    workspaceRoot: String(workspaceRoot || "").trim(),
    queueWhileRunning: true,
    showReasoning: true,
    updatedAt: Date.now(),
  };
}

function normalizeAgentSettings(payload = {}, options = {}) {
  const defaults = getDefaultAgentSettings(options.workspaceRoot);
  const approvalPolicy = String(payload.approvalPolicy || defaults.approvalPolicy).trim();
  const sandboxMode = String(payload.sandboxMode || defaults.sandboxMode).trim();
  const reasoningEffort = String(payload.reasoningEffort ?? defaults.reasoningEffort).trim();
  return {
    schemaVersion: AGENT_SETTINGS_SCHEMA_VERSION,
    provider: "codex",
    cliPath: String(payload.cliPath || "").trim().slice(0, 1000),
    defaultModel: String(payload.defaultModel || "").trim().slice(0, 200),
    reasoningEffort: REASONING_EFFORTS.has(reasoningEffort) ? reasoningEffort : defaults.reasoningEffort,
    approvalPolicy: APPROVAL_POLICIES.has(approvalPolicy) ? approvalPolicy : defaults.approvalPolicy,
    sandboxMode: SANDBOX_MODES.has(sandboxMode) ? sandboxMode : defaults.sandboxMode,
    workspaceRoot: String(payload.workspaceRoot || defaults.workspaceRoot).trim().slice(0, 1000),
    queueWhileRunning: payload.queueWhileRunning !== false,
    showReasoning: payload.showReasoning !== false,
    updatedAt: Number(payload.updatedAt) || Date.now(),
  };
}

module.exports = {
  AGENT_SETTINGS_SCHEMA_VERSION,
  APPROVAL_POLICIES,
  SANDBOX_MODES,
  REASONING_EFFORTS,
  getDefaultAgentSettings,
  normalizeAgentSettings,
};
