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
    const denied = await page.evaluate(async (target) => {
      try { return await window.desktopShell.readFile(target); }
      catch (error) { return { ok: false, error: error.message }; }
    }, path.join(data, "ui-settings.json"));
    assert.equal(denied.ok, false, "renderer read an unselected settings file");
    assert.match(denied.error, /尚未授权/);
    const panel = page.getByRole("complementary", { name: "画布工作区" });
    await panel.waitFor({ state: "visible" });
    assert.equal(await panel.locator(".canvas2d-workspace-sync").count(), 0, "unconfigured GitHub sync must not occupy the workspace");
    assert.equal(await page.locator('.canvas2d-engine-toolbar [aria-label="画布工作区"]').count(), 0, "duplicate workspace toolbar entry remains");
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
      globalThis.__workspaceSyncStatus = { connected: true, repository: { owner: "fixture", repo: "test" }, ledger: { boards: {} } };
      ipcMain.handle("desktop-shell:github-sync-status", () => globalThis.__workspaceSyncStatus);
      ipcMain.removeHandler("desktop-shell:github-sync-workspace-plan");
      globalThis.__workspacePlanFail = false;
      ipcMain.handle("desktop-shell:github-sync-workspace-plan", async (_event, payload) => {
        if (globalThis.__workspacePlanWait) await globalThis.__workspacePlanWait;
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
    await panel.getByRole("button", { name: "检查同步", exact: true }).waitFor();
    const syncControls = await panel.evaluate((node) => {
      const check = node.querySelector('.canvas2d-workspace-sync-check');
      const settings = node.querySelector('[aria-label="GitHub 同步设置"]');
      const a = check.getBoundingClientRect();
      const b = settings.getBoundingClientRect();
      return { sameRow: check.parentElement === settings.parentElement, gap: b.left - a.right, centerDelta: Math.abs(a.top + a.height / 2 - b.top - b.height / 2) };
    });
    assert(syncControls.sameRow && syncControls.gap >= 0 && syncControls.gap <= 6 && syncControls.centerDelta < 1, `sync check did not sit beside settings: ${JSON.stringify(syncControls)}`);
    assert(!(await panel.locator(".canvas2d-workspace-sync").getAttribute("class")).includes("is-warning"), "ordinary unchecked sync is highlighted as an error");
    await panel.getByRole("button", { name: "检查同步", exact: true }).click();
    await panel.locator(".canvas2d-workspace-sync-summary").filter({ hasText: "待上传 1 · 待拉取 1 · 冲突 1" }).waitFor();
    await panel.getByRole("button", { name: "查看并处理冲突", exact: true }).waitFor();
    if (process.env.FREEFLOW_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.FREEFLOW_SCREENSHOT_DIR, "workspace-sync-states.png") });
    assert(await panel.locator(".canvas2d-workspace-sync-time").filter({ hasText: "检查于" }).isVisible());
    const beforeOffline = await snapshot();
    await app.evaluate(() => { globalThis.__workspacePlanFail = true; });
    await panel.getByRole("button", { name: "检查同步", exact: true }).click();
    await panel.getByRole("alert").filter({ hasText: "offline fixture" }).waitFor();
    assert.deepEqual(await snapshot(), beforeOffline, "failed update check replaced local canvas");
    await app.evaluate(() => { globalThis.__workspacePlanFail = false; });
    await panel.getByRole("button", { name: "重试检查", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".canvas2d-workspace-sync .canvas2d-workspace-error"));
    const setSyncStatus = async (status) => {
      await app.evaluate((_electron, value) => { globalThis.__workspaceSyncStatus = value; }, status);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("freeflow:github-sync-status")));
    };
    await setSyncStatus({ ok: false, error: "status offline fixture" });
    await panel.locator(".canvas2d-workspace-sync").getByRole("alert").filter({ hasText: "status offline fixture" }).waitFor();
    assert(await panel.getByRole("button", { name: "重试检查", exact: true }).isVisible(), "temporary status failure hid a configured repository");
    for (const status of [{ connected: false }, { connected: true, repository: null }, { connected: true, repository: { owner: "fixture", repo: "other" }, ledger: { boards: {} } }]) {
      await setSyncStatus(status);
      if (!status.repository) await page.waitForFunction(() => !document.querySelector(".canvas2d-workspace-sync"));
      else {
        await panel.locator(".canvas2d-workspace-sync-toggle").filter({ hasText: "尚未检查" }).waitFor();
        assert.equal(await panel.locator(".canvas2d-workspace-sync-summary").count(), 0, "repository switch retained stale counts or expansion");
        assert(!(await panel.locator(".canvas2d-workspace-sync").getAttribute("class")).includes("is-warning"));
      }
    }
    await app.evaluate(() => { globalThis.__workspacePlanWait = new Promise((resolve) => { globalThis.__releaseWorkspacePlan = resolve; }); });
    await panel.getByRole("button", { name: "检查同步", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".canvas2d-workspace-panel")?.getAttribute("aria-busy") === "true");
    await setSyncStatus({ connected: true, repository: { owner: "fixture", repo: "test" }, ledger: { boards: {} } });
    await panel.locator(".canvas2d-workspace-sync-toggle").filter({ hasText: "正在检查" }).waitFor();
    await app.evaluate(() => { globalThis.__releaseWorkspacePlan(); globalThis.__workspacePlanWait = null; });
    await page.waitForFunction(() => document.querySelector(".canvas2d-workspace-panel")?.getAttribute("aria-busy") === "false");
    assert.equal(await panel.locator(".canvas2d-workspace-sync-summary").count(), 0, "late plan from the previous repository populated the new repository");
    await panel.getByRole("button", { name: "检查同步", exact: true }).click();
    await panel.getByRole("button", { name: "查看并处理冲突", exact: true }).waitFor();
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
        if (globalThis.__workspaceFailWrite) return { ok: false, error: "ENOSPC fixture" };
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
    await makeDirty();
    const beforeFailedSave = await snapshot();
    const diskBeforeFailure = await fs.readFile(renamed, "utf8");
    await app.evaluate(() => { globalThis.__workspaceFailWrite = true; });
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.saveBoard({ autosave: true, silent: true })), false);
    assert.deepEqual(await snapshot(), beforeFailedSave);
    assert.equal(await fs.readFile(renamed, "utf8"), diskBeforeFailure);
    assert.match(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().boardSaveError), /ENOSPC/);
    await panel.getByRole("alert").filter({ hasText: "保存失败" }).waitFor();
    await app.evaluate(() => { globalThis.__workspaceFailWrite = false; });
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.saveBoard()), true);
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().boardSaveError), "");
    assert.equal((await snapshot()).dirty, false);
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
    const directoryWorkspaceOpener = page.getByRole("button", { name: "打开画布工作区", exact: true });
    if (await directoryWorkspaceOpener.isVisible()) await directoryWorkspaceOpener.click();
    else await panel.getByRole("button", { name: "展开画布工作区", exact: true }).click();
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
    const directory = page.getByRole("region", { name: "画布目录", exact: true });
    await page.evaluate(() => window.__canvas2dEngine.setCanvasNavigatorCollapsed(false));
    await directory.waitFor({ state: "visible" });
    assert.equal(await panel.locator(".canvas2d-navigator-panel, .canvas2d-navigator-tab").count(), 0, "directory is still nested in the file workspace");
    const navigation = page.locator(".canvas2d-navigation-docks");
    assert.equal(await navigation.locator(":scope > .canvas-chrome-surface").count(), 0, "navigation sections still have duplicate glass surfaces");
    const assertSharedLayout = async () => {
      const files = await panel.boundingBox();
      const entries = await directory.boundingBox();
      const backing = await navigation.boundingBox();
      assert(Math.abs(files.x - entries.x) < 1 && Math.abs(files.width - entries.width) < 1, "files and directory do not share one width");
      assert(Math.abs(entries.y - files.y - files.height) < 1, "files and directory do not form a continuous vertical panel");
      assert(entries.y + entries.height <= backing.y + backing.height + 1, "directory escaped the shared backing");
    };
    await assertSharedLayout();
    const assertTopRow = async () => {
      const info = await page.locator(".canvas-chrome-info-dock").boundingBox();
      const controls = await page.locator('[data-stage-panel-controls="left"]').boundingBox();
      const toolbar = await page.locator(".canvas2d-engine-toolbar").boundingBox();
      assert(info && info.x >= controls.x + controls.width + 4, "canvas info overlaps the left controls");
      assert(info.x + info.width <= toolbar.x + 1, "canvas info overlaps the canvas toolbar");
      assert(Math.abs(info.y + info.height / 2 - controls.y - controls.height / 2) <= 2, "canvas info left the top row");
    };
    await assertTopRow();
    const infoDock = page.locator(".canvas-chrome-info-dock");
    const expandedInfoWidth = (await infoDock.boundingBox()).width;
    if (expandedInfoWidth > 64) {
      await infoDock.getByRole("button", { name: "收起画布信息", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".canvas-chrome-info-dock")?.offsetWidth <= 64);
      await infoDock.getByRole("button", { name: "展开画布信息", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".canvas-chrome-info-dock")?.offsetWidth > 64);
      await infoDock.getByLabel("画布信息详情", { exact: true }).click();
      await infoDock.getByRole("button", { name: "重命名画布", exact: true }).click();
      await infoDock.locator(".canvas2d-board-title-input").press("Escape");
    }
    const headers = await page.evaluate(() => [".canvas2d-workspace-head", ".canvas2d-navigator-head"].map((selector) => { const el = document.querySelector(selector); const r = el.getBoundingClientRect(); const title = el.querySelector("strong").getBoundingClientRect(); return { height: r.height, titleX: title.x }; }));
    assert.equal(headers[0].height, headers[1].height);
    assert(Math.abs(headers[0].titleX - headers[1].titleX) < 1, "directory and workspace titles are misaligned");
    const navigationSnapshot = await snapshot();
    for (let cycle = 0; cycle < 4; cycle += 1) {
      await panel.getByRole("button", { name: "收起画布工作区" }).click();
      assert(await directory.isVisible(), "collapsing files hid the canvas directory");
      await directory.getByRole("button", { name: "收起画布目录", exact: true }).click();
      assert(await panel.getByRole("button", { name: "展开画布工作区", exact: true }).isVisible());
      assert((await navigation.boundingBox()).width <= 36, "fully collapsed navigation did not restore its compact rail");
      const compact = await navigation.boundingBox();
      await navigation.hover();
      assert(Math.abs((await navigation.boundingBox()).y - compact.y) < 1, "hover moved the centered compact rail");
      await page.getByRole("button", { name: "展开画布目录", exact: true }).click();
      assert.equal(await panel.isVisible(), false, "directory retained the redundant workspace rail");
      await directory.getByRole("button", { name: "打开画布工作区", exact: true }).click();
      await panel.getByRole("textbox", { name: "搜索画布", exact: true }).waitFor();
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "搜索画布");
    }
    assert.deepEqual(await snapshot(), navigationSnapshot, "independent panel toggles changed the canvas");
    await directory.getByLabel("新建文件夹", { exact: true }).click();
    const folderEntry = directory.locator(".canvas2d-navigator-entry.is-folder").first();
    await folderEntry.waitFor();
    await directory.getByRole("button", { name: "搜索目录", exact: true }).click();
    await directory.getByPlaceholder("搜索目录...").fill("no-directory-match");
    assert.equal(await directory.locator(".canvas2d-navigator-entry").count(), 0);
    await directory.getByPlaceholder("搜索目录...").press("Escape");
    await folderEntry.waitFor();
    await folderEntry.hover();
    try { await folderEntry.getByRole("button", { name: "更多操作", exact: true }).click(); }
    catch (cause) { throw new Error(`${cause.message} ${JSON.stringify(await directory.evaluate((node) => ({ text: node.textContent, html: node.querySelector(".canvas2d-navigator-list")?.innerHTML.slice(0, 2500) })))}`); }
    await directory.getByRole("button", { name: "重命名", exact: true }).click();
    await directory.locator(".canvas2d-navigator-title-input").fill("独立目录测试");
    await directory.locator(".canvas2d-navigator-title-input").press("Enter");
    await directory.getByText("独立目录测试", { exact: true }).waitFor();
    const longTitle = "导入的超长标题_" + "研究资料和文件内容".repeat(60);
    const longEntryId = await page.evaluate((title) => {
      const engine = window.__canvas2dEngine;
      let parentId = "";
      for (let depth = 0; depth < 10; depth += 1) {
        parentId = engine.addCanvasNavigatorFolder({ title: `${depth} ${title}`, parentId }).id;
      }
      return parentId;
    }, longTitle);
    const longEntry = directory.locator(`[data-navigator-entry-id="${longEntryId}"]`);
    await longEntry.scrollIntoViewIfNeeded();
    await longEntry.hover();
    const readOverflow = () => directory.evaluate((node) => {
      const list = node.querySelector('.canvas2d-navigator-list');
      const rows = [...node.querySelectorAll('.canvas2d-navigator-entry')];
      return { width: list.clientWidth, content: list.scrollWidth, rows: rows.map((row) => {
        const title = row.querySelector('strong');
        const more = row.querySelector('.canvas2d-navigator-more-btn');
        const style = title && getComputedStyle(title);
        return { width: row.getBoundingClientRect().width, content: row.scrollWidth, titleWidth: title?.getBoundingClientRect().width, ellipsis: style?.textOverflow, tooltip: title?.title, moreInside: !more || getComputedStyle(more.parentElement).display === 'none' || more.getBoundingClientRect().right <= list.getBoundingClientRect().right + 1 };
      }) };
    });
    let overflow = await readOverflow();
    assert(overflow.content <= overflow.width + 1, `long titles expanded the directory: ${JSON.stringify(overflow)}`);
    assert(overflow.rows.every(row => row.content <= row.width + 1 && row.moreInside), "deep directory clipped row controls");
    assert(overflow.rows.some(row => row.tooltip?.includes(longTitle) && row.ellipsis === "ellipsis" && row.titleWidth > 20), "full title tooltip or usable ellipsis width missing");
    await longEntry.getByRole("button", { name: "更多操作", exact: true }).click();
    await directory.getByRole("button", { name: "重命名", exact: true }).click();
    await directory.locator('.canvas2d-navigator-title-input').fill(longTitle + "_编辑");
    overflow = await readOverflow();
    assert(overflow.content <= overflow.width + 1, "rename input expanded the directory");
    await directory.locator('.canvas2d-navigator-title-input').press('Escape');
    await longEntry.locator('strong').waitFor();
    assert.equal(await longEntry.locator('strong').getAttribute('title'), `9 ${longTitle}`, "cancel rename changed the imported title");
    for (let index = 0; index < 16; index += 1) await directory.getByLabel("新建文件夹", { exact: true }).click();
    assert(await directory.locator(".canvas2d-navigator-list").evaluate((list) => list.scrollHeight > list.clientHeight), "long directories do not scroll within their own section");
    await directory.locator(".canvas2d-navigator-entry").last().scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.saveBoard()), true);
    const widthBefore = (await panel.boundingBox()).width;
    await panel.getByRole("separator", { name: "调整工作区宽度" }).press("ArrowRight");
    assert((await panel.boundingBox()).width > widthBefore, "shared workspace width control stopped working");
    await assertSharedLayout();
    await panel.getByRole("separator", { name: "调整工作区宽度" }).press("ArrowLeft");
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(1200, 100);
    await page.waitForTimeout(200);
    const glass = await page.evaluate(() => {
      const read = (selector) => { const style = getComputedStyle(document.querySelector(selector)); return { background: style.backgroundColor, blur: style.backdropFilter, radius: style.borderRadius }; };
      return { backing: read(".canvas2d-navigation-docks"), files: read(".canvas2d-workspace-panel"), directory: read(".canvas2d-navigator-panel"), toolbar: read(".canvas2d-engine-toolbar") };
    });
    assert.deepEqual(glass.backing, glass.toolbar, "navigation backing does not use the shared frosted glass");
    for (const section of [glass.files, glass.directory]) {
      assert.equal(section.background, "rgba(0, 0, 0, 0)", "navigation section obscures the shared backing");
      assert.equal(section.blur, "none", "navigation section applies a second layer of blur");
    }
    for (let cycle = 0; cycle < 4; cycle += 1) {
      await panel.getByRole("button", { name: "收起画布工作区" }).click();
      assert.equal(await panel.isVisible(), false, "directory retained the redundant workspace rail");
      await directory.getByRole("button", { name: "打开画布工作区", exact: true }).click();
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "搜索画布");
    }
    await panel.getByRole("button", { name: "收起画布工作区" }).click();
    await page.reload();
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
    assert.equal(await panel.isVisible(), false, "sidebar collapsed preference lost on reload");
    assert(await directory.isVisible(), "directory open state was coupled to the collapsed workspace on reload");
    await directory.getByRole("button", { name: "打开画布工作区", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "搜索画布");
    await assertSharedLayout();
    assert(Math.abs((await panel.boundingBox()).width - widthBefore) < 1, "shared width preference lost on reload");
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
    const directoryBounds = await directory.boundingBox();
    const narrowStage = await page.locator(".desktop-clear-stage").boundingBox();
    await assertTopRow();
    await infoDock.getByRole("button", { name: "展开画布信息", exact: true }).click();
    await infoDock.locator(".canvas2d-board-title").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".canvas-chrome-info-dock")?.classList.contains("is-popover-open"));
    await assertSharedLayout();
    assert(directoryBounds.x + directoryBounds.width <= narrowStage.x + narrowStage.width, "directory overflowed the narrow canvas");
    assert(await directory.getByLabel("新建文件夹", { exact: true }).isVisible(), "directory controls are not reachable in the narrow canvas");
    await directory.getByRole("button", { name: "收起画布目录", exact: true }).click();
    await panel.getByRole("button", { name: "收起画布工作区" }).click();
    const map = page.locator("#canvas2d-transient-minimap");
    if (await map.evaluate((element) => element.classList.contains("is-collapsed"))) await map.locator("button").click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector("#canvas2d-transient-minimap")).visibility === "visible");
    await panel.getByRole("button", { name: "展开画布工作区", exact: true }).click();
    await page.waitForFunction(() => {
      const map = document.querySelector("#canvas2d-transient-minimap");
      return map.classList.contains("is-space-constrained") && map.getAttribute("aria-expanded") === "false";
    });
    assert.equal(await map.evaluate((element) => element.classList.contains("is-collapsed")), false, "temporary panel overlap changed the minimap preference");
    await panel.getByRole("button", { name: "收起画布工作区" }).click();
    await page.waitForFunction(() => {
      const map = document.querySelector("#canvas2d-transient-minimap");
      return getComputedStyle(map).visibility === "visible" && map.getAttribute("aria-expanded") === "true" && !map.classList.contains("is-space-constrained");
    });
    assert.equal(await map.evaluate((element) => element.classList.contains("is-collapsed")), false, "temporary panel overlap changed the minimap preference");
    await map.locator("button").click();
    await panel.getByRole("button", { name: "展开画布工作区", exact: true }).click();
    await page.getByRole("button", { name: "展开画布目录", exact: true }).click();
    if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "workspace-narrow.png") });
    assert.deepEqual(errors, []);
    console.log(`[check-board-workspace-desktop] ${process.platform}: native files, switch recovery, rename collision, delete/cancel, pull reload, stale-memory protection, delayed read/create edit protection, failed-sync recovery, workspace browsing/save/focus recovery, keyboard, collapse/reload and narrow panel passed`);
  } finally {
    if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close(); }
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
