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

  console.log("[check-canvas-performance-policy] ok");
}

main().catch((error) => {
  console.error(`[check-canvas-performance-policy] ${error.stack || error.message}`);
  process.exitCode = 1;
});
