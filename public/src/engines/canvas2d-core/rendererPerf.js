import { sceneToScreen } from "./camera.js";
import { getElementBounds } from "./elements/index.js";

const DEFAULT_NEAR_MARGIN = 220;
const MAX_PATTERN_CACHE_SIZE = 48;

function createPatternCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function drawDotsTile(ctx, size) {
  ctx.fillStyle = "rgba(76, 110, 245, 0.18)";
  ctx.fillRect(0, 0, 1.6, 1.6);
}

function drawGridTile(ctx, size) {
  ctx.strokeStyle = "rgba(76, 110, 245, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0.5, 0);
  ctx.lineTo(0.5, size);
  ctx.moveTo(0, 0.5);
  ctx.lineTo(size, 0.5);
  ctx.stroke();
}

function drawLinesTile(ctx, size) {
  ctx.strokeStyle = "rgba(76, 110, 245, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.lineTo(size, 0.5);
  ctx.stroke();
}

function drawEngineeringTile(ctx, minorStep, majorStep) {
  ctx.strokeStyle = "rgba(76, 110, 245, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0.5; x <= majorStep; x += minorStep) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, majorStep);
  }
  for (let y = 0.5; y <= majorStep; y += minorStep) {
    ctx.moveTo(0, y);
    ctx.lineTo(majorStep, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(37, 99, 235, 0.16)";
  ctx.beginPath();
  ctx.moveTo(0.5, 0);
  ctx.lineTo(0.5, majorStep);
  ctx.moveTo(0, 0.5);
  ctx.lineTo(majorStep, 0.5);
  ctx.stroke();
}

function buildPatternTile(patternType, step) {
  const safeStep = Math.max(4, Number(step) || 18);
  if (patternType === "none") {
    return null;
  }
  if (patternType === "engineering") {
    const majorStep = Math.max(20, safeStep * 5);
    const tileSize = Math.max(8, Math.min(2048, Math.round(majorStep)));
    const tile = createPatternCanvas(tileSize, tileSize);
    if (!tile) {
      return null;
    }
    const tileCtx = tile.getContext("2d");
    if (!tileCtx) {
      return null;
    }
    drawEngineeringTile(tileCtx, safeStep, tileSize);
    return { tile, size: tileSize };
  }
  if (patternType === "lines") {
    const lineStep = Math.max(6, safeStep * 1.6);
    const tileSize = Math.max(8, Math.min(1024, Math.round(lineStep)));
    const tile = createPatternCanvas(tileSize, tileSize);
    if (!tile) {
      return null;
    }
    const tileCtx = tile.getContext("2d");
    if (!tileCtx) {
      return null;
    }
    drawLinesTile(tileCtx, tileSize);
    return { tile, size: tileSize };
  }
  const tileSize = Math.max(8, Math.min(1024, Math.round(safeStep)));
  const tile = createPatternCanvas(tileSize, tileSize);
  if (!tile) {
    return null;
  }
  const tileCtx = tile.getContext("2d");
  if (!tileCtx) {
    return null;
  }
  if (patternType === "dots") {
    drawDotsTile(tileCtx, tileSize);
  } else if (patternType === "grid") {
    drawGridTile(tileCtx, tileSize);
  } else {
    return null;
  }
  return { tile, size: tileSize };
}

export function createBackgroundPatternCache() {
  const cache = new Map();
  let hits = 0;
  let misses = 0;

  function getPattern(ctx, patternType, step) {
    const quantizedStep = Math.max(1, Math.round(step * 2) / 2);
    const key = `${patternType}|${quantizedStep}`;
    const cached = cache.get(key);
    if (cached) {
      hits += 1;
      return cached;
    }
    const built = buildPatternTile(patternType, quantizedStep);
    if (!built) {
      return null;
    }
    const pattern = ctx.createPattern(built.tile, "repeat");
    if (!pattern) {
      return null;
    }
    const entry = { pattern, tileSize: built.size };
    cache.set(key, entry);
    misses += 1;
    if (cache.size > MAX_PATTERN_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }
    return entry;
  }

  return {
    draw(ctx, width, height, view, patternType) {
      if (patternType === "none") {
        return false;
      }
      const scale = Math.max(0.4, Number(view?.scale) || 1);
      const step = 18 * scale;
      const entry = getPattern(ctx, patternType, step);
      if (!entry) {
        return false;
      }

      const tileSize = Math.max(1, Number(entry.tileSize) || 1);
      const rawOffsetX = Number(view?.offsetX || 0);
      const rawOffsetY = Number(view?.offsetY || 0);
      const offsetX = ((rawOffsetX % tileSize) + tileSize) % tileSize;
      const offsetY = ((rawOffsetY % tileSize) + tileSize) % tileSize;
      const pattern = entry.pattern;

      ctx.save();
      if (typeof pattern?.setTransform === "function" && typeof DOMMatrix !== "undefined") {
        const matrix = new DOMMatrix();
        matrix.e = offsetX;
        matrix.f = offsetY;
        pattern.setTransform(matrix);
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.translate(offsetX, offsetY);
        ctx.fillStyle = pattern;
        ctx.fillRect(-offsetX, -offsetY, width + tileSize, height + tileSize);
      }
      ctx.restore();
      return true;
    },
    getStats() {
      return {
        cacheSize: cache.size,
        cacheHits: hits,
        cacheMisses: misses,
      };
    },
  };
}

function toScreenRect(view, bounds) {
  const topLeft = sceneToScreen(view, { x: bounds.left, y: bounds.top });
  const bottomRight = sceneToScreen(view, { x: bounds.right, y: bounds.bottom });
  const left = Math.min(topLeft.x, bottomRight.x);
  const right = Math.max(topLeft.x, bottomRight.x);
  const top = Math.min(topLeft.y, bottomRight.y);
  const bottom = Math.max(topLeft.y, bottomRight.y);
  return {
    left,
    right,
    top,
    bottom,
  };
}

function intersectsViewport(rect, viewport, margin) {
  return !(
    rect.right < viewport.left - margin ||
    rect.left > viewport.right + margin ||
    rect.bottom < viewport.top - margin ||
    rect.top > viewport.bottom + margin
  );
}

export function createViewportCuller({ nearMargin = DEFAULT_NEAR_MARGIN } = {}) {
  const resolvedNearMargin = Math.max(0, Number(nearMargin) || DEFAULT_NEAR_MARGIN);
  return function cullItems(items, view, viewportWidth, viewportHeight, options = {}) {
    const selectedSet = new Set(options.selectedIds || []);
    const hoverId = options.hoverId || null;
    const editingId = options.editingId || null;
    const viewport = {
      left: 0,
      top: 0,
      right: Math.max(0, Number(viewportWidth) || 0),
      bottom: Math.max(0, Number(viewportHeight) || 0),
    };

    const visibleItems = [];
    let culledCount = 0;
    let forceRenderedCount = 0;

    for (const item of items || []) {
      if (!item) {
        culledCount += 1;
        continue;
      }
      if (!item.id) {
        visibleItems.push(item);
        continue;
      }
      const forceKeep = selectedSet.has(item.id) || editingId === item.id || hoverId === item.id;
      if (forceKeep) {
        visibleItems.push(item);
        forceRenderedCount += 1;
        continue;
      }
      let bounds = null;
      try {
        bounds = getElementBounds(item);
      } catch (error) {
        visibleItems.push(item);
        continue;
      }
      if (!bounds) {
        visibleItems.push(item);
        continue;
      }
      const rect = toScreenRect(view, bounds);
      if (intersectsViewport(rect, viewport, resolvedNearMargin)) {
        visibleItems.push(item);
      } else {
        culledCount += 1;
      }
    }

    return {
      items: visibleItems,
      stats: {
        totalCount: Array.isArray(items) ? items.length : 0,
        renderedCount: visibleItems.length,
        culledCount,
        forceRenderedCount,
      },
    };
  };
}
