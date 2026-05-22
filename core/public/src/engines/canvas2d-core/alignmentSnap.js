import { sceneToScreen } from "./camera.js";
import { getElementBounds } from "./elements/index.js";

export const DEFAULT_ALIGNMENT_SNAP_CONFIG = Object.freeze({
  enabled: true,
  thresholdPx: 8,
  showGuides: true,
  guideColor: "rgba(59, 130, 246, 0.38)",
  guideLineWidth: 1,
});

export function createAlignmentSnapConfig(overrides = {}) {
  return {
    ...DEFAULT_ALIGNMENT_SNAP_CONFIG,
    ...(overrides && typeof overrides === "object" ? overrides : {}),
  };
}

export function createAlignmentSnapState() {
  return {
    active: false,
    sourceId: "",
    sourceType: "",
    targetId: "",
    targetType: "",
    axisX: null,
    axisY: null,
    snappedScenePoint: null,
    guides: [],
    lastReason: "idle",
  };
}

export function resetAlignmentSnapState(state, reason = "idle") {
  if (!state || typeof state !== "object") {
    return createAlignmentSnapState();
  }
  state.active = false;
  state.sourceId = "";
  state.sourceType = "";
  state.targetId = "";
  state.targetType = "";
  state.axisX = null;
  state.axisY = null;
  state.snappedScenePoint = null;
  state.guides = [];
  state.lastReason = String(reason || "idle");
  return state;
}

export function hasActiveAlignmentSnap(state) {
  return Boolean(state?.active || (Array.isArray(state?.guides) && state.guides.length));
}

export function toScreenSnapPoint(view, scenePoint) {
  return sceneToScreen(view, scenePoint);
}

export function getSnapAnchors(bounds = {}) {
  const left = Number(bounds.left || 0);
  const top = Number(bounds.top || 0);
  const width = Math.max(1, Number(bounds.width || 1));
  const height = Math.max(1, Number(bounds.height || 1));
  const right = Number(bounds.right ?? left + width);
  const bottom = Number(bounds.bottom ?? top + height);
  const centerX = left + width / 2;
  const centerY = top + height / 2;

  return {
    left,
    centerX,
    right,
    top,
    centerY,
    bottom,
  };
}

function isVisibleSnapItem(item) {
  if (!item || typeof item !== "object") {
    return false;
  }
  if (item.type === "flowEdge") {
    return false;
  }
  if (item.hidden === true || item.visible === false) {
    return false;
  }
  return true;
}

function normalizeExcludeIds(activeId = "", options = {}) {
  const exclude = new Set();
  const normalizedActiveId = String(activeId || "").trim();
  if (normalizedActiveId) {
    exclude.add(normalizedActiveId);
  }
  const ids = Array.isArray(options.excludeIds) ? options.excludeIds : [];
  ids.forEach((id) => {
    const value = String(id || "").trim();
    if (value) {
      exclude.add(value);
    }
  });
  return exclude;
}

export function collectSnapCandidates(items = [], activeId = "", options = {}) {
  const excludeIds = normalizeExcludeIds(activeId, options);
  const view = options.view || null;
  const candidates = [];

  items.forEach((item) => {
    if (!isVisibleSnapItem(item)) {
      return;
    }
    const itemId = String(item.id || "").trim();
    if (excludeIds.has(itemId)) {
      return;
    }
    const bounds = getElementBounds(item);
    if (!Number.isFinite(bounds.left) || !Number.isFinite(bounds.top) || bounds.width <= 0 || bounds.height <= 0) {
      return;
    }
    const anchors = getSnapAnchors(bounds);
    const screenAnchors = view
      ? {
          left: toScreenSnapPoint(view, { x: anchors.left, y: anchors.top }).x,
          centerX: toScreenSnapPoint(view, { x: anchors.centerX, y: anchors.top }).x,
          right: toScreenSnapPoint(view, { x: anchors.right, y: anchors.top }).x,
          top: toScreenSnapPoint(view, { x: anchors.left, y: anchors.top }).y,
          centerY: toScreenSnapPoint(view, { x: anchors.left, y: anchors.centerY }).y,
          bottom: toScreenSnapPoint(view, { x: anchors.left, y: anchors.bottom }).y,
        }
      : null;
    const screenBounds = view
      ? {
          left: screenAnchors.left,
          top: screenAnchors.top,
          right: screenAnchors.right,
          bottom: screenAnchors.bottom,
          width: Math.max(1, screenAnchors.right - screenAnchors.left),
          height: Math.max(1, screenAnchors.bottom - screenAnchors.top),
        }
      : null;
    candidates.push({
      id: itemId,
      type: String(item.type || ""),
      item,
      bounds,
      anchors,
      screenAnchors,
      screenBounds,
    });
  });

  return candidates;
}

function createGuide(hit, movedScreenBounds, candidate, axis) {
  if (!hit || !candidate?.screenBounds) {
    return null;
  }
  const margin = 10;
  if (axis === "x") {
    return {
      axis: "x",
      x: hit.screenValue,
      y1: Math.min(movedScreenBounds.top, candidate.screenBounds.top) - margin,
      y2: Math.max(movedScreenBounds.bottom, candidate.screenBounds.bottom) + margin,
    };
  }
  return {
    axis: "y",
    y: hit.screenValue,
    x1: Math.min(movedScreenBounds.left, candidate.screenBounds.left) - margin,
    x2: Math.max(movedScreenBounds.right, candidate.screenBounds.right) + margin,
  };
}

