import { sceneToScreen } from "./camera.js";
import { getElementBounds } from "./elements/index.js";
import { createByteBudgetLru } from "./perf/byteBudgetLru.js";

const DEFAULT_NEAR_MARGIN = 220;
const MAX_PATTERN_CACHE_SIZE = 48;
const MAX_PATTERN_CACHE_BYTES = 8 * 1024 * 1024;

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

const BACKGROUND_WORLD_STEP = 18;
const MIN_BACKGROUND_SCREEN_STEP = 8;

export function getBackgroundPatternGeometry(view = {}, patternType = "dots") {
  const requestedScale = Number(view.scale);
  const scale = Number.isFinite(requestedScale) && requestedScale > 0 ? requestedScale : 1;
  let worldStep = BACKGROUND_WORLD_STEP * (patternType === "lines" ? 1.6 : 1);
  // Thin the original world lattice instead of clamping the camera scale.
  if (worldStep * scale < MIN_BACKGROUND_SCREEN_STEP) {
    worldStep *= 2 ** Math.ceil(Math.log2(MIN_BACKGROUND_SCREEN_STEP / (worldStep * scale)));
  }
  const step = worldStep * scale;
  const period = step * (patternType === "engineering" ? 5 : 1);
  const phase = (value, interval) => ((Number(value || 0) % interval) + interval) % interval;
  return {
    step,
    period,
    offsetX: phase(view.offsetX, period),
    offsetY: phase(view.offsetY, period),
  };
}

function drawPatternLines(ctx, width, height, step, offsetX, offsetY, horizontalOnly = false) {
  ctx.beginPath();
  if (!horizontalOnly) {
    for (let x = offsetX - step; x <= width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
  }
  for (let y = offsetY - step; y <= height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

function drawBackgroundPatternGeometry(ctx, width, height, geometry, patternType) {
  const { step, period, offsetX, offsetY } = geometry;
  if (patternType === "dots") {
    ctx.fillStyle = "rgba(76, 110, 245, 0.18)";
    for (let x = offsetX - step; x < width; x += step) {
      for (let y = offsetY - step; y < height; y += step) {
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    }
  } else if (patternType === "grid" || patternType === "lines" || patternType === "engineering") {
    ctx.lineWidth = 1;
    ctx.strokeStyle = patternType === "grid" ? "rgba(76, 110, 245, 0.16)"
      : patternType === "lines" ? "rgba(76, 110, 245, 0.14)" : "rgba(76, 110, 245, 0.08)";
    drawPatternLines(ctx, width, height, step, offsetX % step, offsetY % step, patternType === "lines");
    if (patternType === "engineering") {
      ctx.strokeStyle = "rgba(37, 99, 235, 0.16)";
      drawPatternLines(ctx, width, height, period, offsetX, offsetY);
    }
  }
}

export function drawBackgroundPatternFallback(ctx, width, height, view, patternType) {
  drawBackgroundPatternGeometry(ctx, width, height, getBackgroundPatternGeometry(view, patternType), patternType);
}

function buildPatternTile(patternType, size, rasterDpr) {
  const tile = createPatternCanvas(size, size);
  const ctx = tile?.getContext("2d");
  if (!ctx) return null;
  const period = size / rasterDpr;
  ctx.setTransform(rasterDpr, 0, 0, rasterDpr, 0, 0);
  // Tile periods may be rounded for caching; the pattern matrix restores their exact world size.
  const geometry = { step: period / (patternType === "engineering" ? 5 : 1), period, offsetX: 0, offsetY: 0 };
  drawBackgroundPatternGeometry(ctx, period, period, geometry, patternType);
  return tile;
}

export function createBackgroundPatternCache() {
  const cache = createByteBudgetLru({
    maxEntries: MAX_PATTERN_CACHE_SIZE,
    maxBytes: MAX_PATTERN_CACHE_BYTES,
    estimateSize: (entry) => Number(entry?.byteSize || 0) || 0,
  });
  let hits = 0;
  let misses = 0;

  function getPattern(ctx, patternType, period) {
    const transform = ctx.getTransform?.();
    const rasterDpr = Math.max(1, Math.hypot(Number(transform?.a || 1), Number(transform?.b || 0)));
    const tileSize = Math.max(1, Math.min(patternType === "engineering" ? 2048 : 1024, Math.round(period * rasterDpr)));
    const key = `${patternType}|${tileSize}|${rasterDpr}`;
    const cached = cache.get(key);
    if (cached) {
      hits += 1;
      return cached;
    }
    const tile = buildPatternTile(patternType, tileSize, rasterDpr);
    if (!tile) return null;
    const pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) return null;
    const entry = { pattern, tileSize, byteSize: tile.width * tile.height * 4 };
    cache.set(key, entry);
    misses += 1;
    return entry;
  }

  return {
    draw(ctx, width, height, view, patternType) {
      if (!["dots", "grid", "lines", "engineering"].includes(patternType)) return false;
      const geometry = getBackgroundPatternGeometry(view, patternType);
      const entry = getPattern(ctx, patternType, geometry.period);
      if (!entry) return false;
      const ratio = geometry.period / entry.tileSize;
      ctx.save();
      if (typeof entry.pattern.setTransform === "function") {
        entry.pattern.setTransform({ a: ratio, b: 0, c: 0, d: ratio, e: geometry.offsetX, f: geometry.offsetY });
        ctx.fillStyle = entry.pattern;
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.translate(geometry.offsetX, geometry.offsetY);
        ctx.scale(ratio, ratio);
        ctx.fillStyle = entry.pattern;
        ctx.fillRect(-geometry.offsetX / ratio, -geometry.offsetY / ratio, width / ratio, height / ratio);
      }
      ctx.restore();
      return true;
    },
    getStats() {
      const stats = cache.getStats();
      return { ...stats, cacheSize: stats.size, cacheHits: hits, cacheMisses: misses };
    },
    trimToBytes(maxBytes) {
      return cache.trimToBytes(maxBytes);
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
