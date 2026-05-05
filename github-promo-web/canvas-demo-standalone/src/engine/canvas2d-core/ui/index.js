import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import Canvas2DControls from "./index.jsx";

let root = null;
let currentHost = null;
let mountFrame = 0;

function clearMountedUi() {
  if (mountFrame) {
    cancelAnimationFrame(mountFrame);
    mountFrame = 0;
  }
  if (root) {
    try {
      root.unmount();
    } catch {
      // Ignore React unmount teardown failures during overlay close.
    }
  }
  root = null;
  currentHost = null;
}

function ensureRootForHost(host) {
  if (!(host instanceof HTMLElement)) {
    return null;
  }
  if (root && currentHost === host) {
    return root;
  }
  if (root && currentHost && currentHost !== host) {
    clearMountedUi();
  }
  currentHost = host;
  root = createRoot(host);
  return root;
}

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
    const nextRoot = ensureRootForHost(host);
    if (!nextRoot) {
      return;
    }
    try {
      flushSync(() => {
        nextRoot.render(React.createElement(Canvas2DControls, { engine: globalThis.__canvas2dEngine }));
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

function handleEngineUnmount() {
  clearMountedUi();
}

window.addEventListener("canvas2d-engine-ready", mountWhenReady);
window.addEventListener("canvas2d-engine-unmount", handleEngineUnmount);
mountWhenReady();
