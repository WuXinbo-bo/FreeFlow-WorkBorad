"use strict";

const assert = require("node:assert/strict");

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const runtimeModule = await import("../../public/src/engines/canvas2d-core/import/runtime/createStructuredImportRuntime.js");
  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createStructuredImportRuntime } = runtimeModule;
  const runtime = createStructuredImportRuntime();
  const descriptor = createInputDescriptor({
    descriptorId: "runtime-composed",
    channel: INPUT_CHANNELS.DRAG_DROP,
    sourceKind: INPUT_SOURCE_KINDS.MIXED,
    entries: [
      readyEntry("html", "html", "text/html", { html: "<h2>Heading</h2><p>Body</p>", text: "Heading Body" }),
      readyEntry("plain", "text", "text/plain", { text: "Heading Body" }),
      readyEntry("image", "image", "image/png", { imageDataUrl: "data:image/png;base64,AA==" }),
      readyEntry("file", "file", "application/pdf", { filePath: "D:\\tmp\\paper.pdf" }, { name: "paper.pdf" }),
      readyEntry("uri", "uri", "text/uri-list", { uri: "https://example.com/reference" }),
      readyEntry("bad-image", "image", "image/png", { text: "missing image payload" }, { name: "bad.png" }),
    ],
  });
  const result = await runtime.runDescriptor({
    descriptor,
    board: { items: [], selectedIds: [] },
    anchorPoint: { x: 100, y: 120 },
    context: { importBatchId: "batch-runtime" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.commitResult.ok, true);
  assert.equal(result.commitResult.items.some((item) => item.type === "text"), true);
  assert.equal(result.commitResult.items.some((item) => item.type === "image"), true);
  assert.equal(result.commitResult.items.some((item) => item.type === "fileCard"), true);
  assert.equal(result.commitResult.items.every((item) => item.importBatch?.id === "batch-runtime"), true);
  assert.deepEqual(result.commitResult.items.map((item) => item.importBatch?.index), result.commitResult.items.map((_, index) => index));
  assert.equal(statusOf(result, "html"), "consumed");
  assert.equal(statusOf(result, "plain"), "deduplicated");
  assert.equal(statusOf(result, "bad-image"), "failed");
  assert.equal(result.commitResult.layoutIssues.length, 0);
  console.log("[structured-import-runtime] ok: composed import retained semantics, attachments and failure manifest");
}

function readyEntry(entryId, kind, mimeType, raw, extra = {}) {
  return { entryId, kind, mimeType, status: "ready", errorCode: "none", raw, ...extra };
}

function statusOf(result, entryId) {
  return result.representationPlan?.manifest?.find((item) => item.entryId === entryId)?.status || "";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
