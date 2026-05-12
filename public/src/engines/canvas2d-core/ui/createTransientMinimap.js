import { getBoardBounds, getElementBounds } from "../elements/index.js";
import { getSceneViewportBounds } from "../scene/sceneIndex.js";

const DEFAULT_WIDTH = 188;
const DEFAULT_HEIGHT = 124;
const DEFAULT_PADDING = 12;
const DEFAULT_HIDE_DELAY_MS = 520;
const DEFAULT_MARGIN = 18;
const DEFAULT_SURFACE_FILL = "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(248,250,252,0.76) 100%)";
const DEFAULT_SURFACE_BORDER = "1px solid rgba(255,255,255,0.56)";
const DEFAULT_SURFACE_SHADOW = "0 20px 44px rgba(148, 163, 184, 0.18)";
const DEFAULT_SURFACE_RING = "inset 0 1px 0 rgba(255,255,255,0.72)";
const DEFAULT_CANVAS_FILL = "rgba(255,255,255,0.66)";
const DEFAULT_CANVAS_STROKE = "rgba(191, 219, 254, 0.92)";
const DEFAULT_LABEL_COLOR = "rgba(71, 85, 105, 0.88)";
const DEFAULT_META_COLOR = "rgba(100, 116, 139, 0.76)";
const DEFAULT_VIEWPORT_STROKE = "rgba(37, 99, 235, 0.96)";
const DEFAULT_VIEWPORT_FILL = "rgba(59, 130, 246, 0.12)";
const DEFAULT_ITEM_FILL = "rgba(148, 163, 184, 0.34)";
const DEFAULT_ITEM_STROKE = "rgba(100, 116, 139, 0.78)";
const DEFAULT_TOGGLE_TEXT_COLOR = "rgba(51, 65, 85, 0.88)";

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
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const safeWidth = Math.max(1, Math.round(Number(width || DEFAULT_WIDTH) || DEFAULT_WIDTH));
  const safeHeight = Math.max(1, Math.round(Number(height || DEFAULT_HEIGHT) || DEFAULT_HEIGHT));
  if (canvas.width !== safeWidth) {
    canvas.width = safeWidth;
  }
  if (canvas.height !== safeHeight) {
    canvas.height = safeHeight;
  }
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

