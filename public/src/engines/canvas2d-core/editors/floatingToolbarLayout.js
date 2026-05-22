function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
    preferAboveZoom = true,
    anchor = "center",
  } = options;
  const collisionReserve = anchor === "bottom-left" ? 28 : 12;

  const surfaceRect = surface.getBoundingClientRect();
  const surfaceWidth = surfaceRect.width || surface.clientWidth || 0;
  const surfaceHeight = surfaceRect.height || surface.clientHeight || 0;
  if (!surfaceWidth || !surfaceHeight) {
    return null;
  }

  const zoomDock = getZoomDockMetrics(surface, surfaceRect);
  const availableWidthLeftOfZoom = zoomDock
    ? Math.max(0, zoomDock.left - margin - gap - collisionReserve)
    : surfaceWidth - margin * 2;
  const maxToolbarWidth =
    anchor === "bottom-left"
      ? clamp(availableWidthLeftOfZoom || surfaceWidth - margin * 2, 220, Math.max(220, surfaceWidth - margin * 2))
      : surfaceWidth - margin * 2;

  toolbar.style.transformOrigin = "top left";
  toolbar.style.transform = "none";
  toolbar.style.maxWidth = `${Math.round(maxToolbarWidth)}px`;
  toolbar.style.setProperty("--canvas2d-floating-toolbar-max-width", `${Math.round(maxToolbarWidth)}px`);
  toolbar.style.setProperty("--canvas2d-floating-toolbar-scale", "1");
  toolbar.classList.remove("is-wrapped");
  const shouldWrap = toolbar.scrollWidth > maxToolbarWidth + 1;
  toolbar.classList.toggle("is-wrapped", shouldWrap);

  const baseWidth = toolbar.offsetWidth || toolbar.scrollWidth || 0;
  const baseHeight = toolbar.offsetHeight || toolbar.scrollHeight || 0;

  if (!baseWidth || !baseHeight) {
    return null;
  }

  let left =
    anchor === "bottom-left"
      ? margin
      : clamp((surfaceWidth - baseWidth) / 2, margin, Math.max(margin, surfaceWidth - baseWidth - margin));
  let top = Math.max(margin, Math.round(surfaceHeight - baseHeight - margin));

  if (zoomDock) {
    const safeRight = zoomDock.left - gap - collisionReserve;
    const canFitLeftOfZoom = baseWidth <= Math.max(0, safeRight - margin);
    if (anchor !== "bottom-left" && canFitLeftOfZoom) {
      left = clamp(left, margin, Math.max(margin, safeRight - baseWidth));
    }
    if (preferAboveZoom) {
      const aboveTop = zoomDock.top - baseHeight - gap;
      if (aboveTop >= margin) {
        top = Math.min(top, Math.round(aboveTop));
      }
    }
    if (left + baseWidth > safeRight) {
      left = anchor === "bottom-left"
        ? margin
        : clamp(safeRight - baseWidth, margin, Math.max(margin, surfaceWidth - baseWidth - margin));
    }
  }

  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.round(top)}px`;

  return {
    scale: 1,
    left,
    top,
    maxWidth: maxToolbarWidth,
    width: baseWidth,
    height: baseHeight,
  };
}
