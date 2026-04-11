import { DEFAULT_VIEW } from "./constants.js";
import { getBoardBounds } from "./elements/index.js";
import { clampScale } from "./utils.js";

export function createView(next = {}) {
  return {
    scale: clampScale(next.scale ?? DEFAULT_VIEW.scale),
    offsetX: Number(next.offsetX ?? DEFAULT_VIEW.offsetX) || 0,
    offsetY: Number(next.offsetY ?? DEFAULT_VIEW.offsetY) || 0,
  };
}

export function sceneToScreen(view, point) {
  const scale = clampScale(view?.scale);
  return {
    x: Number(point?.x || 0) * scale + Number(view?.offsetX || 0),
    y: Number(point?.y || 0) * scale + Number(view?.offsetY || 0),
  };
}

export function screenToScene(view, point, rect) {
  const scale = clampScale(view?.scale);
  return {
    x: (Number(point?.x || 0) - Number(rect?.left || 0) - Number(view?.offsetX || 0)) / scale,
    y: (Number(point?.y || 0) - Number(rect?.top || 0) - Number(view?.offsetY || 0)) / scale,
  };
}

export function panView(view, dx, dy) {
  return {
    ...createView(view),
    offsetX: Number(view?.offsetX || 0) + (Number(dx) || 0),
    offsetY: Number(view?.offsetY || 0) + (Number(dy) || 0),
  };
}

export function zoomAtScenePoint(view, nextScale, focusPoint) {
  const currentScale = clampScale(view?.scale);
  const scale = clampScale(nextScale);
  if (scale === currentScale) {
    return createView(view);
  }
  return {
    scale,
    offsetX: Number(view?.offsetX || 0) + Number(focusPoint?.x || 0) * (currentScale - scale),
    offsetY: Number(view?.offsetY || 0) + Number(focusPoint?.y || 0) * (currentScale - scale),
  };
}

export function getViewportCenterScenePoint(view, rect) {
  return screenToScene(
    view,
    {
      x: Number(rect?.left || 0) + Number(rect?.width || 0) / 2,
      y: Number(rect?.top || 0) + Number(rect?.height || 0) / 2,
    },
    rect
  );
}

export function getZoomToFitView(items, viewportRect, padding = 96) {
  const bounds = getBoardBounds(items);
  if (!bounds || !viewportRect?.width || !viewportRect?.height) {
    return createView(DEFAULT_VIEW);
  }
  const availableWidth = Math.max(120, viewportRect.width - padding * 2);
  const availableHeight = Math.max(120, viewportRect.height - padding * 2);
  const scale = clampScale(Math.min(availableWidth / bounds.width, availableHeight / bounds.height, 1));
  const offsetX = viewportRect.width / 2 - (bounds.left + bounds.width / 2) * scale;
  const offsetY = viewportRect.height / 2 - (bounds.top + bounds.height / 2) * scale;
  return createView({ scale, offsetX, offsetY });
}