function resolveItemFill() {
  return DEFAULT_ITEM_FILL;
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

function resolveAnchorRect(host) {
  const anchor = document.querySelector(".canvas2d-engine-corner-top-left .canvas2d-floating-card-info");
  if (!(anchor instanceof HTMLElement) || !(host instanceof HTMLElement)) {
    return null;
  }
  const anchorRect = anchor.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  return {
    left: Math.max(0, anchorRect.left - hostRect.left),
    top: Math.max(0, anchorRect.top - hostRect.top),
    width: Math.max(0, anchorRect.width),
    height: Math.max(0, anchorRect.height),
    right: Math.max(0, anchorRect.right - hostRect.left),
    bottom: Math.max(0, anchorRect.bottom - hostRect.top),
  };
}

function measureShellWidth(anchor = null) {
  const preferred = Math.round(Number(anchor?.width || DEFAULT_WIDTH) || DEFAULT_WIDTH);
  return Math.max(168, Math.min(236, preferred));
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
  let label = null;
  let toggleButton = null;
  let mounted = false;
  let collapsed = false;
  let lastSceneRevision = -1;
  let lastLayout = null;
  let lastBoardBounds = null;
  let lastViewportBounds = null;
  let lastCanvasWidth = DEFAULT_WIDTH;
  let lastCanvasHeight = DEFAULT_HEIGHT;

  function applyCollapsedState() {
    if (!(shell instanceof HTMLDivElement) || !(canvas instanceof HTMLCanvasElement) || !(label instanceof HTMLDivElement) || !(toggleButton instanceof HTMLButtonElement)) {
      return;
    }
    shell.classList.toggle("is-collapsed", collapsed);
    shell.setAttribute("aria-expanded", collapsed ? "false" : "true");
    canvas.style.display = collapsed ? "none" : "block";
    label.style.display = collapsed ? "none" : "flex";
    shell.style.width = collapsed ? "46px" : `${Math.max(168, Math.round(Number(shell.dataset.expandedWidth || 0) || 0))}px`;
    shell.style.height = collapsed ? "46px" : `${Math.max(88, Math.round(Number(shell.dataset.expandedHeight || 0) || 0))}px`;
    shell.style.padding = collapsed ? "0" : "10px 10px 12px";
    shell.style.borderRadius = collapsed ? "16px" : "24px";
    toggleButton.setAttribute("aria-label", collapsed ? "展开当前位置地图" : "收起当前位置地图");
    toggleButton.setAttribute("title", collapsed ? "展开当前位置地图" : "收起当前位置地图");
    toggleButton.setAttribute("aria-pressed", collapsed ? "true" : "false");
    toggleButton.textContent = collapsed ? "‹" : "–";
  }

  function handleToggleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    collapsed = !collapsed;
    applyCollapsedState();
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
    const canvasX = ((Number(event.clientX || 0) - rect.left) / Math.max(1, rect.width)) * canvas.width;
    const canvasY = ((Number(event.clientY || 0) - rect.top) / Math.max(1, rect.height)) * canvas.height;
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
      shell.className = "canvas2d-transient-minimap";
      shell.setAttribute("aria-hidden", "false");
      shell.style.position = "absolute";
      shell.style.overflow = "hidden";
      shell.style.padding = "10px 10px 12px";
      shell.style.borderRadius = "24px";
      shell.style.background = DEFAULT_SURFACE_FILL;
      shell.style.backdropFilter = "blur(20px) saturate(1.06)";
      shell.style.webkitBackdropFilter = "blur(20px) saturate(1.06)";
      shell.style.boxShadow = `${DEFAULT_SURFACE_SHADOW}, ${DEFAULT_SURFACE_RING}`;
      shell.style.border = DEFAULT_SURFACE_BORDER;
      shell.style.pointerEvents = "auto";
      shell.style.opacity = "1";
      shell.style.transform = "translateY(0) scale(1)";
      shell.style.transition = "width 180ms ease, height 180ms ease, padding 180ms ease, border-radius 180ms ease";
      shell.style.zIndex = "52";
      shell.style.display = "flex";
      shell.style.flexDirection = "column";
      shell.style.gap = "10px";

      toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "canvas2d-transient-minimap-toggle";
      toggleButton.style.position = "absolute";
      toggleButton.style.top = "8px";
      toggleButton.style.right = "8px";
      toggleButton.style.width = "28px";
      toggleButton.style.height = "28px";
      toggleButton.style.border = "0";
      toggleButton.style.borderRadius = "999px";
      toggleButton.style.background = "rgba(255,255,255,0.58)";
      toggleButton.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.8), 0 8px 18px rgba(148, 163, 184, 0.16)";
      toggleButton.style.color = DEFAULT_TOGGLE_TEXT_COLOR;
      toggleButton.style.fontSize = "18px";
      toggleButton.style.lineHeight = "1";
      toggleButton.style.cursor = "pointer";
      toggleButton.style.display = "inline-flex";
      toggleButton.style.alignItems = "center";
      toggleButton.style.justifyContent = "center";
      toggleButton.style.padding = "0";
      toggleButton.style.userSelect = "none";
      toggleButton.addEventListener("click", handleToggleClick);
      shell.appendChild(toggleButton);

      label = document.createElement("div");
      label.className = "canvas2d-transient-minimap-label";
      label.style.fontSize = "11px";
      label.style.fontWeight = "700";
      label.style.letterSpacing = "0.08em";
      label.style.color = DEFAULT_LABEL_COLOR;
      label.style.textAlign = "left";
      label.style.userSelect = "none";
      label.style.padding = "0 4px";
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.justifyContent = "space-between";
      label.style.flexDirection = "row";
      label.style.gap = "8px";
      label.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:8px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:rgba(59,130,246,0.92);box-shadow:0 0 0 4px rgba(191,219,254,0.68);"></span>
          <span>当前位置</span>
        </span>
        <span style="display:inline-flex;align-items:center;justify-content:flex-end;flex:1 1 auto;min-width:0;padding-right:34px;font-size:10px;font-weight:600;color:${DEFAULT_META_COLOR};letter-spacing:0.04em;line-height:1.2;white-space:nowrap;">拖拽定位</span>
      `;
      shell.appendChild(label);

      canvas = createCanvas(DEFAULT_WIDTH, DEFAULT_HEIGHT);
      if (!(canvas instanceof HTMLCanvasElement)) {
        return false;
      }
      canvas.className = "canvas2d-transient-minimap-canvas";
      canvas.style.borderRadius = "18px";
      canvas.style.display = "block";
      canvas.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.76)";
      canvas.style.alignSelf = "stretch";
      canvas.style.cursor = "pointer";
      canvas.addEventListener("pointerdown", handleCanvasPointerDown);
      canvas.addEventListener("click", handleCanvasClick);
      shell.appendChild(canvas);

      host.appendChild(shell);
    } else {
      canvas = shell.querySelector("canvas");
      label = shell.querySelector(".canvas2d-transient-minimap-label");
      toggleButton = shell.querySelector(".canvas2d-transient-minimap-toggle");
    }
    return canvas instanceof HTMLCanvasElement;
  }

  function syncShellMetrics() {
    if (!(shell instanceof HTMLDivElement) || !(canvas instanceof HTMLCanvasElement) || !(host instanceof HTMLElement)) {
      return;
    }
    const anchor = resolveAnchorRect(host);
    const shellWidth = measureShellWidth(anchor);
    const canvasWidth = shellWidth - 20;
    const canvasHeight = DEFAULT_HEIGHT;
    lastCanvasWidth = canvasWidth;
    lastCanvasHeight = canvasHeight;
    shell.dataset.expandedWidth = String(shellWidth);
    shell.dataset.expandedHeight = String(canvasHeight + 42);
    shell.style.width = `${shellWidth}px`;
    shell.style.height = `${canvasHeight + 42}px`;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    setCanvasResolution(canvas, canvasWidth, canvasHeight);
    applyCollapsedState();
  }

  function syncPlacement() {
    if (!(shell instanceof HTMLDivElement) || !(host instanceof HTMLElement)) {
      return;
    }
    const anchor = resolveAnchorRect(host);
    if (!anchor) {
      shell.style.left = `${DEFAULT_MARGIN}px`;
      shell.style.top = `${DEFAULT_MARGIN + 84}px`;
      shell.style.right = "auto";
      shell.style.bottom = "auto";
      return;
    }
    shell.style.left = `${Math.round(anchor.left)}px`;
    shell.style.top = `${Math.round(anchor.bottom + 10)}px`;
    shell.style.right = "auto";
    shell.style.bottom = "auto";
  }

  function renderSnapshotIfNeeded(force = false) {
    if (!(canvas instanceof HTMLCanvasElement)) {
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
    const ctx = clearCanvas(canvas);
    drawBoardSnapshot(ctx, items, lastLayout);
  }

  function renderViewportFrame() {
    if (!(canvas instanceof HTMLCanvasElement) || !lastLayout) {
      return;
    }
    const ctx = clearCanvas(canvas);
    drawBoardSnapshot(ctx, Array.isArray(getItems?.()) ? getItems() : [], lastLayout);
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
  }

  function update(forceSnapshot = false) {
    if (!mounted) {
      return;
    }
    syncShellMetrics();
    syncPlacement();
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
      lastSceneRevision = -1;
      syncShellMetrics();
      update(true);
      applyCollapsedState();
      return true;
    },
    unmount() {
      mounted = false;
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
      label = null;
      toggleButton = null;
    },
    handlePanStart() {
      this.refreshViewport();
    },
    handlePanMove() {
      this.refreshViewport();
    },
    handlePanEnd() {
      this.refreshViewport();
    },
    refreshSceneSnapshot() {
      if (!mounted) {
        return;
      }
      update(true);
    },
    refreshViewport() {
      if (!mounted) {
        return;
      }
      update(false);
    },
    resize() {
      if (!mounted) {
        return;
      }
      update(true);
    },
  };
}
