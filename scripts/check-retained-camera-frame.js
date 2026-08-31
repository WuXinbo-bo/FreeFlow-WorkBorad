const assert = require("assert");

function createFakeSurface(width, height) {
  const calls = [];
  return {
    width,
    height,
    calls,
    getContext() {
      return {
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        setTransform: (...args) => calls.push(["setTransform", ...args]),
        clearRect: (...args) => calls.push(["clearRect", ...args]),
        save: () => calls.push(["save"]),
        restore: () => calls.push(["restore"]),
        translate: (...args) => calls.push(["translate", ...args]),
        scale: (...args) => calls.push(["scale", ...args]),
        drawImage: (...args) => calls.push(["drawImage", ...args]),
      };
    },
  };
}

async function main() {
  const {
    createRetainedCameraFrame,
    getRetainedFrameTransform,
    isRetainedFrameCoverageValid,
  } = await import("../public/src/engines/canvas2d-core/render/retainedCameraFrame.js");
  const queued = [];
  const runtime = createRetainedCameraFrame({
    marginPx: 200,
    scheduleTask: (task) => {
      queued.push(task);
      return () => {};
    },
    surfaceFactory: createFakeSurface,
  });
  const baseView = { scale: 1, offsetX: 40, offsetY: 60 };
  let drawCount = 0;
  assert(runtime.schedulePrepare({
    key: "scene-1",
    width: 1000,
    height: 700,
    dpr: 1,
    view: baseView,
    draw: ({ view, width, height }) => {
      drawCount += 1;
      assert.deepStrictEqual(view, { scale: 1, offsetX: 240, offsetY: 260 });
      assert.strictEqual(width, 1400);
      assert.strictEqual(height, 1100);
    },
  }), "retained frame did not schedule");
  assert.strictEqual(runtime.getStats().pending, true, "scheduled retained frame was not pending");
  assert.strictEqual(runtime.getStats().pendingKey, "scene-1", "pending retained content ownership was not exposed");
  queued.shift()();
  assert.strictEqual(drawCount, 1, "retained frame did not prepare once");
  assert.strictEqual(runtime.getStats().ready, true, "retained frame did not become ready");
  assert.strictEqual(runtime.getReadiness({
    view: baseView,
    width: 1000,
    height: 700,
    dpr: 1,
    key: "scene-1",
  }).ready, true, "matching retained frame was not reported ready");
  assert.strictEqual(runtime.getReadiness({
    view: baseView,
    width: 1000,
    height: 700,
    dpr: 1,
    key: "scene-2",
  }).reason, "content", "stale retained content was reported ready");
  assert.strictEqual(runtime.getReadiness({
    view: baseView,
    width: 1000,
    height: 700,
    dpr: 2,
    key: "scene-1",
  }).reason, "dpr", "DPR mismatch was reported ready");

  const stableFrame = {
    surface: {},
    view: baseView,
    width: 1000,
    height: 700,
    marginPx: 200,
    extendedWidth: 1400,
    extendedHeight: 1100,
  };
  assert(isRetainedFrameCoverageValid(stableFrame, { scale: 1, offsetX: -120, offsetY: 60 }, 1000, 700));
  assert(!isRetainedFrameCoverageValid(stableFrame, { scale: 1, offsetX: -220, offsetY: 60 }, 1000, 700));
  const transform = getRetainedFrameTransform(baseView, { scale: 1.25, offsetX: 25, offsetY: 35 }, 200);
  assert.deepStrictEqual(transform, { ratio: 1.25, translateX: -275, translateY: -290 });

  const target = createFakeSurface(1000, 700);
  const presented = runtime.present({
    ctx: target.getContext("2d"),
    view: { scale: 1.1, offsetX: 20, offsetY: 40 },
    width: 1000,
    height: 700,
    dpr: 1,
    key: "scene-1",
  });
  assert.strictEqual(presented.presented, true, "covered camera view did not reuse the retained frame");
  assert(target.calls.some((entry) => entry[0] === "drawImage"), "retained frame did not composite its surface");
  const missed = runtime.present({
    ctx: target.getContext("2d"),
    view: { scale: 1, offsetX: -400, offsetY: 40 },
    width: 1000,
    height: 700,
    dpr: 1,
    key: "scene-1",
  });
  assert.strictEqual(missed.presented, false, "out-of-coverage camera view reused stale pixels");
  runtime.clear();
  assert.strictEqual(runtime.getStats().ready, false, "retained frame survived clear");
  console.log("[check-retained-camera-frame] ok");
}

main().catch((error) => {
  console.error(`[check-retained-camera-frame] ${error.stack || error.message}`);
  process.exitCode = 1;
});
