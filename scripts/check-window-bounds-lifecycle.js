"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { constrainWindowBoundsToWorkArea } = require("../electron/windowBounds");

const ROOT_DIR = path.resolve(__dirname, "..");
const OPTIONS = { minWidth: 1180, minHeight: 760 };

assert.deepStrictEqual(
  constrainWindowBoundsToWorkArea(
    { x: -1700, y: 80, width: 1480, height: 920 },
    { x: -1920, y: 0, width: 1920, height: 1080 },
    OPTIONS
  ),
  { x: -1700, y: 80, width: 1480, height: 920 },
  "valid bounds on a negative-coordinate display should be preserved"
);

assert.deepStrictEqual(
  constrainWindowBoundsToWorkArea(
    { x: 2400, y: 300, width: 1480, height: 920 },
    { x: 0, y: 0, width: 1920, height: 1040 },
    OPTIONS
  ),
  { x: 440, y: 120, width: 1480, height: 920 },
  "bounds from a removed display should be moved fully into the remaining work area"
);

assert.deepStrictEqual(
  constrainWindowBoundsToWorkArea(
    { x: 50, y: 50, width: 2200, height: 1400 },
    { x: 0, y: 0, width: 1600, height: 900 },
    OPTIONS
  ),
  { x: 0, y: 0, width: 1600, height: 900 },
  "oversized restore bounds should fit the current display"
);

assert.deepStrictEqual(
  constrainWindowBoundsToWorkArea(
    { x: 1200, y: 400, width: 1480, height: 920 },
    { x: 0, y: 0, width: 1024, height: 700 },
    OPTIONS
  ),
  { x: 0, y: 0, width: 1180, height: 760 },
  "a display smaller than the native minimum should keep the window controls reachable"
);

const mainSource = fs.readFileSync(path.join(ROOT_DIR, "electron", "main.js"), "utf8");
for (const eventName of ["display-added", "display-removed", "display-metrics-changed"]) {
  assert(mainSource.includes(`screen.on("${eventName}"`), `missing ${eventName} recovery listener`);
}
assert(mainSource.includes("runAfterNativeWindowRestore"), "native fullscreen restore is not sequenced");
assert(mainSource.includes("desktopShellBoundsTransitionTimer"), "bounds transitions are not transactionally settled");
assert(mainSource.includes("constrainWindowBoundsToDisplay(restoreCandidate"), "saved restore bounds are not constrained");

console.log("[check-window-bounds-lifecycle] ok");
