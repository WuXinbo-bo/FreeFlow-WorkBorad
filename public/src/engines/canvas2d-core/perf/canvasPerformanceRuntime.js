import { createFramePerformanceWindow } from "./framePerformanceWindow.js";
import { createInteractionPriorityGate } from "./interactionPriorityGate.js";
import { createResourceBudgetRuntime } from "./resourceBudgetRuntime.js";

export const CANVAS_PERFORMANCE_PHASES = Object.freeze({
  STEADY: "steady",
  ACTIVE: "active",
  COMMITTING: "committing",
  RECOVERING: "recovering",
});

export const CANVAS_PERFORMANCE_LANES = Object.freeze({
  INPUT: "input",
  COMMIT: "commit",
  RECOVERY: "recovery",
  BACKGROUND: "background",
});

function normalizeReason(value = "") {
  return String(value || "").trim() || "interaction";
}

export function createCanvasPerformanceRuntime({
  interactionCooldownMs = 140,
  frameWindowOptions = null,
  resourceBudgetOptions = null,
} = {}) {
  const interactionGate = createInteractionPriorityGate({ cooldownMs: interactionCooldownMs });
  const frameWindow = createFramePerformanceWindow(frameWindowOptions || {});
  const resourceBudget = createResourceBudgetRuntime(resourceBudgetOptions || {});
  const listeners = new Set();
  let phase = CANVAS_PERFORMANCE_PHASES.STEADY;
  let sessionId = 0;
  let generation = 0;
  let reason = "";
  let viewportIntentActive = false;
  let transitionCount = 0;

  function getSnapshot() {
    const interactionCritical =
      phase === CANVAS_PERFORMANCE_PHASES.ACTIVE ||
      phase === CANVAS_PERFORMANCE_PHASES.COMMITTING;
    return Object.freeze({
      phase,
      sessionId,
      generation,
      reason,
      transitionCount,
      viewportIntentActive,
      interactionCritical,
      canRunRecovery: phase === CANVAS_PERFORMANCE_PHASES.RECOVERING,
      canRunBackground: phase === CANVAS_PERFORMANCE_PHASES.STEADY,
      interaction: Object.freeze({ ...interactionGate.getSnapshot() }),
      performanceWindow: frameWindow.getSnapshot(),
      resources: resourceBudget.getSnapshot(),
    });
  }

  function emit(previousPhase) {
    const snapshot = getSnapshot();
    listeners.forEach((listener) => listener(snapshot, previousPhase));
    return snapshot;
  }

  function transition(nextPhase, nextReason = reason) {
    if (phase === nextPhase && reason === nextReason) {
      return getSnapshot();
    }
    const previousPhase = phase;
    phase = nextPhase;
    reason = nextPhase === CANVAS_PERFORMANCE_PHASES.STEADY ? "" : normalizeReason(nextReason);
    generation += 1;
    transitionCount += 1;
    return emit(previousPhase);
  }

  function beginInteraction(nextReason = "interaction") {
    if (phase !== CANVAS_PERFORMANCE_PHASES.ACTIVE) {
      sessionId += 1;
    }
    interactionGate.activate(nextReason);
    resourceBudget.setInteractionActive(true);
    transition(CANVAS_PERFORMANCE_PHASES.ACTIVE, nextReason);
    return sessionId;
  }

  function beginCommit(targetSessionId = sessionId, nextReason = reason) {
    if (targetSessionId !== sessionId || phase !== CANVAS_PERFORMANCE_PHASES.ACTIVE) {
      return false;
    }
    transition(CANVAS_PERFORMANCE_PHASES.COMMITTING, nextReason);
    return true;
  }

  function beginRecovery(targetSessionId = sessionId, nextReason = reason) {
    if (
      targetSessionId !== sessionId ||
      (phase !== CANVAS_PERFORMANCE_PHASES.COMMITTING && phase !== CANVAS_PERFORMANCE_PHASES.ACTIVE)
    ) {
      return false;
    }
    interactionGate.release();
    resourceBudget.setInteractionActive(false);
    transition(CANVAS_PERFORMANCE_PHASES.RECOVERING, nextReason);
    return true;
  }

  function finishRecovery(targetSessionId = sessionId) {
    if (targetSessionId !== sessionId || phase !== CANVAS_PERFORMANCE_PHASES.RECOVERING) {
      return false;
    }
    transition(CANVAS_PERFORMANCE_PHASES.STEADY, "");
    return true;
  }

  function setViewportIntent(active = false) {
    const next = Boolean(active);
    if (viewportIntentActive === next) return getSnapshot();
    viewportIntentActive = next;
    return emit(phase);
  }

  function reset() {
    interactionGate.release();
    resourceBudget.setInteractionActive(false);
    sessionId += 1;
    transition(CANVAS_PERFORMANCE_PHASES.STEADY, "");
    frameWindow.clear();
  }

  function dispose() {
    reset();
    listeners.clear();
    resourceBudget.dispose();
  }

  return Object.freeze({
    beginInteraction,
    beginCommit,
    beginRecovery,
    finishRecovery,
    setViewportIntent,
    recordFrame: (stats) => frameWindow.record(stats),
    registerResource: (descriptor) => resourceBudget.register(descriptor),
    requestResourceReconcile: () => resourceBudget.requestReconcile(),
    reconcileResourcesNow: () => resourceBudget.reconcileNow(),
    subscribe(listener) {
      if (typeof listener !== "function") return () => false;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    reset,
    dispose,
  });
}
