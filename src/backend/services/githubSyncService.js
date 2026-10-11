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
const { snapshotBoardHistory } = require("./boardRecoveryService");
const { withFileLock } = require("../utils/fileLock");

const WORKSPACE_PATH = ".freeflow/workspace.json";
const WORKSPACE_SCHEMA_VERSION = 1;
const BOARD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_REMOTE_RESOURCE_COUNT = 4096;
const MAX_REMOTE_RESOURCE_SIZE = 50 * 1024 * 1024;
const MAX_REMOTE_RESOURCE_BYTES = 100 * 1024 * 1024;

function cleanRepoConfig(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    owner: String(source.owner || "").trim(),
    repo: String(source.repo || "").trim(),
    branch: String(source.branch || "main").trim() || "main",
    boardPath: String(source.boardPath || "").trim(),
  };
}

function normalizeWorkspaceRoot(rootPath = "", boardPath = "") {
  const candidate = String(rootPath || "").trim();
  if (candidate) return path.resolve(candidate);
  const currentBoardPath = String(boardPath || "").trim();
  if (currentBoardPath) return path.dirname(path.resolve(currentBoardPath));
  return path.dirname(path.resolve(CANVAS_BOARD_FILE));
}

function normalizeRelativeBoardPath(value = "") {
  const relative = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!relative || relative === "." || relative.split("/").some((part) => !part || part === "." || part === "..")) return "";
  return relative;
}

function boardRelativePath(rootPath, boardPath) {
  const relative = normalizeRelativeBoardPath(path.relative(rootPath, boardPath));
  return relative || path.basename(boardPath);
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

function indexItems(items, conflicts, side) {
  const result = new Map();
  for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
    const id = itemIdentity(item, index);
    if (result.has(id)) {
      conflicts.push({ path: `items[${id}]`, reason: "duplicate-id", side, index });
      continue;
    }
    result.set(id, item);
  }
  return result;
}

