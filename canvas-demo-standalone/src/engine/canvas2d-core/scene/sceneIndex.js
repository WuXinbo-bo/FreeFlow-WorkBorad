import { getElementBounds } from "../elements/index.js";
import { getFlowNodeConnectors } from "../elements/flow.js";
import { getFileCardMemoBounds } from "../elements/fileCard.js";
import { getImageMemoBounds } from "../elements/media.js";
import { getMindRelationshipGeometry, isMindRelationshipItem } from "../elements/mindRelationship.js";
import { isLinearShape } from "../elements/shapes.js";
import { screenToScene } from "../camera.js";

const DEFAULT_GRID_CELL_SIZE = 384;
const CACHE_GUARD_SAMPLE_SIZE = 6;

const indexCache = new WeakMap();

function clampBounds(bounds = {}) {
  const left = Number(bounds.left ?? 0);
  const top = Number(bounds.top ?? 0);
  const right = Number(bounds.right ?? left);
  const bottom = Number(bounds.bottom ?? top);
  return {
    left: Math.min(left, right),
    top: Math.min(top, bottom),
    right: Math.max(left, right),
    bottom: Math.max(top, bottom),
  };
}

function toSizedBounds(bounds = {}) {
  const next = clampBounds(bounds);
  return {
    ...next,
    width: Math.max(1, next.right - next.left),
    height: Math.max(1, next.bottom - next.top),
  };
}

function mergeBounds(baseBounds, extraBounds) {
  if (!extraBounds) {
    return toSizedBounds(baseBounds);
  }
  return toSizedBounds({
    left: Math.min(baseBounds.left, extraBounds.left),
    top: Math.min(baseBounds.top, extraBounds.top),
    right: Math.max(baseBounds.right, extraBounds.right),
    bottom: Math.max(baseBounds.bottom, extraBounds.bottom),
  });
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
  for (let index = 0; index < length && sample.length < CACHE_GUARD_SAMPLE_SIZE; index += step) {
    sample.push(items[index]);
  }
  if (sample[sample.length - 1] !== items[length - 1]) {
    sample.push(items[length - 1]);
  }
  return sample;
}

function getGuardSignature(items = []) {
  const refs = getGuardRefs(items);
  return refs
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      return [
        item.id || "",
        item.type || "",
        Number(item.x || item.startX || 0) || 0,
        Number(item.y || item.startY || 0) || 0,
        Number(item.width || item.endX || 0) || 0,
        Number(item.height || item.endY || 0) || 0,
        Number(item.updatedAt || item.createdAt || 0) || 0,
      ].join(":");
    })
    .join("|");
}

function isCacheGuardValid(index, items, revision = 0) {
  if (!index || !Array.isArray(items)) {
    return false;
  }
  if (index.length !== items.length) {
    return false;
  }
  if (Number(index.revision || 0) !== Number(revision || 0)) {
    return false;
  }
  const currentRefs = getGuardRefs(items);
  const guardRefs = Array.isArray(index.guardRefs) ? index.guardRefs : [];
  if (currentRefs.length !== guardRefs.length) {
    return false;
  }
  for (let indexRef = 0; indexRef < guardRefs.length; indexRef += 1) {
    if (guardRefs[indexRef] !== currentRefs[indexRef]) {
      return false;
    }
  }
  return String(index.guardSignature || "") === getGuardSignature(items);
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
  const baseBounds = toSizedBounds({
    left: Math.min(Number(fromPoint?.x || 0), Number(toPoint?.x || 0)),
    top: Math.min(Number(fromPoint?.y || 0), Number(toPoint?.y || 0)),
    right: Math.max(Number(fromPoint?.x || 0), Number(toPoint?.x || 0)),
    bottom: Math.max(Number(fromPoint?.y || 0), Number(toPoint?.y || 0)),
  });
  return {
    item,
    itemId: String(item.id || ""),
    itemIndex,
    itemType: String(item.type || ""),
    zIndex: itemIndex,
    bounds: baseBounds,
    queryBounds: baseBounds,
    anchors: null,
    geometry: {
      fromPoint,
      toPoint,
    },
  };
}

