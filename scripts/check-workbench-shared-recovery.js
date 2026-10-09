const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function checkClickThrough() {
  const source = fs.readFileSync(path.join(__dirname, "../public/src/runtime/workbenchRuntime.js"), "utf8");
  const start = source.indexOf("async function setDesktopClickThrough(");
  const end = source.indexOf("async function captureScreenImageWithTemporaryClickThrough", start);
  assert(start >= 0 && end > start);
  const calls = [];
  const counters = { suspend: 0, resume: 0, overlay: 0 };
  let resolveEnable;
  const enablePending = new Promise((resolve) => { resolveEnable = resolve; });
  const context = {
    IS_DESKTOP_APP: true,
    DESKTOP_SHELL: {
      setClickThrough: async (enabled) => {
        calls.push(enabled);
        if (enabled) return enablePending;
        return { clickThrough: false };
      },
    },
    state: { desktopShellState: { clickThrough: false } },
    suspendScreenSourceForClickThrough: async () => { counters.suspend += 1; },
    resumeScreenSourceAfterClickThrough: async () => { counters.resume += 1; },
    syncEmbeddedWindowOverlayVisibility: async () => { counters.overlay += 1; },
    syncDesktopShellState: (next) => { context.state.desktopShellState = { ...context.state.desktopShellState, ...next }; },
  };
  const api = vm.runInNewContext(`let desktopSurfaceSyncPromise = Promise.resolve();\n${source.slice(start, end)}\n({ setDesktopClickThrough })`, context);
  const enabling = api.setDesktopClickThrough(true);
  const disabling = api.setDesktopClickThrough(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [true], "disable waits for the in-flight enable");
  resolveEnable({ clickThrough: true });
  await enabling;
  await disabling;
  assert.deepEqual(calls, [true, false]);
  assert.equal(counters.suspend, 1);
  assert.equal(counters.resume, 1);
  assert.equal(counters.overlay, 1);
  await api.setDesktopClickThrough(false);
  assert.deepEqual(calls, [true, false], "same state does not call the shell");
  context.DESKTOP_SHELL.setClickThrough = async (enabled) => {
    calls.push(enabled);
    return { clickThrough: enabled };
  };
  await Promise.all(Array.from({ length: 8 }, (_, index) => api.setDesktopClickThrough(index % 2 === 0)));
  assert.equal(context.state.desktopShellState.clickThrough, false);
  assert.equal(counters.suspend, 5);
  assert.equal(counters.resume, 5);
  assert.equal(counters.overlay, 5);
  context.DESKTOP_SHELL.setClickThrough = async () => { throw new Error("IPC unavailable"); };
  await assert.rejects(api.setDesktopClickThrough(true), /IPC unavailable/);
  assert.equal(counters.resume, 6, "failed enable restores the suspended screen source");
  assert.equal(counters.overlay, 6);
  context.DESKTOP_SHELL.setClickThrough = async (enabled) => ({ clickThrough: enabled });
  await api.setDesktopClickThrough(true);
  await api.setDesktopClickThrough(false);
  assert.equal(context.state.desktopShellState.clickThrough, false);
  assert.equal(counters.resume, 7, "a rejected request does not poison the queue");
  await api.setDesktopClickThrough(true);
  context.DESKTOP_SHELL.setClickThrough = async () => { throw new Error("disable unavailable"); };
  await assert.rejects(api.setDesktopClickThrough(false), /disable unavailable/);
  assert.equal(context.state.desktopShellState.clickThrough, true);
  assert.equal(counters.resume, 7, "failed disable retains suspension until the shell exits click-through");
  context.DESKTOP_SHELL.setClickThrough = async (enabled) => ({ clickThrough: enabled });
  await api.setDesktopClickThrough(false);
  assert.equal(context.state.desktopShellState.clickThrough, false);
  assert.equal(counters.resume, 8);
}

function checkRedoShortcuts() {
  const source = fs.readFileSync(path.join(__dirname, "../public/src/runtime/workbenchRuntime.js"), "utf8");
  const start = source.indexOf('document.addEventListener("keydown", (event) => {');
  const end = source.indexOf('canvasViewportEl?.addEventListener("paste"', start);
  assert(start >= 0 && end > start);
  let handler;
  const actions = [];
  let editable = false;
  class Element {}
  vm.runInNewContext(source.slice(start, end), {
    Element,
    document: { addEventListener: (type, callback) => { if (type === "keydown") handler = callback; } },
    isEditableElement: () => editable,
    getActiveClipboardZone: () => "canvas",
    canvasItemManager: {
      undoCanvasBoard: () => actions.push("undo"),
      redoCanvasBoard: () => actions.push("redo"),
      setCanvasTool: (tool) => actions.push(`tool:${tool}`),
    },
  });
  assert.equal(typeof handler, "function");
  const dispatch = (key, modifiers = {}) => {
    let prevented = false;
    handler({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: {}, preventDefault: () => { prevented = true; }, ...modifiers });
    return prevented;
  };
  assert.equal(dispatch("z", { ctrlKey: true }), true);
  assert.equal(dispatch("z", { ctrlKey: true, shiftKey: true }), true);
  assert.equal(dispatch("y", { ctrlKey: true }), true);
  assert.equal(dispatch("y", { ctrlKey: true, shiftKey: true }), false);
  assert.equal(dispatch("c", { ctrlKey: true, shiftKey: true }), false);
  assert.equal(dispatch("z", { ctrlKey: true, shiftKey: true, altKey: true }), false);
  assert.equal(dispatch("Z", { metaKey: true, shiftKey: true }), true);
  editable = true;
  assert.equal(dispatch("z", { ctrlKey: true }), false);
  assert.deepEqual(actions, ["undo", "redo", "redo", "redo"]);
}

function checkDesktopLauncher() {
  const { EventEmitter } = require("node:events");
  const source = fs.readFileSync(path.join(__dirname, "start-desktop.js"), "utf8");
  const child = new EventEmitter();
  const host = new EventEmitter();
  host.env = { ELECTRON_RUN_AS_NODE: "1", FREEFLOW_PORT: "0" };
  host.argv = ["node", "start-desktop.js", "--test-option"];
  const signals = [];
  child.kill = (signal) => signals.push(signal);
  let spawned;
  vm.runInNewContext(source, {
    __dirname, process: host, console: { error: () => {} },
    require: (id) => {
      if (id === "path") return path;
      if (id === "electron") return "/mock/electron";
      if (id === "child_process") return { spawn: (...args) => { spawned = args; return child; } };
      throw new Error(`Unexpected module: ${id}`);
    },
  });
  assert.equal(spawned[0], "/mock/electron");
  assert.equal(spawned[1][1], "--test-option");
  assert.equal(spawned[2].env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(host.env.ELECTRON_RUN_AS_NODE, "1", "parent environment stays intact");
  assert.equal(spawned[2].env.FREEFLOW_PORT, "0");
  host.emit("SIGTERM");
  assert.deepEqual(signals, ["SIGTERM"]);
  child.emit("exit", 2);
  assert.equal(host.exitCode, 2);
  child.emit("error", new Error("spawn failed"));
  assert.equal(host.exitCode, 1);
}

Promise.resolve().then(checkClickThrough).then(checkRedoShortcuts).then(checkDesktopLauncher).then(() => {
  console.log("Workbench recovery: click-through cycles/failure recovery, shortcut guards and desktop launcher passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
