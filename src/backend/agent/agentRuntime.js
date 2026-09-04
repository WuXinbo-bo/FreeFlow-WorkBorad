const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { EventEmitter } = require("events");
const { AgentStore } = require("./agentStore");
const { CodexAppServerClient } = require("./codexAppServerClient");
const { createCliRuntimeRegistry, wrapperCommand } = require("./cliRuntimeRegistry");
const { createClaudeCliRunner } = require("./claudeCliRunner");
const { providerApiRoot } = require("./agentConnectionService");
const { normalizeAgentSettings } = require("./agentSettingsModel");
const { APPROVAL_METHODS, buildApprovalResponse, normalizeNotification } = require("./agentProtocol");

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const ACTIVE_STATUSES = new Set(["starting", "running", "waitingApproval", "interrupting"]);

function safeName(value) {
  return String(value || "attachment").replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").slice(0, 160) || "attachment";
}

function providerReady(provider, runtime) {
  return Boolean(
    runtime?.available &&
    provider?.baseUrl &&
    (provider?.apiKeyConfigured || provider?.apiKey) &&
    provider?.selectedModel &&
    provider?.modelValidatedAt
  );
}

function codexClientConfig(provider, command, cwd, profileDir, appVersion) {
  const launch = wrapperCommand(command);
  const apiRoot = providerApiRoot("codex", provider.baseUrl);
  const config = [
    ["model_provider", "freeflow"],
    ["model_providers.freeflow.name", "FreeFlow Connection"],
    ["model_providers.freeflow.base_url", apiRoot],
    ["model_providers.freeflow.env_key", "OPENAI_API_KEY"],
    ["model_providers.freeflow.wire_api", "responses"],
    ["model_providers.freeflow.supports_websockets", false],
    ["model_providers.freeflow.request_max_retries", 3],
    ["model_providers.freeflow.stream_max_retries", 5],
    ["model_providers.freeflow.stream_idle_timeout_ms", 300000],
    ["features.multi_agent", false],
  ];
  const args = [...launch.args, "app-server", "--stdio"];
  for (const [key, value] of config) args.push("--config", `${key}=${typeof value === "string" ? JSON.stringify(value) : value}`);
  const env = {
    ...process.env,
    CODEX_HOME: profileDir,
    CODEX_API_KEY: provider.apiKey,
    OPENAI_API_KEY: provider.apiKey,
  };
  for (const key of [
    "CLAUDE_WORKER_BRIDGE_URL", "CLAUDE_WORKER_BRIDGE_TOKEN", "CLAUDE_WORKBENCH_PARENT_TASK_ID",
    "CLAUDE_CODEX_BRIDGE_URL", "CLAUDE_CODEX_BRIDGE_TOKEN",
    "WORKBENCH_AGENT_BRIDGE_URL", "WORKBENCH_AGENT_BRIDGE_TOKEN",
  ]) delete env[key];
  return {
    command: launch.command,
    args,
    cwd,
    clientVersion: appVersion,
    env,
  };
}

