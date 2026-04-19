export const RENDER_PAYLOAD_KINDS = Object.freeze({
  CANONICAL_DOCUMENT: "canonical-document",
  LEGACY_COMPATIBILITY: "legacy-compatibility",
  FALLBACK_RESULT: "fallback-result",
  UNKNOWN: "unknown",
});

export const RENDER_MATCH_STATUS = Object.freeze({
  MATCHED: "matched",
  SKIPPED: "skipped",
  RENDERED: "rendered",
  NO_MATCH: "no-match",
  FAILED: "failed",
});

export function createRendererPipeline(options = {}) {
  const registry = new Map();
  const onRegister = typeof options.onRegister === "function" ? options.onRegister : null;
  const onUnregister = typeof options.onUnregister === "function" ? options.onUnregister : null;

  function registerRenderer(renderer) {
    const normalized = normalizeRendererDefinition(renderer);
    registry.set(normalized.id, normalized);
    onRegister?.(normalized);
    return normalized;
  }

  function unregisterRenderer(rendererId) {
    const renderer = registry.get(rendererId) || null;
    if (!renderer) {
      return false;
    }
    registry.delete(rendererId);
    onUnregister?.(renderer);
    return true;
  }

  function getRenderer(rendererId) {
    return registry.get(rendererId) || null;
  }

  function listRenderers() {
    return Array.from(registry.values()).sort(compareRenderers);
  }

  function matchRenderers(pipelineOutput, context = {}) {
    const renderInput = normalizeRenderInput(pipelineOutput);
    return listRenderers()
      .map((renderer) => buildMatchResult(renderer, renderInput, context))
      .filter((match) => match.status === RENDER_MATCH_STATUS.MATCHED)
      .sort(compareMatches);
  }

  async function render(pipelineOutput, context = {}) {
    const renderInput = normalizeRenderInput(pipelineOutput);
    const matches = matchRenderers(pipelineOutput, context);
    if (!matches.length) {
      return {
        ok: false,
        status: RENDER_MATCH_STATUS.NO_MATCH,
        renderInput,
        matches: [],
        error: {
          code: "no-renderer-match",
          message: "No renderer matched the provided parse pipeline output.",
        },
      };
    }

    const attempts = [];
    const successfulResults = [];
    for (const match of matches) {
      const renderer = match.renderer;
      try {
        const result = await renderer.render({
          renderInput,
          pipelineOutput,
          context,
          match,
        });
        attempts.push({
          rendererId: renderer.id,
          status: RENDER_MATCH_STATUS.RENDERED,
          score: match.score,
        });
        successfulResults.push({
          rendererId: renderer.id,
          match,
          result: normalizeRenderResult(result, renderInput, renderer.id),
        });
      } catch (error) {
        attempts.push({
          rendererId: renderer.id,
          status: RENDER_MATCH_STATUS.FAILED,
          score: match.score,
          error: normalizeError(error),
        });
      }
    }

    if (successfulResults.length) {
      const primary = successfulResults[0];
      return {
        ok: true,
        status: RENDER_MATCH_STATUS.RENDERED,
        rendererId: primary.rendererId,
        renderInput,
        match: primary.match,
        attempts,
        result: mergeRenderResults(successfulResults, renderInput),
      };
    }

    return {
      ok: false,
      status: RENDER_MATCH_STATUS.FAILED,
      renderInput,
      matches,
      attempts,
      error: {
        code: "renderer-execution-failed",
        message: "All matched renderers failed while building a render plan.",
      },
    };
  }

  return {
    registerRenderer,
    unregisterRenderer,
    getRenderer,
    listRenderers,
    matchRenderers,
    render,
  };
}

export function normalizeRenderInput(pipelineOutput = {}) {
  const parseResult = pipelineOutput?.parseResult || null;
  const result = parseResult?.result || null;
  if (result?.document?.type === "doc") {
    return {
      kind: RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT,
      descriptorId: String(pipelineOutput?.descriptor?.descriptorId || ""),
      parserId: String(parseResult?.parserId || ""),
      payload: result.document,
      meta: {
        stats: result?.stats || null,
      },
    };
  }
  if (result?.compatibility?.kind === "legacy-element-adapter") {
    return {
      kind: RENDER_PAYLOAD_KINDS.LEGACY_COMPATIBILITY,
      descriptorId: String(pipelineOutput?.descriptor?.descriptorId || ""),
      parserId: String(parseResult?.parserId || ""),
      payload: result.compatibility,
      meta: {
        stats: result?.stats || null,
      },
    };
  }
  if (pipelineOutput?.fallbackResult) {
    return {
      kind: RENDER_PAYLOAD_KINDS.FALLBACK_RESULT,
      descriptorId: String(pipelineOutput?.descriptor?.descriptorId || ""),
      parserId: String(parseResult?.parserId || ""),
      payload: pipelineOutput.fallbackResult,
      meta: {},
    };
  }
  return {
    kind: RENDER_PAYLOAD_KINDS.UNKNOWN,
    descriptorId: String(pipelineOutput?.descriptor?.descriptorId || ""),
    parserId: String(parseResult?.parserId || ""),
    payload: null,
    meta: {},
  };
}

