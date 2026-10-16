// Acknowledge only successful, session-matched native writes. Failed writes remain retryable.
export function createMirrorVisibilityController({ getIdentity, apply, onVisible = () => {}, onError = () => {} }) {
  let desired = null;
  let acknowledged = "";
  let pending = null;
  function sync(visible) {
    const identity = getIdentity();
    desired = identity ? { identity, visible } : null;
    if (!identity) { acknowledged = ""; return pending || Promise.resolve(); }
    if (pending) return pending;
    pending = (async () => {
      while (desired) {
        const current = desired;
        const key = JSON.stringify(current);
        if (key === acknowledged) break;
        try {
          const response = await apply(current.visible, current.identity);
          if (response?.ok === false || response?.stale) throw new Error(response.error || "镜像状态已变化");
          if (JSON.stringify(getIdentity()) !== JSON.stringify(current.identity)) {
            if (desired === current) desired = null;
            continue;
          }
          acknowledged = key;
          if (current.visible) onVisible();
        } catch (error) { onError(error); break; }
      }
    })().finally(() => { pending = null; });
    return pending;
  }
  return { sync, reset() { desired = null; acknowledged = ""; } };
}
