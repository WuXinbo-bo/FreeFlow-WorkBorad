"use strict";

const { chromium } = require("playwright");

const BASE_URL = process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:3000/?desktop=1";
const VIEWPORT = { width: 1600, height: 1000 };

function assert(condition, message, detail) {
  if (!condition) {
    throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
  }
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

async function installDesktopBridge(page) {
  await page.addInitScript(() => {
    const calls = [];
    window.__freeflowWindowShapeCalls = calls;
    window.desktopShell = {
      isDesktop: true,
      async setWindowShape(rects) {
        calls.push({ kind: "exact", rectCount: Array.isArray(rects) ? rects.length : 0 });
        return { ok: true };
      },
      async beginInteractiveWindowShape(payload) {
        calls.push({ kind: "begin", transactionId: String(payload?.transactionId || "") });
        return { ok: true };
      },
      async endInteractiveWindowShape(payload) {
        calls.push({
          kind: "end",
          transactionId: String(payload?.transactionId || ""),
          rectCount: Array.isArray(payload?.rects) ? payload.rects.length : 0,
        });
        return { ok: true };
      },
    };
  });
}

async function beginProbe(page) {
  await page.evaluate(() => {
    window.__freeflowWindowShapeCalls.length = 0;
    const canvases = [
      document.querySelector("#canvas-office-canvas"),
      document.querySelector("#canvas2d-interaction-canvas"),
    ].filter(Boolean);
    const probe = {
      attributeMutations: 0,
      frameIntervals: [],
      interactionFrameIntervals: [],
      longTasks: [],
      running: true,
      lastFrameAt: 0,
      frameId: 0,
    };
    probe.observer = new MutationObserver((records) => {
      probe.attributeMutations += records.filter(
        (record) => record.attributeName === "width" || record.attributeName === "height"
      ).length;
    });
    canvases.forEach((canvas) => probe.observer.observe(canvas, {
      attributes: true,
      attributeFilter: ["width", "height"],
    }));
    if (typeof PerformanceObserver === "function") {
      try {
        probe.longTaskObserver = new PerformanceObserver((list) => {
          probe.longTasks.push(...list.getEntries().map((entry) => entry.duration));
        });
        probe.longTaskObserver.observe({ entryTypes: ["longtask"] });
      } catch {
        probe.longTaskObserver = null;
      }
    }
    const tick = (now) => {
      if (!probe.running) return;
      if (probe.lastFrameAt) {
        const interval = now - probe.lastFrameAt;
        probe.frameIntervals.push(interval);
        if (document.body.classList.contains("is-pane-resizing")) {
          probe.interactionFrameIntervals.push(interval);
        }
      }
      probe.lastFrameAt = now;
      probe.frameId = requestAnimationFrame(tick);
    };
    probe.frameId = requestAnimationFrame(tick);
    window.__freeflowPanelResizeProbe = probe;
  });
}

async function finishProbe(page) {
  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const probe = window.__freeflowPanelResizeProbe;
    probe.running = false;
    cancelAnimationFrame(probe.frameId);
    probe.observer.disconnect();
    probe.longTaskObserver?.disconnect();
    const canvas = document.querySelector("#canvas-office-canvas");
    const interactionCanvas = document.querySelector("#canvas2d-interaction-canvas");
    const rect = canvas.getBoundingClientRect();
    return {
      attributeMutations: probe.attributeMutations,
      frameIntervals: probe.frameIntervals,
      interactionFrameIntervals: probe.interactionFrameIntervals,
      longTasks: probe.longTasks,
      shapeCalls: window.__freeflowWindowShapeCalls.slice(),
      canvas: {
        cssWidth: rect.width,
        cssHeight: rect.height,
        width: canvas.width,
        height: canvas.height,
        interactionWidth: interactionCanvas.width,
        interactionHeight: interactionCanvas.height,
        dpr: window.devicePixelRatio,
      },
      bodyResizing: document.body.classList.contains("is-pane-resizing"),
    };
  });
}

