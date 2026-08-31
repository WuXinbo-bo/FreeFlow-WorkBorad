export const PRESENTATION_REPRESENTATIONS = Object.freeze({
  LIVE_DETAIL: "live-detail",
  FROZEN_DETAIL: "frozen-detail",
  EXACT_SNAPSHOT: "exact-snapshot",
  NATIVE_COMPACT: "native-compact",
  CULLED: "culled",
});

const DEFAULT_THRESHOLDS = Object.freeze({
  nativeCompactScale: 0.15,
  nativeCompactExitScale: 0.17,
  liveDetailAreaPx: 2600,
  areaHysteresisRatio: 0.12,
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

function getProjectedTextSize(item, definition, scale) {
  const minimumReadableTextPx = Math.max(0, Number(definition?.capabilities?.minimumReadableTextPx) || 0);
  if (!minimumReadableTextPx) return null;
  const nominalFontSizePx = Math.max(1, Number(definition?.capabilities?.nominalFontSizePx) || 16);
  const fontSize = Math.max(1, Number(item?.fontSize) || nominalFontSizePx);
  return Object.freeze({ minimumReadableTextPx, projectedFontSizePx: fontSize * scale });
}

function supportsLayoutSnapshot(definition = null) {
  return definition?.capabilities?.presentation === "layout-snapshot";
}

function supportsExactSnapshot(definition = null) {
  return supportsLayoutSnapshot(definition) || definition?.capabilities?.presentation === "cost-snapshot";
}

function getExactSnapshotCost(registry, item, definition) {
  const threshold = Math.max(0, Number(definition?.capabilities?.exactSnapshotCost) || 0);
  if (!threshold) return null;
  const cost = Math.max(0, Number(registry?.invoke?.(item, "getPresentationCost")) || 0);
  return Object.freeze({ cost, threshold });
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
  interactionProtected,
  attentionProtected,
  scale,
  projectedArea,
  complexity,
  pressure,
  definition,
  thresholds,
  previousEntry,
  textReadability,
  exactSnapshotCost,
}) {
  if (!visible) {
    return { representation: PRESENTATION_REPRESENTATIONS.CULLED, reason: "outside-visible-scene" };
  }
  if (interactionProtected) {
    return { representation: PRESENTATION_REPRESENTATIONS.LIVE_DETAIL, reason: "interaction-protected" };
  }
  const supportsLayoutPreservation = supportsLayoutSnapshot(definition);
  const supportsExactPreservation = supportsExactSnapshot(definition);
  if (attentionProtected) {
    return { representation: PRESENTATION_REPRESENTATIONS.LIVE_DETAIL, reason: "attention-protected" };
  }
  if (supportsExactPreservation && exactSnapshotCost) {
    const boundary = previousEntry?.representation === PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT
      ? exactSnapshotCost.threshold * 0.75
      : exactSnapshotCost.threshold;
    if (exactSnapshotCost.cost >= boundary) {
      return { representation: PRESENTATION_REPRESENTATIONS.EXACT_SNAPSHOT, reason: "high-content-cost" };
    }
  }
  if (scale <= thresholds.nativeCompactScale) {
    if (supportsLayoutPreservation) {
      return { representation: PRESENTATION_REPRESENTATIONS.FROZEN_DETAIL, reason: "extreme-low-scale-frozen" };
    }
    return { representation: PRESENTATION_REPRESENTATIONS.NATIVE_COMPACT, reason: "extreme-low-scale" };
  }
  if (
    supportsLayoutPreservation &&
    previousEntry?.representation === PRESENTATION_REPRESENTATIONS.FROZEN_DETAIL &&
    ["extreme-low-scale-frozen", "frozen-scale-hysteresis"].includes(previousEntry?.reason) &&
    scale < thresholds.nativeCompactExitScale
  ) {
    return { representation: PRESENTATION_REPRESENTATIONS.FROZEN_DETAIL, reason: "frozen-scale-hysteresis" };
  }
  if (
    previousEntry?.representation === PRESENTATION_REPRESENTATIONS.NATIVE_COMPACT &&
    ["extreme-low-scale", "compact-scale-hysteresis"].includes(previousEntry?.reason) &&
    scale < thresholds.nativeCompactExitScale
  ) {
    return { representation: PRESENTATION_REPRESENTATIONS.NATIVE_COMPACT, reason: "compact-scale-hysteresis" };
  }
  if (textReadability) {
    const readabilityExit = textReadability.minimumReadableTextPx * (1 + thresholds.areaHysteresisRatio);
    const retainForReadability =
      [
        PRESENTATION_REPRESENTATIONS.NATIVE_COMPACT,
        PRESENTATION_REPRESENTATIONS.FROZEN_DETAIL,
      ].includes(previousEntry?.representation) &&
      ["insufficient-readable-detail", "readability-hysteresis"].includes(previousEntry?.reason) &&
      textReadability.projectedFontSizePx < readabilityExit;
    if (retainForReadability) {
      return {
        representation: supportsLayoutPreservation
          ? PRESENTATION_REPRESENTATIONS.FROZEN_DETAIL
          : PRESENTATION_REPRESENTATIONS.NATIVE_COMPACT,
        reason: "readability-hysteresis",
      };
    }
    if (textReadability.projectedFontSizePx < textReadability.minimumReadableTextPx) {
      return {
        representation: supportsLayoutPreservation
          ? PRESENTATION_REPRESENTATIONS.FROZEN_DETAIL
          : PRESENTATION_REPRESENTATIONS.NATIVE_COMPACT,
        reason: "insufficient-readable-detail",
      };
    }
  }
  const pressureMultiplier = 1 + pressure * 1.5;
  const complexityMultiplier = Math.max(1, complexity * 0.72);
  const liveDetailThreshold = thresholds.liveDetailAreaPx * pressureMultiplier * complexityMultiplier;
  const hysteresisRatio = Math.max(0, Math.min(0.4, Number(thresholds.areaHysteresisRatio) || 0));
  const liveDetailBoundary = previousEntry?.representation === PRESENTATION_REPRESENTATIONS.LIVE_DETAIL
    ? liveDetailThreshold * (1 - hysteresisRatio)
    : previousEntry
      ? liveDetailThreshold * (1 + hysteresisRatio)
      : liveDetailThreshold;
  if (projectedArea >= liveDetailBoundary) {
    return { representation: PRESENTATION_REPRESENTATIONS.LIVE_DETAIL, reason: "sufficient-projected-detail" };
  }
  if (supportsLayoutPreservation) {
    return { representation: PRESENTATION_REPRESENTATIONS.FROZEN_DETAIL, reason: "stable-frozen-detail" };
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
    previousPlan = null,
  } = {}) {
    const scale = Math.max(0.01, Number(view?.scale) || 1);
    const visible = visibleIds == null ? null : toIdSet(visibleIds);
    const interactionProtectedIds = toIdSet([
      ...interactingIds,
      editingId,
    ]);
    const attentionProtectedIds = toIdSet([
      ...selectedIds,
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
      const textReadability = getProjectedTextSize(item, definition, scale);
      const exactSnapshotCost = getExactSnapshotCost(registry, item, definition);
      const decision = resolveRepresentation({
        visible: visible == null || visible.has(id),
        interactionProtected: interactionProtectedIds.has(id),
        attentionProtected: attentionProtectedIds.has(id),
        scale,
        projectedArea,
        complexity: getElementComplexity(definition),
        pressure: normalizedPressure,
        definition,
        thresholds: policy,
        previousEntry: previousPlan?.entries?.[id] || null,
        textReadability,
        exactSnapshotCost,
      });
      entries[id] = freezeEntry({
        id,
        type: String(definition?.type || item?.type || "unknown"),
        representation: decision.representation,
        reason: decision.reason,
        projectedWidth: Number(projectedWidth.toFixed(2)),
        projectedHeight: Number(projectedHeight.toFixed(2)),
        projectedArea: Number(projectedArea.toFixed(2)),
        projectedFontSize: textReadability
          ? Number(textReadability.projectedFontSizePx.toFixed(2))
          : null,
        presentationCost: exactSnapshotCost ? exactSnapshotCost.cost : null,
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
