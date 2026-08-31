import { getSceneViewportBounds, querySceneIndex } from "../scene/sceneIndex.js";
import { createByteBudgetLru } from "../perf/byteBudgetLru.js";

function createRenderCanvas(width, height) {
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

const SCALE_LEVELS_PER_OCTAVE = 8;
const DEFAULT_TILE_PIXEL_SIZE = 1024;
const DEFAULT_TILE_CACHE_BYTES = 128 * 1024 * 1024;

export function resolveTileScaleLevel(scale = 1, { exact = false } = {}) {
  const normalizedScale = Math.max(0.1, Number(scale || 1) || 1);
  if (exact) {
    return Math.round(normalizedScale * 1000) / 1000;
  }
  const level = Math.ceil(Math.log2(normalizedScale) * SCALE_LEVELS_PER_OCTAVE);
  return Math.max(0.1, Math.round((2 ** (level / SCALE_LEVELS_PER_OCTAVE)) * 1_000_000) / 1_000_000);
}

export function resolveTileSceneSize(rasterScale = 1, tilePixelSize = DEFAULT_TILE_PIXEL_SIZE) {
  const normalizedScale = Math.max(0.1, Number(rasterScale) || 1);
  const normalizedPixelSize = Math.max(128, Number(tilePixelSize) || DEFAULT_TILE_PIXEL_SIZE);
  return normalizedPixelSize / normalizedScale;
}

function getTileBounds(tileX, tileY, tileSize) {
  const left = tileX * tileSize;
  const top = tileY * tileSize;
  return {
    left,
    top,
    right: left + tileSize,
    bottom: top + tileSize,
    width: tileSize,
    height: tileSize,
  };
}

function normalizeIds(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function getTileCoordKey(tileX, tileY) {
  return `${tileX}:${tileY}`;
}

function getTileDistanceToBoundsCenter(tileBounds, bounds) {
  if (!tileBounds || !bounds) {
    return 0;
  }
  const tileCenterX = Number(tileBounds.left || 0) + Number(tileBounds.width || 0) / 2;
  const tileCenterY = Number(tileBounds.top || 0) + Number(tileBounds.height || 0) / 2;
  const boundsCenterX = Number(bounds.left || 0) + Number(bounds.width || 0) / 2;
  const boundsCenterY = Number(bounds.top || 0) + Number(bounds.height || 0) / 2;
  return Math.abs(tileCenterX - boundsCenterX) + Math.abs(tileCenterY - boundsCenterY);
}

function normalizeViewportPrediction(prediction = null) {
  if (!prediction?.active) {
    return null;
  }
  const velocityX = Number(prediction.velocityX || 0);
  const velocityY = Number(prediction.velocityY || 0);
  const speed = Math.hypot(velocityX, velocityY);
  if (!Number.isFinite(speed) || speed <= 0.0001) {
    return null;
  }
  const centerX = Number(prediction.centerX || 0);
  const centerY = Number(prediction.centerY || 0);
  const predictedCenterX = Number(prediction.predictedCenterX ?? centerX);
  const predictedCenterY = Number(prediction.predictedCenterY ?? centerY);
  if (![centerX, centerY, predictedCenterX, predictedCenterY].every(Number.isFinite)) {
    return null;
  }
  return {
    unitX: velocityX / speed,
    unitY: velocityY / speed,
    centerX,
    centerY,
    predictedCenterX,
    predictedCenterY,
  };
}

function getTilePredictionMetrics(tileBounds, prediction, tileSize) {
  if (!tileBounds || !prediction) {
    return {
      frontBucket: 1,
      projection: 0,
      predictedDistance: 0,
    };
  }
  const tileCenterX = Number(tileBounds.left || 0) + Number(tileBounds.width || 0) / 2;
  const tileCenterY = Number(tileBounds.top || 0) + Number(tileBounds.height || 0) / 2;
  const deltaX = tileCenterX - prediction.centerX;
  const deltaY = tileCenterY - prediction.centerY;
  const projection = deltaX * prediction.unitX + deltaY * prediction.unitY;
  const sideBand = Math.max(64, Number(tileSize || 1024) * 0.22);
  const frontBucket = projection > sideBand ? 0 : projection < -sideBand ? 2 : 1;
  return {
    frontBucket,
    projection,
    predictedDistance:
      Math.abs(tileCenterX - prediction.predictedCenterX) + Math.abs(tileCenterY - prediction.predictedCenterY),
  };
}

function intersectsBounds(a, b) {
  if (!a || !b) {
    return false;
  }
  return !(
    Number(a.right || 0) < Number(b.left || 0) ||
    Number(a.left || 0) > Number(b.right || 0) ||
    Number(a.bottom || 0) < Number(b.top || 0) ||
    Number(a.top || 0) > Number(b.bottom || 0)
  );
}

function getTileTier(tileBounds, primaryBounds, preloadBounds) {
  if (intersectsBounds(tileBounds, primaryBounds)) {
    return "primary";
  }
  if (intersectsBounds(tileBounds, preloadBounds)) {
    return "preload";
  }
  return "overscan";
}

function createTileDrawable(canvas) {
  if (!canvas || typeof canvas.transferToImageBitmap !== "function") return canvas;
  try {
    return canvas.transferToImageBitmap();
  } catch {
    return canvas;
  }
}

function disposeTileEntry(entry) {
  if (entry?.canvas && typeof entry.canvas.close === "function") {
    entry.canvas.close();
  }
}

export function createTileSceneCache({
  tileSize = DEFAULT_TILE_PIXEL_SIZE,
  maxEntries = 96,
  maxBytes = DEFAULT_TILE_CACHE_BYTES,
} = {}) {
  const cache = createByteBudgetLru({
    maxEntries,
    maxBytes,
    estimateSize: (entry) => Number(entry?.byteSize || 0) || 0,
    onEvict: disposeTileEntry,
  });
  const lastBoundsById = new Map();

  function getExcludeSignature(excludeIds = []) {
    return normalizeIds(excludeIds).sort().join(",");
  }

  function getTileKey(sceneKey, scaleBucket, tileX, tileY, excludeIds = []) {
    return `${sceneKey}|${scaleBucket}|${tileX}|${tileY}|${getExcludeSignature(excludeIds)}`;
  }

  function invalidateTilesForBounds(sceneKey, bounds) {
    if (!bounds) return 0;
    let invalidated = 0;
    for (const [key, entry] of Array.from(cache.entries())) {
      if (entry?.sceneKey !== sceneKey || !intersectsBounds(entry?.tileBounds, bounds)) continue;
      if (cache.delete(key)) invalidated += 1;
    }
    return invalidated;
  }

  function syncBoundsSnapshot(sceneIndex, itemIds = []) {
    const normalizedItemIds = normalizeIds(itemIds);
    if (!normalizedItemIds.length) {
      lastBoundsById.clear();
      (Array.isArray(sceneIndex?.records) ? sceneIndex.records : []).forEach((record) => {
        if (record?.itemId && record?.queryBounds) {
          lastBoundsById.set(record.itemId, { ...record.queryBounds });
        }
      });
      return;
    }
    normalizedItemIds.forEach((itemId) => {
      const record = sceneIndex?.recordById?.get(itemId) || null;
      if (record?.queryBounds) {
        lastBoundsById.set(itemId, { ...record.queryBounds });
      } else {
        lastBoundsById.delete(itemId);
      }
    });
  }

  function invalidateByDirtyItems(sceneIndex, sceneKey, dirtyItemIds = []) {
    const normalizedItemIds = normalizeIds(dirtyItemIds);
    let invalidated = 0;
    const dirtyBounds = [];
    normalizedItemIds.forEach((itemId) => {
      const previousBounds = lastBoundsById.get(itemId) || null;
      const currentBounds = sceneIndex?.recordById?.get(itemId)?.queryBounds || null;
      if (previousBounds) {
        dirtyBounds.push(previousBounds);
        invalidated += invalidateTilesForBounds(sceneKey, previousBounds);
      }
      if (currentBounds) {
        dirtyBounds.push(currentBounds);
        invalidated += invalidateTilesForBounds(sceneKey, currentBounds);
      }
    });
    syncBoundsSnapshot(sceneIndex, normalizedItemIds);
    return { invalidated, dirtyBounds };
  }

  function renderTile({
    sceneKey,
    sceneIndex,
    tileX,
    tileY,
    rasterScale,
    sceneTileSize,
    scaleKey,
    excludeIds,
    drawItems,
  }) {
    const tileBounds = getTileBounds(tileX, tileY, sceneTileSize);
    const records = querySceneIndex(sceneIndex, tileBounds, { excludeIds }).sort((a, b) => a.itemIndex - b.itemIndex);
    const renderWidth = Math.max(1, Math.ceil(tileBounds.width * rasterScale));
    const renderHeight = Math.max(1, Math.ceil(tileBounds.height * rasterScale));
    const tileCanvas = createRenderCanvas(renderWidth, renderHeight);
    const tileCtx = tileCanvas?.getContext?.("2d");
    if (!tileCanvas || !tileCtx) {
      return null;
    }
    tileCtx.clearRect(0, 0, renderWidth, renderHeight);
    const tileView = {
      scale: rasterScale,
      offsetX: -tileBounds.left * rasterScale,
      offsetY: -tileBounds.top * rasterScale,
    };
    const drawStats =
      drawItems({
      ctx: tileCtx,
      items: records.map((record) => record.item),
      view: tileView,
    }) || null;
    const entry = {
      canvas: createTileDrawable(tileCanvas),
      sceneKey,
      tileBounds,
      tileX,
      tileY,
      itemCount: records.length,
      byteSize: renderWidth * renderHeight * 4,
      drawStats: drawStats && typeof drawStats === "object" ? { ...drawStats } : null,
    };
    cache.set(getTileKey(sceneKey, scaleKey, tileX, tileY, excludeIds), entry);
    return entry;
  }

  function draw({
    ctx,
    sceneIndex,
    sceneKey,
    view,
    viewportWidth,
    viewportHeight,
    excludeIds = [],
    sceneChanged = false,
    dirtyItemIds = [],
    maxColdTiles = Infinity,
    viewportMarginPx = null,
    preloadMarginPx = null,
    overscanMarginPx = null,
    viewportPrediction = null,
    preferExactScale = false,
    drawItems,
  }) {
    if (!sceneIndex || !ctx || !sceneKey || typeof drawItems !== "function") {
      return {
        tileCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
        invalidatedTiles: 0,
        reusedVisibleTiles: 0,
        rerasterizedDirtyTiles: 0,
        coldRenderedTiles: 0,
        dirtyVisibleTiles: 0,
        predictedPreloadTiles: 0,
        cacheByteSize: cache.byteSize,
        cacheMaxBytes: cache.getStats().maxBytes,
      };
    }
    const scale = Math.max(0.1, Number(view?.scale || 1) || 1);
    const rasterScale = resolveTileScaleLevel(scale, { exact: preferExactScale });
    const sceneTileSize = resolveTileSceneSize(rasterScale, tileSize);
    const scaleMode = preferExactScale ? "exact" : "bucket";
    const scaleKey = `${scaleMode}:${rasterScale}`;
    const normalizedExcludeIds = normalizeIds(excludeIds);
    const normalizedDirtyItemIds = normalizeIds(dirtyItemIds);
    let invalidatedTiles = 0;
    let dirtyBounds = [];
    if (!lastBoundsById.size) {
      syncBoundsSnapshot(sceneIndex);
    }
    if (sceneChanged) {
      if (normalizedDirtyItemIds.length) {
        const result = invalidateByDirtyItems(sceneIndex, sceneKey, normalizedDirtyItemIds);
        invalidatedTiles += result.invalidated;
        dirtyBounds = result.dirtyBounds;
      } else {
        invalidatedTiles = cache.size;
        cache.clear();
        syncBoundsSnapshot(sceneIndex);
      }
    }
    const primaryViewportBounds = getSceneViewportBounds(view, viewportWidth, viewportHeight, 0);
    const resolvedPreloadMarginPx = preloadMarginPx == null
      ? Math.max(tileSize * scale * 0.08, tileSize * 0.35)
      : Math.max(0, Number(preloadMarginPx || 0) || 0);
    const resolvedOverscanMarginPx = overscanMarginPx == null
      ? (viewportMarginPx == null ? tileSize * scale * 0.1 : Math.max(0, Number(viewportMarginPx || 0) || 0))
      : Math.max(resolvedPreloadMarginPx, Number(overscanMarginPx || 0) || 0);
    const preloadViewportBounds = getSceneViewportBounds(view, viewportWidth, viewportHeight, resolvedPreloadMarginPx);
    const viewportBounds = getSceneViewportBounds(view, viewportWidth, viewportHeight, resolvedOverscanMarginPx);
    const tileXMin = Math.floor(viewportBounds.left / sceneTileSize);
    const tileXMax = Math.floor(viewportBounds.right / sceneTileSize);
    const tileYMin = Math.floor(viewportBounds.top / sceneTileSize);
    const tileYMax = Math.floor(viewportBounds.bottom / sceneTileSize);
    let tileCount = 0;
    let cacheHits = 0;
    let cacheMisses = 0;
    let reusedVisibleTiles = 0;
    let rerasterizedDirtyTiles = 0;
    let coldRenderedTiles = 0;
    let dirtyVisibleTiles = 0;
    let lodSimplifiedCount = 0;
    let customRendererHandledCount = 0;
    let deferredColdTiles = 0;
    let predictedPreloadTiles = 0;
    const coldTileBudget = Number.isFinite(Number(maxColdTiles))
      ? Math.max(0, Math.floor(Number(maxColdTiles)))
      : Infinity;
    const normalizedPrediction = normalizeViewportPrediction(viewportPrediction);

    const tileDescriptors = [];
    for (let tileX = tileXMin; tileX <= tileXMax; tileX += 1) {
      for (let tileY = tileYMin; tileY <= tileYMax; tileY += 1) {
        tileCount += 1;
        const tileBounds = getTileBounds(tileX, tileY, sceneTileSize);
        const tileCoordKey = getTileCoordKey(tileX, tileY);
        const isDirtyVisibleTile = dirtyBounds.some((bounds) => intersectsBounds(tileBounds, bounds));
        const tier = getTileTier(tileBounds, primaryViewportBounds, preloadViewportBounds);
        const isPrimaryTile = tier === "primary";
        const predictionMetrics = getTilePredictionMetrics(tileBounds, normalizedPrediction, sceneTileSize);
        if (normalizedPrediction && tier !== "primary" && predictionMetrics.frontBucket === 0) {
          predictedPreloadTiles += 1;
        }
        tileDescriptors.push({
          tileX,
          tileY,
          tileBounds,
          tileCoordKey,
          isDirtyVisibleTile,
          isPrimaryTile,
          tier,
          frontBucket: predictionMetrics.frontBucket,
          predictedDistance: predictionMetrics.predictedDistance,
          projection: predictionMetrics.projection,
          distance: getTileDistanceToBoundsCenter(tileBounds, primaryViewportBounds),
        });
      }
    }
    tileDescriptors.sort((a, b) => {
      const tierWeight = { primary: 0, preload: 1, overscan: 2 };
      if (tierWeight[a.tier] !== tierWeight[b.tier]) {
        return tierWeight[a.tier] - tierWeight[b.tier];
      }
      if (a.isDirtyVisibleTile !== b.isDirtyVisibleTile) {
        return a.isDirtyVisibleTile ? -1 : 1;
      }
      if (normalizedPrediction && a.tier !== "primary" && b.tier !== "primary") {
        if (a.frontBucket !== b.frontBucket) {
          return a.frontBucket - b.frontBucket;
        }
        if (a.predictedDistance !== b.predictedDistance) {
          return a.predictedDistance - b.predictedDistance;
        }
        if (a.projection !== b.projection) {
          return b.projection - a.projection;
        }
      }
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      if (a.tileY !== b.tileY) {
        return a.tileY - b.tileY;
      }
      return a.tileX - b.tileX;
    });

    for (const descriptor of tileDescriptors) {
      const {
        tileX,
        tileY,
        tileCoordKey,
        isDirtyVisibleTile,
        isPrimaryTile,
        tier,
      } = descriptor;
      if (isDirtyVisibleTile) {
        dirtyVisibleTiles += 1;
      }
      const key = getTileKey(sceneKey, scaleKey, tileX, tileY, normalizedExcludeIds);
      let entry = cache.get(key) || null;
      if (entry) {
        cacheHits += 1;
        reusedVisibleTiles += 1;
      } else {
        cacheMisses += 1;
        if (tier === "overscan" && coldRenderedTiles >= coldTileBudget) {
          deferredColdTiles += 1;
          continue;
        }
        if (isDirtyVisibleTile) {
          rerasterizedDirtyTiles += 1;
        } else {
          if (tier !== "primary") {
            coldRenderedTiles += 1;
          }
        }
        entry = renderTile({
          sceneKey,
          sceneIndex,
          tileX,
          tileY,
          rasterScale,
          sceneTileSize,
          scaleKey,
          excludeIds: normalizedExcludeIds,
          drawItems,
        });
      }
      if (!entry?.canvas) {
        continue;
      }
      lodSimplifiedCount += Math.max(0, Number(entry?.drawStats?.lodSimplifiedCount || 0) || 0);
      customRendererHandledCount += Math.max(0, Number(entry?.drawStats?.customRendererHandledCount || 0) || 0);
      const screenX = entry.tileBounds.left * scale + Number(view?.offsetX || 0);
      const screenY = entry.tileBounds.top * scale + Number(view?.offsetY || 0);
      const drawWidth = entry.tileBounds.width * scale;
      const drawHeight = entry.tileBounds.height * scale;
      ctx.drawImage(entry.canvas, screenX, screenY, drawWidth, drawHeight);
    }

    return {
      tileCount,
      cacheHits,
      cacheMisses,
      invalidatedTiles,
      reusedVisibleTiles,
      rerasterizedDirtyTiles,
      coldRenderedTiles,
      dirtyVisibleTiles,
      lodSimplifiedCount,
      customRendererHandledCount,
      deferredColdTiles,
      hasDeferredColdTiles: deferredColdTiles > 0,
      predictedPreloadTiles,
      scaleMode,
      requestedScale: scale,
      rasterScale,
      sceneTileSize,
      tilePixelSize: tileSize,
      cacheByteSize: cache.byteSize,
      cacheMaxBytes: cache.getStats().maxBytes,
      cacheEvictionCount: cache.getStats().evictionCount,
    };
  }

  return {
    draw,
    clear() {
      cache.clear();
      lastBoundsById.clear();
    },
    getSize() {
      return cache.size;
    },
    getStats() {
      return cache.getStats();
    },
    trimToBytes(maxBytes) {
      return cache.trimToBytes(maxBytes);
    },
  };
}
