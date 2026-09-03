const { AGENT_SETTINGS_FILE, WORKSPACE_DIR } = require("../config/paths");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const {
  AGENT_SETTINGS_SCHEMA_VERSION,
  getDefaultAgentSettings,
  normalizeAgentSettings,
} = require("./agentSettingsModel");

let writeQueue = Promise.resolve();

async function readAgentSettings() {
  const result = await readVersionedJsonFile(AGENT_SETTINGS_FILE, {
    defaultValue: getDefaultAgentSettings(WORKSPACE_DIR),
    normalize: (payload) => normalizeAgentSettings(payload, { workspaceRoot: WORKSPACE_DIR }),
    currentVersion: AGENT_SETTINGS_SCHEMA_VERSION,
  });
  return result.data;
}

function writeAgentSettings(payload = {}) {
  const operation = writeQueue.catch(() => {}).then(async () => {
    const current = await readAgentSettings();
    const next = normalizeAgentSettings(
      { ...current, ...payload, updatedAt: Math.max(Date.now(), Number(current.updatedAt || 0) + 1) },
      { workspaceRoot: WORKSPACE_DIR }
    );
    await writeJsonFile(AGENT_SETTINGS_FILE, next);
    return next;
  });
  writeQueue = operation;
  return operation;
}

module.exports = {
  AGENT_SETTINGS_FILE,
  readAgentSettings,
  writeAgentSettings,
};
