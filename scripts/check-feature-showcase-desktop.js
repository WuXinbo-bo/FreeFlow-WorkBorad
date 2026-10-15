const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const ROOT = path.resolve(__dirname, "..");

async function inspectDocx(buffer) {
  return new Promise((resolve, reject) => require("yauzl").fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    let xml = ""; let images = 0;
    zip.on("error", reject); zip.on("end", () => resolve({ xml, images }));
    zip.on("entry", entry => {
      if (entry.fileName.startsWith("word/media/") && !entry.fileName.endsWith("/")) images++;
      if (entry.fileName !== "word/document.xml") return zip.readEntry();
      zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        stream.on("data", chunk => { xml += chunk; }); stream.on("end", () => zip.readEntry()); stream.on("error", reject);
      });
    }); zip.readEntry();
  }));
}

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-showcase-"));
  const data = path.join(temp, "Data");
  await fs.mkdir(data);
  const version = require("../package.json").version;
  await fs.writeFile(path.join(data, "ui-settings.json"), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version,
    dismissedTutorialIntroVersion: version, defaultLaunchFullscreen: false }));
  const bootstrap = path.join(temp, "bootstrap.cjs");
  await fs.writeFile(bootstrap, `const {app} = require('electron'); app.setPath('userData', ${JSON.stringify(path.join(temp, "Profile"))}); app.getAppPath = () => ${JSON.stringify(ROOT)}; require(${JSON.stringify(path.join(ROOT, "electron/main.js"))});`);
  const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data, FREEFLOW_CANVAS_BOARD_DIR: path.join(temp, "Boards"),
    FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, "Legacy"), FREEFLOW_PORT: "0" };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath: require("electron"), args: [bootstrap], cwd: ROOT, env, timeout: 30000 });
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setFullScreen(false); win.setContentSize(1440, 960); });
    const baseline = await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      if (engine.getSnapshot().boardAutosaveEnabled) engine.toggleAutosave();
      engine.loadStructuredBoardForExport({ boardId: "unsaved-showcase-test", items: [{ id: "keep-me", type: "text", x: 120, y: 90, width: 350, html: "<h1>未保存内容</h1>" }], selectedIds: ["keep-me"], view: { scale: .73, offsetX: 125, offsetY: 86 } });
      engine.runCommand("selection.set-geometry", { x: 140 });
      return { board: engine.getSnapshotData(), dirty: engine.getSnapshot().boardDirty, storage: JSON.stringify({ ...localStorage }) };
    });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("freeflow:tutorial-ui-event", { detail: { type: "open-global-tutorial-center" } })));
    await page.locator('[data-global-tutorial-action="feature-showcase"]').click();
    const frame = await (await page.waitForSelector('.feature-showcase-host > iframe')).contentFrame();
    await frame.waitForFunction(() => ["playing", "paused"].includes(window.__featureShowcase?.player.getSnapshot().status));
    const snapshot = () => frame.evaluate(() => ({ ...window.__featureShowcase.player.getSnapshot(), items: window.__featureShowcase.engine.getSnapshotData().items }));
    const chapter = async (index, step) => {
      console.log("[chapter]", index, step);
      await frame.evaluate(index => { void window.__featureShowcase.player.goTo(index); }, index);
      await frame.waitForFunction(({ index, step }) => {
        const state = window.__featureShowcase.player.getSnapshot();
        if (state.status === "error") throw new Error(state.error);
        // Native focus/visibility can pause an unattended test window.
        if (state.status === "paused" && !state.practicing) window.__featureShowcase.player.resume();
        if (state.chapter === index && state.step === step) {
          window.__featureShowcase.player.pause(); return true;
        }
        return false;
      }, { index, step }, { timeout: 35000, polling: 100 }).catch(async error => {
        console.log("[failed state]", await snapshot().catch(() => "unavailable"));
        throw error;
      });
      await frame.waitForTimeout(250);
    };
    await chapter(0, 1);
    let state = await snapshot();
    assert.equal(state.items.length, 1);
    for (const tag of ["<h1", "<h2", "<ul", "<strong", "<a "]) assert(state.items[0].html.includes(tag), `lost rich format ${tag}`);
    await chapter(1, 2);
    assert((await snapshot()).items[0].html.includes("我的行动方案"));
    await chapter(2, 2);
    assert(JSON.stringify((await snapshot()).items).includes("m^2c^4"), "formula edit did not commit");
    await chapter(3, 5);
    state = await snapshot();
    assert.equal(state.items.filter(item => item.type === "mindNode").length, 4);
    assert(state.items.find(item => item.type === "mindNode" && !item.parentId).collapsed !== true);
    await chapter(4, 2);
    await frame.waitForFunction(() => window.__featureShowcase.engine.getSnapshot().fileCardPreviewRequests?.some(request => request.previewStatus === "ready"));
    await frame.waitForFunction(() => document.querySelector('.canvas2d-file-preview-react-content.is-docx')?.contentDocument?.querySelector('section.canvas2d-file-card-docx-preview-document'));
    state = await snapshot();
    assert(state.items.some(item => item.type === "image")); assert(state.items.some(item => item.type === "fileCard"));
    await frame.locator('body').screenshot({ path: path.join(temp, "files.png") });
    await chapter(5, 3);
    assert(await frame.getByText("内置操作示例", { exact: true }).isVisible());
    assert.equal(await frame.locator('#chat-form, #prompt-input').count(), 0, "assistant leaked into mirror chapter");
    await chapter(6, 2);
    const docx = await frame.evaluate(() => window.__featureShowcase.engine.getSnapshot().wordExportPreviewRequest.previewDocxBase64);
    assert(Buffer.from(docx, "base64").subarray(0, 2).equals(Buffer.from("PK")), "Word preview is not a DOCX");
    await frame.waitForFunction(() => document.querySelector('.canvas2d-word-export-docx-iframe')?.contentDocument?.querySelector('section.canvas2d-word-docx-preview-document'));
    await frame.locator('body').screenshot({ path: path.join(temp, "word.png") });
    await frame.evaluate(() => window.__featureShowcase.player.pause());
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
    await frame.getByRole("button", { name: "导出为 Word", exact: true }).click();
    await frame.getByText("已取消保存，可随时重试。", {exact:true}).waitFor();
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, path.join(temp, "result.docx"));
    await frame.getByRole("button", { name: "导出为 Word", exact: true }).click();
    await frame.getByText("示例 Word 已保存。", {exact:true}).waitFor();
    assert((await fs.stat(path.join(temp, "result.docx"))).size > 1000);
    const document = await inspectDocx(await fs.readFile(path.join(temp, "result.docx")));
    for (const content of ["我的行动方案", "从资料到行动", "收集资料", "<w:drawing>", "m:oMath"]) assert(document.xml.includes(content), `saved Word lost ${content}`);
    assert(document.images > 0, "saved Word lost the imported image");

    // A late Word reply must not resurrect its dialog after chapter replacement.
    await frame.evaluate(() => {
      window.__originalPreview = window.desktopShell.previewWordDocx;
      window.desktopShell.previewWordDocx = async payload => {
        const result = await window.__originalPreview(payload);
        await new Promise(resolve => { window.__releasePreview = resolve; }); return result;
      };
      void window.__featureShowcase.player.goTo(6);
    });
    await frame.waitForFunction(() => window.__releasePreview);
    await frame.evaluate(() => { void window.__featureShowcase.player.goTo(0); void window.__featureShowcase.player.goTo(2); });
    await frame.waitForFunction(() => window.__featureShowcase.player.getSnapshot().chapter === 2 && window.__featureShowcase.player.getSnapshot().status === "playing");
    await frame.evaluate(() => { window.__releasePreview(); window.desktopShell.previewWordDocx = window.__originalPreview; });
    await frame.waitForTimeout(200);
    assert.equal(await frame.locator('.canvas2d-word-export-overlay').count(), 0);
    await page.getByRole("button", { name: "退出特色导览", exact: true }).click();
    await page.waitForSelector('.feature-showcase-host', { state: "detached" });
    const after = await page.evaluate(() => ({ board: window.__canvas2dEngine.getSnapshotData(), dirty: window.__canvas2dEngine.getSnapshot().boardDirty }));
    assert.deepEqual(after.board, baseline.board, "tour changed the user's board or camera");
    assert.equal(after.dirty, baseline.dirty, "tour changed unsaved state");
    assert.equal(await page.locator('body > [inert]').count(), 0, "covered workbench stayed inert");
    for (let index = 0; index < 3; index++) {
      await page.evaluate(async () => { window.__returnFocus = document.activeElement; const {openFeatureShowcase} = await import('/src/runtime/tutorial-system/showcaseHost.js'); openFeatureShowcase(); });
      await page.getByRole("button", { name: "退出特色导览", exact: true }).click();
      assert.equal(await page.locator('.feature-showcase-host').count(), 0);
      assert(await page.evaluate(() => document.activeElement === window.__returnFocus), "exit lost the original keyboard focus");
    }
    await page.evaluate(async () => { const {openFeatureShowcase} = await import('/src/runtime/tutorial-system/showcaseHost.js'); openFeatureShowcase(); });
    const keyboardFrame = await (await page.locator('.feature-showcase-host > iframe').elementHandle()).contentFrame();
    await keyboardFrame.waitForFunction(() => window.__featureShowcase);
    await page.getByRole("button", { name: "退出特色导览", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert(await page.evaluate(() => document.activeElement.tagName === "IFRAME"));
    await page.keyboard.press("Shift+Tab");
    assert(await page.getByRole("button", { name: "退出特色导览", exact: true }).evaluate(button => button === document.activeElement));
    await page.keyboard.press("Escape");
    assert.equal(await page.locator('.feature-showcase-host').count(), 0);

    // The live handoff expands the existing right pane and starts its real guide.
    await page.locator('[data-stage-panel-action="close"][data-stage-panel-side="right"]').click();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("freeflow:tutorial-ui-event", { detail: { type: "open-global-tutorial-center" } })));
    await page.locator('[data-global-tutorial-action="feature-showcase"]').click();
    const mirrorFrame = await (await page.locator('.feature-showcase-host > iframe').elementHandle()).contentFrame();
    await mirrorFrame.waitForFunction(() => window.__featureShowcase);
    await mirrorFrame.evaluate(() => { void window.__featureShowcase.player.goTo(5); });
    await mirrorFrame.getByRole("button", { name: "退出导览，体验真实 AI 镜像 ↗", exact: true }).click();
    await page.waitForSelector('.feature-showcase-host', { state: "detached" });
    assert.equal(await page.locator('#right-panel-tab-screen').getAttribute("aria-selected"), "true");
    assert(await page.locator('#restore-right-pane-btn').evaluate(button => button.classList.contains("is-hidden")));
    assert.deepEqual(await page.evaluate(() => window.__canvas2dEngine.getSnapshotData()), baseline.board);
    assert.deepEqual(errors, []);
    console.log(`[feature-showcase-desktop] rich paste/edit, math, mind map, real image/DOCX drop/preview, mirror chapter, real Word generation/save, rapid exit and original-board recovery passed; artifacts: ${temp}`);
  } finally { await app?.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
