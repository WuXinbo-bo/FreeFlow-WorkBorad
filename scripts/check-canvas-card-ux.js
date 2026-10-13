const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function checkCanvasCardUx(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => window.__canvas2dEngine);
  await page.evaluate(() => window.__canvas2dEngine.whenReady());
  const card = { id: 'card', type: 'fileCard', name: '中文很长的研究调查报告需要保留完整扩展名.docx', ext: 'docx', fileId: 'fixture-resource', size: 5400, x: 400, y: 240, width: 336, height: 128 };
  const load = async (items = [card], selectedIds = items.map(item => item.id)) => {
    await page.evaluate(({ items, selectedIds }) => {
      window.__canvas2dEngine.loadStructuredBoardForExport({ items, selectedIds, view: { scale: 1, offsetX: 0, offsetY: 0 } });
      window.__canvas2dEngine.setTool('select');
    }, { items, selectedIds });
    await page.waitForTimeout(120);
  };
  const items = () => page.evaluate(() => window.__canvas2dEngine.getSnapshotData().items);
  const run = (id, arg) => page.evaluate(({ id, arg }) => window.__canvas2dEngine.runCommand(id, arg), { id, arg });
  const undo = () => page.evaluate(() => window.__canvas2dEngine.undo());
  const redo = () => page.evaluate(() => window.__canvas2dEngine.redo());
  const surface = page.locator('#canvas-office-canvas');
  const rect = await surface.boundingBox();
  assert(rect);
  await load();
  const bar = page.locator('.canvas2d-file-quick-actions');
  await bar.waitFor({ state: 'visible' });
  const font = () => page.locator('[data-id="card"] .canvas2d-scene-file-card-name').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
  assert.equal(await font(), 16);
  await run('selection.set-geometry', { width: 672 });
  assert.equal((await items())[0].height, 256);
  assert.equal(await font(), 32);
  await undo(); assert.equal((await items())[0].width, 336);
  await redo(); assert.equal((await items())[0].width, 672);
  await run('file.reset-size'); assert.equal((await items())[0].height, 128);
  await undo(); assert.equal((await items())[0].height, 256);
  await run('file.reset-size');

  // Real pointer resize and cancel, followed by a committed resize and undo.
  for (let i = 0; i < 2; i++) {
    await page.mouse.move(rect.x + 736, rect.y + 368);
    await page.mouse.down();
    await page.mouse.move(rect.x + 840, rect.y + 450, { steps: 8 });
    assert(Math.abs((await items())[0].width / (await items())[0].height - 2.625) < 1e-9);
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.equal((await items())[0].width, 336, 'Esc did not restore original card');
  }
  await page.mouse.move(rect.x + 736, rect.y + 368); await page.mouse.down();
  await page.mouse.move(rect.x + 830, rect.y + 440, { steps: 8 }); await page.mouse.up();
  assert((await items())[0].width > 336);
  await undo(); assert.equal((await items())[0].width, 336);
  await load(await items()); assert.equal((await items())[0].height, 128);

  await bar.getByRole('button', { name: '更多', exact: true }).click();
  const menu = page.locator('#canvas2d-context-menu');
  assert(await menu.isVisible());
  assert((await menu.locator(':scope > button, :scope > .canvas2d-context-submenu').count()) <= 8);
  assert((await menu.innerHTML()).includes('file-reset-size'), await menu.innerHTML());
  const arrange = menu.locator('.canvas2d-context-submenu').filter({ has: page.locator('[aria-label="整理"]') });
  await arrange.locator(':scope > button').focus();
  await page.keyboard.press('ArrowRight');
  assert(await arrange.locator('[role="menu"]').isVisible());
  await page.keyboard.press('Escape');
  assert(!(await arrange.locator('[role="menu"]').isVisible()));
  assert(await menu.isVisible());
  await page.keyboard.press('Escape'); assert(!(await menu.isVisible()));
  await bar.waitFor({ state: 'visible' });

  // View shortcuts use shifted physical digits (event.key is !/@/) on US layouts).
  await surface.focus();
  await page.keyboard.press('Shift+Digit2');
  assert.notEqual(await page.evaluate(() => window.__canvas2dEngine.getSnapshotData().view.offsetX), 0);
  await page.keyboard.press('Shift+Digit0');
  assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshotData().view.scale), 0.75);
  await load();

  // Duplication preserves the resource reference and remains a single undo.
  await surface.focus(); await page.keyboard.press('ControlOrMeta+d');
  assert.equal((await items()).length, 2);
  assert.equal((await items())[1].fileId, 'fixture-resource');
  await undo(); assert.equal((await items()).length, 1);
  await load([card, { ...card, id: 'second', x: 820, width: 420, height: 160 }]);
  await run('selection.set-geometry', { width: 550 });
  for (const item of await items()) assert(Math.abs(item.width / item.height - 2.625) < 1e-9);
  assert((await items())[0].width < 336);
  await undo(); assert.equal((await items())[0].width, 336);
  await load([card, { ...card, id: 'second', x: 820, width: 420, height: 160 }, { ...card, id: 'locked', y: 500, locked: true, width: 504, height: 192 }]);
  await run('file.reset-size');
  assert.deepEqual((await items()).map(item => item.width), [336, 336, 504]);
  await undo(); assert.deepEqual((await items()).map(item => item.width), [336, 420, 504]);
  await run('selection.set-geometry', { width: 500 });
  for (const item of await items()) assert(Math.abs(item.width / item.height - 2.625) < 1e-9);
  assert.equal((await items())[2].width, 504);

  await load();
  const map = page.locator('#canvas2d-transient-minimap');
  const collapsed = () => map.evaluate(node => node.classList.contains('is-collapsed'));
  if (!(await collapsed())) await map.locator('button').click();
  await page.mouse.move(rect.x + Math.min(1100, rect.width - 50), rect.y + Math.min(600, rect.height - 60));
  await page.waitForTimeout(850);
  // Trusted wheel zoom via Control; scroll pan must not open the map.
  await page.mouse.wheel(20, 20); await page.waitForTimeout(200);
  assert(await collapsed());
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -50); await page.keyboard.up('Control');
  await page.waitForFunction(() => !document.querySelector('#canvas2d-transient-minimap').classList.contains('is-collapsed'));
  const stats = await map.locator('canvas').evaluate(node => node.__ffMinimapStats);
  await page.evaluate(() => window.__canvas2dEngine.zoomIn());
  await page.waitForTimeout(150);
  const stats2 = await map.locator('canvas').evaluate(node => node.__ffMinimapStats);
  assert.equal(stats2.snapshotRenderCount, stats.snapshotRenderCount, 'zoom regenerated scene snapshot');
  await page.waitForTimeout(900); assert(await collapsed(), 'map did not auto close');
  await page.evaluate(() => window.__canvas2dEngine.zoomIn());
  await map.locator('button').click();
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.__canvas2dEngine.zoomIn());
  assert(await collapsed(), 'manual close reopened within same gesture');
  await page.mouse.move(rect.x + Math.min(1100, rect.width - 50), rect.y + Math.min(600, rect.height - 60)); await page.waitForTimeout(850);
  await page.evaluate(() => window.__canvas2dEngine.zoomOut()); assert(!(await collapsed()), JSON.stringify(await page.evaluate(() => ({ hidden: document.hidden, map: document.querySelector('#canvas2d-transient-minimap').outerHTML }))));
  await map.hover(); await page.waitForTimeout(900); assert(!(await collapsed()), 'hover did not pause auto hide');
  await page.mouse.move(rect.x + Math.min(1100, rect.width - 50), rect.y + Math.min(600, rect.height - 60)); await page.waitForTimeout(900); assert(await collapsed());
  await map.locator('button').click(); await page.mouse.move(rect.x + Math.min(1100, rect.width - 50), rect.y + Math.min(600, rect.height - 60));
  await page.evaluate(() => window.__canvas2dEngine.zoomIn()); await page.waitForTimeout(900); assert(!(await collapsed()), 'manual expansion was not pinned');
  await map.locator('button').click(); await page.mouse.move(rect.x + Math.min(1100, rect.width - 50), rect.y + Math.min(600, rect.height - 60)); await page.waitForTimeout(850);
  await page.evaluate(() => window.__canvas2dEngine.zoomIn());
  await load(); assert(await collapsed(), 'board switch retained temporary map');
  await page.waitForTimeout(900); assert(await collapsed());

  // Menu and submenu stay within the viewport, including short windows.
  for (const [x, y] of [[20, 180], [Math.min(900, rect.width - 200), 80], [20, Math.min(540, rect.height - 90)], [Math.min(900, rect.width - 200), Math.min(540, rect.height - 90)]]) {
    await load([{ ...card, x, y, width: 168, height: 64 }]);
    await page.mouse.click(rect.x + x + 40, rect.y + y + 25, { button: 'right' });
    try { await menu.waitFor({ state: 'visible', timeout: 3000 }); }
    catch (error) { await page.screenshot({ path: '/tmp/freeflow-card-menu-failure.png' }); throw new Error(`corner ${x},${y}: ${error.message}; ${JSON.stringify(await page.evaluate(({ x, y }) => ({ hit: document.elementFromPoint(x, y)?.outerHTML.slice(0, 300), view: window.__canvas2dEngine.getSnapshotData().view }), { x: rect.x + x + 40, y: rect.y + y + 25 }))}`); }
    assert((await menu.innerHTML()).includes('file-reset-size'), `corner ${x},${y}: ${await menu.innerHTML()}`);
    await menu.locator('.canvas2d-context-submenu-trigger').filter({ hasText: /^复制与粘贴$/ }).hover({ timeout: 3000 });
    const bounds = await menu.locator('[role="menu"][aria-label="复制与粘贴"]').boundingBox();
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, JSON.stringify(bounds));
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  }
  // Alt-drag creates a copy; the original card and shared resource remain intact.
  await load();
  await page.keyboard.down('Alt');
  await page.mouse.move(rect.x + 550, rect.y + 310); await page.mouse.down();
  await page.mouse.move(rect.x + 640, rect.y + 400, { steps: 6 }); await page.mouse.up();
  await page.keyboard.up('Alt');
  assert.equal((await items()).length, 2);
  assert.equal((await items())[0].x, 400);
  await undo(); assert.equal((await items()).length, 1);
  // Losing OS focus cancels the active resize instead of silently keeping a draft.
  await page.mouse.move(rect.x + 736, rect.y + 368); await page.mouse.down();
  await page.mouse.move(rect.x + 850, rect.y + 440, { steps: 5 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up();
  assert.equal((await items())[0].width, 336);
  await load();
  if (process.env.FREEFLOW_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.FREEFLOW_SCREENSHOT_DIR}/card-ux.png` });
  assert.deepEqual(errors, []);
  console.log('[check-canvas-card-ux] card resize/history/reload, menus, shortcuts, resource copies, minimap lifecycle/cache passed');
}
module.exports = { checkCanvasCardUx };
if (require.main === module) (async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(process.env.CANVAS_TEST_URL || 'http://127.0.0.1:3220/canvas-office.html');
    await checkCanvasCardUx(page);
    await page.setViewportSize({ width: 640, height: 420 });
    await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      engine.loadStructuredBoardForExport({ items: [{ id: 'compact', type: 'fileCard', name: '报告.pdf', ext: 'pdf', x: 320, y: 180, width: 168, height: 64 }], selectedIds: ['compact'], view: { scale: 1, offsetX: 0, offsetY: 0 } });
      engine.setTool('select');
    });
    await page.locator('.canvas2d-file-quick-actions button').last().click();
    const menu = page.locator('#canvas2d-context-menu');
    assert((await menu.getAttribute('class')).includes('is-compact-menu'));
    await menu.getByRole('button', { name: '整理', exact: true }).click();
    await menu.locator('[data-action="file-reset-size"]').waitFor({ state: 'visible' });
    const box = await menu.boundingBox();
    assert(box.x >= 0 && box.y >= 0 && box.y + box.height <= 420);
    await page.mouse.move(600, 350); await page.waitForTimeout(350);
    assert(await menu.locator('[data-action="file-reset-size"]').isVisible(), 'compact submenu closed on pointer leave');
    await menu.getByRole('button', { name: '整理', exact: true }).click();
    assert(await menu.locator('[data-action="file-preview"]').isVisible());
    console.log('[check-canvas-card-ux] compact menu click/back/viewport passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
