const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { PDFDocument } = require("pdf-lib");
const sharp = require("sharp");
const yauzl = require("yauzl");
const ROOT = path.resolve(__dirname, "..");
function imageCount(buffer) {
  return new Promise((resolve, reject) => yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    let count = 0;
    zip.on("error", reject); zip.on("end", () => resolve(count));
    zip.on("entry", (entry) => { if (/^word\/media\/.*\.png$/.test(entry.fileName)) count += 1; zip.readEntry(); }); zip.readEntry();
  }));
}
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-delivery-desktop-"));
  const data = path.join(temp, "Data"); const boards = path.join(temp, "Boards"); const profile = path.join(temp, "Profile");
  await Promise.all([data, boards, profile].map((folder) => fs.mkdir(folder)));
  const version = require("../package.json").version;
  await fs.writeFile(path.join(data, "ui-settings.json"), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version }));
  const bootstrap = path.join(temp, "bootstrap.cjs");
  await fs.writeFile(bootstrap, `const { app } = require("electron"); app.setPath("userData", ${JSON.stringify(profile)}); app.getAppPath = () => ${JSON.stringify(ROOT)}; require(${JSON.stringify(path.join(ROOT, "electron/main.js"))});`);
  const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data, FREEFLOW_CANVAS_BOARD_DIR: boards, FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, "Legacy"), FREEFLOW_PORT: "0" };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath: require("electron"), args: [bootstrap], cwd: ROOT, env, timeout: 30000 });
    const page = await app.firstWindow();
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForFunction(() => window.__canvas2dEngine && window.desktopShell?.isDesktop && !document.body.classList.contains("app-booting"));
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    const image = await sharp({ create: { width: 100, height: 50, channels: 4, background: "#2468ff" } }).png().toBuffer();
    const imagePath = path.join(boards, "fixture.png"); await fs.writeFile(imagePath, image);
    const boardPath = path.join(boards, "研究.freeflow");
    const secondPath = path.join(boards, "报价.freeflow");
    await fs.writeFile(secondPath, JSON.stringify({ items: [{ id: "quote", type: "text", x: 100, y: 100, width: 400, height: 100, text: "跨设备报价资料", plainText: "跨设备报价资料" }], selectedIds: [], view: { scale: 1, offsetX: 0, offsetY: 0 } }));
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, boardPath);
    const created = await page.evaluate(async (imagePath) => {
      const engine = window.__canvas2dEngine;
      engine.loadStructuredBoardForExport({ items: [{ id: "screenshot", type: "image", sourcePath: imagePath, x: 100, y: 100, width: 200, height: 100 }, { id: "text", type: "text", x: 100, y: 300, width: 400, height: 100, text: "第一页研究", plainText: "第一页研究" }], selectedIds: ["screenshot", "text"], view: { scale: 1, offsetX: 0, offsetY: 0 } });
      const saved = await engine.saveBoard({ saveAs: true });
      return { saved };
    }, imagePath);
    assert.equal(created.saved, true);
    const stored = JSON.parse(await fs.readFile(boardPath, "utf8"));
    assert(stored.payload.board.items.some((item) => item.id === "screenshot"));
    const pdfPath = path.join(boards, "画布.pdf");
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, pdfPath);
    const pdfResult = await page.evaluate(() => window.__canvas2dEngine.exportBoardAsPdf({ scale: 1 }));
    assert.equal(pdfResult.ok, true); assert.equal((await PDFDocument.load(await fs.readFile(pdfPath))).getPageCount(), 1);
    const imageRead = await page.evaluate(async (source) => { const read = await window.desktopShell.readFileBase64(source); return { ok: read.ok, error: read.error, mime: read.mime, bytes: read.data?.length }; }, imagePath);
    assert.equal(imageRead.ok, true, JSON.stringify(imageRead));
    await page.evaluate(() => { const engine = window.__canvas2dEngine; engine.exportSelectionAsWord(engine.getSnapshot().board.items); });
    await page.waitForFunction(() => window.__canvas2dEngine.getSnapshot().wordExportPreviewRequest?.previewStatus === "ready");
    const preview = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().wordExportPreviewRequest);
    assert.deepEqual(preview.assetWarnings, [], JSON.stringify({ warnings: preview.assetWarnings, image: preview.sourceItems.find((item) => item.type === "image") }));
    assert(preview.previewDocxBase64.length > 1000);
    await page.evaluate(() => { const engine = window.__canvas2dEngine; const request = engine.getSnapshot().wordExportPreviewRequest; const id = request.preview.orderedItemIds.at(-1); engine.reorderWordExportPreview(request.id, id, -1); engine.reorderWordExportPreview(request.id, id, 1); });
    await page.waitForFunction(() => window.__canvas2dEngine.getSnapshot().wordExportPreviewRequest?.previewStatus === "ready");
    const wordPath = path.join(boards, "交付.docx");
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, wordPath);
    const confirmed = await page.evaluate(() => { const engine = window.__canvas2dEngine; return engine.confirmWordExportPreview(engine.getSnapshot().wordExportPreviewRequest.id); });
    assert.equal(confirmed, true); assert((await fs.stat(wordPath)).size > 1000);
    assert.equal(await imageCount(await fs.readFile(wordPath)), 1, "native DOCX must contain the local screenshot bytes");
    const dirtyX = await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      engine.revealSearchItem("text");
      engine.runCommand("selection.nudge", 40, 25);
      return engine.getSnapshot().board.items.find((item) => item.id === "text").x;
    });
    // Native workspace search opens another saved board and then selects the hit.
    await page.getByRole("button", { name: "打开画布搜索", exact: true }).click();
    await page.getByRole("button", { name: "整个工作区", exact: true }).click();
    await page.locator(".canvas2d-engine-search-input").fill("跨设备报价");
    const result = page.getByRole("option").filter({ hasText: "跨设备报价资料" });
    await result.waitFor(); await result.click();
    await page.waitForFunction((target) => window.__canvas2dEngine.getSnapshot().boardFilePath === target && window.__canvas2dEngine.getSnapshot().board.selectedIds.includes("quote"), secondPath);
    assert.equal(JSON.parse(await fs.readFile(boardPath, "utf8")).payload.board.items.find((item) => item.id === "text").x, dirtyX, "search switch must save the dirty original board");
    await page.evaluate((target) => window.__canvas2dEngine.openBoardAtPath(target), boardPath);
    const reopened = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items);
    assert(reopened.some((item) => item.id === "screenshot"));
    assert.equal(reopened.find((item) => item.id === "text").x, dirtyX);
    await page.keyboard.press("Escape");
    if (process.env.FREEFLOW_SCREENSHOT_DIR) { await fs.mkdir(process.env.FREEFLOW_SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.FREEFLOW_SCREENSHOT_DIR, "delivery-native.png") }); }
    assert.deepEqual(errors, []);
    console.log("[delivery-desktop] native save/reopen, original single-page PDF, retained Word image/preview/reorder/save and workspace search/open/locate passed");
  } finally {
    if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close(); }
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
