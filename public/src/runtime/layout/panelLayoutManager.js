import { CONFIG } from "../../config/app.config.js";

const DEFAULT_CANVAS_MIN_WIDTH = 280;
const DEFAULT_CHAT_MIN_WIDTH = 360;

function resolveDefaultPanelWidths(viewportWidth = 0) {
  const preferredLeft = CONFIG.leftPanelDefaultWidth;
  const preferredRight = CONFIG.rightPanelDefaultWidth;
  const preferredTotal = preferredLeft + preferredRight;
  const availableWidth = Math.max(0, Number(viewportWidth) || 0);
  if (!availableWidth || availableWidth >= preferredTotal) {
    return { left: preferredLeft, right: preferredRight };
  }

  if (availableWidth < DEFAULT_CANVAS_MIN_WIDTH + DEFAULT_CHAT_MIN_WIDTH) {
    const left = Math.max(0, Math.round(availableWidth * 0.42));
    return { left, right: Math.max(0, availableWidth - left) };
  }

  const flexibleWidth = availableWidth - DEFAULT_CANVAS_MIN_WIDTH - DEFAULT_CHAT_MIN_WIDTH;
  const preferredLeftGrowth = preferredLeft - DEFAULT_CANVAS_MIN_WIDTH;
  const preferredRightGrowth = preferredRight - DEFAULT_CHAT_MIN_WIDTH;
  const leftGrowthRatio = preferredLeftGrowth / (preferredLeftGrowth + preferredRightGrowth);
  const left = DEFAULT_CANVAS_MIN_WIDTH + Math.round(flexibleWidth * leftGrowthRatio);
  return { left, right: availableWidth - left };
}

function createDefaultPanelLayoutSide(side, { viewportHeight = 0, width = 0 } = {}) {
  const isLeft = side === "left";
  return {
    dockSide: isLeft ? "left" : "right",
    x: 0,
    y: 0,
    width: Number(width) || (isLeft ? CONFIG.leftPanelDefaultWidth : CONFIG.rightPanelDefaultWidth),
    height: Math.max(0, Number(viewportHeight) ? Number(viewportHeight) - 120 : 0),
    collapsed: false,
    hidden: false,
    zIndex: isLeft ? 10 : 14,
    mode: "normal",
    lastNormalFrame: null,
  };
}

export function createDefaultPanelLayout(options = {}) {
  const widths = resolveDefaultPanelWidths(options.viewportWidth);
  return {
    version: CONFIG.panelLayoutVersion,
    left: createDefaultPanelLayoutSide("left", { ...options, width: widths.left }),
    right: createDefaultPanelLayoutSide("right", { ...options, width: widths.right }),
  };
}

function normalizeDockSide(value, fallback) {
  return value === "right" ? "right" : fallback;
}

function normalizePanelLayoutSide(side, input = {}, fallback) {
  const normalizedFallback = fallback || createDefaultPanelLayoutSide(side);
  const fallbackWidth = Number(normalizedFallback.width) || (side === "left" ? CONFIG.leftPanelDefaultWidth : CONFIG.rightPanelDefaultWidth);
  const lastNormalFrame = input?.lastNormalFrame && typeof input.lastNormalFrame === "object"
    ? {
        x: Number.isFinite(Number(input.lastNormalFrame.x)) ? Number(input.lastNormalFrame.x) : normalizedFallback.x,
        y: Number.isFinite(Number(input.lastNormalFrame.y)) ? Number(input.lastNormalFrame.y) : normalizedFallback.y,
        width: Number.isFinite(Number(input.lastNormalFrame.width)) ? Number(input.lastNormalFrame.width) : fallbackWidth,
        height: Number.isFinite(Number(input.lastNormalFrame.height)) ? Number(input.lastNormalFrame.height) : normalizedFallback.height,
      }
    : normalizedFallback.lastNormalFrame || null;
  const mode = typeof input?.mode === "string" ? String(input.mode) : normalizedFallback.mode;
  return {
    dockSide: normalizeDockSide(input?.dockSide, normalizedFallback.dockSide),
    x: Number.isFinite(Number(input?.x)) ? Number(input.x) : normalizedFallback.x,
    y: Number.isFinite(Number(input?.y)) ? Number(input.y) : normalizedFallback.y,
    width: Number.isFinite(Number(input?.width)) ? Number(input.width) : fallbackWidth,
    height: Number.isFinite(Number(input?.height)) ? Number(input.height) : normalizedFallback.height,
    collapsed: Boolean(input?.collapsed ?? normalizedFallback.collapsed),
    hidden: Boolean(input?.hidden ?? normalizedFallback.hidden),
    zIndex: Number.isFinite(Number(input?.zIndex)) ? Number(input.zIndex) : normalizedFallback.zIndex,
    mode: ["normal", "half-left", "half-right", "maximized"].includes(mode) ? mode : "normal",
    lastNormalFrame,
  };
}

