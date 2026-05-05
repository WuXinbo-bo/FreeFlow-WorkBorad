import { createTextElement } from "./engine/canvas2d-core/elements/text.js";
import { createEditableTableElement } from "./engine/canvas2d-core/elements/table.js";
import { createCodeBlockElement } from "./engine/canvas2d-core/elements/codeBlock.js";
import { createMindNodeElement } from "./engine/canvas2d-core/elements/mind.js";
import { createShapeElement } from "./engine/canvas2d-core/elements/shapes.js";
import { createFileCardElement } from "./engine/canvas2d-core/elements/fileCard.js";

export const DEMO_STORAGE_KEY = "freeflow_canvas_demo_standalone_board_v3";
export const DEMO_DOCX_PATH = "__ff_demo__/freeflow-selection-word.docx";

function createPanelRect(start, end, options = {}) {
  const rect = createShapeElement("rect", start, end);
  rect.strokeColor = options.strokeColor || "rgba(42, 99, 244, 0.1)";
  rect.fillColor = options.fillColor || "rgba(255,255,255,0.94)";
  rect.radius = options.radius || 24;
  rect.strokeWidth = options.strokeWidth || 2;
  return rect;
}

export function buildDemoBoard() {
  const centerShell = createPanelRect({ x: -520, y: -250 }, { x: 120, y: 70 }, {
    fillColor: "rgba(255,255,255,0.9)",
    strokeColor: "rgba(42, 99, 244, 0.08)",
    radius: 30,
  });

  const centerText = createTextElement(
    { x: -420, y: -104 },
    "尝试拖拽内容进入画布",
    "<h1>尝试拖拽内容进入画布</h1>"
  );
  centerText.width = 420;
  centerText.fontSize = 30;
  centerText.textBoxLayoutMode = "auto-height";
  centerText.textResizeMode = "wrap";

  const tablePanel = createPanelRect({ x: 220, y: -250 }, { x: 920, y: -18 });
  const tableTitle = createTextElement(
    { x: 258, y: -210 },
    "结构化接入",
    "<h2>结构化接入</h2>"
  );
  tableTitle.width = 180;
  tableTitle.fontSize = 20;
  tableTitle.textBoxLayoutMode = "auto-height";
  tableTitle.textResizeMode = "wrap";

  const table = createEditableTableElement({ x: 258, y: -152 }, { columns: 4, rows: 4 });
  table.title = "接入链路";
  table.table.title = "接入链路";
  table.table.rows[0].cells[0].plainText = "来源";
  table.table.rows[0].cells[1].plainText = "承接";
  table.table.rows[0].cells[2].plainText = "状态";
  table.table.rows[0].cells[3].plainText = "说明";
  table.table.rows[1].cells[0].plainText = "Markdown";
  table.table.rows[1].cells[1].plainText = "富文本";
  table.table.rows[1].cells[2].plainText = "继续编辑";
  table.table.rows[1].cells[3].plainText = "保留语义";
  table.table.rows[2].cells[0].plainText = "代码";
  table.table.rows[2].cells[1].plainText = "代码块";
  table.table.rows[2].cells[2].plainText = "继续编辑";
  table.table.rows[2].cells[3].plainText = "支持高亮";
  table.table.rows[3].cells[0].plainText = "文件";
  table.table.rows[3].cells[1].plainText = "文件卡";
  table.table.rows[3].cells[2].plainText = "继续处理";
  table.table.rows[3].cells[3].plainText = "预览联动";
  table.width = 620;
  table.height = 142;

  const codePanel = createPanelRect({ x: 220, y: 80 }, { x: 760, y: 350 });
  const codeTitle = createTextElement(
    { x: 258, y: 118 },
    "内容接入运行",
    "<h2>内容接入运行</h2>"
  );
  codeTitle.width = 180;
  codeTitle.fontSize = 20;
  codeTitle.textBoxLayoutMode = "auto-height";
  codeTitle.textResizeMode = "wrap";

  const code = createCodeBlockElement(
    { x: 258, y: 172 },
    `runtime.runPasteEvent(event, {\n  board,\n  anchorPoint,\n});`,
    "javascript",
    { previewMode: "source", width: 450 }
  );
  code.title = "内容接入运行";

  const filePanel = createPanelRect({ x: 806, y: 80 }, { x: 1136, y: 350 });
  const fileTitle = createTextElement(
    { x: 842, y: 118 },
    "文件协作",
    "<h2>文件协作</h2>"
  );
  fileTitle.width = 160;
  fileTitle.fontSize = 20;
  fileTitle.textBoxLayoutMode = "auto-height";
  fileTitle.textResizeMode = "wrap";

  const fileCard = createFileCardElement(
    {
      name: "freeflow-selection-word.docx",
      path: DEMO_DOCX_PATH,
      size: 11997,
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    { x: 842, y: 178 }
  );
  fileCard.memo = "";
  fileCard.memoVisible = false;

  const mindPanel = createPanelRect({ x: 1180, y: -250 }, { x: 1620, y: 350 });
  const mindTitle = createTextElement(
    { x: 1218, y: -210 },
    "原生混排",
    "<h2>原生混排</h2>"
  );
  mindTitle.width = 160;
  mindTitle.fontSize = 20;
  mindTitle.textBoxLayoutMode = "auto-height";
  mindTitle.textResizeMode = "wrap";

  const rootMind = createMindNodeElement({ x: 1330, y: 40 }, "FreeFlow 画布");
  rootMind.rootId = rootMind.id;
  rootMind.branchSide = "right";

  const node1 = createMindNodeElement({ x: 1490, y: -40 }, "结构接入");
  node1.parentId = rootMind.id;
  node1.rootId = rootMind.id;
  node1.depth = 1;
  node1.order = 0;

  const node2 = createMindNodeElement({ x: 1490, y: 40 }, "原生混排");
  node2.parentId = rootMind.id;
  node2.rootId = rootMind.id;
  node2.depth = 1;
  node2.order = 1;

  const node3 = createMindNodeElement({ x: 1490, y: 120 }, "办公导出");
  node3.parentId = rootMind.id;
  node3.rootId = rootMind.id;
  node3.depth = 1;
  node3.order = 2;

  rootMind.childrenIds = [node1.id, node2.id, node3.id];

  return {
    items: [
      centerShell,
      centerText,
      tablePanel,
      tableTitle,
      table,
      codePanel,
      codeTitle,
      code,
      filePanel,
      fileTitle,
      fileCard,
      mindPanel,
      mindTitle,
      rootMind,
      node1,
      node2,
      node3,
    ],
    selectedIds: [],
    view: {
      scale: 0.66,
      offsetX: 450,
      offsetY: 286,
    },
    preferences: {
      allowLocalFileAccess: false,
      backgroundPattern: "dots",
    },
  };
}

export const FEATURE_ITEMS = [
  {
    title: "结构化内容接入",
    description: "外部内容优先进入可继续编辑的画布对象。",
  },
  {
    title: "原生混排编辑",
    description: "文本、表格、代码块与节点直接共存。",
  },
  {
    title: "办公流直接输出",
    description: "画布结果继续进入正式办公交付链路。",
  },
  {
    title: "文件协作预览",
    description: "示例文件可在体验画布里继续查看与整理。",
  },
];
