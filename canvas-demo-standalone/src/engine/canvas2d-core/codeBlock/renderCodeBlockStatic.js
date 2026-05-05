import { sanitizeText } from "../utils.js";
import { getCodeBlockSceneMetrics } from "./measureCodeBlockLayout.js";
import { isMermaidCodeBlock } from "../elements/codeBlock.js";
import { buildUnifiedPreviewSummaryMarkup } from "../previewSummaryMarkup.js";
import { loadVendorEsmModule } from "../vendor/loadVendorEsmModule.js";
import {
  getCodeBlockLanguageDisplayLabel,
  normalizeCodeBlockLanguageTag,
  resolveCodeBlockPrismLanguage,
} from "./languageRegistry.js";

const HIGHLIGHT_CACHE_LIMIT = 180;
const highlightCache = new Map();
const pendingHighlightTasks = new WeakMap();
const pendingMermaidTasks = new WeakMap();
const workerSubscribersByCacheKey = new Map();
const highlightRuntimeStats = {
  workerRequests: 0,
  workerResponses: 0,
  workerFailures: 0,
  workerFallbacks: 0,
  mainThreadHighlights: 0,
  cacheHits: 0,
};
let highlightWorkerState = {
  supported: typeof Worker !== "undefined",
  disabled: false,
  worker: null,
  nextRequestId: 0,
  requestsById: new Map(),
};
let mermaidInitialized = false;
let mermaidRenderSequence = 0;
let mermaidModulePromise = null;

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

function buildCodeBlockSummaryMarkup(item = {}) {
  const metrics = getCodeBlockSceneMetrics(item);
  const lineCount = Math.max(3, Math.min(6, Number(metrics.visibleLineCount || 4) || 4));
  const lineWidths = [0.74, 0.82, 0.6, 0.7, 0.54, 0.66];
  return buildUnifiedPreviewSummaryMarkup({
    width: Math.max(48, Number(item?.width || 0) || 48),
    height: Math.max(32, Number(item?.height || 0) || 32),
    showHeader: true,
    lineCount,
    widths: lineWidths,
    align: "left",
    drawFrame: false,
  });
}

function getCodeBlockStateTitle(item = {}, languageLabel = "") {
  const parts = [languageLabel || "Plain Text"];
  if (isMermaidCodeBlock(item)) {
    parts.push(item.previewMode === "source" ? "源码模式" : "预览模式");
  }
  parts.push(item.wrap ? "自动换行" : "不换行");
  parts.push(item.showLineNumbers === false ? "隐藏行号" : "显示行号");
  return parts.join(" · ");
}

function buildCodeBlockHeaderMeta(item = {}, languageLabel = "") {
  const title = escapeHtml(getCodeBlockStateTitle(item, languageLabel));
  if (!isMermaidCodeBlock(item)) {
    return `<span class="canvas2d-code-block-language" title="${title}">${escapeHtml(languageLabel)}</span>`;
  }
  const modeLabel = item.previewMode === "source" ? "源码" : "预览";
  return `
    <span class="canvas2d-code-block-language" title="${title}">${escapeHtml(languageLabel)}</span>
    <span
      class="canvas2d-code-block-mode"
      title="${escapeHtml(`Mermaid ${modeLabel}模式`)}"
      style="display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:20px;padding:0 7px;border-radius:999px;border:1px solid rgba(148,163,184,0.35);background:rgba(255,255,255,0.85);font-size:11px;font-weight:600;color:#475569;"
    >${escapeHtml(modeLabel)}</span>
  `;
}

