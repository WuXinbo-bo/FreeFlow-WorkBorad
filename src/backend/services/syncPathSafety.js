const fs = require("fs/promises");
const path = require("path");
const { GitHubApiError } = require("./githubApiClient");

// Repository paths must be portable to both supported desktop platforms.
function normalizeRelativeBoardPath(value = "") {
  const raw = String(value || "").trim();
  if (!raw || path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) return "";
  const relative = raw.replace(/\\/g, "/");
  const parts = relative.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[<>:"|?*\u0000-\u001f\u007f]/.test(part)
    || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) return "";
  return relative;
}

function pathKey(value) {
  return String(value || "").replace(/\\/g, "/").normalize("NFC").toLowerCase();
}

function isWithinRoot(rootPath, targetPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

async function assertSafeWorkspaceTarget(rootPath, targetPath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  if (!isWithinRoot(root, target) || root === target) {
    throw new GitHubApiError("画布路径超出当前工作区", { status: 400, code: "UNSAFE_LOCAL_PATH" });
  }
  // The selected root may itself have a platform alias (e.g. /var on macOS).
  // Everything below that root must remain an ordinary directory/file.
  const realRoot = await fs.realpath(root);
  let current = root;
  for (const part of path.relative(root, target).split(path.sep)) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (error) { if (error.code === "ENOENT") break; throw error; }
    if (stat.isSymbolicLink()) throw new GitHubApiError("同步路径包含符号链接，已阻止访问", { status: 409, code: "UNSAFE_LOCAL_PATH" });
    if (!isWithinRoot(realRoot, await fs.realpath(current))) {
      throw new GitHubApiError("同步路径离开当前工作区，已阻止访问", { status: 409, code: "UNSAFE_LOCAL_PATH" });
    }
  }
  return target;
}

module.exports = { normalizeRelativeBoardPath, pathKey, isWithinRoot, assertSafeWorkspaceTarget };
