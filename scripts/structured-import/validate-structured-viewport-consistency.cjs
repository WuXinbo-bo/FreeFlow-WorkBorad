"use strict";

async function main() {
  const viewportMetricsModule = await import(
    "../../public/src/engines/canvas2d-core/viewportMetrics.js"
  );
  const structuredRendererModule = await import(
    "../../public/src/engines/canvas2d-core/rendererStructured.js"
  );

  const {
    sceneRectToScreenRect,
    getStructuredTableSceneGrid,
    getStructuredCodeSceneMetrics,
    normalizeMathRenderState,
  } = viewportMetricsModule;
  const { createStructuredCanvasRenderer } = structuredRendererModule;

  const view100 = { scale: 1, offsetX: 10, offsetY: 20 };
  const view200 = { scale: 2, offsetX: 10, offsetY: 20 };
  const sceneRect = { left: 100, top: 80, width: 240, height: 120 };
  const screen100 = sceneRectToScreenRect(view100, sceneRect);
  const screen200 = sceneRectToScreenRect(view200, sceneRect);

  assert(screen100.left === 110 && screen100.top === 100, "screen100 origin mismatch");
  assert(screen100.width === 240 && screen100.height === 120, "screen100 size mismatch");
  assert(screen200.left === 210 && screen200.top === 180, "screen200 origin mismatch");
  assert(screen200.width === 480 && screen200.height === 240, "screen200 size mismatch");

  const tableGrid = getStructuredTableSceneGrid({
    x: 20,
    y: 20,
    width: 300,
    height: 120,
    table: {
      columns: 3,
      rows: [{ cells: [] }, { cells: [] }, { cells: [] }],
    },
  });
  assert(tableGrid.rowHeight === 40, "table row height should be scene-based");
  assert(tableGrid.columnWidth === 100, "table column width should be scene-based");

  const codeMetrics = getStructuredCodeSceneMetrics({
    x: 0,
    y: 0,
    width: 300,
    height: 120,
  });
  assert(codeMetrics.contentInsetX === 12, "code content inset should be scene unit");
  assert(codeMetrics.contentTop === 28, "code content top should be scene unit");

  assert(normalizeMathRenderState({ formula: "x^2", renderState: "ready" }) === "ready", "math ready mismatch");
  assert(
    normalizeMathRenderState({ formula: "x^2", renderState: "fallback-text" }) === "fallback",
    "math fallback mismatch"
  );
  assert(normalizeMathRenderState({ formula: "", renderState: "error" }) === "error", "math error mismatch");
  assert(normalizeMathRenderState({ formula: "" }) === "fallback", "math default fallback mismatch");

  const renderer = createStructuredCanvasRenderer();
  const helpers = {
    drawSelectionFrame() {},
    drawHandles() {},
  };

  const readyCtx = createMockContext();
  const fallbackCtx = createMockContext();
  const errorCtx = createMockContext();

  renderer({
    ctx: readyCtx,
    item: {
      id: "math-ready",
      type: "mathBlock",
      x: 10,
      y: 10,
      width: 220,
      height: 100,
      formula: "\\int_0^1 x dx",
      fallbackText: "$$\\int_0^1 x dx$$",
      displayMode: true,
      renderState: "ready",
    },
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    selected: false,
    hover: false,
    helpers,
  });

  renderer({
    ctx: fallbackCtx,
    item: {
      id: "math-fallback",
      type: "mathInline",
      x: 10,
      y: 140,
      width: 180,
      height: 40,
      formula: "",
      fallbackText: "$x^2+y^2$",
      displayMode: false,
      renderState: "fallback-text",
    },
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    selected: false,
    hover: false,
    helpers,
  });

  renderer({
    ctx: errorCtx,
    item: {
      id: "math-error",
      type: "mathBlock",
      x: 10,
      y: 200,
      width: 220,
      height: 100,
      formula: "\\bad",
      fallbackText: "$$\\bad$$",
      displayMode: true,
      renderState: "error",
    },
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    selected: false,
    hover: false,
    helpers,
  });

  assert(!readyCtx.fillTexts.includes("FALLBACK"), "ready math should not render fallback label");
  assert(!readyCtx.fillTexts.includes("RENDER ERROR"), "ready math should not render error label");
  assert(fallbackCtx.fillTexts.includes("FALLBACK"), "fallback math should render fallback label");
  assert(errorCtx.fillTexts.includes("RENDER ERROR"), "error math should render error label");

  console.log("[structured-viewport-consistency] ok: zoom + math-state scenarios validated");
}

function createMockContext() {
  return {
    fillTexts: [],
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    lineTo() {},
    save() {},
    restore() {},
    set fillStyle(_) {},
    set strokeStyle(_) {},
    set lineWidth(_) {},
    set font(_) {},
    set textBaseline(_) {},
    set textAlign(_) {},
    fillText(text) {
      this.fillTexts.push(String(text));
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[structured-viewport-consistency] validation script failed");
  console.error(error);
  process.exitCode = 1;
});

