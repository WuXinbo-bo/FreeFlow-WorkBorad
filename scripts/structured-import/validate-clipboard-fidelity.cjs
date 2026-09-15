const assert = require("node:assert/strict");

async function main() {
  const { createPasteGateway } = await import("../../public/src/engines/canvas2d-core/import/gateway/pasteGateway.js");
  const { createHtmlParser } = await import("../../public/src/engines/canvas2d-core/import/parsers/html/htmlParser.js");
  const { createWebContentParser } = await import("../../public/src/engines/canvas2d-core/import/parsers/webContent/webContentParser.js");
  const { flattenTableStructureToMatrix } = await import("../../public/src/engines/canvas2d-core/elements/table.js");
  const { resolveInternalClipboardFreshness } = await import("../../public/src/engines/canvas2d-core/brokers/internalClipboardFreshness.js");
  const { inlineNodesToHtml, normalizeInlineContentForCanvasText } = await import("../../public/src/engines/canvas2d-core/import/renderers/text/sharedTextRenderUtils.js");
  const { createClipboardDataTransferSnapshot, createClipboardDataTransferFacade } = await import("../../public/src/engines/canvas2d-core/brokers/clipboardSnapshot.js");
  const { createClipboardBroker } = await import("../../public/src/engines/canvas2d-core/brokers/clipboardBroker.js");
  const descriptor = (html) => createPasteGateway().fromSystemClipboardSnapshot({ html });
  const parse = async (html) => (await createHtmlParser().parse({ descriptor: descriptor(html) })).document.content;
  const checks = [
    ["snapshot outlives native transfer", async () => {
      const data = { "text/html": "<p>retained</p>", "application/x-freeflow-canvas2d": "identity" };
      const snapshot = createClipboardDataTransferSnapshot({ types: Object.keys(data), getData: (type) => data[type] });
      for (const type of Object.keys(data)) delete data[type];
      const facade = createClipboardDataTransferFacade(snapshot);
      assert.equal(facade.getData("text/html"), "<p>retained</p>");
      assert.equal(facade.getData("application/x-freeflow-canvas2d"), "identity");
    }],
    ["system snapshot never mixes fresh readText with existing HTML", async () => {
      let textReads = 0;
      const broker = createClipboardBroker({
        readClipboardItems: async () => [{ types: ["text/html", "text/plain"], getType: async (type) => {
          if (type === "text/plain") throw Error("unreadable text");
          return new Blob(["<b>old snapshot</b>"], { type });
        } }],
        readClipboardText: async () => { textReads++; return "new clipboard"; },
      });
      const snapshot = await broker.readSystemClipboardSnapshot();
      assert.equal(snapshot.html, "<b>old snapshot</b>");
      assert.equal(textReads, 0);
    }],
    ["wrapper structure and nested table rows stay separate", async () => {
      const nodes = await parse('<main><p>before</p><pre data-language="python"><code>return 42</code></pre><table><tr><td>outer<table><tr><td>inner</td></tr></table></td></tr></table></main>');
      assert.deepEqual(nodes.map((node) => node.type), ["paragraph", "codeBlock", "table"]);
      assert.equal(nodes[1].attrs.language, "python");
      assert.equal(nodes[2].content.length, 1);
      assert.equal(nodes[2].content[0].content[0].content[1].type, "table");
    }],
    ["child styles override inherited styles", async () => {
      const [inherited] = await parse('<main style="color:red"><section><p>Inherited</p></section></main>');
      assert(inherited.content[0].marks.some((mark) => mark.type === "textColor" && mark.attrs.color === "red"));
      const [node] = await parse('<div style="color:red"><section><p><span style="color:blue;text-decoration-line:underline;font-size:21pt">Child</span></p></section></div>');
      const marks = node.content[0].marks;
      assert.deepEqual(marks.filter((mark) => mark.type === "textColor").map((mark) => mark.attrs.color), ["blue"]);
      assert(marks.some((mark) => mark.type === "underline"));
      assert(marks.some((mark) => mark.type === "fontSize" && mark.attrs.value === "28px"));
    }],
    ["selection is not article extraction", async () => {
      const input = descriptor("<p>BEFORE</p><article><p>Body</p></article><p>AFTER</p>");
      assert.equal(createWebContentParser().supports({ descriptor: input }).matched, false);
    }],
    ["row and column spans survive", async () => {
      const [table] = await parse('<table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td colspan="2">C</td></tr></table>');
      assert.equal(table.content[0].content[0].attrs.rowSpan, 2);
      assert.equal(table.attrs.columns, 3);
      const matrix = flattenTableStructureToMatrix({ rows: [
        { cells: [{ plainText: "A", rowSpan: 2 }, { plainText: "B" }] },
        { cells: [{ plainText: "C", colSpan: 2 }] },
      ] });
      assert.equal(matrix[0].length, 3);
      assert.equal(matrix[1][0].covered, true);
      assert.equal(matrix[1][1].plainText, "C");
      assert.equal(matrix[1][2].covered, true);
    }],
    ["supported styles survive rendering", async () => {
      const [paragraph] = await parse('<p><span style="color:#ff0000;background-color:#ffff00;font-size:28px;font-family:serif;font-weight:bold">Styled</span></p>');
      const html = inlineNodesToHtml(normalizeInlineContentForCanvasText(paragraph.content));
      for (const expected of ["color:#ff0000", "background-color:#ffff00", "font-size:28px", "font-family:serif", "<strong>"]) assert(html.includes(expected), expected);
    }],
    ["row and cell fragments recover a table", async () => {
      for (const html of ['<tr><td>A</td><td>B</td></tr>', '<td>A</td><td>B</td>']) {
        const [table] = await parse(html);
        assert.equal(table.type, "table");
        assert.equal(table.content[0].content.length, 2);
      }
    }],
    ["unambiguous highlighted fragment recovers code", async () => {
      const [code] = await parse('<span class="token keyword">return</span> <span class="token number">42</span>');
      assert.equal(code.type, "codeBlock");
      assert.equal(code.text, "return 42");
      const [text] = await parse('<p>Use <code>return 42</code> in your example.</p>');
      assert.equal(text.type, "paragraph");
    }],
    ["identical plain text is not clipboard identity", async () => {
      assert.equal(resolveInternalClipboardFreshness({ payload: { clipboardId: "old", items: [{}] }, payloadText: "same", clipboardText: "same" }), false);
    }],
    ["unsafe styles and URLs remain excluded", async () => {
      const result = await parse('<p><span onclick="bad()" style="color:expression(bad());background-color:url(https://example.test/x);position:fixed">safe</span><a href="javascript:bad()">link</a></p>');
      assert(!/expression|javascript:|position:|onclick|https:\/\/example.test/.test(JSON.stringify(result)));
    }],
    ["code whitespace remains exact", async () => {
      const code = 'if x < 2:\n    print("a")\n\n    print(x)';
      const [node] = await parse('<pre><code class="language-python">if x &lt; 2:\n    print(&quot;a&quot;)\n\n    print(x)</code></pre>');
      assert.equal(node.text, code);
      assert.equal(node.attrs.language, "python");
    }],
  ];
  let failures = 0;
  for (const [name, check] of checks) {
    try { await check(); console.log(`PASS ${name}`); }
    catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
  }
  assert.equal(failures, 0, `${failures} clipboard fidelity regressions`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
