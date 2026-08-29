"use strict";

async function main() {
  const {
    getCanvasLodScalePercent,
    getOverlayScaleBucket,
    isCanvasLodScale,
    isDetailedOverlayScale,
  } = await import("../public/src/engines/canvas2d-core/lodScale.js");

  assert(getCanvasLodScalePercent(0.15) === 15, "LOD percent changed at the low-zoom boundary");
  assert(getCanvasLodScalePercent(Number.NaN) === 100, "invalid scale fallback changed");
  assert(isCanvasLodScale(0.15, 0.15), "exact low-zoom boundary did not enter Canvas LOD");
  assert(!isCanvasLodScale(0.16, 0.15), "scale above the boundary remained in Canvas LOD");
  assert(!isDetailedOverlayScale(0.5, 0.5), "exact overlay boundary became detailed");
  assert(isDetailedOverlayScale(0.51, 0.5), "scale above the overlay boundary did not recover detail");

  const firstBucket = getOverlayScaleBucket(0.501, 0.02);
  const repeatedBucket = getOverlayScaleBucket(0.501, 0.02);
  const recoveredBucket = getOverlayScaleBucket(0.521, 0.02);
  assert(firstBucket === repeatedBucket, "repeated scale bucketing was unstable");
  assert(firstBucket !== recoveredBucket, "scale bucket did not advance after crossing a bucket boundary");

  console.log("[check-canvas-lod-scale] ok");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(`[check-canvas-lod-scale] ${error.message}`);
  process.exitCode = 1;
});