function buildMindRelationshipRecord(item, itemIndex, itemById) {
  const geometry = getMindRelationshipGeometry(item, itemById);
  if (!geometry) {
    return null;
  }
  const midpointBounds = toSizedBounds({
    left: geometry.midpoint.x - 12,
    top: geometry.midpoint.y - 12,
    right: geometry.midpoint.x + 12,
    bottom: geometry.midpoint.y + 12,
  });
  const baseBounds = mergeBounds(toSizedBounds(geometry.bounds), midpointBounds);
  return {
    item,
    itemId: String(item.id || ""),
    itemIndex,
    itemType: String(item.type || ""),
    zIndex: itemIndex,
    bounds: baseBounds,
    queryBounds: baseBounds,
    anchors: null,
    geometry,
  };
}

function buildLinearShapeRecord(item, itemIndex) {
  const startPoint = { x: Number(item.startX || 0), y: Number(item.startY || 0) };
  const endPoint = { x: Number(item.endX || 0), y: Number(item.endY || 0) };
  const baseBounds = toSizedBounds({
    left: Math.min(startPoint.x, endPoint.x),
    top: Math.min(startPoint.y, endPoint.y),
    right: Math.max(startPoint.x, endPoint.x),
    bottom: Math.max(startPoint.y, endPoint.y),
  });
  return {
    item,
    itemId: String(item.id || ""),
    itemIndex,
    itemType: String(item.type || ""),
    zIndex: itemIndex,
    bounds: baseBounds,
    queryBounds: baseBounds,
    anchors: null,
    geometry: {
      startPoint,
      endPoint,
    },
  };
}

function buildAnchors(bounds = {}) {
  const next = toSizedBounds(bounds);
  return {
    left: next.left,
    centerX: next.left + next.width / 2,
    right: next.right,
    top: next.top,
    centerY: next.top + next.height / 2,
    bottom: next.bottom,
  };
}

function buildGenericRecord(item, itemIndex) {
  const bounds = toSizedBounds(getElementBounds(item));
  let queryBounds = bounds;
  let memoBounds = null;
  if (item.type === "fileCard" && item.memoVisible) {
    memoBounds = toSizedBounds(getFileCardMemoBounds(item));
    queryBounds = mergeBounds(queryBounds, memoBounds);
  }
  if (item.type === "image" && item.memoVisible) {
    memoBounds = toSizedBounds(getImageMemoBounds(item));
    queryBounds = mergeBounds(queryBounds, memoBounds);
  }
  return {
    item,
    itemId: String(item.id || ""),
    itemIndex,
    itemType: String(item.type || ""),
    zIndex: itemIndex,
    bounds,
    queryBounds,
    anchors: buildAnchors(bounds),
    geometry: memoBounds ? { memoBounds } : null,
  };
}

function buildRecord(item, itemIndex, itemById) {
  if (!item || typeof item !== "object") {
    return null;
  }
  if (item.type === "flowEdge") {
    return buildFlowEdgeRecord(item, itemIndex, itemById);
  }
  if (isMindRelationshipItem(item)) {
    return buildMindRelationshipRecord(item, itemIndex, itemById);
  }
  if (item.type === "shape" && isLinearShape(item.shapeType)) {
    return buildLinearShapeRecord(item, itemIndex);
  }
  return buildGenericRecord(item, itemIndex);
}

export function buildSceneIndex(items, options = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const cellSize = Math.max(64, Number(options.cellSize || DEFAULT_GRID_CELL_SIZE) || DEFAULT_GRID_CELL_SIZE);
  const grid = new Map();
  const records = [];
  const itemById = new Map();
  const recordById = new Map();
  const recordsByType = new Map();

  for (let index = 0; index < sourceItems.length; index += 1) {
    const item = sourceItems[index];
    if (item?.id) {
      itemById.set(item.id, item);
    }
  }

  for (let index = 0; index < sourceItems.length; index += 1) {
    const item = sourceItems[index];
    const record = buildRecord(item, index, itemById);
    if (!record) {
      continue;
    }
    const recordIndex = records.length;
    records.push(record);
    if (record.itemId) {
      recordById.set(record.itemId, record);
    }
    const typeBucket = recordsByType.get(record.itemType) || [];
    typeBucket.push(record);
    recordsByType.set(record.itemType, typeBucket);
    addRecordToGrid(grid, recordIndex, record.queryBounds, cellSize);
  }

  return {
    items: sourceItems,
    length: sourceItems.length,
    revision: Number(options.revision || 0) || 0,
    cellSize,
    grid,
    records,
    itemById,
    recordById,
    recordsByType,
    guardRefs: getGuardRefs(sourceItems),
    guardSignature: getGuardSignature(sourceItems),
  };
}

