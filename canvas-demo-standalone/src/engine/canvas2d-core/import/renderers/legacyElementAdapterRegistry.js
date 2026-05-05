export const LEGACY_ADAPTER_MATCH_STATUS = Object.freeze({
  MATCHED: "matched",
  SKIPPED: "skipped",
  ADAPTED: "adapted",
  NO_MATCH: "no-match",
  FAILED: "failed",
});

export function createLegacyElementAdapterRegistry(options = {}) {
  const registry = new Map();
  const onRegister = typeof options.onRegister === "function" ? options.onRegister : null;
  const onUnregister = typeof options.onUnregister === "function" ? options.onUnregister : null;

  function registerAdapter(adapter) {
    const normalized = normalizeAdapterDefinition(adapter);
    registry.set(normalized.id, normalized);
    onRegister?.(normalized);
    return normalized;
  }

  function unregisterAdapter(adapterId) {
    const adapter = registry.get(adapterId) || null;
    if (!adapter) {
      return false;
    }
    registry.delete(adapterId);
    onUnregister?.(adapter);
    return true;
  }

  function getAdapter(adapterId) {
    return registry.get(adapterId) || null;
  }

  function listAdapters() {
    return Array.from(registry.values()).sort(compareAdapters);
  }

  function matchAdapters(renderInput, context = {}) {
    const compatibility = normalizeCompatibilityPayload(renderInput);
    return listAdapters()
      .map((adapter) => buildMatchResult(adapter, compatibility, context))
      .filter((match) => match.status === LEGACY_ADAPTER_MATCH_STATUS.MATCHED)
      .sort(compareMatches);
  }

  async function adapt(renderInput, context = {}) {
    const compatibility = normalizeCompatibilityPayload(renderInput);
    if (!compatibility) {
      return {
        ok: false,
        status: LEGACY_ADAPTER_MATCH_STATUS.NO_MATCH,
        compatibility: null,
        matches: [],
        error: {
          code: "invalid-legacy-compatibility",
          message: "Legacy adapter registry requires a legacy compatibility payload.",
        },
      };
    }

    const matches = matchAdapters(renderInput, context);
    if (!matches.length) {
      return {
        ok: false,
        status: LEGACY_ADAPTER_MATCH_STATUS.NO_MATCH,
        compatibility,
        matches: [],
        error: {
          code: "no-legacy-adapter-match",
          message: "No legacy element adapter matched the provided compatibility payload.",
        },
      };
    }

    const attempts = [];
    for (const match of matches) {
      const adapter = match.adapter;
      try {
        const result = await adapter.adapt({
          compatibility,
          renderInput,
          context,
          match,
        });
        attempts.push({
          adapterId: adapter.id,
          status: LEGACY_ADAPTER_MATCH_STATUS.ADAPTED,
          score: match.score,
        });
        return {
          ok: true,
          status: LEGACY_ADAPTER_MATCH_STATUS.ADAPTED,
          adapterId: adapter.id,
          compatibility,
          match,
          attempts,
          result: normalizeAdapterResult(result, compatibility, adapter.id),
        };
      } catch (error) {
        attempts.push({
          adapterId: adapter.id,
          status: LEGACY_ADAPTER_MATCH_STATUS.FAILED,
          score: match.score,
          error: normalizeError(error),
        });
      }
    }

    return {
      ok: false,
      status: LEGACY_ADAPTER_MATCH_STATUS.FAILED,
      compatibility,
      matches,
      attempts,
      error: {
        code: "legacy-adapter-execution-failed",
        message: "All matched legacy adapters failed while building bridge operations.",
      },
    };
  }

  return {
    registerAdapter,
    unregisterAdapter,
    getAdapter,
    listAdapters,
    matchAdapters,
    adapt,
  };
}

export function normalizeCompatibilityPayload(renderInput) {
  const payload = renderInput?.payload;
  if (renderInput?.kind !== "legacy-compatibility" || !payload || payload.kind !== "legacy-element-adapter") {
    return null;
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    kind: "legacy-element-adapter",
    adapterType: String(payload.adapterType || ""),
    parserId: String(payload.parserId || ""),
    descriptorId: String(payload.descriptorId || renderInput?.descriptorId || ""),
    items,
    groups: payload.groups && typeof payload.groups === "object" ? { ...payload.groups } : {},
    meta: renderInput?.meta && typeof renderInput.meta === "object" ? { ...renderInput.meta } : {},
  };
}

