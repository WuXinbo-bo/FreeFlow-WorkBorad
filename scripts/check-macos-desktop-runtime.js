const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron", "main.js"), "utf8");
const launcherSource = fs.readFileSync(path.join(root, "scripts", "start-desktop.js"), "utf8");

assert.match(mainSource, /process\.platform === ["']darwin["']/);
assert.match(mainSource, /writeMacClipboardFiles\(clipboard, existingEntries\)/);
assert.match(mainSource, /getNativeAccelerator\(configuredAccelerator\)/);
assert.match(mainSource, /screencapture[\s\S]{0,80}["']-i["'][\s\S]{0,40}["']-c["']/);
assert.match(mainSource, /await triggerSystemScreenshot\(\)/);
assert.match(mainSource, /await triggerSystemScreenshot\(\)[\s\S]{0,600}mainWindow\.show\(\)/);
assert.match(mainSource, /function queueOpenBoardPath\(/);
assert.match(mainSource, /flushPendingOpenBoardPath\(\)/);
assert.match(mainSource, /shouldIgnoreMacOSMouseEvents/);
assert.match(mainSource, /startMacOSShapeInteractionTracking\(\)/);
assert.match(mainSource, /setIgnoreMouseEvents\(shouldIgnore, \{ forward: true \}\)/);
assert.match(mainSource, /if \(appQuitInProgress\)/);
assert.match(launcherSource, /delete env\.ELECTRON_RUN_AS_NODE/);
assert.match(launcherSource, /spawn\(require\(["']electron["']\)/);

console.log("macOS desktop runtime: clipboard, native shortcut, screenshot recovery and launcher guards passed");
