import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFileCapabilities } from "../documentPreview/fileCapabilities.js";
const LABELS = { "pdf-images": "PDF 指定页 → 图片", "images-pdf": "图片 → 多页 PDF", "image-format": "图片格式 / 尺寸 / 压缩", "text-docx": "TXT / Markdown → Word", "text-pdf": "TXT / Markdown → PDF", "sheet-format": "CSV / XLSX 转换", "office-pdf": "Office → PDF（本地 LibreOffice）" };
function ConversionSession({ request, engine }) {
  const [sources, setSources] = useState(request.sources);
  const choices = getFileCapabilities(sources[0]?.fileName || "").conversions;
  const [operation, setOperation] = useState(choices[0] || "");
  const [options, setOptions] = useState({ format: choices[0] === "sheet-format" ? "csv" : "png", pages: "", dpi: 144, quality: 85, width: "", pageSize: "a4", landscape: false, sheet: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [inserted, setInserted] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const taskRef = useRef(""); const mounted = useRef(true); const busyRef = useRef(false);
  const rootRef = useRef(null);
  const shell = globalThis.desktopShell;
  const setOption = (key, value) => setOptions((current) => ({ ...current, [key]: value }));
  function taskError(error) {
    if (/No handler registered.*desktop-shell:file-workstation/.test(String(error?.message || ""))) {
      setServiceUnavailable(true);
      return "桌面转换服务尚未更新。请完整退出并重新启动 FreeFlow（仅刷新页面无效），然后重试。当前窗口可以正常关闭，原文件未改变。";
    }
    return error?.message || "文件任务失败";
  }
  async function cancelTask(taskId = taskRef.current) {
    if (!taskId) return;
    try { await shell?.cancelFileWorkstation?.(taskId); }
    catch (error) { if (mounted.current) setMessage(taskError(error)); }
  }
  function close() {
    if (!mounted.current) return;
    mounted.current = false;
    const taskId = taskRef.current; taskRef.current = "";
    engine.closeFileConversion();
    void cancelTask(taskId);
  }
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement; rootRef.current?.focus();
    const key = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === "Tab") {
        const buttons = Array.from(rootRef.current?.querySelectorAll("button,input,select,[tabindex='0']") || []).filter((node) => !node.disabled);
        const index = buttons.indexOf(document.activeElement);
        if (buttons.length && (event.shiftKey ? index <= 0 : index < 0 || index === buttons.length - 1)) { event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0].focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { mounted.current = false; document.removeEventListener("keydown", key, true); void cancelTask(); if (previous?.isConnected) previous.focus?.(); };
  }, []);
  async function run(capabilities = false) {
    if (busyRef.current || serviceUnavailable || !shell?.runFileWorkstation) return;
    busyRef.current = true; setBusy(true); setMessage(capabilities ? "检测本地 Office 引擎…" : "请选择输出文件夹");
    let poll;
    try {
      const directory = capabilities ? null : await shell.pickDirectory({ title: "选择转换结果文件夹" });
      if (!mounted.current || (!capabilities && (directory?.canceled || !directory?.filePath))) { if (mounted.current) setMessage("已取消选择，原文件未改变"); return; }
      const taskId = `convert-${Date.now()}-${Math.random().toString(36).slice(2)}`; taskRef.current = taskId;
      if (!capabilities) { setFiles([]); setInserted(false); }
      poll = setInterval(() => { void shell.getFileWorkstationStatus(taskId).then((status) => { if (mounted.current && taskRef.current === taskId && status.ok) setMessage(`${status.message} (${status.done}/${status.total})`); }).catch(() => {}); }, 400);
      const result = await shell.runFileWorkstation({ taskId, operation: capabilities ? "capabilities" : operation, sources: sources.map((source) => source.filePath), outputDir: directory?.filePath || "", options });
      if (!mounted.current) return;
      if (!result.ok) { setMessage(result.canceled ? "已取消，临时文件已清理" : result.error || "转换失败"); return; }
      if (capabilities) setMessage(result.office ? `可使用 ${result.engine} 转换` : result.reason);
      else { setFiles(result.files || []); setMessage(`转换完成：${result.files?.length || 0} 个文件。原文件保留，同名文件自动编号。`); }
    } catch (error) { if (mounted.current) setMessage(taskError(error)); }
    finally { clearInterval(poll); taskRef.current = ""; busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function addSources() {
    try {
      const picked = await shell?.pickWorkstationFiles?.({ multiple: true });
      if (mounted.current && picked?.files?.length) setSources((current) => [...current, ...picked.files.filter((file) => !current.some((source) => source.filePath === file.filePath))].slice(0, 24));
    } catch (error) { if (mounted.current) setMessage(error.message); }
  }
  function changeOperation(value) { setOperation(value); setOption("format", value === "sheet-format" ? "csv" : "png"); setFiles([]); setInserted(false); }
  return createPortal(<div className="file-workstation-backdrop" data-shape-include="true" onPointerDown={(event) => event.stopPropagation()}>
    <section className="file-conversion-dialog" role="dialog" aria-modal="true" aria-label="文件转换" tabIndex={-1} ref={rootRef} onKeyDown={(event) => event.stopPropagation()}>
      <header><div><strong>文件转换</strong><span>本机处理 · 原文件保留</span></div><button aria-label="关闭文件转换" onClick={close}>×</button></header>
      <div className="file-conversion-body">
        <label>转换类型<select aria-label="转换类型" value={operation} disabled={busy} onChange={(event) => changeOperation(event.target.value)}>{choices.length ? choices.map((key) => <option key={key} value={key}>{LABELS[key]}</option>) : <option value="">此文件暂无内置转换</option>}</select></label>
        <ol className="file-conversion-sources">{sources.map((source, index) => <li key={`${source.filePath}-${index}`}><span title={source.filePath}>{source.fileName}</span><button disabled={busy || index === 0} aria-label={`上移 ${source.fileName}`} onClick={() => setSources((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>↑</button><button disabled={busy || sources.length <= 1} aria-label={`移除 ${source.fileName}`} onClick={() => setSources((current) => current.filter((_, i) => i !== index))}>×</button></li>)}</ol>
        {["images-pdf", "image-format"].includes(operation) ? <button disabled={busy} onClick={() => void addSources()}>添加图片（最多 24 张）</button> : null}
        <div className="file-conversion-options">
          {operation === "pdf-images" ? <><label>页码范围<input aria-label="页码范围" placeholder="全部（最多 50 页），例：1-3,5" value={options.pages} disabled={busy} onChange={(event) => setOption("pages", event.target.value)} /></label><label>分辨率<select value={options.dpi} disabled={busy} onChange={(event) => setOption("dpi", Number(event.target.value))}><option value="96">96 DPI</option><option value="144">144 DPI</option><option value="200">200 DPI</option></select></label></> : null}
          {["pdf-images", "image-format", "sheet-format"].includes(operation) ? <label>输出格式<select aria-label="输出格式" value={options.format} disabled={busy} onChange={(event) => setOption("format", event.target.value)}>{(operation === "sheet-format" ? ["csv", "xlsx"] : operation === "image-format" ? ["png", "jpg", "webp"] : ["png", "jpg"]).map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}</select></label> : null}
          {operation === "image-format" ? <><label>最大宽度（不放大）<input aria-label="最大宽度" type="number" min="16" max="8192" placeholder="保留原尺寸" value={options.width} disabled={busy} onChange={(event) => setOption("width", event.target.value)} /></label><label>质量（JPG / WebP）<input type="number" min="30" max="100" value={options.quality} disabled={busy} onChange={(event) => setOption("quality", event.target.value)} /></label></> : null}
          {operation === "images-pdf" ? <><label>页面<select aria-label="PDF 页面尺寸" value={options.pageSize} disabled={busy} onChange={(event) => setOption("pageSize", event.target.value)}><option value="a4">A4 等比留白</option><option value="original">按图片比例</option></select></label><label>方向<select disabled={busy} value={String(options.landscape)} onChange={(event) => setOption("landscape", event.target.value === "true")}><option value="false">纵向</option><option value="true">横向</option></select></label></> : null}
          {operation === "sheet-format" && options.format === "csv" ? <label>工作表名<input aria-label="导出工作表" placeholder="留空使用第一张表" value={options.sheet} disabled={busy} onChange={(event) => setOption("sheet", event.target.value)} /></label> : null}
        </div>
        {operation === "sheet-format" ? <p className="file-conversion-note">CSV 只保留一张工作表的值；公式、样式和图片不会保留。可能触发公式的值会加单引号。CSV → XLSX 不会恢复这些信息。</p> : null}
        {["text-docx", "text-pdf"].includes(operation) ? <p className="file-conversion-note">支持 UTF-8 文本。Markdown → Word 保留标题与正文，PDF 为文字排版，代码和链接按文字保留；不加载外部图片。PDF 保留可选择的文字。</p> : null}
        {operation === "office-pdf" ? <p className="file-conversion-note">使用已安装的 LibreOffice 保留原版式；字体缺失可能影响排版。<button disabled={busy || serviceUnavailable} onClick={() => void run(true)}>检测转换引擎</button></p> : null}
        {!shell?.runFileWorkstation ? <p>转换需要桌面版。</p> : null}
        <p role="status" className="file-conversion-status">{message || "单个文件 ≤ 64 MB，总输入 ≤ 128 MB；图片逐张处理，PDF 每批最多 50 页。"}</p>
        {files.length ? <div className="file-conversion-results"><strong>已保存的结果</strong>{files.map((file) => <button key={file.filePath} onClick={() => void shell.revealPath(file.filePath)}>{file.fileName} ↗</button>)}</div> : null}
      </div>
      <footer>{busy ? <button onClick={() => { setMessage("正在取消并清理…"); void cancelTask(); }}>取消任务</button> : <button disabled={!operation || serviceUnavailable || !shell?.runFileWorkstation} onClick={() => void run()}>选择文件夹并转换</button>}{files.length ? <button disabled={busy || inserted} onClick={() => { if (engine.insertWorkstationFiles(request.id, files)) { setInserted(true); setMessage("结果已映射到画布；可撤销、预览和打开"); } }}>{inserted ? "已插入画布" : "将结果插入画布"}</button> : null}<button onClick={close}>完成</button></footer>
    </section>
  </div>, document.getElementById("global-overlay-layer") || document.body);
}
export function FileConversionDialog({ request, engine }) { return request ? <ConversionSession key={request.id} request={request} engine={engine} /> : null; }
