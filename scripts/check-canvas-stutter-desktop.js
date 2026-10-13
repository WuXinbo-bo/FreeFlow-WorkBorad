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
 await page.evaluate(() => window.__canvas2dEngine.setAutosaveEnabled(false, { persist: false, syncSettings: false }));
 const results=[];
 for(const spec of [
 {name:'mixed-known',count:360,kind:'mixed',known:true},
 {name:'mixed-metadata-late',count:360,kind:'mixed',known:false},
 {name:'text-and-files',count:1200,kind:'no-image',known:true}
 ]){
  console.log('SCENE '+spec.name);
  await page.waitForFunction(()=>window.__canvas2dEngine&&document.querySelector('#canvas-office-canvas'));
  await page.evaluate(()=>window.__canvas2dEngine.whenReady());
  await page.evaluate(async spec=>{
   const image=document.createElement('canvas');image.width=1024;image.height=768;const cx=image.getContext('2d');const g=cx.createLinearGradient(0,0,2048,1536);g.addColorStop(0,'#224488');g.addColorStop(1,'#aa9955');cx.fillStyle=g;cx.fillRect(0,0,2048,1536);const data=image.toDataURL('image/png');
   const items=Array.from({length:spec.count},(_,i)=>{
    const base={id:'perf-'+i,x:100+i%30*380,y:100+Math.floor(i/30)*260,width:320,height:210,createdAt:1,updatedAt:1};
    const kind=spec.kind==='no-image'?(i%2?'file':'text'):(i%3===0?'image':i%3===1?'file':'text');
    if(kind==='file')return {...base,type:'fileCard',name:'项目调研与交付文档 '+i+'.pdf',fileName:'项目调研与交付文档 '+i+'.pdf',ext:'pdf',sourcePath:'/tmp/nonexistent-perf-'+i+'.pdf',size:12345};
    if(kind==='image'){cx.fillStyle='#fff';cx.fillText(String(i),40+i,40);return {...base,type:'image',dataUrl:image.toDataURL('image/png'),...(spec.known?{naturalWidth:1024,naturalHeight:768}:{})};}
    return {...base,type:'text',text:'研究资料 '+i+'\n'+('关键结论与说明，验证连续平移时能否稳定呈现。\n'.repeat(8)),plainText:'研究资料 '+i,html:'<h2>研究资料 '+i+'</h2>'+('<p>关键结论与说明，验证连续平移时能否稳定呈现。</p>'.repeat(8)),fontSize:20,textBoxLayoutMode:'fixed-size',textResizeMode:'wrap',wrapMode:'wrap',contentFit:false};
   });
   await window.__canvas2dEngine.loadStructuredBoardForExport({items,selectedIds:[],view:{scale:.55,offsetX:60,offsetY:80},preferences:{backgroundPattern:'none'}});
   window.__canvas2dEngine.setTool('select');
  },spec);
  await page.waitForTimeout(1000);
  for(const mode of ['pan-fast','pan-fast-warm','zoom-out-in']){
   if(mode!=='pan-fast-warm') await page.evaluate(async()=>{
    const e=window.__canvas2dEngine;const data=e.getSnapshotData();data.view={scale:.55,offsetX:60,offsetY:80};data.selectedIds=[];await e.loadStructuredBoardForExport(data);e.setTool('select');
   });
   await page.waitForTimeout(800);
   console.log('MODE '+mode);
   const result=await page.evaluate(async mode=>{
    const canvas=document.querySelector('#canvas-office-canvas');const rect=canvas.getBoundingClientRect();
    const e=window.__canvas2dEngine,frames=[],longTasks=[],samples=[];
    const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(x=>({start:x.startTime,duration:x.duration}))));observer.observe({type:'longtask'});
    let running=true,last=performance.now(),phase='gesture';
    function tick(now){frames.push({dt:now-last,phase});last=now;if(running)requestAnimationFrame(tick)}requestAnimationFrame(tick);
    const eventBase={bubbles:true,cancelable:true,clientX:rect.left+710,clientY:rect.top+450};
    if(mode==='drag')canvas.dispatchEvent(new PointerEvent('pointerdown',{...eventBase,clientX:rect.left+160,clientY:rect.top+155,button:0,buttons:1,pointerId:12,pointerType:'mouse'}));
    for(let i=0;i<90;i++){
      const t=performance.now();
      if(mode==='drag')canvas.dispatchEvent(new PointerEvent('pointermove',{...eventBase,clientX:rect.left+160+i*3,clientY:rect.top+155+Math.sin(i/10)*30,buttons:1,pointerId:12,pointerType:'mouse'}));
      else canvas.dispatchEvent(new WheelEvent('wheel',{...eventBase,ctrlKey:mode==='zoom-out-in',deltaX:mode==='pan-small'?3:mode.startsWith('pan-fast')?(i<45?130:-130):0,deltaY:mode==='zoom-out-in'?(i<45?14:-14):1}));
      const handler=performance.now()-t;
      await new Promise(requestAnimationFrame);
      const s=canvas.__ffRenderStats||{};
      samples.push({i,handler,frame:s.frameDurationMs,fast:s.cameraFastPath?.active,candidate:s.cameraFastPath?.candidate,miss:s.cameraFastPath?.missReason,tiles:s.tileCache,scene:s.visibleCount,scale:s.frameContext?.camera?.scale,minimap:document.querySelector('#canvas2d-transient-minimap canvas')?.__ffMinimapStats});
    }
    if(mode==='drag')canvas.dispatchEvent(new PointerEvent('pointerup',{...eventBase,clientX:rect.left+427,clientY:rect.top+170,button:0,buttons:0,pointerId:12,pointerType:'mouse'}));
    phase='recovery';await new Promise(r=>setTimeout(r,1200));running=false;observer.disconnect();
    return {mode,frames,samples,longTasks,stats:canvas.__ffRenderStats,phase:e.getCanvasPerformanceLifecycleSnapshot(),count:e.getSnapshotData().items.length};
   },mode);

   results.push({scene:spec.name,...result});
   assert.equal(result.phase.phase,'steady','gesture did not recover');
   assert.equal(result.count,spec.count,'gesture changed the board content');
   const arr=result.frames.filter(x=>x.phase==='gesture').map(x=>x.dt),rec=result.frames.filter(x=>x.phase==='recovery').map(x=>x.dt);
   console.log(JSON.stringify({scene:spec.name,mode,count:result.count,rafP50:pct(arr,.5),rafP95:pct(arr,.95),rafMax:Math.max(...arr),over50:arr.filter(x=>x>50).length,recoveryP95:pct(rec,.95),recoveryMax:Math.max(...rec),handlerMax:Math.max(...result.samples.map(x=>x.handler)),fast:result.samples.filter(x=>x.fast).length,miss:[...new Set(result.samples.map(x=>x.miss))],longTasks:result.longTasks,phase:result.phase.phase}));
  }
 }
 assert.deepEqual(errors,[]);
 if(process.env.FREEFLOW_PERF_RESULT) fs.writeFileSync(process.env.FREEFLOW_PERF_RESULT,JSON.stringify({results,errors},null,2));
 console.log('[check-canvas-stutter-desktop] mixed-scene gestures and recovery passed; timing is diagnostic, not a hardware-independent FPS assertion');
 } finally {
  if(app) { await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close(); }
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
