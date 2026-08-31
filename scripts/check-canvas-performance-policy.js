const assert = require("assert");

function createStats(frameId, frameDurationMs, progressivePending = false) {
  return {
    frameContext: { frameId },
    frameDurationMs,
    progressiveRender: { pending: progressivePending },
  };
}

async function main() {
  const { createFramePerformanceWindow } = await import(
    "../public/src/engines/canvas2d-core/perf/framePerformanceWindow.js"
  );
  const { resolveTileScaleLevel, resolveTileSceneSize } = await import(
    "../public/src/engines/canvas2d-core/render/tileSceneCache.js"
  );
  const { createByteBudgetLru } = await import(
    "../public/src/engines/canvas2d-core/perf/byteBudgetLru.js"
  );
  const { buildSceneIndex, querySceneIndex, resolveSceneIndex } = await import(
    "../public/src/engines/canvas2d-core/scene/sceneIndex.js"
  );
  const { invalidateHitTestSpatialIndex, queryHitTestSpatialIndex, resolveHitTestSpatialIndex } = await import(
    "../public/src/engines/canvas2d-core/hitTestSpatialIndex.js"
  );

  const window = createFramePerformanceWindow({ maxSamples: 40, minSamples: 8 });
  assert.strictEqual(window.getSnapshot().pressure, 0, "empty performance window created pressure");
  for (let frameId = 1; frameId <= 39; frameId += 1) {
    assert.strictEqual(window.record(createStats(frameId, 8)), true);
  }
  window.record(createStats(40, 120));
  const isolatedSpike = window.getSnapshot();
  assert.strictEqual(isolatedSpike.sampleCount, 40, "performance window lost samples");
  assert.strictEqual(isolatedSpike.p95Ms, 8, "single frame spike polluted P95");
  assert.strictEqual(isolatedSpike.pressure, 0, "single frame spike triggered quality pressure");
  assert.strictEqual(window.record(createStats(40, 120)), false, "duplicate frame was sampled twice");

  for (let frameId = 41; frameId <= 80; frameId += 1) {
    window.record(createStats(frameId, 34, frameId % 4 === 0));
  }
  const sustainedLoad = window.getSnapshot();
  assert.strictEqual(sustainedLoad.sampleCount, 40, "performance window exceeded its capacity");
  assert(sustainedLoad.p50Ms <= sustainedLoad.p95Ms, "P50 exceeded P95");
  assert(sustainedLoad.p95Ms <= sustainedLoad.p99Ms, "P95 exceeded P99");
  assert(sustainedLoad.pressure > 0.75, "sustained slow frames did not create quality pressure");
  assert(sustainedLoad.progressivePendingRatio > 0, "progressive pressure was not retained");
  window.clear();
  assert.deepStrictEqual(
    { sampleCount: window.getSnapshot().sampleCount, pressure: window.getSnapshot().pressure },
    { sampleCount: 0, pressure: 0 },
    "clearing the performance window retained stale pressure"
  );

  const bucketA = resolveTileScaleLevel(1.001);
  const bucketB = resolveTileScaleLevel(1.08);
  const bucketC = resolveTileScaleLevel(1.1);
  assert.strictEqual(bucketA, bucketB, "nearby interaction scales did not share a cache level");
  assert(bucketA >= 1.08, "interaction cache level undersampled the requested scale");
  assert(bucketC > bucketB, "scale level did not advance after crossing its boundary");
  assert.strictEqual(resolveTileScaleLevel(1.0814, { exact: true }), 1.081, "stable scale was not exact");
  const minimumBucket = resolveTileScaleLevel(0.01);
  assert(minimumBucket >= 0.1, "tile scale dropped below its supported minimum");
  assert(minimumBucket <= 0.11, "minimum tile scale was oversampled beyond one cache level");
  assert.strictEqual(resolveTileSceneSize(0.1), 10240, "low zoom did not preserve a stable tile pixel size");
  assert.strictEqual(resolveTileSceneSize(1), 1024, "1x tile scene size changed unexpectedly");
  assert.strictEqual(resolveTileSceneSize(2), 512, "high zoom tile scene size did not shrink with raster scale");

  const items = [
    { id: "small", type: "shape", shapeType: "rect", x: 0, y: 0, width: 120, height: 80 },
    { id: "huge", type: "shape", shapeType: "rect", x: -5_000_000, y: -5_000_000, width: 10_000_000, height: 10_000_000 },
  ];
  const boundedIndex = buildSceneIndex(items, { revision: 7, cellSize: 320, maxCellsPerRecord: 8 });
  assert.strictEqual(boundedIndex.largeRecordIndexes.length, 1, "huge element expanded across the spatial grid");
  assert(boundedIndex.gridEntryCount <= 8, "spatial grid exceeded the configured per-record cell budget");
  assert(
    querySceneIndex(boundedIndex, { left: 4_000_000, top: 4_000_000, right: 4_000_100, bottom: 4_000_100 })
      .some((record) => record.itemId === "huge"),
    "overflow record was omitted from a bounded scene query"
  );
  assert.strictEqual(
    querySceneIndex(boundedIndex, { left: -6_000_000, top: -6_000_000, right: 6_000_000, bottom: 6_000_000 }).length,
    2,
    "large query fallback omitted indexed records"
  );
  const sharedSceneIndex = resolveSceneIndex(items, { revision: 7 });
  const sharedHitTestIndex = resolveHitTestSpatialIndex(items);
  assert.strictEqual(sharedHitTestIndex, sharedSceneIndex, "scene and hit testing rebuilt separate spatial indexes");
  assert.strictEqual(
    queryHitTestSpatialIndex(sharedHitTestIndex, { left: 10, top: 10, right: 11, bottom: 11 }).length,
    2,
    "shared hit-test index did not retain overflow candidates"
  );
  invalidateHitTestSpatialIndex(items);
  assert.notStrictEqual(
    resolveSceneIndex(items, { revision: 7 }),
    sharedSceneIndex,
    "hit-test invalidation did not invalidate the shared scene index"
  );

  const evicted = [];
  const byteCache = createByteBudgetLru({
    maxEntries: 3,
    maxBytes: 10,
    estimateSize: (entry) => entry.bytes,
    onEvict: (_, key, reason) => evicted.push(`${key}:${reason}`),
  });
  byteCache.set("a", { bytes: 4 });
  byteCache.set("b", { bytes: 4 });
  byteCache.set("c", { bytes: 4 });
  assert.deepStrictEqual(byteCache.getStats(), {
    size: 2,
    byteSize: 8,
    maxEntries: 3,
    maxBytes: 10,
    evictionCount: 1,
  }, "byte cache did not enforce its memory budget");
  byteCache.get("b");
  byteCache.set("d", { bytes: 4 });
  assert.deepStrictEqual(Array.from(byteCache.keys()), ["b", "d"], "byte cache did not preserve LRU order");
  assert(evicted.includes("a:budget") && evicted.includes("c:budget"), "byte cache did not report budget evictions");

  console.log("[check-canvas-performance-policy] ok");
}

main().catch((error) => {
  console.error(`[check-canvas-performance-policy] ${error.stack || error.message}`);
  process.exitCode = 1;
});
