import React, { useEffect, useRef, useState } from "react";
import CanvasDemoApp from "../../canvas-demo-standalone/src/App.jsx";
import { installStandaloneRuntime } from "../../canvas-demo-standalone/src/standaloneRuntime.js";
import { resolveDemoAssetUrl } from "../../canvas-demo-standalone/src/resolveDemoAssetUrl.js";
import engineCssText from "../../canvas-demo-standalone/src/styles/engine.css?inline";
import demoShellCssText from "../../canvas-demo-standalone/src/styles/demo-shell.css?inline";

export default function PromoCanvasDemo() {
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState("");
  const previousBodyClassRef = useRef("");
  const injectedStyleNodesRef = useRef([]);

  function mountScopedStyles() {
    const stylePayloads = [
      { id: "freeflow-promo-demo-engine-style", cssText: engineCssText },
      { id: "freeflow-promo-demo-shell-style", cssText: demoShellCssText },
    ];
    const styleNodes = stylePayloads.map(({ id, cssText }) => {
      const styleNode = document.createElement("style");
      styleNode.dataset.freeflowPromoDemoStyle = id;
      styleNode.textContent = cssText;
      document.head.appendChild(styleNode);
      return styleNode;
    });
    injectedStyleNodesRef.current = styleNodes;
  }

  function unmountScopedStyles() {
    injectedStyleNodesRef.current.forEach((styleNode) => {
      styleNode?.remove?.();
    });
    injectedStyleNodesRef.current = [];
  }

  useEffect(() => {
    let disposed = false;
    previousBodyClassRef.current = document.body.className;
    mountScopedStyles();
    document.documentElement.style.setProperty("--freeflow-demo-logo-mask", `url("${resolveDemoAssetUrl("assets/brand/FreeFlow_logo.svg")}")`);

    installStandaloneRuntime()
      .then(() => {
        if (!disposed) {
          setRuntimeReady(true);
        }
      })
      .catch((error) => {
        console.error("[promo-canvas-demo] bootstrap failed", error);
        if (!disposed) {
          setRuntimeError(String(error?.message || error));
        }
      });

    return () => {
      disposed = true;
      document.body.className = previousBodyClassRef.current;
      document.documentElement.style.removeProperty("--freeflow-demo-logo-mask");
      unmountScopedStyles();
      globalThis.__canvas2dEngine = null;
    };
  }, []);

  if (runtimeError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(126,171,255,0.22),transparent_28%),linear-gradient(180deg,#f7faff,#eef3fb_50%,#f4f7fb)]">
        <div className="max-w-xl rounded-[1.75rem] border border-rose-100 bg-white/90 px-8 py-7 text-center shadow-[0_24px_60px_rgba(27,48,99,0.12)] backdrop-blur">
          <div className="text-base font-black text-slate-900">Demo 启动失败</div>
          <div className="mt-3 text-sm font-semibold leading-6 text-slate-400">{runtimeError}</div>
        </div>
      </div>
    );
  }

  if (!runtimeReady) {
    return null;
  }

  return <CanvasDemoApp />;
}
