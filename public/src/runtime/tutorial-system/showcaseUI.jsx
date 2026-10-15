import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createCanvas2DEngine } from "/src/engines/canvas2d-core/createCanvas2DEngine.js";
import { createCanvas2DReactBridge } from "../../engines/canvas2d-core/reactBridge.js";
import { FileCardAttachedPreview } from "../../engines/canvas2d-core/ui/FileCardAttachedPreview.jsx";
import { WordExportPreviewDialog } from "../../engines/canvas2d-core/ui/WordExportPreviewDialog.jsx";
import { createShowcasePlayer } from "./showcasePlayer.js";
import { createShowcaseScene, MIRROR_SAMPLE_DOCUMENT } from "./showcaseScene.js";

function createMemoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)), removeItem: (key) => values.delete(String(key)),
    clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } };
}

function Showcase({ engine, bridge, scene, player, actions, onReady }) {
  const [snapshot, setSnapshot] = useState(engine.getSnapshot());
  const [timeline, setTimeline] = useState(player.getSnapshot());
  const [visual, setVisual] = useState({});
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const canvasHost = useRef(null);
  const isBlocked = ["loading", "idle"].includes(timeline.status);
  const isPlaying = timeline.status === "playing";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const request = snapshot.wordExportPreviewRequest;
  const chapter = scene.chapters[timeline.chapter];
  useEffect(() => {
    function onKey(event) {
      const timeline = player.getSnapshot();
      const isPlaying = timeline.status === "playing";
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation(); actions.close(); return;
      }
      if (timeline.practicing || event.target.closest("button")) return;
      if (event.code === "Space") { event.preventDefault(); event.stopImmediatePropagation(); isPlaying ? player.pause() : player.resume(); }
      if (!timeline.practicing && event.key === "ArrowRight") { event.preventDefault(); event.stopImmediatePropagation(); void player.goTo(timeline.chapter + 1); }
      if (!timeline.practicing && event.key === "ArrowLeft") { event.preventDefault(); event.stopImmediatePropagation(); void player.goTo(timeline.chapter - 1); }
      if (event.target.closest(".showcase-engine")) { if (event.key !== "Tab") event.preventDefault(); event.stopImmediatePropagation(); }
    }
    const blockInput = (event) => {
      if (!player.getSnapshot().practicing && event.isTrusted && event.target.closest(".showcase-engine")) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const onVisibility = () => { if (document.hidden) player.pause(); };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", onVisibility);
    for (const type of ["beforeinput", "paste", "drop"]) window.addEventListener(type, blockInput, true);
    return () => {
      window.removeEventListener("keydown", onKey, true); document.removeEventListener("visibilitychange", onVisibility);
      for (const type of ["beforeinput", "paste", "drop"]) window.removeEventListener(type, blockInput, true);
    };
  }, []);
  useEffect(() => {
    const unsubEngine = engine.subscribe(setSnapshot);
    const unsubPlayer = player.subscribe(setTimeline);
    actions.setVisual = setVisual;
    engine.mount(canvasHost.current);
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; scene.refit(player.getSnapshot().chapter); });
    });
    observer.observe(canvasHost.current);
    window.__canvas2dEngine = engine;
    window.__featureShowcase = { engine, player, scene, dispose: actions.dispose };
    onReady();
    void player.goTo(0);
    return () => { observer.disconnect(); cancelAnimationFrame(resizeFrame); unsubEngine(); unsubPlayer(); engine.unmount(); };
  }, []);
  async function saveWord() {
    if (!request?.previewDocxBase64 || saving) return;
    player.pause();
    if (actions.exportWord) {
      setSaving(true);
      try {
        const [{ buildWordExportAstFromItems }, { prepareWordExportAssets }] = await Promise.all([
          import("/src/engines/canvas2d-core/export/word/buildWordExportAst.js"),
          import("/src/engines/canvas2d-core/export/word/prepareWordExportAssets.js"),
        ]);
        const ast = await prepareWordExportAssets(buildWordExportAstFromItems(request.sourceItems, { orderedItemIds: request.preview.orderedItemIds }));
        const result = await actions.exportWord({ ast, defaultName: "FreeFlow-调研示例.docx", title: "保存导览示例 Word" });
        setSaved(result?.ok ? "示例 Word 已保存。" : result?.canceled ? "已取消保存，可随时重试。" : result?.error || "保存失败，请重试。");
      } catch { setSaved("保存失败，请重试。"); }
      finally { setSaving(false); }
      return;
    }
    const bytes = Uint8Array.from(atob(request.previewDocxBase64), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const link = document.createElement("a"); link.href = url; link.download = "FreeFlow-调研示例.docx";
    document.body.append(link); link.click(); link.remove();
    actions.urls.add(url);
    setSaved("已生成 Word，正在交给系统保存。");
  }

  return <div className="showcase-shell" data-showcase-status={timeline.status}>
    <header className="showcase-header">
      <div className="showcase-brand"><img src="/assets/brand/FreeFlow_app_icon.png" alt="" /><span>FreeFlow <small>特色导览</small></span></div>
      <span className="showcase-session-label">独立示例画布 · 随时退出</span>
    </header>
    <nav className="showcase-chapters" aria-label="导览章节">
      {scene.chapters.map((entry, index) => <button key={entry.id} type="button" aria-current={index === timeline.chapter ? "step" : undefined}
        onClick={() => { setSaved(""); void player.goTo(index); }}><span>{String(index + 1).padStart(2, "0")}</span>{entry.title}</button>)}
    </nav>
    <section className="showcase-stage" aria-label="特色演示画布" onPointerDownCapture={(event) => { if (event.isTrusted) player.pause(); }}>
      <div ref={canvasHost} className={`showcase-engine${timeline.practicing ? " is-practicing" : ""}`} />
      {!timeline.practicing && <div className="showcase-interaction-guard" aria-hidden="true" />}
      {isBlocked && <div className="showcase-preparing" role="status">正在准备本章…</div>}
      {visual.source && <aside className="showcase-source"><span className="showcase-eyebrow">示例资料</span><h2>让一个想法，<br />成为一份成果</h2><p>把资料带进画布，继续思考和编辑。</p><h3>调研笔记</h3><ul><li><b>收集</b>：保留资料原有的层次</li><li><b>整理</b>：连接想法，形成结构</li><li><b>交付</b>：输出可以分享的文档</li></ul><span className="showcase-key">{navigator.platform.includes("Mac") ? "⌘" : "Ctrl"} V <small>一次带入</small></span></aside>}
      {visual.formula && <div className="showcase-formula-source"><span>可继续编辑的源码</span><code>{"$$ E = mc^2 $$"}</code></div>}
      {visual.mirror && <aside className="showcase-mirror" aria-label="AI 镜像操作示例">
        <div className="showcase-mirror-heading"><strong>AI 镜像</strong><span>内置操作示例</span></div>
        <div className="showcase-mirror-control"><span>映射控制</span><span className="showcase-mirror-target">已有 AI 网页 <span>⌄</span></span></div>
        {visual.mirror === "choose" ? <div className="showcase-mirror-empty"><span>选择目标</span><p>使用已有 AI 网页，无需在 FreeFlow 配置模型。</p><span className="showcase-mirror-embed">开始嵌入</span></div> : <iframe className="showcase-mirror-webpage" title="AI 镜像离线示例网页" sandbox="allow-same-origin" srcDoc={MIRROR_SAMPLE_DOCUMENT}
          onLoad={(event) => event.currentTarget.contentDocument.addEventListener("keydown", (key) => { if (key.key === "Escape") actions.close(); })} />}
        <button type="button" onClick={() => actions.mirrorTutorial()}>退出导览，体验真实 AI 镜像 ↗</button>
      </aside>}
      {!timeline.practicing && visual.cursor && <div className={`showcase-cursor at-${visual.cursor}`} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 3 14 10-7 1-3 7Z" /></svg></div>}
      {(snapshot.fileCardPreviewRequests || []).map((preview) => <FileCardAttachedPreview key={preview.id} request={preview} board={snapshot.board} bridge={bridge} />)}
      <WordExportPreviewDialog request={request} exporting={saving}
        onReorder={(id, direction) => { player.pause(); engine.reorderWordExportPreview(request.id, id, direction); }}
        onClose={() => { void player.practice(); engine.closeWordExportPreview(request.id); }} onConfirm={() => void saveWord()} />
    </section>
    <footer className="showcase-footer">
      <div className="showcase-caption" aria-live="polite"><span>{String(timeline.chapter + 1).padStart(2, "0")} / {String(scene.chapters.length).padStart(2, "0")}</span><div><strong>{chapter.title}</strong><p>{timeline.error || saved || (timeline.practicing ? "自由练习中，仅本次保留。重播会重置示例，退出后丢弃。" : timeline.caption)}</p></div></div>
      <div className="showcase-actions">
        {timeline.status === "error" ? <button type="button" onClick={() => void player.goTo(timeline.chapter)}>重试本章</button> : <button type="button" disabled={isBlocked || timeline.practicing || timeline.status === "complete"} onClick={() => isPlaying ? player.pause() : player.resume()}>{isPlaying ? "暂停" : reducedMotion ? "下一步" : "播放"}</button>}
        <button type="button" disabled={isBlocked} onClick={() => void player.goTo(timeline.chapter)}>重播本章</button>
        <button type="button" className="is-primary" disabled={isBlocked || timeline.practicing || timeline.status === "error"} onClick={async () => { await player.practice(); setVisual({}); }}>亲自试试</button>
      </div>
    </footer>
  </div>;
}

let started = false;
window.startFeatureShowcase = async function startFeatureShowcase({ previewWord = null, exportWord = null, close = () => {}, mirrorTutorial = () => {} } = {}) {
  if (started) return;
  started = true;
  // Keep all engine preferences, history and reading positions inside this frame.
  Object.defineProperty(window, "localStorage", { value: createMemoryStorage(), configurable: true });
  const urls = new Set();
  const engine = createCanvas2DEngine({ disableLocalStorage: true, initializeBoardFileState: false, initialBoard: { items: [] } });
  const actions = { setVisual: () => {}, close, mirrorTutorial, exportWord, urls };
  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const scene = createShowcaseScene({ engine, setVisual: (value) => actions.setVisual(value), previewWord });
  // Only these in-memory files and the existing Word generator are exposed.
  window.desktopShell = {
    previewWordDocx: previewWord || undefined,
    getPathForFile(file) { return file.path || ""; },
    async readFilePreview(path) {
      const file = scene.files.get(path);
      return file ? { ok: true, data: new Uint8Array(await file.arrayBuffer()), mime: file.type } : { ok: false, error: "仅支持本次导览的示例文件" };
    },
  };
  const player = createShowcasePlayer({ chapters: scene.chapters, prepare: scene.prepare, onChapterComplete: scene.complete, reducedMotion: motionQuery.matches });
  const onMotionChange = () => player.setReducedMotion(motionQuery.matches);
  motionQuery.addEventListener("change", onMotionChange);
  const root = createRoot(document.querySelector("#feature-showcase-root"));
  let disposed = false;
  actions.dispose = async () => {
    if (disposed) return;
    disposed = true;
    motionQuery.removeEventListener("change", onMotionChange);
    const pending = player.dispose();
    engine.closeWordExportPreview();
    root.unmount();
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.clear();
    window.__featureShowcase = null;
    await pending;
  };
  window.addEventListener("pagehide", () => { void actions.dispose(); }, { once: true });
  return new Promise((resolve) => root.render(<Showcase engine={engine} bridge={createCanvas2DReactBridge(engine)} scene={scene} player={player} actions={actions} onReady={resolve} />));
};
