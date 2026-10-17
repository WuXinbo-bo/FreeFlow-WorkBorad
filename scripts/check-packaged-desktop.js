const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron } = require("playwright");
const { PDFDocument } = require("pdf-lib");
const sharp = require("sharp");
const yauzl = require("yauzl");

function readZipEntry(buffer, name) {
  return new Promise((resolve, reject) => yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    zip.on("error", reject);
    zip.on("end", () => reject(new Error(`Missing DOCX entry: ${name}`)));
    zip.on("entry", entry => {
      if (entry.fileName !== name) return zip.readEntry();
      zip.openReadStream(entry, (streamError, stream) => {
        if (streamError) { zip.close(); return reject(streamError); }
        const chunks = [];
        stream.on("error", reject);
        stream.on("data", chunk => chunks.push(chunk));
        stream.on("end", () => { zip.close(); resolve(Buffer.concat(chunks).toString("utf8")); });
      });
    });
    zip.readEntry();
  }));
}

async function waitForCanvas(page) {
  await page.waitForFunction(() => window.__canvas2dEngine && window.desktopShell?.isDesktop && !document.body.classList.contains("app-booting"), null, { timeout: 60000 });
  await page.evaluate(() => window.__canvas2dEngine.whenReady());
  await page.waitForFunction(() => !document.body.classList.contains("boot-shape-lock") && (!document.querySelector(".boot-splash") || getComputedStyle(document.querySelector(".boot-splash")).opacity === "0"), null, { timeout: 15000 });
}

