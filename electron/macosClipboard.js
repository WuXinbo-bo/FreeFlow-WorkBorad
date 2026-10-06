const { spawnSync } = require("child_process");
const { fileURLToPath, pathToFileURL } = require("url");

function convertPlist(input, format) {
  const result = spawnSync("/usr/bin/plutil", ["-convert", format, "-o", "-", "--", "-"], {
    input,
    timeout: 5000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || "无法转换 macOS 文件剪贴板格式");
  }
  return result.stdout;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createFileNamesPlist(paths) {
  const items = paths.map((value) => `<string>${escapeXml(value)}</string>`).join("");
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><array>${items}</array></plist>`,
    "utf8"
  );
}

function readFileUrlBuffer(buffer) {
  return Buffer.from(buffer || "")
    .toString("utf8")
    .replace(/\0/g, "\n")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return value.startsWith("file:") ? fileURLToPath(value) : "";
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function writeMacClipboardFiles(clipboard, paths) {
  const normalizedPaths = Array.isArray(paths)
    ? paths.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (!normalizedPaths.length) {
    throw new Error("没有可写入剪贴板的有效文件路径");
  }
  clipboard.clear();
  clipboard.writeBuffer("NSFilenamesPboardType", createFileNamesPlist(normalizedPaths));
  clipboard.writeBuffer(
    "public.file-url",
    Buffer.from(normalizedPaths.map((value) => pathToFileURL(value).href).join("\n"), "utf8")
  );
  return { ok: true, paths: normalizedPaths, count: normalizedPaths.length };
}

function readMacClipboardFiles(clipboard) {
  try {
    const plist = clipboard.readBuffer("NSFilenamesPboardType");
    if (plist.length) {
      const values = JSON.parse(convertPlist(plist, "json").toString("utf8"));
      const paths = Array.isArray(values) ? values.filter((value) => typeof value === "string" && value) : [];
      if (paths.length) {
        return { ok: true, paths, count: paths.length };
      }
    }
    const paths = readFileUrlBuffer(clipboard.readBuffer("public.file-url"));
    return { ok: true, paths, count: paths.length };
  } catch (error) {
    return { ok: false, error: error.message, paths: [], count: 0 };
  }
}

module.exports = { writeMacClipboardFiles, readMacClipboardFiles };
