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
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function loadModule(file, dependencies, platform = "win32") {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), "utf8"), {
    module, exports: module.exports, require: name => dependencies[name] || require(name), Buffer, process: { platform }, console,
  }, { filename: file });
  return module.exports;
}

function managedFixture() {
  const windows = [];
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super();
      this.id = windows.length + 1;
      this.options = options;
      this.destroyed = false;
      this.visible = false;
      this.showCount = 0;
      this.loadCount = 0;
      this.url = "";
      this.load = deferred();
      this.webContents = { getURL: () => this.url, setWindowOpenHandler: handler => { this.open = handler; } };
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    removeMenu() {}
    setTitle(value) { assert.equal(this.destroyed, false); this.title = value; }
    setBounds(value) { assert.equal(this.destroyed, false); this.bounds = value; }
    show() { assert.equal(this.destroyed, false); this.showCount++; this.visible = true; }
    hide() { this.visible = false; }
    blur() {}
    getNativeWindowHandle() { const handle = Buffer.alloc(8); handle.writeBigUInt64LE(BigInt(this.id + 100)); return handle; }
    loadURL(url) { this.url = url; this.loadCount++; return this.load.promise; }
    destroy() { if (this.destroyed) return; this.destroyed = true; this.visible = false; this.emit("closed"); }
  }
  const { createAiMirrorTargetManager } = loadModule("electron/aiMirrorTargetManager.js", { electron: { BrowserWindow: FakeWindow, shell: { openExternal: async () => {} } } });
  return { manager: createAiMirrorTargetManager(), windows };
}

