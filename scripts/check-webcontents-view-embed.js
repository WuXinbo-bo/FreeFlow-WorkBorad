const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "../electron/web/webContentsViewEmbed.js");
const source = fs.readFileSync(sourcePath, "utf8");
const targets = [
  { id: "alpha", label: "Alpha", note: "first", webUrl: "https://alpha.example.test" },
  { id: "beta", label: "Beta", note: "second", webUrl: "https://beta.example.test" },
];
const firstBounds = { x: 12, y: 24, width: 600, height: 420 };
const nextBounds = { x: 32, y: 48, width: 720, height: 520 };
const copy = (value) => JSON.parse(JSON.stringify(value));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function createHarness(options = {}) {
  const views = [];
  const focusEvents = [];
  const attachments = [];
  let host = createHost();

  function createHost() {
    return {
      destroyed: false,
      isDestroyed() { return this.destroyed; },
      contentView: {
        children: [],
        addChildView(view) {
          if (options.failAttach) throw new Error("host attach failed");
          this.removeChildView(view);
          this.children.push(view);
        },
        removeChildView(view) {
          this.children = this.children.filter((child) => child !== view);
        },
      },
    };
  }

  class FakeWebContents extends EventEmitter {
    constructor(id) {
      super();
      this.id = id;
      this.url = "";
      this.destroyed = false;
      this.loads = [];
      this.closeCalls = 0;
      this.focusCalls = 0;
      this.throttle = false;
    }
    isDestroyed() { return this.destroyed; }
    getURL() { return this.url; }
    setWindowOpenHandler(handler) { this.openHandler = handler; }
    loadURL(url) {
      if (options.failLoadSynchronously) throw new Error("synchronous load failure");
      const pending = deferred();
      this.loads.push({ url, ...pending });
      return pending.promise.then(() => { this.url = url; });
    }
    close() {
      this.closeCalls += 1;
      this.destroyed = true;
      this.emit("blur");
      this.emit("destroyed");
    }
    destroy() { this.destroyed = true; this.emit("destroyed"); }
    focus() { this.focusCalls += 1; this.emit("focus"); }
    blur() { this.emit("blur"); }
    setBackgroundThrottling(value) { this.throttle = value; }
  }

  class FakeWebContentsView {
    constructor(settings) {
      this.settings = settings;
      this.webContents = new FakeWebContents(100 + views.length);
      this.visible = true;
      this.bounds = null;
      views.push(this);
    }
    setBounds(bounds) { this.bounds = copy(bounds); }
    setVisible(visible) { this.visible = visible; }
  }

  const fakeElectron = {
    WebContentsView: options.unsupported ? undefined : FakeWebContentsView,
    shell: { openExternal: () => Promise.resolve() },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require(name) {
      assert.equal(name, "electron");
      return fakeElectron;
    },
  }, { filename: sourcePath });
  const manager = module.exports.createWebContentsViewEmbedManager(() => host, targets, {
    onFocusChanged(payload) { focusEvents.push(copy(payload)); },
    onAttached(entry) {
      attachments.push(entry);
      options.onAttached?.(entry, host, manager);
    },
  });
  return {
    manager, views, focusEvents, attachments,
    get host() { return host; },
    replaceHost() { const previous = host; host = createHost(); return previous; },
    async attach(targetId = "alpha", syncSessionId = "session-a", bounds = firstBounds) {
      const operation = manager.attachTarget({ targetId, syncSessionId, bounds });
      views.at(-1).webContents.loads.at(-1).resolve();
      return operation;
    },
  };
}

