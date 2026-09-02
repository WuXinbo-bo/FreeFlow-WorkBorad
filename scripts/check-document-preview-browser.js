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
    const decodeFixture = (base64) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes.buffer;
    };
    globalThis.__FREEFLOW_PREVIEW_TEST = {
      mode: "success",
      delay: 0,
      fixture,
      version: 1,
      binaryReads: 0,
      base64Reads: 0,
    };
    globalThis.desktopShell = {
      getFilePreviewMetadata: async (targetPath) => {
        const state = globalThis.__FREEFLOW_PREVIEW_TEST;
        return {
          ok: true,
          filePath: targetPath,
          size: state.fixture.length,
          modifiedAt: state.version,
          contentKey: `${targetPath}:${state.fixture.length}:${state.version}`,
          mime: state.mime || "application/pdf",
        };
      },
      readFilePreview: async (targetPath) => {
        const state = globalThis.__FREEFLOW_PREVIEW_TEST;
        state.binaryReads += 1;
        if (state.delay) {
          await new Promise((resolve) => setTimeout(resolve, state.delay));
        }
        if (state.mode === "fail") {
          return { ok: false, error: "fixture failure", data: null, mime: state.mime || "application/pdf" };
        }
        return {
          ok: true,
          filePath: targetPath,
          data: decodeFixture(state.fixture),
          size: state.fixture.length,
          modifiedAt: state.version,
          contentKey: `${targetPath}:${state.fixture.length}:${state.version}`,
          mime: state.mime || "application/pdf",
        };
      },
      readFileBase64: async () => {
        const state = globalThis.__FREEFLOW_PREVIEW_TEST;
        state.base64Reads += 1;
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
        x: 720,
        y: 180,
        width: 336,
        height: 128,
        fileName: "preview-contract.pdf",
        name: "preview-contract.pdf",
        ext: "pdf",
        sourcePath: "C:\\fixtures\\preview-contract.pdf",
        memo: "Preview note",
        memoVisible: true,
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
    assert.strictEqual(await page.evaluate(() => globalThis.__FREEFLOW_PREVIEW_TEST.binaryReads), 1);
    assert.strictEqual(await page.evaluate(() => globalThis.__FREEFLOW_PREVIEW_TEST.base64Reads), 0);
    assert.strictEqual(
      await page.evaluate(() => document.querySelector(".canvas2d-file-preview-react")?.parentElement?.id || ""),
      "canvas2d-document-preview-layer",
      "document previews must render in the scene-synchronized preview layer"
    );
    const previewLayering = await page.evaluate(() => ({
      preview: Number(getComputedStyle(document.querySelector("#canvas2d-document-preview-layer")).zIndex),
      scene: Number(getComputedStyle(document.querySelector("#canvas2d-scene-root")).zIndex),
    }));
    assert(previewLayering.preview < previewLayering.scene, "file card scene must remain above its attached preview");
    const previewChrome = await page.evaluate(() => {
      const preview = document.querySelector(".canvas2d-file-preview-react");
      const head = preview?.querySelector(".canvas2d-file-preview-react-head");
      const actions = preview?.querySelector(".canvas2d-file-preview-react-actions");
      const shell = preview?.querySelector(".canvas2d-file-preview-react-shell");
      return {
        actionParentIsHead: actions?.parentElement === head,
        rowCount: getComputedStyle(preview).gridTemplateRows.split(" ").length,
        headHeight: Math.round(head?.getBoundingClientRect?.().height || 0),
        shellTopDelta: Math.abs((shell?.getBoundingClientRect?.().top || 0) - (head?.getBoundingClientRect?.().bottom || 0)),
        toolbarLabel: actions?.getAttribute("aria-label") || "",
      };
    });
    assert(previewChrome.actionParentIsHead, "preview controls must share the compact glass header", previewChrome);
    assert.strictEqual(previewChrome.rowCount, 2, "preview shell should use one chrome row and one document row");
    assert(previewChrome.headHeight <= 50 && previewChrome.shellTopDelta < 1, "preview header should remain compact and attached", previewChrome);
    assert.strictEqual(previewChrome.toolbarLabel, "预览控制");

    await page.evaluate(() => {
      const canvas = document.querySelector("#canvas-office-canvas");
      canvas.dispatchEvent(new WheelEvent("wheel", { deltaX: 42, deltaY: 28, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(32);
    const cameraSync = await page.evaluate(() => ({
      scene: document.querySelector("#canvas2d-scene-root")?.style?.transform || "",
      preview: document.querySelector("#canvas2d-document-preview-layer")?.style?.transform || "",
    }));
    assert(cameraSync.scene && cameraSync.scene === cameraSync.preview, "preview and scene camera matrices must update in the same frame");

    const fileCardBox = await page.locator('.canvas2d-scene-file-card-item[data-id="preview-pdf-card"]').boundingBox();
    assert(fileCardBox, "file card scene node is missing");
    await page.mouse.move(fileCardBox.x + fileCardBox.width / 2, fileCardBox.y + fileCardBox.height / 2);
    await page.mouse.down();
    const dragSamples = [];
    for (let step = 1; step <= 6; step += 1) {
      await page.mouse.move(
        fileCardBox.x + fileCardBox.width / 2 + 14 * step,
        fileCardBox.y + fileCardBox.height / 2 + 9 * step
      );
      dragSamples.push(await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
        const card = document.querySelector('.canvas2d-scene-file-card-item[data-id="preview-pdf-card"]')?.getBoundingClientRect();
        const preview = document.querySelector(".canvas2d-file-preview-react")?.getBoundingClientRect();
        resolve(card && preview ? {
          leftDelta: Math.abs(card.left - preview.left),
          widthDelta: Math.abs(preview.width - 360 * (card.width / 336)),
          topDelta: Math.abs(preview.top - (card.bottom + 8 * (card.width / 336))),
        } : null);
      }))));
    }
    assert(dragSamples.every(Boolean), "live preview anchor is missing while dragging");
    assert(
      dragSamples.every((sample) => sample.leftDelta < 2 && sample.widthDelta < 2 && sample.topDelta < 3),
      `preview drawer must follow the file card in every sampled frame: ${JSON.stringify(dragSamples)}`
    );
    await page.mouse.up();

    const assertAttachedPreviewGeometry = async (label) => {
      const geometry = await page.evaluate(() => {
        const card = document.querySelector('.canvas2d-scene-file-card-item[data-id="preview-pdf-card"]')?.getBoundingClientRect();
        const preview = document.querySelector(".canvas2d-file-preview-react")?.getBoundingClientRect();
        const scale = Number(globalThis.__canvas2dEngine?.getSnapshot?.()?.board?.view?.scale || 1) || 1;
        return card && preview ? {
          cardWidth: card.width,
          previewWidth: preview.width,
          leftDelta: Math.abs(card.left - preview.left),
          widthDelta: Math.abs(preview.width - Math.max(card.width, 360 * scale)),
          topDelta: Math.abs(preview.top - (card.bottom + 8 * scale)),
          scale,
        } : null;
      });
      assert(geometry, `${label}: attached preview geometry is missing`);
      assert(
        geometry.leftDelta < 2 && geometry.widthDelta < 2 && geometry.topDelta < 3,
        `${label}: preview geometry diverged from the resized file card: ${JSON.stringify(geometry)}`
      );
      return geometry;
    };
    const resizedCardBox = await page.locator('.canvas2d-scene-file-card-item[data-id="preview-pdf-card"]').boundingBox();
    assert(resizedCardBox, "file card is missing before attached preview resize test");
    const resizeDelta = { x: 160, y: 36 };
    await page.mouse.move(resizedCardBox.x + resizedCardBox.width, resizedCardBox.y + resizedCardBox.height);
    await page.mouse.down();
    for (let step = 1; step <= 5; step += 1) {
      await page.mouse.move(
        resizedCardBox.x + resizedCardBox.width + (resizeDelta.x * step) / 5,
        resizedCardBox.y + resizedCardBox.height + (resizeDelta.y * step) / 5
      );
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      const geometry = await assertAttachedPreviewGeometry(`active resize ${step}`);
      assert(geometry.previewWidth > 360, `active resize ${step}: preview width did not grow with the file card`);
    }
    await page.mouse.up();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    await assertAttachedPreviewGeometry("committed resize");

    const expandedCardBox = await page.locator('.canvas2d-scene-file-card-item[data-id="preview-pdf-card"]').boundingBox();
    assert(expandedCardBox, "file card is missing before reverse attached preview resize test");
    await page.mouse.move(expandedCardBox.x + expandedCardBox.width, expandedCardBox.y + expandedCardBox.height);
    await page.mouse.down();
    await page.mouse.move(
      expandedCardBox.x + expandedCardBox.width - resizeDelta.x,
      expandedCardBox.y + expandedCardBox.height - resizeDelta.y,
      { steps: 5 }
    );
    await page.mouse.up();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const recoveredGeometry = await assertAttachedPreviewGeometry("reverse resize");
    assert(Math.abs(recoveredGeometry.previewWidth - 360 * recoveredGeometry.scale) < 2);

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
    assert.strictEqual(
      await page.evaluate(() => globalThis.__canvas2dEngine.getSnapshotData().items[0]?.memoVisible),
      true,
      "closing preview must restore the original file memo"
    );

    const readsBeforeCachedOpen = await page.evaluate(() => globalThis.__FREEFLOW_PREVIEW_TEST.binaryReads);
    await page.evaluate(() => {
      globalThis.__canvas2dEngine.openFileCardPreview(globalThis.__canvas2dEngine.getSnapshotData().items[0]);
    });
    await page.waitForFunction(() => globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0]?.previewStatus === "ready");
    const cachedPdfOpen = await page.evaluate(() => ({
      request: globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0],
      binaryReads: globalThis.__FREEFLOW_PREVIEW_TEST.binaryReads,
    }));
    assert.strictEqual(cachedPdfOpen.request.previewCacheHit, true);
    assert.strictEqual(cachedPdfOpen.binaryReads, readsBeforeCachedOpen, "same-version reopen must not read the PDF again");
    const firstCachedRequestId = cachedPdfOpen.request.id;
    await page.evaluate(() => {
      globalThis.__canvas2dEngine.openFileCardPreview(globalThis.__canvas2dEngine.getSnapshotData().items[0]);
    });
    await page.waitForFunction((previousId) => {
      const request = globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0];
      return request?.id && request.id !== previousId && request.previewStatus === "ready";
    }, firstCachedRequestId);
    const repeatedOpen = await page.evaluate(() => ({
      requests: globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests,
      runtime: globalThis.__canvas2dEngine.getDocumentPreviewRuntimeSnapshot(),
      memoVisible: globalThis.__canvas2dEngine.getSnapshotData().items[0]?.memoVisible,
    }));
    assert.strictEqual(repeatedOpen.requests.length, 1);
    assert.strictEqual(repeatedOpen.runtime.activeSessions, 1);
    assert.strictEqual(repeatedOpen.requests[0].restoreMemoVisible, true);
    assert.strictEqual(repeatedOpen.memoVisible, false);
    await page.evaluate(() => {
      const request = globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0];
      globalThis.__canvas2dEngine.closeFileCardPreview(request.id);
    });
    await page.waitForFunction(() => globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests.length === 0);
    assert.strictEqual(await page.evaluate(() => globalThis.__canvas2dEngine.getSnapshotData().items[0]?.memoVisible), true);

    await page.evaluate(() => {
      const engine = globalThis.__canvas2dEngine;
      engine.openFileCardPreview(engine.getSnapshotData().items[0]);
    });
    await page.waitForFunction(() => globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0]?.previewStatus === "ready");
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("selection.delete"));
    await page.waitForFunction(() => {
      const engine = globalThis.__canvas2dEngine;
      return engine.getSnapshot().fileCardPreviewRequests.length === 0 && engine.getSnapshotData().items.length === 0;
    });
    const deletedPreview = await page.evaluate(() => globalThis.__canvas2dEngine.getDocumentPreviewRuntimeSnapshot());
    assert.strictEqual(deletedPreview.activeSessions, 0, "deleting a previewed file card must close its session");
    await page.evaluate(() => globalThis.__canvas2dEngine.runCommand("canvas.undo"));
    await page.waitForFunction(() => globalThis.__canvas2dEngine.getSnapshotData().items.length === 1);
    const restoredAfterDelete = await page.evaluate(() => ({
      requests: globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests.length,
      memoVisible: globalThis.__canvas2dEngine.getSnapshotData().items[0]?.memoVisible,
    }));
    assert.deepStrictEqual(restoredAfterDelete, { requests: 0, memoVisible: true });

    await page.evaluate(() => {
      globalThis.__FREEFLOW_PREVIEW_TEST.delay = 180;
      globalThis.__FREEFLOW_PREVIEW_TEST.version += 1;
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
      globalThis.__FREEFLOW_PREVIEW_TEST.version += 1;
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
      globalThis.__FREEFLOW_PREVIEW_TEST.version += 1;
      const item = {
        id: "preview-docx-card",
        type: "fileCard",
        x: 720,
        y: 180,
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
    const cachedDocx = await page.evaluate(() => ({
      request: globalThis.__canvas2dEngine.getSnapshot().fileCardPreviewRequests[0],
      runtime: globalThis.__canvas2dEngine.getDocumentPreviewRuntimeSnapshot(),
    }));
    assert.strictEqual(cachedDocx.request.previewCacheHit, true);
    assert(cachedDocx.runtime.artifactByteSize > 0, "DOCX parsed output should remain in the preview cache");
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