function applyCommonSizing(container, item, scale) {
  const metrics = getCodeBlockSceneMetrics(item);
  const fontSize = Math.max(12, Number(item.fontSize || 16)) * scale;
  const tabSize = Math.max(2, Math.min(8, Number(item.tabSize || 2) || 2));
  container.style.fontSize = `${fontSize}px`;
  container.style.lineHeight = `${metrics.lineHeight * scale}px`;
  container.style.setProperty("--code-block-header-height", `${metrics.headerHeight * scale}px`);
  container.style.setProperty("--code-block-padding-x", `${metrics.bodyPaddingX * scale}px`);
  container.style.setProperty("--code-block-padding-y", `${metrics.bodyPaddingY * scale}px`);
  container.style.setProperty("--code-block-gutter-width", `${metrics.gutterWidth * scale}px`);
  container.style.setProperty("--code-block-tab-size", String(tabSize));
  container.style.setProperty("--code-block-mermaid-padding", `${Math.max(8, Math.round(16 * scale))}px`);
  container.style.setProperty("--code-block-mermaid-min-height", `${Math.max(metrics.lineHeight * 4, Math.round(160 * scale))}px`);
  container.style.setProperty("--code-block-mermaid-chip-font-size", `${Math.max(10, Math.round(12 * scale))}px`);
  container.style.setProperty("--code-block-mermaid-chip-padding-y", `${Math.max(6, Math.round(10 * scale))}px`);
  container.style.setProperty("--code-block-mermaid-chip-padding-x", `${Math.max(10, Math.round(14 * scale))}px`);
  container.style.setProperty("--code-block-mermaid-chip-radius", `${Math.max(10, Math.round(12 * scale))}px`);
}

function syncMermaidPreviewSizing(node, item = {}, scale = 1) {
  if (!(node instanceof HTMLDivElement)) {
    return;
  }
  const previewNode = node.querySelector(".canvas2d-code-block-mermaid-preview");
  if (!(previewNode instanceof HTMLElement)) {
    return;
  }
  const metrics = getCodeBlockSceneMetrics(item);
  previewNode.style.padding = `${Math.max(8, Math.round(16 * scale))}px`;
  previewNode.style.minHeight = `${Math.max(metrics.lineHeight * 4, Math.round(160 * scale))}px`;
  const loadingNode = previewNode.querySelector(".canvas2d-code-block-mermaid-loading");
  if (loadingNode instanceof HTMLElement) {
    loadingNode.style.padding = `${Math.max(6, Math.round(10 * scale))}px ${Math.max(10, Math.round(14 * scale))}px`;
    loadingNode.style.borderRadius = `${Math.max(10, Math.round(12 * scale))}px`;
    loadingNode.style.fontSize = `${Math.max(10, Math.round(12 * scale))}px`;
  }
  const svgNode = previewNode.querySelector("svg");
  if (svgNode instanceof SVGSVGElement) {
    svgNode.style.display = "block";
    svgNode.style.width = "100%";
    svgNode.style.maxWidth = "100%";
    svgNode.style.height = "auto";
    svgNode.style.maxHeight = "100%";
    svgNode.removeAttribute("height");
    const viewBox = String(svgNode.getAttribute("viewBox") || "").trim();
    if (!viewBox) {
      const widthAttr = Number(svgNode.getAttribute("width") || 0);
      const heightAttr = Number(svgNode.getAttribute("height") || 0);
      if (widthAttr > 0 && heightAttr > 0) {
        svgNode.setAttribute("viewBox", `0 0 ${widthAttr} ${heightAttr}`);
      }
    }
  }
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
    header.style.setProperty("gap", "8px", "important");
  }
  const languageGroup = node.querySelector(".canvas2d-code-block-header-meta");
  if (languageGroup instanceof HTMLElement) {
    languageGroup.style.setProperty("display", "inline-flex", "important");
    languageGroup.style.setProperty("align-items", "center", "important");
    languageGroup.style.setProperty("gap", "6px", "important");
    languageGroup.style.setProperty("min-width", "0", "important");
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
    pre.style.tabSize = node.style.getPropertyValue("--code-block-tab-size") || "2";
    pre.style.MozTabSize = node.style.getPropertyValue("--code-block-tab-size") || "2";
  }
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

