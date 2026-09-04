const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");
const { DatabaseSync } = require("node:sqlite");
const { AgentRuntime } = require("../src/backend/agent/agentRuntime");
const { getDefaultAgentSettings, providerValidationFingerprint } = require("../src/backend/agent/agentSettingsModel");
const { AgentStore } = require("../src/backend/agent/agentStore");

class FakeCodexClient extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.process = { pid: 4242 };
    this.threadSequence = 0;
    this.turnSequence = 0;
    this.requests = [];
    this.responses = [];
    this.failNextTurnStart = false;
    this.failNextThreadDelete = false;
  }

  async start() {
    this.initialized = true;
    return this;
  }

  async stop() {
    this.initialized = false;
    this.emit("exit", { expected: true, generation: 1, error: new Error("stopped") });
  }

  async request(method, params) {
    this.requests.push({ method, params });
    if (method === "thread/start") {
      return {
        thread: { id: `thread-${++this.threadSequence}` },
        model: "gpt-test",
        reasoningEffort: "high",
        approvalPolicy: params.approvalPolicy,
        sandbox: {
          type: params.sandbox === "read-only"
            ? "readOnly"
            : params.sandbox === "danger-full-access"
              ? "dangerFullAccess"
              : "workspaceWrite",
          ...(params.sandbox === "workspace-write" ? { writableRoots: [params.cwd], networkAccess: false } : {}),
        },
      };
    }
    if (method === "thread/delete") {
      if (this.failNextThreadDelete) {
        this.failNextThreadDelete = false;
        throw new Error("forced thread cleanup failure");
      }
      return {};
    }
    if (method === "thread/resume") return { thread: { id: params.threadId } };
    if (method === "thread/fork") return { thread: { id: `thread-${++this.threadSequence}` } };
    if (method === "turn/start") {
      if (this.failNextTurnStart) {
        this.failNextTurnStart = false;
        throw new Error("forced turn start failure");
      }
      return { turn: { id: `turn-${++this.turnSequence}`, status: "inProgress", items: [] } };
    }
    if (method === "account/read") return { account: { type: "chatgpt", email: "test@example.com" }, requiresOpenaiAuth: true };
    if (method === "model/list") return { data: [{ id: "gpt-test", displayName: "GPT Test", isDefault: true }] };
    return {};
  }

  respond(id, result) {
    this.responses.push({ id, result });
  }
}

async function eventually(check, message) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const result = check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

