const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../electron/main.js"), "utf8");
function readFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}
function createState(platform) {
  const native = { fullscreen: false, maximized: false };
  const context = vm.createContext({
    process: { platform },
    mainWindow: {
      isDestroyed: () => false,
      isFullScreen: () => native.fullscreen,
      isMaximized: () => native.maximized,
    },
    desktopShellFullscreenEnabled: false,
    desktopShellBoundsTransitionLock: false,
    pinnedEnabled: true,
    clickThroughEnabled: false,
    desktopKeyboardFocusOwner: "",
    desktopKeyboardFocusSourceId: "",
    desktopKeyboardFocusTargetId: "",
    externalWindowEmbedManager: { getState: () => ({ active: false }) },
    webContentsViewEmbedManager: { getState: () => ({ active: false }) },
  });
  vm.runInContext(["getDesktopShellState", "syncDesktopShellExpandedStateFromWindow"].map(readFunction).join("\n"), context);
  return { context, native };
}

const { context: mac, native } = createState("darwin");
for (let cycle = 0; cycle < 8; cycle += 1) {
  mac.desktopShellBoundsTransitionLock = true;
  mac.desktopShellFullscreenEnabled = true;
  assert.equal(mac.getDesktopShellState().fullscreen, true, "expansion target remains visible before native resize");
  mac.desktopShellFullscreenEnabled = false;
  for (const maximized of [true, false, true, false]) {
    native.maximized = maximized;
    native.fullscreen = maximized;
    mac.syncDesktopShellExpandedStateFromWindow();
    assert.equal(mac.desktopShellFullscreenEnabled, false, "native restore bounce cannot overwrite the target");
    assert.equal(mac.getDesktopShellState().fullscreen, false, "controlled restore reports its target consistently");
  }
  mac.desktopShellBoundsTransitionLock = false;
  assert.equal(mac.getDesktopShellState().fullscreen, false, "restored window stays normal after unlocking");
}
native.maximized = true;
mac.syncDesktopShellExpandedStateFromWindow();
assert.equal(mac.getDesktopShellState().fullscreen, true, "external native maximize still works after recovery");
const { context: windows, native: winNative } = createState("win32");
windows.desktopShellBoundsTransitionLock = true;
winNative.maximized = true;
assert.equal(windows.getDesktopShellState().fullscreen, true, "Windows native maximize remains authoritative");
windows.syncDesktopShellExpandedStateFromWindow();
assert.equal(windows.desktopShellFullscreenEnabled, true, "Windows native synchronization remains unchanged");
console.log("[macos-fullscreen-transition] native restore bounce, eight repeated transitions, recovery and unchanged Windows behavior passed");
