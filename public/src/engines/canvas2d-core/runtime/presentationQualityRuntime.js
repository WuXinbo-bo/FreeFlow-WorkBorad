import { createPresentationQualityPlanner } from "./presentationQualityPlanner.js";

function freezeSnapshot(value) {
  return Object.freeze({ ...value });
}

function now() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function getPlanStats(entries = {}) {
  const counts = {};
  Object.values(entries).forEach((entry) => {
    const representation = String(entry?.representation || "");
    if (representation) counts[representation] = (counts[representation] || 0) + 1;
  });
  return Object.freeze({ total: Object.keys(entries).length, counts: Object.freeze(counts) });
}

function isImmediateTransition(previousEntry, nextEntry) {
  return nextEntry?.reason === "interaction-protected" ||
    nextEntry?.reason === "attention-protected" ||
    previousEntry?.representation === "culled" ||
    nextEntry?.representation === "culled";
}

export function createPresentationQualityRuntime({
  registry = null,
  planner = null,
  mode = "shadow",
  minimumDwellMs = 140,
  nowProvider = now,
} = {}) {
  const qualityPlanner = planner || createPresentationQualityPlanner({ registry });
  const dwellMs = Math.max(0, Number(minimumDwellMs) || 0);
  const representationChangedAt = new Map();
  let generation = 0;
  let sessionId = 0;
  let phase = "steady";
  let committedPlan = null;
  let activePlan = null;
  let candidatePlan = null;
  let candidateSessionId = 0;
  let pendingTransitions = 0;
  let nextEvaluationInMs = 0;

  function buildPlan(input = {}) {
    generation += 1;
    return qualityPlanner.createPlan({ ...input, generation, previousPlan: committedPlan });
  }

  function getTimestamp(input = {}) {
    const value = Number(input?.nowMs);
    return Number.isFinite(value) ? value : Number(nowProvider()) || 0;
  }

  function commitPlan(nextPlan, timestamp) {
    if (!committedPlan || dwellMs <= 0) {
      Object.keys(nextPlan?.entries || {}).forEach((id) => representationChangedAt.set(id, timestamp));
      committedPlan = nextPlan;
      pendingTransitions = 0;
      nextEvaluationInMs = 0;
      return;
    }

    const entries = {};
    let nextDelay = Infinity;
    pendingTransitions = 0;
    Object.entries(nextPlan?.entries || {}).forEach(([id, nextEntry]) => {
      const previousEntry = committedPlan?.entries?.[id] || null;
      if (!previousEntry || previousEntry.representation === nextEntry.representation) {
        entries[id] = nextEntry;
        if (!representationChangedAt.has(id)) representationChangedAt.set(id, timestamp);
        return;
      }
      const changedAt = Number(representationChangedAt.get(id));
      const elapsed = Number.isFinite(changedAt) ? Math.max(0, timestamp - changedAt) : dwellMs;
      const remaining = Math.max(0, dwellMs - elapsed);
      if (!isImmediateTransition(previousEntry, nextEntry) && remaining > 0) {
        entries[id] = Object.freeze({
          ...nextEntry,
          representation: previousEntry.representation,
          reason: previousEntry.reason,
          stability: "minimum-dwell",
        });
        pendingTransitions += 1;
        nextDelay = Math.min(nextDelay, remaining);
        return;
      }
      entries[id] = nextEntry;
      representationChangedAt.set(id, timestamp);
    });
    Array.from(representationChangedAt.keys()).forEach((id) => {
      if (!Object.hasOwn(entries, id)) representationChangedAt.delete(id);
    });
    committedPlan = Object.freeze({
      ...nextPlan,
      entries: Object.freeze(entries),
      stats: getPlanStats(entries),
    });
    nextEvaluationInMs = Number.isFinite(nextDelay) ? Math.max(1, Math.ceil(nextDelay)) : 0;
  }

  function update(input = {}, interaction = {}) {
    const timestamp = getTimestamp(input);
    const nextPhase = String(interaction?.phase || "steady");
    const nextSessionId = Math.max(0, Number(interaction?.sessionId) || 0);

    if (nextPhase === "active") {
      if (phase !== "active" || sessionId !== nextSessionId) {
        if (!committedPlan) commitPlan(buildPlan(input), timestamp);
        activePlan = committedPlan;
        candidatePlan = null;
        candidateSessionId = 0;
      }
      phase = "active";
      sessionId = nextSessionId;
      return getSnapshot();
    }

    if (nextPhase === "settling") {
      if (sessionId !== nextSessionId) {
        activePlan = committedPlan || buildPlan(input);
      }
      sessionId = nextSessionId;
      phase = "settling";
      if (!candidatePlan || candidateSessionId !== sessionId || candidatePlan.revisionKey !== String(input.revisionKey || "")) {
        candidatePlan = buildPlan(input);
        candidateSessionId = sessionId;
      }
      return getSnapshot();
    }

    const revisionKey = String(input.revisionKey || "");
    if (phase === "settling" && candidatePlan && candidateSessionId === sessionId && candidatePlan.revisionKey === revisionKey) {
      commitPlan(candidatePlan, timestamp);
    } else if (!committedPlan || committedPlan.revisionKey !== revisionKey || pendingTransitions > 0) {
      commitPlan(buildPlan(input), timestamp);
    }
    phase = "steady";
    sessionId = nextSessionId;
    activePlan = committedPlan;
    candidatePlan = null;
    candidateSessionId = 0;
    return getSnapshot();
  }

  function reset() {
    generation += 1;
    sessionId += 1;
    phase = "steady";
    committedPlan = null;
    activePlan = null;
    candidatePlan = null;
    candidateSessionId = 0;
    pendingTransitions = 0;
    nextEvaluationInMs = 0;
    representationChangedAt.clear();
  }

  function getSnapshot() {
    return freezeSnapshot({
      mode: String(mode || "shadow"),
      generation,
      sessionId,
      phase,
      committedPlan,
      activePlan: activePlan || committedPlan,
      candidatePlan,
      pendingTransitions,
      nextEvaluationInMs,
    });
  }

  return Object.freeze({ update, reset, getSnapshot });
}
