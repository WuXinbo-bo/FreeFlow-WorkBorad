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

const { createGitHubMock } = require("./fixtures/github-sync");

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


async function setup() {
 const remote=createGitHubMock();
 globalThis.fetch=remote.fetchImpl;
 await auth.connectWithToken({token:'fixture',fetchImpl:remote.fetchImpl});
 await sync.setConfig({owner,repo,branch});
 await writeLedger({repository:{owner,repo,branch},boards:{}},SYNC_LEDGER_FILE);
 const localPath=path.join(deviceBBoards,'original.freeflow');
 for (const file of await fsPromises.readdir(deviceBBoards)) await fsPromises.rm(path.join(deviceBBoards,file),{force:true,recursive:true});
 await fsPromises.writeFile(localPath,JSON.stringify(fixtureBoard('base',false)));
 const initial=await sync.syncBoard({boardPath:localPath,workspaceRoot:deviceBBoards});
 const client=new GitHubApiClient({token:'fixture',fetchImpl:remote.fetchImpl,apiBaseUrl:'https://fixture.github'});
 async function publish(payload,workspace=initial.workspace) {
  const bundle=await require("../src/backend/services/freeflowSyncModel").buildSyncBundleFromPayload(payload,{baseDir:deviceA});
  const ws=JSON.parse(JSON.stringify(workspace)); ws.boards[boardId].boardHash=bundle.boardHash;
  const commit=await client.createCommit({owner,repo,branch,files:[...bundle.files,{path:sync.WORKSPACE_PATH,content:JSON.stringify(ws)}]});
  return {bundle,commit};
 }
 return {remote,localPath,initial,client,publish};
}
const checks = [];
async function check(name, action) { await action(); checks.push(name); }
async function main() {
  await check("local rename publishes metadata, remote rename pulls safely", async () => {
    const { localPath, client } = await setup();
    const renamed = path.join(deviceBBoards, "renamed.freeflow");
    await fsPromises.rename(localPath, renamed);
    let plan = await sync.getWorkspacePlan({ rootPath: deviceBBoards });
    assert.equal(plan.items[0].state, "local-renamed");
    const uploaded = await sync.syncWorkspace({ rootPath: deviceBBoards });
    assert(uploaded.commit); assert.equal(uploaded.refreshed.items[0].state, "up-to-date");
    let workspace = (await sync.getWorkspace()).workspace;
    assert.equal(workspace.boards[boardId].relativePath, "renamed.freeflow");
    workspace.boards[boardId].relativePath = "nested/from-remote.freeflow";
    workspace.boards[boardId].name = "from-remote";
    await client.createCommit({ owner, repo, branch, files: [{ path: sync.WORKSPACE_PATH, content: JSON.stringify(workspace) }] });
    plan = await sync.getWorkspacePlan({ rootPath: deviceBBoards });
    assert.equal(plan.items[0].state, "remote-renamed");
    const pulled = await sync.pullWorkspace({ rootPath: deviceBBoards });
    assert.equal(pulled.results[0].renamedFrom, renamed);
    assert.equal(fs.existsSync(renamed), false);
    assert(fs.existsSync(path.join(deviceBBoards, "nested/from-remote.freeflow")));
    assert.equal((await sync.getWorkspacePlan({ rootPath: deviceBBoards })).items[0].state, "up-to-date");
  });
  await check("unknown baseline never overwrites, unrelated commits agree", async () => {
    let fixture = await setup();
    await fixture.publish(fixtureBoard("remote update", false));
    await writeLedger({ repository: { owner, repo, branch }, boards: {} }, SYNC_LEDGER_FILE);
    const head = fixture.remote.state.head;
    assert.equal((await sync.getWorkspacePlan({ rootPath: deviceBBoards })).items[0].state, "both-changed");
    await assert.rejects(sync.syncBoard({ boardPath: fixture.localPath }), error => error.code === "REMOTE_CHANGED");
    assert.equal((await sync.syncWorkspace({ rootPath: deviceBBoards })).commit, null);
    assert.equal(fixture.remote.state.head, head);
    fixture = await setup();
    await fsPromises.writeFile(fixture.localPath, JSON.stringify(fixtureBoard("local edit", false)));
    await fixture.client.createCommit({ owner, repo, branch, files: [{ path: "other.md", content: "unrelated" }] });
    assert.equal((await sync.getBoardState({ boardId, boardPath: fixture.localPath })).state, "local-changed");
    assert.equal((await sync.getWorkspacePlan({ rootPath: deviceBBoards })).items[0].state, "local-changed");
  });
  await check("remote-only attachment survives automatic merge and local reopen", async () => {
    const { localPath, publish } = await setup();
    await fsPromises.writeFile(localPath, JSON.stringify(fixtureBoard("local text", false)));
    await publish(fixtureBoard("base", true));
    const merged = await sync.reconcileBoard({ boardId, boardPath: localPath, strategy: "auto" });
    assert.equal(merged.merged, true); assert.equal(merged.bundle.manifest.skippedCount, 0);
    const board = JSON.parse(await fsPromises.readFile(localPath, "utf8")).board;
    assert.equal(board.items[0].text, "local text");
    const image = board.items.find(item => item.type === "image");
    assert.equal(image.resourceStatus, "synced");
    assert.equal(crypto.createHash("sha256").update(await fsPromises.readFile(path.join(path.dirname(localPath), image.sourcePath))).digest("hex"), largeSha);
    assert.equal((await buildSyncBundleFromFile(localPath)).manifest.skippedCount, 0);
    assert((await require("../src/backend/services/boardRecoveryService").listCanvasHistory(localPath)).entries.some(entry => entry.reason === "merge"));
  });
  await check("duplicate identities and portable path collisions block uploads", async () => {
    const { localPath, remote } = await setup();
    await fsPromises.writeFile(path.join(deviceBBoards, "duplicate.freeflow"), JSON.stringify(fixtureBoard("different text", false)));
    const plan = await sync.getWorkspacePlan({ rootPath: deviceBBoards });
    assert.equal(plan.items[0].state, "duplicate-id"); assert.equal(plan.items[0].localPaths.length, 2);
    await assert.rejects(sync.syncBoard({ boardPath: localPath }), error => error.code === "DUPLICATE_BOARD_ID");
    const head = remote.state.head;
    assert.equal((await sync.syncWorkspace({ rootPath: deviceBBoards })).commit, null); assert.equal(remote.state.head, head);
    const other = fixtureBoard("other id", false); other.board.boardId = "case-collision";
    await fsPromises.writeFile(path.join(deviceBBoards, "ORIGINAL.freeflow"), JSON.stringify(other));
    const collision = await sync.getWorkspacePlan({ rootPath: deviceBBoards });
    assert(collision.items.some(item => item.boardId === "case-collision" && item.state === "path-collision"));
  });
  await check("missing local file is retained as a decision and explicit pull restores it", async () => {
    const { localPath, remote } = await setup(); await fsPromises.unlink(localPath);
    assert.equal((await sync.getWorkspacePlan({ rootPath: deviceBBoards })).items[0].state, "local-missing");
    const head = remote.state.head;
    assert.equal((await sync.syncWorkspace({ rootPath: deviceBBoards })).commit, null); assert.equal(remote.state.head, head);
    const result = await sync.pullBoard({ boardId, rootPath: deviceBBoards });
    assert.equal(result.pulled, true); assert.equal(result.filePath, localPath); assert(fs.existsSync(localPath));
  });
  await check("recursive scan skips symlinks, generated folders and unrelated JSON", async () => {
    await setup();
    const nested = path.join(deviceBBoards, "notes", "sub"); await fsPromises.mkdir(nested, { recursive: true });
    const board = fixtureBoard("nested", false); board.board.boardId = "nested-board";
    await fsPromises.writeFile(path.join(nested, "nested.freeflow"), JSON.stringify(board));
    const jsonPath = path.join(deviceBBoards, "package.json"); const raw = '{"name":"unrelated"}'; await fsPromises.writeFile(jsonPath, raw);
    const outside = path.join(deviceA, "outside"); await fsPromises.mkdir(outside, { recursive: true });
    await fsPromises.writeFile(path.join(outside, "secret.freeflow"), JSON.stringify(board));
    await fsPromises.symlink(outside, path.join(deviceBBoards, "linked"), "dir");
    const scan = await sync.scanLocalWorkspace({ rootPath: deviceBBoards });
    assert.equal(scan.boards.length, 2); assert(scan.boards.some(item => item.relativePath === "notes/sub/nested.freeflow"));
    assert.equal(await fsPromises.readFile(jsonPath, "utf8"), raw);
  });
  await check("remote paths, names and symlinks cannot escape the workspace", async () => {
    const { initial, client } = await setup();
    const workspace = JSON.parse(JSON.stringify(initial.workspace));
    const clean = path.join(deviceB, "clean"); await fsPromises.mkdir(clean, { recursive: true });
    for (const unsafe of ["../../outside.freeflow", "/tmp/absolute.freeflow", "C:\\Users\\x.freeflow", "\\\\server\\share\\x.freeflow", "sub/../x.freeflow", "CON.freeflow"]) {
      workspace.boards[boardId].relativePath = unsafe;
      await client.createCommit({ owner, repo, branch, files: [{ path: sync.WORKSPACE_PATH, content: JSON.stringify(workspace) }] });
      await assert.rejects(sync.pullWorkspace({ rootPath: clean }), error => error.code === "UNSAFE_REMOTE_PATH");
    }
    delete workspace.boards[boardId].relativePath; workspace.boards[boardId].name = "../../escape";
    await client.createCommit({ owner, repo, branch, files: [{ path: sync.WORKSPACE_PATH, content: JSON.stringify(workspace) }] });
    const pulled = await sync.pullBoard({ boardId, rootPath: clean });
    assert.equal(pulled.filePath, path.join(clean, `${boardId}.freeflow`));
    await fsPromises.unlink(pulled.filePath);
    const outside = path.join(deviceA, "escape-target"); await fsPromises.mkdir(outside, { recursive: true });
    await fsPromises.symlink(outside, path.join(clean, "link"), "dir");
    workspace.boards[boardId].relativePath = "link/escape.freeflow";
    await client.createCommit({ owner, repo, branch, files: [{ path: sync.WORKSPACE_PATH, content: JSON.stringify(workspace) }] });
    const plan = await sync.getWorkspacePlan({ rootPath: clean }); assert.equal(plan.items[0].state, "path-collision");
    assert.equal((await sync.pullWorkspace({ rootPath: clean })).results.length, 0); assert.equal((await fsPromises.readdir(outside)).length, 0);
    await assert.rejects(sync.downloadBoard({ boardId, rootPath: clean, boardPath: path.join(clean, "link/escape.freeflow") }), error => error.code === "UNSAFE_LOCAL_PATH");
  });
  await check("asset directory symlink cannot write outside the selected folder", async () => {
    const { publish } = await setup(); await publish(fixtureBoard("base", true));
    const destination = path.join(deviceB, "asset-symlink"); await fsPromises.mkdir(destination, { recursive: true });
    const outside = path.join(deviceA, "asset-outside"); await fsPromises.mkdir(outside, { recursive: true });
    await fsPromises.symlink(outside, path.join(destination, "assets"), "dir");
    await assert.rejects(sync.downloadBoard({ boardId, rootPath: destination }), error => error.code === "UNSAFE_LOCAL_PATH");
    assert.equal((await fsPromises.readdir(outside)).length, 0); assert.equal(fs.existsSync(path.join(destination, "original.freeflow")), false);
  });
  await check("confirmed deletion preserves recoverable copies and never propagates silently", async () => {
    const { localPath, remote } = await setup();
    const plan = await sync.getWorkspacePlan({ rootPath: deviceBBoards });
    await assert.rejects(sync.deleteRemoteBoard({ boardId, expectedRemoteCommit: plan.remoteHeadSha }), error => error.code === "DELETE_CONFIRMATION_REQUIRED");
    const result = await sync.deleteRemoteBoard({ boardId, expectedRemoteCommit: plan.remoteHeadSha, confirmed: true });
    assert.equal(result.deleted, true); assert(fs.existsSync(localPath));
    assert.equal((await sync.getWorkspacePlan({ rootPath: deviceBBoards })).items[0].state, "deleted-remote");
    assert.equal((await sync.getBoardState({ boardId, boardPath: localPath })).state, "deleted-remote");
    await assert.rejects(sync.pullBoard({ boardId, boardPath: localPath }), error => error.code === "REMOTE_BOARD_DELETED");
    assert.equal((await sync.pullWorkspace({ rootPath: deviceBBoards })).results.length, 0); assert(fs.existsSync(localPath));
    await assert.rejects(sync.syncBoard({ boardPath: localPath }), error => error.code === "REMOTE_BOARD_DELETED");
    await assert.rejects(sync.applyRemoteDeletion({ boardId, rootPath: deviceBBoards, confirmed: true, expectedRemoteCommit: remote.state.head, expectedLocalHash: "wrong" }), error => error.code === "LOCAL_CHANGED_DURING_SYNC");
    assert(fs.existsSync(localPath));
    const deleted = await sync.applyRemoteDeletion({ boardId, rootPath: deviceBBoards, confirmed: true, expectedRemoteCommit: remote.state.head, expectedLocalHash: plan.items[0].localHash });
    assert(deleted.trashId); assert.equal(fs.existsSync(localPath), false);
    const restored = await require("../src/backend/services/boardRecoveryService").restoreCanvasTrash(deviceBBoards, deleted.trashId);
    assert.equal(restored.filePath, localPath); assert(fs.existsSync(localPath));
  });
  await check("rename destination conflict never overwrites another board", async () => {
    const { initial, client, localPath } = await setup();
    const workspace = JSON.parse(JSON.stringify(initial.workspace)); workspace.boards[boardId].relativePath = "occupied.freeflow";
    const other = fixtureBoard("must survive", false); other.board.boardId = "occupied-board";
    const occupied = path.join(deviceBBoards, "occupied.freeflow"); const original = JSON.stringify(other); await fsPromises.writeFile(occupied, original);
    await client.createCommit({ owner, repo, branch, files: [{ path: sync.WORKSPACE_PATH, content: JSON.stringify(workspace) }] });
    assert.equal((await sync.getWorkspacePlan({ rootPath: deviceBBoards })).items.find(item => item.boardId === boardId).state, "path-collision");
    assert.equal((await sync.pullWorkspace({ rootPath: deviceBBoards })).results.length, 0);
    assert.equal(await fsPromises.readFile(occupied, "utf8"), original); assert(fs.existsSync(localPath));
  });
  await check("element order preserves one-sided reorder and flags incompatible reorder", async () => {
    const base = { kind: "structured-host-board", board: { items: [{ id: "A", text: "A" }, { id: "B", text: "B" }, { id: "C", text: "C" }] } };
    const local = structuredClone(base), remote = structuredClone(base);
    local.board.items.reverse(); remote.board.items[0].text = "remote text";
    const merged = sync.mergeBoardPayloads(base, local, remote); assert.equal(merged.conflicts.length, 0);
    assert.deepEqual(merged.payload.board.items.map(item => item.id), ["C", "B", "A"]);
    assert.equal(merged.payload.board.items[2].text, "remote text");
    remote.board.items = [remote.board.items[1], remote.board.items[0], remote.board.items[2]];
    assert(sync.mergeBoardPayloads(base, local, remote).conflicts.some(item => item.path === "items.order"));
    const l = structuredClone(base), r = structuredClone(base); l.board.items.push({ id: "L" }); r.board.items.unshift({ id: "R" });
    const additions = sync.mergeBoardPayloads(base, l, r); assert.equal(additions.conflicts.length, 0); assert.equal(additions.payload.board.items.length, 5);
  });
  await check("large canvas merge keeps stable insertion order within a bounded time", async () => {
    const count = 12000;
    const base = { kind: "structured-host-board", board: { items: Array.from({ length: count }, (_, index) => ({ id: `element-${index}`, text: `Text ${index}` })) } };
    const local = structuredClone(base), remote = structuredClone(base);
    local.board.items.reverse(); local.board.items.push({ id: "local-added", text: "Local" });
    remote.board.items[0].text = "Remote edit"; remote.board.items.unshift({ id: "remote-added", text: "Remote" });
    const started = performance.now();
    const merged = sync.mergeBoardPayloads(base, local, remote);
    const elapsedMs = performance.now() - started;
    assert.equal(merged.conflicts.length, 0);
    assert.deepEqual(merged.payload.board.items.map(item => item.id), [
      ...base.board.items.slice(1).reverse().map(item => item.id), "remote-added", "element-0", "local-added",
    ]);
    assert.equal(merged.payload.board.items[count].text, "Remote edit");
    assert(elapsedMs < 5000, `12,000-element merge took ${Math.round(elapsedMs)}ms`);
    console.log(`12,000-element merge: ${Math.round(elapsedMs)}ms`);
  });
  await check("conflict artifacts reject symlinks and safely recover after removing them", async () => {
    const { localPath, publish, remote } = await setup();
    const localText = JSON.stringify(fixtureBoard("local conflict", false));
    await fsPromises.writeFile(localPath, localText); await publish(fixtureBoard("remote conflict", false));
    const outside = path.join(deviceA, "conflict-outside"); await fsPromises.mkdir(outside, { recursive: true });
    const linked = path.join(deviceBBoards, ".freeflow-conflicts"); await fsPromises.symlink(outside, linked, "dir");
    const head = remote.state.head;
    await assert.rejects(sync.reconcileBoard({ boardId, boardPath: localPath, strategy: "auto" }), error => error.code === "UNSAFE_LOCAL_PATH");
    assert.equal((await fsPromises.readdir(outside)).length, 0); assert.equal(remote.state.head, head);
    assert.equal(await fsPromises.readFile(localPath, "utf8"), localText);
    await fsPromises.unlink(linked);
    let conflict;
    await assert.rejects(sync.reconcileBoard({ boardId, boardPath: localPath, strategy: "auto" }), error => { conflict = error; return error.code === "SYNC_CONFLICT"; });
    assert.equal(Object.keys(conflict.artifacts.files).length, 4);
    for (const file of Object.values(conflict.artifacts.files)) assert(fs.existsSync(file));
    assert.equal(await fsPromises.readFile(localPath, "utf8"), localText); assert.equal(remote.state.head, head);
  });
  await check("attachment filenames produce portable resource paths and roundtrip", async () => {
    const { publish } = await setup();
    const payload = fixtureBoard("base", false);
    payload.board.items.push({ id: "portable-image", type: "image", name: "original.p?n*g", mime: "image/png", dataUrl: "data:image/png;base64,aW1hZ2U=" });
    const { bundle } = await publish(payload);
    assert.equal(bundle.manifest.resources.length, 1);
    assert.match(bundle.manifest.resources[0].path, /^\.freeflow\/assets\/[a-f0-9]{64}\.png$/);
    const destination = path.join(deviceB, "portable-attachments"); await fsPromises.mkdir(destination, { recursive: true });
    const downloaded = await sync.downloadBoard({ boardId, rootPath: destination });
    const board = JSON.parse(await fsPromises.readFile(downloaded.filePath, "utf8")).board;
    const image = board.items.find(item => item.id === "portable-image");
    assert.equal(image.name, "original.p?n*g");
    assert.equal(await fsPromises.readFile(path.join(destination, image.sourcePath), "utf8"), "image");
  });
  await check("merge publication failure reports local changes and permits a safe retry", async () => {
    const { localPath, publish, client, remote } = await setup();
    await fsPromises.writeFile(localPath, JSON.stringify(fixtureBoard("local text", false)));
    const payload = fixtureBoard("base", false); payload.board.items.push({ id: "remote-extra", type: "text", text: "Remote text" });
    await publish(payload);
    let advanced = false;
    globalThis.fetch = async (url, options = {}) => {
      const current = JSON.parse(await fsPromises.readFile(localPath, "utf8"));
      if (!advanced && current.board.items.some(item => item.id === "remote-extra")) {
        advanced = true;
        await client.createCommit({ owner, repo, branch, files: [{ path: "unrelated.md", content: "Branch advanced during merge" }] });
      }
      return remote.fetchImpl(url, options);
    };
    await assert.rejects(sync.reconcileBoard({ boardId, boardPath: localPath, strategy: "auto" }), error =>
      error.code === "REMOTE_CHANGED" && error.localChanged === true && error.merged === true && error.filePath === localPath && error.boardId === boardId);
    const merged = JSON.parse(await fsPromises.readFile(localPath, "utf8"));
    assert.equal(merged.board.items[0].text, "local text"); assert(merged.board.items.some(item => item.id === "remote-extra"));
    globalThis.fetch = remote.fetchImpl;
    assert.equal((await sync.reconcileBoard({ boardId, boardPath: localPath, strategy: "auto" })).operationCompleted, true);
    assert.equal((await sync.getBoardState({ boardId, boardPath: localPath })).state, "up-to-date");
  });
  await check("confirmed commit completes without a post-commit network refresh", async () => {
    const { localPath, remote } = await setup(); await fsPromises.writeFile(localPath, JSON.stringify(fixtureBoard("local updated", false)));
    let published = false;
    globalThis.fetch = async (url, options = {}) => {
      if (published) throw new Error("post-publish network unavailable");
      const response = await remote.fetchImpl(url, options);
      if (options.method === "PATCH") published = true;
      return response;
    };
    const result = await sync.syncWorkspace({ rootPath: deviceBBoards });
    assert(result.commit); assert.equal(result.operationCompleted, true); assert.equal(result.refreshed.counts["up-to-date"], 1);
    globalThis.fetch = remote.fetchImpl;
  });
  await check("uncertain ref update retains candidate metadata and can be confirmed", async () => {
    const { remote } = await setup(); let responseLost = false;
    const client = new GitHubApiClient({ token: "fixture", apiBaseUrl: "https://fixture.github", fetchImpl: async (url, options = {}) => {
      if (responseLost) throw new Error("confirmation offline");
      const response = await remote.fetchImpl(url, options);
      if (options.method === "PATCH") { responseLost = true; throw new Error("response lost after publish"); }
      return response;
    }, retryDelay: async () => {} });
    let unknown; try { await client.createCommit({ owner, repo, branch, files: [{ path: "confirmed.md", content: "published" }] }); } catch (error) { unknown = error; }
    assert.equal(unknown?.code, "COMMIT_RESULT_UNKNOWN"); assert.equal(unknown.commitSha, remote.state.head);
    const confirmed = await sync.confirmCommitResult(unknown); assert.equal(confirmed.status, "published");
    await assert.rejects(sync.confirmCommitResult({ ...unknown, repo: "different-repo" }), error => error.code === "COMMIT_REPOSITORY_MISMATCH");
    const unpublished = await sync.confirmCommitResult({ owner, repo, branch, commitSha: "candidate-not-published", baseCommitSha: remote.state.head });
    assert.equal(unpublished.status, "not-published");
  });
  console.log(`[check-github-sync-multidevice-safety] ${checks.length} integration groups passed`);
}
main().catch(error => { console.error("[check-github-sync-multidevice-safety]", checks, error); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
