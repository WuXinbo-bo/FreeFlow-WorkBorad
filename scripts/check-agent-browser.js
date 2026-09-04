"use strict";

const { chromium } = require("playwright");

const BASE_URL = process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:3000/?desktop=1";

function assert(condition, message, detail) {
  if (!condition) throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSession(id, title = "新会话") {
  const now = Date.now();
  return {
    id,
    provider: "codex",
    providerThreadId: "",
    title,
    preview: "",
    workspaceRoot: "D:\\FreeFlow-WorkBoard",
    model: "gpt-5.6-codex",
    reasoningEffort: "high",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    status: "idle",
    revision: 1,
    messages: [],
    turns: [],
    activities: [],
    approvals: [],
    pendingInputs: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  };
}

function summarize(session) {
  return {
    id: session.id,
    provider: session.provider,
    title: session.title,
    preview: session.preview,
    model: session.model,
    status: session.status,
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

async function main() {
  const state = {
    sessions: [],
    nextSession: 1,
    nextMessage: 1,
    nextTurn: 1,
    nextPending: 1,
    nextAttachment: 1,
    slowSessionId: "",
  };
  const runtime = {
    provider: "codex",
    activeProvider: "codex",
    available: true,
    ready: true,
    workspaceValid: true,
    state: "ready",
    version: "codex-cli test",
    models: [{ id: "gpt-5.6-codex", displayName: "GPT-5.6 Codex" }],
    providers: {
      codex: {
        provider: "codex", available: true, configured: true, modelSelected: true, modelValidated: true,
        ready: true, selectedModel: "gpt-5.6-codex", candidates: [], version: "codex-cli test", error: "",
      },
      claude: {
        provider: "claude", available: false, configured: false, modelSelected: false, modelValidated: false,
        ready: false, selectedModel: "", candidates: [], version: "", error: "未找到 Claude Code",
      },
    },
    settings: {
      schemaVersion: 2,
      activeProvider: "codex",
      workspaceRoot: "D:\\FreeFlow-WorkBoard",
      providers: {
        codex: { provider: "codex", selectedModel: "gpt-5.6-codex", reasoningEffort: "high", approvalPolicy: "on-request", sandboxMode: "workspace-write" },
        claude: { provider: "claude", selectedModel: "", reasoningEffort: "high", approvalPolicy: "on-request", sandboxMode: "workspace-write" },
      },
      queueWhileRunning: true,
      showReasoning: true,
    },
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("ai_worker_sessions_v2", JSON.stringify({ stale: true }));
    localStorage.setItem("ai_worker_current_session_v2", "legacy");
    localStorage.setItem("ai_worker_agent_mode_v1", "true");
    localStorage.setItem("ai_worker_output_mode_v1", "stream");
    window.desktopShell = {
      getPathForFile(file) {
        return `D:\\FreeFlow-WorkBoard\\${file.name}`;
      },
    };
    class FakeEventSource {
      static instances = [];

      constructor(url) {
        this.url = String(url);
        this.listeners = new Map();
        this.closed = false;
        FakeEventSource.instances.push(this);
        setTimeout(() => this.emit("ready", { revision: 0 }), 0);
      }

      addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      emit(type, payload) {
        if (this.closed) return;
        const event = { data: JSON.stringify(payload) };
        for (const listener of this.listeners.get(type) || []) listener(event);
      }

      close() {
        this.closed = true;
      }
    }
    window.EventSource = FakeEventSource;
    window.__emitAgentEvent = (sessionId, event) => {
      for (const source of FakeEventSource.instances) {
        if (!source.closed && source.url.includes(`/sessions/${encodeURIComponent(sessionId)}/events`)) {
          source.emit("agent-event", event);
        }
      }
    };
    window.__disconnectAgent = (sessionId) => {
      for (const source of FakeEventSource.instances) {
        if (!source.closed && source.url.includes(`/sessions/${encodeURIComponent(sessionId)}/events`)) {
          source.onerror?.(new Event("error"));
        }
      }
    };
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept(dialog.message().includes("编辑排队消息") ? "编辑后的排队消息" : undefined));

  await page.route("**/api/agent/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const relative = decodeURIComponent(url.pathname.slice("/api/agent".length));
    const method = request.method();
    const send = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (relative === "/bootstrap") return send({ ok: true });
    if (relative === "/runtime" && method === "GET") return send({ ok: true, runtime });
    if (relative === "/sessions" && method === "GET") {
      return send({ ok: true, sessions: state.sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt).map(summarize) });
    }
    if (relative === "/sessions" && method === "POST") {
      const created = createSession(`session-${state.nextSession++}`);
      state.sessions.unshift(created);
      return send({ ok: true, session: clone(created) }, 201);
    }
    const sessionMatch = relative.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const session = state.sessions.find((item) => item.id === sessionMatch[1]);
      if (!session) return send({ ok: false, error: "会话不存在" }, 404);
      if (method === "GET") {
        if (state.slowSessionId === session.id) await new Promise((resolve) => setTimeout(resolve, 180));
        return send({ ok: true, session: clone(session) });
      }
      if (method === "PATCH") {
        session.title = request.postDataJSON().title;
        session.updatedAt = Date.now();
        session.revision += 1;
        return send({ ok: true, session: summarize(session) });
      }
      if (method === "DELETE") {
        state.sessions = state.sessions.filter((item) => item.id !== session.id);
        return send({ ok: true, deleted: true });
      }
    }
    const forkMatch = relative.match(/^\/sessions\/([^/]+)\/fork$/);
    if (forkMatch && method === "POST") {
      const source = state.sessions.find((item) => item.id === forkMatch[1]);
      const created = createSession(`session-${state.nextSession++}`, `${source.title} 分支`);
      created.messages = clone(source.messages);
      created.preview = source.preview;
      state.sessions.unshift(created);
      return send({ ok: true, session: clone(created) }, 201);
    }
    const turnMatch = relative.match(/^\/sessions\/([^/]+)\/turns$/);
    if (turnMatch && method === "POST") {
      const session = state.sessions.find((item) => item.id === turnMatch[1]);
      const input = request.postDataJSON();
      if (session.status !== "idle") {
        if (input.mode === "steer") {
          session.activities.push({ id: `activity-${session.revision}`, type: "activity", payload: { activityType: "steer", summary: input.text }, createdAt: Date.now() });
          session.revision += 1;
          return send({ ok: true, steered: true }, 202);
        }
        const now = Date.now();
        session.pendingInputs.push({
          id: "pending-" + state.nextPending++,
          input: input.text,
          mode: input.mode === "steer" ? "steer" : "queue",
          status: "queued",
          revision: 0,
          position: session.pendingInputs.length + 1,
          createdAt: now,
          updatedAt: now,
        });
        session.revision += 1;
        return send({ ok: true, queued: true }, 202);
      }
      const now = Date.now();
      const turnId = `turn-${state.nextTurn++}`;
      session.status = "running";
      session.preview = input.text;
      session.messages.push({ id: `message-${state.nextMessage++}`, role: "user", content: input.text, turnId, createdAt: now });
      session.messages.push({ id: `message-${state.nextMessage++}`, role: "assistant", content: "", turnId, createdAt: now + 1 });
      session.turns.push({ id: turnId, status: "running", createdAt: now });
      session.updatedAt = now;
      session.revision += 1;
      return send({ ok: true, turn: clone(session.turns.at(-1)) }, 202);
    }
    const interruptMatch = relative.match(/^\/sessions\/([^/]+)\/interrupt$/);
    if (interruptMatch && method === "POST") {
      const session = state.sessions.find((item) => item.id === interruptMatch[1]);
      session.status = "idle";
      const turn = session.turns.at(-1);
      if (turn) turn.status = "interrupted";
      const assistant = session.messages.findLast((item) => item.role === "assistant" && item.turnId === turn?.id);
      if (assistant && !assistant.content) assistant.content = "已停止当前任务。";
      session.revision += 1;
      return send({ ok: true, interrupted: true });
    }
    const queueMatch = relative.match(/^\/sessions\/([^/]+)\/queue\/([^/]+)$/);
    if (queueMatch && ["DELETE", "PATCH"].includes(method)) {
      const session = state.sessions.find((item) => item.id === queueMatch[1]);
      const pending = session.pendingInputs.find((item) => item.id === queueMatch[2]);
      if (method === "DELETE") session.pendingInputs = session.pendingInputs.filter((item) => item.id !== queueMatch[2]);
      else {
        const input = request.postDataJSON();
        if (Number(input.revision) !== Number(pending.revision)) return send({ ok: false, code: "QUEUE_REVISION_CONFLICT", error: "排队消息已更新" }, 409);
        pending.input = input.text;
        pending.status = "queued";
        pending.error = null;
        pending.revision += 1;
        pending.updatedAt = Date.now();
      }
      session.revision += 1;
      return send(method === "DELETE" ? { ok: true, removed: true } : { ok: true, pending: clone(pending) });
    }
    const queueActionMatch = relative.match(/^\/sessions\/([^/]+)\/queue\/([^/]+)\/(move|promote|retry)$/);
    if (queueActionMatch && method === "POST") {
      const session = state.sessions.find((item) => item.id === queueActionMatch[1]);
      const pending = session.pendingInputs.find((item) => item.id === queueActionMatch[2]);
      const operation = queueActionMatch[3];
      if (operation === "move") {
        const current = session.pendingInputs.indexOf(pending);
        const target = request.postDataJSON().direction === "up" ? current - 1 : current + 1;
        if (target >= 0 && target < session.pendingInputs.length) {
          [session.pendingInputs[current], session.pendingInputs[target]] = [session.pendingInputs[target], session.pendingInputs[current]];
          session.pendingInputs.forEach((item, index) => { item.position = index + 1; item.revision += 1; });
        }
      }
      if (operation === "promote") {
        session.pendingInputs.forEach((item) => { item.mode = item === pending ? "steer" : "queue"; item.revision += 1; });
        session.pendingInputs = [pending, ...session.pendingInputs.filter((item) => item !== pending)];
      }
      if (operation === "retry") {
        pending.status = "queued";
        pending.error = null;
        pending.revision += 1;
      }
      session.revision += 1;
      return send({ ok: true, pending: clone(pending) });
    }
    const attachmentCreateMatch = relative.match(/^\/sessions\/([^/]+)\/attachments$/);
    if (attachmentCreateMatch && method === "POST") {
      const session = state.sessions.find((item) => item.id === attachmentCreateMatch[1]);
      const input = request.postDataJSON();
      const attachment = { id: `attachment-${state.nextAttachment++}`, name: input.name, mimeType: input.mimeType, sizeBytes: 12, createdAt: Date.now() };
      session.attachments.push(attachment);
      session.revision += 1;
      return send({ ok: true, attachment }, 201);
    }
    const attachmentDeleteMatch = relative.match(/^\/sessions\/([^/]+)\/attachments\/([^/]+)$/);
    if (attachmentDeleteMatch && method === "DELETE") {
      const session = state.sessions.find((item) => item.id === attachmentDeleteMatch[1]);
      session.attachments = session.attachments.filter((item) => item.id !== attachmentDeleteMatch[2]);
      session.revision += 1;
      return send({ ok: true, removed: true });
    }
    const approvalMatch = relative.match(/^\/approvals\/([^/]+)\/resolve$/);
    if (approvalMatch && method === "POST") {
      const session = state.sessions.find((item) => item.approvals.some((approval) => approval.id === approvalMatch[1]));
      session.approvals = session.approvals.filter((approval) => approval.id !== approvalMatch[1]);
      session.status = "idle";
      session.revision += 1;
      return send({ ok: true, response: request.postDataJSON() });
    }
    return send({ ok: false, error: `unhandled fake Agent route ${method} ${relative}` }, 500);
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.body.classList.contains("app-booting"), null, { timeout: 15_000 });
    await page.waitForFunction(() => document.querySelector("#conversation-mode-pill")?.textContent.includes("就绪"));
    await page.locator("#restore-right-pane-btn").evaluate((button) => {
      if (!button.classList.contains("is-hidden")) button.click();
    });
    await page.locator('[data-right-panel-view="assistant"]').first().evaluate((button) => button.click());
    await page.locator("#prompt-input").waitFor({ state: "visible" });
    assert(state.sessions.length === 1, "empty Agent store did not create a replacement session", state.sessions);
    const initial = state.sessions[0];
    const legacyState = await page.evaluate(() => ({
      sessions: localStorage.getItem("ai_worker_sessions_v2"),
      current: localStorage.getItem("ai_worker_current_session_v2"),
      mode: localStorage.getItem("ai_worker_agent_mode_v1"),
      output: localStorage.getItem("ai_worker_output_mode_v1"),
      oldHistoryHidden: document.querySelector('[data-sidebar-section="sessions"]')?.classList.contains("is-hidden"),
    }));
    assert(Object.values(legacyState).every((value) => value === null || value === true), "legacy browser history was retained", legacyState);

    await page.locator("#prompt-input").fill("分析当前工作区");
    await page.locator("#chat-form").evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => !document.querySelector("#stop-btn")?.disabled);
    assert((await page.locator(".agent-message.is-user").last().textContent()).includes("分析当前工作区"), "user turn was not rendered");

    const firstTurn = initial.turns.at(-1);
    initial.messages.find((item) => item.role === "assistant" && item.turnId === firstTurn.id).content = "分析已经完成。";
    firstTurn.status = "completed";
    initial.status = "idle";
    initial.revision += 1;
    await page.evaluate((event) => window.__emitAgentEvent(event.sessionId, event), { sessionId: initial.id, revision: initial.revision, type: "turn.completed", payload: {}, createdAt: Date.now() });
    await page.waitForFunction(() => document.querySelector("#chat-log")?.textContent.includes("分析已经完成") && document.querySelector("#stop-btn")?.disabled);

    await page.locator("#prompt-input").fill("启动第二个任务");
    await page.locator("#chat-form").evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => !document.querySelector("#stop-btn")?.disabled);
    await page.locator("#stop-btn").click();
    await page.waitForFunction(() => document.querySelector("#stop-btn")?.disabled && !document.querySelector("#send-btn")?.disabled);
    await page.locator("#prompt-input").fill("停止后立即重发");
    await page.locator("#chat-form").evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelector("#chat-log")?.textContent.includes("停止后立即重发"));

    await page.locator("#prompt-input").fill("排队消息 A");
    await page.locator("#agent-submit-mode").selectOption("queue");
    await page.locator("#chat-form").evaluate((form) => form.requestSubmit());
    await page.locator("#prompt-input").fill("排队消息 B");
    await page.locator("#chat-form").evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll(".agent-queue").length === 2);
    await page.locator('[data-agent-queue-action="up"]').last().click();
    await page.waitForFunction(() => document.querySelector(".agent-queue p")?.textContent.includes("排队消息 B"));
    await page.locator('[data-agent-queue-action="edit"]').first().click();
    await page.waitForFunction(() => document.querySelector(".agent-queue p")?.textContent.includes("编辑后的排队消息"));
    await page.locator('[data-agent-queue-action="promote"]').first().click();
    await page.waitForFunction(() => document.querySelector(".agent-queue strong")?.textContent.includes("即时引导"));
    const failedPending = initial.pendingInputs[0];
    failedPending.status = "failed";
    failedPending.error = { message: "模拟派发失败", recoverable: true };
    failedPending.revision += 1;
    initial.revision += 1;
    await page.evaluate((event) => window.__emitAgentEvent(event.sessionId, event), { sessionId: initial.id, revision: initial.revision, type: "queue.failed", payload: {}, createdAt: Date.now() });
    await page.waitForFunction(() => document.querySelector(".agent-queue.is-failed")?.textContent.includes("模拟派发失败"));
    await page.locator('[data-agent-queue-action="retry"]').click();
    await page.waitForFunction(() => !document.querySelector(".agent-queue.is-failed"));
    await page.locator('[data-agent-queue-action="remove"]').first().click();
    await page.waitForFunction(() => document.querySelectorAll(".agent-queue").length === 1);
    await page.locator('[data-agent-queue-action="remove"]').click();
    await page.waitForFunction(() => !document.querySelector(".agent-queue"));

    const activeTurn = initial.turns.at(-1);
    activeTurn.status = "waitingApproval";
    initial.status = "waitingApproval";
    initial.approvals.push({ id: "approval-1", method: "item/commandExecution/requestApproval", params: { command: "npm test" }, status: "pending", createdAt: Date.now() });
    initial.revision += 1;
    await page.evaluate((event) => window.__emitAgentEvent(event.sessionId, event), { sessionId: initial.id, revision: initial.revision, type: "approval.requested", payload: {}, createdAt: Date.now() });
    await page.waitForSelector(".agent-approval");
    await page.locator('[data-agent-approval-decision="accept"]').click();
    await page.waitForFunction(() => !document.querySelector(".agent-approval") && document.querySelector("#conversation-mode-pill")?.textContent.includes("就绪"));

    await page.locator("#agent-file-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await page.waitForFunction(() => document.querySelector(".composer-attachment-chip")?.textContent.includes("notes.txt"));
    await page.locator("[data-agent-remove-attachment]").click();
    await page.waitForFunction(() => !document.querySelector("[data-agent-attachment]"));

    const newButtonState = await page.evaluate(() => {
      const panel = document.querySelector(".conversation-panel");
      const button = document.querySelector("#clear-btn");
      const rect = button.getBoundingClientRect();
      return {
        panelClass: panel.className,
        buttonDisplay: getComputedStyle(button).display,
        buttonVisibility: getComputedStyle(button).visibility,
        buttonRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      };
    });
    assert(newButtonState.buttonRect.width > 0 && newButtonState.buttonRect.height > 0, "new-session control disappeared", newButtonState);
    await page.locator("#clear-btn").click();
    await page.waitForFunction(() => document.querySelector("#conversation-title")?.textContent === "新会话" && document.querySelectorAll(".agent-history-item").length >= 0);
    const second = state.sessions[0];
    second.title = "第二会话";
    second.updatedAt = Date.now() + 10;
    second.revision += 1;
    await page.evaluate((event) => window.__emitAgentEvent(event.sessionId, event), { sessionId: second.id, revision: second.revision, type: "session.renamed", payload: {}, createdAt: Date.now() });
    await page.waitForFunction(() => document.querySelector("#conversation-title")?.textContent === "第二会话");
    await page.locator("#agent-fork-session-btn").click();
    await page.waitForFunction(() => document.querySelector("#conversation-title")?.textContent.includes("分支"));
    const forked = state.sessions[0];

    await page.locator("#agent-history-toggle-btn").click();
    await page.waitForFunction(() => !document.querySelector("#agent-history-panel")?.classList.contains("is-hidden"));
    state.slowSessionId = initial.id;
    await page.evaluate(({ slowId, fastId }) => {
      document.querySelector(`[data-agent-session="${slowId}"]`)?.click();
      document.querySelector(`[data-agent-session="${fastId}"]`)?.click();
    }, { slowId: initial.id, fastId: second.id });
    await page.waitForFunction((title) => document.querySelector("#conversation-title")?.textContent === title, second.title);
    await page.waitForTimeout(240);
    assert((await page.locator("#conversation-title").textContent()) === second.title, "stale session load replaced the latest selection");
    state.slowSessionId = "";

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.body.classList.contains("app-booting"), null, { timeout: 15_000 });
    await page.waitForFunction((title) => document.querySelector("#conversation-title")?.textContent === title, second.title);
    const refreshLayoutState = await page.evaluate(() => {
      const panel = document.querySelector(".conversation-panel");
      const button = document.querySelector("#agent-history-toggle-btn");
      const rect = button.getBoundingClientRect();
      return { panelClass: panel.className, width: rect.width, height: rect.height };
    });
    assert(refreshLayoutState.panelClass.includes("assistant-view-active"), "refresh did not restore the active assistant view", refreshLayoutState);
    if (refreshLayoutState.width === 0) {
      await page.locator("#restore-right-pane-btn").evaluate((button) => button.click());
      await page.locator("#agent-history-toggle-btn").waitFor({ state: "visible" });
    }

    while (state.sessions.length > 1) {
      const before = state.sessions.length;
      if (await page.locator("#agent-history-panel").evaluate((element) => element.classList.contains("is-hidden"))) {
        await page.locator("#agent-history-toggle-btn").click();
      }
      await page.waitForFunction(() => !document.querySelector("#agent-history-panel")?.classList.contains("is-hidden"));
      const nonCurrent = state.sessions.find((item) => item.id !== second.id) || state.sessions[0];
      await page.locator(`[data-agent-delete-session="${nonCurrent.id}"]`).click();
      await page.waitForFunction((count) => document.querySelectorAll("[data-agent-session]").length === count, before - 1);
    }
    if (await page.locator("#agent-history-panel").evaluate((element) => element.classList.contains("is-hidden"))) {
      await page.locator("#agent-history-toggle-btn").click();
    }
    const lastId = state.sessions[0].id;
    await page.locator(`[data-agent-delete-session="${lastId}"]`).click();
    await page.waitForFunction(() => document.querySelector("#conversation-title")?.textContent === "新会话");
    assert(state.sessions.length === 1 && state.sessions[0].id !== lastId, "deleting the last session did not recover with a new session", state.sessions);

    const current = state.sessions[0];
    current.activities.push({ id: "activity-long", type: "activity", payload: { activityType: "commandExecution", status: "completed", item: { command: `node ${"very-long-segment/".repeat(30)}` } }, createdAt: Date.now() });
    current.revision += 1;
    await page.evaluate((event) => window.__emitAgentEvent(event.sessionId, event), { sessionId: current.id, revision: current.revision, type: "activity", payload: {}, createdAt: Date.now() });
    await page.waitForSelector(".agent-activity");
    await page.setViewportSize({ width: 680, height: 720 });
    await page.waitForTimeout(120);
    const layout = await page.evaluate(() => {
      const panel = document.querySelector(".conversation-panel").getBoundingClientRect();
      const thread = document.querySelector("#thread-viewport").getBoundingClientRect();
      const composer = document.querySelector("#chat-form").getBoundingClientRect();
      const prompt = document.querySelector("#prompt-input");
      const activity = document.querySelector(".agent-activity pre")?.getBoundingClientRect();
      return { panel, thread, composer, activity, promptOverflow: prompt.scrollHeight - prompt.clientHeight, horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert(layout.thread.bottom <= layout.composer.top + 1 && layout.composer.bottom <= layout.panel.bottom + 1 && (!layout.activity || layout.activity.right <= layout.panel.right + 1) && layout.promptOverflow <= 1 && layout.horizontalOverflow <= 1, "compact Agent layout overlaps or overflows", layout);
    assert(pageErrors.length === 0, "Agent interactions caused page errors", pageErrors);
    assert(forked.id !== second.id, "fork did not create a distinct session");
  } finally {
    await context.close();
    await browser.close();
  }

  console.log("[check-agent-browser] Provider lifecycle, queue recovery, approval, attachment, and layout paths passed");
}

main().catch((error) => {
  console.error(`[check-agent-browser] ${error.stack || error.message}`);
  process.exitCode = 1;
});
