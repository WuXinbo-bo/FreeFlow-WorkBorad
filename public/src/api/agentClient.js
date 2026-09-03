const AGENT_BASE = "/api/agent";

export function createAgentClient() {
  let bootstrapPromise = null;

  async function bootstrap(force = false) {
    if (force) bootstrapPromise = null;
    if (!bootstrapPromise) {
      bootstrapPromise = fetch(`${AGENT_BASE}/bootstrap`, { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("无法建立本地 Agent 安全会话");
        return true;
      }).catch((error) => {
        bootstrapPromise = null;
        throw error;
      });
    }
    return bootstrapPromise;
  }

  async function request(path, options = {}, retry = true) {
    await bootstrap();
    const response = await fetch(`${AGENT_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      cache: options.cache || "no-store",
    });
    if (response.status === 401 && retry) {
      await bootstrap(true);
      return request(path, options, false);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || `Agent 请求失败（HTTP ${response.status}）`);
      error.status = response.status;
      error.code = data.code || "AGENT_REQUEST_FAILED";
      throw error;
    }
    return data;
  }

  async function subscribe(sessionId, afterRevision, handlers = {}) {
    await bootstrap();
    const source = new EventSource(
      `${AGENT_BASE}/sessions/${encodeURIComponent(sessionId)}/events?after=${Math.max(0, Number(afterRevision) || 0)}`
    );
    source.addEventListener("agent-event", (event) => {
      try {
        handlers.onEvent?.(JSON.parse(event.data));
      } catch (error) {
        handlers.onError?.(error);
      }
    });
    source.addEventListener("ready", (event) => {
      try {
        handlers.onReady?.(JSON.parse(event.data));
      } catch {
        handlers.onReady?.({ revision: afterRevision });
      }
    });
    source.onerror = () => handlers.onDisconnect?.();
    return () => source.close();
  }

  return {
    bootstrap,
    getRuntime: (options = {}) => request(`/runtime?start=${options.start ? 1 : 0}&refresh=${options.refresh ? 1 : 0}`),
    restartRuntime: () => request("/runtime/restart", { method: "POST" }),
    startLogin: (type = "chatgpt") => request("/runtime/login", { method: "POST", body: JSON.stringify({ type }) }),
    cancelLogin: (loginId) => request("/runtime/login/cancel", { method: "POST", body: JSON.stringify({ loginId }) }),
    logout: () => request("/runtime/logout", { method: "POST" }),
    listSessions: () => request("/sessions"),
    createSession: (input = {}) => request("/sessions", { method: "POST", body: JSON.stringify(input) }),
    getSession: (sessionId) => request(`/sessions/${encodeURIComponent(sessionId)}`),
    renameSession: (sessionId, title) => request(`/sessions/${encodeURIComponent(sessionId)}`, { method: "PATCH", body: JSON.stringify({ title }) }),
    deleteSession: (sessionId) => request(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
    forkSession: (sessionId, input = {}) => request(`/sessions/${encodeURIComponent(sessionId)}/fork`, { method: "POST", body: JSON.stringify(input) }),
    startTurn: (sessionId, input) => request(`/sessions/${encodeURIComponent(sessionId)}/turns`, { method: "POST", body: JSON.stringify(input) }),
    interruptTurn: (sessionId) => request(`/sessions/${encodeURIComponent(sessionId)}/interrupt`, { method: "POST" }),
    addAttachment: (sessionId, input) => request(`/sessions/${encodeURIComponent(sessionId)}/attachments`, { method: "POST", body: JSON.stringify(input) }),
    removeAttachment: (sessionId, attachmentId) => request(`/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" }),
    resolveApproval: (approvalId, input) => request(`/approvals/${encodeURIComponent(approvalId)}/resolve`, { method: "POST", body: JSON.stringify(input) }),
    removePendingInput: (sessionId, pendingId) => request(`/sessions/${encodeURIComponent(sessionId)}/queue/${encodeURIComponent(pendingId)}`, { method: "DELETE" }),
    subscribe,
  };
}
