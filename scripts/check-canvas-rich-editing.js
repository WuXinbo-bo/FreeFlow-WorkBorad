const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const URL = process.env.CANVAS_TEST_URL || 'http://127.0.0.1:3220/canvas-office.html';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let clipboard = {};
    Object.defineProperty(navigator, 'clipboard', { value: {
      write: async items => {
        clipboard = {};
        for (const item of items) for (const type of item.types) clipboard[type] = await (await item.getType(type)).text();
      },
      writeText: async text => { clipboard = { 'text/plain': text }; },
      read: async () => {
        if (window.__holdClipboard) {
          await new Promise(resolve => { window.__releaseClipboard = resolve; });
          return [{ types: ['text/plain'], getType: async type => new Blob(['LATE_PASTE'], { type }) }];
        }
        return [{ types: Object.keys(clipboard), getType: async type => new Blob([clipboard[type]], { type }) }];
      },
      readText: async () => clipboard['text/plain'] || '',
    } });
  });
  try {
    await page.goto(URL);
    await page.waitForFunction(() => window.__canvas2dEngine);
    await page.waitForFunction(() => document.querySelector('#canvas2d-react-ui-host')?.dataset.canvas2dUiState === 'mounted');
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    const load = board => page.evaluate(board => {
      window.__canvas2dEngine.loadStructuredBoardForExport(board);
      window.__canvas2dEngine.setTool('select');
    }, board);
    const items = () => page.evaluate(() => window.__canvas2dEngine.getSnapshotData().items);
    const paste = async data => {
      await page.evaluate(data => {
        const dt = new DataTransfer();
        for (const [type, value] of Object.entries(data)) dt.setData(type, value);
        const canvas = document.querySelector('#canvas-office-canvas'); canvas.focus();
        canvas.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      }, data);
      await page.waitForFunction(() => window.__canvas2dEngine.getSnapshotData().items.length);
    };
    const html = '<h1>标题一</h1><p>正文 <strong>加粗</strong> <a href="https://example.com">链接</a></p><ul><li>第一项</li><li>第二项</li></ul><h2>标题二</h2><p><span data-ff-font-size="28" style="font-size:28px">指定字号</span></p>';
    await load({ items: [], view: { scale: 1, offsetX: 0, offsetY: 0 } });
    await paste({ 'text/html': html, 'text/plain': '标题一\n正文\n第一项\n第二项\n标题二\n指定字号' });
    const imported = await items();
    assert.equal(imported.length, 1, 'external rich paste was split');
    for (const token of ['标题一', '标题二', '第一项', '指定字号']) assert(imported[0].text.includes(token));
    for (const tag of ['<h1', '<h2', '<ul', '<strong', '<a ']) assert(imported[0].html.includes(tag));
    assert(imported[0].richTextDocument.blocks.length >= 5, 'combined document lost blocks');
    assert(JSON.stringify(imported[0].richTextDocument).includes('28px'), 'structured text lost inline font size');
    await page.evaluate(() => window.__canvas2dEngine.undo()); assert.equal((await items()).length, 0);
    await page.evaluate(() => window.__canvas2dEngine.redo()); assert.equal((await items()).length, 1);
    await load({ items: [], view: { scale: 1, offsetX: 0, offsetY: 0 } });
    await paste({ 'text/plain': '# 标题\n\n正文 **强调**\n\n- 项目甲\n- 项目乙\n\n## 次级标题\n\n结尾' });
    assert.equal((await items()).length, 1, 'Markdown paste was split');
    assert((await items())[0].html.includes('<h1'));

    // Internal multi-selection copy must preserve separate canvas elements.
    await load({ items: [
      { id: 'copy-a', type: 'text', x: 300, y: 150, width: 300, html: '<p>Card A</p>' },
      { id: 'copy-b', type: 'text', x: 300, y: 350, width: 300, html: '<p>Card B</p>' },
    ], selectedIds: ['copy-a', 'copy-b'], view: { scale: 1 } });
    await page.evaluate(async () => {
      const e = window.__canvas2dEngine;
      await e.runCommand('selection.copy');
      await e.runCommand('selection.paste');
    });
    assert.equal((await items()).length, 4, 'internal multi-element copy was merged');

    await load({ items: [{ id: 'explicit-heading', type: 'text', x: 300, y: 150, width: 400, html: '<h1 data-ff-font-size="48" style="font-size:48px">Explicit heading</h1><p>Body</p>', fontSize: 20 }], selectedIds: ['explicit-heading'], view: { scale: 1 } });
    await page.evaluate(() => window.__canvas2dEngine.runCommand('element.edit'));
    assert.equal(await page.locator('#canvas-rich-editor h1').evaluate(node => getComputedStyle(node).fontSize), '48px');
    await page.evaluate(() => window.__canvas2dEngine.setTool('pan'));
    assert.equal(await page.locator('.canvas2d-rich-item[data-id="explicit-heading"] h1').evaluate(node => getComputedStyle(node).fontSize), '48px');

    await load({ items: [{ id: 'manual-split', type: 'text', x: 300, y: 150, width: 400, html: '<p>First block</p><p>Second block</p>' }], selectedIds: ['manual-split'], view: { scale: 1 } });
    await page.evaluate(() => window.__canvas2dEngine.runCommand('element.edit'));
    await page.waitForTimeout(100);
    await page.evaluate(async () => {
      const editor = document.querySelector('#canvas-rich-editor');
      const range = document.createRange(); range.setStart(editor.children[1], 0); range.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    await page.locator('#canvas2d-rich-toolbar [data-action="text-split"]').click();
    await page.waitForFunction(() => window.__canvas2dEngine.getSnapshotData().items.length === 2);
    assert.equal((await items()).length, 2, 'manual text split stopped working');
    await page.evaluate(() => window.__canvas2dEngine.undo());
    assert.equal((await items()).length, 1, 'manual split undo did not restore the whole document');

    // A delayed clipboard read must not reuse the selection after newer input.
    await page.evaluate(() => window.__canvas2dEngine.runCommand('element.edit'));
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const editor = document.querySelector('#canvas-rich-editor'); editor.focus();
      window.__holdClipboard = true;
      editor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 450, clientY: 280 }));
      document.querySelector('#canvas2d-context-menu [data-action="rich-paste"]').click();
    });
    await page.waitForFunction(() => window.__releaseClipboard);
    await page.locator('#canvas-rich-editor').press('End'); await page.keyboard.type(' NEW_INPUT');
    await page.evaluate(() => { window.__holdClipboard = false; window.__releaseClipboard(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__canvas2dEngine.setTool('pan'));
    assert((await items())[0].text.includes('NEW_INPUT'));
    assert(!(await items())[0].text.includes('LATE_PASTE'), 'late paste mutated a newer draft');

    const text = { ...imported[0], id: 'rich-layout', x: 350, y: 160, width: 640 };
    for (const scale of [0.5, 1, 2]) {
      await load({ items: [text], selectedIds: [text.id], view: { scale, offsetX: 0, offsetY: 0 } });
      await page.waitForFunction(() => document.querySelector('.canvas2d-rich-item[data-id="rich-layout"] h1'));
      const display = await page.locator('.canvas2d-rich-item[data-id="rich-layout"]').evaluate(node => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, fonts: ['h1', 'h2', 'div', '[data-ff-font-size]'].map(q => getComputedStyle(node.querySelector(q)).fontSize) };
      });
      await page.evaluate(() => window.__canvas2dEngine.runCommand('element.edit'));
      const editor = page.locator('#canvas-rich-editor:not(.is-hidden)'); await editor.waitFor();
      const edit = await editor.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, fonts: ['h1', 'h2', 'div', '[data-ff-font-size]'].map(q => getComputedStyle(node.querySelector(q)).fontSize) };
      });
      assert(Math.abs(display.width - edit.width) < 1, `width mismatch at ${scale}`);
      assert(Math.abs(display.height - edit.height) < 1, `height mismatch at ${scale}: ${JSON.stringify({display, edit})}`);
      assert.deepEqual(edit.fonts, ['36px', '30px', '20px', '28px']);
      await editor.press('End'); await page.keyboard.type(' edited');
      await page.evaluate(() => window.__canvas2dEngine.setTool('pan'));
      assert((await items())[0].text.includes('edited'));
      await page.evaluate(() => window.__canvas2dEngine.undo());
      assert(!(await items())[0].text.includes('edited'));
      await page.evaluate(() => window.__canvas2dEngine.redo());
      assert((await items())[0].text.includes('edited'));
    }

    const paragraphs = Array.from({ length: 250 }, (_, i) => `<p>段落 ${i} ${'中文内容 English text. '.repeat(4)}</p>`).join('');
    await load({ items: [{ id: 'long', type: 'text', x: 350, y: 160, width: 660, html: '<h1>长文</h1>' + paragraphs, fontSize: 20 }], selectedIds: ['long'], view: { scale: 1, offsetX: 0, offsetY: 0 } });
    await page.evaluate(() => window.__canvas2dEngine.runCommand('element.edit'));
    await page.waitForTimeout(300);
    const perf = await page.evaluate(async () => {
      const engine = window.__canvas2dEngine;
      const editor = document.querySelector('#canvas-rich-editor');
      let mutations = 0;
      const observer = new MutationObserver(records => mutations += records.filter(r => r.target !== editor).length);
      observer.observe(editor, { subtree: true, attributes: true, childList: true });
      const timings = []; let cameraMatches = 0;
      for (let i = 0; i < 60; i++) {
        const started = performance.now();
        editor.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: i < 30 ? -1 : 1, clientX: 600, clientY: 300 }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        timings.push(performance.now() - started);
        const view = document.querySelector('#canvas-office-canvas').__ffRenderStats?.frameContext?.camera;
        const currentScale = Number(editor.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
        if (view && Math.abs(view.scale - currentScale) < 0.0001) cameraMatches++;
      }
      await new Promise(resolve => setTimeout(resolve, 400)); observer.disconnect();
      timings.sort((a, b) => a - b);
      return { mutations, cameraMatches, p95: timings[57], max: timings.at(-1), scale: engine.getSnapshot().board.view.scale, html: editor.innerHTML };
    });
    assert.equal(perf.mutations, 0, 'camera changes rewrote rich content');
    assert(perf.cameraMatches >= 55, `editor lagged behind camera: ${perf.cameraMatches}/60`);
    assert(Math.abs(perf.scale - 1) < 0.0001);
    assert(perf.p95 < 120, `continuous zoom stalled: ${perf.p95}ms`);
    await page.evaluate(async () => {
      const editor = document.querySelector('#canvas-rich-editor');
      editor.focus();
      const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      for (let i = 0; i < 12; i++) {
        document.execCommand('insertText', false, ` live-${i}`);
        editor.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: i % 2 ? 2 : -2, clientX: 600, clientY: 300 }));
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      window.__canvas2dEngine.setTool('pan');
    });
    for (let i = 0; i < 12; i++) assert((await items())[0].text.includes(`live-${i}`), 'zoom discarded a live edit');
    await page.evaluate(() => window.__canvas2dEngine.undo());
    assert(!(await items())[0].text.includes('live-0'));
    await page.waitForTimeout(300);
    assert(!(await items())[0].text.includes('live-0'), 'deferred sync overwrote undo');
    await page.evaluate(() => { window.__canvas2dEngine.redo(); window.__canvas2dEngine.runCommand('element.edit'); });
    assert((await items())[0].text.includes('live-11'));
    for (let cycle = 0; cycle < 5; cycle++) {
      await page.evaluate(() => window.__canvas2dEngine.runCommand('canvas.cancel'));
      await page.evaluate(() => window.__canvas2dEngine.runCommand('element.edit'));
      await page.locator('#canvas-rich-editor').press('End'); await page.keyboard.type(' x');
      await page.evaluate(() => window.__canvas2dEngine.runCommand('canvas.cancel'));
      assert(!(await items())[0].text.endsWith(' x'), 'cancel failed after repeated zoom/edit');
    }
    await load({ items: [{ id: 'new', type: 'text', text: 'new board', x: 350, y: 160, width: 300 }], selectedIds: ['new'], view: { scale: 1 } });
    await page.evaluate(() => window.__canvas2dEngine.runCommand('element.edit'));
    assert.equal((await items())[0].text, 'new board');
    assert.deepEqual(errors, []);
    console.log('[check-canvas-rich-editing] rich/Markdown single paste, mixed styles, layout at 0.5/1/2, undo/redo, 250-paragraph zoom and repeated recovery passed', { p95: perf.p95, max: perf.max, cameraMatches: perf.cameraMatches });
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
