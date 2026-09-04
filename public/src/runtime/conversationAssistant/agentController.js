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

function activityLabel(payload = {}) {
  const labels = {
    plan: "计划",
    reasoning: "推理摘要",
    commandExecution: "命令",
    "command-output": "命令输出",
    fileChange: "文件变更",
    "file-change": "文件变更",
    "file-output": "文件输出",
    webSearch: "网页搜索",
    mcpToolCall: "工具调用",
    tool: "工具调用",
    warning: "警告",
    error: "错误",
    steer: "即时引导",
  };
  return labels[payload.activityType] || payload.activityType || "活动";
}

function activityDetails(payload = {}) {
  const item = payload.item && typeof payload.item === "object" ? payload.item : {};
  const params = payload.params && typeof payload.params === "object" ? payload.params : {};
  const detail = payload.detail && typeof payload.detail === "object" ? payload.detail : {};
  const value =
    item.aggregatedOutput || item.output || item.diff || params.diff || params.delta ||
    detail.output || detail.input || payload.summary || item.command || "";
  return (typeof value === "string" ? value : JSON.stringify(value, null, 2)).trim();
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
    chatLog: doc.querySelector("#chat-log"),
    threadViewport: doc.querySelector("#thread-viewport"),
    form: doc.querySelector("#chat-form"),
    prompt: doc.querySelector("#prompt-input"),
    send: doc.querySelector("#send-btn"),
    stop: doc.querySelector("#stop-btn"),
    newSession: doc.querySelector("#clear-btn"),
    rename: doc.querySelector("#agent-rename-session-btn"),
    fork: doc.querySelector("#agent-fork-session-btn"),
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
      const stateLabel = disconnected ? "正在重连" : session?.status === "waitingApproval" ? "等待确认" : isBusy() ? "运行中" : "就绪";
      refs.mode.textContent = `${providerName} · ${model} · ${stateLabel}`;
    }
    if (refs.rename) refs.rename.disabled = !session || Boolean(action);
    if (refs.fork) refs.fork.disabled = !session || isBusy() || Boolean(action) || runtime?.workspaceValid === false;
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
    const notice = (title, detail) => `<section class="agent-runtime-notice"><img class="agent-runtime-logo" src="/assets/brand/FreeFlow_app_icon.png" alt="" /><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p><button class="agent-inline-action" type="button" data-agent-open-settings>打开 AI 设置</button></div></section>`;
    if (runtime?.workspaceValid === false) {
      return notice("需要配置 AI 工作区", runtime.error || "默认工作区必须位于系统设置授权的目录内。");
    }
    if (!providerState.available) {
      return notice(providerState.requiresSelection ? `请选择 ${providerName}` : `未找到 ${providerName}`, providerState.error || `请在系统设置的 AI 模型页检测并绑定 ${providerName}。`);
    }
    if (!providerState.configured) {
      return notice("连接尚未配置", "请保存第三方中转站的 Base URL 与 API Key。");
    }
    if (!providerState.modelSelected) return notice("请选择 AI 模型", "先刷新模型目录，再手动选择本次使用的模型。");
    if (!providerState.modelValidated) return notice("连接尚未验证", "测试所选模型通过后即可创建会话。");
    return "";
  }

  function renderActivity(event) {
    const payload = event.payload || {};
    const label = activityLabel(payload);
    const details = activityDetails(payload);
    const error = payload.status === "failed" || payload.activityType === "error";
    return `<details class="agent-activity${error ? " is-error" : ""}"${error ? " open" : ""}>
      <summary class="agent-activity-head"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(payload.status || "")}</span></summary>
      ${details ? `<pre>${escapeHtml(details)}</pre>` : ""}
    </details>`;
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

  function renderChat() {
    if (!refs.chatLog) return;
    const nearBottom = !refs.threadViewport || refs.threadViewport.scrollHeight - refs.threadViewport.scrollTop - refs.threadViewport.clientHeight < 100;
    refs.chatLog.className = "chat-log agent-chat-log";
    const rows = [];
    const runtimeNotice = renderRuntimeNotice();
    if (runtimeNotice) rows.push({ createdAt: 0, html: runtimeNotice });
    for (const message of session?.messages || []) {
      const turn = session?.turns?.find((item) => item.id === message.turnId);
      const streaming = message.role === "assistant" && turn && ACTIVE_STATUSES.has(turn.status);
      rows.push({
        createdAt: message.createdAt,
        html: `<article class="agent-message is-${escapeHtml(message.role)}${streaming ? " is-streaming" : ""}" data-agent-message="${escapeHtml(message.id)}">
          <div class="agent-message-meta"><strong>${message.role === "user" ? "你" : session?.provider === "claude" ? "Claude" : "Codex"}</strong><time>${escapeHtml(formatTime(message.createdAt))}</time></div>
          <div class="agent-message-content" data-agent-message-content></div>
        </article>`,
        message,
      });
    }
    for (const event of session?.activities || []) {
      if (event.type === "activity") {
        if (event.payload?.activityType === "reasoning" && runtime?.settings?.showReasoning === false) continue;
        rows.push({ createdAt: event.createdAt, html: renderActivity(event) });
      } else if (["turn.failed", "runtime.recovered"].includes(event.type)) {
        rows.push({
          createdAt: event.createdAt,
          html: renderActivity({ payload: { activityType: "error", status: "failed", summary: event.payload?.error?.message || event.payload?.message || "任务未完成" } }),
        });
      }
    }
    for (const approval of session?.approvals || []) rows.push({ createdAt: approval.createdAt, html: renderApproval(approval) });
    for (const pending of session?.pendingInputs || []) {
      const failed = pending.status === "failed";
      rows.push({ createdAt: pending.createdAt, html: `<section class="agent-queue${failed ? " is-failed" : ""}" data-agent-queue="${escapeHtml(pending.id)}" data-agent-queue-revision="${Number(pending.revision || 0)}"><div class="agent-queue-head"><strong>${failed ? "派发失败" : pending.mode === "steer" ? "即时引导" : "已排队"}</strong><span>${failed ? escapeHtml(pending.error?.message || "可重试") : "等待执行"}</span></div><p>${escapeHtml(truncate(pending.input, 240))}</p><div class="agent-queue-actions">${failed ? `<button type="button" data-agent-queue-action="retry" title="重试">重试</button>` : `<button type="button" data-agent-queue-action="promote" title="提升为即时引导">立即</button><button type="button" data-agent-queue-action="up" title="上移">↑</button><button type="button" data-agent-queue-action="down" title="下移">↓</button>`}<button type="button" data-agent-queue-action="edit" title="编辑">编辑</button><button type="button" data-agent-queue-action="remove" title="移除">移除</button></div></section>` });
    }
    const pendingInputs = session?.pendingInputs || [];
    pendingInputs.forEach((pending, index) => {
      const row = rows[rows.length - pendingInputs.length + index];
      if (row) row.queuePosition = Number(pending.position || 0);
    });
    rows.sort((a, b) => {
      if (a.queuePosition != null && b.queuePosition != null) return a.queuePosition - b.queuePosition;
      if (a.queuePosition != null) return 1;
      if (b.queuePosition != null) return -1;
      return Number(a.createdAt) - Number(b.createdAt);
    });
    if (!rows.length) {
      const providerName = session?.provider === "claude" ? "Claude" : "Codex";
      rows.push({ createdAt: 0, html: `<section class="agent-empty"><img src="/assets/brand/FreeFlow_app_icon.png" alt="" /><strong>FreeFlow AI</strong><p>${providerName} 已连接，可以开始新的工作。</p></section>` });
    }
    refs.chatLog.innerHTML = rows.map((row) => row.html).join("");
    rows.filter((row) => row.message).forEach((row) => {
      const element = refs.chatLog.querySelector(`[data-agent-message="${CSS.escape(row.message.id)}"] [data-agent-message-content]`);
      if (element) setRichContent(element, row.message.content || (row.message.role === "assistant" ? "正在响应…" : ""), { streaming: element.closest(".is-streaming") != null });
    });
    if (nearBottom) requestAnimationFrame(() => { if (refs.threadViewport) refs.threadViewport.scrollTop = refs.threadViewport.scrollHeight; });
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
    if (!target || action || !window.confirm(`删除会话“${target.title}”？此操作不可撤销。`)) return;
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

  function bindEvents() {
    refs.historyToggle?.addEventListener("click", () => setHistoryOpen(!historyOpen));
    refs.historyClose?.addEventListener("click", () => setHistoryOpen(false));
    refs.historySearch?.addEventListener("input", renderHistory);
    refs.rename?.addEventListener("click", renameSession);
    refs.fork?.addEventListener("click", forkSession);
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
      const queueTarget = event.target.closest("[data-agent-queue-action]");
      if (queueTarget) void handleQueueAction(queueTarget.closest("[data-agent-queue]"), queueTarget.dataset.agentQueueAction);
      const decisionTarget = event.target.closest("[data-agent-approval-decision]");
      if (decisionTarget) void resolveApproval(decisionTarget.closest("[data-agent-approval]"), decisionTarget.dataset.agentApprovalDecision);
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
