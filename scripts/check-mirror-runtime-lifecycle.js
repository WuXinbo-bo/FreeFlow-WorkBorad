"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const runtimePath = path.join(__dirname, "../public/src/runtime/workbenchRuntime.js");
const runtimeSource = fs.readFileSync(runtimePath, "utf8");

// Execute the complete production functions, rather than reproducing their
// cancellation logic in the test. Explicit next-function markers fail loudly
// if the runtime layout changes instead of silently testing an incomplete body.
function extractFunction(start, next) {
  const startIndex = runtimeSource.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing production function: ${start}`);
  const endIndex = runtimeSource.indexOf(next, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing next function marker: ${next}`);
  return runtimeSource.slice(startIndex, endIndex);
}

const productionFunctions = [
  extractFunction("function createScreenSourceEmbedSession()", "function clearScreenSourceEmbedSession()"),
  extractFunction("function clearScreenSourceEmbedSession()", "function ensureScreenSourceActivationOverlay()"),
  extractFunction("async function stopScreenSourceCapture(", "function normalizeScreenSourceEntries("),
  extractFunction("async function ensureScreenSourceCapture(", "function renderRightPanelView()"),
].join("\n");

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function observe(promise) {
  // Attach a rejection handler before releasing a cancelled operation.
  return promise.then(value => ({ value }), error => ({ error }));
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const identityKey = identity => `${identity?.targetId || ""}/${identity?.syncSessionId || ""}`;

function createHarness(mode = "webcontentsview") {
  const source = { id: "target-a", label: "Fixture A", name: "Fixture A" };
  const state = {
    screenSource: {
      availableSources: [source], selectedSourceId: source.id,
      selectedSourceLabel: source.label, renderMode: mode,
      stream: null, startPromise: null, activeMode: "", activeTargetId: "",
      embeddedSourceId: "", embeddedSourceLabel: "", statusText: "",
    },
    desktopShellState: { fullClickThrough: false },
  };
  const calls = [], queued = { attach: [], prepare: [], embed: [] };
  const native = { web: null, win: null, target: null };
  const video = { srcObject: null };
  let renders = 0, resets = 0;

  function clearNative(kind, identity) {
    if (identityKey(native[kind]) === identityKey(identity)) native[kind] = null;
  }
  function invoke(kind, identity) {
    const request = { ...identity };
    calls.push({ method: kind, ...request });
    // A pending native operation already owns a session, before its promise
    // resolves. Session-matching clears model the real native managers, whose
    // own tests independently exercise the guards.
    native[kind === "attach" ? "web" : kind === "embed" ? "win" : "target"] = request;
    const pending = queued[kind].shift();
    if (pending) return pending.promise;
    return Promise.resolve(success(request));
  }
  function success(identity) {
    return { ok: true, target: { label: source.label }, projection: { sourceId: `fixture:${identity.targetId}` } };
  }
  const desktop = {
    attachAiMirrorWebContentsView: identity => invoke("attach", identity),
    prepareAiMirrorTarget: (targetId, options) => invoke("prepare", { targetId, ...options }),
    embedExternalWindow: identity => invoke("embed", identity),
    clearAiMirrorWebContentsView: async identity => {
      calls.push({ method: "clearWeb", ...identity }); clearNative("web", identity); return { ok: true };
    },
    clearExternalWindow: async identity => {
      calls.push({ method: "clearWin", ...identity }); clearNative("win", identity); return { ok: true };
    },
  };
  const context = vm.createContext({
    state, IS_DESKTOP_APP: true, DESKTOP_SHELL: desktop,
    navigator: { mediaDevices: { getUserMedia: async () => { throw new Error("Unexpected capture fallback"); } } },
    screenSourceVideoEl: video,
    screenSourceBoundsCommitter: { reset() { resets += 1; } },
    mirrorVisibilityController: { reset() { calls.push({ method: "resetVisibility" }); } },
    renderScreenSourceState: () => { renders += 1; },
    setStatus: (text, kind) => calls.push({ method: "status", text, kind }),
    syncEmbeddedWindowOverlayVisibility: async () => { calls.push({ method: "syncVisibility" }); },
    syncScreenSourceVideo: () => calls.push({ method: "syncVideo" }),
    scheduleEmbeddedScreenSourceSync: () => calls.push({ method: "syncBounds" }),
    ensureScreenSourcePreviewWorkspaceReady: async () => {},
    waitForScreenSourceLayoutStability: async () => {},
    normalizeScreenSourceRenderMode: value => value,
    canUseWebContentsViewScreenSource: () => true,
    canUseWin32EmbeddedScreenSource: () => true,
    isEmbeddedScreenSourceActive: () => state.screenSource.activeMode.startsWith("embedded-"),
    getScreenSourcePreviewBounds: () => ({ x: 20, y: 30, width: 640, height: 480 }),
    getCurrentScreenSourceEmbedLayout: () => ({ scale: 1 }),
    prepareAiMirrorTarget: desktop.prepareAiMirrorTarget,
    stopAiMirrorTarget: async (targetId, options) => {
      const identity = { targetId, ...options };
      calls.push({ method: "stopTarget", ...identity }); clearNative("target", identity); return { ok: true };
    },
  });
  vm.runInContext(`
    let screenSourceEmbedSessionSequence = 0;
    let screenSourceEmbedSessionId = "";
    let screenSourceEmbedSyncRevision = 0;
    let screenSourceBoundsCommitError = null;
    let embeddedWindowOverlayHidden = false;
    let screenSourceCaptureGeneration = 0;
    let screenSourcePendingEmbed = null;
    ${productionFunctions}
    globalThis.runtime = {
      start: ensureScreenSourceCapture,
      stop: stopScreenSourceCapture,
      session: () => screenSourceEmbedSessionId,
      pending: () => screenSourcePendingEmbed,
    };
  `, context, { filename: runtimePath });
  return {
    ...context.runtime, state, calls, native, video, success,
    queue(kind) { const pending = deferred(); queued[kind].push(pending); return pending; },
    select(id) {
      state.screenSource.availableSources = [{ ...source, id }];
      state.screenSource.selectedSourceId = id;
    },
    stats: () => ({ renders, resets }),
  };
}

function requestFor(h, method) {
  const request = h.calls.filter(call => call.method === method).at(-1);
  assert.ok(request, `Expected ${method} call`);
  assert.ok(request.syncSessionId, `${method} must carry a nonempty session`);
  return request;
}

function assertIdle(h) {
  assert.equal(h.state.screenSource.activeMode, "");
  assert.equal(h.state.screenSource.activeTargetId, "");
  assert.equal(h.state.screenSource.embeddedSourceId, "");
  assert.equal(h.state.screenSource.startPromise, null);
  assert.equal(h.state.screenSource.stream, null);
  assert.equal(h.pending(), null);
  assert.equal(h.session(), "");
}

function assertCancelled(result) {
  assert.equal(result.error?.code, "MIRROR_START_CANCELLED", result.error?.stack);
}

function assertSessionCalls(h, method, identity) {
  const requests = h.calls.filter(call => call.method === method);
  assert.ok(requests.length > 0, `Expected ${method} cleanup`);
  for (const request of requests) {
    assert.equal(identityKey(request), identityKey(identity), `${method} must only clear its own session`);
    if (method === "clearWin") assert.equal(request.restoreVisible, false);
  }
}

async function main() {
  let checks = 0;
  async function check(name, run) {
    await run(); checks += 1; console.log(`PASS ${name}`);
  }

  await check("WebContentsView pending attach → stop → late result stays stopped", async () => {
    const h = createHarness(), pending = h.queue("attach");
    const start = observe(h.start()); await flush();
    const identity = requestFor(h, "attach");
    assert.equal(h.pending()?.mode, "embedded-webcontentsview");
    await h.stop(); assertIdle(h); assert.equal(h.native.web, null);
    pending.resolve(h.success(identity)); assertCancelled(await start); assertIdle(h);
    assertSessionCalls(h, "clearWeb", identity);
    assert.equal(h.calls.some(call => ["clearWin", "stopTarget", "syncVideo"].includes(call.method)), false);
  });

  await check("old WebContentsView completion cannot clear a newer target/session", async () => {
    const h = createHarness(), pending = h.queue("attach");
    const old = observe(h.start()); await flush();
    const oldIdentity = requestFor(h, "attach");
    await h.stop({ announce: false }); h.select("target-b"); await h.start();
    const nextIdentity = requestFor(h, "attach"), status = h.state.screenSource.statusText;
    assert.notEqual(nextIdentity.syncSessionId, oldIdentity.syncSessionId);
    pending.resolve(h.success(oldIdentity)); assertCancelled(await old);
    assert.equal(identityKey(h.native.web), identityKey(nextIdentity));
    assert.equal(h.session(), nextIdentity.syncSessionId);
    assert.equal(h.state.screenSource.activeTargetId, "target-b");
    assert.equal(h.state.screenSource.statusText, status);
    assertSessionCalls(h, "clearWeb", oldIdentity);
  });

  await check("late rejected WebContentsView attach preserves a new pending startup", async () => {
    const h = createHarness(), first = h.queue("attach"), second = h.queue("attach");
    const old = observe(h.start()); await flush();
    await h.stop({ announce: false });
    const next = observe(h.start()); await flush();
    const identity = requestFor(h, "attach"), startPromise = h.state.screenSource.startPromise;
    first.reject(new Error("old load rejected"));
    assert.equal((await old).error?.message, "old load rejected");
    assert.equal(h.state.screenSource.startPromise, startPromise);
    assert.equal(h.session(), identity.syncSessionId);
    assert.equal(identityKey(h.pending()), identityKey(identity));
    second.resolve(h.success(identity)); assert.ok((await next).value?.ok);
  });

  await check("Win32 pending prepare → stop uses Win32 cleanup with original session", async () => {
    const h = createHarness("win32"), pending = h.queue("prepare");
    const start = observe(h.start()); await flush();
    const identity = requestFor(h, "prepare");
    assert.equal(h.pending()?.mode, "embedded-win32");
    await h.stop({ announce: false }); assertIdle(h);
    assertSessionCalls(h, "clearWin", identity); assertSessionCalls(h, "stopTarget", identity);
    assert.equal(h.native.target, null);
    pending.resolve(h.success(identity)); assertCancelled(await start); assertIdle(h);
    assert.equal(h.calls.some(call => ["clearWeb", "attach", "embed"].includes(call.method)), false);
  });

  await check("late Win32 prepare cannot stop a newer same-target session", async () => {
    const h = createHarness("win32"), pending = h.queue("prepare");
    const old = observe(h.start()); await flush();
    const oldIdentity = requestFor(h, "prepare");
    await h.stop({ announce: false }); await h.start();
    const nextIdentity = requestFor(h, "embed");
    pending.resolve(h.success(oldIdentity)); assertCancelled(await old);
    assert.equal(identityKey(h.native.target), identityKey(nextIdentity));
    assert.equal(identityKey(h.native.win), identityKey(nextIdentity));
    assert.equal(h.session(), nextIdentity.syncSessionId);
    assert.equal(h.state.screenSource.activeMode, "embedded-win32");
    assertSessionCalls(h, "stopTarget", oldIdentity);
    assert.equal(h.calls.filter(call => call.method === "embed").length, 1);
  });

  await check("late Win32 embed cleans only old session while a new one remains active", async () => {
    const h = createHarness("win32"), pending = h.queue("embed");
    const old = observe(h.start()); await flush();
    const oldIdentity = requestFor(h, "embed");
    await h.stop({ announce: false }); await h.start();
    const nextIdentity = requestFor(h, "embed"), status = h.state.screenSource.statusText;
    pending.resolve(h.success(oldIdentity)); assertCancelled(await old);
    assert.equal(identityKey(h.native.win), identityKey(nextIdentity));
    assert.equal(identityKey(h.native.target), identityKey(nextIdentity));
    assert.equal(h.session(), nextIdentity.syncSessionId);
    assert.equal(h.state.screenSource.statusText, status);
    assertSessionCalls(h, "clearWin", oldIdentity); assertSessionCalls(h, "stopTarget", oldIdentity);
    assert.equal(h.calls.some(call => call.method === "clearWeb"), false);
  });

  await check("force mode change cancels pending WebContentsView before Win32 startup", async () => {
    const h = createHarness(), pending = h.queue("attach");
    const old = observe(h.start()); await flush();
    const oldIdentity = requestFor(h, "attach");
    h.state.screenSource.renderMode = "win32";
    await h.start({ force: true });
    const nextIdentity = requestFor(h, "embed");
    assert.notEqual(oldIdentity.syncSessionId, nextIdentity.syncSessionId);
    assert.ok(h.calls.findIndex(call => call.method === "clearWeb") < h.calls.findIndex(call => call.method === "prepare"));
    pending.resolve(h.success(oldIdentity)); assertCancelled(await old);
    assert.equal(h.state.screenSource.activeMode, "embedded-win32");
    assert.equal(identityKey(h.native.win), identityKey(nextIdentity));
    assertSessionCalls(h, "clearWeb", oldIdentity);
  });

  await check("force mode change cancels pending Win32 prepare before WebContentsView startup", async () => {
    const h = createHarness("win32"), pending = h.queue("prepare");
    const old = observe(h.start()); await flush();
    const oldIdentity = requestFor(h, "prepare");
    h.state.screenSource.renderMode = "webcontentsview";
    await h.start({ force: true });
    const nextIdentity = requestFor(h, "attach");
    pending.resolve(h.success(oldIdentity)); assertCancelled(await old);
    assert.equal(h.state.screenSource.activeMode, "embedded-webcontentsview");
    assert.equal(identityKey(h.native.web), identityKey(nextIdentity));
    assert.equal(h.calls.some(call => call.method === "embed"), false);
    assertSessionCalls(h, "clearWin", oldIdentity); assertSessionCalls(h, "stopTarget", oldIdentity);
  });

  await check("Win32 prepare rejection releases target and permits a fresh startup", async () => {
    const h = createHarness("win32"), pending = h.queue("prepare");
    const start = observe(h.start()); await flush();
    const identity = requestFor(h, "prepare");
    pending.reject(new Error("prepare failed")); assert.equal((await start).error?.message, "prepare failed");
    assertIdle(h); assert.equal(h.native.target, null);
    assertSessionCalls(h, "clearWin", identity); assertSessionCalls(h, "stopTarget", identity);
    await h.start(); assert.equal(h.state.screenSource.activeMode, "embedded-win32");
    assert.notEqual(h.session(), identity.syncSessionId);
  });

  await check("Win32 embed failure releases both resources and permits retry", async () => {
    const h = createHarness("win32"), pending = h.queue("embed");
    const start = observe(h.start()); await flush();
    const identity = requestFor(h, "embed");
    pending.resolve({ ok: false, error: "embed failed" });
    assert.equal((await start).error?.message, "embed failed"); assertIdle(h);
    assert.equal(h.native.target, null); assert.equal(h.native.win, null);
    assertSessionCalls(h, "clearWin", identity); assertSessionCalls(h, "stopTarget", identity);
    await h.start(); assert.equal(h.state.screenSource.activeMode, "embedded-win32");
  });

  await check("repeated stop is safe and clears video tracks synchronously", async () => {
    const h = createHarness(); let stopped = 0;
    h.state.screenSource.stream = { getTracks: () => [{ stop() { stopped += 1; } }] };
    h.state.screenSource.activeMode = "capture"; h.video.srcObject = h.state.screenSource.stream;
    const stop = h.stop({ announce: false });
    assert.equal(h.video.srcObject, null); assert.equal(stopped, 1); assertIdle(h);
    await stop; await h.stop({ announce: false }); assertIdle(h);
    assert.equal(stopped, 1);
    assert.equal(h.calls.some(call => ["clearWeb", "clearWin", "stopTarget"].includes(call.method)), false);
    assert.ok(h.stats().resets >= 2);
  });

  console.log(`Mirror runtime lifecycle: ${checks} production-function checks passed`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
