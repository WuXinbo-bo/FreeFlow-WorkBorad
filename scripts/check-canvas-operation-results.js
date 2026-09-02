const assert = require("node:assert/strict");

async function main() {
  const {
    CANVAS_OPERATION_STATUS,
    createCanvasOperationResult,
  } = await import("../public/src/engines/canvas2d-core/operations/canvasOperationResult.js");
  const { createClipboardBroker } = await import(
    "../public/src/engines/canvas2d-core/brokers/clipboardBroker.js"
  );

  const sourceItem = {
    id: "text-a",
    type: "text",
    title: "Heading",
    plainText: "Heading",
    html: "<h2>Heading</h2>",
  };

  const completeBroker = createClipboardBroker({
    writeClipboardPayload: async () => ({
      ok: true,
      writtenFormats: ["application/x-freeflow-canvas-marker", "text/html", "text/markdown", "text/plain"],
    }),
  });
  const completePayload = {
    ...completeBroker.buildPayloadFromItems([sourceItem]),
    markdown: "## Heading",
  };
  const complete = await completeBroker.copyPayloadToClipboard(completePayload);
  assert.equal(complete.status, CANVAS_OPERATION_STATUS.SUCCESS);
  assert.equal(complete.internalStored, true);
  assert.equal(complete.systemWritten, true);
  assert(complete.providedFormats.includes("text/markdown"));
  assert.equal(complete.payload.clipboardId, completePayload.clipboardId);

  const downgradedBroker = createClipboardBroker({
    writeClipboardPayload: async () => false,
    writeClipboardHtml: async () => false,
    writeClipboardText: async () => true,
  });
  const downgraded = await downgradedBroker.copyItemsToClipboard([sourceItem]);
  assert.equal(downgraded.status, CANVAS_OPERATION_STATUS.DEGRADED);
  assert.equal(downgraded.systemWritten, true);
  assert.deepEqual(downgraded.providedFormats, ["text/plain"]);
  assert.equal(downgraded.fallbackUsed, true);

  const internalOnlyBroker = createClipboardBroker({
    writeClipboardPayload: async () => {
      throw new Error("permission denied");
    },
    writeClipboardHtml: async () => false,
    writeClipboardText: async () => false,
  });
  const internalOnly = await internalOnlyBroker.copyItemsToClipboard([sourceItem]);
  assert.equal(internalOnly.status, CANVAS_OPERATION_STATUS.DEGRADED);
  assert.equal(internalOnly.ok, true);
  assert.equal(internalOnly.internalStored, true);
  assert.equal(internalOnly.systemWritten, false);
  assert.equal(internalOnly.code, "COPY_INTERNAL_ONLY");
  assert(internalOnly.errors.length > 0);

  const invalid = await internalOnlyBroker.copyPayloadToClipboard(null);
  assert.equal(invalid.status, CANVAS_OPERATION_STATUS.FAILED);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.internalStored, false);

  const mixedExport = createCanvasOperationResult({
    operation: "export",
    code: "WORD_EXPORT_OK",
    requestedFormats: ["docx"],
    providedFormats: ["docx"],
    entries: [
      { id: "text-a", type: "text", status: "completed" },
      { id: "image-a", type: "image", status: "skipped", reason: "unsupported-type" },
    ],
  });
  assert.equal(mixedExport.status, CANVAS_OPERATION_STATUS.DEGRADED);
  assert.equal(mixedExport.ok, true);
  assert.equal(mixedExport.skippedCount, 1);

  const { createStructuredExportRuntime } = await import(
    "../public/src/engines/canvas2d-core/export/runtime/createStructuredExportRuntime.js"
  );
  const exportRuntime = createStructuredExportRuntime({
    fileAdapter: {
      saveTextAsFile: async () => ({ ok: true, path: "D:\\tmp\\heading.txt" }),
    },
  });
  const textExport = await exportRuntime.exportTextItem(sourceItem);
  assert.equal(textExport.operationResult.operation, "export");
  assert.equal(textExport.operationResult.status, CANVAS_OPERATION_STATUS.SUCCESS);
  assert.deepEqual(textExport.operationResult.providedFormats, ["txt"]);

  console.log("[check-canvas-operation-results] ok: 6 result states validated");
}

main().catch((error) => {
  console.error(`[check-canvas-operation-results] ${error.stack || error.message}`);
  process.exitCode = 1;
});
