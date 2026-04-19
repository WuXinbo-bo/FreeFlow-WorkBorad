import { buildTextTitle, createId, sanitizeText } from "../utils.js";

export const MATH_MIN_WIDTH = 56;
export const MATH_MIN_HEIGHT = 28;
export const MATH_STRUCTURED_IMPORT_KIND = "structured-import-v1";

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
    renderState: String(options.renderState || (cleanFormula ? "ready" : "fallback-text")),
    width: size.width,
    height: size.height,
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    locked: false,
    createdAt: Date.now(),
    structuredImport: null,
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
    renderState: String(element.renderState || base.renderState || "ready"),
    width: Math.max(MATH_MIN_WIDTH, Number(element.width ?? size.width) || size.width),
    height: Math.max(MATH_MIN_HEIGHT, Number(element.height ?? size.height) || size.height),
    x: Number(element.x ?? base.x) || 0,
    y: Number(element.y ?? base.y) || 0,
    locked: Boolean(element.locked ?? base.locked),
    createdAt: Number(element.createdAt) || base.createdAt,
    structuredImport: normalizeStructuredMathMeta(element.structuredImport),
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
