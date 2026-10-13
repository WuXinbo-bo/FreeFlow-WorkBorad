import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getFileCapabilities } from "../documentPreview/fileCapabilities.js";

const LABELS = { "pdf-images": "图片", "images-pdf": "PDF", "image-format": "图片", "text-docx": "Word（DOCX）", "text-pdf": "PDF", "sheet-format": "表格", "office-pdf": "PDF" };
const FORMATS = { png: "PNG · 清晰，支持透明", jpg: "JPG · 体积较小，无透明背景", webp: "WebP · 体积较小", csv: "CSV · 单张工作表", xlsx: "Excel（XLSX）" };
let lastChosenOutputDir = "";

function ConversionSession({ request, engine }) {
  const [sources, setSources] = useState(request.sources);
  const choices = sources.length
    ? getFileCapabilities(sources[0]?.fileName || "").conversions.filter((choice) =>
        sources.every((source) => getFileCapabilities(source.fileName || "").conversions.includes(choice))
      )
    : [];
  const [operation, setOperation] = useState(choices[0] || "");
  const [options, setOptions] = useState({ format: choices[0] === "sheet-format" ? "csv" : "png", pages: "", dpi: 144, quality: 85, width: "", pageSize: "a4", landscape: false, sheet: "" });
  const [outputDir, setOutputDir] = useState(lastChosenOutputDir);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [files, setFiles] = useState([]);
  const [inserted, setInserted] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [office, setOffice] = useState(null);
  const [checkRevision, setCheckRevision] = useState(0);
  const taskRef = useRef(""); const officeTaskRef = useRef(""); const mounted = useRef(true); const busyRef = useRef(false); const pollRef = useRef(null);
  const rootRef = useRef(null);
  const shell = globalThis.desktopShell;
  const choicesKey = choices.join("|");
  function resetResults() { setFiles([]); setInserted(false); setMessage(""); setFailed(false); }
  function setOption(key, value) { setOptions((current) => ({ ...current, [key]: value })); resetResults(); }
  function taskError(error) {
    if (/No handler registered.*desktop-shell:file-workstation/.test(String(error?.message || ""))) {
      setServiceUnavailable(true);
      return "桌面转换服务尚未更新。请完整退出并重新启动 FreeFlow，然后重试。原文件未改变。";
    }
    return error?.message || "转换失败，请重试";
  }
  async function cancelTask(taskId = taskRef.current) {
    if (!taskId) return;
    try { await shell?.cancelFileWorkstation?.(taskId); }
    catch (error) { if (mounted.current) { setFailed(true); setMessage(taskError(error)); } }
  }
  function close() {
    if (!mounted.current) return;
    mounted.current = false;
    clearInterval(pollRef.current);
    const taskId = taskRef.current; taskRef.current = "";
    engine.closeFileConversion();
    void cancelTask(taskId);
    void cancelTask(officeTaskRef.current);
  }
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    rootRef.current?.querySelector("button")?.focus({ preventScroll: true });
    const key = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === "Tab") {
        const controls = Array.from(rootRef.current?.querySelectorAll("button,input,select,summary,[tabindex='0']") || []).filter((node) => !node.disabled && node.getClientRects().length);
        const index = controls.indexOf(document.activeElement);
        if (controls.length && (event.shiftKey ? index <= 0 : index < 0 || index === controls.length - 1)) { event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0].focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { mounted.current = false; clearInterval(pollRef.current); document.removeEventListener("keydown", key, true); void cancelTask(); void cancelTask(officeTaskRef.current); if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    if (choices.includes(operation)) return;
    const nextOperation = choices[0] || "";
    setOperation(nextOperation);
    setOptions((current) => ({ ...current, format: nextOperation === "sheet-format" ? "csv" : "png" }));
    resetResults();
  }, [choicesKey]);
  useEffect(() => {
    if (operation !== "office-pdf" || !shell?.runFileWorkstation || serviceUnavailable) return undefined;
    let active = true;
    const taskId = `office-check-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    officeTaskRef.current = taskId;
    setOffice(null);
    void shell.runFileWorkstation({ taskId, operation: "capabilities", sources: sources.map((source) => source.filePath) }).then((result) => {
      if (!active || !mounted.current) return;
      setOffice(result?.ok ? result : { office: false, reason: result?.error || "无法检查转换工具" });
    }).catch((error) => { if (active && mounted.current) { setOffice({ office: false, reason: taskError(error) }); } }).finally(() => { if (officeTaskRef.current === taskId) officeTaskRef.current = ""; });
    return () => { active = false; void cancelTask(taskId); };
  }, [operation, checkRevision, serviceUnavailable]);
  async function chooseDirectory() {
    const directory = await shell.pickDirectory({ title: "选择转换结果文件夹" });
    if (!mounted.current || directory?.canceled || !directory?.filePath) return "";
    setOutputDir(directory.filePath);
    lastChosenOutputDir = directory.filePath;
    return directory.filePath;
  }
  async function changeDirectory() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await chooseDirectory(); }
    catch (error) { if (mounted.current) { setFailed(true); setMessage(taskError(error)); } }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function run() {
    if (busyRef.current || serviceUnavailable || !shell?.runFileWorkstation) return;
    busyRef.current = true; setBusy(true); setFailed(false); setMessage(outputDir ? "正在转换…" : "请选择保存位置");
    let poll;
    try {
      const directory = outputDir || await chooseDirectory();
      if (!mounted.current || !directory) { if (mounted.current) setMessage("已取消选择，原文件未改变"); return; }
      const taskId = `convert-${Date.now()}-${Math.random().toString(36).slice(2)}`; taskRef.current = taskId;
      setFiles([]); setInserted(false); setMessage("正在转换…");
      poll = pollRef.current = setInterval(() => { void shell.getFileWorkstationStatus(taskId).then((status) => { if (mounted.current && taskRef.current === taskId && status.ok) setMessage(`${status.message} (${status.done}/${status.total})`); }).catch(() => {}); }, 400);
      const result = await shell.runFileWorkstation({ taskId, operation, sources: sources.map((source) => source.filePath), outputDir: directory, options });
      if (!mounted.current) return;
      if (!result.ok) { setFailed(!result.canceled); setMessage(result.canceled ? "已取消，临时文件已清理" : result.error || "转换失败，请重试"); return; }
      setFiles(result.files || []); setMessage(`已保存 ${result.files?.length || 0} 个文件`);
    } catch (error) { if (mounted.current) { setFailed(true); setMessage(taskError(error)); } }
    finally { clearInterval(poll); taskRef.current = ""; busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function addSources() {
    try {
      const picked = await shell?.pickWorkstationFiles?.({ multiple: true });
      if (mounted.current && picked?.files?.length) { setSources((current) => [...current, ...picked.files.filter((file) => getFileCapabilities(file.fileName).conversions.includes(operation) && !current.some((source) => source.filePath === file.filePath))].slice(0, 24)); resetResults(); }
    } catch (error) { if (mounted.current) { setFailed(true); setMessage(error.message); } }
  }
  function changeOperation(value) {
    if (!choices.includes(value)) return;
    setOperation(value);
    setOptions((current) => ({ ...current, format: value === "sheet-format" ? "csv" : "png" }));
    resetResults();
  }
  const canRun = operation && !serviceUnavailable && shell?.runFileWorkstation && (operation !== "office-pdf" || office?.office);
  return createPortal(<div className="file-workstation-backdrop" data-shape-include="true" onPointerDown={(event) => event.stopPropagation()}>
    <section className="file-conversion-dialog" role="dialog" aria-modal="true" aria-label="文件转换" tabIndex={-1} ref={rootRef} onKeyDown={(event) => event.stopPropagation()}>
      <header><strong>转换文件</strong><button aria-label="关闭文件转换" onClick={close}>×</button></header>
      <div className="file-conversion-body">
        <ol className="file-conversion-sources">{sources.map((source, index) => <li key={`${source.filePath}-${index}`}><span className="file-conversion-file-type" aria-hidden="true">{String(source.fileName || "").split(".").pop().toUpperCase()}</span><span title={source.filePath}>{source.fileName}</span>{sources.length > 1 ? <>{operation === "images-pdf" ? <button disabled={busy || index === 0} aria-label={`上移 ${source.fileName}`} onClick={() => { setSources((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; }); resetResults(); }}>↑</button> : null}<button disabled={busy} aria-label={`移除 ${source.fileName}`} onClick={() => { setSources((current) => current.filter((_, i) => i !== index)); resetResults(); }}>×</button></> : null}</li>)}</ol>
        {["images-pdf", "image-format"].includes(operation) ? <button className="file-conversion-add" disabled={busy || sources.length >= 24} onClick={() => void addSources()}>添加图片</button> : null}
        <div className="file-conversion-target"><span>转换为</span>{choices.length > 1 ? <select aria-label="转换为" value={operation} disabled={busy} onChange={(event) => changeOperation(event.target.value)}>{choices.map((key) => <option key={key} value={key}>{LABELS[key]}</option>)}</select> : <strong>{LABELS[operation] || "此文件暂无共同转换方式"}</strong>}</div>
        <div className="file-conversion-options">
          {operation === "pdf-images" ? <label>页码范围<input aria-label="页码范围" placeholder="全部（最多 50 页），例：1-3,5" value={options.pages} disabled={busy} onChange={(event) => setOption("pages", event.target.value)} /></label> : null}
          {["pdf-images", "image-format", "sheet-format"].includes(operation) ? <label>格式<select aria-label="输出格式" value={options.format} disabled={busy} onChange={(event) => setOption("format", event.target.value)}>{(operation === "sheet-format" ? ["csv", "xlsx"] : operation === "image-format" ? ["png", "jpg", "webp"] : ["png", "jpg"]).map((format) => <option key={format} value={format}>{FORMATS[format]}</option>)}</select></label> : null}
          {operation === "sheet-format" && options.format === "csv" ? <label>工作表<input aria-label="导出工作表" placeholder="默认第一张工作表" value={options.sheet} disabled={busy} onChange={(event) => setOption("sheet", event.target.value)} /></label> : null}
        </div>
        <div className="file-conversion-destination"><span>保存到</span><span title={outputDir}>{outputDir ? outputDir.replace(/\\/g, "/").split("/").filter(Boolean).slice(-2).join("/") : "开始时选择文件夹"}</span><button disabled={busy || !shell?.pickDirectory} onClick={() => void changeDirectory()}>{outputDir ? "更改" : "选择"}</button></div>
        <details className="file-conversion-advanced"><summary>更多选项与说明</summary><div className="file-conversion-options">
          {operation === "pdf-images" ? <label>图片清晰度<select aria-label="图片清晰度" value={options.dpi} disabled={busy} onChange={(event) => setOption("dpi", Number(event.target.value))}><option value="96">标准（96 DPI）</option><option value="144">清晰（144 DPI）</option><option value="200">高清（200 DPI）</option></select></label> : null}
          {operation === "image-format" ? <><label>最大宽度（不放大）<input aria-label="最大宽度" type="number" min="16" max="8192" placeholder="保留原尺寸" value={options.width} disabled={busy} onChange={(event) => setOption("width", event.target.value)} /></label>{options.format !== "png" ? <label>图片质量<input aria-label="图片质量" type="number" min="30" max="100" value={options.quality} disabled={busy} onChange={(event) => setOption("quality", event.target.value)} /></label> : null}</> : null}
          {operation === "images-pdf" ? <><label>页面尺寸<select aria-label="PDF 页面尺寸" value={options.pageSize} disabled={busy} onChange={(event) => setOption("pageSize", event.target.value)}><option value="a4">A4 等比留白</option><option value="original">按图片比例</option></select></label><label>方向<select aria-label="页面方向" disabled={busy} value={String(options.landscape)} onChange={(event) => setOption("landscape", event.target.value === "true")}><option value="false">纵向</option><option value="true">横向</option></select></label></> : null}
        </div>
          {operation === "office-pdf" ? <p className="file-conversion-note">使用本机 LibreOffice 转换，字体缺失可能影响排版。</p> : null}
          {["text-docx", "text-pdf"].includes(operation) ? <p className="file-conversion-note">支持 UTF-8 文本；保留标题和正文，代码与链接按文字处理，不加载外部图片。</p> : null}
          <p className="file-conversion-note">单个文件最多 64 MB，总输入最多 128 MB。{["images-pdf", "image-format"].includes(operation) ? "每批最多 24 张图片。" : operation === "pdf-images" ? "每批最多 50 页。" : ""}同名结果自动编号，原文件不会被覆盖。</p>
        </details>
        {operation === "sheet-format" ? <p className="file-conversion-note">CSV 只保留一张工作表的值，不保留公式、样式或图片；转换为 Excel 也无法恢复这些内容。</p> : null}
        {operation === "office-pdf" && !serviceUnavailable ? <div className="file-conversion-engine" role="status">{office === null ? "正在检查本机转换工具…" : office.office ? "本机转换工具可用" : <><span>需要安装或检查 LibreOffice。{office.reason}</span><button disabled={busy} onClick={() => setCheckRevision((value) => value + 1)}>重新检查</button></>}</div> : null}
        {!shell?.runFileWorkstation ? <p className="file-conversion-note">请使用桌面版转换文件。</p> : null}
        {message || serviceUnavailable ? <p role={failed ? "alert" : "status"} className={`file-conversion-status${failed ? " is-error" : ""}`}>{message || office?.reason}</p> : null}
        {files.length ? <div className="file-conversion-results"><strong>转换结果</strong>{files.map((file) => <button key={file.filePath} onClick={() => void shell.revealPath(file.filePath).catch((error) => { setFailed(true); setMessage(error.message); })}>{file.fileName} ↗</button>)}</div> : null}
      </div>
      <footer><span>本机处理 · 保留原文件</span><div>{busy ? <button onClick={() => { setMessage("正在取消并清理…"); void cancelTask(); }}>取消任务</button> : files.length ? <><button onClick={() => void shell.revealPath(files[0].filePath).catch((error) => { setFailed(true); setMessage(error.message); })}>打开文件夹</button><button className="is-primary" disabled={inserted || inserting} onClick={() => { setInserting(true); try { if (engine.insertWorkstationFiles(request.id, files)) { setInserted(true); setMessage("已添加到画布，可撤销"); } } finally { setInserting(false); } }}>{inserted ? "已添加到画布" : inserting ? "正在添加…" : "添加到画布"}</button>{inserted ? <button onClick={() => engine.locateWorkstationResults(request.id)}>定位结果</button> : null}</> : <button className="is-primary" disabled={!canRun} onClick={() => void run()}>{failed ? "重试转换" : "开始转换"}</button>}</div></footer>
    </section>
  </div>, document.getElementById("global-overlay-layer") || document.body);
}
export function FileConversionDialog({ request, engine }) { return request ? <ConversionSession key={request.id} request={request} engine={engine} /> : null; }