class AgentRuntime extends EventEmitter {
  constructor(options) {
    super();
    this.store = options.store || new AgentStore(options.databaseFile, { backupsDir: options.backupsDir });
    this.settingsService = options.settingsService;
    this.permissionsService = options.permissionsService;
    this.legacySessionService = options.legacySessionService;
    this.attachmentsDir = path.resolve(options.attachmentsDir);
    this.profilesDir = path.resolve(options.profilesDir || path.join(this.attachmentsDir, "..", "AgentProfiles"));
    this.backupsDir = path.resolve(options.backupsDir || path.join(this.attachmentsDir, "..", "AgentBackups"));
    this.appVersion = options.appVersion || "0.0.0";
    this.clientFactory = options.clientFactory || ((clientOptions) => new CodexAppServerClient(clientOptions));
    this.claudeRunner = options.claudeRunner || createClaudeCliRunner();
    this.cliRegistry = options.cliRegistry || (options.discoverExecutable ? {
      detect: async (provider, input = {}) => {
        if (provider !== "codex") return { provider, available: false, requiresSelection: false, candidates: [], path: "", version: "", source: "", error: "未配置测试 Provider", checkedAt: Date.now() };
        const result = await options.discoverExecutable(input.configuredPath || "");
        return {
          provider,
          available: Boolean(result.available),
          requiresSelection: false,
          candidates: result.available ? [{ path: result.command, version: result.version, source: "configured", label: "测试" }] : [],
          path: result.command || "",
          version: result.version || "",
          source: "configured",
          error: result.error || "",
          checkedAt: Date.now(),
        };
      },
    } : createCliRuntimeRegistry());
    this.client = null;
    this.clientCommand = "";
    this.runtimeGeneration = 0;
    this.runtimeState = "stopped";
    this.lastRuntimeError = "";
    this.discoveryCache = new Map();
    this.startPromise = null;
    this.activeClaudeRuns = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.store.open();
    this.store.recoverOrphanedState();
    await Promise.all([
      fs.mkdir(this.attachmentsDir, { recursive: true }),
      fs.mkdir(path.join(this.profilesDir, "codex"), { recursive: true }),
      fs.mkdir(path.join(this.profilesDir, "claude"), { recursive: true }),
      fs.mkdir(this.backupsDir, { recursive: true }),
    ]);
    if (this.store.getMeta("legacy-history-retired-v1") !== "done") {
      const legacySessions = this.store.listSessions().filter((session) => session.provider === "legacy");
      const legacyJson = await this.legacySessionService?.readSessionStore?.().catch(() => null);
      if (legacySessions.length || legacyJson?.sessions?.length) {
        this.store.createBackup("before-legacy-retirement");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        await fs.writeFile(path.join(this.backupsDir, `legacy-agent-history-${stamp}.json`), JSON.stringify({ sqliteSessions: legacySessions, jsonStore: legacyJson }, null, 2), "utf8");
      }
      this.store.deleteLegacySessions();
      await this.legacySessionService?.writeSessionStore?.({ currentSessionId: null, sessions: [] });
      this.store.setMeta("legacy-history-retired-v1", "done");
    }
    this.initialized = true;
  }

  async _readSettings() {
    return normalizeAgentSettings(await this.settingsService.readAgentSettings());
  }

  async _detectProvider(provider, settings, refresh = false) {
    const cached = this.discoveryCache.get(provider);
    if (!refresh && cached && Date.now() - cached.checkedAt <= 5000) return cached;
    const detected = await this.cliRegistry.detect(provider, { configuredPath: settings.providers[provider].cliPath });
    this.discoveryCache.set(provider, detected);
    return detected;
  }

  async getRuntimeStatus({ start = false, refresh = false } = {}) {
    await this.initialize();
    const settings = await this._readSettings();
    const detected = Object.fromEntries(await Promise.all(["codex", "claude"].map(async (provider) => [
      provider,
      await this._detectProvider(provider, settings, refresh),
    ])));
    let workspaceValid = true;
    let workspaceError = "";
    try {
      await this._resolveWorkspaceRoot(settings.workspaceRoot);
    } catch {
      workspaceValid = false;
      workspaceError = "默认工作区不在已授权目录中，请先在系统设置的权限页添加该目录。";
    }
    const activeProvider = settings.activeProvider;
    const activeSettings = settings.providers[activeProvider];
    if (start && activeProvider === "codex" && providerReady(activeSettings, detected.codex) && workspaceValid) {
      try {
        await this.ensureClient();
      } catch (error) {
        this.lastRuntimeError = error.message;
        this.runtimeState = "error";
      }
    }
    const providers = Object.fromEntries(["codex", "claude"].map((provider) => [provider, {
      ...detected[provider],
      configured: Boolean(settings.providers[provider].baseUrl && settings.providers[provider].apiKeyConfigured),
      modelSelected: Boolean(settings.providers[provider].selectedModel),
      modelValidated: Boolean(settings.providers[provider].modelValidatedAt),
      ready: providerReady(settings.providers[provider], detected[provider]) && workspaceValid,
      models: settings.providers[provider].models,
      selectedModel: settings.providers[provider].selectedModel,
    }]));
    const active = providers[activeProvider];
    return {
      provider: activeProvider,
      activeProvider,
      providers,
      available: active.available,
      requiresSelection: active.requiresSelection,
      candidates: active.candidates,
      command: active.path,
      version: active.version,
      state: activeProvider === "claude" ? (active.ready ? "ready" : "stopped") : this.runtimeState,
      generation: this.runtimeGeneration,
      pid: this.client?.process?.pid || 0,
      authenticated: active.configured,
      requiresOpenaiAuth: false,
      account: null,
      models: active.models,
      ready: active.ready,
      workspaceValid,
      error: workspaceError || active.error || this.lastRuntimeError || "",
      settings,
    };
  }

