const assert = require("assert");

async function main() {
  const { createDocumentPreviewRuntime } = await import(
    "../public/src/engines/canvas2d-core/documentPreview/documentPreviewRuntime.js"
  );
  const { createVisiblePageWindow } = await import(
    "../public/src/engines/canvas2d-core/documentPreview/pdfVisiblePageRenderer.js"
  );

  const runtime = createDocumentPreviewRuntime({ maxEntries: 2, maxBytes: 16 });
  const first = runtime.createSession({ id: "preview-a", kind: "pdf", mime: "application/pdf" });
  assert.strictEqual(first.status, "loading");
  const ready = runtime.commit(first.id, first.generation, { bytes: new Uint8Array([1, 2, 3, 4]) });
  assert.strictEqual(ready.status, "ready");
  assert.strictEqual(ready.byteLength, 4);
  const data = runtime.getData(first.id, first.generation);
  assert.deepStrictEqual(Array.from(data.bytes), [1, 2, 3, 4]);
  data.bytes[0] = 9;
  assert.deepStrictEqual(Array.from(runtime.getData(first.id, first.generation).bytes), [1, 2, 3, 4]);

  const retried = runtime.retry(first.id);
  assert.strictEqual(retried.status, "loading");
  assert.notStrictEqual(retried.generation, first.generation);
  assert.strictEqual(runtime.commit(first.id, first.generation, { bytes: new Uint8Array([7]) }), null);
  assert.strictEqual(runtime.getStats().staleCommitCount, 1);
  runtime.fail(first.id, retried.generation, "failed on purpose");
  assert.strictEqual(runtime.getHandle(first.id).status, "failed");
  assert.strictEqual(runtime.closeSession(first.id), true);
  assert.strictEqual(runtime.closeSession(first.id), false);

  assert.deepStrictEqual(createVisiblePageWindow(1, 5, 2), [1, 2, 3]);
  assert.deepStrictEqual(createVisiblePageWindow(3, 5, 2), [3, 2, 4, 1, 5]);
  assert.deepStrictEqual(createVisiblePageWindow(5, 5, 2), [5, 4, 3]);
  runtime.dispose();
  console.log("[check-document-preview-runtime] ok");
}

main().catch((error) => {
  console.error(`[check-document-preview-runtime] ${error.stack || error.message}`);
  process.exitCode = 1;
});