function getMermaidCacheKey(code = "") {
  const safeCode = sanitizeText(code || "");
  return `mermaid:${safeCode.length}:${hashCodeContent(safeCode)}`;
}

function readHighlightCache(key = "") {
  if (!key || !highlightCache.has(key)) {
    return "";
  }
  highlightRuntimeStats.cacheHits += 1;
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

function ensureMermaidInitialized() {
  // no-op placeholder kept for call-site compatibility; actual init needs runtime module
}

async function loadMermaidModule() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = loadVendorEsmModule("mermaid")
      .then((module) => module?.default || module)
      .catch((error) => {
        mermaidModulePromise = null;
        throw error;
      });
  }
  return mermaidModulePromise;
}

async function ensureMermaidRuntime() {
  const mermaidRuntime = await loadMermaidModule();
  if (mermaidInitialized) {
    return mermaidRuntime;
  }
  mermaidRuntime.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "default",
    suppressErrorRendering: true,
  });
  mermaidInitialized = true;
  return mermaidRuntime;
}

async function renderMermaidSvg(code = "", renderId = "") {
  const mermaidRuntime = await ensureMermaidRuntime();
  const result = await mermaidRuntime.render(renderId, sanitizeText(code || ""));
  return {
    svg: String(result?.svg || ""),
    bindFunctions: typeof result?.bindFunctions === "function" ? result.bindFunctions : null,
  };
}

function getHighlightWorkerUrl() {
  if (typeof document !== "undefined" && document.baseURI) {
    return new URL("./vendor/prismjs/components/prism-highlight-worker.js", document.baseURI).toString();
  }
  if (typeof location !== "undefined" && location.href) {
    return new URL("./vendor/prismjs/components/prism-highlight-worker.js", location.href).toString();
  }
  return "";
}

function markWorkerUnavailable() {
  highlightWorkerState.disabled = true;
  if (highlightWorkerState.worker) {
    try {
      highlightWorkerState.worker.terminate();
    } catch {
      // Ignore terminate failures and keep main-thread fallback alive.
    }
  }
  highlightWorkerState.worker = null;
}

function flushPendingWorkerRequestsToMainThread() {
  const pendingRequests = Array.from(highlightWorkerState.requestsById.entries());
  highlightWorkerState.requestsById.clear();
  pendingRequests.forEach(([requestId, request]) => {
    const subscribers = workerSubscribersByCacheKey.get(request.cacheKey) || [];
    workerSubscribersByCacheKey.delete(request.cacheKey);
    const fallbackHtml = highlightCodeToHtml(request.code, request.prismLanguage);
    subscribers.forEach((subscription) => {
      pendingHighlightTasks.delete(subscription.node);
      applyHighlightedMarkup(
        subscription.node,
        subscription.markupSignature,
        request.cacheKey,
        request.prismLanguage,
        fallbackHtml
      );
      subscription.node.dataset.highlightTransport = "main-thread";
    });
  });
}

function settleWorkerRequest(requestId, response = {}) {
  const request = highlightWorkerState.requestsById.get(requestId);
  if (!request) {
    return;
  }
  highlightWorkerState.requestsById.delete(requestId);
  const { cacheKey, code, prismLanguage } = request;
  const subscribers = workerSubscribersByCacheKey.get(cacheKey);
  workerSubscribersByCacheKey.delete(cacheKey);
  const highlightedHtml = String(response.highlightedHtml || "");
  if (highlightedHtml) {
    writeHighlightCache(cacheKey, highlightedHtml);
  }
  subscribers?.forEach((subscription) => {
    pendingHighlightTasks.delete(subscription.node);
    if (response.ok) {
      applyHighlightedMarkup(subscription.node, subscription.markupSignature, cacheKey, prismLanguage, highlightedHtml);
      subscription.node.dataset.highlightTransport = String(response.transport || "worker");
      return;
    }
    highlightRuntimeStats.workerFallbacks += 1;
    const fallbackHtml = highlightCodeToHtml(code, prismLanguage);
    applyHighlightedMarkup(subscription.node, subscription.markupSignature, cacheKey, prismLanguage, fallbackHtml);
    subscription.node.dataset.highlightTransport = "main-thread";
  });
}

