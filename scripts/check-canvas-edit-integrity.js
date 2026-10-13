const assert = require('assert');
const { chromium } = require('playwright');
const URL = process.env.CANVAS_TEST_URL || 'http://127.0.0.1:3220/canvas-office.html';
async function main() {
 const browser = await chromium.launch({headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:960}});
  await page.addInitScript(()=>{
   window.__auditWrites=[];
   window.desktopShell={writeFile:async(filePath,data)=>{window.__auditWrites.push({filePath,data});return {ok:true,filePath};},pickCanvasBoardPath:async()=>({filePath:'/audit/board.freeflow'}),pathExists:async()=>false};
  });
  await page.goto(URL);await page.waitForFunction(()=>!!window.__canvas2dEngine?.getSnapshot);
  await page.waitForFunction(()=>document.querySelector('#canvas2d-react-ui-host')?.dataset.canvas2dUiState==='mounted');
  await page.evaluate(()=>window.__canvas2dEngine.whenReady());
  const load=async items=>page.evaluate(items=>{const e=window.__canvas2dEngine;e.loadStructuredBoardForExport({boardId:'integrity-board',items,selectedIds:[items[0].id],view:{scale:1,offsetX:0,offsetY:0},preferences:{allowLocalFileAccess:false,backgroundPattern:'grid'}});},items);
  await load([{id:'code',type:'codeBlock',code:'OLD',x:400,y:200,width:400,height:150}]);
  await page.evaluate(()=>window.__canvas2dEngine.runCommand('element.edit'));
  await page.locator('.canvas-code-block-editor-textarea').fill('NEW');
  assert.strictEqual(await page.evaluate(()=>window.__canvas2dEngine.getSnapshotData().items[0].code),'NEW','code draft missing from model');
  await page.evaluate(()=>window.__canvas2dEngine.runCommand('canvas.cancel'));
  assert.strictEqual(await page.evaluate(()=>window.__canvas2dEngine.getSnapshotData().items[0].code),'OLD','cancel did not restore code');
  await page.evaluate(()=>window.__canvas2dEngine.runCommand('element.edit'));
  await page.locator('.canvas-code-block-editor-textarea').fill('SAVED CODE');
  assert.strictEqual(await page.evaluate(()=>window.__canvas2dEngine.saveBoard()),true);
  assert(await page.evaluate(()=>window.__auditWrites.filter(x=>x.filePath.endsWith('.freeflow')).at(-1).data.includes('SAVED CODE')),'code save omitted draft');
  await page.locator('.canvas-code-block-editor-textarea').fill('UNSAVED CODE');
  await page.evaluate(()=>window.__canvas2dEngine.runCommand('canvas.cancel'));
  assert.strictEqual(await page.evaluate(()=>window.__canvas2dEngine.getSnapshotData().items[0].code),'SAVED CODE');
  await page.evaluate(()=>window.__canvas2dEngine.undo());
  assert.strictEqual(await page.evaluate(()=>window.__canvas2dEngine.getSnapshotData().items[0].code),'OLD','saved draft omitted undo');
  await load([{id:'table',type:'table',x:400,y:200,width:400,height:150,table:{columns:1,hasHeader:false,rows:[{cells:[{plainText:'OLD CELL'}]}]}}]);
  await page.evaluate(()=>window.__canvas2dEngine.runCommand('element.edit'));
  await page.locator('#canvas-table-editor [data-row-index="0"][data-column-index="0"]').dblclick();
  const selectedCellText = await page.evaluate(async () => {
    const cell = document.querySelector('#canvas-table-editor [data-row-index="0"][data-column-index="0"]');
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const editor = document.querySelector('#canvas-table-cell-rich-editor');
    const range = document.createRange(); range.selectNodeContents(editor);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return getSelection().toString();
  });
  assert.strictEqual(selectedCellText, 'OLD CELL', 'deferred cell focus stole a newer selection');
  await page.locator('#canvas-table-cell-rich-editor').fill('SAVED CELL');
  assert.strictEqual(await page.evaluate(()=>window.__canvas2dEngine.saveBoard()),true);
  assert(await page.evaluate(()=>window.__auditWrites.filter(x=>x.filePath.endsWith('.freeflow')).at(-1).data.includes('SAVED CELL')),'table save omitted draft');
  await page.locator('#canvas-table-cell-rich-editor').fill('UNSAVED CELL');
  await page.evaluate(()=>window.__canvas2dEngine.runCommand('canvas.cancel'));
  assert.strictEqual(await page.evaluate(()=>window.__canvas2dEngine.getSnapshotData().items[0].table.rows[0].cells[0].plainText),'SAVED CELL');

  await load([{id:'text',type:'text',html:'<h1>OLD</h1>',plainText:'OLD',x:400,y:200,width:400,height:100,fontSize:20}]);
  await page.evaluate(()=>window.__canvas2dEngine.runCommand('element.edit'));
  await page.locator('#canvas-rich-editor').fill('NEW');
  await page.evaluate(()=>window.__canvas2dEngine.runCommand('canvas.cancel'));
  assert.strictEqual(await page.evaluate(()=>window.__canvas2dEngine.getSnapshotData().items[0].plainText),'OLD','rich cancel did not restore baseline');
  await page.evaluate(()=>window.__canvas2dEngine.runCommand('element.edit'));
  await page.locator('#canvas-rich-editor').fill('SAVED RICH');
  await page.evaluate(()=>window.__canvas2dEngine.runCommand('canvas.save'));
  assert.strictEqual(await page.evaluate(()=>window.__canvas2dEngine.getSnapshotData().items[0].plainText),'SAVED RICH','rich save did not commit draft');
  await page.evaluate(()=>window.__canvas2dEngine.runCommand('canvas.cancel'));
  assert.strictEqual(await page.evaluate(()=>window.__canvas2dEngine.getSnapshotData().items[0].plainText),'SAVED RICH','rich cancel changed committed content');
  await page.evaluate(()=>window.__canvas2dEngine.undo());
  assert.strictEqual(await page.evaluate(()=>window.__canvas2dEngine.getSnapshotData().items[0].plainText),'OLD','saved rich draft omitted undo');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.evaluate(()=>window.__canvas2dEngine.getSnapshotData().items[0].plainText),'OLD','late edit followup overwrote undo');
  const history = await page.evaluate(()=>{const e=window.__canvas2dEngine;const folder=e.addCanvasNavigatorFolder({title:'F'});e.addCanvasNavigatorEntryForItem('text',{title:'Custom',parentId:folder.id});const before=e.getSnapshotData();e.runCommand("selection.delete");e.undo();const restored=e.getSnapshotData();e.clearBoard();e.undo();return {before,restored,after:e.getSnapshotData()};});
  assert.deepStrictEqual(history.restored.navigator,history.before.navigator,'delete undo lost navigator');
  assert.deepStrictEqual(history.after.navigator,history.before.navigator,'clear undo lost navigator');
  assert.strictEqual(history.after.boardId,'integrity-board');assert.deepStrictEqual(history.after.preferences,history.before.preferences);
  console.log('[check-canvas-edit-integrity] ok');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
