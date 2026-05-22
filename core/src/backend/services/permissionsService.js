const { PERMISSIONS_FILE, DESKTOP_DIR, WORKSPACE_DIR } = require("../config/paths");
const { writeJsonFile } = require("../utils/jsonStore");
const { readVersionedJsonFile } = require("../utils/versionedStore");
const {
  PERMISSIONS_SCHEMA_VERSION,
  getDefaultPermissions,
  normalizePermissionsStore,
  normalizeRootPath,
} = require("../models/permissionsModel");

async function readPermissionsStore() {
  const result = await readVersionedJsonFile(PERMISSIONS_FILE, {
    defaultValue: getDefaultPermissions(WORKSPACE_DIR, DESKTOP_DIR),
    normalize: (payload) => normalizePermissionsStore(payload, { workspaceDir: WORKSPACE_DIR, desktopDir: DESKTOP_DIR }),
    currentVersion: PERMISSIONS_SCHEMA_VERSION,
  });
  return result.data;
}

async function writePermissionsStore(payload = {}) {
  const next = normalizePermissionsStore(payload, { workspaceDir: WORKSPACE_DIR, desktopDir: DESKTOP_DIR });
  next.updatedAt = Date.now();
  await writeJsonFile(PERMISSIONS_FILE, next);
  return next;
}

module.exports = {
  PERMISSIONS_FILE,
  DESKTOP_DIR,
  WORKSPACE_DIR,
  readPermissionsStore,
  writePermissionsStore,
  normalizeRootPath,
};
