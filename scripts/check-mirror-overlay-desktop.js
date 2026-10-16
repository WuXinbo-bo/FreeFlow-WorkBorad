const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { _electron: electron } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const runFile = promisify(execFile);

async function waitFor(label, predicate, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await predicate();
    if (result) return result;
    await delay(80);
  }
  throw new Error(`Timed out: ${label}`);
}

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'freeflow-mirror-overlay-'));
  const data = path.join(temp, 'Data');
  const boards = path.join(temp, 'Boards');
  await fs.mkdir(data); await fs.mkdir(boards);
  const version = require('../package.json').version;
  await fs.writeFile(path.join(data, 'ui-settings.json'), JSON.stringify({
    hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version,
    defaultCanvasPanelVisible: true, defaultChatPanelVisible: true, defaultLaunchFullscreen: false,
    updateCheckEnabled: false,
  }));

  let mirrorLoads = 0;
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    if (request.url === '/stream') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      let count = 0;
      const tick = () => response.write(`data: ${++count}\n\n`);
      tick();
      const timer = setInterval(tick, 80);
      response.on('close', () => clearInterval(timer));
      return;
    }
    if (request.url !== '/mirror') { response.writeHead(404); response.end(); return; }
    mirrorLoads += 1;
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(`<!doctype html><html><head><title>FreeFlow local mirror fixture</title><style>
      *{box-sizing:border-box}body{margin:0;background:#ee14c8;color:#111;font:14px system-ui}
      #counter{position:fixed;left:8px;top:12px;background:#fff;padding:6px}
      #draft{position:fixed;left:8px;top:60px;width:88px;height:76px;resize:none}
      #scroll{position:fixed;left:8px;top:160px;width:88px;height:160px;overflow:auto;background:#fff}
      #scroll>div{height:1800px;background:repeating-linear-gradient(#fff 0 30px,#eee 30px 60px)}
    </style></head><body><output id="counter">stream</output><textarea id="draft" aria-label="Mirror draft"></textarea>
      <div id="scroll"><div>Scroll fixture</div></div><script>
      const state={loadId:${mirrorLoads},ticks:0,clicks:0,keys:0};
      const draft=document.querySelector('#draft'),scroll=document.querySelector('#scroll');
      document.addEventListener('click',()=>state.clicks++);document.addEventListener('keydown',()=>state.keys++);
      const stream=new EventSource('/stream');stream.onmessage=event=>{state.ticks=Number(event.data);document.querySelector('#counter').textContent='Stream '+state.ticks};
      window.__mirrorFixture={snapshot:()=>({...state,draft:draft.value,scrollTop:scroll.scrollTop,active:document.activeElement?.id})};
      </script></body></html>`);
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const fixtureUrl = `http://127.0.0.1:${server.address().port}/mirror`;
  const bootstrap = path.join(temp, 'bootstrap.cjs');
  await fs.writeFile(bootstrap, `const {app,globalShortcut}=require('electron');
    app.setPath('userData',${JSON.stringify(path.join(temp, 'Profile'))});app.getAppPath=()=>${JSON.stringify(ROOT)};
    const register=globalShortcut.register.bind(globalShortcut);global.__shortcutCallbacks=new Map();
    globalShortcut.register=(key,callback)=>{const ok=register(key,callback);if(ok)global.__shortcutCallbacks.set(key,callback);return ok};
    const {AI_MIRROR_TARGETS}=require(${JSON.stringify(path.join(ROOT, 'electron/aiMirrorTargetManager.js'))});
    AI_MIRROR_TARGETS[0].webUrl=${JSON.stringify(fixtureUrl)};
    require(${JSON.stringify(path.join(ROOT, 'electron/main.js'))});`);
  const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data,
    FREEFLOW_CANVAS_BOARD_DIR: boards, FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, 'Legacy'), FREEFLOW_PORT: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const errors = [];

  const nativeState = () => app.evaluate(({ BrowserWindow, webContents }, fixtureUrl) => {
    const window = BrowserWindow.getAllWindows()[0];
    const all = webContents.getAllWebContents().filter(contents => !contents.isDestroyed());
    const mirror = all.find(contents => contents.getURL() === fixtureUrl);
    const overlay = all.find(contents => contents.getURL().includes('/mirror-overlay.html'));
    return { mirrorId: mirror?.id ?? null, overlayId: overlay?.id ?? null,
      focusedId: webContents.getFocusedWebContents()?.id ?? null,
      contentBounds: window.getContentBounds(),
      children: window.contentView.children.map(view => ({ id: view.webContents?.id ?? null,
        bounds: view.getBounds(), visible: view.getVisible() })),
    };
  }, fixtureUrl);
  const runIn = (id, code) => app.evaluate(({ webContents }, { id, code }) => {
    const contents = webContents.fromId(id);
    if (!contents || contents.isDestroyed()) throw new Error(`Missing webContents ${id}`);
    return contents.executeJavaScript(code, true);
  }, { id, code });
  const sendInput = (id, events) => app.evaluate(({ webContents }, { id, events }) => {
    const contents = webContents.fromId(id);
    if (!contents || contents.isDestroyed()) throw new Error(`Missing input target ${id}`);
    contents.focus();
    for (const event of events) contents.sendInputEvent(event);
  }, { id, events });
  const nativeClick = async (id, selector) => {
    const point = await runIn(id, `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;e.scrollIntoView({block:"center",inline:"nearest",behavior:"instant"});const r=e.getBoundingClientRect();return r.width&&r.height?{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}:null})()`);
    assert(point, `No visible native input target: ${selector}`);
    await sendInput(id, [{ type: 'mouseMove', ...point }, { type: 'mouseDown', button: 'left', clickCount: 1, ...point }, { type: 'mouseUp', button: 'left', clickCount: 1, ...point }]);
  };
  const pressEscape = id => sendInput(id, [{ type: 'keyDown', keyCode: 'Escape' }, { type: 'keyUp', keyCode: 'Escape' }]);
  const mirrorSnapshot = async () => {
    const state = await nativeState();
    assert(state.mirrorId, 'Mirror must still exist');
    return { id: state.mirrorId, ...await runIn(state.mirrorId, 'window.__mirrorFixture.snapshot()') };
  };
  const assertMirrorFrame = async () => {
    let lastFrame;
    try {
      await waitFor('native mirror aligns with its visible frame', async () => {
        const state = await nativeState();
        const view = state.children.find(child => child.id === state.mirrorId && child.visible);
        const frame = await page.locator('.screen-source-preview-shell').boundingBox();
        if (!view || !frame) return false;
        const gaps = [view.bounds.x - frame.x, view.bounds.y - frame.y,
          frame.x + frame.width - view.bounds.x - view.bounds.width,
          frame.y + frame.height - view.bounds.y - view.bounds.height];
        lastFrame = { bounds: view.bounds, frame, gaps };
        // Native bounds use integer DIP, so allow one pixel of edge rounding.
        return gaps.every(gap => gap >= -1 && gap <= 5);
      });
    } catch (error) {
      throw new Error(`${error.message}: ${JSON.stringify(lastFrame)}`);
    }
  };
  const waitOverlay = kind => waitFor(`native ${kind} overlay`, async () => {
    const state = await nativeState();
    if (!state.overlayId || !state.children.some(child => child.id === state.overlayId && child.visible)) return false;
    const visible = await runIn(state.overlayId, `!document.querySelector(${JSON.stringify(kind === 'settings' ? '#insight-drawer' : '#overlay-menu')}).hidden`);
    return visible ? state : false;
  });
  const closeOverlay = async () => {
    const state = await nativeState();
    if (state.overlayId) await pressEscape(state.overlayId);
    await waitFor('overlay detached', async () => {
      const next = await nativeState();
      return !next.children.some(child => child.id === next.overlayId && child.visible);
    });
  };
  const openSettings = async () => {
    await page.locator('#conversation-settings-btn').evaluate(button => button.click());
    const state = await waitOverlay('settings');
    await waitFor('settings loaded', () => runIn(state.overlayId, 'Boolean(document.querySelector("[data-settings-section=workbench]"))'));
    return state;
  };
  const startMirror = async () => {
    await page.locator('[data-right-panel-view="screen"]').evaluate(button => button.click());
    const summary = page.locator('#screen-source-header-menu > summary');
    if (!await page.locator('#screen-source-header-menu').evaluate(node => node.open)) await summary.evaluate(button => button.click());
    await page.waitForFunction(() => Boolean(document.querySelector('#screen-source-select')?.value));
    await page.locator('#screen-source-render-mode-select').evaluate(select => { select.value = 'webcontentsview'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.locator('#screen-source-embed-toggle-btn').evaluate(button => button.click());
    await waitFor('mirror attached', async () => {
      const state = await nativeState();
      return state.mirrorId && state.children.some(child => child.id === state.mirrorId && child.visible);
    });
    if (await page.locator('#screen-source-header-menu').evaluate(node => node.open)) await summary.evaluate(button => button.click());
    await waitFor('fixture stream', async () => (await mirrorSnapshot()).ticks > 1);
  };
  const captureNative = async label => {
    const state = await nativeState();
    const output = path.join(os.tmpdir(), `freeflow-mirror-overlay-${label}-native.png`);
    if (process.platform === 'darwin') {
      const bounds = state.contentBounds;
      await runFile('/usr/sbin/screencapture', ['-x', '-R', [bounds.x, bounds.y, bounds.width, bounds.height].map(Math.round).join(','), output]);
    } else {
      const png = await app.evaluate(async ({ desktopCapturer, screen }) => {
        const display = screen.getPrimaryDisplay();
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: display.size.width * display.scaleFactor, height: display.size.height * display.scaleFactor } });
        const source = sources.find(item => item.display_id === String(display.id)) || sources[0];
        if (!source || source.thumbnail.isEmpty()) throw new Error('Native desktop capture is unavailable');
        return source.thumbnail.toPNG().toString('base64');
      });
      await fs.writeFile(output, Buffer.from(png, 'base64'));
    }
    assert((await fs.stat(output)).size > 1000, 'Native screen capture must contain image data');
    console.log(`[mirror-overlay-desktop] native screenshot: ${output}`);
  };

  try {
    app = await electron.launch({ executablePath: require('electron'), args: [bootstrap], cwd: ROOT, env });
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains('app-booting'));
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    await app.evaluate(({ app: nativeApp, BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0], work = screen.getPrimaryDisplay().workAreaSize;
      window.setContentSize(Math.min(1440, work.width - 24), Math.min(960, work.height - 24));
      window.center(); window.show(); nativeApp.focus({ steal: true }); window.focus();
    });
    await startMirror();
    await assertMirrorFrame();
    const original = await mirrorSnapshot();
    await nativeClick(original.id, '#draft');
    await app.evaluate(({ webContents }, id) => webContents.fromId(id).insertText('Draft survives native overlays'), original.id);
    await runIn(original.id, 'document.querySelector("#scroll").scrollTop=420');
    const baseline = await mirrorSnapshot();
    assert.equal(baseline.draft, 'Draft survives native overlays');
    assert.equal(baseline.scrollTop, 420);

    await page.locator('#conversation-shell-more').evaluate(button => button.click());
    const menu = await waitOverlay('menu');
    await waitFor('shell menu content', () => runIn(menu.overlayId, 'Boolean(document.querySelector("[data-action-id=conversation-shell-pin-btn]"))'));
    assert.equal(menu.children.at(-1).id, menu.overlayId, 'Native menu must be above the live mirror');
    assert(menu.children.some(child => child.id === original.id && child.visible), 'Menu must not detach the mirror');
    const menuBounds = (await nativeState()).children.find(child => child.id === menu.overlayId).bounds;
    assert(menuBounds.width <= 232, 'Native shell menu uses the same compact width as the DOM menu');
    assert.equal(await runIn(menu.overlayId, 'document.querySelector(".mirror-overlay-menu-item")?.getBoundingClientRect().height'), 32);
    await captureNative('menu');
    // Open settings directly from the active menu, matching the original failure path.
    let settings = await openSettings();
    assert.equal(settings.children.at(-1).id, settings.overlayId, 'Settings native view must be topmost');
    const mirrorView = settings.children.find(child => child.id === original.id);
    const overlayView = settings.children.find(child => child.id === settings.overlayId);
    assert(mirrorView?.visible && overlayView?.visible, 'Both native views must remain live');
    const overlap = Math.min(mirrorView.bounds.x + mirrorView.bounds.width, overlayView.bounds.x + overlayView.bounds.width) - Math.max(mirrorView.bounds.x, overlayView.bounds.x);
    assert(overlap > 40, 'Settings must actually overlap the mirror');
    assert(overlayView.bounds.width < settings.contentBounds.width * 0.75, 'Settings must leave the main workspace exposed');
    await captureNative('settings');
    const exposedWidth = overlayView.bounds.x - mirrorView.bounds.x;
    assert(exposedWidth > 16, 'Half-width settings must leave some mirror surface interactive');
    const point = { x: Math.min(24, Math.floor(exposedWidth - 4)), y: 88 };
    await sendInput(original.id, [{ type: 'mouseDown', button: 'left', clickCount: 1, ...point }, { type: 'mouseUp', button: 'left', clickCount: 1, ...point }]);
    await app.evaluate(({ webContents }, id) => webContents.fromId(id).insertText(' + editable'), original.id);
    const editing = await mirrorSnapshot();
    assert(editing.draft.includes(' + editable'), 'Uncovered mirror must remain editable while settings are open');
    assert.equal(editing.scrollTop, baseline.scrollTop);
    assert.equal(editing.id, original.id);
    assert.equal(mirrorLoads, 1);
    assert(editing.ticks > baseline.ticks, 'Live streaming must continue beneath native overlays');
    await nativeClick(settings.overlayId, '#overlay-close');
    await waitFor('settings close', () => page.locator('#insight-drawer').evaluate(node => !node.classList.contains('is-open')));
    settings = await openSettings();
    assert.equal((await mirrorSnapshot()).draft, editing.draft);
    assert.equal((await mirrorSnapshot()).id, original.id);
    console.log('[mirror-overlay-desktop] draft, scroll, stream, native coverage and reopen passed');

    await nativeClick(settings.overlayId, '[data-settings-section="workbench"]');
    await waitFor('shortcut recorder', () => runIn(settings.overlayId, 'Boolean(document.querySelector("[data-settings-shortcut]"))'));
    await nativeClick(settings.overlayId, '[data-settings-shortcut]');
    await waitFor('shortcut recording', () => runIn(settings.overlayId, 'document.querySelector("[data-settings-shortcut]")?.dataset.recording==="true"'));
    await sendInput(settings.overlayId, [
      { type: 'keyDown', keyCode: 'Control', modifiers: ['control'] },
      { type: 'keyDown', keyCode: 'Shift', modifiers: ['control', 'shift'] },
      { type: 'keyDown', keyCode: 'F10', modifiers: ['control', 'shift'] },
      { type: 'keyUp', keyCode: 'F10', modifiers: ['control', 'shift'] },
      { type: 'keyUp', keyCode: 'Shift', modifiers: ['control'] }, { type: 'keyUp', keyCode: 'Control' },
    ]);
    await nativeClick(settings.overlayId, '[data-settings-action="save"]');
    await waitFor('shortcut saved through overlay', async () => (await page.evaluate(() => window.desktopShell.getShortcutSettings())).settings.clickThroughAccelerator === 'Control+Shift+F10');
    assert.equal((await page.evaluate(() => window.desktopShell.getState())).clickThrough, false);
    await closeOverlay();
    for (let index = 0; index < 5; index += 1) { await openSettings(); await closeOverlay(); }
    assert.equal((await mirrorSnapshot()).id, original.id);
    assert.equal(mirrorLoads, 1);

    settings = await openSettings();
    const beforeResize = await nativeState();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1240, 760));
    await waitFor('settings follows resized window', async () => {
      const state = await nativeState();
      const view = state.children.find(child => child.id === settings.overlayId);
      return state.contentBounds.width === 1240 && view?.bounds.height === state.contentBounds.height - 16;
    });
    for (const fullscreen of [true, false]) {
      // The shell suppresses a second fullscreen request during its 120 ms bounds transition.
      await delay(300);
      await page.evaluate(() => window.desktopShell.toggleFullscreen());
      await waitFor(`fullscreen ${fullscreen}`, async () => (await page.evaluate(() => window.desktopShell.getState())).fullscreen === fullscreen);
      await waitFor('fullscreen overlay bounds', async () => {
        const state = await nativeState(), view = state.children.find(child => child.id === settings.overlayId);
        return view?.visible && view.bounds.height === state.contentBounds.height - 16 && view.bounds.x + view.bounds.width <= state.contentBounds.width;
      });
      assert.equal((await mirrorSnapshot()).id, original.id);
    }
    await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setContentSize(bounds.width, bounds.height), beforeResize.contentBounds);
    await closeOverlay();
    await assertMirrorFrame();

    // Complex canvas portals use keep-alive detachment, then restore the same live session.
    await page.evaluate(() => {
      const dialog = document.createElement('div'); dialog.id = 'mirror-test-dialog';
      dialog.setAttribute('role', 'dialog'); dialog.setAttribute('data-shape-include', 'true');
      dialog.style.cssText = 'position:fixed;inset:0;z-index:99999;background:white;pointer-events:auto';
      document.querySelector('#global-overlay-layer').append(dialog);
    });
    await waitFor('complex portal detaches mirror', async () => {
      const state = await nativeState();
      return state.mirrorId === original.id && !state.children.some(child => child.id === original.id && child.visible);
    });
    await page.locator('#mirror-test-dialog').evaluate(node => node.remove());
    await waitFor('complex portal restores same mirror', async () => (await nativeState()).children.some(child => child.id === original.id && child.visible));
    await page.locator('#conversation-shell-more').evaluate(button => button.click());
    await waitOverlay('menu');
    await nativeClick(original.id, '#draft');
    await waitFor('native menu closes on mirror focus', async () => {
      const state = await nativeState(); return !state.children.some(child => child.id === state.overlayId && child.visible);
    });
    assert.equal((await mirrorSnapshot()).draft, editing.draft);
    console.log('[mirror-overlay-desktop] resize, fullscreen, complex portal restoration and menu blur passed');

    for (const enabled of [true, false]) {
      // The real global shortcut intentionally debounces repeated triggers for 250 ms.
      await delay(300);
      await app.evaluate(() => global.__shortcutCallbacks.get('Control+Shift+F10')());
      await waitFor(`click-through ${enabled}`, async () => (await page.evaluate(() => window.desktopShell.getState())).clickThrough === enabled);
      assert.equal((await mirrorSnapshot()).id, original.id);
    }
    await waitFor('mirror returns after click-through', async () => (await nativeState()).children.some(child => child.id === original.id && child.visible));
    console.log('[mirror-overlay-desktop] native shortcut save, repeated overlays and click-through recovery passed');

    await page.locator('#screen-source-header-menu > summary').evaluate(button => button.click());
    const controls = await waitOverlay('menu');
    await nativeClick(controls.overlayId, '[data-action-id="screen-source-embed-toggle-btn"]');
    await waitFor('explicit mirror stop', async () => !(await nativeState()).mirrorId);
    await runIn(controls.overlayId, 'document.querySelector("[data-action-id=screen-source-embed-toggle-btn]")?.click()').catch(() => {});
    await delay(250);
    assert.equal((await nativeState()).mirrorId, null, 'A stale native menu action must not restart a stopped mirror');
    if (await page.locator('#screen-source-header-menu').evaluate(node => node.open)) await page.locator('#screen-source-header-menu > summary').evaluate(button => button.click());
    await startMirror();
    await assertMirrorFrame();
    const restarted = await mirrorSnapshot();
    assert.notEqual(restarted.id, original.id, 'Only explicit stop/restart may create a new mirror');
    await openSettings();
    await page.reload();
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains('app-booting'));
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    await waitFor('reload disposes native surfaces', async () => {
      const state = await nativeState(); return !state.mirrorId && !state.overlayId;
    });
    assert.deepEqual(errors, []);
    console.log('[mirror-overlay-desktop] stopped target stays stopped; reload cleanup passed');

    // Crash recovery must release native surfaces without killing the unrelated mirror.
    await startMirror();
    const beforeOverlayCrash = await mirrorSnapshot();
    settings = await openSettings();
    await app.evaluate(({ webContents }, id) => webContents.fromId(id).forcefullyCrashRenderer(), settings.overlayId);
    await page.waitForFunction(() => {
      const drawer = document.querySelector('#insight-drawer');
      return drawer.classList.contains('is-open') && !drawer.hasAttribute('data-native-overlay');
    });
    await waitFor('crashed overlay removed while mirror retained', async () => {
      const state = await nativeState(); return !state.overlayId && state.mirrorId === beforeOverlayCrash.id;
    });
    await page.locator('#conversation-settings-btn').evaluate(button => button.click());
    await waitFor('DOM settings closes after native crash', () => page.locator('#insight-drawer').evaluate(node => !node.classList.contains('is-open')));
    await waitFor('mirror recovers after DOM fallback', async () => (await nativeState()).children.some(child => child.id === beforeOverlayCrash.id && child.visible));
    await nativeClick(beforeOverlayCrash.id, '#draft');
    await app.evaluate(({ webContents }, id) => webContents.fromId(id).insertText('恢复输入 · 日本語'), beforeOverlayCrash.id);
    assert.equal((await mirrorSnapshot()).draft, '恢复输入 · 日本語');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer());
    await waitFor('primary renderer crash cleans child views', async () => {
      const state = await nativeState(); return !state.mirrorId && !state.overlayId;
    });
    await waitFor('primary renderer reload ready', () => app.evaluate(({ BrowserWindow }) => Boolean(BrowserWindow.getAllWindows()[0].__freeflowRendererReady)));
    // Playwright marks a deliberately crashed Page unusable; inspect the recovered renderer via Electron.
    await waitFor('primary canvas recovered', () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(
      '(async()=>{await window.__canvas2dEngine.whenReady();return !document.body.classList.contains("app-booting")})()'
    )));
    assert.deepEqual(errors, []);
    console.log('[mirror-overlay-desktop] overlay crash fallback, Unicode input and primary renderer crash recovery passed');
  } catch (error) {
    await page?.screenshot({ path: path.join(os.tmpdir(), 'freeflow-mirror-overlay-failure-main.png') }).catch(() => {});
    if (app) console.error('[mirror-overlay-desktop:state]', await nativeState().catch(() => null));
    if (app) console.error('[mirror-overlay-desktop:focus]', await app.evaluate(({ webContents }) => webContents.getAllWebContents().map(view => ({ id: view.id, focused: view.isFocused(), url: view.getURL() }))).catch(() => null));
    throw error;
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
