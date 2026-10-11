// Module-level workers serve several overlays/engines. Track tasks, rather than
// engine mounts: one engine closing must not terminate another engine's work.
export function createWorkerLifetime({ requests, onTimeout, onIdle, timeoutMs = 15000, idleMs = 30000 }) {
  let deadlineTimer = 0;
  let idleTimer = 0;
  const startedAt = new Map();
  function cancelTimers() {
    clearTimeout(deadlineTimer);
    clearTimeout(idleTimer);
    deadlineTimer = idleTimer = 0;
  }
  function refresh() {
    cancelTimers();
    if (!requests.size) {
      idleTimer = setTimeout(() => { idleTimer = 0; if (!requests.size) onIdle(); }, idleMs);
      idleTimer.unref?.();
      return;
    }
    const deadline = Math.min(...startedAt.values()) + timeoutMs;
    deadlineTimer = setTimeout(() => { deadlineTimer = 0; if (requests.size) onTimeout(); }, Math.max(0, deadline - Date.now()));
    deadlineTimer.unref?.();
  }
  return {
    begin(id, request) {
      requests.set(id, request);
      startedAt.set(id, Date.now());
      refresh();
    },
    finish(id) {
      requests.delete(id);
      startedAt.delete(id);
      refresh();
    },
    cancel(cacheKey) {
      for (const [id, request] of requests) {
        if (request.cacheKey === cacheKey) { requests.delete(id); startedAt.delete(id); }
      }
      refresh();
    },
    clear() {
      requests.clear();
      startedAt.clear();
      refresh();
    },
  };
}
