const assert = require("node:assert/strict");

async function main() {
  const { normalizeCanvasWheelInput: input } = await import("../public/src/engines/canvas2d-core/runtime/wheelInput.js");
  const pinch = input({ deltaY: -2, deltaX: 0, deltaMode: 0, ctrlKey: true });
  assert.equal(pinch.zoomFactor, Math.exp(0.02));
  const mouse = input({ deltaY: -120, deltaMode: 0, ctrlKey: true }, { controlKeyPressed: true });
  assert.equal(mouse.zoomFactor, Math.exp(0.18), "physical Ctrl keeps the mouse response");
  assert.equal(input({ deltaY: -120, metaKey: true }).zoomFactor, mouse.zoomFactor);
  assert.equal(input({ deltaY: 3, deltaX: -2, deltaMode: 1 }).deltaX, -32);
  assert.equal(input({ deltaY: 3, deltaMode: 1 }).deltaY, 48);
  assert.equal(input({ deltaY: 1, deltaMode: 2 }, { viewport: { height: 900 } }).deltaY, 900);
  assert.equal(input({ deltaX: 1, deltaMode: 2 }, { viewport: { width: 1440 } }).deltaX, 1440);
  assert.equal(input({ deltaY: 0.25 }).deltaY, 0.25, "small trackpad deltas are not rounded away");
  assert.equal(input({ deltaY: 0 }).zoomFactor, 1);
  assert.equal(input({ deltaY: -10000, ctrlKey: true }).zoomFactor, Math.E, "one event cannot cause an unbounded jump");
  console.log("[check-canvas-wheel-input] pinch, physical modifiers, pixel/line/page units and fractional motion passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
