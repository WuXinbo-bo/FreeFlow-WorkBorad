const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { GITHUB_SYNC_SETTINGS_FILE, SYNC_LEDGER_FILE, CANVAS_BOARD_FILE } = require("../config/paths");
const { GitHubApiClient, GitHubApiError } = require("./githubApiClient");
const auth = require("./githubAuthService");
const {
  SYNC_SCHEMA_VERSION,
  buildSyncBundleFromFile,
  writeDownloadedBoard,
  ensureBoardIdInFile,
  hashJson,
  stableValue,
} = require("./freeflowSyncModel");
const { parseBoardFileText } = require("../models/canvasBoardFileFormat");
const { readLedger, updateLedger } = require("./syncLedgerService");
const { atomicWriteFile } = require("../utils/atomicWrite");

const WORKSPACE_PATH = ".freeflow/workspace.json";
const WORKSPACE_SCHEMA_VERSION = 1;
const BOARD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function cleanRepoConfig(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    owner: String(source.owner || "").trim(),
    repo: String(source.repo || "").trim(),
    branch: String(source.branch || "main").trim() || "main",
    boardPath: String(source.boardPath || "").trim(),
  };
}

function isSafeBoardId(value = "") {
  return BOARD_ID_RE.test(String(value || "").trim());
}

function assertBoardId(value = "") {
  const id = String(value || "").trim();
  if (!isSafeBoardId(id)) {
    throw new GitHubApiError("画布 ID 无效", { status: 400, code: "INVALID_BOARD_ID" });
  }
  return id;
}

function decodeBlob(blob = {}) {
  if (String(blob.encoding || "").toLowerCase() === "base64") {
    return Buffer.from(String(blob.content || "").replace(/\s/g, ""), "base64");
  }
  if (Buffer.isBuffer(blob.content)) return blob.content;
  return Buffer.from(String(blob.content || ""), "utf8");
}

