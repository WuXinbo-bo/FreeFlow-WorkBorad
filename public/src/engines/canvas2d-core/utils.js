import { MAX_SCALE, MIN_SCALE } from "./constants.js";

export const CANVAS_TEXT_LINE_HEIGHT_RATIO = 1.3;
export const INLINE_FONT_SIZE_ATTR = "data-ff-font-size";
const RICH_TEXT_INLINE_FONT_SIZE_ATTR = "data-ff-font-size";
const CANVAS_RICH_TEXT_BODY_FONT_SIZE = 20;
const CANVAS_RICH_TEXT_FONT_SIZE_TOKENS = Object.freeze([12, 14, 16, 18, 20, 22, 26, 30, 36, 40, 48]);
const RICH_TEXT_CLEANUP_STYLE_PROPERTIES = [
  "lineHeight",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
];

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clampScale(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return 1;
  }
  return clamp(next, MIN_SCALE, MAX_SCALE);
}

export function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function createId(prefix = "c2d") {
  return globalThis.crypto?.randomUUID?.() || `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeText(value = "") {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function sanitizeHtml(value = "") {
  const raw = String(value || "");
  if (!raw) {
    return "";
  }
  if (typeof document === "undefined") {
    return raw.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  }
  const template = document.createElement("template");
  template.innerHTML = raw;
  template.content.querySelectorAll("script,style").forEach((node) => node.remove());
  return template.innerHTML;
}

const RICH_TEXT_BLOCK_TAGS = new Set([
  "div",
  "p",
  "section",
  "article",
  "li",
  "ul",
  "ol",
  "blockquote",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "tr",
  "table",
  "thead",
  "tbody",
  "hr",
]);

function pushTextLineBreak(parts) {
  if (!parts.length) {
    return;
  }
  if (parts[parts.length - 1] === "\n") {
    return;
  }
  parts.push("\n");
}

function collectHtmlPlainText(node, parts) {
  if (!node || !parts) {
    return;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    const value = String(node.nodeValue || "");
    if (value) {
      parts.push(value);
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }
  const element = node;
  const tag = element.tagName.toLowerCase();
  if (tag === "br") {
    pushTextLineBreak(parts);
    return;
  }
  if (tag === "hr") {
    pushTextLineBreak(parts);
    parts.push("---");
    pushTextLineBreak(parts);
    return;
  }
  if (tag === "li") {
    const parentTag = element.parentElement?.tagName?.toLowerCase() || "";
    if (parentTag === "ol") {
      parts.push("1. ");
    } else if (parentTag === "ul" && element.parentElement?.getAttribute("data-ff-task-list") === "true") {
      const state = String(element.getAttribute("data-ff-task-state") || "").trim().toLowerCase();
      parts.push(`- [${state === "done" ? "x" : " "}] `);
    } else if (parentTag === "ul") {
      parts.push("- ");
    }
  }
  element.childNodes.forEach((child) => collectHtmlPlainText(child, parts));
  if (tag === "td" || tag === "th") {
    parts.push("\t");
    return;
  }
  if (RICH_TEXT_BLOCK_TAGS.has(tag)) {
    pushTextLineBreak(parts);
  }
}

function normalizeExtractedPlainText(parts = []) {
  return sanitizeText(parts.join(""))
    .replace(/[ \t\f\v]+\n/g, "\n")
    .replace(/\n[ \t\f\v]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasMeaningfulHtmlContent(element) {
  if (!(element instanceof Element)) {
    return false;
  }
  if (String(element.textContent || "").trim()) {
    return true;
  }
  return Boolean(element.querySelector("img,video,canvas,svg,iframe,embed,object"));
}

function normalizeRichFontSizeValue(value, fallback = 0) {
  const numericValue = Number(String(value || "").replace(/px$/i, ""));
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    const numericFallback = Number(fallback);
    return Number.isFinite(numericFallback) && numericFallback > 0 ? numericFallback : 0;
  }
  return numericValue;
}

function findNearestRichTextFontSizeToken(value, fallback = CANVAS_RICH_TEXT_BODY_FONT_SIZE) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return CANVAS_RICH_TEXT_FONT_SIZE_TOKENS.reduce((best, token) => {
    const bestDistance = Math.abs(best - numeric);
    const tokenDistance = Math.abs(token - numeric);
    if (tokenDistance < bestDistance) {
      return token;
    }
    if (tokenDistance === bestDistance && token === fallback) {
      return token;
    }
    return best;
  }, CANVAS_RICH_TEXT_BODY_FONT_SIZE);
}

function normalizeExternalRichTextFontSize(value, baseFontSize = CANVAS_RICH_TEXT_BODY_FONT_SIZE) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  const logicalBase = Math.max(8, Number(baseFontSize || CANVAS_RICH_TEXT_BODY_FONT_SIZE) || CANVAS_RICH_TEXT_BODY_FONT_SIZE);
  const bodyHigh = logicalBase * 1.15;
  if (numeric <= bodyHigh) {
    return 0;
  }
  return findNearestRichTextFontSizeToken(numeric, logicalBase);
}

function isInsideRichTextHeading(element) {
  return Boolean(element?.closest?.("h1,h2,h3,h4,h5,h6"));
}

function normalizeRichHtmlElement(element) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  const logicalFontSize = normalizeRichFontSizeValue(element.getAttribute(RICH_TEXT_INLINE_FONT_SIZE_ATTR), 0);
  if (logicalFontSize > 0) {
    element.setAttribute(RICH_TEXT_INLINE_FONT_SIZE_ATTR, String(logicalFontSize));
    element.style.fontSize = `${logicalFontSize}px`;
  }

  RICH_TEXT_CLEANUP_STYLE_PROPERTIES.forEach((property) => {
    if (element.style[property]) {
      element.style[property] = "";
    }
  });

  if (!element.getAttribute("style")) {
    element.removeAttribute("style");
  }
}

export function normalizeRichHtml(value = "") {
  const raw = sanitizeHtml(value);
  if (!raw) {
    return "";
  }
  if (typeof document === "undefined") {
    return raw.trim();
  }
  const template = document.createElement("template");
  template.innerHTML = raw;
  template.content.querySelectorAll("p,section,article").forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const replacement = document.createElement("div");
    Array.from(node.attributes).forEach((attr) => replacement.setAttribute(attr.name, attr.value));
    replacement.innerHTML = node.innerHTML;
    node.replaceWith(replacement);
  });
  template.content.querySelectorAll("*").forEach((node) => {
    normalizeRichHtmlElement(node);
  });
  template.content.querySelectorAll("div,li").forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    if (!hasMeaningfulHtmlContent(node)) {
      node.innerHTML = "<br>";
    }
  });
  while (template.content.lastChild instanceof HTMLElement) {
    const tail = template.content.lastChild;
    if (!RICH_TEXT_BLOCK_TAGS.has(tail.tagName.toLowerCase()) || hasMeaningfulHtmlContent(tail)) {
      break;
    }
    template.content.removeChild(tail);
  }
  return template.innerHTML.trim();
}

export function normalizeRichHtmlInlineFontSizes(value = "", baseFontSize = 20) {
  const normalized = normalizeRichHtml(value || "");
  if (!normalized.trim() || typeof document === "undefined") {
    return normalized;
  }
  const logicalBase = Math.max(8, Number(baseFontSize || 20) || 20);
  const template = document.createElement("template");
  template.innerHTML = normalized;
  template.content.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    if (isInsideRichTextHeading(node)) {
      node.removeAttribute(INLINE_FONT_SIZE_ATTR);
      if (node.style.fontSize) {
        node.style.fontSize = "";
      }
      if (node.style.lineHeight) {
        node.style.lineHeight = "";
      }
      if (!node.getAttribute("style")) {
        node.removeAttribute("style");
      }
      return;
    }
    const hasLogicalInlineSize = node.hasAttribute(INLINE_FONT_SIZE_ATTR);
    let logicalSize = Number.parseFloat(String(node.getAttribute(INLINE_FONT_SIZE_ATTR) || ""));
    const rawFontSize = String(node.style.fontSize || "").trim().toLowerCase();
    if (!Number.isFinite(logicalSize) || logicalSize <= 0) {
      if (rawFontSize.endsWith("em")) {
        const ratio = Number.parseFloat(rawFontSize);
        if (Number.isFinite(ratio) && ratio > 0) {
          logicalSize = logicalBase * ratio;
        }
      } else if (rawFontSize.endsWith("px")) {
        const numeric = Number.parseFloat(rawFontSize);
        if (Number.isFinite(numeric) && numeric > 0) {
          logicalSize = numeric;
        }
      }
    }
    if (Number.isFinite(logicalSize) && logicalSize > 0) {
      const normalizedSize = hasLogicalInlineSize
        ? findNearestRichTextFontSizeToken(logicalSize, logicalBase)
        : normalizeExternalRichTextFontSize(logicalSize, logicalBase);
      if (Number.isFinite(normalizedSize) && normalizedSize > 0) {
        node.setAttribute(INLINE_FONT_SIZE_ATTR, String(Math.round(normalizedSize * 100) / 100));
      } else {
        node.removeAttribute(INLINE_FONT_SIZE_ATTR);
      }
    } else {
      node.removeAttribute(INLINE_FONT_SIZE_ATTR);
    }
    if (node.style.fontSize) {
      node.style.fontSize = "";
    }
    if (!node.getAttribute("style")) {
      node.removeAttribute("style");
    }
  });
  return template.innerHTML;
}

export function htmlToPlainText(value = "") {
  const raw = normalizeRichHtml(value);
  if (!raw) {
    return "";
  }
  if (typeof document === "undefined") {
    return sanitizeText(raw.replace(/<[^>]+>/g, " ")).trim();
  }
  const template = document.createElement("template");
  template.innerHTML = raw;
  const parts = [];
  template.content.childNodes.forEach((node) => collectHtmlPlainText(node, parts));
  return normalizeExtractedPlainText(parts);
}

export function truncate(value = "", maxLength = 48) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function isEditableElement(target) {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    Boolean(target?.closest?.('[contenteditable="true"]'))
  );
}

export function pointDistance(a, b) {
  return Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.y || 0) - Number(b?.y || 0));
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export function toFileUrl(path = "") {
  const raw = String(path || "").trim();
  if (!raw) {
    return "";
  }
  if (/^file:\/\//i.test(raw)) {
    return raw;
  }
  const normalized = encodeURI(raw.replace(/\\/g, "/"));
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  if (normalized.startsWith("//")) {
    return `file:${normalized}`;
  }
  return `file://${normalized.startsWith("/") ? "" : "/"}${normalized}`;
}

