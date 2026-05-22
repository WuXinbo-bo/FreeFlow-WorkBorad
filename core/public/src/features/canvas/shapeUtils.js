const LINEAR_SHAPES = new Set(["line", "arrow"]);

export function isLinearShape(shapeType = "") {
  return LINEAR_SHAPES.has(String(shapeType || "").trim());
}

export function isBoxShape(shapeType = "") {
  return ["rect", "ellipse", "highlight"].includes(String(shapeType || "").trim());
}

export function normalizeShapeType(shapeType = "rect") {
  const value = String(shapeType || "").trim().toLowerCase();
  return ["rect", "arrow", "line", "ellipse", "highlight"].includes(value) ? value : "rect";
}

export function getShapeGeometry(item = {}) {
  const shapeType = normalizeShapeType(item?.shapeType || "rect");
  const startX = Number(item?.startX);
  const startY = Number(item?.startY);
  const endX = Number(item?.endX);
  const endY = Number(item?.endY);
  if (isLinearShape(shapeType)) {
    const x1 = Number.isFinite(startX) ? startX : Number(item?.x) || 0;
    const y1 = Number.isFinite(startY) ? startY : Number(item?.y) || 0;
    const x2 = Number.isFinite(endX) ? endX : x1 + (Number(item?.width) || 1);
    const y2 = Number.isFinite(endY) ? endY : y1 + (Number(item?.height) || 1);
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.max(1, Math.abs(x2 - x1));
    const height = Math.max(1, Math.abs(y2 - y1));
    return {
      shapeType,
      left,
      top,
      width,
      height,
      x1,
      y1,
      x2,
      y2,
      localX1: x1 - left,
      localY1: y1 - top,
      localX2: x2 - left,
      localY2: y2 - top,
    };
  }

  const left = Number.isFinite(Number(item?.x)) ? Number(item.x) : 0;
  const top = Number.isFinite(Number(item?.y)) ? Number(item.y) : 0;
  const width = Math.max(1, Number(item?.width) || 1);
  const height = Math.max(1, Number(item?.height) || 1);
  return {
    shapeType,
    left,
    top,
    width,
    height,
    x1: left,
    y1: top,
    x2: left + width,
    y2: top + height,
    localX1: 0,
    localY1: 0,
    localX2: width,
    localY2: height,
  };
}

export function snapLinearPoint(origin = {}, target = {}, snap = false) {
  const x1 = Number(origin.x) || 0;
  const y1 = Number(origin.y) || 0;
  let x2 = Number(target.x) || 0;
  let y2 = Number(target.y) || 0;
  if (!snap) {
    return { x: x2, y: y2 };
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const snapStep = Math.PI / 4;
  const snappedAngle = Math.round(angle / snapStep) * snapStep;
  x2 = x1 + Math.cos(snappedAngle) * distance;
  y2 = y1 + Math.sin(snappedAngle) * distance;
  return { x: x2, y: y2 };
}

export function buildShapePayloadFromDrag({
  shapeType = "rect",
  startX = 0,
  startY = 0,
  endX = 0,
  endY = 0,
  snap = false,
} = {}) {
  const normalizedShapeType = normalizeShapeType(shapeType);
  if (isLinearShape(normalizedShapeType)) {
    const snappedEnd = snapLinearPoint({ x: startX, y: startY }, { x: endX, y: endY }, snap);
    const left = Math.min(startX, snappedEnd.x);
    const top = Math.min(startY, snappedEnd.y);
    return {
      shapeType: normalizedShapeType,
      x: left,
      y: top,
      width: Math.max(1, Math.abs(snappedEnd.x - startX)),
      height: Math.max(1, Math.abs(snappedEnd.y - startY)),
      startX,
      startY,
      endX: snappedEnd.x,
      endY: snappedEnd.y,
    };
  }

  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.max(1, Math.abs(endX - startX));
  const height = Math.max(1, Math.abs(endY - startY));
  return {
    shapeType: normalizedShapeType,
    x: left,
    y: top,
    width,
    height,
    startX: left,
    startY: top,
    endX: left + width,
    endY: top + height,
  };
}

export function getShapeHandleMap(item = {}) {
  const geometry = getShapeGeometry(item);
  if (isLinearShape(geometry.shapeType)) {
    return {
      start: { x: geometry.localX1, y: geometry.localY1 },
      end: { x: geometry.localX2, y: geometry.localY2 },
      mid: { x: geometry.width / 2, y: geometry.height / 2 },
    };
  }
  return {
    nw: { x: 0, y: 0 },
    ne: { x: geometry.width, y: 0 },
    sw: { x: 0, y: geometry.height },
    se: { x: geometry.width, y: geometry.height },
  };
}