function parseJsonBuffer(buffer, label) {
  try {
    return JSON.parse(Buffer.from(buffer || "").toString("utf8"));
  } catch (error) {
    throw new GitHubApiError(`${label} 不是有效 JSON`, { status: 422, code: "REMOTE_INVALID_JSON", cause: error });
  }
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function valuesEqual(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function boardFromPayload(payload = {}) {
  if (payload?.kind === "structured-host-board" && payload.board && typeof payload.board === "object") return payload.board;
  return payload && typeof payload === "object" ? payload : {};
}

function mergeThreeWayValue(ancestor, local, remote, pathName, conflicts) {
  if (valuesEqual(local, ancestor)) return cloneValue(remote);
  if (valuesEqual(remote, ancestor)) return cloneValue(local);
  if (valuesEqual(local, remote)) return cloneValue(local);
  const objects = [ancestor, local, remote].every((value) => value && typeof value === "object" && !Array.isArray(value));
  if (!objects) {
    conflicts.push({ path: pathName, ancestor: cloneValue(ancestor), local: cloneValue(local), remote: cloneValue(remote) });
    return cloneValue(local);
  }
  const merged = {};
  const keys = new Set([...Object.keys(ancestor || {}), ...Object.keys(local || {}), ...Object.keys(remote || {})]);
  for (const key of keys) {
    const childPath = pathName ? `${pathName}.${key}` : key;
    merged[key] = mergeThreeWayValue(ancestor?.[key], local?.[key], remote?.[key], childPath, conflicts);
    if (merged[key] === undefined) delete merged[key];
  }
  return merged;
}

function itemIdentity(item, index) {
  const value = item && typeof item === "object" ? item.id || item.itemId || item.uuid : "";
  return String(value || `index:${index}`);
}

function indexItems(items) {
  const result = new Map();
  for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
    const id = itemIdentity(item, index);
    if (!result.has(id)) result.set(id, item);
  }
  return result;
}

function mergeItems(ancestorItems, localItems, remoteItems, conflicts) {
  const ancestor = indexItems(ancestorItems);
  const local = indexItems(localItems);
  const remote = indexItems(remoteItems);
  const order = [];
  for (const id of [...ancestor.keys(), ...local.keys(), ...remote.keys()]) if (!order.includes(id)) order.push(id);
  const merged = [];
  for (const id of order) {
    const baseItem = ancestor.get(id);
    const localItem = local.get(id);
    const remoteItem = remote.get(id);
    let result;
    if (baseItem === undefined) {
      if (localItem === undefined) result = remoteItem;
      else if (remoteItem === undefined || valuesEqual(localItem, remoteItem)) result = localItem;
      else {
        conflicts.push({ path: `items[${id}]`, ancestor: null, local: cloneValue(localItem), remote: cloneValue(remoteItem), reason: "concurrent-add" });
        result = localItem;
      }
    } else if (localItem === undefined && remoteItem === undefined) {
      result = undefined;
    } else if (localItem === undefined) {
      if (valuesEqual(remoteItem, baseItem)) result = undefined;
      else {
        conflicts.push({ path: `items[${id}]`, ancestor: cloneValue(baseItem), local: null, remote: cloneValue(remoteItem), reason: "delete-vs-edit" });
        result = remoteItem;
      }
    } else if (remoteItem === undefined) {
      if (valuesEqual(localItem, baseItem)) result = undefined;
      else {
        conflicts.push({ path: `items[${id}]`, ancestor: cloneValue(baseItem), local: cloneValue(localItem), remote: null, reason: "edit-vs-delete" });
        result = localItem;
      }
    } else {
      result = mergeThreeWayValue(baseItem, localItem, remoteItem, `items[${id}]`, conflicts);
    }
    if (result !== undefined) merged.push(result);
  }
  return merged;
}

function mergeBoardPayloads(ancestorPayload = {}, localPayload = {}, remotePayload = {}) {
  const ancestorBoard = boardFromPayload(ancestorPayload);
  const localBoard = boardFromPayload(localPayload);
  const remoteBoard = boardFromPayload(remotePayload);
  const conflicts = [];
  const mergedBoard = {};
  const keys = new Set([
    ...Object.keys(ancestorBoard || {}),
    ...Object.keys(localBoard || {}),
    ...Object.keys(remoteBoard || {}),
  ]);
  keys.delete("items");
  for (const key of keys) {
    mergedBoard[key] = mergeThreeWayValue(ancestorBoard?.[key], localBoard?.[key], remoteBoard?.[key], `board.${key}`, conflicts);
    if (mergedBoard[key] === undefined) delete mergedBoard[key];
  }
  mergedBoard.items = mergeItems(ancestorBoard?.items, localBoard?.items, remoteBoard?.items, conflicts);
  const result = cloneValue(localPayload && typeof localPayload === "object" ? localPayload : remotePayload);
  if (result?.kind === "structured-host-board" && result.board && typeof result.board === "object") result.board = mergedBoard;
  else Object.assign(result, mergedBoard);
  return { payload: result, conflicts };
}

function normalizeWorkspace(value = {}, config = {}, workspaceId = "") {
  const source = value && typeof value === "object" ? value : {};
  const boards = {};
  const sourceBoards = Array.isArray(source.boards)
    ? source.boards.reduce((result, board) => ({ ...result, [board?.boardId]: board }), {})
    : source.boards;
  if (sourceBoards && typeof sourceBoards === "object") {
    for (const [id, board] of Object.entries(sourceBoards)) {
      if (!isSafeBoardId(id) || !board || typeof board !== "object") continue;
      boards[id] = {
        boardId: id,
        name: String(board.name || id),
        path: String(board.path || `.freeflow/boards/${id}/board.freeflow`),
        manifestPath: String(board.manifestPath || `.freeflow/boards/${id}/manifest.json`),
        boardHash: String(board.boardHash || ""),
        updatedAt: String(board.updatedAt || ""),
        deletedAt: board.deletedAt || null,
      };
    }
  }
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    workspaceId: String(source.workspaceId || workspaceId || crypto.randomUUID()),
    repository: `${config.owner}/${config.repo}`,
    branch: config.branch,
    lastCommitSha: String(source.lastCommitSha || ""),
    updatedAt: String(source.updatedAt || new Date().toISOString()),
    boards,
    attachmentPolicy: source.attachmentPolicy && typeof source.attachmentPolicy === "object" ? source.attachmentPolicy : {},
  };
}

async function getConfig() {
  return cleanRepoConfig(await auth.readSettings(GITHUB_SYNC_SETTINGS_FILE));
}

