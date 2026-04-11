import { createRoot } from "react-dom/client";
import CanvasOfficePage from "./index.jsx";

function bootstrapCanvasOfficePage() {
  const host = document.getElementById("canvas-office-root") || document.getElementById("canvas-office-react-host");
  if (!(host instanceof HTMLElement)) {
    return;
  }

  if (host.id === "canvas-office-react-host") {
    document.documentElement.dataset.canvasOfficeEmbedded = "true";
  }

  const root = createRoot(host);
  root.render(<CanvasOfficePage embedded={host.id === "canvas-office-react-host"} />);
}

bootstrapCanvasOfficePage();
