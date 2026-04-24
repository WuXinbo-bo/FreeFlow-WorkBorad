import { sanitizeText } from "../utils.js";
import { getCodeBlockSceneMetrics } from "./measureCodeBlockLayout.js";
import { isMermaidCodeBlock } from "../elements/codeBlock.js";

const HIGHLIGHT_CACHE_LIMIT = 180;
const highlightCache = new Map();
const pendingHighlightTasks = new WeakMap();

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildLineNumberHtml(lineCount = 1) {
  return Array.from({ length: Math.max(1, lineCount) }, (_, index) => `<span>${index + 1}</span>`).join("");
}

function buildCodeLineHtml(code = "", lineCount = 1) {
  const lines = sanitizeText(code).split("\n");
  const safeLines = lines.length ? lines : [""];
  return safeLines
    .map((_, index) => `<span data-line="${index + 1}"></span>`)
    .concat(Array.from({ length: Math.max(0, lineCount - safeLines.length) }, (_, offset) => `<span data-line="${safeLines.length + offset + 1}"></span>`))
    .join("");
}

function applyCommonSizing(container, item, scale) {
  const metrics = getCodeBlockSceneMetrics(item);
  const fontSize = Math.max(12, Number(item.fontSize || 16)) * scale;
  container.style.fontSize = `${fontSize}px`;
  container.style.lineHeight = `${metrics.lineHeight * scale}px`;
  container.style.setProperty("--code-block-header-height", `${metrics.headerHeight * scale}px`);
  container.style.setProperty("--code-block-padding-x", `${metrics.bodyPaddingX * scale}px`);
  container.style.setProperty("--code-block-padding-y", `${metrics.bodyPaddingY * scale}px`);
  container.style.setProperty("--code-block-gutter-width", `${metrics.gutterWidth * scale}px`);
}

function applyLightCodeBlockTheme(node) {
  if (!(node instanceof HTMLDivElement)) {
    return;
  }
  node.style.setProperty("background", "#f8fafc", "important");
  node.style.setProperty("border-color", "rgba(203, 213, 225, 0.95)", "important");
  node.style.setProperty("color", "#0f172a", "important");
  node.style.setProperty("box-shadow", "0 2px 8px rgba(15, 23, 42, 0.08)", "important");
  const header = node.querySelector(".canvas2d-code-block-header");
  if (header instanceof HTMLElement) {
    header.style.setProperty("background", "#f1f5f9", "important");
    header.style.setProperty("border-bottom-color", "rgba(226, 232, 240, 0.95)", "important");
    header.style.setProperty("color", "#334155", "important");
  }
  const copy = node.querySelector(".canvas2d-code-block-copy");
  if (copy instanceof HTMLElement) {
    copy.style.setProperty("background", "#ffffff", "important");
    copy.style.setProperty("border-color", "rgba(203, 213, 225, 0.95)", "important");
    copy.style.setProperty("color", "#334155", "important");
  }
  const gutter = node.querySelector(".canvas2d-code-block-gutter");
  if (gutter instanceof HTMLElement) {
    gutter.style.setProperty("border-right-color", "rgba(226, 232, 240, 0.95)", "important");
    gutter.style.setProperty("color", "#94a3b8", "important");
  }
  const pre = node.querySelector(".canvas2d-code-block-pre");
  if (pre instanceof HTMLElement) {
    pre.style.setProperty("color", "#0f172a", "important");
  }
}

function resolvePrismLanguage(language = "") {
  const normalized = String(language || "").trim().toLowerCase();
  if (!normalized) {
    return "plain";
  }
  if (normalized === "js") {
    return "javascript";
  }
  if (normalized === "ts") {
    return "typescript";
  }
  if (normalized === "py") {
    return "python";
  }
  if (normalized === "md") {
    return "markdown";
  }
  if (normalized === "c++" || normalized === "c") {
    return "cpp";
  }
  if (normalized === "sh" || normalized === "shell") {
    return "bash";
  }
  if (normalized === "html" || normalized === "xml") {
    return "markup";
  }
  return normalized;
}

function getPrismGlobal() {
  return globalThis?.Prism && typeof globalThis.Prism.highlight === "function" ? globalThis.Prism : null;
}

function hashCodeContent(value = "") {
  const source = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getHighlightCacheKey(code = "", language = "") {
  const safeCode = sanitizeText(code || "");
  return `${String(language || "")}:${safeCode.length}:${hashCodeContent(safeCode)}`;
}

function readHighlightCache(key = "") {
  if (!key || !highlightCache.has(key)) {
    return "";
  }
  const cached = highlightCache.get(key) || "";
  highlightCache.delete(key);
  highlightCache.set(key, cached);
  return cached;
}

function writeHighlightCache(key = "", value = "") {
  if (!key) {
    return;
  }
  if (highlightCache.has(key)) {
    highlightCache.delete(key);
  }
  highlightCache.set(key, value);
  while (highlightCache.size > HIGHLIGHT_CACHE_LIMIT) {
    const oldestKey = highlightCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    highlightCache.delete(oldestKey);
  }
}

function scheduleIdleTask(callback) {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(() => callback(), { timeout: 80 });
    return () => cancelIdleCallback(handle);
  }
  if (typeof requestAnimationFrame === "function") {
    const handle = requestAnimationFrame(() => callback());
    return () => cancelAnimationFrame(handle);
  }
  const handle = setTimeout(() => callback(), 0);
  return () => clearTimeout(handle);
}

