"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");

const ROOT = path.resolve(__dirname, "..");
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function loadModule(file, electron) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: name => name === "electron" ? electron : require(name), __dirname: path.dirname(path.join(ROOT, file)), setTimeout, clearTimeout, URL, Promise, console }, { filename: file });
  return module.exports;
}

function fixture({ failSetup = false } = {}) {
  const views = [];
  const calls = { requests: [], events: [], focus: [] };
  const mainWindow = { isDestroyed: () => false, getContentSize: () => [1200, 800], contentView: {
    children: [],
    addChildView(view) { this.children = this.children.filter(child => child !== view); this.children.push(view); },
    removeChildView(view) { this.children = this.children.filter(child => child !== view); },
  } };
  class FakeWebContentsView {
    constructor(options) {
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: "about:blank" };
      this.webContents.id = views.length + 1;
      this.webContents.destroyed = false;
      this.webContents.isDestroyed = () => this.webContents.destroyed;
      this.webContents.getURL = () => this.webContents.mainFrame.url;
      this.webContents.sent = [];
      this.webContents.send = (channel, payload) => this.webContents.sent.push({ channel, payload });
      this.webContents.setWindowOpenHandler = handler => { this.webContents.openWindow = handler; };
      this.webContents.focus = () => { this.webContents.focused = true; this.webContents.focusCount = (this.webContents.focusCount || 0) + 1; this.webContents.emit("focus"); };
      this.webContents.isFocused = () => Boolean(this.webContents.focused);
      this.webContents.blur = () => { this.webContents.focused = false; this.webContents.emit("blur"); };
      this.webContents.setBackgroundThrottling = value => { this.throttled = value; };
      this.webContents.close = () => { this.webContents.destroyed = true; this.webContents.emit("destroyed"); };
      this.webContents.destroy = this.webContents.close;
      this.load = deferred();
      this.webContents.loadURL = url => { this.loadCount = (this.loadCount || 0) + 1; this.webContents.mainFrame.url = url; return this.load.promise; };
      views.push(this);
    }
    setVisible(value) { this.visible = value; }
    setBackgroundColor(value) { if (failSetup) { failSetup = false; throw new Error("native setup failed"); } this.background = value; }
    setBounds(value) { this.bounds = { ...value }; }
  }
  const { createMirrorOverlayManager } = loadModule("electron/web/mirrorOverlay.js", { WebContentsView: FakeWebContentsView });
  let appUrl = "http://127.0.0.1:3000/?desktop=1";
  const manager = createMirrorOverlayManager({
    getWindow: () => mainWindow,
    getAppUrl: () => appUrl,
    onRequest: async (method, args, context) => {
      calls.requests.push({ method, args, context });
      if (method === "fail") throw new Error("host rejected");
      if (method === "conflict") throw Object.assign(new Error("remote conflict"), {
        code: "GITHUB_CONFLICT", status: 409, operationId: "operation-1", conflicts: [{ boardId: "board-1" }],
        state: { phase: "conflict" }, retryAfterMs: 1200, artifacts: ["recovery.json"], localChanged: true,
        filePath: "/workspace/board.json", boardId: "board-1", merged: false,
      });
      return { ok: true, value: args[0] };
    },
    onEvent: (eventName, payload, context) => { calls.events.push({ eventName, payload, context }); },
    onFocusChanged: event => calls.focus.push(event),
  });
  const event = (view = views.at(-1)) => ({ sender: view.webContents, senderFrame: view.webContents.mainFrame });
  const ready = async () => {
    await settle();
    views.at(-1).load.resolve();
    await settle();
    assert.equal(manager.ready(event()).ok, true);
  };
  return { manager, views, calls, mainWindow, event, ready, setAppUrl: url => { appUrl = url; } };
}
const input = (surfaceId, kind = "settings") => ({ surfaceId, kind, bounds: { x: 200, y: 100, width: 420, height: 520 }, payload: { draft: surfaceId } });

