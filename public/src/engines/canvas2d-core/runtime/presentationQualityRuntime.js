import { createPresentationQualityPlanner } from "./presentationQualityPlanner.js";

function freezeSnapshot(value) {
  return Object.freeze({ ...value });
}

export function createPresentationQualityRuntime({ registry = null, planner = null, mode = "shadow" } = {}) {
  const qualityPlanner = planner || createPresentationQualityPlanner({ registry });
  let generation = 0;
  let sessionId = 0;
  let phase = "steady";
  let committedPlan = null;
  let activePlan = null;
  let candidatePlan = null;
  let candidateSessionId = 0;

  function buildPlan(input = {}) {
    generation += 1;
    return qualityPlanner.createPlan({ ...input, generation });
  }

  function update(input = {}, interaction = {}) {
    const nextPhase = String(interaction?.phase || "steady");
    const nextSessionId = Math.max(0, Number(interaction?.sessionId) || 0);

    if (nextPhase === "active") {
      if (phase !== "active" || sessionId !== nextSessionId) {
        committedPlan ||= buildPlan(input);
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
      committedPlan = candidatePlan;
    } else if (!committedPlan || committedPlan.revisionKey !== revisionKey) {
      committedPlan = buildPlan(input);
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
    });
  }

  return Object.freeze({ update, reset, getSnapshot });
}
