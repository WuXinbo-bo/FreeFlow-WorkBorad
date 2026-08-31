const assert = require("assert");

function createStats(frameId, frameDurationMs) {
  return {
    frameContext: { frameId },
    frameDurationMs,
    progressiveRender: { pending: false },
  };
}

async function main() {
  const {
    CANVAS_PERFORMANCE_PHASES,
    createCanvasPerformanceRuntime,
  } = await import("../public/src/engines/canvas2d-core/perf/canvasPerformanceRuntime.js");

  const scheduledResourceTasks = [];
  const runtime = createCanvasPerformanceRuntime({
    frameWindowOptions: { maxSamples: 12, minSamples: 4 },
    resourceBudgetOptions: {
      maxBytes: 10,
      scheduleTask: (task) => {
        const record = { task, canceled: false };
        scheduledResourceTasks.push(record);
        return () => { record.canceled = true; };
      },
    },
  });
  let resourceBytes = 18;
  runtime.registerResource({
    id: "test-cache",
    getStats: () => ({ byteSize: resourceBytes }),
    trimToBytes: (targetBytes) => {
      const released = Math.max(0, resourceBytes - targetBytes);
      resourceBytes = targetBytes;
      return released;
    },
  });
  const transitions = [];
  runtime.subscribe((snapshot, previousPhase) => {
    transitions.push(`${previousPhase}->${snapshot.phase}:${snapshot.sessionId}`);
  });

  const firstSession = runtime.beginInteraction("wheel-zoom");
  assert.strictEqual(runtime.getSnapshot().phase, CANVAS_PERFORMANCE_PHASES.ACTIVE);
  assert.strictEqual(runtime.getSnapshot().interactionCritical, true);
  assert.strictEqual(runtime.beginInteraction("wheel-zoom"), firstSession, "continuous input created a new session");
  runtime.requestResourceReconcile();
  assert.strictEqual(resourceBytes, 18, "active interaction reclaimed resources on the hot path");
  assert.strictEqual(runtime.getSnapshot().resources.deferred, true, "active resource pressure was not deferred");

  assert.strictEqual(runtime.beginCommit(firstSession, "wheel-zoom"), true);
  assert.strictEqual(runtime.getSnapshot().phase, CANVAS_PERFORMANCE_PHASES.COMMITTING);
  assert.strictEqual(runtime.beginRecovery(firstSession, "wheel-zoom"), true);
  assert.strictEqual(runtime.getSnapshot().phase, CANVAS_PERFORMANCE_PHASES.RECOVERING);
  assert.strictEqual(scheduledResourceTasks.length, 1, "recovery did not schedule deferred resource work");
  runtime.reconcileResourcesNow();
  assert.strictEqual(resourceBytes, 10, "recovery did not reconcile the unified resource budget");
  assert.strictEqual(scheduledResourceTasks[0].canceled, true, "explicit recovery left stale resource work queued");
  assert.strictEqual(runtime.finishRecovery(firstSession), true);
  assert.strictEqual(runtime.getSnapshot().phase, CANVAS_PERFORMANCE_PHASES.STEADY);

  resourceBytes = 18;
  const interruptedSession = runtime.beginInteraction("wheel-pan");
  runtime.requestResourceReconcile();
  assert.strictEqual(runtime.beginCommit(interruptedSession, "wheel-pan"), true);
  assert.strictEqual(runtime.beginRecovery(interruptedSession, "wheel-pan"), true);
  const staleResourceTask = scheduledResourceTasks.at(-1);
  const replacementSession = runtime.beginInteraction("wheel-pan");
  assert(replacementSession > interruptedSession, "recovery re-entry reused a stale session");
  assert.strictEqual(staleResourceTask.canceled, true, "rapid re-entry did not cancel recovery resource work");
  staleResourceTask.task();
  assert.strictEqual(resourceBytes, 18, "stale recovery resource work ran during active input");
  assert.strictEqual(runtime.finishRecovery(interruptedSession), false, "stale recovery completed a newer session");
  assert.strictEqual(runtime.getSnapshot().phase, CANVAS_PERFORMANCE_PHASES.ACTIVE);
  assert.strictEqual(runtime.beginCommit(replacementSession, "wheel-pan"), true);
  assert.strictEqual(runtime.beginRecovery(replacementSession, "wheel-pan"), true);
  scheduledResourceTasks.at(-1).task();
  assert.strictEqual(resourceBytes, 10, "replacement recovery did not reconcile deferred resources");
  assert.strictEqual(runtime.finishRecovery(replacementSession), true);

  runtime.setViewportIntent(true);
  assert.strictEqual(runtime.getSnapshot().viewportIntentActive, true);
  runtime.setViewportIntent(false);
  for (let frameId = 1; frameId <= 6; frameId += 1) {
    runtime.recordFrame(createStats(frameId, frameId <= 4 ? 8 : 18));
  }
  const snapshot = runtime.getSnapshot();
  assert.strictEqual(snapshot.performanceWindow.sampleCount, 6);
  assert(snapshot.performanceWindow.p95Ms >= 8, "frame window was not owned by the performance runtime");
  assert(transitions.some((entry) => entry.startsWith("recovering->active")), "rapid reverse transition was not reported");

  runtime.dispose();
  console.log("[check-canvas-performance-runtime] ok");
}

main().catch((error) => {
  console.error(`[check-canvas-performance-runtime] ${error.stack || error.message}`);
  process.exitCode = 1;
});
