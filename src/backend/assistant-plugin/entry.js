const fs = require("fs/promises");
const os = require("os");
const path = require("path");

// Installation checks use a disposable database, never a user's assistant data.
async function selfCheck() {
  const { AgentStore } = require("../agent/agentStore");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-assistant-check-"));
  const store = new AgentStore(path.join(directory, "self-check.sqlite"));
  try {
    store.open();
    const sessions = store.listSessions();
    if (!Array.isArray(sessions)) throw new Error("Assistant database self-check failed");
    return { ok: true, hostApiVersion: 1, checks: ["module-load", "sqlite", "schema"] };
  } finally {
    store.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function createAssistantBackend(host) {
  if (!host?.paths || !host.secretStorageService) throw new Error("Assistant host services are unavailable");
  globalThis.__FREEFLOW_ASSISTANT_HOST__ = host;
  const express = require("express");
  const { AgentRuntime } = require("../agent/agentRuntime");
  const settingsService = require("../agent/agentSettingsService");
  const { createAgentApiSecurity } = require("../agent/agentApiSecurity");
  const { createAgentRouter } = require("../agent/agentRoutes");
  const { createAgentConnectionService } = require("../agent/agentConnectionService");
  const runtime = new AgentRuntime({
    databaseFile: host.paths.AGENT_DATABASE_FILE,
    attachmentsDir: host.paths.AGENT_ATTACHMENTS_DIR,
    profilesDir: host.paths.AGENT_PROFILES_DIR,
    backupsDir: host.paths.AGENT_BACKUPS_DIR,
    workspacesDir: host.paths.AGENT_WORKSPACES_DIR,
    appVersion: host.appVersion,
    settingsService,
    permissionsService: host.permissionsService,
    legacySessionService: host.sessionService,
  });
  const connections = createAgentConnectionService({
    settingsService,
    validateRuntime: (provider) => runtime.validateProviderRuntime(provider),
  });
  const security = createAgentApiSecurity();
  return {
    express,
    router: createAgentRouter({ runtime, security, connections }),
    runtime,
    settingsService,
    connections,
    selfCheck,
    shutdown: () => runtime.shutdown(),
  };
}

module.exports = { createAssistantBackend, selfCheck };