async function checkPendingAttachDedupe() {
  const { manager, views, host, attachments } = createHarness();
  const first = manager.attachTarget({ targetId: "alpha", syncSessionId: "session-a", bounds: firstBounds });
  const second = manager.attachTarget({ targetId: "alpha", syncSessionId: "session-a", bounds: nextBounds });
  assert.equal(views.length, 1, "same target must reuse the pending page");
  assert.equal(views[0].webContents.loads.length, 1, "concurrent attach must not duplicate loadURL");
  assert.equal(manager.getState().syncSessionId, "session-a", "loading entries must already have their session");
  assert.equal(manager.getState().loading, true);
  assert.equal(manager.getState().visible, false);
  assert.equal(manager.focusTarget().focused, false, "pending view must not take keyboard focus");
  const newestBounds = { x: 48, y: 52, width: 800, height: 580 };
  manager.syncBounds({ targetId: "alpha", syncSessionId: "session-a", syncRevision: 5, bounds: newestBounds });
  assert.equal(host.contentView.children.length, 0, "bounds sync must not attach an unloaded page");
  views[0].webContents.loads[0].resolve();
  assert.equal((await first).stale, true);
  const result = await second;
  assert.equal(result.active, true);
  assert.equal(result.webContentsId, views[0].webContents.id);
  assert.deepEqual(views[0].bounds, newestBounds, "load completion must preserve newer bounds");
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].view, views[0]);
  await manager.attachTarget({ targetId: "alpha", syncSessionId: "session-a", bounds: newestBounds });
  const staleBounds = manager.syncBounds({ targetId: "alpha", syncSessionId: "session-a", syncRevision: 4, bounds: firstBounds });
  assert.equal(staleBounds.stale, true, "reattach must not reset the same session's bounds revision");
  assert.deepEqual(views[0].bounds, newestBounds);
  assert.equal(views[0].settings.webPreferences.sandbox, true);
  assert.equal(views[0].settings.webPreferences.nodeIntegration, false);
  assert.equal(views[0].settings.webPreferences.partition, "persist:ai-worker-ai-mirror-alpha");
  manager.clearTarget();
}

async function checkTargetSwitchOrdering() {
  const { manager, views, host, focusEvents } = createHarness();
  const first = manager.attachTarget({ targetId: "alpha", syncSessionId: "session-a", bounds: firstBounds });
  const second = manager.attachTarget({ targetId: "beta", syncSessionId: "session-b", bounds: nextBounds });
  assert.equal(views[0].webContents.closeCalls, 1);
  views[0].webContents.loads[0].resolve();
  assert.equal((await first).stale, true);
  assert.equal(host.contentView.children.length, 0, "old completion must not attach the new pending target");
  views[1].webContents.loads[0].resolve();
  assert.equal((await second).target.id, "beta");
  assert.equal(manager.getState().targetId, "beta");
  assert.deepEqual(host.contentView.children, [views[1]]);
  views[0].webContents.emit("focus");
  views[0].webContents.emit("blur");
  assert.equal(focusEvents.length, 0, "destroyed target's late focus events must be ignored");
  manager.clearTarget();
}

async function checkNewTargetCompletesFirst() {
  const { manager, views, host } = createHarness();
  const first = manager.attachTarget({ targetId: "alpha", syncSessionId: "session-a" });
  const second = manager.attachTarget({ targetId: "beta", syncSessionId: "session-b", bounds: nextBounds });
  views[1].webContents.loads[0].resolve();
  await second;
  views[0].webContents.loads[0].reject(new Error("old canceled navigation"));
  assert.equal((await first).stale, true, "late old failure must not reject or destroy the current target");
  assert.equal(manager.getState().targetId, "beta");
  assert.equal(views[1].webContents.isDestroyed(), false);
  assert.deepEqual(host.contentView.children, [views[1]]);
  manager.clearTarget();
}

async function checkClearDuringLoad() {
  for (const rejects of [false, true]) {
    const { manager, views, host, attachments } = createHarness();
    const pending = manager.attachTarget({ targetId: "alpha", syncSessionId: "session-a" });
    assert.equal(manager.clearTarget({ syncSessionId: "session-a" }).active, false);
    if (rejects) views[0].webContents.loads[0].reject(new Error("aborted by clear"));
    else views[0].webContents.loads[0].resolve();
    assert.equal((await pending).stale, true);
    assert.equal(manager.getState().active, false);
    assert.equal(views[0].webContents.closeCalls, 1);
    assert.equal(host.contentView.children.length, 0);
    assert.equal(attachments.length, 0);
  }
}

