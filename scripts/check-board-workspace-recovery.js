const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createBoardWorkspaceWatcher } = require("../electron/boardWorkspaceWatcher");

async function main() {
  const { createCanvasWorkspaceManager } = await import("../public/src/engines/canvas2d-core/workspace/createCanvasWorkspaceManager.js");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-workspace-recovery-"));
  const before = { boardFilePath: path.join(temp, "Original.freeflow"), boardDirty: true, canvasImageSavePath: path.join(temp, "Images"), board: { items: [{ id: "kept" }] } };
  const state = structuredClone(before);
  let folder = temp;
  let failWrite = false;
  let saveAllowed = false;
  let wrote = 0;
  let canceled = false;
  const originalShell = globalThis.desktopShell;
  globalThis.desktopShell = {
    async pickDirectory() { return canceled ? { canceled: true } : { filePath: temp }; },
    async ensureDirectory(root) { await fs.mkdir(root, { recursive: true }); return { ok: true }; },
    async listCanvasBoards({ folderPath }) { return { ok: true, folderPath, boards: [] }; },
    async writeFile(filePath, text) { if (failWrite) return { ok: false, error: "disk full" }; await fs.writeFile(filePath, text); wrote += 1; return { ok: true }; },
  };
  const manager = createCanvasWorkspaceManager({
    state, useLocalFileSystem: true,
    getFileApi: () => ({
      setStatus() {}, resolveCanvasWorkspaceFolderPath: async () => folder,
      resolveBoardFolderPath: (value) => value,
      updateCanvasWorkspaceFolderSetting: async (next) => { folder = next; },
      sanitizeBoardFileBaseName: (name) => name,
      resolveUniqueBoardFilePathByBaseName: async (root, name) => path.join(root, `${name}.freeflow`),
    }),
    getBoardOps: () => ({
      maybeSaveBeforeSwitch: async () => saveAllowed,
      buildBoardFilePayload: (_path, board) => ({ board }),
      getBoardEditRevision: () => 0,
      loadBoardFromPath: async (filePath) => { const payload = JSON.parse(await fs.readFile(filePath, "utf8")); state.board = payload.board; state.boardFilePath = filePath; state.boardDirty = false; return true; },
    }),
  });
  let watcher;
  try {
    assert.equal(await manager.pickCanvasWorkspaceFolder(), temp);
    assert.deepEqual(state, before, "browsing changed the active board or image path");
    assert.equal(wrote, 0);
    canceled = true;
    assert.equal(await manager.pickCanvasWorkspaceFolder(), "");
    assert.deepEqual(state, before);
    assert.equal((await manager.createBoardInWorkspace(temp, "Blocked")).ok, false);
    assert.deepEqual(state, before, "save refusal changed the board");
    failWrite = true;
    const failed = await manager.createBoardInWorkspace(temp, "Failure", { saveBeforeSwitch: false });
    assert.equal(failed.ok, false);
    assert.deepEqual(state, before, "failed new-board write lost the previous dirty board");
    failWrite = false;
    const created = await manager.createBoardInWorkspace(temp, "Success", { saveBeforeSwitch: false });
    assert.equal(created.ok, true);
    assert.equal(state.boardFilePath, created.filePath);
    assert.deepEqual(state.board.items, []);
    assert.equal(state.boardDirty, false);
    const events = [];
    watcher = createBoardWorkspaceWatcher((event) => events.push(event));
    assert.equal(watcher.watch(temp).ok, true);
    await fs.writeFile(path.join(temp, "External.freeflow"), "{}");
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.equal(events.length, 1, "watcher did not coalesce file changes");
    watcher.close();
    await fs.writeFile(path.join(temp, "Hidden.freeflow"), "{}");
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(events.length, 1, "closed sidebar retained a watcher");
    for (let cycle = 0; cycle < 4; cycle += 1) { watcher.watch(temp); watcher.close(); }
    assert.equal(watcher.watch(path.join(temp, "missing")).ok, false);
    console.log("[check-board-workspace-recovery] browse/cancel, save refusal, failed write, successful switch, watcher close/reopen passed");
  } finally {
    watcher?.close();
    globalThis.desktopShell = originalShell;
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
