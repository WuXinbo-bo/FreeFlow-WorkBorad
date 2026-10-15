const { AgentRuntime } = require("../../src/backend/agent/agentRuntime");
const settings = require("../../src/backend/agent/agentSettingsService");
const { createAgentRouter } = require("../../src/backend/agent/agentRoutes");
const { createAgentConnectionService } = require("../../src/backend/agent/agentConnectionService");
const paths = require("../../src/backend/config/paths");
const permissionsService = require("../../src/backend/services/permissionsService");
const legacySessionService = require("../../src/backend/services/sessionService");
module.exports = function createAssistantBackend() {
  const runtime = new AgentRuntime({
    databaseFile: paths.AGENT_DATABASE_FILE, attachmentsDir: paths.AGENT_ATTACHMENTS_DIR,
    profilesDir: paths.AGENT_PROFILES_DIR, backupsDir: paths.AGENT_BACKUPS_DIR,
    workspacesDir: paths.AGENT_WORKSPACES_DIR, appVersion: require("../../package.json").version,
    settingsService: settings, permissionsService, legacySessionService,
  });
  const connections = createAgentConnectionService({ settingsService: settings,
    validateRuntime: (provider) => runtime.validateProviderRuntime(provider) });
  return { runtime, settings, router: createAgentRouter({ runtime, connections, security: { bootstrap: (_req, res) => res.json({ ok: true }), requireAuth: (_req, _res, next) => next() } }) };
};
