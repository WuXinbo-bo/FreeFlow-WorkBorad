"use strict";

async function main() {
  const { createOverlayBudgetManager } = await import(
    "../public/src/engines/canvas2d-core/overlay/overlayBudgetManager.js"
  );
  const manager = createOverlayBudgetManager({
    maxActiveTotal: 3,
    maxCreatePerFrame: 10,
    rich: 2,
    math: 2,
    code: 2,
  });

  manager.beginFrame();
  manager.noteCreate("rich");
  manager.noteCreate("rich");
  manager.noteCreate("math");
  assert(manager.canCreate("code") === false, "drift setup did not reach the total ceiling");

  manager.reconcile({ rich: 1, math: 0, code: 0 });
  assert(manager.getActive("rich") === 1, "rich count was not reconciled");
  assert(manager.getActive("math") === 0, "math count was not reconciled");
  assert(manager.getActiveTotal() === 1, "total count was not reconciled");
  assert(manager.canCreate("code") === true, "reconciliation did not restore creation capacity");

  manager.reconcile({ rich: -2, math: 1.9, code: Number.NaN });
  assert(manager.getActive("rich") === 0, "negative counts were not clamped");
  assert(manager.getActive("math") === 1, "fractional counts were not normalized");
  assert(manager.getActive("code") === 0, "invalid counts were not normalized");
  console.log("[check-overlay-budget] ok");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(`[check-overlay-budget] ${error.message}`);
  process.exitCode = 1;
});