function normalizeRendererDefinition(renderer) {
  if (!renderer || typeof renderer !== "object") {
    throw new Error("renderer definition must be an object");
  }
  const id = String(renderer.id || "").trim();
  if (!id) {
    throw new Error("renderer definition must include a non-empty id");
  }
  if (typeof renderer.render !== "function") {
    throw new Error(`renderer "${id}" must provide a render() function`);
  }

  return {
    id,
    version: String(renderer.version || "0.0.0"),
    displayName: String(renderer.displayName || id),
    priority: normalizePriority(renderer.priority),
    payloadKinds: normalizeStringList(renderer.payloadKinds, Object.values(RENDER_PAYLOAD_KINDS)),
    adapterTypes: normalizeStringList(renderer.adapterTypes),
    tags: normalizeStringList(renderer.tags),
    supports: typeof renderer.supports === "function" ? renderer.supports : null,
    render: renderer.render,
    meta: renderer.meta && typeof renderer.meta === "object" ? { ...renderer.meta } : {},
  };
}

function buildMatchResult(renderer, renderInput, context) {
  const payloadKindMatched =
    !renderer.payloadKinds.length || renderer.payloadKinds.includes(renderInput.kind);
  if (!payloadKindMatched) {
    return {
      renderer,
      status: RENDER_MATCH_STATUS.SKIPPED,
      score: -1,
      reason: "payload-kind-mismatch",
    };
  }

  if (
    renderInput.kind === RENDER_PAYLOAD_KINDS.LEGACY_COMPATIBILITY &&
    renderer.adapterTypes.length &&
    !renderer.adapterTypes.includes(String(renderInput?.payload?.adapterType || ""))
  ) {
    return {
      renderer,
      status: RENDER_MATCH_STATUS.SKIPPED,
      score: -1,
      reason: "adapter-type-mismatch",
    };
  }

  const supportsResult = runSupports(renderer, renderInput, context);
  if (!supportsResult.matched) {
    return {
      renderer,
      status: RENDER_MATCH_STATUS.SKIPPED,
      score: -1,
      reason: supportsResult.reason || "supports-returned-no-match",
    };
  }

  return {
    renderer,
    status: RENDER_MATCH_STATUS.MATCHED,
    score: renderer.priority + supportsResult.score,
    basePriority: renderer.priority,
    supportsScore: supportsResult.score,
    reason: supportsResult.reason || "matched",
  };
}

function runSupports(renderer, renderInput, context) {
  if (!renderer.supports) {
    return { matched: true, score: 0, reason: "no-supports-hook" };
  }
  const result = renderer.supports({ renderInput, context, renderer });
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

function normalizeRenderResult(result, renderInput, rendererId) {
  const plan = result?.plan && typeof result.plan === "object" ? result.plan : result || {};
  return {
    planId: String(plan.planId || `${rendererId}:${renderInput.descriptorId || "render-plan"}`),
    kind: String(plan.kind || "element-render-plan"),
    payloadKind: String(plan.payloadKind || renderInput.kind || RENDER_PAYLOAD_KINDS.UNKNOWN),
    rendererId,
    operations: Array.isArray(plan.operations) ? plan.operations.slice() : [],
    stats: plan.stats && typeof plan.stats === "object" ? { ...plan.stats } : {},
    meta: plan.meta && typeof plan.meta === "object" ? { ...plan.meta } : {},
  };
}

function mergeRenderResults(results, renderInput) {
  const operations = [];
  const stats = {};
  const meta = {
    rendererIds: results.map((entry) => entry.rendererId),
    merged: results.length > 1,
  };
  results.forEach((entry) => {
    const normalized = entry.result || {};
    if (Array.isArray(normalized.operations)) {
      operations.push(...normalized.operations);
    }
    if (normalized.stats && typeof normalized.stats === "object") {
      Object.entries(normalized.stats).forEach(([key, value]) => {
        if (!Number.isFinite(value)) {
          return;
        }
        stats[key] = (stats[key] || 0) + Number(value);
      });
    }
    if (normalized.meta && typeof normalized.meta === "object") {
      meta[entry.rendererId] = { ...normalized.meta };
    }
  });
  return {
    planId: `${results.map((entry) => entry.rendererId).join("+")}:${renderInput.descriptorId || "render-plan"}`,
    kind: "element-render-plan",
    payloadKind: renderInput.kind || RENDER_PAYLOAD_KINDS.UNKNOWN,
    rendererId: results[0]?.rendererId || "",
    operations,
    stats,
    meta,
  };
}

function compareRenderers(a, b) {
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
  return a.renderer.id.localeCompare(b.renderer.id);
}

function normalizePriority(value) {
  const priority = Number(value);
  return Number.isFinite(priority) ? priority : 0;
}

function normalizeStringList(values, allowList = null) {
  if (!Array.isArray(values)) {
    return [];
  }
  const normalized = values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!allowList) {
    return normalized;
  }
  return normalized.filter((value) => allowList.includes(value));
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