async function setConfig(config) {
  const next = cleanRepoConfig(config);
  if (!next.owner || !next.repo) throw new Error("GitHub 仓库配置不完整");
  await auth.writeSettings({ ...(await auth.readSettings(GITHUB_SYNC_SETTINGS_FILE)), ...next }, GITHUB_SYNC_SETTINGS_FILE);
  return next;
}

async function getClient() {
  const token = await auth.getAccessToken();
  if (!token) throw new Error("尚未连接 GitHub");
  return new GitHubApiClient({ token });
}

async function getStatus() {
  const config = await getConfig();
  const token = await auth.getAccessToken();
  const ledger = await readLedger(SYNC_LEDGER_FILE);
  return {
    connected: Boolean(token),
    repository: config,
    workspaceId: ledger.workspaceId || "",
    ledger,
  };
}

async function getSnapshotAtRef(client, config, commitSha = "") {
  if (commitSha) return client.getSnapshotAtCommit(config.owner, config.repo, commitSha, config.branch);
  return client.getBranchSnapshot(config.owner, config.repo, config.branch);
}

async function readWorkspaceAtSnapshot(client, config, snapshot, fallbackWorkspaceId = "") {
  const files = await client.getFilesAtSnapshot(config.owner, config.repo, snapshot, [WORKSPACE_PATH]);
  const remoteFile = files[WORKSPACE_PATH];
  if (!remoteFile?.blob) return normalizeWorkspace({}, config, fallbackWorkspaceId);
  return normalizeWorkspace(parseJsonBuffer(decodeBlob(remoteFile.blob), "workspace.json"), config, fallbackWorkspaceId);
}

function boardPaths(boardId) {
  const id = assertBoardId(boardId);
  return {
    board: `.freeflow/boards/${id}/board.freeflow`,
    manifest: `.freeflow/boards/${id}/manifest.json`,
  };
}

async function readRemoteBoardAtSnapshot(client, config, snapshot, boardId) {
  const id = assertBoardId(boardId);
  const paths = boardPaths(id);
  const files = await client.getFilesAtSnapshot(config.owner, config.repo, snapshot, [paths.board, paths.manifest]);
  if (!files[paths.board]?.blob) {
    throw new GitHubApiError("远端画布不存在", { status: 404, code: "REMOTE_BOARD_NOT_FOUND", boardId: id });
  }
  const boardBuffer = decodeBlob(files[paths.board].blob);
  const boardText = boardBuffer.toString("utf8");
  let parsed;
  try {
    parsed = parseBoardFileText(boardText);
  } catch (error) {
    throw new GitHubApiError("远端画布格式无效，已阻止覆盖本地文件", { status: 422, code: "REMOTE_INVALID_BOARD", cause: error });
  }
  const payload = parsed.payload || {};
  const manifest = files[paths.manifest]?.blob ? parseJsonBuffer(decodeBlob(files[paths.manifest].blob), "manifest.json") : null;
  if (manifest?.schemaVersion != null && Number(manifest.schemaVersion) > SYNC_SCHEMA_VERSION) {
    throw new GitHubApiError("远端画布版本高于当前应用，请先升级 FreeFlow", { status: 422, code: "REMOTE_SCHEMA_UNSUPPORTED" });
  }
  const boardHash = hashJson(payload);
  if (manifest?.boardId && String(manifest.boardId) !== id) {
    throw new GitHubApiError("远端 manifest 与画布 ID 不一致", { status: 422, code: "REMOTE_INTEGRITY_ERROR" });
  }
  const payloadBoardId = String(boardFromPayload(payload)?.boardId || payload?.boardId || "").trim();
  if (payloadBoardId && payloadBoardId !== id) {
    throw new GitHubApiError("远端画布内容与路径 ID 不一致", { status: 422, code: "REMOTE_INTEGRITY_ERROR" });
  }
  if (manifest?.boardHash && String(manifest.boardHash) !== boardHash) {
    throw new GitHubApiError("远端画布校验和不一致", { status: 422, code: "REMOTE_INTEGRITY_ERROR" });
  }
  return { id, paths, boardText, parsed, payload, manifest, boardHash, snapshot };
}

async function readLocalSyncHash(filePath, policy) {
  try {
    const bundle = await buildSyncBundleFromFile(filePath, { policy });
    return { hash: bundle.boardHash, boardId: bundle.boardId };
  } catch {
    return { hash: "", boardId: "" };
  }
}

async function readLocalBoardPayload(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return { raw, parsed: parseBoardFileText(raw) };
}

