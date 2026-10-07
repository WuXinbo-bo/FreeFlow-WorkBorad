const path = require("path");
const fs = require("fs/promises");
const { GITHUB_SYNC_SETTINGS_FILE, SYNC_LEDGER_FILE, CANVAS_BOARD_FILE } = require("../config/paths");
const { GitHubApiClient } = require("./githubApiClient");
const auth = require("./githubAuthService");
const { buildSyncBundleFromFile, writeDownloadedBoard, ensureBoardIdInFile } = require("./freeflowSyncModel");
const { readLedger, updateLedger } = require("./syncLedgerService");

function cleanRepoConfig(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    owner: String(source.owner || "").trim(),
    repo: String(source.repo || "").trim(),
    branch: String(source.branch || "main").trim() || "main",
    boardPath: String(source.boardPath || "").trim(),
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
    ledger,
  };
}

async function syncBoard({ boardPath = CANVAS_BOARD_FILE, policy, message = "Update FreeFlow board" } = {}) {
  const config = await getConfig();
  if (!config.owner || !config.repo) throw new Error("请先选择 GitHub 私有仓库");
  const localPath = path.resolve(boardPath);
  const ledger = await readLedger(SYNC_LEDGER_FILE);
  const previous = Object.values(ledger.boards).find((entry) => entry.localPath === localPath);
  await ensureBoardIdInFile(boardPath, previous?.boardId);
  const bundle = await buildSyncBundleFromFile(boardPath, { policy });
  const client = await getClient();
  const result = await client.createCommit({
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    message,
    files: bundle.files,
  });
  await updateLedger((ledger) => ({
    ...ledger,
    repository: config,
    boards: {
      ...ledger.boards,
      [bundle.boardId]: {
        ...(ledger.boards[bundle.boardId] || {}),
        boardId: bundle.boardId,
        localPath,
        localHash: bundle.boardHash,
        remoteHeadSha: result.commitSha,
        baseRemoteCommit: result.commitSha,
        syncState: "synced",
        skippedCount: bundle.manifest.skippedCount,
        assetBytes: bundle.manifest.assetBytes,
      },
    },
  }), SYNC_LEDGER_FILE);
  return { ...result, bundle: { ...bundle, files: bundle.files.map(({ content, ...file }) => file) } };
}

function decodeContent(content) {
  return Buffer.from(String(content || "").replace(/\n/g, ""), "base64");
}

async function downloadBoard({ boardId, boardPath = CANVAS_BOARD_FILE } = {}) {
  const config = await getConfig();
  const id = String(boardId || "").trim();
  if (!config.owner || !config.repo || !id) throw new Error("下载画布所需参数不完整");
  const client = await getClient();
  const remoteBoardPath = `.freeflow/boards/${id}/board.freeflow`;
  const remote = await client.getContent(config.owner, config.repo, remoteBoardPath, config.branch);
  if (Array.isArray(remote)) throw new Error("远端画布路径不是文件");
  let boardText = decodeContent(remote.content).toString("utf8");
  const manifestPath = `.freeflow/boards/${id}/manifest.json`;
  const head = await client.getBranchHead(config.owner, config.repo, config.branch);
  let manifest = null;
  try {
    const remoteManifest = await client.getContent(config.owner, config.repo, manifestPath, config.branch);
    manifest = JSON.parse(decodeContent(remoteManifest.content).toString("utf8"));
  } catch {
    manifest = null;
  }
  if (manifest?.resources && Array.isArray(manifest.resources)) {
    const localAssetRoot = path.join(path.dirname(boardPath), "assets");
    await fs.mkdir(localAssetRoot, { recursive: true });
    for (const resource of manifest.resources) {
      if (!resource?.path) continue;
      try {
        const remoteAsset = await client.getContent(config.owner, config.repo, resource.path, config.branch);
        await fs.writeFile(path.join(localAssetRoot, path.basename(resource.path)), decodeContent(remoteAsset.content));
      } catch {
        // A missing asset remains a visible placeholder in the canvas.
      }
    }
  }
  try {
    const parsed = JSON.parse(boardText);
    const board = parsed?.kind === "structured-host-board" && parsed.board ? parsed.board : parsed;
    if (Array.isArray(board?.items)) {
      board.items = board.items.map((item) => {
        const remotePath = String(item?.resourcePath || item?.sourcePath || "");
        if (!remotePath.startsWith(".freeflow/assets/")) return item;
        const localPath = path.join("assets", path.basename(remotePath));
        return { ...item, sourcePath: localPath, resourcePath: localPath, _relative: true };
      });
      boardText = JSON.stringify(parsed, null, 2);
    }
  } catch {
    // Keep the remote payload intact; the canvas will render missing resources as placeholders.
  }
  const result = await writeDownloadedBoard(boardPath, boardText);
  await updateLedger((ledger) => ({
    ...ledger,
    repository: config,
    boards: {
      ...ledger.boards,
      [id]: {
        ...(ledger.boards[id] || {}),
        boardId: id,
        localPath: path.resolve(boardPath),
        remoteHeadSha: head?.object?.sha || ledger.boards[id]?.remoteHeadSha || "",
        syncState: "synced",
      },
    },
  }), SYNC_LEDGER_FILE);
  return { ...result, boardId: id, manifest };
}

module.exports = {
  cleanRepoConfig,
  getConfig,
  setConfig,
  getStatus,
  syncBoard,
  downloadBoard,
};