function mergeItems(ancestorItems, localItems, remoteItems, conflicts) {
  const ancestor = indexItems(ancestorItems, conflicts, "ancestor");
  const local = indexItems(localItems, conflicts, "local");
  const remote = indexItems(remoteItems, conflicts, "remote");
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
        relativePath: normalizeRelativeBoardPath(board.relativePath || board.localRelativePath || "") || `${String(board.name || id).trim() || id}.freeflow`,
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
  const identity = await auth.getPublicAuthStatus();
  if (identity.user && identity.user.login !== next.owner) throw new Error("账号已变化，请重新加载自己的私有仓库");
  await updateLedger((current) => {
    const previous = current.repository || {};
    if (["owner", "repo", "branch"].every((key) => previous[key] === next[key])) return current;
    // A different repository/branch has no shared sync baseline. Keeping old
    // hashes here would misclassify a new remote as an already trusted copy.
    return { ...current, repository: next, workspaceId: "", remoteWorkspace: null, boards: {} };
  }, SYNC_LEDGER_FILE);
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
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return { hash: "", boardId: "", exists: false, errorCode: "LOCAL_MISSING" };
    }
    return {
      hash: "",
      boardId: "",
      exists: true,
      errorCode: "LOCAL_READ_ERROR",
      errorMessage: String(error?.message || "无法读取本地画布"),
    };
  }
  if (!stat.isFile()) {
    return { hash: "", boardId: "", exists: true, errorCode: "LOCAL_INVALID", errorMessage: "本地画布路径不是文件" };
  }
  try {
    const bundle = await buildSyncBundleFromFile(filePath, { policy });
    return { hash: bundle.boardHash, boardId: bundle.boardId, exists: true, errorCode: "" };
  } catch {
    return { hash: "", boardId: "", exists: true, errorCode: "LOCAL_INVALID", errorMessage: "本地画布格式或大小无效" };
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

async function syncBoard({ boardPath = CANVAS_BOARD_FILE, workspaceRoot = "", policy, message = "Update FreeFlow board", allowRemoteRebase = false, expectedRemoteCommit = "" } = {}) {
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
  const expectedRemote = String(expectedRemoteCommit || "").trim();
  if (expectedRemote && expectedRemote !== snapshot.commitSha) {
    throw new GitHubApiError("远端分支在处理期间再次变化，请重新拉取并处理冲突", {
      status: 409,
      code: "REMOTE_CHANGED",
      expectedBaseSha: expectedRemote,
      currentBaseSha: snapshot.commitSha,
      boardId: bundle.boardId,
    });
  }
  const remoteWorkspace = await readWorkspaceAtSnapshot(client, config, snapshot, ledger.workspaceId);
  const workspace = normalizeWorkspace(remoteWorkspace, config, ledger.workspaceId);
  const remoteBoard = workspace.boards[bundle.boardId];
  if (remoteBoard?.deletedAt && !allowRemoteRebase) {
    throw new GitHubApiError("远端画布已删除，已阻止本地画布自动复活；如需恢复请明确选择保留本地版本", {
      status: 409,
      code: "REMOTE_BOARD_DELETED",
      boardId: bundle.boardId,
      currentBaseSha: snapshot.commitSha,
    });
  }
  const remoteBoardChanged = Boolean(
    remoteBoard?.boardHash && previous?.baseBoardHash && remoteBoard.boardHash !== previous.baseBoardHash,
  );
  const remoteBoardDeleted = Boolean(remoteBoard?.deletedAt);
  const staleBranch = Boolean(previous?.baseRemoteCommit && previous.baseRemoteCommit !== snapshot.commitSha);
  const unknownRemoteBoard = Boolean(!previous && remoteBoard?.boardHash && remoteBoard.boardHash !== bundle.boardHash);
  if ((remoteBoardChanged || remoteBoardDeleted || unknownRemoteBoard || (staleBranch && !remoteBoard)) && !allowRemoteRebase) {
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
  const localWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot || config.boardPath, localPath);
  workspace.boards[bundle.boardId] = {
    boardId: bundle.boardId,
    name: path.basename(localPath).replace(/\.[^.]+$/, "") || bundle.boardId,
    path: `.freeflow/boards/${bundle.boardId}/board.freeflow`,
    manifestPath: `.freeflow/boards/${bundle.boardId}/manifest.json`,
    relativePath: boardRelativePath(localWorkspaceRoot, localPath),
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
    expectedBaseSha: expectedRemote || snapshot.commitSha,
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

async function scanLocalWorkspace({ rootPath = "", policy } = {}) {
  const root = normalizeWorkspaceRoot(rootPath);
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { rootPath: root, boards: [] };
    throw error;
  }
  const boards = [];
  for (const entry of entries) {
    if (!entry?.isFile?.()) continue;
    const name = String(entry.name || "");
    if (name.startsWith(".")) continue;
    if (!/\.(freeflow|json)$/i.test(name)) continue;
    const localPath = path.join(root, name);
    try {
      const boardId = await ensureBoardIdInFile(localPath);
      const bundle = await buildSyncBundleFromFile(localPath, { policy });
      boards.push({
        boardId: bundle.boardId || boardId,
        name: name.replace(/\.[^.]+$/, "") || name,
        relativePath: boardRelativePath(root, localPath),
        localPath,
        localHash: bundle.boardHash,
        bundle,
      });
    } catch {
      // Ignore unrelated JSON files and leave invalid canvas files visible to
      // the existing local repair flow instead of uploading them blindly.
    }
  }
  return { rootPath: root, boards };
}

function workspacePlanState(local, remote, ledgerEntry) {
  if (!local && remote) return "remote-only";
  if (local && !remote) return "local-only";
  if (!local || !remote) return "error";
  if (local.localHash === remote.boardHash) return "up-to-date";
  const baseHash = String(ledgerEntry?.baseBoardHash || ledgerEntry?.localHash || "");
  const remoteChanged = Boolean(baseHash && remote.boardHash && remote.boardHash !== baseHash);
  const localChanged = Boolean(!baseHash || local.localHash !== baseHash);
  if (remoteChanged && localChanged) return "both-changed";
  if (remoteChanged) return "remote-changed";
  return "local-changed";
}

async function getWorkspacePlan({ rootPath = "", boardPath = "", policy } = {}) {
  const config = await getConfig();
  if (!config.owner || !config.repo) throw new Error("请先选择 GitHub 私有仓库");
  const root = normalizeWorkspaceRoot(rootPath || config.boardPath, boardPath);
  const client = await getClient();
  const snapshot = await client.getBranchSnapshot(config.owner, config.repo, config.branch);
  const remoteResult = await listBoards({ includeDeleted: true, context: { client, config, snapshot } });
  const localResult = await scanLocalWorkspace({ rootPath: root, policy });
  const ledger = await readLedger(SYNC_LEDGER_FILE);
  const localById = new Map(localResult.boards.map((board) => [board.boardId, board]));
  const localByPath = new Map(localResult.boards.map((board) => [board.relativePath, board]));
  const remoteById = new Map(remoteResult.boards.map((board) => [board.boardId, board]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);
  const items = [];
  for (const boardId of ids) {
    const local = localById.get(boardId);
    const remote = remoteById.get(boardId);
    const relativePath = normalizeRelativeBoardPath(remote?.relativePath || local?.relativePath || "") || `${String(remote?.name || local?.name || boardId)}.freeflow`;
    const pathMatch = localByPath.get(relativePath);
    const pathCollision = Boolean(!local && pathMatch && pathMatch.boardId !== boardId);
    const pathLocal = local || (pathCollision ? null : pathMatch);
    const state = remote?.deletedAt
      ? (pathLocal ? "deleted-remote" : "deleted")
      : pathCollision
        ? "path-collision"
        : workspacePlanState(pathLocal, remote, ledger.boards[boardId]);
    const targetRelativePath = pathCollision
      ? `${relativePath.replace(/\.[^.]+$/, "")}-${boardId.slice(0, 8)}.freeflow`
      : relativePath;
    items.push({
      boardId,
      name: remote?.name || pathLocal?.name || boardId,
      relativePath: targetRelativePath,
      localPath: pathLocal?.localPath || path.join(root, targetRelativePath),
      localHash: pathLocal?.localHash || "",
      remoteHash: remote?.boardHash || "",
      updatedAt: remote?.updatedAt || "",
      state,
      remote,
    });
  }
  items.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const counts = items.reduce((result, item) => {
    result[item.state] = (result[item.state] || 0) + 1;
    return result;
  }, {});
  return {
    rootPath: root,
    remoteHeadSha: snapshot.commitSha,
    workspace: remoteResult.workspace,
    items,
    counts,
    total: items.length,
    checkedAt: Date.now(),
  };
}

async function syncWorkspace({ rootPath = "", boardPath = "", policy, selectedBoardIds = [], message = "Sync FreeFlow workspace" } = {}) {
  const plan = await getWorkspacePlan({ rootPath, boardPath, policy });
  const config = await getConfig();
  const selected = new Set((Array.isArray(selectedBoardIds) ? selectedBoardIds : []).map((id) => String(id || "").trim()).filter(Boolean));
  const candidates = plan.items.filter((item) => ["local-only", "local-changed"].includes(item.state) && (!selected.size || selected.has(item.boardId)));
  const results = [];
  const filesByPath = new Map();
  const bundles = [];
  let commit = null;
  const workspace = normalizeWorkspace(plan.workspace, config, plan.workspace?.workspaceId || "");
  const updatedAt = new Date().toISOString();
  for (const item of candidates) {
    try {
      const beforeStat = await fs.stat(item.localPath);
      const bundle = await buildSyncBundleFromFile(item.localPath, { policy });
      const afterStat = await fs.stat(item.localPath);
      if (beforeStat.mtimeMs !== afterStat.mtimeMs || beforeStat.size !== afterStat.size) {
        throw new GitHubApiError("同步期间本地画布发生变化，请保存后重试", { status: 409, code: "LOCAL_CHANGED_DURING_SYNC", boardId: item.boardId });
      }
      if (bundle.boardId !== item.boardId) {
        throw new GitHubApiError("本地画布 ID 在同步期间发生变化，请重新生成同步计划", { status: 409, code: "LOCAL_BOARD_ID_CHANGED", boardId: item.boardId });
      }
      for (const file of bundle.files) filesByPath.set(file.path, file);
      workspace.boards[bundle.boardId] = {
        boardId: bundle.boardId,
        name: path.basename(item.localPath).replace(/\.[^.]+$/, "") || bundle.boardId,
        path: `.freeflow/boards/${bundle.boardId}/board.freeflow`,
        manifestPath: `.freeflow/boards/${bundle.boardId}/manifest.json`,
        relativePath: boardRelativePath(plan.rootPath, item.localPath),
        boardHash: bundle.boardHash,
        updatedAt,
        deletedAt: null,
      };
      bundles.push({ item, bundle });
    } catch (error) {
      results.push({ boardId: item.boardId, state: "error", error: error.message, code: error.code || "" });
    }
  }
  if (bundles.length) {
    workspace.updatedAt = updatedAt;
    filesByPath.set(WORKSPACE_PATH, { path: WORKSPACE_PATH, content: Buffer.from(JSON.stringify(workspace, null, 2), "utf8") });
    const client = await getClient();
    try {
      const result = await client.createCommit({
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
        message,
        files: [...filesByPath.values()],
        expectedBaseSha: plan.remoteHeadSha,
      });
      await updateLedger((current) => {
        const nextBoards = { ...current.boards };
        for (const { item, bundle } of bundles) {
          nextBoards[bundle.boardId] = {
            ...(nextBoards[bundle.boardId] || {}),
            boardId: bundle.boardId,
            localPath: path.resolve(item.localPath),
            localHash: bundle.boardHash,
            baseBoardHash: bundle.boardHash,
            remoteHash: bundle.boardHash,
            remoteHeadSha: result.commitSha,
            baseRemoteCommit: result.commitSha,
            ancestorSha: plan.remoteHeadSha,
            syncState: "synced",
            skippedCount: bundle.manifest.skippedCount,
            assetBytes: bundle.manifest.assetBytes,
            relativePath: boardRelativePath(plan.rootPath, item.localPath),
            updatedAt,
          };
          results.push({ boardId: bundle.boardId, state: "synced", commitSha: result.commitSha, bundle: { ...bundle, files: bundle.files.map(({ content, ...file }) => file) } });
        }
        return { ...current, repository: config, workspaceId: workspace.workspaceId, remoteWorkspace: workspace, boards: nextBoards };
      }, SYNC_LEDGER_FILE);
      commit = result;
    } catch (error) {
      for (const { item } of bundles) results.push({ boardId: item.boardId, state: "error", error: error.message, code: error.code || "" });
    }
  }
  const refreshed = await getWorkspacePlan({ rootPath: plan.rootPath, policy });
  return { ok: true, mode: "workspace", rootPath: plan.rootPath, plan, results, commit, refreshed, counts: refreshed.counts };
}

async function pullWorkspace({ rootPath = "", boardPath = "", policy, selectedBoardIds = [] } = {}) {
  const plan = await getWorkspacePlan({ rootPath, boardPath, policy });
  const selected = new Set((Array.isArray(selectedBoardIds) ? selectedBoardIds : []).map((id) => String(id || "").trim()).filter(Boolean));
  const candidates = plan.items.filter((item) => ["remote-only", "remote-changed"].includes(item.state) && (!selected.size || selected.has(item.boardId)));
  const results = [];
  for (const item of candidates) {
    try {
      results.push({ boardId: item.boardId, ...(await downloadBoard({ boardId: item.boardId, boardPath: item.localPath, remoteCommit: plan.remoteHeadSha, force: false })) });
    } catch (error) {
      results.push({ boardId: item.boardId, state: "error", error: error.message, code: error.code || "" });
    }
  }
  const refreshed = await getWorkspacePlan({ rootPath: plan.rootPath, policy });
  return { ok: true, mode: "workspace", rootPath: plan.rootPath, plan, results, refreshed, counts: refreshed.counts };
}

function resourcePathIsSafe(resourcePath = "") {
  const value = String(resourcePath || "");
  const prefix = ".freeflow/assets/";
  if (!value.startsWith(prefix)) return false;
  const filename = value.slice(prefix.length);
  if (!filename || filename.includes("/") || filename.includes("\\") || filename === "." || filename === "..") return false;
  const separator = filename.indexOf(".");
  if (separator !== 64) return false;
  const extension = filename.slice(separator + 1);
  return resourceHashIsValid(filename.slice(0, separator))
    && extension.length >= 1
    && extension.length <= 32
    && !/[\u0000-\u001f\u007f./\\]/.test(extension);
}

function resourceHashIsValid(value = "") {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

function validateRemoteResources(resources = []) {
  if (!Array.isArray(resources)) return { totalBytes: 0 };
  if (resources.length > MAX_REMOTE_RESOURCE_COUNT) {
    throw new GitHubApiError("远端附件数量超过安全限制", { status: 413, code: "REMOTE_RESOURCE_LIMIT" });
  }
  const paths = new Set();
  const hashes = new Set();
  let totalBytes = 0;
  for (const resource of resources) {
    const resourcePath = String(resource?.path || "");
    const sha256 = String(resource?.sha256 || "").toLowerCase();
    const sizeBytes = Number(resource?.sizeBytes);
    if (!resourcePathIsSafe(resourcePath) || !resourceHashIsValid(sha256)) {
      throw new GitHubApiError("远端附件清单路径或哈希无效", { status: 422, code: "REMOTE_INTEGRITY_ERROR" });
    }
    const filenameHash = resourcePath.slice(".freeflow/assets/".length).split(".", 1)[0].toLowerCase();
    if (filenameHash !== sha256 || paths.has(resourcePath) || hashes.has(sha256)) {
      throw new GitHubApiError("远端附件清单包含重复或不一致的哈希", { status: 422, code: "REMOTE_INTEGRITY_ERROR" });
    }
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > MAX_REMOTE_RESOURCE_SIZE) {
      throw new GitHubApiError("远端附件大小超出安全限制", { status: 413, code: "REMOTE_RESOURCE_LIMIT" });
    }
    totalBytes += sizeBytes;
    if (totalBytes > MAX_REMOTE_RESOURCE_BYTES) {
      throw new GitHubApiError("远端附件总大小超过安全限制", { status: 413, code: "REMOTE_RESOURCE_LIMIT" });
    }
    paths.add(resourcePath);
    hashes.add(sha256);
  }
  return { totalBytes };
}

async function downloadBoard({ boardId, boardPath = CANVAS_BOARD_FILE, remoteCommit = "", force = false } = {}) {
  const config = await getConfig();
  const id = assertBoardId(boardId);
  if (!config.owner || !config.repo) throw new Error("下载画布所需参数不完整");
  const targetPath = path.resolve(boardPath);
  const localLedger = await readLedger(SYNC_LEDGER_FILE);
  const existingEntry = localLedger.boards[id];
  const local = await readLocalSyncHash(targetPath);
  if (!force && local.exists && !local.hash && local.errorCode !== "LOCAL_MISSING") {
    throw new GitHubApiError("本地画布无法解析或读取，已阻止远端覆盖", {
      status: 409,
      code: "SYNC_CONFLICT",
      reason: local.errorCode || "LOCAL_INVALID",
      boardId: id,
    });
  }
  if (!force && existingEntry?.localPath === targetPath && existingEntry.localHash && local.hash !== existingEntry.localHash) {
    throw new GitHubApiError("本地画布有未同步修改，已阻止远端覆盖", { status: 409, code: "SYNC_CONFLICT", boardId: id });
  }
  if (!force && local.exists && !existingEntry && !remoteCommit && local.hash && targetPath === path.resolve(CANVAS_BOARD_FILE)) {
    throw new GitHubApiError("本地画布没有同步基线，已阻止远端覆盖；请明确选择使用远端版本", {
      status: 409, code: "SYNC_BASE_UNKNOWN", boardId: id,
    });
  }
  const client = await getClient();
  const snapshot = await getSnapshotAtRef(client, config, remoteCommit);
  const remote = await readRemoteBoardAtSnapshot(client, config, snapshot, id);
  const manifest = remote.manifest;
  if (manifest?.resources != null && !Array.isArray(manifest.resources)) {
    throw new GitHubApiError("远端附件清单格式无效", { status: 422, code: "REMOTE_INTEGRITY_ERROR" });
  }
  const resources = Array.isArray(manifest?.resources) ? manifest.resources : [];
  validateRemoteResources(resources);
  const resourcePaths = resources.map((resource) => String(resource?.path || ""));
  const files = await client.getFilesAtSnapshot(config.owner, config.repo, snapshot, resourcePaths);
  const targetRoot = path.dirname(targetPath);
  await fs.mkdir(targetRoot, { recursive: true });
  const stagingRoot = await fs.mkdtemp(path.join(targetRoot, `.freeflow-download-${id}-`));
  try {
  const localAssetRoot = path.join(stagingRoot, "assets");
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
    const assetWrite = await atomicWriteFile(path.join(localAssetRoot, path.basename(resource.path)), bytes, { fsync: true });
    if (!assetWrite.ok) throw new Error(assetWrite.error || "无法物化远端附件");
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
  const stagedBoardPath = path.join(stagingRoot, path.basename(targetPath));
  const result = await writeDownloadedBoard(stagedBoardPath, boardText);
  if (missingResources.length) {
    await fs.rm(stagingRoot, { recursive: true, force: true });
    throw new GitHubApiError("远端附件不完整，已阻止部分下载覆盖本地画布", {
      status: 422, code: "REMOTE_INTEGRITY_ERROR", boardId: id, missingResources,
    });
  }
  const materialized = await readLocalSyncHash(stagedBoardPath);
  if (!materialized.hash || materialized.hash !== remote.boardHash) {
    await fs.rm(stagingRoot, { recursive: true, force: true });
    throw new GitHubApiError("下载后的画布校验和不一致，已阻止覆盖本地文件", { status: 422, code: "REMOTE_INTEGRITY_ERROR", boardId: id });
  }
  return await withFileLock(targetPath, async () => {
    const latest = await readLocalSyncHash(targetPath);
    if (latest.exists !== local.exists || latest.hash !== local.hash || latest.errorCode !== local.errorCode) {
      throw new GitHubApiError("下载期间本地画布已变化，已停止覆盖，请重新检查同步状态", { status: 409, code: "LOCAL_CHANGED_DURING_SYNC", boardId: id });
    }
    await snapshotBoardHistory(targetPath, { reason: "pull" });
    const stagedAssets = path.join(stagingRoot, "assets");
    const finalAssets = path.join(targetRoot, "assets");
    // Publish verified content-addressed assets first. Existing boards and history retain their assets.
    await fs.mkdir(finalAssets, { recursive: true });
    for (const name of await fs.readdir(stagedAssets)) {
      const written = await atomicWriteFile(path.join(finalAssets, name), await fs.readFile(path.join(stagedAssets, name)), { fsync: true });
      if (!written.ok) throw new Error(written.error || "附件保存失败，当前画布已保留");
    }
    const published = await atomicWriteFile(targetPath, await fs.readFile(stagedBoardPath), { fsync: true });
    if (!published.ok) throw new Error(published.error || "画布保存失败，当前画布已保留");
  const syncState = "synced";
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
        updatedAt: new Date().toISOString(),
        skippedCount: Number(manifest?.skippedCount) || missingResources.length,
        assetBytes: Number(manifest?.assetBytes) || 0,
      },
    },
  }), SYNC_LEDGER_FILE);
  return { ...result, filePath: targetPath, boardId: id, manifest, remoteCommit: snapshot.commitSha, missingResources, syncState, ledger };
  });
  } finally { await fs.rm(stagingRoot, { recursive: true, force: true }); }
}

