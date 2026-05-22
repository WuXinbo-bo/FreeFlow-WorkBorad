import { renderBoardToCanvas as renderExportBoardToCanvas } from "./renderBoardToCanvas.js";

function createCanceledTileResult(message = "导出已取消") {
  return {
    ok: false,
    canceled: true,
    code: "TILE_EXPORT_CANCELED",
    message,
    tiles: [],
    tileCount: 0,
  };
}

function roundPositiveInt(value, fallback = 1) {
  const next = Math.round(Number(value) || 0);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function createTileBounds(left, top, right, bottom) {
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function createTileCanvasBytes(canvas) {
  if (!canvas) {
    return null;
  }
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/png" }).then((blob) => (blob ? blob.arrayBuffer() : null));
  }
  if (typeof canvas.toBlob !== "function") {
    return null;
  }
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        blob.arrayBuffer().then(resolve).catch(() => resolve(null));
      }, "image/png");
    } catch {
      resolve(null);
    }
  });
}

function getTilePlan(bounds, tileSize) {
  const safeBounds = {
    left: Number(bounds?.left || 0) || 0,
    top: Number(bounds?.top || 0) || 0,
    right: Number(bounds?.right || 0) || 0,
    bottom: Number(bounds?.bottom || 0) || 0,
  };
  const width = Math.max(1, Number(bounds?.width || safeBounds.right - safeBounds.left || 1) || 1);
  const height = Math.max(1, Number(bounds?.height || safeBounds.bottom - safeBounds.top || 1) || 1);
  const tileCountX = Math.max(1, Math.ceil(width / tileSize));
  const tileCountY = Math.max(1, Math.ceil(height / tileSize));
  return {
    ...safeBounds,
    width,
    height,
    tileCountX,
    tileCountY,
    tileCount: tileCountX * tileCountY,
  };
}

export async function renderSnapshotToTileExports(snapshot, options = {}) {
  if (options?.signal?.aborted) {
    return createCanceledTileResult();
  }
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const bounds = snapshot?.bounds && Number.isFinite(snapshot.bounds.left) && Number.isFinite(snapshot.bounds.top)
    ? {
        left: Number(snapshot.bounds.left) || 0,
        top: Number(snapshot.bounds.top) || 0,
        right: Number(snapshot.bounds.right || (Number(snapshot.bounds.left) || 0) + (Number(snapshot.bounds.width) || 0)) || 0,
        bottom: Number(snapshot.bounds.bottom || (Number(snapshot.bounds.top) || 0) + (Number(snapshot.bounds.height) || 0)) || 0,
        width: Math.max(1, Number(snapshot.bounds.width) || 1),
        height: Math.max(1, Number(snapshot.bounds.height) || 1),
      }
    : null;
  if (!bounds || !items.length) {
    return {
      ok: false,
      canceled: false,
      code: "TILE_EXPORT_EMPTY",
      message: "当前画布没有可导出的内容",
      tiles: [],
      tileCount: 0,
    };
  }

  const scale = Math.max(0.1, Number(options.scale) || 1);
  const tileSize = Math.max(256, roundPositiveInt(options.tileSize, 1024));
  const plan = getTilePlan(bounds, tileSize);
  const originLeft = Number(bounds.left || 0) || 0;
  const originTop = Number(bounds.top || 0) || 0;
  const tiles = [];
  let tileIndex = 0;
  let exportImageFallbackCount = 0;

  for (let row = 0; row < plan.tileCountY; row += 1) {
    if (options?.signal?.aborted) {
      return createCanceledTileResult();
    }
    const top = plan.top + row * tileSize;
    const bottom = Math.min(plan.bottom, top + tileSize);
    for (let column = 0; column < plan.tileCountX; column += 1) {
      if (options?.signal?.aborted) {
        return createCanceledTileResult();
      }
      const left = plan.left + column * tileSize;
      const right = Math.min(plan.right, left + tileSize);
      const tileBounds = createTileBounds(left, top, right, bottom);
      const renderResult = renderExportBoardToCanvas(items, {
        renderer: options.renderer,
        getElementBounds: options.getElementBounds,
        getFlowEdgeBounds: options.getFlowEdgeBounds,
        allowLocalFileAccess: options.allowLocalFileAccess !== false,
        backgroundFill: options.backgroundFill ?? "transparent",
        backgroundGrid: Boolean(options.backgroundGrid),
        backgroundPattern: options.backgroundPattern,
        renderTextInCanvas: options.renderTextInCanvas !== false,
        minPadding: 0,
        paddingRatio: 0,
        scale,
        documentRef: options.documentRef,
        devicePixelRatio: options.devicePixelRatio ?? 1,
        allowUnsafeSize: true,
        exportBounds: tileBounds,
      });
      if (!renderResult?.canvas) {
        return {
          ok: false,
          canceled: false,
          code: renderResult?.errorCode || "TILE_EXPORT_RENDER_FAILED",
          message: renderResult?.errorMessage || "分块导出失败",
          tiles: [],
          tileCount: 0,
        };
      }
      const bytes = await createTileCanvasBytes(renderResult.canvas);
      if (options?.signal?.aborted) {
        return createCanceledTileResult();
      }
      if (!bytes) {
        return {
          ok: false,
          canceled: false,
          code: "TILE_EXPORT_CANVAS_FAILED",
          message: "分块导出失败：画布无法转为 PNG",
          tiles: [],
          tileCount: 0,
        };
      }
      exportImageFallbackCount = Math.max(
        exportImageFallbackCount,
        Math.max(0, Number(renderResult?.exportImageFallbackCount || 0) || 0)
      );
      tiles.push({
        index: tileIndex,
        row,
        column,
        left: tileBounds.left,
        top: tileBounds.top,
        width: tileBounds.width,
        height: tileBounds.height,
        pixelLeft: Math.round((tileBounds.left - originLeft) * scale),
        pixelTop: Math.round((tileBounds.top - originTop) * scale),
        pixelWidth: Math.round(tileBounds.width * scale),
        pixelHeight: Math.round(tileBounds.height * scale),
        bytes: new Uint8Array(bytes),
      });
      tileIndex += 1;
      if (typeof options.onProgress === "function") {
        await options.onProgress({
          type: "tile",
          tileIndex,
          tileCount: plan.tileCount,
          left: tileBounds.left,
          top: tileBounds.top,
          width: tileBounds.width,
          height: tileBounds.height,
        });
      }
    }
  }

  return {
    ok: true,
    canceled: false,
    code: "TILE_EXPORT_OK",
    message: "分块导出已完成",
    bounds,
    width: bounds.width,
    height: bounds.height,
    pixelWidth: Math.round(bounds.width * scale),
    pixelHeight: Math.round(bounds.height * scale),
    scaleApplied: scale,
    tileSize,
    tileCount: tiles.length,
    tiles,
    exportImageFallbackCount,
  };
}
