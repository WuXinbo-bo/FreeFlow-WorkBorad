const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium } = require("playwright");

const ROOT_DIR = path.resolve(__dirname, "..");

async function checkWorldCoordinates() {
  const previousCanvas = globalThis.OffscreenCanvas;
  const previousMatrix = globalThis.DOMMatrix;
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() {
      return new Proxy({}, { get: (_target, key) => key === "getTransform" ? () => ({ a: 1, b: 0 }) : () => {} });
    }
  };
  globalThis.DOMMatrix = class { constructor() { this.a = this.d = 1; } };
  try {
    const { createBackgroundPatternCache, drawBackgroundPatternFallback } = await import("../public/src/engines/canvas2d-core/rendererPerf.js");
    const cache = createBackgroundPatternCache();
    let captured;
    let dpr = 1;
    const context = {
      save() {}, restore() {}, fillRect() {},
      getTransform: () => ({ a: dpr, b: 0 }),
      createPattern(tile) {
        const result = { tile, setTransform(matrix) { result.matrix = matrix; } };
        captured = result;
        return result;
      },
    };
    for (dpr of [1, 1.25, 2, 0.8]) {
      for (const pattern of ["dots", "grid", "lines", "engineering"]) {
        for (const scale of [1.27, 1.235, 1.237, 0.4, 0.3, 0.2, 0.01, 4.7]) {
          const view = { scale, offsetX: -137.25, offsetY: 53.125 };
          // Use a fresh cache so the captured CanvasPattern always belongs to this draw.
          const current = createBackgroundPatternCache();
          assert.equal(current.draw(context, 600, 300, view, pattern), true);
          const repeat = pattern === "engineering" ? 5 : 1;
          const baseWorldStep = pattern === "lines" ? 18 * 1.6 : 18;
          let worldStep = baseWorldStep;
          while (worldStep * scale < 8) worldStep *= 2;
          const expectedPeriod = worldStep * scale * repeat;
          const matrix = captured.matrix;
          const actualPeriod = captured.tile.width * (matrix.a || 1);
          assert(Math.abs(actualPeriod - expectedPeriod) < 1e-8,
            `${pattern} at ${scale}: raster cache changed world spacing (${actualPeriod} vs ${expectedPeriod})`);
          for (const [offset, phase] of [[view.offsetX, matrix.e], [view.offsetY, matrix.f]]) {
            const latticeIndex = (offset - phase) / expectedPeriod;
            assert(Math.abs(latticeIndex - Math.round(latticeIndex)) < 1e-8, "pattern moved away from its world origin");
          }
          const marks = [];
          drawBackgroundPatternFallback({
            beginPath() {}, stroke() {}, lineTo() {},
            moveTo(x, y) { if (x !== 0) marks.push([x, view.offsetX]); if (y !== 0) marks.push([y, view.offsetY]); },
            fillRect(x, y) { marks.push([x, view.offsetX], [y, view.offsetY]); },
          }, 600, 300, view, pattern);
          for (const [position, offset] of marks) {
            const index = (position - offset) / (worldStep * scale);
            assert(Math.abs(index - Math.round(index)) < 1e-8, "fallback and cached paths use different world lattices");
          }
        }
      }
    }
    dpr = 1;
    for (let index = 0; index < 100; index += 1) {
      cache.draw(context, 600, 300, { scale: 1.27, offsetX: index * 1.3, offsetY: -index }, "dots");
    }
    assert.equal(cache.getStats().cacheMisses, 1, "panning rebuilt background raster tiles");
    assert.equal(cache.getStats().cacheHits, 99);
    assert(cache.getStats().byteSize <= 8 * 1024 * 1024);
    cache.trimToBytes(0);
    assert.equal(cache.getStats().cacheSize, 0);
    assert.equal(cache.draw(context, 600, 300, { scale: 1.27, offsetX: 0, offsetY: 0 }, "dots"), true);
  } finally {
    globalThis.OffscreenCanvas = previousCanvas;
    globalThis.DOMMatrix = previousMatrix;
  }
}

