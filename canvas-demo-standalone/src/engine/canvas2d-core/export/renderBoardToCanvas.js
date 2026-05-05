import { createView } from "../camera.js";
import { resolvePdfExportScalePlan } from "./pdfExportGuard.js";

function getDevicePixelRatio() {
  if (typeof window === "undefined") {
    return 1;
  }
  return Math.max(1, Number(window.devicePixelRatio) || 1);
}

function createExportCanvas(width, height, documentRef = globalThis?.document) {
  if (!documentRef?.createElement) {
    return null;
  }
  const canvas = documentRef.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function getExportBounds(items = [], { getElementBounds, getFlowEdgeBounds } = {}) {
  if (typeof getElementBounds !== "function") {
    return null;
  }
  const boundsList = items
    .map((item) => (item?.type === "flowEdge" && typeof getFlowEdgeBounds === "function" ? getFlowEdgeBounds(item) : getElementBounds(item)))
    .filter(Boolean);
  if (!boundsList.length) {
    return null;
  }
  const result = boundsList.reduce(
    (acc, bounds) => {
      acc.left = Math.min(acc.left, bounds.left);
      acc.top = Math.min(acc.top, bounds.top);
      acc.right = Math.max(acc.right, bounds.right);
      acc.bottom = Math.max(acc.bottom, bounds.bottom);
      return acc;
    },
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  );
  if (!Number.isFinite(result.left) || !Number.isFinite(result.top) || !Number.isFinite(result.right) || !Number.isFinite(result.bottom)) {
    return null;
  }
  return {
    ...result,
    width: Math.max(1, result.right - result.left),
    height: Math.max(1, result.bottom - result.top),
  };
}

export function renderBoardToCanvas(items = [], options = {}) {
  const {
    renderer,
    getElementBounds,
    getFlowEdgeBounds,
    allowLocalFileAccess = true,
    backgroundFill = "transparent",
    backgroundGrid = false,
    backgroundPattern = "",
    renderTextInCanvas = true,
    minPadding = 12,
    paddingRatio = 0.04,
    scale = 1,
    documentRef = globalThis?.document,
    devicePixelRatio = 1,
    maxCanvasPixels,
    maxCanvasSide,
    allowUnsafeSize = false,
    exportBounds = null,
  } = options;

  if (!renderer || typeof renderer.render !== "function" || typeof getElementBounds !== "function") {
    return null;
  }

  const bounds =
    exportBounds && Number.isFinite(exportBounds.left) && Number.isFinite(exportBounds.top)
      ? {
          left: Number(exportBounds.left) || 0,
          top: Number(exportBounds.top) || 0,
          right: Number(exportBounds.right ?? (Number(exportBounds.left) || 0) + (Number(exportBounds.width) || 0)) || 0,
          bottom: Number(exportBounds.bottom ?? (Number(exportBounds.top) || 0) + (Number(exportBounds.height) || 0)) || 0,
          width: Math.max(1, Number(exportBounds.width) || 1),
          height: Math.max(1, Number(exportBounds.height) || 1),
        }
      : getExportBounds(items, { getElementBounds, getFlowEdgeBounds });
  if (!bounds) {
    return null;
  }

  const exportScale = Math.max(0.1, Number(scale) || 1);
  const padding = Math.max(minPadding, Math.round(Math.min(bounds.width, bounds.height) * paddingRatio));
  const logicalWidth = Math.max(1, bounds.right - bounds.left + padding * 2);
  const logicalHeight = Math.max(1, bounds.bottom - bounds.top + padding * 2);
  const dpr = Math.max(1, Number(devicePixelRatio) || 1);
  const scalePlan = resolvePdfExportScalePlan({
    logicalWidth,
    logicalHeight,
    requestedScale: exportScale,
    pixelRatio: dpr,
    maxCanvasPixels,
    maxCanvasSide,
  });
  if (!scalePlan.ok) {
    if (allowUnsafeSize) {
      scalePlan.ok = true;
      scalePlan.downgraded = false;
      scalePlan.scaleApplied = scalePlan.requestedScale;
      scalePlan.canvasWidth = Math.max(1, Math.round(scalePlan.canvasWidth || logicalWidth * exportScale * dpr));
      scalePlan.canvasHeight = Math.max(1, Math.round(scalePlan.canvasHeight || logicalHeight * exportScale * dpr));
      scalePlan.totalPixels = Math.max(1, Number(scalePlan.totalPixels) || scalePlan.canvasWidth * scalePlan.canvasHeight);
    } else {
      return {
        canvas: null,
        width: logicalWidth,
        height: logicalHeight,
        bounds,
        padding,
        scaleApplied: 0,
        devicePixelRatio: dpr,
        errorCode: scalePlan.errorCode,
        errorMessage: scalePlan.errorMessage,
        requestedScale: scalePlan.requestedScale,
        requestedCanvasWidth: scalePlan.canvasWidth,
        requestedCanvasHeight: scalePlan.canvasHeight,
        requestedTotalPixels: scalePlan.totalPixels,
        maxCanvasPixels: scalePlan.maxCanvasPixels,
        maxCanvasSide: scalePlan.maxCanvasSide,
      };
    }
  }
  const canvas = createExportCanvas(scalePlan.canvasWidth, scalePlan.canvasHeight, documentRef);
  if (!canvas) {
    return null;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const view = createView({
    scale: scalePlan.scaleApplied,
    offsetX: (-bounds.left + padding) * scalePlan.scaleApplied,
    offsetY: (-bounds.top + padding) * scalePlan.scaleApplied,
  });

  renderer.render({
    ctx,
    canvas,
    view,
    items,
    selectedIds: [],
    hoverId: null,
    selectionRect: null,
    draftElement: null,
    editingId: null,
    imageEditState: null,
    flowDraft: null,
    allowLocalFileAccess,
    backgroundStyle: {
      fill: backgroundFill,
      grid: Boolean(backgroundGrid),
      pattern: String(backgroundPattern || "").trim().toLowerCase() || undefined,
    },
    renderTextInCanvas: Boolean(renderTextInCanvas),
    pixelRatio: dpr,
  });

  return {
    canvas,
    width: logicalWidth,
    height: logicalHeight,
    bounds,
    padding,
    scaleApplied: scalePlan.scaleApplied,
    devicePixelRatio: dpr,
    downgraded: scalePlan.downgraded,
    requestedScale: scalePlan.requestedScale,
    totalPixels: scalePlan.totalPixels,
  };
}
