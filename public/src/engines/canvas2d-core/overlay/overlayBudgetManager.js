import {
  beginOverlayFrame,
  recordOverlayActive,
  recordOverlayEvent,
} from "../perf/canvasRuntimeStats.js";

const DEFAULT_LIMITS = Object.freeze({
  maxActiveTotal: 180,
  maxCreatePerFrame: 10,
  rich: 110,
  math: 48,
  code: 36,
  filePreview: 2,
});

function normalizeType(type = "") {
  return String(type || "overlay").trim() || "overlay";
}

export function createOverlayBudgetManager(limits = {}) {
  const resolvedLimits = {
    ...DEFAULT_LIMITS,
    ...(limits && typeof limits === "object" ? limits : {}),
  };
  const activeByType = new Map();
  let createdThisFrame = 0;
  let interactionSuspended = false;

  function getActive(type = "") {
    return Math.max(0, Number(activeByType.get(normalizeType(type)) || 0) || 0);
  }

  function getActiveTotal() {
    let total = 0;
    activeByType.forEach((count) => {
      total += Math.max(0, Number(count || 0) || 0);
    });
    return total;
  }

  function publishActive() {
    const stats = {};
    activeByType.forEach((count, type) => {
      stats[type] = Math.max(0, Number(count || 0) || 0);
    });
    recordOverlayActive(stats);
  }

  function beginFrame({ suspended = false, reason = "" } = {}) {
    createdThisFrame = 0;
    interactionSuspended = Boolean(suspended);
    beginOverlayFrame({
      budget: {
        ...resolvedLimits,
        interactionSuspended,
      },
      reason,
    });
    publishActive();
  }

  function canCreate(type = "", options = {}) {
    const normalizedType = normalizeType(type);
    if (options.force === true) {
      return true;
    }
    if (interactionSuspended && options.allowDuringInteraction !== true) {
      recordOverlayEvent("delayed");
      return false;
    }
    if (createdThisFrame >= resolvedLimits.maxCreatePerFrame) {
      recordOverlayEvent("delayed");
      return false;
    }
    if (getActiveTotal() >= resolvedLimits.maxActiveTotal) {
      recordOverlayEvent("delayed");
      return false;
    }
    const typeLimit = Number(resolvedLimits[normalizedType] || 0) || 0;
    if (typeLimit > 0 && getActive(normalizedType) >= typeLimit) {
      recordOverlayEvent("delayed");
      return false;
    }
    return true;
  }

  function noteCreate(type = "") {
    const normalizedType = normalizeType(type);
    activeByType.set(normalizedType, getActive(normalizedType) + 1);
    createdThisFrame += 1;
    recordOverlayEvent("created");
    publishActive();
  }

  function noteRemove(type = "") {
    const normalizedType = normalizeType(type);
    activeByType.set(normalizedType, Math.max(0, getActive(normalizedType) - 1));
    recordOverlayEvent("removed");
    publishActive();
  }

  function noteHidden(count = 1) {
    recordOverlayEvent("hidden", count);
  }

  function reset(type = "") {
    const normalizedType = normalizeType(type);
    activeByType.set(normalizedType, 0);
    publishActive();
  }

  return {
    beginFrame,
    canCreate,
    getActive,
    getActiveTotal,
    noteCreate,
    noteHidden,
    noteRemove,
    reset,
  };
}
