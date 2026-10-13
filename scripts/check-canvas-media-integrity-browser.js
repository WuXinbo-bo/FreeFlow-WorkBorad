const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const URL = process.env.CANVAS_TEST_URL || 'http://127.0.0.1:3220/canvas-office.html';

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.__canvas2dEngine);
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    const geometry = await page.evaluate(async () => {
      const { createLightImageEditor } = await import('/src/engines/canvas2d-core/editors/lightImageEditor.js');
      const { hitTestElement } = await import('/src/engines/canvas2d-core/hitTest.js');
      const { getImageMemoBounds } = await import('/src/engines/canvas2d-core/elements/media.js');
      const crops = [], memoHits = [];
      for (const rotation of [45, 90]) for (const flipX of [false, true]) {
        const item = { id: 'image', type: 'image', x: 600, y: 300, width: 240, height: 120, rotation, flipX, memoVisible: true, memo: 'Memo' };
        const editor = createLightImageEditor({ getImageItemById: () => item, updateImageItem: (_id, update) => update(item) });
        const toScene = (x, y) => {
          const dx = (x - .5) * item.width * (flipX ? -1 : 1), dy = (y - .5) * item.height;
          const radians = rotation * Math.PI / 180;
          return { x: item.x + item.width / 2 + dx * Math.cos(radians) - dy * Math.sin(radians), y: item.y + item.height / 2 + dx * Math.sin(radians) + dy * Math.cos(radians) };
        };
        editor.beginEdit(item.id); editor.setMode('crop');
        const pointer = editor.handlePointerDown({ event: { button: 0, pointerId: 1 }, scenePoint: toScene(.2, .25) }).pointer;
        editor.handlePointerMove(pointer, toScene(.8, .75)); editor.handlePointerUp(pointer);
        crops.push(item.crop);
        editor.finishEdit();
        const memo = getImageMemoBounds(item);
        memoHits.push(hitTestElement([item], { x: memo.left + memo.width / 2, y: memo.bottom - 5 })?.id);
      }
      return { crops, memoHits };
    });
    for (const crop of geometry.crops) for (const [key, expected] of Object.entries({ x: .2, y: .25, w: .6, h: .5 })) assert(Math.abs(crop[key] - expected) < .00001);
    assert.deepEqual(geometry.memoHits, ['image', 'image', 'image', 'image']);

    for (const rotation of [45, 90]) {
      const bounds = await page.evaluate(async rotation => {
        const e = window.__canvas2dEngine;
        e.loadStructuredBoardForExport({ items: [{ id: 'resize-image', type: 'image', x: 700, y: 350, width: 240, height: 120, rotation }], selectedIds: ['resize-image'], view: { scale: 1, offsetX: 0, offsetY: 0 } });
        e.setTool('select');
        const { getElementBounds } = await import('/src/engines/canvas2d-core/elements/index.js');
        return getElementBounds(e.getSnapshotData().items[0]);
      }, rotation);
      await page.waitForTimeout(100);
      const rect = await page.locator('#canvas-office-canvas').boundingBox();
      const x = rect.x + bounds.right, y = rect.y + bounds.bottom;
      const item = () => page.evaluate(() => window.__canvas2dEngine.getSnapshotData().items[0]);
      const before = await item();
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up();
      const unmoved = await item();
      for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(unmoved[key] - before[key]) < .01, `no-motion resize changed ${key}`);
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40, y + 40, { steps: 4 }); await page.mouse.up();
      const resized = await item();
      assert(resized.width > before.width, `rotated resize did not grow at ${rotation}`);
      assert(Math.abs(resized.width / resized.height - 2) < .00001, 'rotated resize distorted the image');
      await page.evaluate(() => window.__canvas2dEngine.undo());
      const restored = await item();
      for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(restored[key] - before[key]) < .01, `resize undo lost ${key}`);
    }

    const formulaGraph = await page.evaluate(async () => {
      const { prepareFormulaVisualItems } = await import('/src/engines/canvas2d-core/export/prepareFormulaVisualItems.js');
      const { normalizeBoard } = await import('/src/engines/canvas2d-core/elements/index.js');
      const html = '<p><span data-role="math-inline">x^2</span></p>';
      const nodes = ['flowNode', 'mindNode', 'mindSummary'].map((type, i) => ({ id: type, type, x: 300, y: 150 + i * 200, width: 300, height: 120, title: 'old formula title', html, text: 'x^2', plainText: 'x^2' }));
      const edges = [{ id: 'edge', type: 'flowEdge', fromId: 'flowNode', toId: 'mindNode' }];
      const before = JSON.stringify(nodes);
      const visual = await prepareFormulaVisualItems([...nodes, ...edges], { createSurface: () => {
        const surface = document.createElement('div'); surface.style.width = '300px'; surface.style.height = '120px'; surface.textContent = 'formula visual'; return surface;
      } });
      const normalized = normalizeBoard({ items: visual }).items;
      return { unchanged: before === JSON.stringify(nodes), images: normalized.filter(item => item.type === 'image').length,
        nodes: normalized.filter(item => ['flowNode', 'mindNode', 'mindSummary'].includes(item.type)).map(item => ({ id: item.id, text: item.text, plainText: item.plainText })),
        edge: normalized.find(item => item.id === 'edge') };
    });
    assert(formulaGraph.unchanged);
    assert.equal(formulaGraph.images, 3);
    for (const node of formulaGraph.nodes) assert(!node.text && !node.plainText, 'formula raster retained duplicate node text');
    assert.equal(formulaGraph.edge.fromId, 'flowNode');
    assert.equal(formulaGraph.edge.toId, 'mindNode');
    const delayedCrops = await page.evaluate(async () => {
      const { createCanvasImageStorageManager } = await import('/src/engines/canvas2d-core/storage/createCanvasImageStorageManager.js');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 20;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = 'blue'; ctx.fillRect(0, 0, 20, 20);
      const dataUrl = canvas.toDataURL(); const results = [];
      for (const action of ['revision', 'undo', 'board', 'success']) {
        const item = { id: 'crop', type: 'image', dataUrl, x: 10, y: 10, width: 20, height: 20, rotation: 45, crop: { x: .2, y: .2, w: .6, h: .6 } };
        const state = { board: { boardId: 'crop-board', items: [item] }, boardFilePath: '/Boards/crop.freeflow' };
        let releaseWrite, writeStarted, commits = 0;
        const started = new Promise(resolve => { writeStarted = resolve; });
        const pendingWrite = new Promise(resolve => { releaseWrite = resolve; });
        const originalShell = window.desktopShell;
        window.desktopShell = { writeFile: async filePath => { writeStarted(); await pendingWrite; return { ok: true, filePath }; } };
        try {
          const manager = createCanvasImageStorageManager({ state, useLocalFileSystem: true,
            resolveBoardFolderPath: () => '/Boards', joinPath: (a, b) => `${a}/${b}`, stripTrailingSeparators: value => value,
            getFileNameFromPath: value => value.split('/').at(-1), getFileExtension: () => '',
            resolveImageSource: value => value, readImageDimensions: async () => ({ width: 20, height: 20 }),
            getImageItemById: id => state.board.items.find(entry => entry.id === id), renderImageToCanvas: () => canvas,
            safeCanvasToDataUrl: value => value.toDataURL(), takeItemHistorySnapshot: () => structuredClone(item),
            commitItemHistory: () => { commits++; }, setSaveToast: () => {} });
          const saving = manager.saveCroppedImageItem(item.id);
          await started;
          if (action === 'revision') item.rotation = 90;
          if (action === 'undo') state.board.items = [structuredClone(item)];
          if (action === 'board') state.board = { boardId: 'new-board', items: [structuredClone(item)] };
          releaseWrite();
          const ok = await saving, current = state.board.items[0];
          results.push({ action, ok, commits, dataUrl: current.dataUrl === dataUrl, rotation: current.rotation });
        } finally { window.desktopShell = originalShell; }
      }
      return results;
    });
    for (const result of delayedCrops) {
      const success = result.action === 'success';
      assert.equal(result.ok, success, JSON.stringify(result));
      assert.equal(result.commits, success ? 1 : 0, 'stale crop added history');
      assert.equal(result.dataUrl, !success, 'stale crop replaced image data');
      assert.equal(result.rotation, success ? 0 : result.action === 'revision' ? 90 : 45, 'stale crop reset transforms');
    }
    assert.deepEqual(errors, []);
    console.log('[check-canvas-media-integrity-browser] rotated/flipped crop, memo hit, 45/90-degree drag, no-motion and undo passed');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