export function normalizePanelLayout(input = {}, options = {}) {
  const fallback = createDefaultPanelLayout(options);
  const left = normalizePanelLayoutSide("left", input?.left, fallback.left);
  const right = normalizePanelLayoutSide("right", input?.right, fallback.right);

  if (left.dockSide === right.dockSide) {
    right.dockSide = left.dockSide === "left" ? "right" : "left";
  }

  return {
    version: CONFIG.panelLayoutVersion,
    left,
    right,
  };
}

export function migrateLegacyPanelLayout(legacy = {}, options = {}) {
  const fallback = createDefaultPanelLayout(options);
  const stagePanels = legacy?.stagePanels || {};
  return normalizePanelLayout({
    left: {
      ...fallback.left,
      x: Number(stagePanels?.left?.x) || 0,
      y: Number(stagePanels?.left?.y) || 0,
      width: Number(legacy?.leftWidth) || fallback.left.width,
      collapsed: Boolean(legacy?.leftCollapsed),
      hidden: Boolean(stagePanels?.left?.hidden),
    },
    right: {
      ...fallback.right,
      x: Number(stagePanels?.right?.x) || 0,
      y: Number(stagePanels?.right?.y) || 0,
      width: Number(legacy?.rightWidth) || fallback.right.width,
      collapsed: Boolean(legacy?.rightCollapsed),
      hidden: Boolean(stagePanels?.right?.hidden),
    },
  }, options);
}

export function loadPanelLayout(storage, { migrateLegacy, ...options } = {}) {
  if (!storage) {
    return normalizePanelLayout(migrateLegacy?.() || {}, options);
  }

  try {
    const candidateKeys = [CONFIG.panelLayoutKey, ...(Array.isArray(CONFIG.panelLayoutLegacyKeys) ? CONFIG.panelLayoutLegacyKeys : [])];
    for (const key of candidateKeys) {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const normalized = normalizePanelLayout(parsed, options);
        if (key !== CONFIG.panelLayoutKey || Number(parsed?.version) !== Number(CONFIG.panelLayoutVersion)) {
          normalized.left.hidden = false;
          normalized.left.collapsed = false;
          normalized.left.mode = "normal";
          normalized.right.hidden = false;
          normalized.right.collapsed = false;
          normalized.right.mode = "normal";
        }
        return normalized;
      }
    }
  } catch {
    // Ignore invalid local persistence and fall back to legacy migration/defaults.
  }

  return normalizePanelLayout(migrateLegacy?.() || {}, options);
}

export function savePanelLayout(storage, panelLayout) {
  if (!storage) return;
  try {
    storage.setItem(CONFIG.panelLayoutKey, JSON.stringify(normalizePanelLayout(panelLayout)));
  } catch {
    // Ignore transient storage failures.
  }
}

export function swapPanelLayoutDockSides(panelLayout) {
  const next = normalizePanelLayout(panelLayout);
  const leftDockSide = next.left.dockSide;
  next.left.dockSide = next.right.dockSide;
  next.right.dockSide = leftDockSide;
  return next;
}

export function isPanelLayoutSwapped(panelLayout) {
  return String(panelLayout?.left?.dockSide || "") === "right" && String(panelLayout?.right?.dockSide || "") === "left";
}
