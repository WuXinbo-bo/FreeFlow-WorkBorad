import {
  markLoadGeneration,
  recordHydrationStats,
  recordHydrationTask,
} from "./canvasRuntimeStats.js";

const PRIORITY_WEIGHT = {
  editing: 0,
  selected: 1,
  hovered: 2,
  visible: 3,
  near: 4,
  background: 5,
};

function now() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function scheduleIdle(callback, timeout = 96) {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback((deadline) => callback(deadline || null), { timeout });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(() => callback(null), 0);
  return () => clearTimeout(handle);
}

export function createHydrationScheduler({
  frameBudgetMs = 8,
  maxTasksPerFlush = 4,
  timeout = 96,
} = {}) {
  const tasks = new Map();
  let generation = 1;
  let cancelFlush = null;
  let sequence = 0;
  let running = 0;
  let paused = false;

  function publish() {
    recordHydrationStats({
      generation,
      queued: tasks.size,
      running,
    });
  }

  function bumpGeneration() {
    generation += 1;
    markLoadGeneration(generation);
    return generation;
  }

  function ensureFlush() {
    if (paused || cancelFlush || !tasks.size) {
      return;
    }
    cancelFlush = scheduleIdle((deadline) => {
      cancelFlush = null;
      void flush(deadline);
    }, timeout);
  }

  function takeNextTask() {
    let bestKey = "";
    let bestTask = null;
    tasks.forEach((task, key) => {
      if (!bestTask) {
        bestKey = key;
        bestTask = task;
        return;
      }
      if (task.priorityWeight < bestTask.priorityWeight) {
        bestKey = key;
        bestTask = task;
        return;
      }
      if (task.priorityWeight === bestTask.priorityWeight && task.sequence < bestTask.sequence) {
        bestKey = key;
        bestTask = task;
      }
    });
    if (bestKey) {
      tasks.delete(bestKey);
    }
    return bestTask;
  }

  async function flush(deadline = null) {
    const startedAt = now();
    let processed = 0;
    while (tasks.size && processed < maxTasksPerFlush) {
      if (
        processed > 0 &&
        deadline &&
        typeof deadline.timeRemaining === "function" &&
        deadline.timeRemaining() < 4
      ) {
        break;
      }
      if (processed > 0 && now() - startedAt >= frameBudgetMs) {
        break;
      }
      const task = takeNextTask();
      if (!task) {
        break;
      }
      if (task.generation !== generation) {
        recordHydrationTask(task.type, 0, "stale");
        processed += 1;
        continue;
      }
      const taskStartedAt = now();
      running += 1;
      publish();
      try {
        await task.run({
          generation,
          isStale: () => task.generation !== generation,
        });
        recordHydrationTask(task.type, Number((now() - taskStartedAt).toFixed(2)), "completed");
      } catch (error) {
        if (task.generation !== generation) {
          recordHydrationTask(task.type, Number((now() - taskStartedAt).toFixed(2)), "stale");
        } else {
          recordHydrationTask(task.type, Number((now() - taskStartedAt).toFixed(2)), "failed");
          if (typeof task.onError === "function") {
            task.onError(error);
          }
        }
      } finally {
        running = Math.max(0, running - 1);
        processed += 1;
        publish();
      }
    }
    ensureFlush();
  }

  function enqueue(key = "", run, options = {}) {
    const id = String(key || "").trim();
    if (!id || typeof run !== "function") {
      return false;
    }
    const priority = String(options.priority || "visible").trim();
    tasks.set(id, {
      key: id,
      run,
      onError: options.onError,
      type: String(options.type || priority || "hydration"),
      priorityWeight: PRIORITY_WEIGHT[priority] ?? PRIORITY_WEIGHT.visible,
      sequence: sequence += 1,
      generation,
    });
    publish();
    ensureFlush();
    return true;
  }

  function setPaused(nextPaused = false) {
    paused = Boolean(nextPaused);
    if (paused && typeof cancelFlush === "function") {
      cancelFlush();
      cancelFlush = null;
    }
    publish();
    if (!paused) {
      ensureFlush();
    }
  }

  function remove(key = "") {
    const id = String(key || "").trim();
    if (!id || !tasks.delete(id)) {
      return false;
    }
    recordHydrationTask("removed", 0, "cancelled");
    publish();
    return true;
  }

  function clear({ stale = false } = {}) {
    const size = tasks.size;
    tasks.clear();
    if (typeof cancelFlush === "function") {
      cancelFlush();
    }
    cancelFlush = null;
    if (stale) {
      bumpGeneration();
    }
    if (size) {
      recordHydrationTask("clear", 0, "cancelled");
    }
    publish();
  }

  return {
    bumpGeneration,
    clear,
    enqueue,
    getGeneration: () => generation,
    getStats: () => ({ generation, queued: tasks.size, running, paused }),
    remove,
    setPaused,
  };
}
