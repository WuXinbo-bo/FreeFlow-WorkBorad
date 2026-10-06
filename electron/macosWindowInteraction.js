function normalizeRect(rect = {}) {
  const x = Number(rect?.x);
  const y = Number(rect?.y);
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
}

function isPointInsideRect(point = {}, rect = {}) {
  const normalizedRect = normalizeRect(rect);
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!normalizedRect || !Number.isFinite(x) || !Number.isFinite(y)) {
    return false;
  }
  return (
    x >= normalizedRect.x &&
    y >= normalizedRect.y &&
    x < normalizedRect.x + normalizedRect.width &&
    y < normalizedRect.y + normalizedRect.height
  );
}

function isPointInsideAnyRect(point = {}, rects = []) {
  return Array.isArray(rects) && rects.some((rect) => isPointInsideRect(point, rect));
}

function shouldIgnoreMacOSMouseEvents({
  clickThrough = false,
  rendererReady = false,
  bootShapeLocked = true,
  interactionShapeLocked = false,
  shapeRects = [],
  cursorScreenPoint = null,
  contentBounds = null,
} = {}) {
  if (clickThrough) {
    return true;
  }
  if (bootShapeLocked || interactionShapeLocked || !rendererReady || !Array.isArray(shapeRects) || !shapeRects.length) {
    return false;
  }
  const bounds = contentBounds || {};
  const screenX = Number(cursorScreenPoint?.x);
  const screenY = Number(cursorScreenPoint?.y);
  const boundsX = Number(bounds.x);
  const boundsY = Number(bounds.y);
  if (![screenX, screenY, boundsX, boundsY].every(Number.isFinite)) {
    return false;
  }
  const localPoint = {
    x: screenX - boundsX,
    y: screenY - boundsY,
  };
  return !isPointInsideAnyRect(localPoint, shapeRects);
}

module.exports = {
  isPointInsideRect,
  isPointInsideAnyRect,
  shouldIgnoreMacOSMouseEvents,
};