function getHighlightWorker() {
  if (!highlightWorkerState.supported || highlightWorkerState.disabled) {
    return null;
  }
  if (highlightWorkerState.worker) {
    return highlightWorkerState.worker;
  }
  const workerUrl = getHighlightWorkerUrl();
  if (!workerUrl) {
    highlightWorkerState.disabled = true;
    return null;
  }
  try {
    const worker = new Worker(workerUrl);
    worker.onmessage = (event) => {
      const payload = event?.data || {};
      const requestId = Number(payload.id);
      if (!Number.isFinite(requestId)) {
        return;
      }
      highlightRuntimeStats.workerResponses += 1;
      settleWorkerRequest(requestId, payload);
    };
    worker.onerror = () => {
      highlightRuntimeStats.workerFailures += 1;
      markWorkerUnavailable();
      flushPendingWorkerRequestsToMainThread();
    };
    highlightWorkerState.worker = worker;
    return worker;
  } catch {
    highlightRuntimeStats.workerFailures += 1;
    highlightWorkerState.disabled = true;
    return null;
  }
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
  const prismLanguage = resolveCodeBlockPrismLanguage(language);
  const grammar = prism.languages?.[prismLanguage] || prism.languages?.plain || null;
  if (!grammar) {
    const fallback = escapeHtml(safeCode);
    writeHighlightCache(cacheKey, fallback);
    return fallback;
  }
  try {
    highlightRuntimeStats.mainThreadHighlights += 1;
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
  const summaryMode = options.summaryMode === true;
  const language = normalizeCodeBlockLanguageTag(item.language || "");
  const languageLabel = getCodeBlockLanguageDisplayLabel(language);
  const prismLanguage = resolveCodeBlockPrismLanguage(language);
  const showHeader = options.showHeader !== false && item.headerVisible !== false;
  const showLineNumbers = options.showLineNumbers !== false && item.showLineNumbers !== false;
  const highlightedHtml =
    typeof options.highlightedHtml === "string" && options.highlightedHtml
      ? options.highlightedHtml
      : escapeHtml(code);
  const lineCount = Math.max(1, code ? code.split("\n").length : 1);
  return `
    ${showHeader ? `
      <div class="canvas2d-code-block-header">
        <span class="canvas2d-code-block-header-meta">${buildCodeBlockHeaderMeta(item, languageLabel)}</span>
        <button type="button" class="canvas2d-code-block-copy" data-action="copy-code" title="复制代码" aria-label="复制代码">复制</button>
      </div>
    ` : ""}
    <div class="canvas2d-code-block-body ${item.wrap ? "is-wrap" : ""} ${summaryMode ? "is-summary" : ""}">
      ${
        summaryMode
          ? buildCodeBlockSummaryMarkup(item)
          : `
      ${showLineNumbers ? `<div class="canvas2d-code-block-gutter">${buildLineNumberHtml(lineCount)}</div>` : ""}
      <div class="canvas2d-code-block-codewrap">
        <pre class="canvas2d-code-block-pre"><code class="language-${escapeHtml(prismLanguage || "plain")}">${highlightedHtml}</code></pre>
        <div class="canvas2d-code-block-line-proxy" aria-hidden="true">${buildCodeLineHtml(code, lineCount)}</div>
      </div>`
      }
    </div>
  `;
}

function applyMermaidPreviewResult(node, markupSignature, mermaidCacheKey, { svg = "", bindFunctions = null } = {}) {
  if (!(node instanceof HTMLDivElement)) {
    return;
  }
  if (node.dataset.markupSignature !== markupSignature || node.dataset.mermaidCacheKey !== mermaidCacheKey) {
    return;
  }
  const previewNode = node.querySelector(".canvas2d-code-block-mermaid-preview");
  if (!(previewNode instanceof HTMLElement)) {
    return;
  }
  previewNode.innerHTML = svg;
  previewNode.dataset.renderState = "ready";
  node.dataset.mermaidState = "ready";
  const scale = Math.max(0.1, Number(node.dataset.canvasScale || 1) || 1);
  const itemForScale = {
    fontSize: Number(node.dataset.fontSize || 16) || 16,
    headerVisible: node.dataset.headerVisible !== "0",
    showLineNumbers: node.dataset.showLineNumbers !== "0",
    tabSize: Number(node.dataset.tabSize || 2) || 2,
  };
  syncMermaidPreviewSizing(node, itemForScale, scale);
  if (typeof bindFunctions === "function") {
    try {
      bindFunctions(previewNode);
    } catch {
      // Ignore optional binding failures; SVG preview remains usable.
    }
  }
}

function applyMermaidPreviewError(node, markupSignature, mermaidCacheKey, error) {
  if (!(node instanceof HTMLDivElement)) {
    return;
  }
  if (node.dataset.markupSignature !== markupSignature || node.dataset.mermaidCacheKey !== mermaidCacheKey) {
    return;
  }
  const previewNode = node.querySelector(".canvas2d-code-block-mermaid-preview");
  if (!(previewNode instanceof HTMLElement)) {
    return;
  }
  const message = String(error?.message || error || "Mermaid 渲染失败").trim() || "Mermaid 渲染失败";
  previewNode.dataset.renderState = "error";
  previewNode.innerHTML = `
    <div class="canvas2d-code-block-mermaid-error" style="color:#b91c1c;font-weight:600;">Mermaid 渲染失败</div>
    <div class="canvas2d-code-block-mermaid-error-detail" style="margin-top:6px;color:#7f1d1d;font-size:12px;line-height:1.45;">${escapeHtml(message)}</div>
    <pre class="canvas2d-code-block-pre" style="margin-top:10px;"><code>${escapeHtml(node.dataset.mermaidSource || "")}</code></pre>
  `;
  node.dataset.mermaidState = "error";
}

function scheduleMermaidPreviewRender(node, item = {}, markupSignature, mermaidCacheKey, code = "") {
  if (!(node instanceof HTMLDivElement) || !mermaidCacheKey || !code) {
    return;
  }
  const activeTask = pendingMermaidTasks.get(node);
  if (activeTask?.cacheKey === mermaidCacheKey && activeTask?.markupSignature === markupSignature) {
    return;
  }
  cancelPendingMermaid(node);
  node.dataset.mermaidState = "rendering";
  const cancelled = { value: false };
  pendingMermaidTasks.set(node, {
    cacheKey: mermaidCacheKey,
    markupSignature,
    cancel: () => {
      cancelled.value = true;
    },
  });
  Promise.resolve()
    .then(async () => {
      const renderId = `ff-mermaid-${Date.now()}-${++mermaidRenderSequence}`;
      const result = await renderMermaidSvg(code, renderId);
      if (cancelled.value) {
        return;
      }
      pendingMermaidTasks.delete(node);
      applyMermaidPreviewResult(node, markupSignature, mermaidCacheKey, result);
    })
    .catch((error) => {
      if (cancelled.value) {
        return;
      }
      pendingMermaidTasks.delete(node);
      applyMermaidPreviewError(node, markupSignature, mermaidCacheKey, error);
    });
}

function renderMermaidPreview(node, item = {}, options = {}) {
  const code = sanitizeText(item.code ?? item.text ?? item.plainText ?? "");
  const showHeader = options.showHeader !== false && item.headerVisible !== false;
  const emptyStateMarkup = `
    <div class="canvas2d-code-block-mermaid-preview" data-render-state="empty" style="display:flex;align-items:center;justify-content:center;min-height:100%;padding:12px;">
      <div class="canvas2d-code-block-mermaid-loading" style="display:flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:12px;background:rgba(241,245,249,0.9);border:1px solid rgba(203,213,225,0.8);color:#64748b;font-size:12px;font-weight:600;">
        Mermaid 内容为空
      </div>
    </div>
  `;
  node.innerHTML = `
    ${showHeader ? `
      <div class="canvas2d-code-block-header">
        <span class="canvas2d-code-block-header-meta">${buildCodeBlockHeaderMeta(item, "Mermaid")}</span>
        <button type="button" class="canvas2d-code-block-copy" data-action="copy-code" title="复制代码" aria-label="复制代码">复制</button>
      </div>
    ` : ""}
    <div class="canvas2d-code-block-body is-mermaid-preview">
      ${code ? `<div class="canvas2d-code-block-mermaid-preview" data-render-state="rendering" style="display:flex;align-items:center;justify-content:center;min-height:100%;padding:12px;">
        <div class="canvas2d-code-block-mermaid-loading" style="display:flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:12px;background:rgba(241,245,249,0.9);border:1px solid rgba(203,213,225,0.8);color:#475569;font-size:12px;font-weight:600;">
          正在渲染 Mermaid
        </div>
      </div>` : emptyStateMarkup}
    </div>
  `;
  node.dataset.mermaidSource = code;
  node.dataset.mermaidState = code ? "rendering" : "empty";
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
  node.dataset.canvasScale = String(scale);
  node.dataset.fontSize = String(Number(item.fontSize || 16) || 16);
  node.dataset.tabSize = String(Number(item.tabSize || 2) || 2);
  node.classList.toggle("is-collapsed", item.collapsed === true);
  node.classList.toggle("is-wrap", item.wrap === true);
  node.classList.toggle("is-selected", options.selected === true);
  node.classList.toggle("is-hover", options.hover === true);
  node.classList.toggle("is-locked", item.locked === true);
  node.classList.toggle("is-editing", options.editing === true);
  node.classList.toggle("is-mermaid", isMermaidCodeBlock(item));
  applyCommonSizing(node, item, scale);
  if (isMermaidCodeBlock(item) && item.previewMode !== "source") {
    syncMermaidPreviewSizing(node, item, scale);
  }
}

function getMarkupSignature(item = {}, options = {}) {
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
    options.summaryMode ? 1 : 0,
    options.showHeader === false ? 0 : 1,
    options.showLineNumbers === false ? 0 : 1,
  ].join("|");
}

