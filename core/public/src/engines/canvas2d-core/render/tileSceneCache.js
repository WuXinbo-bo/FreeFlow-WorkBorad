import { getSceneViewportBounds, querySceneIndex } from "../scene/sceneIndex.js";

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

function getScaleBucket(scale = 1) {
  return Math.max(0.1, Math.round((Number(scale || 1) || 1) * 1000) / 1000);
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

export function createTileSceneCache({ tileSize = 1024, maxEntries = 96 } = {}) {
  const cache = new Map();
  const lastBoundsById = new Map();

  function getExcludeSignature(excludeIds = []) {
    return normalizeIds(excludeIds).sort().join(",");
  }

  function getTileKey(sceneKey, scaleBucket, tileX, tileY, excludeIds = []) {
    return `${sceneKey}|${scaleBucket}|${tileX}|${tileY}|${getExcludeSignature(excludeIds)}`;
  }

  function touchEntry(key, entry) {
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      cache.delete(oldestKey);
    }
  }

  function getTileRangeForBounds(bounds) {
    if (!bounds) {
      return null;
    }
    return {
      tileXMin: Math.floor(Number(bounds.left || 0) / tileSize),
      tileXMax: Math.floor(Number(bounds.right || 0) / tileSize),
      tileYMin: Math.floor(Number(bounds.top || 0) / tileSize),
      tileYMax: Math.floor(Number(bounds.bottom || 0) / tileSize),
    };
  }

  function collectTileCoordKeysForBounds(bounds, target = new Set()) {
    const range = getTileRangeForBounds(bounds);
    if (!range) {
      return target;
    }
    for (let tileX = range.tileXMin; tileX <= range.tileXMax; tileX += 1) {
      for (let tileY = range.tileYMin; tileY <= range.tileYMax; tileY += 1) {
        target.add(getTileCoordKey(tileX, tileY));
      }
    }
    return target;
  }

  function invalidateTilesForBounds(sceneKey, bounds) {
    const range = getTileRangeForBounds(bounds);
    if (!range) {
      return { invalidated: 0, tileCoordKeys: new Set() };
    }
    let invalidated = 0;
    const tileCoordKeys = new Set();
    for (let tileX = range.tileXMin; tileX <= range.tileXMax; tileX += 1) {
      for (let tileY = range.tileYMin; tileY <= range.tileYMax; tileY += 1) {
        tileCoordKeys.add(getTileCoordKey(tileX, tileY));
      }
    }
    for (const key of Array.from(cache.keys())) {
      const [entrySceneKey, , tileXRaw, tileYRaw] = String(key || "").split("|");
      if (entrySceneKey !== sceneKey) {
        continue;
      }
      const tileX = Number(tileXRaw);
      const tileY = Number(tileYRaw);
      if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
        continue;
      }
      if (
        tileX >= range.tileXMin &&
        tileX <= range.tileXMax &&
        tileY >= range.tileYMin &&
        tileY <= range.tileYMax
      ) {
        if (cache.delete(key)) {
          invalidated += 1;
        }
      }
    }
    return { invalidated, tileCoordKeys };
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
    const tileCoordKeys = new Set();
    normalizedItemIds.forEach((itemId) => {
      const previousBounds = lastBoundsById.get(itemId) || null;
      const currentBounds = sceneIndex?.recordById?.get(itemId)?.queryBounds || null;
      if (previousBounds) {
        const result = invalidateTilesForBounds(sceneKey, previousBounds);
        invalidated += result.invalidated;
        result.tileCoordKeys.forEach((key) => tileCoordKeys.add(key));
      }
      if (currentBounds) {
        const result = invalidateTilesForBounds(sceneKey, currentBounds);
        invalidated += result.invalidated;
        result.tileCoordKeys.forEach((key) => tileCoordKeys.add(key));
      }
    });
    syncBoundsSnapshot(sceneIndex, normalizedItemIds);
    return { invalidated, tileCoordKeys };
  }

  function renderTile({
    sceneKey,
    sceneIndex,
    tileX,
    tileY,
    scale,
    excludeIds,
    drawItems,
  }) {
    const tileBounds = getTileBounds(tileX, tileY, tileSize);
    const records = querySceneIndex(sceneIndex, tileBounds, { excludeIds }).sort((a, b) => a.itemIndex - b.itemIndex);
    const renderWidth = Math.max(1, Math.ceil(tileBounds.width * scale));
    const renderHeight = Math.max(1, Math.ceil(tileBounds.height * scale));
    const tileCanvas = createRenderCanvas(renderWidth, renderHeight);
    const tileCtx = tileCanvas?.getContext?.("2d");
    if (!tileCanvas || !tileCtx) {
      return null;
    }
    tileCtx.clearRect(0, 0, renderWidth, renderHeight);
    const tileView = {
      scale,
      offsetX: -tileBounds.left * scale,
      offsetY: -tileBounds.top * scale,
    };
    const drawStats =
      drawItems({
      ctx: tileCtx,
      items: records.map((record) => record.item),
      view: tileView,
    }) || null;
    const entry = {
      canvas: tileCanvas,
      tileBounds,
      tileX,
      tileY,
      itemCount: records.length,
      drawStats: drawStats && typeof drawStats === "object" ? { ...drawStats } : null,
    };
    touchEntry(getTileKey(sceneKey, getScaleBucket(scale), tileX, tileY, excludeIds), entry);
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
      };
    }
    const scale = Math.max(0.1, Number(view?.scale || 1) || 1);
    const scaleBucket = getScaleBucket(scale);
    const normalizedExcludeIds = normalizeIds(excludeIds);
    const normalizedDirtyItemIds = normalizeIds(dirtyItemIds);
    let invalidatedTiles = 0;
    let dirtyTileCoordKeys = new Set();
    if (!lastBoundsById.size) {
      syncBoundsSnapshot(sceneIndex);
    }
    if (sceneChanged) {
      if (normalizedDirtyItemIds.length) {
        const result = invalidateByDirtyItems(sceneIndex, sceneKey, normalizedDirtyItemIds);
        invalidatedTiles += result.invalidated;
        dirtyTileCoordKeys = result.tileCoordKeys;
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
    const tileXMin = Math.floor(viewportBounds.left / tileSize);
    const tileXMax = Math.floor(viewportBounds.right / tileSize);
    const tileYMin = Math.floor(viewportBounds.top / tileSize);
    const tileYMax = Math.floor(viewportBounds.bottom / tileSize);
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
    const coldTileBudget = Number.isFinite(Number(maxColdTiles))
      ? Math.max(0, Math.floor(Number(maxColdTiles)))
      : Infinity;

    const tileDescriptors = [];
    for (let tileX = tileXMin; tileX <= tileXMax; tileX += 1) {
      for (let tileY = tileYMin; tileY <= tileYMax; tileY += 1) {
        tileCount += 1;
        const tileBounds = getTileBounds(tileX, tileY, tileSize);
        const tileCoordKey = getTileCoordKey(tileX, tileY);
        const isDirtyVisibleTile = dirtyTileCoordKeys.has(tileCoordKey);
        const tier = getTileTier(tileBounds, primaryViewportBounds, preloadViewportBounds);
        const isPrimaryTile = tier === "primary";
        tileDescriptors.push({
          tileX,
          tileY,
          tileBounds,
          tileCoordKey,
          isDirtyVisibleTile,
          isPrimaryTile,
          tier,
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
        const key = getTileKey(sceneKey, scaleBucket, tileX, tileY, normalizedExcludeIds);
        let entry = cache.get(key) || null;
        if (entry) {
          cacheHits += 1;
          reusedVisibleTiles += 1;
          touchEntry(key, entry);
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
            scale: scaleBucket,
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
  };
}
