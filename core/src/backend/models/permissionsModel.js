const PERMISSIONS_SCHEMA_VERSION = 1;

function getDefaultPermissions(workspaceDir = "", desktopDir = "") {
  return {
    schemaVersion: PERMISSIONS_SCHEMA_VERSION,
    permissions: {
      fileRead: false,
      fileWrite: false,
      desktopOrganize: false,
      inputControl: false,
      systemMonitor: false,
      appControl: false,
      scriptExecution: false,
      selfRepair: false,
    },
    allowedRoots: [workspaceDir, desktopDir].filter(Boolean),
    updatedAt: Date.now(),
  };
}

function normalizeRootPath(inputPath) {
  const path = require("path");
  return inputPath ? path.resolve(String(inputPath).trim()) : "";
}

function normalizePermissionsStore(payload = {}, options = {}) {
  const defaults = getDefaultPermissions(options.workspaceDir, options.desktopDir);
  const normalizedRoots = Array.isArray(payload.allowedRoots)
    ? payload.allowedRoots.map((item) => normalizeRootPath(item)).filter(Boolean)
    : defaults.allowedRoots;

  return {
    schemaVersion: PERMISSIONS_SCHEMA_VERSION,
    permissions: {
      ...defaults.permissions,
      ...(payload.permissions && typeof payload.permissions === "object" ? payload.permissions : {}),
    },
    allowedRoots: [...new Set(normalizedRoots)],
    updatedAt: payload.updatedAt || Date.now(),
  };
}

module.exports = {
  PERMISSIONS_SCHEMA_VERSION,
  getDefaultPermissions,
  normalizePermissionsStore,
  normalizeRootPath,
};
