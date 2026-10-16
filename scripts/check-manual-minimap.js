const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('playwright');

async function main() {
  // Bundle in memory so this checks the source without changing desktop assets.
  const bundle = await build({
    entryPoints: [path.resolve(__dirname, '../public/src/engines/canvas2d-core/ui/createTransientMinimap.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
  });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://minimap.test/**', (route) => route.fulfill({
    contentType: route.request().url().endsWith('.js') ? 'text/javascript' : 'text/html',
    body: route.request().url().endsWith('.js') ? bundle.outputFiles[0].text : `<!doctype html>
      <style>
        #host { position: relative; width: 800px; height: 600px; }
        .canvas2d-transient-minimap { position: absolute; width: 164px; height: 120px; }
        .is-collapsed { width: 38px; height: 38px; }
        .is-collapsed canvas, .is-space-constrained canvas { display: none; }
        .canvas2d-transient-minimap-toggle { position: relative; pointer-events: auto; }
      </style><div id="host"></div>`,
  }));
  const flush = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const state = () => page.evaluate(() => ({
    collapsed: document.querySelector('#canvas2d-transient-minimap').classList.contains('is-collapsed'),
    constrained: document.querySelector('#canvas2d-transient-minimap').classList.contains('is-space-constrained'),
    ...window.fixture.map.getStats(),
    itemReads: window.fixture.itemReads,
    renderedView: window.fixture.renderedView,
    renderedItems: window.fixture.renderedItems,
  }));
  const toggle = () => page.locator('.canvas2d-transient-minimap-toggle').click();
  try {
    await page.goto('http://minimap.test/');
    await page.evaluate(async () => {
      // A previous session being open must not open a new application session.
      localStorage.setItem('freeflow.canvas.chrome.minimapCollapsed', 'false');
      const { createTransientMinimap } = await import('/minimap.js');
      const fixture = window.fixture = {
        view: { scale: 1, offsetX: 0, offsetY: 0 },
        items: [{ id: 'card', type: 'fileCard', x: 10, y: 20, width: 336, height: 128 }],
        revision: 1,
        itemReads: 0,
      };
      fixture.map = createTransientMinimap({
        getItems: () => { fixture.itemReads += 1; fixture.renderedItems = fixture.items.map((item) => item.id); return fixture.items; },
        getView: () => { fixture.renderedView = { ...fixture.view }; return fixture.view; },
        getViewportSize: () => ({ width: 800, height: 600 }),
        getSceneRevision: () => fixture.revision,
        onNavigate: (point) => { fixture.navigation = point; },
      });
      fixture.map.mount(document.querySelector('#host'));
    });
    await flush();
    let current = await state();
    assert(current.collapsed, 'a new session restored the old expanded preference');
    assert.equal(current.snapshotRenderCount, 0);
    assert.equal(current.viewportRenderCount, 0);
    assert.equal(current.itemReads, 0);

    await page.evaluate(() => {
      const f = window.fixture;
      for (let i = 0; i < 20; i += 1) {
        f.view = { scale: 0.5 + i / 10, offsetX: i * 10, offsetY: -i * 4 };
        f.map.handlePanStart(); f.map.handlePanMove(); f.map.handlePanEnd(); f.map.handleZoom();
      }
      f.items.push({ ...f.items[0], id: 'hidden-edit', x: 900 });
      f.revision += 1;
      f.map.refreshSceneSnapshot();
    });
    await flush();
    current = await state();
    assert(current.collapsed, 'navigation automatically opened the map');
    assert.equal(current.snapshotRenderCount, 0, 'hidden map rendered scene');
    assert.equal(current.viewportRenderCount, 0, 'hidden map rendered viewport');
    assert.equal(current.itemReads, 0, 'hidden map traversed the scene');

    await toggle(); await flush();
    const opened = await state();
    assert(!opened.collapsed);
    assert.deepEqual(opened.renderedItems, ['card', 'hidden-edit']);
    assert.deepEqual(opened.renderedView, { scale: 2.4, offsetX: 190, offsetY: -76 });
    assert.equal(opened.itemReads, 1, 'one snapshot should read the scene once');
    assert.equal(await page.locator('canvas').evaluate((canvas) => canvas.width), 300, 'DPR resolution changed');

    for (let i = 0; i < 6; i += 1) {
      await page.evaluate((step) => {
        const f = window.fixture;
        f.view = { scale: 1 + step / 10, offsetX: step * 25, offsetY: -step * 15 };
        f.map.handlePanStart(); f.map.handlePanMove(); f.map.handleZoom(); f.map.handlePanEnd();
      }, i);
      await flush();
    }
    current = await state();
    assert(!current.collapsed);
    assert.equal(current.snapshotRenderCount, opened.snapshotRenderCount, 'navigation invalidated the scene cache');
    assert.equal(current.itemReads, opened.itemReads, 'navigation re-read unchanged scene items');
    assert(current.viewportRenderCount > opened.viewportRenderCount);
    await page.mouse.move(950, 750);
    await page.waitForTimeout(950);
    assert(!(await state()).collapsed, 'manual map auto-closed after navigation');
    const canvasRect = await page.locator('canvas').boundingBox();
    await page.mouse.click(canvasRect.x + canvasRect.width / 2, canvasRect.y + canvasRect.height / 2);
    assert(await page.evaluate(() => Number.isFinite(window.fixture.navigation?.x) && Number.isFinite(window.fixture.navigation?.y)), 'map navigation stopped working');

    await toggle();
    const closed = await state();
    await page.evaluate(() => {
      const f = window.fixture;
      f.view = { scale: 0.6, offsetX: 1200, offsetY: -300 };
      f.items = [{ ...f.items[0], id: 'replacement', x: -500 }];
      f.map.resetTransient();
      f.map.handlePanMove(); f.map.handleZoom(); f.map.refreshSceneSnapshot();
    });
    await flush();
    current = await state();
    assert(current.collapsed);
    assert.equal(current.snapshotRenderCount, closed.snapshotRenderCount);
    assert.equal(current.viewportRenderCount, closed.viewportRenderCount);
    await toggle(); await flush();
    current = await state();
    assert.deepEqual(current.renderedItems, ['replacement']);
    assert.deepEqual(current.renderedView, { scale: 0.6, offsetX: 1200, offsetY: -300 });

    // Board replacement preserves the explicit open state even with a reused revision.
    const beforeReplace = current;
    await page.evaluate(() => {
      const f = window.fixture;
      f.map.resetTransient();
      f.items = [{ ...f.items[0], id: 'second-board', y: 900 }];
    });
    await flush();
    current = await state();
    assert(!current.collapsed);
    assert(current.snapshotRenderCount > beforeReplace.snapshotRenderCount);
    assert.deepEqual(current.renderedItems, ['second-board']);

    // Hidden documents pause drawing; focus restoration refreshes the latest view/scene.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.fixture.items[0].x += 200;
      window.fixture.revision += 1;
      window.fixture.view.offsetX = -800;
      window.fixture.map.refreshSceneSnapshot(); window.fixture.map.handleZoom();
    });
    await flush();
    assert.equal((await state()).viewportRenderCount, current.viewportRenderCount);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    current = await state();
    assert(!current.collapsed);
    assert.equal(current.renderedView.offsetX, -800);
    const beforeOcclusion = current;
    await page.evaluate(() => { document.querySelector('#host').style.width = '100px'; window.fixture.map.resize(); });
    await flush();
    assert((await state()).constrained);
    await page.evaluate(() => { window.fixture.revision += 1; window.fixture.map.refreshSceneSnapshot(); });
    await flush();
    assert.equal((await state()).snapshotRenderCount, beforeOcclusion.snapshotRenderCount, 'occluded map rendered');
    await page.evaluate(() => { document.querySelector('#host').style.width = '800px'; window.fixture.map.resize(); });
    await flush();
    current = await state();
    assert(!current.collapsed && !current.constrained);
    assert(current.snapshotRenderCount > beforeOcclusion.snapshotRenderCount);

    await page.evaluate(() => {
      const button = document.querySelector('.canvas2d-transient-minimap-toggle');
      for (let i = 0; i < 30; i += 1) { button.click(); window.fixture.map.handleZoom(); }
    });
    await flush();
    assert(!(await state()).collapsed, 'rapid toggles lost the manual open state');
    await page.evaluate(() => {
      const f = window.fixture;
      f.staleButton = document.querySelector('.canvas2d-transient-minimap-toggle');
      f.map.handlePanMove(); // Pending frame must be cancelled on destruction.
      f.map.unmount();
      f.afterUnmount = f.map.getStats();
      f.staleButton.click(); f.map.handleZoom(); f.map.handlePanEnd();
    });
    await flush();
    assert.equal(await page.locator('#canvas2d-transient-minimap').count(), 0);
    assert(await page.evaluate(() => JSON.stringify(window.fixture.afterUnmount) === JSON.stringify(window.fixture.map.getStats())));
    await page.evaluate(() => window.fixture.map.mount(document.querySelector('#host')));
    await flush();
    current = await state();
    assert(current.collapsed, 'remount reused the old open state');
    assert.equal(current.snapshotRenderCount, 0);
    await toggle(); await flush();
    assert(!(await state()).collapsed);
    assert.deepEqual(errors, []);
    console.log('[check-manual-minimap] startup, hidden navigation, cached manual navigation, board replacement, visibility/occlusion recovery and destroy/remount passed');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
