const ACTIVE_STATUSES = new Set(["starting", "running", "waitingApproval", "interrupting"]);
const ROUTINE_STATUS_PATTERN = /会话已连接|开始运行|任务完成|connected|initialized|(?:session|thread|turn).*(?:start|complete)/i;
const GROUPABLE_TYPES = new Set(["command", "file", "read", "search", "tool", "mcp", "status"]);

const TYPE_LABELS = {
  command: "执行命令",
  file: "修改文件",
  read: "读取资料",
  search: "网页搜索",
  tool: "调用工具",
  mcp: "调用 MCP",
  plan: "更新计划",
  reasoning: "思考",
  status: "运行状态",
  error: "执行失败",
  unknown: "其他操作",
};

function legacySemanticType(activity = {}) {
  const payload = activity.payload || {};
  const type = String(activity.semanticType || payload.semanticType || payload.activityType || payload.item?.type || "unknown");
  if (["command", "commandExecution", "command-output"].includes(type)) return "command";
  if (["file", "fileChange", "file-change", "file-output", "diff"].includes(type)) return "file";
  if (["read", "fileRead"].includes(type)) return "read";
  if (["search", "webSearch"].includes(type)) return "search";
  if (["mcp", "mcpToolCall"].includes(type)) return "mcp";
  if (["tool", "imageView"].includes(type)) return "tool";
  if (["plan", "todo"].includes(type)) return "plan";
  if (type === "reasoning") return "reasoning";
  if (["warning", "error"].includes(type)) return "error";
  if (["status", "steer", "contextCompaction"].includes(type)) return "status";
  return "unknown";
}

function normalizePhase(activity = {}, semanticType = "unknown") {
  const payload = activity.payload || {};
  const value = String(activity.phase || payload.phase || payload.status || "").toLowerCase();
  if (semanticType === "error" || ["failed", "error", "cancelled", "canceled"].includes(value)) return "failed";
  if (["completed", "complete", "success", "succeeded"].includes(value)) return "completed";
  return "running";
}

function detailValue(activity = {}) {
  const payload = activity.payload || {};
  return activity.detail ?? payload.detail ?? payload.item ?? payload.params ?? null;
}

function summaryValue(activity = {}) {
  const payload = activity.payload || {};
  const item = payload.item || {};
  const value = activity.summary ?? payload.summary ?? item.command ?? item.query ?? item.text ?? "";
  return typeof value === "string" ? value.trim() : JSON.stringify(value);
}

export function normalizePresentedActivity(activity = {}, index = 0) {
  const payload = activity.payload || {};
  const rawType = String(activity.rawType || payload.activityType || payload.item?.type || "unknown");
  if (["userMessage", "agentMessage"].includes(rawType)) return null;
  const semanticType = legacySemanticType(activity);
  const phase = normalizePhase(activity, semanticType);
  const summary = summaryValue(activity) || TYPE_LABELS[semanticType];
  return {
    id: String(activity.id || `${activity.turnId || payload.turnId || "session"}:${activity.providerItemId || payload.itemId || index}`),
    turnId: String(activity.turnId || payload.turnId || ""),
    semanticType,
    phase,
    title: String(activity.title || TYPE_LABELS[semanticType]),
    summary,
    detail: detailValue(activity),
    createdAt: Number(activity.createdAt || 0),
    updatedAt: Number(activity.updatedAt || activity.createdAt || 0),
  };
}

export function visibleActivities(activities = [], { showReasoning = true } = {}) {
  const normalized = activities.map(normalizePresentedActivity).filter(Boolean);
  const meaningful = normalized.filter((activity) => {
    if (activity.semanticType === "unknown") return false;
    if (activity.semanticType === "reasoning" && /^(?:正在思考|思考)$/.test(activity.summary)) return false;
    if (activity.semanticType === "status" && activity.phase !== "failed" && ROUTINE_STATUS_PATTERN.test(activity.summary)) return false;
    return true;
  });
  const latestReasoning = [...meaningful].reverse().find((activity) => activity.semanticType === "reasoning");
  return meaningful.filter((activity) => activity.semanticType !== "reasoning" || (showReasoning && activity.id === latestReasoning?.id));
}

