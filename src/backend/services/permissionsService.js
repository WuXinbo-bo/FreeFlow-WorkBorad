const { PERMISSIONS_FILE, DESKTOP_DIR, WORKSPACE_DIR } = require("../config/paths");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const {
  PERMISSIONS_SCHEMA_VERSION,
  getDefaultPermissions,
  normalizePermissionsStore,
  normalizeRootPath,
} = require("../models/permissionsModel");
const { resolveAllowedExistingPath } = require("../utils/allowedPath");

let writeQueue = Promise.resolve();

async function readPermissionsStore() {
  const result = await readVersionedJsonFile(PERMISSIONS_FILE, {
    defaultValue: getDefaultPermissions(WORKSPACE_DIR, DESKTOP_DIR),
    normalize: (payload) => normalizePermissionsStore(payload, { workspaceDir: WORKSPACE_DIR, desktopDir: DESKTOP_DIR }),
    currentVersion: PERMISSIONS_SCHEMA_VERSION,
  });
  return result.data;
}

function writePermissionsStore(payload = {}) {
  const operation = writeQueue.catch(() => {}).then(async () => {
    const current = await readPermissionsStore().catch(() => getDefaultPermissions(WORKSPACE_DIR, DESKTOP_DIR));
    const next = normalizePermissionsStore(payload, { workspaceDir: WORKSPACE_DIR, desktopDir: DESKTOP_DIR });
    next.updatedAt = Math.max(Date.now(), Number(current.updatedAt || 0) + 1);
    await writeJsonFile(PERMISSIONS_FILE, next);
    return next;
  });
  writeQueue = operation;
  return operation;
}

module.exports = {
  PERMISSIONS_FILE,
  DESKTOP_DIR,
  WORKSPACE_DIR,
  readPermissionsStore,
  writePermissionsStore,
  normalizeRootPath,
  resolveAllowedExistingPath,
};