async function main() {
  const target = process.argv[2];
  assert(target, "Usage: npm run test:packaged-desktop -- /absolute/path/FreeFlow.app (or packaged executable)");
  const resolvedTarget = path.resolve(target);
  const executablePath = resolvedTarget.endsWith(".app") ? path.join(resolvedTarget, "Contents/MacOS/FreeFlow") : resolvedTarget;
  await fs.access(executablePath);
  const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-packaged-regression-")));
  const data = path.join(temp, "AppData"), boards = path.join(temp, "Boards"), output = path.join(temp, "Output");
  await Promise.all([data, boards, output].map(folder => fs.mkdir(folder)));
  const version = require("../package.json").version;
  await fs.writeFile(path.join(data, "ui-settings.json"), JSON.stringify({ hasShownStartupTutorial: true, lastTutorialIntroVersion: version, dismissedTutorialIntroVersion: version, defaultLaunchFullscreen: false, defaultCanvasPanelVisible: true, defaultChatPanelVisible: true, canvasBoardSavePath: boards, canvasWorkspaceFolderPath: boards }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("FREEFLOW_")) delete env[key];
  delete env.NODE_OPTIONS; delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, { FREEFLOW_HOME_DIR: temp, FREEFLOW_USER_DATA_DIR: data, FREEFLOW_CANVAS_BOARD_DIR: boards, FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temp, "Legacy"), FREEFLOW_CACHE_DIR: path.join(temp, "Cache"), FREEFLOW_RUNTIME_DIR: path.join(temp, "Runtime"), FREEFLOW_TEMP_DRAG_DIR: path.join(temp, "Drag"), FREEFLOW_PORT: "0" });
  if (process.platform !== "win32") env.PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
  let app;
  const errors = [], stderr = [], blocked = [], failedRequests = [], browserConsole = [];
  const report = { executablePath, temp };
  try {
    // Launch the installed entry point, not source main.js or an Electron bootstrap.
    app = await _electron.launch({ executablePath, args: [`--user-data-dir=${path.join(temp, "Profile")}`], cwd: temp, env, timeout: 60000 });
    app.process().stderr.on("data", chunk => stderr.push(String(chunk)));
    app.on("window", page => page.on("pageerror", error => errors.push(error.message)));
    const page = await app.firstWindow();
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (["error", "warning"].includes(message.type())) browserConsole.push(message.text()); });
    page.on("requestfailed", request => { failedRequests.push({ url: request.url(), error: request.failure()?.errorText }); const url = new URL(request.url()); if (["http:", "https:"].includes(url.protocol) && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) blocked.push(url.origin); });
    page.on("response", response => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }); });
    // Electron's Fetch interception can fail local file responses under ASAR;
    // use Chromium's proxy boundary instead and keep the loopback app reachable.
    await app.evaluate(async ({ session }) => session.defaultSession.setProxy({ proxyRules: "http=127.0.0.1:9;https=127.0.0.1:9", proxyBypassRules: "<local>;127.0.0.1;[::1]" }));
    report.externalProxy = await app.evaluate(({ session }) => session.defaultSession.resolveProxy("https://example.com"));
    assert(report.externalProxy.includes("127.0.0.1:9") && !report.externalProxy.includes("DIRECT"), "External networking was not isolated");
    report.app = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, appPath: app.getAppPath(), version: app.getVersion(), arch: process.arch, platform: process.platform, userData: app.getPath("userData") }));
    assert.equal(report.app.packaged, true);
    assert(report.app.appPath.endsWith("app.asar"), "Test must resolve modules from the packaged ASAR");
    assert(report.app.userData.startsWith(temp), "Test profile escaped its temporary directory");
    await waitForCanvas(page);

    report.native = await app.evaluate(async ({ app }, { temp, boards, output }) => {
      const req = process.mainModule.require.bind(process.mainModule);
      const path = req("node:path"), fs = req("node:fs/promises"), assert = req("node:assert/strict");
      const root = app.getAppPath();
      req(path.join(root, "scripts/check-desktop-runtime-assets.js")).checkRuntimeAssets(root);
      const sharp = req("sharp"), { PDFDocument, StandardFonts } = req("pdf-lib"), XLSX = req("xlsx");
      const image = path.join(boards, "Image.png"), sourcePdf = path.join(boards, "Research.pdf"), text = path.join(boards, "Notes.md"), csv = path.join(boards, "Sheet.csv");
      await fs.writeFile(image, await sharp({ create: { width: 160, height: 100, channels: 4, background: "#4987b8" } }).png().toBuffer());
      const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
      for (let i = 0; i < 2; i++) pdf.addPage([240, 320]).drawText(`Packaged offline page ${i + 1}`, { x: 16, y: 280, font, size: 12 });
      await fs.writeFile(sourcePdf, await pdf.save());
      await fs.writeFile(text, "# Packaged offline export\n中文正文与继续编辑\n");
      await fs.writeFile(csv, "name,value\nalpha,42\n");
      const { createFileWorkstationService } = req(path.join(root, "electron/fileWorkstationService.js"));
      const service = createFileWorkstationService({ fileAccess: { assert(file) { const normalized = path.resolve(file); assert(normalized.startsWith(temp + path.sep)); return normalized; } } });
      const owner = new (req("node:events").EventEmitter)();
      let id = 0;
      const run = async (operation, sources, options = {}) => {
        const result = await service.run(owner, { taskId: `packaged-${++id}`, operation, sources, outputDir: output, options });
        assert(result.ok, `${operation}: ${JSON.stringify(result)}`);
        return result;
      };
      try {
        // Cancel while asynchronous validation is in progress, then immediately recover.
        const pending = service.run(owner, { taskId: "cancel-fixture", operation: "image-format", sources: [image], outputDir: output });
        assert(service.cancel(owner, "cancel-fixture").ok);
        assert((await pending).canceled);
        const converted = await run("image-format", [image], { format: "webp" });
        const pages = await run("pdf-images", [sourcePdf], { pages: "1-2", dpi: 72 });
        assert.equal(pages.files.length, 2);
        const merged = await run("images-pdf", pages.files.map(file => file.filePath));
        assert.equal((await PDFDocument.load(await fs.readFile(merged.files[0].filePath))).getPageCount(), 2);
        const docx = await run("text-docx", [text]);
        const sheet = await run("sheet-format", [csv], { format: "xlsx" });
        const book = XLSX.read(await fs.readFile(sheet.files[0].filePath), { type: "buffer" });
        assert.equal(book.Sheets[book.SheetNames[0]].B2.v, 42);
        const inspected = await run("inspect", [sheet.files[0].filePath]);
        assert.equal(inspected.kind, "table");
        assert.equal(inspected.sheets[0].rows[1][0], "alpha");
        const bad = await service.run(owner, { taskId: "bad-fixture", operation: "pdf-images", sources: [image], outputDir: output });
        assert.equal(bad.ok, false);
        await run("image-format", [image], { format: "jpg" });
        assert(!(await fs.readdir(output)).some(name => name.startsWith(".freeflow-convert-")), "Temporary staging files leaked after completion/cancellation");
        const { compileWordExportAstToDocxBuffer } = req(path.join(root, "electron/wordDocxCompiler.js"));
        const word = await compileWordExportAstToDocxBuffer({ kind: "freeflow-word-export", version: 1, meta: { title: "Offline Word" }, sections: [{ children: [{ type: "mathBlock", latex: "\\frac{a}{b}+\\sqrt{x}" }, { type: "paragraph", children: [{ type: "text", text: "Editable inline " }, { type: "mathInline", latex: "x^2" }] }] }] });
        const wordPath = path.join(output, "editable-math.docx"); await fs.writeFile(wordPath, word);
        return { converted: converted.files, pages: pages.files, merged: merged.files[0], wordPath, previewDocx: docx.files[0].filePath, pdfBase64: (await fs.readFile(sourcePdf)).toString("base64"), docxBase64: (await fs.readFile(docx.files[0].filePath)).toString("base64"), cancellationRecovered: true, invalidInputRecovered: true };
      } finally { service.dispose(); }
    }, { temp, boards, output });
    const wordXml = await readZipEntry(await fs.readFile(report.native.wordPath), "word/document.xml");
    assert.match(wordXml, /<m:oMath/); assert.match(wordXml, /<m:f>/); assert.match(wordXml, /<m:rad>/);
    assert.equal((await sharp(report.native.converted[0].filePath).metadata()).format, "webp");
    assert.equal((await PDFDocument.load(await fs.readFile(report.native.merged.filePath))).getPageCount(), 2);

    report.browser = await page.evaluate(async ({ pdfBase64, docxBase64 }) => {
      const assert = (condition, message) => { if (!condition) throw new Error(message); };
      const { MarkdownIt, footnote } = await import("/assets/vendor/markdown/markdown-parser.js");
      const markdown = new MarkdownIt().use(footnote).render("# Offline heading\n\n**bold**[^1]\n\n[^1]: local footnote");
      assert(markdown.includes("<h1>") && markdown.includes("footnote"), "Markdown bundle failed");
      const { default: purify } = await import("/assets/vendor/dompurify/purify.es.mjs");
      assert(!purify.sanitize('<p onclick="x()">safe<script>x()</script></p>').includes("script"), "DOMPurify bundle failed");
      assert(typeof (await import("/assets/vendor/html2canvas/html2canvas.esm.min.js")).default === "function", "html2canvas bundle missing");
      const { default: mermaid } = await import("/assets/vendor/mermaid/mermaid.esm.min.mjs");
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
      const diagram = await mermaid.render("packaged-diagram", "flowchart LR\nA[Collect] --> B[Deliver]");
      assert(diagram.svg.includes("<svg") && diagram.svg.includes("Collect"), "Mermaid dynamic chunk render failed");
      const script = src => new Promise((resolve, reject) => { const node = document.createElement("script"); node.src = src; node.onload = resolve; node.onerror = () => reject(new Error(`Missing script ${src}`)); document.head.append(node); });
      if (!window.katex) await script("/vendor/katex/katex.min.js");
      assert(window.katex.renderToString("\\frac{1}{2}").includes("katex"), "KaTeX offline render failed");
      for (const language of ["core", "clike", "javascript", "typescript", "python", "json", "markup", "css", "markdown", "sql", "c", "cpp", "java", "bash"]) await script(`/vendor/prismjs/components/prism-${language}.min.js`);
      assert(window.Prism.highlight("const answer = 42", window.Prism.languages.javascript, "javascript").includes("token"), "Prism public fallback failed");
      const pdfjs = await import("/assets/vendor/pdfjs-dist/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "/assets/vendor/pdfjs-dist/pdf.worker.mjs";
      const bytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
      const loading = pdfjs.getDocument({ data: bytes(pdfBase64), cMapUrl: "/assets/vendor/pdfjs-dist/cmaps/", cMapPacked: true, standardFontDataUrl: "/assets/vendor/pdfjs-dist/standard_fonts/", wasmUrl: "/assets/vendor/pdfjs-dist/wasm/" });
      const pdf = await loading.promise;
      const first = await pdf.getPage(1), viewport = first.getViewport({ scale: 1 });
      const raster = document.createElement("canvas"); raster.width = viewport.width; raster.height = viewport.height;
      await first.render({ canvasContext: raster.getContext("2d"), viewport }).promise;
      assert((await first.getTextContent()).items.some(item => item.str.includes("Packaged offline")), "PDF worker text extraction failed");
      await loading.destroy();
      const XLSX = await import("/vendor/xlsx/xlsx.mjs");
      assert(XLSX.read("a,b\n1,2", { type: "string" }).SheetNames.length === 1, "XLSX browser module failed");
      const preview = await import("/assets/vendor/docx-preview/docx-preview.mjs");
      const host = document.createElement("div"); document.body.append(host);
      try { await preview.renderAsync(bytes(docxBase64), host); assert(host.textContent.includes("Packaged offline export"), "DOCX preview failed"); } finally { host.remove(); }
      return { markdown: true, sanitizer: true, html2canvas: true, mermaid: true, katex: true, prismLanguages: 14, pdfWorker: true, spreadsheet: true, docxPreview: true };
    }, report.native);
    delete report.native.pdfBase64; delete report.native.docxBase64;

    const formulaHtml = '<h1>Offline heading</h1><p>正文 <span data-role="math-inline" data-math-source="\\frac{1}{2}" data-source-format="latex">\\frac{1}{2}</span></p>';
    await page.evaluate(html => window.__canvas2dEngine.loadStructuredBoardForExport({ items: [{ id: "offline-text", type: "text", x: 280, y: 140, width: 500, fontSize: 20, html }], view: { scale: 1 } }), formulaHtml);
    // Geometry writeback belongs to normal display; export itself must leave the model intact.
    await page.waitForTimeout(300);
    const visual = await page.evaluate(async () => {
      const engine = window.__canvas2dEngine, before = JSON.stringify(engine.getSnapshotData().items);
      const result = await engine.getStructuredExportRuntime().renderSnapshotToCanvas(engine.getSnapshotData(), {});
      return { data: result.canvas.toDataURL(), unchanged: before === JSON.stringify(engine.getSnapshotData().items) };
    });
    assert(visual.unchanged, "Visual export mutated editable content");
    const pixels = await sharp(Buffer.from(visual.data.split(",")[1], "base64")).ensureAlpha().raw().toBuffer();
    assert(pixels.some((value, i) => i % 4 === 3 && value > 0), "Canvas formula export was blank");
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.locator("#conversation-settings-btn").click();
      for (const section of ["canvas", "github", "plugins"]) {
        await page.locator(`[data-settings-section="${section}"]`).click();
        await page.waitForFunction(section => document.querySelector(`[data-settings-section="${section}"]`)?.classList.contains("is-active"), section);
      }
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.querySelector("#insight-drawer")?.getAttribute("aria-hidden") === "true");
    }
    await page.reload(); await waitForCanvas(page);
    assert.equal((await page.request.get(new URL("/api/settings-center", page.url()).href)).status(), 200);
    assert.deepEqual([...new Set(errors)], [], "Packaged renderer errors");
    await page.screenshot({ path: path.join(temp, "packaged-app.png") });
    Object.assign(report, { ok: true, blockedExternalOrigins: [...new Set(blocked)], rendererErrors: errors, settingsCloseAndReopen: true, reload: true });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    Object.assign(report, { ok: false, error: error.stack, rendererErrors: errors, failedRequests, browserConsole, stderr: stderr.join("").slice(-6000) });
    if (app) report.windows = await Promise.all(app.windows().map(async page => ({ url: page.url(), state: await page.evaluate(() => ({ body: document.body?.innerText.slice(0, 1000), classes: document.body?.className, engine: typeof window.__canvas2dEngine, desktop: typeof window.desktopShell, isDesktop: window.desktopShell?.isDesktop })).catch(() => null) })));
    throw error;
  } finally {
    await fs.writeFile(path.join(temp, "report.json"), JSON.stringify(report, null, 2));
    console.log(`[packaged-desktop] Report and isolated fixtures: ${temp}`);
    if (app) await app.close();
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
