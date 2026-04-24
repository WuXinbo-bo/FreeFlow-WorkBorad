import { getElementBounds } from "./elements/index.js";
import { getFlowNodeConnectors } from "./elements/flow.js";
import { getFileCardMemoBounds } from "./elements/fileCard.js";
import { getImageMemoBounds } from "./elements/media.js";
import { isLinearShape } from "./elements/shapes.js";

const DEFAULT_GRID_CELL_SIZE = 320;
const CACHE_GUARD_SAMPLE_SIZE = 4;

const indexCache = new WeakMap();

function clampBounds(bounds) {
  const left = Number(bounds?.left ?? 0);
  const top = Number(bounds?.top ?? 0);
  const right = Number(bounds?.right ?? left);
  const bottom = Number(bounds?.bottom ?? top);
  return {
    left: Math.min(left, right),
    top: Math.min(top, bottom),
    right: Math.max(left, right),
    bottom: Math.max(top, bottom),
  };
}

function mergeBounds(baseBounds, extraBounds) {
  if (!extraBounds) {
    return baseBounds;
  }
  return {
    left: Math.min(baseBounds.left, extraBounds.left),
    top: Math.min(baseBounds.top, extraBounds.top),
    right: Math.max(baseBounds.right, extraBounds.right),
    bottom: Math.max(baseBounds.bottom, extraBounds.bottom),
  };
}

