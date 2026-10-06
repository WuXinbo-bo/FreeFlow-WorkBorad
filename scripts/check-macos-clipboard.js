const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { writeMacClipboardFiles, readMacClipboardFiles } = require("../electron/macosClipboard");

if (process.platform !== "darwin") {
  console.log("macOS clipboard test skipped on this platform");
  process.exit(0);
}
const formats = new Map();
const clipboard = {
  clear: () => formats.clear(),
  writeBuffer: (format, data) => formats.set(format, data),
  readBuffer: (format) => formats.get(format) || Buffer.alloc(0),
};
const paths = ["/tmp/中文 & <文件>.freeflow", "/tmp/another file.pdf"];
assert.equal(writeMacClipboardFiles(clipboard, paths).count, 2);
assert.deepEqual(readMacClipboardFiles(clipboard).paths, paths);
clipboard.clear();
clipboard.writeBuffer("public.file-url", Buffer.from(pathToFileURL(paths[0]).href));
assert.deepEqual(readMacClipboardFiles(clipboard).paths, [paths[0]]);
clipboard.clear();
assert.deepEqual(readMacClipboardFiles(clipboard).paths, []);
clipboard.writeBuffer("NSFilenamesPboardType", Buffer.from("invalid plist"));
assert.equal(readMacClipboardFiles(clipboard).ok, false);
console.log("macOS clipboard: multiple files, Unicode, URL fallback and invalid data passed");
