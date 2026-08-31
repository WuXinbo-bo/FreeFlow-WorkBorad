const PRIORITY_WEIGHT = Object.freeze({
  visible: 0,
  near: 1,
  predicted: 2,
  background: 3,
});

function defaultSchedule(task) {
  if (typeof globalThis.requestIdleCallback === "function") {
    const id = globalThis.requestIdleCallback(task, { timeout: 240 });
    return () => globalThis.cancelIdleCallback?.(id);
  }
  const id = globalThis.setTimeout(task, 16);
  return () => globalThis.clearTimeout(id);
}

export function createResourcePrewarmRuntime({
  scheduleTask = defaultSchedule,
  maxTasksPerFlush = 4,
} = {}) {
  const tasks = new Map();
  let generation = 1;
  let sequence = 0;
  let paused = false;
  let flushing = false;
  let cancelScheduled = null;
  let completedCount = 0;
  let staleCount = 0;

  function getSnapshot() {
    return Object.freeze({
      generation,
      queued: tasks.size,
      paused,
      scheduled: Boolean(cancelScheduled),
      completedCount,
      staleCount,
    });
  }

  function takeNextTask() {
    let selectedKey = "";
    let selected = null;
    tasks.forEach((task, key) => {
      if (
        !selected ||
        task.priorityWeight < selected.priorityWeight ||
        (task.priorityWeight === selected.priorityWeight && task.sequence < selected.sequence)
      ) {
        selectedKey = key;
        selected = task;
      }
    });
    if (selectedKey) tasks.delete(selectedKey);
    return selected;
  }

  function ensureScheduled() {
    if (paused || flushing || cancelScheduled || !tasks.size) return false;
    const targetGeneration = generation;
    cancelScheduled = scheduleTask(() => {
      cancelScheduled = null;
      if (paused || targetGeneration !== generation) {
        staleCount += 1;
        return;
      }
      flushing = true;
      try {
        let processed = 0;
        while (tasks.size && processed < Math.max(1, Number(maxTasksPerFlush) || 1)) {
          const task = takeNextTask();
          if (!task) break;
          if (task.generation !== generation) {
            staleCount += 1;
          } else {
            task.run({ generation, isStale: () => task.generation !== generation });
            completedCount += 1;
          }
          processed += 1;
        }
      } finally {
        flushing = false;
      }
      ensureScheduled();
    }) || null;
    return Boolean(cancelScheduled);
  }

  function request(key = "", run, { priority = "near" } = {}) {
    const id = String(key || "").trim();
    if (!id || typeof run !== "function") return false;
    const normalizedPriority = String(priority || "near").trim();
    tasks.set(id, {
      key: id,
      run,
      generation,
      sequence: sequence += 1,
      priorityWeight: PRIORITY_WEIGHT[normalizedPriority] ?? PRIORITY_WEIGHT.near,
    });
    ensureScheduled();
    return true;
  }

  function setPaused(nextPaused = false, { stale = false } = {}) {
    paused = Boolean(nextPaused);
    if (stale) {
      generation += 1;
      tasks.clear();
    }
    if (paused && cancelScheduled) {
      cancelScheduled();
      cancelScheduled = null;
    }
    if (!paused) ensureScheduled();
    return getSnapshot();
  }

  function dispose() {
    generation += 1;
    tasks.clear();
    cancelScheduled?.();
    cancelScheduled = null;
    paused = true;
  }

  return Object.freeze({ request, setPaused, getSnapshot, dispose });
}