async function main() {
  const f = fixture();
  const { manager, views, calls } = f;
  try {
    assert.equal(manager.getWebContents(), null, "overlay must be lazy");
    for (const invalid of [input("unknown"), input("settings", "unknown")]) {
      assert.equal((await manager.present(invalid)).ok, false, "unregistered surface was accepted");
      assert.equal(views.length, 0, "invalid surface allocated a renderer");
    }
    const first = manager.present(input("settings"));
    const latest = manager.present(input("shell-more", "menu"));
    assert.equal(views.length, 1, "concurrent startup created multiple renderers");
    assert.equal(manager.getState().visible, false);
    assert.equal(f.mainWindow.contentView.children.length, 0, "unready view intercepted the application");
    await settle();
    assert.equal(views[0].webContents.getURL(), "http://127.0.0.1:3000/mirror-overlay.html");
    assert.equal(manager.ready(f.event()).ok, true, "renderer ready may precede loadURL completion");
    await settle();
    assert.equal(manager.getState().visible, false);
    assert.equal(manager.syncBounds({ surfaceId: "shell-more", bounds: { x: 250, y: 110, width: 360, height: 410 } }).ok, true);
    views[0].load.resolve();
    assert.equal((await first).stale, true);
    assert.equal((await latest).ok, true);
    assert.equal(manager.getState().surfaceId, "shell-more");
    assert.equal(manager.getState().webContentsId, views[0].webContents.id);
    assert.equal(manager.getState().visible, true);
    assert.equal(views[0].webContents.sent.length, 1);
    assert.equal(views[0].webContents.sent[0].payload.surfaceId, "shell-more", "stale startup presentation leaked");
    assert.deepEqual(views[0].bounds, { x: 250, y: 110, width: 360, height: 410 });
    assert.equal(views[0].options.webPreferences.sandbox, true);
    assert.equal(views[0].options.webPreferences.contextIsolation, true);
    assert.equal(views[0].options.webPreferences.nodeIntegration, false);
    assert(views[0].options.webPreferences.preload.endsWith("mirrorOverlayPreload.js"));
    assert.equal(views[0].background, "#00000000");
    assert.equal(calls.focus.at(-1).owner, "overlay");

    assert.equal(manager.dismiss({ surfaceId: "settings" }).stale, true, "old menu must not close the new surface");
    const visibleState = JSON.stringify(manager.getState());
    const focusCount = views[0].webContents.focusCount;
    assert.equal(manager.notify({ kind: "event", eventName: "settings-updated" }).ok, true);
    assert.equal(JSON.stringify(manager.getState()), visibleState);
    assert.equal(views[0].webContents.focusCount, focusCount, "event forwarding stole focus");
    const refresh = manager.present({ ...input("shell-more", "menu"), payload: { theme: "dark" } });
    assert.equal(manager.getState().visible, true, "same-surface refresh briefly hid the current view");
    assert.equal((await refresh).ok, true);
    assert.equal(views[0].webContents.focusCount, focusCount, "same-surface update interrupted editing focus");
    const menuEventCount = calls.events.length;
    views[0].webContents.blur();
    await settle();
    assert.equal(calls.events.length, menuEventCount + 1, "outside click did not close the native menu");
    assert.equal(calls.events.at(-1).eventName, "closed");
    assert.equal(calls.events.at(-1).payload.surfaceId, "shell-more");
    views[0].webContents.focus();
    views[0].webContents.blur();
    views[0].webContents.focus();
    await settle();
    assert.equal(calls.events.length, menuEventCount + 1, "transient blur closed the refocused menu");
    views[0].webContents.blur();
    const changedMenu = manager.present(input("mirror-controls", "menu"));
    await changedMenu;
    await settle();
    assert.equal(calls.events.length, menuEventCount + 1, "old menu blur closed a replacement surface");
    const mirror = {};
    f.mainWindow.contentView.addChildView(mirror);
    assert.equal(manager.reorder().ok, true);
    assert.equal(f.mainWindow.contentView.children.at(-1), views[0]);

    assert.equal(manager.dismiss({ surfaceId: "mirror-controls" }).ok, true);
    assert.equal(manager.getState().visible, false);
    assert.equal(views[0].visible, false);
    assert.equal(views[0].webContents.isDestroyed(), false, "hiding destroyed settings drafts");
    assert.equal(views[0].throttled, true);
    assert.equal(views[0].webContents.sent.at(-1).payload.visible, false);
    assert.equal(f.mainWindow.contentView.children.includes(views[0]), false);
    for (let i = 0; i < 8; i++) {
      const previousFocus = views[0].webContents.focusCount;
      assert.equal((await manager.present(input("settings"))).ok, true);
      assert.equal(views[0].webContents.focusCount, previousFocus + 1, "reopening did not restore focus");
      assert.equal(manager.dismiss().ok, true);
    }
    assert.equal(views.length, 1);
    assert.equal(views[0].loadCount, 1, "reopening reloaded the retained renderer");
    assert.equal((await manager.present(input("settings"))).ok, true);
    const settingsEventCount = calls.events.length;
    views[0].webContents.blur();
    await settle();
    assert.equal(calls.events.length, settingsEventCount, "settings closed when the user focused the mirror");
    views[0].webContents.focus();
    assert.equal((await manager.handleRequest(f.event(), "read", ["value"])).value, "value");
    assert.equal(calls.requests.at(-1).context.surfaceId, "settings");
    assert.equal((await manager.handleRequest(f.event(), "fail", [])).error, "host rejected");
    const conflict = await manager.handleRequest(f.event(), "conflict", []);
    assert.equal(conflict.ok, false);
    assert.equal(conflict.error, "remote conflict");
    assert.deepEqual(JSON.parse(JSON.stringify(conflict.errorDetails)), {
      message: "remote conflict", code: "GITHUB_CONFLICT", status: 409, operationId: "operation-1", conflicts: [{ boardId: "board-1" }],
      state: { phase: "conflict" }, retryAfterMs: 1200, artifacts: ["recovery.json"], localChanged: true,
      filePath: "/workspace/board.json", boardId: "board-1", merged: false,
    });
    assert.equal((await manager.handleRequest(f.event(), "read", {})).ok, false);
    const evil = { sender: new EventEmitter(), senderFrame: views[0].webContents.mainFrame };
    assert.equal((await manager.handleRequest(evil, "read", [])).ok, false);
    assert.equal(manager.ready(evil).ok, false);
    assert.equal(manager.handleEvent(evil, "closed", {}).ok, false);
    assert.equal((await manager.handleRequest({ ...f.event(), senderFrame: { url: views[0].webContents.getURL() } }, "read", [])).ok, false, "subframe impersonated the trusted page");
    for (const url of ["http://127.0.0.1:3000/", "http://127.0.0.1:3000/mirror-overlay.html?extra=1", "https://evil.example/mirror-overlay.html"]) {
      views[0].webContents.mainFrame.url = url;
      assert.equal((await manager.handleRequest(f.event(), "read", [])).ok, false, `accepted ${url}`);
    }
    views[0].webContents.mainFrame.url = "http://127.0.0.1:3000/mirror-overlay.html";
    const beforeEvents = calls.events.length;
    assert.equal(manager.handleEvent(f.event(), "unavailable", {}).ok, false, "renderer forged a native failure event");
    assert.equal(manager.handleEvent(f.event(), "unknown", {}).ok, false, "unregistered renderer event was accepted");
    assert.equal(manager.handleEvent(f.event(), "closed", { surfaceId: "shell-more" }).stale, true);
    assert.equal(manager.handleEvent(f.event(), "closed", { surfaceId: "" }).stale, true);
    assert.equal(manager.handleEvent(f.event(), "action", { surfaceId: "desktop-more" }).stale, true);
    assert.equal(calls.events.length, beforeEvents, "stale or rejected renderer events reached the host");
    for (const eventName of ["closed", "action", "runtime-event", "close-blocked", "presented"]) {
      assert.equal(manager.handleEvent(f.event(), eventName, { surfaceId: "settings", saved: true }).ok, true);
      assert.equal(calls.events.at(-1).eventName, eventName);
      assert.equal(calls.events.at(-1).context.surfaceId, "settings");
    }
    for (const name of ["will-navigate", "will-redirect", "will-frame-navigate"]) {
      let prevented = false;
      views[0].webContents.emit(name, { preventDefault() { prevented = true; } }, "https://evil.example/");
      assert.equal(prevented, true, `${name} allowed foreign navigation`);
      prevented = false;
      views[0].webContents.emit(name, { preventDefault() { prevented = true; } }, "http://127.0.0.1:3000/mirror-overlay.html");
      assert.equal(prevented, false, `${name} blocked its exact trusted page`);
      views[0].webContents.emit(name, { url: "http://127.0.0.1:3000/mirror-overlay.html", isMainFrame: true, preventDefault() { prevented = true; } });
      assert.equal(prevented, false, `${name} blocked Electron 41 details-object navigation`);
    }
    let prevented = false;
    views[0].webContents.emit("will-frame-navigate", { preventDefault() { prevented = true; } }, { url: "http://127.0.0.1:3000/mirror-overlay.html", isMainFrame: false });
    assert.equal(prevented, true);
    assert.equal(views[0].webContents.openWindow({ url: "http://127.0.0.1:3000/" }).action, "deny");
    assert.equal(manager.syncBounds({ surfaceId: "old", bounds: input("old").bounds }).stale, true);
    assert.equal(manager.syncBounds({ bounds: { x: 1100.4, y: 760.2, width: 400, height: 400 } }).ok, true);
    assert.deepEqual(views[0].bounds, { x: 1100, y: 760, width: 100, height: 40 });
    assert.equal(manager.syncBounds({ bounds: { x: 0, y: 0, width: Infinity, height: 1 } }).ok, false);
    const oldSender = f.event();
    manager.clear();
    assert.equal(views[0].webContents.isDestroyed(), true);
    assert.equal(manager.getWebContents(), null);
    assert.equal((await manager.handleRequest(oldSender, "read", [])).ok, false);
    assert.equal(calls.events.filter(event => event.eventName === "unavailable").length, 0, "intentional clear reported an unexpected crash");
    const next = manager.present(input("desktop-more", "menu"));
    await f.ready();
    assert.equal((await next).ok, true);
    assert.equal(views.length, 2);
    views[1].webContents.emit("render-process-gone", {}, { reason: "crashed" });
    await settle();
    assert.equal(manager.getState().visible, false);
    assert.match(calls.events.at(-1).payload.reason, /crashed/);
    assert.equal(calls.events.at(-1).payload.surfaceId, "desktop-more");
    assert.equal(calls.events.at(-1).context.surfaceId, "desktop-more");
  } finally { manager.clear(); }

  for (const cancellation of ["dismiss", "clear", "reject", "destroyed"]) {
    const f = fixture();
    try {
      const pending = f.manager.present(input("settings"));
      await settle();
      const view = f.views[0];
      if (cancellation === "reject") view.load.reject(new Error("load failed"));
      else if (cancellation === "destroyed") view.webContents.close();
      else f.manager[cancellation]();
      view.load.resolve();
      if (cancellation === "dismiss") f.manager.ready(f.event());
      const outcome = await pending;
      assert.equal(f.manager.getState().visible, false, `${cancellation} resurrected an old presentation`);
      assert.equal(f.mainWindow.contentView.children.length, 0);
      if (cancellation === "dismiss") assert.equal(outcome.stale, true);
      else assert.equal(outcome.ok, false);
      assert.equal(view.webContents.sent.length, 0);
    } finally { f.manager.clear(); }
  }
  {
    const f = fixture({ failSetup: true });
    try {
      assert.equal((await f.manager.present(input("settings"))).ok, false);
      assert.equal(f.views[0].webContents.isDestroyed(), true, "native initialization failure leaked its renderer");
      assert.equal(f.manager.getWebContents(), null);
      const recovery = f.manager.present(input("settings"));
      await f.ready();
      assert.equal((await recovery).ok, true, "native initialization failure prevented a subsequent open");
    } finally { f.manager.clear(); }
  }
  {
    const f = fixture();
    try {
      const old = f.manager.present(input("settings"));
      await settle();
      const oldView = f.views[0];
      f.manager.clear();
      const current = f.manager.present(input("mirror-controls", "menu"));
      await f.ready();
      assert.equal((await current).ok, true);
      oldView.load.reject(new Error("old request finally rejected"));
      assert.equal((await old).ok, false);
      await settle();
      assert.equal(f.manager.getState().surfaceId, "mirror-controls");
      assert.equal(f.manager.getState().visible, true, "late failure cleared the replacement view");
      assert.equal(f.calls.events.filter(event => event.eventName === "unavailable").length, 0);
    } finally { f.manager.clear(); }
  }
  {
    const f = fixture();
    try {
      f.setAppUrl("https://evil.example/");
      assert.equal((await f.manager.present(input("settings"))).ok, false);
      assert.equal(f.views.length, 0);
      f.setAppUrl("http://127.0.0.1:3000/");
      assert.equal((await f.manager.present({ ...input("settings"), bounds: { x: 0, y: 0, width: 0, height: 30 } })).ok, false);
      assert.equal(f.views.length, 0);
    } finally { f.manager.clear(); }
  }

  const exposed = {}, ipc = new EventEmitter();
  ipc.invoke = (...args) => { exposed.invoked = args; return Promise.resolve({ ok: false, error: "structured" }); };
  ipc.send = (...args) => { exposed.sent = args; };
  loadModule("electron/web/mirrorOverlayPreload.js", { contextBridge: { exposeInMainWorld(name, value) { exposed[name] = value; } }, ipcRenderer: ipc });
  const api = exposed.mirrorOverlay;
  assert.deepEqual(Object.keys(api).sort(), ["emit", "onPresent", "ready", "request"]);
  ipc.emit("mirror-overlay:present", {}, { surfaceId: "cached" });
  const seen = [];
  const unsubscribe = api.onPresent(payload => seen.push(payload.surfaceId));
  assert.deepEqual(seen, ["cached"]);
  ipc.emit("mirror-overlay:present", {}, { surfaceId: "new" });
  unsubscribe();
  ipc.emit("mirror-overlay:present", {}, { surfaceId: "removed" });
  assert.deepEqual(seen, ["cached", "new"]);
  assert.equal((await api.request("read", ["argument"])).error, "structured");
  assert.deepEqual(exposed.invoked, ["mirror-overlay:request", "read", ["argument"]]);
  api.emit("close", { dirty: true });
  assert.deepEqual(exposed.sent, ["mirror-overlay:event", "close", { dirty: true }]);
  api.ready();
  assert.deepEqual(exposed.sent, ["mirror-overlay:ready"]);
  console.log("[check-mirror-overlay-manager] lazy native view, load/ready races, latest presentation, retained drafts, close/reopen, focus-safe refresh, clamped bounds, stacking, trusted IPC, surface/event allowlists, stale events, structured errors, navigation guards, crash/load/clear recovery and narrow preload bridge passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
