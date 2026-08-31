const assert = require("assert");
const { chromium } = require("playwright");
const { Document, Packer, Paragraph, TextRun } = require("docx");
const { PDFDocument, StandardFonts } = require("pdf-lib");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:3000/canvas-office.html";

async function createPdfBase64(pageCount = 12) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = document.addPage([595, 842]);
    page.drawText(`FreeFlow document preview page ${pageNumber}`, {
      x: 56,
      y: 780,
      size: 18,
      font,
    });
  }
  return Buffer.from(await document.save()).toString("base64");
}

async function createDocxBase64() {
  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun({ text: "FreeFlow Word preview contract", bold: true })] }),
        new Paragraph("The document preview must remain isolated and recover after closing."),
      ],
    }],
  });
  return (await Packer.toBuffer(document)).toString("base64");
}

async function main() {
  const pdfBase64 = await createPdfBase64();
  const docxBase64 = await createDocxBase64();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.addInitScript(({ fixture }) => {
    globalThis.__FREEFLOW_PREVIEW_TEST = { mode: "success", delay: 0, fixture };
    globalThis.desktopShell = {
      readFileBase64: async () => {
        const state = globalThis.__FREEFLOW_PREVIEW_TEST;
        if (state.delay) {
          await new Promise((resolve) => setTimeout(resolve, state.delay));
        }
        if (state.mode === "fail") {
          return { ok: false, error: "fixture failure", data: "", mime: "application/pdf" };
        }
        return { ok: true, data: state.fixture, mime: state.mime || "application/pdf" };
      },
    };
  }, { fixture: pdfBase64 });

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(globalThis.__canvas2dEngine?.getSnapshot));
    await page.waitForFunction(() => document.querySelector("#canvas2d-react-ui-host")?.dataset?.canvas2dUiState === "mounted");

    await page.evaluate(() => {
      const item = {
        id: "preview-pdf-card",
        type: "fileCard",
        x: 220,
        y: 160,
        width: 336,
        height: 128,
        fileName: "preview-contract.pdf",
        name: "preview-contract.pdf",
        ext: "pdf",
        sourcePath: "C:\\fixtures\\preview-contract.pdf",
      };
      globalThis.__canvas2dEngine.loadStructuredBoardForExport({
        items: [item],
        selectedIds: [item.id],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
      globalThis.__canvas2dEngine.openFileCardPreview(globalThis.__canvas2dEngine.getSnapshotData().items[0]);
    });

    await page.waitForFunction(() => globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0]?.previewStatus === "ready");
    try {
      await page.waitForFunction(() => document.querySelectorAll(".canvas2d-file-preview-react-pdf-canvas").length > 0, null, { timeout: 15000 });
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        request: globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0] || null,
        runtime: globalThis.__canvas2dEngine.getDocumentPreviewRuntimeSnapshot(),
        placeholder: document.querySelector(".canvas2d-file-preview-placeholder-card")?.outerHTML || "",
        preview: document.querySelector(".canvas2d-file-preview-react")?.outerHTML?.slice(0, 2000) || "",
      }));
      throw new Error(`${error.message}\n${JSON.stringify(diagnostics, null, 2)}`);
    }
    const opened = await page.evaluate(() => {
      const snapshot = globalThis.__canvas2dEngine.getSnapshot();
      const request = snapshot.fileCardPreviewRequests[0];
      return {
        request,
        runtime: globalThis.__canvas2dEngine.getDocumentPreviewRuntimeSnapshot(),
        pageShells: document.querySelectorAll(".canvas2d-file-preview-react-pdf-page").length,
        canvases: document.querySelectorAll(".canvas2d-file-preview-react-pdf-canvas").length,
      };
    });
    assert.strictEqual(opened.pageShells, 12);
    assert(opened.canvases > 0 && opened.canvases < opened.pageShells, "PDF should render a visible page window, not every page");
    assert.strictEqual(Object.prototype.hasOwnProperty.call(opened.request, "previewFileBase64"), false);
    assert.strictEqual(opened.runtime.activeSessions, 1);
    assert(opened.runtime.byteSize > 0);

    await page.evaluate(() => {
      document.querySelector(".canvas2d-file-preview-react-pdf-canvas").dataset.previewRenderToken = "stable-render";
      globalThis.__canvas2dEngine.zoomIn();
      globalThis.__canvas2dEngine.zoomOut();
    });
    await page.waitForTimeout(250);
    const cameraStable = await page.evaluate(() =>
      document.querySelector(".canvas2d-file-preview-react-pdf-canvas")?.dataset?.previewRenderToken || ""
    );
    assert.strictEqual(cameraStable, "stable-render", "camera updates must not recreate the document parser or page canvas");

    await page.locator(".canvas2d-file-preview-react-scroll").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(350);
    const afterScroll = await page.evaluate(() => ({
      pageShells: document.querySelectorAll(".canvas2d-file-preview-react-pdf-page").length,
      canvases: document.querySelectorAll(".canvas2d-file-preview-react-pdf-canvas").length,
    }));
    assert.strictEqual(afterScroll.pageShells, 12);
    assert(afterScroll.canvases < afterScroll.pageShells, "far PDF canvases should be released after scrolling");

    await page.evaluate(() => {
      const request = globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0];
      globalThis.__canvas2dEngine.closeFileCardPreview(request.id);
    });
    await page.waitForFunction(() => globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests.length === 0);
    const closed = await page.evaluate(() => globalThis.__canvas2dEngine.getDocumentPreviewRuntimeSnapshot());
    assert.strictEqual(closed.activeSessions, 0);

    await page.evaluate(() => {
      globalThis.__FREEFLOW_PREVIEW_TEST.delay = 180;
      const item = globalThis.__canvas2dEngine.getSnapshotData().items[0];
      globalThis.__canvas2dEngine.openFileCardPreview(item);
      const request = globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0];
      globalThis.__canvas2dEngine.closeFileCardPreview(request.id);
    });
    await page.waitForTimeout(260);
    const rapidClose = await page.evaluate(() => ({
      requests: globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests.length,
      runtime: globalThis.__canvas2dEngine.getDocumentPreviewRuntimeSnapshot(),
    }));
    assert.strictEqual(rapidClose.requests, 0);
    assert.strictEqual(rapidClose.runtime.activeSessions, 0);

    await page.evaluate(() => {
      globalThis.__FREEFLOW_PREVIEW_TEST.delay = 0;
      globalThis.__FREEFLOW_PREVIEW_TEST.mode = "fail";
      globalThis.__canvas2dEngine.openFileCardPreview(globalThis.__canvas2dEngine.getSnapshotData().items[0]);
    });
    await page.waitForFunction(() => globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0]?.previewStatus === "failed");
    await page.evaluate(() => {
      globalThis.__FREEFLOW_PREVIEW_TEST.mode = "success";
      const request = globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0];
      globalThis.__canvas2dEngine.retryFileCardPreview(request.id);
    });
    await page.waitForFunction(() => globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0]?.previewStatus === "ready");
    const retried = await page.evaluate(() => globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0]);
    assert(retried.previewGeneration > 1);
    assert(retried.previewByteLength > 0);

    await page.evaluate(({ fixture }) => {
      const currentRequest = globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0];
      globalThis.__canvas2dEngine.closeFileCardPreview(currentRequest.id);
      globalThis.__FREEFLOW_PREVIEW_TEST.fixture = fixture;
      globalThis.__FREEFLOW_PREVIEW_TEST.mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const item = {
        id: "preview-docx-card",
        type: "fileCard",
        x: 220,
        y: 160,
        width: 336,
        height: 128,
        fileName: "preview-contract.docx",
        name: "preview-contract.docx",
        ext: "docx",
        sourcePath: "C:\\fixtures\\preview-contract.docx",
      };
      globalThis.__canvas2dEngine.loadStructuredBoardForExport({
        items: [item],
        selectedIds: [item.id],
        view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
      globalThis.__canvas2dEngine.openFileCardPreview(globalThis.__canvas2dEngine.getSnapshotData().items[0]);
    }, { fixture: docxBase64 });
    await page.waitForFunction(() =>
      document.querySelector("iframe.canvas2d-file-preview-react-content.is-docx")?.contentDocument?.body?.textContent?.includes(
        "FreeFlow Word preview contract"
      )
    );
    const docxOpened = await page.evaluate(() => {
      const iframe = document.querySelector("iframe.canvas2d-file-preview-react-content.is-docx");
      iframe.dataset.previewRenderToken = "stable-docx-render";
      return {
        title: document.querySelector(".canvas2d-file-preview-react-title strong")?.textContent || "",
        pages: iframe.contentDocument?.querySelectorAll("section.docx, section.canvas2d-file-card-docx-preview-document").length || 0,
        diagnosticsVisible: Boolean(document.querySelector(".canvas2d-file-preview-react-diagnostics")),
        sandbox: iframe.getAttribute("sandbox") || "",
      };
    });
    assert.strictEqual(docxOpened.title, "preview-contract.docx");
    assert(docxOpened.pages > 0);
    assert.strictEqual(docxOpened.diagnosticsVisible, false);
    assert(docxOpened.sandbox.includes("allow-same-origin") && docxOpened.sandbox.includes("allow-scripts"));

    await page.evaluate(() => {
      globalThis.__canvas2dEngine.zoomIn();
      globalThis.__canvas2dEngine.zoomOut();
    });
    await page.waitForTimeout(250);
    const docxCameraStable = await page.evaluate(() =>
      document.querySelector("iframe.canvas2d-file-preview-react-content.is-docx")?.dataset?.previewRenderToken || ""
    );
    assert.strictEqual(docxCameraStable, "stable-docx-render", "camera updates must not recreate the Word iframe");

    await page.evaluate(() => {
      const request = globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0];
      globalThis.__canvas2dEngine.closeFileCardPreview(request.id);
      globalThis.__canvas2dEngine.openFileCardPreview(globalThis.__canvas2dEngine.getSnapshotData().items[0]);
    });
    await page.waitForFunction(() =>
      document.querySelector("iframe.canvas2d-file-preview-react-content.is-docx")?.contentDocument?.body?.textContent?.includes(
        "FreeFlow Word preview contract"
      )
    );
    await page.evaluate(() => {
      const request = globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0];
      globalThis.__canvas2dEngine.closeFileCardPreview(request.id);
    });
    await page.waitForFunction(() => globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests.length === 0);
    const docxClosed = await page.evaluate(() => globalThis.__canvas2dEngine.getDocumentPreviewRuntimeSnapshot());
    assert.strictEqual(docxClosed.activeSessions, 0);

    console.log("[check-document-preview-browser] ok");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[check-document-preview-browser] ${error.stack || error.message}`);
  process.exitCode = 1;
});
