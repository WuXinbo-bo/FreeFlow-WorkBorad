#!/usr/bin/env node

const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { readLocalSyncHash, validateRemoteResources } = require("../src/backend/services/githubSyncService");

const hash = "a".repeat(64);

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-github-sync-safety-"));
  try {
    const missing = await readLocalSyncHash(path.join(root, "missing.freeflow"));
    assert.equal(missing.exists, false);
    assert.equal(missing.errorCode, "LOCAL_MISSING");

    const malformedPath = path.join(root, "malformed.freeflow");
    await fs.writeFile(malformedPath, "{not-json", "utf8");
    const malformed = await readLocalSyncHash(malformedPath);
    assert.equal(malformed.exists, true);
    assert.equal(malformed.errorCode, "LOCAL_INVALID");
    assert.equal(malformed.hash, "");

    const resource = { path: `.freeflow/assets/${hash}.png`, sha256: hash, sizeBytes: 4 };
    assert.equal(validateRemoteResources([resource]).totalBytes, 4);
    assert.throws(() => validateRemoteResources([resource, resource]), /重复或不一致/);
    assert.throws(() => validateRemoteResources([{ ...resource, path: `.freeflow/assets/${"b".repeat(64)}.png` }]), /重复或不一致/);
    assert.throws(() => validateRemoteResources([{ ...resource, path: `.freeflow/assets/${hash}/escape.png` }]), /路径或哈希无效/);
    assert.throws(() => validateRemoteResources(Array.from({ length: 4097 }, (_, index) => ({
      path: `.freeflow/assets/${String(index).padStart(64, "a")}.png`,
      sha256: String(index).padStart(64, "a"),
      sizeBytes: 1,
    }))), /数量超过安全限制/);
    assert.throws(() => validateRemoteResources([
      { path: `.freeflow/assets/${hash}.png`, sha256: hash, sizeBytes: 50 * 1024 * 1024 },
      { path: `.freeflow/assets/${"b".repeat(64)}.png`, sha256: "b".repeat(64), sizeBytes: 50 * 1024 * 1024 },
      { path: `.freeflow/assets/${"c".repeat(64)}.png`, sha256: "c".repeat(64), sizeBytes: 1 },
    ]), /总大小超过安全限制/);
    console.log("[check-github-sync-safety] local-invalid protection and remote resource manifest limits passed");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[check-github-sync-safety] ${error.stack || error.message}`);
  process.exitCode = 1;
});
