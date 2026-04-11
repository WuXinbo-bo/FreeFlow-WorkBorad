import React, { useEffect, useRef, useState } from "react";
import { createCanvas2DEngine } from "../../engines/canvas2d-core/createCanvas2DEngine.js";
import "../../engines/canvas2d-core/ui/index.js";

const CANVAS_MODE_CANVAS2D = "canvas2d";

function CanvasOfficePage({ embedded = false } = {}) {
  const [engineMode] = useState(CANVAS_MODE_CANVAS2D);
  const canvas2dHostRef = useRef(null);
  const canvas2dHandleRef = useRef(null);

  useEffect(() => {
    if (!embedded) {
      document.body.classList.add("canvas-office-page");
      document.body.classList.remove("app-booting");
    } else {
      document.documentElement.dataset.canvasOfficeEmbedded = "true";
    }
    document.body.dataset.canvasOfficeEmbedded = embedded ? "true" : "false";
    document.documentElement.dataset.canvasOfficeMode = engineMode;
    document.body.dataset.canvasOfficeMode = engineMode;

    return () => {
      document.body.dataset.canvasOfficeEmbedded = "false";
      document.body.dataset.canvasOfficeMode = CANVAS_MODE_CANVAS2D;
      if (embedded) {
        document.documentElement.dataset.canvasOfficeEmbedded = "false";
      }
    };
  }, [embedded, engineMode]);

  useEffect(() => {
    document.documentElement.dataset.canvasOfficeMode = engineMode;
    document.body.dataset.canvasOfficeMode = engineMode;
  }, [engineMode]);

  useEffect(() => {
    const host = canvas2dHostRef.current;
    if (!(host instanceof HTMLElement)) {
      return undefined;
    }

    if (engineMode !== CANVAS_MODE_CANVAS2D) {
      canvas2dHandleRef.current?.destroy?.();
      canvas2dHandleRef.current?.unmount?.();
      canvas2dHandleRef.current = null;
      return undefined;
    }

    const engine = createCanvas2DEngine();
    globalThis.__canvas2dEngine = engine;
    canvas2dHandleRef.current = engine;
    try {
      engine.mount(host);
    } catch (error) {
      console.error("[canvas2d] mount failed", error);
    }

    return () => {
      const current = canvas2dHandleRef.current;
      canvas2dHandleRef.current = null;
      if (current?.destroy) {
        current.destroy();
      } else {
        current?.unmount?.();
      }
      globalThis.__canvas2dEngine = null;
      host.innerHTML = "";
    };
  }, [engineMode]);

  return (
    <div className="canvas-office-root" data-canvas-office-mode={engineMode}>
      <div className="canvas-office-shell" data-canvas-office-mode={engineMode}>
        <main className="canvas-office-main">
          <div
            ref={canvas2dHostRef}
            className="canvas-office-surface"
            data-canvas-office-surface
            aria-label="工作白板画布容器"
          />
        </main>
      </div>
    </div>
  );
}

export default CanvasOfficePage;