function highlightCodeToHtml(code = "", language = "") {
  const safeCode = sanitizeText(code || "");
  const cacheKey = getHighlightCacheKey(safeCode, language);
  const cached = readHighlightCache(cacheKey);
  if (cached) {
    return cached;
  }
  const prism = getPrismGlobal();
  if (!prism) {
    const fallback = escapeHtml(safeCode);
    writeHighlightCache(cacheKey, fallback);
    return fallback;
  }
  const prismLanguage = resolvePrismLanguage(language);
  const grammar = prism.languages?.[prismLanguage] || prism.languages?.plain || null;
  if (!grammar) {
    const fallback = escapeHtml(safeCode);
    writeHighlightCache(cacheKey, fallback);
    return fallback;
  }
  try {
    const highlighted = prism.highlight(safeCode, grammar, prismLanguage);
    writeHighlightCache(cacheKey, highlighted);
    return highlighted;
  } catch {
    const fallback = escapeHtml(safeCode);
    writeHighlightCache(cacheKey, fallback);
    return fallback;
  }
}

export function buildCodeBlockStaticMarkup(item = {}, options = {}) {
  const code = sanitizeText(item.code ?? item.text ?? item.plainText ?? "");
  const language = String(item.language || "").trim().toLowerCase();
  const prismLanguage = resolvePrismLanguage(language || "plain");
  const highlightedHtml =
    typeof options.highlightedHtml === "string" && options.highlightedHtml
      ? options.highlightedHtml
      : escapeHtml(code);
  const lineCount = Math.max(1, code ? code.split("\n").length : 1);
  return `
    ${item.headerVisible === false ? "" : `
      <div class="canvas2d-code-block-header">
        <span class="canvas2d-code-block-language">${escapeHtml(language || "plain text")}</span>
        <button type="button" class="canvas2d-code-block-copy" data-action="copy-code" title="复制代码">复制</button>
      </div>
    `}
    <div class="canvas2d-code-block-body ${item.wrap ? "is-wrap" : ""}">
      ${item.showLineNumbers === false ? "" : `<div class="canvas2d-code-block-gutter">${buildLineNumberHtml(lineCount)}</div>`}
      <div class="canvas2d-code-block-codewrap">
        <pre class="canvas2d-code-block-pre"><code class="language-${escapeHtml(prismLanguage || "plain")}">${highlightedHtml}</code></pre>
        <div class="canvas2d-code-block-line-proxy" aria-hidden="true">${buildCodeLineHtml(code, lineCount)}</div>
      </div>
    </div>
  `;
}

function renderMermaidPreview(node, item = {}) {
  const code = sanitizeText(item.code ?? item.text ?? item.plainText ?? "");
  node.innerHTML = `
    ${item.headerVisible === false ? "" : `
      <div class="canvas2d-code-block-header">
        <span class="canvas2d-code-block-language">mermaid</span>
        <button type="button" class="canvas2d-code-block-copy" data-action="copy-code" title="复制代码">复制</button>
      </div>
    `}
    <div class="canvas2d-code-block-body is-mermaid-preview">
      <div class="canvas2d-code-block-mermaid-preview" data-render-state="fallback">
        <div class="canvas2d-code-block-mermaid-error">Mermaid preview unavailable in source mode runtime.</div>
        <pre class="canvas2d-code-block-pre"><code>${escapeHtml(code)}</code></pre>
      </div>
    </div>
  `;
}

function applyNodeFrameState(node, item = {}, options = {}) {
  const scale = Math.max(0.1, Number(options.scale || 1));
  node.className = "canvas2d-code-block-item";
  node.dataset.id = String(item.id || "");
  node.dataset.language = String(item.language || "").trim().toLowerCase();
  node.dataset.wrap = item.wrap ? "1" : "0";
  node.dataset.showLineNumbers = item.showLineNumbers === false ? "0" : "1";
  node.dataset.collapsed = item.collapsed ? "1" : "0";
  node.dataset.headerVisible = item.headerVisible === false ? "0" : "1";
  node.dataset.previewMode = String(item.previewMode || "preview");
  node.classList.toggle("is-collapsed", item.collapsed === true);
  node.classList.toggle("is-wrap", item.wrap === true);
  node.classList.toggle("is-selected", options.selected === true);
  node.classList.toggle("is-hover", options.hover === true);
  node.classList.toggle("is-locked", item.locked === true);
  node.classList.toggle("is-editing", options.editing === true);
  node.classList.toggle("is-mermaid", isMermaidCodeBlock(item));
  applyCommonSizing(node, item, scale);
}

