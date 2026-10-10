const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { checkCanvasTrackpad } = require("./fixtures/check-canvas-trackpad");
const { checkWorkspaceChrome } = require("./fixtures/check-workspace-chrome");

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
  const launchOptions = { executablePath: require("electron"), args: [bootstrap], cwd: ROOT, env, timeout: 30000 };
  let application;
  try {
    application = await electron.launch(launchOptions);
    const page = await application.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForFunction(() => window.__canvas2dEngine && window.desktopShell?.isDesktop, null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => window.desktopShell.platform), process.platform);
    await page.waitForFunction(() => !document.body.classList.contains("app-booting"));
    assert.equal((await page.evaluate(() => window.desktopShell.getState())).fullscreen, true, "fresh desktop profile should launch fullscreen");
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await page.evaluate(() => window.desktopShell.toggleFullscreen());
      await page.waitForFunction(async () => !(await window.desktopShell.getState()).fullscreen);
      await page.evaluate(() => window.desktopShell.toggleFullscreen());
      await page.waitForFunction(async () => (await window.desktopShell.getState()).fullscreen);
    }
    const result = await page.evaluate(async () => {
      const engine = window.__canvas2dEngine;
      await engine.whenReady();
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
    await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.show();
      window.focus();
    });
    await checkCanvasTrackpad(page);
    const point = await page.locator("#canvas-office-canvas").evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const point = { x: rect.left + rect.width * 0.72, y: rect.top + rect.height * 0.65 };
      const hit = document.elementFromPoint(point.x, point.y);
      if (hit !== canvas) throw new Error(`Pinch target covered by ${hit?.className || hit?.id}`);
      return point;
    });
    const cdp = await page.context().newCDPSession(page);
    const beforePinch = await page.evaluate(() => {
      window.__trustedPinchEvents = [];
      document.addEventListener("wheel", (event) => {
        if (event.ctrlKey) window.__trustedPinchEvents.push({ trusted: event.isTrusted, deltaY: event.deltaY });
      }, { capture: true });
      return window.__canvas2dEngine.getSnapshot().board.view.scale;
    });
    await cdp.send("Input.synthesizePinchGesture", { ...point, scaleFactor: 1.2, relativeSpeed: 400, gestureSourceType: "mouse" });
    await page.waitForFunction((scale) => window.__canvas2dEngine.getSnapshot().board.view.scale > scale * 1.1, beforePinch);
    assert(await page.evaluate(() => window.__trustedPinchEvents.some((event) => event.trusted)), "native Chromium pinch did not deliver trusted wheel events");
    assert.equal(await page.evaluate(() => window.visualViewport.scale), 1, "pinch zoomed the app chrome instead of the canvas");
    await page.waitForFunction(() => !window.__canvas2dEngine.getCanvasPerformanceLifecycleSnapshot().interactionCritical);
    await cdp.send("Input.synthesizePinchGesture", { ...point, scaleFactor: 1 / 1.2, relativeSpeed: 400, gestureSourceType: "mouse" });
    await page.waitForFunction(() => !window.__canvas2dEngine.getCanvasPerformanceLifecycleSnapshot().interactionCritical);
    const recoveredScale = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.view.scale);
    assert(Math.abs(recoveredScale / beforePinch - 1) < 0.03, "native reverse pinch did not recover the camera scale");
    await cdp.detach();
    await checkWorkspaceChrome(page, { screenshotDir: process.env.FREEFLOW_SCREENSHOT_DIR });
    if (process.env.FREEFLOW_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.FREEFLOW_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.FREEFLOW_SCREENSHOT_DIR, "native-electron.png") });
    }
    assert.deepEqual(errors, []);
    for (const fullscreen of [false, true]) {
      await application.evaluate(({ app }) => app.exit(0));
      await application.close();
      application = null;
      const settingsPath = path.join(data, "ui-settings.json");
      const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
      settings.defaultLaunchFullscreen = fullscreen;
      await fs.writeFile(settingsPath, JSON.stringify(settings));
      application = await electron.launch(launchOptions);
      const restartedPage = await application.firstWindow();
      await restartedPage.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
      assert.equal((await restartedPage.evaluate(() => window.desktopShell.getState())).fullscreen, fullscreen, "relaunch did not preserve the selected fullscreen preference");
    }
    console.log(`[check-desktop-canvas-smoke] native Electron startup, fullscreen exit/recovery/relaunch, canvas, trusted pinch/reverse and recovery passed (${process.platform})`);
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
