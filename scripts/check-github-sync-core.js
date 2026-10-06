const assert = require("assert");
const fs = require("fs");
const fsPromises = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  MIB,
  normalizePolicy,
  evaluateAttachment,
  createPlaceholderMetadata,
} = require("../src/backend/services/attachmentPolicyService");
const { buildSyncBundleFromFile, hashJson, ensureBoardIdInFile } = require("../src/backend/services/freeflowSyncModel");
const { GitHubApiClient } = require("../src/backend/services/githubApiClient");

async function main() {
  const policy = normalizePolicy();
  assert.equal(policy.imageMaxBytes, 5 * MIB);
  assert.equal(evaluateAttachment({ name: "a.png", mime: "image/png", sizeBytes: 1024 }, { policy }).syncable, true);
  assert.equal(evaluateAttachment({ name: "a.png", mime: "image/png", sizeBytes: 6 * MIB }, { policy }).reason, "too-large");
  assert.equal(evaluateAttachment({ name: "a.mp4", mime: "video/mp4", sizeBytes: 1024 }, { policy }).reason, "video-disabled");
  assert.equal(createPlaceholderMetadata({ name: "a.mp4", mime: "video/mp4", sizeBytes: 1024 }).resourceStatus, "placeholder");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-github-sync-"));
  const boardPath = path.join(root, "board.freeflow");
  const smallData = Buffer.from("small-image").toString("base64");
  const largeData = Buffer.alloc(6 * MIB, 7).toString("base64");
  await fsPromises.writeFile(boardPath, JSON.stringify({
    kind: "structured-host-board",
    version: "1.0.0",
    board: {
      items: [
        { id: "small", type: "image", name: "small.png", mime: "image/png", dataUrl: `data:image/png;base64,${smallData}` },
        { id: "large", type: "image", name: "large.png", mime: "image/png", dataUrl: `data:image/png;base64,${largeData}` },
        { id: "video", type: "fileCard", name: "clip.mp4", mime: "video/mp4", sourcePath: path.join(root, "clip.mp4"), size: 1024 },
        { id: "text", type: "text", text: "keep me" },
      ],
    },
  }), "utf8");
  await ensureBoardIdInFile(boardPath);
  const bundle = await buildSyncBundleFromFile(boardPath);
  assert.equal(bundle.boardId.length > 0, true);
  assert.equal(bundle.manifest.skippedCount, 2);
  assert.equal(bundle.files.some((file) => file.path.startsWith(".freeflow/assets/")), true);
  const serialized = JSON.parse(bundle.boardText);
  const items = serialized.board.items;
  assert.equal(items[0].resourceStatus, "synced");
  assert.equal(items[1].resourceStatus, "placeholder");
  assert.equal(items[2].syncReason, "video-disabled");
  assert.equal(hashJson({ updatedAt: 1, value: "same" }), hashJson({ updatedAt: 2, value: "same" }));

  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: new Map(),
      async text() { return JSON.stringify({ ok: true }); },
    };
  };
  const client = new GitHubApiClient({ token: "token", fetchImpl: fakeFetch, apiBaseUrl: "https://api.example" });
  await client.getUser();
  assert.equal(calls[0].options.headers.Authorization, "Bearer token");
  fs.rmSync(root, { recursive: true, force: true });
  console.log("[check-github-sync-core] ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
