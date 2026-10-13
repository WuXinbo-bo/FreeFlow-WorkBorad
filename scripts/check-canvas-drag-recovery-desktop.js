const fs=require('node:fs');
const assert=require('node:assert/strict');
const ROOT=require('node:path').resolve(__dirname,'..');
const {_electron}=require(ROOT+'/node_modules/playwright');
const os=require('node:os'),path=require('node:path');
const pct=(arr,p)=>[...arr].sort((a,b)=>a-b)[Math.floor((arr.length-1)*p)]||0;
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'freeflow-stutter-electron-'));
 fs.mkdirSync(path.join(temp,'Data'));
 const version=require(ROOT+'/package.json').version;
 fs.writeFileSync(path.join(temp,'Data/ui-settings.json'),JSON.stringify({hasShownStartupTutorial:true,lastTutorialIntroVersion:version,dismissedTutorialIntroVersion:version,defaultLaunchFullscreen:false}));
 const boot=path.join(temp,'bootstrap.cjs');fs.writeFileSync(boot,`const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temp,'Profile'))});app.getAppPath=()=>${JSON.stringify(ROOT)};require(${JSON.stringify(ROOT+'/electron/main.js')});`);
 const env={...process.env,FREEFLOW_HOME_DIR:temp,FREEFLOW_USER_DATA_DIR:path.join(temp,'Data'),FREEFLOW_CANVAS_BOARD_DIR:path.join(temp,'Boards'),FREEFLOW_LEGACY_PROJECT_DATA_DIR:path.join(temp,'Legacy'),FREEFLOW_PORT:'0'};delete env.ELECTRON_RUN_AS_NODE;
 let app;
 try {
 app=await _electron.launch({executablePath:require(ROOT+'/node_modules/electron'),args:[boot],cwd:ROOT,env});
 const page=await app.firstWindow(); const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.waitForFunction(()=>window.__canvas2dEngine&&!document.body.classList.contains('app-booting'));
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setFullScreen(false);w.setContentSize(1440,960);w.show();w.focus()});
 await page.evaluate(()=>window.__canvas2dEngine.whenReady());
 console.log('GPU '+JSON.stringify(await app.evaluate(({app})=>app.getGPUFeatureStatus())));

 const results=[];
 for(const count of [120,1200]) {
  await page.evaluate(async count=>{const e=window.__canvas2dEngine;await e.loadStructuredBoardForExport({items:Array.from({length:count},(_,i)=>({id:'drag-'+i,type:'fileCard',name:'资料文件 '+i+'.pdf',fileName:'资料文件 '+i+'.pdf',ext:'pdf',x:500+(i%30)*380,y:300+Math.floor(i/30)*260,width:320,height:210,sourcePath:'/tmp/fixture-'+i+'.pdf'})),selectedIds:[],view:{scale:.8,offsetX:0,offsetY:0}});e.setTool('select');},count);
  await page.waitForTimeout(900);
  const collapse=page.locator('.canvas2d-workspace-panel').getByRole('button',{name:'收起画布工作区',exact:true});if(await collapse.isVisible())await collapse.click();
  const directory=page.getByRole('button',{name:'收起画布目录',exact:true});if(await directory.isVisible())await directory.click();
  const box=await page.locator('#canvas-office-canvas').boundingBox();
  await page.evaluate(()=>{window.__perfNative={frames:[],last:performance.now(),phase:'click',done:false};const t=now=>{const p=window.__perfNative;p.frames.push({phase:p.phase,dt:now-p.last});p.last=now;if(!p.done)requestAnimationFrame(t)};requestAnimationFrame(t)});
  await page.mouse.click(box.x+480,box.y+320);await page.waitForTimeout(300);
  console.log('HIT '+JSON.stringify(await page.evaluate(()=>({selected:window.__canvas2dEngine.getSnapshotData().selectedIds,view:window.__canvas2dEngine.getSnapshotData().view}))));
  await page.evaluate(()=>window.__perfNative.phase='drag');
  await page.mouse.move(box.x+480,box.y+320);await page.mouse.down();
  for(let i=0;i<45;i++) {await page.mouse.move(box.x+480+i*4,box.y+320+Math.sin(i/8)*30);}
  await page.mouse.up();await page.evaluate(()=>window.__perfNative.phase='recovery');await page.waitForTimeout(1000);
  const r=await page.evaluate(()=>{window.__perfNative.done=true;const e=window.__canvas2dEngine;return {frames:window.__perfNative.frames,lifecycle:e.getCanvasPerformanceLifecycleSnapshot(),selected:e.getSnapshotData().selectedIds,item:e.getSnapshotData().items[0]}});
  assert(r.item.x>650,'drag did not commit its final position');
  assert.equal(r.lifecycle.phase,'steady');
  await page.evaluate(()=>window.__canvas2dEngine.undo());
  assert.equal(await page.evaluate(()=>window.__canvas2dEngine.getSnapshotData().items[0].x),500,'undo lost the original position');
  await page.evaluate(()=>window.__canvas2dEngine.redo());
  assert.equal(await page.evaluate(()=>window.__canvas2dEngine.getSnapshotData().items[0].x),r.item.x,'redo lost final position');
  results.push({count,...r}); console.log(JSON.stringify({count,selected:r.selected,item:{x:r.item.x,y:r.item.y},phase:r.lifecycle.phase,measures:['click','drag','recovery'].map(phase=>{const a=r.frames.filter(x=>x.phase===phase).map(x=>x.dt);return {phase,p95:pct(a,.95),max:Math.max(...a),over50:a.filter(x=>x>50).length}})}));
 }
 assert.deepEqual(errors,[]);
 console.log('[check-canvas-drag-recovery-desktop] native click, drag, undo/redo and recovery passed');
 } finally {
  if(app) { await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close(); }
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
