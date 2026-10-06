const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function main() {
  const source = fs.readFileSync(path.join(__dirname, "../public/src/engines/canvas2d-core/createCanvas2DEngine.js"), "utf8");
  const start = source.indexOf("  function getPathSeparator(");
  const end = source.indexOf("  function resolveBoardFilePathFromSettings(", start);
  assert(start >= 0 && end > start);
  const helpers = vm.runInNewContext(`${source.slice(start, end)}\n({getFolderFromPath, joinPath, resolveBoardFolderPath, stripTrailingSeparators, getFileNameFromPath})`, {
    isSupportedBoardFileName: (name) => /\.(freeflow|json)$/i.test(name),
  });
  const cases = [
    ["/Users/me/Library/Application Support/FreeFlow/画布.freeflow", "/Users/me/Library/Application Support/FreeFlow", "/"],
    ["/board.freeflow", "/", "/"],
    ["C:\\Boards\\board.freeflow", "C:\\Boards", "\\"],
    ["C:\\board.freeflow", "C:\\", "\\"],
    ["\\\\server\\share\\board.freeflow", "\\\\server\\share", "\\"],
    ["boards/board.freeflow", "boards", "/"],
  ];
  const { createCanvasImageStorageManager } = await import("../public/src/engines/canvas2d-core/storage/createCanvasImageStorageManager.js");
  const { createCanvasStorageBridge } = await import("../public/src/runtime/canvas/createCanvasStorageBridge.js");
  const { getDirectoryName } = await import("../public/src/features/canvas/canvasUtils.js");
  const bridge = createCanvasStorageBridge({});
  let savedPath;
  globalThis.desktopShell = { writeFile: async (filePath) => { savedPath = filePath; return { ok: true }; } };
  try {
    for (const [boardPath, folder, separator] of cases) {
      assert.equal(helpers.getFolderFromPath(boardPath), folder);
      assert.equal(bridge.normalizeCanvasBoardSavePathValue(boardPath), folder);
      assert.equal(bridge.normalizeCanvasBoardSavePathValue(folder), folder);
      assert.equal(getDirectoryName(boardPath), folder.replaceAll("\\", "/"));
      const manager = createCanvasImageStorageManager({
        ...helpers,
        state: { boardFilePath: boardPath },
        useLocalFileSystem: true,
      });
      assert.equal(await manager.ensureImportImageFolderExists(), true);
      const expected = folder.replace(/[\\/]+$/, "") + separator + "importImage" + separator + ".keep";
      assert.equal(savedPath, expected);
    }
    assert.equal(helpers.getFolderFromPath("board.freeflow"), "");
    assert.equal(helpers.joinPath("", "image.png"), "image.png");
  } finally {
    delete globalThis.desktopShell;
  }
  console.log("Canvas paths: POSIX, Unicode, Windows drive, UNC and relative image storage passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
