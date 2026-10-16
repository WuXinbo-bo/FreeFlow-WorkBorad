import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "../../../ui/icons/AppIcon.jsx";

function formatPathLabel(pathValue = "", emptyText = "未设置") {
  const value = String(pathValue || "").trim();
  if (!value) {
    return emptyText;
  }
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 2) {
    return value;
  }
  return `.../${segments.slice(-2).join("/")}`;
}

function formatTime(value) {
  const numeric = Number(value || 0);
  if (!numeric) {
    return "未知时间";
  }
  try {
    return new Date(numeric).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "未知时间";
  }
}

function formatFileSize(size) {
  const value = Number(size || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "0 KB";
  }
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function compareImages(leftItem, rightItem, sortKey) {
  const leftName = String(leftItem?.name || "");
  const rightName = String(rightItem?.name || "");
  const leftModified = Number(leftItem?.modifiedAt || 0);
  const rightModified = Number(rightItem?.modifiedAt || 0);
  const leftSize = Number(leftItem?.size || 0);
  const rightSize = Number(rightItem?.size || 0);
  if (sortKey === "name-asc") {
    return leftName.localeCompare(rightName, "zh-CN-u-kn-true", { sensitivity: "base" });
  }
  if (sortKey === "size-desc") {
    return rightSize - leftSize || rightModified - leftModified || leftName.localeCompare(rightName, "zh-CN-u-kn-true");
  }
  return rightModified - leftModified || leftName.localeCompare(rightName, "zh-CN-u-kn-true");
}

const SORT_OPTIONS = Object.freeze([
  { value: "modified-desc", label: "最近加入" },
  { value: "name-asc", label: "名称" },
  { value: "size-desc", label: "文件大小" },
]);

function ManagedImageThumbnail({ item }) {
  const rootRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { root: rootRef.current?.closest(".canvas2d-image-manager-list") });
    if (rootRef.current) observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setUrl("");
    if (!visible || item.missing || !globalThis.desktopShell?.readCanvasImageThumbnail) return undefined;
    let active = true;
    let objectUrl = "";
    void globalThis.desktopShell.readCanvasImageThumbnail(item.filePath).then((result) => {
      if (!active || !result?.ok || !result.data) return;
      objectUrl = URL.createObjectURL(new Blob([result.data], { type: "image/png" }));
      setUrl(objectUrl);
    }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visible, item.filePath, item.modifiedAt, item.missing]);
  return <span ref={rootRef} className="canvas2d-image-thumbnail" aria-hidden="true">{url ? <img src={url} alt="" /> : <AppIcon name="image" size={20} />}</span>;
}

