import { clamp, createId } from "../utils.js";

export function isLinearShape(shapeType = "") {
  return shapeType === "line" || shapeType === "arrow";
}

function normalizeBoxFromPoints(startX, startY, endX, endY) {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.max(1, Math.abs(endX - startX));
  const height = Math.max(1, Math.abs(endY - startY));
  return { x: left, y: top, width, height };
}

export function createShapeElement(shapeType = "rect", startPoint, endPoint = startPoint) {
  const startX = Number(startPoint?.x) || 0;
  const startY = Number(startPoint?.y) || 0;
  const endX = Number(endPoint?.x) || startX;
  const endY = Number(endPoint?.y) || startY;
  const box = normalizeBoxFromPoints(startX, startY, endX, endY);
  const linear = isLinearShape(shapeType);
  const isHighlight = shapeType === "highlight";
  const isLinear = isLinearShape(shapeType);
  const fillColor = isHighlight ? "rgba(250, 204, 21, 0.28)" : "transparent";
  return {
    id: createId("shape"),
    type: "shape",
    shapeType,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    startX,
    startY,
    endX,
    endY,
    strokeColor: isHighlight ? "rgba(245, 158, 11, 0.7)" : "#334155",
    fillColor,
    strokeWidth: isLinear ? 2.5 : isHighlight ? 8 : 2,
    lineDash: false,
    rotation: 0,
    radius: shapeType === "rect" ? 18 : 0,
    createdAt: Date.now(),
  };
}

export function updateShapeElement(element, startPoint, endPoint) {
  const next = {
    ...element,
    startX: Number(startPoint?.x) || 0,
    startY: Number(startPoint?.y) || 0,
    endX: Number(endPoint?.x) || 0,
    endY: Number(endPoint?.y) || 0,
  };
  if (!isLinearShape(next.shapeType)) {
    const box = normalizeBoxFromPoints(next.startX, next.startY, next.endX, next.endY);
    next.x = box.x;
    next.y = box.y;
    next.width = box.width;
    next.height = box.height;
    return next;
  }
  next.x = Math.min(next.startX, next.endX);
  next.y = Math.min(next.startY, next.endY);
  next.width = Math.max(1, Math.abs(next.endX - next.startX));
  next.height = Math.max(1, Math.abs(next.endY - next.startY));
  return next;
}

export function moveShapeElement(element, dx, dy) {
  const offsetX = Number(dx) || 0;
  const offsetY = Number(dy) || 0;
  return {
    ...element,
    x: Number(element.x || 0) + offsetX,
    y: Number(element.y || 0) + offsetY,
    startX: Number(element.startX || element.x || 0) + offsetX,
    startY: Number(element.startY || element.y || 0) + offsetY,
    endX: Number(element.endX || element.x || 0) + offsetX,
    endY: Number(element.endY || element.y || 0) + offsetY,
  };
}

export function normalizeShapeElement(element = {}) {
  const shapeType = ["rect", "ellipse", "line", "arrow", "highlight"].includes(element.shapeType)
    ? element.shapeType
    : "rect";
  const base = createShapeElement(
    shapeType,
    {
      x: Number(element.startX ?? element.x) || 0,
      y: Number(element.startY ?? element.y) || 0,
    },
    {
      x: Number(element.endX ?? (Number(element.x) + Number(element.width))) || 0,
      y: Number(element.endY ?? (Number(element.y) + Number(element.height))) || 0,
    }
  );
  return {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "shape",
    shapeType,
    x: Number(element.x ?? base.x) || 0,
    y: Number(element.y ?? base.y) || 0,
    width: Math.max(1, Number(element.width ?? base.width) || 1),
    height: Math.max(1, Number(element.height ?? base.height) || 1),
    startX: Number(element.startX ?? base.startX) || 0,
    startY: Number(element.startY ?? base.startY) || 0,
    endX: Number(element.endX ?? base.endX) || 0,
    endY: Number(element.endY ?? base.endY) || 0,
    strokeWidth: clamp(Number(element.strokeWidth ?? base.strokeWidth) || base.strokeWidth, 1, 24),
    strokeColor: String(element.strokeColor || element.stroke || base.strokeColor),
    fillColor: String(element.fillColor || element.fill || base.fillColor),
    lineDash: Boolean(element.lineDash ?? base.lineDash),
    rotation: clamp(Number(element.rotation ?? base.rotation) || 0, -3600, 3600),
    radius: clamp(Number(element.radius ?? base.radius) || base.radius, 0, 80),
    createdAt: Number(element.createdAt) || base.createdAt,
  };
}
