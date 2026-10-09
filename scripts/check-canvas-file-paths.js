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
  const { toRelativePath, resolveRelativePath, toFileUrl } = await import("../public/src/engines/canvas2d-core/utils.js");
  const { serializeHostBoard, deserializeHostBoard } = await import("../public/src/engines/canvas2d-core/import/host/hostPersistenceAdapter.js");
  const { normalizeTextLinkToken } = await import("../public/src/engines/canvas2d-core/textModel/richTextDocument.js");
  const roundTrips = [
    ["/Boards/image.png", "/Boards/board.freeflow", "image.png", "/Boards/image.png"],
    ["/Boards/image.png", "/boards/board.freeflow", "../Boards/image.png", "/Boards/image.png"],
    ["C:\\Boards\\image.png", "c:\\boards\\board.freeflow", "image.png", "c:/boards/image.png"],
    ["D:\\Images\\image.png", "C:\\Boards\\board.freeflow", "D:\\Images\\image.png", "D:\\Images\\image.png"],
    ["\\\\server\\share\\images\\image.png", "\\\\server\\share\\boards\\board.freeflow", "../images/image.png", "//server/share/images/image.png"],
    ["//SERVER/Share/Images/image.png", "//server/share/boards/board.freeflow", "../Images/image.png", "//server/share/Images/image.png"],
    ["\\\\server\\other\\image.png", "\\\\server\\share\\board.freeflow", "\\\\server\\other\\image.png", "\\\\server\\other\\image.png"],
    ["/image.png", "/board.freeflow", "/image.png", "/image.png"],
  ];
  for (const [imagePath, boardPath, relative, resolved] of roundTrips) {
    assert.equal(toRelativePath(imagePath, boardPath), relative, `relative: ${imagePath}`);
    assert.equal(resolveRelativePath(relative, boardPath), resolved, `resolved: ${imagePath}`);
    const serialized = serializeHostBoard({ items: [{ id: "path-image", type: "image", sourcePath: imagePath, x: 0, y: 0, width: 80, height: 80 }] }, { meta: { boardFilePath: boardPath } });
    const restored = deserializeHostBoard(JSON.stringify(serialized));
    assert.equal(restored.board.items[0].sourcePath, resolved, `saved board: ${imagePath}`);
  }
  assert.equal(resolveRelativePath("../../../image.png", "C:\\Boards\\board.freeflow"), "C:/image.png");
  assert.equal(resolveRelativePath("../../../image.png", "\\\\server\\share\\board.freeflow"), "//server/share/image.png");
  for (const filePath of ["/Users/me/图片 #1?100%.png", "C:\\Boards\\图片 #1%.png", "\\\\server\\share\\图 #1.png"]) {
    const url = new URL(toFileUrl(filePath));
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.equal(normalizeTextLinkToken({ url: filePath }).url, toFileUrl(filePath));
    const decodedPath = decodeURIComponent(url.pathname);
    const expected = filePath.startsWith("/") ? filePath : filePath.replaceAll("\\", "/");
    assert.equal(url.host ? `//${url.host}${decodedPath}` : decodedPath.replace(/^\/([a-zA-Z]:\/)/, "$1"), expected);
  }
  assert.equal(toFileUrl("/Users/me/a\\b.png"), "file:///Users/me/a%5Cb.png");
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
  console.log("Canvas paths: roots, drive/share boundaries, relative round trips and file URL encoding passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
