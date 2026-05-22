export const IMPORT_LOG_EVENT_KINDS = Object.freeze({
  TRACE: "import-trace",
  DIFF: "import-diff",
});

export function createImportLogCollector(options = {}) {
  const maxEntries = Number.isFinite(options.maxEntries) ? Math.max(1, Number(options.maxEntries)) : 200;
  let entries = [];

  function getEntries() {
    return entries.slice();
  }

  function clear() {
    entries = [];
  }

  function pushTrace(payload = {}) {
    const entry = buildImportTraceLog(payload);
    entries = trimEntries(entries.concat(entry), maxEntries);
    return entry;
  }

  function pushDiff(payload = {}) {
    const entry = buildImportDiffLog(payload);
    entries = trimEntries(entries.concat(entry), maxEntries);
    return entry;
  }

  return {
    getEntries,
    clear,
    pushTrace,
    pushDiff,
  };
}

export function buildImportTraceLog({
  descriptor,
  parseResult,
  fallbackResult,
  diagnostics,
  switchDecision,
  finalDecision,
  timestamp,
} = {}) {
  const traceTimestamp = normalizeTimestamp(timestamp);
  const descriptorSummary = summarizeDescriptor(descriptor);
  const parseSummary = summarizeParseResult(parseResult);
  const fallbackSummary = summarizeFallbackResult(fallbackResult);
  const diagnosticsSummary = summarizeDiagnostics(diagnostics);
  const decisionSummary = summarizeDecision({ switchDecision, finalDecision });

  return {
    kind: IMPORT_LOG_EVENT_KINDS.TRACE,
    timestamp: traceTimestamp,
    descriptorId: descriptorSummary.descriptorId,
    summary: buildTraceSummary({
      descriptorSummary,
      parseSummary,
      fallbackSummary,
      diagnosticsSummary,
      decisionSummary,
    }),
    descriptor: descriptorSummary,
    parse: parseSummary,
    fallback: fallbackSummary,
    diagnostics: diagnosticsSummary,
    decision: decisionSummary,
  };
}

export function buildImportDiffLog({
  descriptor,
  diagnostics,
  switchDecision,
  finalDecision,
  timestamp,
} = {}) {
  const traceTimestamp = normalizeTimestamp(timestamp);
  const descriptorSummary = summarizeDescriptor(descriptor);
  const diagnosticsSummary = summarizeDiagnostics(diagnostics);
  const decisionSummary = summarizeDecision({ switchDecision, finalDecision });
  const diffAreas = collectDiffAreas({
    diagnosticsSummary,
    decisionSummary,
  });

  return {
    kind: IMPORT_LOG_EVENT_KINDS.DIFF,
    timestamp: traceTimestamp,
    descriptorId: descriptorSummary.descriptorId,
    summary: buildDiffSummary({
      descriptorSummary,
      diagnosticsSummary,
      decisionSummary,
      diffAreas,
    }),
    descriptor: descriptorSummary,
    diagnostics: diagnosticsSummary,
    decision: decisionSummary,
    diffAreas,
  };
}

function summarizeDescriptor(descriptor = {}) {
  const entries = Array.isArray(descriptor.entries) ? descriptor.entries : [];
  return {
    descriptorId: String(descriptor.descriptorId || ""),
    channel: String(descriptor.channel || ""),
    sourceKind: String(descriptor.sourceKind || ""),
    status: String(descriptor.status || ""),
    entryCount: entries.length,
    entryKinds: entries.map((entry) => String(entry?.kind || "")).filter(Boolean),
  };
}

function summarizeParseResult(parseResult = {}) {
  const attempts = Array.isArray(parseResult.attempts) ? parseResult.attempts : [];
  const matches = Array.isArray(parseResult.matches) ? parseResult.matches : [];
  const document = parseResult.document && typeof parseResult.document === "object" ? parseResult.document : null;
  const compatibility = parseResult.compatibility && typeof parseResult.compatibility === "object"
    ? parseResult.compatibility
    : null;

  return {
    status: String(parseResult.status || ""),
    parserId: String(parseResult.parserId || ""),
    attemptCount: attempts.length,
    matchedParserCount: matches.length,
    outputKind: document
      ? "canonical-document"
      : compatibility
        ? "legacy-compatibility"
        : "",
  };
}

