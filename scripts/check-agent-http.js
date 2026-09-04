const assert = require("assert");
const { EventEmitter } = require("events");
const express = require("express");
const { createAgentApiSecurity } = require("../src/backend/agent/agentApiSecurity");
const { createAgentRouter } = require("../src/backend/agent/agentRoutes");

class FakeRuntime extends EventEmitter {
  constructor() {
    super();
    this.store = {
      getEventsAfter: (_sessionId, revision) => revision < 1
        ? [{ sessionId: "session-1", revision: 1, type: "session.created", payload: {}, createdAt: 1 }]
        : [],
    };
  }

  async listSessions() {
    return [{ id: "session-1", revision: 1 }];
  }

  async getSession(sessionId) {
    return sessionId === "session-1" ? { id: sessionId, revision: 1 } : null;
  }

  async getRuntimeStatus(options) {
    return { ready: true, options };
  }

  async discoverProvider(provider) {
    return { provider, candidates: [{ path: "test-cli" }] };
  }

  async bindRuntime(provider, selectedPath) {
    return { ready: true, provider, selectedPath };
  }

  async listBackups() {
    return [{ name: "agent-sessions-test.sqlite", createdAt: 1, sizeBytes: 1024 }];
  }

  async createBackup() {
    return { name: "agent-sessions-test.sqlite", createdAt: 1, sizeBytes: 1024 };
  }

  async restoreBackup(name) {
    return [{ name, createdAt: 1, sizeBytes: 1024 }];
  }

  async retryTurn(sessionId, turnId) {
    return { retried: true, sessionId, turn: { id: turnId, status: "running" } };
  }
}

async function readUntil(reader, expected) {
  const decoder = new TextDecoder();
  let output = "";
  const deadline = Date.now() + 3000;
  while (!output.includes(expected) && Date.now() < deadline) {
    const result = await reader.read();
    if (result.done) break;
    output += decoder.decode(result.value, { stream: true });
  }
  return output;
}

async function main() {
  const runtime = new FakeRuntime();
  const connectionCalls = [];
  const connections = {
    async saveConnection(provider, input) {
      connectionCalls.push({ operation: "connection", provider, input });
      return { activeProvider: provider };
    },
    async refreshModels(provider) {
      connectionCalls.push({ operation: "models", provider });
      return { provider, models: [{ id: "test-model" }] };
    },
    async selectModel(provider, model) {
      connectionCalls.push({ operation: "select", provider, model });
      return { provider, model };
    },
    async testConnection(provider) {
      connectionCalls.push({ operation: "test", provider });
      return { provider, ready: true };
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/agent", createAgentRouter({ runtime, connections, security: createAgentApiSecurity() }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const rejectedBootstrap = await fetch(`${baseUrl}/api/agent/bootstrap`, {
      headers: { origin: "http://example.com", "sec-fetch-site": "cross-site" },
    });
    assert.equal(rejectedBootstrap.status, 403, "cross-origin bootstrap was accepted");

    const bootstrap = await fetch(`${baseUrl}/api/agent/bootstrap`);
    assert.equal(bootstrap.status, 200, "same-origin bootstrap failed");
    const cookie = bootstrap.headers.get("set-cookie");
    assert(cookie?.includes("HttpOnly") && cookie.includes("SameSite=Strict"), "capability cookie is missing security attributes");

    const unauthenticated = await fetch(`${baseUrl}/api/agent/sessions`);
    assert.equal(unauthenticated.status, 401, "Agent API accepted a request without its capability cookie");
    const authenticated = await fetch(`${baseUrl}/api/agent/sessions`, { headers: { cookie } });
    assert.equal(authenticated.status, 200, "Agent API rejected its capability cookie");
    assert.equal((await authenticated.json()).sessions.length, 1);

    const requestHeaders = { cookie, origin: baseUrl, "content-type": "application/json" };
    const runtimeResponse = await fetch(baseUrl + "/api/agent/runtime?start=1&refresh=1", { headers: requestHeaders });
    assert.deepEqual((await runtimeResponse.json()).runtime.options, { start: true, refresh: true });
    const discovery = await fetch(baseUrl + "/api/agent/providers/claude/runtime/refresh", { method: "POST", headers: requestHeaders });
    assert.equal((await discovery.json()).provider.provider, "claude");
    const binding = await fetch(baseUrl + "/api/agent/providers/claude/runtime", {
      method: "PUT", headers: requestHeaders, body: JSON.stringify({ path: "test-claude" }),
    });
    assert.equal((await binding.json()).runtime.selectedPath, "test-claude");
    await fetch(baseUrl + "/api/agent/providers/claude/connection", {
      method: "PUT", headers: requestHeaders, body: JSON.stringify({ baseUrl: "https://gateway.test", apiKeyAction: "keep" }),
    });
    await fetch(baseUrl + "/api/agent/providers/claude/models/refresh", { method: "POST", headers: requestHeaders });
    await fetch(baseUrl + "/api/agent/providers/claude/model", {
      method: "PUT", headers: requestHeaders, body: JSON.stringify({ model: "test-model" }),
    });
    await fetch(baseUrl + "/api/agent/providers/claude/test", { method: "POST", headers: requestHeaders });
    assert.deepEqual(connectionCalls.map((item) => item.operation), ["connection", "models", "select", "test"]);
    const backup = await fetch(baseUrl + "/api/agent/backups", { method: "POST", headers: requestHeaders });
    assert.equal(backup.status, 201);
    const backupList = await fetch(baseUrl + "/api/agent/backups", { headers: requestHeaders });
    assert.equal((await backupList.json()).backups.length, 1);
    const restore = await fetch(baseUrl + "/api/agent/backups/agent-sessions-test.sqlite/restore", { method: "POST", headers: requestHeaders });
    assert.equal((await restore.json()).sessions.length, 1);
    const retry = await fetch(baseUrl + "/api/agent/sessions/session-1/turns/turn-failed/retry", { method: "POST", headers: requestHeaders });
    const retryPayload = await retry.json();
    assert.equal(retry.status, 202, "failed turn retry route did not return an accepted response");
    assert.equal(retryPayload.turn.status, "running", "failed turn retry route did not return the replacement turn");

    const rejectedMutation = await fetch(`${baseUrl}/api/agent/sessions`, {
      method: "POST",
      headers: { cookie, origin: "http://example.com", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(rejectedMutation.status, 403, "cross-origin Agent mutation was accepted");

    const controller = new AbortController();
    const events = await fetch(`${baseUrl}/api/agent/sessions/session-1/events`, {
      headers: { cookie },
      signal: controller.signal,
    });
    assert.equal(events.status, 200, "SSE connection failed");
    const reader = events.body.getReader();
    const replay = await readUntil(reader, "event: ready");
    assert(replay.includes("id: 1") && replay.includes("event: agent-event"), "SSE did not replay persisted revisions before ready");
    runtime.emit("event", { sessionId: "session-1", revision: 2, type: "turn.started", payload: {}, createdAt: 2 });
    const live = await readUntil(reader, "id: 2");
    assert(live.includes("id: 2"), "SSE did not deliver a live revision");
    runtime.emit("shutdown");
    const closed = await reader.read();
    assert.equal(closed.done, true, "SSE remained open after runtime shutdown");
    controller.abort();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(runtime.listenerCount("event"), 0, "SSE event listener leaked after disconnect");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("[check-agent-http] security, Provider routes, backups, replay, and shutdown recovery passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
