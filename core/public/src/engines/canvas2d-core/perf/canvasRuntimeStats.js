function now() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function clonePlain(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { ...value };
  }
}

const state = {
  load: {
    generation: 0,
    queued: 0,
    running: 0,
    completed: 0,
    cancelled: 0,
    stale: 0,
    failed: 0,
    lastTaskType: "",
    lastTaskDurationMs: 0,
  },
  overlay: {
    active: 0,
    activeByType: {},
    createdThisFrame: 0,
    delayedThisFrame: 0,
    removedThisFrame: 0,
    hiddenThisFrame: 0,
    budget: {},
    lastReason: "",
    frame: 0,
  },
  asset: {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    bytesLoaded: 0,
    lastAssetType: "",
    lastAssetDurationMs: 0,
  },
};

function publish() {
  if (typeof window === "undefined") {
    return;
  }
  window.__ffLoadStats = clonePlain(state.load);
  window.__ffOverlayStats = clonePlain(state.overlay);
  window.__ffAssetStats = clonePlain(state.asset);
  window.__ffPerfSnapshot = () => ({
    load: clonePlain(window.__ffLoadStats || state.load),
    overlay: clonePlain(window.__ffOverlayStats || state.overlay),
    asset: clonePlain(window.__ffAssetStats || state.asset),
    render: clonePlain(window.__ffRenderStats || null),
  });
}

export function markLoadGeneration(generation = 0) {
  state.load.generation = Math.max(0, Number(generation || 0) || 0);
  publish();
}

export function recordHydrationStats(patch = {}) {
  Object.assign(state.load, patch && typeof patch === "object" ? patch : {});
  publish();
}

export function recordHydrationTask(type = "", durationMs = 0, status = "completed") {
  state.load.lastTaskType = String(type || "");
  state.load.lastTaskDurationMs = Number(durationMs || 0) || 0;
  if (status === "failed") state.load.failed += 1;
  else if (status === "cancelled") state.load.cancelled += 1;
  else if (status === "stale") state.load.stale += 1;
  else state.load.completed += 1;
  publish();
}

export function beginOverlayFrame({ budget = {}, reason = "" } = {}) {
  state.overlay.frame += 1;
  state.overlay.createdThisFrame = 0;
  state.overlay.delayedThisFrame = 0;
  state.overlay.removedThisFrame = 0;
  state.overlay.hiddenThisFrame = 0;
  state.overlay.budget = clonePlain(budget || {});
  state.overlay.lastReason = String(reason || "");
  publish();
}

export function recordOverlayEvent(type = "created", count = 1) {
  const amount = Math.max(0, Number(count || 0) || 0);
  if (!amount) {
    return;
  }
  if (type === "delayed") state.overlay.delayedThisFrame += amount;
  else if (type === "removed") state.overlay.removedThisFrame += amount;
  else if (type === "hidden") state.overlay.hiddenThisFrame += amount;
  else state.overlay.createdThisFrame += amount;
  publish();
}

export function recordOverlayActive(activeByType = {}) {
  const byType = activeByType && typeof activeByType === "object" ? activeByType : {};
  state.overlay.activeByType = { ...byType };
  state.overlay.active = Object.values(byType).reduce((sum, value) => sum + Math.max(0, Number(value || 0) || 0), 0);
  publish();
}

export function recordAssetStats(patch = {}) {
  Object.assign(state.asset, patch && typeof patch === "object" ? patch : {});
  publish();
}

export function timeAssetTask(type = "", task) {
  if (typeof task !== "function") {
    return Promise.resolve(null);
  }
  const startedAt = now();
  state.asset.running += 1;
  state.asset.lastAssetType = String(type || "");
  publish();
  return Promise.resolve()
    .then(() => task())
    .then((result) => {
      state.asset.completed += 1;
      state.asset.lastAssetDurationMs = Number((now() - startedAt).toFixed(2));
      return result;
    })
    .catch((error) => {
      state.asset.failed += 1;
      state.asset.lastAssetDurationMs = Number((now() - startedAt).toFixed(2));
      throw error;
    })
    .finally(() => {
      state.asset.running = Math.max(0, state.asset.running - 1);
      publish();
    });
}

publish();