async function measureGesture(page, { side, deltaX, label }) {
  const isLeftPanel = side === "left";
  const panelSelector = isLeftPanel ? ".desktop-clear-stage" : ".conversation-panel";
  const contentSelector = isLeftPanel ? ".desktop-clear-stage .canvas-shell" : ".conversation-resize-content";
  const resizerSelector = isLeftPanel ? "#left-pane-resizer" : "#right-pane-resizer";
  const resizer = page.locator(resizerSelector);
  const box = await resizer.boundingBox();
  assert(Boolean(box), "workspace resize handle is unavailable", { label, side });
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const steps = 48;
  const initial = await page.evaluate(({ panelSelector, contentSelector, measureCanvasSurface }) => {
    const panelElement = document.querySelector(panelSelector);
    const panel = panelElement.getBoundingClientRect();
    const content = document.querySelector(contentSelector).getBoundingClientRect();
    const surface = measureCanvasSurface
      ? document.querySelector("#canvas-canvas2d-host").getBoundingClientRect()
      : null;
    return {
      dragEdge: panelElement.dataset.workspaceDock === "right" ? "left" : "right",
      panel: { left: panel.left, right: panel.right, width: panel.width, height: panel.height },
      content: { width: content.width, height: content.height },
      surface: surface ? { width: surface.width, height: surface.height } : null,
    };
  }, { panelSelector, contentSelector, measureCanvasSurface: isLeftPanel });

  await beginProbe(page);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let index = 1; index <= steps; index += 1) {
    await page.mouse.move(startX + (deltaX * index) / steps, startY);
    await page.waitForTimeout(4);
  }
  await page.waitForTimeout(34);
  const during = await page.evaluate(({ side, panelSelector, contentSelector, resizerSelector, measureCanvasSurface, dragEdge }) => {
    const panel = document.querySelector(panelSelector);
    const panelRect = panel.getBoundingClientRect();
    const contentRect = document.querySelector(contentSelector).getBoundingClientRect();
    const resizeFrame = document.querySelector(`.pane-resize-frame[data-resize-side="${side}"]`).getBoundingClientRect();
    const surfaceRect = measureCanvasSurface
      ? document.querySelector("#canvas-canvas2d-host").getBoundingClientRect()
      : null;
    return {
      active: document.body.classList.contains("is-pane-resizing"),
      attributeMutations: window.__freeflowPanelResizeProbe.attributeMutations,
      panelEdge: resizeFrame.left,
      sourcePanelWidth: panelRect.width,
      handleOpacity: Number(getComputedStyle(document.querySelector(resizerSelector)).opacity),
      panelHeight: panelRect.height,
      contentWidth: contentRect.width,
      contentHeight: contentRect.height,
      surfaceWidth: surfaceRect?.width || 0,
      surfaceHeight: surfaceRect?.height || 0,
      panelTransform: getComputedStyle(panel).transform,
      panelTransformScale: (() => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(panel).transform);
        return { x: matrix.a, y: matrix.d };
      })(),
      beginCalls: window.__freeflowWindowShapeCalls.filter((call) => call.kind === "begin").length,
      exactCalls: window.__freeflowWindowShapeCalls.filter((call) => call.kind === "exact").length,
    };
  }, {
    side,
    panelSelector,
    contentSelector,
    resizerSelector,
    measureCanvasSurface: isLeftPanel,
    dragEdge: initial.dragEdge,
  });
  await page.mouse.up();
  await page.waitForFunction(() => !document.body.classList.contains("is-pane-resizing"));
  await page.waitForTimeout(80);
  const result = await finishProbe(page);
  const p95 = percentile(result.interactionFrameIntervals, 0.95);
  const expectedPanelWidth = initial.panel.width + (initial.dragEdge === "right" ? deltaX : -deltaX);
  const frameBudget = side === "right" && expectedPanelWidth < initial.panel.width ? 50.5 : 34.5;
  assert(during.active, "panel resize transaction did not remain active during drag", { label, during });
  assert(during.attributeMutations === 0, "Canvas backing store changed during live panel resize", { label, during });
  assert(during.handleOpacity === 0, "stale resize handle remained visible during live resize", { label, during });
  assert(
    Math.abs(during.panelEdge - initial.panel[initial.dragEdge] - deltaX) <= 2,
    "workspace edge fell behind the pointer",
    { label, initial, during }
  );
  assert(
    Math.abs(during.panelTransformScale.x - 1) <= 0.001 &&
      Math.abs(during.panelTransformScale.y - 1) <= 0.001,
    "live panel resize distorted the workspace with a CSS scale",
    { label, during }
  );
  if (side === "left" || expectedPanelWidth >= initial.panel.width) {
    assert(
      Math.abs(during.sourcePanelWidth - initial.panel.width) <= 1,
      "live outward resize changed the heavy workspace layout",
      { label, initial, during }
    );
    assert(
      Math.abs(during.contentWidth - initial.content.width) <= 1 &&
        Math.abs(during.contentHeight - initial.content.height) <= 1,
      "workspace content reflowed during live outward resize",
      { label, initial, during }
    );
  }
  if (isLeftPanel) {
    assert(
      Math.abs(during.surfaceWidth - initial.surface.width) <= 1 &&
        Math.abs(during.surfaceHeight - initial.surface.height) <= 1,
      "Canvas content changed aspect ratio during live panel resize",
      { label, initial, during }
    );
  }
  assert(during.beginCalls === 1 && during.exactCalls === 0, "native shape was recomputed during live resize", {
    label,
    during,
  });
  assert(result.attributeMutations <= 4, "panel resize performed repeated Canvas reallocations", { label, result });
  assert(result.shapeCalls.filter((call) => call.kind === "end").length === 1, "native shape transaction did not commit once", {
    label,
    shapeCalls: result.shapeCalls,
  });
  assert(result.longTasks.filter((duration) => duration >= 50).length === 0, "panel resize produced a long task", {
    label,
    longTasks: result.longTasks,
  });
  assert(p95 <= frameBudget, "panel resize RAF P95 exceeded the interaction budget", {
    label,
    p95,
    frameBudget,
    samples: result.interactionFrameIntervals.length,
    slowFrames: result.interactionFrameIntervals.filter((duration) => duration > 20).slice(0, 20),
  });
  assert(!result.bodyResizing, "panel resize state did not recover", { label, result });
  const finalGeometry = await page.evaluate(({ side, panelSelector, contentSelector, resizerSelector }) => {
    const panelElement = document.querySelector(panelSelector);
    const panel = panelElement.getBoundingClientRect();
    const content = document.querySelector(contentSelector);
    const viewport = panelElement.querySelector(`[data-pane-resize-viewport="${side}"]`);
    const handle = document.querySelector(resizerSelector).getBoundingClientRect();
    return {
      panelWidth: panel.width,
      contentWidth: content.getBoundingClientRect().width,
      previewExists: Boolean(document.querySelector(`.pane-resize-frame[data-resize-side="${side}"]`)),
      panelPreviewActive: panelElement.classList.contains("is-pane-resize-preview"),
      viewportInlineClip: viewport.style.clip,
      handleOpacity: Number(getComputedStyle(document.querySelector(resizerSelector)).opacity),
      handleLeft: handle.left,
      handleWidth: handle.width,
    };
  }, {
    side,
    panelSelector,
    contentSelector,
    resizerSelector,
  });
  assert(
    Math.abs(finalGeometry.panelWidth - expectedPanelWidth) <= 2 &&
      finalGeometry.handleOpacity >= 0.9 &&
      !finalGeometry.previewExists &&
      !finalGeometry.panelPreviewActive &&
      finalGeometry.viewportInlineClip === "",
    "workspace geometry did not commit and restore its resize handle",
    { label, expectedPanelWidth, finalGeometry }
  );
  assert(
    result.canvas.width === Math.round(result.canvas.cssWidth * result.canvas.dpr) &&
      result.canvas.height === Math.round(result.canvas.cssHeight * result.canvas.dpr) &&
      result.canvas.interactionWidth === result.canvas.width &&
      result.canvas.interactionHeight === result.canvas.height,
    "Canvas did not restore a sharp final backing store",
    { label, canvas: result.canvas }
  );

  return { label, p95, samples: result.interactionFrameIntervals.length, mutations: result.attributeMutations };
}

