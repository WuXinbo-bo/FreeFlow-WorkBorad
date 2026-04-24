import { buildTextTitle, createId, sanitizeText } from "../utils.js";

export const MATH_MIN_WIDTH = 56;
export const MATH_MIN_HEIGHT = 28;
export const MATH_STRUCTURED_IMPORT_KIND = "structured-import-v1";
export const MATH_RENDER_STATES = Object.freeze({
  READY: "ready",
  FALLBACK: "fallback",
  ERROR: "error",
});

export function normalizeStructuredMathMeta(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    kind: MATH_STRUCTURED_IMPORT_KIND,
    sourceNodeType: String(value.sourceNodeType || "").trim() || "mathBlock",
    canonicalFragment: value.canonicalFragment && typeof value.canonicalFragment === "object"
      ? JSON.parse(JSON.stringify(value.canonicalFragment))
      : null,
    sourceMeta: value.sourceMeta && typeof value.sourceMeta === "object" ? { ...value.sourceMeta } : {},
  };
}

function normalizeMathSourceMeta(value = {}) {
  if (!value || typeof value !== "object") {
    return {};
  }
  const normalized = {};
  if (value.descriptorId != null && String(value.descriptorId).trim()) {
    normalized.descriptorId = String(value.descriptorId).trim();
  }
  if (value.parserId != null && String(value.parserId).trim()) {
    normalized.parserId = String(value.parserId).trim();
  }
  if (value.entryId != null && String(value.entryId).trim()) {
    normalized.entryId = String(value.entryId).trim();
  }
  return normalized;
}

export function createMathElement(point, formula = "", options = {}) {
  const displayMode = Boolean(options.displayMode ?? true);
  const cleanFormula = sanitizeText(formula || "").trim();
  const sourceFormat = normalizeSourceFormat(options.sourceFormat || "latex");
  const size = estimateMathElementSize(cleanFormula, displayMode);
  return {
    id: createId("math"),
    type: displayMode ? "mathBlock" : "mathInline",
    title: buildTextTitle(cleanFormula || (displayMode ? "公式" : "行内公式")),
    formula: cleanFormula,
    sourceFormat,
    displayMode,
    fallbackText: String(options.fallbackText || buildFallbackText(cleanFormula, displayMode)),
    renderState: normalizeMathRenderState(options.renderState || (cleanFormula ? MATH_RENDER_STATES.READY : MATH_RENDER_STATES.FALLBACK)),
    width: size.width,
    height: size.height,
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    locked: false,
    createdAt: Date.now(),
    structuredImport: null,
    sourceMeta: {},
  };
}

export function normalizeMathElement(element = {}) {
  const normalizedType = normalizeMathType(element.type || element.kind || "");
  const displayMode = Object.prototype.hasOwnProperty.call(element, "displayMode")
    ? Boolean(element.displayMode)
    : normalizedType === "mathBlock";
  const base = createMathElement(
    { x: Number(element.x) || 0, y: Number(element.y) || 0 },
    element.formula || element.text || "",
    {
      displayMode,
      sourceFormat: element.sourceFormat || "latex",
      fallbackText: element.fallbackText,
      renderState: element.renderState,
    }
  );
  const cleanFormula = sanitizeText(element.formula || element.text || base.formula || "").trim();
  const size = estimateMathElementSize(cleanFormula, displayMode);
  const structuredImport = normalizeStructuredMathMeta(element.structuredImport);
  const sourceMeta = normalizeMathSourceMeta(element.sourceMeta);
  const mergedSourceMeta = {
    ...normalizeMathSourceMeta(structuredImport?.sourceMeta),
    ...sourceMeta,
  };
  const resolvedStructuredImport = structuredImport
    ? {
      ...structuredImport,
      sourceMeta: mergedSourceMeta,
    }
    : null;
  return {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: displayMode ? "mathBlock" : "mathInline",
    title: String(element.title || base.title),
    formula: cleanFormula,
    sourceFormat: normalizeSourceFormat(element.sourceFormat || base.sourceFormat),
    displayMode,
    fallbackText: String(element.fallbackText || buildFallbackText(cleanFormula, displayMode)),
    renderState: normalizeMathRenderState(element.renderState || base.renderState || MATH_RENDER_STATES.READY),
    width: Math.max(MATH_MIN_WIDTH, Number(element.width ?? size.width) || size.width),
    height: Math.max(MATH_MIN_HEIGHT, Number(element.height ?? size.height) || size.height),
    x: Number(element.x ?? base.x) || 0,
    y: Number(element.y ?? base.y) || 0,
    locked: Boolean(element.locked ?? base.locked),
    createdAt: Number(element.createdAt) || base.createdAt,
    sourceMeta: mergedSourceMeta,
    structuredImport: resolvedStructuredImport,
  };
}

export function estimateMathElementSize(formula = "", displayMode = true) {
  const clean = sanitizeText(formula || "").trim();
  if (displayMode) {
    const lines = clean.split("\n");
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
    return {
      width: Math.max(200, Math.min(920, Math.round(72 + longest * 10.5))),
      height: Math.max(72, Math.round(30 + Math.max(1, lines.length) * 28)),
    };
  }
  return {
    width: Math.max(MATH_MIN_WIDTH, Math.min(420, Math.round(20 + clean.length * 9.2))),
    height: 28,
  };
}

function normalizeMathType(value = "") {
  const type = String(value || "").trim().toLowerCase();
  if (type === "mathinline") {
    return "mathInline";
  }
  return "mathBlock";
}

function normalizeSourceFormat(value = "") {
  const format = String(value || "").trim().toLowerCase();
  return ["latex", "mathml", "omml"].includes(format) ? format : "latex";
}

function buildFallbackText(formula = "", displayMode = true) {
  const clean = sanitizeText(formula || "").trim();
  if (!clean) {
    return displayMode ? "[公式]" : "[行内公式]";
  }
  return displayMode ? `$$${clean}$$` : `$${clean}$`;
}

export function normalizeMathRenderState(value = "") {
  const state = String(value || "").trim().toLowerCase();
  if (!state) {
    return MATH_RENDER_STATES.READY;
  }
  if (state === "fallback-text" || state === "fallback_text") {
    return MATH_RENDER_STATES.FALLBACK;
  }
  if (state === MATH_RENDER_STATES.READY || state === MATH_RENDER_STATES.FALLBACK || state === MATH_RENDER_STATES.ERROR) {
    return state;
  }
  return MATH_RENDER_STATES.READY;
}
