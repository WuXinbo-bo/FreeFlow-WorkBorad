function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readOverlayScale(surface) {
  if (!(surface instanceof HTMLElement)) {
    return 1;
  }
  const uiRoot = surface.querySelector(".canvas2d-engine-ui");
  if (!(uiRoot instanceof HTMLElement)) {
    return 1;
  }
  const raw = Number.parseFloat(window.getComputedStyle(uiRoot).getPropertyValue("--canvas2d-overlay-scale"));
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function getZoomDockMetrics(surface, surfaceRect) {
  if (!(surface instanceof HTMLElement)) {
    return null;
  }
  const zoomDock =
    surface.querySelector(".canvas2d-engine-corner-bottom-right .canvas2d-floating-card-zoom") ||
    surface.querySelector(".canvas-zoom-dock");
  if (!(zoomDock instanceof HTMLElement)) {
    return null;
  }
  const rect = zoomDock.getBoundingClientRect();
  return {
    left: rect.left - surfaceRect.left,
    top: rect.top - surfaceRect.top,
    right: rect.right - surfaceRect.left,
    bottom: rect.bottom - surfaceRect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function syncFloatingToolbarLayout(toolbar, surface, options = {}) {
  if (!(toolbar instanceof HTMLElement) || !(surface instanceof HTMLElement)) {
    return null;
  }
  const {
    margin = 8,
    gap = 12,
    minScale = 0.72,
    hardMinScale = 0.56,
    maxScale = 1,
    preferAboveZoom = true,
  } = options;

  const surfaceRect = surface.getBoundingClientRect();
  const surfaceWidth = surfaceRect.width || surface.clientWidth || 0;
  const surfaceHeight = surfaceRect.height || surface.clientHeight || 0;
  const baseWidth = toolbar.offsetWidth || toolbar.scrollWidth || 0;
  const baseHeight = toolbar.offsetHeight || toolbar.scrollHeight || 0;

  if (!surfaceWidth || !surfaceHeight || !baseWidth || !baseHeight) {
    return null;
  }

  const overlayScale = clamp(readOverlayScale(surface), minScale, maxScale);
  const zoomDock = getZoomDockMetrics(surface, surfaceRect);
  const availableWidthLeftOfZoom = zoomDock ? Math.max(0, zoomDock.left - margin - gap) : surfaceWidth - margin * 2;
  let scale = overlayScale;

  if (availableWidthLeftOfZoom > 0) {
    scale = Math.min(scale, availableWidthLeftOfZoom / baseWidth);
  }

  scale = clamp(scale, hardMinScale, maxScale);

  let scaledWidth = baseWidth * scale;
  let scaledHeight = baseHeight * scale;

  let left = clamp((surfaceWidth - scaledWidth) / 2, margin, Math.max(margin, surfaceWidth - scaledWidth - margin));
  let top = Math.max(margin, Math.round(surfaceHeight - scaledHeight - margin));

  if (zoomDock) {
    const safeRight = zoomDock.left - gap;
    const canFitLeftOfZoom = scaledWidth <= Math.max(0, safeRight - margin);
    if (canFitLeftOfZoom) {
      left = clamp(left, margin, Math.max(margin, safeRight - scaledWidth));
    }
    if (preferAboveZoom) {
      const aboveTop = zoomDock.top - scaledHeight - gap;
      if (aboveTop >= margin) {
        top = Math.min(top, Math.round(aboveTop));
      }
    }
    if (left + scaledWidth > safeRight) {
      left = clamp(safeRight - scaledWidth, margin, Math.max(margin, surfaceWidth - scaledWidth - margin));
    }
  }

  toolbar.style.transformOrigin = "top left";
  toolbar.style.transform = `scale(${scale})`;
  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.round(top)}px`;
  toolbar.style.setProperty("--canvas2d-floating-toolbar-scale", String(scale));

  return {
    scale,
    left,
    top,
    width: scaledWidth,
    height: scaledHeight,
  };
}
