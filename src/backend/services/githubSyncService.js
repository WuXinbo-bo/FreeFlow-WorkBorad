const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { GITHUB_SYNC_SETTINGS_FILE, SYNC_LEDGER_FILE, CANVAS_BOARD_FILE } = require("../config/paths");
const { GitHubApiClient, GitHubApiError } = require("./githubApiClient");
const auth = require("./githubAuthService");
const {
  SYNC_SCHEMA_VERSION,
  buildSyncBundleFromFile,
  buildSyncBundleFromPayload,
  writeDownloadedBoard,
  ensureBoardIdInFile,
  hashJson,
  stableValue,
} = require("./freeflowSyncModel");
const { parseBoardFileText, checkFileSizeSafe } = require("../models/canvasBoardFileFormat");
const { readLedger, updateLedger } = require("./syncLedgerService");
const { atomicWriteFile } = require("../utils/atomicWrite");
const { snapshotBoardHistory, trashCanvasBoard, moveCanvasHistory } = require("./boardRecoveryService");
const { normalizeRelativeBoardPath, pathKey, isWithinRoot, assertSafeWorkspaceTarget } = require("./syncPathSafety");
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

function boardRelativePath(rootPath, boardPath) {
  const relative = normalizeRelativeBoardPath(path.relative(rootPath, boardPath));
  if (!relative || !isWithinRoot(rootPath, boardPath)) {
    throw new GitHubApiError("画布名称或路径无法跨设备安全同步", { status: 400, code: "UNSAFE_LOCAL_PATH" });
  }
  return relative;
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
  const order = [...new Set([...ancestor.keys(), ...local.keys(), ...remote.keys()])];
  const mergedById = new Map();
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
    if (result !== undefined) mergedById.set(id, result);
  }
  const byId = mergedById;
  const surviving = (keys) => [...keys].filter((id) => byId.has(id));
  const baseOrder = surviving(ancestor.keys());
  const localBase = surviving(local.keys()).filter((id) => ancestor.has(id));
  const remoteBase = surviving(remote.keys()).filter((id) => ancestor.has(id));
  const localReordered = !valuesEqual(localBase, baseOrder);
  const remoteReordered = !valuesEqual(remoteBase, baseOrder);
  const chosen = localReordered ? localBase : remoteReordered ? remoteBase : baseOrder;
  if (localReordered && remoteReordered && !valuesEqual(localBase, remoteBase)) {
    conflicts.push({ path: "items.order", reason: "concurrent-reorder", ancestor: baseOrder, local: localBase, remote: remoteBase });
  }
  const edges = new Map([...byId.keys()].map((id) => [id, new Set()]));
  const connect = (list, additionsOnly = false) => {
    for (let i = 1; i < list.length; i += 1) {
      if (!additionsOnly || !ancestor.has(list[i - 1]) || !ancestor.has(list[i])) edges.get(list[i - 1]).add(list[i]);
    }
  };
  connect(chosen);
  connect(surviving(local.keys()), true);
  connect(surviving(remote.keys()), true);
  const remaining = new Set([...chosen, ...surviving(local.keys()), ...surviving(remote.keys())]);
  const candidates = [...remaining];
  const rank = new Map(candidates.map((id, index) => [id, index]));
  const indegree = new Map(candidates.map((id) => [id, 0]));
  for (const targets of edges.values()) for (const id of targets) indegree.set(id, indegree.get(id) + 1);
  // A rank heap keeps the previous stable tie order without repeatedly scanning
  // every remaining element and edge for each selected element.
  const ready = [];
  const enqueue = (value) => {
    let index = ready.length;
    ready.push(value);
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (ready[parent] <= value) break;
      ready[index] = ready[parent]; index = parent;
    }
    ready[index] = value;
  };
  const dequeue = () => {
    const first = ready[0];
    const tail = ready.pop();
    if (ready.length) {
      let index = 0;
      while (index * 2 + 1 < ready.length) {
        let child = index * 2 + 1;
        if (child + 1 < ready.length && ready[child + 1] < ready[child]) child += 1;
        if (tail <= ready[child]) break;
        ready[index] = ready[child]; index = child;
      }
      ready[index] = tail;
    }
    return first;
  };
  for (const id of candidates) if (indegree.get(id) === 0) enqueue(rank.get(id));
  const sorted = [];
  while (ready.length) {
    const next = candidates[dequeue()];
    sorted.push(next); remaining.delete(next);
    for (const id of edges.get(next)) {
      indegree.set(id, indegree.get(id) - 1);
      if (indegree.get(id) === 0) enqueue(rank.get(id));
    }
  }
  if (remaining.size) {
    conflicts.push({ path: "items.order", reason: "incompatible-insertion-order" });
    sorted.push(...remaining);
  }
  return sorted.map((id) => byId.get(id));
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