function cancelPendingHighlight(node) {
  const pending = pendingHighlightTasks.get(node);
  if (pending?.cancel) {
    pending.cancel();
  }
  pendingHighlightTasks.delete(node);
}

function cancelPendingMermaid(node) {
  const pending = pendingMermaidTasks.get(node);
  if (pending?.cancel) {
    pending.cancel();
  }
  pendingMermaidTasks.delete(node);
}

export function cleanupCodeBlockStaticNode(node) {
  if (!(node instanceof HTMLDivElement)) {
    return;
  }
  cancelPendingHighlight(node);
  cancelPendingMermaid(node);
  node.dataset.highlightState = "";
  node.dataset.highlightCacheKey = "";
  node.dataset.highlightTransport = "";
  node.dataset.mermaidState = "";
  node.dataset.mermaidCacheKey = "";
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
  node.dataset.highlightCacheKey = highlightCacheKey;
}

function scheduleWorkerHighlight(node, markupSignature, highlightCacheKey, prismLanguage, safeCode) {
  const worker = getHighlightWorker();
  if (!worker || !highlightCacheKey) {
    return false;
  }
  const existingSubscribers = workerSubscribersByCacheKey.get(highlightCacheKey);
  if (existingSubscribers) {
    existingSubscribers.push({ node, markupSignature });
    pendingHighlightTasks.set(node, {
      type: "worker",
      cacheKey: highlightCacheKey,
      markupSignature,
      cancel: () => {
        const subscribers = workerSubscribersByCacheKey.get(highlightCacheKey);
        if (!subscribers) {
          return;
        }
        const nextSubscribers = subscribers.filter((entry) => entry.node !== node);
        if (nextSubscribers.length) {
          workerSubscribersByCacheKey.set(highlightCacheKey, nextSubscribers);
        } else {
          workerSubscribersByCacheKey.delete(highlightCacheKey);
        }
      },
    });
    node.dataset.highlightState = "highlighting";
    node.dataset.highlightTransport = "worker";
    return true;
  }
  const requestId = ++highlightWorkerState.nextRequestId;
  highlightWorkerState.requestsById.set(requestId, {
    cacheKey: highlightCacheKey,
    code: safeCode,
    prismLanguage,
  });
  workerSubscribersByCacheKey.set(highlightCacheKey, [{ node, markupSignature }]);
  pendingHighlightTasks.set(node, {
    type: "worker",
    cacheKey: highlightCacheKey,
    markupSignature,
    cancel: () => {
      const subscribers = workerSubscribersByCacheKey.get(highlightCacheKey);
      if (!subscribers) {
        return;
      }
      const nextSubscribers = subscribers.filter((entry) => entry.node !== node);
      if (nextSubscribers.length) {
        workerSubscribersByCacheKey.set(highlightCacheKey, nextSubscribers);
      } else {
        workerSubscribersByCacheKey.delete(highlightCacheKey);
      }
    },
  });
  node.dataset.highlightState = "highlighting";
  node.dataset.highlightTransport = "worker";
  highlightRuntimeStats.workerRequests += 1;
  try {
    worker.postMessage({
      id: requestId,
      cacheKey: highlightCacheKey,
      code: safeCode,
      language: prismLanguage,
    });
    return true;
  } catch {
    highlightRuntimeStats.workerFailures += 1;
    highlightWorkerState.requestsById.delete(requestId);
    workerSubscribersByCacheKey.delete(highlightCacheKey);
    pendingHighlightTasks.delete(node);
    markWorkerUnavailable();
    return false;
  }
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
  if (scheduleWorkerHighlight(node, markupSignature, highlightCacheKey, prismLanguage, safeCode)) {
    return;
  }
  node.dataset.highlightState = "highlighting";
  node.dataset.highlightTransport = "main-thread";
  const cancel = scheduleIdleTask(() => {
    pendingHighlightTasks.delete(node);
    const highlightedHtml = highlightCodeToHtml(safeCode, prismLanguage);
    applyHighlightedMarkup(node, markupSignature, highlightCacheKey, prismLanguage, highlightedHtml);
    node.dataset.highlightTransport = "main-thread";
  });
  pendingHighlightTasks.set(node, {
    type: "idle",
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
  const code = sanitizeText(item.code ?? item.text ?? item.plainText ?? "");
  const language = String(item.language || "").trim().toLowerCase();
  const prismLanguage = resolveCodeBlockPrismLanguage(language || "plain");
  const highlightCacheKey = getHighlightCacheKey(code, prismLanguage);
  const summaryMode = options.summaryMode === true;
  const syntaxHighlighting = options.syntaxHighlighting !== false;
  const showHeader = options.showHeader !== false;
  const showLineNumbers = options.showLineNumbers !== false;
  const mermaidCacheKey = getMermaidCacheKey(code);
  const markupSignature = getMarkupSignature(item, {
    summaryMode,
    showHeader,
    showLineNumbers,
  });
  if (node.dataset.markupSignature !== markupSignature) {
    cancelPendingHighlight(node);
    cancelPendingMermaid(node);
    if (isMermaidCodeBlock(item) && item.previewMode !== "source") {
      renderMermaidPreview(node, item, { showHeader });
      node.dataset.highlightState = "disabled";
      node.dataset.highlightCacheKey = "";
      node.dataset.highlightTransport = "disabled";
      node.dataset.mermaidCacheKey = mermaidCacheKey;
      if (code) {
        node.dataset.mermaidState = "rendering";
        scheduleMermaidPreviewRender(node, item, markupSignature, mermaidCacheKey, code);
      } else {
        node.dataset.mermaidState = "empty";
      }
    } else {
      const cachedHighlightedHtml = syntaxHighlighting && !summaryMode ? readHighlightCache(highlightCacheKey) : "";
      node.innerHTML = buildCodeBlockStaticMarkup(item, {
        highlightedHtml:
          syntaxHighlighting && !summaryMode
            ? cachedHighlightedHtml || escapeHtml(code)
            : escapeHtml(code),
        showHeader: summaryMode ? false : showHeader,
        showLineNumbers: summaryMode ? false : showLineNumbers,
        summaryMode,
      });
      node.dataset.highlightState =
        syntaxHighlighting && !summaryMode ? (cachedHighlightedHtml ? "highlighted" : "plain") : "disabled";
      node.dataset.highlightCacheKey = syntaxHighlighting && !summaryMode ? highlightCacheKey : "";
      node.dataset.highlightTransport =
        syntaxHighlighting && !summaryMode ? (cachedHighlightedHtml ? "cache" : "pending") : "disabled";
      node.dataset.mermaidCacheKey = "";
      node.dataset.mermaidState = "";
      node.dataset.markupSignature = markupSignature;
      if (syntaxHighlighting && !summaryMode && !cachedHighlightedHtml && code) {
        scheduleHighlightUpgrade(node, item, markupSignature, highlightCacheKey, prismLanguage, code);
      }
    }
    node.dataset.markupSignature = markupSignature;
  } else if (isMermaidCodeBlock(item) && item.previewMode !== "source") {
    if (node.dataset.mermaidState !== "ready" && node.dataset.mermaidState !== "rendering") {
      node.dataset.mermaidCacheKey = mermaidCacheKey;
      scheduleMermaidPreviewRender(node, item, markupSignature, mermaidCacheKey, code);
    }
  } else if (syntaxHighlighting && !summaryMode && (!isMermaidCodeBlock(item) || item.previewMode === "source")) {
    const cachedHighlightedHtml = readHighlightCache(highlightCacheKey);
    if (cachedHighlightedHtml && node.dataset.highlightState !== "highlighted") {
      applyHighlightedMarkup(node, markupSignature, highlightCacheKey, prismLanguage, cachedHighlightedHtml);
      node.dataset.highlightTransport = "cache";
    } else if (!cachedHighlightedHtml && code && node.dataset.highlightState !== "highlighting") {
      scheduleHighlightUpgrade(node, item, markupSignature, highlightCacheKey, prismLanguage, code);
    }
  } else if (!syntaxHighlighting) {
    cancelPendingHighlight(node);
    cancelPendingMermaid(node);
    node.dataset.highlightState = "disabled";
    node.dataset.highlightCacheKey = "";
    node.dataset.highlightTransport = "disabled";
    node.dataset.mermaidState = "";
    node.dataset.mermaidCacheKey = "";
  } else if (summaryMode) {
    cancelPendingHighlight(node);
    cancelPendingMermaid(node);
    node.dataset.highlightState = "disabled";
    node.dataset.highlightCacheKey = "";
    node.dataset.highlightTransport = "disabled";
    node.dataset.mermaidState = "";
    node.dataset.mermaidCacheKey = "";
  }
  applyLightCodeBlockTheme(node);
}

export function getCodeBlockHighlightRuntimeStats() {
  return {
    ...highlightRuntimeStats,
    workerEnabled: Boolean(highlightWorkerState.worker) && !highlightWorkerState.disabled,
    workerDisabled: highlightWorkerState.disabled,
    pendingWorkerRequests: highlightWorkerState.requestsById.size,
    pendingCacheKeys: workerSubscribersByCacheKey.size,
    cacheSize: highlightCache.size,
  };
}
