const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

function now() {
  return Date.now();
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function toBoolean(value) {
  return Number(value) === 1;
}

function titleFromInput(value) {
  return String(value || "")
    .replace(/[`*_#>\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36) || "新会话";
}

class AgentStore {
  constructor(databaseFile) {
    this.databaseFile = path.resolve(databaseFile);
    this.db = null;
  }

  open() {
    if (this.db) return this;
    fs.mkdirSync(path.dirname(this.databaseFile), { recursive: true });
    this.db = new DatabaseSync(this.databaseFile);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT 'codex',
        provider_thread_id TEXT,
        title TEXT NOT NULL,
        workspace_root TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT '',
        reasoning_effort TEXT NOT NULL DEFAULT '',
        approval_policy TEXT NOT NULL DEFAULT 'on-request',
        sandbox_mode TEXT NOT NULL DEFAULT 'workspace-write',
        status TEXT NOT NULL DEFAULT 'idle',
        revision INTEGER NOT NULL DEFAULT 0,
        legacy_source_id TEXT UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_thread_idx
        ON agent_sessions(provider, provider_thread_id) WHERE provider_thread_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS agent_turns (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        provider_turn_id TEXT,
        client_request_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        input_text TEXT NOT NULL,
        error_json TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS agent_turns_session_idx ON agent_turns(session_id, created_at);
      CREATE TABLE IF NOT EXISTS agent_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        turn_id TEXT REFERENCES agent_turns(id) ON DELETE SET NULL,
        provider_item_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(session_id, provider_item_id)
      );
      CREATE INDEX IF NOT EXISTS agent_messages_session_idx ON agent_messages(session_id, created_at);
      CREATE TABLE IF NOT EXISTS agent_pending_inputs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        client_request_id TEXT NOT NULL UNIQUE,
        input_text TEXT NOT NULL,
        attachments_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS agent_pending_session_idx ON agent_pending_inputs(session_id, created_at);
      CREATE TABLE IF NOT EXISTS agent_approvals (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        turn_id TEXT REFERENCES agent_turns(id) ON DELETE SET NULL,
        provider_request_id TEXT NOT NULL,
        method TEXT NOT NULL,
        params_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        response_json TEXT,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS agent_attachments (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT '',
        source_path TEXT NOT NULL DEFAULT '',
        stored_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_events (
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(session_id, revision)
      );
      CREATE TABLE IF NOT EXISTS agent_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    return this;
  }

  close() {
    this.db?.close();
    this.db = null;
  }

  getMeta(key, fallback = "") {
    const row = this.db.prepare("SELECT value FROM agent_meta WHERE key = ?").get(String(key));
    return row ? row.value : fallback;
  }

  setMeta(key, value) {
    this.db.prepare("INSERT INTO agent_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(String(key), String(value));
  }

  recoverOrphanedState(message = "FreeFlow restarted before this task completed") {
    const sessions = this.db.prepare(
      "SELECT id FROM agent_sessions WHERE status IN ('starting','running','waitingApproval','interrupting')"
    ).all();
    const events = [];
    for (const session of sessions) {
      const event = this.commit(session.id, "runtime.recovered", { message }, (db) => {
        const completedAt = now();
        db.prepare(`
          UPDATE agent_turns SET status = 'failed', error_json = ?, completed_at = ?
          WHERE session_id = ? AND status IN ('starting','running','waitingApproval','interrupting')
        `).run(JSON.stringify({ message, recoverable: true }), completedAt, session.id);
        db.prepare("UPDATE agent_approvals SET status = 'dismissed', resolved_at = ? WHERE session_id = ? AND status = 'pending'")
          .run(completedAt, session.id);
        db.prepare("UPDATE agent_sessions SET status = 'idle' WHERE id = ?").run(session.id);
      });
      events.push(event);
    }
    return events;
  }

  deleteLegacySessions() {
    return Number(this.db.prepare("DELETE FROM agent_sessions WHERE provider = 'legacy'").run().changes || 0);
  }

  _transaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  _insertEvent(sessionId, type, payload = {}) {
    this.db.prepare("UPDATE agent_sessions SET revision = revision + 1, updated_at = ? WHERE id = ?").run(now(), sessionId);
    const row = this.db.prepare("SELECT revision FROM agent_sessions WHERE id = ?").get(sessionId);
    if (!row) throw new Error("Agent session not found");
    const event = { sessionId, revision: Number(row.revision), type, payload, createdAt: now() };
    this.db.prepare(
      "INSERT INTO agent_events(session_id, revision, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(sessionId, event.revision, type, JSON.stringify(payload), event.createdAt);
    return event;
  }

  commit(sessionId, type, payload = {}, mutation = null) {
    return this._transaction(() => {
      mutation?.(this.db);
      return this._insertEvent(sessionId, type, payload);
    });
  }

  createSession(input = {}) {
    const id = input.id || crypto.randomUUID();
    const createdAt = Number(input.createdAt) || now();
    const row = {
      id,
      provider: input.provider || "codex",
      providerThreadId: input.providerThreadId || null,
      title: String(input.title || "新会话").trim().slice(0, 80) || "新会话",
      workspaceRoot: String(input.workspaceRoot || process.cwd()).trim(),
      model: String(input.model || "").trim(),
      reasoningEffort: String(input.reasoningEffort || "").trim(),
      approvalPolicy: String(input.approvalPolicy || "on-request").trim(),
      sandboxMode: String(input.sandboxMode || "workspace-write").trim(),
      status: input.status || "idle",
      legacySourceId: input.legacySourceId || null,
      createdAt,
    };
    const event = this._transaction(() => {
      this.db.prepare(`
        INSERT INTO agent_sessions(
          id, provider, provider_thread_id, title, workspace_root, model, reasoning_effort,
          approval_policy, sandbox_mode, status, revision, legacy_source_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `).run(
        row.id, row.provider, row.providerThreadId, row.title, row.workspaceRoot, row.model,
        row.reasoningEffort, row.approvalPolicy, row.sandboxMode, row.status,
        row.legacySourceId, row.createdAt, row.createdAt
      );
      return this._insertEvent(id, "session.created", { session: row });
    });
    return { session: this.getSessionSummary(id), event };
  }

  getSessionSummary(sessionId) {
    const row = this.db.prepare(`
      SELECT s.*,
        (SELECT content FROM agent_messages m WHERE m.session_id = s.id ORDER BY m.created_at DESC LIMIT 1) AS preview,
        (SELECT COUNT(*) FROM agent_pending_inputs p WHERE p.session_id = s.id) AS pending_count
      FROM agent_sessions s WHERE s.id = ?
    `).get(sessionId);
    return row ? this._mapSession(row) : null;
  }

  listSessions() {
    return this.db.prepare(`
      SELECT s.*,
        (SELECT content FROM agent_messages m WHERE m.session_id = s.id ORDER BY m.created_at DESC LIMIT 1) AS preview,
        (SELECT COUNT(*) FROM agent_pending_inputs p WHERE p.session_id = s.id) AS pending_count
      FROM agent_sessions s ORDER BY s.updated_at DESC
    `).all().map((row) => this._mapSession(row));
  }

  _mapSession(row) {
    return {
      id: row.id,
      provider: row.provider,
      providerThreadId: row.provider_thread_id || "",
      title: row.title,
      workspaceRoot: row.workspace_root,
      model: row.model,
      reasoningEffort: row.reasoning_effort,
      approvalPolicy: row.approval_policy,
      sandboxMode: row.sandbox_mode,
      status: row.status,
      revision: Number(row.revision),
      legacySourceId: row.legacy_source_id || "",
      preview: row.preview || "",
      pendingCount: Number(row.pending_count || 0),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  getSession(sessionId) {
    const session = this.getSessionSummary(sessionId);
    if (!session) return null;
    const messages = this.db.prepare("SELECT * FROM agent_messages WHERE session_id = ? ORDER BY created_at, rowid").all(sessionId).map((row) => ({
      id: row.id, turnId: row.turn_id || "", providerItemId: row.provider_item_id || "", role: row.role,
      content: row.content, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    }));
    const turns = this.db.prepare("SELECT * FROM agent_turns WHERE session_id = ? ORDER BY created_at").all(sessionId).map((row) => ({
      id: row.id, providerTurnId: row.provider_turn_id || "", clientRequestId: row.client_request_id,
      status: row.status, input: row.input_text, error: parseJson(row.error_json, null), createdAt: Number(row.created_at),
      startedAt: Number(row.started_at || 0), completedAt: Number(row.completed_at || 0),
    }));
    const approvals = this.db.prepare("SELECT * FROM agent_approvals WHERE session_id = ? AND status = 'pending' ORDER BY created_at").all(sessionId).map((row) => ({
      id: row.id, turnId: row.turn_id || "", providerRequestId: row.provider_request_id, method: row.method,
      params: parseJson(row.params_json, {}), status: row.status, createdAt: Number(row.created_at),
    }));
    const pendingInputs = this.db.prepare("SELECT * FROM agent_pending_inputs WHERE session_id = ? ORDER BY created_at").all(sessionId).map((row) => ({
      id: row.id, clientRequestId: row.client_request_id, input: row.input_text,
      attachments: parseJson(row.attachments_json, []), createdAt: Number(row.created_at),
    }));
    const activities = this.db.prepare(`
      SELECT revision, type, payload_json, created_at FROM agent_events
      WHERE session_id = ? AND type NOT IN ('message.delta', 'message.completed')
      ORDER BY revision DESC LIMIT 250
    `).all(sessionId).reverse().map((row) => this._mapEvent(sessionId, row));
    const attachments = this.getAttachments(sessionId);
    return { ...session, messages, turns, approvals, pendingInputs, activities, attachments };
  }

  getEventsAfter(sessionId, revision = 0, limit = 1000) {
    return this.db.prepare(`
      SELECT revision, type, payload_json, created_at FROM agent_events
      WHERE session_id = ? AND revision > ? ORDER BY revision LIMIT ?
    `).all(sessionId, Math.max(0, Number(revision) || 0), Math.min(2000, Math.max(1, Number(limit) || 1000)))
      .map((row) => this._mapEvent(sessionId, row));
  }

  _mapEvent(sessionId, row) {
    return { sessionId, revision: Number(row.revision), type: row.type, payload: parseJson(row.payload_json, {}), createdAt: Number(row.created_at) };
  }

  findSessionByThread(providerThreadId) {
    const row = this.db.prepare("SELECT id FROM agent_sessions WHERE provider = 'codex' AND provider_thread_id = ?").get(providerThreadId);
    return row ? this.getSessionSummary(row.id) : null;
  }

  renameSession(sessionId, title) {
    const nextTitle = String(title || "").trim().slice(0, 80);
    if (!nextTitle) throw new Error("Session title is required");
    return this.commit(sessionId, "session.renamed", { title: nextTitle }, (db) => {
      db.prepare("UPDATE agent_sessions SET title = ? WHERE id = ?").run(nextTitle, sessionId);
    });
  }

  deleteSession(sessionId) {
    const result = this.db.prepare("DELETE FROM agent_sessions WHERE id = ?").run(sessionId);
    return Number(result.changes || 0) > 0;
  }

  bindThread(sessionId, threadId, settings = {}) {
    return this.commit(sessionId, "session.thread-bound", { threadId, provider: "codex" }, (db) => {
      db.prepare(`
        UPDATE agent_sessions SET provider = 'codex', provider_thread_id = ?, workspace_root = ?, model = ?,
          reasoning_effort = ?, approval_policy = ?, sandbox_mode = ?, status = 'idle' WHERE id = ?
      `).run(threadId, settings.workspaceRoot, settings.model || "", settings.reasoningEffort || "", settings.approvalPolicy, settings.sandboxMode, sessionId);
    });
  }

  createTurn(sessionId, input = {}) {
    const id = crypto.randomUUID();
    const messageId = input.messageId || crypto.randomUUID();
    const createdAt = now();
    const currentTitle = this.db.prepare("SELECT title FROM agent_sessions WHERE id = ?").get(sessionId)?.title || "";
    const title = currentTitle === "新会话" ? titleFromInput(input.text) : currentTitle;
    const payload = { turnId: id, messageId, input: input.text, clientRequestId: input.clientRequestId, title };
    const event = this.commit(sessionId, "turn.created", payload, (db) => {
      db.prepare(`INSERT INTO agent_turns(id, session_id, client_request_id, status, input_text, created_at) VALUES (?, ?, ?, 'starting', ?, ?)`)
        .run(id, sessionId, input.clientRequestId, input.text, createdAt);
      db.prepare(`INSERT INTO agent_messages(id, session_id, turn_id, role, content, created_at, updated_at) VALUES (?, ?, ?, 'user', ?, ?, ?)`)
        .run(messageId, sessionId, id, input.text, createdAt, createdAt);
      db.prepare("UPDATE agent_sessions SET status = 'starting' WHERE id = ?").run(sessionId);
      if (currentTitle === "新会话") db.prepare("UPDATE agent_sessions SET title = ? WHERE id = ?").run(title, sessionId);
    });
    return { turn: { id, sessionId, clientRequestId: input.clientRequestId, status: "starting", input: input.text, createdAt }, event };
  }

  findTurnByClientRequestId(sessionId, clientRequestId) {
    const row = this.db.prepare("SELECT * FROM agent_turns WHERE session_id = ? AND client_request_id = ? LIMIT 1")
      .get(sessionId, clientRequestId);
    if (!row) return null;
    return {
      id: row.id,
      providerTurnId: row.provider_turn_id || "",
      clientRequestId: row.client_request_id,
      status: row.status,
      input: row.input_text,
      error: parseJson(row.error_json, null),
      createdAt: Number(row.created_at),
      startedAt: Number(row.started_at || 0),
      completedAt: Number(row.completed_at || 0),
    };
  }

  findPendingInputByClientRequestId(sessionId, clientRequestId) {
    const row = this.db.prepare("SELECT * FROM agent_pending_inputs WHERE session_id = ? AND client_request_id = ? LIMIT 1")
      .get(sessionId, clientRequestId);
    return row ? {
      id: row.id,
      sessionId: row.session_id,
      clientRequestId: row.client_request_id,
      input: row.input_text,
      attachments: parseJson(row.attachments_json, []),
      createdAt: Number(row.created_at),
    } : null;
  }

  bindTurn(sessionId, localTurnId, providerTurnId) {
    return this.commit(sessionId, "turn.started", { turnId: localTurnId, providerTurnId }, (db) => {
      db.prepare("UPDATE agent_turns SET provider_turn_id = ?, status = 'running', started_at = ? WHERE id = ? AND session_id = ?")
        .run(providerTurnId, now(), localTurnId, sessionId);
      db.prepare("UPDATE agent_sessions SET status = 'running' WHERE id = ?").run(sessionId);
    });
  }

  getActiveTurn(sessionId) {
    const row = this.db.prepare(`SELECT * FROM agent_turns WHERE session_id = ? AND status IN ('starting','running','waitingApproval','interrupting') ORDER BY created_at DESC LIMIT 1`).get(sessionId);
    return row ? {
      id: row.id, providerTurnId: row.provider_turn_id || "", status: row.status,
      input: row.input_text, clientRequestId: row.client_request_id,
    } : null;
  }

  findTurnByProviderId(sessionId, providerTurnId) {
    const row = this.db.prepare("SELECT * FROM agent_turns WHERE session_id = ? AND provider_turn_id = ? LIMIT 1").get(sessionId, providerTurnId);
    if (!row) return null;
    return { id: row.id, providerTurnId: row.provider_turn_id || "", status: row.status, input: row.input_text, clientRequestId: row.client_request_id };
  }

  updateTurnState(sessionId, localTurnId, status, error = null) {
    const current = this.db.prepare("SELECT status FROM agent_turns WHERE id = ? AND session_id = ?").get(localTurnId, sessionId);
    if (!current || current.status === status) return null;
    if (["completed", "failed", "cancelled"].includes(current.status)) return null;
    const terminal = ["completed", "failed", "cancelled"].includes(status);
    return this.commit(sessionId, `turn.${status}`, { turnId: localTurnId, status, error }, (db) => {
      db.prepare("UPDATE agent_turns SET status = ?, error_json = ?, completed_at = ? WHERE id = ? AND session_id = ?")
        .run(status, error ? JSON.stringify(error) : null, terminal ? now() : null, localTurnId, sessionId);
      if (terminal) {
        db.prepare("UPDATE agent_approvals SET status = 'dismissed', resolved_at = ? WHERE session_id = ? AND turn_id = ? AND status = 'pending'")
          .run(now(), sessionId, localTurnId);
      }
      db.prepare("UPDATE agent_sessions SET status = ? WHERE id = ?").run(terminal ? "idle" : status, sessionId);
    });
  }

  appendAgentDelta(sessionId, turnId, providerItemId, delta) {
    const text = String(delta || "");
    if (!text) return null;
    const messageId = crypto.randomUUID();
    return this.commit(sessionId, "message.delta", { turnId, providerItemId, delta: text }, (db) => {
      db.prepare(`
        INSERT INTO agent_messages(id, session_id, turn_id, provider_item_id, role, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'assistant', ?, ?, ?)
        ON CONFLICT(session_id, provider_item_id) DO UPDATE SET content = content || excluded.content, updated_at = excluded.updated_at
      `).run(messageId, sessionId, turnId || null, providerItemId || messageId, text, now(), now());
    });
  }

  completeAgentMessage(sessionId, turnId, providerItemId, text) {
    const messageId = crypto.randomUUID();
    return this.commit(sessionId, "message.completed", { turnId, providerItemId }, (db) => {
      db.prepare(`
        INSERT INTO agent_messages(id, session_id, turn_id, provider_item_id, role, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'assistant', ?, ?, ?)
        ON CONFLICT(session_id, provider_item_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
      `).run(messageId, sessionId, turnId || null, providerItemId || messageId, String(text || ""), now(), now());
    });
  }

  addActivity(sessionId, payload) {
    return this.commit(sessionId, "activity", payload);
  }

  queueInput(sessionId, input = {}) {
    const id = crypto.randomUUID();
    const createdAt = now();
    const event = this.commit(sessionId, "queue.added", { id, input: input.text, clientRequestId: input.clientRequestId }, (db) => {
      db.prepare("INSERT INTO agent_pending_inputs(id, session_id, client_request_id, input_text, attachments_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, sessionId, input.clientRequestId, input.text, JSON.stringify(input.attachments || []), createdAt);
    });
    return { pending: { id, sessionId, clientRequestId: input.clientRequestId, input: input.text, attachments: input.attachments || [], createdAt }, event };
  }

  takeNextInput(sessionId) {
    return this._transaction(() => {
      const row = this.db.prepare("SELECT * FROM agent_pending_inputs WHERE session_id = ? ORDER BY created_at LIMIT 1").get(sessionId);
      if (!row) return null;
      this.db.prepare("DELETE FROM agent_pending_inputs WHERE id = ?").run(row.id);
      const event = this._insertEvent(sessionId, "queue.removed", { id: row.id });
      return {
        input: { id: row.id, clientRequestId: row.client_request_id, text: row.input_text, attachments: parseJson(row.attachments_json, []) },
        event,
      };
    });
  }

  removePendingInput(sessionId, pendingId) {
    const row = this.db.prepare("SELECT id FROM agent_pending_inputs WHERE id = ? AND session_id = ?").get(pendingId, sessionId);
    if (!row) return null;
    return this.commit(sessionId, "queue.removed", { id: pendingId }, (db) => {
      db.prepare("DELETE FROM agent_pending_inputs WHERE id = ? AND session_id = ?").run(pendingId, sessionId);
    });
  }

  addApproval(sessionId, turnId, request) {
    const existing = this.getPendingApprovalByProviderRequestId(sessionId, request.id);
    if (existing) return { approval: existing, event: null };
    const id = crypto.randomUUID();
    const createdAt = now();
    const event = this.commit(sessionId, "approval.requested", { id, turnId, method: request.method, params: request.params }, (db) => {
      db.prepare(`INSERT INTO agent_approvals(id, session_id, turn_id, provider_request_id, method, params_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .run(id, sessionId, turnId || null, JSON.stringify(request.id), request.method, JSON.stringify(request.params || {}), createdAt);
      db.prepare("UPDATE agent_sessions SET status = 'waitingApproval' WHERE id = ?").run(sessionId);
      if (turnId) db.prepare("UPDATE agent_turns SET status = 'waitingApproval' WHERE id = ?").run(turnId);
    });
    return { approval: { id, sessionId, turnId, providerRequestId: request.id, method: request.method, params: request.params || {}, status: "pending", createdAt }, event };
  }

  getApproval(approvalId) {
    const row = this.db.prepare("SELECT * FROM agent_approvals WHERE id = ?").get(approvalId);
    return row ? {
      id: row.id, sessionId: row.session_id, turnId: row.turn_id || "", providerRequestId: parseJson(row.provider_request_id, row.provider_request_id),
      method: row.method, params: parseJson(row.params_json, {}), status: row.status,
    } : null;
  }

  getPendingApprovalByProviderRequestId(sessionId, providerRequestId) {
    const row = this.db.prepare(
      "SELECT * FROM agent_approvals WHERE session_id = ? AND provider_request_id = ? AND status = 'pending' LIMIT 1"
    ).get(sessionId, JSON.stringify(providerRequestId));
    return row ? {
      id: row.id,
      sessionId: row.session_id,
      turnId: row.turn_id || "",
      providerRequestId: parseJson(row.provider_request_id, row.provider_request_id),
      method: row.method,
      params: parseJson(row.params_json, {}),
      status: row.status,
    } : null;
  }

  resolveApproval(approvalId, response) {
    const approval = this.getApproval(approvalId);
    if (!approval || approval.status !== "pending") return null;
    const event = this.commit(approval.sessionId, "approval.resolved", { id: approvalId, response }, (db) => {
      db.prepare("UPDATE agent_approvals SET status = 'resolved', response_json = ?, resolved_at = ? WHERE id = ?")
        .run(JSON.stringify(response), now(), approvalId);
      db.prepare("UPDATE agent_sessions SET status = 'running' WHERE id = ?").run(approval.sessionId);
      if (approval.turnId) db.prepare("UPDATE agent_turns SET status = 'running' WHERE id = ?").run(approval.turnId);
    });
    return { approval, event };
  }

  dismissApprovalByProviderRequestId(sessionId, providerRequestId) {
    const approval = this.getPendingApprovalByProviderRequestId(sessionId, providerRequestId);
    if (!approval) return null;
    return this.commit(sessionId, "approval.dismissed", { id: approval.id }, (db) => {
      db.prepare("UPDATE agent_approvals SET status = 'dismissed', resolved_at = ? WHERE id = ?")
        .run(now(), approval.id);
      const turn = approval.turnId
        ? db.prepare("SELECT status FROM agent_turns WHERE id = ?").get(approval.turnId)
        : null;
      if (turn?.status === "waitingApproval") {
        db.prepare("UPDATE agent_turns SET status = 'running' WHERE id = ?").run(approval.turnId);
        db.prepare("UPDATE agent_sessions SET status = 'running' WHERE id = ?").run(sessionId);
      }
    });
  }

  addAttachment(sessionId, input) {
    const id = input.id || crypto.randomUUID();
    const createdAt = now();
    const event = this.commit(sessionId, "attachment.added", { id, name: input.name, mimeType: input.mimeType, sizeBytes: input.sizeBytes }, (db) => {
      db.prepare(`INSERT INTO agent_attachments(id, session_id, name, mime_type, source_path, stored_path, sha256, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, sessionId, input.name, input.mimeType || "", input.sourcePath || "", input.storedPath, input.sha256, input.sizeBytes, createdAt);
    });
    return { attachment: { id, sessionId, ...input, createdAt }, event };
  }

  getAttachments(sessionId, ids = []) {
    const requested = new Set(ids.map((id) => String(id)));
    return this.db.prepare("SELECT * FROM agent_attachments WHERE session_id = ? ORDER BY created_at").all(sessionId)
      .filter((row) => !requested.size || requested.has(row.id))
      .map((row) => ({
        id: row.id, sessionId: row.session_id, name: row.name, mimeType: row.mime_type,
        sourcePath: row.source_path, storedPath: row.stored_path, sha256: row.sha256,
        sizeBytes: Number(row.size_bytes), createdAt: Number(row.created_at),
      }));
  }

  removeAttachment(sessionId, attachmentId) {
    const row = this.db.prepare("SELECT * FROM agent_attachments WHERE id = ? AND session_id = ?").get(attachmentId, sessionId);
    if (!row) return null;
    const attachment = {
      id: row.id,
      sessionId: row.session_id,
      name: row.name,
      storedPath: row.stored_path,
    };
    const event = this.commit(sessionId, "attachment.removed", { id: row.id, name: row.name }, (db) => {
      db.prepare("DELETE FROM agent_attachments WHERE id = ? AND session_id = ?").run(attachmentId, sessionId);
    });
    return { attachment, event };
  }
}

module.exports = { AgentStore };
