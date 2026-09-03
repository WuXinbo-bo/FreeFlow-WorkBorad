const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { EventEmitter } = require("events");
const { AgentStore } = require("./agentStore");
const { CodexAppServerClient, discoverCodexExecutable } = require("./codexAppServerClient");
const { APPROVAL_METHODS, buildApprovalResponse, normalizeNotification } = require("./agentProtocol");

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const ACTIVE_STATUSES = new Set(["starting", "running", "waitingApproval", "interrupting"]);

function safeName(value) {
  return String(value || "attachment").replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").slice(0, 160) || "attachment";
}

function publicAccount(account) {
  if (!account || typeof account !== "object") return null;
  return {
    type: String(account.type || ""),
    email: String(account.email || account.accountEmail || ""),
    planType: String(account.planType || account.plan_type || ""),
  };
}

function modelSummary(model) {
  return {
    id: String(model?.id || model?.model || ""),
    displayName: String(model?.displayName || model?.display_name || model?.id || ""),
    description: String(model?.description || ""),
    isDefault: model?.isDefault === true || model?.is_default === true,
    hidden: model?.hidden === true,
  };
}

class AgentRuntime extends EventEmitter {
  constructor(options) {
    super();
    this.store = options.store || new AgentStore(options.databaseFile);
    this.settingsService = options.settingsService;
    this.permissionsService = options.permissionsService;
    this.legacySessionService = options.legacySessionService;
    this.attachmentsDir = path.resolve(options.attachmentsDir);
    this.appVersion = options.appVersion || "0.0.0";
    this.clientFactory = options.clientFactory || ((clientOptions) => new CodexAppServerClient(clientOptions));
    this.discoverExecutable = options.discoverExecutable || discoverCodexExecutable;
    this.client = null;
    this.clientCommand = "";
    this.runtimeGeneration = 0;
    this.runtimeState = "stopped";
    this.lastRuntimeError = "";
    this.discoveryCache = null;
    this.startPromise = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.store.open();
    this.store.recoverOrphanedState();
    await fs.mkdir(this.attachmentsDir, { recursive: true });
    if (this.store.getMeta("legacy-history-retired-v1") !== "done") {
      this.store.deleteLegacySessions();
      await this.legacySessionService?.writeSessionStore?.({ currentSessionId: null, sessions: [] });
      this.store.setMeta("legacy-history-retired-v1", "done");
    }
    this.initialized = true;
  }

  async getRuntimeStatus({ start = false, refresh = false } = {}) {
    await this.initialize();
    const settings = await this.settingsService.readAgentSettings();
    if (refresh || !this.discoveryCache || Date.now() - this.discoveryCache.checkedAt > 5000) {
      this.discoveryCache = { ...(await this.discoverExecutable(settings.cliPath)), checkedAt: Date.now() };
    }
    let workspaceValid = true;
    let workspaceError = "";
    try {
      await this._resolveWorkspaceRoot(settings.workspaceRoot);
    } catch (error) {
      workspaceValid = false;
      workspaceError = error.message;
    }
    if (start && this.discoveryCache.available && workspaceValid) {
      try {
        await this.ensureClient();
      } catch (error) {
        this.lastRuntimeError = error.message;
        this.runtimeState = "error";
      }
    }
    let account = null;
    let requiresOpenaiAuth = true;
    let models = [];
    if (this.client?.initialized) {
      try {
        const [accountResult, modelResult] = await Promise.all([
          this.client.request("account/read", { refreshToken: false }),
          this.client.request("model/list", { limit: 100, includeHidden: false }),
        ]);
        account = publicAccount(accountResult?.account);
        requiresOpenaiAuth = accountResult?.requiresOpenaiAuth !== false;
        models = (modelResult?.data || []).map(modelSummary).filter((item) => item.id);
      } catch (error) {
        this.lastRuntimeError = error.message;
      }
    }
    return {
      provider: "codex",
      available: Boolean(this.discoveryCache.available),
      command: settings.cliPath ? this.discoveryCache.command : "",
      version: this.discoveryCache.version || "",
      state: this.runtimeState,
      generation: this.runtimeGeneration,
      pid: this.client?.process?.pid || 0,
      authenticated: Boolean(account) || !requiresOpenaiAuth,
      requiresOpenaiAuth,
      account,
      models,
      workspaceValid,
      error: workspaceError || this.discoveryCache.error || this.lastRuntimeError || "",
      settings,
    };
  }

