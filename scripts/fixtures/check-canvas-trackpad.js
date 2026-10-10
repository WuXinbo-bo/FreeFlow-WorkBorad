const assert = require("node:assert/strict");

async function checkCanvasTrackpad(page) {
  await page.evaluate(async () => {
    await window.__canvas2dEngine.whenReady();
    window.__canvas2dEngine.loadStructuredBoardForExport({
      items: [{ id: "gesture-shape", type: "shape", shapeType: "rect", x: 120, y: 120, width: 180, height: 100 }],
      view: { scale: 1, offsetX: 0, offsetY: 0 },
    });
  });
  const result = await page.evaluate(async () => {
    const engine = window.__canvas2dEngine;
    const canvas = document.querySelector("#canvas-office-canvas");
    const rect = canvas.getBoundingClientRect();
    const point = { clientX: rect.left + 210, clientY: rect.top + 170 };
    const view = () => ({ ...engine.getSnapshot().board.view });
    const settle = async () => {
      const deadline = performance.now() + 8000;
      do {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const lifecycle = engine.getCanvasPerformanceLifecycleSnapshot();
        if (!lifecycle.interactionCritical && !lifecycle.prewarm.paused) return;
      } while (performance.now() < deadline);
      throw new Error(`Gesture did not settle: ${JSON.stringify(engine.getCanvasPerformanceLifecycleSnapshot())}`);
    };
    const dispatch = (target, values) => {
      const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...point, ...values });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const start = view();
    const prevented = dispatch(canvas, { ctrlKey: true, deltaY: -2 });
    await settle();
    const pinched = view();
    dispatch(canvas, { ctrlKey: true, deltaY: 2 });
    await settle();
    const returned = view();
    dispatch(canvas, { deltaX: 18.5, deltaY: -24.25 });
    await settle();
    const panned = view();
    dispatch(canvas, { deltaX: -18.5, deltaY: 24.25 });
    await settle();
    const panReturned = view();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", ctrlKey: true }));
    dispatch(canvas, { ctrlKey: true, deltaY: -120 });
    await settle();
    const mouse = view();
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", ctrlKey: false }));
    const overlayResults = [];
    for (const id of ["canvas-rich-editor", "canvas-table-editor", "canvas-code-block-editor", "canvas-text-editor", "canvas-file-memo-editor", "canvas-image-memo-editor"]) {
      const before = view();
      const element = document.getElementById(id);
      if (!element) throw new Error(`Missing editor ${id}`);
      const zoomPrevented = dispatch(element, { ctrlKey: true, deltaY: -1 });
      await settle();
      const after = view();
      const scrollPrevented = dispatch(element, { deltaY: 2 });
      overlayResults.push({ id, before, after, zoomPrevented, scrollPrevented });
    }
    for (let cycle = 0; cycle < 10; cycle += 1) {
      dispatch(canvas, { ctrlKey: true, deltaY: -1 });
      dispatch(canvas, { ctrlKey: true, deltaY: 1 });
      dispatch(canvas, { deltaX: 1.25, deltaY: -2.5 });
      dispatch(canvas, { deltaX: -1.25, deltaY: 2.5 });
    }
    const beforeBlur = view();
    dispatch(canvas, { ctrlKey: true, deltaY: -2 });
    window.dispatchEvent(new Event("blur"));
    await settle();
    const afterBlur = view();
    dispatch(canvas, { ctrlKey: true, deltaY: 2 });
    await settle();
    const recovered = view();
    for (let cycle = 0; cycle < 5; cycle += 1) {
      dispatch(canvas, { ctrlKey: true, deltaY: -1 });
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
      dispatch(canvas, { ctrlKey: true, deltaY: 1 });
    }
    delete document.hidden;
    await settle();
    const restored = view();
    const button = document.querySelector(".canvas2d-engine-tool");
    const controlPrevented = dispatch(button, { ctrlKey: true, deltaY: -2 });
    await settle();
    const revision = canvas.__ffRenderStats.frameContext.boardRevision;
    await settle();
    return { start, pinched, returned, panned, panReturned, mouse, overlayResults, beforeBlur, afterBlur, recovered, restored, controlPrevented, prevented, settled: view(), lifecycle: engine.getCanvasPerformanceLifecycleSnapshot(), revision, settledRevision: canvas.__ffRenderStats.frameContext.boardRevision };
  });
  const near = (a, b) => assert(Math.abs(a - b) < 0.001, `${a} != ${b}`);
  assert(result.prevented);
  near(result.pinched.scale / result.start.scale, Math.exp(0.02));
  near((210 - result.pinched.offsetX) / result.pinched.scale, 210);
  near((170 - result.pinched.offsetY) / result.pinched.scale, 170);
  near(result.returned.scale, 1);
  near(result.returned.offsetX, 0);
  near(result.panned.offsetX, -18.5);
  near(result.panned.offsetY, 24.25);
  near(result.panReturned.offsetX, 0);
  near(result.panReturned.offsetY, 0);
  near(result.mouse.scale, Math.exp(0.18));
  for (const item of result.overlayResults) {
    assert(item.zoomPrevented, item.id);
    assert(!item.scrollPrevented, `editor content scrolling was swallowed: ${item.id}`);
    near(item.after.scale / item.before.scale, Math.exp(0.01));
  }
  near(result.afterBlur.scale / result.beforeBlur.scale, Math.exp(0.02));
  near(result.recovered.scale, result.beforeBlur.scale);
  near(result.restored.scale, result.recovered.scale);
  near(result.restored.offsetX, result.recovered.offsetX);
  near(result.restored.offsetY, result.recovered.offsetY);
  assert(!result.controlPrevented, "toolbar input was swallowed by the canvas");
  assert.deepEqual(result.settled, result.restored, "camera drifted after gesture end");
  assert(Number.isInteger(result.revision), "missing rendered board revision");
  assert.equal(result.revision, result.settledRevision);
  await page.waitForFunction(() => {
    const lifecycle = window.__canvas2dEngine.getCanvasPerformanceLifecycleSnapshot();
    return !lifecycle.interactionCritical && !lifecycle.prewarm.paused;
  }, null, { timeout: 8000 });
  const limits = await page.evaluate(async () => {
    const engine = window.__canvas2dEngine;
    const canvas = document.querySelector("#canvas-office-canvas");
    const wheel = (deltaY) => canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY }));
    for (let index = 0; index < 20; index += 1) wheel(-1000);
    window.dispatchEvent(new Event("blur"));
    const maximum = engine.getSnapshot().board.view.scale;
    for (let index = 0; index < 20; index += 1) wheel(1000);
    window.dispatchEvent(new Event("blur"));
    return { maximum, minimum: engine.getSnapshot().board.view.scale };
  });
  near(limits.maximum, 4);
  near(limits.minimum, 0.1);
  await page.evaluate(() => {
    const engine = window.__canvas2dEngine;
    engine.loadStructuredBoardForExport({
      items: [{ id: "gesture-text", type: "text", x: 180, y: 180, width: 300, height: 100, text: "Before gesture", html: "<p>Before gesture</p>", fontSize: 20 }],
      selectedIds: ["gesture-text"], view: { scale: 1, offsetX: 0, offsetY: 0 },
    });
    if (!engine.runCommand("element.edit")) throw new Error("Could not start text editing");
  });
  const editor = page.locator("#canvas-rich-editor:not(.is-hidden)");
  await editor.waitFor();
  await editor.fill("Editing survives pinch");
  await editor.evaluate((element) => element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -2 })));
  await page.waitForFunction(() => !window.__canvas2dEngine.getCanvasPerformanceLifecycleSnapshot().interactionCritical);
  assert.equal(await editor.innerText(), "Editing survives pinch");
  assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().editingId), "gesture-text");
  await editor.evaluate((element) => element.blur());
  await page.waitForFunction(() => !window.__canvas2dEngine.getSnapshot().editingId);
  assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items[0].text.trim()), "Editing survives pinch");
  await page.evaluate(() => window.__canvas2dEngine.setTool("pan"));
  const point = await page.locator("#canvas-office-canvas").evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + rect.width * 0.72, y: rect.top + rect.height * 0.65 };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  const drag = await page.evaluate(() => {
    const engine = window.__canvas2dEngine;
    const before = { ...engine.getSnapshot().board.view };
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -2 });
    document.querySelector("#canvas-office-canvas").dispatchEvent(event);
    return { before, after: engine.getSnapshot().board.view, prevented: event.defaultPrevented };
  });
  await page.mouse.up();
  assert(drag.prevented, "wheel was not guarded during pointer drag");
  assert.deepEqual(drag.after, drag.before, "wheel changed the camera during pointer drag");
  await page.evaluate(() => window.__canvas2dEngine.setTool("select"));
  await page.evaluate(() => {
    document.querySelector("#canvas-office-canvas").dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -2 }));
  });
  await page.waitForFunction(() => !window.__canvas2dEngine.getCanvasPerformanceLifecycleSnapshot().interactionCritical);
  near(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.view.scale), drag.before.scale * Math.exp(0.02));
  return result;
}

module.exports = { checkCanvasTrackpad };