async function checkRightPanelDirectionReversal(page) {
  const panelSelector = ".conversation-panel";
  const resizer = page.locator("#right-pane-resizer");
  await resizer.dblclick();
  await page.waitForTimeout(160);
  const box = await resizer.boundingBox();
  assert(Boolean(box), "right workspace resize handle is unavailable for direction reversal");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const initial = await page.evaluate((selector) => {
    const panel = document.querySelector(selector);
    const panelRect = panel.getBoundingClientRect();
    const contentRect = panel.querySelector(".conversation-resize-content").getBoundingClientRect();
    return {
      dock: panel.dataset.workspaceDock,
      left: panelRect.left,
      right: panelRect.right,
      width: panelRect.width,
      contentWidth: contentRect.width,
    };
  }, panelSelector);
  const resizeFromLeft = initial.dock === "right";
  const inwardDelta = resizeFromLeft ? 72 : -72;
  const outwardDelta = resizeFromLeft ? -96 : 96;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + inwardDelta, startY, { steps: 12 });
  await page.waitForTimeout(34);
  const inward = await page.evaluate((selector) => {
    const panel = document.querySelector(selector).getBoundingClientRect();
    return { width: panel.width };
  }, panelSelector);
  assert(Math.abs(inward.width - (initial.width - Math.abs(inwardDelta))) <= 2, "right workspace did not shrink live", {
    initial,
    inward,
  });

  await page.mouse.move(startX + outwardDelta, startY, { steps: 20 });
  await page.waitForTimeout(34);
  const outward = await page.evaluate(({ selector, side }) => {
    const panel = document.querySelector(selector);
    const panelRect = panel.getBoundingClientRect();
    const contentRect = panel.querySelector(".conversation-resize-content").getBoundingClientRect();
    const guideRect = document.querySelector(`.pane-resize-frame[data-resize-side="${side}"]`).getBoundingClientRect();
    return {
      panelWidth: panelRect.width,
      contentWidth: contentRect.width,
      guideLeft: guideRect.left,
    };
  }, { selector: panelSelector, side: "right" });
  assert(
    Math.abs(outward.panelWidth - initial.width) <= 1 &&
      Math.abs(outward.contentWidth - initial.contentWidth) <= 1,
    "right workspace did not restore its frozen geometry after reversing outward",
    { initial, outward }
  );
  const initialEdge = resizeFromLeft ? initial.left : initial.right;
  assert(Math.abs(outward.guideLeft - initialEdge - outwardDelta) <= 2, "resize guide lost the pointer after reversal", {
    initial,
    outward,
  });

  await page.mouse.up();
  await page.waitForFunction(() => !document.body.classList.contains("is-pane-resizing"));
  const finalState = await page.evaluate(({ selector, side }) => {
    const panel = document.querySelector(selector);
    return {
      width: panel.getBoundingClientRect().width,
      previewExists: Boolean(document.querySelector(`.pane-resize-frame[data-resize-side="${side}"]`)),
      previewActive: panel.classList.contains("is-pane-resize-preview"),
    };
  }, { selector: panelSelector, side: "right" });
  assert(
    Math.abs(finalState.width - (initial.width + Math.abs(outwardDelta))) <= 2 &&
      !finalState.previewExists &&
      !finalState.previewActive,
    "right workspace did not commit cleanly after direction reversal",
    { initial, finalState }
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await installDesktopBridge(page);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".canvas2d-engine-toolbar", { timeout: 15_000 });
    await page.locator("#left-pane-resizer").dblclick();
    await page.waitForTimeout(80);
    const canvasOutward = await measureGesture(page, { side: "left", deltaX: 140, label: "canvas-outward" });
    const canvasInward = await measureGesture(page, { side: "left", deltaX: -100, label: "canvas-inward" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".canvas2d-engine-toolbar", { timeout: 15_000 });
    if (await page.locator("#right-pane-resizer").getAttribute("class").then((value) => value?.includes("is-hidden"))) {
      await page.locator("#restore-right-pane-btn").click();
      await page.waitForTimeout(320);
    }
    await page.locator("#right-pane-resizer").dblclick();
    await page.waitForTimeout(320);
    const conversationOutward = await measureGesture(page, {
      side: "right",
      deltaX: -120,
      label: "conversation-outward",
    });
    const conversationInward = await measureGesture(page, {
      side: "right",
      deltaX: 80,
      label: "conversation-inward",
    });
    await checkRightPanelDirectionReversal(page);
    console.log(`[panel-resize-performance] ${JSON.stringify({
      canvasOutward,
      canvasInward,
      conversationOutward,
      conversationInward,
    })}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[panel-resize-performance] ${error.message}`);
  process.exitCode = 1;
});
