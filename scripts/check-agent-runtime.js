const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");
const { AgentRuntime } = require("../src/backend/agent/agentRuntime");

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
        sandbox: params.sandbox,
      };
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

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-agent-runtime-"));
  const clients = [];
  const settings = {
    provider: "codex",
    cliPath: "",
    defaultModel: "gpt-test",
    reasoningEffort: "high",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    workspaceRoot: tempDir,
    queueWhileRunning: true,
    showReasoning: true,
  };
  let legacyCleared = false;
  const runtime = new AgentRuntime({
    databaseFile: path.join(tempDir, "agent.sqlite"),
    attachmentsDir: path.join(tempDir, "attachments"),
    appVersion: "test",
    settingsService: { async readAgentSettings() { return { ...settings }; } },
    permissionsService: {
      async readPermissionsStore() { return { allowedRoots: [tempDir] }; },
      async resolveAllowedExistingPath(value) {
        const resolved = path.resolve(value);
        if (resolved !== tempDir && !resolved.startsWith(`${tempDir}${path.sep}`)) throw new Error("Path is outside allowed roots");
        return resolved;
      },
    },
    legacySessionService: {
      async writeSessionStore(payload) {
        legacyCleared = Array.isArray(payload.sessions) && payload.sessions.length === 0;
      },
    },
    discoverExecutable: async () => ({ available: true, command: "fake-codex", version: "codex-cli test" }),
    clientFactory: () => {
      const client = new FakeCodexClient();
      clients.push(client);
      return client;
    },
  });

  const published = [];
  runtime.on("event", (event) => published.push(event));
  await runtime.initialize();
  assert.equal((await runtime.listSessions()).filter((item) => item.provider === "legacy").length, 0, "legacy sessions were retained");
  assert.equal(legacyCleared, true, "legacy JSON history was not retired");

  settings.workspaceRoot = path.dirname(tempDir);
  const invalidWorkspaceRuntime = await runtime.getRuntimeStatus({ start: true, refresh: true });
  assert.equal(invalidWorkspaceRuntime.workspaceValid, false, "invalid default workspace escaped runtime status validation");
  assert.match(invalidWorkspaceRuntime.error, /outside allowed roots/);
  settings.workspaceRoot = tempDir;

  const session = await runtime.createSession({ title: "Agent session" });
  const first = await runtime.startTurn(session.id, { text: "first", clientRequestId: "request-1" });
  assert.equal(first.turn.status, "running");
  assert.equal((await runtime.getSession(session.id)).status, "running");
  const client = clients[0];
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
  assert(fs.existsSync(cleanupAttachment.storedPath), "cleanup attachment was not stored");
  await runtime.deleteSession(cleanupSession.id);
  assert.equal(fs.existsSync(path.join(tempDir, "attachments", cleanupSession.id)), false, "session deletion left its attachment directory behind");

  const forked = await runtime.forkSession(titledSession.id);
  assert(forked.id !== titledSession.id, "fork did not create a distinct session");
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
  assert.equal((await runtime.getSession(queueFailureSession.id)).pendingInputs.length, 0);

  const revisionBeforeRestart = (await runtime.getSession(session.id)).revision;
  await runtime.restart();
  const replacement = clients.at(-1);
  replacement.turnSequence = 100;
  assert.notEqual(replacement, client, "runtime restart reused the stale client");
  client.emit("notification", "item/agentMessage/delta", {
    threadId: (await runtime.getSession(session.id)).providerThreadId,
    turnId: active.providerTurnId,
    itemId: "stale",
    delta: "stale",
  });
  assert.equal((await runtime.getSession(session.id)).revision, revisionBeforeRestart, "stale client event mutated the recovered session");

  const crashTurn = await runtime.startTurn(session.id, { text: "crash recovery", clientRequestId: "crash-request" });
  replacement.emit("server-request", {
    jsonrpc: "2.0",
    id: 82,
    method: "item/fileChange/requestApproval",
    params: { threadId: (await runtime.getSession(session.id)).providerThreadId, turnId: crashTurn.turn.providerTurnId, reason: "crash test" },
  });
  assert.equal((await runtime.getSession(session.id)).approvals.length, 1);
  replacement.emit("exit", { expected: false, generation: 1, error: new Error("forced crash") });
  const recoveredAfterCrash = await runtime.getSession(session.id);
  assert.equal(recoveredAfterCrash.status, "idle", "runtime crash did not restore the session to idle");
  assert.equal(recoveredAfterCrash.approvals.length, 0, "runtime crash left a stale approval visible");

  const events = runtime.store.getEventsAfter(session.id, 0);
  assert(events.length > 0 && events.every((event, index) => index === 0 || event.revision > events[index - 1].revision), "event revisions are not strictly increasing");
  assert(published.some((event) => event.type === "approval.requested"));

  await runtime.shutdown();
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("[check-agent-runtime] ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