export function buildLocalFileUrl(path = "") {
  const raw = String(path || "").trim();
  if (!raw) {
    return "";
  }
  const encoded = encodeURIComponent(raw);
  return `/api/local-file?path=${encoded}`;
}

export function resolveImageSource(dataUrl = "", sourcePath = "", options = {}) {
  const cleanDataUrl = String(dataUrl || "").trim();
  if (cleanDataUrl) {
    return cleanDataUrl;
  }
  if (options?.allowLocalFileAccess === false) {
    return "";
  }
  const localUrl = buildLocalFileUrl(sourcePath);
  return localUrl || toFileUrl(sourcePath);
}

export function readImageDimensions(dataUrl = "", sourcePath = "", options = {}) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      resolve({
        width: image.naturalWidth || 0,
        height: image.naturalHeight || 0,
      });
    };
    image.onerror = () => resolve({ width: 0, height: 0 });
    const source = resolveImageSource(dataUrl, sourcePath, options);
    if (!source) {
      resolve({ width: 0, height: 0 });
      return;
    }
    image.src = source;
  });
}

export function fitSize(width, height, maxWidth, maxHeight) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const ratio = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1);
  return {
    width: Math.max(48, Math.round(safeWidth * ratio)),
    height: Math.max(48, Math.round(safeHeight * ratio)),
  };
}

export function getFileName(value = "") {
  const clean = String(value || "").trim();
  if (!clean) {
    return "未命名文件";
  }
  return clean.split(/[\\/]/).pop() || clean;
}

export function getFileBaseName(value = "") {
  const fileName = getFileName(value);
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return fileName;
  }
  return fileName.slice(0, lastDot);
}

export function getFileExtension(value = "") {
  const fileName = getFileName(value);
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return "";
  }
  return fileName.slice(lastDot + 1).toLowerCase();
}

export function formatBytes(value = 0) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

export function buildTextTitle(text = "") {
  const firstLine =
    sanitizeText(text)
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || "文本";
  return truncate(firstLine, 24);
}
