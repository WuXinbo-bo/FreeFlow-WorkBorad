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

  function handleResetDemo() {
    localStorage.removeItem(DEMO_STORAGE_KEY);
    setDemoRevision((value) => value + 1);
  }

  function handleFocusStage() {
    engineRef.current?.zoomToFit?.();
  }

  return (
    <div className="canvas-demo-app">
      <div className="canvas-demo-ambient" aria-hidden="true" />
      <div className="canvas-demo-shell">
        <aside className="canvas-demo-panel">
          <div className="canvas-demo-brand">
            <img src="./assets/brand/FreeFlow_logo.svg" alt="FreeFlow" />
            <div className="canvas-demo-brand-text">
              <strong>FreeFlow Canvas</strong>
              <span>Standalone Demo</span>
            </div>
          </div>

          <section className="canvas-demo-hero">
            <div className="canvas-demo-kicker">Canvas System Demo</div>
            <h1>
              让内容在画布里
              <br />
              <span>继续工作。</span>
            </h1>
            <p>
              这不是一张只能摆放内容的白板，而是一套把结构化接入、原生编辑、本地协作与办公输出合并到同一空间里的画布系统。
            </p>
            <div className="canvas-demo-actions">
              <button type="button" className="canvas-demo-btn canvas-demo-btn-primary" onClick={handleFocusStage}>
                聚焦试玩画布
              </button>
              <button type="button" className="canvas-demo-btn canvas-demo-btn-secondary" onClick={handleResetDemo}>
                重置示例内容
              </button>
            </div>
          </section>

          <section className="canvas-demo-stats" aria-label="核心指标">
            <div className="canvas-demo-stat">
              <strong>6+</strong>
              <span>结构化接入类型</span>
            </div>
            <div className="canvas-demo-stat">
              <strong>10+</strong>
              <span>原生元素家族</span>
            </div>
            <div className="canvas-demo-stat">
              <strong>多格式</strong>
              <span>办公导出链路</span>
            </div>
          </section>

          <section className="canvas-demo-feature-list" aria-label="差异化能力">
            {FEATURE_ITEMS.map((feature) => (
              <article key={feature.title} className="canvas-demo-feature">
                <strong>{feature.title}</strong>
                <p>{feature.description}</p>
              </article>
            ))}
          </section>

          <div className="canvas-demo-feature-grid" aria-label="产品标签">
            <div className="canvas-demo-chip">
              <span className="canvas-demo-chip-dot" />
              <span>结构接入</span>
            </div>
            <div className="canvas-demo-chip">
              <span className="canvas-demo-chip-dot" />
              <span>原生混排</span>
            </div>
            <div className="canvas-demo-chip">
              <span className="canvas-demo-chip-dot" />
              <span>办公直出</span>
            </div>
          </div>
        </aside>

        <section className="canvas-demo-stage" aria-label="FreeFlow 画布试玩区">
          <div className="canvas-demo-stage-head">
            <div className="canvas-demo-stage-badge">
              <strong>真实画布引擎</strong>
              <span>可直接拖拽、缩放、编辑</span>
            </div>
            <div className="canvas-demo-stage-note">
              <strong>Demo 状态</strong>
              <span>独立静态子项目，可直接部署</span>
            </div>
          </div>
          <div ref={canvasHostRef} className="canvas-demo-surface" aria-label="FreeFlow 试玩画布容器" />
        </section>
      </div>
    </div>
  );
}

export default CanvasDemoApp;
