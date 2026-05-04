const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:3000/canvas-office.html";
const STORAGE_KEY = "ai_worker_canvas_office_board_v3";

function assert(condition, message, detail = "") {
  if (!condition) {
    const suffix = detail ? `\n${detail}` : "";
    throw new Error(`${message}${suffix}`);
  }
}

function createMindNode(id, x, y, text) {
  return {
    id,
    type: "mindNode",
    title: text,
    text,
    plainText: text,
    html: "",
    x,
    y,
    width: 220,
    height: 96,
    fontSize: 18,
    color: "#0f172a",
    layoutMode: "horizontal",
    branchSide: "right",
    parentId: "",
    rootId: "",
    depth: 0,
    order: 0,
    collapsed: false,
    childrenIds: [],
    links: [],
    createdAt: Date.now(),
  };
}

function createTable(id, x, y, text) {
  return {
    id,
    type: "table",
    title: "表格DS1",
    columns: 2,
    rows: 2,
    x,
    y,
    width: 320,
    height: 140,
    locked: false,
    createdAt: Date.now(),
    table: {
      title: "表格DS1",
      columns: 2,
      hasHeader: true,
      rows: [
        {
          rowIndex: 0,
          cells: [
            { plainText: "列 1", html: "", header: true, align: "", rowIndex: 0, columnIndex: 0 },
            { plainText: "列 2", html: "", header: true, align: "", rowIndex: 0, columnIndex: 1 },
          ],
        },
        {
          rowIndex: 1,
          cells: [
            { plainText: text, html: "", header: false, align: "", rowIndex: 1, columnIndex: 0 },
            { plainText: "普通单元格", html: "", header: false, align: "", rowIndex: 1, columnIndex: 1 },
          ],
        },
      ],
    },
  };
}

