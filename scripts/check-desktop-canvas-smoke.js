const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const ROOT = path.resolve(__dirname, "..");

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-desktop-smoke-"));
  const data = path.join(temp, "AppData");
  const profile = path.join(temp, "Profile");
  await fs.mkdir(data);
  await fs.mkdir(profile);
  const version = require("../package.json").version;
  await fs.writeFile(path.join(data, "ui-settings.json"), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version }));
  const bootstrap = path.join(temp, "bootstrap.cjs");
  // Separate the single-instance lock and Chromium profile from the user's app.
  await fs.writeFile(bootstrap, `const { app } = require("electron");\napp.setPath("userData", ${JSON.stringify(profile)});\napp.getAppPath = () => ${JSON.stringify(ROOT)};\nrequire(${JSON.stringify(path.join(ROOT, "electron", "main.js"))});\n`);
  const env = {
    ...process.env,
    FREEFLOW_HOME_DIR: temp,
    FREEFLOW_USER_DATA_DIR: data,
    FREEFLOW_CANVAS_BOARD_DIR: path.join(temp, "Boards"),
    FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, "Legacy"),
    FREEFLOW_PORT: "0",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let application;
  try {
    application = await electron.launch({ executablePath: require("electron"), args: [bootstrap], cwd: ROOT, env, timeout: 30000 });
    const page = await application.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForFunction(() => window.__canvas2dEngine && window.desktopShell?.isDesktop, null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => window.desktopShell.platform), process.platform);
    const result = await page.evaluate(async () => {
      const engine = window.__canvas2dEngine;
      engine.loadStructuredBoardForExport({
        items: [{ id: "desktop-smoke", type: "shape", shapeType: "rect", x: 100, y: 100, width: 180, height: 100 }],
        selectedIds: ["desktop-smoke"], view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
      engine.runCommand("selection.toggle-lock");
      const locked = Boolean(engine.getSnapshot().board.items[0].locked);
      const cycles = [];
      for (let cycle = 0; cycle < 4; cycle += 1) {
        engine.undo();
        const afterUndo = Boolean(engine.getSnapshot().board.items[0].locked);
        engine.redo();
        cycles.push([afterUndo, Boolean(engine.getSnapshot().board.items[0].locked)]);
      }
      return { item: engine.getSnapshot().board.items[0], locked, cycles, nativeWordPreview: typeof window.desktopShell.previewWordDocx };
    });
    assert.equal(result.item.id, "desktop-smoke");
    assert.equal(result.locked, true);
    assert.deepEqual(result.cycles, Array.from({ length: 4 }, () => [false, true]));
    assert.equal(result.nativeWordPreview, "function");
    assert.deepEqual(errors, []);
    console.log(`[check-desktop-canvas-smoke] native Electron startup, preload and canvas passed (${process.platform})`);
  } finally {
    if (application) {
      // Test data is disposable; exit without the app's interactive save flow.
      await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await application.close();
    }
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
