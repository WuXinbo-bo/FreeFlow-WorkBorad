#!/usr/bin/env node

// Deterministic multi-device GitHub sync contract test.  The fake GitHub
// server below keeps a small Git object graph in memory, so this script never
// needs a real token or repository.  It deliberately exercises the public
// services and records capabilities that are not exposed by the current
// backend as explicit contract gaps.
const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const fsPromises = require("fs/promises");
const os = require("os");
const path = require("path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-github-multidevice-"));
const deviceA = path.join(root, "device-a");
const deviceB = path.join(root, "device-b");
const deviceBData = path.join(deviceB, "AppData");
const deviceBBoards = path.join(deviceB, "Boards");
for (const directory of [deviceA, deviceB, deviceBData, deviceBBoards]) fs.mkdirSync(directory, { recursive: true });

// Paths are read once by the backend config module.  This process represents
// device B; device A uses an explicit ledger file below to prove isolation.
process.env.FREEFLOW_HOME_DIR = deviceB;
process.env.FREEFLOW_USER_DATA_DIR = deviceBData;
process.env.FREEFLOW_CANVAS_BOARD_DIR = deviceBBoards;
process.env.FREEFLOW_LEGACY_PROJECT_DATA_DIR = path.join(deviceB, "Legacy");

const { MIB } = require("../src/backend/services/attachmentPolicyService");
const {
  buildSyncBundleFromFile,
} = require("../src/backend/services/freeflowSyncModel");
const { GitHubApiClient, GitHubApiError } = require("../src/backend/services/githubApiClient");
const { writeLedger, readLedger } = require("../src/backend/services/syncLedgerService");
const { SYNC_LEDGER_FILE } = require("../src/backend/config/paths");
const auth = require("../src/backend/services/githubAuthService");
const sync = require("../src/backend/services/githubSyncService");

const owner = "fixture-user";
const repo = "private-workspace";
const branch = "main";
const boardId = "shared-board";
const largeBytes = Buffer.alloc(2 * MIB + 137, 0x5a);
const largeSha = crypto.createHash("sha256").update(largeBytes).digest("hex");

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function waitFor(predicate, timeoutMs = 2000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("等待 mock GitHub 请求超时"));
      setTimeout(tick, 2);
    };
    tick();
  });
}

