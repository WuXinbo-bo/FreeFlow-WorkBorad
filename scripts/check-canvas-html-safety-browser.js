const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { Document, Packer, Paragraph } = require("docx");

const URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:53127/canvas-office.html";

async function checkWordPreviewRecovery(page) {
  const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Word recovery fixture")] }] }));
  await page.evaluate((fixture) => {
    window.desktopShell = { ...window.desktopShell, previewWordDocx: async () => ({ ok: true, docxBase64: fixture }) };
    window.__canvas2dEngine.loadStructuredBoardForExport({
      items: [140, 340].map((y, index) => ({ id: `word-${index}`, type: "text", x: 140, y, width: 400, height: 100, text: "Word fixture", plainText: "Word fixture", html: "<p>Word fixture</p>", fontSize: 24 })),
      selectedIds: ["word-0", "word-1"], view: { scale: 1, offsetX: 0, offsetY: 0 },
    });
  }, docx.toString("base64"));
  const open = async () => {
    await page.evaluate(() => {
      const canvas = document.getElementById("canvas-office-canvas");
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.x + 160, clientY: rect.y + 160, button: 2 }));
      document.querySelector('[data-action="export-selection-word"]').click();
    });
    await page.getByRole("dialog", { name: "Word 导出预览", exact: true }).waitFor();
  };
  const close = async () => {
    await page.getByRole("button", { name: "关闭 Word 导出预览", exact: true }).click();
    await page.getByRole("dialog", { name: "Word 导出预览", exact: true }).waitFor({ state: "hidden" });
  };
  let release;
  let started;
  let first = true;
  const pending = new Promise((resolve) => { started = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  await page.route("**/jszip.min.js", async (route) => {
    if (first) { first = false; started(); await blocked; }
    try { await route.continue(); } catch { /* The closed iframe may have cancelled its request. */ }
  });
  try {
    await open();
    await Promise.race([pending, new Promise((_, reject) => setTimeout(() => reject(new Error("Word script was not requested")), 5000))]);
    await page.evaluate(() => {
      const doc = document.querySelector(".canvas2d-word-export-docx-iframe").contentDocument;
      window.__staleWordWheelListeners = 0;
      const original = doc.addEventListener.bind(doc);
      doc.addEventListener = (type, ...args) => {
        if (type === "wheel") window.__staleWordWheelListeners += 1;
        return original(type, ...args);
      };
    });
    await close();
    release();
    await open();
    await page.waitForFunction(() => document.querySelector(".canvas2d-word-export-docx-iframe")?.contentDocument?.body.textContent.includes("Word recovery fixture"));
    await page.waitForFunction(() => !document.querySelector(".canvas2d-word-preview-empty"));
    assert.equal(await page.evaluate(() => window.__staleWordWheelListeners), 0, "late Word preview registered a listener after closing");
    await close();
    for (let cycle = 0; cycle < 3; cycle += 1) { await open(); await close(); }
  } finally {
    release();
    await page.unroute("**/jszip.min.js");
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(URL);
    await page.waitForFunction(() => window.__canvas2dEngine);
    const html = await page.evaluate(async () => {
      const { sanitizeHtml } = await import("/src/engines/canvas2d-core/utils.js");
      const { resolveRichTextDisplayHtml } = await import("/src/engines/canvas2d-core/rendererText.js");
      const safe = sanitizeHtml('<p style="text-align:center"><span data-ff-font-size="28" style="color:#ff0000;font-size:28px">格式</span><a href="https://example.com" target="_blank">链接</a></p>');
      const unsafe = '<p style="background-image:url(https://example.com/tracker)">unsafe<img src="invalid-image" onerror="window.__htmlAttack=1"></p><a href="javascript:window.__htmlAttack=2">bad</a><iframe srcdoc="<script>parent.__htmlAttack=3</script>"></iframe>';
      const results = {
        safe,
        clean: sanitizeHtml(unsafe),
        display: resolveRichTextDisplayHtml({ html: unsafe }),
        image: sanitizeHtml('<img src="data:image/png;base64,AAAA" alt="图">'),
        math: sanitizeHtml('<p data-role="math-inline">x</p><math><mi>x</mi></math>'),
      };
      window.__canvas2dEngine.loadStructuredBoardForExport({
        items: [{ id: "html-safety", type: "text", x: 140, y: 140, width: 500, height: 160, fontSize: 24, text: "unsafe bad 格式 链接", plainText: "unsafe bad 格式 链接", html: unsafe + results.safe }],
        selectedIds: [], view: { scale: 1, offsetX: 0, offsetY: 0 },
      });
      const probe = document.createElement("div");
      probe.id = "html-safety-probe";
      probe.style.position = "fixed";
      probe.style.left = "-10000px";
      probe.innerHTML = results.display + results.safe;
      document.body.appendChild(probe);
      return results;
    });
    assert.match(html.safe, /data-ff-font-size="28"/);
    assert.match(html.safe, /color:\s*#ff0000/);
    assert.match(html.safe, /text-align:\s*center/);
    assert.match(html.safe, /rel="noopener noreferrer"/);
    for (const value of [html.clean, html.display]) {
      assert.doesNotMatch(value, /onerror|javascript:|background-image|srcdoc|<iframe/i);
    }
    assert.match(html.image, /data:image\/png/);
    assert.match(html.math, /data-role="math-inline"/);
    assert.match(html.math, /<math>/);
    await page.waitForFunction(() => document.querySelector("#html-safety-probe img")?.complete);
    assert.equal(await page.evaluate(() => Boolean(window.__htmlAttack)), false, "saved HTML executed an event handler");
    const savedHtml = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.find((item) => item.id === "html-safety").html);
    assert.doesNotMatch(savedHtml, /onerror|javascript:|background-image|srcdoc|<iframe/i);
    await page.evaluate(() => document.getElementById("html-safety-probe").remove());
    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const [menu, label] of [["画布图片管理", "画布图片管理"]]) {
        await page.getByRole("button", { name: "画布选项与帮助", exact: true }).click();
        await page.getByRole("dialog", { name: "画布选项与帮助", exact: true }).getByRole("button", { name: new RegExp(`^${menu}`) }).click();
        const dialog = page.getByRole("dialog", { name: label, exact: true });
        await dialog.waitFor();
        await dialog.getByRole("button", { name: /关闭/ }).first().click();
        await dialog.waitFor({ state: "hidden" });
      }
    }
    const diagrams = await page.evaluate(async () => {
      const { sanitizeDiagramSvg } = await import("/src/engines/canvas2d-core/utils.js");
      const { renderCodeBlockStatic } = await import("/src/engines/canvas2d-core/codeBlock/renderCodeBlockStatic.js");
      const payload = '<svg xmlns="http://www.w3.org/2000/svg" onload="window.__svgAttack=1"><script>window.__svgAttack=2</script><a href="javascript:window.__svgAttack=3"><text>bad</text></a><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><b>Label</b><img src="bad" onerror="window.__svgAttack=4"></div></foreignObject><defs><marker id="arrow"><path d="M0,0 L10,5"/></marker></defs><path marker-end="url(#arrow)" d="M0,0 L50,50"/><a href="https://example.com" target="_blank"><text>safe</text></a></svg>';
      const sanitized = sanitizeDiagramSvg(payload);
      const probe = document.createElement("div");
      probe.innerHTML = sanitized;
      document.body.append(probe);
      const node = document.createElement("div");
      node.id = "mermaid-safety-probe";
      document.body.append(node);
      renderCodeBlockStatic(node, { id: "diagram", type: "codeBlock", language: "mermaid", code: 'flowchart LR\n A["<b>Rich label</b>"] --> B[Safe]\n click B href "https://example.com" "Open"', width: 500, height: 300 });
      return sanitized;
    });
    assert.doesNotMatch(diagrams, /onload|onerror|<script|javascript:/i);
    assert.match(diagrams, /foreignObject/i);
    assert.match(diagrams, /marker-end="url\(#arrow\)"/);
    assert.match(diagrams, /https:\/\/example.com/);
    await page.waitForFunction(() => document.querySelector("#mermaid-safety-probe")?.dataset.mermaidState === "ready");
    assert(await page.locator("#mermaid-safety-probe svg path").count() > 0);
    assert(await page.evaluate(() => [...document.querySelectorAll("#mermaid-safety-probe a")].some((a) => (a.getAttribute("href") || a.getAttribute("xlink:href")) === "https://example.com")));
    assert(await page.locator("#mermaid-safety-probe").textContent().then((text) => text.includes("Rich label")));
    assert.equal(await page.evaluate(() => Boolean(window.__svgAttack)), false);
    await page.evaluate(() => document.getElementById("mermaid-safety-probe").remove());
    await checkWordPreviewRecovery(page);
    assert.deepEqual(errors, []);
    console.log("[check-canvas-html-safety-browser] HTML safety, saved content, repeated dialogs and delayed Word close/reopen passed");
  } catch (error) {
    console.error(await page.evaluate(() => ({
      board: window.__canvas2dEngine?.getSnapshot().board.items.slice(0, 2),
      rich: document.querySelector("#canvas2d-rich-display")?.innerHTML.slice(0, 1500),
      errors: window.__htmlAttack,
    })));
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