function getMarkupSignature(item = {}) {
  const code = sanitizeText(item.code ?? item.text ?? item.plainText ?? "");
  const language = String(item.language || "").trim().toLowerCase();
  return [
    item.updatedAt || 0,
    language,
    code.length,
    hashCodeContent(code),
    item.wrap ? 1 : 0,
    item.showLineNumbers === false ? 0 : 1,
    item.headerVisible === false ? 0 : 1,
    item.collapsed ? 1 : 0,
    item.fontSize || 16,
    item.previewMode || "preview",
  ].join("|");
}

function cancelPendingHighlight(node) {
  const pending = pendingHighlightTasks.get(node);
  if (pending?.cancel) {
    pending.cancel();
  }
  pendingHighlightTasks.delete(node);
}

function applyHighlightedMarkup(node, markupSignature, highlightCacheKey, prismLanguage, highlightedHtml) {
  if (!(node instanceof HTMLDivElement)) {
    return;
  }
  if (node.dataset.markupSignature !== markupSignature || node.dataset.highlightCacheKey !== highlightCacheKey) {
    return;
  }
  const codeNode = node.querySelector(".canvas2d-code-block-pre > code");
  if (!(codeNode instanceof HTMLElement)) {
    return;
  }
  codeNode.className = `language-${escapeHtml(prismLanguage || "plain")}`;
  codeNode.innerHTML = highlightedHtml;
  node.dataset.highlightState = "highlighted";
}

function scheduleHighlightUpgrade(node, item, markupSignature, highlightCacheKey, prismLanguage, safeCode) {
  if (!(node instanceof HTMLDivElement) || !highlightCacheKey) {
    return;
  }
  const activeTask = pendingHighlightTasks.get(node);
  if (activeTask?.cacheKey === highlightCacheKey && activeTask?.markupSignature === markupSignature) {
    return;
  }
  cancelPendingHighlight(node);
  node.dataset.highlightState = "highlighting";
  const cancel = scheduleIdleTask(() => {
    pendingHighlightTasks.delete(node);
    const highlightedHtml = highlightCodeToHtml(safeCode, prismLanguage);
    applyHighlightedMarkup(node, markupSignature, highlightCacheKey, prismLanguage, highlightedHtml);
  });
  pendingHighlightTasks.set(node, {
    cacheKey: highlightCacheKey,
    markupSignature,
    cancel,
  });
}

export function renderCodeBlockStatic(node, item = {}, options = {}) {
  if (!(node instanceof HTMLDivElement)) {
    return;
  }
  applyNodeFrameState(node, item, options);
  const markupSignature = getMarkupSignature(item);
  const code = sanitizeText(item.code ?? item.text ?? item.plainText ?? "");
  const language = String(item.language || "").trim().toLowerCase();
  const prismLanguage = resolvePrismLanguage(language || "plain");
  const highlightCacheKey = getHighlightCacheKey(code, prismLanguage);
  if (node.dataset.markupSignature !== markupSignature) {
    cancelPendingHighlight(node);
    if (isMermaidCodeBlock(item) && item.previewMode !== "source") {
      renderMermaidPreview(node, item);
      node.dataset.highlightState = "disabled";
      node.dataset.highlightCacheKey = "";
    } else {
      const cachedHighlightedHtml = readHighlightCache(highlightCacheKey);
      node.innerHTML = buildCodeBlockStaticMarkup(item, {
        highlightedHtml: cachedHighlightedHtml || escapeHtml(code),
      });
      node.dataset.highlightState = cachedHighlightedHtml ? "highlighted" : "plain";
      node.dataset.highlightCacheKey = highlightCacheKey;
      if (!cachedHighlightedHtml && code) {
        scheduleHighlightUpgrade(node, item, markupSignature, highlightCacheKey, prismLanguage, code);
      }
    }
    node.dataset.markupSignature = markupSignature;
  } else if (!isMermaidCodeBlock(item) || item.previewMode === "source") {
    const cachedHighlightedHtml = readHighlightCache(highlightCacheKey);
    if (cachedHighlightedHtml && node.dataset.highlightState !== "highlighted") {
      applyHighlightedMarkup(node, markupSignature, highlightCacheKey, prismLanguage, cachedHighlightedHtml);
    } else if (!cachedHighlightedHtml && code && node.dataset.highlightState !== "highlighting") {
      scheduleHighlightUpgrade(node, item, markupSignature, highlightCacheKey, prismLanguage, code);
    }
  }
  applyLightCodeBlockTheme(node);
}