function createGitHubMock() {
  const blobs = new Map();
  const trees = new Map([["tree-base", new Map()]]);
  const commits = new Map([["base", { tree: "tree-base", parents: [] }]]);
  const state = {
    head: "base",
    failBoardReads: 0,
    boardReadAttempts: 0,
    requestCount: 0,
    seenIfNoneMatch: [],
  };

  function shaFor(prefix, value) {
    return `${prefix}-${crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 12)}`;
  }

  function parseBody(options) {
    if (!options?.body) return {};
    return typeof options.body === "string" ? JSON.parse(options.body) : JSON.parse(Buffer.from(options.body).toString("utf8"));
  }

  function headersOf(options) {
    const input = options?.headers || {};
    return new Map(Object.entries(input).map(([key, value]) => [String(key).toLowerCase(), String(value)]));
  }

  async function fetchImpl(url, options = {}) {
    state.requestCount += 1;
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const method = String(options.method || "GET").toUpperCase();
    const headers = headersOf(options);
    if (pathname === "/user" && method === "GET") return jsonResponse({ login: owner, id: 42 });
    if (pathname === `/repos/${owner}/${repo}` && method === "GET") {
      return jsonResponse({ name: repo, private: true, owner: { login: owner }, default_branch: branch, permissions: { push: true } });
    }
    if (pathname === `/repos/${owner}/${repo}/git/ref/heads/${branch}` && method === "GET") {
      const etag = `W/\"head-${state.head}\"`;
      state.seenIfNoneMatch.push(headers.get("if-none-match") || "");
      if (headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag, "x-poll-interval": "30" } });
      return jsonResponse({ ref: `refs/heads/${branch}`, object: { type: "commit", sha: state.head } }, 200, { etag, "x-poll-interval": "30" });
    }
    if (pathname.startsWith(`/repos/${owner}/${repo}/git/commits/`) && method === "GET") {
      const sha = decodeURIComponent(pathname.split("/").pop());
      const commit = commits.get(sha);
      return commit ? jsonResponse({ sha, tree: { sha: commit.tree }, parents: commit.parents.map((parent) => ({ sha: parent })) }) : jsonResponse({ message: "Not Found" }, 404);
    }
    if (pathname.startsWith(`/repos/${owner}/${repo}/git/trees/`) && method === "GET") {
      const sha = decodeURIComponent(pathname.split("/git/trees/")[1].split("?")[0]);
      const tree = trees.get(sha);
      if (!tree) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ sha, truncated: false, tree: [...tree.entries()].map(([entryPath, blobSha]) => ({ path: entryPath, mode: "100644", type: "blob", sha: blobSha })) });
    }
    if (pathname === `/repos/${owner}/${repo}/git/blobs` && method === "POST") {
      const body = parseBody(options);
      const bytes = Buffer.from(String(body.content || "").replace(/\n/g, ""), body.encoding === "base64" ? "base64" : "utf8");
      const sha = shaFor("blob", bytes);
      blobs.set(sha, bytes);
      return jsonResponse({ sha, size: bytes.length }, 201);
    }
    if (pathname.startsWith(`/repos/${owner}/${repo}/git/blobs/`) && method === "GET") {
      const sha = decodeURIComponent(pathname.split("/git/blobs/")[1]);
      const currentTree = trees.get(commits.get(state.head)?.tree) || new Map();
      const boardBlob = [...currentTree.entries()].some(([entryPath, blobSha]) => entryPath.endsWith("/board.freeflow") && blobSha === sha);
      if (boardBlob) state.boardReadAttempts += 1;
      if (boardBlob && state.failBoardReads > 0) {
        state.failBoardReads -= 1;
        return jsonResponse({ message: "temporary download interruption" }, 503);
      }
      const bytes = blobs.get(sha);
      if (!bytes) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ sha, size: bytes.length, encoding: "base64", content: bytes.toString("base64") });
    }
    if (pathname === `/repos/${owner}/${repo}/git/trees` && method === "POST") {
      const body = parseBody(options);
      const baseTree = new Map(trees.get(body.base_tree) || []);
      for (const entry of body.tree || []) {
        if (entry.sha == null) baseTree.delete(entry.path);
        else baseTree.set(entry.path, entry.sha);
      }
      const sha = shaFor("tree", JSON.stringify([...baseTree.entries()]));
      trees.set(sha, baseTree);
      return jsonResponse({ sha }, 201);
    }
    if (pathname === `/repos/${owner}/${repo}/git/commits` && method === "POST") {
      const body = parseBody(options);
      const sha = shaFor("commit", `${body.tree}:${(body.parents || []).join(",")}:${body.message}`);
      commits.set(sha, { tree: body.tree, parents: body.parents || [] });
      return jsonResponse({ sha, tree: { sha: body.tree }, parents: (body.parents || []).map((parent) => ({ sha: parent })) }, 201);
    }
    if (pathname === `/repos/${owner}/${repo}/git/refs/heads/${branch}` && method === "PATCH") {
      const body = parseBody(options);
      const commit = commits.get(body.sha);
      if (!commit || (!body.force && !commit.parents.includes(state.head))) return jsonResponse({ message: "Update is not a fast forward" }, 409);
      state.head = body.sha;
      return jsonResponse({ ref: `refs/heads/${branch}`, object: { type: "commit", sha: state.head } });
    }
    if (pathname.startsWith(`/repos/${owner}/${repo}/contents/`) && method === "GET") {
      const remotePath = pathname.slice(`/repos/${owner}/${repo}/contents/`.length).split("/").map(decodeURIComponent).join("/");
      if (remotePath.endsWith("/board.freeflow") && state.failBoardReads > 0) {
        state.failBoardReads -= 1;
        return jsonResponse({ message: "temporary download interruption" }, 503);
      }
      const tree = trees.get(commits.get(state.head)?.tree) || new Map();
      const blobSha = tree.get(remotePath);
      const bytes = blobs.get(blobSha);
      if (!bytes) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ path: remotePath, encoding: "base64", content: bytes.toString("base64"), sha: blobSha });
    }
    return jsonResponse({ message: `Unexpected fixture request: ${method} ${pathname}` }, 500);
  }

  return { fetchImpl, state, blobs, trees, commits };
}