function checkStoreMigration(tempDir) {
  const databaseFile = path.join(tempDir, "migration", "agent-v1.sqlite");
  const backupsDir = path.join(tempDir, "migration-backups");
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  const legacy = new DatabaseSync(databaseFile);
  legacy.exec(`
    CREATE TABLE agent_sessions (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL DEFAULT 'codex', provider_thread_id TEXT,
      title TEXT NOT NULL, workspace_root TEXT NOT NULL, model TEXT NOT NULL DEFAULT '',
      reasoning_effort TEXT NOT NULL DEFAULT '', approval_policy TEXT NOT NULL DEFAULT 'on-request',
      sandbox_mode TEXT NOT NULL DEFAULT 'workspace-write', status TEXT NOT NULL DEFAULT 'idle',
      revision INTEGER NOT NULL DEFAULT 0, legacy_source_id TEXT UNIQUE,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE agent_pending_inputs (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
      client_request_id TEXT NOT NULL UNIQUE, input_text TEXT NOT NULL,
      attachments_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL
    );
    INSERT INTO agent_sessions(id, title, workspace_root, created_at, updated_at)
      VALUES ('legacy-session', 'Legacy session', '${tempDir.replaceAll("'", "''")}', 100, 100);
    INSERT INTO agent_pending_inputs(id, session_id, client_request_id, input_text, created_at)
      VALUES ('legacy-queue', 'legacy-session', 'legacy-request', 'queued before upgrade', 110);
    PRAGMA user_version = 1;
  `);
  legacy.close();

  const store = new AgentStore(databaseFile, { backupsDir }).open();
  const pending = store.getSession("legacy-session").pendingInputs[0];
  assert.equal(pending.status, "queued", "v1 queue status was not migrated");
  assert.equal(pending.position, 110, "v1 queue order was not preserved");
  assert.equal(pending.updatedAt, 110, "v1 queue update time was not initialized");
  assert.equal(store.db.prepare("PRAGMA user_version").get().user_version, 3, "Agent store schema version was not advanced");
  assert(store.listBackups().some((item) => item.name.includes("schema-v1-to-v3")), "schema migration did not create a recovery backup");
  store.close();
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-agent-runtime-"));
  checkStoreMigration(tempDir);
  const clients = [];
  const clientConfigs = [];
  const managedWorkspacesDir = path.join(tempDir, "AIWorkspaces");
  const settings = getDefaultAgentSettings(managedWorkspacesDir);
  settings.providers.codex = {
    ...settings.providers.codex,
    cliPath: "fake-codex",
    baseUrl: "https://example.test",
    apiKeyConfigured: true,
    models: [{ id: "gpt-test", displayName: "GPT Test" }],
    selectedModel: "gpt-test",
    modelValidatedAt: Date.now(),
  };
  settings.providers.codex.validationFingerprint = providerValidationFingerprint("codex", settings.providers.codex);
  let legacyCleared = false;
  const permissionChecks = [];
  const legacySnapshot = { currentSessionId: "legacy-one", sessions: [{ id: "legacy-one", title: "Legacy history" }] };
  const runtime = new AgentRuntime({
    databaseFile: path.join(tempDir, "agent.sqlite"),
    attachmentsDir: path.join(tempDir, "attachments"),
    workspacesDir: path.join(tempDir, "AIWorkspaces"),
    appVersion: "test",
    settingsService: {
      async readAgentSettings() { return structuredClone(settings); },
      async readAgentRuntimeSettings(provider) { return { ...structuredClone(settings.providers[provider]), apiKey: "test-key", workspaceRoot: settings.workspaceRoot }; },
      async updateProviderRuntime(provider, detected) {
        settings.providers[provider] = { ...settings.providers[provider], cliPath: detected.path, cliVersion: detected.version, cliSource: detected.source };
        return structuredClone(settings);
      },
    },
    permissionsService: {
      async readPermissionsStore() { return { allowedRoots: [tempDir] }; },
      async resolveAllowedExistingPath(value) {
        const resolved = path.resolve(value);
        permissionChecks.push(resolved);
        if (resolved === managedWorkspacesDir || resolved.startsWith(`${managedWorkspacesDir}${path.sep}`)) {
          throw new Error("managed workspace reached external permission validation");
        }
        if (resolved !== tempDir && !resolved.startsWith(`${tempDir}${path.sep}`)) throw new Error("Path is outside allowed roots");
        return resolved;
      },
    },
    legacySessionService: {
      async readSessionStore() { return structuredClone(legacySnapshot); },
      async writeSessionStore(payload) {
        legacyCleared = Array.isArray(payload.sessions) && payload.sessions.length === 0;
      },
    },
    discoverExecutable: async () => ({ available: true, command: "fake-codex", version: "codex-cli test" }),
    clientFactory: (config) => {
      clientConfigs.push(config);
      const client = new FakeCodexClient();
      clients.push(client);
      return client;
    },
  });

  const published = [];
  runtime.on("event", (event) => published.push(event));
  await runtime.initialize();
  const runtimeStatus = await runtime.getRuntimeStatus();
  assert.equal(runtimeStatus.workspaceValid, true, "managed workspace root was rejected by external permissions");
  assert.equal(permissionChecks.length, 0, "managed workspace root entered external permission validation");
  assert.equal((await runtime.listSessions()).filter((item) => item.provider === "legacy").length, 0, "legacy sessions were retained");
  assert.equal(legacyCleared, true, "legacy JSON history was not retired");
  assert(fs.readdirSync(path.join(tempDir, "AgentBackups")).some((name) => name.startsWith("legacy-agent-history-")), "legacy history was retired without a recovery snapshot");

  const session = await runtime.createSession({ title: "Agent session" });
  assert.equal(session.runtimeBinding.workspaceKind, "managed", "default session did not use the managed workspace policy");
  assert.equal(path.dirname(session.workspaceRoot), path.join(tempDir, "AIWorkspaces"), "managed session escaped its isolated workspace root");
  assert(fs.existsSync(session.workspaceRoot), "managed session workspace was not created");
  assert.equal(permissionChecks.length, 0, "managed session entered external permission validation");
  const first = await runtime.startTurn(session.id, { text: "first", clientRequestId: "request-1" });
  assert.equal(first.turn.status, "running");
  assert(clientConfigs[0].args.includes("features.multi_agent=false"), "Codex native multi-agent support was not disabled");
  assert.equal(Object.hasOwn(clientConfigs[0].env, "WORKBENCH_AGENT_BRIDGE_TOKEN"), false, "Codex inherited a delegation bridge token");
  assert.equal((await runtime.getSession(session.id)).status, "running");
  const client = clients[0];
  const boundSession = await runtime.getSession(session.id);
  assert.equal(boundSession.sandboxMode, "workspace-write", "structured Codex sandbox response was not normalized before SQLite persistence");
  assert.equal(boundSession.approvalPolicy, "on-request", "Codex approval policy was not normalized before SQLite persistence");
  assert.equal(client.requests.find((entry) => entry.method === "thread/start")?.params.sandbox, "workspace-write", "thread start sandbox no longer matches the installed app-server request schema");
  assert(fs.existsSync(path.join(tempDir, "attachments", session.id)), "thread workspace attachment root was not created");
  const duplicateFirst = await runtime.startTurn(session.id, { text: "first", clientRequestId: "request-1" });
  assert.equal(duplicateFirst.duplicate, true, "active turn retry was not idempotent");
  assert.equal(client.requests.filter((entry) => entry.method === "turn/start").length, 1, "active turn retry started a second provider turn");

  client.emit("notification", "item/agentMessage/delta", {
    threadId: (await runtime.getSession(session.id)).providerThreadId,
    turnId: first.turn.providerTurnId,
    itemId: "answer-1",
    delta: "hello",
  });
  client.emit("notification", "item/completed", {
    threadId: (await runtime.getSession(session.id)).providerThreadId,
    turnId: first.turn.providerTurnId,
    item: { id: "answer-1", type: "agentMessage", text: "hello world" },
    completedAtMs: Date.now(),
  });
  client.emit("notification", "turn/completed", {
    threadId: (await runtime.getSession(session.id)).providerThreadId,
    turn: { id: first.turn.providerTurnId, status: "completed", items: [] },
  });
  assert.equal((await runtime.getSession(session.id)).status, "idle", "completed turn did not restore idle state");
  assert.equal((await runtime.getSession(session.id)).messages.at(-1).content, "hello world", "completed message did not replace the streamed projection");

  const bindFailureSession = await runtime.createSession({ title: "Binding recovery" });
  const originalBindThread = runtime.store.bindThread.bind(runtime.store);
  let failBindingOnce = true;
  client.failNextThreadDelete = true;
  runtime.store.bindThread = (sessionId, threadId, threadSettings) => {
    if (sessionId === bindFailureSession.id && failBindingOnce) {
      failBindingOnce = false;
      throw Object.assign(new Error("forced local thread binding failure"), { code: "SQLITE_BIND_TEST" });
    }
    return originalBindThread(sessionId, threadId, threadSettings);
  };
  await assert.rejects(
    () => runtime.startTurn(bindFailureSession.id, { text: "retry without duplication", clientRequestId: "bind-failure-1" }),
    /binding failure/,
    "local thread binding failure did not reach the caller"
  );
  assert(client.requests.some((entry) => entry.method === "thread/delete" && entry.params.threadId === "thread-2"), "failed local binding did not compensate the remote thread");
  assert.equal(runtime.store.listRemoteThreadCleanups().length, 1, "failed remote cleanup was not persisted for restart recovery");
  const failedBindingTurn = (await runtime.getSession(bindFailureSession.id)).turns.find((turn) => turn.clientRequestId === "bind-failure-1");
  assert.equal(failedBindingTurn?.status, "failed", "binding failure did not remain recoverable in local history");
  const retriedBinding = await runtime.retryTurn(bindFailureSession.id, failedBindingTurn.id);
  assert.equal(retriedBinding.turn.status, "running", "failed turn retry did not start a replacement provider turn");
  const retriedSession = await runtime.getSession(bindFailureSession.id);
  assert.equal(retriedSession.messages.filter((message) => message.role === "user" && message.content === "retry without duplication").length, 1, "failed turn retry duplicated the visible user message");
  assert.equal(retriedSession.sandboxMode, "workspace-write", "retry lost the normalized sandbox policy");

  const titledSession = await runtime.createSession();
  await runtime.startTurn(titledSession.id, { text: "  # Build the new Agent history  ", clientRequestId: "title-request" });
  assert.equal((await runtime.getSession(titledSession.id)).title, "Build the new Agent history", "first user turn did not name a new session");
  clients[0].emit("notification", "turn/completed", {
    threadId: (await runtime.getSession(titledSession.id)).providerThreadId,
    turn: { id: runtime.store.getActiveTurn(titledSession.id).providerTurnId, status: "completed", items: [] },
  });

  const attachmentSource = path.join(tempDir, "attachment.txt");
  fs.writeFileSync(attachmentSource, "attachment");
  const attachment = await runtime.importAttachment(titledSession.id, { filePath: attachmentSource, name: "attachment.txt", mimeType: "text/plain" });
  const storedAttachment = (await runtime.getSession(titledSession.id)).attachments.find((item) => item.id === attachment.id);
  assert(storedAttachment && fs.existsSync(storedAttachment.storedPath), "attachment was not persisted with the session");
  await runtime.removeAttachment(titledSession.id, attachment.id);
  assert.equal((await runtime.getSession(titledSession.id)).attachments.length, 0, "removed attachment remained in the session");
  assert.equal(fs.existsSync(storedAttachment.storedPath), false, "removed attachment file remained on disk");

  const cleanupSession = await runtime.createSession({ title: "Attachment cleanup" });
  const cleanupAttachment = await runtime.importAttachment(cleanupSession.id, { filePath: attachmentSource, name: "cleanup.txt", mimeType: "text/plain" });
  fs.writeFileSync(path.join(cleanupSession.workspaceRoot, "managed-output.txt"), "managed output");
  assert(fs.existsSync(cleanupAttachment.storedPath), "cleanup attachment was not stored");
  await runtime.deleteSession(cleanupSession.id);
  assert.equal(fs.existsSync(path.join(tempDir, "attachments", cleanupSession.id)), false, "session deletion left its attachment directory behind");
  assert.equal(fs.existsSync(cleanupSession.workspaceRoot), false, "session deletion left its managed workspace behind");

  const projectWorkspace = path.join(tempDir, "ProjectWorkspace");
  fs.mkdirSync(projectWorkspace);
  fs.writeFileSync(path.join(projectWorkspace, "keep.txt"), "project data");
  const projectSession = await runtime.createSession({ title: "Project workspace", workspaceRoot: projectWorkspace });
  assert.equal(projectSession.runtimeBinding.workspaceKind, "project");
  await runtime.deleteSession(projectSession.id);
  assert(fs.existsSync(path.join(projectWorkspace, "keep.txt")), "session deletion removed an external project workspace");

  const sharedWorkspaceSession = await runtime.createSession({
    title: "Shared managed workspace",
    workspaceRoot: session.workspaceRoot,
    workspaceKind: "managed",
  });
  await runtime.deleteSession(sharedWorkspaceSession.id);
  assert(fs.existsSync(session.workspaceRoot), "deleting one session removed a managed workspace still used by another session");

  settings.activeProvider = "claude";
  const forked = await runtime.forkSession(titledSession.id);
  settings.activeProvider = "codex";
  assert(forked.id !== titledSession.id, "fork did not create a distinct session");
  assert.equal(forked.provider, "codex", "Codex fork followed the unrelated active Provider");
  assert.equal(client.requests.findLast((entry) => entry.method === "thread/fork")?.params.excludeTurns, true, "thread fork requested full provider history");

  await assert.rejects(
    () => runtime.createSession({ workspaceRoot: path.dirname(tempDir) }),
    /outside allowed roots/,
    "session accepted a workspace outside the allowed roots"
  );

  const second = await runtime.startTurn(session.id, { text: "second", clientRequestId: "request-2" });
  const queued = await runtime.startTurn(session.id, { text: "queued", clientRequestId: "request-3" });
  assert.equal(queued.queued, true, "input submitted during a turn was not queued");
  assert.equal((await runtime.getSession(session.id)).pendingInputs.length, 1);
  const duplicateQueued = await runtime.startTurn(session.id, { text: "queued", clientRequestId: "request-3" });
  assert.equal(duplicateQueued.duplicate, true, "queued input retry was not idempotent");
  assert.equal((await runtime.getSession(session.id)).pendingInputs.length, 1, "queued input retry created a duplicate");
  client.emit("notification", "turn/completed", {
    threadId: (await runtime.getSession(session.id)).providerThreadId,
    turn: { id: second.turn.providerTurnId, status: "completed", items: [] },
  });
  await eventually(() => runtime.store.getActiveTurn(session.id)?.input === "queued", "queued input did not start after the previous turn completed");

  const active = runtime.store.getActiveTurn(session.id);
  const steered = await runtime.startTurn(session.id, { text: "change direction", clientRequestId: "request-4", mode: "steer" });
  assert.equal(steered.steered, true, "running turn did not accept steering input");
  assert(client.requests.some((entry) => entry.method === "turn/steer" && entry.params.expectedTurnId === active.providerTurnId));

  client.emit("server-request", {
    jsonrpc: "2.0",
    id: 77,
    method: "item/commandExecution/requestApproval",
    params: { threadId: (await runtime.getSession(session.id)).providerThreadId, turnId: active.providerTurnId, command: "echo test" },
  });
  const waiting = await runtime.getSession(session.id);
  assert.equal(waiting.status, "waitingApproval", "approval request did not enter waiting state");
  assert.equal(waiting.approvals.length, 1);
  client.emit("server-request", {
    jsonrpc: "2.0",
    id: 77,
    method: "item/commandExecution/requestApproval",
    params: { threadId: waiting.providerThreadId, turnId: active.providerTurnId, command: "echo test" },
  });
  assert.equal((await runtime.getSession(session.id)).approvals.length, 1, "duplicate approval request was persisted twice");
  await runtime.resolveApproval(waiting.approvals[0].id, { decision: "accept" });
  assert.deepEqual(client.responses.at(-1), { id: 77, result: { decision: "accept" } });
  assert.equal((await runtime.getSession(session.id)).status, "running", "approval resolution did not restore running state");

  client.emit("server-request", {
    jsonrpc: "2.0",
    id: 79,
    method: "item/tool/requestUserInput",
    params: {
      threadId: waiting.providerThreadId,
      turnId: active.providerTurnId,
      questions: [{ id: "goal", header: "Goal", question: "What next?", options: null }],
    },
  });
  const inputApproval = (await runtime.getSession(session.id)).approvals[0];
  await runtime.resolveApproval(inputApproval.id, { decision: "accept", answers: { goal: "ship it" } });
  assert.deepEqual(client.responses.at(-1), { id: 79, result: { answers: { goal: { answers: ["ship it"] } } } });

  client.emit("server-request", {
    jsonrpc: "2.0",
    id: 80,
    method: "item/permissions/requestApproval",
    params: {
      threadId: waiting.providerThreadId,
      turnId: active.providerTurnId,
      permissions: { network: { enabled: true } },
    },
  });
  const permissionApproval = (await runtime.getSession(session.id)).approvals[0];
  await runtime.resolveApproval(permissionApproval.id, { decision: "acceptForSession" });
  assert.deepEqual(client.responses.at(-1), {
    id: 80,
    result: { permissions: { network: { enabled: true } }, scope: "session" },
  });

  client.emit("server-request", {
    jsonrpc: "2.0",
    id: 81,
    method: "mcpServer/elicitation/request",
    params: { threadId: waiting.providerThreadId, turnId: active.providerTurnId, serverName: "test" },
  });
  const elicitation = (await runtime.getSession(session.id)).approvals[0];
  await runtime.resolveApproval(elicitation.id, { decision: "accept" });
  assert.deepEqual(client.responses.at(-1), { id: 81, result: { action: "accept" } });

  client.emit("server-request", {
    jsonrpc: "2.0",
    id: 78,
    method: "item/fileChange/requestApproval",
    params: { threadId: waiting.providerThreadId, turnId: active.providerTurnId, reason: "test" },
  });
  assert.equal((await runtime.getSession(session.id)).status, "waitingApproval");
  client.emit("notification", "serverRequest/resolved", { threadId: waiting.providerThreadId, requestId: 78 });
  assert.equal((await runtime.getSession(session.id)).status, "running", "server-side approval cleanup did not restore running state");
  assert.equal((await runtime.getSession(session.id)).approvals.length, 0, "server-side approval cleanup left a pending request");

  await runtime.interruptTurn(session.id);
  assert.equal((await runtime.getSession(session.id)).status, "interrupting");
  client.emit("notification", "turn/completed", {
    threadId: (await runtime.getSession(session.id)).providerThreadId,
    turn: { id: active.providerTurnId, status: "interrupted", items: [] },
  });
  assert.equal((await runtime.getSession(session.id)).status, "idle", "interrupted turn did not restore idle state");
  const revisionAfterInterrupt = (await runtime.getSession(session.id)).revision;
  client.emit("notification", "turn/completed", {
    threadId: (await runtime.getSession(session.id)).providerThreadId,
    turn: { id: active.providerTurnId, status: "interrupted", items: [] },
  });
  assert.equal((await runtime.getSession(session.id)).revision, revisionAfterInterrupt, "duplicate turn completion changed persisted state");

  const queueFailureSession = await runtime.createSession({ title: "Queue failure" });
  const queueFailureFirst = await runtime.startTurn(queueFailureSession.id, { text: "active", clientRequestId: "queue-failure-1" });
  await runtime.startTurn(queueFailureSession.id, { text: "must remain visible", clientRequestId: "queue-failure-2" });
  client.failNextTurnStart = true;
  client.emit("notification", "turn/completed", {
    threadId: (await runtime.getSession(queueFailureSession.id)).providerThreadId,
    turn: { id: queueFailureFirst.turn.providerTurnId, status: "completed", items: [] },
  });
  await eventually(() => (runtime.store.findTurnByClientRequestId(queueFailureSession.id, "queue-failure-2")?.status === "failed"), "failed queued input disappeared without a persisted turn");
  const failedQueue = (await runtime.getSession(queueFailureSession.id)).pendingInputs;
  assert.equal(failedQueue.length, 1, "failed queued input was removed instead of remaining recoverable");
  assert.equal(failedQueue[0].status, "failed");
  const editedQueue = await runtime.updatePendingInput(queueFailureSession.id, failedQueue[0].id, { text: "retry this message", revision: failedQueue[0].revision });
  assert.equal(editedQueue.status, "queued");
  assert.equal(editedQueue.input, "retry this message");
  await assert.rejects(
    () => runtime.updatePendingInput(queueFailureSession.id, failedQueue[0].id, { text: "stale edit", revision: failedQueue[0].revision }),
    (error) => error.code === "QUEUE_REVISION_CONFLICT",
    "stale queue edits were not rejected"
  );
  await runtime.removePendingInput(queueFailureSession.id, failedQueue[0].id);
  assert.equal((await runtime.getSession(queueFailureSession.id)).pendingInputs.length, 0);

  const queueOrderSession = await runtime.createSession({ title: "Queue order" });
  const queueOrderFirst = await runtime.startTurn(queueOrderSession.id, { text: "active", clientRequestId: "queue-order-active" });
  const queueA = await runtime.startTurn(queueOrderSession.id, { text: "A", clientRequestId: "queue-order-a" });
  const queueB = await runtime.startTurn(queueOrderSession.id, { text: "B", clientRequestId: "queue-order-b" });
  await runtime.movePendingInput(queueOrderSession.id, queueB.pending.id, "up");
  assert.deepEqual((await runtime.getSession(queueOrderSession.id)).pendingInputs.map((item) => item.input), ["B", "A"]);
  client.emit("notification", "turn/completed", {
    threadId: (await runtime.getSession(queueOrderSession.id)).providerThreadId,
    turn: { id: queueOrderFirst.turn.providerTurnId, status: "completed", items: [] },
  });
  await eventually(() => runtime.store.getActiveTurn(queueOrderSession.id)?.input === "B", "reordered queue did not dispatch the first visible item");
  const queuedAfterReorder = (await runtime.getSession(queueOrderSession.id)).pendingInputs[0];
  const activeAfterReorder = runtime.store.getActiveTurn(queueOrderSession.id);
  await runtime.promotePendingInput(queueOrderSession.id, queuedAfterReorder.id);
  assert(
    client.requests.some((entry) => entry.method === "turn/steer" && entry.params.expectedTurnId === activeAfterReorder.providerTurnId && entry.params.input[0].text === "A"),
    "promoting a Codex queue item did not steer the active turn"
  );
  assert.equal((await runtime.getSession(queueOrderSession.id)).pendingInputs.length, 0, "successfully promoted queue item remained pending");

  const revisionBeforeRestart = (await runtime.getSession(session.id)).revision;
  await runtime.restart();
  const replacement = clients.at(-1);
  replacement.turnSequence = 100;
  assert.notEqual(replacement, client, "runtime restart reused the stale client");
  assert.equal(runtime.store.listRemoteThreadCleanups().length, 0, "runtime restart did not drain the persisted remote cleanup");
  client.emit("notification", "item/agentMessage/delta", {
    threadId: (await runtime.getSession(session.id)).providerThreadId,
    turnId: active.providerTurnId,
    itemId: "stale",
    delta: "stale",
  });
  assert.equal((await runtime.getSession(session.id)).revision, revisionBeforeRestart, "stale client event mutated the recovered session");

  const clientBeforeCredentialChange = runtime.client;
  settings.providers.codex.connectionRevision += 1;
  settings.providers.codex.validationFingerprint = providerValidationFingerprint("codex", settings.providers.codex);
  const credentialClient = await runtime.ensureClient();
  credentialClient.turnSequence = 100;
  assert.notEqual(credentialClient, clientBeforeCredentialChange, "connection revision change reused the previous app-server client");

  const crashTurn = await runtime.startTurn(session.id, { text: "crash recovery", clientRequestId: "crash-request" });
  credentialClient.emit("server-request", {
    jsonrpc: "2.0",
    id: 82,
    method: "item/fileChange/requestApproval",
    params: { threadId: (await runtime.getSession(session.id)).providerThreadId, turnId: crashTurn.turn.providerTurnId, reason: "crash test" },
  });
  assert.equal((await runtime.getSession(session.id)).approvals.length, 1);
  credentialClient.emit("exit", { expected: false, generation: runtime.runtimeGeneration, error: new Error("forced crash") });
  const recoveredAfterCrash = await runtime.getSession(session.id);
  assert.equal(recoveredAfterCrash.status, "idle", "runtime crash did not restore the session to idle");
  assert.equal(recoveredAfterCrash.approvals.length, 0, "runtime crash left a stale approval visible");

  const events = runtime.store.getEventsAfter(session.id, 0);
  assert(events.length > 0 && events.every((event, index) => index === 0 || event.revision > events[index - 1].revision), "event revisions are not strictly increasing");
  assert(published.some((event) => event.type === "approval.requested"));

  const backup = await runtime.createBackup();
  assert(backup?.name && !Object.hasOwn(backup, "path"), "manual Agent backup leaked or omitted metadata");
  assert((await runtime.listBackups()).some((item) => item.name === backup.name), "created Agent backup was not listed");
  const afterBackup = await runtime.createSession({ title: "Created after backup" });
  assert(await runtime.getSession(afterBackup.id));
  await runtime.restoreBackup(backup.name);
  assert.equal(await runtime.getSession(afterBackup.id), null, "restoring a backup did not replace newer session state");
  assert(await runtime.getSession(session.id), "restoring a backup lost the captured session state");

  await runtime.restart({ start: false });
  const workingClientFactory = runtime.clientFactory;
  runtime.clientFactory = () => {
    const failing = new FakeCodexClient();
    failing.start = async () => { throw new Error("forced app-server startup failure"); };
    return failing;
  };
  const unavailableRuntime = await runtime.getRuntimeStatus({ start: true, refresh: true });
  assert.equal(unavailableRuntime.ready, false, "failed app-server startup was reported as ready");
  assert.equal(unavailableRuntime.providers.codex.ready, false, "failed Codex process left the provider ready");
  runtime.clientFactory = workingClientFactory;
  await runtime.restart();

  const pendingClient = runtime.client;
  runtime._bufferPendingNotification("unknown-thread", pendingClient, runtime.runtimeGeneration, "item/agentMessage/delta", { delta: "first" });
  const firstPendingBuffer = runtime.pendingNotifications.get("unknown-thread");
  await new Promise((resolve) => setTimeout(resolve, 800));
  runtime._bufferPendingNotification("unknown-thread", pendingClient, runtime.runtimeGeneration, "item/agentMessage/delta", { delta: "second" });
  const latestPendingBuffer = runtime.pendingNotifications.get("unknown-thread");
  assert.notEqual(latestPendingBuffer, firstPendingBuffer, "pending notification buffer did not advance its expiry identity");
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(runtime.pendingNotifications.get("unknown-thread"), latestPendingBuffer, "an older expiry timer removed newer pending notifications");
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(runtime.pendingNotifications.has("unknown-thread"), false, "pending notifications were not removed after their latest expiry");

  await runtime.shutdown();
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("[check-agent-runtime] ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
