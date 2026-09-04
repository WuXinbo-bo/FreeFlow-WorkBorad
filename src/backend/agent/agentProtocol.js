const ACTIVITY_METHODS = new Map([
  ["turn/plan/updated", "plan"],
  ["turn/diff/updated", "diff"],
  ["item/reasoning/summaryTextDelta", "reasoning"],
  ["item/reasoning/textDelta", "reasoning"],
  ["item/commandExecution/outputDelta", "command-output"],
  ["item/fileChange/outputDelta", "file-output"],
  ["item/fileChange/patchUpdated", "file-change"],
  ["item/mcpToolCall/progress", "tool"],
  ["warning", "warning"],
  ["error", "error"],
]);

const APPROVAL_METHODS = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request",
]);

const APPROVAL_POLICIES = new Set(["untrusted", "on-request", "never"]);
const SANDBOX_MODES = new Set(["read-only", "workspace-write", "danger-full-access"]);

function normalizeApprovalPolicy(value, fallback = "on-request") {
  const candidate = typeof value === "string"
    ? value
    : typeof value?.type === "string"
      ? value.type
      : "";
  if (APPROVAL_POLICIES.has(candidate)) return candidate;
  return APPROVAL_POLICIES.has(fallback) ? fallback : "on-request";
}

function normalizeSandboxMode(value, fallback = "workspace-write") {
  const candidate = typeof value === "string" ? value : String(value?.type || "");
  const aliases = {
    readOnly: "read-only",
    workspaceWrite: "workspace-write",
    dangerFullAccess: "danger-full-access",
  };
  const normalized = aliases[candidate] || candidate;
  if (SANDBOX_MODES.has(normalized)) return normalized;
  return SANDBOX_MODES.has(fallback) ? fallback : "workspace-write";
}

function normalizeThreadStartResponse(result, fallback = {}) {
  const threadId = String(result?.thread?.id || "").trim();
  if (!threadId) {
    throw Object.assign(new Error("Codex did not return a thread id"), {
      code: "AGENT_PROTOCOL_RESPONSE_INVALID",
      recoverable: true,
    });
  }
  return {
    threadId,
    model: typeof result?.model === "string" ? result.model : String(fallback.model || ""),
    reasoningEffort: typeof result?.reasoningEffort === "string"
      ? result.reasoningEffort
      : String(fallback.reasoningEffort || ""),
    approvalPolicy: normalizeApprovalPolicy(result?.approvalPolicy, fallback.approvalPolicy),
    sandboxMode: normalizeSandboxMode(result?.sandbox, fallback.sandboxMode),
  };
}

function serializeAgentError(error, fallbackCode = "AGENT_TURN_FAILED") {
  const technicalMessage = String(error?.message || error || "Unknown Agent error").slice(0, 1200);
  const code = String(error?.code || fallbackCode);
  const messages = {
    AGENT_THREAD_BIND_FAILED: "AI 会话初始化失败，本地状态已安全回滚。",
    AGENT_PROTOCOL_RESPONSE_INVALID: "AI 运行时返回了无法识别的会话数据。",
    AGENT_PROVIDER_NOT_READY: "当前模型连接尚未就绪，请检查 AI 设置。",
  };
  return {
    code,
    message: messages[code] || "任务未能完成，可以重试。",
    technicalMessage,
    recoverable: error?.recoverable !== false,
  };
}

function mapTurnStatus(value) {
  switch (String(value || "")) {
    case "inProgress": return "running";
    case "interrupted": return "cancelled";
    case "completed": return "completed";
    case "failed": return "failed";
    default: return "running";
  }
}

function getThreadItemSummary(item = {}) {
  switch (item.type) {
    case "commandExecution": return item.command || "执行命令";
    case "fileChange": return `${Array.isArray(item.changes) ? item.changes.length : 0} 项文件变更`;
    case "webSearch": return item.query || "网页搜索";
    case "mcpToolCall": return `${item.server || "MCP"} · ${item.tool || "工具"}`;
    case "reasoning": return (item.summary || []).join("\n") || "正在思考";
    case "plan": return item.text || "更新计划";
    case "imageView": return item.path || "查看图片";
    case "contextCompaction": return "压缩会话上下文";
    default: return item.text || item.type || "活动";
  }
}

function normalizeNotification(method, params = {}) {
  if (method === "serverRequest/resolved") {
    return { kind: "approval-resolved", threadId: params.threadId, requestId: params.requestId };
  }
  if (method === "item/agentMessage/delta") {
    return { kind: "message-delta", threadId: params.threadId, turnId: params.turnId, itemId: params.itemId, delta: params.delta || "" };
  }
  if (method === "turn/started" || method === "turn/completed") {
    return {
      kind: "turn-state",
      threadId: params.threadId,
      turnId: params.turn?.id,
      status: mapTurnStatus(params.turn?.status),
      error: params.turn?.error || null,
      turn: params.turn || {},
    };
  }
  if (method === "item/started" || method === "item/completed") {
    const item = params.item || {};
    if (item.type === "agentMessage" && method === "item/completed") {
      return { kind: "message-completed", threadId: params.threadId, turnId: params.turnId, itemId: item.id, text: item.text || "", item };
    }
    return {
      kind: "activity",
      threadId: params.threadId,
      turnId: params.turnId,
      itemId: item.id || "",
      activityType: item.type || "unknown",
      status: method === "item/started" ? "running" : item.status || "completed",
      summary: getThreadItemSummary(item),
      item,
    };
  }
  const activityType = ACTIVITY_METHODS.get(method);
  if (activityType) {
    return {
      kind: "activity",
      threadId: params.threadId,
      turnId: params.turnId,
      itemId: params.itemId || "",
      activityType,
      status: method === "error" ? "failed" : "running",
      summary: params.delta || params.diff || params.message || params.error?.message || method,
      params,
    };
  }
  return { kind: "unknown", method, threadId: params.threadId, turnId: params.turnId, params };
}

function buildApprovalResponse(method, decision, payload = {}) {
  if (method === "item/tool/requestUserInput") {
    const input = payload.answers && typeof payload.answers === "object" ? payload.answers : {};
    return {
      answers: Object.fromEntries(
        Object.entries(input).map(([id, value]) => [
          id,
          { answers: Array.isArray(value) ? value.map(String) : [String(value ?? "")] },
        ])
      ),
    };
  }
  if (method === "mcpServer/elicitation/request") {
    const action = ["accept", "decline", "cancel"].includes(decision) ? decision : "decline";
    return action === "accept" && payload.content && typeof payload.content === "object"
      ? { action, content: payload.content }
      : { action };
  }
  if (method === "item/permissions/requestApproval") {
    return decision === "accept" || decision === "acceptForSession"
      ? {
          permissions: payload.permissions || {},
          scope: decision === "acceptForSession" || payload.scope === "session" ? "session" : "turn",
        }
      : { permissions: {}, scope: "turn" };
  }
  const normalized = ["accept", "acceptForSession", "decline", "cancel"].includes(decision) ? decision : "decline";
  return { decision: normalized };
}

module.exports = {
  APPROVAL_METHODS,
  buildApprovalResponse,
  mapTurnStatus,
  normalizeApprovalPolicy,
  normalizeNotification,
  normalizeSandboxMode,
  normalizeThreadStartResponse,
  serializeAgentError,
};
