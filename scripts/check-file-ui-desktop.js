const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { _electron: electron } = require("playwright");
const { wrapFreeFlowBoardPayload } = require("../src/backend/models/canvasBoardFileFormat");
const ROOT = path.resolve(__dirname, "..");
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-file-ui-"));
  const boards = path.join(temp, "Boards"); const data = path.join(temp, "Data"); const profile = path.join(temp, "Profile"); const images = path.join(boards, "importImage");
  await fs.mkdir(images, { recursive: true }); await fs.mkdir(data); await fs.mkdir(profile);
  const source = path.join(images, "研究截图.png");
  await sharp({ create: { width: 1200, height: 800, channels: 4, background: "#bcd6dc" } }).png().toFile(source);
  const fixtures = Array.from({ length: 48 }, (_, index) => path.join(images, `资料-${index}.png`));
  await Promise.all(fixtures.map((file) => fs.copyFile(source, file)));
  const filePath = path.join(boards, "Research.freeflow");
  await fs.writeFile(filePath, JSON.stringify(wrapFreeFlowBoardPayload({ kind: "structured-host-board", version: "1.0.0", board: { items: [{ id: "missing", type: "image", x: 800, y: 150, width: 100, height: 100, source: "path", sourcePath: path.join(images, "缺失.png"), name: "缺失.png" }], selectedIds: [], view: { scale: 1, offsetX: 0, offsetY: 0 } } })));
  const version = require("../package.json").version;
  await fs.writeFile(path.join(data, "ui-settings.json"), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version, defaultLaunchFullscreen: false, canvasWorkspaceFolderPath: boards }));
  // The local-file HTTP route uses its own allowed roots, separate from native IPC grants.
  await fs.writeFile(path.join(data, "permissions.json"), JSON.stringify({ allowedRoots: [boards], enabled: true }));
  const bootstrap = path.join(temp, "bootstrap.cjs");
  await fs.writeFile(bootstrap, `const { app, ipcMain } = require("electron"); app.setPath("userData", ${JSON.stringify(profile)}); app.getAppPath = () => ${JSON.stringify(ROOT)}; const handle = ipcMain.handle.bind(ipcMain); ipcMain.handle = (name, callback) => handle(name, (...args) => { if (name === "desktop-shell:read-image-thumbnail") global.__thumbnailReads = (global.__thumbnailReads || 0) + 1; return callback(...args); }); require(${JSON.stringify(path.join(ROOT, "electron/main.js"))});`);
  const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data, FREEFLOW_CANVAS_BOARD_DIR: boards, FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, "Legacy"), FREEFLOW_PORT: "0" }; delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath: require("electron"), args: [bootstrap], cwd: ROOT, env, timeout: 30000 });
    const page = await app.firstWindow(); page.setDefaultTimeout(12000);
    const errors = []; page.on("pageerror", (cause) => errors.push(cause.message));
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.show(); win.focus(); });
    await page.evaluate((file) => window.__canvas2dEngine.openBoardAtPath(file), filePath);
    const open = async () => { await page.locator('[title="菜单"]').click(); await page.getByRole("menuitem", { name: "画布图片管理", exact: true }).click(); try { await page.waitForFunction(() => document.querySelectorAll(".canvas2d-image-manager-item").length === 51); } catch (error) { throw new Error(`${error.message}\n${JSON.stringify(await page.evaluate(() => ({ count: document.querySelectorAll(".canvas2d-image-manager-item").length, image: window.__canvas2dEngine.getSnapshot().canvasImageManager, item: window.__canvas2dEngine.getSnapshot().board.items[0] })))}`); } };
    const dialog = page.getByRole("dialog", { name: "画布图片管理", exact: true });
    const add = dialog.getByRole("button", { name: "添加到画布", exact: true });
    await open();
    assert(await add.isDisabled(), "no image should be selected by default");
    const layout = await dialog.evaluate((node) => {
      const read = (selector) => node.querySelector(selector).getBoundingClientRect().toJSON();
      return { header: read(".canvas2d-image-header"), folder: read(".canvas2d-image-folder"), tools: read(".canvas2d-image-manager-tools"), filters: read(".canvas2d-image-filters") };
    });
    assert(layout.header.bottom <= layout.folder.top + 1 && layout.folder.bottom <= layout.tools.top + 1 && layout.tools.bottom <= layout.filters.top + 1, `image controls overlap: ${JSON.stringify(layout)}`);
    await page.waitForFunction(() => document.querySelectorAll(".canvas2d-image-thumbnail img").length > 0);
    await dialog.getByRole("button", { name: "刷新图片列表", exact: true }).click();
    await page.waitForFunction(() => window.__canvas2dEngine.getSnapshot().canvasImageManager.loading === false);
    assert.equal(await dialog.getByRole("alert").count(), 0, "refresh produced an invalid feedback state");
    const reads = await app.evaluate(() => global.__thumbnailReads);
    assert(reads < 49, `offscreen images must not all be decoded: ${reads}`);
    assert(await dialog.locator(".canvas2d-image-thumbnail img").evaluateAll((nodes) => nodes.every((node) => node.naturalWidth <= 160 && node.naturalHeight <= 120)));
    const search = dialog.getByRole("textbox", { name: "搜索图片", exact: true });
    await search.fill("研究截图"); await dialog.locator(".canvas2d-image-manager-item").click(); assert(!await add.isDisabled());
    const before = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.length);
    await add.click();
    try { await dialog.getByRole("status").filter({ hasText: "图片已添加到画布" }).waitFor(); }
    catch (cause) { throw new Error(`${cause.message} ${JSON.stringify(await page.evaluate(() => ({ banner: document.querySelector(".canvas2d-image-manager-banner")?.textContent, status: window.__canvas2dEngine.getSnapshot().statusText, count: window.__canvas2dEngine.getSnapshot().board.items.length })))}`); }
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.length), before + 1);
    await page.evaluate(() => window.__canvas2dEngine.undo());
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.length), before);
    await search.fill(""); await dialog.getByRole("button", { name: "缺失 1", exact: true }).click();
    await dialog.locator(".canvas2d-image-manager-item").click(); assert(await add.isDisabled());
    await dialog.getByRole("button", { name: "全部", exact: true }).click();
    await search.fill("不存在"); assert.equal(await dialog.locator(".canvas2d-image-manager-item").count(), 0); assert(await add.isDisabled());
    await search.fill(""); await dialog.locator(".canvas2d-image-manager-list").evaluate((node) => node.scrollTop = node.scrollHeight);
    await page.waitForFunction(() => document.querySelector(".canvas2d-image-manager-list")?.scrollTop > 0);
    await page.waitForFunction(() => document.querySelectorAll(".canvas2d-image-thumbnail img").length > 0);
    await dialog.locator(".canvas2d-image-add > summary").click(); await page.keyboard.press("Escape"); assert(await dialog.isVisible());
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
    const afterClose = await app.evaluate(() => global.__thumbnailReads); await page.waitForTimeout(400); assert.equal(await app.evaluate(() => global.__thumbnailReads), afterClose);
    for (let cycle = 0; cycle < 3; cycle++) { await open(); await page.keyboard.press("Tab"); assert(await dialog.evaluate((node) => node.contains(document.activeElement))); await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" }); }
    await open(); await dialog.getByRole("button", { name: "画布已使用", exact: true }).click();
    assert.equal(await dialog.locator(".canvas2d-image-manager-item").count(), 1);
    await dialog.getByRole("button", { name: "全部", exact: true }).click();
    if (process.env.FREEFLOW_SCREENSHOT_DIR) { await fs.mkdir(process.env.FREEFLOW_SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.FREEFLOW_SCREENSHOT_DIR, "image-manager.png") }); }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 0, y: 0, width: 600, height: 520 }));
    await page.waitForTimeout(150);
    const rect = await dialog.evaluate((node) => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: innerWidth, height: innerHeight }; });
    assert(rect.top >= 0 && rect.left >= 0 && rect.bottom <= rect.height + 1 && rect.right <= rect.width + 1, JSON.stringify(rect));
    assert(await add.isVisible());
    if (process.env.FREEFLOW_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.FREEFLOW_SCREENSHOT_DIR, "image-manager-narrow.png") });
    await dialog.getByRole("button", { name: "关闭图片管理", exact: true }).click();
    assert.deepEqual(errors, []);
    console.log("[file-ui-desktop] native thumbnails, viewport budget, search/filter/missing/insert/undo, nested Esc/focus/reopen and narrow layout passed");
  } finally { if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close(); } await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
