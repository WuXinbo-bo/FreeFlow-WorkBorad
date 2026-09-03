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

async function measureGesture(page, deltaX, label) {
  const resizer = page.locator("#left-pane-resizer");
  const box = await resizer.boundingBox();
  assert(Boolean(box), "canvas resize handle is unavailable", { label });
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const steps = 48;

  await beginProbe(page);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let index = 1; index <= steps; index += 1) {
    await page.mouse.move(startX + (deltaX * index) / steps, startY);
    await page.waitForTimeout(4);
  }
  await page.waitForTimeout(34);
  const during = await page.evaluate(({ pointerX }) => {
    const handle = document.querySelector("#left-pane-resizer").getBoundingClientRect();
    return {
      active: document.body.classList.contains("is-pane-resizing"),
      attributeMutations: window.__freeflowPanelResizeProbe.attributeMutations,
      handleError: Math.abs(handle.left + handle.width / 2 - pointerX),
      beginCalls: window.__freeflowWindowShapeCalls.filter((call) => call.kind === "begin").length,
      exactCalls: window.__freeflowWindowShapeCalls.filter((call) => call.kind === "exact").length,
    };
  }, { pointerX: startX + deltaX });
  await page.mouse.up();
  await page.waitForFunction(() => !document.body.classList.contains("is-pane-resizing"));
  await page.waitForTimeout(80);
  const result = await finishProbe(page);
  const p95 = percentile(result.interactionFrameIntervals, 0.95);

  assert(during.active, "panel resize transaction did not remain active during drag", { label, during });
  assert(during.attributeMutations === 0, "Canvas backing store changed during live panel resize", { label, during });
  assert(during.handleError <= 2, "resize handle fell behind the pointer", { label, during });
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
  assert(p95 <= 34.5, "panel resize RAF P95 exceeded the interaction budget", {
    label,
    p95,
    samples: result.interactionFrameIntervals.length,
    slowFrames: result.interactionFrameIntervals.filter((duration) => duration > 20).slice(0, 20),
  });
  assert(!result.bodyResizing, "panel resize state did not recover", { label, result });
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
    const outward = await measureGesture(page, 140, "outward");
    const inward = await measureGesture(page, -100, "inward");
    console.log(`[panel-resize-performance] ${JSON.stringify({ outward, inward })}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[panel-resize-performance] ${error.message}`);
  process.exitCode = 1;
});