function createCodeBlock(id, x, y, code) {
  return {
    id,
    type: "codeBlock",
    title: "代码块DS1",
    language: "javascript",
    code,
    text: code,
    plainText: code,
    fontSize: 16,
    x,
    y,
    width: 320,
    height: 140,
    wrap: false,
    showLineNumbers: true,
    headerVisible: true,
    collapsed: false,
    autoHeight: true,
    tabSize: 2,
    previewMode: "source",
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createRichTextTableText(id, x, y) {
  return {
    id,
    type: "text",
    title: "富文本表格容器",
    plainText: "",
    text: "",
    html: "<table><thead><tr><th>模块</th><th>值</th></tr></thead><tbody><tr><td>RT表格关键字</td><td>命中</td></tr></tbody></table>",
    richTextDocument: {
      version: 1,
      kind: "rich-text",
      plainText: "",
      html: "<table><thead><tr><th>模块</th><th>值</th></tr></thead><tbody><tr><td>RT表格关键字</td><td>命中</td></tr></tbody></table>",
      blocks: [
        {
          id: "table-1",
          type: "table",
          blocks: [
            {
              id: "table-row-1",
              type: "table-row",
              attrs: { headerRow: true },
              blocks: [
                { id: "table-cell-1-1", type: "table-cell", content: [{ type: "text", text: "模块" }] },
                { id: "table-cell-1-2", type: "table-cell", content: [{ type: "text", text: "值" }] },
              ],
            },
            {
              id: "table-row-2",
              type: "table-row",
              blocks: [
                { id: "table-cell-2-1", type: "table-cell", content: [{ type: "text", text: "RT表格关键字" }] },
                { id: "table-cell-2-2", type: "table-cell", content: [{ type: "text", text: "命中" }] },
              ],
            },
          ],
        },
      ],
      meta: {},
    },
    x,
    y,
    width: 280,
    height: 120,
    fontSize: 20,
  };
}

function createRichTextCodeText(id, x, y) {
  return {
    id,
    type: "text",
    title: "富文本代码容器",
    plainText: "",
    text: "",
    html: "<pre><code>const RT_CODE_TOKEN = '命中';</code></pre>",
    richTextDocument: {
      version: 1,
      kind: "rich-text",
      plainText: "",
      html: "<pre><code>const RT_CODE_TOKEN = '命中';</code></pre>",
      blocks: [
        {
          id: "code-1",
          type: "code-block",
          plainText: "const RT_CODE_TOKEN = '命中';",
          attrs: { language: "javascript" },
          meta: {},
        },
      ],
      meta: {},
    },
    x,
    y,
    width: 280,
    height: 120,
    fontSize: 20,
  };
}

async function readSearchProbe(page, query, filterLabel = "") {
  const input = page.locator(".canvas2d-engine-search-input");
  await input.fill(query);
  await page.waitForTimeout(250);
  if (filterLabel) {
    await page.locator(".canvas2d-engine-search-scope-chip", { hasText: filterLabel }).evaluate((node) => {
      node.click();
    });
    await page.waitForTimeout(150);
  }
  return page.evaluate(() => ({
    status: document.querySelector(".canvas2d-engine-search-status")?.textContent?.trim() || "",
    scopes: Array.from(document.querySelectorAll(".canvas2d-engine-search-scope-chip")).map((node) =>
      node.textContent.trim()
    ),
    results: Array.from(document.querySelectorAll(".canvas2d-engine-search-result")).map((node) =>
      node.textContent.trim()
    ),
    empty: document.querySelector(".canvas2d-engine-search-empty")?.textContent?.trim() || "",
  }));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(String(error?.stack || error?.message || error));
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  const board = {
    items: [
      createMindNode("mind-node-ds1", 160, 260, "节点DS1"),
      createTable("table-ds1", 480, 260, "表格DS1内容"),
      createCodeBlock("code-ds1", 860, 260, "const DS1 = true; // 代码块DS1内容"),
      createRichTextTableText("rt-table-ds1", 320, 520),
      createRichTextCodeText("rt-code-ds1", 760, 520),
    ],
    selectedIds: [],
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    background: "#f8fafc",
  };

  await page.addInitScript(
    ({ storageKey, payload }) => {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    },
    { storageKey: STORAGE_KEY, payload: board }
  );

  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__canvas2dEngine), null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.keyboard.press("Control+K");
    await page.waitForSelector(".canvas2d-engine-search-panel");

    const nodeProbe = await readSearchProbe(page, "节点DS1", "节点");
    const tableProbe = await readSearchProbe(page, "表格DS1内容", "表格");
    const codeProbe = await readSearchProbe(page, "代码块DS1内容", "代码");
    const richTableProbe = await readSearchProbe(page, "RT表格关键字", "表格");
    const richCodeProbe = await readSearchProbe(page, "RT_CODE_TOKEN", "代码");

    console.log(JSON.stringify({ errors, nodeProbe, tableProbe, codeProbe, richTableProbe, richCodeProbe }, null, 2));

    assert(errors.length === 0, "page errors detected", errors.join("\n"));
    assert(nodeProbe.results.some((entry) => entry.includes("节点DS1")), "mind node search result missing", JSON.stringify(nodeProbe.results));
    assert(tableProbe.results.some((entry) => entry.includes("表格DS1")), "table search result missing", JSON.stringify(tableProbe.results));
    assert(codeProbe.results.some((entry) => entry.includes("代码块DS1")), "code block search result missing", JSON.stringify(codeProbe.results));
    assert(richTableProbe.results.some((entry) => entry.includes("RT表格关键字")), "rich text table search result missing", JSON.stringify(richTableProbe.results));
    assert(richCodeProbe.results.some((entry) => entry.includes("RT_CODE_TOKEN")), "rich text code search result missing", JSON.stringify(richCodeProbe.results));
    assert(richTableProbe.status.includes("表格"), "table filter status mismatch", richTableProbe.status);
    assert(richCodeProbe.status.includes("代码"), "code filter status mismatch", richCodeProbe.status);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
