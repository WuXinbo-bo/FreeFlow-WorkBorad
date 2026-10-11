const assert = require("assert/strict");
async function main() {
  const { createWorkerLifetime } = await import("../public/src/engines/canvas2d-core/runtime/workerLifetime.js");
  const originalSet = global.setTimeout, originalClear = global.clearTimeout, originalNow = Date.now;
  let now = 0, next = 0, timeouts = 0, idles = 0;
  const timers = new Map();
  global.setTimeout = (callback, ms) => { timers.set(++next, { callback, at: now + ms }); return next; };
  global.clearTimeout = (id) => timers.delete(id);
  Date.now = () => now;
  const advance = (ms) => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  };
  try {
    const requests = new Map();
    let lifetime;
    lifetime = createWorkerLifetime({ requests, timeoutMs: 100, idleMs: 200, onTimeout: () => { timeouts++; lifetime.clear(); }, onIdle: () => idles++ });
    lifetime.begin(1, { cacheKey: "engine-a" });
    advance(50);
    lifetime.begin(2, { cacheKey: "engine-b" });
    lifetime.cancel("engine-a");
    advance(99);
    assert.equal(timeouts, 0, "one engine cancellation timed out another engine early");
    advance(1);
    assert.equal(timeouts, 1);
    assert.equal(requests.size, 0);
    lifetime.begin(3, { cacheKey: "recovered" });
    lifetime.finish(3);
    advance(199);
    assert.equal(idles, 0);
    lifetime.begin(4, { cacheKey: "active" });
    advance(1);
    assert.equal(idles, 0, "stale idle timer terminated active work");
    lifetime.finish(4);
    advance(200);
    assert.equal(idles, 1);
    for (let i = 0; i < 1000; i++) { lifetime.begin(i, { cacheKey: "repeat" }); lifetime.cancel("repeat"); }
    assert.equal(requests.size, 0);
    assert.equal(timers.size, 1, "rapid lifecycle changes accumulated watchdogs");
    advance(200);
    assert.equal(idles, 2);
    assert.equal(timers.size, 0);
    console.log("[check-worker-lifetime] shared ownership, timeout recovery, idle recreation and 1000 cancellations passed");
  } finally { global.setTimeout = originalSet; global.clearTimeout = originalClear; Date.now = originalNow; }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