async function writeMergeConflictArtifacts(filePath, boardId, { ancestor, local, remote, merged }) {
  const conflictRoot = path.join(path.dirname(filePath), ".freeflow-conflicts", boardId, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
  await fs.mkdir(conflictRoot, { recursive: true });
  const files = {
    ancestor: ancestor?.raw || JSON.stringify(ancestor?.payload || {}, null, 2),
    local: local?.raw || JSON.stringify(local?.payload || {}, null, 2),
    remote: remote?.raw || JSON.stringify(remote?.payload || {}, null, 2),
    merged: JSON.stringify(merged?.payload || {}, null, 2),
  };
  for (const [name, content] of Object.entries(files)) {
    const result = await atomicWriteFile(path.join(conflictRoot, `${name}.freeflow`), content, { fsync: true });
    if (!result.ok) throw new Error(result.error || `无法保存冲突副本: ${name}`);
  }
  return {
    directory: conflictRoot,
    files: Object.fromEntries(Object.keys(files).map((name) => [name, path.join(conflictRoot, `${name}.freeflow`)])),
  };
}

async function syncBoard({ boardPath = CANVAS_BOARD_FILE, policy, message = "Update FreeFlow board", allowRemoteRebase = false } = {}) {
  const config = await getConfig();
  if (!config.owner || !config.repo) throw new Error("请先选择 GitHub 私有仓库");
  const localPath = path.resolve(boardPath);
  const ledger = await readLedger(SYNC_LEDGER_FILE);
  const previous = Object.values(ledger.boards).find((entry) => entry.localPath === localPath);
  await ensureBoardIdInFile(boardPath, previous?.boardId);
  const beforeStat = await fs.stat(boardPath);
  const bundle = await buildSyncBundleFromFile(boardPath, { policy });
  const afterBundleStat = await fs.stat(boardPath);
  if (beforeStat.mtimeMs !== afterBundleStat.mtimeMs || beforeStat.size !== afterBundleStat.size) {
    throw new GitHubApiError("同步期间本地画布发生变化，请保存后重试", { status: 409, code: "LOCAL_CHANGED_DURING_SYNC" });
  }
  const client = await getClient();
  const snapshot = await client.getBranchSnapshot(config.owner, config.repo, config.branch);
  const remoteWorkspace = await readWorkspaceAtSnapshot(client, config, snapshot, ledger.workspaceId);
  const workspace = normalizeWorkspace(remoteWorkspace, config, ledger.workspaceId);
  const remoteBoard = workspace.boards[bundle.boardId];
  const remoteBoardChanged = Boolean(
    remoteBoard?.boardHash && previous?.baseBoardHash && remoteBoard.boardHash !== previous.baseBoardHash,
  );
  const staleBranch = Boolean(previous?.baseRemoteCommit && previous.baseRemoteCommit !== snapshot.commitSha);
  const unknownRemoteBoard = Boolean(!previous && remoteBoard?.boardHash && remoteBoard.boardHash !== bundle.boardHash);
  if ((remoteBoardChanged || unknownRemoteBoard || (staleBranch && !remoteBoard)) && !allowRemoteRebase) {
    const error = new GitHubApiError("远端画布已变化，请先拉取并处理冲突", {
      status: 409,
      code: "REMOTE_CHANGED",
      expectedBaseSha: previous?.baseRemoteCommit || "",
      currentBaseSha: snapshot.commitSha,
      boardId: bundle.boardId,
    });
    await updateLedger((current) => ({
      ...current,
      repository: config,
      boards: { ...current.boards, [bundle.boardId]: { ...(current.boards[bundle.boardId] || previous), syncState: "conflict", remoteHeadSha: snapshot.commitSha } },
    }), SYNC_LEDGER_FILE);
    throw error;
  }
  workspace.updatedAt = new Date().toISOString();
  workspace.boards[bundle.boardId] = {
    boardId: bundle.boardId,
    name: path.basename(localPath).replace(/\.[^.]+$/, "") || bundle.boardId,
    path: `.freeflow/boards/${bundle.boardId}/board.freeflow`,
    manifestPath: `.freeflow/boards/${bundle.boardId}/manifest.json`,
    boardHash: bundle.boardHash,
    updatedAt: workspace.updatedAt,
    deletedAt: null,
  };
  const files = [
    ...bundle.files,
    { path: WORKSPACE_PATH, content: Buffer.from(JSON.stringify(workspace, null, 2), "utf8") },
  ];
  const result = await client.createCommit({
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    message,
    files,
    expectedBaseSha: snapshot.commitSha,
  });
  await updateLedger((current) => ({
    ...current,
    repository: config,
    workspaceId: workspace.workspaceId,
    remoteWorkspace: workspace,
    boards: {
      ...current.boards,
      [bundle.boardId]: {
        ...(current.boards[bundle.boardId] || {}),
        boardId: bundle.boardId,
        localPath,
        localHash: bundle.boardHash,
        baseBoardHash: bundle.boardHash,
        remoteHash: bundle.boardHash,
        remoteHeadSha: result.commitSha,
        baseRemoteCommit: result.commitSha,
        ancestorSha: snapshot.commitSha,
        syncState: "synced",
        skippedCount: bundle.manifest.skippedCount,
        assetBytes: bundle.manifest.assetBytes,
        updatedAt: workspace.updatedAt,
      },
    },
  }), SYNC_LEDGER_FILE);
  return {
    ...result,
    workspace,
    bundle: { ...bundle, files: files.map(({ content, ...file }) => file) },
  };
}

function resourcePathIsSafe(resourcePath = "") {
  const value = String(resourcePath || "");
  return value.startsWith(".freeflow/assets/") && !value.split("/").some((part) => part === ".." || part === "");
}

function resourceHashIsValid(value = "") {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

async function downloadBoard({ boardId, boardPath = CANVAS_BOARD_FILE, remoteCommit = "", force = false } = {}) {
  const config = await getConfig();
  const id = assertBoardId(boardId);
  if (!config.owner || !config.repo) throw new Error("下载画布所需参数不完整");
  const targetPath = path.resolve(boardPath);
  const localLedger = await readLedger(SYNC_LEDGER_FILE);
  const existingEntry = localLedger.boards[id];
  if (!force && existingEntry?.localPath === targetPath && existingEntry.localHash) {
    const local = await readLocalSyncHash(targetPath);
    if (local.hash && local.hash !== existingEntry.localHash) {
      throw new GitHubApiError("本地画布有未同步修改，已阻止远端覆盖", { status: 409, code: "SYNC_CONFLICT", boardId: id });
    }
  }
  const client = await getClient();
  const snapshot = await getSnapshotAtRef(client, config, remoteCommit);
  const remote = await readRemoteBoardAtSnapshot(client, config, snapshot, id);
  const manifest = remote.manifest;
  const resources = Array.isArray(manifest?.resources) ? manifest.resources : [];
  const resourcePaths = resources.map((resource) => String(resource?.path || ""));
  for (const resource of resources) {
    if (!resourcePathIsSafe(resource.path) || !resourceHashIsValid(resource.sha256)) {
      throw new GitHubApiError("远端附件清单路径或哈希无效", { status: 422, code: "REMOTE_INTEGRITY_ERROR" });
    }
  }
  const files = await client.getFilesAtSnapshot(config.owner, config.repo, snapshot, resourcePaths);
  const localAssetRoot = path.join(path.dirname(targetPath), "assets");
  const available = new Set();
  const missingResources = [];
  await fs.mkdir(localAssetRoot, { recursive: true });
  for (const resource of resources) {
    const remoteFile = files[resource.path];
    const bytes = remoteFile?.blob ? decodeBlob(remoteFile.blob) : null;
    const expectedSize = Number(resource.sizeBytes);
    const valid = bytes && resourceHashIsValid(resource.sha256)
      && crypto.createHash("sha256").update(bytes).digest("hex").toLowerCase() === String(resource.sha256).toLowerCase()
      && (!Number.isFinite(expectedSize) || (expectedSize >= 0 && bytes.length === expectedSize));
    if (!valid) {
      missingResources.push(resource.path);
      continue;
    }
    await atomicWriteFile(path.join(localAssetRoot, path.basename(resource.path)), bytes, { fsync: true });
    available.add(resource.path);
  }
  let boardText = remote.boardText;
  const rawPayload = parseJsonBuffer(Buffer.from(boardText, "utf8"), "board.freeflow");
  const board = rawPayload?.kind === "structured-host-board" && rawPayload.board ? rawPayload.board : rawPayload;
  if (Array.isArray(board?.items)) {
    board.items = board.items.map((item) => {
      const remotePath = String(item?.resourcePath || item?.sourcePath || "");
      if (!remotePath.startsWith(".freeflow/assets/")) return item;
      if (!available.has(remotePath)) {
        const next = { ...item };
        delete next.dataUrl;
        delete next.sourcePath;
        delete next.filePath;
        delete next.resourcePath;
        delete next.resourceSha256;
        delete next._relative;
        return { ...next, resourceStatus: "placeholder", syncable: false, syncReason: "remote-asset-missing" };
      }
      const localPath = path.join("assets", path.basename(remotePath));
      return { ...item, sourcePath: localPath, resourcePath: localPath, _relative: true };
    });
    boardText = JSON.stringify(rawPayload, null, 2);
  }
  const result = await writeDownloadedBoard(targetPath, boardText);
  const syncState = missingResources.length ? "partial" : "synced";
  const ledger = await updateLedger((current) => ({
    ...current,
    repository: config,
    boards: {
      ...current.boards,
      [id]: {
        ...(current.boards[id] || {}),
        boardId: id,
        localPath: targetPath,
        localHash: remote.boardHash,
        baseBoardHash: remote.boardHash,
        remoteHash: remote.boardHash,
        remoteHeadSha: snapshot.commitSha,
        baseRemoteCommit: snapshot.commitSha,
        ancestorSha: snapshot.commitSha,
        syncState,
        skippedCount: Number(manifest?.skippedCount) || missingResources.length,
        assetBytes: Number(manifest?.assetBytes) || 0,
      },
    },
  }), SYNC_LEDGER_FILE);
  return { ...result, boardId: id, manifest, remoteCommit: snapshot.commitSha, missingResources, syncState, ledger };
}

async function listBoards() {
  const config = await getConfig();
  if (!config.owner || !config.repo) throw new Error("请先选择 GitHub 私有仓库");
  const client = await getClient();
  const snapshot = await client.getBranchSnapshot(config.owner, config.repo, config.branch);
  const ledger = await readLedger(SYNC_LEDGER_FILE);
  const workspace = await readWorkspaceAtSnapshot(client, config, snapshot, ledger.workspaceId);
  const boards = Object.values(workspace.boards).filter((board) => !board.deletedAt);
  if (boards.length) return { workspace, boards, remoteHeadSha: snapshot.commitSha };
  const discovered = new Map();
  for (const entry of snapshot.entries) {
    const match = String(entry?.path || "").match(/^\.freeflow\/boards\/([^/]+)\/board\.freeflow$/);
    if (!match || !isSafeBoardId(match[1])) continue;
    discovered.set(match[1], {
      boardId: match[1],
      name: match[1],
      path: entry.path,
      manifestPath: `.freeflow/boards/${match[1]}/manifest.json`,
      boardHash: "",
      updatedAt: "",
      deletedAt: null,
    });
  }
  return { workspace, boards: [...discovered.values()], remoteHeadSha: snapshot.commitSha };
}

async function getWorkspace() {
  const result = await listBoards();
  return { workspace: result.workspace, remoteHeadSha: result.remoteHeadSha, boards: result.boards };
}

async function getBoardState({ boardId, boardPath = "" } = {}) {
  const config = await getConfig();
  const id = assertBoardId(boardId);
  if (!config.owner || !config.repo) throw new Error("请先选择 GitHub 私有仓库");
  const client = await getClient();
  const snapshot = await client.getBranchSnapshot(config.owner, config.repo, config.branch);
  const remote = await readRemoteBoardAtSnapshot(client, config, snapshot, id);
  const ledger = await readLedger(SYNC_LEDGER_FILE);
  const entry = ledger.boards[id] || {};
  const localPath = path.resolve(boardPath || entry.localPath || config.boardPath || CANVAS_BOARD_FILE);
  const local = await readLocalSyncHash(localPath);
  const localExists = Boolean(local.hash);
  const remoteHash = remote.boardHash || String(remote.manifest?.boardHash || "");
  let state = "remote-changed";
  if (!localExists) state = "remote-only";
  else if (local.hash === remoteHash) state = "up-to-date";
  else if (entry.baseRemoteCommit && entry.baseRemoteCommit === snapshot.commitSha) state = "local-changed";
  else if (entry.localHash && local.hash === entry.localHash) state = "remote-changed";
  else state = "both-changed";
  return {
    boardId: id,
    state,
    localPath,
    localHash: local.hash,
    remoteHash,
    remoteCommit: snapshot.commitSha,
    baseRemoteCommit: entry.baseRemoteCommit || "",
    manifest: remote.manifest,
  };
}

async function pullBoard(options = {}) {
  const state = await getBoardState(options);
  if (state.state === "up-to-date") return { ok: true, pulled: false, state };
  if (state.state === "local-changed") return { ok: true, pulled: false, state, requiresPush: true };
  if (state.state === "both-changed") {
    throw new GitHubApiError("本地和远端画布都已修改，请先选择保留版本或合并", { status: 409, code: "SYNC_CONFLICT", state });
  }
  const result = await downloadBoard({ ...options, boardId: state.boardId, boardPath: state.localPath, remoteCommit: state.remoteCommit });
  return { ...result, pulled: true, state: { ...state, state: result.syncState === "partial" ? "partial" : "up-to-date" } };
}

async function reconcileBoard({ boardId, boardPath = "", resolution = "", strategy = "" } = {}) {
  const selected = String(resolution || strategy || "").trim().toLowerCase();
  const state = await getBoardState({ boardId, boardPath });
  if (selected === "remote") return downloadBoard({ boardId: state.boardId, boardPath: state.localPath, remoteCommit: state.remoteCommit, force: true });
  if (selected === "local") return syncBoard({ boardPath: state.localPath, allowRemoteRebase: true, message: "Resolve FreeFlow sync conflict (local)" });
  if (selected !== "auto" && selected !== "merge") {
    return { ok: true, state, resolutions: ["local", "remote", "auto", "merge"] };
  }
  if (state.state !== "both-changed") {
    return { ok: true, merged: false, state, conflicts: [] };
  }
  const config = await getConfig();
  const ledger = await readLedger(SYNC_LEDGER_FILE);
  const entry = ledger.boards[state.boardId] || {};
  const ancestorSha = String(entry.baseRemoteCommit || state.baseRemoteCommit || "");
  if (!ancestorSha) {
    throw new GitHubApiError("缺少共同祖先，无法安全合并", { status: 409, code: "SYNC_MERGE_REQUIRED", state });
  }
  const client = await getClient();
  const [ancestorSnapshot, remoteSnapshot] = await Promise.all([
    getSnapshotAtRef(client, config, ancestorSha),
    getSnapshotAtRef(client, config, state.remoteCommit),
  ]);
  const [ancestor, remote] = await Promise.all([
    readRemoteBoardAtSnapshot(client, config, ancestorSnapshot, state.boardId),
    readRemoteBoardAtSnapshot(client, config, remoteSnapshot, state.boardId),
  ]);
  const local = await readLocalBoardPayload(state.localPath);
  const merged = mergeBoardPayloads(ancestor.payload, local.parsed.payload, remote.payload);
  if (merged.conflicts.length) {
    const artifacts = await writeMergeConflictArtifacts(state.localPath, state.boardId, {
      ancestor,
      local,
      remote,
      merged,
    });
    await updateLedger((current) => ({
      ...current,
      repository: config,
      boards: { ...current.boards, [state.boardId]: { ...(current.boards[state.boardId] || {}), syncState: "conflict", conflictId: artifacts.directory, conflictFiles: artifacts.files } },
    }), SYNC_LEDGER_FILE);
    throw new GitHubApiError("画布存在字段冲突，已保存三方副本，请先处理冲突", {
      status: 409,
      code: "SYNC_CONFLICT",
      conflicts: merged.conflicts,
      artifacts,
      state,
    });
  }
  await writeDownloadedBoard(state.localPath, JSON.stringify(merged.payload, null, 2));
  const synced = await syncBoard({ boardPath: state.localPath, allowRemoteRebase: true, message: "Resolve FreeFlow sync conflict (merge)" });
  return { ...synced, merged: true, conflicts: [], ancestorSha };
}

module.exports = {
  WORKSPACE_PATH,
  WORKSPACE_SCHEMA_VERSION,
  cleanRepoConfig,
  getConfig,
  setConfig,
  getStatus,
  syncBoard,
  downloadBoard,
  listBoards,
  getWorkspace,
  getBoardState,
  pullBoard,
  reconcileBoard,
  mergeBoardPayloads,
};
