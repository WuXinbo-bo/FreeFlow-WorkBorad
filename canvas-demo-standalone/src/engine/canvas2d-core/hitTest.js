import { getElementBounds } from "./elements/index.js";
import { getFileCardMemoBounds } from "./elements/fileCard.js";
import { getImageMemoBounds } from "./elements/media.js";
import { isMindRelationshipItem } from "./elements/mindRelationship.js";
import { isLinearShape } from "./elements/shapes.js";
import { invalidateHitTestSpatialIndex, queryHitTestSpatialIndex, resolveHitTestSpatialIndex } from "./hitTestSpatialIndex.js";
import { getMindNodeLinkAnchorScreenBounds } from "./renderer.js";

function pointInBounds(point, bounds, padding = 0) {
  return (
    Number(point?.x || 0) >= bounds.left - padding &&
    Number(point?.x || 0) <= bounds.right + padding &&
    Number(point?.y || 0) >= bounds.top - padding &&
    Number(point?.y || 0) <= bounds.bottom + padding
  );
}

function lineDistance(point, start, end) {
  const dx = Number(end.x || 0) - Number(start.x || 0);
  const dy = Number(end.y || 0) - Number(start.y || 0);
  const lenSq = dx * dx + dy * dy;
  if (!lenSq) {
    return Math.hypot(Number(point?.x || 0) - Number(start.x || 0), Number(point?.y || 0) - Number(start.y || 0));
  }
  let ratio =
    ((Number(point?.x || 0) - Number(start.x || 0)) * dx + (Number(point?.y || 0) - Number(start.y || 0)) * dy) /
    lenSq;
  ratio = Math.max(0, Math.min(1, ratio));
  const projectedX = Number(start.x || 0) + dx * ratio;
  const projectedY = Number(start.y || 0) + dy * ratio;
  return Math.hypot(Number(point?.x || 0) - projectedX, Number(point?.y || 0) - projectedY);
}

export function hitTestElement(items, point, scale = 1) {
  const tolerance = Math.max(8, 12 / Math.max(0.1, scale));
  const index = resolveHitTestSpatialIndex(items);
  const candidates = queryHitTestSpatialIndex(index, {
    left: Number(point?.x || 0) - tolerance,
    right: Number(point?.x || 0) + tolerance,
    top: Number(point?.y || 0) - tolerance,
    bottom: Number(point?.y || 0) + tolerance,
  }).sort((a, b) => b.itemIndex - a.itemIndex);
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const item = candidate.item;
    if (!item) {
      continue;
    }
    if (item.type === "flowEdge") {
      const fromPoint = candidate.geometry?.fromPoint;
      const toPoint = candidate.geometry?.toPoint;
      if (!fromPoint || !toPoint) {
        continue;
      }
      if (lineDistance(point, fromPoint, toPoint) <= tolerance) {
        return item;
      }
      continue;
    }
    if (isMindRelationshipItem(item)) {
      const fromPoint = candidate.geometry?.fromPoint;
      const toPoint = candidate.geometry?.toPoint;
      const midpoint = candidate.geometry?.midpoint;
      if (!fromPoint || !toPoint || !midpoint) {
        continue;
      }
      const midpointHit = Math.hypot(Number(point?.x || 0) - midpoint.x, Number(point?.y || 0) - midpoint.y);
      if (midpointHit <= Math.max(12, tolerance)) {
        return item;
      }
      if (lineDistance(point, fromPoint, toPoint) <= tolerance) {
        return item;
      }
      continue;
    }
    if (item.type === "shape" && isLinearShape(item.shapeType)) {
      const startPoint = candidate.geometry?.startPoint || { x: item.startX, y: item.startY };
      const endPoint = candidate.geometry?.endPoint || { x: item.endX, y: item.endY };
      if (lineDistance(point, startPoint, endPoint) <= tolerance) {
        return item;
      }
      continue;
    }
    const bounds = candidate.baseBounds || getElementBounds(item);
    if (pointInBounds(point, bounds, tolerance)) {
      return item;
    }
    if (item.type === "fileCard" && item.memoVisible) {
      const memoBounds = candidate.geometry?.memoBounds || getFileCardMemoBounds(item);
      if (pointInBounds(point, memoBounds, tolerance)) {
        return item;
      }
    }
    if (item.type === "image" && item.memoVisible) {
      const memoBounds = candidate.geometry?.memoBounds || getImageMemoBounds(item);
      if (pointInBounds(point, memoBounds, tolerance)) {
        return item;
      }
    }
  }
  return null;
}

