const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { _electron: electron } = require('playwright');
const { openExternalLink } = require('../electron/externalLinks');
const ROOT = path.resolve(__dirname, '..');

async function main() {
  const { normalizeLatexSource, formatLatexSource } = await import('../public/src/engines/canvas2d-core/textModel/latexSyntax.js');
  const { renderMarkdownHtml } = await import('../public/src/engines/canvas2d-core/textModel/markdownRuntime.js');
  for (const value of ['$x^2$', '$$x^2$$', '$$\nx^2\n$$', '\\(x^2\\)', '\\[x^2\\]', '$ x^2 $']) assert.equal(normalizeLatexSource(value), 'x^2');
  for (const value of ['$x', '$$x', '$a$ plus $b$', 'a\\$b']) assert.equal(normalizeLatexSource(value), value);
  assert.equal(formatLatexSource('$$x^2$$', true), '$$\nx^2\n$$');
  assert(renderMarkdownHtml('正文 $$x^2$$ 结尾').includes('math-inline'));
  assert(renderMarkdownHtml('$ x^2 $').includes('math-inline'));
  for (const value of ['Price $5 and $10', '`$$x^2$$`', '\\$5', '$$unfinished']) assert(!renderMarkdownHtml(value).includes('data-role="math-'));
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/x', 'freeflow://item/x', 'not a url']) {
    assert.equal((await openExternalLink({ openExternal: () => assert.fail('unsafe URL opened') }, value)).ok, false);
  }
  assert.equal((await openExternalLink({ openExternal: async () => { throw new Error('denied'); } }, 'https://example.com')).ok, false);

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'freeflow-math-links-'));
  const data = path.join(temp, 'Data');
  await fs.mkdir(data);
  const linkedPath = path.join(temp, 'Boards', '链接文件.txt');
  await fs.mkdir(path.dirname(linkedPath));
  await fs.writeFile(linkedPath, 'test');
  const version = require('../package.json').version;
  await fs.writeFile(path.join(data, 'ui-settings.json'), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version, defaultLaunchFullscreen: false }));
  const bootstrap = path.join(temp, 'bootstrap.cjs');
  await fs.writeFile(bootstrap, `const { app, shell } = require('electron');
    app.setPath('userData', ${JSON.stringify(path.join(temp, 'Profile'))}); app.getAppPath = () => ${JSON.stringify(ROOT)};
    global.__openedLinks = [];
    global.__revealedPaths = []; shell.showItemInFolder = value => global.__revealedPaths.push(value);
    shell.openExternal = async url => { if (url.includes('fail.example')) throw new Error('simulated failure'); global.__openedLinks.push(url); };
    require(${JSON.stringify(path.join(ROOT, 'electron/main.js'))});`);
  const env = { ...process.env, FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data, FREEFLOW_CANVAS_BOARD_DIR: path.join(temp, 'Boards'), FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, 'Legacy'), FREEFLOW_PORT: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args: [bootstrap], cwd: ROOT, env, timeout: 30000 });
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains('app-booting'));
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setFullScreen(false); win.setContentSize(1440, 960); win.show(); win.focus(); });
    const collapse = page.locator('.canvas2d-workspace-panel').getByRole('button', { name: '收起画布工作区', exact: true });
    if (await collapse.isVisible()) await collapse.click();
    const directory = page.getByRole('button', { name: '收起画布目录', exact: true });
    if (await directory.isVisible()) await directory.click();

    const dom = await page.evaluate(async () => {
      const { normalizeRichMathHtml } = await import('/src/engines/canvas2d-core/textModel/richMathSource.js');
      const { createRichTextDocumentFromHtml } = await import('/src/engines/canvas2d-core/textModel/richTextDocument.js');
      const { serializeRichTextDocumentToMarkdown } = await import('/src/engines/canvas2d-core/textModel/serializeRichTextDocumentToMarkdown.js');
      const { resolveRichTextDisplayHtml } = await import('/src/engines/canvas2d-core/rendererText.js');
      const mixedDoc = createRichTextDocumentFromHtml('<p><a href="https://example.com/first">已有链接</a> https://example.com/second $x^2$</p>');
      const { extractLinkTokensFromPlainText } = await import('/src/engines/canvas2d-core/textModel/textContentModel.js');
      const mixed = resolveRichTextDisplayHtml({ html: mixedDoc.html, text: mixedDoc.plainText, linkTokens: extractLinkTokensFromPlainText(mixedDoc.plainText) });
      const mixedRoot = window.document.createElement('div'); mixedRoot.innerHTML = mixed;
      const html = normalizeRichMathHtml('<h1>保留标题</h1><p>前 $x<strong>^2</strong>$ 后 $$y^2$$</p><p>$$<br>\\frac{a}{b}<br>$$</p><pre><code>$$raw$$</code></pre><p><a href="https://example.com">$link$</a></p><p>Price $5 and $10</p>');
      const multiline = normalizeRichMathHtml('<h1>保留</h1><div>$$</div><div>\\frac{a}{b}</div><div>$$</div><p>后文</p>');
      const document = createRichTextDocumentFromHtml(html);
      return { html, again: normalizeRichMathHtml(html), document, markdown: serializeRichTextDocumentToMarkdown(document), links: mixedRoot.querySelectorAll('a').length, nested: mixedRoot.querySelectorAll('a a').length,
        multiline, rootBlock: normalizeRichMathHtml('$$x^2$$'), safeCode: normalizeRichMathHtml('<p>$$x^2$$<code>keep</code></p>'),
        protectedImage: normalizeRichMathHtml('<div>$$<img src="https://example.com/image.png"></div><div>x^2</div><div>$$</div>'),
        inlineImage: normalizeRichMathHtml('<p>$x<img src="https://example.com/image.png">^2$</p>'),
        interleavedText: normalizeRichMathHtml('<div>$$</div>保留正文<div>x^2</div><div>$$</div>'),
        protectedCode: normalizeRichMathHtml('<div><code>$$</code></div><div>x^2</div><div>$$</div>') };
    });
    assert.equal(dom.html, dom.again, 'normalization is not idempotent');
    assert(dom.html.includes('<h1>保留标题</h1>'));
    assert(dom.html.includes('math-inline">x^2'));
    assert(dom.html.includes('math-block">\\frac{a}{b}'));
    assert(dom.html.includes('<code>$$raw$$</code>'));
    assert(dom.html.includes('>$link$</a>'));
    assert(dom.html.includes('Price $5 and $10'));
    assert(dom.markdown.includes('$x^2$') && dom.markdown.includes('$$\n\\frac{a}{b}\n$$'));
    assert.equal(dom.links, 2, 'an existing anchor suppressed the bare URL');
    assert.equal(dom.nested, 0, 'link wrapping nested an existing anchor');
    assert(dom.rootBlock.includes('math-block'));
    assert(dom.safeCode.includes('<code>keep</code>'), 'formula swallowed adjacent code');
    assert(dom.multiline.includes('math-block">\\frac{a}{b}'));
    assert(dom.multiline.includes('<h1>保留</h1>') && dom.multiline.includes('<p>后文</p>'));
    assert(dom.protectedImage.includes('<img ') && !dom.protectedImage.includes('math-block'), 'fence merger swallowed an opening-line image');
    assert(dom.inlineImage.includes('<img ') && !dom.inlineImage.includes('math-inline'), 'inline parser crossed an image boundary');
    assert(dom.interleavedText.includes('保留正文') && !dom.interleavedText.includes('math-block'), 'fence merger crossed interleaved text');
    assert(dom.protectedCode.includes('<code>$$</code>') && !dom.protectedCode.includes('math-block'), 'fence merger crossed a code boundary');

    const load = items => page.evaluate(items => {
      window.__canvas2dEngine.loadStructuredBoardForExport({ boardId: 'test-math-links', items, selectedIds: [items[0].id], view: { scale: 1 } });
      window.__canvas2dEngine.setTool('select');
    }, items);
    const snapshot = () => page.evaluate(() => window.__canvas2dEngine.getSnapshotData().items);
    const edit = () => page.evaluate(() => { window.__canvas2dEngine.setTool('select'); return window.__canvas2dEngine.runCommand('element.edit'); });
    const commit = () => page.evaluate(() => window.__canvas2dEngine.setTool('pan'));
    const atEnd = async () => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.locator('#canvas-rich-editor').focus();
      await page.evaluate(() => { const e = document.querySelector('#canvas-rich-editor'), r = document.createRange(); r.selectNodeContents(e); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
    };
    await load([{ id: 'math-doc', type: 'text', x: 300, y: 180, width: 700, html: '<h1>标题</h1><p>原公式 <span data-role="math-inline">x^2</span> 结束</p>' }]);
    await edit(); await atEnd();
    await page.keyboard.type(' 新公式 $$\\frac{a}{b}$$');
    const live = await page.locator('#canvas-rich-editor').innerText();
    assert(live.includes('$$\\frac{a}{b}$$'), 'typing replaced live delimiters');
    await commit();
    let items = await snapshot();
    assert.equal(items.length, 1, 'math edit split the rich document');
    assert.equal((items[0].html.match(/data-role="math-inline"/g) || []).length, 2);
    assert(items[0].html.includes('\\frac{a}{b}'));
    await page.evaluate(() => window.__canvas2dEngine.undo());
    assert(!(await snapshot())[0].html.includes('\\frac{a}{b}'));
    await page.evaluate(() => window.__canvas2dEngine.redo());
    assert((await snapshot())[0].html.includes('\\frac{a}{b}'));
    for (let i = 0; i < 3; i++) {
      await edit();
      assert((await page.locator('#canvas-rich-editor').innerText()).includes('$\\frac{a}{b}$'));
      await commit();
      assert.equal((await snapshot()).length, 1);
      assert(!(await snapshot())[0].html.includes('$$$'), 'delimiter accumulation on re-entry');
    }
    await edit(); await atEnd(); await page.keyboard.type(' $$unfinished');
    await page.evaluate(() => window.__canvas2dEngine.runCommand('canvas.cancel'));
    assert(!(await snapshot())[0].text.includes('unfinished'));
    await edit(); await atEnd();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'gongshi', selectionStart: 0, selectionEnd: 7 });
    const composing = await page.locator('#canvas-rich-editor').evaluate(node => ({ html: node.innerHTML, active: node.dataset.ffComposing }));
    assert.equal(composing.active, 'true');
    await page.evaluate(() => window.__canvas2dEngine.getSnapshotData());
    assert.equal(await page.locator('#canvas-rich-editor').innerHTML(), composing.html, 'serialization altered the IME draft');
    await cdp.send('Input.insertText', { text: ' $$x^3$$' });
    await commit();
    assert((await snapshot())[0].html.includes('math-inline">x^3'), 'IME formula did not commit');

    await load([{ id: 'block-doc', type: 'text', x: 300, y: 180, width: 700, html: '<h1>标题</h1><div data-role="math-block">$$x^2$$</div><p>结束</p>' }]);
    await edit(); await commit();
    assert.equal((await snapshot()).length, 1, 'standalone math was detached from document');
    await load([{ id: 'links', type: 'text', x: 300, y: 180, width: 650, html: '<p><a href="https://example.com/good"><strong>打开网页</strong></a> <a href="https://fail.example">失败链接</a></p>' }]);
    const link = page.locator('.canvas2d-rich-item[data-id="links"] a').first();
    await page.evaluate(() => {
      window.__mathLinkStatuses = [];
      window.__mathLinkUnsubscribe = window.__canvas2dEngine.subscribe(snapshot => window.__mathLinkStatuses.push(snapshot.statusText));
    });
    assert.deepEqual(await app.evaluate(() => global.__openedLinks), [], 'setup opened an external webpage');
    await link.click();
    // Startup path settings can emit a second status immediately after link success.
    // Observe the real notification instead of polling a transient shared status value.
    await page.waitForFunction(() => window.__mathLinkStatuses.includes('已打开链接'));
    const firstOpened = await app.evaluate(() => global.__openedLinks);
    assert.equal(firstOpened.length, 1, `single click opened ${JSON.stringify(firstOpened)}`);
    await link.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
    assert.equal((await app.evaluate(() => global.__openedLinks)).length, 2);
    const box = await link.boundingBox();
    await page.mouse.move(box.x + 5, box.y + 5); await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 5); await page.mouse.move(box.x + 5, box.y + 5); await page.mouse.up();
    assert.equal((await app.evaluate(() => global.__openedLinks)).length, 2, 'link drag opened a webpage');
    await page.locator('.canvas2d-rich-item[data-id="links"] a').nth(1).click();
    await page.waitForFunction(() => window.__mathLinkStatuses.includes('链接打开失败'));
    await page.evaluate(() => window.__mathLinkUnsubscribe());
    await edit();
    const editorLink = page.locator('#canvas-rich-editor a').first();
    await editorLink.click();
    assert.equal((await app.evaluate(() => global.__openedLinks)).length, 2, 'editing click navigated');
    await editorLink.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
    assert.equal((await app.evaluate(() => global.__openedLinks)).length, 3, 'editor modifier-click did not navigate');
    await editorLink.dblclick();
    assert(await page.locator('[data-action="rich-link-apply"]').isVisible(), 'link edit panel did not open');
    await page.locator('[data-action="rich-link-close"]').click();
    await page.evaluate(() => window.__canvas2dEngine.runCommand('canvas.cancel'));
    await link.click();
    assert.equal((await app.evaluate(() => global.__openedLinks)).length, 4, 'exit from editor left stale link gesture');

    const rejected = await page.evaluate(async () => {
      const shell = window.desktopShell;
      return Promise.all(['javascript:alert(1)', 'file:///tmp/test', 'data:text/html,unsafe'].map(url => shell.openExternal(url)));
    });
    assert(rejected.every(result => result.ok === false), 'IPC accepted an unsafe protocol');
    const localOpened = await page.evaluate(value => window.__canvas2dEngine.openExternalUrl(value), pathToFileURL(linkedPath).href);
    assert(localOpened, 'authorized local file URL failed');
    assert.deepEqual(await app.evaluate(() => global.__revealedPaths), [linkedPath], 'file URL changed the platform path separators');
    await load([{ id: 'table-links', type: 'table', x: 300, y: 180, width: 650, table: { columns: 1, hasHeader: false, rows: [{ cells: [{ html: '<p><a href="https://example.com/table">表格链接</a> $x^2$</p>' }] }] } }]);
    await page.locator('.canvas2d-scene-table a').click();
    assert((await app.evaluate(() => global.__openedLinks)).includes('https://example.com/table'));
    await edit();
    const tableLink = page.locator('#canvas-table-editor a');
    const beforeTableEdit = (await app.evaluate(() => global.__openedLinks)).length;
    await tableLink.click();
    assert.equal((await app.evaluate(() => global.__openedLinks)).length, beforeTableEdit);
    await tableLink.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
    assert.equal((await app.evaluate(() => global.__openedLinks)).length, beforeTableEdit + 1);
    await page.evaluate(() => window.__canvas2dEngine.runCommand('canvas.cancel'));
    await load([
      { id: 'internal', type: 'text', x: 300, y: 180, width: 500, html: '<p><a href="freeflow://canvas/item/target">定位目标</a></p>' },
      { id: 'target', type: 'text', x: 2000, y: 1800, width: 300, html: '<p>目标</p>' }
    ]);
    await page.locator('.canvas2d-rich-item[data-id="internal"] a').click();
    await page.waitForFunction(() => window.__canvas2dEngine.getSnapshot().board.selectedIds?.includes('target'));
    assert.equal((await app.evaluate(() => global.__openedLinks)).length, beforeTableEdit + 1, 'internal link reached external opener');
    assert.deepEqual(errors, []);
    console.log('[check-canvas-math-links-desktop] source compatibility, rich edit/re-entry/undo/cancel, desktop link IPC/click/drag/editor/table passed');
  } finally {
    if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close(); }
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