  async bindRuntime(provider, selectedPath) {
    const id = String(provider || "").trim().toLowerCase();
    if (!new Set(["codex", "claude"]).has(id)) throw Object.assign(new Error("不支持的 Provider"), { statusCode: 400 });
    const detected = await this.cliRegistry.detect(id, { configuredPath: String(selectedPath || "").trim() });
    if (!detected.available) throw Object.assign(new Error(detected.error || "CLI 路径不可用"), { statusCode: 400 });
    await this.settingsService.updateProviderRuntime(id, detected);
    this.discoveryCache.set(id, detected);
    if (id === "codex" && this.client) await this.restart({ start: false });
    return this.getRuntimeStatus({ refresh: true });
  }

  async discoverProvider(provider) {
    const id = String(provider || "").trim().toLowerCase();
    if (!new Set(["codex", "claude"]).has(id)) throw Object.assign(new Error("不支持的 Provider"), { statusCode: 400 });
    const status = await this.getRuntimeStatus({ refresh: true });
    return status.providers[id];
  }

  async ensureClient() {
    await this.initialize();
    const settings = await this._readSettings();
    const provider = await this.settingsService.readAgentRuntimeSettings("codex");
    const discovery = await this._detectProvider("codex", settings, true);
    if (!discovery.available) throw new Error(discovery.error || "未找到 Codex CLI");
    if (!providerReady(provider, discovery)) throw new Error("请先保存连接、刷新模型、手动选择并完成验证");
    const workspaceRoot = await this._resolveWorkspaceRoot(settings.workspaceRoot);
    const clientIdentity = `${discovery.path}\n${provider.baseUrl}\n${provider.selectedModel}`;
    if (this.client?.initialized && this.clientCommand === clientIdentity) return this.client;
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      if (this.client) await this.client.stop().catch(() => {});
      const client = this.clientFactory(codexClientConfig(
        provider,
        discovery.path,
        workspaceRoot,
        path.join(this.profilesDir, "codex"),
        this.appVersion
      ));
      this.client = client;
      this.clientCommand = clientIdentity;
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

  async restart(options = {}) {
    await this.initialize();
    this.store.recoverOrphanedState("Codex runtime restarted before this task completed").forEach((event) => this._publish(event));
    this.runtimeGeneration += 1;
    const client = this.client;
    this.client = null;
    this.runtimeState = "stopped";
    await client?.stop().catch(() => {});
    for (const run of this.activeClaudeRuns.values()) run.controller.abort();
    return this.getRuntimeStatus({ start: options.start !== false, refresh: true });
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
    for (const run of this.activeClaudeRuns.values()) run.controller.abort();
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
    const settings = await this._readSettings();
    const requestedProvider = String(input.provider || "").trim().toLowerCase();
    const providerId = new Set(["codex", "claude"]).has(requestedProvider) ? requestedProvider : settings.activeProvider;
    const provider = settings.providers[providerId];
    const detected = await this._detectProvider(providerId, settings, false);
    if (!providerReady(provider, detected)) {
      throw Object.assign(new Error("请先在 AI 模型设置中绑定 CLI、保存连接、刷新模型、选择模型并完成验证"), { statusCode: 409, code: "AGENT_PROVIDER_NOT_READY" });
    }
    const workspaceRoot = await this._resolveWorkspaceRoot(input.workspaceRoot || settings.workspaceRoot);
    const created = this.store.createSession({
      provider: providerId,
      providerThreadId: input.providerThreadId || null,
      title: input.title,
      workspaceRoot,
      model: provider.selectedModel,
      reasoningEffort: input.reasoningEffort ?? provider.reasoningEffort,
      approvalPolicy: input.approvalPolicy || provider.approvalPolicy,
      sandboxMode: input.sandboxMode || provider.sandboxMode,
      runtimeBinding: { provider: providerId, cliPath: detected.path, cliVersion: detected.version, baseUrl: provider.baseUrl },
      status: input.status || "idle",
    });
    this._publish(created.event);
    return created.session;
  }

  async renameSession(sessionId, title) {
    await this.initialize();
    const event = this.store.renameSession(sessionId, title);
    this._publish(event);
    const session = this.store.getSessionSummary(sessionId);
    if (session?.provider === "codex" && this.client?.initialized) {
      if (session?.providerThreadId) this.client.request("thread/name/set", { threadId: session.providerThreadId, name: String(title).trim() }).catch(() => {});
    }
    return this.store.getSessionSummary(sessionId);
  }

  async deleteSession(sessionId) {
    await this.initialize();
    const session = this.store.getSessionSummary(sessionId);
    if (!session) return false;
    if (ACTIVE_STATUSES.has(session.status)) throw Object.assign(new Error("请先停止当前任务"), { statusCode: 409 });
    if (session.provider === "codex" && this.client?.initialized && session.providerThreadId) {
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
      const settings = await this._readSettings();
      const mode = input.mode === "steer" ? "steer" : "queue";
      if (mode === "queue" && !settings.queueWhileRunning) {
        throw Object.assign(new Error("当前任务仍在运行，请先停止或使用即时引导"), { statusCode: 409 });
      }
      const queued = this.store.queueInput(sessionId, { text, clientRequestId, attachments: input.attachmentIds || [], mode });
      this._publish(queued.event);
      if (mode === "steer") {
        if (session.provider === "codex" && active.providerTurnId && session.providerThreadId) {
          const claimed = this.store.takeNextInput(sessionId, queued.pending.id);
          if (claimed?.event) this._publish(claimed.event);
          try {
            const client = await this.ensureClient();
            await client.request("turn/steer", {
              threadId: session.providerThreadId,
              expectedTurnId: active.providerTurnId,
              input: [{ type: "text", text }],
              clientUserMessageId: clientRequestId,
            });
            this._publish(this.store.completePendingInput(sessionId, queued.pending.id));
            this._publish(this.store.addActivity(sessionId, { activityType: "steer", status: "completed", summary: text, turnId: active.id }));
            return { queued: false, steered: true, turn: active };
          } catch (error) {
            this._publish(this.store.failPendingInput(sessionId, queued.pending.id, error));
            throw error;
          }
        }
        const run = this.activeClaudeRuns.get(sessionId);
        if (run) {
          run.controller.abort();
          return { queued: true, steered: true, pending: queued.pending };
        }
      }
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
      model: session.model || settings.selectedModel || null,
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
      provider: "codex",
      model: result.model || session.model || settings.selectedModel,
      reasoningEffort: result.reasoningEffort || session.reasoningEffort || settings.reasoningEffort,
      approvalPolicy: result.approvalPolicy || session.approvalPolicy || settings.approvalPolicy,
      sandboxMode: result.sandbox || session.sandboxMode || settings.sandboxMode,
      runtimeBinding: session.runtimeBinding,
    });
    this._publish(event);
    return threadId;
  }

