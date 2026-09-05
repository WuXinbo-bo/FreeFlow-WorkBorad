const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { createHash } = require("crypto");
const { createAtomicBoardFileWriter } = require("../electron/atomicBoardFileWriter");
const { FREEFLOW_BOARD_FILE_KIND, wrapFreeFlowBoardPayload } = require("../src/backend/models/canvasBoardFileFormat");
const { verifyEnvelopeChecksum } = require("../src/backend/utils/checksum");

const ROOT = path.resolve(__dirname, "..");
const NAME = "FreeFlow教程画布";
const source = fs.readFileSync(path.join(ROOT, "electron/main.js"), "utf8");
const tutorialSource = source.slice(source.indexOf("function resolveTutorialBoardTemplatePath()"), source.indexOf("async function ensureDesktopStartupContext("));
const fixture = (text) => ({ items: [
  { id: "title", type: "text", text },
  { id: "docx", type: "fileCard", fileName: "freeflow-selection-word.docx" },
] });
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));

async function checkDiskRefresh(root) {
  const template = path.join(root, "data", `${NAME}.json`);
  const boards = path.join(root, "boards");
  const target = path.join(boards, `${NAME}.freeflow`);
  const marker = path.join(root, "tutorial-board-template-version.json");
  fs.mkdirSync(path.dirname(template), { recursive: true });
  fs.mkdirSync(boards);
  write(template, fixture("new tutorial"));
  write(target, wrapFreeFlowBoardPayload({ board: fixture("old tutorial with user notes") }));
  write(marker, { version: "1.2.0", filePath: target });
  const original = fs.readFileSync(target);
  const context = vm.createContext({
    fs, path, createHash, FREEFLOW_BOARD_FILE_KIND, wrapFreeFlowBoardPayload,
    app: { isPackaged: false, getAppPath: () => root },
    readUiSettingsStore: async () => ({ canvasBoardSavePath: boards }),
    isCanvasBoardFileName: (name) => /\.(freeflow|json)$/i.test(name),
    DATA_DIR: root, CANVAS_BOARD_DIR: boards, DEFAULT_TUTORIAL_BOARD_NAME: `${NAME}.json`,
    TUTORIAL_BOARD_RUNTIME_NAME: `${NAME}.freeflow`, TUTORIAL_BOARD_TEMPLATE_VERSION: "1.2.0",
    TUTORIAL_ASSET_DIR_NAME: "TutorialAssets", tutorialBoardPreparation: null,
    atomicBoardFileWriter: createAtomicBoardFileWriter(),
  });
  vm.runInContext(tutorialSource, context);
  const refresh = () => context.ensureTutorialBoardFile();
  const results = await Promise.all([refresh(), refresh(), refresh()]);
  assert(results.every((result) => result.updated && result.backupPath === results[0].backupPath));
  assert.equal(fs.readdirSync(boards).filter((name) => name.endsWith(".bak")).length, 1);
  assert.deepEqual(fs.readFileSync(results[0].backupPath), original);
  assert.equal(read(target).payload.board.items[0].text, "new tutorial");
  assert(verifyEnvelopeChecksum(read(target)).valid);
  assert.equal(read(marker).templateHash.length, 64);

  const edited = read(target);
  edited.payload.board.items[0].text = "user practice";
  await context.atomicBoardFileWriter.write(target, JSON.stringify(edited));
  assert.equal((await refresh()).updated, false);
  assert.equal(read(target).payload.board.items[0].text, "user practice");
  fs.writeFileSync(template, JSON.stringify(fixture("new tutorial"), null, 4));
  assert.equal((await refresh()).updated, false, "formatting alone must not replace user practice");

  write(template, fixture("next tutorial, same application version"));
  const next = await refresh();
  assert(next.updated);
  assert.equal(read(next.backupPath).payload.board.items[0].text, "user practice");
  assert.equal(read(target).payload.board.items[0].text, "next tutorial, same application version");
  const stableBoard = fs.readFileSync(target);
  const stableMarker = fs.readFileSync(marker);
  fs.writeFileSync(template, "invalid json");
  await assert.rejects(refresh());
  assert.deepEqual(fs.readFileSync(target), stableBoard);
  assert.deepEqual(fs.readFileSync(marker), stableMarker);
  write(template, fixture("next tutorial, same application version"));
  assert.equal((await refresh()).updated, false, "failed refresh must allow a later retry");

  fs.unlinkSync(target);
  assert((await refresh()).created);
  assert.equal(read(target).payload.board.items[0].text, "next tutorial, same application version");

  const customDir = path.join(root, "custom-boards");
  context.readUiSettingsStore = async () => ({ canvasBoardSavePath: customDir });
  const custom = await refresh();
  assert.equal(custom.filePath, path.join(customDir, `${NAME}.freeflow`));
  assert(custom.created);
  assert.equal(read(custom.filePath).payload.board.items[0].text, "next tutorial, same application version");
  context.readUiSettingsStore = async () => ({ canvasBoardSavePath: path.join(customDir, "legacy.json") });
  assert.equal((await refresh()).filePath, custom.filePath);
}

async function checkAutosaveRecovery() {
  const renderer = fs.readFileSync(path.join(ROOT, "public/src/engines/canvas2d-core/createCanvas2DEngine.js"), "utf8");
  const fn = renderer.slice(renderer.indexOf("  async function ensureTutorialBoard()"), renderer.indexOf("  async function saveBoardAs()"));
  for (const outcome of ["success", "save-failure", "prepare-failure", "load-failure", "throw"]) {
    const calls = [];
    const context = vm.createContext({
      useLocalFileSystem: true,
      state: { boardFilePath: "tutorial.freeflow", boardAutosaveEnabled: true },
      boardSaveInFlight: Promise.resolve(),
      stopAutosaveTimer: () => calls.push("pause"),
      startAutosaveTimer: () => calls.push("resume"),
      setStatus() {},
      saveBoard: async (options) => {
        assert(options.exactPath);
        calls.push("save");
        return outcome !== "save-failure";
      },
      desktopShell: { async ensureTutorialBoard() {
        calls.push("prepare");
        if (outcome === "throw") throw new Error("IPC unavailable");
        return { ok: outcome !== "prepare-failure", filePath: "tutorial.freeflow" };
      } },
      openBoardAtPath: async () => { calls.push("load"); return outcome !== "load-failure"; },
    });
    vm.runInContext(fn, context);
    for (let repeat = 0; repeat < 2; repeat++) {
      calls.length = 0;
      if (outcome === "throw") await assert.rejects(context.ensureTutorialBoard());
      else assert.equal((await context.ensureTutorialBoard()).ok, outcome === "success");
      assert.equal(calls[0], "pause");
      assert.equal(calls.at(-1), "resume");
      if (outcome === "success") assert.deepEqual(calls, ["pause", "save", "prepare", "load", "resume"]);
      if (outcome === "save-failure") assert(!calls.includes("prepare"));
    }
    context.state.boardAutosaveEnabled = false;
    calls.length = 0;
    await context.ensureTutorialBoard().catch(() => {});
    assert(!calls.includes("resume"), "disabled autosave must stay disabled");
  }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "freeflow-tutorial-refresh-"));
  try {
    await checkDiskRefresh(root);
    await checkAutosaveRecovery();
    console.log("[check-tutorial-board-refresh] content updates, backups, repeat opens, and autosave recovery passed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