async function checkManagedTargets() {
  const f = managedFixture();
  const { manager, windows } = f;
  try {
    assert.equal(manager.listTargets().targets.length > 1, true);
    assert.equal((await manager.prepareTarget({ targetId: "unknown" })).ok, false);
    assert.equal(windows.length, 0);
    const first = manager.prepareTarget({ targetId: "doubao", syncSessionId: "a" });
    const duplicate = manager.prepareTarget({ targetId: "doubao", syncSessionId: "a" });
    assert.equal(first, duplicate, "same-session preparation was not deduplicated");
    assert.equal(windows.length, 1);
    assert.equal(windows[0].loadCount, 1);
    assert.equal(manager.getState().pendingSession.syncSessionId, "a", "pending owner was not registered before loadURL");
    assert.equal((await manager.stopTarget({ targetId: "deepseek", syncSessionId: "a" })).stale, true);
    assert.equal((await manager.stopTarget({ targetId: "doubao", syncSessionId: "wrong" })).stale, true);
    assert.equal(windows[0].isDestroyed(), false, "mismatched stop destroyed the active preparation");
    assert.equal((await manager.stopTarget({ targetId: "doubao", syncSessionId: "a" })).closed, "doubao");
    assert.equal((await first).stale, true, "stop must settle a pending load without waiting for the network");
    assert.equal(windows[0].isDestroyed(), true);
    windows[0].load.resolve();
    await settle();
    assert.equal(windows[0].showCount, 0, "late load completion showed a cancelled window");
    assert.equal(manager.getState().activeSession, null);

    const old = manager.prepareTarget({ targetId: "doubao", syncSessionId: "old" });
    const current = manager.prepareTarget({ targetId: "doubao", syncSessionId: "new" });
    assert.equal(windows.length, 3, "new session reused an unfinished cancelled load");
    assert.equal(windows[1].isDestroyed(), true);
    assert.equal((await old).stale, true);
    windows[2].load.resolve();
    const prepared = await current;
    assert.equal(prepared.ok, true);
    assert.equal(prepared.syncSessionId, "new");
    assert.equal(prepared.projection.sourceId, "hwnd:103");
    assert.equal(manager.getState().activeSession.syncSessionId, "new");
    windows[1].load.reject(new Error("old request finally failed"));
    await settle();
    assert.equal(windows[2].isDestroyed(), false, "old rejection destroyed the new same-target session");
    assert.equal(manager.getState().activeSession.syncSessionId, "new");
    assert.equal((await manager.stopTarget({ targetId: "doubao", syncSessionId: "old" })).stale, true);
    assert.equal((await manager.stopTarget({ targetId: "deepseek" })).stale, true, "mismatched target stopped the active session");

    const reused = await manager.prepareTarget({ targetId: "doubao", syncSessionId: "next" });
    assert.equal(reused.syncSessionId, "next");
    assert.equal(windows.length, 3, "ready same-target window was reloaded for a new owner");
    assert.equal(windows[2].loadCount, 1);
    assert.equal((await manager.stopTarget({ targetId: "doubao", syncSessionId: "new" })).stale, true);

    const switched = manager.prepareTarget({ targetId: "deepseek", syncSessionId: "switched" });
    assert.equal(windows[2].isDestroyed(), true);
    windows[3].load.resolve();
    assert.equal((await switched).target.id, "deepseek");
    assert.equal(manager.getState().activeSession.targetId, "deepseek");
    assert.equal((await manager.stopTarget({ targetId: "doubao" })).stale, true);
    assert.equal(windows[3].isDestroyed(), false);
    assert.equal((await manager.stopTarget()).closed, "deepseek", "legacy untargeted stop must still work");

    const failed = manager.prepareTarget({ targetId: "doubao" });
    windows[4].load.reject(new Error("network unavailable"));
    await assert.rejects(failed, /network unavailable/);
    assert.equal(windows[4].isDestroyed(), true);
    assert.equal(manager.getState().pendingSession, null);
    const closed = manager.prepareTarget({ targetId: "doubao", syncSessionId: "closed" });
    windows[5].destroy();
    assert.equal((await closed).stale, true);
    assert.equal(manager.getState().activeSession, null);
    const disposing = manager.prepareTarget({ targetId: "doubao", syncSessionId: "disposing" });
    const disposed = manager.dispose();
    const recovered = manager.prepareTarget({ targetId: "deepseek", syncSessionId: "recovered" });
    windows[7].load.resolve();
    await disposed;
    assert.equal((await disposing).stale, true);
    assert.equal((await recovered).target.id, "deepseek");
    assert.equal(windows[7].isDestroyed(), false, "older dispose closed a subsequently created window");
    for (let i = 0; i < 5; i++) {
      await manager.stopTarget();
      const pending = manager.prepareTarget({ targetId: "doubao", syncSessionId: String(i) });
      await manager.stopTarget({ syncSessionId: String(i) });
      assert.equal((await pending).stale, true);
    }
    assert.equal(windows.every(window => window.isDestroyed()), true);
  } finally { await manager.dispose(); }
}

function nativeFixture() {
  const handles = new Map([[100n, { parent: 0n }], [101n, { parent: 0n }], [1n, { parent: 0n }]]);
  const calls = [];
  let sequence = 1000n;
  const functions = {
    IsWindow: handle => handles.has(handle),
    GetParent: handle => handles.get(handle)?.parent || 0n,
    SetParent(handle, parent) { const previous = handles.get(handle).parent; handles.get(handle).parent = parent; calls.push(["SetParent", handle, parent]); return previous; },
    GetWindowLongPtrW: () => 0n,
    SetWindowLongPtrW: () => 0n,
    CreateWindowExW() { const handle = ++sequence; handles.set(handle, { parent: 1n }); calls.push(["CreateWindowExW", handle]); return handle; },
    DestroyWindow(handle) { handles.delete(handle); calls.push(["DestroyWindow", handle]); return true; },
    GetWindowRect(_handle, rect) { Object.assign(rect, { left: 0, top: 0, right: 1000, bottom: 800 }); return true; },
    ShowWindow(...args) { calls.push(["ShowWindow", ...args]); return true; },
    SetWindowPos: () => true,
    GetGUIThreadInfo: () => false,
    GetWindowThreadProcessId: () => 2,
    GetCurrentThreadId: () => 1,
  };
  const koffi = {
    struct: name => name, pointer: (_name, type) => type, out: value => value, sizeof: () => 72,
    load: () => ({ func: (_callingConvention, name) => functions[name] || (() => true) }),
  };
  const window = { isDestroyed: () => false, getNativeWindowHandle: () => Buffer.from([1, 0, 0, 0]), getContentBounds: () => ({ x: 0, y: 0, width: 1200, height: 900 }) };
  const electron = { screen: { dipToScreenRect: (_window, rect) => rect } };
  const { createExternalWindowEmbedManager } = loadModule("electron/win32/externalWindowEmbed.js", { electron, koffi });
  return { manager: createExternalWindowEmbedManager(() => window), calls, handles };
}

