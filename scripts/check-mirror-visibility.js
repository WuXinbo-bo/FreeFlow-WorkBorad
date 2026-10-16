"use strict";
const assert = require("node:assert/strict");

async function main() {
  const { createMirrorVisibilityController } = await import("../public/src/runtime/mirrorOverlay/mirrorVisibilityController.js");
  let identity = { targetId: "a", syncSessionId: "1" };
  let resolve;
  const writes = [], errors = [], visible = [];
  let fail = false;
  const controller = createMirrorVisibilityController({
    getIdentity: () => identity,
    apply: async (show, session) => {
      writes.push([show, session]);
      if (fail) return { ok: false, error: "native failed" };
      await new Promise(done => { resolve = done; });
      return { ok: true };
    },
    onError: error => errors.push(error.message),
    onVisible: () => visible.push(identity),
  });
  const first = controller.sync(false);
  controller.sync(true);
  resolve();
  await new Promise(done => setImmediate(done));
  assert.equal(writes.length, 2);
  assert.equal(writes[1][0], true);
  resolve(); await first;
  await controller.sync(true);
  assert.equal(writes.length, 2, "acknowledged state avoids IPC churn");
  fail = true;
  await controller.sync(false);
  await controller.sync(false);
  assert.equal(errors.length, 2, "native failures remain retryable");
  fail = false;
  const old = controller.sync(false);
  identity = { targetId: "b", syncSessionId: "2" };
  controller.sync(true);
  resolve(); await new Promise(done => setImmediate(done));
  assert.deepEqual(writes.at(-1), [true, identity]);
  resolve(); await old;
  const stop = controller.sync(false);
  identity = null;
  controller.reset();
  resolve(); await stop;
  assert.equal(visible.length, 2, "stopped mirror never resumes from stale completion");
  assert.equal(writes.length, 7);
  console.log("Mirror visibility: coalescing, acknowledgement, failure retry, session switch and stop recovery passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