async function checkRendererRecovery() {
  const bundle = await esbuild.build({
    entryPoints: [path.join(ROOT_DIR, "public/src/engines/canvas2d-core/renderer.js")],
    bundle: true, platform: "browser", format: "iife", globalName: "BackgroundAudit", write: false, logLevel: "silent",
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas width="600" height="300" style="width:600px;height:300px"></canvas>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas");
      const ctx = canvas.getContext("2d");
      const paintContent = ({ ctx: target, view, item }) => {
        target.fillStyle = item.fill;
        target.fillRect(view.offsetX + item.x * view.scale, view.offsetY + item.y * view.scale, item.width * view.scale, item.height * view.scale);
        return true;
      };
      paintContent.supportedTypes = ["shape"];
      const renderer = BackgroundAudit.createRenderer({ customRenderers: [paintContent] });
      let testItems = [];
      const interaction = document.createElement("canvas");
      interaction.width = 600;
      interaction.height = 300;
      const interactionCtx = interaction.getContext("2d");
      const failures = [];
      const check = (condition, message) => { if (!condition) failures.push(message); };
      const waitReady = async () => {
        for (let index = 0; index < 50 && renderer.getResourceStats().retainedFrame.pending; index += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        check(renderer.getResourceStats().retainedFrame.ready, "retained content was not prepared");
      };
      function draw(pattern, { background = true, fast = false, view = { scale: 1, offsetX: 0, offsetY: 0 }, fill = "#ffffff" } = {}) {
        return renderer.render({
          ctx, canvas, interactionCtx, view, items: testItems, allItems: testItems, selectedIds: [],
          backgroundStyle: { fill, pattern }, pixelRatio: 1,
          viewportBudget: { cssWidth: 600, cssHeight: 300, effectiveDpr: 1 },
          layerState: { dirty: { background, staticScene: true, dynamicScene: true, interaction: true } },
          frameContext: { sceneRevision: 1, boardRevision: 1 }, sceneKey: "same-scene",
          viewportInteractionActive: fast, cameraFastPath: fast,
        });
      }
      const pixels = () => Array.from(ctx.getImageData(0, 0, 600, 60).data);
      const coloredPixels = () => pixels().filter((value, index) => index % 4 !== 3 && value !== 255).length;
      draw("dots");
      check(coloredPixels() > 0, "initial dots did not draw");
      await waitReady();
      draw("none", { background: false });
      check(coloredPixels() === 0, "same-view board replacement kept the previous background");
      await waitReady();
      const noPattern = draw("none", { fast: true, view: { scale: 1, offsetX: 10, offsetY: -5 } });
      check(noPattern.retainedCameraFrame.active, "camera fast path was not exercised");
      check(coloredPixels() === 0, "retained content resurrected an obsolete background");
      draw("none", { background: false, fill: "#d9e4ee" });
      check(ctx.getImageData(1, 1, 1, 1).data[0] === 217, "same-view fill replacement was not invalidated");
      for (const pattern of ["dots", "grid", "lines", "engineering", "none"]) {
        draw(pattern);
        await waitReady();
        for (const view of [
          { scale: 1.27, offsetX: -137.25, offsetY: 53.125 },
          { scale: 0.2, offsetX: -24.5, offsetY: 9.125 },
          { scale: 1, offsetX: 0, offsetY: 0 },
        ]) {
          const active = draw(pattern, { fast: true, view });
          const before = pixels();
          draw(pattern, { view });
          const after = pixels();
          check(before.every((value, index) => value === after[index]), `${pattern}: navigation stop changed background pixels at scale ${view.scale}`);
          if (view.scale === 1.27) check(active.retainedCameraFrame.active, `${pattern}: retained path not used at fractional zoom`);
          await waitReady();
        }
      }
      draw("dots");
      await waitReady();
      draw("engineering", { fast: true, background: false, view: { scale: 1.03, offsetX: -25.5, offsetY: 16.25 } });
      const changedDuringGesture = pixels();
      draw("engineering", { background: false, view: { scale: 1.03, offsetX: -25.5, offsetY: 16.25 } });
      const settledAfterChange = pixels();
      check(changedDuringGesture.every((value, index) => value === settledAfterChange[index]), "background change during navigation did not recover on settle");
      const beforeTrim = pixels();
      renderer.trimBackgroundPatternCacheToBytes(0);
      draw("engineering", { view: { scale: 1.03, offsetX: -25.5, offsetY: 16.25 } });
      const afterTrim = pixels();
      check(beforeTrim.every((value, index) => value === afterTrim[index]), "cache eviction/recreation changed background placement");
      draw("none", { fill: "transparent" });
      await waitReady();
      const hintBefore = Array.from(interactionCtx.getImageData(0, 0, 600, 300).data);
      check(hintBefore.some((value, index) => index % 4 === 3 && value > 0), "empty-board hint disappeared");
      draw("none", { fill: "transparent", fast: true, view: { scale: 1.12, offsetX: -22.5, offsetY: 18.75 } });
      const transparentPixels = Array.from(ctx.getImageData(0, 0, 600, 300).data);
      check(transparentPixels.every((value, index) => index % 4 !== 3 || value === 0), "transparent air canvas gained opaque retained pixels");
      const hintAfter = Array.from(interactionCtx.getImageData(0, 0, 600, 300).data);
      check(hintBefore.every((value, index) => value === hintAfter[index]), "empty-board hint moved or changed during navigation");
      draw("none", { fill: "transparent", view: { scale: 1.12, offsetX: -22.5, offsetY: 18.75 } });
      const hintSettled = Array.from(interactionCtx.getImageData(0, 0, 600, 300).data);
      check(hintAfter.every((value, index) => value === hintSettled[index]), "empty-board hint changed after navigation stopped");
      testItems = [{ id: "alpha-content", type: "shape", shapeType: "rect", x: 100, y: 80, width: 100, height: 70, fill: "rgba(0,100,200,0.5)" }];
      draw("none", { fill: "transparent" });
      await waitReady();
      const contentView = { scale: 1.27, offsetX: -25.5, offsetY: 16.25 };
      const contentFast = draw("none", { fill: "transparent", fast: true, view: contentView });
      check(contentFast.retainedCameraFrame.active, "transparent content did not use the retained path");
      const alphaContent = Array.from(ctx.getImageData(165, 143, 1, 1).data);
      check(alphaContent[3] >= 127 && alphaContent[3] <= 128, "retained composition lost content transparency");
      draw("none", { fill: "#ffffff", fast: true, view: contentView });
      const overWhiteFast = Array.from(ctx.getImageData(165, 143, 1, 1).data);
      draw("none", { fill: "#ffffff", view: contentView });
      const overWhiteSettled = Array.from(ctx.getImageData(165, 143, 1, 1).data);
      check(overWhiteFast.every((value, index) => value === overWhiteSettled[index]) && overWhiteFast[3] === 255,
        "live background was composited above transparent content");
      testItems = [];
      draw("grid", { view: { scale: 0.2, offsetX: 0, offsetY: 0 } });
      await waitReady();
      const lowView = { scale: 0.21, offsetX: -8.25, offsetY: 12.125 };
      const lowFast = draw("grid", { fast: true, view: lowView });
      const lowBefore = pixels();
      draw("grid", { view: lowView });
      const lowAfter = pixels();
      check(lowFast.retainedCameraFrame.active, "low-zoom retained path was not exercised");
      check(lowBefore.every((value, index) => value === lowAfter[index]), "thinned world grid jumped after low-zoom navigation");
      const matrixView = { scale: 1.27, offsetX: -137.25, offsetY: 53.125 };
      draw("engineering", { view: matrixView });
      const withMatrix = pixels();
      const originalSetTransform = CanvasPattern.prototype.setTransform;
      try {
        CanvasPattern.prototype.setTransform = undefined;
        renderer.trimBackgroundPatternCacheToBytes(0);
        draw("engineering", { view: matrixView });
        const withoutMatrix = pixels();
        check(withMatrix.every((value, index) => value === withoutMatrix[index]), "context-transform fallback changed pattern placement");
      } finally {
        CanvasPattern.prototype.setTransform = originalSetTransform;
      }
      renderer.releaseCachedSurfaces();
      return { failures, stats: renderer.getResourceStats() };
    });
    assert.deepEqual(result.failures, []);
  } finally {
    await browser.close();
  }
}

async function main() {
  await checkWorldCoordinates();
  await checkRendererRecovery();
  console.log("[check-canvas-background-rendering] world spacing, cache reuse, board replacement and navigation recovery passed");
}
main().catch((error) => { console.error(`[check-canvas-background-rendering] ${error.stack || error.message}`); process.exitCode = 1; });
