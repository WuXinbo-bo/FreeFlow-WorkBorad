const assert = require('node:assert/strict');
const { chromium, _electron: electron } = require('playwright');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const URL = process.env.CANVAS_TEST_URL || 'http://127.0.0.1:3220/canvas-office.html';

async function main() {
  let browser, app, page, temp;
  if (process.env.CANVAS_EDITOR_DESKTOP === '1') {
    const root = path.resolve(__dirname, '..');
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'freeflow-editor-camera-'));
    const data = path.join(temp, 'Data'); await fs.mkdir(data);
    const version = require('../package.json').version;
    await fs.writeFile(path.join(data, 'ui-settings.json'), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version, defaultLaunchFullscreen: false }));
    const bootstrap = path.join(temp, 'bootstrap.cjs');
    await fs.writeFile(bootstrap, `const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temp, 'Profile'))});app.getAppPath=()=>${JSON.stringify(root)};require(${JSON.stringify(path.join(root,'electron/main.js'))});`);
    const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data, FREEFLOW_CANVAS_BOARD_DIR: path.join(temp, 'Boards'), FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, 'Legacy'), FREEFLOW_PORT: '0' };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: require('electron'), args: [bootstrap], cwd: root, env });
    page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setFullScreen(false); w.setContentSize(1440,960); w.show(); w.focus(); });
  } else {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  }
  const errors = [], failures = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    if (!app) await page.goto(URL);
    else await page.waitForFunction(() => !document.body.classList.contains('app-booting'));
    await page.waitForFunction(() => window.__canvas2dEngine);
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    if (app) {
      const workspace = page.locator('.canvas2d-workspace-panel').getByRole('button', { name: '收起画布工作区', exact: true });
      if (await workspace.isVisible()) await workspace.click();
      const directory = page.getByRole('button', { name: '收起画布目录', exact: true });
      if (await directory.isVisible()) await directory.click();
    }
    const base = { id: 'camera-item', x: 400, y: 220, width: 360, height: 160, text: 'Camera draft', plainText: 'Camera draft', html: '<p>Camera draft</p>', fontSize: 18 };
    const fixtures = [
      ['text', { type: 'text' }, '#canvas-rich-editor'],
      ['flowNode', { type: 'flowNode' }, '#canvas-rich-editor'],
      ['mindNode', { type: 'mindNode', rootId: base.id, childrenIds: [], links: [] }, '#canvas-rich-editor'],
      ['formula', { type: 'mathBlock', formula: 'x^2+y^2=z^2', fallbackText: '$$x^2+y^2=z^2$$', displayMode: true }, '#canvas-text-editor'],
      ['codeBlock', { type: 'codeBlock', code: 'const draft = 1;', language: 'javascript', autoHeight: true }, '#canvas-code-block-editor'],
      ['table', { type: 'table', table: { columns: 2, rows: [{ cells: [{ plainText: 'A' }, { plainText: 'B' }] }, { cells: [{ plainText: 'C' }, { plainText: 'D' }] }] } }, '#canvas-table-editor'],
      ['fileCard', { type: 'fileCard', name: 'notes.md', ext: 'md', memo: 'Memo draft', memoVisible: true }, '#canvas-file-memo-editor'],
      ['image', { type: 'image', dataUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="160"><rect width="360" height="160" fill="blue"/></svg>'), memo: 'Memo draft', memoVisible: true }, '#canvas-image-memo-editor'],
    ];
    for (const [kind, extra, selector] of fixtures.filter(f => !process.env.EDITOR_KIND || f[0] === process.env.EDITOR_KIND)) {
      try {
        for (let cycle = 0; cycle < 2; cycle++) {
          await page.evaluate(item => {
            const e = window.__canvas2dEngine;
            e.loadStructuredBoardForExport({ items: [item], selectedIds: [item.id], view: { scale: 1, offsetX: 0, offsetY: 0 } }); e.setTool('select');
          }, { ...base, ...extra, id: `camera-${kind}`, ...(kind === "mindNode" ? { rootId: `camera-${kind}` } : {}) });
          await page.waitForTimeout(200);
          if (kind === 'fileCard' || kind === 'image') {
            const memoSelector = kind === 'fileCard' ? '.canvas2d-scene-file-card-memo' : '.canvas2d-scene-image-memo';
            await page.waitForSelector(memoSelector, { state: 'attached', timeout: 3000 });
            const box = await page.locator(memoSelector).boundingBox();
            assert(box, `${kind}: missing memo`); await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
          }
          else {
            const point = await page.evaluate(() => { const r = document.querySelector('#canvas-office-canvas').getBoundingClientRect(); return { x: r.x + 460, y: r.y + 260 }; });
            await page.mouse.dblclick(point.x, point.y);
          }
          await page.waitForFunction(selector => { const n = document.querySelector(selector); return n && !n.classList.contains('is-hidden'); }, selector);
          await page.waitForTimeout(180);
          if (kind === 'fileCard' || kind === 'image') {
            await page.locator(selector).fill(cycle ? 'Changed draft' : '');
          }
          if (kind === 'table') {
            await page.locator('#canvas-table-editor [data-row-index="0"][data-column-index="0"]').dblclick();
            await page.waitForFunction(() => !document.querySelector('#canvas-table-cell-rich-editor').classList.contains('is-hidden'));
          }
          const result = await page.evaluate(async selector => {
            const editor = document.querySelector(selector), canvas = document.querySelector('#canvas-office-canvas');
            const scene = document.querySelector('#canvas2d-scene-root');
            const rect = canvas.getBoundingClientRect(), initial = editor.getBoundingClientRect();
            const initialMatrix = new DOMMatrix(getComputedStyle(scene).transform);
            const anchor = { x: (initial.x - rect.x - initialMatrix.e) / initialMatrix.a, y: (initial.y - rect.y - initialMatrix.f) / initialMatrix.d };
            const originalContent = editor.innerHTML, originalValue = editor.value;
            const cellEditor = selector === '#canvas-table-editor' ? document.querySelector('#canvas-table-cell-rich-editor') : null;
            const samples = [];
            const controls = [...document.querySelectorAll('#canvas-table-toolbar, #canvas-mind-node-chrome, #canvas2d-rich-selection-toolbar')].filter(n => !n.classList.contains('is-hidden'));
            let staleControls = 0;
            for (let step = 0; step < 48; step++) {
              canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: rect.x + 300, clientY: rect.y + 180, deltaX: step % 2 ? -9 : 12, deltaY: step < 16 ? 8 : step < 32 ? -6 : 6, ctrlKey: step >= 16, deltaMode: 0 }));
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              const m = new DOMMatrix(getComputedStyle(scene).transform), b = editor.getBoundingClientRect();
              if (scene.dataset.presentationPhase === 'active') staleControls += controls.filter(n => getComputedStyle(n).visibility !== 'hidden').length;
              if (cellEditor && !cellEditor.classList.contains('is-hidden')) {
                const cell = editor.querySelector('[data-row-index="0"][data-column-index="0"]'), cb = cell.getBoundingClientRect(), eb = cellEditor.getBoundingClientRect();
                samples.push({ dx: eb.x - cb.x, dy: eb.y - cb.y });
              }
              samples.push({ dx: b.x - (rect.x + anchor.x * m.a + m.e), dy: b.y - (rect.y + anchor.y * m.d + m.f) });
            }
            await new Promise(resolve => setTimeout(resolve, 260));
            const m = new DOMMatrix(getComputedStyle(scene).transform), b = editor.getBoundingClientRect();
            return { samples, settled: { dx: b.x - (rect.x + anchor.x * m.a + m.e), dy: b.y - (rect.y + anchor.y * m.d + m.f) }, contentStable: editor.innerHTML === originalContent, valueStable: editor.value === originalValue, staleControls, controlsRestored: controls.every(n => n.classList.contains('is-hidden') || getComputedStyle(n).visibility === 'visible') };
          }, selector);
          const worst = Math.max(...result.samples.map(s => Math.max(Math.abs(s.dx), Math.abs(s.dy))));
          assert(worst < 3, `${kind}: live camera drift ${worst.toFixed(2)}px`);
          assert(Math.abs(result.settled.dx) < 3 && Math.abs(result.settled.dy) < 3, `${kind}: stale position after settle`);
          assert(result.valueStable, `${kind}: camera changed editor draft`);
          assert.equal(result.staleControls, 0, `${kind}: stale anchored controls during motion`);
          assert(result.controlsRestored, `${kind}: anchored controls did not recover`);
          if (['text', 'flowNode', 'mindNode', 'codeBlock'].includes(kind)) assert(result.contentStable, `${kind}: camera rebuilt editor content`);
          if ((kind === 'fileCard' || kind === 'image') && cycle) {
            const r = await page.locator('#canvas-office-canvas').boundingBox();
            await page.mouse.click(r.x + 20, r.y + 300);
            assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshotData().items[0].memo), 'Changed draft', `${kind}: blur/camera lost committed draft`);
            await page.evaluate(() => window.__canvas2dEngine.undo());
            assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshotData().items[0].memo), 'Memo draft', `${kind}: memo undo failed`);
          } else {
            await page.evaluate(() => window.__canvas2dEngine.runCommand('canvas.cancel'));
          }
          await page.waitForTimeout(180);
          assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().editingId), null, `${kind}: exit left editing state`);
          console.log(`[editor-camera] ${kind} cycle ${cycle + 1}: 48 live pan/zoom frames, settle and exit passed`);
        }
      } catch (error) { console.error(kind, error.message, await page.evaluate(() => ({ board: window.__canvas2dEngine.getSnapshotData(), editor: window.__canvas2dEngine.getSnapshot().editingType, content: document.querySelector("#canvas2d-content-layer")?.innerHTML.slice(0, 1000) }))); failures.push(error.message); }
    }
    await page.evaluate(() => {
      const e = window.__canvas2dEngine;
      e.loadStructuredBoardForExport({ items: [{ id: 'search-item', type: 'text', x: 400, y: 220, width: 360, height: 160, text: 'Camera search target', html: '<p>Camera search target</p>' }], selectedIds: [], view: { scale: 1 } });
      e.setTool('select');
    });
    await page.getByRole('button', { name: '打开画布搜索', exact: true }).click();
    await page.locator('.canvas2d-engine-search-input').fill('Camera search target');
    await page.locator('.canvas2d-engine-search-result').first().click();
    await page.locator('.canvas2d-engine-search-highlight').waitFor();
    await page.addStyleTag({ content: '.canvas2d-engine-search-highlight {animation:none!important}' });
    const searchDrift = await page.evaluate(async () => {
      const canvas = document.querySelector('#canvas-office-canvas'), rect = canvas.getBoundingClientRect();
      const highlight = document.querySelector('.canvas2d-engine-search-highlight');
      const world = { x: parseFloat(highlight.style.left), y: parseFloat(highlight.style.top) };
      let worst = 0;
      for (let i = 0; i < 8; i++) {
        canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 5, ctrlKey: true, clientX: rect.x + 300, clientY: rect.y + 180 }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const m = new DOMMatrix(getComputedStyle(document.querySelector('#canvas2d-scene-root')).transform), r = highlight.getBoundingClientRect();
        worst = Math.max(worst, Math.abs(r.x - rect.x - world.x * m.a - m.e), Math.abs(r.y - rect.y - world.y * m.d - m.f));
      }
      return worst;
    });
    assert(searchDrift < 3, `search highlight camera drift: ${searchDrift}`);
    console.log('[editor-camera] search highlight follows the presented camera');
    // A queued callback from a closed mind editor must not change the next text session.
    await page.evaluate(() => {
      const e = window.__canvas2dEngine;
      e.loadStructuredBoardForExport({ items: [{ ...e.getSnapshotData().items[0], id: 'old-mind', type: 'mindNode', text: 'Old', html: '<p>Old</p>', rootId: 'old-mind', childrenIds: [] }], selectedIds: ['old-mind'], view: { scale: 1 } });
      e.runCommand('element.edit'); e.runCommand('canvas.cancel');
      e.loadStructuredBoardForExport({ items: [{ id: 'next-text', type: 'text', x: 400, y: 220, width: 360, height: 160, fontSize: 18, html: '<h2>Keep heading</h2>', text: 'Keep heading' }], selectedIds: ['next-text'], view: { scale: 1 } });
      e.runCommand('element.edit');
    });
    await page.waitForTimeout(180);
    assert(await page.locator('#canvas-rich-editor h2').count() === 1, 'old mind editor callback changed next text heading');
    await page.evaluate(() => window.__canvas2dEngine.runCommand('canvas.cancel'));
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
  } finally {
    if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close(); }
    if (browser) await browser.close();
    if (temp) await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
