const assert = require("assert");

async function main() {
  const { createDocumentPreviewRuntime } = await import(
    "../public/src/engines/canvas2d-core/documentPreview/documentPreviewRuntime.js"
  );
  const { createVisiblePageWindow } = await import(
    "../public/src/engines/canvas2d-core/documentPreview/pdfVisiblePageRenderer.js"
  );
  const { createHydrationScheduler } = await import(
    "../public/src/engines/canvas2d-core/perf/hydrationScheduler.js"
  );

  const runtime = createDocumentPreviewRuntime({ maxEntries: 2, maxBytes: 4096 });
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

  const cachedSource = runtime.createSession({ id: "preview-cache-source", kind: "docx" });
  runtime.commit(cachedSource.id, cachedSource.generation, {
    bytes: new Uint8Array([8, 6, 7, 5]),
    contentKey: "C:/fixtures/spec.docx:4:1000",
  });
  assert.strictEqual(
    runtime.setArtifact(cachedSource.id, cachedSource.generation, "docx-html-v1", "<main>cached</main>"),
    true
  );
  const artifactBytes = runtime.getStats().artifactByteSize;
  assert(artifactBytes > 0, "derived preview artifacts must count toward the cache budget");
  runtime.closeSession(cachedSource.id);

  const cachedTarget = runtime.createSession({ id: "preview-cache-target", kind: "docx" });
  const attached = runtime.attachCached(
    cachedTarget.id,
    cachedTarget.generation,
    "C:/fixtures/spec.docx:4:1000"
  );
  assert.strictEqual(attached.status, "ready");
  assert.deepStrictEqual(
    Array.from(runtime.getData(cachedTarget.id, cachedTarget.generation).bytes),
    [8, 6, 7, 5]
  );
  assert.strictEqual(
    runtime.getArtifact(cachedTarget.id, cachedTarget.generation, "docx-html-v1"),
    "<main>cached</main>"
  );
  runtime.closeSession(cachedTarget.id);

  const changedTarget = runtime.createSession({ id: "preview-cache-changed", kind: "docx" });
  assert.strictEqual(
    runtime.attachCached(changedTarget.id, changedTarget.generation, "C:/fixtures/spec.docx:4:2000"),
    null,
    "a changed file version must not reuse stale preview bytes"
  );
  runtime.closeSession(changedTarget.id);

  const constrainedRuntime = createDocumentPreviewRuntime({ maxEntries: 1, maxBytes: 8 });
  const constrained = constrainedRuntime.createSession({ id: "preview-constrained", kind: "docx" });
  constrainedRuntime.commit(constrained.id, constrained.generation, {
    bytes: new Uint8Array([1, 2, 3, 4]),
    contentKey: "constrained:4:1",
  });
  constrainedRuntime.setArtifact(constrained.id, constrained.generation, "docx-html-v1", "0123456789");
  assert(constrainedRuntime.getStats().byteSize > 8, "active preview data must not be evicted while referenced");
  constrainedRuntime.closeSession(constrained.id);
  assert.strictEqual(constrainedRuntime.getStats().byteSize, 0, "closed previews must release over-budget artifacts");
  constrainedRuntime.dispose();

  assert.deepStrictEqual(createVisiblePageWindow(1, 5, 2), [1, 2, 3]);
  assert.deepStrictEqual(createVisiblePageWindow(3, 5, 2), [3, 2, 4, 1, 5]);
  assert.deepStrictEqual(createVisiblePageWindow(5, 5, 2), [5, 4, 3]);

  const scheduler = createHydrationScheduler({ maxTasksPerFlush: 4 });
  const completedTasks = [];
  scheduler.enqueue("viewport-task", () => completedTasks.push("viewport"));
  scheduler.enqueue(
    "preview-session-task",
    () => completedTasks.push("preview"),
    { staleOnGenerationChange: false }
  );
  scheduler.bumpGeneration();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepStrictEqual(completedTasks, ["preview"], "explicit preview sessions must survive viewport generations");
  assert.strictEqual(scheduler.getStats().queued, 0);

  runtime.dispose();
  console.log("[check-document-preview-runtime] ok");
}

main().catch((error) => {
  console.error(`[check-document-preview-runtime] ${error.stack || error.message}`);
  process.exitCode = 1;
});
