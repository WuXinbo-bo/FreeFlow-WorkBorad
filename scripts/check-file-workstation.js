const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { EventEmitter } = require("node:events");
const sharp = require("sharp");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const XLSX = require("xlsx");
const { chromium } = require("playwright");
const { createFileAccessRegistry } = require("../electron/fileAccessRegistry");
const { createFileWorkstationService } = require("../electron/fileWorkstationService");
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-file-workstation-"));
  const output = path.join(root, "output"); await fs.mkdir(output);
  const access = createFileAccessRegistry(); access.grant(root, { directory: true, write: true });
  const owner = new EventEmitter(); const other = new EventEmitter(); const service = createFileWorkstationService({ fileAccess: access, printDocument: async (html) => {
    const browser = await chromium.launch({ headless: true });
    try { const page = await browser.newPage(); await page.setContent(html); return await page.pdf({ preferCSSPageSize: true }); } finally { await browser.close(); }
  } });
  let sequence = 0;
  const run = (operation, sources, options = {}) => service.run(owner, { taskId: `test-${++sequence}`, operation, sources, options, outputDir: output });
  try {
    const red = path.join(root, "红.png"); const blue = path.join(root, "蓝.webp");
    await fs.writeFile(red, await sharp({ create: { width: 120, height: 60, channels: 4, background: "#ff0000" } }).png().toBuffer());
    await fs.writeFile(blue, await sharp({ create: { width: 80, height: 120, channels: 4, background: "#0000ff" } }).webp().toBuffer());
    const converted = await run("image-format", [red], { format: "jpg", width: 60 }); assert.equal(converted.ok, true, JSON.stringify(converted));
    const meta = await sharp(converted.files[0].filePath).metadata(); assert.equal(meta.width, 60); assert.equal(meta.height, 30); assert.equal(meta.format, "jpeg");
    const duplicate = await run("image-format", [red], { format: "jpg", width: 60 }); assert.equal(duplicate.ok, true); assert.notEqual(duplicate.files[0].filePath, converted.files[0].filePath);
    const imagesPdf = await run("images-pdf", [blue, red], { pageSize: "a4", landscape: true }); assert.equal(imagesPdf.ok, true, JSON.stringify(imagesPdf));
    const merged = await PDFDocument.load(await fs.readFile(imagesPdf.files[0].filePath)); assert.equal(merged.getPageCount(), 2); assert.equal(merged.getPage(0).getWidth(), 842);
    const orderedImages = await run("pdf-images", [imagesPdf.files[0].filePath], { pages: "1-2", format: "png", dpi: 72 }); assert.equal(orderedImages.ok, true, JSON.stringify(orderedImages));
    const centerPixel = async (file) => [...await sharp(file).extract({ left: 420, top: 296, width: 1, height: 1 }).removeAlpha().raw().toBuffer()];
    const firstPixel = await centerPixel(orderedImages.files[0].filePath); const secondPixel = await centerPixel(orderedImages.files[1].filePath);
    assert(firstPixel[2] > 200 && firstPixel[0] < 50, "first PDF page must be the first blue input"); assert(secondPixel[0] > 200 && secondPixel[2] < 50, "second PDF page must be the second red input");
    const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let page = 1; page <= 4; page++) pdf.addPage([320, 200]).drawText(`Selected page ${page}`, { x: 20, y: 100, font });
    const pdfPath = path.join(root, "source.pdf"); await fs.writeFile(pdfPath, await pdf.save());
    const pdfImages = await run("pdf-images", [pdfPath], { pages: "2-3", format: "png", dpi: 144 }); assert.equal(pdfImages.ok, true, JSON.stringify(pdfImages)); assert.equal(pdfImages.files.length, 2);
    assert.match(pdfImages.files[0].fileName, /002/); assert.equal((await sharp(pdfImages.files[0].filePath).metadata()).width, 640);
    assert.equal((await run("pdf-images", [pdfPath], { pages: "0,5" })).ok, false);
    const text = path.join(root, "说明.md"); await fs.writeFile(text, "# 工作资料\nChinese 中文 and English\n第二段");
    const docx = await run("text-docx", [text]); assert.equal(docx.ok, true, JSON.stringify(docx)); assert.equal((await fs.readFile(docx.files[0].filePath)).subarray(0, 2).toString(), "PK");
    const textPdf = await run("text-pdf", [text]); assert.equal(textPdf.ok, true, JSON.stringify(textPdf)); assert.equal((await PDFDocument.load(await fs.readFile(textPdf.files[0].filePath))).getPageCount(), 1);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["名称", "报价"], ["中文", 120], ["=HYPERLINK(\"x\")", 300], ["退款", -120]]), "报价");
    const sheet = path.join(root, "报价.xlsx"); XLSX.writeFile(book, sheet);
    const inspected = await run("inspect", [sheet]); assert.equal(inspected.ok, true); assert.equal(inspected.sheets[0].rows[1][0], "中文");
    const csv = await run("sheet-format", [sheet], { format: "csv" }); assert.equal(csv.ok, true, JSON.stringify(csv)); assert.match(await fs.readFile(csv.files[0].filePath, "utf8"), /'=HYPERLINK/); assert.match(await fs.readFile(csv.files[0].filePath, "utf8"), /退款,-120/, "numeric negative values must remain numeric");
    const xlsx = await run("sheet-format", [csv.files[0].filePath], { format: "xlsx" }); assert.equal(xlsx.ok, true); assert.equal(XLSX.readFile(xlsx.files[0].filePath).SheetNames.length, 1);
    const deny = createFileWorkstationService({ fileAccess: createFileAccessRegistry() }); assert.equal((await deny.run(owner, { taskId: "deny", operation: "inspect", sources: [text] })).ok, false);
    const pending = service.run(owner, { taskId: "cancel", operation: "pdf-images", sources: [pdfPath], outputDir: output });
    assert.equal(service.cancel(other, "cancel").ok, false); assert.equal(service.status(other, "cancel").ok, false);
    assert.equal((await run("inspect", [text])).ok, false, "concurrent tasks must not start");
    assert.equal(service.cancel(owner, "cancel").ok, true); assert.equal((await pending).canceled, true);
    const destroyed = service.run(owner, { taskId: "destroyed", operation: "image-format", sources: [red], outputDir: output }); owner.emit("destroyed"); assert.equal((await destroyed).canceled, true);
    assert.equal((await run("inspect", [text])).ok, true, "new task after cancellation should recover");
    const beforeCancel = await fs.readdir(output);
    const running = service.run(owner, { taskId: "cancel-running", operation: "pdf-images", sources: [pdfPath], outputDir: output, options: { dpi: 200 } });
    for (let i = 0; i < 300 && service.status(owner, "cancel-running").message === "准备文件任务"; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(service.cancel(owner, "cancel-running").ok, true);
    assert.equal((await running).canceled, true); assert.deepEqual(await fs.readdir(output), beforeCancel, "running cancellation must roll back outputs");
    const noOffice = await new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, "../electron/fileWorkstationWorker.js");
      const mock = `const cp = require("node:child_process"); const { EventEmitter } = require("node:events"); cp.spawn = () => { const child = new EventEmitter(); process.nextTick(() => child.emit("error", Object.assign(new Error("not installed"), { code: "ENOENT" }))); return child; }; require(${JSON.stringify(workerPath)});`;
      const worker = new Worker(mock, { eval: true, workerData: { operation: "capabilities", sources: [text], cancelBuffer: new SharedArrayBuffer(4) } });
      worker.on("message", (message) => { if (message.result) { resolve(message.result); void worker.terminate(); } }); worker.on("error", reject);
    });
    assert.equal(noOffice.office, false); assert.match(noOffice.reason, /LibreOffice/);
    const { assertArchiveBudget } = require("../electron/filePreviewLimits");
    await assert.rejects(assertArchiveBudget(docx.files[0].filePath, 1), /解压后过大/);
    const oversized = path.join(root, "large.txt"); const handle = await fs.open(oversized, "w"); await handle.truncate(65 * 1024 * 1024); await handle.close();
    assert.equal((await run("inspect", [oversized])).ok, false, "size cap must reject before reading");
    assert.equal((await fs.readdir(output)).some((name) => name.startsWith(".freeflow-convert-")), false);
    assert.equal(owner.listenerCount("destroyed"), 0);
    console.log("[file-workstation] real PDF selected pages, image conversion/order, text DOCX/PDF, CSV/XLSX, no overwrite, authorization, concurrent/cancel/destroy/recovery passed");
  } finally { service.dispose(); await fs.rm(root, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
