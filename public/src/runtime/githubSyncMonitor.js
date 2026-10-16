// Remote checks only read the branch reference. Canvas contents are downloaded
// through the normal, guarded pull flow after the user reviews the changes.
export function createGitHubRemoteMonitor({ client, windowTarget = window, documentTarget = document, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  let timer = 0;
  let disposed = false;
  let inFlight = false;
  let nextAt = 0;
  let failures = 0;
  let backoffUntil = 0;
  let disconnected = false;

  function arm(delay) {
    if (timer) cancel(timer);
    timer = 0;
    if (!disposed && !documentTarget.hidden) timer = schedule(check, Math.max(0, delay));
  }

  async function check() {
    timer = 0;
    if (disposed || documentTarget.hidden || inFlight) return;
    if (nextAt > now()) { arm(nextAt - now()); return; }
    inFlight = true;
    let delay = 60000;
    try {
      const result = await client.checkRemote();
      if (result?.ok === false) throw Object.assign(new Error(result.error), result);
      failures = 0;
      backoffUntil = 0;
      disconnected = result?.connected === false;
      delay = disconnected ? 300000 : Math.max(60000, Number(result?.nextCheckMs) || 0);
      if (!disposed && result?.changed) {
        windowTarget.dispatchEvent(new CustomEvent("freeflow:github-remote-update", { detail: result }));
      }
    } catch (error) {
      failures += 1;
      delay = Math.max(Math.min(900000, 60000 * 2 ** Math.min(4, failures)), Number(error?.retryAfterMs) || 0);
      backoffUntil = now() + delay;
    } finally {
      inFlight = false;
      nextAt = now() + delay;
      arm(delay);
    }
  }

  const focus = () => arm(Math.max(250, nextAt - now()));
  const status = () => {
    // A fresh authorization should not wait five minutes for the disconnected
    // interval, while repeated status events must not trigger request storms.
    if (disconnected) nextAt = Math.max(backoffUntil, Math.min(nextAt, now() + 5000));
    focus();
  };
  const visibility = () => {
    if (documentTarget.hidden) { if (timer) cancel(timer); timer = 0; }
    else focus();
  };
  if (typeof client?.checkRemote !== "function") return { dispose() {} };
  windowTarget.addEventListener("focus", focus);
  windowTarget.addEventListener("freeflow:github-sync-status", status);
  documentTarget.addEventListener("visibilitychange", visibility);
  arm(5000);
  return { dispose() {
    disposed = true;
    if (timer) cancel(timer);
    windowTarget.removeEventListener("focus", focus);
    windowTarget.removeEventListener("freeflow:github-sync-status", status);
    documentTarget.removeEventListener("visibilitychange", visibility);
  } };
}