async function listBoards({ includeDeleted = false, context } = {}) {
  const config = context?.config || await getConfig();
  if (!config.owner || !config.repo) throw new Error("请先选择 GitHub 私有仓库");
  const client = context?.client || await getClient();
  const snapshot = context?.snapshot || await client.getBranchSnapshot(config.owner, config.repo, config.branch);
  const ledger = await readLedger(SYNC_LEDGER_FILE);
  const workspace = await readWorkspaceAtSnapshot(client, config, snapshot, ledger.workspaceId);
  const boards = Object.values(workspace.boards).filter((board) => includeDeleted || !board.deletedAt);
  // A present workspace is authoritative, including when every board is
  // tombstoned. Only legacy repositories without workspace.json should use
  // the tree scan fallback; otherwise deleted boards would reappear.
  const hasWorkspaceFile = snapshot.entries.some((entry) => entry?.type === "blob" && String(entry.path || "") === WORKSPACE_PATH);
  if (boards.length || hasWorkspaceFile) return { workspace, boards, remoteHeadSha: snapshot.commitSha };
  const discovered = new Map();
  for (const entry of snapshot.entries) {
    const match = String(entry?.path || "").match(/^\.freeflow\/boards\/([^/]+)\/board\.freeflow$/);
    if (!match || !isSafeBoardId(match[1])) continue;
    discovered.set(match[1], {
      boardId: match[1],
      name: match[1],
      path: entry.path,
      manifestPath: `.freeflow/boards/${match[1]}/manifest.json`,
      relativePath: `${match[1]}.freeflow`,
      boardHash: "",
      updatedAt: "",
      deletedAt: null,
    });
  }
  return { workspace, boards: [...discovered.values()], remoteHeadSha: snapshot.commitSha };
}

