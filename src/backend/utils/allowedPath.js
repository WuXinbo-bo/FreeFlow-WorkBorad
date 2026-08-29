const fs = require("fs");
const path = require("path");

function normalizeForComparison(value) {
  const resolved = path.resolve(String(value || "").trim());
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathWithinRoot(targetPath, rootPath) {
  const target = normalizeForComparison(targetPath);
  const root = normalizeForComparison(rootPath);
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function resolveAllowedExistingPath(targetPath, allowedRoots = []) {
  const requested = String(targetPath || "").trim();
  if (!requested) {
    const error = new Error("Path is required");
    error.statusCode = 400;
    throw error;
  }

  const realTarget = await fs.promises.realpath(path.resolve(requested));
  for (const root of Array.isArray(allowedRoots) ? allowedRoots : []) {
    const requestedRoot = String(root || "").trim();
    if (!requestedRoot) {
      continue;
    }
    try {
      const realRoot = await fs.promises.realpath(path.resolve(requestedRoot));
      if (isPathWithinRoot(realTarget, realRoot)) {
        return realTarget;
      }
    } catch {
      // Ignore missing configured roots.
    }
  }

  const error = new Error(`Path is outside allowed roots: ${requested}`);
  error.statusCode = 403;
  throw error;
}

module.exports = {
  isPathWithinRoot,
  resolveAllowedExistingPath,
};