function summarizeFallbackResult(fallbackResult = null) {
  if (!fallbackResult || typeof fallbackResult !== "object") {
    return {
      ok: false,
      action: "",
      available: false,
    };
  }

  return {
    ok: fallbackResult.ok === true,
    action: String(fallbackResult.action || ""),
    available: true,
  };
}

function summarizeDiagnostics(diagnostics = null) {
  const safe = diagnostics && typeof diagnostics === "object" ? diagnostics : {};
  const diagnosticList = Array.isArray(safe.diagnostics) ? safe.diagnostics : [];
  const losses = Array.isArray(safe.losses) ? safe.losses : [];

  return {
    score: Number.isFinite(safe.score) ? Number(safe.score) : null,
    grade: String(safe.grade || ""),
    warningCount: diagnosticList.filter((item) => item?.level === "warning").length,
    errorCount: diagnosticList.filter((item) => item?.level === "error").length,
    losses: losses.map((loss) => ({
      area: String(loss?.area || ""),
      message: String(loss?.message || ""),
    })),
  };
}

function summarizeDecision({ switchDecision, finalDecision } = {}) {
  const initial = switchDecision && typeof switchDecision === "object" ? switchDecision : {};
  const final = finalDecision && typeof finalDecision === "object" ? finalDecision : initial;
  const killSwitch = final.killSwitch && typeof final.killSwitch === "object" ? final.killSwitch : null;

  return {
    initialPipeline: String(initial.pipeline || ""),
    finalPipeline: String(final.pipeline || ""),
    switchSource: String(initial.source || ""),
    switchReason: String(initial.reason || ""),
    killSwitchActive: Boolean(killSwitch?.active),
    killSwitchSource: String(killSwitch?.source || ""),
    killSwitchReason: String(killSwitch?.reason || ""),
    overriddenByKillSwitch: final.overriddenByKillSwitch === true,
  };
}

function collectDiffAreas({ diagnosticsSummary, decisionSummary }) {
  const areas = [];

  if (decisionSummary.initialPipeline && decisionSummary.finalPipeline
    && decisionSummary.initialPipeline !== decisionSummary.finalPipeline) {
    areas.push({
      area: "pipeline",
      type: "switched",
      message: `Pipeline changed from ${decisionSummary.initialPipeline} to ${decisionSummary.finalPipeline}.`,
    });
  }

  if (decisionSummary.killSwitchActive) {
    areas.push({
      area: "rollout",
      type: "kill-switch",
      message: `Kill switch forced legacy pipeline via ${decisionSummary.killSwitchSource}.`,
    });
  }

  for (const loss of diagnosticsSummary.losses || []) {
    areas.push({
      area: String(loss.area || ""),
      type: "loss",
      message: String(loss.message || ""),
    });
  }

  return areas;
}

function buildTraceSummary({ descriptorSummary, parseSummary, fallbackSummary, diagnosticsSummary, decisionSummary }) {
  const fragments = [
    descriptorSummary.descriptorId ? `descriptor ${descriptorSummary.descriptorId}` : "descriptor",
    descriptorSummary.sourceKind ? `source ${descriptorSummary.sourceKind}` : "",
    parseSummary.parserId ? `parser ${parseSummary.parserId}` : `parse ${parseSummary.status || "unknown"}`,
    fallbackSummary.available && fallbackSummary.action ? `fallback ${fallbackSummary.action}` : "",
    decisionSummary.finalPipeline ? `pipeline ${decisionSummary.finalPipeline}` : "",
    diagnosticsSummary.grade ? `quality ${diagnosticsSummary.grade}` : "",
  ].filter(Boolean);

  return fragments.join(", ");
}

function buildDiffSummary({ descriptorSummary, diagnosticsSummary, decisionSummary, diffAreas }) {
  const lossCount = Array.isArray(diffAreas) ? diffAreas.length : 0;
  const descriptorLabel = descriptorSummary.descriptorId || "descriptor";
  if (lossCount === 0) {
    return `${descriptorLabel}: no meaningful diff areas detected.`;
  }
  return `${descriptorLabel}: ${lossCount} diff area(s), final pipeline ${decisionSummary.finalPipeline || "unknown"}, quality ${diagnosticsSummary.grade || "unknown"}.`;
}

function normalizeTimestamp(timestamp) {
  if (typeof timestamp === "string" && timestamp.trim()) {
    return timestamp;
  }
  return new Date().toISOString();
}

function trimEntries(entries, maxEntries) {
  if (entries.length <= maxEntries) {
    return entries;
  }
  return entries.slice(entries.length - maxEntries);
}
