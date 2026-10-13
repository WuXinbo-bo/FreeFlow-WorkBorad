const assert = require('node:assert/strict');

async function main() {
  const { createByteBudgetLru } = await import('../public/src/engines/canvas2d-core/perf/byteBudgetLru.js');
  const evictions = [];
  const cache = createByteBudgetLru({ maxBytes: 10, estimateSize: value => value.bytes, onEvict: value => evictions.push(value.id) });
  assert(cache.set('small', { id: 'small', bytes: 4 }));
  assert.equal(cache.set('large', { id: 'large', bytes: 11 }), false);
  assert(cache.has('small'), 'rejected oversized entry evicted usable content');
  assert.equal(cache.byteSize, 4);
  assert.deepEqual(evictions, ['large']);
  assert(cache.set('second', { id: 'second', bytes: 7 }));
  assert.equal(cache.byteSize, 7);
  cache.clear();
  assert.equal(cache.byteSize, 0);
  const zeroEvictions = [];
  const disabled = createByteBudgetLru({ maxEntries: 0, onEvict: value => zeroEvictions.push(value) });
  assert.equal(disabled.set('x', 'x'), false);
  assert.deepEqual(zeroEvictions, ['x']);

  const { renderSnapshotToTileExports } = await import('../public/src/engines/canvas2d-core/export/tileExport.js');
  let allocations = 0;
  const documentRef = { createElement() { allocations++; throw new Error('unsafe allocation'); } };
  const oversized = await renderSnapshotToTileExports({ items: [{ type: 'shape' }], bounds: { left: 0, top: 0, right: 20000, bottom: 20000, width: 20000, height: 20000 } }, { documentRef });
  assert.equal(oversized.code, 'TILE_EXPORT_SIZE_LIMIT');
  assert.equal(allocations, 0, 'size check occurred after allocation');
  const canceled = await renderSnapshotToTileExports({}, { signal: AbortSignal.abort(), documentRef });
  assert(canceled.canceled);
  assert.equal(allocations, 0);

  const { savePdfBytes } = await import('../public/src/engines/canvas2d-core/export/savePdfBytes.js');
  const controller = new AbortController();
  let writes = 0;
  globalThis.desktopShell = {
    pickPdfSavePath: async () => { controller.abort(); return { filePath: '/must-not-write.pdf' }; },
    writeFile: async () => { writes++; return { ok: true }; },
  };
  try {
    const result = await savePdfBytes(new Uint8Array([1, 2]), { signal: controller.signal });
    assert(result.canceled, 'canceling in the save dialog was ignored');
    assert.equal(writes, 0, 'canceled PDF wrote a file');
  } finally {
    delete globalThis.desktopShell;
  }
  const { createHostExportFileAdapter } = await import('../public/src/engines/canvas2d-core/export/host/hostExportFileAdapter.js');
  const png = 'data:image/png;base64,iVBOR' + 'A'.repeat(128);
  let imports = 0;
  const adapter = createHostExportFileAdapter({ useLocalFileSystem: true, saveImageDataToImportFolder: async () => {
    imports++;
    return { ok: false, canceled: true };
  } });
  assert((await adapter.saveDataUrlAsImage(png)).canceled, 'image cancellation became an error');
  const fallbackController = new AbortController();
  assert((await adapter.saveDataUrlAsImage('', { signal: fallbackController.signal, onFallbackDataUrl: async () => {
    fallbackController.abort();
    return png;
  } })).canceled);
  assert.equal(imports, 1, 'canceled fallback still saved an image');
  for (const method of ['saveWordAstAsDocxFile', 'saveHtmlAsDocxWordFile']) {
    const wordController = new AbortController(); let wordWrites = 0;
    const generate = async payload => {
      assert.equal(payload.returnBytes, true, 'Word saving still happened outside the cancelable adapter');
      return { ok: true, bytes: new Uint8Array([80, 75, 3, 4]) };
    };
    globalThis.desktopShell = { exportWordDocx: generate, exportRichTextDocx: generate,
      pickTextSavePath: async () => { wordController.abort(); return { filePath: '/must-not-write.docx' }; },
      writeFile: async () => { wordWrites++; return { ok: true }; } };
    try {
      const result = await adapter[method](method === 'saveWordAstAsDocxFile' ? {} : '<p>Word</p>', { signal: wordController.signal });
      assert(result.canceled, `${method} ignored dialog cancellation`);
      assert.equal(wordWrites, 0, 'canceled Word wrote a file');
    } finally { delete globalThis.desktopShell; }
  }
  console.log('[check-canvas-integrity-boundaries] cache disposal, preallocation limits and PDF dialog cancellation passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