async function checkSameTargetSessionSwitch() {
  const { manager, views } = createHarness();
  const first = manager.attachTarget({ targetId: "alpha", syncSessionId: "session-old", bounds: firstBounds });
  const second = manager.attachTarget({ targetId: "alpha", syncSessionId: "session-new", bounds: nextBounds });
  assert.equal(views.length, 1);
  assert.equal(manager.getState().syncSessionId, "session-new");
  assert.equal(manager.clearTarget({ syncSessionId: "session-old" }).stale, true);
  assert.equal(manager.setVisibility(false, { targetId: "alpha", syncSessionId: "session-old" }).stale, true);
  assert.equal(manager.syncBounds({ syncSessionId: "session-old", syncRevision: 99, bounds: firstBounds }).stale, true);
  views[0].webContents.loads[0].resolve();
  assert.equal((await first).stale, true);
  assert.equal((await second).syncSessionId, "session-new");
  assert.equal(manager.getState().visible, true);
  assert.deepEqual(views[0].bounds, nextBounds);
  const id = manager.getState().webContentsId;
  await manager.attachTarget({ targetId: "alpha", syncSessionId: "third-session", bounds: firstBounds });
  assert.equal(manager.getState().webContentsId, id, "new UI session for the same target must retain the page");
  assert.equal(views[0].webContents.loads.length, 1);
  assert.equal(manager.clearTarget({ syncSessionId: "session-new" }).stale, true);
  manager.clearTarget({ syncSessionId: "third-session" });
}

async function checkClearThenReattachSameTarget() {
  const { manager, views, host } = createHarness();
  const old = manager.attachTarget({ targetId: "alpha", syncSessionId: "old" });
  manager.clearTarget({ syncSessionId: "old" });
  const current = manager.attachTarget({ targetId: "alpha", syncSessionId: "current", bounds: nextBounds });
  views[1].webContents.loads[0].resolve();
  await current;
  manager.focusTarget();
  views[0].webContents.loads[0].reject(new Error("old navigation stopped"));
  assert.equal((await old).stale, true);
  assert.equal(manager.getState().webContentsId, views[1].webContents.id);
  assert.equal(manager.clearTarget({ syncSessionId: "old" }).stale, true);
  assert.deepEqual(host.contentView.children, [views[1]]);
  manager.clearTarget();
}

async function checkRapidMixedOperations() {
  const { manager, views, host, attachments } = createHarness();
  const operations = [];
  for (let index = 0; index < 30; index += 1) {
    const syncSessionId = `session-${index}`;
    operations.push(manager.attachTarget({ targetId: index % 2 ? "alpha" : "beta", syncSessionId }));
    if (index % 4 === 0) manager.clearTarget({ syncSessionId });
  }
  operations.push(manager.attachTarget({ targetId: "alpha", syncSessionId: "latest", bounds: nextBounds }));
  const latestId = manager.getState().webContentsId;
  for (const view of [...views].reverse()) {
    if (view.webContents.id === latestId) view.webContents.loads[0].resolve();
    else view.webContents.loads[0].reject(new Error("superseded navigation"));
  }
  const results = await Promise.all(operations);
  assert.equal(results.at(-1).active, true);
  assert.equal(results.slice(0, -1).every((result) => result.stale), true);
  assert.equal(manager.getState().syncSessionId, "latest");
  assert.equal(manager.getState().webContentsId, latestId);
  assert.equal(host.contentView.children.length, 1);
  assert.equal(attachments.length, 1, "only the final requested target may attach");
  assert.equal(views.filter((view) => !view.webContents.isDestroyed()).length, 1);
  manager.clearTarget();
}

