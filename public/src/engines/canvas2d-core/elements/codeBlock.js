import { buildTextTitle, createId, sanitizeText } from "../utils.js";

export const CODE_BLOCK_MIN_WIDTH = 220;
export const CODE_BLOCK_MIN_HEIGHT = 84;
export const CODE_BLOCK_FONT_SIZE = 16;
export const CODE_BLOCK_STRUCTURED_IMPORT_KIND = "structured-import-v1";

export function normalizeStructuredCodeBlockMeta(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    kind: CODE_BLOCK_STRUCTURED_IMPORT_KIND,
    sourceNodeType: String(value.sourceNodeType || "").trim() || "codeBlock",
    canonicalFragment: value.canonicalFragment && typeof value.canonicalFragment === "object"
      ? JSON.parse(JSON.stringify(value.canonicalFragment))
      : null,
    sourceMeta: value.sourceMeta && typeof value.sourceMeta === "object" ? { ...value.sourceMeta } : {},
  };
}

export function estimateCodeBlockSize(text = "", fontSize = CODE_BLOCK_FONT_SIZE) {
  const clean = sanitizeText(text || "");
  const lines = clean ? clean.split("\n") : [""];
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return {
    width: Math.max(CODE_BLOCK_MIN_WIDTH, Math.min(920, Math.round(64 + longest * (fontSize * 0.58)))),
    height: Math.max(CODE_BLOCK_MIN_HEIGHT, Math.round(42 + Math.max(1, lines.length) * Math.max(24, fontSize * 1.5))),
  };
}

export function createCodeBlockElement(point, text = "", language = "") {
  const cleanText = sanitizeText(text || "");
  const cleanLanguage = String(language || "").trim().toLowerCase();
  const size = estimateCodeBlockSize(cleanText, CODE_BLOCK_FONT_SIZE);
  return {
    id: createId("code"),
    type: "codeBlock",
    title: buildTextTitle(cleanLanguage ? `${cleanLanguage} 代码块` : "代码块"),
    language: cleanLanguage,
    text: cleanText,
    plainText: cleanText,
    fontSize: CODE_BLOCK_FONT_SIZE,
    width: size.width,
    height: size.height,
    theme: "default",
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    locked: false,
    createdAt: Date.now(),
    structuredImport: null,
  };
}

export function normalizeCodeBlockElement(element = {}) {
  const base = createCodeBlockElement(
    { x: Number(element.x) || 0, y: Number(element.y) || 0 },
    element.text || element.plainText || "",
    element.language || ""
  );
  const cleanText = sanitizeText(element.text || element.plainText || base.text || "");
  const fontSize = Math.max(12, Number(element.fontSize ?? base.fontSize) || base.fontSize);
  const size = estimateCodeBlockSize(cleanText, fontSize);
  return {
    ...base,
    ...element,
    id: String(element.id || base.id),
    type: "codeBlock",
    title: String(element.title || base.title),
    language: String(element.language || base.language).trim().toLowerCase(),
    text: cleanText,
    plainText: sanitizeText(element.plainText || cleanText),
    fontSize,
    width: Math.max(CODE_BLOCK_MIN_WIDTH, Number(element.width ?? size.width) || size.width),
    height: Math.max(CODE_BLOCK_MIN_HEIGHT, Number(element.height ?? size.height) || size.height),
    theme: String(element.theme || base.theme || "default"),
    x: Number(element.x ?? base.x) || 0,
    y: Number(element.y ?? base.y) || 0,
    locked: Boolean(element.locked ?? base.locked),
    createdAt: Number(element.createdAt) || base.createdAt,
    structuredImport: normalizeStructuredCodeBlockMeta(element.structuredImport),
  };
}
