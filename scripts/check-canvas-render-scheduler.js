const assert = require("assert");

async function main() {
  const { CANVAS_PERFORMANCE_LANES, CANVAS_PERFORMANCE_PHASES } = await import(
    "../public/src/engines/canvas2d-core/perf/canvasPerformanceRuntime.js"
  );
  const { createRenderScheduler } = await import(
    "../public/src/engines/canvas2d-core/render/renderScheduler.js"
  );

  let phase = CANVAS_PERFORMANCE_PHASES.STEADY;
  let nextFrameId = 0;
  const queuedFrames = new Map();
  const rendered = [];
  const scheduler = createRenderScheduler({
    requestFrame: (callback) => {
      nextFrameId += 1;
      queuedFrames.set(nextFrameId, callback);
      return nextFrameId;
    },
    cancelFrame: (frameId) => queuedFrames.delete(frameId),
    canRunLane: (lane) => {
      if (lane === CANVAS_PERFORMANCE_LANES.INPUT) return true;
      if (phase === CANVAS_PERFORMANCE_PHASES.ACTIVE) return false;
      if (lane === CANVAS_PERFORMANCE_LANES.BACKGROUND) {
        return phase === CANVAS_PERFORMANCE_PHASES.STEADY;
      }
      if (lane === CANVAS_PERFORMANCE_LANES.RECOVERY) {
        return phase === CANVAS_PERFORMANCE_PHASES.RECOVERING || phase === CANVAS_PERFORMANCE_PHASES.STEADY;
      }
      return true;
    },
    collectFrameInput: (input) => input,
    renderFrame: ({ lane, dirtyState }) => {
      rendered.push(`${lane}:${dirtyState.reason}`);
      return lane;
    },
  });

  function runNextFrame(timestamp = 1) {
    const entry = queuedFrames.entries().next().value;
    assert(entry, "expected a scheduled frame");
    const [frameId, callback] = entry;
    queuedFrames.delete(frameId);
    return callback(timestamp);
  }

  scheduler.schedule({ lane: CANVAS_PERFORMANCE_LANES.BACKGROUND, reason: "warm-cache", sceneDirty: true });
  scheduler.schedule({ lane: CANVAS_PERFORMANCE_LANES.COMMIT, reason: "content-commit", sceneDirty: true });
  phase = CANVAS_PERFORMANCE_PHASES.ACTIVE;
  scheduler.flushNow({ lane: CANVAS_PERFORMANCE_LANES.INPUT, reason: "wheel-zoom", viewDirty: true });
  assert.deepStrictEqual(rendered, ["input:wheel-zoom"], "input flush consumed deferred work");
  assert.strictEqual(queuedFrames.size, 0, "blocked work kept scheduling frames during active input");
  assert.strictEqual(scheduler.peekDirtyState(CANVAS_PERFORMANCE_LANES.COMMIT).sceneDirty, true);
  assert.strictEqual(scheduler.peekDirtyState(CANVAS_PERFORMANCE_LANES.BACKGROUND).sceneDirty, true);

  phase = CANVAS_PERFORMANCE_PHASES.COMMITTING;
  scheduler.resume();
  runNextFrame();
  assert.deepStrictEqual(rendered, ["input:wheel-zoom", "commit:content-commit"]);
  assert.strictEqual(queuedFrames.size, 0, "background work escaped the commit phase");

  phase = CANVAS_PERFORMANCE_PHASES.RECOVERING;
  scheduler.schedule({ lane: CANVAS_PERFORMANCE_LANES.RECOVERY, reason: "detail-recovery", overlayDirty: true });
  scheduler.resume();
  phase = CANVAS_PERFORMANCE_PHASES.ACTIVE;
  runNextFrame();
  assert.strictEqual(rendered.at(-1), "commit:content-commit", "stale recovery ran after rapid re-entry");
  assert.strictEqual(scheduler.peekDirtyState(CANVAS_PERFORMANCE_LANES.RECOVERY).overlayDirty, true);

  phase = CANVAS_PERFORMANCE_PHASES.RECOVERING;
  scheduler.resume();
  runNextFrame();
  assert.strictEqual(rendered.at(-1), "recovery:detail-recovery");
  assert.strictEqual(queuedFrames.size, 0, "background work escaped the recovery phase");

  phase = CANVAS_PERFORMANCE_PHASES.STEADY;
  scheduler.resume();
  runNextFrame();
  assert.strictEqual(rendered.at(-1), "background:warm-cache");
  assert.strictEqual(scheduler.getFrameRevision(), 4);
  scheduler.dispose();
  console.log("[check-canvas-render-scheduler] ok");
}

main().catch((error) => {
  console.error(`[check-canvas-render-scheduler] ${error.stack || error.message}`);
  process.exitCode = 1;
});
