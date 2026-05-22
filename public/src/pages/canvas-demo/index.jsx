import React, { useEffect, useMemo, useRef, useState } from "react";
import { createCanvas2DEngine } from "../../engines/canvas2d-core/createCanvas2DEngine.js";
import { createTextElement } from "../../engines/canvas2d-core/elements/text.js";
import { createEditableTableElement } from "../../engines/canvas2d-core/elements/table.js";
import { createCodeBlockElement } from "../../engines/canvas2d-core/elements/codeBlock.js";
import { createMindNodeElement } from "../../engines/canvas2d-core/elements/mind.js";
import { createShapeElement } from "../../engines/canvas2d-core/elements/shapes.js";
import { createFileCardElement } from "../../engines/canvas2d-core/elements/fileCard.js";
import "../../engines/canvas2d-core/ui/index.js";

const DEMO_STORAGE_KEY = "freeflow_canvas_demo_board_v1";

function buildDemoBoard() {
  const heroText = createTextElement(
    { x: -780, y: -460 },
    "不是把内容贴到画布上，而是把结构、格式和后续工作能力一起接进来。",
    "<h1>不是把内容贴到画布上，<br/>而是把结构、格式和后续工作能力一起接进来。</h1>"
  );
  heroText.width = 680;
  heroText.textBoxLayoutMode = "auto-height";
  heroText.textResizeMode = "wrap";
  heroText.fontSize = 28;

  const intro = createTextElement(
    { x: -780, y: -290 },
    "FreeFlow 画布把结构化接入、原生混排、本地协作与办公导出放进同一张工作画布。你可以直接试着编辑右侧内容。",
    "<p>FreeFlow 画布把 <strong>结构化接入</strong>、<strong>原生混排</strong>、<strong>本地协作</strong> 与 <strong>办公导出</strong> 放进同一张工作画布。你可以直接试着编辑右侧内容。</p>"
  );
  intro.width = 620;
  intro.textBoxLayoutMode = "auto-height";
  intro.textResizeMode = "wrap";
  intro.fontSize = 18;

  const bullets = createTextElement(
    { x: -780, y: -150 },
    "• 文本、网页、Markdown、代码、公式与文件可结构化进入画布\n• 内容进入后仍可继续编辑，而不是只剩展示\n• 表格、代码块、文件卡与思维节点可在同一空间混排协作",
    "<ul><li>文本、网页、Markdown、代码、公式与文件可结构化进入画布</li><li>内容进入后仍可继续编辑，而不是只剩展示</li><li>表格、代码块、文件卡与思维节点可在同一空间混排协作</li></ul>"
  );
  bullets.width = 620;
  bullets.textBoxLayoutMode = "auto-height";
  bullets.textResizeMode = "wrap";
  bullets.fontSize = 17;

  const frame = createShapeElement("rect", { x: -860, y: -540 }, { x: -120, y: 260 });
  frame.strokeColor = "rgba(44, 99, 243, 0.18)";
  frame.fillColor = "rgba(255,255,255,0.58)";
  frame.radius = 28;
  frame.strokeWidth = 2;

  const glow = createShapeElement("highlight", { x: -846, y: -510 }, { x: -140, y: 220 });
  glow.fillColor = "rgba(118, 154, 255, 0.08)";
  glow.strokeColor = "rgba(118, 154, 255, 0.16)";
  glow.strokeWidth = 18;

  const table = createEditableTableElement({ x: 80, y: -230 }, { columns: 4, rows: 4 });
  table.title = "发布排期";
  table.table.title = "发布排期";
  table.table.rows[0].cells[0].plainText = "阶段";
  table.table.rows[0].cells[1].plainText = "目标";
  table.table.rows[0].cells[2].plainText = "状态";
  table.table.rows[0].cells[3].plainText = "备注";
  table.table.rows[1].cells[0].plainText = "导入";
  table.table.rows[1].cells[1].plainText = "结构化接入";
  table.table.rows[1].cells[2].plainText = "完成";
  table.table.rows[1].cells[3].plainText = "支持 HTML / Markdown / 代码 / 公式";
  table.table.rows[2].cells[0].plainText = "编辑";
  table.table.rows[2].cells[1].plainText = "原生混排";
  table.table.rows[2].cells[2].plainText = "完成";
  table.table.rows[2].cells[3].plainText = "表格、代码、文件卡共存";
  table.table.rows[3].cells[0].plainText = "输出";
  table.table.rows[3].cells[1].plainText = "办公导出";
  table.table.rows[3].cells[2].plainText = "完成";
  table.table.rows[3].cells[3].plainText = "Word / PDF / CSV / XLSX";
  table.width = 760;
  table.height = 250;

  const code = createCodeBlockElement(
    { x: 100, y: 80 },
    `const runtime = createStructuredImportRuntime({\n  parsers: [html, markdown, code, math, image, file],\n  renderers: [text, list, table, codeBlock, math, image]\n});\n\nruntime.runPasteEvent(event, {\n  board,\n  anchorPoint,\n});`,
    "javascript",
    { previewMode: "source", width: 720 }
  );
  code.title = "结构化接入运行时";

  const fileCard = createFileCardElement(
    {
      name: "freeflow-selection-word.docx",
      path: "C:\\Demo\\freeflow-selection-word.docx",
      size: 183424,
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    { x: 860, y: -220 }
  );
  fileCard.memo = "文件卡可承接真实文件，并参与预览、定位与工作区协作。";
  fileCard.memoVisible = true;

  const rootMind = createMindNodeElement({ x: 900, y: 100 }, "FreeFlow 画布");
  rootMind.rootId = rootMind.id;
  rootMind.branchSide = "right";

  const node1 = createMindNodeElement({ x: 1180, y: -10 }, "结构化接入");
  node1.parentId = rootMind.id;
  node1.rootId = rootMind.id;
  node1.depth = 1;
  node1.order = 0;

  const node2 = createMindNodeElement({ x: 1180, y: 120 }, "原生混排");
  node2.parentId = rootMind.id;
  node2.rootId = rootMind.id;
  node2.depth = 1;
  node2.order = 1;

  const node3 = createMindNodeElement({ x: 1180, y: 250 }, "办公直出");
  node3.parentId = rootMind.id;
  node3.rootId = rootMind.id;
  node3.depth = 1;
  node3.order = 2;

  rootMind.childrenIds = [node1.id, node2.id, node3.id];

  const connector1 = createShapeElement("arrow", { x: 200, y: -70 }, { x: 840, y: -140 });
  connector1.strokeColor = "rgba(44, 99, 243, 0.65)";
  connector1.strokeWidth = 3;

  const connector2 = createShapeElement("arrow", { x: 340, y: 210 }, { x: 840, y: 166 });
  connector2.strokeColor = "rgba(15, 118, 110, 0.55)";
  connector2.strokeWidth = 3;

  const footer = createTextElement(
    { x: 60, y: 320 },
    "右侧是可直接操作的真实画布引擎，而不是静态示意图。",
    "<p>右侧是可直接操作的 <strong>真实画布引擎</strong>，而不是静态示意图。</p>"
  );
  footer.width = 520;
  footer.textBoxLayoutMode = "auto-height";
  footer.textResizeMode = "wrap";
  footer.fontSize = 18;

  return {
    items: [
      glow,
      frame,
      heroText,
      intro,
      bullets,
      table,
      code,
      fileCard,
      rootMind,
      node1,
      node2,
      node3,
      connector1,
      connector2,
      footer,
    ],
    selectedIds: [],
    view: {
      scale: 0.54,
      offsetX: 580,
      offsetY: 390,
    },
    preferences: {
      allowLocalFileAccess: false,
      backgroundPattern: "engineering",
    },
  };
}

const FEATURE_ITEMS = [
  {
    title: "结构化内容接入",
    description: "网页、Markdown、代码、表格、公式与文件不会被简单降级，而是尽量转成可继续工作的画布对象。",
  },
  {
    title: "原生混排编辑",
    description: "文本、思维导图、表格、代码块、文件卡与图形可以在同一张画布里并行编辑与组织。",
  },
  {
    title: "办公流直接输出",
    description: "画布结果不仅能截图，还能继续进入 Word、PDF、Markdown、CSV、TXT 与 XLSX 的正式交付链路。",
  },
];

function CanvasDemoPage() {
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
            <img src="../assets/brand/FreeFlow_logo.svg" alt="FreeFlow" />
            <div className="canvas-demo-brand-text">
              <strong>FreeFlow Canvas</strong>
              <span>Online Demo Preview</span>
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
              <span>独立入口，不影响主项目页面</span>
            </div>
          </div>
          <div ref={canvasHostRef} className="canvas-demo-surface" aria-label="FreeFlow 试玩画布容器" />
        </section>
      </div>
    </div>
  );
}

export default CanvasDemoPage;