function fixtureBoard(text, includeLargeAsset) {
  const items = [{ id: "text", type: "text", text }];
  if (includeLargeAsset) {
    items.push({
      id: "large-image",
      type: "image",
      name: "large.png",
      mime: "image/png",
      size: largeBytes.length,
      dataUrl: `data:image/png;base64,${largeBytes.toString("base64")}`,
    });
  }
  return {
    kind: "structured-host-board",
    version: "1.0.0",
    board: { boardId, items },
  };
}

async function main() {
  const remote = createGitHubMock();
  const boardAPath = path.join(deviceA, "board.freeflow");
  const boardBPath = path.join(deviceB, "board.freeflow");
  await fsPromises.writeFile(boardAPath, JSON.stringify(fixtureBoard("Windows change", true)), "utf8");
  await fsPromises.writeFile(boardBPath, JSON.stringify(fixtureBoard("Mac concurrent change", false)), "utf8");

  const bundleA = await buildSyncBundleFromFile(boardAPath);
  const bundleB = await buildSyncBundleFromFile(boardBPath);
  assert.equal(bundleA.boardId, boardId);
  assert.equal(bundleB.boardId, boardId);
  assert.equal(bundleA.manifest.resources.length, 1, "the >1 MiB image should be represented as a remote blob");
  assert.equal(bundleA.manifest.resources[0].sizeBytes, largeBytes.length);
  assert.equal(bundleA.manifest.resources[0].sha256, largeSha);
  assert.equal(bundleA.files.find((file) => file.path.includes("assets/"))?.content.length, largeBytes.length);

  // Device B starts a commit from the old base; device A advances the branch
  // before B publishes its ref. force=false must reject B as a stale writer.
  let releaseStaleHead;
  let staleHeadRequested = false;
  const staleHeadGate = new Promise((resolve) => { releaseStaleHead = resolve; });
  const deviceBFetch = async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    if (!staleHeadRequested && pathname === `/repos/${owner}/${repo}/git/ref/heads/${branch}` && !options.method) {
      staleHeadRequested = true;
      const staleHead = remote.state.head;
      await staleHeadGate;
      return jsonResponse({ ref: `refs/heads/${branch}`, object: { type: "commit", sha: staleHead } }, 200, { etag: `W/\"head-${staleHead}\"` });
    }
    return remote.fetchImpl(url, options);
  };
  const clientA = new GitHubApiClient({ token: "fixture-token-a", fetchImpl: remote.fetchImpl, apiBaseUrl: "https://fixture.github" });
  const clientB = new GitHubApiClient({ token: "fixture-token-b", fetchImpl: deviceBFetch, apiBaseUrl: "https://fixture.github" });
  const stalePromise = clientB.createCommit({ owner, repo, branch, message: "Mac stale commit", files: bundleB.files });
  await waitFor(() => staleHeadRequested);
  const committedA = await clientA.createCommit({ owner, repo, branch, message: "Windows commit", files: bundleA.files });
  releaseStaleHead();
  let staleError = null;
  try { await stalePromise; } catch (error) { staleError = error; }
  assert(staleError instanceof GitHubApiError, `stale writer unexpectedly succeeded: ${staleError?.message || "no error"}; head=${remote.state.head}; commits=${JSON.stringify([...remote.commits.entries()])}`);
  assert.equal(staleError.code, "REMOTE_CHANGED");
  assert.equal(staleError.status, 409);
  assert.equal(remote.state.head, committedA.commitSha, "stale writer changed the branch head");

  // Large blobs survive the Git Data API base64 round-trip without truncation.
  const assetPath = bundleA.manifest.resources[0].path;
  const assetResponse = await remote.fetchImpl(`https://fixture.github/repos/${owner}/${repo}/contents/${assetPath}`, {});
  const assetPayload = await assetResponse.json();
  const downloadedAsset = Buffer.from(assetPayload.content, "base64");
  assert.equal(downloadedAsset.length, largeBytes.length);
  assert.equal(crypto.createHash("sha256").update(downloadedAsset).digest("hex"), largeSha);

  // Two ledgers use independent data directories, even when they track the
  // same board and repository.
  const ledgerAPath = path.join(deviceA, "AppData", "github-sync-ledger.json");
  await writeLedger({ repository: { owner, repo, branch }, boards: { [boardId]: { boardId, localPath: boardAPath, remoteHeadSha: committedA.commitSha, baseRemoteCommit: committedA.baseCommitSha, syncState: "synced" } } }, ledgerAPath);
  assert.equal((await readLedger(ledgerAPath)).boards[boardId].remoteHeadSha, committedA.commitSha);

  // Discovery and pull use the branch snapshot instead of requiring a boardId
  // supplied by the caller.  The mock intentionally omits workspace.json so
  // listBoards also verifies its legacy tree-scan fallback.
  globalThis.fetch = remote.fetchImpl;
  await auth.connectWithToken({ token: "fixture-token-b", fetchImpl: remote.fetchImpl });
  await sync.setConfig({ owner, repo, branch });
  assert.equal(typeof sync.listBoards, "function");
  const discovered = await sync.listBoards();
  assert(discovered.boards.some((board) => board.boardId === boardId), "workspace discovery missed the remote board");
  const deletedWorkspace = {
    schemaVersion: 1,
    workspaceId: "fixture-workspace",
    boards: {
      [boardId]: {
        boardId,
        path: `.freeflow/boards/${boardId}/board.freeflow`,
        manifestPath: `.freeflow/boards/${boardId}/manifest.json`,
        boardHash: bundleA.boardHash,
        deletedAt: new Date().toISOString(),
      },
    },
  };
  await clientA.createCommit({
    owner,
    repo,
    branch,
    message: "Mark board deleted",
    files: [{ path: ".freeflow/workspace.json", content: Buffer.from(JSON.stringify(deletedWorkspace), "utf8") }],
  });
  const deletedListing = await sync.listBoards();
  assert.equal(deletedListing.boards.length, 0, "deleted boards must not reappear from legacy tree scan");
  await assert.rejects(
    sync.syncBoard({ boardPath: boardAPath }),
    (error) => error.code === "REMOTE_BOARD_DELETED",
    "a normal push must not silently resurrect a remotely deleted board",
  );
  assert.equal(typeof sync.pullBoard, "function");
  assert.equal(typeof sync.reconcileBoard, "function");

  // Pull the remote board into device B through the actual sync service.
  const pulled = await sync.downloadBoard({ boardId, boardPath: boardBPath });
  assert.equal(pulled.boardId, boardId);
  const downloadedBoard = JSON.parse(await fsPromises.readFile(boardBPath, "utf8"));
  assert.equal(downloadedBoard.board.items[0].text, "Windows change");
  assert.equal(downloadedBoard.board.items[1].resourceStatus, "synced");
  const localAssetPath = path.join(path.dirname(boardBPath), "assets", path.basename(assetPath));
  assert.equal(crypto.createHash("sha256").update(await fsPromises.readFile(localAssetPath)).digest("hex"), largeSha);
  assert.equal((await readLedger(ledgerAPath)).boards[boardId].remoteHeadSha, committedA.commitSha, "device B changed device A ledger");
  const noopPull = await sync.pullBoard({ boardId, boardPath: boardBPath });
  assert.equal(noopPull.pulled, false, "pull should be a no-op after a successful download");

  // Advance the remote branch from device A and let device B pull the newer
  // snapshot using its ledger base. This covers the actual remote-changed pull
  // path after the initial bootstrap download.
  const boardA2Path = path.join(deviceA, "board-v2.freeflow");
  await fsPromises.writeFile(boardA2Path, JSON.stringify(fixtureBoard("Windows second change", false)), "utf8");
  const bundleA2 = await buildSyncBundleFromFile(boardA2Path);
  const committedA2 = await clientA.createCommit({ owner, repo, branch, message: "Windows second commit", files: bundleA2.files });
  const pulledRemote = await sync.pullBoard({ boardId, boardPath: boardBPath });
  assert.equal(pulledRemote.pulled, true, "pull did not apply a newer remote snapshot");
  assert.equal(pulledRemote.state.state, "up-to-date");
  assert.equal((await fsPromises.readFile(boardBPath, "utf8")).includes("Windows second change"), true);
  assert.equal((await readLedger(SYNC_LEDGER_FILE)).boards[boardId].remoteHeadSha, committedA2.commitSha);

  // A transient board read is retried by the GitHub client and still leaves
  // the already materialized local board unchanged.
  const beforeInterruptedPull = await fsPromises.readFile(boardBPath, "utf8");
  const attemptsBeforeInterruption = remote.state.boardReadAttempts;
  remote.state.failBoardReads = 1;
  await sync.downloadBoard({ boardId, boardPath: boardBPath });
  assert(remote.state.boardReadAttempts >= attemptsBeforeInterruption + 2, "download did not retry a transient board read");
  assert.equal(await fsPromises.readFile(boardBPath, "utf8"), beforeInterruptedPull, "interrupted pull changed the local board");

  // The mock implements the ETag and 429 signals.  The client should expose a
  // 304 as an unchanged result and preserve retry metadata on a 429.
  const etagClient = new GitHubApiClient({ token: "fixture-token", fetchImpl: remote.fetchImpl, apiBaseUrl: "https://fixture.github" });
  const firstHead = await etagClient.getBranchHead(owner, repo, branch);
  assert.equal(firstHead.object.sha, remote.state.head);
  const etag = etagClient.lastResponseMeta?.etag;
  assert(etag, "branch HEAD response did not expose an ETag");
  const unchangedHead = await etagClient.getBranchHead(owner, repo, branch, { etag });
  assert.equal(unchangedHead, null, "304 response should be represented as unchanged");
  assert.equal(etagClient.lastResponseMeta?.status, 304);
  assert(remote.state.seenIfNoneMatch.includes(etag), "client did not send If-None-Match");
  let rateLimited = true;
  let rateLimitedCalls = 0;
  const rateLimitedFetch = async (url, options = {}) => {
    if (rateLimited) {
      rateLimited = false;
      rateLimitedCalls += 1;
      return jsonResponse({ message: "secondary rate limit" }, 429, { "retry-after": "1", "x-ratelimit-remaining": "0" });
    }
    rateLimitedCalls += 1;
    return remote.fetchImpl(url, options);
  };
  const rateLimitedClient = new GitHubApiClient({ token: "fixture-token", fetchImpl: rateLimitedFetch, apiBaseUrl: "https://fixture.github" });
  const retriedHead = await rateLimitedClient.getBranchHead(owner, repo, branch);
  assert.equal(retriedHead.object.sha, remote.state.head, "429 retry did not recover");
  assert.equal(rateLimitedCalls, 2, "GET should retry one transient 429 after Retry-After");

  const alwaysRateLimitedClient = new GitHubApiClient({
    token: "fixture-token",
    fetchImpl: async () => jsonResponse({ message: "secondary rate limit" }, 429, { "retry-after": "1", "x-ratelimit-remaining": "0" }),
    apiBaseUrl: "https://fixture.github",
  });
  await assert.rejects(
    alwaysRateLimitedClient.request(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, { retryLimit: 0 }),
    (error) => error.status === 429 && error.headers?.get("retry-after") === "1" && error.meta?.retryAfterMs === 1000,
  );

  const ancestorPayload = { kind: "structured-host-board", board: { items: [{ id: "item-1", text: "base", color: "black" }], view: { scale: 1 } } };
  const localPayload = { kind: "structured-host-board", board: { items: [{ id: "item-1", text: "local", color: "black" }], view: { scale: 1 } } };
  const remotePayload = { kind: "structured-host-board", board: { items: [{ id: "item-1", text: "base", color: "red" }], view: { scale: 2 } } };
  const merged = sync.mergeBoardPayloads(ancestorPayload, localPayload, remotePayload);
  assert.equal(merged.conflicts.length, 0, "independent item and board fields should merge automatically");
  assert.equal(merged.payload.board.items[0].text, "local");
  assert.equal(merged.payload.board.items[0].color, "red");
  assert.equal(merged.payload.board.view.scale, 2);
  const sameFieldConflict = sync.mergeBoardPayloads(
    ancestorPayload,
    { kind: "structured-host-board", board: { items: [{ id: "item-1", text: "local", color: "black" }] } },
    { kind: "structured-host-board", board: { items: [{ id: "item-1", text: "remote", color: "black" }] } },
  );
  assert.equal(sameFieldConflict.conflicts.length, 1, "same-field edits must remain a conflict");
  assert.equal(sameFieldConflict.conflicts[0].path, "items[item-1].text");
  const deleteEditConflict = sync.mergeBoardPayloads(
    ancestorPayload,
    { kind: "structured-host-board", board: { items: [] } },
    { kind: "structured-host-board", board: { items: [{ id: "item-1", text: "remote", color: "black" }] } },
  );
  assert.equal(deleteEditConflict.conflicts[0].reason, "delete-vs-edit");

  // Reconcile a real both-changed board: the local and remote text field are
  // intentionally different, so auto merge must refuse to publish and leave
  // ancestor/local/remote copies on disk.
  const localConflictBoard = JSON.parse(await fsPromises.readFile(boardBPath, "utf8"));
  localConflictBoard.board.items[0].text = "Mac local conflict";
  await fsPromises.writeFile(boardBPath, JSON.stringify(localConflictBoard), "utf8");
  const remoteConflictPath = path.join(deviceA, "remote-conflict.freeflow");
  await fsPromises.writeFile(remoteConflictPath, JSON.stringify(fixtureBoard("Windows remote conflict", false)), "utf8");
  const remoteConflictBundle = await buildSyncBundleFromFile(remoteConflictPath);
  const remoteConflictCommit = await clientA.createCommit({ owner, repo, branch, message: "Windows remote conflict", files: remoteConflictBundle.files });
  assert.notEqual(remoteConflictCommit.commitSha, committedA.commitSha);
  let mergeError = null;
  try {
    await sync.reconcileBoard({ boardId, boardPath: boardBPath, strategy: "auto" });
  } catch (error) {
    mergeError = error;
  }
  assert(mergeError, "auto reconcile should stop on same-field conflict");
  assert.equal(mergeError.code, "SYNC_CONFLICT");
  assert(mergeError.conflicts.some((item) => item.path === "items[text].text"));
  for (const artifactPath of Object.values(mergeError.artifacts.files)) assert(fs.existsSync(artifactPath), `missing merge artifact: ${artifactPath}`);
  const preservedLocal = JSON.parse(await fsPromises.readFile(boardBPath, "utf8"));
  assert.equal(preservedLocal.board.items[0].text, "Mac local conflict", "conflict must not overwrite the active local board");

  // A third device may publish after conflict inspection but before the
  // resolution commit. The resolution must keep the inspected remote SHA and
  // reject the stale rebase instead of overwriting that newer commit.
  const thirdPartyPath = path.join(deviceA, "remote-third-party.freeflow");
  await fsPromises.writeFile(thirdPartyPath, JSON.stringify(fixtureBoard("Windows third-party change", false)), "utf8");
  const thirdPartyBundle = await buildSyncBundleFromFile(thirdPartyPath);
  let headReads = 0;
  let injectingThirdParty = false;
  const guardedFetch = async (url, options = {}) => {
    const parsedUrl = new URL(url);
    const isHeadRead = parsedUrl.pathname === `/repos/${owner}/${repo}/git/ref/heads/${branch}` && !options.method;
    if (isHeadRead && !injectingThirdParty && ++headReads === 2) {
      injectingThirdParty = true;
      await clientA.createCommit({ owner, repo, branch, message: "Third device concurrent change", files: thirdPartyBundle.files });
    }
    return remote.fetchImpl(url, options);
  };
  globalThis.fetch = guardedFetch;
  let staleResolutionError = null;
  try {
    await sync.reconcileBoard({ boardId, boardPath: boardBPath, resolution: "local" });
  } catch (error) {
    staleResolutionError = error;
  } finally {
    globalThis.fetch = remote.fetchImpl;
  }
  assert(staleResolutionError, "concurrent resolution should reject a stale rebase");
  assert.equal(staleResolutionError.code, "REMOTE_CHANGED");

  await auth.clearTokens();
  console.log("[check-github-sync-multidevice] dual-device pull, stale-base rejection, large-blob hash, and interrupted-download recovery passed");
}

main()
  .catch((error) => {
    console.error(`[check-github-sync-multidevice] ${error.stack || error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  });