export function resolveSceneIndex(items, options = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const revision = Number(options.revision || 0) || 0;
  const forceRebuild = Boolean(options.forceRebuild);
  if (!forceRebuild) {
    const cached = indexCache.get(sourceItems);
    if (cached && isCacheGuardValid(cached, sourceItems, revision)) {
      return cached;
    }
  }
  const nextIndex = buildSceneIndex(sourceItems, options);
  indexCache.set(sourceItems, nextIndex);
  return nextIndex;
}

export function invalidateSceneIndex(items) {
  if (!Array.isArray(items)) {
    return false;
  }
  return indexCache.delete(items);
}

export function querySceneIndex(index, bounds, options = {}) {
  if (!index || !index.grid || !Array.isArray(index.records)) {
    return [];
  }
  const queryBounds = clampBounds(bounds);
  const xRange = getCellRange(queryBounds.left, queryBounds.right, index.cellSize);
  const yRange = getCellRange(queryBounds.top, queryBounds.bottom, index.cellSize);
  const visited = new Set();
  const includeTypes = Array.isArray(options.types) && options.types.length ? new Set(options.types.map((entry) => String(entry || ""))) : null;
  const excludeIds = Array.isArray(options.excludeIds) && options.excludeIds.length ? new Set(options.excludeIds.map((entry) => String(entry || ""))) : null;
  const results = [];

  for (let cellX = xRange.min; cellX <= xRange.max; cellX += 1) {
    for (let cellY = yRange.min; cellY <= yRange.max; cellY += 1) {
      const bucket = index.grid.get(getCellKey(cellX, cellY));
      if (!bucket || !bucket.length) {
        continue;
      }
      for (let bucketIndex = 0; bucketIndex < bucket.length; bucketIndex += 1) {
        const recordIndex = bucket[bucketIndex];
        if (visited.has(recordIndex)) {
          continue;
        }
        visited.add(recordIndex);
        const record = index.records[recordIndex];
        if (!record) {
          continue;
        }
        if (includeTypes && !includeTypes.has(record.itemType)) {
          continue;
        }
        if (excludeIds && excludeIds.has(record.itemId)) {
          continue;
        }
        if (!intersectsBounds(record.queryBounds, queryBounds)) {
          continue;
        }
        results.push(record);
      }
    }
  }

  return results;
}

export function getSceneViewportBounds(view, viewportWidth = 0, viewportHeight = 0, marginPx = 0) {
  const width = Math.max(1, Number(viewportWidth || 0) || 1);
  const height = Math.max(1, Number(viewportHeight || 0) || 1);
  const margin = Math.max(0, Number(marginPx || 0) || 0);
  const topLeft = screenToScene(view, { x: -margin, y: -margin }, { left: 0, top: 0 });
  const bottomRight = screenToScene(view, { x: width + margin, y: height + margin }, { left: 0, top: 0 });
  return toSizedBounds({
    left: Math.min(topLeft.x, bottomRight.x),
    top: Math.min(topLeft.y, bottomRight.y),
    right: Math.max(topLeft.x, bottomRight.x),
    bottom: Math.max(topLeft.y, bottomRight.y),
  });
}

export function queryVisibleSceneItems(index, view, viewportWidth = 0, viewportHeight = 0, options = {}) {
  const marginPx = Math.max(0, Number(options.marginPx || 0) || 0);
  const bounds = getSceneViewportBounds(view, viewportWidth, viewportHeight, marginPx);
  const records = querySceneIndex(index, bounds, options).sort((a, b) => a.itemIndex - b.itemIndex);
  return {
    bounds,
    records,
    items: records.map((record) => record.item),
  };
}

export function getSceneRecord(index, itemId = "") {
  if (!index?.recordById || !itemId) {
    return null;
  }
  return index.recordById.get(String(itemId || "")) || null;
}
