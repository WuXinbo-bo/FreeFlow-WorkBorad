"use strict";

const LANGUAGE_ALIASES = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  md: "markdown",
  "c++": "cpp",
  c: "cpp",
  sh: "bash",
  shell: "bash",
  html: "markup",
  xml: "markup",
};

let prismInitState = "idle";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeText(value) {
  return String(value || "").replace(/\r\n?/g, "\n");
}

function resolvePrismLanguage(language) {
  const normalized = String(language || "").trim().toLowerCase();
  if (!normalized) {
    return "plain";
  }
  return LANGUAGE_ALIASES[normalized] || normalized;
}

function ensurePrismReady() {
  if (prismInitState === "ready") {
    return true;
  }
  if (prismInitState === "failed") {
    return false;
  }
  prismInitState = "loading";
  try {
    importScripts(
      "./prism-core.min.js",
      "./prism-clike.min.js",
      "./prism-javascript.min.js",
      "./prism-typescript.min.js",
      "./prism-python.min.js",
      "./prism-json.min.js",
      "./prism-markup.min.js",
      "./prism-css.min.js",
      "./prism-markdown.min.js",
      "./prism-sql.min.js",
      "./prism-c.min.js",
      "./prism-cpp.min.js",
      "./prism-java.min.js",
      "./prism-bash.min.js"
    );
    if (self.Prism && typeof self.Prism.highlight === "function") {
      prismInitState = "ready";
      return true;
    }
  } catch {
    // Fall through to failed state.
  }
  prismInitState = "failed";
  return false;
}

self.onmessage = (event) => {
  const payload = event?.data || {};
  const id = payload.id;
  const code = sanitizeText(payload.code || "");
  const prismLanguage = resolvePrismLanguage(payload.language || "");
  const cacheKey = String(payload.cacheKey || "");

  if (!ensurePrismReady()) {
    self.postMessage({
      id,
      cacheKey,
      highlightedHtml: escapeHtml(code),
      prismLanguage,
      ok: false,
      transport: "worker-fallback",
    });
    return;
  }

  const prism = self.Prism;
  const grammar = prism.languages?.[prismLanguage] || prism.languages?.plain || null;
  if (!grammar) {
    self.postMessage({
      id,
      cacheKey,
      highlightedHtml: escapeHtml(code),
      prismLanguage,
      ok: false,
      transport: "worker-fallback",
    });
    return;
  }

  try {
    self.postMessage({
      id,
      cacheKey,
      highlightedHtml: prism.highlight(code, grammar, prismLanguage),
      prismLanguage,
      ok: true,
      transport: "worker",
    });
  } catch {
    self.postMessage({
      id,
      cacheKey,
      highlightedHtml: escapeHtml(code),
      prismLanguage,
      ok: false,
      transport: "worker-fallback",
    });
  }
};
