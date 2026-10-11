"use strict";
const path = require("node:path");
const fs = require("node:fs/promises");
const { Worker } = require("node:worker_threads");
function createFileWorkstationService({ fileAccess, printDocument = null } = {}) {
  let active = null;
  function validate(payload) {
    if (!payload || !Array.isArray(payload.sources) || !payload.sources.length || payload.sources.length > 24 || payload.sources.some((source) => typeof source !== "string")) throw new Error("请选择 1–24 个源文件");
    if (!["inspect", "capabilities", "pdf-images", "images-pdf", "image-format", "text-docx", "text-pdf", "sheet-format", "office-pdf"].includes(payload.operation)) throw new Error("不支持此转换类型");
    const sources = payload.sources.map((source) => fileAccess.assert(source));
    const outputDir = ["inspect", "capabilities"].includes(payload.operation) ? "" : fileAccess.assert(payload.outputDir, { write: true });
    return { operation: payload.operation, sources, outputDir, options: payload.options && typeof payload.options === "object" ? payload.options : {} };
  }
  function cancel(owner, taskId) {
    if (!active || active.owner !== owner || active.taskId !== taskId) return { ok: false };
    active.abortController.abort();
    active.cancelled = true; Atomics.store(new Int32Array(active.cancelBuffer), 0, 1);
    active.worker?.postMessage({ cancel: true });
    if (active.forceFinish) { clearTimeout(active.timer); active.timer = setTimeout(() => active?.forceFinish?.({ ok: false, canceled: true }), 3000); }
    if (active.childPid) { try { process.kill(active.childPid); } catch { /* child may already be closed */ } }
    return { ok: true };
  }
  async function run(owner, payload) {
    if (active) return { ok: false, error: "文件任务正在运行，请等待完成或先取消" };
    const taskId = String(payload?.taskId || "");
    if (!/^[\w-]{1,100}$/.test(taskId)) return { ok: false, error: "任务 ID 无效" };
    const task = { owner, taskId, abortController: new AbortController(), cancelled: false, cancelBuffer: new SharedArrayBuffer(4), progress: { done: 0, total: 1, message: "准备文件任务" }, worker: null, childPid: null, published: [], timer: null };
    // Reserve synchronously: cancel/window destruction during directory validation must work too.
    active = task;
    const cleanupOwner = () => cancel(owner, taskId);
    owner?.once?.("destroyed", cleanupOwner);
    let spec;
    try {
      spec = validate(payload);
      if (spec.outputDir && !(await fs.stat(spec.outputDir)).isDirectory()) throw new Error("输出目录不存在");
      spec.staging = spec.outputDir ? await fs.mkdtemp(path.join(spec.outputDir, ".freeflow-convert-")) : "";
      if (task.cancelled) throw new Error("转换已取消");
      spec.cancelBuffer = task.cancelBuffer;
      task.worker = new Worker(path.join(__dirname, "fileWorkstationWorker.js"), { workerData: spec, resourceLimits: { maxOldGenerationSizeMb: 384 } });
    } catch (error) {
      owner?.removeListener?.("destroyed", cleanupOwner);
      if (spec?.staging) await fs.rm(spec.staging, { recursive: true, force: true });
      if (active === task) active = null;
      return task.cancelled ? { ok: false, canceled: true } : { ok: false, error: error.message };
    }
    return new Promise((resolve) => {
      let finished = false;
      async function finish(result) {
        if (finished) return; finished = true;
        clearTimeout(task.timer); task.abortController.abort();
        if (task.childPid) { try { process.kill(task.childPid); } catch { /* process already exited */ } }
        await task.worker.terminate();
        if (!result.ok || task.cancelled) await Promise.all(task.published.map((file) => fs.unlink(file).catch(() => {})));
        if (spec.staging) await fs.rm(spec.staging, { recursive: true, force: true }).catch(() => {});
        owner?.removeListener?.("destroyed", cleanupOwner);
        if (active === task) active = null;
        resolve(task.cancelled ? { ok: false, canceled: true } : result);
      }
      task.forceFinish = finish;
      task.worker.on("message", (message) => {
        if (message.printHtml) {
          const print = printDocument && !task.cancelled ? printDocument(message.printHtml, task.abortController.signal) : Promise.reject(new Error("文字 PDF 需要桌面打印服务"));
          void Promise.resolve(print).then((data) => { if (!finished) task.worker.postMessage({ printResult: { data } }); }, (error) => { if (!finished) task.worker.postMessage({ printResult: { error: error.message } }); });
        }
        if (message.published) task.published.push(message.published);
        if (Object.hasOwn(message, "childPid")) task.childPid = message.childPid;
        if (message.progress) task.progress = message.progress;
        if (message.result) void finish({ ok: true, ...message.result });
        if (message.error) void finish({ ok: false, error: message.error });
      });
      task.worker.on("error", (error) => void finish({ ok: false, error: error.message }));
      task.worker.on("exit", (code) => void finish({ ok: false, error: `文件任务意外结束 (${code})` }));
      task.timer = setTimeout(() => {
        cancel(owner, taskId);
        // CPU parsers may not yield; shared cancellation covers checkpoints, then force cleanup.
        task.timer = setTimeout(() => void finish({ ok: false, canceled: true }), 5000);
      }, 180000);
    });
  }
  return { run, cancel, status(owner, taskId) { return active?.owner === owner && active.taskId === taskId ? { ok: true, ...active.progress } : { ok: false }; }, dispose() { if (active) cancel(active.owner, active.taskId); } };
}
module.exports = { createFileWorkstationService };