function createAxisHit(axis, sourceKey, targetKey, distancePx, screenValue, sceneValue, candidate) {
  return {
    axis,
    sourceKey,
    targetKey,
    distancePx,
    screenValue,
    sceneValue,
    targetId: candidate?.id || "",
    targetType: candidate?.type || "",
  };
}

function resolveBestAxisHit(sourceKeys, candidateKeys, candidates, thresholdPx) {
  let best = null;
  Object.keys(sourceKeys).forEach((sourceKey) => {
    const sourceValue = Number(sourceKeys[sourceKey]);
    if (!Number.isFinite(sourceValue)) {
      return;
    }
    candidates.forEach((candidate) => {
      const targetValue = Number(candidate?.screenAnchors?.[candidateKeys[sourceKey]]);
      if (!Number.isFinite(targetValue)) {
        return;
      }
      const distancePx = targetValue - sourceValue;
      const absDistance = Math.abs(distancePx);
      if (absDistance > thresholdPx) {
        return;
      }
      if (!best || absDistance < Math.abs(best.distancePx)) {
        best = createAxisHit(
          sourceKey === "left" || sourceKey === "centerX" || sourceKey === "right" ? "x" : "y",
          sourceKey,
          candidateKeys[sourceKey],
          distancePx,
          targetValue,
          candidate.anchors[candidateKeys[sourceKey]],
          candidate
        );
      }
    });
  });
  return best;
}

export function resolveAlignmentSnap({
  view,
  activeItem,
  rawDelta = { x: 0, y: 0 },
  candidates = [],
  config = DEFAULT_ALIGNMENT_SNAP_CONFIG,
} = {}) {
  if (!config?.enabled || !activeItem || !view) {
    return null;
  }

  const scale = Math.max(0.1, Number(view.scale) || 1);
  const thresholdPx = Math.max(1, Number(config.thresholdPx || DEFAULT_ALIGNMENT_SNAP_CONFIG.thresholdPx) || 1);
  const baseBounds = getElementBounds(activeItem);
  const movedBounds = {
    left: baseBounds.left + Number(rawDelta.x || 0),
    top: baseBounds.top + Number(rawDelta.y || 0),
    width: baseBounds.width,
    height: baseBounds.height,
    right: baseBounds.right + Number(rawDelta.x || 0),
    bottom: baseBounds.bottom + Number(rawDelta.y || 0),
  };
  const sceneAnchors = getSnapAnchors(movedBounds);
  const screenAnchors = {
    left: toScreenSnapPoint(view, { x: sceneAnchors.left, y: sceneAnchors.top }).x,
    centerX: toScreenSnapPoint(view, { x: sceneAnchors.centerX, y: sceneAnchors.top }).x,
    right: toScreenSnapPoint(view, { x: sceneAnchors.right, y: sceneAnchors.top }).x,
    top: toScreenSnapPoint(view, { x: sceneAnchors.left, y: sceneAnchors.top }).y,
    centerY: toScreenSnapPoint(view, { x: sceneAnchors.left, y: sceneAnchors.centerY }).y,
    bottom: toScreenSnapPoint(view, { x: sceneAnchors.left, y: sceneAnchors.bottom }).y,
  };
  const movedScreenBounds = {
    left: screenAnchors.left,
    top: screenAnchors.top,
    right: screenAnchors.right,
    bottom: screenAnchors.bottom,
    width: Math.max(1, screenAnchors.right - screenAnchors.left),
    height: Math.max(1, screenAnchors.bottom - screenAnchors.top),
  };

  const hitX = resolveBestAxisHit(
    { left: screenAnchors.left, centerX: screenAnchors.centerX, right: screenAnchors.right },
    { left: "left", centerX: "centerX", right: "right" },
    candidates,
    thresholdPx
  );
  const hitY = resolveBestAxisHit(
    { top: screenAnchors.top, centerY: screenAnchors.centerY, bottom: screenAnchors.bottom },
    { top: "top", centerY: "centerY", bottom: "bottom" },
    candidates,
    thresholdPx
  );

  if (!hitX && !hitY) {
    return null;
  }

  const adjustedDelta = {
    x: Number(rawDelta.x || 0) + (hitX ? hitX.distancePx / scale : 0),
    y: Number(rawDelta.y || 0) + (hitY ? hitY.distancePx / scale : 0),
  };

  const hitTarget = candidates.find((candidate) => candidate.id === (hitX?.targetId || hitY?.targetId || ""));
  const guides = [];
  if (config.showGuides) {
    const guideX = createGuide(hitX, movedScreenBounds, hitTarget, "x");
    const guideY = createGuide(hitY, movedScreenBounds, hitTarget, "y");
    if (guideX) {
      guides.push(guideX);
    }
    if (guideY) {
      guides.push(guideY);
    }
  }

  return {
    active: true,
    sourceId: String(activeItem.id || ""),
    sourceType: String(activeItem.type || ""),
    targetId: hitX?.targetId || hitY?.targetId || "",
    targetType: hitX?.targetType || hitY?.targetType || "",
    axisX: hitX,
    axisY: hitY,
    adjustedDelta,
    snappedScenePoint: {
      x: baseBounds.left + adjustedDelta.x,
      y: baseBounds.top + adjustedDelta.y,
    },
    guides,
  };
}
