const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..');

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'freeflow-export-integrity-'));
  const data = path.join(temp, 'Data'), boards = path.join(temp, 'Boards'), profile = path.join(temp, 'Profile');
  await Promise.all([data, boards, profile].map(folder => fs.mkdir(folder)));
  const version = require('../package.json').version;
  await fs.writeFile(path.join(data, 'ui-settings.json'), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version }));
  const bootstrap = path.join(temp, 'bootstrap.cjs');
  await fs.writeFile(bootstrap, `const { app, ipcMain, dialog } = require('electron'); app.setPath('userData', ${JSON.stringify(profile)}); app.getAppPath = () => ${JSON.stringify(ROOT)};
    dialog.showSaveDialog = async (_window, options) => {
      if (global.__holdExportDialog) {
        global.__exportDialogOpen = true;
        await new Promise(resolve => { global.__releaseExportDialog = resolve; });
        global.__holdExportDialog = false;
      }
      return { canceled: false, filePath: require('path').join(${JSON.stringify(boards)}, require('path').basename(options.defaultPath || 'export.png')) };
    };
    const originalHandle = ipcMain.handle.bind(ipcMain); global.__exportAudit = [];
    ipcMain.handle = (channel, listener) => originalHandle(channel, async (...args) => {
      if (channel === 'desktop-shell:background-export-result') global.__exportAudit.push(args[1]?.taskId);
      return listener(...args);
    });
    require(${JSON.stringify(path.join(ROOT, 'electron/main.js'))});`);
  const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data, FREEFLOW_CANVAS_BOARD_DIR: boards, FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, 'Legacy'), FREEFLOW_PORT: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args: [bootstrap], cwd: ROOT, env, timeout: 30000 });
    const page = await app.firstWindow(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => window.__canvas2dEngine && window.desktopShell?.isDesktop && !document.body.classList.contains('app-booting'));
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    const formulaHtml = '<h1>公式标题</h1><p>正文 <span data-role="math-inline" data-math-source="\\frac{1}{2}" data-source-format="latex">\\frac{1}{2}</span> 末尾</p>';
    const formulaBoard = { boardId: 'formula-board', items: [{ id: 'formula-text', type: 'text', x: 300, y: 160, width: 500, fontSize: 20, html: formulaHtml }], view: { scale: 1 } };
    await page.evaluate(board => window.__canvas2dEngine.loadStructuredBoardForExport(board), formulaBoard);
    await page.waitForTimeout(300); // Let normal display geometry writeback settle before checking export isolation.
    const visual = await page.evaluate(async () => {
      const e = window.__canvas2dEngine, before = JSON.stringify(e.getSnapshotData().items);
      const result = await e.getStructuredExportRuntime().renderSnapshotToCanvas(e.getSnapshotData(), {});
      return { width: result.canvas.width, height: result.canvas.height, dataUrl: result.canvas.toDataURL(), unchanged: before === JSON.stringify(e.getSnapshotData().items) };
    });
    assert(visual.unchanged, 'visual export modified editable model');
    const raw = await sharp(Buffer.from(visual.dataUrl.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer();
    assert(raw.some((value, index) => index % 4 === 3 && value > 0), 'formula export was blank');
    assert(visual.width > 100 && visual.height > 20);
    for (const type of ['table', 'flowNode', 'mindNode']) {
      const raster = await page.evaluate(async ({ type, formulaHtml }) => {
        const e = window.__canvas2dEngine;
        const item = { id: `formula-${type}`, type, x: 300, y: 160, width: 500, height: 180, fontSize: 20, html: formulaHtml };
        if (type === 'table') item.table = { columns: 1, hasHeader: false, rows: [{ cells: [{ html: formulaHtml, plainText: 'formula' }] }] };
        e.loadStructuredBoardForExport({ items: [item], view: { scale: 1 } });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const before = JSON.stringify(e.getSnapshotData().items);
        const rendered = await e.getStructuredExportRuntime().renderSnapshotToCanvas(e.getSnapshotData(), {});
        return { dataUrl: rendered.canvas.toDataURL(), unchanged: before === JSON.stringify(e.getSnapshotData().items) };
      }, { type, formulaHtml });
      assert(raster.unchanged, `${type} export changed the editable data`);
      const pixels = await sharp(Buffer.from(raster.dataUrl.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer();
      let visiblePixels = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 100 && pixels[i] < 180 && pixels[i + 1] < 180 && pixels[i + 2] < 180) visiblePixels++;
      assert(visiblePixels > 100, `${type} formula raster was empty`);
    }
    await page.evaluate(board => window.__canvas2dEngine.loadStructuredBoardForExport(board), formulaBoard);
    const tasks = await page.evaluate(async board => {
      const shell = window.desktopShell;
      const canceled = shell.exportBoardInBackground({ taskId: 'cancel-before-ready', kind: 'png', board, options: { defaultName: 'cancel-before-ready' } });
      await shell.cancelBackgroundExport('cancel-before-ready');
      const one = shell.exportBoardInBackground({ taskId: 'first-pdf', kind: 'pdf', board, options: { defaultName: 'first-pdf' } });
      const twoBoard = { items: [{ id: 'blue', type: 'shape', shapeType: 'rect', x: 0, y: 0, width: 820, height: 180, fillColor: '#0000ff' }], view: { scale: 1 } };
      const two = shell.exportBoardInBackground({ taskId: 'second-png', kind: 'png', board: twoBoard, options: { defaultName: 'second-png' } });
      return await Promise.all([canceled, one, two]);
    }, formulaBoard);
    assert(tasks[0].canceled, JSON.stringify(tasks));
    assert(tasks[1].ok && tasks[2].ok, JSON.stringify(tasks));
    assert.equal((await PDFDocument.load(await fs.readFile(tasks[1].filePath))).getPageCount(), 1);
    const imageMeta = await sharp(await fs.readFile(tasks[2].filePath)).metadata();
    assert(imageMeta.width > imageMeta.height * 3, 'concurrent export mixed up boards');
    const order = await app.evaluate(() => global.__exportAudit);
    assert(order.indexOf('first-pdf') < order.indexOf('second-png'), JSON.stringify(order));
    const boardAfter = await page.evaluate(() => window.__canvas2dEngine.getSnapshotData());
    assert.equal(boardAfter.items[0].id, 'formula-text');
    // Cancel an already dispatched worker while its native save dialog is open.
    await app.evaluate(() => { global.__holdExportDialog = true; });
    await page.evaluate(board => {
      window.__cancelInDialog = window.desktopShell.exportBoardInBackground({ taskId: 'cancel-in-dialog', kind: 'png', board, options: { defaultName: 'cancel-in-dialog' } });
    }, formulaBoard);
    await app.evaluate(async () => {
      const deadline = Date.now() + 10000;
      while (!global.__exportDialogOpen && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      if (!global.__exportDialogOpen) throw new Error('background save dialog did not open');
    });
    assert((await page.evaluate(() => window.desktopShell.cancelBackgroundExport('cancel-in-dialog'))).canceled);
    // Reusing a canceled ID while its worker is draining must not mix task results.
    await page.evaluate(board => {
      window.__reusedTask = window.desktopShell.exportBoardInBackground({ taskId: 'cancel-in-dialog', kind: 'png', board, options: { defaultName: 'reused-id' } });
    }, formulaBoard);
    await app.evaluate(() => global.__releaseExportDialog());
    assert((await page.evaluate(() => window.__cancelInDialog)).canceled);
    assert((await page.evaluate(() => window.__reusedTask)).ok, 'reused canceled ID lost its result');
    const afterCancel = await page.evaluate(board => window.desktopShell.exportBoardInBackground({ taskId: 'after-cancel', kind: 'png', board, options: { defaultName: 'after-cancel' } }), formulaBoard);
    assert(afterCancel.ok, 'canceled worker blocked the next export');
    assert(!(await fs.readdir(boards)).some(name => name.startsWith('cancel-in-dialog')), 'canceled native dialog still wrote a file');
    const backgroundPage = app.windows().find(window => window.url().includes('backgroundExport=1'));
    assert(backgroundPage, 'background renderer is missing');
    const oversize = await backgroundPage.evaluate(() => window.desktopShell.saveTileCompositeImage({ pixelWidth: 20000, pixelHeight: 20000, tiles: [{ bytes: new Uint8Array([1]), pixelWidth: 1, pixelHeight: 1 }] }));
    assert.equal(oversize.ok, false);
    assert(oversize.error.includes('过大'), 'native composite allocated before checking the budget');
    await app.evaluate(() => { global.__holdExportDialog = true; global.__exportDialogOpen = false; });
    await page.evaluate(() => {
      const e = window.__canvas2dEngine;
      window.__wordCanceled = e.exportSelectionAsWord(e.getSnapshotData().items, { skipPreview: true });
    });
    await app.evaluate(async () => {
      const deadline = Date.now() + 10000;
      while (!global.__exportDialogOpen && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      if (!global.__exportDialogOpen) throw new Error('Word save dialog did not open');
    });
    await page.evaluate(board => window.__canvas2dEngine.loadStructuredBoardForExport(board), formulaBoard);
    await app.evaluate(() => global.__releaseExportDialog());
    assert.equal(await page.evaluate(() => window.__wordCanceled), false, 'Word export ignored board replacement');
    assert(!(await fs.readdir(boards)).some(name => name.endsWith('.docx')), 'canceled Word dialog wrote a file');
    assert(await page.evaluate(() => {
      const e = window.__canvas2dEngine;
      return e.exportSelectionAsWord(e.getSnapshotData().items, { skipPreview: true });
    }), 'Word export failed after cancellation');
    const wordName = (await fs.readdir(boards)).find(name => name.endsWith('.docx'));
    const wordBytes = await fs.readFile(path.join(boards, wordName));
    assert(wordBytes.length > 2048 && wordBytes.subarray(0, 2).toString() === 'PK', 'saved Word was not a DOCX archive');
    const legacyBytes = await page.evaluate(() => window.desktopShell.exportRichTextDocx({ html: '<h1>Legacy Word</h1><p>Body</p>', returnBytes: true }));
    assert(legacyBytes.ok && legacyBytes.bytes.length > 2048, 'legacy Word byte generation failed');
    // Desktop saving must flush a long document even before its quiet-time sync.
    const saved = await page.evaluate(async () => {
      const e = window.__canvas2dEngine;
      e.loadStructuredBoardForExport({ items: [{ id: 'long-save', type: 'text', x: 300, y: 180, width: 600, html: '<p>' + 'long text '.repeat(1600) + '</p>', fontSize: 20 }], selectedIds: ['long-save'], view: { scale: 1 } });
      e.runCommand('element.edit'); const host = document.querySelector('#canvas-rich-editor'); host.focus();
      const range = document.createRange(); range.selectNodeContents(host); range.collapse(false);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      const started = performance.now(); document.execCommand('insertText', false, 'IMMEDIATE SAVE');
      const inputMs = performance.now() - started;
      const success = await e.saveBoard();
      return { success, inputMs, path: e.getSnapshot().boardFilePath };
    });
    assert(saved.success); assert((await fs.readFile(saved.path, 'utf8')).includes('IMMEDIATE SAVE'));
    assert(saved.inputMs < 50, `long input blocked: ${saved.inputMs}ms`);
    assert.deepEqual(errors, []);
    console.log('[check-canvas-export-integrity-desktop] formula raster, immutable model, real PDF/PNG/DOCX, cold and native-dialog cancellation, queue recovery, allocation limit and immediate long-draft save passed', { inputMs: saved.inputMs });
  } finally {
    if (app) await app.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