function normalizeAdapterDefinition(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("legacy adapter definition must be an object");
  }
  const id = String(adapter.id || "").trim();
  if (!id) {
    throw new Error("legacy adapter definition must include a non-empty id");
  }
  if (typeof adapter.adapt !== "function") {
    throw new Error(`legacy adapter "${id}" must provide an adapt() function`);
  }

  return {
    id,
    version: String(adapter.version || "0.0.0"),
    displayName: String(adapter.displayName || id),
    priority: normalizePriority(adapter.priority),
    adapterTypes: normalizeStringList(adapter.adapterTypes),
    legacyTypes: normalizeStringList(adapter.legacyTypes),
    tags: normalizeStringList(adapter.tags),
    supports: typeof adapter.supports === "function" ? adapter.supports : null,
    adapt: adapter.adapt,
    meta: adapter.meta && typeof adapter.meta === "object" ? { ...adapter.meta } : {},
  };
}

function buildMatchResult(adapter, compatibility, context) {
  if (!compatibility) {
    return {
      adapter,
      status: LEGACY_ADAPTER_MATCH_STATUS.SKIPPED,
      score: -1,
      reason: "missing-compatibility-payload",
    };
  }

  if (adapter.adapterTypes.length && !adapter.adapterTypes.includes(compatibility.adapterType)) {
    return {
      adapter,
      status: LEGACY_ADAPTER_MATCH_STATUS.SKIPPED,
      score: -1,
      reason: "adapter-type-mismatch",
    };
  }

  if (adapter.legacyTypes.length) {
    const compatibilityTypes = new Set(
      (compatibility.items || []).map((item) => String(item?.legacyType || "")).filter(Boolean)
    );
    const overlap = adapter.legacyTypes.some((type) => compatibilityTypes.has(type));
    if (!overlap) {
      return {
        adapter,
        status: LEGACY_ADAPTER_MATCH_STATUS.SKIPPED,
        score: -1,
        reason: "legacy-type-mismatch",
      };
    }
  }

  const supportsResult = runSupports(adapter, compatibility, context);
  if (!supportsResult.matched) {
    return {
      adapter,
      status: LEGACY_ADAPTER_MATCH_STATUS.SKIPPED,
      score: -1,
      reason: supportsResult.reason || "supports-returned-no-match",
    };
  }

  return {
    adapter,
    status: LEGACY_ADAPTER_MATCH_STATUS.MATCHED,
    score: adapter.priority + supportsResult.score,
    basePriority: adapter.priority,
    supportsScore: supportsResult.score,
    reason: supportsResult.reason || "matched",
  };
}

function runSupports(adapter, compatibility, context) {
  if (!adapter.supports) {
    return { matched: true, score: 0, reason: "no-supports-hook" };
  }
  const result = adapter.supports({ compatibility, context, adapter });
  if (typeof result === "boolean") {
    return {
      matched: result,
      score: result ? 0 : -1,
      reason: result ? "supports-boolean-true" : "supports-boolean-false",
    };
  }
  if (typeof result === "number") {
    return {
      matched: result >= 0,
      score: result >= 0 ? result : -1,
      reason: "supports-number",
    };
  }
  if (result && typeof result === "object") {
    return {
      matched: Boolean(result.matched),
      score: Number.isFinite(result.score) ? Number(result.score) : 0,
      reason: typeof result.reason === "string" ? result.reason : "supports-object",
    };
  }
  return {
    matched: false,
    score: -1,
    reason: "supports-invalid-return",
  };
}

function normalizeAdapterResult(result, compatibility, adapterId) {
  const plan = result?.plan && typeof result.plan === "object" ? result.plan : result || {};
  return {
    planId: String(plan.planId || `${adapterId}:${compatibility.descriptorId || "legacy-bridge-plan"}`),
    kind: String(plan.kind || "legacy-bridge-plan"),
    adapterId,
    adapterType: String(plan.adapterType || compatibility.adapterType || ""),
    operations: Array.isArray(plan.operations) ? plan.operations.slice() : [],
    stats: plan.stats && typeof plan.stats === "object" ? { ...plan.stats } : {},
    meta: plan.meta && typeof plan.meta === "object" ? { ...plan.meta } : {},
  };
}

function compareAdapters(a, b) {
  if (b.priority !== a.priority) {
    return b.priority - a.priority;
  }
  return a.id.localeCompare(b.id);
}

function compareMatches(a, b) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  if (b.basePriority !== a.basePriority) {
    return b.basePriority - a.basePriority;
  }
  return a.adapter.id.localeCompare(b.adapter.id);
}

function normalizePriority(value) {
  const priority = Number(value);
  return Number.isFinite(priority) ? priority : 0;
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    name: "Error",
    message: String(error || "Unknown error"),
  };
}
