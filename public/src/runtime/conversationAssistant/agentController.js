import { activityGroupLabel, buildConversationTurns } from "./activityPresentation.js";

const ACTIVE_STATUSES = new Set(["starting", "running", "waitingApproval", "interrupting"]);
const CURRENT_SESSION_KEY = "freeflow_agent_current_session_v1";
const LEGACY_STORAGE_KEYS = [
  "ai_worker_sessions_v2",
  "ai_worker_current_session_v2",
  "ai_worker_agent_mode_v1",
  "ai_worker_output_mode_v1",
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(value) {
  if (!Number(value)) return "";
  return new Date(Number(value)).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatRelativeTime(value) {
  const elapsed = Math.max(0, Date.now() - Number(value || 0));
  if (elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return new Date(Number(value)).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function truncate(value, length = 54) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function activityDetails(activity = {}) {
  const detail = activity.detail;
  if (detail == null || detail === "") return "";
  if (typeof detail === "string") return detail.trim();
  if (typeof detail !== "object") return String(detail).trim();
  const value = detail.aggregatedOutput || detail.output || detail.diff || detail.command || detail.query || detail.path || detail.input;
  return (typeof value === "string" ? value : JSON.stringify(detail, null, 2)).trim();
}

function approvalLabel(method = "") {
  if (method.includes("commandExecution")) return "允许执行命令？";
  if (method.includes("fileChange")) return "允许修改文件？";
  if (method.includes("permissions")) return "允许扩展权限？";
  if (method.includes("requestUserInput")) return "Codex 需要你的输入";
  return "需要确认";
}

function approvalSummary(approval = {}) {
  const params = approval.params || {};
  return params.command || params.reason || params.message || params.path || JSON.stringify(params, null, 2);
}

function getElements(doc) {
  return {
    panel: doc.querySelector(".conversation-panel"),
    title: doc.querySelector("#conversation-title"),
    mode: doc.querySelector("#conversation-mode-pill"),
    runtimeStatus: doc.querySelector("#agent-runtime-status"),
    chatLog: doc.querySelector("#chat-log"),
    threadViewport: doc.querySelector("#thread-viewport"),
    scrollBottom: doc.querySelector("#agent-scroll-bottom"),
    queueTray: doc.querySelector("#agent-queue-tray"),
    form: doc.querySelector("#chat-form"),
    prompt: doc.querySelector("#prompt-input"),
    send: doc.querySelector("#send-btn"),
    stop: doc.querySelector("#stop-btn"),
    newSession: doc.querySelector("#clear-btn"),
    rename: doc.querySelector("#agent-rename-session-btn"),
    fork: doc.querySelector("#agent-fork-session-btn"),
    sessionMore: doc.querySelector("#agent-session-more"),
    historyToggle: doc.querySelector("#agent-history-toggle-btn"),
    historyClose: doc.querySelector("#agent-history-close-btn"),
    historyPanel: doc.querySelector("#agent-history-panel"),
    historySearch: doc.querySelector("#agent-history-search-input"),
    historyList: doc.querySelector("#agent-history-list"),
    attachments: doc.querySelector("#composer-attachments"),
    attach: doc.querySelector("#agent-attach-btn"),
    fileInput: doc.querySelector("#agent-file-input"),
    submitMode: doc.querySelector("#agent-submit-mode"),
    composerStatus: doc.querySelector("#agent-composer-status"),
  };
}

export function createAgentController(options = {}) {
  const doc = options.document || document;
  const client = options.client;
  const desktopShell = options.desktopShell || null;
  const setStatus = options.setStatus || (() => {});
  const setRichContent = options.setRichContent || ((element, content) => { element.textContent = content; });
  const onOpenSettings = options.onOpenSettings || (() => {});
  const onRuntime = options.onRuntime || (() => {});
  const refs = getElements(doc);
  let initialized = false;
  let runtime = null;
  let sessions = [];
  let session = null;
  let selectedAttachmentIds = [];
  let unsubscribe = null;
  let selectionGeneration = 0;
  let refreshTimer = 0;
  let action = "";
  let historyOpen = false;
  let disconnected = false;
  let followThread = true;

  async function handleDataRestored() {
    if (!initialized) return;
    ++selectionGeneration;
    unsubscribe?.();
    unsubscribe = null;
    session = null;
    localStorage.removeItem(CURRENT_SESSION_KEY);
    await refreshRuntime();
    setStatus("AI 会话备份已恢复", "success");
  }

  function isBusy() {
    return Boolean(session && ACTIVE_STATUSES.has(session.status));
  }

  function setHistoryOpen(open) {
    historyOpen = Boolean(open);
    refs.historyPanel?.classList.toggle("is-hidden", !historyOpen);
    refs.historyPanel?.setAttribute("aria-hidden", String(!historyOpen));
    refs.historyToggle?.setAttribute("aria-expanded", String(historyOpen));
  }

  function renderHistory() {
    if (!refs.historyList) return;
    const query = String(refs.historySearch?.value || "").trim().toLowerCase();
    const filtered = sessions.filter((item) => !query || `${item.title} ${item.preview}`.toLowerCase().includes(query));
    refs.historyList.innerHTML = filtered.length ? filtered.map((item) => `
      <button class="agent-history-item${item.id === session?.id ? " is-active" : ""}" type="button" data-agent-session="${escapeHtml(item.id)}">
        <span class="agent-history-item-head">
          <strong>${escapeHtml(item.title || "新会话")}</strong>
          <span class="agent-history-delete" role="button" tabindex="0" data-agent-delete-session="${escapeHtml(item.id)}" aria-label="删除会话" title="删除会话">×</span>
        </span>
        <p>${escapeHtml(truncate(item.preview || "空会话"))}</p>
        <time>${escapeHtml(formatRelativeTime(item.updatedAt))}</time>
      </button>
    `).join("") : `<div class="agent-empty"><p>${query ? "没有匹配的会话" : "还没有会话"}</p></div>`;
  }

  function renderHeader() {
    if (refs.title) refs.title.textContent = session?.title || "新会话";
    if (refs.mode) {
      const provider = session?.provider || runtime?.activeProvider || "codex";
      const providerName = provider === "claude" ? "Claude" : "Codex";
      const model = session?.model || runtime?.providers?.[provider]?.selectedModel || "未选模型";
      refs.mode.textContent = `${providerName} · ${model}`;
      refs.mode.title = `${providerName} · ${model}`;
    }
    if (refs.runtimeStatus) {
      const state = disconnected
        ? ["reconnecting", "重连中"]
        : runtime?.ready !== true
          ? ["offline", "未就绪"]
          : session?.status === "waitingApproval"
            ? ["waiting", "待确认"]
            : isBusy()
              ? ["running", "运行中"]
              : ["ready", "就绪"];
      refs.runtimeStatus.className = `agent-runtime-status is-${state[0]}`;
      refs.runtimeStatus.querySelector("span")?.replaceChildren(state[1]);
    }
    if (refs.rename) refs.rename.disabled = !session || Boolean(action);
    if (refs.fork) refs.fork.disabled = !session || isBusy() || Boolean(action) || runtime?.workspaceValid === false;
    if (refs.sessionMore) {
      refs.sessionMore.querySelector('[data-agent-session-action="rename"]')?.toggleAttribute("disabled", !session || Boolean(action));
      refs.sessionMore.querySelector('[data-agent-session-action="fork"]')?.toggleAttribute("disabled", !session || isBusy() || Boolean(action) || runtime?.workspaceValid === false);
    }
    if (refs.newSession) refs.newSession.disabled = Boolean(action) || runtime?.ready !== true;
    renderHistory();
  }

  function renderAttachments() {
    if (!refs.attachments) return;
    const attachments = (session?.attachments || []).filter((item) => selectedAttachmentIds.includes(item.id));
    refs.attachments.classList.toggle("is-hidden", attachments.length === 0 && action !== "attachment");
    refs.attachments.innerHTML = attachments.map((item) => `
      <span class="composer-attachment-chip" data-agent-attachment="${escapeHtml(item.id)}">
        <span class="composer-attachment-chip-label">${escapeHtml(item.name)}</span>
        <button class="composer-attachment-chip-remove" type="button" data-agent-remove-attachment="${escapeHtml(item.id)}" title="移除附件" aria-label="移除附件">×</button>
      </span>
    `).join("") + (action === "attachment" ? `<span class="composer-attachment-chip is-uploading"><span class="composer-attachment-chip-label">正在添加附件</span></span>` : "");
  }

  function renderRuntimeNotice() {
    const provider = runtime?.activeProvider === "claude" ? "claude" : "codex";
    const providerName = provider === "claude" ? "Claude Code" : "Codex CLI";
    const providerState = runtime?.providers?.[provider] || {};
    const notice = (title, detail) => `<section class="agent-runtime-notice"><div class="agent-runtime-brand"><img class="agent-runtime-logo" src="/assets/brand/FreeFlow_app_icon.png" alt="" /></div><div class="agent-runtime-copy"><span>FreeFlow AI</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p><button class="agent-inline-action" type="button" data-agent-open-settings>前往 AI 设置</button></div></section>`;
    if (runtime?.workspaceValid === false) {
      return notice("AI 工作空间需要恢复", "FreeFlow 无法打开此会话的工作空间，请在 AI 设置中重新检查运行环境。");
    }
    if (!providerState.available) {
      return notice("完成 AI 助手设置", providerState.requiresSelection ? `已检测到多个 ${providerName}，请选择要使用的版本。` : `尚未绑定 ${providerName}。`);
    }
    if (!providerState.configured) {
      return notice("连接尚未配置", "请保存第三方中转站的 Base URL 与 API Key。");
    }
    if (!providerState.modelSelected) return notice("请选择 AI 模型", "先刷新模型目录，再手动选择本次使用的模型。");
    if (!providerState.modelValidated) return notice("连接尚未验证", "测试所选模型通过后即可创建会话。");
    return "";
  }

  function renderActivity(activity) {
    const details = activityDetails(activity);
    const error = activity.phase === "failed" || activity.semanticType === "error";
    const phase = activity.phase === "running" ? "进行中" : error ? "未完成" : "完成";
    return `<div class="agent-activity${error ? " is-error" : ""}" data-agent-activity="${escapeHtml(activity.id)}" data-agent-activity-type="${escapeHtml(activity.semanticType)}">
      <div class="agent-activity-head"><strong>${escapeHtml(activity.title)}</strong><span>${escapeHtml(activity.summary)}</span><em>${phase}</em></div>
      ${details ? `<details class="agent-activity-detail" data-agent-disclosure="activity:${escapeHtml(activity.id)}"><summary>查看详情</summary><pre>${escapeHtml(details)}</pre></details>` : ""}
    </div>`;
  }

  function renderActivityGroup(group) {
    return `<section class="agent-activity-group" data-agent-activity-group="${escapeHtml(group.id)}">
      <div class="agent-activity-group-title">${escapeHtml(activityGroupLabel(group))}</div>
      <div class="agent-activity-group-list">${group.activities.map(renderActivity).join("")}</div>
    </section>`;
  }

  function renderTurnError(turn) {
    const error = turn.error || {};
    const summary = String(error.message || "任务未能完成，可以重试。");
    const technical = String(error.technicalMessage || (!error.code ? error.message || "" : ""));
    return `<section class="agent-turn-error" data-agent-failed-turn="${escapeHtml(turn.id)}" role="alert">
      <div class="agent-turn-error-mark" aria-hidden="true">!</div>
      <div class="agent-turn-error-copy">
        <div class="agent-turn-error-head"><div><span>任务未完成</span><strong>${escapeHtml(summary)}</strong></div><button type="button" data-agent-retry-turn="${escapeHtml(turn.id)}"${action ? " disabled" : ""}>${action === `retry:${turn.id}` ? "重试中" : "重试"}</button></div>
        ${technical ? `<details data-agent-disclosure="error:${escapeHtml(turn.id)}"><summary>技术详情</summary><pre>${escapeHtml(technical)}</pre></details>` : ""}
      </div>
    </section>`;
  }

  function renderApproval(approval) {
    const inputQuestions = approval.method.includes("requestUserInput") && Array.isArray(approval.params?.questions)
      ? approval.params.questions.map((question, index) => `<label class="settings-center-field"><span>${escapeHtml(question.header || question.question || `问题 ${index + 1}`)}</span><input data-agent-approval-answer="${escapeHtml(question.id || String(index))}" type="text" /></label>`).join("")
      : "";
    return `<section class="agent-approval" data-agent-approval="${escapeHtml(approval.id)}">
      <strong>${escapeHtml(approvalLabel(approval.method))}</strong>
      ${inputQuestions || `<pre>${escapeHtml(approvalSummary(approval))}</pre>`}
      <div class="agent-approval-actions">
        <button type="button" data-agent-approval-decision="decline">拒绝</button>
        <button type="button" data-agent-approval-decision="acceptForSession">本会话允许</button>
        <button class="is-accept" type="button" data-agent-approval-decision="accept">允许一次</button>
      </div>
    </section>`;
  }

  function renderMessage(message, { streaming = false } = {}) {
    const roleName = message.role === "user" ? "你" : session?.provider === "claude" ? "Claude" : "Codex";
    return `<article class="agent-message is-${escapeHtml(message.role)}${streaming ? " is-streaming" : ""}" data-agent-message="${escapeHtml(message.id)}">
      ${message.role === "assistant" ? '<span class="agent-message-avatar" aria-hidden="true"><img src="/assets/brand/FreeFlow_app_icon.png" alt="" /></span>' : ""}
      <div class="agent-message-body">
        <div class="agent-message-meta"><strong>${roleName}</strong><time>${escapeHtml(formatTime(message.createdAt))}</time></div>
        <div class="agent-message-content" data-agent-message-content></div>
      </div>
    </article>`;
  }

  function renderTurn(item, messageRows) {
    const userMessage = item.userMessages[0];
    const assistantMessage = item.assistantMessages.at(-1);
    const hasAssistantContent = Boolean(String(assistantMessage?.content || "").trim());
    const process = !item.turn.id
      ? ""
      : item.activities.length
        ? `<details class="agent-turn-process${item.active ? " is-active" : ""}" data-agent-disclosure="turn:${escapeHtml(item.id)}">
          <summary><span class="agent-process-indicator" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg></span><strong${item.active ? ' role="status" aria-live="polite"' : ""}>${escapeHtml(item.processLabel)}</strong><span class="agent-process-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg></span></summary>
          <div class="agent-process-body">${item.activityGroups.map(renderActivityGroup).join("")}</div>
        </details>`
        : `<div class="agent-turn-process is-static${item.active ? " is-active" : ""}"><span class="agent-process-indicator" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg></span><strong${item.active ? ' role="status" aria-live="polite"' : ""}>${escapeHtml(item.processLabel)}</strong></div>`;
    if (userMessage) messageRows.push(userMessage);
    if (assistantMessage && hasAssistantContent) messageRows.push(assistantMessage);
    return `<section class="agent-turn${item.active ? " is-active" : ""}" data-agent-turn="${escapeHtml(item.id)}">
      ${userMessage ? renderMessage(userMessage) : ""}
      ${process}
      ${item.approvals.map(renderApproval).join("")}
      ${item.turn.status === "failed" ? renderTurnError(item.turn) : ""}
      ${assistantMessage && hasAssistantContent ? renderMessage(assistantMessage, { streaming: item.active }) : ""}
    </section>`;
  }

  function renderQueueTray() {
    if (!refs.queueTray) return;
    const pendingInputs = [...(session?.pendingInputs || [])].sort((left, right) => {
      const modeOrder = Number(left.mode !== "steer") - Number(right.mode !== "steer");
      return modeOrder || Number(left.position || 0) - Number(right.position || 0);
    });
    refs.queueTray.classList.toggle("is-hidden", pendingInputs.length === 0);
    refs.queueTray.innerHTML = pendingInputs.length ? `
      <div class="agent-queue-tray-head"><strong>待发送</strong><span>${pendingInputs.length} 条</span></div>
      <div class="agent-queue-list">${pendingInputs.map((pending) => {
        const failed = pending.status === "failed";
        return `<section class="agent-queue${failed ? " is-failed" : ""}" data-agent-queue="${escapeHtml(pending.id)}" data-agent-queue-revision="${Number(pending.revision || 0)}">
          <div class="agent-queue-head"><strong>${failed ? "派发失败" : pending.mode === "steer" ? "即时引导" : "排队"}</strong><span>${failed ? escapeHtml(pending.error?.message || "可重试") : escapeHtml(truncate(pending.input, 120))}</span></div>
          <div class="agent-queue-actions">${failed ? `<button type="button" data-agent-queue-action="retry">重试</button>` : `<button type="button" data-agent-queue-action="promote" title="提升为即时引导">立即</button><button type="button" data-agent-queue-action="up" title="上移" aria-label="上移">↑</button><button type="button" data-agent-queue-action="down" title="下移" aria-label="下移">↓</button>`}<button type="button" data-agent-queue-action="edit">编辑</button><button type="button" data-agent-queue-action="remove">移除</button></div>
        </section>`;
      }).join("")}</div>` : "";
  }

  function updateScrollFollowing() {
    if (!refs.threadViewport) return;
    followThread = refs.threadViewport.scrollHeight - refs.threadViewport.scrollTop - refs.threadViewport.clientHeight < 96;
    refs.scrollBottom?.classList.toggle("is-hidden", followThread);
  }

  function renderChat() {
    if (!refs.chatLog) return;
    const expanded = new Set(Array.from(refs.chatLog.querySelectorAll("[data-agent-disclosure][open]"), (element) => element.dataset.agentDisclosure));
    const previousScrollTop = refs.threadViewport?.scrollTop || 0;
    const runtimeNotice = renderRuntimeNotice();
    refs.chatLog.className = `chat-log agent-chat-log${runtimeNotice ? " is-runtime-blocked" : ""}`;
    const { turns, sessionActivities, sessionApprovals } = buildConversationTurns(session || {}, { showReasoning: runtime?.settings?.showReasoning !== false });
    const messageRows = [];
    const rows = runtimeNotice ? [runtimeNotice] : turns.map((turn) => renderTurn(turn, messageRows));
    if (!runtimeNotice && sessionActivities.length) {
      rows.push(`<details class="agent-turn-process is-session" data-agent-disclosure="session:activities"><summary><span class="agent-process-indicator" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg></span><strong>会话活动</strong><span class="agent-process-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg></span></summary><div class="agent-process-body">${sessionActivities.map(renderActivity).join("")}</div></details>`);
    }
    if (!runtimeNotice && sessionApprovals.length) rows.push(...sessionApprovals.map(renderApproval));
    const isEmpty = rows.length === 0;
    if (isEmpty) {
      const providerName = session?.provider === "claude" ? "Claude" : "Codex";
      refs.chatLog.classList.add("is-empty");
      rows.push(`<section class="agent-empty"><div class="agent-runtime-brand"><img src="/assets/brand/FreeFlow_app_icon.png" alt="" /></div><span>FreeFlow AI</span><strong>开始新的对话</strong><p>${providerName} 已连接 · FreeFlow 独立空间</p></section>`);
    }
    refs.threadViewport?.classList.toggle("is-empty", isEmpty);
    refs.chatLog.innerHTML = rows.join("");
    messageRows.forEach((message) => {
      const element = refs.chatLog.querySelector(`[data-agent-message="${CSS.escape(message.id)}"] [data-agent-message-content]`);
      if (element) setRichContent(element, message.content, { streaming: element.closest(".is-streaming") != null });
    });
    refs.chatLog.querySelectorAll("[data-agent-disclosure]").forEach((element) => { element.open = expanded.has(element.dataset.agentDisclosure); });
    requestAnimationFrame(() => {
      if (!refs.threadViewport) return;
      refs.threadViewport.scrollTop = followThread ? refs.threadViewport.scrollHeight : previousScrollTop;
      updateScrollFollowing();
    });
  }

  function renderComposer() {
    const busy = isBusy();
    if (refs.send) refs.send.disabled = !session || Boolean(action) || runtime?.ready !== true;
    if (refs.stop) refs.stop.disabled = !busy || action === "stop";
    refs.submitMode?.classList.toggle("is-hidden", !busy);
    if (refs.attach) refs.attach.disabled = !session || action === "attachment" || runtime?.ready !== true;
    if (refs.composerStatus) {
      refs.composerStatus.textContent = disconnected
        ? "连接中断，正在自动恢复"
        : session?.status === "waitingApproval"
          ? "请先处理上方审批"
          : busy
            ? refs.submitMode?.value === "steer" ? "下一条将即时引导当前任务" : "下一条将在当前任务后执行"
            : "Enter 发送 · Shift + Enter 换行";
    }
    renderAttachments();
  }

  function render() {
    renderHeader();
    renderChat();
    renderQueueTray();
    renderComposer();
    onRuntime(runtime, session);
  }

  async function loadRuntime({ refresh = false } = {}) {
    try {
      runtime = (await client.getRuntime({ start: true, refresh })).runtime;
    } catch (error) {
      runtime = {
        activeProvider: "codex",
        providers: { codex: { available: false, ready: false, error: error.message } },
        available: false,
        ready: false,
        state: "error",
        error: error.message,
      };
    }
    return runtime;
  }

  async function loadSessions() {
    sessions = (await client.listSessions()).sessions || [];
    return sessions;
  }

  function subscribeToSession(sessionId, revision, generation) {
    unsubscribe?.();
    unsubscribe = null;
    disconnected = false;
    client.subscribe(sessionId, revision, {
      onEvent(event) {
        if (generation !== selectionGeneration || event.sessionId !== sessionId) return;
        if (session) session.revision = Math.max(Number(session.revision) || 0, Number(event.revision) || 0);
        scheduleSessionRefresh(generation);
      },
      onReady() {
        if (generation !== selectionGeneration) return;
        disconnected = false;
        renderHeader();
        renderComposer();
      },
      onDisconnect() {
        if (generation !== selectionGeneration) return;
        disconnected = true;
        renderHeader();
        renderComposer();
      },
    }).then((close) => {
      if (generation !== selectionGeneration) close();
      else unsubscribe = close;
    }).catch(() => {
      if (generation !== selectionGeneration) return;
      disconnected = true;
      render();
    });
  }

  function scheduleSessionRefresh(generation = selectionGeneration) {
    if (refreshTimer) return;
    refreshTimer = window.setTimeout(async () => {
      refreshTimer = 0;
      if (generation !== selectionGeneration || !session?.id) return;
      try {
        const next = (await client.getSession(session.id)).session;
        if (generation !== selectionGeneration) return;
        session = next;
        const index = sessions.findIndex((item) => item.id === next.id);
        if (index >= 0) sessions[index] = { ...sessions[index], ...next };
        else sessions.unshift(next);
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        render();
      } catch (error) {
        if (generation === selectionGeneration) setStatus(`会话恢复失败：${error.message}`, "warning");
      }
    }, 55);
  }

  async function selectSession(sessionId, { closeHistory = true } = {}) {
    const id = String(sessionId || "").trim();
    if (!id) return;
    const generation = ++selectionGeneration;
    unsubscribe?.();
    unsubscribe = null;
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = 0;
    selectedAttachmentIds = [];
    action = "load";
    renderComposer();
    try {
      const next = (await client.getSession(id)).session;
      if (generation !== selectionGeneration) return;
      session = next;
      followThread = true;
      localStorage.setItem(CURRENT_SESSION_KEY, id);
      if (closeHistory) setHistoryOpen(false);
      subscribeToSession(id, next.revision, generation);
      render();
    } finally {
      if (generation === selectionGeneration) {
        action = "";
        renderComposer();
      }
    }
  }

  async function newSession() {
    if (action || runtime?.ready !== true) return;
    action = "new";
    render();
    try {
      const created = (await client.createSession()).session;
      sessions.unshift(created);
      await selectSession(created.id);
      refs.prompt?.focus();
      setStatus("已创建新会话", "success");
    } catch (error) {
      setStatus(`新建会话失败：${error.message}`, "warning");
    } finally {
      action = "";
      render();
    }
  }

  async function submit() {
    if (!initialized || action || !session || runtime?.ready !== true) return;
    const text = String(refs.prompt?.value || "").trim() || (selectedAttachmentIds.length ? "请阅读附件并根据其中内容继续。" : "");
    if (!text) return;
    const mode = isBusy() && refs.submitMode?.value === "steer" && !selectedAttachmentIds.length ? "steer" : "queue";
    const input = { text, mode, attachmentIds: [...selectedAttachmentIds], clientRequestId: crypto.randomUUID() };
    action = "submit";
    renderComposer();
    try {
      const result = await client.startTurn(session.id, input);
      if (refs.prompt) refs.prompt.value = "";
      selectedAttachmentIds = [];
      if (result.queued) setStatus("消息已加入队列", "success");
      else if (result.steered) setStatus("已更新当前任务方向", "success");
      else setStatus(`${session.provider === "claude" ? "Claude" : "Codex"} 已开始处理`, "success");
      await scheduleImmediateRefresh();
    } catch (error) {
      setStatus(`发送失败：${error.message}`, "warning");
      await loadRuntime({ refresh: true });
    } finally {
      action = "";
      render();
    }
  }

  async function scheduleImmediateRefresh() {
    if (!session?.id) return;
    const generation = selectionGeneration;
    const next = (await client.getSession(session.id)).session;
    if (generation !== selectionGeneration) return;
    session = next;
  }

  async function stop() {
    if (!session || !isBusy() || action) return;
    action = "stop";
    renderComposer();
    try {
      await client.interruptTurn(session.id);
      setStatus("正在停止当前任务", "warning");
      await scheduleImmediateRefresh();
    } catch (error) {
      setStatus(`停止失败：${error.message}`, "warning");
    } finally {
      action = "";
      render();
    }
  }

  async function renameSession() {
    if (!session || action) return;
    const title = window.prompt("会话名称", session.title || "新会话");
    if (title == null || !title.trim() || title.trim() === session.title) return;
    action = "rename";
    try {
      const next = (await client.renameSession(session.id, title.trim())).session;
      session = { ...session, ...next };
      const index = sessions.findIndex((item) => item.id === session.id);
      if (index >= 0) sessions[index] = { ...sessions[index], ...next };
      setStatus("会话名称已更新", "success");
    } catch (error) {
      setStatus(`重命名失败：${error.message}`, "warning");
    } finally {
      action = "";
      render();
    }
  }

  async function forkSession() {
    if (!session || isBusy() || action || runtime?.workspaceValid === false) return;
    action = "fork";
    render();
    try {
      const created = (await client.forkSession(session.id)).session;
      sessions.unshift(created);
      await selectSession(created.id);
      setStatus("已创建会话分支", "success");
    } catch (error) {
      setStatus(`创建分支失败：${error.message}`, "warning");
    } finally {
      action = "";
      render();
    }
  }

  async function deleteSession(sessionId) {
    const target = sessions.find((item) => item.id === sessionId);
    const managedNotice = target?.runtimeBinding?.workspaceKind === "managed"
      ? "\n\n此会话在 FreeFlow 独立空间中的文件也会一并删除。"
      : "";
    if (!target || action || !window.confirm(`删除会话“${target.title}”？${managedNotice}\n\n此操作不可撤销。`)) return;
    action = "delete";
    try {
      await client.deleteSession(sessionId);
      sessions = sessions.filter((item) => item.id !== sessionId);
      if (session?.id === sessionId) {
        session = null;
        localStorage.removeItem(CURRENT_SESSION_KEY);
        if (sessions.length) await selectSession(sessions[0].id, { closeHistory: false });
        else if (runtime?.ready === true) {
          action = "";
          await newSession();
        }
      }
      setStatus("会话已删除", "success");
    } catch (error) {
      setStatus(`删除失败：${error.message}`, "warning");
    } finally {
      action = "";
      render();
    }
  }

  async function addFiles(fileList) {
    if (!session || action || runtime?.workspaceValid === false) return;
    const files = Array.from(fileList || []).slice(0, 8);
    if (!files.length) return;
    action = "attachment";
    renderComposer();
    try {
      for (const file of files) {
        const filePath = desktopShell?.getPathForFile?.(file) || "";
        if (!filePath) throw new Error("当前环境无法读取所选文件路径");
        const attachment = (await client.addAttachment(session.id, { filePath, name: file.name, mimeType: file.type })).attachment;
        session.attachments = [...(session.attachments || []), attachment];
        selectedAttachmentIds.push(attachment.id);
      }
      setStatus(`已添加 ${files.length} 个附件`, "success");
    } catch (error) {
      setStatus(`附件添加失败：${error.message}`, "warning");
    } finally {
      action = "";
      if (refs.fileInput) refs.fileInput.value = "";
      render();
    }
  }

  async function removeAttachment(attachmentId) {
    if (!session || action) return;
    action = "attachment";
    renderComposer();
    try {
      await client.removeAttachment(session.id, attachmentId);
      selectedAttachmentIds = selectedAttachmentIds.filter((id) => id !== attachmentId);
      session.attachments = (session.attachments || []).filter((item) => item.id !== attachmentId);
    } catch (error) {
      setStatus(`移除附件失败：${error.message}`, "warning");
    } finally {
      action = "";
      render();
    }
  }

  async function resolveApproval(container, decision) {
    const approvalId = container?.dataset.agentApproval;
    if (!approvalId || action) return;
    const answers = Object.fromEntries(Array.from(container.querySelectorAll("[data-agent-approval-answer]"), (input) => [input.dataset.agentApprovalAnswer, input.value]));
    action = "approval";
    renderComposer();
    try {
      await client.resolveApproval(approvalId, { decision, answers });
      await scheduleImmediateRefresh();
      setStatus(decision.startsWith("accept") ? "已允许继续" : "已拒绝操作", "success");
    } catch (error) {
      setStatus(`审批处理失败：${error.message}`, "warning");
    } finally {
      action = "";
      render();
    }
  }

  async function handleQueueAction(container, queueAction) {
    if (!session || action || !container) return;
    const pendingId = container.dataset.agentQueue;
    const pending = session.pendingInputs?.find((item) => item.id === pendingId);
    if (!pending) return;
    action = "queue";
    renderComposer();
    try {
      if (queueAction === "remove") await client.removePendingInput(session.id, pendingId);
      if (queueAction === "retry") await client.retryPendingInput(session.id, pendingId);
      if (queueAction === "promote") await client.promotePendingInput(session.id, pendingId);
      if (queueAction === "up" || queueAction === "down") await client.movePendingInput(session.id, pendingId, queueAction);
      if (queueAction === "edit") {
        const text = window.prompt("编辑排队消息", pending.input || "");
        if (text == null) return;
        await client.updatePendingInput(session.id, pendingId, { text, revision: Number(pending.revision || 0) });
      }
      await scheduleImmediateRefresh();
      setStatus(queueAction === "retry" ? "已重新加入队列" : queueAction === "promote" ? "已提升为即时引导" : "队列已更新", "success");
    } catch (error) {
      setStatus(`队列更新失败：${error.message}`, "warning");
    } finally {
      action = "";
      render();
    }
  }

  async function retryTurn(turnId) {
    if (!session || action || !turnId) return;
    const turn = session.turns?.find((item) => item.id === turnId && item.status === "failed");
    if (!turn) return;
    action = `retry:${turnId}`;
    turn.status = "starting";
    turn.error = null;
    render();
    try {
      await client.retryTurn(session.id, turnId);
      await scheduleImmediateRefresh();
      setStatus("任务已重新开始", "success");
    } catch (error) {
      setStatus(`重试失败：${error.message}`, "warning");
      await scheduleImmediateRefresh().catch(() => {});
    } finally {
      action = "";
      render();
    }
  }

  function bindEvents() {
    refs.historyToggle?.addEventListener("click", () => setHistoryOpen(!historyOpen));
    refs.historyClose?.addEventListener("click", () => setHistoryOpen(false));
    refs.historySearch?.addEventListener("input", renderHistory);
    refs.rename?.addEventListener("click", renameSession);
    refs.fork?.addEventListener("click", forkSession);
    refs.panel?.addEventListener("click", (event) => {
      const sessionAction = event.target.closest("[data-agent-session-action]");
      if (sessionAction) {
        refs.sessionMore?.removeAttribute("open");
        if (sessionAction.dataset.agentSessionAction === "rename") void renameSession();
        if (sessionAction.dataset.agentSessionAction === "fork") void forkSession();
      }
    });
    refs.attach?.addEventListener("click", () => refs.fileInput?.click());
    refs.fileInput?.addEventListener("change", () => void addFiles(refs.fileInput.files));
    refs.submitMode?.addEventListener("change", renderComposer);
    refs.historyList?.addEventListener("click", (event) => {
      const deleteTarget = event.target.closest("[data-agent-delete-session]");
      if (deleteTarget) {
        event.preventDefault();
        event.stopPropagation();
        void deleteSession(deleteTarget.dataset.agentDeleteSession);
        return;
      }
      const target = event.target.closest("[data-agent-session]");
      if (target) void selectSession(target.dataset.agentSession);
    });
    refs.attachments?.addEventListener("click", (event) => {
      const target = event.target.closest("[data-agent-remove-attachment]");
      if (target) void removeAttachment(target.dataset.agentRemoveAttachment);
    });
    refs.chatLog?.addEventListener("click", (event) => {
      if (event.target.closest("[data-agent-open-settings]")) onOpenSettings("ai");
      const retryTarget = event.target.closest("[data-agent-retry-turn]");
      if (retryTarget) void retryTurn(retryTarget.dataset.agentRetryTurn);
      const decisionTarget = event.target.closest("[data-agent-approval-decision]");
      if (decisionTarget) void resolveApproval(decisionTarget.closest("[data-agent-approval]"), decisionTarget.dataset.agentApprovalDecision);
    });
    refs.queueTray?.addEventListener("click", (event) => {
      const queueTarget = event.target.closest("[data-agent-queue-action]");
      if (queueTarget) void handleQueueAction(queueTarget.closest("[data-agent-queue]"), queueTarget.dataset.agentQueueAction);
    });
    refs.threadViewport?.addEventListener("scroll", updateScrollFollowing, { passive: true });
    refs.scrollBottom?.addEventListener("click", () => {
      followThread = true;
      if (refs.threadViewport) refs.threadViewport.scrollTop = refs.threadViewport.scrollHeight;
      updateScrollFollowing();
    });
    window.addEventListener("freeflow:agent-data-restored", handleDataRestored);
  }

  async function initialize() {
    if (initialized) return;
    initialized = true;
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    bindEvents();
    refs.chatLog?.classList.add("agent-chat-log");
    action = "load";
    render();
    try {
      await Promise.all([loadRuntime(), loadSessions()]);
      const preferred = localStorage.getItem(CURRENT_SESSION_KEY);
      const target = sessions.find((item) => item.id === preferred) || sessions[0];
      if (target) await selectSession(target.id);
      else if (runtime?.ready !== true) {
        session = null;
        localStorage.removeItem(CURRENT_SESSION_KEY);
      }
      else {
        action = "";
        await newSession();
      }
    } catch (error) {
      setStatus(`AI 助手初始化失败：${error.message}`, "warning");
    } finally {
      action = "";
      render();
    }
  }

  async function refreshRuntime() {
    if (!initialized) return;
    action = "load";
    render();
    try {
      await loadRuntime({ refresh: true });
      await loadSessions();
      const target = sessions.find((item) => item.id === session?.id) || sessions[0];
      if (target) {
        await selectSession(target.id);
      } else if (runtime?.ready === true) {
        action = "";
        await newSession();
      } else {
        session = null;
      }
    } catch (error) {
      setStatus(`AI 助手恢复失败：${error.message}`, "warning");
    } finally {
      action = "";
      render();
    }
  }

  function destroy() {
    ++selectionGeneration;
    unsubscribe?.();
    unsubscribe = null;
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = 0;
    window.removeEventListener("freeflow:agent-data-restored", handleDataRestored);
    initialized = false;
  }

  return {
    initialize,
    destroy,
    forkSession,
    isInitialized: () => initialized,
    isActive: isBusy,
    newSession,
    refreshRuntime,
    refresh: scheduleImmediateRefresh,
    renderHeader,
    stop,
    submit,
  };
}