async function checkLoadFailureAndRetry() {
  const harness = createHarness();
  const pending = harness.manager.attachTarget({ targetId: "alpha", syncSessionId: "failed" });
  const rejection = assert.rejects(pending, /network unavailable/);
  harness.views[0].webContents.loads[0].reject(new Error("network unavailable"));
  await rejection;
  assert.equal(harness.manager.getState().active, false);
  assert.equal(harness.views[0].webContents.closeCalls, 1, "failed navigation must release its webContents");
  await harness.attach("alpha", "retry");
  assert.equal(harness.views.length, 2, "retry must create a fresh page after failure");
  assert.equal(harness.manager.getState().visible, true);
  assert.equal(harness.manager.getState().syncSessionId, "retry");
  harness.manager.clearTarget();

  const sync = createHarness({ failLoadSynchronously: true });
  await assert.rejects(sync.manager.attachTarget({ targetId: "alpha" }), /synchronous load failure/);
  assert.equal(sync.manager.getState().active, false);
  assert.equal(sync.views[0].webContents.closeCalls, 1);
}

async function checkSharedLoadFailure() {
  const { manager, views } = createHarness();
  const first = manager.attachTarget({ targetId: "alpha", syncSessionId: "old" });
  const second = manager.attachTarget({ targetId: "alpha", syncSessionId: "new" });
  const rejection = assert.rejects(second, /shared navigation failed/);
  views[0].webContents.loads[0].reject(new Error("shared navigation failed"));
  assert.equal((await first).stale, true);
  await rejection;
  assert.equal(manager.getState().active, false);
  assert.equal(views[0].webContents.closeCalls, 1);
}

async function checkHideDuringLoadAndRestore() {
  const { manager, views, host, focusEvents } = createHarness();
  const pending = manager.attachTarget({ targetId: "alpha", syncSessionId: "session-a", bounds: firstBounds });
  manager.setVisibility(false, { syncSessionId: "session-a" });
  views[0].webContents.loads[0].resolve();
  assert.equal((await pending).visible, false, "load completion must not undo a later hide");
  assert.equal(host.contentView.children.length, 0);
  manager.setVisibility(true, { syncSessionId: "session-a" });
  const originalId = manager.getState().webContentsId;
  manager.focusTarget();
  assert.equal(focusEvents.at(-1).owner, "ai-mirror");
  assert.equal(focusEvents.at(-1).webContentsId, originalId);
  assert.equal(focusEvents.at(-1).syncSessionId, "session-a");
  manager.setVisibility(false);
  assert.equal(focusEvents.at(-1).owner, "");
  assert.equal(manager.getState().active, true);
  assert.equal(manager.getState().attached, false);
  assert.equal(views[0].webContents.closeCalls, 0);
  const focusCalls = views[0].webContents.focusCalls;
  assert.equal(manager.focusTarget().focused, false);
  views[0].webContents.emit("focus");
  assert.equal(focusEvents.at(-1).owner, "", "hidden page's stray focus event must not claim input");
  assert.equal(views[0].webContents.focusCalls, focusCalls);
  manager.syncBounds({ syncSessionId: "session-a", syncRevision: 1, bounds: nextBounds });
  assert.equal(host.contentView.children.length, 0, "hidden bounds sync must not reattach");
  for (let index = 0; index < 40; index += 1) {
    manager.setVisibility(true);
    assert.deepEqual(views[0].bounds, nextBounds);
    assert.equal(views[0].webContents.throttle, false);
    assert.equal(manager.getState().webContentsId, originalId);
    manager.setVisibility(false);
  }
  await manager.attachTarget({ targetId: "alpha", syncSessionId: "session-a" });
  assert.equal(views.length, 1);
  assert.equal(views[0].webContents.loads.length, 1);
  assert.equal(views[0].webContents.throttle, false, "attach after hide must restore foreground scheduling");
  assert.equal(manager.getState().visible, true);
  manager.clearTarget();
}

async function checkOverlayOrderAndHostReplacement() {
  const overlay = { kind: "application-overlay" };
  const harness = createHarness({
    onAttached(entry, host) {
      assert.equal(entry.view.webContents.id, harness.manager.getState().webContentsId);
      host.contentView.addChildView(overlay);
    },
  });
  harness.host.contentView.addChildView(overlay);
  await harness.attach();
  assert.deepEqual(harness.host.contentView.children, [harness.views[0], overlay]);
  harness.manager.setVisibility(false);
  harness.manager.setVisibility(true);
  assert.deepEqual(harness.host.contentView.children, [harness.views[0], overlay]);
  const oldHost = harness.replaceHost();
  harness.manager.syncBounds({ syncSessionId: "session-a", syncRevision: 1, bounds: nextBounds });
  assert.deepEqual(oldHost.contentView.children, [overlay], "host replacement must detach from the original host");
  assert.deepEqual(harness.host.contentView.children, [harness.views[0], overlay]);
  harness.manager.clearTarget();
}

