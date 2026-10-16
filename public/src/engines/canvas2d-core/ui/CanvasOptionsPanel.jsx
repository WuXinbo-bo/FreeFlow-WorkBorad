import React, { useEffect, useId, useRef, useState } from "react";
import { version as appVersion } from "../../../../../package.json";
import { AppIcon } from "../../../ui/icons/AppIcon.jsx";

const SNAP_OPTIONS = [
  { value: 6, label: "紧凑" },
  { value: 8, label: "标准" },
  { value: 10, label: "宽松" },
  { value: 12, label: "更宽松" },
];
const BACKGROUNDS = [
  { value: "none", label: "无背景" },
  { value: "dots", label: "点阵" },
  { value: "grid", label: "方格" },
  { value: "lines", label: "横线" },
  { value: "engineering", label: "工程网格" },
];

function Toggle({ label, description, checked, disabled, onChange }) {
  return (
    <button type="button" className="canvas-options-toggle" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}>
      <span className="canvas-options-copy"><strong>{label}</strong>{description ? <small>{description}</small> : null}</span>
      <span className="canvas-options-switch" aria-hidden="true"><span /></span>
    </button>
  );
}

function saveStatus(snapshot) {
  if (snapshot?.boardSaveError) return `保存失败：${snapshot.boardSaveError}`;
  if (snapshot?.boardDirty || snapshot?.editingId) return "有修改尚未保存到本机";
  const savedAt = Number(snapshot?.boardLastSavedAt || snapshot?.boardAutosaveAt);
  if (savedAt > 0 && Number.isFinite(new Date(savedAt).getTime())) {
    return `已保存到本机 · ${new Date(savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return snapshot?.boardFilePath ? "已保存到本机" : "尚未保存为文件";
}

export function CanvasOptionsPanel({ bridge, snapshot, onClose, onOpenImages, onOpenTutorial, onOpenUpdates }) {
  const [tab, setTab] = useState("canvas");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef(null);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  const id = useId();
  const snap = snapshot?.alignmentSnapConfig || {};
  const snapping = snap.enabled !== false;
  const autosave = snapshot?.boardAutosaveEnabled !== false;
  const background = String(snapshot?.board?.preferences?.backgroundPattern || "dots");

  useEffect(() => {
    aliveRef.current = true;
    rootRef.current?.querySelector('[role="tab"]')?.focus({ preventScroll: true });
    return () => { aliveRef.current = false; };
  }, []);

  async function change(task) {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    setError("");
    try {
      const result = await task();
      if (result?.ok === false) throw new Error(result.message || result.error || "设置未能应用，请重试");
    } catch (failure) {
      if (aliveRef.current) setError(failure?.message || "设置未能应用，请重试");
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setPending(false);
    }
  }

  function selectTab(next) {
    setTab(next);
    setError("");
  }

  function tabKey(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "canvas" : event.key === "End" ? "help" : tab === "canvas" ? "help" : "canvas";
    selectTab(next);
    rootRef.current?.querySelector(`[data-options-tab="${next}"]`)?.focus({ preventScroll: true });
  }

  return (
    <div className="canvas-options-content" ref={rootRef}>
      <header className="canvas-options-header">
        <strong>画布选项与帮助</strong>
        <button type="button" className="canvas-options-close" aria-label="关闭画布选项与帮助" onClick={onClose}><AppIcon name="x" size={16} /></button>
      </header>
      <div className="canvas-options-tabs" role="tablist" aria-label="画布选项分类" onKeyDown={tabKey}>
        {[{ key: "canvas", label: "画布" }, { key: "help", label: "帮助" }].map((item) => (
          <button key={item.key} type="button" role="tab" id={`${id}-${item.key}-tab`} aria-selected={tab === item.key} aria-controls={`${id}-${item.key}-panel`} tabIndex={tab === item.key ? 0 : -1} data-options-tab={item.key} onClick={() => selectTab(item.key)}>{item.label}</button>
        ))}
      </div>
      <div className="canvas-options-body" role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}-tab`} tabIndex={0} aria-busy={pending} key={tab}>
        {tab === "canvas" ? <>
          <section className="canvas-options-section">
            <button type="button" className="canvas-options-action" onClick={onOpenImages}>
              <AppIcon name="image" size={18} /><span className="canvas-options-copy"><strong>画布图片管理</strong><small>查看、导入与整理图片</small></span><AppIcon name="chevron-right" size={15} />
            </button>
          </section>
          <section className="canvas-options-section">
            <Toggle label="自动保存" description="每 30 秒保存到本机" checked={autosave} disabled={pending} onChange={() => change(() => bridge.toggleAutosave())} />
            <p className={`canvas-options-save-state${snapshot?.boardSaveError ? " is-error" : ""}`} role="status">{saveStatus(snapshot)}</p>
          </section>
          <section className="canvas-options-section">
            <Toggle label="对齐与吸附" description="拖动时，靠近边缘或中心自动吸附" checked={snapping} disabled={pending} onChange={() => change(() => bridge.setAlignmentSnapEnabled(!snapping))} />
            <div className="canvas-options-segments" role="group" aria-label="吸附范围">
              {SNAP_OPTIONS.map((option) => <button type="button" key={option.value} aria-pressed={Number(snap.thresholdPx || 8) === option.value} title={`${option.value} 像素`} disabled={!snapping || pending} onClick={() => change(() => bridge.setAlignmentSnapConfig({ thresholdPx: option.value }))}>{option.label}</button>)}
            </div>
            <Toggle label="显示参考线" checked={snap.showGuides !== false} disabled={!snapping || pending} onChange={() => change(() => bridge.setAlignmentSnapConfig({ showGuides: snap.showGuides === false }))} />
          </section>
          <section className="canvas-options-section">
            <h3>画布背景</h3>
            <div className="canvas-options-backgrounds" role="group" aria-label="画布背景">
              {BACKGROUNDS.map((option) => <button type="button" key={option.value} aria-pressed={background === option.value} disabled={pending} onClick={() => change(() => bridge.setBoardBackgroundPattern(option.value))}><span className={`canvas-options-background-preview is-${option.value}`} aria-hidden="true" /><span>{option.label}</span></button>)}
            </div>
          </section>
        </> : <>
          <section className="canvas-options-section">
            <button type="button" className="canvas-options-action" data-tutorial-target="tutorial-entry" onClick={onOpenTutorial}><AppIcon name="book-open" size={18} /><span className="canvas-options-copy"><strong>使用指南</strong><small>操作教程、快捷键与欢迎演示</small></span><AppIcon name="chevron-right" size={15} /></button>
          </section>
          <section className="canvas-options-section">
            <button type="button" className="canvas-options-action" disabled={!onOpenUpdates} onClick={onOpenUpdates}><AppIcon name="refresh-cw" size={18} /><span className="canvas-options-copy"><strong>应用更新</strong><small>{onOpenUpdates ? "前往设置检查新版本" : "请在 FreeFlow 主窗口中检查更新"}</small></span><AppIcon name="chevron-right" size={15} /></button>
          </section>
          <section className="canvas-options-section canvas-options-about">
            <h3>关于 FreeFlow</h3>
            <dl><div><dt>版本</dt><dd>v{appVersion}</dd></div><div><dt>作者</dt><dd>Wu Xinbo</dd></div><div><dt>联系</dt><dd><a href="mailto:1806598228@qq.com" target="_blank" rel="noreferrer">1806598228@qq.com</a></dd></div></dl>
            <a href="https://github.com/WuXinbo-bo/FreeFlow-WorkBorad" target="_blank" rel="noreferrer">GitHub 项目 <AppIcon name="arrow-up-right" size={13} /></a>
            <small>Copyright © 2026 WuXinbo. All rights reserved.</small>
          </section>
        </>}
        {error ? <p className="canvas-options-error" role="alert">{error}</p> : null}
      </div>
      <div hidden role="tabpanel" id={`${id}-${tab === "canvas" ? "help" : "canvas"}-panel`} aria-labelledby={`${id}-${tab === "canvas" ? "help" : "canvas"}-tab`} />
    </div>
  );
}
