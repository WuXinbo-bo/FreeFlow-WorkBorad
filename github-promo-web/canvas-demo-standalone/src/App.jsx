import React, { useEffect, useMemo, useRef, useState } from "react";
import { createCanvas2DEngine } from "./engine/canvas2d-core/createCanvas2DEngine.js";
import { DEMO_STORAGE_KEY, FEATURE_ITEMS, buildDemoBoard } from "./demoBoard.js";
import "./engine/canvas2d-core/ui/index.js";

function CanvasDemoApp() {
  const canvasHostRef = useRef(null);
  const engineRef = useRef(null);
  const demoBoard = useMemo(() => buildDemoBoard(), []);
  const [demoRevision, setDemoRevision] = useState(0);

  useEffect(() => {
    document.body.classList.add("canvas-demo-page");
    return () => {
      document.body.classList.remove("canvas-demo-page");
    };
  }, []);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!(host instanceof HTMLElement)) {
      return undefined;
    }

    const engine = createCanvas2DEngine({
      initialBoard: demoBoard,
      disableLocalStorage: false,
      storageKey: DEMO_STORAGE_KEY,
    });
    globalThis.__canvas2dEngine = engine;
    engineRef.current = engine;
    engine.mount(host);
    requestAnimationFrame(() => {
      engine.zoomToFit?.();
    });

    return () => {
      const current = engineRef.current;
      engineRef.current = null;
      if (current?.destroy) {
        current.destroy();
      } else {
        current?.unmount?.();
      }
      globalThis.__canvas2dEngine = null;
      host.innerHTML = "";
    };
  }, [demoBoard, demoRevision]);

  return (
    <div className="canvas-demo-app">
      <div className="canvas-demo-ambient" aria-hidden="true" />
      <div className="canvas-demo-shell">
        <aside className="canvas-demo-panel">
          <div className="canvas-demo-brand">
            <div className="canvas-demo-brand-text">
              <strong>FreeFlow</strong>
              <span>FreeFlow Demo</span>
            </div>
          </div>

          <div className="canvas-demo-subtitle">在线体验</div>

          <section className="canvas-demo-capability-list" aria-label="核心能力">
            {FEATURE_ITEMS.map((feature, index) => (
              <article key={feature.title} className="canvas-demo-capability-card">
                <span className="canvas-demo-capability-index">{`0${index + 1}`}</span>
                <div className="canvas-demo-capability-copy">
                  <strong>{feature.title}</strong>
                  <p>{feature.description}</p>
                </div>
              </article>
            ))}
          </section>
        </aside>

        <section className="canvas-demo-stage" aria-label="FreeFlow 画布试玩区">
          <div className="canvas-demo-stage-head">
            <div className="canvas-demo-stage-pill is-quiet">
              <span>拖拽、缩放、双击编辑</span>
            </div>
          </div>
          <div ref={canvasHostRef} className="canvas-demo-surface" aria-label="FreeFlow 试玩画布容器" />
        </section>
      </div>
    </div>
  );
}

export default CanvasDemoApp;
