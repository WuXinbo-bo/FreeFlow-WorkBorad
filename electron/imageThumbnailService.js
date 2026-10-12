"use strict";
const fs = require("node:fs/promises");
const sharp = require("sharp");

// Keep native decoding bounded; never send original images into the management UI.
function createImageThumbnailService() {
  let active = 0;
  const queue = [];
  async function read(filePath) {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(filePath)) return { ok: false, error: "此格式不提供缩略图" };
    if (active >= 2) {
      if (queue.length >= 32) return { ok: false, error: "缩略图队列已满" };
      await new Promise((resolve) => queue.push(resolve));
    } else active += 1;
    try {
      const handle = await fs.open(filePath, "r");
      let source;
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error("大文件不生成缩略图");
        const buffer = Buffer.alloc(stat.size + 1);
        let size = 0;
        while (size < buffer.length) {
          const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
          if (!bytesRead) break;
          size += bytesRead;
        }
        source = buffer.subarray(0, size);
        const after = await handle.stat();
        if (source.length > 16 * 1024 * 1024 || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error("文件已变化，请刷新");
      } finally { await handle.close(); }
      const bytes = await sharp(source, { limitInputPixels: 40000000 }).rotate().resize({ width: 160, height: 120, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      return { ok: true, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mime: "image/png" };
    } catch (error) { return { ok: false, error: error.message || "缩略图不可用" }; }
    finally { const next = queue.shift(); if (next) next(); else active -= 1; }
  }
  return { read };
}
module.exports = { createImageThumbnailService };