async function checkStaleVisibilityAndClear() {
  const harness = createHarness();
  await harness.attach("alpha", "session-a");
  await harness.attach("beta", "session-b");
  for (const identity of [{ targetId: "alpha" }, { syncSessionId: "session-a" }]) {
    assert.equal(harness.manager.setVisibility(false, identity).stale, true);
    assert.equal(harness.manager.clearTarget(identity).stale, true);
    assert.equal(harness.manager.getState().targetId, "beta");
    assert.equal(harness.manager.getState().visible, true);
  }
  harness.manager.clearTarget();
}

async function checkShutdownAndAttachFailure() {
  const harness = createHarness();
  const pending = harness.manager.attachTarget({ targetId: "alpha" });
  const rejected = assert.rejects(pending, /主窗口不可用/);
  harness.host.destroyed = true;
  harness.views[0].webContents.loads[0].resolve();
  await rejected;
  assert.equal(harness.manager.getState().active, false);
  assert.equal(harness.views[0].webContents.closeCalls, 1);

  const broken = createHarness({ failAttach: true });
  const attaching = broken.manager.attachTarget({ targetId: "alpha" });
  const attachRejected = assert.rejects(attaching, /host attach failed/);
  broken.views[0].webContents.loads[0].resolve();
  await attachRejected;
  assert.equal(broken.manager.getState().active, false);
  assert.equal(broken.views[0].webContents.closeCalls, 1);
}

async function checkExternallyDestroyedPageAndReentrantClear() {
  const harness = createHarness();
  await harness.attach();
  harness.manager.focusTarget();
  harness.views[0].webContents.destroy();
  assert.equal(harness.focusEvents.at(-1).owner, "", "external destruction must release focus ownership");
  assert.equal(harness.host.contentView.children.length, 0);
  harness.views[0].webContents = null;
  assert.equal(harness.manager.setVisibility(true).active, false);
  assert.equal(harness.manager.focusTarget().active, false);
  await harness.attach();
  assert.equal(harness.views.length, 2);
  harness.manager.clearTarget();

  const reentrant = createHarness({ onAttached(_entry, _host, manager) { manager.clearTarget(); } });
  assert.equal((await reentrant.attach()).stale, true, "onAttached may invalidate the attach operation");
  assert.equal(reentrant.manager.getState().active, false);
}

async function checkUnsupported() {
  const { manager } = createHarness({ unsupported: true });
  assert.equal(manager.isSupported(), false);
  assert.equal(manager.getState().webContentsId, null);
  assert.equal(manager.getState().syncSessionId, "");
  assert.equal(manager.setVisibility(true, { syncSessionId: "unused" }).active, false);
  assert.equal(manager.clearTarget({ syncSessionId: "unused" }).active, false);
  assert.equal(manager.blurTarget().active, false);
  assert.throws(() => manager.attachTarget({ targetId: "alpha" }), /不支持/);
}

async function main() {
  const checks = [
    checkPendingAttachDedupe,
    checkTargetSwitchOrdering,
    checkNewTargetCompletesFirst,
    checkClearDuringLoad,
    checkSameTargetSessionSwitch,
    checkClearThenReattachSameTarget,
    checkRapidMixedOperations,
    checkLoadFailureAndRetry,
    checkSharedLoadFailure,
    checkHideDuringLoadAndRestore,
    checkOverlayOrderAndHostReplacement,
    checkStaleVisibilityAndClear,
    checkShutdownAndAttachFailure,
    checkExternallyDestroyedPageAndReentrantClear,
    checkUnsupported,
  ];
  for (const check of checks) await check();
  console.log(`WebContentsView embed lifecycle: ${checks.length} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
