const fs = require("fs/promises");
const path = require("path");
const { atomicWriteJsonFile, atomicWriteFile } = require("./atomicWrite");

async function ensureJsonFile(filePath, defaultValue) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    // 使用原子写入创建初始文件
    await atomicWriteJsonFile(filePath, defaultValue);
  }
}

async function readJsonFile(filePath, defaultValue) {
  await ensureJsonFile(filePath, defaultValue);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJsonFile(filePath, payload) {
  await ensureJsonFile(filePath, payload);
  // 使用原子写入保护文件写入
  const result = await atomicWriteJsonFile(filePath, payload);
  if (!result.ok) {
    throw new Error(`JSON 文件写入失败: ${result.error || "未知错误"}`);
  }
}

async function statJsonFile(filePath, defaultValue) {
  await ensureJsonFile(filePath, defaultValue);
  return fs.stat(filePath);
}

module.exports = {
  ensureJsonFile,
  readJsonFile,
  writeJsonFile,
  statJsonFile,
};
