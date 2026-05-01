const assert = require("assert");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

function requireFresh(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(resolved);
}

function clearFreshBackendModules() {
  [
    "../src/backend/config/paths",
    "../src/backend/services/uiSettingsService",
    "../src/backend/services/appStartupService",
    "../src/backend/services/canvasBoardService",
  ].forEach((modulePath) => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch {
      // Ignore modules that were not loaded yet.
    }
  });
}

async function writeBoard(filePath, title) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        schemaVersion: 1,
        items: [
          {
            id: `item-${title}`,
            type: "text",
            text: title,
            x: 0,
            y: 0,
            width: 240,
            height: 80,
          },
        ],
        selectedIds: [],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
        updatedAt: Date.now(),
      },
      null,
      2
    ),
    "utf8"
  );
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-recent-canvas-"));
  const homeDir = path.join(tempRoot, "FreeFlow");
  const appDataDir = path.join(homeDir, "AppData");
  const boardDir = path.join(homeDir, "CanvasBoards");
  const oldBoardPath = path.join(boardDir, "old-board.json");
  const recentBoardPath = path.join(boardDir, "recent-board.json");

  process.env.FREEFLOW_HOME_DIR = homeDir;
  process.env.FREEFLOW_USER_DATA_DIR = appDataDir;
  process.env.FREEFLOW_CANVAS_BOARD_DIR = boardDir;
  process.env.FREEFLOW_CACHE_DIR = path.join(appDataDir, "Cache");
  process.env.FREEFLOW_RUNTIME_DIR = path.join(appDataDir, "Runtime");
  process.env.FREEFLOW_TEMP_DRAG_DIR = path.join(appDataDir, "Runtime", "drag-export");
  delete process.env.FREEFLOW_LEGACY_PROJECT_DATA_DIR;

  await writeBoard(oldBoardPath, "old");
  await writeBoard(recentBoardPath, "recent");

  clearFreshBackendModules();
  const uiSettingsService = requireFresh("../src/backend/services/uiSettingsService");
  const { ensureAppStartupState } = requireFresh("../src/backend/services/appStartupService");
  const canvasBoardService = requireFresh("../src/backend/services/canvasBoardService");

  await uiSettingsService.writeUiSettingsStore({
    canvasBoardSavePath: boardDir,
    canvasLastOpenedBoardPath: oldBoardPath,
    hasShownStartupTutorial: true,
  });

  const firstStartup = await ensureAppStartupState({
    ensureTutorialBoardFile: async () => ({ ok: false, filePath: "" }),
  });
  assert.strictEqual(firstStartup.startup.initialBoardPath, oldBoardPath, "startup should open the persisted old board");

  await uiSettingsService.writeUiSettingsStore({
    canvasBoardSavePath: boardDir,
    canvasLastOpenedBoardPath: recentBoardPath,
  });

  const afterOpenSettings = await uiSettingsService.readUiSettingsStore();
  assert.strictEqual(
    afterOpenSettings.canvasLastOpenedBoardPath,
    recentBoardPath,
    "manual open should persist the new recent board path"
  );

  const secondStartup = await ensureAppStartupState({
    ensureTutorialBoardFile: async () => ({ ok: false, filePath: "" }),
  });
  assert.strictEqual(
    secondStartup.startup.initialBoardPath,
    recentBoardPath,
    "restart should open the latest persisted recent board"
  );

  const boardInfo = await canvasBoardService.readCanvasBoard();
  assert.strictEqual(boardInfo.file, recentBoardPath, "canvas board service should read the latest recent board");
  assert.strictEqual(boardInfo.board.items[0]?.text, "recent", "canvas board service should load recent board content");

  console.log("[check-recent-canvas-startup] recent canvas persistence and startup resolution passed");
}

main().catch((error) => {
  console.error(`[check-recent-canvas-startup] ${error.message}`);
  process.exit(1);
});