export function groupPresentedActivities(activities = []) {
  const result = [];
  for (const activity of activities) {
    const previous = result.at(-1);
    if (GROUPABLE_TYPES.has(activity.semanticType) && previous?.semanticType === activity.semanticType) {
      previous.activities.push(activity);
      continue;
    }
    result.push({
      id: `activity-group:${activity.id}`,
      semanticType: activity.semanticType,
      activities: [activity],
    });
  }
  return result;
}

export function formatTurnDuration(turn = {}, now = Date.now()) {
  const start = Number(turn.startedAt || turn.createdAt || 0);
  const end = Number(turn.completedAt || (ACTIVE_STATUSES.has(turn.status) ? now : turn.createdAt) || 0);
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 1) return "少于 1 秒";
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

function turnProcessLabel(turn, activities) {
  const duration = formatTurnDuration(turn);
  if (turn.status === "failed") return `执行未完成 · ${duration}`;
  if (turn.status === "cancelled") return `已停止 · ${duration}`;
  if (ACTIVE_STATUSES.has(turn.status)) {
    const latest = activities.at(-1);
    return latest?.semanticType === "reasoning" ? "正在思考" : latest?.title || "正在响应";
  }
  const count = activities.filter((activity) => !["reasoning", "status"].includes(activity.semanticType)).length;
  return `处理完成${count ? ` · ${count} 项` : ""} · ${duration}`;
}

export function buildConversationTurns(session = {}, options = {}) {
  const messages = Array.isArray(session.messages) ? session.messages : [];
  const activities = visibleActivities(session.activities, options);
  const turns = (Array.isArray(session.turns) ? session.turns : []).map((turn) => {
    const turnMessages = messages.filter((message) => message.turnId === turn.id);
    const turnActivities = activities.filter((activity) => activity.turnId === turn.id);
    const approvals = (session.approvals || []).filter((approval) => approval.turnId === turn.id);
    return {
      id: turn.id,
      turn,
      userMessages: turnMessages.filter((message) => message.role === "user"),
      assistantMessages: turnMessages.filter((message) => message.role === "assistant"),
      activities: turnActivities,
      activityGroups: groupPresentedActivities(turnActivities),
      approvals,
      active: ACTIVE_STATUSES.has(turn.status),
      processLabel: turnProcessLabel(turn, turnActivities),
      createdAt: Number(turn.createdAt || turnMessages[0]?.createdAt || 0),
    };
  });
  const knownTurnIds = new Set(turns.map((turn) => turn.id));
  const orphanMessages = messages.filter((message) => !knownTurnIds.has(message.turnId));
  for (const message of orphanMessages) {
    turns.push({
      id: `message:${message.id}`,
      turn: { id: "", status: "completed", createdAt: message.createdAt },
      userMessages: message.role === "user" ? [message] : [],
      assistantMessages: message.role === "assistant" ? [message] : [],
      activities: [],
      activityGroups: [],
      approvals: [],
      active: false,
      processLabel: "",
      createdAt: Number(message.createdAt || 0),
    });
  }
  turns.sort((left, right) => left.createdAt - right.createdAt);
  const knownApprovalIds = new Set(turns.flatMap((turn) => turn.approvals.map((approval) => approval.id)));
  return {
    turns,
    sessionActivities: activities.filter((activity) => !activity.turnId || !knownTurnIds.has(activity.turnId)),
    sessionApprovals: (session.approvals || []).filter((approval) => !knownApprovalIds.has(approval.id)),
  };
}

export function activityGroupLabel(group) {
  const count = group.activities.length;
  if (count === 1) return group.activities[0].title;
  if (group.semanticType === "command") return `执行 ${count} 个命令`;
  if (group.semanticType === "file") return `修改 ${count} 项文件`;
  if (group.semanticType === "read") return `读取 ${count} 项资料`;
  if (group.semanticType === "search") return `搜索 ${count} 次`;
  if (group.semanticType === "mcp") return `调用 ${count} 个 MCP`;
  if (group.semanticType === "tool") return `调用 ${count} 个工具`;
  return `${TYPE_LABELS[group.semanticType] || "操作"} ${count} 项`;
}
