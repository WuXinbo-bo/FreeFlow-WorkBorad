"use strict";
const path = require("node:path");
const yauzl = require("yauzl");
function assertArchiveBudget(filePath, limit = 64 * 1024 * 1024) {
  if (![".docx", ".xlsx", ".pptx"].includes(path.extname(filePath).toLowerCase())) return Promise.resolve();
  return new Promise((resolve, reject) => yauzl.open(filePath, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(new Error("Office 文件损坏或不是支持的格式"));
    let bytes = 0; let entries = 0; let settled = false;
    function fail(error) { if (settled) return; settled = true; zip.close(); reject(error); }
    zip.on("error", fail);
    zip.on("end", () => { if (!settled) { settled = true; resolve(); } });
    zip.on("entry", (entry) => {
      bytes += entry.uncompressedSize; entries++;
      if (bytes > limit || entries > 10000 || entry.generalPurposeBitFlag & 1) return fail(new Error("Office 文件解压后过大或已加密，请使用系统应用打开"));
      zip.readEntry();
    });
    zip.readEntry();
  }));
}
module.exports = { assertArchiveBudget };
