import { buildTextTitle } from "../utils.js";
import {
  normalizeTextElement,
  TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
  TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH,
  TEXT_RESIZE_MODE_AUTO_WIDTH,
  TEXT_RESIZE_MODE_WRAP,
  TEXT_STRUCTURED_IMPORT_KIND,
  TEXT_WRAP_MODE_MANUAL,
} from "./text.js";
import { normalizeMathElement } from "./math.js";

export function buildTextElementFromMathElement(element = {}, options = {}) {
  const normalizedMath = normalizeMathElement({
    ...element,
    x: Number(options.x ?? element.x) || 0,
    y: Number(options.y ?? element.y) || 0,
  });
  const displayMode = normalizedMath.displayMode !== false;
  const fontSize = Number(options.fontSize) || (displayMode ? 22 : 20);
  const formula = String(normalizedMath.formula || "");
  const html = displayMode
    ? `<div data-role="math-block">${escapeHtml(formula)}</div>`
    : `<span data-role="math-inline">${escapeHtml(formula)}</span>`;
  const sourceMeta = {
    ...(normalizedMath?.structuredImport?.sourceMeta && typeof normalizedMath.structuredImport.sourceMeta === "object"
      ? normalizedMath.structuredImport.sourceMeta
      : {}),
    ...(normalizedMath?.sourceMeta && typeof normalizedMath.sourceMeta === "object" ? normalizedMath.sourceMeta : {}),
  };

  return normalizeTextElement({
    id: String(normalizedMath.id || ""),
    type: "text",
    title: buildTextTitle(formula || (displayMode ? "公式" : "行内公式")),
    text: formula,
    plainText: formula,
    html,
    x: Number(options.x ?? normalizedMath.x) || 0,
    y: Number(options.y ?? normalizedMath.y) || 0,
    width: Number(options.width ?? normalizedMath.width) || normalizedMath.width,
    height: Number(options.height ?? normalizedMath.height) || normalizedMath.height,
    fontSize,
    color: "#0f172a",
    wrapMode: TEXT_WRAP_MODE_MANUAL,
    textBoxLayoutMode: displayMode ? TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT : TEXT_BOX_LAYOUT_MODE_AUTO_WIDTH,
    textResizeMode: displayMode ? TEXT_RESIZE_MODE_WRAP : TEXT_RESIZE_MODE_AUTO_WIDTH,
    locked: Boolean(normalizedMath.locked),
    createdAt: Number(normalizedMath.createdAt) || Date.now(),
    structuredImport: {
      kind: TEXT_STRUCTURED_IMPORT_KIND,
      blockRole: displayMode ? "math-block" : "paragraph",
      sourceNodeType: String(normalizedMath?.structuredImport?.sourceNodeType || (displayMode ? "mathBlock" : "mathInline")),
      listRole: "",
      canonicalFragment:
        normalizedMath?.structuredImport?.canonicalFragment && typeof normalizedMath.structuredImport.canonicalFragment === "object"
          ? JSON.parse(JSON.stringify(normalizedMath.structuredImport.canonicalFragment))
          : {
              type: displayMode ? "mathBlock" : "mathInline",
              attrs: {
                sourceFormat: String(normalizedMath.sourceFormat || "latex"),
                displayMode,
                renderState: String(normalizedMath.renderState || "ready"),
              },
              text: String(normalizedMath.formula || ""),
            },
      sourceMeta,
    },
  });
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