async function getWorkspace(options = {}) {
  const result = await listBoards(options);
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
  const localExists = Boolean(local.exists);
  const remoteHash = remote.boardHash || String(remote.manifest?.boardHash || "");
  let state = "remote-changed";
  if (!localExists) state = "remote-only";
  else if (local.errorCode) state = "local-invalid";
  else if (local.hash === remoteHash) state = "up-to-date";
  else if (entry.baseRemoteCommit && entry.baseRemoteCommit === snapshot.commitSha) state = "local-changed";
  else if (entry.localHash && local.hash === entry.localHash) state = "remote-changed";
  else state = "both-changed";
  return {
    boardId: id,
    state,
    localPath,
    localHash: local.hash,
    localError: local.errorCode || "",
    remoteHash,
    remoteCommit: snapshot.commitSha,
    baseRemoteCommit: entry.baseRemoteCommit || "",
    manifest: remote.manifest,
  };
}

async function pullBoard(options = {}) {
  const state = await getBoardState(options);
  if (state.state === "up-to-date") return { ok: true, pulled: false, state };
  if (state.state === "local-invalid") {
    throw new GitHubApiError("本地画布无法解析或读取，请修复或明确选择使用远端版本", { status: 409, code: "SYNC_CONFLICT", state });
  }
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
  if (selected === "local") return syncBoard({ boardPath: state.localPath, allowRemoteRebase: true, expectedRemoteCommit: state.remoteCommit, message: "Resolve FreeFlow sync conflict (local)" });
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
  const beforeMerge = await readLocalSyncHash(state.localPath);
  if (beforeMerge.hash !== state.localHash) {
    throw new GitHubApiError("合并期间本地画布发生变化，已保留当前编辑", { status: 409, code: "LOCAL_CHANGED_DURING_SYNC", state });
  }
  const mergedBundle = await require("./freeflowSyncModel").buildSyncBundleFromPayload(merged.payload, {
    baseDir: path.dirname(state.localPath),
  });
  const mergedText = mergedBundle.boardText;
  await writeDownloadedBoard(state.localPath, mergedText);
  const synced = await syncBoard({ boardPath: state.localPath, allowRemoteRebase: true, expectedRemoteCommit: state.remoteCommit, message: "Resolve FreeFlow sync conflict (merge)" });
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
  scanLocalWorkspace,
  getWorkspacePlan,
  syncWorkspace,
  pullWorkspace,
  mergeBoardPayloads,
  readLocalSyncHash,
  validateRemoteResources,
};

// Serialize public operations with credential and repository mutations. Internal
// calls use the functions above directly, so nested pull/merge operations do not
// re-enter the queue. A failed operation does not poison subsequent retries.
for (const name of ["getConfig", "setConfig", "getStatus", "syncBoard", "downloadBoard", "listBoards", "getWorkspace", "getBoardState", "pullBoard", "reconcileBoard", "getWorkspacePlan", "syncWorkspace", "pullWorkspace"]) {
  const operation = module.exports[name];
  module.exports[name] = (...args) => auth.withConnectionOperation(() => operation(...args));
}