export function CanvasImageManagerDialog({ open, bridge, snapshot, onClose }) {
  const [busyAction, setBusyAction] = useState("");
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [sortKey, setSortKey] = useState("modified-desc");
  const [selectedPath, setSelectedPath] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const rootRef = useRef(null);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const pickerRef = useRef(null);
  const sourceMenuRef = useRef(null);
  const imageManager = snapshot?.canvasImageManager || {};
  const folderPath = String(imageManager?.folderPath || snapshot?.canvasImageSavePath || "").trim();
  const items = Array.isArray(imageManager?.items) ? imageManager.items : [];
  const loading = Boolean(imageManager?.loading);
  const error = String(imageManager?.error || "").trim();
  const missingCount = Number(imageManager?.missingCount || 0) || 0;
  const sortedItems = useMemo(() => items.filter((item) => (!query || String(item.name || "").toLocaleLowerCase().includes(query.toLocaleLowerCase())) && (filter === "all" || (filter === "used" ? item.referenced : item.missing))).sort((left, right) => compareImages(left, right, sortKey)), [items, sortKey, query, filter]);
  const selectedItem = sortedItems.find((item) => String(item.filePath || "") === selectedPath) || null;
  const referencedCount = items.filter((item) => item?.referenced).length;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    generation.current += 1;
    busyRef.current = false;
    setBusyAction(""); setFeedback(""); setActionError(""); setSelectedPath(""); setQuery(""); setFilter("all");
    const session = generation.current;
    void bridge.refreshCanvasImageManager().catch((cause) => { if (session === generation.current) setActionError(cause.message); });
    rootRef.current?.querySelector("button")?.focus({ preventScroll: true });
    const key = (event) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        const details = rootRef.current?.querySelector("details[open]");
        if (details) { details.open = false; details.querySelector("summary")?.focus(); } else onClose();
      }
      if (event.key === "Tab") {
        const controls = Array.from(rootRef.current?.querySelectorAll("button,input,select,summary") || []).filter((node) => !node.disabled && node.getClientRects().length);
        const index = controls.indexOf(document.activeElement);
        if (controls.length && (event.shiftKey ? index <= 0 : index < 0 || index === controls.length - 1)) { event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0].focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { generation.current += 1; pickerRef.current?.(); document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  }, [open, bridge]);

  const runBusy = async (action, task) => {
    if (busyRef.current) return;
    const session = generation.current;
    busyRef.current = true;
    if (sourceMenuRef.current) sourceMenuRef.current.open = false;
    setBusyAction(action); setFeedback(""); setActionError("");
    try {
      const message = await task();
      if (session === generation.current && typeof message === "string") setFeedback(message);
    } catch (cause) { if (session === generation.current) setActionError(cause.message || "操作失败，请重试"); }
    finally { if (session === generation.current) { busyRef.current = false; setBusyAction(""); } }
  };
  const handleChooseFolder = () => runBusy("folder", async () => {
    if (!(await bridge.pickCanvasImageSavePath())) return;
    await bridge.refreshCanvasImageManager(); return "图片目录已更新";
  });
  const handleLocalImport = () => runBusy("local", async () => {
    const session = generation.current;
    const files = await new Promise((resolve) => {
      const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.multiple = true; input.hidden = true;
      const finish = (files) => { input.remove(); pickerRef.current = null; resolve(files); };
      pickerRef.current = () => finish([]);
      input.onchange = () => finish(Array.from(input.files || [])); input.addEventListener("cancel", () => finish([]), { once: true });
      document.body.appendChild(input); input.click();
    });
    if (!files.length || session !== generation.current) return;
    await bridge.importFiles(files); await bridge.refreshCanvasImageManager(); return `已将 ${files.length} 张图片添加到画布`;
  });
  const handleInsertSelected = () => runBusy("insert", async () => {
    if (!selectedItem?.filePath || selectedItem.missing) return;
    if (!(await bridge.insertManagedCanvasImage(selectedItem.filePath))) throw new Error("图片未能添加，请检查文件后重试");
    return "图片已添加到画布";
  });
  if (!open) return null;
  return createPortal(<div className="canvas2d-board-workspace-overlay canvas2d-image-manager-overlay" data-shape-include="true" onPointerDown={(event) => event.stopPropagation()}>
    <section ref={rootRef} className="canvas2d-board-workspace-dialog canvas2d-image-manager-dialog" role="dialog" aria-modal="true" aria-label="画布图片管理" onKeyDown={(event) => event.stopPropagation()}>
      <header className="canvas2d-image-header"><div><strong>画布图片</strong><span>{items.length} 张 · 当前画布已使用 {referencedCount} 张</span></div><button type="button" onClick={onClose} aria-label="关闭图片管理"><AppIcon name="x" size={18} /></button></header>
      <div className="canvas2d-image-folder"><span title={folderPath}>{formatPathLabel(folderPath, "请选择图片目录")}</span><details><summary className="app-icon-disclosure"><AppIcon name="chevron-right" size={14} className="app-disclosure-chevron" />目录设置</summary><div><button disabled={Boolean(busyAction)} onClick={handleChooseFolder}>更改图片目录</button><button disabled={!folderPath || Boolean(busyAction)} onClick={() => runBusy("reveal", () => bridge.revealCanvasImageSavePath())}>打开图片目录</button></div></details></div>
      <div className="canvas2d-image-manager-tools">
        <input aria-label="搜索图片" placeholder="搜索图片名称" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="图片排序" value={sortKey} onChange={(event) => setSortKey(event.target.value)}>{SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <button aria-label="刷新图片列表" disabled={loading || Boolean(busyAction)} onClick={() => runBusy("refresh", () => bridge.refreshCanvasImageManager())}><AppIcon name="refresh-cw" size={16} /></button>
        <details ref={sourceMenuRef} className="canvas2d-image-add"><summary className="app-icon-disclosure"><AppIcon name="chevron-right" size={14} className="app-disclosure-chevron" /><AppIcon name="plus" size={16} />添加图片</summary><div><span>直接添加到当前画布</span><button disabled={Boolean(busyAction)} onClick={handleLocalImport}>从本地文件添加</button><button disabled={Boolean(busyAction)} onClick={() => runBusy("clipboard", async () => (await bridge.importCanvasImagesFromClipboard()) ? "剪贴板图片已添加到画布" : "剪贴板中没有可用图片")}>从剪贴板添加</button><button disabled={Boolean(busyAction)} onClick={() => runBusy("screenshot", async () => (await bridge.captureCanvasImageToManager()) ? "截图已添加到画布" : "已取消截图")}>从系统截图添加</button></div></details>
      </div>
      <nav className="canvas2d-image-filters" aria-label="图片筛选">{[["all", "全部"], ["used", "画布已使用"], ["missing", `缺失${missingCount ? ` ${missingCount}` : ""}`]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setSelectedPath(""); }}>{label}</button>)}</nav>
      {(error || actionError || feedback) ? <div role={error || actionError ? "alert" : "status"} className={`canvas2d-image-manager-banner${error || actionError ? " is-error" : ""}`}>{error || actionError || feedback}</div> : null}
      <div className="canvas2d-image-manager-list" aria-label="图片列表">
        {loading ? <p className="canvas2d-image-empty">正在读取图片目录…</p> : sortedItems.length ? sortedItems.map((item) => <button key={item.filePath} className={`canvas2d-image-manager-item${selectedItem?.filePath === item.filePath ? " is-active" : ""}${item.missing ? " is-missing" : ""}`} aria-pressed={selectedItem?.filePath === item.filePath} onClick={() => setSelectedPath(item.filePath)} title={item.name}>
          <ManagedImageThumbnail item={item} /><strong>{item.name || "未命名图片"}</strong><small>{item.missing ? "文件缺失" : item.referenced ? `已使用 ${item.referenceCount || 1} 次` : formatFileSize(item.size)}</small>
        </button>) : <div className="canvas2d-image-empty"><strong>{query || filter !== "all" ? "没有匹配的图片" : "图片目录暂无图片"}</strong><span>{query || filter !== "all" ? "尝试其他名称或筛选条件" : "添加图片后，可以在这里查看和再次使用。"}</span></div>}
      </div>
      <footer className="canvas2d-image-footer"><div>{selectedItem ? <><span>{selectedItem.name}</span><details><summary className="app-icon-disclosure"><AppIcon name="chevron-right" size={14} className="app-disclosure-chevron" />文件详情</summary><div><span>{selectedItem.filePath}</span><span>{formatFileSize(selectedItem.size)} · {formatTime(selectedItem.modifiedAt)}</span>{selectedItem.missing ? <p>原文件已缺失，请重新添加原图后替换画布中的引用。</p> : null}</div></details></> : <span>选中图片后可添加到画布</span>}</div><button className="is-primary" onClick={handleInsertSelected} disabled={!selectedItem || Boolean(selectedItem.missing) || Boolean(busyAction)}>添加到画布</button></footer>
    </section>
  </div>, document.getElementById("global-overlay-layer") || document.body);
}
