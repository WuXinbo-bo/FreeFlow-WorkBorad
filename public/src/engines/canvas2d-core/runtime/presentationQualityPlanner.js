export const PRESENTATION_REPRESENTATIONS = Object.freeze({
  LIVE_DETAIL: "live-detail",
  FROZEN_DETAIL: "frozen-detail",
  EXACT_SNAPSHOT: "exact-snapshot",
  NATIVE_COMPACT: "native-compact",
  CULLED: "culled",
});

const DEFAULT_THRESHOLDS = Object.freeze({
  nativeCompactScale: 0.15,
  liveDetailAreaPx: 2600,
  snapshotAreaPx: 320,
});

function normalizeId(value = "") {
  return String(value || "").trim();
}

function toIdSet(values = []) {
  return new Set((Array.isArray(values) ? values : []).map(normalizeId).filter(Boolean));
}

function clampPressure(value = 0) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function freezeEntry(entry) {
  return Object.freeze({ ...entry });
}

function getElementComplexity(definition = null) {
  const capabilities = definition?.capabilities || {};
  let score = capabilities.render === "canvas-dom" ? 1.5 : 1;
  if (capabilities.overlay && capabilities.overlay !== "none") score += 0.35;
  if (capabilities.resource && capabilities.resource !== "none") score += 0.25;
  if (capabilities.cache === "live") score += 0.2;
  return score;
}

function getBounds(registry, item) {
  const resolved = registry?.invoke?.(item, "getBounds");
  if (resolved) {
    return resolved;
  }
  const left = Number(item?.x || 0);
  const top = Number(item?.y || 0);
  const width = Math.max(1, Number(item?.width) || 1);
  const height = Math.max(1, Number(item?.height) || 1);
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function resolveRepresentation({
  visible,
  pinned,
  scale,
  projectedArea,
  complexity,
  pressure,
  definition,
  thresholds,
}) {
  if (!visible) {
    return { representation: PRESENTATION_REPRESENTATIONS.CULLED, reason: "outside-visible-scene" };
  }
  if (pinned) {
    return { representation: PRESENTATION_REPRESENTATIONS.LIVE_DETAIL, reason: "interaction-protected" };
  }
  if (scale <= thresholds.nativeCompactScale) {
    return { representation: PRESENTATION_REPRESENTATIONS.NATIVE_COMPACT, reason: "extreme-low-scale" };
  }
  const pressureMultiplier = 1 + pressure * 1.5;
  const complexityMultiplier = Math.max(1, complexity * 0.72);
  if (projectedArea >= thresholds.liveDetailAreaPx * pressureMultiplier * complexityMultiplier) {
    return { representation: PRESENTATION_REPRESENTATIONS.LIVE_DETAIL, reason: "sufficient-projected-detail" };
  }
  const supportsExactSnapshot = definition?.capabilities?.render === "canvas-dom";
  if (supportsExactSnapshot) {
    return { representation: PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT, reason: "stable-detail-snapshot" };
  }
  return { representation: PRESENTATION_REPRESENTATIONS.NATIVE_COMPACT, reason: "insufficient-projected-detail" };
}

export function createPresentationQualityPlanner({ registry = null, thresholds = null } = {}) {
  const policy = Object.freeze({ ...DEFAULT_THRESHOLDS, ...(thresholds || {}) });

  function createPlan({
    items = [],
    visibleIds = null,
    selectedIds = [],
    interactingIds = [],
    editingId = "",
    hoverId = "",
    view = null,
    pressure = 0,
    generation = 0,
    revisionKey = "",
  } = {}) {
    const scale = Math.max(0.01, Number(view?.scale) || 1);
    const visible = visibleIds == null ? null : toIdSet(visibleIds);
    const protectedIds = toIdSet([
      ...selectedIds,
      ...interactingIds,
      editingId,
      hoverId,
    ]);
    const normalizedPressure = clampPressure(pressure);
    const entries = {};
    const counts = {};

    (Array.isArray(items) ? items : []).forEach((item) => {
      const id = normalizeId(item?.id);
      if (!id) return;
      const definition = registry?.resolveElement?.(item, { fallback: false }) || null;
      const bounds = getBounds(registry, item);
      const width = Math.max(1, Number(bounds?.width) || Number(bounds?.right) - Number(bounds?.left) || 1);
      const height = Math.max(1, Number(bounds?.height) || Number(bounds?.bottom) - Number(bounds?.top) || 1);
      const projectedWidth = width * scale;
      const projectedHeight = height * scale;
      const projectedArea = projectedWidth * projectedHeight;
      const decision = resolveRepresentation({
        visible: visible == null || visible.has(id),
        pinned: protectedIds.has(id),
        scale,
        projectedArea,
        complexity: getElementComplexity(definition),
        pressure: normalizedPressure,
        definition,
        thresholds: policy,
      });
      entries[id] = freezeEntry({
        id,
        type: String(definition?.type || item?.type || "unknown"),
        representation: decision.representation,
        reason: decision.reason,
        projectedWidth: Number(projectedWidth.toFixed(2)),
        projectedHeight: Number(projectedHeight.toFixed(2)),
        projectedArea: Number(projectedArea.toFixed(2)),
      });
      counts[decision.representation] = (counts[decision.representation] || 0) + 1;
    });

    return Object.freeze({
      generation: Math.max(0, Number(generation) || 0),
      revisionKey: String(revisionKey || ""),
      scale,
      pressure: normalizedPressure,
      entries: Object.freeze(entries),
      stats: Object.freeze({ total: Object.keys(entries).length, counts: Object.freeze(counts) }),
    });
  }

  return Object.freeze({ createPlan, thresholds: policy });
}