function checkNativeIdentity() {
  const { manager, calls } = nativeFixture();
  const bounds = { x: 300, y: 100, width: 600, height: 500 };
  assert.equal(manager.isSupported(), true);
  assert.equal(manager.embedExternalWindow({ sourceId: "hwnd:100", targetId: "doubao", syncSessionId: "a", bounds }).ok, true);
  assert.equal(manager.getState().syncSessionId, "a");
  const previous = calls.length;
  assert.equal(manager.clearEmbeddedWindow({ targetId: "deepseek" }).stale, true);
  assert.equal(manager.clearEmbeddedWindow({ targetId: "doubao", syncSessionId: "old" }).stale, true);
  assert.equal(manager.setEmbeddedWindowVisibility(false, { targetId: "doubao", syncSessionId: "old" }).stale, true);
  assert.equal(calls.length, previous, "stale clear/visibility performed native operations");
  assert.equal(manager.setEmbeddedWindowVisibility(false, { syncSessionId: "a" }).visible, false);
  assert.equal(manager.setEmbeddedWindowVisibility(true, { syncSessionId: "a" }).visible, true);
  manager.syncEmbeddedWindowBounds({ targetId: "doubao", syncSessionId: "a", syncRevision: 99, bounds });
  manager.embedExternalWindow({ sourceId: "hwnd:100", targetId: "doubao", syncSessionId: "b", bounds });
  assert.equal(manager.getState().syncSessionId, "b", "same HWND kept the previous session owner");
  assert.equal(manager.clearEmbeddedWindow({ syncSessionId: "a" }).stale, true);
  assert.equal(manager.setEmbeddedWindowVisibility(false, { syncSessionId: "a" }).stale, true);
  assert.equal(manager.syncEmbeddedWindowBounds({ targetId: "doubao", syncSessionId: "b", syncRevision: 1, bounds }).stale, undefined, "new session inherited old bounds revision");
  manager.embedExternalWindow({ sourceId: "hwnd:101", targetId: "deepseek", syncSessionId: "c", bounds });
  assert.equal(manager.getState().targetId, "deepseek");
  assert.equal(manager.clearEmbeddedWindow({ targetId: "doubao", syncSessionId: "b" }).stale, true);
  assert.equal(manager.setEmbeddedWindowVisibility(false, { targetId: "doubao", syncSessionId: "b" }).stale, true);
  assert.equal(manager.getState().visible, true);
  assert.equal(manager.clearEmbeddedWindow({ targetId: "deepseek", syncSessionId: "c", restoreVisible: false }).active, false);
  manager.embedExternalWindow({ sourceId: "hwnd:100", targetId: "doubao", bounds });
  assert.equal(manager.setEmbeddedWindowVisibility(false).visible, false, "legacy visibility without identity regressed");
  assert.equal(manager.clearEmbeddedWindow().active, false, "legacy clear without identity regressed");
}

async function main() {
  await checkManagedTargets();
  checkNativeIdentity();
  console.log("AI mirror lifecycle: pending ownership, cancellation, deduplication, stale load/switch/stop/dispose recovery and Win32 session-safe clear/visibility passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
