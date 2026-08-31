const assert = require("assert");

async function main() {
  const { createResourcePrewarmRuntime } = await import(
    "../public/src/engines/canvas2d-core/perf/resourcePrewarmRuntime.js"
  );
  const scheduled = [];
  const executed = [];
  const runtime = createResourcePrewarmRuntime({
    maxTasksPerFlush: 2,
    scheduleTask: (task) => {
      const record = { task, canceled: false };
      scheduled.push(record);
      return () => { record.canceled = true; };
    },
  });

  runtime.request("predicted", () => executed.push("predicted"), { priority: "predicted" });
  runtime.request("visible", () => executed.push("visible"), { priority: "visible" });
  runtime.request("near", () => executed.push("near"), { priority: "near" });
  scheduled.shift().task();
  assert.deepStrictEqual(executed, ["visible", "near"], "prewarm priority order was not preserved");
  scheduled.shift().task();
  assert.deepStrictEqual(executed, ["visible", "near", "predicted"]);

  runtime.request("stale", () => executed.push("stale"), { priority: "visible" });
  const staleTask = scheduled.shift();
  runtime.setPaused(true, { stale: true });
  assert.strictEqual(staleTask.canceled, true, "active interaction did not cancel prewarm work");
  staleTask.task();
  assert(!executed.includes("stale"), "stale prewarm task ran during active interaction");
  runtime.request("deferred", () => executed.push("deferred"), { priority: "visible" });
  assert.strictEqual(scheduled.length, 0, "paused prewarm runtime scheduled hot-path work");
  runtime.setPaused(false);
  scheduled.shift().task();
  assert(executed.includes("deferred"), "prewarm work did not recover after interaction");
  assert(runtime.getSnapshot().staleCount >= 1, "stale prewarm completion was not recorded");
  runtime.dispose();

  let imageInstanceCount = 0;
  let decodeCount = 0;
  global.Image = class FakeImage {
    constructor() {
      imageInstanceCount += 1;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.onload = null;
      this.onerror = null;
      this.src = "";
    }

    decode() {
      decodeCount += 1;
      return Promise.resolve();
    }
  };
  const { createImageRenderer } = await import(
    "../public/src/engines/canvas2d-core/rendererImage.js"
  );
  const imageRenderer = createImageRenderer();
  const imageItem = { id: "prewarm-image", type: "image", dataUrl: "data:image/png;base64,AA==" };
  assert.strictEqual(imageRenderer.prewarmResource(imageItem), true);
  assert.strictEqual(imageRenderer.prewarmResource(imageItem), true);
  assert.strictEqual(imageInstanceCount, 1, "duplicate prewarm created a second image resource");
  assert.strictEqual(decodeCount, 1, "duplicate prewarm requested image decode twice");
  assert.strictEqual(imageRenderer.getResourceStats().prewarmHitCount, 1, "image prewarm cache hit was not recorded");
  imageRenderer.disposeResources();
  delete global.Image;
  console.log("[check-canvas-resource-prewarm-runtime] ok");
}

main().catch((error) => {
  console.error(`[check-canvas-resource-prewarm-runtime] ${error.stack || error.message}`);
  process.exitCode = 1;
});