function remoteRelativeBoardPath(board, id) {
  const raw = String(board.relativePath || board.localRelativePath || "");
  if (!raw) return `${id}.freeflow`;
  const relative = normalizeRelativeBoardPath(raw);
  if (!relative || !/\.(freeflow|json)$/i.test(relative)) {
    throw new GitHubApiError("远端画布保存路径无效，已阻止下载", { status: 422, code: "UNSAFE_REMOTE_PATH", boardId: id });
  }
  return relative;
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
        relativePath: remoteRelativeBoardPath(board, id),
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
  const root = path.dirname(filePath);
  const conflictRoot = path.join(root, ".freeflow-conflicts", boardId, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
  await assertSafeWorkspaceTarget(root, conflictRoot);
  await fs.mkdir(conflictRoot, { recursive: true });
  const files = {
    ancestor: ancestor?.raw || JSON.stringify(ancestor?.payload || {}, null, 2),
    local: local?.raw || JSON.stringify(local?.payload || {}, null, 2),
    remote: remote?.raw || JSON.stringify(remote?.payload || {}, null, 2),
    merged: JSON.stringify(merged?.payload || {}, null, 2),
  };
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(conflictRoot, `${name}.freeflow`);
    await assertSafeWorkspaceTarget(root, target);
    const result = await atomicWriteFile(target, content, { fsync: true });
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
  const localWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot, localPath);
  await assertSafeWorkspaceTarget(localWorkspaceRoot, localPath);
  const ledger = await readLedger(SYNC_LEDGER_FILE);
  let previous = Object.values(ledger.boards).find((entry) => entry.localPath === localPath);
  await ensureBoardIdInFile(boardPath, previous?.boardId);
  const beforeStat = await fs.stat(boardPath);
  const bundle = await buildSyncBundleFromFile(boardPath, { policy });
  assertBoardId(bundle.boardId);
  previous = ledger.boards[bundle.boardId];
  const scanned = await scanLocalWorkspace({ rootPath: localWorkspaceRoot, metadataOnly: true });
  if (scanned.boards.filter((board) => board.boardId === bundle.boardId).length > 1) {
    throw new GitHubApiError("多个本地画布具有相同 ID，请先使用另存为副本生成独立 ID", { status: 409, code: "DUPLICATE_BOARD_ID", boardId: bundle.boardId });
  }
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
  let remoteBoard = workspace.boards[bundle.boardId];
  if ((remoteBoard && !remoteBoard.deletedAt) || snapshot.entries.some((entry) => entry.path === boardPaths(bundle.boardId).board)) {
    const remoteContent = await readRemoteBoardAtSnapshot(client, config, snapshot, bundle.boardId);
    remoteBoard = { ...remoteBoard, boardHash: remoteContent.boardHash };
  }
  const relativePath = boardRelativePath(localWorkspaceRoot, localPath);
  if (Object.values(workspace.boards).some((board) => board.boardId !== bundle.boardId && !board.deletedAt && pathKey(board.relativePath) === pathKey(relativePath))) {
    throw new GitHubApiError("远端已存在同名画布，请先重命名本地画布", { status: 409, code: "PATH_COLLISION", boardId: bundle.boardId });
  }
  if (remoteBoard?.deletedAt && !allowRemoteRebase) {
    throw new GitHubApiError("远端画布已删除，已阻止本地画布自动复活；如需恢复请明确选择保留本地版本", {
      status: 409,
      code: "REMOTE_BOARD_DELETED",
      boardId: bundle.boardId,
      currentBaseSha: snapshot.commitSha,
    });
  }
  const comparison = workspacePlanState({ localHash: bundle.boardHash }, remoteBoard, previous);
  if (["remote-changed", "both-changed"].includes(comparison) && !allowRemoteRebase) {
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
  let ledgerWarning = "";
  try { await updateLedger((current) => ({
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
        workspaceRoot: localWorkspaceRoot,
        relativePath,
        localRelativePath: relativePath,
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
  }), SYNC_LEDGER_FILE); } catch (error) { ledgerWarning = error.message || "同步账本保存失败，请重新检查状态"; }
  return {
    ...result,
    operationCompleted: true,
    ...(ledgerWarning ? { ledgerWarning } : {}),
    workspace,
    bundle: { ...bundle, files: files.map(({ content, ...file }) => file) },
  };
}

async function scanLocalWorkspace({ rootPath = "", policy, metadataOnly = false } = {}) {
  const root = normalizeWorkspaceRoot(rootPath);
  const boards = [];
  const warnings = [];
  let visited = 0;
  async function scan(directory, depth = 0) {
    if (depth > 32 || visited > 50000) throw new GitHubApiError("工作区目录过大，请选择更具体的画布文件夹", { status: 413, code: "WORKSPACE_SCAN_LIMIT" });
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT" && directory === root) return; throw error; }
    for (const entry of entries) {
      visited += 1;
      if (visited > 50000) throw new GitHubApiError("工作区目录过大，请选择更具体的画布文件夹", { status: 413, code: "WORKSPACE_SCAN_LIMIT" });
      const name = String(entry.name || "");
      if (name.startsWith(".") || entry.isSymbolicLink() || ["node_modules", "assets"].includes(name)) continue;
      const localPath = path.join(directory, name);
      if (entry.isDirectory()) {
        await assertSafeWorkspaceTarget(root, localPath);
        await scan(localPath, depth + 1);
        continue;
      }
      if (!entry.isFile() || !/\.(freeflow|json)$/i.test(name)) continue;
      try {
        await assertSafeWorkspaceTarget(root, localPath);
        const relativePath = boardRelativePath(root, localPath);
        checkFileSizeSafe((await fs.stat(localPath)).size);
        const parsed = parseBoardFileText(await fs.readFile(localPath, "utf8"));
        const board = boardFromPayload(parsed.payload);
        if (!Array.isArray(board.items)) continue; // Unrelated JSON must not gain a canvas ID.
        const boardId = String(board.boardId || parsed.payload?.boardId || "").trim()
          || (metadataOnly ? "" : await ensureBoardIdInFile(localPath));
        if (!boardId) continue;
        assertBoardId(boardId);
        const bundle = metadataOnly ? null : await buildSyncBundleFromFile(localPath, { policy });
        boards.push({ boardId, name: name.replace(/\.[^.]+$/, "") || name, relativePath, localPath, localHash: bundle?.boardHash || "", ...(bundle ? { bundle } : {}) });
      } catch (error) {
        if (/\.freeflow$/i.test(name)) warnings.push({ localPath, code: error.code || "LOCAL_INVALID", error: error.message });
      }
    }
  }
  await scan(root);
  return { rootPath: root, boards, warnings };
}

function workspacePlanState(local, remote, ledgerEntry) {
  if (!local && remote) return "remote-only";
  if (local && !remote) return ledgerEntry?.baseRemoteCommit ? "both-changed" : "local-only";
  if (!local || !remote) return "error";
  if (local.localHash === remote.boardHash) return "up-to-date";
  const baseHash = String(ledgerEntry?.baseBoardHash || ledgerEntry?.localHash || "");
  // Different copies without a common ancestor require an explicit decision.
  if (!baseHash) return "both-changed";
  const remoteChanged = Boolean(remote.boardHash && remote.boardHash !== baseHash);
  const localChanged = local.localHash !== baseHash;
  if (remoteChanged && localChanged) return "both-changed";
  if (remoteChanged) return "remote-changed";
  return "local-changed";
}

function planCounts(items) {
  return items.reduce((result, item) => { result[item.state] = (result[item.state] || 0) + 1; return result; }, {});
}

async function getWorkspacePlan({ rootPath = "", boardPath = "", policy } = {}) {
  const config = await getConfig();
  if (!config.owner || !config.repo) throw new Error("请先选择 GitHub 私有仓库");
  const root = normalizeWorkspaceRoot(rootPath || config.boardPath, boardPath);
  const client = await getClient();
  const snapshot = await client.getBranchSnapshot(config.owner, config.repo, config.branch);
  const remoteResult = await listBoards({ includeDeleted: true, context: { client, config, snapshot } });
  // The board/manifest blobs are authoritative even when another writer did
  // not update workspace.json (legacy clients and interrupted migrations).
  for (const board of remoteResult.boards) {
    if (board.deletedAt) continue;
    const content = await readRemoteBoardAtSnapshot(client, config, snapshot, board.boardId);
    board.boardHash = content.boardHash;
  }
  const localResult = await scanLocalWorkspace({ rootPath: root, policy });
  const ledger = await readLedger(SYNC_LEDGER_FILE);
  const localGroups = new Map();
  for (const board of localResult.boards) localGroups.set(board.boardId, [...(localGroups.get(board.boardId) || []), board]);
  const localByPath = new Map(localResult.boards.map((board) => [pathKey(board.relativePath), board]));
  const remoteById = new Map(remoteResult.boards.map((board) => [board.boardId, board]));
  const remotePaths = new Map();
  for (const board of remoteResult.boards.filter((board) => !board.deletedAt)) remotePaths.set(pathKey(board.relativePath), [...(remotePaths.get(pathKey(board.relativePath)) || []), board.boardId]);
  const ids = new Set([...localGroups.keys(), ...remoteById.keys()]);
  const items = [];
  for (const boardId of ids) {
    const locals = localGroups.get(boardId) || [];
    const local = locals[0];
    const remote = remoteById.get(boardId);
    const entry = ledger.boards[boardId];
    const remoteRelative = remote?.relativePath || local?.relativePath;
    const pathMatch = localByPath.get(pathKey(remoteRelative));
    const pathCollision = Boolean((pathMatch && pathMatch.boardId !== boardId) || (remotePaths.get(pathKey(remoteRelative)) || []).length > 1);
    let state = workspacePlanState(local, remote, entry);
    const localRenamed = Boolean(local && entry?.localPath && path.resolve(entry.localPath) !== local.localPath);
    const remoteRenamed = Boolean(remote && entry?.relativePath && pathKey(remote.relativePath) !== pathKey(entry.relativePath));
    if (state === "up-to-date" || state === "local-changed" || state === "remote-changed") {
      if (localRenamed && remoteRenamed && pathKey(local.relativePath) !== pathKey(remote.relativePath)) state = "path-collision";
      else if ((remoteRenamed && state === "local-changed") || (localRenamed && state === "remote-changed")) state = "both-changed";
      else if (localRenamed) state = "local-renamed";
      else if (remoteRenamed) state = "remote-renamed";
    }
    if (!local && remote && entry?.localPath && isWithinRoot(root, entry.localPath)) state = "local-missing";
    if (remote?.deletedAt) state = local ? "deleted-remote" : "deleted";
    if (localResult.warnings.some((warning) => pathKey(warning.localPath) === pathKey(path.join(root, remoteRelative)))) state = "local-invalid";
    if (pathCollision) state = "path-collision";
    if (locals.length > 1) state = "duplicate-id";
    const relativePath = state === "local-renamed" || !remote ? local.relativePath : remote.relativePath;
    const targetPath = path.join(root, relativePath);
    if (Object.values(remoteResult.workspace.boards).some((board) => board.boardId !== boardId && !board.deletedAt && pathKey(board.relativePath) === pathKey(relativePath))) state = "path-collision";
    if (localResult.boards.filter((board) => pathKey(board.relativePath) === pathKey(relativePath)).length > 1) state = "path-collision";
    try { await assertSafeWorkspaceTarget(root, targetPath); }
    catch (error) { state = "path-collision"; }
    items.push({ boardId, name: local?.name || remote?.name || boardId, relativePath,
      localPath: local?.localPath || targetPath, targetPath,
      localHash: local?.localHash || "", remoteHash: remote?.boardHash || "", updatedAt: remote?.updatedAt || "",
      state, remote, ...(locals.length > 1 ? { localPaths: locals.map((board) => board.localPath) } : {}),
      ...(state === "local-missing" ? { deletionRequiresConfirmation: true } : {}),
    });
  }
  items.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return { rootPath: root, remoteHeadSha: snapshot.commitSha, workspace: remoteResult.workspace, items, counts: planCounts(items), total: items.length, checkedAt: Date.now(), warnings: localResult.warnings };
}

function completedWorkspacePlan(plan, results, commit) {
  const completed = new Map(results.filter((item) => !item.error && ["synced", "up-to-date"].includes(item.state || item.syncState)).map((item) => [item.boardId, item]));
  const items = plan.items.map((item) => completed.has(item.boardId) ? { ...item, state: "up-to-date", localPath: completed.get(item.boardId).filePath || item.localPath, localHash: completed.get(item.boardId).boardHash || item.remoteHash || item.localHash, remoteHash: completed.get(item.boardId).boardHash || item.remoteHash || item.localHash } : item);
  return { ...plan, items, counts: planCounts(items), checkedAt: Date.now(), remoteHeadSha: commit?.commitSha || plan.remoteHeadSha, snapshotBased: true };
}

async function syncWorkspace({ rootPath = "", boardPath = "", policy, selectedBoardIds = [], message = "Sync FreeFlow workspace" } = {}) {
  const plan = await getWorkspacePlan({ rootPath, boardPath, policy });
  const config = await getConfig();
  const selected = new Set((Array.isArray(selectedBoardIds) ? selectedBoardIds : []).map((id) => String(id || "").trim()).filter(Boolean));
  const candidates = plan.items.filter((item) => ["local-only", "local-changed", "local-renamed"].includes(item.state) && (!selected.size || selected.has(item.boardId)));
  const results = [];
  const filesByPath = new Map();
  const bundles = [];
  let commit = null;
  let ledgerWarning = "";
  const workspace = normalizeWorkspace(plan.workspace, config, plan.workspace?.workspaceId || "");
  const updatedAt = new Date().toISOString();
  for (const item of candidates) {
    try {
      await assertSafeWorkspaceTarget(plan.rootPath, item.localPath);
      const beforeStat = await fs.stat(item.localPath);
      const bundle = await buildSyncBundleFromFile(item.localPath, { policy });
      const afterStat = await fs.stat(item.localPath);
      if (beforeStat.mtimeMs !== afterStat.mtimeMs || beforeStat.size !== afterStat.size) {
        throw new GitHubApiError("同步期间本地画布发生变化，请保存后重试", { status: 409, code: "LOCAL_CHANGED_DURING_SYNC", boardId: item.boardId });
      }
      if (bundle.boardHash !== item.localHash) throw new GitHubApiError("画布在检查后发生变化，请保存后重新检查", { status: 409, code: "LOCAL_CHANGED_DURING_SYNC", boardId: item.boardId });
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
      commit = result;
      try { await updateLedger((current) => {
        const nextBoards = { ...current.boards };
        for (const { item, bundle } of bundles) {
          nextBoards[bundle.boardId] = {
            ...(nextBoards[bundle.boardId] || {}),
            boardId: bundle.boardId,
            localPath: path.resolve(item.localPath),
            workspaceRoot: plan.rootPath,
            localRelativePath: boardRelativePath(plan.rootPath, item.localPath),
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
        }
        return { ...current, repository: config, workspaceId: workspace.workspaceId, remoteWorkspace: workspace, boards: nextBoards };
      }, SYNC_LEDGER_FILE); } catch (error) { ledgerWarning = error.message || "同步账本保存失败，请重新检查状态"; }
      for (const { bundle } of bundles) results.push({ boardId: bundle.boardId, boardHash: bundle.boardHash, state: "synced", commitSha: result.commitSha, bundle: { ...bundle, files: bundle.files.map(({ content, ...file }) => file) } });
    } catch (error) {
      if (error.code === "COMMIT_RESULT_UNKNOWN") throw error;
      for (const { item } of bundles) results.push({ boardId: item.boardId, state: "error", error: error.message, code: error.code || "" });
    }
  }
  const refreshed = completedWorkspacePlan(plan, results, commit);
  return { ok: true, operationCompleted: true, mode: "workspace", rootPath: plan.rootPath, plan, results, commit, refreshed, counts: refreshed.counts, ...(ledgerWarning ? { ledgerWarning } : {}) };
}

async function pullWorkspace({ rootPath = "", boardPath = "", policy, selectedBoardIds = [] } = {}) {
  const plan = await getWorkspacePlan({ rootPath, boardPath, policy });
  const selected = new Set((Array.isArray(selectedBoardIds) ? selectedBoardIds : []).map((id) => String(id || "").trim()).filter(Boolean));
  const candidates = plan.items.filter((item) => ["remote-only", "remote-changed", "local-missing", "remote-renamed"].includes(item.state) && (!selected.size || selected.has(item.boardId)));
  const results = [];
  for (const item of candidates) {
    try {
      results.push({ boardId: item.boardId, ...(await pullPlannedBoard(item, plan)) });
    } catch (error) {
      results.push({ boardId: item.boardId, state: "error", error: error.message, code: error.code || "" });
    }
  }
  const refreshed = completedWorkspacePlan(plan, results);
  return { ok: true, operationCompleted: true, mode: "workspace", rootPath: plan.rootPath, plan, results, refreshed, counts: refreshed.counts };
}

async function pullPlannedBoard(item, plan) {
  const targetPath = item.state === "remote-renamed" ? item.targetPath : item.localPath;
  await assertSafeWorkspaceTarget(plan.rootPath, targetPath);
  if (item.state === "remote-renamed" && targetPath !== item.localPath) {
    const old = await readLocalSyncHash(item.localPath);
    if (old.hash !== item.localHash) throw new GitHubApiError("重命名期间本地画布发生变化，请重新检查", { status: 409, code: "LOCAL_CHANGED_DURING_SYNC" });
    const target = await readLocalSyncHash(targetPath);
    if (target.exists) throw new GitHubApiError("重命名目标已存在，已保留两个文件", { status: 409, code: "PATH_COLLISION" });
  }
  const result = await downloadBoard({ boardId: item.boardId, boardPath: targetPath, rootPath: plan.rootPath, remoteCommit: plan.remoteHeadSha });
  if (item.state === "remote-renamed" && targetPath !== item.localPath) {
    try {
      const raw = await fs.readFile(item.localPath);
      const latest = await buildSyncBundleFromPayload(parseBoardFileText(raw.toString("utf8")).payload, { baseDir: path.dirname(item.localPath) });
      if (latest.boardHash !== item.localHash) throw new GitHubApiError("原文件在操作期间被修改", { code: "LOCAL_CHANGED_DURING_SYNC" });
      await moveCanvasHistory(item.localPath, targetPath);
      await trashCanvasBoard(item.localPath, { expectedContentHash: crypto.createHash("sha256").update(raw).digest("hex") });
      return { ...result, renamedFrom: item.localPath };
    } catch (error) {
      return { ...result, state: "error", error: `新位置已拉取，原文件未移除：${error.message}。请检查两个文件`, code: error.code || "RENAME_CLEANUP_REQUIRED", renamedFrom: item.localPath };
    }
  }
  return result;
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

async function downloadBoard({ boardId, boardPath = "", rootPath = "", remoteCommit = "", force = false } = {}) {
  const config = await getConfig();
  const id = assertBoardId(boardId);
  if (!config.owner || !config.repo) throw new Error("下载画布所需参数不完整");
  let initialLocal = null;
  if (boardPath) {
    const initialTarget = path.resolve(boardPath);
    await assertSafeWorkspaceTarget(rootPath || path.dirname(initialTarget), initialTarget);
    initialLocal = await readLocalSyncHash(initialTarget);
  }
  const client = await getClient();
  const snapshot = await getSnapshotAtRef(client, config, remoteCommit);
  const remote = await readRemoteBoardAtSnapshot(client, config, snapshot, id);
  const remoteWorkspace = await readWorkspaceAtSnapshot(client, config, snapshot);
  const remoteEntry = remoteWorkspace.boards[id];
  if (remoteEntry?.deletedAt) throw new GitHubApiError("远端画布已删除，请明确选择恢复本地版本或确认本机删除", { status: 409, code: "REMOTE_BOARD_DELETED", boardId: id });
  const root = rootPath ? normalizeWorkspaceRoot(rootPath) : path.dirname(path.resolve(boardPath || CANVAS_BOARD_FILE));
  const targetPath = path.resolve(boardPath || (rootPath ? path.join(root, remoteEntry?.relativePath || `${id}.freeflow`) : CANVAS_BOARD_FILE));
  await assertSafeWorkspaceTarget(root, targetPath);
  const localLedger = await readLedger(SYNC_LEDGER_FILE);
  const existingEntry = localLedger.boards[id];
  const local = initialLocal || await readLocalSyncHash(targetPath);
  if (local.exists && local.boardId && local.boardId !== id) {
    throw new GitHubApiError("目标路径属于另一张画布，已阻止覆盖", { status: 409, code: "PATH_COLLISION", boardId: id });
  }
  if (!force && local.exists && (!local.hash || ["local-changed", "both-changed"].includes(workspacePlanState({ localHash: local.hash }, { boardHash: remote.boardHash }, existingEntry)))) {
    throw new GitHubApiError("本地画布有未同步修改或没有共同基线，已阻止远端覆盖", { status: 409, code: "SYNC_CONFLICT", reason: local.errorCode || "LOCAL_CHANGED", boardId: id });
  }
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
  await assertSafeWorkspaceTarget(root, targetPath);
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
  await assertSafeWorkspaceTarget(root, targetPath);
  return await withFileLock(targetPath, async () => {
    await assertSafeWorkspaceTarget(root, targetPath);
    const latest = await readLocalSyncHash(targetPath);
    if (latest.exists !== local.exists || latest.hash !== local.hash || latest.errorCode !== local.errorCode) {
      throw new GitHubApiError("下载期间本地画布已变化，已停止覆盖，请重新检查同步状态", { status: 409, code: "LOCAL_CHANGED_DURING_SYNC", boardId: id });
    }
    await snapshotBoardHistory(targetPath, { reason: "pull" });
    const stagedAssets = path.join(stagingRoot, "assets");
    const finalAssets = path.join(targetRoot, "assets");
    // Publish verified content-addressed assets first. Existing boards and history retain their assets.
    await assertSafeWorkspaceTarget(root, path.join(finalAssets, "resource"));
    await fs.mkdir(finalAssets, { recursive: true });
    for (const name of await fs.readdir(stagedAssets)) {
      await assertSafeWorkspaceTarget(root, path.join(finalAssets, name));
      const written = await atomicWriteFile(path.join(finalAssets, name), await fs.readFile(path.join(stagedAssets, name)), { fsync: true });
      if (!written.ok) throw new Error(written.error || "附件保存失败，当前画布已保留");
    }
    const published = await atomicWriteFile(targetPath, await fs.readFile(stagedBoardPath), { fsync: true });
    if (!published.ok) throw new Error(published.error || "画布保存失败，当前画布已保留");
  const syncState = "synced";
  let ledger = null;
  let ledgerWarning = "";
  try { ledger = await updateLedger((current) => ({
    ...current,
    repository: config,
    boards: {
      ...current.boards,
      [id]: {
        ...(current.boards[id] || {}),
        boardId: id,
        localPath: targetPath,
        workspaceRoot: root,
        relativePath: remoteEntry?.relativePath || boardRelativePath(root, targetPath),
        localRelativePath: boardRelativePath(root, targetPath),
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
  }), SYNC_LEDGER_FILE); } catch (error) { ledgerWarning = error.message || "同步账本保存失败，请重新检查状态"; }
  return { ...result, operationCompleted: true, filePath: targetPath, boardId: id, boardHash: remote.boardHash, manifest, remoteCommit: snapshot.commitSha, missingResources, syncState, ledger, ...(ledgerWarning ? { ledgerWarning } : {}) };
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
  const ledger = await readLedger(SYNC_LEDGER_FILE);
  const workspace = await readWorkspaceAtSnapshot(client, config, snapshot, ledger.workspaceId);
  const metadata = workspace.boards[id];
  const remote = metadata?.deletedAt ? { boardHash: metadata.boardHash, manifest: null }
    : await readRemoteBoardAtSnapshot(client, config, snapshot, id);
  const entry = ledger.boards[id] || {};
  const localPath = path.resolve(boardPath || entry.localPath || config.boardPath || CANVAS_BOARD_FILE);
  const local = await readLocalSyncHash(localPath);
  const localExists = Boolean(local.exists);
  const remoteHash = remote.boardHash || String(remote.manifest?.boardHash || "");
  const state = metadata?.deletedAt ? "deleted-remote" : localExists && local.errorCode ? "local-invalid"
    : workspacePlanState(localExists ? { localHash: local.hash } : null, { boardHash: remoteHash }, entry);
  return {
    boardId: id,
    state,
    localPath,
    localHash: local.hash,
    localError: local.errorCode || "",
    remoteHash,
    deletedAt: metadata?.deletedAt || "",
    remoteCommit: snapshot.commitSha,
    baseRemoteCommit: entry.baseRemoteCommit || "",
    manifest: remote.manifest,
  };
}

async function pullBoard(options = {}) {
  if (options.rootPath && !options.boardPath) {
    const plan = await getWorkspacePlan({ rootPath: options.rootPath });
    const item = plan.items.find((board) => board.boardId === options.boardId);
    if (!item) throw new GitHubApiError("远端画布不存在", { status: 404, code: "REMOTE_BOARD_NOT_FOUND" });
    if (item.state === "up-to-date") return { ok: true, operationCompleted: true, pulled: false, state: item };
    if (item.state === "local-changed" || item.state === "local-renamed") return { ok: true, operationCompleted: true, pulled: false, state: item, requiresPush: true };
    if (!["remote-only", "remote-changed", "local-missing", "remote-renamed"].includes(item.state)) throw new GitHubApiError("此画布需要先处理冲突或删除，请检查同步计划", { status: 409, code: "SYNC_CONFLICT", state: item });
    return { ...(await pullPlannedBoard(item, plan)), pulled: true };
  }
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
  const localBundle = await buildSyncBundleFromFile(state.localPath);
  const merged = mergeBoardPayloads(ancestor.payload, JSON.parse(localBundle.boardText), remote.payload);
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
  const resourceBytes = new Map(localBundle.files.filter((file) => file.path.startsWith(".freeflow/assets/")).map((file) => [file.path, { bytes: file.content }]));
  const referenced = new Set((boardFromPayload(merged.payload).items || []).map((item) => String(item.resourcePath || item.sourcePath || "")).filter((value) => value.startsWith(".freeflow/assets/")));
  for (const version of [remote, ancestor]) {
    const resources = (version.manifest?.resources || []).filter((resource) => referenced.has(resource.path) && !resourceBytes.has(resource.path));
    validateRemoteResources(resources);
    const files = await client.getFilesAtSnapshot(config.owner, config.repo, version.snapshot, resources.map((resource) => resource.path));
    for (const resource of resources) {
      const bytes = files[resource.path]?.blob ? decodeBlob(files[resource.path].blob) : null;
      if (!bytes || bytes.length !== resource.sizeBytes || crypto.createHash("sha256").update(bytes).digest("hex") !== resource.sha256) {
        throw new GitHubApiError("合并所需远端附件缺失或校验失败，已保留本地内容", { status: 422, code: "REMOTE_INTEGRITY_ERROR", boardId: state.boardId });
      }
      resourceBytes.set(resource.path, { bytes, mime: resource.mime });
    }
  }
  if ([...referenced].some((value) => !resourceBytes.has(value))) throw new GitHubApiError("合并所需附件没有有效来源，已停止合并", { status: 422, code: "REMOTE_INTEGRITY_ERROR" });
  const mergedBundle = await buildSyncBundleFromPayload(merged.payload, { baseDir: path.dirname(state.localPath), resourceBytes });
  const materializedPayload = JSON.parse(mergedBundle.boardText);
  const materializedBoard = boardFromPayload(materializedPayload);
  materializedBoard.items = (materializedBoard.items || []).map((item) => {
    const resourcePath = String(item.resourcePath || item.sourcePath || "");
    return resourcePath.startsWith(".freeflow/assets/") ? { ...item, sourcePath: `assets/${path.basename(resourcePath)}`, resourcePath: `assets/${path.basename(resourcePath)}`, _relative: true } : item;
  });
  const root = path.dirname(state.localPath);
  await assertSafeWorkspaceTarget(root, state.localPath);
  return withFileLock(state.localPath, async () => {
    const beforeMerge = await readLocalSyncHash(state.localPath);
    if (beforeMerge.hash !== state.localHash) throw new GitHubApiError("合并期间本地画布发生变化，已保留当前编辑", { status: 409, code: "LOCAL_CHANGED_DURING_SYNC", state });
    for (const file of mergedBundle.files.filter((file) => file.path.startsWith(".freeflow/assets/"))) {
      const target = path.join(root, "assets", path.basename(file.path));
      await assertSafeWorkspaceTarget(root, target);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const written = await atomicWriteFile(target, file.content, { fsync: true });
      if (!written.ok) throw new Error(written.error || "合并附件保存失败");
    }
    await snapshotBoardHistory(state.localPath, { reason: "merge" });
    await writeDownloadedBoard(state.localPath, JSON.stringify(materializedPayload, null, 2));
    try {
      const synced = await syncBoard({ boardPath: state.localPath, allowRemoteRebase: true, expectedRemoteCommit: state.remoteCommit, message: "Resolve FreeFlow sync conflict (merge)" });
      return { ...synced, merged: true, conflicts: [], ancestorSha };
    } catch (error) {
      Object.assign(error, { localChanged: true, filePath: state.localPath, boardId: state.boardId, merged: true });
      throw error;
    }
  });
}

async function confirmCommitResult({ commitSha = "", baseCommitSha = "", owner = "", repo = "", branch = "" } = {}) {
  const config = await getConfig();
  if (!commitSha || ["owner", "repo", "branch"].some((key) => String(({ owner, repo, branch })[key] || "") !== config[key])) {
    throw new GitHubApiError("待确认提交不属于当前同步仓库，请恢复原仓库连接后检查", { status: 409, code: "COMMIT_REPOSITORY_MISMATCH" });
  }
  const client = await getClient();
  let remoteHeadSha = "";
  try {
    remoteHeadSha = String((await client.getBranchHead(owner, repo, branch))?.object?.sha || "");
    if (!remoteHeadSha) return { status: "unknown", commitSha, remoteHeadSha };
    if (remoteHeadSha === commitSha) return { status: "published", commitSha, remoteHeadSha };
    if (remoteHeadSha === baseCommitSha) return { status: "not-published", commitSha, remoteHeadSha, requiresCheck: true };
    const comparison = await client.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(commitSha)}...${encodeURIComponent(remoteHeadSha)}`);
    if (["ahead", "identical"].includes(comparison?.status)) return { status: "published", commitSha, remoteHeadSha };
    if (["behind", "diverged"].includes(comparison?.status)) return { status: "not-published", commitSha, remoteHeadSha, requiresCheck: true };
    return { status: "unknown", commitSha, remoteHeadSha };
  } catch (error) { return { status: "unknown", commitSha, remoteHeadSha, error: error.message, retryAfterMs: error.retryAfterMs || 0 }; }
}

function requireDeletionConfirmation(confirmed, expectedRemoteCommit) {
  if (confirmed !== true || !String(expectedRemoteCommit || "").trim()) {
    throw new GitHubApiError("删除需要明确确认并提供最近检查的远端版本", { status: 409, code: "DELETE_CONFIRMATION_REQUIRED" });
  }
}

async function deletionSnapshot(boardId, expectedRemoteCommit) {
  const id = assertBoardId(boardId);
  const config = await getConfig();
  const client = await getClient();
  const snapshot = await client.getBranchSnapshot(config.owner, config.repo, config.branch);
  if (snapshot.commitSha !== expectedRemoteCommit) throw new GitHubApiError("远端在确认后发生变化，请重新检查后确认删除", { status: 409, code: "REMOTE_CHANGED" });
  const ledger = await readLedger(SYNC_LEDGER_FILE);
  const workspace = await readWorkspaceAtSnapshot(client, config, snapshot, ledger.workspaceId);
  if (!workspace.boards[id]) throw new GitHubApiError("远端画布不存在", { status: 404, code: "REMOTE_BOARD_NOT_FOUND" });
  return { id, config, client, snapshot, workspace };
}

// An ordinary upload or pull never propagates a deletion. Only this explicit
// confirmation writes a tombstone; the board and attachment blobs are retained.
async function deleteRemoteBoard({ boardId, confirmed = false, expectedRemoteCommit = "" } = {}) {
  requireDeletionConfirmation(confirmed, expectedRemoteCommit);
  const { id, config, client, snapshot, workspace } = await deletionSnapshot(boardId, expectedRemoteCommit);
  if (workspace.boards[id].deletedAt) return { ok: true, operationCompleted: true, deleted: true, boardId: id, remoteCommit: snapshot.commitSha };
  const deletedAt = new Date().toISOString();
  workspace.boards[id] = { ...workspace.boards[id], deletedAt, updatedAt: deletedAt };
  workspace.updatedAt = deletedAt;
  const commit = await client.createCommit({ owner: config.owner, repo: config.repo, branch: config.branch, expectedBaseSha: snapshot.commitSha,
    message: "Confirm FreeFlow remote board deletion", files: [{ path: WORKSPACE_PATH, content: JSON.stringify(workspace, null, 2) }] });
  let ledgerWarning = "";
  try { await updateLedger((current) => ({ ...current, remoteWorkspace: workspace, boards: { ...current.boards, [id]: { ...current.boards[id], boardId: id, syncState: "deleted-remote", deletedAt, remoteHeadSha: commit.commitSha } } }), SYNC_LEDGER_FILE); }
  catch (error) { ledgerWarning = error.message; }
  return { ok: true, operationCompleted: true, deleted: true, boardId: id, deletedAt, commit, remoteCommit: commit.commitSha, ...(ledgerWarning ? { ledgerWarning } : {}) };
}

async function applyRemoteDeletion({ boardId, rootPath = "", boardPath = "", confirmed = false, expectedRemoteCommit = "", expectedLocalHash = "" } = {}) {
  requireDeletionConfirmation(confirmed, expectedRemoteCommit);
  const { id, snapshot, workspace } = await deletionSnapshot(boardId, expectedRemoteCommit);
  const remote = workspace.boards[id];
  if (!remote.deletedAt) throw new GitHubApiError("远端画布尚未删除，已停止本机删除", { status: 409, code: "REMOTE_CHANGED" });
  const root = rootPath ? path.resolve(rootPath) : path.dirname(path.resolve(boardPath || CANVAS_BOARD_FILE));
  const target = path.resolve(boardPath || path.join(root, remote.relativePath));
  await assertSafeWorkspaceTarget(root, target);
  const local = await readLocalSyncHash(target);
  if (!local.exists) return { ok: true, operationCompleted: true, deleted: true, boardId: id, filePath: target, remoteCommit: snapshot.commitSha };
  const raw = await fs.readFile(target);
  const bundle = await buildSyncBundleFromPayload(parseBoardFileText(raw.toString("utf8")).payload, { baseDir: path.dirname(target) });
  if (!expectedLocalHash || bundle.boardId !== id || bundle.boardHash !== expectedLocalHash) throw new GitHubApiError("本地内容在确认后发生变化，请重新检查再删除", { status: 409, code: "LOCAL_CHANGED_DURING_SYNC" });
  const result = await trashCanvasBoard(target, { expectedContentHash: crypto.createHash("sha256").update(raw).digest("hex") });
  let ledgerWarning = "";
  try { await updateLedger((current) => ({ ...current, boards: { ...current.boards, [id]: { ...current.boards[id], syncState: "deleted", deletedAt: remote.deletedAt, localPath: target, trashId: result.trashId } } }), SYNC_LEDGER_FILE); }
  catch (error) { ledgerWarning = error.message; }
  return { ...result, operationCompleted: true, deleted: true, boardId: id, remoteCommit: snapshot.commitSha, ...(ledgerWarning ? { ledgerWarning } : {}) };
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
  deleteRemoteBoard,
  confirmCommitResult,
  applyRemoteDeletion,
  readLocalSyncHash,
  validateRemoteResources,
};

// Serialize public operations with credential and repository mutations. Internal
// calls use the functions above directly, so nested pull/merge operations do not
// re-enter the queue. A failed operation does not poison subsequent retries.
for (const name of ["getConfig", "setConfig", "getStatus", "syncBoard", "downloadBoard", "listBoards", "getWorkspace", "getBoardState", "pullBoard", "reconcileBoard", "getWorkspacePlan", "syncWorkspace", "pullWorkspace", "deleteRemoteBoard", "applyRemoteDeletion", "confirmCommitResult"]) {
  const operation = module.exports[name];
  module.exports[name] = (...args) => auth.withConnectionOperation(() => operation(...args));
}
