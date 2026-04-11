const fs = require("fs/promises");
const path = require("path");

async function ensureJsonFile(filePath, defaultValue) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2), "utf8");
  }
}

async function readJsonFile(filePath, defaultValue) {
  await ensureJsonFile(filePath, defaultValue);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJsonFile(filePath, payload) {
  await ensureJsonFile(filePath, payload);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
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
