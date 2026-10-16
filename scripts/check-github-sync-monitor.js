const assert = require("assert/strict");
const fs = require("fs/promises");
const path = require("path");

async function main() {
  const source = await fs.readFile(path.join(__dirname, "../public/src/runtime/githubSyncMonitor.js"), "utf8");
  const { createGitHubRemoteMonitor } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { hidden: false });
  const timers = new Map();
  let nextId = 0;
  let now = 0;
  let calls = 0;
  let fail = false;
  const updates = [];
  windowTarget.addEventListener("freeflow:github-remote-update", (event) => updates.push(event.detail));
  const monitor = createGitHubRemoteMonitor({
    windowTarget, documentTarget, now: () => now,
    schedule: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, at: now + delay }); return id; },
    cancel: (id) => timers.delete(id),
    client: { checkRemote: async () => { calls++; if (fail) throw { retryAfterMs: 180000 }; return { connected: true, changed: calls > 1, remoteHeadSha: `head-${calls}`, repositoryKey: "fixture/repo:main" }; } },
  });
  const tick = async () => {
    const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
    timers.delete(id); now = timer.at; await timer.callback();
  };
  await tick();
  assert.equal(calls, 1);
  for (let i = 0; i < 30; i++) windowTarget.dispatchEvent(new Event("focus"));
  assert.equal(timers.size, 1);
  assert([...timers.values()][0].at >= 65000);
  windowTarget.dispatchEvent(new Event("freeflow:github-sync-status"));
  assert([...timers.values()][0].at >= 65000, "connected status refresh must preserve the one-minute interval");
  documentTarget.hidden = true;
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(timers.size, 0);
  now += 120000;
  documentTarget.hidden = false;
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  await tick();
  assert.equal(calls, 2);
  assert.equal(updates.length, 1);
  fail = true;
  await tick();
  assert([...timers.values()][0].at >= now + 180000);
  for (let i = 0; i < 30; i++) {
    windowTarget.dispatchEvent(new Event("freeflow:github-sync-status"));
    windowTarget.dispatchEvent(new Event("focus"));
  }
  assert.equal(timers.size, 1);
  assert([...timers.values()][0].at >= now + 180000, "status events must not defeat server backoff");
  fail = false;
  await tick();
  assert.equal(updates.length, 2);
  monitor.dispose();
  assert.equal(timers.size, 0);
  windowTarget.dispatchEvent(new Event("focus"));
  assert.equal(timers.size, 0);
  console.log("PASS GitHub lightweight remote checks, focus throttle, hidden pause, backoff and recovery");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
