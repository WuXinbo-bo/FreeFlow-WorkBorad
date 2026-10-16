const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'freeflow-navigation-desktop-'));
  const data = path.join(temp, 'Data'), boards = path.join(temp, 'Boards');
  await fs.mkdir(data); await fs.mkdir(boards);
  const version = require('../package.json').version;
  await fs.writeFile(path.join(data, 'ui-settings.json'), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version, defaultCanvasPanelVisible: true, defaultChatPanelVisible: true, defaultLaunchFullscreen: false }));
  const source = path.join(boards, 'Notes.md'); await fs.writeFile(source, '# Navigation test\n' + 'Long reading notes\n'.repeat(100));
  const bootstrap = path.join(temp, 'bootstrap.cjs');
  await fs.writeFile(bootstrap, `const { app, ipcMain, globalShortcut } = require('electron'); app.setPath('userData', ${JSON.stringify(path.join(temp, 'Profile'))}); app.getAppPath = () => ${JSON.stringify(ROOT)};
    const register = globalShortcut.register.bind(globalShortcut); global.__shortcutCallbacks = new Map();
    globalShortcut.register = (key, cb) => { const ok = register(key, cb); if (ok) global.__shortcutCallbacks.set(key, cb); return ok; };
    require(${JSON.stringify(path.join(ROOT, 'electron/main.js'))});`);
  const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data, FREEFLOW_CANVAS_BOARD_DIR: boards, FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, 'Legacy'), FREEFLOW_PORT: '0' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page; const errors = [];
  const launch = async () => {
    app = await electron.launch({ executablePath: require('electron'), args: [bootstrap], cwd: ROOT, env });
    page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
    await ready();
  };
  const ready = async () => {
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains('app-booting'));
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
  };
  const close = async () => { if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close(); app = null; } };
  const settings = async () => {
    if (!(await page.locator('#insight-drawer').evaluate(n => n.classList.contains('is-open')))) await page.locator('#conversation-settings-btn').evaluate(b => b.click());
    await page.locator('[data-settings-section="workbench"]').click();
    await page.locator('[data-settings-shortcut]').waitFor();
    await page.waitForFunction(() => document.querySelector('#insight-drawer').getBoundingClientRect().right <= innerWidth + 1);
  };
  const save = async () => {
    await page.locator('[data-settings-action="save"]').click();
    await page.waitForFunction(() => document.querySelector('.settings-center-save-state')?.textContent.includes('已保存并应用'));
  };
  const checkLayout = async (canvas, chat, fullscreen) => {
    await page.waitForFunction(({ canvas, chat }) => {
      const root = document.querySelector('.workspace');
      return root && root.classList.contains('left-collapsed') === !canvas && root.classList.contains('right-collapsed') === !chat;
    }, { canvas, chat });
    await page.waitForFunction(async fullscreen => (await window.desktopShell.getState()).fullscreen === fullscreen, fullscreen);
    // A transient native zoom reading must not count as a completed restore.
    await app.evaluate(async ({ BrowserWindow, screen }, fullscreen) => {
      const window = BrowserWindow.getAllWindows()[0];
      const deadline = Date.now() + 5000;
      let stableSince = 0;
      while (Date.now() < deadline) {
        const bounds = window.getBounds();
        const workArea = screen.getDisplayMatching(bounds).workArea;
        const settled = fullscreen
          ? ["x", "y", "width", "height"].every(key => Math.abs(bounds[key] - workArea[key]) <= 1)
          : !window.isFullScreen() && !window.isMaximized();
        if (settled) {
          if (!stableSince) stableSince = Date.now();
          if (Date.now() - stableSince >= 150) return;
        } else {
          stableSince = 0;
        }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Native fullscreen layout did not settle: ${JSON.stringify(window.getBounds())}`);
    }, fullscreen);
    assert.equal((await page.evaluate(() => window.desktopShell.getState())).fullscreen, fullscreen);
  };
  try {
    await launch();
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(1440, 960); w.show(); w.focus(); });
    const workspaceCollapse = page.locator('.canvas2d-workspace-panel').getByRole('button', { name: '收起画布工作区', exact: true });
    if (await workspaceCollapse.isVisible()) await workspaceCollapse.click();
    const directoryCollapse = page.getByRole('button', { name: '收起画布目录', exact: true });
    if (await directoryCollapse.isVisible()) await directoryCollapse.click();
    await page.evaluate(({ source }) => {
      const e = window.__canvas2dEngine; e.setAutosaveEnabled(false, { persist: false, syncSettings: false });
      e.loadStructuredBoardForExport({ items: [{ id: 'file', type: 'fileCard', x: 500, y: 80, width: 400, height: 128, name: 'Notes.md', sourcePath: source, ext: 'md' }], selectedIds: ['file'], view: { scale: 1, offsetX: 0, offsetY: 0 } }); e.setTool('select');
    }, { source });
    const map = page.locator('#canvas2d-transient-minimap');
    if (await map.evaluate(n => n.classList.contains('is-collapsed'))) await map.locator('button').click();
    await page.waitForTimeout(180);
    const mapGeometry = await map.evaluate(n => {
      const r = n.getBoundingClientRect(), anchor = document.querySelector('[data-stage-panel-controls="left"]').getBoundingClientRect(), c = n.querySelector('canvas');
      return { x: r.x, y: r.y, anchorX: anchor.x, anchorBottom: anchor.bottom, width: c.width, cssWidth: c.__ffLogicalWidth, dpr: devicePixelRatio };
    });
    assert(Math.abs(mapGeometry.x - mapGeometry.anchorX) < 3 && mapGeometry.y >= mapGeometry.anchorBottom + 8, JSON.stringify(mapGeometry));
    assert.equal(mapGeometry.width, Math.round(mapGeometry.cssWidth * Math.min(3, mapGeometry.dpr)));
    // Map centre must hit the scene centre, independent of Retina backing pixels.
    await map.locator('canvas').click();
    const centered = await page.evaluate(() => { const e = window.__canvas2dEngine, v = e.getSnapshotData().view, r = document.querySelector('#canvas-office-canvas').getBoundingClientRect(); return { x: (r.width / 2 - v.offsetX) / v.scale, y: (r.height / 2 - v.offsetY) / v.scale }; });
    assert(Math.abs(centered.x - 700) < 3 && Math.abs(centered.y - 144) < 3, JSON.stringify(centered));
    await map.locator('button').click();
    console.log('[navigation-desktop] Retina resolution, top-left anchor and map click passed');
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, boards);
    await page.evaluate(() => window.desktopShell.pickDirectory({}));
    await page.evaluate(() => { const e = window.__canvas2dEngine; const b = e.getSnapshotData(); b.view = { scale: 1, offsetX: 0, offsetY: 0 }; e.loadStructuredBoardForExport(b); e.openFileCardPreview(e.getSnapshotData().items[0]); });
    const preview = page.locator('.canvas2d-file-preview-react');
    await page.waitForFunction(() => document.querySelector('.canvas2d-file-preview-react')?.dataset.renderState === 'ready');
    const h = () => preview.evaluate(n => parseFloat(n.style.height));
    const startHeight = await h();
    await page.evaluate(() => { window.__previewEvents = []; for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'blur']) window.addEventListener(type, e => { if (type !== 'pointermove' || e.buttons) window.__previewEvents.push({type, target:e.target?.className, buttons:e.buttons, x:e.clientX, y:e.clientY}); }, true); });
    const handle = page.getByRole('button', { name: '调整预览高度', exact: true });
    for (const exit of ['escape', 'blur', 'commit']) {
      const box = await handle.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(150); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 100, { steps: 6 });
      await page.waitForTimeout(80);
      assert(Math.abs(await h() - startHeight - 100) < 2, JSON.stringify({ exit, height: await h(), startHeight, box, debug: await page.evaluate(() => window.__previewEvents) }));
      if (exit === 'escape') await page.keyboard.press('Escape');
      if (exit === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.mouse.up();
      if (exit === 'commit') await page.waitForFunction(height => Math.abs(parseFloat(document.querySelector('.canvas2d-file-preview-react').style.height) - height) < 2, startHeight + 100);
      if (exit === 'commit') { assert(Math.abs(await h() - startHeight - 100) < 2, JSON.stringify({ exit, height: await h(), startHeight, box, debug: await preview.evaluate(n => ({ratio:n.dataset.resizeHeightRatio, state:n.dataset.renderState, capture:document.activeElement?.outerHTML?.slice(0,150)})) })); await page.evaluate(() => window.__canvas2dEngine.undo()); }
      assert.equal(await h(), startHeight, exit);
    }
    await handle.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowDown');
    await page.waitForFunction(height => parseFloat(document.querySelector('.canvas2d-file-preview-react').style.height) === height, startHeight + 1000);
    assert.equal(await h(), startHeight + 1000);
    const savedBoard = await page.evaluate(() => window.__canvas2dEngine.getSnapshotData());
    await fs.writeFile(path.join(boards, 'Preview.freeflow'), JSON.stringify(savedBoard));
    for (const x of [-5000, 500]) {
      await page.evaluate(x => window.__canvas2dEngine.runCommand('selection.set-geometry', { x }), x);
      await page.waitForTimeout(100); assert.equal(await preview.evaluate(n => parseFloat(n.style.left)), x);
      const bounds = await preview.boundingBox(); assert(bounds && (x < 0 ? bounds.x + bounds.width < 0 : bounds.x > 0), JSON.stringify(bounds));
    }
    await page.evaluate(() => { const e = window.__canvas2dEngine; e.closeFileCardPreview(e.getSnapshot().fileCardPreviewRequests[0].id); e.openFileCardPreview(e.getSnapshotData().items[0]); });
    assert.equal(await h(), startHeight + 1000);
    await page.evaluate(board => { const e = window.__canvas2dEngine; e.loadStructuredBoardForExport(board); e.openFileCardPreview(e.getSnapshotData().items[0]); }, JSON.parse(await fs.readFile(path.join(boards, 'Preview.freeflow'), 'utf8')));
    await preview.waitFor(); assert.equal(await h(), startHeight + 1000);
    await preview.getByRole('button', { name: '专注阅读', exact: true }).click(); await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.file-workstation-reader')); assert.equal(await h(), startHeight + 1000);
    await page.screenshot({ path: '/tmp/freeflow-navigation-preview.png' });
    console.log('[navigation-desktop] preview resize commit/cancel/undo, offscreen return, long size and serialized reopen passed');
    await settings();
    const recorder = page.locator('[data-settings-shortcut]');
    for (const chord of ['Control+F9', 'Control+Shift+F10', 'Control+Alt+Shift+F11']) {
      await recorder.click(); await page.waitForFunction(() => document.querySelector('[data-settings-shortcut]')?.dataset.recording === 'true');
      await page.keyboard.press(chord);
      assert.equal((await page.evaluate(() => window.desktopShell.getState())).clickThrough, false);
      await save();
      const stored = (await page.evaluate(() => window.desktopShell.getShortcutSettings())).settings.clickThroughAccelerator;
      assert.equal(stored, chord.replace('Control+Alt+Shift', 'Control+Shift+Alt'));
      assert(await app.evaluate(({ globalShortcut }, key) => globalShortcut.isRegistered(key), stored));
    }
    // Recording the current chord must not toggle full click-through.
    await recorder.click(); await page.waitForFunction(() => document.querySelector('[data-settings-shortcut]')?.dataset.recording === 'true');
    await page.keyboard.press('Control+Alt+Shift+F11');
    assert.equal((await page.evaluate(() => window.desktopShell.getState())).clickThrough, false);
    await page.keyboard.press('Escape');
    assert(await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Shift+Alt+F11')));
    const invalid = await page.evaluate(() => window.desktopShell.setShortcutSettings({ clickThroughAccelerator: 'Control+A+B' })); assert.equal(invalid.ok, false);
    await app.evaluate(({ globalShortcut }) => { globalShortcut.register('Control+F8', () => {}); });
    const occupied = await page.evaluate(() => window.desktopShell.setShortcutSettings({ clickThroughAccelerator: 'Control+F8' })); assert.equal(occupied.ok, false);
    assert.equal((await page.evaluate(() => window.desktopShell.getShortcutSettings())).settings.clickThroughAccelerator, 'Control+Shift+Alt+F11');
    await app.evaluate(({ globalShortcut }) => globalShortcut.unregister('Control+F8'));
    // Exercise the callback registered with Electron, and its exit recovery.
    await app.evaluate(() => global.__shortcutCallbacks.get('Control+Shift+Alt+F11')()); await page.waitForTimeout(300);
    assert.equal((await page.evaluate(() => window.desktopShell.getState())).clickThrough, true);
    await app.evaluate(() => global.__shortcutCallbacks.get('Control+Shift+Alt+F11')()); await page.waitForTimeout(300);
    assert.equal((await page.evaluate(() => window.desktopShell.getState())).clickThrough, false);
    console.log('[navigation-desktop] real key recording 2/3/4 keys, native registration/conflict and callback recovery passed');
    // Save through the real settings UI, then refresh and restart with the same profile.
    for (const [canvas, chat, fullscreen] of [[true, false, false], [false, true, false], [false, false, true], [true, true, false]]) {
      await settings();
      for (const [key, value] of Object.entries({ defaultCanvasPanelVisible: canvas, defaultChatPanelVisible: chat, defaultLaunchFullscreen: fullscreen })) {
        const input = page.locator(`[data-settings-path="workbench.${key}"]`);
        if (await input.isChecked() !== value) {
          await input.locator('..').scrollIntoViewIfNeeded();
          await input.locator('..').locator('.settings-center-switch').click();
        }
      }
      await save(); await checkLayout(canvas, chat, fullscreen);
      await page.reload(); await ready(); await checkLayout(canvas, chat, fullscreen);
      await close(); await launch(); await checkLayout(canvas, chat, fullscreen);
      assert.equal((await page.evaluate(() => window.desktopShell.getShortcutSettings())).settings.clickThroughAccelerator, 'Control+Shift+Alt+F11');
      await settings();
      console.log(`[navigation-desktop] save/refresh/restart layout ${canvas}/${chat}/${fullscreen} passed`);
    }
    assert.deepEqual(errors, []);
  } catch (error) {
    await page?.screenshot({ path: '/tmp/freeflow-navigation-failure.png' }).catch(() => {});
    console.error('[navigation-desktop:failure]', await page?.evaluate(() => ({viewport:{width:innerWidth,height:innerHeight},drawer:document.querySelector('#insight-drawer')?.getBoundingClientRect().toJSON(), controls:[...document.querySelectorAll('.settings-center-toggle')].map(n=>({label:n.textContent,box:n.getBoundingClientRect().toJSON()}))})).catch(() => null));
    throw error;
  } finally { await close(); await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
