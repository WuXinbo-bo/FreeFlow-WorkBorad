import { getBoardBounds, getElementBounds } from "../elements/index.js";
import { getSceneViewportBounds } from "../scene/sceneIndex.js";
import { readChromePreference, writeChromePreference } from "./chromePreferences.js";

const DEFAULT_WIDTH = 192;
const DEFAULT_HEIGHT = 112;
const DEFAULT_PADDING = 12;
const DEFAULT_HIDE_DELAY_MS = 800;
const DEFAULT_MARGIN = 18;
const DEFAULT_CANVAS_FILL = "rgba(248,250,252,0.92)";
const DEFAULT_CANVAS_STROKE = "rgba(207, 216, 231, 0.92)";
const DEFAULT_VIEWPORT_STROKE = "rgba(37, 99, 235, 0.96)";
const DEFAULT_VIEWPORT_FILL = "rgba(59, 130, 246, 0.12)";
const DEFAULT_ITEM_FILL = "rgba(148, 163, 184, 0.34)";
const DEFAULT_ITEM_STROKE = "rgba(100, 116, 139, 0.78)";

function createCanvas(width, height) {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function setCanvasResolution(canvas, width, height) {
  const ratio = Math.min(3, Math.max(1, Number(globalThis.devicePixelRatio) || 1));
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const safeWidth = Math.max(1, Math.round(Number(width || DEFAULT_WIDTH) || DEFAULT_WIDTH));
  const safeHeight = Math.max(1, Math.round(Number(height || DEFAULT_HEIGHT) || DEFAULT_HEIGHT));
  if (canvas.width !== Math.round(safeWidth * ratio)) {
    canvas.width = Math.round(safeWidth * ratio);
  }
  if (canvas.height !== Math.round(safeHeight * ratio)) {
    canvas.height = Math.round(safeHeight * ratio);
  }
  canvas.__ffLogicalWidth = safeWidth;
  canvas.__ffLogicalHeight = safeHeight;
}

function normalizeBounds(bounds = null) {
  if (!bounds) {
    return null;
  }
  const left = Number(bounds.left || 0) || 0;
  const top = Number(bounds.top || 0) || 0;
  const right = Number(bounds.right ?? left + (Number(bounds.width || 0) || 0)) || 0;
  const bottom = Number(bounds.bottom ?? top + (Number(bounds.height || 0) || 0)) || 0;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  return {
    left: Math.min(left, right),
    top: Math.min(top, bottom),
    right: Math.max(left, right),
    bottom: Math.max(top, bottom),
    width,
    height,
  };
}

function expandBounds(bounds, padding = DEFAULT_PADDING) {
  const normalized = normalizeBounds(bounds);
  if (!normalized) {
    return null;
  }
  const inset = Math.max(0, Number(padding || 0) || 0);
  return {
    left: normalized.left - inset,
    top: normalized.top - inset,
    right: normalized.right + inset,
    bottom: normalized.bottom + inset,
    width: normalized.width + inset * 2,
    height: normalized.height + inset * 2,
  };
}

function resolveBoardBounds(items = []) {
  const baseBounds = normalizeBounds(getBoardBounds(items));
  if (!baseBounds) {
    return {
      left: -320,
      top: -240,
      right: 320,
      bottom: 240,
      width: 640,
      height: 480,
    };
  }
  return expandBounds(baseBounds, 56);
}

function resolveItemFill(item) {
  return ({ text: "rgba(100,116,139,.38)", image: "rgba(139,92,246,.38)", fileCard: "rgba(14,165,233,.38)", shape: "rgba(16,185,129,.38)" })[item?.type] || DEFAULT_ITEM_FILL;
}

function computeMinimapLayout(boardBounds, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT) {
  const safeWidth = Math.max(120, Number(width || DEFAULT_WIDTH) || DEFAULT_WIDTH);
  const safeHeight = Math.max(88, Number(height || DEFAULT_HEIGHT) || DEFAULT_HEIGHT);
  const normalizedBounds = resolveBoardBounds([]);
  const bounds = normalizeBounds(boardBounds) || normalizedBounds;
  const innerPadding = 10;
  const drawableWidth = Math.max(24, safeWidth - innerPadding * 2);
  const drawableHeight = Math.max(24, safeHeight - innerPadding * 2);
  const scale = Math.min(drawableWidth / Math.max(1, bounds.width), drawableHeight / Math.max(1, bounds.height));
  const contentWidth = bounds.width * scale;
  const contentHeight = bounds.height * scale;
  const offsetX = innerPadding + (drawableWidth - contentWidth) / 2;
  const offsetY = innerPadding + (drawableHeight - contentHeight) / 2;
  return {
    bounds,
    width: safeWidth,
    height: safeHeight,
    scale,
    offsetX,
    offsetY,
  };
}

function mapSceneRectToMinimapRect(rect, layout) {
  const bounds = normalizeBounds(rect);
  if (!bounds || !layout) {
    return null;
  }
  const left = layout.offsetX + (bounds.left - layout.bounds.left) * layout.scale;
  const top = layout.offsetY + (bounds.top - layout.bounds.top) * layout.scale;
  const width = Math.max(2, bounds.width * layout.scale);
  const height = Math.max(2, bounds.height * layout.scale);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function mapMinimapPointToScenePoint(point, layout) {
  if (!layout || !point) {
    return null;
  }
  const localX = Number(point.x || 0) - Number(layout.offsetX || 0);
  const localY = Number(point.y || 0) - Number(layout.offsetY || 0);
  return {
    x: Number(layout.bounds.left || 0) + localX / Math.max(0.0001, Number(layout.scale || 1) || 1),
    y: Number(layout.bounds.top || 0) + localY / Math.max(0.0001, Number(layout.scale || 1) || 1),
  };
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(2, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function clipRoundedRect(ctx, x, y, width, height, radius) {
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.clip();
}

function clearCanvas(canvas) {
  const ctx = canvas?.getContext?.("2d");
  if (!ctx) {
    return null;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / (canvas.__ffLogicalWidth || canvas.width), 0, 0, canvas.height / (canvas.__ffLogicalHeight || canvas.height), 0, 0);
  return ctx;
}

function drawBoardSnapshot(ctx, items = [], layout) {
  if (!ctx || !layout) {
    return;
  }
  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.save();
  clipRoundedRect(ctx, 0.5, 0.5, layout.width - 1, layout.height - 1, 18);
  ctx.fillStyle = DEFAULT_CANVAS_FILL;
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.restore();
  drawRoundedRect(ctx, 0.5, 0.5, layout.width - 1, layout.height - 1, 18);
  ctx.strokeStyle = DEFAULT_CANVAS_STROKE;
  ctx.lineWidth = 1;
  ctx.stroke();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || item.type === "flowEdge" || item.type === "mindRelationship") {
      continue;
    }
    const bounds = getElementBounds(item);
    const rect = mapSceneRectToMinimapRect(bounds, layout);
    if (!rect) {
      continue;
    }
    const width = Math.max(2, rect.width);
    const height = Math.max(2, rect.height);
    ctx.fillStyle = resolveItemFill(item);
    drawRoundedRect(ctx, rect.left, rect.top, width, height, Math.min(8, Math.min(width, height) * 0.24));
    ctx.fill();
    ctx.strokeStyle = DEFAULT_ITEM_STROKE;
    ctx.lineWidth = width <= 6 || height <= 6 ? 0.85 : 1;
    ctx.stroke();
  }
}

function drawViewportFrame(ctx, viewportBounds, layout) {
  if (!ctx || !layout) {
    return;
  }
  const rect = mapSceneRectToMinimapRect(viewportBounds, layout);
  if (!rect) {
    return;
  }
  ctx.save();
  ctx.fillStyle = DEFAULT_VIEWPORT_FILL;
  ctx.strokeStyle = DEFAULT_VIEWPORT_STROKE;
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, rect.left, rect.top, rect.width, rect.height, 8);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function createTransientMinimap({
  getItems,
  getView,
  getViewportSize,
  getSceneRevision,
  onNavigate,
} = {}) {
  let host = null;
  let shell = null;
  let canvas = null;
  let snapshotCanvas = null;
  let label = null;
  let toggleButton = null;
  let mounted = false;
  let collapsed = readChromePreference("minimapCollapsed", true);
  let pinned = !collapsed;
  let suppressGesture = false;
  let hovered = false;
  let hideTimer = 0;
  let lastNavigationAt = 0;
  let occluded = false;

  function clearHideTimer() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = 0;
  }

  function resetTransient() {
    clearHideTimer();
    suppressGesture = false;
    lastNavigationAt = 0;
    hovered = false;
    collapsed = !pinned;
    applyCollapsedState();
  }

  function scheduleHide() {
    clearHideTimer();
    hideTimer = setTimeout(() => {
      hideTimer = 0;
      suppressGesture = false;
      if (!pinned && !hovered && !shell?.querySelector(":focus-visible")) {
        collapsed = true;
        applyCollapsedState();
        schedulePlacement();
      }
    }, DEFAULT_HIDE_DELAY_MS);
  }

  function handlePointerEnter() { hovered = true; }
  function handlePointerLeave() { hovered = false; scheduleHide(); }
  function handleFocusOut() { scheduleHide(); }

  function handleNavigation() {
    if (!mounted || document.hidden) return;
    const now = Date.now();
    if (now - lastNavigationAt >= DEFAULT_HIDE_DELAY_MS) suppressGesture = false;
    lastNavigationAt = now;
    if (!pinned && !suppressGesture && collapsed) {
      collapsed = false;
      applyCollapsedState();
      schedulePlacement();
    }
    scheduleHide();
  }
  let lastSceneRevision = -1;
  let lastLayout = null;
  let lastBoardBounds = null;
  let lastViewportBounds = null;
  let lastCanvasWidth = DEFAULT_WIDTH;
  let lastCanvasHeight = DEFAULT_HEIGHT;
  let snapshotRenderCount = 0;
  let viewportRenderCount = 0;
  let placementObserver = null;
  let sizeObserver = null;
  let observedZoom = null;
  let observedNavigation = null;
  let placementFrame = 0;

  function schedulePlacement() {
    if (!mounted || placementFrame) return;
    placementFrame = requestAnimationFrame(() => {
      placementFrame = 0;
      if (mounted) {
        syncPlacement();
        if (!collapsed && !occluded && !document.hidden) {
          renderSnapshotIfNeeded();
          renderViewportFrame();
        }
      }
    });
  }

  function handleVisibilityChange() {
    if (document.hidden) resetTransient();
    else update();
  }

  function syncDebugStats() {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    canvas.__ffMinimapStats = Object.freeze({
      snapshotRenderCount,
      viewportRenderCount,
      sceneRevision: lastSceneRevision,
      pixelRatio: canvas.width / lastCanvasWidth,
    });
  }

  function applyCollapsedState() {
    if (!(shell instanceof HTMLDivElement) || !(canvas instanceof HTMLCanvasElement) || !(label instanceof HTMLDivElement) || !(toggleButton instanceof HTMLButtonElement)) {
      return;
    }
    shell.classList.toggle("is-collapsed", collapsed);
    shell.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggleButton.setAttribute("aria-label", collapsed ? "展开当前位置地图" : "收起当前位置地图");
    toggleButton.setAttribute("title", collapsed ? "展开当前位置地图" : "收起当前位置地图");
    toggleButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggleButton.innerHTML = collapsed ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z M9 3v16 M15 5v16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>' : "–";
  }

  function handleToggleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    clearHideTimer();
    collapsed = !collapsed;
    pinned = !collapsed;
    suppressGesture = collapsed;
    if (collapsed) lastNavigationAt = Date.now();
    if (collapsed) scheduleHide();
    writeChromePreference("minimapCollapsed", collapsed);
    applyCollapsedState();
    update();
  }

  function handleCanvasPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleCanvasClick(event) {
    if (!(canvas instanceof HTMLCanvasElement) || !lastLayout || typeof onNavigate !== "function") {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const canvasX = ((Number(event.clientX || 0) - rect.left) / Math.max(1, rect.width)) * lastCanvasWidth;
    const canvasY = ((Number(event.clientY || 0) - rect.top) / Math.max(1, rect.height)) * lastCanvasHeight;
    const scenePoint = mapMinimapPointToScenePoint({ x: canvasX, y: canvasY }, lastLayout);
    if (!scenePoint) {
      return;
    }
    onNavigate(scenePoint);
  }

  function ensureDom(container) {
    if (!(container instanceof HTMLElement)) {
      return false;
    }
    host = container;
    shell = host.querySelector("#canvas2d-transient-minimap");
    if (!(shell instanceof HTMLDivElement)) {
      shell = document.createElement("div");
      shell.id = "canvas2d-transient-minimap";
      shell.className = "canvas2d-transient-minimap canvas-chrome-surface canvas-chrome-minimap";
      shell.setAttribute("aria-hidden", "false");
      shell.addEventListener("pointerenter", handlePointerEnter);
      shell.addEventListener("pointerleave", handlePointerLeave);
      shell.addEventListener("focusout", handleFocusOut);

      toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "canvas2d-transient-minimap-toggle";
      toggleButton.addEventListener("click", handleToggleClick);
      shell.appendChild(toggleButton);

      label = document.createElement("div");
      label.className = "canvas2d-transient-minimap-label";
      label.innerHTML = `
        <span class="canvas2d-transient-minimap-title">
          <span class="canvas2d-transient-minimap-status-dot"></span>
          <span>当前位置</span>
        </span>
      `;
      shell.appendChild(label);

      canvas = createCanvas(DEFAULT_WIDTH, DEFAULT_HEIGHT);
      if (!(canvas instanceof HTMLCanvasElement)) {
        return false;
      }
      canvas.className = "canvas2d-transient-minimap-canvas";
      canvas.addEventListener("pointerdown", handleCanvasPointerDown);
      canvas.addEventListener("click", handleCanvasClick);
      shell.appendChild(canvas);
      snapshotCanvas = createCanvas(DEFAULT_WIDTH, DEFAULT_HEIGHT);

      host.appendChild(shell);
    } else {
      canvas = shell.querySelector("canvas");
      label = shell.querySelector(".canvas2d-transient-minimap-label");
      toggleButton = shell.querySelector(".canvas2d-transient-minimap-toggle");
      snapshotCanvas = createCanvas(canvas?.width || DEFAULT_WIDTH, canvas?.height || DEFAULT_HEIGHT);
    }
    return canvas instanceof HTMLCanvasElement;
  }

  function syncShellMetrics() {
    if (!(shell instanceof HTMLDivElement) || !(canvas instanceof HTMLCanvasElement) || !(host instanceof HTMLElement)) {
      return;
    }
    const shellWidth = DEFAULT_WIDTH;
    const canvasWidth = shellWidth - 16;
    const canvasHeight = DEFAULT_HEIGHT;
    lastCanvasWidth = canvasWidth;
    lastCanvasHeight = canvasHeight;
    shell.dataset.expandedWidth = String(shellWidth);
    shell.dataset.expandedHeight = String(canvasHeight + 38);
    shell.style.setProperty("--canvas-chrome-minimap-expanded-width", `${shellWidth}px`);
    shell.style.setProperty("--canvas-chrome-minimap-expanded-height", `${canvasHeight + 38}px`);
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    const previousPixelWidth = canvas.width;
    setCanvasResolution(canvas, canvasWidth, canvasHeight);
    if (canvas.width !== previousPixelWidth) lastSceneRevision = -1;
    setCanvasResolution(snapshotCanvas, canvasWidth, canvasHeight);
    applyCollapsedState();
  }

  function syncPlacement() {
    if (!(shell instanceof HTMLDivElement) || !(host instanceof HTMLElement)) {
      return;
    }
    const stage = host.closest(".canvas-engine-stage, .canvas-office-main") || host;
    const controls = stage.closest(".desktop-clear-stage")?.querySelector('[data-stage-panel-controls="left"]');
    if (sizeObserver && controls !== observedZoom) {
      if (observedZoom) sizeObserver.unobserve(observedZoom);
      observedZoom = controls || null;
      if (observedZoom) sizeObserver.observe(observedZoom);
    }
    const navigation = stage?.querySelector(".canvas2d-navigation-docks");
    if (sizeObserver && navigation !== observedNavigation) {
      if (observedNavigation) sizeObserver.unobserve(observedNavigation);
      observedNavigation = navigation || null;
      if (observedNavigation) sizeObserver.observe(observedNavigation);
    }
    const hostRect = host.getBoundingClientRect();
    const obstacles = Array.from(stage?.querySelectorAll(".canvas2d-navigation-docks, .canvas2d-engine-toolbar, .canvas-chrome-utility-dock") || [])
      .filter((element) => getComputedStyle(element).display !== "none")
      .map((element) => element.getBoundingClientRect());
    const controlsRect = controls?.getBoundingClientRect();
    const width = collapsed ? 38 : DEFAULT_WIDTH;
    const height = collapsed ? 38 : DEFAULT_HEIGHT + 38;
    let left = Math.max(8, controlsRect?.width ? controlsRect.left - hostRect.left : DEFAULT_MARGIN);
    let top = Math.max(8, controlsRect?.height ? controlsRect.bottom - hostRect.top + 10 : 52);
    const overlaps = (rect) => rect.left < hostRect.left + left + width + 8 && rect.right > hostRect.left + left - 8 &&
      rect.top < hostRect.top + top + height + 8 && rect.bottom > hostRect.top + top - 8;
    for (const obstacle of obstacles) {
      if (!overlaps(obstacle)) continue;
      if (obstacle.bottom - hostRect.top + height + 10 <= host.clientHeight - 8) top = obstacle.bottom - hostRect.top + 10;
      else left = obstacle.right - hostRect.left + 10;
    }
    const wasOccluded = occluded;
    occluded = top + height > host.clientHeight - 8 || left + width > host.clientWidth - 8 || obstacles.some(overlaps);
    shell.style.visibility = occluded ? "hidden" : "visible";
    shell.style.pointerEvents = occluded || collapsed ? "none" : "auto";
    shell.setAttribute("aria-hidden", String(occluded));
    shell.style.left = `${Math.round(left)}px`;
    shell.style.top = `${Math.round(top)}px`;
    shell.style.right = "auto";
    shell.style.bottom = "auto";
    if (wasOccluded && !occluded && !collapsed) lastSceneRevision = -1;
  }

  function renderSnapshotIfNeeded(force = false) {
    if (!(canvas instanceof HTMLCanvasElement) || !(snapshotCanvas instanceof HTMLCanvasElement)) {
      return;
    }
    const sceneRevision = Math.max(0, Number(getSceneRevision?.() || 0) || 0);
    const items = Array.isArray(getItems?.()) ? getItems() : [];
    if (!force && sceneRevision === lastSceneRevision && lastLayout && lastBoardBounds) {
      return;
    }
    lastSceneRevision = sceneRevision;
    lastBoardBounds = resolveBoardBounds(items);
    lastLayout = computeMinimapLayout(lastBoardBounds, lastCanvasWidth, lastCanvasHeight);
    const ctx = clearCanvas(snapshotCanvas);
    drawBoardSnapshot(ctx, items, lastLayout);
    snapshotRenderCount += 1;
    syncDebugStats();
  }

  function renderViewportFrame() {
    if (!(canvas instanceof HTMLCanvasElement) || !(snapshotCanvas instanceof HTMLCanvasElement) || !lastLayout) {
      return;
    }
    const ctx = clearCanvas(canvas);
    ctx.drawImage(snapshotCanvas, 0, 0, lastCanvasWidth, lastCanvasHeight);
    const viewport = getViewportSize?.();
    const view = getView?.();
    lastViewportBounds = normalizeBounds(
      getSceneViewportBounds(
        view,
        Math.max(1, Number(viewport?.width || 0) || 1),
        Math.max(1, Number(viewport?.height || 0) || 1),
        0
      )
    );
    drawViewportFrame(ctx, lastViewportBounds, lastLayout);
    viewportRenderCount += 1;
    syncDebugStats();
  }

  function update(forceSnapshot = false) {
    if (!mounted) {
      return;
    }
    syncShellMetrics();
    syncPlacement();
    if (collapsed || occluded || document.hidden) {
      if (forceSnapshot) lastSceneRevision = -1;
      return;
    }
    renderSnapshotIfNeeded(forceSnapshot);
    renderViewportFrame();
  }

  return {
    mount(container) {
      if (mounted && host === container) {
        return true;
      }
      this.unmount();
      if (!ensureDom(container)) {
        return false;
      }
      mounted = true;
      document.addEventListener("visibilitychange", handleVisibilityChange);
      sizeObserver = new ResizeObserver(schedulePlacement);
      sizeObserver.observe(host);
      sizeObserver.observe(shell);
      const stage = host.closest(".canvas-engine-stage, .canvas-office-main") || host.parentElement;
      const placementSelector = ".canvas2d-navigation-docks, .canvas2d-navigator-panel, .canvas2d-navigator-tab, .canvas2d-floating-card-zoom, .canvas2d-workspace-panel, .stage-panel-controls, .canvas2d-engine-toolbar-wrap, .canvas2d-engine-search-stack";
      // React replaces directory DOM after the board update; measure that committed layout.
      placementObserver = new MutationObserver((records) => {
        if (records.some((record) => record.type === "attributes"
          ? record.target.matches?.(placementSelector)
          : [...record.addedNodes, ...record.removedNodes].some((node) => node.matches?.(placementSelector) || node.querySelector?.(placementSelector)))) {
          schedulePlacement();
        }
      });
      if (stage) placementObserver.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
      lastSceneRevision = -1;
      snapshotRenderCount = 0;
      viewportRenderCount = 0;
      syncShellMetrics();
      update(true);
      applyCollapsedState();
      return true;
    },
    resetTransient,
    handleZoom: handleNavigation,
    unmount() {
      resetTransient();
      mounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      placementObserver?.disconnect();
      sizeObserver?.disconnect();
      placementObserver = null;
      sizeObserver = null;
      observedZoom = null;
      observedNavigation = null;
      if (placementFrame) cancelAnimationFrame(placementFrame);
      placementFrame = 0;
      lastSceneRevision = -1;
      lastLayout = null;
      lastBoardBounds = null;
      lastViewportBounds = null;
      if (shell instanceof HTMLDivElement) {
        shell.remove();
      }
      host = null;
      shell = null;
      canvas = null;
      snapshotCanvas = null;
      label = null;
      toggleButton = null;
    },
    handlePanStart() {
      handleNavigation();
      this.refreshViewport();
    },
    handlePanMove() {
      handleNavigation();
      this.refreshViewport();
    },
    handlePanEnd() {
      scheduleHide();
      this.refreshViewport();
    },
    refreshSceneSnapshot() {
      if (!mounted) {
        return;
      }
      lastSceneRevision = -1;
      schedulePlacement();
    },
    refreshViewport() {
      if (!mounted || collapsed || occluded || document.hidden) {
        return;
      }
      schedulePlacement();
    },
    resize() {
      if (!mounted) {
        return;
      }
      update(true);
    },
    getStats() {
      return {
        snapshotRenderCount,
        viewportRenderCount,
        sceneRevision: lastSceneRevision,
      };
    },
  };
}
