const SESSION_STORE_SCHEMA_VERSION = 1;

function getDefaultSessionStore() {
  return {
    schemaVersion: SESSION_STORE_SCHEMA_VERSION,
    currentSessionId: null,
    sessions: [],
  };
}

function normalizeSessionStore(payload = {}) {
  return {
    schemaVersion: SESSION_STORE_SCHEMA_VERSION,
    currentSessionId: typeof payload.currentSessionId === "string" ? payload.currentSessionId : null,
    sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
  };
}

module.exports = {
  SESSION_STORE_SCHEMA_VERSION,
  getDefaultSessionStore,
  normalizeSessionStore,
};
