const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { wrapFreeFlowBoardPayload } = require("../src/backend/models/canvasBoardFileFormat");
const ROOT = path.resolve(__dirname, "..");

function boardText(id) {
  return JSON.stringify(wrapFreeFlowBoardPayload({ kind: "structured-host-board", version: "1.0.0", board: { items: [{ id, type: "shape", shapeType: "rect", x: 400, y: 160, width: 120, height: 80 }], view: { scale: 1, offsetX: 0, offsetY: 0 }, selectedIds: [] } }));
}

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-workspace-desktop-"));
  const data = path.join(temp, "AppData");
  const boards = path.join(temp, "Boards");
  const second = path.join(temp, "Second");
  await fs.mkdir(data); await fs.mkdir(boards); await fs.mkdir(second);
  const alpha = path.join(boards, "Alpha.freeflow");
  const beta = path.join(boards, "Beta.freeflow");
  await fs.writeFile(alpha, boardText("alpha"));
  await fs.writeFile(beta, boardText("beta"));
  await fs.writeFile(path.join(boards, "Broken.freeflow"), "{broken");
  await fs.writeFile(path.join(second, "Second.freeflow"), boardText("second"));
  const version = require("../package.json").version;
  await fs.writeFile(path.join(data, "ui-settings.json"), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version, canvasWorkspaceFolderPath: boards, defaultLaunchFullscreen: false }));
  const bootstrap = path.join(temp, "bootstrap.cjs");
  await fs.writeFile(bootstrap, `const { app } = require("electron");\nglobalThis.__workspaceTestFs = require("node:fs/promises");\nglobalThis.__workspaceTestWriter = require(${JSON.stringify(path.join(ROOT, "electron/atomicBoardFileWriter.js"))}).createAtomicBoardFileWriter();\napp.setPath("userData", ${JSON.stringify(path.join(temp, "Profile"))});\napp.getAppPath = () => ${JSON.stringify(ROOT)};\nrequire(${JSON.stringify(path.join(ROOT, "electron/main.js"))});\n`);
  const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data, FREEFLOW_CANVAS_BOARD_DIR: boards, FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, "Legacy"), FREEFLOW_PORT: "0" };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath: require("electron"), args: [bootstrap], cwd: ROOT, env, timeout: 30000 });
    const page = await app.firstWindow();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    await page.waitForFunction(() => !document.body.classList.contains("boot-shape-lock"));
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.show(); window.focus(); });
    await page.evaluate((target) => window.__canvas2dEngine.openBoardAtPath(target), alpha);
    const panel = page.getByRole("complementary", { name: "画布工作区" });
    await panel.waitFor({ state: "visible" });
    const row = (name) => panel.locator(".canvas2d-workspace-open").filter({ has: page.locator("span", { hasText: new RegExp(`^${name}$`) }) });
    const snapshot = () => page.evaluate(() => { const s = window.__canvas2dEngine.getSnapshot(); return { path: s.boardFilePath, dirty: s.boardDirty, ids: s.board.items.map((item) => item.id) }; });
    const makeDirty = async () => {
      await page.waitForFunction(() => document.querySelector(".canvas2d-workspace-panel")?.getAttribute("aria-busy") === "false");
      await page.evaluate(() => { const engine = window.__canvas2dEngine; const board = engine.getSnapshot().board; engine.loadStructuredBoardForExport({ ...board, selectedIds: [board.items[0].id] }); });
      await page.waitForFunction(() => window.__canvas2dEngine.getCommandState("selection.set-geometry")?.enabled);
      await page.evaluate(() => { const engine = window.__canvas2dEngine; engine.runCommand("selection.set-geometry", { x: engine.getSnapshot().board.items[0].x + 12 }); });
    };
    await row("Beta").click();
    await page.waitForFunction((target) => window.__canvas2dEngine.getSnapshot().boardFilePath === target, beta);
    assert.deepEqual((await snapshot()).ids, ["beta"]);
    await makeDirty();
    const dirty = await snapshot();
    assert.equal(dirty.dirty, true);
    await row("Alpha").click();
    const dialog = page.getByRole("alertdialog", { name: "切换前保存画布" });
    await dialog.waitFor({ state: "visible" });
    await page.keyboard.press("Shift+Tab");
    assert(await dialog.getByRole("button", { name: "保存并切换", exact: true }).evaluate((element) => element === document.activeElement), "confirmation focus escaped the dialog");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    assert.deepEqual(await snapshot(), dirty, "cancel did not preserve the dirty board");
    await row("Alpha").click();
    await dialog.getByRole("button", { name: "保存并切换", exact: true }).click();
    await page.waitForFunction((target) => window.__canvas2dEngine.getSnapshot().boardFilePath === target, alpha);
    assert.match(await fs.readFile(beta, "utf8"), /beta/);
    await makeDirty();
    const oldFile = await fs.readFile(alpha, "utf8");
    await row("Beta").click();
    await dialog.getByRole("button", { name: "放弃并切换", exact: true }).click();
    await page.waitForFunction((target) => window.__canvas2dEngine.getSnapshot().boardFilePath === target, beta);
    assert.equal(await fs.readFile(alpha, "utf8"), oldFile, "discard saved unwanted edits");
    await row("Broken").click();
    await panel.getByRole("button", { name: "生成修复副本" }).waitFor({ state: "visible" });
    assert.equal((await snapshot()).path, beta, "invalid file replaced the current board");
    await panel.getByRole("button", { name: "新建画布", exact: true }).click();
    await panel.getByRole("textbox", { name: "新画布名称" }).fill("New Canvas");
    await panel.getByRole("button", { name: "新建", exact: true }).click();
    const newPath = path.join(boards, "New Canvas.freeflow");
    await page.waitForFunction((target) => window.__canvas2dEngine.getSnapshot().boardFilePath === target, newPath);
    assert.deepEqual((await snapshot()).ids, []);
    const external = path.join(boards, "External.freeflow");
    await fs.writeFile(external, boardText("external"));
    await row("External").waitFor({ state: "visible" });
    await panel.getByRole("textbox", { name: "搜索画布" }).fill("External");
    assert.equal(await panel.locator(".canvas2d-workspace-row").count(), 1);
    await page.keyboard.press("Escape");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+p" : "Control+p");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "搜索画布");
    assert.equal(await panel.getByRole("textbox", { name: "搜索画布" }).evaluate((element) => document.activeElement === element), true);
    await row("External").click();
    await page.waitForFunction((target) => window.__canvas2dEngine.getSnapshot().boardFilePath === target, external);
    await panel.getByRole("button", { name: "画布操作：External", exact: true }).click();
    await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
    await panel.getByRole("textbox", { name: "重命名画布" }).fill("Renamed");
    await panel.getByRole("button", { name: "确认", exact: true }).click();
    const renamed = path.join(boards, "Renamed.freeflow");
    await page.waitForFunction((target) => window.__canvas2dEngine.getSnapshot().boardFilePath === target, renamed);
    await fs.access(renamed);
    await panel.getByRole("button", { name: "当前画布操作", exact: true }).click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "显示文件位置");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await panel.getByRole("textbox", { name: "重命名画布" }).fill("Alpha");
    await panel.getByRole("button", { name: "确认", exact: true }).click();
    await panel.getByRole("alert").filter({ hasText: "同名画布已存在" }).waitFor();
    assert.equal((await snapshot()).path, renamed);
    await fs.access(alpha);
    await panel.getByRole("button", { name: "取消编辑" }).click();
    await panel.getByRole("button", { name: "画布操作：New Canvas", exact: true }).click();
    await page.getByRole("menuitem", { name: "删除画布", exact: true }).click();
    const deleteDialog = page.getByRole("alertdialog", { name: "删除画布确认" });
    await deleteDialog.getByRole("button", { name: "取消", exact: true }).click();
    await fs.access(newPath);
    await panel.getByRole("button", { name: "画布操作：New Canvas", exact: true }).click();
    await page.getByRole("menuitem", { name: "删除画布", exact: true }).click();
    await deleteDialog.getByRole("button", { name: "删除", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".canvas2d-workspace-panel")?.getAttribute("aria-busy") === "false");
    await assert.rejects(fs.access(newPath), { code: "ENOENT" });
    assert.equal((await snapshot()).path, renamed);

    // Real disk recovery: cancel, confirm, repeat, and restore without replacing the active canvas.
    await panel.getByRole("button", { name: "打开回收站", exact: true }).click();
    const trashDialog = page.getByRole("dialog", { name: "回收站", exact: true });
    await trashDialog.waitFor();
    const trashRow = trashDialog.locator(".canvas2d-workspace-recovery-row").filter({ hasText: "New Canvas.freeflow" });
    await trashRow.getByRole("button", { name: "恢复", exact: true }).click();
    await trashDialog.getByRole("button", { name: "取消恢复", exact: true }).click();
    await assert.rejects(fs.access(newPath), { code: "ENOENT" });
    await trashRow.getByRole("button", { name: "恢复", exact: true }).click();
    await trashDialog.getByRole("button", { name: "确认恢复", exact: true }).click();
    await trashDialog.waitFor({ state: "hidden" });
    await row("New Canvas").waitFor();
    await fs.access(newPath);
    assert.equal((await snapshot()).path, renamed, "trash restore switched away from the active canvas");

    await makeDirty();
    await page.evaluate(() => window.__canvas2dEngine.saveBoard());
    const historicalX = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items[0].x);
    await makeDirty();
    await page.evaluate(() => window.__canvas2dEngine.saveBoard());
    const latestX = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items[0].x);
    const historyDialog = page.getByRole("dialog", { name: "历史版本", exact: true });
    async function showHistory() {
      await panel.getByRole("button", { name: "当前画布操作", exact: true }).click();
      await page.getByRole("menuitem", { name: "历史版本", exact: true }).click();
      await historyDialog.waitFor();
    }
    await showHistory();
    await historyDialog.getByRole("button", { name: "预览与恢复", exact: true }).first().click();
    await historyDialog.getByText("1 个节点", { exact: true }).waitFor();
    if (process.env.FREEFLOW_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.FREEFLOW_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.FREEFLOW_SCREENSHOT_DIR, "workspace-history-preview.png") });
    }
    await page.keyboard.press("Tab");
    assert(await historyDialog.evaluate((element) => element.contains(document.activeElement)), "recovery dialog focus escaped");
    await historyDialog.getByRole("button", { name: "取消恢复", exact: true }).click();
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items[0].x), latestX);
    await historyDialog.getByRole("button", { name: "预览与恢复", exact: true }).first().click();
    await historyDialog.getByRole("button", { name: "确认恢复", exact: true }).click();
    await historyDialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items[0].x), historicalX, "history restore did not reload the active canvas");
    assert.equal((await snapshot()).dirty, false);
    await showHistory();
    await historyDialog.getByRole("button", { name: "预览与恢复", exact: true }).first().click();
    await historyDialog.getByRole("button", { name: "确认恢复", exact: true }).click();
    await historyDialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items[0].x), latestX, "history restore could not be reversed through the UI");

    // Keyboard quick switch keeps all of the ordinary dirty-board protection.
    await page.keyboard.press(process.platform === "darwin" ? "Meta+p" : "Control+p");
    await panel.getByRole("textbox", { name: "搜索画布", exact: true }).fill("Alpha");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForFunction((target) => window.__canvas2dEngine.getSnapshot().boardFilePath === target, alpha);
    await panel.getByRole("button", { name: "切换到上一个画布", exact: true }).click();
    await page.waitForFunction((target) => window.__canvas2dEngine.getSnapshot().boardFilePath === target, renamed);
    await page.waitForFunction(() => document.querySelector(".canvas2d-workspace-panel")?.getAttribute("aria-busy") === "false");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+o" : "Control+Shift+o");
    await page.waitForFunction((target) => window.__canvas2dEngine.getSnapshot().boardFilePath === target, alpha);
    await page.waitForFunction(() => document.querySelector(".canvas2d-workspace-panel")?.getAttribute("aria-busy") === "false");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+o" : "Control+Shift+o");
    await page.waitForFunction((target) => window.__canvas2dEngine.getSnapshot().boardFilePath === target, renamed);
    await makeDirty();
    await panel.getByRole("button", { name: "切换到上一个画布", exact: true }).click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal((await snapshot()).path, renamed);
    assert.equal((await snapshot()).dirty, true);
    await page.evaluate(() => window.__canvas2dEngine.saveBoard());
    await panel.getByRole("textbox", { name: "搜索画布", exact: true }).fill("");

    // Replace only test-profile IPC endpoints; GitHub credentials and user repositories are never used.
    await app.evaluate(({ ipcMain }, text) => {
      const fs = globalThis.__workspaceTestFs;
      ipcMain.removeHandler("desktop-shell:github-sync-status");
      ipcMain.handle("desktop-shell:github-sync-status", () => ({ connected: true, repository: { owner: "fixture", repo: "test" }, ledger: { boards: {} } }));
      ipcMain.removeHandler("desktop-shell:github-sync-workspace-plan");
      globalThis.__workspacePlanFail = false;
      ipcMain.handle("desktop-shell:github-sync-workspace-plan", (_event, payload) => {
        if (globalThis.__workspacePlanFail) return { ok: false, error: "offline fixture" };
        return { ok: true, rootPath: payload.rootPath, checkedAt: Date.now(), total: 3, counts: { "local-changed": 1, "remote-only": 1, "both-changed": 1 }, items: [{ localPath: payload.boardPath, state: "local-changed" }] };
      });
      ipcMain.removeHandler("desktop-shell:github-sync-workspace-pull");
      ipcMain.handle("desktop-shell:github-sync-workspace-pull", async (_event, payload) => {
        await fs.writeFile(payload.boardPath, text);
        return { ok: true, results: [{ pulled: true }], counts: {}, refreshed: { items: [] } };
      });
    }, boardText("remote"));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("freeflow:github-sync-status")));
    await panel.getByRole("button", { name: "检查更新", exact: true }).click();
    await panel.locator(".canvas2d-workspace-sync-summary").filter({ hasText: "待上传 1 · 待拉取 1 · 冲突 1" }).waitFor();
    await panel.getByRole("button", { name: "查看并处理冲突", exact: true }).waitFor();
    if (process.env.FREEFLOW_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.FREEFLOW_SCREENSHOT_DIR, "workspace-sync-states.png") });
    assert(await panel.locator(".canvas2d-workspace-sync-time").filter({ hasText: "检查于" }).isVisible());
    const beforeOffline = await snapshot();
    await app.evaluate(() => { globalThis.__workspacePlanFail = true; });
    await panel.getByRole("button", { name: "检查更新", exact: true }).click();
    await panel.getByRole("alert").filter({ hasText: "offline fixture" }).waitFor();
    assert.deepEqual(await snapshot(), beforeOffline, "failed update check replaced local canvas");
    await app.evaluate(() => { globalThis.__workspacePlanFail = false; });
    await panel.getByRole("button", { name: "重试检查", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".canvas2d-workspace-sync .canvas2d-workspace-error"));
    await makeDirty();
    await panel.locator(".canvas2d-workspace-current").getByText("未保存 · 待上传", { exact: true }).waitFor();
    await panel.getByRole("button", { name: "拉取", exact: true }).click();
    await page.waitForFunction(() => window.__canvas2dEngine.getSnapshot().board.items[0]?.id === "remote");
    await page.waitForFunction(() => document.querySelector(".canvas2d-workspace-panel")?.getAttribute("aria-busy") === "false");
    const remoteBytes = await fs.readFile(renamed, "utf8");
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.saveBoard({ autosave: true })), true);
    assert.equal(await fs.readFile(renamed, "utf8"), remoteBytes, "clean autosave rewrote the pulled file");
    const duplicate = await page.evaluate((source) => window.__canvas2dEngine.duplicateBoardAtPath(source), renamed);
    assert.equal(duplicate.ok, true);
    const copied = JSON.parse(await fs.readFile(duplicate.filePath, "utf8"));
    assert(copied.payload.board.boardId, "copied board is missing its independent sync ID");
    assert.notEqual(copied.payload.board.boardId, JSON.parse(remoteBytes).payload.board.boardId);
    assert.equal((await snapshot()).path, renamed, "copying replaced the current canvas");
    await page.evaluate((file) => window.__canvas2dEngine.openBoardAtPath(file), duplicate.filePath);
    await makeDirty();
    await page.evaluate(() => window.__canvas2dEngine.saveBoard());
    assert.equal(JSON.parse(await fs.readFile(duplicate.filePath, "utf8")).payload.board.boardId, copied.payload.board.boardId, "loading and saving discarded the sync ID");
    await page.evaluate((file) => window.__canvas2dEngine.openBoardAtPath(file), renamed);
    await page.evaluate(async (text) => {
      const engine = window.__canvas2dEngine;
      await engine.withBoardFileOperation(async () => {
        engine.addMindMapRoot();
        await window.desktopShell.writeFile(engine.getSnapshot().boardFilePath, text);
      });
    }, boardText("remote-next"));
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().boardFileReloadRequired), true);
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.saveBoard({ autosave: true })), false);
    await panel.getByRole("button", { name: "重新载入当前画布", exact: true }).click();
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().boardFileReloadRequired), true);
    await panel.getByRole("button", { name: "重新载入当前画布", exact: true }).click();
    await dialog.getByRole("button", { name: "放弃并切换", exact: true }).click();
    await page.waitForFunction(() => window.__canvas2dEngine.getSnapshot().board.items[0]?.id === "remote-next");
    await page.waitForFunction(() => document.querySelector(".canvas2d-workspace-panel")?.getAttribute("aria-busy") === "false");
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().boardFileReloadRequired), false);
    await page.evaluate(async () => {
      const engine = window.__canvas2dEngine;
      try { await engine.withBoardFileOperation(async () => { throw new Error("network offline"); }); } catch {}
      engine.addMindMapRoot();
      if (!(await engine.saveBoard())) throw new Error("saving did not recover after a failed sync");
    });

    await makeDirty();
    await page.evaluate(() => window.__canvas2dEngine.saveBoard());
    const beforeRead = await snapshot();
    await app.evaluate(({ ipcMain }, target) => {
      globalThis.__workspaceReadGate = null;
      globalThis.__workspaceDelayRead = target;
      ipcMain.removeHandler("desktop-shell:read-file");
      ipcMain.handle("desktop-shell:read-file", async (_event, file) => {
        if (file === globalThis.__workspaceDelayRead) await new Promise((resolve) => { globalThis.__workspaceReadGate = resolve; });
        try { return { ok: true, text: await globalThis.__workspaceTestFs.readFile(file, "utf8") }; }
        catch (error) { return { ok: false, error: error.message }; }
      });
    }, beta);
    await page.evaluate((target) => { window.__workspaceOpen = window.__canvas2dEngine.openBoardAtPath(target); }, beta);
    for (let attempt = 0; attempt < 30 && !(await app.evaluate(() => Boolean(globalThis.__workspaceReadGate))); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert(await app.evaluate(() => Boolean(globalThis.__workspaceReadGate)), "delayed read did not start");
    await page.evaluate(() => { const engine = window.__canvas2dEngine; engine.runCommand("selection.set-geometry", { x: engine.getSnapshot().board.items[0].x + 12 }); });
    const editedWhileReading = await snapshot();
    await app.evaluate(() => { globalThis.__workspaceDelayRead = ""; globalThis.__workspaceReadGate(); });
    assert.equal(await page.evaluate(() => window.__workspaceOpen), false, "delayed open discarded edits made during the read");
    assert.deepEqual(await snapshot(), editedWhileReading, "delayed open replaced the edited board");
    assert.equal((await snapshot()).path, beforeRead.path);
    await page.evaluate(() => window.__canvas2dEngine.saveBoard());
    assert.equal(await page.evaluate((target) => window.__canvas2dEngine.openBoardAtPath(target), beta), true);
    await page.evaluate((target) => window.__canvas2dEngine.openBoardAtPath(target), renamed);

    await app.evaluate(({ ipcMain }) => {
      globalThis.__workspaceWriteGate = null;
      globalThis.__workspaceDelayWrite = true;
      ipcMain.removeHandler("desktop-shell:write-file");
      ipcMain.handle("desktop-shell:write-file", async (_event, file, data) => {
        if (!/\.freeflow$/i.test(file)) { await globalThis.__workspaceTestFs.mkdir(file.replace(/[\\/][^\\/]+$/, ""), { recursive: true }); await globalThis.__workspaceTestFs.writeFile(file, data); return { ok: true, filePath: file }; }
        if (globalThis.__workspaceDelayWrite) await new Promise((resolve) => { globalThis.__workspaceWriteGate = resolve; });
        return globalThis.__workspaceTestWriter.write(file, data);
      });
    });
    await makeDirty();
    await page.evaluate(() => { window.__workspaceSave = window.__canvas2dEngine.saveBoard(); });
    for (let attempt = 0; attempt < 30 && !(await app.evaluate(() => Boolean(globalThis.__workspaceWriteGate))); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert(await app.evaluate(() => Boolean(globalThis.__workspaceWriteGate)), "delayed write did not start");
    await page.evaluate(() => { const engine = window.__canvas2dEngine; engine.runCommand("selection.set-geometry", { x: engine.getSnapshot().board.items[0].x + 12 }); });
    await app.evaluate(() => { globalThis.__workspaceDelayWrite = false; globalThis.__workspaceWriteGate(); });
    await page.evaluate(() => window.__workspaceSave);
    assert.equal((await snapshot()).dirty, true, "an in-flight save incorrectly cleared later edits");
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.saveBoard()), true);
    assert.equal((await snapshot()).dirty, false, "saving did not recover after concurrent edits");
    const beforeCreate = await snapshot();
    await app.evaluate(() => { globalThis.__workspaceWriteGate = null; globalThis.__workspaceDelayWrite = true; });
    await page.evaluate((root) => { window.__workspaceCreate = window.__canvas2dEngine.createBoardInWorkspace(root, "DeferredNew"); }, boards);
    for (let attempt = 0; attempt < 30 && !(await app.evaluate(() => Boolean(globalThis.__workspaceWriteGate))); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert(await app.evaluate(() => Boolean(globalThis.__workspaceWriteGate)), "delayed creation did not start");
    await page.evaluate(() => { const engine = window.__canvas2dEngine; engine.runCommand("selection.set-geometry", { x: engine.getSnapshot().board.items[0].x + 12 }); });
    const editedWhileCreating = await snapshot();
    await app.evaluate(() => { globalThis.__workspaceDelayWrite = false; globalThis.__workspaceWriteGate(); });
    assert.equal((await page.evaluate(() => window.__workspaceCreate)).ok, false, "delayed creation discarded later edits");
    assert.deepEqual(await snapshot(), editedWhileCreating);
    assert.equal((await snapshot()).path, beforeCreate.path);
    await fs.access(path.join(boards, "DeferredNew.freeflow"));
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.saveBoard()), true);
    const beforeFolder = await snapshot();
    await panel.getByRole("button", { name: "收起画布工作区" }).click();
    await panel.getByRole("button", { name: "展开画布工作区", exact: true }).click();
    await app.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] }); }, second);
    await panel.locator(".canvas2d-workspace-folder > button").first().click();
    await row("Second").waitFor({ state: "visible" });
    assert.deepEqual(await snapshot(), beforeFolder, "browsing a workspace relocated the current board");
    assert.equal((await fs.readdir(second)).length, 1, "browsing copied the current board");
    await page.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new CustomEvent("freeflow:workspace-files-changed")); });
    await page.waitForFunction(() => document.querySelector(".canvas2d-workspace-list-head > span")?.textContent === "1 个画布");
    assert(await row("Second").isVisible(), "focus refresh restored an old workspace folder");
    await makeDirty();
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.saveBoard()), true);
    assert.equal((await snapshot()).path, renamed, "saving moved the current board into the browsed workspace");
    assert.equal((await fs.readdir(second)).length, 1, "saving created an unwanted copy in the browsed workspace");
    await row("Second").click();
    const secondPath = path.join(second, "Second.freeflow");
    await page.waitForFunction((target) => window.__canvas2dEngine.getSnapshot().boardFilePath === target, secondPath);
    await panel.getByRole("tab", { name: "最近打开", exact: true }).click();
    await row("Renamed").waitFor({ state: "visible" });
    await panel.getByRole("tab", { name: "工作区", exact: true }).click();
    assert.equal(await row("Renamed").count(), 0, "recent boards leaked into the workspace list");
    for (let cycle = 0; cycle < 4; cycle += 1) {
      await panel.getByRole("button", { name: "收起画布工作区" }).click();
      await panel.getByRole("button", { name: "展开画布工作区", exact: true }).click();
    }
    await panel.getByRole("button", { name: "收起画布工作区" }).click();
    await page.reload();
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
    assert(await panel.getByRole("button", { name: "展开画布工作区", exact: true }).isVisible(), "sidebar collapsed preference lost on reload");
    await panel.getByRole("button", { name: "展开画布工作区", exact: true }).click();
    const screenshotDir = process.env.FREEFLOW_SCREENSHOT_DIR;
    if (screenshotDir) {
      await fs.mkdir(screenshotDir, { recursive: true });
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".boot-splash")).opacity) === 0);
      await page.screenshot({ path: path.join(screenshotDir, "workspace-desktop.png") });
    }
    // Force a narrow canvas panel while preserving the neighboring AI pane.
    const resizer = page.locator("#left-pane-resizer");
    const handle = await resizer.boundingBox();
    const stage = await page.locator(".desktop-clear-stage").boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 360 - stage.width, handle.y + handle.height / 2, { steps: 12 });
    await page.mouse.up();
    const bounds = await panel.boundingBox();
    assert(bounds.width <= 360, "sidebar overflowed a narrow canvas pane");
    if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "workspace-narrow.png") });
    assert.deepEqual(errors, []);
    console.log(`[check-board-workspace-desktop] ${process.platform}: native files, switch recovery, rename collision, delete/cancel, pull reload, stale-memory protection, delayed read/create edit protection, failed-sync recovery, workspace browsing/save/focus recovery, keyboard, collapse/reload and narrow panel passed`);
  } finally {
    if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close(); }
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
