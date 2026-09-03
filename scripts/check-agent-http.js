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
  const app = express();
  app.use(express.json());
  app.use("/api/agent", createAgentRouter({ runtime, security: createAgentApiSecurity() }));
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
  console.log("[check-agent-http] security, replay, live delivery, and shutdown recovery passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
