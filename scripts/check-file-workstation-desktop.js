const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { Document, Packer, Paragraph, TextRun } = require("docx");
const XLSX = require("xlsx");
const ROOT = path.resolve(__dirname, "..");
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-file-desktop-"));
  const data = path.join(temp, "Data"); const boards = path.join(temp, "Boards"); const profile = path.join(temp, "Profile"); const output = path.join(temp, "Results");
  await Promise.all([data, boards, profile, output].map((folder) => fs.mkdir(folder)));
  const version = require("../package.json").version;
  await fs.writeFile(path.join(data, "ui-settings.json"), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version }));
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 24; i++) pdf.addPage([595, 842]).drawText(`FreeFlow unique-page-${i} research`, { x: 40, y: 760, font, size: 18 });
  const pdfPath = path.join(boards, "Research.pdf"); await fs.writeFile(pdfPath, await pdf.save());
  const docxPath = path.join(boards, "Landscape.docx");
  await fs.writeFile(docxPath, await Packer.toBuffer(new Document({ sections: [{ properties: { page: { size: { width: 16838, height: 11906 } } }, children: [new Paragraph({ children: [new TextRun("Landscape reading 中文资料")] }), new Paragraph("Source notes and safe extraction") ] }] })));
  const textPath = path.join(boards, "Notes.md"); await fs.writeFile(textPath, "# 中文资料\n文件工作台测试\nResearch notes and <script>plain text</script>");
  const sheetPath = path.join(boards, "报价.xlsx"); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["项目", "报价"], ["同步服务", 199], ["安全内容", "<script>alert(1)</script>"]]), "报价"); XLSX.writeFile(book, sheetPath);
  const bootstrap = path.join(temp, "bootstrap.cjs");
  await fs.writeFile(bootstrap, `const { app, ipcMain } = require("electron"); app.setPath("userData", ${JSON.stringify(profile)}); app.getAppPath = () => ${JSON.stringify(ROOT)};
    const handle = ipcMain.handle.bind(ipcMain); global.__fileTestHandlers = new Map();
    ipcMain.handle = (channel, listener) => { global.__fileTestHandlers.set(channel, listener); handle(channel, (...args) => { if (channel === "desktop-shell:set-window-shape") global.__fileTestShape = args[1]; if (channel === "desktop-shell:file-workstation-status") global.__fileStatusReads = (global.__fileStatusReads || 0) + 1; return listener(...args); }); };
    require(${JSON.stringify(path.join(ROOT, "electron/main.js"))});`);
  const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data, FREEFLOW_CANVAS_BOARD_DIR: boards, FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, "Legacy"), FREEFLOW_PORT: "0" }; delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath: require("electron"), args: [bootstrap], cwd: ROOT, env, timeout: 30000 });
    const page = await app.firstWindow(); const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => { window.__fileUnhandledErrors = []; window.addEventListener("unhandledrejection", (event) => window.__fileUnhandledErrors.push(String(event.reason))); });
    try {
      await page.waitForFunction(() => window.__canvas2dEngine && window.desktopShell?.isDesktop && !document.body.classList.contains("app-booting"));
    } catch (error) {
      console.error('[file-workstation:startup]', { url: page.url(), errors, state: await page.evaluate(() => ({ engine: Boolean(window.__canvas2dEngine), desktop: window.desktopShell?.isDesktop, bodyClass: document.body.className })) });
      throw error;
    }
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    await page.evaluate(() => { window.__fileUnhandledErrors ||= []; window.addEventListener("unhandledrejection", (event) => window.__fileUnhandledErrors.push(String(event.reason))); });
    const assertModalShape = async (full) => {
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      for (let attempt = 0; attempt < 60; attempt++) {
        const matches = await app.evaluate((_electron, { width, height, full }) => Boolean(global.__fileTestShape?.some((rect) => rect.x === 0 && rect.y === 0 && rect.width === width && rect.height === height)) === full, { ...viewport, full });
        if (matches) return;
        await page.waitForTimeout(100);
      }
      assert.fail(`native modal shape did not restore: full=${full}`);
    };
    // Real native picker grant; test profile never reads user data.
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, boards);
    await page.evaluate(() => window.desktopShell.pickDirectory({}));
    const denied = await page.evaluate(() => window.desktopShell.runFileWorkstation({ taskId: "denied", operation: "inspect", sources: ["/etc/hosts"] })); assert.equal(denied.ok, false);
    const load = async (source, ext, id = "file") => {
      await page.evaluate(({ source, ext, id }) => {
        const engine = window.__canvas2dEngine;
        engine.loadStructuredBoardForExport({ items: [{ id, type: "fileCard", x: 600, y: 80, width: 400, height: 128, fileName: source.split("/").pop(), sourcePath: source, ext, memo: "保留备忘录", memoVisible: true }], selectedIds: [id], view: { scale: 1, offsetX: 0, offsetY: 0 } });
        engine.openFileCardPreview(engine.getSnapshotData().items[0]);
      }, { source, ext, id });
      await page.waitForFunction(() => document.querySelector(".canvas2d-file-preview-react")?.dataset.renderState === "ready");
    };
    await load(pdfPath, "pdf");
    await page.evaluate(() => { const e = window.__canvas2dEngine; e.setFileCardPreviewHeight(e.getSnapshot().fileCardPreviewRequests[0].id, 5000); });
    await page.waitForTimeout(400);
    const readMissingVisiblePages = () => page.locator('.canvas2d-file-preview-react-pdf-page').evaluateAll(nodes => {
      const r = document.querySelector('.canvas2d-file-preview-react-scroll').getBoundingClientRect();
      return nodes.filter(n => { const p = n.getBoundingClientRect(); return p.top < Math.min(innerHeight, r.bottom) && p.bottom > Math.max(0, r.top) && !n.querySelector('canvas'); }).map(n => n.dataset.pageNumber);
    });
    await page.waitForFunction(() => {
      const root = document.querySelector('.canvas2d-file-preview-react-scroll');
      if (!root) return false;
      const r = root.getBoundingClientRect();
      return ![...document.querySelectorAll('.canvas2d-file-preview-react-pdf-page')].some(n => { const p = n.getBoundingClientRect(); return p.top < Math.min(innerHeight, r.bottom) && p.bottom > Math.max(0, r.top) && !n.querySelector('canvas'); });
    }, null, { timeout: 10000 });
    await page.evaluate(() => window.__canvas2dEngine.runCommand('selection.set-geometry', { y: -1500 }));
    await page.waitForTimeout(400);
    assert.deepEqual(await readMissingVisiblePages(), [], 'long preview leaves visible pages blank after moving');
    await page.evaluate(() => window.__canvas2dEngine.runCommand('selection.set-geometry', { y: 80 }));
    await page.waitForTimeout(400);
    assert.deepEqual(await readMissingVisiblePages(), [], 'long preview failed to restore first pages');
    assert(await page.locator('.canvas2d-file-preview-react-pdf-canvas').count() <= 7, 'long preview exceeded PDF raster budget');
    await page.evaluate(() => { const e = window.__canvas2dEngine; e.setFileCardPreviewHeight(e.getSnapshot().fileCardPreviewRequests[0].id, 468); });
    assert(await page.locator(".file-workstation-pdf-text span").count() > 0, "PDF text should be selectable");
    const initialView = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.view);
    await page.getByRole("button", { name: "专注阅读", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".file-workstation-reader")?.dataset.renderState === "ready");
    await assertModalShape(true);
    await page.locator(".canvas2d-file-preview-react").getByRole("button", { name: "文件操作", exact: true }).click();
    await page.getByRole("textbox", { name: "搜索文件内容" }).fill("unique-page-7"); await page.getByRole("button", { name: "查找", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".file-workstation-tools [role='status']")?.textContent.includes("第 7 页"));
    await page.waitForTimeout(150);
    assert((await page.locator('.file-workstation-tools').textContent()).includes('第 7 页'), 'search navigation cleared its own result');
    await page.getByRole('spinbutton', { name: '跳转页码' }).fill('8');
    await page.getByRole('spinbutton', { name: '跳转页码' }).press('Enter');
    await page.waitForFunction(() => !document.querySelector(".file-workstation-tools [role='status']")?.textContent.includes("第 7 页"));
    await page.getByRole('button', { name: '查找', exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".file-workstation-tools [role='status']")?.textContent.includes("第 7 页"));
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "添加文字到画布", exact: true }).click();
    await page.waitForFunction(() => window.__canvas2dEngine.getSnapshot().board.items.some((item) => item.type === "text" && item.sourceExcerpt?.page === 7));
    await page.evaluate(() => window.__canvas2dEngine.undo());
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.length), 1);
    await page.evaluate(() => window.__canvas2dEngine.redo()); assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.length), 2);
    await page.getByRole("button", { name: "添加当前页图片到画布", exact: true }).click();
    await page.waitForFunction(() => window.__canvas2dEngine.getSnapshot().board.items.some((item) => item.type === "image" && item.sourceExcerpt?.page === 7));
    await page.evaluate(() => window.__canvas2dEngine.undo());
    await page.getByRole("button", { name: "截取页面区域", exact: true }).click();
    const cropBox = await page.locator('[data-page-number="7"]').boundingBox();
    await page.mouse.move(cropBox.x + 50, cropBox.y + 35); await page.mouse.down(); await page.mouse.move(cropBox.x + 300, cropBox.y + 100, { steps: 5 }); await page.mouse.up();
    await page.waitForFunction(() => window.__canvas2dEngine.getSnapshot().board.items.some((item) => item.type === "image" && item.sourceExcerpt?.page === 7));
    const cropped = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.find((item) => item.type === "image")); assert(cropped.naturalWidth > cropped.naturalHeight * 2 || cropped.originalWidth > cropped.originalHeight * 2, `region extraction should crop: ${JSON.stringify(cropped)}`);
    await page.evaluate(() => window.__canvas2dEngine.undo());
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector(".canvas2d-file-preview-react")?.dataset.renderState === "ready" && !document.querySelector(".file-workstation-reader"));
    await assertModalShape(false);
    assert.deepEqual(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.view), initialView);
    await page.waitForFunction(() => {
      const scroll = document.querySelector(".canvas2d-file-preview-react-scroll")?.getBoundingClientRect();
      const paper = document.querySelector('[data-page-number="7"]')?.getBoundingClientRect();
      return scroll && paper && paper.bottom > scroll.top && paper.top < scroll.bottom;
    });
    assert(await page.locator(".canvas2d-file-preview-react-pdf-canvas").count() <= 7, "retained raster window should stay bounded after search");
    for (let repeat = 0; repeat < 3; repeat++) {
      await page.getByRole("button", { name: "专注阅读", exact: true }).click();
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.querySelector(".canvas2d-file-preview-react")?.dataset.renderState === "ready");
    }
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getDocumentPreviewRuntimeSnapshot().activeSessions), 1);
    // Native conversion through the UI, then one history transaction for generated cards.
    if (!await page.getByRole("button", { name: "转换文件", exact: true }).isVisible()) await page.locator(".canvas2d-file-preview-react").getByRole("button", { name: "文件操作", exact: true }).click();
    await page.getByRole("button", { name: "转换文件", exact: true }).click();
    assert.equal(await page.locator('.file-conversion-dialog select[aria-label="转换为"]').count(), 0, "single target should not require a redundant choice");
    assert.equal(await page.locator('.file-conversion-sources button').count(), 0, "single file should not show batch controls");
    assert.equal(await page.locator('.file-conversion-advanced').evaluate((node) => node.open), false);
    assert.equal(await page.locator('.file-conversion-dialog').evaluate((node) => node === document.activeElement), false, "dialog root must not draw a full-box focus ring");
    if (process.env.FREEFLOW_SCREENSHOT_DIR) { await fs.mkdir(process.env.FREEFLOW_SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.FREEFLOW_SCREENSHOT_DIR, "conversion-simple.png") }); }
    await page.getByRole("textbox", { name: "页码范围" }).fill("2,7");
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, output);
    await page.getByRole("button", { name: "开始转换" }).click();
    try { await page.getByRole("button", { name: "添加到画布", exact: true }).waitFor(); }
    catch (error) { throw new Error(`${error.message}\nUI: ${await page.locator(".file-conversion-dialog").innerText()}`); }
    assert.equal((await fs.readdir(output)).filter((name) => name.endsWith(".png")).length, 2);
    const countBefore = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.length);
    await page.getByRole("button", { name: "添加到画布", exact: true }).click();
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.length), countBefore + 2);
    await page.evaluate(() => window.__canvas2dEngine.undo()); assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.length), countBefore);
    await page.evaluate(() => window.__canvas2dEngine.redo());
    await page.getByRole("button", { name: "定位结果", exact: true }).click();
    await page.waitForFunction(() => !window.__canvas2dEngine.getSnapshot().fileConversionRequest);
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.selectedIds.length), 2);
    await page.evaluate(() => window.__canvas2dEngine.undo());
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.length), countBefore);
    // Reading position and parser cleanup across close/reopen.
    await page.getByRole("button", { name: "关闭预览", exact: true }).click();
    await page.evaluate(() => { const engine = window.__canvas2dEngine; engine.openFileCardPreview(engine.getSnapshotData().items[0]); });
    await page.waitForFunction(() => document.querySelector(".canvas2d-file-preview-react")?.dataset.renderState === "ready");
    await page.waitForFunction(() => document.querySelector(".canvas2d-file-preview-react-scroll")?.scrollTop > 100);
    // Missing source replacement preserves identity, geometry and note; undo restores original source.
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, textPath);
    const linked = await page.evaluate(() => window.__canvas2dEngine.relinkFileCard("file")); assert.equal(linked, true);
    await page.waitForFunction(() => document.querySelector(".file-workstation-text")?.textContent.includes("中文资料"));
    const relinked = await page.evaluate(() => window.__canvas2dEngine.getSnapshotData().items[0]); assert.equal(relinked.id, "file"); assert.equal(relinked.x, 600); assert.equal(relinked.memo, "保留备忘录"); assert.equal(relinked.sourcePath, textPath); assert.equal(relinked.fileCardKind, "text");
    await page.evaluate(() => window.__canvas2dEngine.undo()); assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshotData().items[0].sourcePath), pdfPath);
    await page.waitForFunction(() => !document.querySelector(".canvas2d-file-preview-react"));
    // Refresh even when size/mtime are deliberately unchanged.
    await load(textPath, "md"); const originalStat = await fs.stat(textPath); const originalText = await fs.readFile(textPath, "utf8");
    await fs.writeFile(textPath, originalText.replace("Research", "UPDATED!")); await fs.utimes(textPath, originalStat.atime, originalStat.mtime);
    await page.evaluate(() => { const engine = window.__canvas2dEngine; engine.retryFileCardPreview(engine.getSnapshot().fileCardPreviewRequests[0].id); });
    await page.waitForFunction(() => document.querySelector(".file-workstation-text")?.textContent.includes("UPDATED!"));
    // DOCX landscape dimensions stay native, including switching reader and back.
    await load(docxPath, "docx");
    const dimensions = await page.locator("iframe.canvas2d-file-preview-react-content").evaluate((frame) => { const paper = frame.contentDocument.querySelector("section"); return { width: paper.getBoundingClientRect().width, height: paper.getBoundingClientRect().height }; }); assert(dimensions.width > dimensions.height, JSON.stringify(dimensions));
    await page.getByRole("button", { name: "专注阅读", exact: true }).click(); await page.waitForFunction(() => document.querySelector(".file-workstation-reader")?.dataset.renderState === "ready"); await page.frameLocator("iframe.canvas2d-file-preview-react-content").locator("article").click(); await page.keyboard.press("Escape"); await page.waitForFunction(() => document.querySelector(".canvas2d-file-preview-react")?.dataset.renderState === "ready" && !document.querySelector(".file-workstation-reader"));
    // Old desktop main + new renderer: IPC rejection must not trap a modal or leak keyboard ownership.
    await app.evaluate(({ ipcMain }) => { global.__fileOriginalRun = global.__fileTestHandlers.get("desktop-shell:file-workstation-run"); global.__fileOriginalCancel = global.__fileTestHandlers.get("desktop-shell:file-workstation-cancel"); ipcMain.removeHandler("desktop-shell:file-workstation-run"); });
    const openConversion = async () => { await page.evaluate(() => { const engine = window.__canvas2dEngine; engine.openFileConversion([engine.getSnapshotData().items[0]]); }); await page.getByRole("dialog", { name: "文件转换", exact: true }).waitFor(); await assertModalShape(true); };
    for (const exit of ["close", "escape"]) {
      await openConversion();
      await page.waitForFunction(() => document.querySelector(".file-conversion-status")?.textContent.includes("完整退出并重新启动"));
      assert(await page.getByRole("button", { name: "开始转换", exact: true }).isDisabled());
      if (exit === "escape") await page.keyboard.press("Escape"); else await page.getByRole("button", { name: "关闭文件转换", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector(".file-conversion-dialog") && !window.__canvas2dEngine.getSnapshot().fileConversionRequest); await assertModalShape(false);
    }
    // Conversion layered over reading: Esc only dismisses the top dialog, then returns to the reader.
    await page.getByRole("button", { name: "专注阅读", exact: true }).click(); await page.waitForFunction(() => document.querySelector(".file-workstation-reader")?.dataset.renderState === "ready");
    await openConversion(); await page.keyboard.press("Tab"); assert(await page.locator(".file-conversion-dialog").evaluate((element) => element.contains(document.activeElement)));
    await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector(".file-conversion-dialog") && document.querySelector(".file-workstation-reader")); await assertModalShape(true);
    await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector(".file-workstation-reader")); await assertModalShape(false);
    await load(pdfPath, "pdf");
    // Missing cancellation service while running: close immediately, ignore late results, reopen safely.
    await app.evaluate(({ ipcMain }) => { ipcMain.handle("desktop-shell:file-workstation-run", () => new Promise((resolve) => { global.__fileResolveRun = resolve; })); ipcMain.removeHandler("desktop-shell:file-workstation-cancel"); });
    await openConversion(); await page.getByRole("button", { name: "开始转换", exact: true }).click(); await page.getByRole("button", { name: "取消任务", exact: true }).waitFor();
    await page.getByRole("button", { name: "取消任务", exact: true }).click(); await page.waitForFunction(() => document.querySelector(".file-conversion-status")?.textContent.includes("完整退出并重新启动"));
    await page.getByRole("button", { name: "关闭文件转换", exact: true }).click(); await page.waitForFunction(() => !document.querySelector(".file-conversion-dialog")); await assertModalShape(false);
    const statusReads = await app.evaluate(() => global.__fileStatusReads || 0); await page.waitForTimeout(900); assert.equal(await app.evaluate(() => global.__fileStatusReads || 0), statusReads, "closing a pending task must stop status polling immediately");
    await openConversion(); await app.evaluate(() => { global.__fileResolveRun({ ok: true, files: [{ filePath: "/stale-result.png", fileName: "stale-result" }] }); });
    assert(!await page.locator(".file-conversion-dialog").textContent().then((text) => text.includes("stale-result"))); await page.keyboard.press("Escape");
    for (let i = 0; i < 5; i++) { await openConversion(); await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector(".file-conversion-dialog")); }
    await assertModalShape(false);
    await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler("desktop-shell:file-workstation-run"); ipcMain.handle("desktop-shell:file-workstation-run", global.__fileOriginalRun); ipcMain.handle("desktop-shell:file-workstation-cancel", global.__fileOriginalCancel); });
    if (process.env.FREEFLOW_NATIVE_CLOSE_CHECK) { await openConversion(); console.log("[file-workstation-desktop] native-close-ready"); await page.waitForFunction(() => !document.querySelector(".file-conversion-dialog"), null, { timeout: 60000 }); await assertModalShape(false); }
    assert.deepEqual(await page.evaluate(() => window.__fileUnhandledErrors), []);
    console.log("[file-workstation-desktop] missing IPC/error/close/Esc, nested focus, failed cancel, late results and repeated recovery passed");
    await load(sheetPath, "xlsx"); assert(await page.locator(".file-workstation-table").textContent().then((text) => text.includes("同步服务"))); assert.equal(await page.locator(".file-workstation-table script").count(), 0);
    // Native text print produces a readable/selectable PDF.
    const textPdf = await page.evaluate(({ source, output }) => window.desktopShell.runFileWorkstation({ taskId: "text-pdf", operation: "text-pdf", sources: [source], outputDir: output }), { source: textPath, output }); assert.equal(textPdf.ok, true, JSON.stringify(textPdf)); assert.equal((await PDFDocument.load(await fs.readFile(textPdf.files[0].filePath))).getPageCount(), 1);
    const { PDFParse } = require("pdf-parse"); const printed = new PDFParse({ data: await fs.readFile(textPdf.files[0].filePath) });
    try { assert.match((await printed.getText()).text.normalize("NFKC"), /中文资料/, "native text PDF must retain selectable Chinese text"); } finally { await printed.destroy(); }
    const capability = await page.evaluate((source) => window.desktopShell.runFileWorkstation({ taskId: "office-check", operation: "capabilities", sources: [source] }), docxPath); assert.equal(capability.ok, true, JSON.stringify(capability));
    if (!capability.office) { const unavailable = await page.evaluate(({ source, output }) => window.desktopShell.runFileWorkstation({ taskId: "office-missing", operation: "office-pdf", sources: [source], outputDir: output }), { source: docxPath, output }); assert.equal(unavailable.ok, false); assert.match(unavailable.error, /LibreOffice/); }
    else { const converted = await page.evaluate(({ source, output }) => window.desktopShell.runFileWorkstation({ taskId: "office-real", operation: "office-pdf", sources: [source], outputDir: output }), { source: docxPath, output }); assert.equal(converted.ok, true, JSON.stringify(converted)); const officePdf = await PDFDocument.load(await fs.readFile(converted.files[0].filePath)); assert(officePdf.getPage(0).getWidth() > officePdf.getPage(0).getHeight(), "Office PDF should retain landscape paper"); }
    const responsiveness = await page.evaluate(async ({ source, output }) => {
      const conversion = window.desktopShell.runFileWorkstation({ taskId: "perf-convert", operation: "pdf-images", sources: [source], outputDir: output, options: { pages: "1-12", dpi: 200 } });
      const samples = []; let previous = performance.now();
      for (let index = 0; index < 40; index++) await new Promise((resolve) => requestAnimationFrame(() => { const now = performance.now(); samples.push(now - previous); previous = now; resolve(); }));
      const result = await conversion; samples.sort((a, b) => a - b); return { ok: result.ok, p95: samples[Math.floor(samples.length * .95)], max: samples.at(-1) };
    }, { source: pdfPath, output });
    assert.equal(responsiveness.ok, true, JSON.stringify(responsiveness)); assert(responsiveness.p95 < 100, JSON.stringify(responsiveness));
    console.log("[file-workstation-desktop:performance]", JSON.stringify(responsiveness));
    if (process.env.FREEFLOW_SCREENSHOT_DIR) { await fs.mkdir(process.env.FREEFLOW_SCREENSHOT_DIR, { recursive: true }); await page.getByRole("button", { name: "专注阅读", exact: true }).click(); await page.waitForFunction(() => document.querySelector(".file-workstation-reader")?.dataset.renderState === "ready"); await page.screenshot({ path: path.join(process.env.FREEFLOW_SCREENSHOT_DIR, "file-workstation-native.png") }); }
    assert.deepEqual(errors, []); console.log(`[file-workstation-desktop] native PDF reader/search/extract/undo, conversion/save/insert, restore/relink, landscape DOCX, table, text PDF passed; Office engine: ${capability.office ? capability.engine : "unavailable (failure path verified)"}`);
  } finally {
    if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close(); }
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
