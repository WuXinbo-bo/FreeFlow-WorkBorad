const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  isPointInsideRect,
  isPointInsideAnyRect,
  shouldIgnoreMacOSMouseEvents,
} = require("../electron/macosWindowInteraction");

const shapeRects = [
  { x: 20, y: 30, width: 200, height: 120 },
  { x: 360, y: 40, width: 160, height: 240 },
];
const contentBounds = { x: 100, y: 80, width: 900, height: 700 };

assert(isPointInsideRect({ x: 20, y: 30 }, shapeRects[0]));
assert(!isPointInsideRect({ x: 220, y: 30 }, shapeRects[0]));
assert(isPointInsideAnyRect({ x: 370, y: 50 }, shapeRects));

assert.strictEqual(
  shouldIgnoreMacOSMouseEvents({
    rendererReady: true,
    bootShapeLocked: false,
    shapeRects,
    cursorScreenPoint: { x: 120, y: 110 },
    contentBounds,
  }),
  false,
  "cursor inside a FreeFlow surface must remain interactive"
);
assert.strictEqual(
  shouldIgnoreMacOSMouseEvents({
    rendererReady: true,
    bootShapeLocked: false,
    shapeRects,
    cursorScreenPoint: { x: 500, y: 500 },
    contentBounds,
  }),
  true,
  "cursor outside FreeFlow surfaces must pass through on macOS"
);
assert.strictEqual(
  shouldIgnoreMacOSMouseEvents({
    clickThrough: true,
    rendererReady: true,
    bootShapeLocked: false,
    shapeRects,
    cursorScreenPoint: { x: 120, y: 110 },
    contentBounds,
  }),
  true,
  "explicit full click-through must override selective hit testing"
);
assert.strictEqual(
  shouldIgnoreMacOSMouseEvents({
    rendererReady: false,
    shapeRects,
    cursorScreenPoint: { x: 500, y: 500 },
    contentBounds,
  }),
  false,
  "startup must stay interactive until renderer and shape are ready"
);
assert.strictEqual(
  shouldIgnoreMacOSMouseEvents({
    rendererReady: true,
    bootShapeLocked: false,
    interactionShapeLocked: true,
    shapeRects,
    cursorScreenPoint: { x: 500, y: 500 },
    contentBounds,
  }),
  false,
  "interactive shape transactions must not lose events"
);
assert.strictEqual(
  shouldIgnoreMacOSMouseEvents({
    rendererReady: true,
    bootShapeLocked: false,
    shapeRects,
    cursorScreenPoint: null,
    contentBounds,
  }),
  false,
  "missing cursor coordinates must fail open"
);

console.log("[check-macos-window-interaction] selective macOS hit testing and recovery paths passed");

const mainSource = fs.readFileSync(path.join(__dirname, "../electron/main.js"), "utf8");
const trackingSource = mainSource.slice(
  mainSource.indexOf("function stopMacOSShapeInteractionTracking()"),
  mainSource.indexOf("function clearMainWindowRendererReadyTimer()")
);
let visible = true;
let minimized = false;
let cursorSamples = 0;
let cursor = { x: 120, y: 110 };
const timers = new Map();
const ignored = [];
const context = vm.createContext({
  process: { platform: "darwin" },
  macOSShapeInteractionTimer: null,
  macOSShapeInteractionIgnoreState: null,
  clickThroughEnabled: false,
  mainWindowBootShapeLocked: false,
  mainWindowInteractionShapeLockId: "",
  windowShapeRects: shapeRects,
  shouldIgnoreMacOSMouseEvents,
  mainWindow: {
    __freeflowRendererReady: true,
    isDestroyed: () => false,
    isVisible: () => visible,
    isMinimized: () => minimized,
    getContentBounds: () => contentBounds,
    setIgnoreMouseEvents: (value) => ignored.push(value),
  },
  screen: { getCursorScreenPoint: () => { cursorSamples += 1; return cursor; } },
  setInterval: (callback, interval) => {
    assert.strictEqual(interval, 32, "visible selective interaction became less responsive");
    const id = { unref() {} };
    timers.set(id, callback);
    return id;
  },
  clearInterval: (id) => timers.delete(id),
});
vm.runInContext(trackingSource, context);
context.startMacOSShapeInteractionTracking();
assert.strictEqual(timers.size, 1);
assert.strictEqual(ignored.at(-1), false);
cursor = { x: 500, y: 500 };
timers.values().next().value();
assert.strictEqual(ignored.at(-1), true, "underlying application lost selective pass-through");
visible = false;
context.stopMacOSShapeInteractionTracking();
const samplesBeforeHidden = cursorSamples;
context.startMacOSShapeInteractionTracking();
assert.strictEqual(timers.size, 0);
assert.strictEqual(cursorSamples, samplesBeforeHidden, "hidden window continued sampling");
visible = true;
cursor = { x: 120, y: 110 };
context.startMacOSShapeInteractionTracking();
assert.strictEqual(ignored.at(-1), false, "show failed to restore hit testing immediately");
minimized = true;
context.stopMacOSShapeInteractionTracking();
context.startMacOSShapeInteractionTracking();
assert.strictEqual(timers.size, 0);
minimized = false;
context.startMacOSShapeInteractionTracking();
assert.strictEqual(timers.size, 1);
context.clickThroughEnabled = true;
context.stopMacOSShapeInteractionTracking();
context.startMacOSShapeInteractionTracking();
assert.strictEqual(timers.size, 0, "full click-through kept an unnecessary timer");
assert.strictEqual(ignored.at(-1), true);
context.clickThroughEnabled = false;
for (let cycle = 0; cycle < 10; cycle += 1) {
  context.stopMacOSShapeInteractionTracking();
  context.startMacOSShapeInteractionTracking();
  assert.strictEqual(timers.size, 1, "rapid restore duplicated or lost the tracker");
}
assert.strictEqual(ignored.at(-1), false);
for (const event of ["hide", "minimize"]) {
  assert(mainSource.includes(`window.on("${event}", stopMacOSShapeInteractionTracking)`));
}
context.stopMacOSShapeInteractionTracking();
assert.strictEqual(timers.size, 0);
console.log("[check-macos-window-interaction] tracking suspension and rapid recovery passed");