  async _startTurnNow(sessionId, input) {
    let session = this.store.getSessionSummary(sessionId);
    if (!session) throw Object.assign(new Error("会话不存在"), { statusCode: 404 });
    const settings = await this._readSettings();
    const provider = await this.settingsService.readAgentRuntimeSettings(session.provider);
    const discovery = await this._detectProvider(session.provider, settings, false);
    if (!providerReady(provider, discovery)) throw Object.assign(new Error("当前会话的模型连接尚未就绪"), { statusCode: 409, code: "AGENT_PROVIDER_NOT_READY" });
    const created = this.store.createTurn(sessionId, { text: input.text, clientRequestId: input.clientRequestId, messageId: input.messageId });
    this._publish(created.event);
    try {
      if (session.provider === "claude") return this._startClaudeTurn(session, provider, discovery, created, input);
      const client = await this.ensureClient();
      const threadId = await this._ensureThread(session, provider, client);
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
        model: session.model || provider.selectedModel || null,
        effort: session.reasoningEffort || provider.reasoningEffort || null,
        approvalPolicy: session.approvalPolicy || provider.approvalPolicy,
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

  _startClaudeTurn(session, provider, discovery, created, input) {
    const controller = new AbortController();
    const attachmentText = this.store.getAttachments(session.id, input.attachmentIds || [])
      .map((item) => `- ${item.name}: ${item.storedPath}`)
      .join("\n");
    const prompt = attachmentText ? `${input.text}\n\n附件路径：\n${attachmentText}` : input.text;
    const handle = this.claudeRunner.start({
      commandPath: discovery.path,
      profileDir: path.join(this.profilesDir, "claude"),
      provider,
      session,
      prompt,
      signal: controller.signal,
      onSession: async (threadId) => {
        const current = this.store.getSessionSummary(session.id);
        if (current?.providerThreadId === threadId) return;
        this._publish(this.store.bindThread(session.id, threadId, {
          provider: "claude",
          workspaceRoot: session.workspaceRoot,
          model: session.model,
          reasoningEffort: session.reasoningEffort,
          approvalPolicy: session.approvalPolicy,
          sandboxMode: session.sandboxMode,
          runtimeBinding: session.runtimeBinding,
        }));
      },
      onDelta: async (itemId, delta) => this._publish(this.store.appendAgentDelta(session.id, created.turn.id, itemId, delta)),
      onMessage: async (itemId, text) => this._publish(this.store.completeAgentMessage(session.id, created.turn.id, itemId, text)),
      onActivity: async (activity) => this._publish(this.store.addActivity(session.id, { ...activity, turnId: created.turn.id })),
    });
    const providerTurnId = `claude:${handle.sessionId}`;
    this._publish(this.store.bindTurn(session.id, created.turn.id, providerTurnId));
    this.activeClaudeRuns.set(session.id, { controller, handle, turnId: created.turn.id });
    handle.completion.then((result) => {
      const current = this.store.getSessionSummary(session.id);
      if (current && result.sessionId && current.providerThreadId !== result.sessionId) {
        this._publish(this.store.bindThread(session.id, result.sessionId, {
          provider: "claude",
          workspaceRoot: session.workspaceRoot,
          model: session.model,
          reasoningEffort: session.reasoningEffort,
          approvalPolicy: session.approvalPolicy,
          sandboxMode: session.sandboxMode,
          runtimeBinding: session.runtimeBinding,
        }));
      }
      if (result.finalText && !(this.store.getSession(session.id)?.messages || []).some((message) => message.turnId === created.turn.id && message.role === "assistant")) {
        this._publish(this.store.completeAgentMessage(session.id, created.turn.id, `claude:${result.sessionId}`, result.finalText));
      }
      this._publish(this.store.updateTurnState(session.id, created.turn.id, "completed"));
    }).catch((error) => {
      const status = error?.name === "AbortError" ? "cancelled" : "failed";
      this._publish(this.store.updateTurnState(session.id, created.turn.id, status, status === "failed" ? { message: error.message, recoverable: true } : null));
    }).finally(() => {
      const active = this.activeClaudeRuns.get(session.id);
      if (active?.turnId === created.turn.id) this.activeClaudeRuns.delete(session.id);
      queueMicrotask(() => this._startNextQueued(session.id));
    });
    return { queued: false, steered: false, turn: { ...created.turn, providerTurnId, status: "running" } };
  }

  async interruptTurn(sessionId) {
    await this.initialize();
    const session = this.store.getSessionSummary(sessionId);
    const active = this.store.getActiveTurn(sessionId);
    if (!session || !active) return { interrupted: false };
    const event = this.store.updateTurnState(sessionId, active.id, "interrupting");
    this._publish(event);
    if (session.provider === "claude") {
      const run = this.activeClaudeRuns.get(sessionId);
      if (!run) {
        this._publish(this.store.updateTurnState(sessionId, active.id, "cancelled"));
        queueMicrotask(() => this._startNextQueued(sessionId));
      } else run.controller.abort();
      return { interrupted: true };
    }
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

  async updatePendingInput(sessionId, pendingId, input = {}) {
    await this.initialize();
    const result = this.store.updatePendingInput(sessionId, pendingId, input);
    if (!result) throw Object.assign(new Error("排队消息不存在"), { statusCode: 404 });
    this._publish(result.event);
    return result.pending;
  }

  async movePendingInput(sessionId, pendingId, direction) {
    await this.initialize();
    const result = this.store.movePendingInput(sessionId, pendingId, direction);
    if (!result) throw Object.assign(new Error("排队消息不存在"), { statusCode: 404 });
    this._publish(result.event);
    return result.pending;
  }

  async promotePendingInput(sessionId, pendingId) {
    await this.initialize();
    const session = this.store.getSessionSummary(sessionId);
    const pending = this.store.getSession(sessionId)?.pendingInputs.find((item) => item.id === pendingId);
    if (session?.provider === "codex" && pending?.attachments?.length) {
      throw Object.assign(new Error("包含附件的排队消息不能提升为 Codex 即时引导"), { statusCode: 409 });
    }
    const result = this.store.promotePendingInput(sessionId, pendingId);
    if (!result) throw Object.assign(new Error("排队消息不存在"), { statusCode: 404 });
    this._publish(result.event);
    const active = this.store.getActiveTurn(sessionId);
    if (active && session?.provider === "codex" && active.providerTurnId && session.providerThreadId) {
      const claimed = this.store.takeNextInput(sessionId, pendingId);
      if (claimed?.event) this._publish(claimed.event);
      try {
        const client = await this.ensureClient();
        await client.request("turn/steer", {
          threadId: session.providerThreadId,
          expectedTurnId: active.providerTurnId,
          input: [{ type: "text", text: claimed.input.input }],
          clientUserMessageId: claimed.input.clientRequestId,
        });
        this._publish(this.store.completePendingInput(sessionId, pendingId));
        this._publish(this.store.addActivity(sessionId, { activityType: "steer", status: "completed", summary: claimed.input.input, turnId: active.id }));
      } catch (error) {
        this._publish(this.store.failPendingInput(sessionId, pendingId, error));
        throw error;
      }
    } else if (active && session?.provider === "claude") {
      this.activeClaudeRuns.get(sessionId)?.controller.abort();
    } else if (!active) {
      queueMicrotask(() => this._startNextQueued(sessionId));
    }
    return result.pending;
  }

  async retryPendingInput(sessionId, pendingId) {
    await this.initialize();
    const result = this.store.retryPendingInput(sessionId, pendingId);
    if (!result) throw Object.assign(new Error("排队消息不存在"), { statusCode: 404 });
    this._publish(result.event);
    if (!this.store.getActiveTurn(sessionId)) queueMicrotask(() => this._startNextQueued(sessionId));
    return result.pending;
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
    if (!source.providerThreadId || source.provider === "claude") return this.createSession({ provider: source.provider, title: input.title || `${source.title} 副本`, workspaceRoot: source.workspaceRoot });
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
      provider: "codex", title: input.title || `${source.title} 分支`, workspaceRoot: source.workspaceRoot, model: source.model,
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
        text: next.input.input,
        clientRequestId: next.input.clientRequestId,
        attachmentIds: next.input.attachments,
      });
      this._publish(this.store.completePendingInput(sessionId, next.input.id));
    } catch (error) {
      this._publish(this.store.failPendingInput(sessionId, next.input.id, error));
    }
  }

  async listBackups() {
    await this.initialize();
    return this.store.listBackups();
  }

  async createBackup() {
    await this.initialize();
    const backup = this.store.createBackup("manual");
    return backup ? { name: backup.name, createdAt: backup.createdAt, sizeBytes: backup.sizeBytes } : null;
  }

  async restoreBackup(name) {
    await this.initialize();
    if (this.store.listSessions().some((session) => ACTIVE_STATUSES.has(session.status))) {
      throw Object.assign(new Error("请先停止所有正在运行的任务"), { statusCode: 409 });
    }
    const backups = this.store.restoreBackup(name);
    this.emit("restored");
    return backups;
  }

  _publish(event) {
    if (event) this.emit("event", event);
  }
}

module.exports = { AgentRuntime, ACTIVE_STATUSES, MAX_ATTACHMENT_BYTES };
