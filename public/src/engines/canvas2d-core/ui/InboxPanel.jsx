import React, { useEffect, useMemo, useRef, useState } from "react";
import { Inbox } from "lucide-react";
import { useDeliveryPanelLayout } from "./useDeliveryPanelLayout.js";
import { getFrames } from "../frames/frameModel.js";
import { getElementBounds } from "../elements/index.js";
export function InboxPanel({ engine, snapshot, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("group:");
  const [notice, setNotice] = useState("");
  const ref = useRef(null);
  const trigger = useRef(null);
  useDeliveryPanelLayout(ref, open);
  const items = snapshot?.board?.items || [];
  const inbox = useMemo(() => items.filter((item) => item.collection?.inbox), [items]);
  const frames = getFrames(items);
  useEffect(() => { onOpenChange?.(open); return () => onOpenChange?.(false); }, [open, onOpenChange]);
  const groups = [...new Set(items.map((item) => item.groupId).filter(Boolean))];
  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (event.type === "keydown" && event.key === "Escape") { event.stopPropagation(); event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (event.type === "pointerdown" && !ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", close, true); document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close, true); document.removeEventListener("pointerdown", close); };
  }, [open]);
  function organize(ids) {
    const separator = target.indexOf(":");
    const ok = engine.organizeInboxItems(ids, target.slice(separator + 1), target.slice(0, separator));
    setNotice(ok ? "已整理，可撤销恢复" : "目标已改变或内容被锁定，请重新选择");
  }
  return <div ref={ref} className="canvas2d-delivery-wrap">
    <button ref={trigger} className="canvas2d-engine-export-history-trigger" type="button" title={`收件箱${inbox.length ? ` · ${inbox.length}` : ""}`} aria-label={`收件箱${inbox.length ? ` · ${inbox.length}` : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}><Inbox size={18} aria-hidden="true" /></button>
    {open && <section className="canvas2d-delivery-panel canvas-chrome-surface" aria-label="画布收件箱" onKeyDown={(event) => event.stopPropagation()}>
      <header><strong>当前画布收件箱</strong><button type="button" aria-label="关闭收件箱" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button></header>
      <label><input type="checkbox" checked={snapshot.board.preferences?.collectionMode === true} onChange={(event) => engine.setCollectionMode(event.target.checked)} />收集模式：画布粘贴和外部拖入进收件箱</label>
      <small>编辑器内粘贴仍保持原来的操作。收件箱保留来源和时间。</small>
      <button type="button" onClick={() => engine.collectClipboardToInbox()}>粘贴到收件箱</button>
      <select aria-label="收件箱整理目标" value={target} onChange={(event) => setTarget(event.target.value)}><option value="group:">新分组</option>{groups.map((id, index) => <option key={id} value={`group:${id}`}>分组 {index + 1}</option>)}{frames.map((frame) => <option key={frame.id} disabled={frame.locked} value={`frame:${frame.id}`}>{frame.title}</option>)}</select>
      <button type="button" disabled={!inbox.length} onClick={() => organize(inbox.map((item) => item.id))}>整理全部</button>
      <ol className="canvas2d-delivery-list">{inbox.map((item) => <li key={item.id}><strong>{String(item.linkCard?.title || item.title || item.name || item.type).slice(0, 80)}</strong><small>{item.collection.sourceKind === "drop" ? "拖入" : "剪贴板"} · {new Date(item.collection.capturedAt).toLocaleString()}</small>{item.collection.sourceUrl && <small title={item.collection.sourceUrl}>{item.linkCard?.domain || item.collection.sourceUrl}</small>}<div className="canvas2d-delivery-actions"><button type="button" onClick={() => engine.focusOnBounds(getElementBounds(item), { animate: true })}>定位</button><button type="button" disabled={item.locked} onClick={() => organize([item.id])}>移入目标</button>{item.linkCard && <><button type="button" onClick={() => engine.openExternalUrl(item.linkCard.url)}>打开链接</button>{item.linkCard.fetchState !== "ready" && <button type="button" onClick={() => engine.retryLinkMetadata(item.id)}>重试标题</button>}</>}</div></li>)}</ol>
      {!inbox.length && <p>收件箱为空。普通粘贴仍直接放到画布位置。</p>}
      {notice && <p role="status">{notice}</p>}
    </section>}
  </div>;
}
