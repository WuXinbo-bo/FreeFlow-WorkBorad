const assert = require("assert/strict");
const { chromium } = require("playwright");
const url = process.env.CANVAS_TEST_URL || "http://127.0.0.1:53127/canvas-office.html";
const baselineRef = process.env.CANVAS_HISTORY_BASELINE_REF || "";
const benchmark = Boolean(baselineRef || process.env.CANVAS_HISTORY_BENCHMARK);
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  try {
    if (baselineRef) {
      const path = require("path");
      const source = require("child_process").execFileSync("git", ["show", `${baselineRef}:public/src/engines/canvas2d-core/createCanvas2DEngine.js`], { cwd: path.resolve(__dirname, ".."), encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
      const bundle = await require("esbuild").build({ entryPoints: [path.resolve(__dirname, "../public/src/pages/canvas-office/index.js")], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", minify: true, logLevel: "error", define: { "process.env.NODE_ENV": '"production"' }, loader: { ".js": "jsx", ".jsx": "jsx" }, plugins: [{ name: "baseline-history", setup(build) { build.onLoad({ filter: /createCanvas2DEngine\.js$/ }, (args) => ({ contents: source, loader: "js", resolveDir: path.dirname(args.path) })); } }] });
      await page.route("**/assets/canvas-office/current/canvas-office-ui.js*", (route) => route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text }));
    }
    await page.goto(url);
    await page.waitForFunction(() => window.__canvas2dEngine);
    const result = await page.evaluate(async (benchmark) => {
      const engine = window.__canvas2dEngine;
      const unrelated = Array.from({ length: 1000 }, (_, i) => ({ id: `text-${i}`, type: "text", text: `Note ${i} ` + "content ".repeat(80), html: `<p>Note ${i} ${"content ".repeat(80)}</p>`, x: 10000 + i * 200, y: 10000, width: 150, height: 80, fontSize: 20 }));
      const nodes = [
        { id: "root", type: "mindNode", parentId: "", rootId: "root", childrenIds: ["a", "b"], text: "Root", x: 600, y: 300 },
        { id: "a", type: "mindNode", parentId: "root", rootId: "root", childrenIds: ["c"], text: "A", depth: 1, order: 0, x: 900, y: 300 },
        { id: "b", type: "mindNode", parentId: "root", rootId: "root", childrenIds: [], text: "B", depth: 1, order: 1, x: 900, y: 450 },
        { id: "c", type: "mindNode", parentId: "a", rootId: "root", childrenIds: [], text: "C", depth: 2, order: 0, x: 1200, y: 300 },
      ];
      const board = { items: [...unrelated, ...nodes], selectedIds: [], view: { scale: 1, offsetX: 0, offsetY: 0 } };
      const durations = [];
      async function detachBranch() {
        const { items, view } = engine.getSnapshot().board;
        const item = items.find((entry) => entry.id === "a");
        const canvas = document.querySelector("canvas");
        const rect = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: rect.left + view.offsetX + (item.x + item.width / 2) * view.scale, clientY: rect.top + view.offsetY + (item.y + item.height / 2) * view.scale }));
        await new Promise(requestAnimationFrame);
        const button = document.querySelector('.canvas-mind-node-side-btn[data-action="mind-detach-branch"]');
        if (!button) throw new Error("detach control unavailable");
        button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        const result = engine.getSnapshot().board;
        if (result.items.find((entry) => entry.id === "a").parentId) throw new Error("detach did not restore a root node");
        return true;
      }
      const checks = [() => engine.toggleMindNodeCollapsed("root"), () => engine.setMindBranchSide("a", "left"), () => engine.promoteMindNode("c"), () => engine.demoteMindNode("b"), detachBranch, () => engine.addMindSummaryNode("a", { siblingIds: ["a", "b"] }), () => engine.addMindChildNode("root"), () => engine.addMindSiblingNode("a"), () => engine.insertMindIntermediateNode("a"), () => engine.relayoutMindMapByNodeId("root")];
      const selectedChecks = benchmark ? [checks[0], checks[1], checks[2], checks[3], checks[9]] : checks;
      for (let sample = 0; sample < (benchmark ? 5 : 1); sample++) for (const [operation, check] of selectedChecks.entries()) {
        engine.loadStructuredBoardForExport(board);
        await new Promise(requestAnimationFrame);
        const before = engine.getSnapshot().board;
        const unrelatedBefore = JSON.stringify(before.items.filter((i) => i.type === "text"));
        const started = performance.now();
        if (!await check()) throw new Error("mind operation failed: " + operation);
        durations.push(performance.now() - started);
        if (benchmark) continue;

        const after = engine.getSnapshot().board;
        for (let repeat = 0; repeat < 3; repeat++) {
          if (!engine.undo()) throw new Error("undo failed");
          const undone = engine.getSnapshot().board;
          if (JSON.stringify(undone.items) !== JSON.stringify(before.items)) throw new Error("mind undo changed items/order: " + operation);
          if (!engine.redo()) throw new Error("redo failed");
          if (JSON.stringify(engine.getSnapshot().board.items) !== JSON.stringify(after.items)) {
            const redo = engine.getSnapshot().board.items;
            const differences = after.items.flatMap((item, i) => Object.keys(item).filter((key) => JSON.stringify(item[key]) !== JSON.stringify(redo[i]?.[key])).map((key) => ({ id: item.id, key, expected: item[key], actual: redo[i]?.[key] })));
            throw new Error("mind redo changed items/order: " + operation + " " + JSON.stringify(differences.slice(0, 3)));
          }
        }
        if (JSON.stringify(engine.getSnapshot().board.items.filter((i) => i.type === "text")) !== unrelatedBefore) throw new Error("unrelated rich text changed");
      }
      return { unrelatedItems: unrelated.length, operations: selectedChecks.length, operationMs: durations, totalMs: durations.reduce((a, b) => a + b, 0) };
    }, benchmark);
    assert.equal(result.operations, benchmark ? 5 : 10);
    console.log("[check-canvas-mind-history-browser] " + JSON.stringify({ baselineRef, benchmark, ...result }));
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
