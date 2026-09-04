const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const AGENT_STORE_SCHEMA_VERSION = 3;

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
  constructor(databaseFile, options = {}) {
    this.databaseFile = path.resolve(databaseFile);
    this.backupsDir = path.resolve(options.backupsDir || path.join(path.dirname(this.databaseFile), "AgentBackups"));
    this.db = null;
  }

  open() {
    if (this.db) return this;
    fs.mkdirSync(path.dirname(this.databaseFile), { recursive: true });
    this.db = new DatabaseSync(this.databaseFile);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;");
    const integrity = String(this.db.prepare("PRAGMA quick_check").get()?.quick_check || "");
    if (integrity !== "ok") throw new Error(`Agent 数据库完整性检查失败：${integrity || "unknown"}`);
    const currentVersion = Number(this.db.prepare("PRAGMA user_version").get()?.user_version || 0);
    const hasExistingSchema = Boolean(this.db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'agent_sessions'").get());
    if (hasExistingSchema && currentVersion < AGENT_STORE_SCHEMA_VERSION) this.createBackup(`schema-v${currentVersion}-to-v${AGENT_STORE_SCHEMA_VERSION}`);
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
        runtime_binding_json TEXT NOT NULL DEFAULT '{}',
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
        attachments_json TEXT NOT NULL DEFAULT '[]',
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
        mode TEXT NOT NULL DEFAULT 'queue',
        status TEXT NOT NULL DEFAULT 'queued',
        revision INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        error_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
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
      CREATE TABLE IF NOT EXISTS agent_remote_cleanups (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        resource_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT '',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    this._ensureColumn("agent_sessions", "runtime_binding_json", "TEXT NOT NULL DEFAULT '{}'");
    this._ensureColumn("agent_turns", "attachments_json", "TEXT NOT NULL DEFAULT '[]'");
    this._ensureColumn("agent_pending_inputs", "mode", "TEXT NOT NULL DEFAULT 'queue'");
    this._ensureColumn("agent_pending_inputs", "status", "TEXT NOT NULL DEFAULT 'queued'");
    this._ensureColumn("agent_pending_inputs", "revision", "INTEGER NOT NULL DEFAULT 0");
    this._ensureColumn("agent_pending_inputs", "position", "INTEGER NOT NULL DEFAULT 0");
    this._ensureColumn("agent_pending_inputs", "error_json", "TEXT");
    this._ensureColumn("agent_pending_inputs", "updated_at", "INTEGER NOT NULL DEFAULT 0");
    this.db.exec(`
      UPDATE agent_pending_inputs SET position = created_at WHERE position = 0;
      UPDATE agent_pending_inputs SET updated_at = created_at WHERE updated_at = 0;
      CREATE INDEX IF NOT EXISTS agent_pending_session_idx ON agent_pending_inputs(session_id, status, position, created_at);
      PRAGMA user_version = ${AGENT_STORE_SCHEMA_VERSION};
    `);
    return this;
  }

  _ensureColumn(table, column, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((item) => item.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  createBackup(reason = "manual") {
    if (!this.db || !fs.existsSync(this.databaseFile)) return null;
    this.db.exec("PRAGMA wal_checkpoint(FULL)");
    fs.mkdirSync(this.backupsDir, { recursive: true });
    const safeReason = String(reason || "manual").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 48) || "manual";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `agent-sessions-${stamp}-${safeReason}.sqlite`;
    const target = path.join(this.backupsDir, name);
    fs.copyFileSync(this.databaseFile, target, fs.constants.COPYFILE_EXCL);
    return { name, path: target, createdAt: fs.statSync(target).mtimeMs, sizeBytes: fs.statSync(target).size };
  }

  listBackups() {
    try {
      return fs.readdirSync(this.backupsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^agent-sessions-.+\.sqlite$/i.test(entry.name))
        .map((entry) => {
          const stat = fs.statSync(path.join(this.backupsDir, entry.name));
          return { name: entry.name, createdAt: stat.mtimeMs, sizeBytes: stat.size };
        })
        .sort((left, right) => right.createdAt - left.createdAt);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  restoreBackup(name) {
    const safeName = path.basename(String(name || ""));
    if (!safeName || safeName !== String(name || "") || !/^agent-sessions-.+\.sqlite$/i.test(safeName)) throw new Error("备份文件名无效");
    const source = path.join(this.backupsDir, safeName);
    if (!fs.existsSync(source)) throw new Error("会话备份不存在");
    const candidate = new DatabaseSync(source, { readOnly: true });
    try {
      const integrity = String(candidate.prepare("PRAGMA quick_check").get()?.quick_check || "");
      if (integrity !== "ok") throw new Error(`会话备份完整性检查失败：${integrity || "unknown"}`);
    } finally {
      candidate.close();
    }
    this.createBackup("before-restore");
    this.close();
    try {
      fs.rmSync(`${this.databaseFile}-wal`, { force: true });
      fs.rmSync(`${this.databaseFile}-shm`, { force: true });
      fs.copyFileSync(source, this.databaseFile);
    } finally {
      this.open();
    }
    return this.listBackups();
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
    const interruptedQueues = this.db.prepare("SELECT id, session_id FROM agent_pending_inputs WHERE status = 'dispatching'").all();
    for (const pending of interruptedQueues) {
      const event = this.commit(pending.session_id, "queue.failed", { id: pending.id, error: { message, recoverable: true } }, (db) => {
        db.prepare("UPDATE agent_pending_inputs SET status = 'failed', error_json = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
          .run(JSON.stringify({ message, recoverable: true }), now(), pending.id);
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
      runtimeBinding: input.runtimeBinding && typeof input.runtimeBinding === "object" ? input.runtimeBinding : {},
      status: input.status || "idle",
      legacySourceId: input.legacySourceId || null,
      createdAt,
    };
    const event = this._transaction(() => {
      this.db.prepare(`
        INSERT INTO agent_sessions(
          id, provider, provider_thread_id, title, workspace_root, model, reasoning_effort,
          approval_policy, sandbox_mode, status, revision, runtime_binding_json, legacy_source_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `).run(
        row.id, row.provider, row.providerThreadId, row.title, row.workspaceRoot, row.model,
        row.reasoningEffort, row.approvalPolicy, row.sandboxMode, row.status,
        JSON.stringify(row.runtimeBinding), row.legacySourceId, row.createdAt, row.createdAt
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
      runtimeBinding: parseJson(row.runtime_binding_json, {}),
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
      attachmentIds: parseJson(row.attachments_json, []),
      startedAt: Number(row.started_at || 0), completedAt: Number(row.completed_at || 0),
    }));
    const approvals = this.db.prepare("SELECT * FROM agent_approvals WHERE session_id = ? AND status = 'pending' ORDER BY created_at").all(sessionId).map((row) => ({
      id: row.id, turnId: row.turn_id || "", providerRequestId: row.provider_request_id, method: row.method,
      params: parseJson(row.params_json, {}), status: row.status, createdAt: Number(row.created_at),
    }));
    const pendingInputs = this.db.prepare("SELECT * FROM agent_pending_inputs WHERE session_id = ? ORDER BY CASE WHEN mode = 'steer' THEN 0 ELSE 1 END, position, created_at").all(sessionId).map((row) => this._mapPendingInput(row));
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

  findSessionByThread(providerThreadId, provider = "codex") {
    const row = this.db.prepare("SELECT id FROM agent_sessions WHERE provider = ? AND provider_thread_id = ?").get(provider, providerThreadId);
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
    const provider = settings.provider === "claude" ? "claude" : "codex";
    return this.commit(sessionId, "session.thread-bound", { threadId, provider }, (db) => {
      db.prepare(`
        UPDATE agent_sessions SET provider = ?, provider_thread_id = ?, workspace_root = ?, model = ?,
          reasoning_effort = ?, approval_policy = ?, sandbox_mode = ?, runtime_binding_json = ? WHERE id = ?
      `).run(provider, threadId, settings.workspaceRoot, settings.model || "", settings.reasoningEffort || "", settings.approvalPolicy, settings.sandboxMode, JSON.stringify(settings.runtimeBinding || {}), sessionId);
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
      db.prepare(`INSERT INTO agent_turns(id, session_id, client_request_id, status, input_text, attachments_json, created_at) VALUES (?, ?, ?, 'starting', ?, ?, ?)`)
        .run(id, sessionId, input.clientRequestId, input.text, JSON.stringify(input.attachmentIds || []), createdAt);
      db.prepare(`INSERT INTO agent_messages(id, session_id, turn_id, role, content, created_at, updated_at) VALUES (?, ?, ?, 'user', ?, ?, ?)`)
        .run(messageId, sessionId, id, input.text, createdAt, createdAt);
      db.prepare("UPDATE agent_sessions SET status = 'starting' WHERE id = ?").run(sessionId);
      if (currentTitle === "新会话") db.prepare("UPDATE agent_sessions SET title = ? WHERE id = ?").run(title, sessionId);
    });
    return { turn: { id, sessionId, clientRequestId: input.clientRequestId, status: "starting", input: input.text, attachmentIds: input.attachmentIds || [], createdAt }, event };
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
      attachmentIds: parseJson(row.attachments_json, []),
      error: parseJson(row.error_json, null),
      createdAt: Number(row.created_at),
      startedAt: Number(row.started_at || 0),
      completedAt: Number(row.completed_at || 0),
    };
  }

  retryFailedTurn(sessionId, turnId, clientRequestId) {
    const row = this.db.prepare("SELECT * FROM agent_turns WHERE id = ? AND session_id = ?").get(turnId, sessionId);
    if (!row) return null;
    if (row.status !== "failed") throw new Error("只有失败的任务可以重试");
    const event = this.commit(sessionId, "turn.retrying", { turnId, clientRequestId }, (db) => {
      db.prepare(`
        UPDATE agent_turns SET client_request_id = ?, provider_turn_id = NULL, status = 'starting',
          error_json = NULL, started_at = NULL, completed_at = NULL
        WHERE id = ? AND session_id = ?
      `).run(clientRequestId, turnId, sessionId);
      db.prepare("UPDATE agent_sessions SET status = 'starting' WHERE id = ?").run(sessionId);
    });
    return {
      turn: {
        id: row.id,
        sessionId,
        providerTurnId: "",
        clientRequestId,
        status: "starting",
        input: row.input_text,
        attachmentIds: parseJson(row.attachments_json, []),
        createdAt: Number(row.created_at),
      },
      event,
    };
  }

  trackRemoteThread(sessionId, threadId, reason = "provisioning") {
    const timestamp = now();
    this.db.prepare(`
      INSERT INTO agent_remote_cleanups(id, provider, resource_id, session_id, reason, created_at, updated_at)
      VALUES (?, 'codex', ?, ?, ?, ?, ?)
      ON CONFLICT(resource_id) DO UPDATE SET session_id = excluded.session_id, reason = excluded.reason, updated_at = excluded.updated_at
    `).run(crypto.randomUUID(), String(threadId), String(sessionId || ""), String(reason || ""), timestamp, timestamp);
  }

  listRemoteThreadCleanups() {
    return this.db.prepare("SELECT * FROM agent_remote_cleanups WHERE provider = 'codex' ORDER BY created_at").all().map((row) => ({
      id: row.id,
      threadId: row.resource_id,
      sessionId: row.session_id,
      reason: row.reason,
      attempts: Number(row.attempts || 0),
      lastError: row.last_error,
    }));
  }

  resolveRemoteThreadCleanup(threadId) {
    this.db.prepare("DELETE FROM agent_remote_cleanups WHERE provider = 'codex' AND resource_id = ?").run(String(threadId));
  }

  failRemoteThreadCleanup(threadId, error) {
    this.db.prepare(`
      UPDATE agent_remote_cleanups SET attempts = attempts + 1, last_error = ?, updated_at = ?
      WHERE provider = 'codex' AND resource_id = ?
    `).run(String(error?.message || error || "cleanup failed").slice(0, 1200), now(), String(threadId));
  }

  findPendingInputByClientRequestId(sessionId, clientRequestId) {
    const row = this.db.prepare("SELECT * FROM agent_pending_inputs WHERE session_id = ? AND client_request_id = ? LIMIT 1")
      .get(sessionId, clientRequestId);
    return row ? this._mapPendingInput(row) : null;
  }

  _mapPendingInput(row) {
    return {
      id: row.id,
      sessionId: row.session_id,
      clientRequestId: row.client_request_id,
      input: row.input_text,
      attachments: parseJson(row.attachments_json, []),
      mode: row.mode === "steer" ? "steer" : "queue",
      status: row.status || "queued",
      revision: Number(row.revision || 0),
      position: Number(row.position || 0),
      error: parseJson(row.error_json, null),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at || row.created_at),
    };
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
    const mode = input.mode === "steer" ? "steer" : "queue";
    const position = Number(this.db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS position FROM agent_pending_inputs WHERE session_id = ?").get(sessionId)?.position || 1);
    const event = this.commit(sessionId, "queue.added", { id, input: input.text, clientRequestId: input.clientRequestId, mode }, (db) => {
      db.prepare(`INSERT INTO agent_pending_inputs(
        id, session_id, client_request_id, input_text, attachments_json, mode, status, revision, position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)`)
        .run(id, sessionId, input.clientRequestId, input.text, JSON.stringify(input.attachments || []), mode, position, createdAt, createdAt);
    });
    return { pending: this.findPendingInputByClientRequestId(sessionId, input.clientRequestId), event };
  }

  takeNextInput(sessionId, pendingId = "") {
    return this._transaction(() => {
      const row = pendingId
        ? this.db.prepare("SELECT * FROM agent_pending_inputs WHERE session_id = ? AND id = ? AND status = 'queued'").get(sessionId, pendingId)
        : this.db.prepare(`SELECT * FROM agent_pending_inputs
          WHERE session_id = ? AND status = 'queued'
          ORDER BY CASE WHEN mode = 'steer' THEN 0 ELSE 1 END, position, created_at LIMIT 1`).get(sessionId);
      if (!row) return null;
      const updatedAt = now();
      this.db.prepare("UPDATE agent_pending_inputs SET status = 'dispatching', revision = revision + 1, updated_at = ? WHERE id = ?")
        .run(updatedAt, row.id);
      const event = this._insertEvent(sessionId, "queue.dispatching", { id: row.id });
      return {
        input: this._mapPendingInput({ ...row, status: "dispatching", revision: Number(row.revision || 0) + 1, updated_at: updatedAt }),
        event,
      };
    });
  }

  completePendingInput(sessionId, pendingId) {
    const row = this.db.prepare("SELECT id FROM agent_pending_inputs WHERE id = ? AND session_id = ?").get(pendingId, sessionId);
    if (!row) return null;
    return this.commit(sessionId, "queue.removed", { id: pendingId }, (db) => {
      db.prepare("DELETE FROM agent_pending_inputs WHERE id = ? AND session_id = ?").run(pendingId, sessionId);
    });
  }

  failPendingInput(sessionId, pendingId, error) {
    const row = this.db.prepare("SELECT id FROM agent_pending_inputs WHERE id = ? AND session_id = ?").get(pendingId, sessionId);
    if (!row) return null;
    const detail = { message: String(error?.message || error || "消息派发失败"), recoverable: true };
    return this.commit(sessionId, "queue.failed", { id: pendingId, error: detail }, (db) => {
      db.prepare("UPDATE agent_pending_inputs SET status = 'failed', error_json = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(detail), now(), pendingId);
    });
  }

  retryPendingInput(sessionId, pendingId) {
    const row = this.db.prepare("SELECT * FROM agent_pending_inputs WHERE id = ? AND session_id = ?").get(pendingId, sessionId);
    if (!row) return null;
    if (row.status !== "failed") throw new Error("只有失败的排队消息可以重试");
    const clientRequestId = crypto.randomUUID();
    const event = this.commit(sessionId, "queue.retried", { id: pendingId, clientRequestId }, (db) => {
      db.prepare("UPDATE agent_pending_inputs SET client_request_id = ?, status = 'queued', error_json = NULL, revision = revision + 1, updated_at = ? WHERE id = ?")
        .run(clientRequestId, now(), pendingId);
    });
    return { pending: this.findPendingInputByClientRequestId(sessionId, clientRequestId), event };
  }

  updatePendingInput(sessionId, pendingId, input = {}) {
    const row = this.db.prepare("SELECT * FROM agent_pending_inputs WHERE id = ? AND session_id = ?").get(pendingId, sessionId);
    if (!row) return null;
    if (!new Set(["queued", "failed"]).has(row.status)) throw new Error("该消息正在派发，暂时不能编辑");
    if (input.revision != null && Number(input.revision) !== Number(row.revision)) throw Object.assign(new Error("排队消息已更新，请刷新后重试"), { statusCode: 409, code: "QUEUE_REVISION_CONFLICT" });
    const text = input.text == null ? row.input_text : String(input.text).trim();
    const attachments = input.attachmentIds == null ? parseJson(row.attachments_json, []) : input.attachmentIds;
    if (!text && !attachments.length) throw new Error("消息和附件不能同时为空");
    const mode = input.mode == null ? row.mode : input.mode === "steer" ? "steer" : "queue";
    const event = this.commit(sessionId, "queue.updated", { id: pendingId }, (db) => {
      db.prepare("UPDATE agent_pending_inputs SET input_text = ?, attachments_json = ?, mode = ?, status = 'queued', error_json = NULL, revision = revision + 1, updated_at = ? WHERE id = ?")
        .run(text || "请处理附件。", JSON.stringify(attachments), mode, now(), pendingId);
    });
    return { pending: this._mapPendingInput(this.db.prepare("SELECT * FROM agent_pending_inputs WHERE id = ?").get(pendingId)), event };
  }

  movePendingInput(sessionId, pendingId, direction) {
    const rows = this.db.prepare("SELECT * FROM agent_pending_inputs WHERE session_id = ? AND status IN ('queued','failed') ORDER BY position, created_at").all(sessionId);
    const index = rows.findIndex((row) => row.id === pendingId);
    if (index < 0) return null;
    const targetIndex = direction === "up" ? index - 1 : direction === "down" ? index + 1 : -1;
    if (targetIndex < 0 || targetIndex >= rows.length) return { pending: this._mapPendingInput(rows[index]), event: null };
    const target = rows[targetIndex];
    const event = this.commit(sessionId, "queue.reordered", { id: pendingId, direction }, (db) => {
      db.prepare("UPDATE agent_pending_inputs SET position = ?, revision = revision + 1, updated_at = ? WHERE id = ?").run(target.position, now(), rows[index].id);
      db.prepare("UPDATE agent_pending_inputs SET position = ?, revision = revision + 1, updated_at = ? WHERE id = ?").run(rows[index].position, now(), target.id);
    });
    const updated = this.db.prepare("SELECT * FROM agent_pending_inputs WHERE id = ?").get(pendingId);
    return { pending: this._mapPendingInput(updated), event };
  }

  promotePendingInput(sessionId, pendingId) {
    const row = this.db.prepare("SELECT * FROM agent_pending_inputs WHERE id = ? AND session_id = ?").get(pendingId, sessionId);
    if (!row) return null;
    if (row.status === "dispatching") throw new Error("该消息已经开始派发");
    const minimum = Number(this.db.prepare("SELECT COALESCE(MIN(position), 1) - 1 AS position FROM agent_pending_inputs WHERE session_id = ?").get(sessionId)?.position || 0);
    const event = this.commit(sessionId, "queue.promoted", { id: pendingId }, (db) => {
      db.prepare("UPDATE agent_pending_inputs SET mode = 'steer', status = 'queued', position = ?, error_json = NULL, revision = revision + 1, updated_at = ? WHERE id = ?")
        .run(minimum, now(), pendingId);
      db.prepare("UPDATE agent_pending_inputs SET mode = 'queue', revision = revision + 1, updated_at = ? WHERE session_id = ? AND id <> ? AND mode = 'steer'")
        .run(now(), sessionId, pendingId);
    });
    const updated = this.db.prepare("SELECT * FROM agent_pending_inputs WHERE id = ?").get(pendingId);
    return { pending: this._mapPendingInput(updated), event };
  }

  removePendingInput(sessionId, pendingId) {
    const row = this.db.prepare("SELECT id, status FROM agent_pending_inputs WHERE id = ? AND session_id = ?").get(pendingId, sessionId);
    if (!row) return null;
    if (row.status === "dispatching") throw new Error("该消息正在派发，不能移除");
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
