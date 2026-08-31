const assert = require("assert");

async function main() {
  const { createCameraInteractionRuntime } = await import(
    "../public/src/engines/canvas2d-core/runtime/cameraInteractionRuntime.js"
  );
  let view = { scale: 1, offsetX: 0, offsetY: 0 };
  let nextFrameId = 0;
  const frames = new Map();
  const cancelled = [];
  const presentations = [];
  const runtime = createCameraInteractionRuntime({
    getView: () => view,
    presentView: (nextView, metadata) => {
      view = nextView;
      presentations.push({ view: nextView, metadata });
    },
    requestFrame: (callback) => {
      nextFrameId += 1;
      frames.set(nextFrameId, callback);
      return nextFrameId;
    },
    cancelFrame: (frameId) => {
      cancelled.push(frameId);
      frames.delete(frameId);
    },
  });

  runtime.update((base) => ({ ...base, offsetX: base.offsetX + 10 }), "pointer-pan");
  runtime.update((base) => ({ ...base, offsetX: base.offsetX + 15 }), "pointer-pan");
  assert.strictEqual(view.offsetX, 0, "camera was presented during the input event");
  assert.strictEqual(frames.size, 1, "camera input scheduled more than one frame");
  assert.strictEqual(runtime.getCurrentView().offsetX, 25, "camera deltas did not accumulate");
  const firstFrame = frames.values().next().value;
  frames.clear();
  firstFrame(16);
  assert.strictEqual(view.offsetX, 25, "camera was not presented on the scheduled frame");
  assert.strictEqual(presentations.length, 1, "batched input presented more than once");
  assert.strictEqual(presentations[0].metadata.timestamp, 16, "frame timestamp was not forwarded");

  runtime.update((base) => ({ ...base, scale: 1.25 }), "wheel-zoom");
  const finished = runtime.finish({ timestamp: 24 });
  assert.strictEqual(view.scale, 1.25, "finishing before RAF lost the pending camera");
  assert.strictEqual(finished.changed, true, "finished session did not report its visual change");
  assert.strictEqual(runtime.getSnapshot().active, false, "finished session remained active");
  assert.strictEqual(frames.size, 0, "finished session left a scheduled frame behind");

  runtime.update((base) => ({ ...base, offsetY: base.offsetY + 30 }), "wheel-pan");
  const staleFrame = frames.values().next().value;
  runtime.cancel();
  assert.strictEqual(runtime.getSnapshot().pending, false, "cancelled session retained pending input");
  staleFrame(32);
  assert.strictEqual(view.offsetY, 0, "stale frame changed the camera after cancellation");

  runtime.update((base) => ({ ...base, offsetY: base.offsetY + 40 }), "pointer-pan");
  const nextSession = runtime.getSnapshot();
  assert(nextSession.sessionId > finished.sessionId, "rapid re-entry reused the previous session");
  runtime.finish({ timestamp: 40 });
  assert.strictEqual(view.offsetY, 40, "re-entered session did not recover after cancellation");
  assert(cancelled.length >= 2, "pending frames were not cancelled during synchronous finish/cancel");

  console.log("[check-camera-interaction-runtime] ok");
}

main().catch((error) => {
  console.error(`[check-camera-interaction-runtime] ${error.message}`);
  process.exitCode = 1;
});
