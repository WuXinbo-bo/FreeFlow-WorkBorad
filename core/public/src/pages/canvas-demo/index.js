import React from "react";
import { createRoot } from "react-dom/client";
import CanvasDemoPage from "./index.jsx";

function bootstrapCanvasDemoPage() {
  const host = document.getElementById("canvas-demo-root");
  if (!(host instanceof HTMLElement)) {
    return;
  }
  const root = createRoot(host);
  root.render(<CanvasDemoPage />);
}

bootstrapCanvasDemoPage();
