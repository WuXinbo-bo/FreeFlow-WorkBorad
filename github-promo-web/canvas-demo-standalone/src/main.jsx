import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { resolveDemoAssetUrl } from "./resolveDemoAssetUrl.js";
import { installStandaloneRuntime } from "./standaloneRuntime.js";
import "./styles/engine.css";
import "./styles/demo-shell.css";

async function bootstrap() {
  await installStandaloneRuntime();
  document.documentElement.style.setProperty(
    "--freeflow-demo-logo-mask",
    `url("${resolveDemoAssetUrl("assets/brand/FreeFlow_logo.svg")}")`
  );
  const host = document.getElementById("root");
  if (!(host instanceof HTMLElement)) {
    throw new Error("Standalone demo root host not found");
  }
  createRoot(host).render(<App />);
}

bootstrap().catch((error) => {
  console.error("[freeflow-canvas-demo-standalone] bootstrap failed", error);
  const host = document.getElementById("root");
  if (host) {
    host.innerHTML = `<div style="padding:24px;font:14px/1.6 'Segoe UI',sans-serif;color:#7f1d1d;">Standalone demo 启动失败：${String(error?.message || error)}</div>`;
  }
});
