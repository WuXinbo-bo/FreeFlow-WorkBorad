const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const fixture = name => fs.readFileSync(path.join(__dirname, 'structured-import-fixtures', name), 'utf8').trim();
const URL = process.env.CANVAS_TEST_URL || 'http://localhost:53128/canvas-office.html';
const CANVAS = '#canvas-office-canvas';

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.FREEFLOW_TEST_BROWSER_CHANNEL ? { channel: process.env.FREEFLOW_TEST_BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('ai_worker_canvas_office_board_v3', JSON.stringify({ items: [], selectedIds: [], view: { scale: 1, offsetX: 0, offsetY: 0 } }));
    window.auditClipboard = { data: {}, reads: 0, textReads: 0, deny: false, writes: [] };
    Object.defineProperty(navigator, 'clipboard', { value: {
      read: async () => {
        const state = window.auditClipboard; state.reads++;
        if (state.deny) throw new DOMException('Denied', 'NotAllowedError');
        const data = { ...state.data };
        return Object.keys(data).length ? [{ types: Object.keys(data), getType: async type => new Blob([data[type]], { type }) }] : [];
      },
      readText: async () => {
        const state = window.auditClipboard; state.textReads++;
        if (state.deny) throw new DOMException('Denied', 'NotAllowedError');
        return state.data['text/plain'] || '';
      },
      write: async items => {
        const state = window.auditClipboard;
        if (state.deny) throw new DOMException('Denied', 'NotAllowedError');
        const data = {};
        for (const item of items) for (const type of item.types) {
          if (!['text/html', 'text/plain'].includes(type)) throw new DOMException('Unsupported format', 'NotSupportedError');
          data[type] = await (await item.getType(type)).text();
        }
        state.data = data; state.writes.push(data);
      },
      writeText: async text => {
        const state = window.auditClipboard;
        if (state.deny) throw new DOMException('Denied', 'NotAllowedError');
        state.data = { 'text/plain': text }; state.writes.push(state.data);
      },
    } });
    window.auditDispatch = (data, channel = 'paste', expire = false) => {
      const dt = new DataTransfer();
      for (const [type, value] of Object.entries(data)) dt.setData(type, value);
      const canvas = document.querySelector('#canvas-office-canvas'); canvas.focus();
      canvas.dispatchEvent(channel === 'drop'
        ? new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 450, clientY: 280 })
        : new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      if (expire) dt.clearData();
    };
  });
  let checks = 0;
  const items = () => page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items);
  const reset = async () => {
    await page.goto(URL);
    await page.waitForFunction(() => window.__canvas2dEngine);
  };
  const dispatch = async (data, channel = 'paste', expire = true) => {
    const before = await items();
    await page.evaluate(async ({ data, channel, expire }) => {
      if (channel === 'menu') {
        window.auditClipboard.data = data;
        await window.__canvas2dEngine.runCommand('selection.paste');
      } else window.auditDispatch(data, channel, expire);
    }, { data, channel, expire });
    await page.waitForFunction(count => window.__canvas2dEngine.getSnapshot().board.items.length > count, before.length);
    return (await items()).filter(i => !before.some(old => old.id === i.id));
  };
  try {
    await reset();
    const samples = [
      { name: 'article selection', html: fixture('article-selection.html'), verify(result) {
        assert.equal(result[0].text, 'BEFORE'); assert.equal(result.at(-1).text, 'AFTER'); assert(result.some(i => i.type === 'codeBlock'));
      } },
      { name: 'merged table', html: fixture('merged-table.html'), verify(result) {
        const table = result[0].table; assert.equal(table.columns, 3); assert.equal(table.rows[0].cells[0].rowSpan, 2); assert.equal(table.rows[1].cells[0].colSpan, 2);
      } },
      { name: 'styles', html: '<p style="text-align:center"><span style="color:#ff0000;background-color:#ffff00;font-size:28px;font-family:serif;font-weight:bold">Styled</span></p>', verify(result) {
        const html = result[0].html; for (const value of ['#ff0000', '#ffff00', '28', 'serif', '<strong>']) assert(html.includes(value), value + ' missing from ' + html);
        assert.match(html, /data-ff-font-size=["']28["']/);
        assert.match(html, /text-align:\s*center/);
      } },
      { name: 'table fragment', html: '<tr><td>A</td><td>B</td></tr>', verify(result) { assert.equal(result[0].type, 'table'); assert.equal(result[0].table.rows[0].cells.length, 2); } },
      { name: 'code fragment', html: fixture('partial-code.html'), verify(result) { assert.equal(result[0].type, 'codeBlock'); assert.equal(result[0].code, 'return 42'); } },
      { name: 'exact code', html: '<pre><code class="language-python">if x &lt; 2:\n    print(&quot;a&quot;)\n\n    print(x)</code></pre>', verify(result) { assert.equal(result[0].code, 'if x < 2:\n    print("a")\n\n    print(x)'); assert.equal(result[0].language, 'python'); } },
    ];
    for (const sample of samples) for (const channel of ['paste', 'drop', 'menu']) {
      const before = (await items()).length;
      const result = await dispatch({ 'text/html': sample.html }, channel);
      sample.verify(result);
      await page.evaluate(() => window.__canvas2dEngine.undo());
      assert.equal((await items()).length, before);
      await page.evaluate(() => window.__canvas2dEngine.redo());
      assert.equal((await items()).length, before + result.length);
      checks++;
    }
    const readStats = await page.evaluate(() => ({ reads: auditClipboard.reads, textReads: auditClipboard.textReads }));
    assert.deepEqual(readStats, { reads: samples.length, textReads: 0 });
    console.log('PASS 18 paste/drop/menu cases with undo/redo and single snapshot menu reads');

    await reset();
    const [code] = await dispatch({ 'text/html': '<pre><code class="language-python">return 42</code></pre>' });
    await page.evaluate(id => window.__canvas2dEngine.runCommand('code.copy', id), code.id);
    const buttonData = await page.evaluate(() => auditClipboard.data);
    assert.equal(buttonData['text/plain'], 'return 42'); assert.match(buttonData['text/html'], /data-language="python"/);
    const buttonRoundtrip = (await dispatch(buttonData))[0];
    assert.equal(buttonRoundtrip.type, 'codeBlock');
    assert.equal(buttonRoundtrip.language, 'python');
    const writesBeforeCopy = await page.evaluate(() => auditClipboard.writes.length);
    await page.locator(CANVAS).focus(); await page.keyboard.press('Control+c');
    await page.waitForFunction(count => auditClipboard.writes.length > count, writesBeforeCopy);
    const copied = await page.evaluate(() => ({ ...auditClipboard.data }));
    assert.equal((await dispatch(copied))[0].type, 'codeBlock');
    const externalData = { 'text/plain': copied['text/plain'], 'text/html': '<p><strong>' + copied['text/plain'] + '</strong></p>' };
    assert.equal((await dispatch(externalData))[0].type, 'text');
    assert.equal((await dispatch({ 'text/plain': 'different' }))[0].text, 'different');
    checks += 4;
    console.log('PASS code button, keyboard copy, internal roundtrip and same-text external replacement');

    await page.evaluate(() => { auditClipboard.deny = true; });
    const beforeDenied = (await items()).length;
    await page.evaluate(() => window.__canvas2dEngine.runCommand('selection.paste'));
    assert.equal((await items()).length, beforeDenied);
    await page.evaluate(() => { auditClipboard.deny = false; });
    await dispatch({ 'text/plain': 'permission recovered' }, 'menu'); checks++;

    await reset();
    await page.evaluate(() => { for (let i = 0; i < 5; i++) window.auditDispatch({ 'text/html': '<pre><code>item ' + i + '</code></pre>' }, 'paste', true); });
    await page.waitForFunction(() => window.__canvas2dEngine.getSnapshot().board.items.length === 5);
    assert.deepEqual((await items()).map(i => i.code), ['item 0', 'item 1', 'item 2', 'item 3', 'item 4']);
    for (let i = 0; i < 5; i++) await page.evaluate(() => window.__canvas2dEngine.undo());
    assert.equal((await items()).length, 0);
    for (let i = 0; i < 5; i++) await page.evaluate(() => window.__canvas2dEngine.redo());
    assert.equal((await items()).length, 5); checks++;

    for (const action of ['undo', 'replace']) {
      await reset();
      await page.evaluate(() => {
        window.releaseAuditImport = null;
        window.disposeAuditHandler = window.__canvas2dEngine.registerPasteHandler(() => new Promise(resolve => { window.releaseAuditImport = () => resolve({ handled: false }); }));
        window.auditDispatch({ 'text/html': '<p>Must not arrive late</p>' });
      });
      await page.waitForFunction(() => window.releaseAuditImport);
      await page.evaluate(action => {
        if (action === 'undo') window.__canvas2dEngine.undo();
        else window.__canvas2dEngine.loadStructuredBoardForExport({ items: [], selectedIds: [], view: { scale: 1, offsetX: 0, offsetY: 0 } });
        window.disposeAuditHandler();
      }, action);
      assert.equal((await items()).length, 0, action + ' allowed stale commit');
      // New work must complete even while the cancelled handler remains unresolved.
      await dispatch({ 'text/plain': 'Recovered after ' + action });
      await page.evaluate(() => window.releaseAuditImport());
      await page.waitForTimeout(120);
      assert.equal((await items()).length, 1, action + ' allowed stale commit after recovery'); checks++;
    }
    console.log('PASS permission recovery, rapid paste/undo/redo, delayed undo and board replacement');

    await reset();
    await page.evaluate(() => window.__canvas2dEngine.setStructuredImportSwitchConfig({ defaultPipeline: 'legacy' }));
    const [fallback] = await dispatch({ 'text/html': '<p>Snapshot survives <strong>fallback</strong></p>' }, 'drop', true);
    assert.match(fallback.text, /Snapshot survives/);
    assert.match(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().statusText), /简化/);
    await page.evaluate(() => window.__canvas2dEngine.setStructuredImportSwitchConfig({ defaultPipeline: 'structured' }));
    assert.equal((await dispatch({ 'text/html': '<table><tr><td>Recovered table</td></tr></table>' }, 'drop'))[0].type, 'table'); checks++;

    await reset();
    const richData = await page.evaluate(async () => {
      const { createRichTextClipboardPayload } = await import('/src/engines/canvas2d-core/textClipboard/richTextClipboard.js');
      return { 'application/x-freeflow-rich-text': JSON.stringify(createRichTextClipboardPayload({ html: '<p><strong>selection only</strong></p>', plainText: 'selection only' })) };
    });
    assert.match((await dispatch(richData))[0].html, /<strong>selection only<\/strong>/); checks++;

    // Exercise editor selection serialization, not just whole-element copy.
    await reset();
    await dispatch({ 'text/html': '<pre><code class="language-python">before\nreturn 42\nafter</code></pre>' });
    await page.evaluate(() => window.__canvas2dEngine.runCommand('element.edit'));
    await page.locator('#canvas-code-block-editor textarea').waitFor({ state: 'visible' });
    const selectionData = await page.evaluate(() => {
      const editor = document.querySelector('#canvas-code-block-editor textarea'); editor.focus();
      editor.setSelectionRange(7, 16);
      const clipboard = new DataTransfer();
      editor.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: clipboard }));
      const drag = new DataTransfer();
      editor.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: drag }));
      return { copy: Object.fromEntries(clipboard.types.map(t => [t, clipboard.getData(t)])), drag: Object.fromEntries(drag.types.map(t => [t, drag.getData(t)])) };
    });
    assert.equal(selectionData.copy['text/plain'], 'return 42');
    assert.deepEqual(selectionData.copy, selectionData.drag);
    const [draggedSelection] = await dispatch(selectionData.drag, 'drop');
    assert.equal(draggedSelection.code, 'return 42'); assert.equal(draggedSelection.language, 'python');
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().editingId), null);
    checks++;

    await reset();
    await dispatch({ 'text/html': '<p><strong>before selected after</strong></p>' });
    await page.evaluate(() => window.__canvas2dEngine.runCommand('element.edit'));
    await page.locator('#canvas-rich-editor').waitFor({ state: 'visible' });
    const richSelection = await page.evaluate(() => {
      const editor = document.querySelector('#canvas-rich-editor'); editor.focus();
      const text = editor.querySelector('strong').firstChild;
      const range = document.createRange(); range.setStart(text, 7); range.setEnd(text, 15);
      const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      const copy = new DataTransfer(); editor.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: copy }));
      const drag = new DataTransfer(); editor.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: drag }));
      return { copy: copy.getData('text/html'), drag: Object.fromEntries(drag.types.map(t => [t, drag.getData(t)])) };
    });
    assert.match(richSelection.copy, /<strong>selected<\/strong>/);
    const openRichMenu = action => page.evaluate(action => {
      const editor = document.querySelector('#canvas-rich-editor');
      editor.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 450, clientY: 280 }));
      const button = document.querySelector('#canvas2d-context-menu [data-action="' + action + '"]');
      if (!button) throw new Error('Missing rich editor action: ' + action);
      button.click();
    }, action);
    await openRichMenu('rich-copy');
    await page.waitForFunction(() => auditClipboard.writes.length > 0);
    assert.match(await page.evaluate(() => auditClipboard.data['text/html']), /<strong>selected<\/strong>/);
    await page.evaluate(() => { auditClipboard.deny = true; window.auditExecCommand = document.execCommand; document.execCommand = () => false; });
    await openRichMenu('rich-cut');
    await page.waitForTimeout(120);
    assert.equal(await page.locator('#canvas-rich-editor').innerText(), 'before selected after');
    await page.evaluate(() => { auditClipboard.deny = false; document.execCommand = window.auditExecCommand; }); checks++;
    const [selectedText] = await dispatch(richSelection.drag, 'drop');
    assert.equal(selectedText.text, 'selected'); assert.match(selectedText.html, /<strong>/); checks++;

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.__canvas2dEngine.runCommand('element.edit'));
      await page.locator('#canvas-rich-editor').waitFor({ state: 'visible' });
      await page.evaluate(() => {
        const editor = document.querySelector('#canvas-rich-editor'); editor.focus();
        const dt = new DataTransfer(); dt.setData('text/html', '<p>MUST_NOT_APPEAR</p>');
        editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        window.__canvas2dEngine.runCommand('element.edit');
      });
      await page.waitForTimeout(120);
      assert.equal(await page.locator('#canvas-rich-editor').innerText(), 'selected');
      await page.locator('#canvas-rich-editor').press('Escape');
      await page.waitForFunction(() => !window.__canvas2dEngine.getSnapshot().editingId);
      assert(!(await items()).some(item => JSON.stringify(item).includes('MUST_NOT_APPEAR')));
      assert.equal(await page.evaluate(() => document.activeElement.id), 'canvas-office-canvas');
    }
    checks++;
    console.log('PASS partial code/rich selection copy and drag, plus repeated editor exit during paste');

    await page.evaluate(() => window.__canvas2dEngine.runCommand('element.edit'));
    await page.locator('#canvas-rich-editor').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      const editor = document.querySelector('#canvas-rich-editor'); editor.focus();
      const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
      getSelection().removeAllRanges(); getSelection().addRange(range);
      auditClipboard.data = { 'text/html': '<p><strong>HTML-only menu paste</strong></p>' };
    });
    const textReadsBefore = await page.evaluate(() => auditClipboard.textReads);
    await openRichMenu('rich-paste');
    await page.waitForFunction(() => document.querySelector('#canvas-rich-editor').innerText.includes('HTML-only menu paste'));
    assert.equal(await page.evaluate(() => auditClipboard.textReads), textReadsBefore);
    assert.match(await page.locator('#canvas-rich-editor').innerHTML(), /<strong>HTML-only menu paste<\/strong>/); checks++;

    await reset();
    await dispatch({ 'text/html': '<table><tr><td rowspan="2">Merged</td><td>B</td></tr><tr><td>C</td></tr></table>' });
    await page.evaluate(() => window.__canvas2dEngine.runCommand('element.edit'));
    await page.locator('#canvas-table-editor').waitFor({ state: 'visible' });
    const tableCopy = await page.evaluate(() => {
      document.getSelection().removeAllRanges();
      const table = document.querySelector('#canvas-table-editor'); const dt = new DataTransfer();
      table.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: dt }));
      return Object.fromEntries(dt.types.map(t => [t, dt.getData(t)]));
    });
    assert.match(tableCopy['text/html'], /<table/);
    const tableBeforeFailedCut = await page.locator('#canvas-table-editor').innerText();
    await page.evaluate(() => document.querySelector('#canvas-table-editor').dispatchEvent(new ClipboardEvent('cut', { bubbles: true, cancelable: true })));
    assert.equal(await page.locator('#canvas-table-editor').innerText(), tableBeforeFailedCut);
    await page.evaluate(() => window.__canvas2dEngine.runCommand('table.copy-selection'));
    assert.match(await page.evaluate(() => auditClipboard.data['text/html']), /<table/); checks++;

    await reset();
    const saved = await dispatch({ 'text/html': '<p><span style="color:#ff0000;font-size:28px">Saved</span></p><table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>' });
    await page.evaluate(() => {
      const board = JSON.parse(JSON.stringify(window.__canvas2dEngine.getSnapshot().board));
      window.__canvas2dEngine.loadStructuredBoardForExport(board);
    });
    const restored = await items();
    assert.deepEqual(restored.map(i => [i.type, i.html, i.table]), saved.map(i => [i.type, i.html, i.table])); checks++;
    console.log('PASS table selection copy and serialized board restoration');

    for (const [command, text, expectedType] of [
      ['text.convert-code', 'ambiguous sample', 'codeBlock'],
      ['text.convert-table', 'A\tB\nC\tD', 'table'],
    ]) {
      await reset();
      await page.evaluate(text => window.__canvas2dEngine.loadStructuredBoardForExport({
        items: [{ id: 'conversion', type: 'text', text, plainText: text, x: 50, y: 50, width: 400, height: 120 }],
        selectedIds: ['conversion'], view: { scale: 1, offsetX: 0, offsetY: 0 },
      }), text);
      await page.evaluate(command => window.__canvas2dEngine.runCommand(command), command);
      assert.equal((await items())[0].type, expectedType);
      assert.equal((await items())[0].id, 'conversion');
      await page.evaluate(() => window.__canvas2dEngine.undo());
      assert.equal((await items())[0].text, text);
      assert.equal((await items())[0].type, 'text');
      await page.evaluate(() => window.__canvas2dEngine.redo());
      assert.equal((await items())[0].type, expectedType); checks++;
    }

    assert.deepEqual(errors, []);
    console.log(`PASS ${checks} clipboard browser checks; no page errors`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
