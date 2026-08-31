const MIB = 1024 * 1024;
const DEFAULT_RESOURCE_BUDGET_BYTES = 256 * MIB;

function normalizeBytes(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
}

function defaultSchedule(task) {
  if (typeof globalThis.requestIdleCallback === "function") {
    const id = globalThis.requestIdleCallback(task, { timeout: 800 });
    return () => globalThis.cancelIdleCallback?.(id);
  }
  const id = globalThis.setTimeout(task, 32);
  return () => globalThis.clearTimeout(id);
}

export function resolveCanvasResourceBudgetBytes(deviceMemory = globalThis.navigator?.deviceMemory) {
  const memoryGb = Number(deviceMemory);
  if (!Number.isFinite(memoryGb)) return DEFAULT_RESOURCE_BUDGET_BYTES;
  if (memoryGb <= 4) return 192 * MIB;
  if (memoryGb <= 8) return 256 * MIB;
  return 320 * MIB;
}

export function createResourceBudgetRuntime({
  maxBytes = resolveCanvasResourceBudgetBytes(),
  scheduleTask = defaultSchedule,
} = {}) {
  const pools = new Map();
  const budgetBytes = Math.max(1, normalizeBytes(maxBytes, DEFAULT_RESOURCE_BUDGET_BYTES));
  let interactionActive = false;
  let reconcilePending = false;
  let cancelScheduled = null;
  let generation = 0;
  let reconcileCount = 0;
  let reclaimedBytes = 0;
  let lastSnapshot = null;

  function readPoolStats(pool) {
    const stats = pool.getStats?.() || {};
    return Object.freeze({
      id: pool.id,
      byteSize: normalizeBytes(stats.byteSize),
      minimumBytes: pool.minimumBytes,
      reclaimable: pool.reclaimable,
      priority: pool.priority,
      stats,
    });
  }

  function collectSnapshot({ deferred = false } = {}) {
    const entries = Array.from(pools.values(), readPoolStats);
    const totalBytes = entries.reduce((sum, entry) => sum + entry.byteSize, 0);
    lastSnapshot = Object.freeze({
      budgetBytes,
      totalBytes,
      overBudgetBytes: Math.max(0, totalBytes - budgetBytes),
      interactionActive,
      reconcilePending,
      deferred,
      reconcileCount,
      reclaimedBytes,
      pools: Object.freeze(Object.fromEntries(entries.map((entry) => [entry.id, entry]))),
    });
    return lastSnapshot;
  }

  function reconcileNow() {
    cancelScheduled?.();
    cancelScheduled = null;
    reconcilePending = false;
    if (interactionActive) {
      return collectSnapshot({ deferred: true });
    }
    let entries = Array.from(pools.values(), readPoolStats);
    let excess = Math.max(0, entries.reduce((sum, entry) => sum + entry.byteSize, 0) - budgetBytes);
    const candidates = entries
      .filter((entry) => entry.reclaimable && entry.byteSize > entry.minimumBytes)
      .sort((left, right) => left.priority - right.priority);
    let reclaimed = 0;
    for (const entry of candidates) {
      if (excess <= 0) break;
      const pool = pools.get(entry.id);
      const targetBytes = Math.max(entry.minimumBytes, entry.byteSize - excess);
      const released = normalizeBytes(pool?.trimToBytes?.(targetBytes));
      reclaimed += released;
      excess = Math.max(0, excess - released);
    }
    reconcileCount += 1;
    reclaimedBytes += reclaimed;
    entries = Array.from(pools.values(), readPoolStats);
    return collectSnapshot();
  }

  function requestReconcile() {
    if (interactionActive) {
      const current = collectSnapshot();
      reconcilePending = current.totalBytes > budgetBytes;
      return collectSnapshot({ deferred: reconcilePending });
    }
    const current = collectSnapshot();
    if (current.totalBytes <= budgetBytes) {
      reconcilePending = false;
      return collectSnapshot();
    }
    if (cancelScheduled) return collectSnapshot();
    reconcilePending = true;
    const targetGeneration = generation;
    cancelScheduled = scheduleTask(() => {
      cancelScheduled = null;
      if (targetGeneration !== generation || interactionActive) return;
      reconcileNow();
    }) || null;
    return collectSnapshot();
  }

  function setInteractionActive(nextActive) {
    const next = Boolean(nextActive);
    if (interactionActive === next) return collectSnapshot({ deferred: next && reconcilePending });
    interactionActive = next;
    generation += 1;
    if (next && cancelScheduled) {
      cancelScheduled();
      cancelScheduled = null;
    }
    if (!next && reconcilePending) requestReconcile();
    return collectSnapshot({ deferred: next && reconcilePending });
  }

  function register({
    id,
    getStats,
    trimToBytes,
    minimumBytes = 0,
    priority = 0,
    reclaimable = true,
  } = {}) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId || typeof getStats !== "function") {
      throw new TypeError("resource pool requires an id and getStats");
    }
    pools.set(normalizedId, {
      id: normalizedId,
      getStats,
      trimToBytes,
      minimumBytes: normalizeBytes(minimumBytes),
      priority: Number(priority) || 0,
      reclaimable: Boolean(reclaimable && typeof trimToBytes === "function"),
    });
    collectSnapshot();
    return () => {
      const removed = pools.delete(normalizedId);
      collectSnapshot();
      return removed;
    };
  }

  function dispose() {
    generation += 1;
    cancelScheduled?.();
    cancelScheduled = null;
    reconcilePending = false;
    pools.clear();
    collectSnapshot();
  }

  collectSnapshot();
  return Object.freeze({
    register,
    requestReconcile,
    reconcileNow,
    setInteractionActive,
    getSnapshot: () => collectSnapshot({ deferred: interactionActive && reconcilePending }),
    dispose,
  });
}
