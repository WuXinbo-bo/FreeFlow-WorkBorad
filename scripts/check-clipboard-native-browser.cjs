const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const url=process.env.CANVAS_TEST_URL||'http://localhost:53128/canvas-office.html';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.FREEFLOW_TEST_BROWSER_CHANNEL?{channel:process.env.FREEFLOW_TEST_BROWSER_CHANNEL}:{})});
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],viewport:{width:1440,height:960}});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('ai_worker_canvas_office_board_v3',JSON.stringify({items:[],selectedIds:[],view:{scale:1,offsetX:0,offsetY:0}})));
 await page.goto(url);await page.waitForFunction(()=>window.__canvas2dEngine);
 // Keep the user's readable standard clipboard formats in memory, never in output.
 const backup=await page.evaluate(async()=>{try{const items=await navigator.clipboard.read();window.clipboardAuditBackup=items;return true;}catch{return false;}});
 try{
 const source=await context.newPage();
 await source.goto(url);await source.waitForFunction(()=>window.__canvas2dEngine);
 await source.evaluate(()=>{
  const source=document.createElement('div');source.id='native-copy-source';source.tabIndex=0;
  source.style.cssText='position:fixed;inset:0;background:white;z-index:999999;padding:30px;overflow:auto';
  source.innerHTML='<main><p><strong style="color:rgb(255, 0, 0);font-size:28px">Native selected text</strong></p><pre><code class="language-python">if x &lt; 2:\n    print(x)</code></pre><table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table></main>';
  document.body.appendChild(source);source.focus();const range=document.createRange();range.selectNodeContents(source);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
 });
 await source.keyboard.press('Control+c');
 await page.bringToFront();await page.locator('#canvas-office-canvas').focus();await page.keyboard.press('Control+v');
 await page.waitForFunction(()=>window.__canvas2dEngine.getSnapshot().board.items.length>=3);
 const copied=await page.evaluate(()=>window.__canvas2dEngine.getSnapshot().board.items);
 assert.deepEqual(copied.map(i=>i.type),['text','codeBlock','table']);assert.equal(copied[1].code,'if x < 2:\n    print(x)');assert.equal(copied[2].table.rows[0].cells[0].rowSpan,2);
 console.log('PASS native cross-page Ctrl+C / Ctrl+V: text, code whitespace and merged table');
 // Test a source copy button writing real ClipboardItem HTML, then native Ctrl+V.
 await source.evaluate(()=>{const button=document.createElement('button');button.id='native-copy-button';button.textContent='Copy';button.style.cssText='position:fixed;right:30px;top:30px;z-index:1000000';button.onclick=async()=>{await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob(['<pre><code class="language-python">return 42</code></pre>'],{type:'text/html'}),'text/plain':new Blob(['return 42'],{type:'text/plain'})})]);button.dataset.done='true';};document.body.appendChild(button);});
 await source.bringToFront();await source.locator('#native-copy-button').click();await source.waitForFunction(()=>document.querySelector('#native-copy-button').dataset.done==='true');
 await page.bringToFront();await page.locator('#canvas-office-canvas').focus();await page.keyboard.press('Control+v');
 await page.waitForFunction(()=>window.__canvas2dEngine.getSnapshot().board.items.length===4);
 assert.equal(await page.evaluate(()=>window.__canvas2dEngine.getSnapshot().board.items.at(-1).language),'python');
 console.log('PASS native copy button / Ctrl+V preserves code language');
 await source.close();
 // Drag an actual browser selection with the mouse into the canvas.
 await page.evaluate(()=>{const host=document.createElement('div');host.id='native-drag-source';host.style.cssText='position:fixed;left:30px;top:30px;z-index:999999;background:white;padding:15px;font-size:20px';host.innerHTML='<pre><code class="language-python">return 77</code></pre>';document.body.appendChild(host);const range=document.createRange();range.selectNodeContents(host);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
 const rect=await page.locator('#native-drag-source code').boundingBox();
 await page.mouse.move(rect.x+25,rect.y+rect.height/2);await page.mouse.down();await page.waitForTimeout(200);await page.mouse.move(rect.x+45,rect.y+rect.height/2,{steps:4});await page.mouse.move(1100,650,{steps:15});await page.mouse.up();
 await page.waitForFunction(()=>window.__canvas2dEngine.getSnapshot().board.items.length===5,{},{timeout:5000});
 const dragged=await page.evaluate(()=>window.__canvas2dEngine.getSnapshot().board.items.at(-1));
 assert.equal(dragged.type,'codeBlock');assert.equal(dragged.code,'return 77');
 console.log('PASS native mouse selection drag into canvas');
 await page.evaluate(()=>{const host=document.querySelector('#native-drag-source');host.innerHTML='<p><b>New external selection</b></p>';host.tabIndex=0;host.focus();const range=document.createRange();range.selectNodeContents(host);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
 await page.keyboard.press('Control+c');
 assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).trim(),'New external selection');
 // A real click transfers both keyboard focus and the browser selection target.
 await page.mouse.click(1250,800);await page.keyboard.press('Control+v');
 await page.waitForFunction(()=>window.__canvas2dEngine.getSnapshot().board.items.length>5);
 const external=await page.evaluate(()=>window.__canvas2dEngine.getSnapshot().board.items.at(-1));
 assert.equal(external.type,'text');assert.equal(external.text,'New external selection');
 console.log('PASS external text selection owns Ctrl+C even after hovering the canvas');
 assert.deepEqual(errors,[]);
 }finally{
 if(backup)await page.evaluate(async()=>{try{if(window.clipboardAuditBackup?.length)await navigator.clipboard.write(window.clipboardAuditBackup);}catch{}});
 await browser.close();
 }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
