import React, { useEffect, useRef, useState } from "react";

const reasonLabels = { save: "保存前", pull: "拉取前", "before-restore": "恢复前", "remote-history": "远程历史恢复前" };

export function CanvasRecoveryDialog({ recovery, busy, error, onClose, onRestore, onRefresh }) {
  const rootRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [localError, setLocalError] = useState("");
  const [reading, setReading] = useState(false);
  const generation = useRef(0);
  const history = recovery.kind === "history";
  useEffect(() => {
    const previous = document.activeElement;
    rootRef.current?.querySelector("button:not(:disabled)")?.focus();
    const trap = (event) => {
      if (event.key !== "Tab") return;
      const buttons = Array.from(rootRef.current?.querySelectorAll("button:not(:disabled),summary") || []).filter((node) => node.getClientRects().length);
      if (!buttons.length) { event.preventDefault(); return; }
      if (!rootRef.current.contains(document.activeElement) || document.activeElement === (event.shiftKey ? buttons[0] : buttons[buttons.length - 1])) {
        event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
      }
      event.stopPropagation();
    };
    window.addEventListener("keydown", trap, true);
    return () => { generation.current += 1; window.removeEventListener("keydown", trap, true); previous?.focus?.({ preventScroll: true }); };
  }, []);

  async function select(entry, action) {
    const request = ++generation.current;
    setLocalError(""); setPreview(null); setReading(true);
    try {
      if (history) {
        const result = await globalThis.desktopShell.previewCanvasHistory({ filePath: recovery.target, historyId: entry.id });
        if (!result?.ok) throw new Error(result?.error || "历史预览失败");
        if (request !== generation.current) return;
        setPreview(result);
      }
      if (request === generation.current) setSelected({ entry, action });
    } catch (cause) { if (request === generation.current) setLocalError(cause.message); }
    finally { if (request === generation.current) setReading(false); }
  }

  async function purge() {
    setReading(true); setLocalError("");
    try {
      const result = await globalThis.desktopShell.purgeCanvasTrash({ folderPath: recovery.target, trashId: selected.entry.id });
      if (!result?.ok) throw new Error(result?.error || "删除失败");
      setSelected(null);
      await onRefresh();
    } catch (cause) { setLocalError(cause.message); }
    finally { setReading(false); }
  }

  const blocked = Boolean(busy) || reading;
  useEffect(() => {
    if (!blocked && !rootRef.current?.contains(document.activeElement)) rootRef.current?.querySelector("button:not(:disabled)")?.focus();
  }, [blocked, Boolean(selected)]);
  return <div className="canvas2d-workspace-confirm-backdrop" data-shape-include="true"><section ref={rootRef} className="canvas2d-workspace-confirm canvas2d-workspace-recovery canvas-chrome-surface" role="dialog" aria-modal="true" aria-label={history ? "历史版本" : "回收站"} onKeyDown={(event) => {
    event.stopPropagation();
    if (event.key === "Escape" && !blocked) { event.preventDefault(); if (selected) setSelected(null); else onClose(); }
  }}>
    <strong>{history ? "历史版本" : "回收站"}</strong>
    <p>{history ? "选择一个版本，预览后恢复。" : "恢复已删除的画布，原同名文件不会被覆盖。"}</p>
    <details className="canvas2d-recovery-rules"><summary>保留与恢复说明</summary><p>{history ? "保存、远程拉取和恢复前自动保留版本。每个画布最多 30 个、200 MB；附件继续引用原文件。" : "记录保存在当前工作区。恢复遇到同名文件时自动改名；永久删除需要再次确认。远程副本不会自动删除。"}</p></details>
    {!selected ? <div className="canvas2d-workspace-recovery-list">{recovery.entries.length ? recovery.entries.map((entry) => <div key={entry.id} className="canvas2d-workspace-recovery-row">
      <div><strong>{history ? new Date(entry.createdAt).toLocaleString() : entry.name}</strong><small>{history ? reasonLabels[entry.reason] || "历史版本" : new Date(entry.createdAt).toLocaleString()} · {Math.ceil(entry.size / 1024)} KB</small></div>
      <button type="button" disabled={blocked} onClick={() => select(entry, "restore")}>{history ? "预览与恢复" : "恢复"}</button>
      {!history ? <button type="button" disabled={blocked} onClick={() => select(entry, "purge")}>永久删除</button> : null}
    </div>) : <span className="canvas2d-workspace-empty">暂无记录</span>}</div> : <div className="canvas2d-workspace-recovery-preview">
      <strong>{selected.action === "purge" ? `永久删除「${selected.entry.name}」？` : history ? "恢复此历史版本？" : `恢复「${selected.entry.name}」？`}</strong>
      <p>{selected.action === "purge" ? "此本地回收站副本将无法恢复。" : history ? "会先保存当前修改并保留恢复前版本，再载入历史内容。恢复后的内容需要重新上传到 GitHub。" : "画布将恢复到此工作区，不覆盖已有文件。"}</p>
      {preview ? <><p>{preview.itemCount} 个节点</p><ul>{preview.samples.map((sample, index) => <li key={index}>{sample}</li>)}</ul></> : null}
    </div>}
    {(localError || error) ? <div role="alert" className="canvas2d-workspace-error">{localError || error}</div> : null}
    <div>{selected ? <><button type="button" disabled={blocked} onClick={() => { setSelected(null); setLocalError(""); }}>{selected.action === "purge" ? "取消" : "取消恢复"}</button><button type="button" disabled={blocked} onClick={() => selected.action === "purge" ? purge() : onRestore(selected.entry)}>{selected.action === "purge" ? "确认永久删除" : "确认恢复"}</button></> : <button type="button" disabled={blocked} onClick={onClose}>关闭</button>}</div>
  </section></div>;
}