export function hitTestHandle(item, point, scale = 1) {
  if (!item) {
    return null;
  }
  const tolerance = Math.max(8, 12 / Math.max(0.1, scale));
  if (item.type === "mindNode") {
    const pseudoView = { scale, offsetX: 0, offsetY: 0 };
    const anchorBounds = getMindNodeLinkAnchorScreenBounds(item, pseudoView, {
      left: Number(item.x || 0),
      top: Number(item.y || 0),
      width: Number(item.width || 0),
      height: Number(item.height || 0),
      right: Number(item.x || 0) + Number(item.width || 0),
      bottom: Number(item.y || 0) + Number(item.height || 0),
    });
    if (anchorBounds && pointInBounds(point, anchorBounds, Math.max(2, tolerance * 0.22))) {
      return "mind-link-anchor";
    }
  }
  if (isMindRelationshipItem(item)) {
    const midpoint = item.__mindRelationshipMidpoint;
    if (midpoint) {
      const distance = Math.hypot(Number(point?.x || 0) - Number(midpoint.x || 0), Number(point?.y || 0) - Number(midpoint.y || 0));
      if (distance <= Math.max(10, tolerance)) {
        return "mind-relationship-delete";
      }
    }
  }
  if (item.type === "shape" && item.shapeType === "rect") {
    const bounds = getElementBounds(item);
    const inset = Math.max(6, 10 / Math.max(0.1, scale));
    const handles = {
      "round-nw": { x: bounds.left + inset, y: bounds.top + inset },
      "round-ne": { x: bounds.right - inset, y: bounds.top + inset },
      "round-sw": { x: bounds.left + inset, y: bounds.bottom - inset },
      "round-se": { x: bounds.right - inset, y: bounds.bottom - inset },
    };
    for (const [key, handlePoint] of Object.entries(handles)) {
      const distance = Math.hypot(Number(point?.x || 0) - handlePoint.x, Number(point?.y || 0) - handlePoint.y);
      if (distance <= tolerance) {
        return key;
      }
    }
  }
  if (item.type === "shape" && isLinearShape(item.shapeType)) {
    const startHit = Math.hypot(Number(point?.x || 0) - Number(item.startX || 0), Number(point?.y || 0) - Number(item.startY || 0));
    if (startHit <= tolerance) {
      return "start";
    }
    const endHit = Math.hypot(Number(point?.x || 0) - Number(item.endX || 0), Number(point?.y || 0) - Number(item.endY || 0));
    if (endHit <= tolerance) {
      return "end";
    }
    return null;
  }

  const bounds = getElementBounds(item);
  const handles = {
    nw: { x: bounds.left, y: bounds.top },
    ne: { x: bounds.right, y: bounds.top },
    sw: { x: bounds.left, y: bounds.bottom },
    se: { x: bounds.right, y: bounds.bottom },
  };
  for (const [key, handlePoint] of Object.entries(handles)) {
    const distance = Math.hypot(Number(point?.x || 0) - handlePoint.x, Number(point?.y || 0) - handlePoint.y);
    if (distance <= tolerance) {
      return key;
    }
  }
  return null;
}

export function collectElementsInRect(items, startPoint, currentPoint) {
  const left = Math.min(Number(startPoint?.x || 0), Number(currentPoint?.x || 0));
  const top = Math.min(Number(startPoint?.y || 0), Number(currentPoint?.y || 0));
  const right = Math.max(Number(startPoint?.x || 0), Number(currentPoint?.x || 0));
  const bottom = Math.max(Number(startPoint?.y || 0), Number(currentPoint?.y || 0));
  const index = resolveHitTestSpatialIndex(items);
  const candidates = queryHitTestSpatialIndex(index, { left, top, right, bottom })
    .filter((candidate) => candidate.item && candidate.item.type !== "flowEdge")
    .sort((a, b) => a.itemIndex - b.itemIndex);
  const selectedIds = [];
  const seenIds = new Set();
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const item = candidate.item;
    if (!item || seenIds.has(item.id)) {
      continue;
    }
    const bounds = candidate.baseBounds || getElementBounds(item);
    const intersects = !(
      bounds.right < left ||
      bounds.left > right ||
      bounds.bottom < top ||
      bounds.top > bottom
    );
    if (!intersects) {
      continue;
    }
    seenIds.add(item.id);
    selectedIds.push(item.id);
  }
  return selectedIds;
}

export { invalidateHitTestSpatialIndex };
