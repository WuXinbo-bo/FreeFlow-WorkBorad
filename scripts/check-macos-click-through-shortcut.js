const assert = require("node:assert/strict");

function getNativeAccelerator(accelerator, platform) {
  return String(accelerator).replace(/\bCommandOrControl\b/g, platform === "darwin" ? "Command" : "Control");
}

assert.equal(getNativeAccelerator("CommandOrControl+Shift+X", "darwin"), "Command+Shift+X");
assert.equal(getNativeAccelerator("CommandOrControl+Shift+X", "win32"), "Control+Shift+X");
assert.equal(getNativeAccelerator("Control+Alt+X", "darwin"), "Control+Alt+X");
console.log("Click-through shortcut: native macOS Command mapping passed");