function intersectsBounds(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function getCellRange(valueMin, valueMax, cellSize) {
  return {
    min: Math.floor(valueMin / cellSize),
    max: Math.floor(valueMax / cellSize),
  };
}

function getCellKey(cellX, cellY) {
  return `${cellX}:${cellY}`;
}

function addRecordToGrid(grid, recordIndex, bounds, cellSize) {
  const xRange = getCellRange(bounds.left, bounds.right, cellSize);
  const yRange = getCellRange(bounds.top, bounds.bottom, cellSize);
  for (let cellX = xRange.min; cellX <= xRange.max; cellX += 1) {
    for (let cellY = yRange.min; cellY <= yRange.max; cellY += 1) {
      const key = getCellKey(cellX, cellY);
      const bucket = grid.get(key);
      if (bucket) {
        bucket.push(recordIndex);
      } else {
        grid.set(key, [recordIndex]);
      }
    }
  }
}

function getGuardRefs(items) {
  const length = Math.max(0, Number(items?.length || 0));
  if (!length) {
    return [];
  }
  const sample = [];
  const step = Math.max(1, Math.floor(length / CACHE_GUARD_SAMPLE_SIZE));
  for (let i = 0; i < length && sample.length < CACHE_GUARD_SAMPLE_SIZE; i += step) {
    sample.push(items[i]);
  }
  if (sample[sample.length - 1] !== items[length - 1]) {
    sample.push(items[length - 1]);
  }
  return sample;
}

function isCacheGuardValid(index, items) {
  if (!index || !Array.isArray(items)) {
    return false;
  }
  if (index.length !== items.length) {
    return false;
  }
  const guardRefs = index.guardRefs || [];
  if (!guardRefs.length) {
    return true;
  }
  const currentRefs = getGuardRefs(items);
  if (guardRefs.length !== currentRefs.length) {
    return false;
  }
  for (let i = 0; i < guardRefs.length; i += 1) {
    if (guardRefs[i] !== currentRefs[i]) {
      return false;
    }
  }
  return true;
}

function buildFlowEdgeRecord(item, itemIndex, itemById) {
  const fromNode = itemById.get(item.fromId);
  const toNode = itemById.get(item.toId);
  if (!fromNode || !toNode) {
    return null;
  }
  const fromConnectors = getFlowNodeConnectors(fromNode);
  const toConnectors = getFlowNodeConnectors(toNode);
  const fromPoint = fromConnectors[item.fromSide] || fromConnectors.right;
  const toPoint = toConnectors[item.toSide] || toConnectors.left;
  const bounds = clampBounds({
    left: Math.min(Number(fromPoint?.x || 0), Number(toPoint?.x || 0)),
    top: Math.min(Number(fromPoint?.y || 0), Number(toPoint?.y || 0)),
    right: Math.max(Number(fromPoint?.x || 0), Number(toPoint?.x || 0)),
    bottom: Math.max(Number(fromPoint?.y || 0), Number(toPoint?.y || 0)),
  });
  return {
    itemIndex,
    itemId: item.id,
    item,
    itemType: item.type,
    baseBounds: bounds,
    queryBounds: bounds,
    geometry: {
      fromPoint,
      toPoint,
    },
  };
}

function buildLinearShapeRecord(item, itemIndex) {
  const startPoint = { x: Number(item.startX || 0), y: Number(item.startY || 0) };
  const endPoint = { x: Number(item.endX || 0), y: Number(item.endY || 0) };
  const bounds = clampBounds({
    left: Math.min(startPoint.x, endPoint.x),
    top: Math.min(startPoint.y, endPoint.y),
    right: Math.max(startPoint.x, endPoint.x),
    bottom: Math.max(startPoint.y, endPoint.y),
  });
  return {
    itemIndex,
    itemId: item.id,
    item,
    itemType: item.type,
    baseBounds: bounds,
    queryBounds: bounds,
    geometry: {
      startPoint,
      endPoint,
    },
  };
}

function buildGenericRecord(item, itemIndex) {
  const elementBounds = clampBounds(getElementBounds(item));
  let queryBounds = elementBounds;
  let memoBounds = null;
  if (item.type === "fileCard" && item.memoVisible) {
    memoBounds = clampBounds(getFileCardMemoBounds(item));
    queryBounds = mergeBounds(queryBounds, memoBounds);
  }
  if (item.type === "image" && item.memoVisible) {
    memoBounds = clampBounds(getImageMemoBounds(item));
    queryBounds = mergeBounds(queryBounds, memoBounds);
  }
  return {
    itemIndex,
    itemId: item.id,
    item,
    itemType: item.type,
    baseBounds: elementBounds,
    queryBounds,
    geometry: memoBounds ? { memoBounds } : null,
  };
}

function buildRecord(item, itemIndex, itemById) {
  if (item.type === "flowEdge") {
    return buildFlowEdgeRecord(item, itemIndex, itemById);
  }
  if (item.type === "shape" && isLinearShape(item.shapeType)) {
    return buildLinearShapeRecord(item, itemIndex);
  }
  return buildGenericRecord(item, itemIndex);
}

export function buildHitTestSpatialIndex(items, options = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const cellSize = Math.max(64, Number(options.cellSize || DEFAULT_GRID_CELL_SIZE));
  const grid = new Map();
  const records = [];
  const recordById = new Map();
  const itemById = new Map();

  for (let index = 0; index < sourceItems.length; index += 1) {
    const item = sourceItems[index];
    if (item && item.id) {
      itemById.set(item.id, item);
    }
  }

  for (let index = 0; index < sourceItems.length; index += 1) {
    const item = sourceItems[index];
    if (!item) {
      continue;
    }
    const record = buildRecord(item, index, itemById);
    if (!record) {
      continue;
    }
    const recordIndex = records.length;
    records.push(record);
    if (record.itemId) {
      recordById.set(record.itemId, record);
    }
    addRecordToGrid(grid, recordIndex, record.queryBounds, cellSize);
  }

  return {
    items: sourceItems,
    length: sourceItems.length,
    cellSize,
    grid,
    records,
    recordById,
    itemById,
    guardRefs: getGuardRefs(sourceItems),
  };
}

export function resolveHitTestSpatialIndex(items, options = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const forceRebuild = Boolean(options.forceRebuild);
  if (!sourceItems.length) {
    const emptyIndex = buildHitTestSpatialIndex(sourceItems, options);
    indexCache.set(sourceItems, emptyIndex);
    return emptyIndex;
  }
  if (!forceRebuild) {
    const cached = indexCache.get(sourceItems);
    if (cached && isCacheGuardValid(cached, sourceItems)) {
      return cached;
    }
  }
  const nextIndex = buildHitTestSpatialIndex(sourceItems, options);
  indexCache.set(sourceItems, nextIndex);
  return nextIndex;
}

export function invalidateHitTestSpatialIndex(items) {
  if (!Array.isArray(items)) {
    return false;
  }
  return indexCache.delete(items);
}

export function queryHitTestSpatialIndex(index, bounds) {
  if (!index || !index.grid || !Array.isArray(index.records)) {
    return [];
  }
  const queryBounds = clampBounds(bounds);
  const xRange = getCellRange(queryBounds.left, queryBounds.right, index.cellSize);
  const yRange = getCellRange(queryBounds.top, queryBounds.bottom, index.cellSize);
  const visited = new Set();
  const candidates = [];
  for (let cellX = xRange.min; cellX <= xRange.max; cellX += 1) {
    for (let cellY = yRange.min; cellY <= yRange.max; cellY += 1) {
      const bucket = index.grid.get(getCellKey(cellX, cellY));
      if (!bucket || !bucket.length) {
        continue;
      }
      for (let i = 0; i < bucket.length; i += 1) {
        const recordIndex = bucket[i];
        if (visited.has(recordIndex)) {
          continue;
        }
        visited.add(recordIndex);
        const record = index.records[recordIndex];
        if (!record || !intersectsBounds(record.queryBounds, queryBounds)) {
          continue;
        }
        candidates.push(record);
      }
    }
  }
  return candidates;
}
