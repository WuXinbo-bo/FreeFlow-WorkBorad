"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { createRequire } = require("node:module");
const { assertArchiveBudget } = require("./filePreviewLimits");
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_PIXELS = 16000000;
let cancelled = false;
let child = null;
parentPort.on("message", (message) => { if (message.cancel) { cancelled = true; child?.kill(); } });
function check() { if (cancelled || Atomics.load(new Int32Array(workerData.cancelBuffer), 0)) throw new Error("转换已取消"); }
function progress(done, total, message) { check(); parentPort.postMessage({ progress: { done, total, message } }); }
async function readBounded(filePath) {
  check();
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("文件超过 64 MB 或不是普通文件，请使用系统应用打开");
    await assertArchiveBudget(filePath);
    const data = await handle.readFile();
    const after = await handle.stat();
    if (data.length > MAX_BYTES || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs) throw new Error("文件在读取时发生变化，请重试");
    return data;
  } finally { await handle.close(); }
}
function number(value, fallback, min, max) { return Math.min(max, Math.max(min, Number(value) || fallback)); }
function parsePages(value, count) {
  if (!String(value || "").trim()) {
    if (count > 50) throw new Error("一次最多转换 50 页，请填写页码范围");
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  const pages = new Set();
  for (const part of String(value).split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("页码格式应为 1-3,5");
    const first = Number(match[1]); const last = Number(match[2] || first);
    if (first < 1 || last > count || last < first || last - first >= 50) throw new Error("页码超出范围或超过 50 页");
    for (let i = first; i <= last; i++) { pages.add(i); if (pages.size > 50) throw new Error("一次最多转换 50 页"); }
  }
  return [...pages].sort((a, b) => a - b);
}
async function pdfRuntime() {
  const localRequire = createRequire(require.resolve("pdf-parse"));
  const canvas = localRequire("@napi-rs/canvas");
  for (const key of ["DOMMatrix", "ImageData", "Path2D"]) globalThis[key] ||= canvas[key];
  const pdfjs = await import(pathToFileURL(localRequire.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
  return { canvas, pdfjs };
}
async function inspect(source) {
  const buffer = await readBounded(source);
  const ext = path.extname(source).toLowerCase();
  if ([".xlsx", ".csv", ".tsv"].includes(ext)) {
    const XLSX = require("xlsx");
    const book = XLSX.read(buffer, { type: "buffer", cellFormula: false, sheetRows: 501 });
    return { kind: "table", sheets: book.SheetNames.slice(0, 12).map((name) => {
      const rows = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: "", raw: false }).slice(0, 501).map((row) => row.slice(0, 40).map((cell) => String(cell).slice(0, 256)));
      const range = book.Sheets[name]["!fullref"] || book.Sheets[name]["!ref"] || "A1";
      const bounds = XLSX.utils.decode_range(range);
      return { name, rows: rows.slice(0, 500), truncated: bounds.e.r >= 500 || bounds.e.c >= 40 };
    }) };
  }
  if (buffer.includes(0)) throw new Error("此文件不是 UTF-8 文本，请用系统应用打开");
  return { kind: "text", text: buffer.toString("utf8").slice(0, 200000), truncated: buffer.length > 200000 };
}
function officeCandidates() {
  return process.platform === "darwin" ? ["/Applications/LibreOffice.app/Contents/MacOS/soffice", "soffice"] : process.platform === "win32" ? [path.join(process.env.ProgramFiles || "C:\\Program Files", "LibreOffice/program/soffice.exe"), "soffice.exe"] : ["libreoffice", "soffice"];
}
async function runOffice(command, args, timeout = 90000) {
  check();
  return new Promise((resolve, reject) => {
    child = spawn(command, args, { windowsHide: true, stdio: "ignore" });
    parentPort.postMessage({ childPid: child.pid });
    const timer = setTimeout(() => { child?.kill(); reject(new Error("Office 转换超时")); }, timeout);
    child.on("error", (error) => { clearTimeout(timer); child = null; parentPort.postMessage({ childPid: null }); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); child = null; parentPort.postMessage({ childPid: null }); cancelled ? reject(new Error("转换已取消")) : code === 0 ? resolve() : reject(new Error("本地 Office 转换失败")); });
  });
}
async function main() {
  const { operation, sources, outputDir, options = {} } = workerData;
  if (operation === "inspect") return inspect(sources[0]);
  if (operation === "capabilities") {
    for (const executable of officeCandidates()) { try { await runOffice(executable, ["--version"], 5000); return { office: true, engine: "LibreOffice" }; } catch { check(); } }
    return { office: false, engine: "", reason: "未检测到 LibreOffice；安装后可保留原文档版式转换 PDF" };
  }
  const supported = { "pdf-images": [".pdf"], "images-pdf": [".png", ".jpg", ".jpeg", ".webp"], "image-format": [".png", ".jpg", ".jpeg", ".webp"], "text-docx": [".txt", ".md", ".markdown"], "text-pdf": [".txt", ".md", ".markdown"], "sheet-format": [".csv", ".tsv", ".xlsx"], "office-pdf": [".docx", ".xlsx", ".pptx"] };
  if (!supported[operation] || sources.some((source) => !supported[operation].includes(path.extname(source).toLowerCase()))) throw new Error("源文件格式与转换类型不匹配");
  if (!["images-pdf", "image-format"].includes(operation) && sources.length !== 1) throw new Error("此转换一次只处理一个源文件");
  let totalBytes = 0;
  for (const source of sources) { const stat = await fs.stat(source); if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("单个文件不能超过 64 MB"); totalBytes += stat.size; }
  if (totalBytes > MAX_BYTES * 2) throw new Error("本次输入总量不能超过 128 MB");
  const staging = workerData.staging;
  const produced = [];
  const published = [];
  let outputBytes = 0;
  async function save(name, buffer) {
    check(); outputBytes += buffer.length;
    if (outputBytes > MAX_BYTES * 4) throw new Error("输出超过 256 MB，请分批转换或降低分辨率");
    const safeName = path.basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    const filePath = path.join(staging, safeName);
    await fs.writeFile(filePath, buffer, { flag: "wx" }); produced.push({ name: safeName, path: filePath, size: buffer.length });
  }
  const base = path.basename(sources[0], path.extname(sources[0]));
  try {
    const sharp = require("sharp"); sharp.cache(false); sharp.concurrency(1);
    if (operation === "pdf-images") {
      const { canvas: nativeCanvas, pdfjs } = await pdfRuntime();
      const pdfRoot = path.dirname(createRequire(require.resolve("pdf-parse")).resolve("pdfjs-dist/package.json"));
      const task = pdfjs.getDocument({ data: new Uint8Array(await readBounded(sources[0])), isEvalSupported: false, useSystemFonts: true, standardFontDataUrl: path.join(pdfRoot, "standard_fonts/") });
      const pdf = await task.promise;
      try {
        const pages = parsePages(options.pages, pdf.numPages);
        for (const [index, pageNumber] of pages.entries()) {
          progress(index, pages.length, `正在转换第 ${pageNumber} 页`);
          const page = await pdf.getPage(pageNumber);
          let viewport = page.getViewport({ scale: number(options.dpi, 144, 72, 200) / 72 });
          if (viewport.width * viewport.height > MAX_PIXELS) viewport = page.getViewport({ scale: viewport.scale * Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)) });
          const target = nativeCanvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvasContext: target.getContext("2d"), canvas: target, viewport }).promise;
          const png = await target.encode("png"); target.width = 1; target.height = 1;
          const format = options.format === "jpg" ? "jpg" : "png";
          const buffer = format === "jpg" ? await sharp(png).flatten({ background: "#fff" }).jpeg({ quality: 88 }).toBuffer() : png;
          await save(`${base}-page-${String(pageNumber).padStart(3, "0")}.${format}`, buffer); page.cleanup();
        }
      } finally { await task.destroy(); }
    } else if (operation === "image-format") {
      const format = ["png", "jpg", "webp"].includes(options.format) ? options.format : "png";
      for (const [index, source] of sources.entries()) {
        progress(index, sources.length, "正在转换图片");
        let image = sharp(await readBounded(source), { limitInputPixels: MAX_PIXELS }).rotate();
        if (options.width) image = image.resize({ width: number(options.width, 1600, 16, 8192), withoutEnlargement: true });
        if (format === "jpg") image = image.flatten({ background: "#fff" });
        const buffer = await image.toFormat(format === "jpg" ? "jpeg" : format, { quality: number(options.quality, 85, 30, 100) }).toBuffer();
        await save(`${path.basename(source, path.extname(source))}-${index + 1}-converted.${format}`, buffer);
      }
    } else if (operation === "images-pdf") {
      const { PDFDocument } = require("pdf-lib"); const pdf = await PDFDocument.create();
      for (const [index, source] of sources.entries()) {
        progress(index, sources.length, `正在合并第 ${index + 1} 张图片`);
        const buffer = await sharp(await readBounded(source), { limitInputPixels: MAX_PIXELS }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).flatten({ background: "#fff" }).jpeg({ quality: 90 }).toBuffer();
        const image = await pdf.embedJpg(buffer);
        const size = options.pageSize === "original" ? [image.width, image.height] : options.landscape ? [842, 595] : [595, 842];
        const page = pdf.addPage(size); const margin = options.pageSize === "original" ? 0 : 24;
        const scale = Math.min((size[0] - margin * 2) / image.width, (size[1] - margin * 2) / image.height);
        page.drawImage(image, { x: (size[0] - image.width * scale) / 2, y: (size[1] - image.height * scale) / 2, width: image.width * scale, height: image.height * scale });
      }
      await save(`${base}-images.pdf`, Buffer.from(await pdf.save()));
    } else if (operation === "text-docx" || operation === "text-pdf") {
      const buffer = await readBounded(sources[0]);
      if (buffer.length > 2 * 1024 * 1024 || buffer.includes(0)) throw new Error("文本转换支持 2 MB 以内的 UTF-8 文本");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      // Markdown exports preserve readable text/headings; they do not execute HTML or remote resources.
      const { Document, Packer, Paragraph, HeadingLevel } = operation === "text-docx" ? require("docx") : {};
      const paragraphs = operation === "text-docx" ? text.split(/\r?\n/).map((line) => { const heading = path.extname(sources[0]) !== ".txt" && line.match(/^(#{1,6})\s+(.+)$/); return new Paragraph(heading ? { text: heading[2], heading: HeadingLevel[`HEADING_${heading[1].length}`] } : line); }) : [];
      const doc = operation === "text-docx" ? new Document({ sections: [{ children: paragraphs }] }) : null;
      if (operation === "text-docx") await save(`${base}-text.docx`, await Packer.toBuffer(doc));
      else {
        const escape = (value) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>@page{size:A4;margin:18mm}body{font:12pt/1.65 system-ui,sans-serif;color:#172033}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}</style></head><body><pre>${escape(text)}</pre></body></html>`;
        progress(0, 1, "正在排版文字 PDF");
        const buffer = await new Promise((resolve, reject) => {
          const listener = (message) => { if (!message.printResult) return; parentPort.off("message", listener); message.printResult.error ? reject(new Error(message.printResult.error)) : resolve(Buffer.from(message.printResult.data)); };
          parentPort.on("message", listener); parentPort.postMessage({ printHtml: html });
        });
        const { PDFDocument } = require("pdf-lib"); if ((await PDFDocument.load(buffer)).getPageCount() > 50) throw new Error("文本转换超过 50 页，请拆分文件");
        await save(`${base}-text.pdf`, buffer);
      }
    } else if (operation === "sheet-format") {
      const XLSX = require("xlsx"); const book = XLSX.read(await readBounded(sources[0]), { type: "buffer", cellFormula: true });
      for (const name of book.SheetNames) {
        const range = XLSX.utils.decode_range(book.Sheets[name]["!ref"] || "A1");
        if (range.e.r >= 100000 || (range.e.r + 1) * (range.e.c + 1) > 1000000) throw new Error("表格范围过大，请分批转换（最多 10 万行、100 万个单元格）");
      }
      const format = options.format === "csv" ? "csv" : "xlsx";
      if (format === "csv") {
        const name = options.sheet || book.SheetNames[0]; if (!book.Sheets[name]) throw new Error("工作表不存在");
        const rows = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: "", raw: true });
        if (rows.length > 100000) throw new Error("表格超过 100000 行，请分批处理");
        const safeRows = rows.map((row) => row.map((cell) => { const value = String(cell); return typeof cell === "string" && /^[\s]*[=+@-]/.test(value) ? `'${value}` : value; }));
        await save(`${base}-values.csv`, Buffer.from("\ufeff" + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(safeRows)), "utf8"));
      } else await save(`${base}-converted.xlsx`, XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
    } else if (operation === "office-pdf") {
      let converted = false;
      const officeTemp = await fs.mkdtemp(path.join(staging, "office-"));
      try {
        // Copy source to isolate LibreOffice lock files and conversion profiles from user files.
        const input = path.join(officeTemp, path.basename(sources[0])); await fs.writeFile(input, await readBounded(sources[0]));
        for (const command of officeCandidates()) {
          try { progress(0, 1, "正在使用本地 LibreOffice 转换"); await runOffice(command, [`-env:UserInstallation=${pathToFileURL(path.join(officeTemp, "profile")).href}`, "--headless", "--convert-to", "pdf", "--outdir", officeTemp, input]); converted = true; break; }
          catch (error) { check(); if (error.code !== "ENOENT") throw error; }
        }
        if (!converted) throw new Error("未检测到 LibreOffice，请安装后重试；不会用不完整预览冒充原版式 PDF");
        const buffer = await readBounded(path.join(officeTemp, `${base}.pdf`));
        if (buffer.subarray(0, 5).toString() !== "%PDF-") throw new Error("Office 未生成有效 PDF");
        await save(`${base}-office.pdf`, buffer);
      } finally { await fs.rm(officeTemp, { recursive: true, force: true }); }
    }
    if (!produced.length) throw new Error("转换未生成文件");
    // Hard-link publication is atomic and never replaces an existing file.
    for (const file of produced) {
      check(); let destination;
      for (let suffix = 0; suffix < 1000; suffix++) {
        const ext = path.extname(file.name); destination = path.join(outputDir, suffix ? `${path.basename(file.name, ext)} (${suffix})${ext}` : file.name);
        try {
          try { await fs.link(file.path, destination); }
          catch (error) { if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].includes(error.code)) throw error; await fs.copyFile(file.path, destination, require("node:fs").constants.COPYFILE_EXCL); }
          break;
        } catch (error) { if (error.code !== "EEXIST" || suffix === 999) throw error; }
      }
      published.push({ filePath: destination, fileName: path.basename(destination), size: file.size });
      parentPort.postMessage({ published: destination });
    }
    check(); progress(produced.length, produced.length, "转换完成"); return { files: published };
  } catch (error) {
    await Promise.all(published.map((file) => fs.unlink(file.filePath).catch(() => {}))); throw error;
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}
main().then((result) => parentPort.postMessage({ result })).catch((error) => parentPort.postMessage({ error: error.message })).finally(() => parentPort.close());