  async ensureClient() {
    await this.initialize();
    const settings = await this.settingsService.readAgentSettings();
    const discovery = await this.discoverExecutable(settings.cliPath);
    this.discoveryCache = { ...discovery, checkedAt: Date.now() };
    if (!discovery.available) throw new Error(discovery.error || "未找到 Codex CLI");
    const workspaceRoot = await this._resolveWorkspaceRoot(settings.workspaceRoot);
    if (this.client?.initialized && this.clientCommand === discovery.command) return this.client;
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      if (this.client) await this.client.stop().catch(() => {});
      const client = this.clientFactory({ command: discovery.command, cwd: workspaceRoot, clientVersion: this.appVersion });
      this.client = client;
      this.clientCommand = discovery.command;
      this.runtimeState = "starting";
      this.runtimeGeneration += 1;
      const generation = this.runtimeGeneration;
      client.on("notification", (method, params) => this._handleNotification(client, generation, method, params));
      client.on("server-request", (request) => this._handleServerRequest(client, generation, request));
      client.on("protocol-error", (error) => { this.lastRuntimeError = error.message; });
      client.on("exit", (info) => this._handleClientExit(client, generation, info));
      await client.start();
      if (generation !== this.runtimeGeneration) throw new Error("Codex runtime was replaced while starting");
      this.runtimeState = "ready";
      this.lastRuntimeError = "";
      return client;
    })().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async restart() {
    await this.initialize();
    this.store.recoverOrphanedState("Codex runtime restarted before this task completed").forEach((event) => this._publish(event));
    this.runtimeGeneration += 1;
    const client = this.client;
    this.client = null;
    this.runtimeState = "stopped";
    await client?.stop().catch(() => {});
    return this.getRuntimeStatus({ start: true, refresh: true });
  }

  async shutdown() {
    if (this.initialized) {
      this.store.recoverOrphanedState("FreeFlow closed before this task completed").forEach((event) => this._publish(event));
    }
    this.runtimeGeneration += 1;
    const client = this.client;
    this.client = null;
    this.runtimeState = "stopped";
    this.emit("shutdown");
    await client?.stop().catch(() => {});
    this.store.close();
    this.initialized = false;
  }

  async listSessions() {
    await this.initialize();
    return this.store.listSessions();
  }

  async getSession(sessionId) {
    await this.initialize();
    return this.store.getSession(sessionId);
  }

  async _resolveWorkspaceRoot(value) {
    const permissions = await this.permissionsService.readPermissionsStore();
    const resolved = await this.permissionsService.resolveAllowedExistingPath(value, permissions.allowedRoots);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) throw Object.assign(new Error("工作区路径必须是目录"), { statusCode: 400 });
    return resolved;
  }

  async createSession(input = {}) {
    await this.initialize();
    const settings = await this.settingsService.readAgentSettings();
    const workspaceRoot = await this._resolveWorkspaceRoot(input.workspaceRoot || settings.workspaceRoot);
    const created = this.store.createSession({
      provider: "codex",
      providerThreadId: input.providerThreadId || null,
      title: input.title,
      workspaceRoot,
      model: input.model ?? settings.defaultModel,
      reasoningEffort: input.reasoningEffort ?? settings.reasoningEffort,
      approvalPolicy: input.approvalPolicy || settings.approvalPolicy,
      sandboxMode: input.sandboxMode || settings.sandboxMode,
      status: input.status || "idle",
    });
    this._publish(created.event);
    return created.session;
  }

  async startLogin(input = {}) {
    const client = await this.ensureClient();
    const type = input.type === "chatgptDeviceCode" ? "chatgptDeviceCode" : "chatgpt";
    const params = type === "chatgptDeviceCode"
      ? { type }
      : { type, useHostedLoginSuccessPage: true, appBrand: "chatgpt" };
    return client.request("account/login/start", params, { timeoutMs: 30_000 });
  }

  async cancelLogin(loginId) {
    if (!this.client?.initialized) return { cancelled: false };
    await this.client.request("account/login/cancel", { loginId: String(loginId || "") });
    return { cancelled: true };
  }

  async logout() {
    const client = await this.ensureClient();
    await client.request("account/logout", {});
    return this.getRuntimeStatus({ refresh: true });
  }

  async renameSession(sessionId, title) {
    await this.initialize();
    const event = this.store.renameSession(sessionId, title);
    this._publish(event);
    if (this.client?.initialized) {
      const session = this.store.getSessionSummary(sessionId);
      if (session?.providerThreadId) this.client.request("thread/name/set", { threadId: session.providerThreadId, name: String(title).trim() }).catch(() => {});
    }
    return this.store.getSessionSummary(sessionId);
  }

  async deleteSession(sessionId) {
    await this.initialize();
    const session = this.store.getSessionSummary(sessionId);
    if (!session) return false;
    if (ACTIVE_STATUSES.has(session.status)) throw Object.assign(new Error("请先停止当前任务"), { statusCode: 409 });
    if (this.client?.initialized && session.providerThreadId) {
      await this.client.request("thread/delete", { threadId: session.providerThreadId }).catch(() => {});
    }
    const deleted = this.store.deleteSession(sessionId);
    if (deleted) {
      await fs.rm(path.join(this.attachmentsDir, session.id), { recursive: true, force: true }).catch((error) => {
        this.lastRuntimeError = error.message;
      });
    }
    this.emit("event", { sessionId, revision: session.revision + 1, type: "session.deleted", payload: { sessionId }, createdAt: Date.now() });
    return deleted;
  }

  async importAttachment(sessionId, input = {}) {
    await this.initialize();
    if (!this.store.getSessionSummary(sessionId)) throw Object.assign(new Error("会话不存在"), { statusCode: 404 });
    const permissions = await this.permissionsService.readPermissionsStore();
    const sourcePath = await this.permissionsService.resolveAllowedExistingPath(input.filePath, permissions.allowedRoots);
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile()) throw Object.assign(new Error("附件必须是文件"), { statusCode: 400 });
    if (stat.size > MAX_ATTACHMENT_BYTES) throw Object.assign(new Error("单个附件不能超过 25 MB"), { statusCode: 413 });
    const id = crypto.randomUUID();
    const name = safeName(input.name || path.basename(sourcePath));
    const targetDir = path.join(this.attachmentsDir, sessionId);
    const storedPath = path.join(targetDir, `${id}-${name}`);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.copyFile(sourcePath, storedPath);
    const buffer = await fs.readFile(storedPath);
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const result = this.store.addAttachment(sessionId, {
      id, name, mimeType: String(input.mimeType || ""), sourcePath, storedPath, sha256, sizeBytes: stat.size,
    });
    this._publish(result.event);
    return result.attachment;
  }

  async removeAttachment(sessionId, attachmentId) {
    await this.initialize();
    const result = this.store.removeAttachment(sessionId, attachmentId);
    if (!result) throw Object.assign(new Error("附件不存在"), { statusCode: 404 });
    await fs.unlink(result.attachment.storedPath).catch((error) => {
      if (error.code !== "ENOENT") this.lastRuntimeError = error.message;
    });
    this._publish(result.event);
    return true;
  }

  async startTurn(sessionId, input = {}) {
    await this.initialize();
    const text = String(input.text || "").trim();
    if (!text) throw Object.assign(new Error("消息不能为空"), { statusCode: 400 });
    const clientRequestId = String(input.clientRequestId || crypto.randomUUID()).trim();
    const session = this.store.getSessionSummary(sessionId);
    if (!session) throw Object.assign(new Error("会话不存在"), { statusCode: 404 });
    const existingTurn = this.store.findTurnByClientRequestId(sessionId, clientRequestId);
    if (existingTurn) return { queued: false, steered: false, duplicate: true, turn: existingTurn };
    const existingPending = this.store.findPendingInputByClientRequestId(sessionId, clientRequestId);
    if (existingPending) return { queued: true, steered: false, duplicate: true, pending: existingPending };
    const active = this.store.getActiveTurn(sessionId);
    if (active) {
      if (input.mode === "steer" && active.providerTurnId && session.providerThreadId) {
        const client = await this.ensureClient();
        await client.request("turn/steer", {
          threadId: session.providerThreadId,
          expectedTurnId: active.providerTurnId,
          input: [{ type: "text", text }],
          clientUserMessageId: clientRequestId,
        });
        const event = this.store.addActivity(sessionId, { activityType: "steer", status: "completed", summary: text, turnId: active.id });
        this._publish(event);
        return { queued: false, steered: true, turn: active };
      }
      const settings = await this.settingsService.readAgentSettings();
      if (!settings.queueWhileRunning) {
        throw Object.assign(new Error("当前任务仍在运行，请先停止或使用即时引导"), { statusCode: 409 });
      }
      const queued = this.store.queueInput(sessionId, { text, clientRequestId, attachments: input.attachmentIds || [] });
      this._publish(queued.event);
      return { queued: true, steered: false, pending: queued.pending };
    }
    return this._startTurnNow(sessionId, { ...input, text, clientRequestId });
  }

  async _ensureThread(session, settings, client) {
    const workspaceRoot = await this._resolveWorkspaceRoot(session.workspaceRoot || settings.workspaceRoot);
    const attachmentRoot = path.join(this.attachmentsDir, session.id);
    await fs.mkdir(attachmentRoot, { recursive: true });
    if (session.providerThreadId) {
      await client.request("thread/resume", {
        threadId: session.providerThreadId,
        cwd: workspaceRoot,
        model: session.model || null,
        approvalPolicy: session.approvalPolicy,
        sandbox: session.sandboxMode,
        runtimeWorkspaceRoots: [workspaceRoot, attachmentRoot],
      });
      return session.providerThreadId;
    }
    const result = await client.request("thread/start", {
      cwd: workspaceRoot,
      model: session.model || settings.defaultModel || null,
      approvalPolicy: session.approvalPolicy || settings.approvalPolicy,
      sandbox: session.sandboxMode || settings.sandboxMode,
      runtimeWorkspaceRoots: [workspaceRoot, attachmentRoot],
      threadSource: "freeflow",
      ephemeral: false,
      developerInstructions: "Operate as the FreeFlow workspace assistant. Do not delegate to sub-agents or use multi-agent orchestration.",
    });
    const threadId = String(result?.thread?.id || "");
    if (!threadId) throw new Error("Codex did not return a thread id");
    const event = this.store.bindThread(session.id, threadId, {
      workspaceRoot,
      model: result.model || session.model || settings.defaultModel,
      reasoningEffort: result.reasoningEffort || session.reasoningEffort || settings.reasoningEffort,
      approvalPolicy: result.approvalPolicy || session.approvalPolicy || settings.approvalPolicy,
      sandboxMode: result.sandbox || session.sandboxMode || settings.sandboxMode,
    });
    this._publish(event);
    return threadId;
  }

  async _startTurnNow(sessionId, input) {
    const settings = await this.settingsService.readAgentSettings();
    let session = this.store.getSessionSummary(sessionId);
    const created = this.store.createTurn(sessionId, { text: input.text, clientRequestId: input.clientRequestId, messageId: input.messageId });
    this._publish(created.event);
    try {
      const client = await this.ensureClient();
      const threadId = await this._ensureThread(session, settings, client);
      session = this.store.getSessionSummary(sessionId);
      const attachments = this.store.getAttachments(sessionId, input.attachmentIds || []);
      const providerInput = [{ type: "text", text: input.text }];
      for (const attachment of attachments) {
        if (attachment.mimeType.startsWith("image/")) providerInput.push({ type: "localImage", path: attachment.storedPath });
        else providerInput.push({ type: "mention", name: attachment.name, path: attachment.storedPath });
      }
      const result = await client.request("turn/start", {
        threadId,
        input: providerInput,
        clientUserMessageId: input.clientRequestId,
        model: session.model || settings.defaultModel || null,
        effort: session.reasoningEffort || settings.reasoningEffort || null,
        approvalPolicy: session.approvalPolicy || settings.approvalPolicy,
        cwd: session.workspaceRoot,
        runtimeWorkspaceRoots: [session.workspaceRoot, path.join(this.attachmentsDir, session.id)],
        turnTrigger: "user",
      });
      const providerTurnId = String(result?.turn?.id || "");
      if (!providerTurnId) throw new Error("Codex did not return a turn id");
      const event = this.store.bindTurn(sessionId, created.turn.id, providerTurnId);
      this._publish(event);
      return { queued: false, steered: false, turn: { ...created.turn, providerTurnId, status: "running" } };
    } catch (error) {
      const event = this.store.updateTurnState(sessionId, created.turn.id, "failed", { message: error.message });
      this._publish(event);
      throw error;
    }
  }

  async interruptTurn(sessionId) {
    await this.initialize();
    const session = this.store.getSessionSummary(sessionId);
    const active = this.store.getActiveTurn(sessionId);
    if (!session || !active) return { interrupted: false };
    const event = this.store.updateTurnState(sessionId, active.id, "interrupting");
    this._publish(event);
    if (!this.client?.initialized || !session.providerThreadId || !active.providerTurnId) {
      const cancelled = this.store.updateTurnState(sessionId, active.id, "cancelled");
      this._publish(cancelled);
      return { interrupted: true };
    }
    await this.client.request("turn/interrupt", { threadId: session.providerThreadId, turnId: active.providerTurnId });
    return { interrupted: true };
  }

  async removePendingInput(sessionId, pendingId) {
    await this.initialize();
    if (!this.store.getSessionSummary(sessionId)) throw Object.assign(new Error("会话不存在"), { statusCode: 404 });
    const event = this.store.removePendingInput(sessionId, pendingId);
    if (!event) throw Object.assign(new Error("排队消息不存在"), { statusCode: 404 });
    this._publish(event);
    return true;
  }

  async resolveApproval(approvalId, input = {}) {
    await this.initialize();
    const approval = this.store.getApproval(approvalId);
    if (!approval || approval.status !== "pending") throw Object.assign(new Error("审批请求不存在或已处理"), { statusCode: 404 });
    if (!this.client?.initialized) throw Object.assign(new Error("Codex 运行时已断开，无法继续审批"), { statusCode: 409 });
    const response = buildApprovalResponse(approval.method, input.decision, {
      ...approval.params,
      ...input,
    });
    this.client.respond(approval.providerRequestId, response);
    const resolved = this.store.resolveApproval(approvalId, response);
    this._publish(resolved.event);
    return response;
  }

  async forkSession(sessionId, input = {}) {
    await this.initialize();
    const source = this.store.getSessionSummary(sessionId);
    if (!source) throw Object.assign(new Error("会话不存在"), { statusCode: 404 });
    if (!source.providerThreadId) return this.createSession({ ...source, title: input.title || `${source.title} 副本` });
    const client = await this.ensureClient();
    const result = await client.request("thread/fork", {
      threadId: source.providerThreadId,
      beforeTurnId: input.beforeTurnId || null,
      excludeTurns: true,
      cwd: source.workspaceRoot,
      model: source.model || null,
      approvalPolicy: source.approvalPolicy,
      sandbox: source.sandboxMode,
      ephemeral: false,
      threadSource: "freeflow",
    });
    return this.createSession({
      title: input.title || `${source.title} 分支`, workspaceRoot: source.workspaceRoot, model: source.model,
      reasoningEffort: source.reasoningEffort, approvalPolicy: source.approvalPolicy,
      sandboxMode: source.sandboxMode, providerThreadId: result?.thread?.id,
    });
  }

  _findLocalTurn(sessionId, providerTurnId) {
    return (providerTurnId ? this.store.findTurnByProviderId(sessionId, providerTurnId) : null)
      || this.store.getActiveTurn(sessionId);
  }

  _handleNotification(client, generation, method, params) {
    if (client !== this.client || generation !== this.runtimeGeneration) return;
    const normalized = normalizeNotification(method, params);
    const session = normalized.threadId ? this.store.findSessionByThread(normalized.threadId) : null;
    if (!session) return;
    const turn = this._findLocalTurn(session.id, normalized.turnId);
    let event = null;
    if (normalized.kind === "approval-resolved") {
      event = this.store.dismissApprovalByProviderRequestId(session.id, normalized.requestId);
    } else if (normalized.kind === "message-delta") {
      event = this.store.appendAgentDelta(session.id, turn?.id, normalized.itemId, normalized.delta);
    } else if (normalized.kind === "message-completed") {
      event = this.store.completeAgentMessage(session.id, turn?.id, normalized.itemId, normalized.text);
    } else if (normalized.kind === "turn-state" && turn) {
      if (normalized.status === "running" && !turn.providerTurnId) event = this.store.bindTurn(session.id, turn.id, normalized.turnId);
      else if (normalized.status !== "running") event = this.store.updateTurnState(session.id, turn.id, normalized.status, normalized.error);
    } else {
      event = this.store.addActivity(session.id, { ...normalized, turnId: turn?.id || "" });
    }
    if (event) this._publish(event);
    if (event && normalized.kind === "turn-state" && ["completed", "failed", "cancelled"].includes(normalized.status)) {
      queueMicrotask(() => this._startNextQueued(session.id));
    }
  }

  _handleServerRequest(client, generation, request) {
    if (client !== this.client || generation !== this.runtimeGeneration) return;
    if (!APPROVAL_METHODS.has(request.method)) {
      client.respondError(request.id, -32601, "Unsupported FreeFlow client request");
      return;
    }
    const session = request.params?.threadId ? this.store.findSessionByThread(request.params.threadId) : null;
    if (!session) {
      client.respond(request.id, buildApprovalResponse(request.method, "cancel"));
      return;
    }
    const turn = this._findLocalTurn(session.id, request.params?.turnId);
    const result = this.store.addApproval(session.id, turn?.id, request);
    this._publish(result.event);
  }

  _handleClientExit(client, generation, info) {
    if (client !== this.client || generation !== this.runtimeGeneration) return;
    this.client = null;
    this.runtimeState = info.expected ? "stopped" : "recovering";
    this.lastRuntimeError = info.expected ? "" : info.error?.message || "Codex runtime stopped";
    if (info.expected) return;
    for (const session of this.store.listSessions()) {
      const active = this.store.getActiveTurn(session.id);
      if (!active) continue;
      const event = this.store.updateTurnState(session.id, active.id, "failed", { message: this.lastRuntimeError, recoverable: true });
      this._publish(event);
    }
  }

  async _startNextQueued(sessionId) {
    const next = this.store.takeNextInput(sessionId);
    if (!next) return;
    this._publish(next.event);
    try {
      await this._startTurnNow(sessionId, {
        text: next.input.text,
        clientRequestId: next.input.clientRequestId,
        attachmentIds: next.input.attachments,
      });
    } catch {
      // The failed turn and recovery state are already persisted.
    }
  }

  _publish(event) {
    if (event) this.emit("event", event);
  }
}

module.exports = { AgentRuntime, ACTIVE_STATUSES, MAX_ATTACHMENT_BYTES };
