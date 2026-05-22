function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toRectLike(rect = {}) {
  const left = Number(rect.left) || 0;
  const top = Number(rect.top) || 0;
  const width = Math.max(0, Number(rect.width) || 0);
  const height = Math.max(0, Number(rect.height) || 0);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

export function getViewportBounds(padding = 12) {
  const safePadding = Math.max(0, Number(padding) || 0);
  return {
    left: safePadding,
    top: safePadding,
    right: Math.max(safePadding, window.innerWidth - safePadding),
    bottom: Math.max(safePadding, window.innerHeight - safePadding),
  };
}

export function getMenuBoundaryRect(containerRect, viewportBounds, padding = 12) {
  const safePadding = Math.max(0, Number(padding) || 0);
  const container = toRectLike(containerRect);
  const viewport = {
    left: Number(viewportBounds?.left) || safePadding,
    top: Number(viewportBounds?.top) || safePadding,
    right: Number(viewportBounds?.right) || Math.max(safePadding, window.innerWidth - safePadding),
    bottom: Number(viewportBounds?.bottom) || Math.max(safePadding, window.innerHeight - safePadding),
  };

  const left = Math.max(container.left, viewport.left);
  const top = Math.max(container.top, viewport.top);
  const right = Math.min(container.right, viewport.right);
  const bottom = Math.min(container.bottom, viewport.bottom);

  if (right <= left || bottom <= top) {
    return {
      left: container.left + safePadding,
      top: container.top + safePadding,
      right: Math.max(container.left + safePadding, container.right - safePadding),
      bottom: Math.max(container.top + safePadding, container.bottom - safePadding),
    };
  }

  return { left, top, right, bottom };
}

export function measureFloatingMenu(panelEl, { hiddenClass = "is-hidden" } = {}) {
  if (!(panelEl instanceof HTMLElement)) {
    return { width: 0, height: 0 };
  }

  const wasHidden = panelEl.classList.contains(hiddenClass);
  const previousVisibility = panelEl.style.visibility;
  const previousLeft = panelEl.style.left;
  const previousTop = panelEl.style.top;

  if (wasHidden) {
    panelEl.classList.remove(hiddenClass);
  }

  panelEl.style.visibility = "hidden";
  panelEl.style.left = "0px";
  panelEl.style.top = "0px";

  const rect = panelEl.getBoundingClientRect();

  panelEl.style.visibility = previousVisibility;
  panelEl.style.left = previousLeft;
  panelEl.style.top = previousTop;

  if (wasHidden) {
    panelEl.classList.add(hiddenClass);
  }

  return {
    width: Math.max(0, rect.width || 0),
    height: Math.max(0, rect.height || 0),
  };
}

export function placeMenuNearPoint({
  panelEl,
  clientX,
  clientY,
  containerRect,
  viewportPadding = 12,
  offsetX = 0,
  offsetY = 0,
  minWidth = 220,
  minHeight = 220,
  hiddenClass = "is-hidden",
} = {}) {
  if (!(panelEl instanceof HTMLElement)) {
    return null;
  }

  const safePadding = Math.max(0, Number(viewportPadding) || 0);
  const safeContainerRect = toRectLike(containerRect);
  const viewportBounds = getViewportBounds(safePadding);
  const boundaryRect = getMenuBoundaryRect(safeContainerRect, viewportBounds, safePadding);
  const maxWidth = Math.max(Number(minWidth) || 0, Math.max(120, boundaryRect.right - boundaryRect.left));
  const maxHeight = Math.max(Number(minHeight) || 0, Math.max(120, boundaryRect.bottom - boundaryRect.top));

  panelEl.style.setProperty("max-width", `${Math.round(maxWidth)}px`);
  panelEl.style.setProperty("max-height", `${Math.round(maxHeight)}px`);

  const measured = measureFloatingMenu(panelEl, { hiddenClass });
  const desiredLeft = Number(clientX) + (Number(offsetX) || 0);
  const desiredTop = Number(clientY) + (Number(offsetY) || 0);
  const clampedLeft = clamp(
    desiredLeft,
    boundaryRect.left,
    Math.max(boundaryRect.left, boundaryRect.right - measured.width)
  );
  const clampedTop = clamp(
    desiredTop,
    boundaryRect.top,
    Math.max(boundaryRect.top, boundaryRect.bottom - measured.height)
  );

  panelEl.style.left = `${Math.round(clampedLeft - safeContainerRect.left)}px`;
  panelEl.style.top = `${Math.round(clampedTop - safeContainerRect.top)}px`;
  panelEl.classList.remove(hiddenClass);

  return {
    left: Math.round(clampedLeft),
    top: Math.round(clampedTop),
    width: measured.width,
    height: measured.height,
    boundaryRect,
  };
}

export function placeSubmenuNearTrigger({
  panelEl,
  triggerRect,
  containerRect,
  hostRect,
  viewportPadding = 12,
  gap = 6,
  offsetTop = -6,
  minWidth = 120,
  minHeight = 120,
  hiddenClass = "is-hidden",
} = {}) {
  if (!(panelEl instanceof HTMLElement)) {
    return null;
  }

  const safeGap = Math.max(0, Number(gap) || 0);
  const safeOffsetTop = Number(offsetTop) || 0;
  const safeTriggerRect = toRectLike(triggerRect);
  const safeContainerRect = toRectLike(containerRect);
  const safeHostRect = toRectLike(hostRect || containerRect);
  const viewportBounds = getViewportBounds(viewportPadding);
  const boundaryRect = getMenuBoundaryRect(safeHostRect, viewportBounds, viewportPadding);
  const maxWidth = Math.max(Number(minWidth) || 0, Math.max(120, boundaryRect.right - boundaryRect.left));
  const maxHeight = Math.max(Number(minHeight) || 0, Math.max(120, boundaryRect.bottom - boundaryRect.top));

  panelEl.style.setProperty("max-width", `${Math.round(maxWidth)}px`);
  panelEl.style.setProperty("max-height", `${Math.round(maxHeight)}px`);

  const measured = measureFloatingMenu(panelEl, { hiddenClass });
  const openRightLeft = safeTriggerRect.right + safeGap;
  const openLeftLeft = safeTriggerRect.left - safeGap - measured.width;
  const fitsRight = openRightLeft + measured.width <= boundaryRect.right;
  const fitsLeft = openLeftLeft >= boundaryRect.left;
  const placementX = fitsRight || !fitsLeft ? "right" : "left";
  const desiredLeft = placementX === "right" ? openRightLeft : openLeftLeft;

  const preferredTop = safeTriggerRect.top + safeOffsetTop;
  const clampedTop = clamp(
    preferredTop,
    boundaryRect.top,
    Math.max(boundaryRect.top, boundaryRect.bottom - measured.height)
  );
  const placementY = clampedTop < preferredTop - 1 ? "up" : "down";
  const clampedLeft = clamp(
    desiredLeft,
    boundaryRect.left,
    Math.max(boundaryRect.left, boundaryRect.right - measured.width)
  );

  panelEl.style.left = `${Math.round(clampedLeft - safeContainerRect.left)}px`;
  panelEl.style.top = `${Math.round(clampedTop - safeContainerRect.top)}px`;

  return {
    left: Math.round(clampedLeft),
    top: Math.round(clampedTop),
    width: measured.width,
    height: measured.height,
    placementX,
    placementY,
    boundaryRect,
  };
}
