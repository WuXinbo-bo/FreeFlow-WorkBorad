import { getElementBounds, getElementDefinition } from "../elements/index.js";
import { getFlowNodeConnectors } from "../elements/flow.js";
import { getFileCardMemoBounds } from "../elements/fileCard.js";
import { getImageMemoBounds } from "../elements/media.js";
import { getMindRelationshipGeometry } from "../elements/mindRelationship.js";
import { isLinearShape } from "../elements/shapes.js";
import { screenToScene } from "../camera.js";

const DEFAULT_GRID_CELL_SIZE = 384;
const CACHE_GUARD_SAMPLE_SIZE = 6;
const DEFAULT_MAX_CELLS_PER_RECORD = 256;
const DEFAULT_MAX_QUERY_CELLS = 4096;

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

function getCellCount(xRange, yRange) {
  return Math.max(0, xRange.max - xRange.min + 1) * Math.max(0, yRange.max - yRange.min + 1);
}

function addRecordToGrid(grid, largeRecordIndexes, recordIndex, bounds, cellSize, maxCellsPerRecord) {
  const xRange = getCellRange(bounds.left, bounds.right, cellSize);
  const yRange = getCellRange(bounds.top, bounds.bottom, cellSize);
  if (getCellCount(xRange, yRange) > maxCellsPerRecord) {
    largeRecordIndexes.push(recordIndex);
    return 0;
  }
  let gridEntryCount = 0;
  for (let cellX = xRange.min; cellX <= xRange.max; cellX += 1) {
    for (let cellY = yRange.min; cellY <= yRange.max; cellY += 1) {
      const key = getCellKey(cellX, cellY);
      const bucket = grid.get(key);
      if (bucket) {
        bucket.push(recordIndex);
      } else {
        grid.set(key, [recordIndex]);
      }
      gridEntryCount += 1;
    }
  }
  return gridEntryCount;
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

function isCacheGuardValid(index, items, revision = 0, checkRevision = true) {
  if (!index || !Array.isArray(items)) {
    return false;
  }
  if (index.length !== items.length) {
    return false;
  }
  if (checkRevision && Number(index.revision || 0) !== Number(revision || 0)) {
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
    baseBounds,
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
    baseBounds,
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
    baseBounds,
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
  const hitTestPolicy = getElementDefinition(item)?.capabilities?.hitTest || "bounds";
  if (hitTestPolicy === "bounds-file-memo" && item.memoVisible) {
    memoBounds = toSizedBounds(getFileCardMemoBounds(item));
    queryBounds = mergeBounds(queryBounds, memoBounds);
  }
  if (hitTestPolicy === "bounds-image-memo" && item.memoVisible) {
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
    baseBounds: bounds,
    queryBounds,
    anchors: buildAnchors(bounds),
    geometry: memoBounds ? { memoBounds } : null,
  };
}

function buildRecord(item, itemIndex, itemById) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const hitTestPolicy = getElementDefinition(item)?.capabilities?.hitTest || "bounds";
  if (hitTestPolicy === "line") {
    return buildFlowEdgeRecord(item, itemIndex, itemById);
  }
  if (hitTestPolicy === "relationship") {
    return buildMindRelationshipRecord(item, itemIndex, itemById);
  }
  if (hitTestPolicy === "shape-path" && isLinearShape(item.shapeType)) {
    return buildLinearShapeRecord(item, itemIndex);
  }
  return buildGenericRecord(item, itemIndex);
}

export function buildSceneIndex(items, options = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const cellSize = Math.max(64, Number(options.cellSize || DEFAULT_GRID_CELL_SIZE) || DEFAULT_GRID_CELL_SIZE);
  const maxCellsPerRecord = Math.max(
    1,
    Math.floor(Number(options.maxCellsPerRecord || DEFAULT_MAX_CELLS_PER_RECORD) || DEFAULT_MAX_CELLS_PER_RECORD)
  );
  const grid = new Map();
  const largeRecordIndexes = [];
  const records = [];
  const itemById = new Map();
  const recordById = new Map();
  const recordsByType = new Map();
  let gridEntryCount = 0;

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
    gridEntryCount += addRecordToGrid(
      grid,
      largeRecordIndexes,
      recordIndex,
      record.queryBounds,
      cellSize,
      maxCellsPerRecord
    );
  }

  return {
    items: sourceItems,
    length: sourceItems.length,
    revision: Number(options.revision || 0) || 0,
    cellSize,
    maxCellsPerRecord,
    grid,
    gridEntryCount,
    largeRecordIndexes,
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
  const checkRevision = Object.prototype.hasOwnProperty.call(options, "revision");
  const forceRebuild = Boolean(options.forceRebuild);
  if (!forceRebuild) {
    const cached = indexCache.get(sourceItems);
    if (cached && isCacheGuardValid(cached, sourceItems, revision, checkRevision)) {
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

  function visitRecord(recordIndex) {
    if (visited.has(recordIndex)) return;
    visited.add(recordIndex);
    const record = index.records[recordIndex];
    if (!record) return;
    if (includeTypes && !includeTypes.has(record.itemType)) return;
    if (excludeIds && excludeIds.has(record.itemId)) return;
    if (!intersectsBounds(record.queryBounds, queryBounds)) return;
    results.push(record);
  }

  const maxQueryCells = Math.max(
    1,
    Math.floor(Number(options.maxQueryCells || DEFAULT_MAX_QUERY_CELLS) || DEFAULT_MAX_QUERY_CELLS)
  );
  if (getCellCount(xRange, yRange) > maxQueryCells) {
    for (let recordIndex = 0; recordIndex < index.records.length; recordIndex += 1) {
      visitRecord(recordIndex);
    }
    return results;
  }

  for (let cellX = xRange.min; cellX <= xRange.max; cellX += 1) {
    for (let cellY = yRange.min; cellY <= yRange.max; cellY += 1) {
      const bucket = index.grid.get(getCellKey(cellX, cellY));
      if (!bucket || !bucket.length) {
        continue;
      }
      for (let bucketIndex = 0; bucketIndex < bucket.length; bucketIndex += 1) {
        visitRecord(bucket[bucketIndex]);
      }
    }
  }

  (Array.isArray(index.largeRecordIndexes) ? index.largeRecordIndexes : []).forEach(visitRecord);

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

function createSortedRecordBuckets(records = []) {
  const sorted = Array.isArray(records) ? records.slice().sort((a, b) => a.itemIndex - b.itemIndex) : [];
  return {
    records: sorted,
    items: sorted.map((record) => record.item),
  };
}

export function querySceneViewportPacket(index, view, viewportWidth = 0, viewportHeight = 0, options = {}) {
  const preloadMarginPx = Math.max(0, Number(options.preloadMarginPx || 0) || 0);
  const overscanMarginPx = Math.max(preloadMarginPx, Number(options.overscanMarginPx || 0) || 0);
  const primaryBounds = getSceneViewportBounds(view, viewportWidth, viewportHeight, 0);
  const preloadBounds = getSceneViewportBounds(view, viewportWidth, viewportHeight, preloadMarginPx);
  const overscanBounds = getSceneViewportBounds(view, viewportWidth, viewportHeight, overscanMarginPx);
  const primaryBucket = createSortedRecordBuckets(querySceneIndex(index, primaryBounds, options));
  const preloadAllBucket = createSortedRecordBuckets(querySceneIndex(index, preloadBounds, options));
  const overscanAllBucket = createSortedRecordBuckets(querySceneIndex(index, overscanBounds, options));
  const primaryIndexes = new Set(primaryBucket.records.map((record) => record.itemIndex));
  const preloadIndexes = new Set(preloadAllBucket.records.map((record) => record.itemIndex));
  const preloadBucket = createSortedRecordBuckets(
    preloadAllBucket.records.filter((record) => !primaryIndexes.has(record.itemIndex))
  );
  const overscanBucket = createSortedRecordBuckets(
    overscanAllBucket.records.filter((record) => !preloadIndexes.has(record.itemIndex))
  );
  return {
    bounds: overscanBounds,
    primaryBounds,
    preloadBounds,
    overscanBounds,
    primaryMarginPx: 0,
    preloadMarginPx,
    overscanMarginPx,
    records: overscanAllBucket.records,
    items: overscanAllBucket.items,
    primaryRecords: primaryBucket.records,
    primaryItems: primaryBucket.items,
    preloadRecords: preloadBucket.records,
    preloadItems: preloadBucket.items,
    overscanRecords: overscanBucket.records,
    overscanItems: overscanBucket.items,
  };
}

export function getSceneRecord(index, itemId = "") {
  if (!index?.recordById || !itemId) {
    return null;
  }
  return index.recordById.get(String(itemId || "")) || null;
}
