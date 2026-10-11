"use strict";
const fs = require("fs");
const path = require("path");

function isWithinPath(root, target, pathApi = path) {
  const relative = pathApi.relative(root, target);
  return relative === "" || (!pathApi.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${pathApi.sep}`));
}

// Resolve existing ancestors too: save destinations and new asset directories
// must not bypass a grant merely because the final file does not exist yet.
function canonicalPath(value) {
  const absolute = path.resolve(String(value || ""));
  let cursor = absolute;
  const missing = [];
  for (;;) {
    try { return path.join(fs.realpathSync.native(cursor), ...missing.reverse()); }
    catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code) || path.dirname(cursor) === cursor) throw error;
      // Dangling symlinks are not ordinary missing files.
      try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error("文件链接目标不存在"); }
      catch (statError) { if (statError.code !== "ENOENT") throw statError; }
      missing.push(path.basename(cursor));
      cursor = path.dirname(cursor);
    }
  }
}

function createFileAccessRegistry({ storagePath = "" } = {}) {
  const grants = new Map();
  if (storagePath) {
    try {
      for (const grant of JSON.parse(fs.readFileSync(storagePath, "utf8"))) {
        if (path.isAbsolute(grant.path) && typeof grant.directory === "boolean") grants.set(`${grant.directory}:${grant.path}`, grant);
      }
    } catch { /* First run or corrupt permission file: explicit selection restores access. */ }
  }
  function persist() {
    if (!storagePath) return;
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    const temporary = `${storagePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify([...grants.values()]), { mode: 0o600 });
    fs.renameSync(temporary, storagePath);
  }
  function grant(value, { directory = false, write = false } = {}) {
    if (!value) return;
    const resolved = canonicalPath(value);
    const key = `${directory}:${resolved}`;
    const previous = grants.get(key);
    if (previous && (previous.write || !write)) return;
    grants.set(key, { path: resolved, directory, write });
    persist();
  }
  function assert(value, { write = false } = {}) {
    if (!value || !path.isAbsolute(String(value)) || String(value).includes("\0")) throw new Error("文件路径无效");
    const resolved = canonicalPath(value);
    for (const permission of grants.values()) {
      if (write && !permission.write) continue;
      if (permission.directory ? isWithinPath(permission.path, resolved) : path.relative(permission.path, resolved) === "") return resolved;
    }
    const error = new Error("此路径尚未授权，请通过选择文件夹、选择文件或拖入文件后重试");
    error.code = "FILE_ACCESS_DENIED";
    throw error;
  }
  return { grant, assert };
}

// All generic filesystem IPC entry points share this policy, including the
// background export renderer. Native pickers/drop/clipboard grant separately.
function assertFileIpcAccess(registry, channel, args) {
  const name = channel.replace(/^desktop-shell:/, "");
  const single = new Set(["read-file", "read-file-base64", "read-file-preview", "get-file-preview-metadata", "get-file-id", "path-exists", "write-file", "ensure-directory", "remove-path"]);
  if (single.has(name) && args[0]) registry.assert(args[0], { write: ["write-file", "ensure-directory", "remove-path"].includes(name) });
  if (name === "rename-path") { registry.assert(args[0], { write: true }); registry.assert(args[1], { write: true }); }
  if (["list-canvas-boards", "list-canvas-images", "watch-canvas-workspace", "list-canvas-trash", "restore-canvas-trash", "purge-canvas-trash"].includes(name) && args[0]?.folderPath) registry.assert(args[0].folderPath, { write: ["restore-canvas-trash", "purge-canvas-trash"].includes(name) });
  if (["list-canvas-history", "preview-canvas-history", "restore-canvas-history"].includes(name) && args[0]?.filePath) registry.assert(args[0].filePath, { write: name === "restore-canvas-history" });
  if (name.startsWith("github-sync")) {
    for (const key of ["boardPath", "rootPath", "workspaceRoot"]) if (args[0]?.[key]) registry.assert(args[0][key], { write: true });
  }
}
module.exports = { createFileAccessRegistry, assertFileIpcAccess, isWithinPath };
