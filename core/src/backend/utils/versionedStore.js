const { ensureJsonFile, readJsonFile, writeJsonFile, statJsonFile } = require("./jsonStore");

function getSchemaVersion(value = 0) {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : 0;
}

async function readVersionedJsonFile(filePath, { defaultValue, normalize, currentVersion }) {
  await ensureJsonFile(filePath, defaultValue);
  const [raw, stat] = await Promise.all([
    readJsonFile(filePath, defaultValue).catch(() => defaultValue),
    statJsonFile(filePath, defaultValue),
  ]);

  const normalized = normalize(raw);
  const rawVersion = getSchemaVersion(raw?.schemaVersion);
  const normalizedVersion = getSchemaVersion(normalized?.schemaVersion);
  const shouldRewrite = rawVersion !== currentVersion || normalizedVersion !== currentVersion;

  if (shouldRewrite) {
    await writeJsonFile(filePath, normalized);
  }

  return {
    data: normalized,
    migrated: shouldRewrite,
    fileSizeBytes: stat.size,
    updatedAt: stat.mtimeMs,
  };
}

module.exports = {
  getSchemaVersion,
  readVersionedJsonFile,
};
