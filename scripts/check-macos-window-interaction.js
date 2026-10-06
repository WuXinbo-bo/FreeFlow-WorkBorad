const assert = require("assert");
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
