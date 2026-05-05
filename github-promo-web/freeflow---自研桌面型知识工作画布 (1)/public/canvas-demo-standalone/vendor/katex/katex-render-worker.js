"use strict";

let katexInitState = "idle";

function ensureKatexReady() {
  if (katexInitState === "ready") {
    return true;
  }
  if (katexInitState === "failed") {
    return false;
  }
  katexInitState = "loading";
  try {
    importScripts("./katex.min.js");
    if (self.katex && typeof self.katex.renderToString === "function") {
      katexInitState = "ready";
      return true;
    }
  } catch {
    // Fall through to failed state.
  }
  katexInitState = "failed";
  return false;
}

self.onmessage = (event) => {
  const payload = event?.data || {};
  const id = payload.id;
  const cacheKey = String(payload.cacheKey || "");
  const formula = String(payload.formula || "").trim();
  const displayMode = payload.displayMode === true;

  if (!formula) {
    self.postMessage({
      id,
      cacheKey,
      markup: "",
      ok: false,
      transport: "worker-fallback",
    });
    return;
  }

  if (!ensureKatexReady()) {
    self.postMessage({
      id,
      cacheKey,
      markup: "",
      ok: false,
      transport: "worker-fallback",
    });
    return;
  }

  try {
    const markup = self.katex.renderToString(formula, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      output: "htmlAndMathml",
    });
    self.postMessage({
      id,
      cacheKey,
      markup,
      ok: true,
      transport: "worker",
    });
  } catch {
    self.postMessage({
      id,
      cacheKey,
      markup: "",
      ok: false,
      transport: "worker-fallback",
    });
  }
};
