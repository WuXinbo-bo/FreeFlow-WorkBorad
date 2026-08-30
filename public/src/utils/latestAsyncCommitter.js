function defaultFingerprint(value) {
  return JSON.stringify(value);
}

export function createLatestAsyncCommitter({ commit, getFingerprint = defaultFingerprint, onError = null } = {}) {
  if (typeof commit !== "function") {
    throw new TypeError("latest async committer requires a commit function");
  }

  let pending = null;
  let inFlight = null;
  let disposed = false;
  let generation = 1;
  let sequence = 0;
  let lastCommittedFingerprint = "";
  const idleWaiters = new Set();

  function resolveIdleWaiters() {
    if (pending || inFlight) {
      return;
    }
    idleWaiters.forEach((resolve) => resolve());
    idleWaiters.clear();
  }

  function drain() {
    if (disposed || inFlight || !pending) {
      resolveIdleWaiters();
      return;
    }

    const task = pending;
    pending = null;
    if (task.fingerprint === lastCommittedFingerprint) {
      drain();
      return;
    }

    inFlight = Promise.resolve()
      .then(() => commit(task.value, { generation: task.generation, sequence: task.sequence }))
      .then((result) => {
        if (!disposed && task.generation === generation) {
          lastCommittedFingerprint = task.fingerprint;
        }
        return result;
      })
      .catch((error) => {
        if (!disposed && task.generation === generation && typeof onError === "function") {
          onError(error, task.value);
        }
      })
      .finally(() => {
        inFlight = null;
        drain();
      });
  }

  function submit(value) {
    if (disposed) {
      return 0;
    }
    sequence += 1;
    pending = {
      value,
      generation,
      sequence,
      fingerprint: String(getFingerprint(value)),
    };
    drain();
    return sequence;
  }

  function reset() {
    generation += 1;
    pending = null;
    lastCommittedFingerprint = "";
    resolveIdleWaiters();
    return generation;
  }

  function whenIdle() {
    if (!pending && !inFlight) {
      return Promise.resolve();
    }
    return new Promise((resolve) => idleWaiters.add(resolve));
  }

  function dispose() {
    disposed = true;
    pending = null;
    idleWaiters.forEach((resolve) => resolve());
    idleWaiters.clear();
  }

  return {
    submit,
    reset,
    whenIdle,
    dispose,
    getSnapshot: () => ({
      generation,
      sequence,
      pending: Boolean(pending),
      inFlight: Boolean(inFlight),
    }),
  };
}
