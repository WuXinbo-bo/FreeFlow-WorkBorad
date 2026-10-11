import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanelsTopLeft } from "lucide-react";
import { useDeliveryPanelLayout } from "./useDeliveryPanelLayout.js";
import { FRAME_PRESETS, getFrames, isFrame } from "../frames/frameModel.js";
import { getElementBounds } from "../elements/index.js";

export function DeliveryPanel({ engine, snapshot, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState("a4-portrait");
  const [includeOutside, setIncludeOutside] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const ref = useRef(null);
  const trigger = useRef(null);
  useDeliveryPanelLayout(ref, open);
  const frames = useMemo(() => getFrames(snapshot?.board?.items || []), [snapshot?.board?.items]);
  useEffect(() => { onOpenChange?.(open); return () => onOpenChange?.(false); }, [open, onOpenChange]);
  const ids = new Set(frames.map((item) => item.id));
  const outside = (snapshot?.board?.items || []).filter((item) => !isFrame(item) && !ids.has(item.frameId)).length;
  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (event.type === "keydown" && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      if (event.type === "pointerdown" && !ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", close, true);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close, true); document.removeEventListener("pointerdown", close); };
  }, [open]);
  async function run(task) {
    if (busy) return;
    setBusy(true); setNotice("");
    try { const result = await task(); if (result?.ok === false && !result.canceled) setNotice(result.message || result.error || "操作失败"); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  return <div ref={ref} className="canvas2d-delivery-wrap">
    <button ref={trigger} className="canvas2d-engine-export-history-trigger" type="button" aria-label="板块与交付" title="板块与交付" aria-expanded={open} onClick={() => setOpen(!open)}><PanelsTopLeft size={18} aria-hidden="true" /></button>
    {open && <section className="canvas2d-delivery-panel canvas-chrome-surface" aria-label="板块与交付" onKeyDown={(event) => event.stopPropagation()}>
      <header><strong>板块与交付</strong><button type="button" aria-label="关闭板块与交付" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button></header>
      <div className="canvas2d-delivery-actions"><select aria-label="板块尺寸" value={preset} onChange={(event) => setPreset(event.target.value)}>{Object.entries(FRAME_PRESETS).map(([value, size]) => <option key={value} value={value}>{size.label}</option>)}</select><button type="button" disabled={busy} onClick={() => engine.addFrame(preset)}>新建板块</button></div>
      <small>选中内容后新建板块，可直接将内容加入。拖动板块边缘可整体移动。</small>
      <button type="button" disabled={!snapshot.board.selectedIds?.length} onClick={() => engine.assignSelectionToFrame("")}>移出选中内容</button>
      <ol className="canvas2d-delivery-list">{frames.map((frame, index) => <li key={frame.id}>
        <div className="canvas2d-delivery-actions"><button type="button" aria-label={`定位板块 ${index + 1}`} onClick={() => engine.focusOnBounds(getElementBounds(frame), { animate: true })}>{index + 1}.</button><input aria-label={`板块 ${index + 1} 标题`} defaultValue={frame.title} key={`${frame.id}:${frame.title}`} onBlur={(event) => { if (event.target.value !== frame.title) engine.updateFrame(frame.id, { title: event.target.value }); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><button type="button" aria-label={`${frame.locked ? "解锁" : "锁定"}板块 ${index + 1}`} onClick={() => engine.updateFrame(frame.id, { locked: !frame.locked })}>{frame.locked ? "解锁" : "锁定"}</button></div>
        <div className="canvas2d-delivery-actions"><button type="button" disabled={index === 0} onClick={() => engine.updateFrame(frame.id, { order: index - 1 })}>上移</button><button type="button" disabled={index === frames.length - 1} onClick={() => engine.updateFrame(frame.id, { order: index + 1 })}>下移</button><button type="button" disabled={frame.locked} onClick={() => engine.assignSelectionToFrame(frame.id)}>移入选中内容</button><button type="button" disabled={frame.locked} onClick={() => engine.removeFrame(frame.id)}>删除板块</button></div>
      </li>)}</ol>
      {!frames.length && <p>创建板块后，每个板块可以导出为一页 PDF。</p>}
      <small>删除板块保留内容。超出板块边界的内容会被裁切。</small>
      <label><input type="checkbox" checked={includeOutside} onChange={(event) => setIncludeOutside(event.target.checked)} />附带板块外内容（{outside} 个元素）</label>
      {!includeOutside && outside > 0 && <p role="status">本次 PDF 将不包含这 {outside} 个板块外元素。</p>}
      <div className="canvas2d-delivery-actions"><button type="button" disabled={!frames.length || busy} onClick={() => run(() => engine.exportBoardAsPdf({ paginateFrames: true, includeOutsideFrames: includeOutside, scale: 2 }))}>{busy ? "正在导出…" : "按板块导出 PDF"}</button><button type="button" disabled={busy} onClick={() => engine.exportSelectionAsWord(snapshot.board.items)}>导出画布 Word</button></div>
      {busy && <button type="button" onClick={() => engine.cancelActiveExport()}>取消导出</button>}
      {notice && <p role="alert">{notice}</p>}
    </section>}
  </div>;
}
