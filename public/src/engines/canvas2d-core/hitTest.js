import { getElementBounds } from "./elements/index.js";
import { getFlowNodeConnectors } from "./elements/flow.js";
import { getFileCardMemoBounds } from "./elements/fileCard.js";
import { getImageMemoBounds } from "./elements/media.js";
import { isLinearShape } from "./elements/shapes.js";

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
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.type === "flowEdge") {
      const fromNode = items.find((entry) => entry.id === item.fromId);
      const toNode = items.find((entry) => entry.id === item.toId);
      if (!fromNode || !toNode) {
        continue;
      }
      const fromPoint = getFlowNodeConnectors(fromNode)[item.fromSide] || getFlowNodeConnectors(fromNode).right;
      const toPoint = getFlowNodeConnectors(toNode)[item.toSide] || getFlowNodeConnectors(toNode).left;
      const hit = lineDistance(point, fromPoint, toPoint) <= tolerance;
      if (hit) {
        return item;
      }
      continue;
    }
    if (item.type === "shape" && isLinearShape(item.shapeType)) {
      const hit = lineDistance(point, { x: item.startX, y: item.startY }, { x: item.endX, y: item.endY }) <= tolerance;
      if (hit) {
        return item;
      }
      continue;
    }
    const bounds = getElementBounds(item);
    if (pointInBounds(point, bounds, tolerance)) {
      return item;
    }
    if (item.type === "fileCard" && item.memoVisible) {
      const memoBounds = getFileCardMemoBounds(item);
      if (pointInBounds(point, memoBounds, tolerance)) {
        return item;
      }
    }
    if (item.type === "image" && item.memoVisible) {
      const memoBounds = getImageMemoBounds(item);
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
  return items
    .filter((item) => {
      if (item.type === "flowEdge") {
        return false;
      }
      const bounds = getElementBounds(item);
      return !(
        bounds.right < left ||
        bounds.left > right ||
        bounds.bottom < top ||
        bounds.top > bottom
      );
    })
    .map((item) => item.id);
}
