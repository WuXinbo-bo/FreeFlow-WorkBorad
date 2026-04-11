import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import Canvas2DControls from "./index.jsx";

let root = null;
let mountFrame = 0;

function mountWhenReady() {
  if (mountFrame) return;
  mountFrame = requestAnimationFrame(() => {
    mountFrame = 0;
    const host = document.getElementById("canvas2d-react-ui-host");
    if (!(host instanceof HTMLElement) || !globalThis.__canvas2dEngine) {
      mountWhenReady();
      return;
    }
    host.dataset.canvas2dUiState = "mounting";
    if (!root) {
      root = createRoot(host);
    }
    try {
      flushSync(() => {
        root.render(<Canvas2DControls engine={globalThis.__canvas2dEngine} />);
      });
      host.dataset.canvas2dUiState = "mounted";
      host.removeAttribute("data-canvas2d-ui-error");
    } catch (error) {
      host.dataset.canvas2dUiState = "error";
      host.dataset.canvas2dUiError = error instanceof Error ? error.message : String(error || "unknown");
      console.error("[canvas2d-ui] mount failed", error);
    }
  });
}

window.addEventListener("canvas2d-engine-ready", mountWhenReady);
mountWhenReady();
