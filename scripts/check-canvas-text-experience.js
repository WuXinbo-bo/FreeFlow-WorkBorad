const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const URL = process.env.CANVAS_TEST_URL || 'http://127.0.0.1:3220/canvas-office.html';

async function main() {
  const { renderMarkdownHtml } = await import('../public/src/engines/canvas2d-core/textModel/markdownRuntime.js');
  const nested = renderMarkdownHtml('**加粗 *斜体* 内嵌** <u>下划线</u>');
  assert(nested.includes('<strong>加粗 <em>斜体</em> 内嵌</strong>'));
  assert(nested.includes('<u>下划线</u>'));
  const table = renderMarkdownHtml('| A | B |\n| :--- | ---: |\n| a \\| b | $x^2$ |');
  assert(table.includes('a | b'));
  assert(table.includes('text-align:right'));
  assert(table.includes('data-role="math-inline"'));
  const unsafe = renderMarkdownHtml('[bad](javascript:alert(1)) <img src=x onerror=alert(1)> <u onclick="bad()">unsafe</u>');
  assert(!unsafe.includes('href="javascript:'));
  assert(!unsafe.includes('<img'));
  assert(!unsafe.includes('<u onclick='));
  assert(!renderMarkdownHtml('Price $5 and $10').includes('data-role="math-inline"'));
  assert(!renderMarkdownHtml('`$x$` and \\$5').includes('data-role="math-inline"'));
  assert(renderMarkdownHtml('```javascript\nconst x = 1;\n```').includes('language-javascript'));
  const { buildRichTextDocumentFromMarkdown } = await import('../public/src/engines/canvas2d-core/import/renderers/markdown/markdownStaticRenderer.js');
  assert(buildRichTextDocumentFromMarkdown('# Node heading\n\n```js\n  code\n\n```').blocks.some(block => block.type === 'code-block' && block.attrs.language === 'js' && block.plainText === '  code\n\n'), 'Node semantics lost code whitespace');
  assert.equal(buildRichTextDocumentFromMarkdown('', { html: '<img src="https://example.com/image.png" alt="image">' }).blocks[0].content[0].attrs.src, 'https://example.com/image.png');
  const { createMarkdownParser } = await import('../public/src/engines/canvas2d-core/import/parsers/markdown/markdownParser.js');
  const extensions = await createMarkdownParser().parse({ descriptor: { entries: [{ kind: 'markdown', raw: { markdown: '- [x] done\n\n> quote\n\n$$x^2$$\n\nfoot[^note]\n\n[^note]: definition' } }] } });
  for (const key of ['taskListCount', 'blockquoteCount', 'mathBlockCount', 'footnoteCount']) assert.equal(extensions.stats[key], 1, `${key} was lost in shared parsing`);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.__canvas2dEngine && document.querySelector('#canvas2d-react-ui-host')?.dataset.canvas2dUiState === 'mounted');
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    const load = items => page.evaluate(items => {
      const engine = window.__canvas2dEngine;
      engine.loadStructuredBoardForExport({ items, selectedIds: [items[0].id], view: { scale: 1 } });
      engine.setTool('select');
    }, items);
    const snapshot = () => page.evaluate(() => window.__canvas2dEngine.getSnapshotData().items);
    const cdp = await page.context().newCDPSession(page);

    // Chromium's native composition pipeline (trusted composition/input events),
    // rather than a synthetic compositionstart pretending to be an OS input method.
    const compose = async selector => {
      await page.locator(selector).waitFor({ state: 'visible' });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.locator(selector).focus();
      await page.locator(selector).press('End');
      await cdp.send('Input.imeSetComposition', { text: 'zhong', selectionStart: 0, selectionEnd: 5 });
      assert.equal(await page.locator(selector).getAttribute('data-ff-composing'), 'true', `composition did not start in ${selector}`);
      const guard = await page.locator(selector).evaluate(node => {
        const before = node.innerHTML;
        const range = getSelection()?.rangeCount ? getSelection().getRangeAt(0) : null;
        const events = ['Enter', ' ', 'Escape', 'Tab'].map(key => {
          const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
          node.dispatchEvent(event);
          return event.defaultPrevented;
        });
        return { events, stable: before === node.innerHTML, connected: node.isConnected, range: !range || getSelection()?.anchorNode === range.startContainer };
      });
      assert.deepEqual(guard.events, [false, false, false, false], 'canvas consumed candidate selection keys');
      assert(guard.stable && guard.connected && guard.range, 'composition replaced its DOM or selection');
      await cdp.send('Input.insertText', { text: '中文' });
      await page.waitForFunction(selector => document.querySelector(selector)?.dataset.ffComposing !== 'true', selector);
    };

    await load([{ id: 'text-ime', type: 'text', html: '<p>原文</p>', x: 350, y: 160, width: 500 }]);
    await page.evaluate(() => { window.__canvas2dEngine.setTool('select'); return window.__canvas2dEngine.runCommand('element.edit'); });
    await compose('#canvas-rich-editor');
    assert((await snapshot())[0].text.includes('中文'), 'composition end did not sync rich text');
    await page.evaluate(() => window.__canvas2dEngine.setTool('pan'));
    assert((await snapshot())[0].text.includes('中文'));
    await page.evaluate(() => window.__canvas2dEngine.undo());
    assert(!(await snapshot())[0].text.includes('中文'));
    await page.evaluate(() => window.__canvas2dEngine.redo());
    assert((await snapshot())[0].text.includes('中文'));
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { window.__canvas2dEngine.setTool('select'); return window.__canvas2dEngine.runCommand('element.edit'); });
      await compose('#canvas-rich-editor');
      await page.evaluate(() => window.__canvas2dEngine.runCommand('canvas.cancel'));
      assert.equal((await snapshot())[0].text.match(/中文/g)?.length, 1, 'cancel retained composition draft');
      assert.equal(await page.locator('#canvas-rich-editor').getAttribute('data-ff-composing'), null);
    }
    // A canceled composition must not sync a reused editor after a board switch.
    await page.evaluate(() => { window.__canvas2dEngine.setTool('select'); return window.__canvas2dEngine.runCommand('element.edit'); });
    await cdp.send('Input.imeSetComposition', { text: 'cancelled', selectionStart: 0, selectionEnd: 9 });
    await page.evaluate(() => window.__canvas2dEngine.runCommand('canvas.cancel'));
    await load([{ id: 'fresh', type: 'text', html: '<p>新画布</p>', x: 350, y: 160, width: 500 }]);
    await page.evaluate(() => {
      window.__canvas2dEngine.runCommand('element.edit');
      document.querySelector('#canvas-rich-editor').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    assert.equal((await snapshot())[0].text, '新画布');

    await load([{ id: 'code-ime', type: 'codeBlock', code: 'const value = ', x: 350, y: 160, width: 500 }]);
    await page.evaluate(() => { window.__canvas2dEngine.setTool('select'); return window.__canvas2dEngine.runCommand('element.edit'); });
    await compose('.canvas-code-block-editor-textarea');
    assert((await snapshot())[0].code.includes('中文'));
    await page.evaluate(() => window.__canvas2dEngine.runCommand('canvas.cancel'));
    assert.equal((await snapshot())[0].code, 'const value = ');

    await load([{ id: 'table-ime', type: 'table', x: 350, y: 160, width: 500,
      table: { columns: 1, hasHeader: false, rows: [{ cells: [{ plainText: '单元格' }] }] } }]);
    await page.evaluate(() => { window.__canvas2dEngine.setTool('select'); return window.__canvas2dEngine.runCommand('element.edit'); });
    await page.locator('#canvas-table-editor [data-row-index="0"][data-column-index="0"]').dblclick();
    await compose('#canvas-table-cell-rich-editor');
    assert(JSON.stringify((await snapshot())[0].table).includes('中文'));
    await page.evaluate(() => window.__canvas2dEngine.runCommand('canvas.cancel'));
    assert(!JSON.stringify((await snapshot())[0].table).includes('中文'));

    const semantics = await page.evaluate(async () => {
      const { buildRichTextDocumentFromMarkdown } = await import('/src/engines/canvas2d-core/import/renderers/markdown/markdownStaticRenderer.js');
      const { serializeRichTextDocumentToMarkdown } = await import('/src/engines/canvas2d-core/textModel/serializeRichTextDocumentToMarkdown.js');
      const source = '# Heading\n\n**加粗 *斜体* 内嵌** <u>下划线</u>\n\n- [x] done\n  - nested\n\n| A | B |\n| :--- | ---: |\n| a \\| b | $x^2$ |\n\n```javascript\nconst x = 1;\n```\n\nfoot[^note]\n\n[^note]: definition';
      const doc = buildRichTextDocumentFromMarkdown(source);
      const markdown = serializeRichTextDocumentToMarkdown(doc);
      const again = buildRichTextDocumentFromMarkdown(markdown);
      return { blocks: doc.blocks, again: again.blocks, markdown, html: doc.html };
    });
    for (const type of ['heading', 'list', 'table', 'code-block', 'footnote-definition']) {
      assert(semantics.blocks.some(block => block.type === type), `${type} missing from rich model`);
      assert(semantics.again.some(block => block.type === type), `${type} lost in Markdown round trip`);
    }
    assert(semantics.markdown.includes('<u>下划线</u>'));
    assert(semantics.markdown.includes('```javascript'));
    assert(semantics.markdown.includes('a \\| b'));
    assert(semantics.markdown.includes('[^note]'));

    await load([{ id: 'mixed-code', type: 'text', html: '<pre><code class="language-js">first\n</code></pre><p>middle</p><pre><code class="language-python">last\n</code></pre>', x: 350, y: 160, width: 650 }]);
    await page.evaluate(() => { window.__canvas2dEngine.setTool('select'); return window.__canvas2dEngine.runCommand('element.edit'); });
    assert.equal(await page.locator('#canvas-rich-editor [data-ff-code-block="true"]').count(), 2, 'multiple code blocks collapsed into root code mode');
    await page.locator('#canvas-rich-editor').press('End');
    await page.keyboard.type(' edited');
    await page.evaluate(() => window.__canvas2dEngine.setTool('pan'));
    for (const language of ['js', 'python']) assert((await snapshot())[0].html.includes(`language-${language}`), 'editing lost code language');

    await load([{ id: 'design', type: 'text', html: semantics.html, x: 350, y: 160, width: 650 }]);
    await page.evaluate(() => { window.__canvas2dEngine.setTool('select'); return window.__canvas2dEngine.runCommand('element.edit'); });
    await page.locator('#canvas2d-rich-toolbar [data-action="toggle-more-menu"]').click();
    await page.locator('#canvas2d-rich-toolbar [data-action="toggle-color-panel"]').click();
    assert(await page.locator('#canvas2d-rich-toolbar [data-role="rich-color-panel"]').isVisible(), 'nested color menu closed its parent');
    await page.evaluate(() => window.__canvas2dEngine.runCommand('canvas.cancel'));
    assert.equal(await page.locator('#canvas2d-rich-toolbar .is-open').count(), 0, 'format menu survived cancel');
    await page.evaluate(() => { window.__canvas2dEngine.setTool('select'); return window.__canvas2dEngine.runCommand('element.edit'); });
    const typography = await page.locator('#canvas-rich-editor').evaluate(editor => {
      const code = editor.querySelector('[data-ff-code-block="true"]');
      return { codeFont: getComputedStyle(code).fontFamily, codeBorder: getComputedStyle(code).borderTopWidth, bodyWeight: getComputedStyle(editor).fontWeight,
        heading: getComputedStyle(editor.querySelector('h1')).fontSize, blankBlocks: Array.from(editor.childNodes).filter(node => node.nodeType === 3 && /^\s+$/.test(node.textContent)).length };
    });
    assert.equal(typography.heading, '40px');
    assert.equal(typography.bodyWeight, '400');
    assert.equal(typography.codeBorder, '1px');
    assert(typography.codeFont.includes('monospace'));
    assert.equal(typography.blankBlocks, 0, 'Markdown HTML formatting introduced visual blank lines');
    await page.screenshot({ path: process.env.FREEFLOW_TEXT_SCREENSHOT || '/tmp/freeflow-text-experience.png' });
    assert.deepEqual(errors, []);
    console.log('[check-canvas-text-experience] Markdown safety/roundtrip, Chromium IME, text/code/table save boundaries, cancel/re-entry and nested menus passed');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
