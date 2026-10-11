const assert = require("assert/strict");
const { chromium } = require("playwright");
const url = process.env.CANVAS_TEST_URL || "http://127.0.0.1:53127/canvas-office.html";
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.__canvas2dEngine);
    const result = await page.evaluate(async () => {
      const engine = window.__canvas2dEngine;
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const board = (id) => ({ items: [{ id, type: "shape", shapeType: "rect", x: 2000, y: 1000, width: 100, height: 100 }], navigator: { entries: [{ id: "entry", targetId: id }] }, view: { scale: 1, offsetX: 0, offsetY: 0 }, selectedIds: [] });
      for (let cycle = 0; cycle < 10; cycle++) {
        engine.loadStructuredBoardForExport(board("old"));
        if (!engine.focusCanvasNavigatorEntry("entry")) throw new Error("link jump failed");
        engine.loadStructuredBoardForExport(board("new"));
        await wait(100);
        const snapshot = engine.getSnapshot().board;
        if (snapshot.selectedIds.length || snapshot.view.offsetX || snapshot.view.offsetY) throw new Error("old link callback overwrote new board");
      }
      engine.unmount();
      const { createCanvas2DEngine } = await import("/src/engines/canvas2d-core/createCanvas2DEngine.js");
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "position:fixed;inset:0;width:900px;height:700px";
      const host = document.createElement("div");
      host.style.cssText = "width:900px;height:700px;position:relative";
      wrapper.append(host); document.body.append(wrapper);
      let previous;
      for (let cycle = 0; cycle < 8; cycle++) {
        const next = createCanvas2DEngine({ initializeBoardFileState: false, initialBoard: { items: [], view: { scale: 1, offsetX: 0, offsetY: 0 } }, persistBoard: () => {} });
        next.mount(host);
        const input = host.querySelector("#canvas2d-file-import");
        const transfer = new DataTransfer();
        transfer.items.add(new File([`lifecycle ${cycle}`], `cycle-${cycle}.txt`, { type: "text/plain" }));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        for (let retry = 0; retry < 100 && !next.getSnapshot().board.items.length; retry++) await wait(10);
        if (!next.getSnapshot().board.items.length) throw new Error("remounted import listener did not import");
        if (previous && previous.getSnapshot().board.items.length !== 1) throw new Error("retained DOM invoked old engine import listener");
        if (next.getSnapshot().board.items.length !== 1) throw new Error("duplicated import listener");
        next.unmount();
        previous = next;
      }
      wrapper.remove();
      return { cycles: 10, remounts: 8 };
    });
    assert.deepEqual(result, { cycles: 10, remounts: 8 });
    await page.clock.install();
    const firstStats = await page.evaluate(async () => {
      window.__testWorkers = [];
      window.Worker = class {
        constructor() { this.messages = []; this.closed = false; window.__testWorkers.push(this); }
        postMessage(payload) { this.messages.push(payload); }
        terminate() { this.closed = true; }
      };
      const runtime = await import("/src/engines/canvas2d-core/codeBlock/renderCodeBlockStatic.js");
      window.__testHighlightRuntime = runtime;
      const nodes = [document.createElement("div"), document.createElement("div")];
      window.__testCodeNodes = nodes;
      for (const node of nodes) { document.body.append(node); runtime.renderCodeBlockStatic(node, { language: "javascript", code: "const sharedTask = 1;" }); }
      const stats = runtime.getCodeBlockHighlightRuntimeStats();
      runtime.cleanupCodeBlockStaticNode(nodes[0]);
      const worker = window.__testWorkers[0];
      const request = worker.messages[0];
      worker.onmessage({ data: { id: request.id, ok: true, highlightedHtml: "sharedTask", transport: "worker" } });
      if (nodes[1].dataset.highlightState !== "highlighted") throw new Error("closing one subscriber cancelled another");
      return stats;
    });
    assert.equal(firstStats.pendingWorkerRequests, 1);
    assert.equal(firstStats.pendingCacheKeys, 1);
    await page.clock.fastForward(30001);
    assert.equal(await page.evaluate(() => window.__testWorkers[0].closed), true);
    await page.evaluate(() => {
      const node = document.createElement("div"); document.body.append(node);
      window.__testCodeNodes.push(node);
      window.__testHighlightRuntime.renderCodeBlockStatic(node, { language: "javascript", code: "const hungTask = 2;" });
    });
    assert.equal(await page.evaluate(() => window.__testWorkers.length), 2, "idle worker did not recreate");
    await page.clock.fastForward(15001);
    const recovered = await page.evaluate(() => ({ stats: window.__testHighlightRuntime.getCodeBlockHighlightRuntimeStats(), state: window.__testCodeNodes[2].dataset.highlightState, closed: window.__testWorkers[1].closed }));
    assert.equal(recovered.stats.pendingWorkerRequests, 0);
    assert.equal(recovered.stats.pendingCacheKeys, 0);
    assert.equal(recovered.state, "highlighted");
    assert.equal(recovered.closed, true);
    assert.deepEqual(errors, []);
    console.log("[check-canvas-async-lifecycle-browser] rapid link/board changes and retained-DOM engine imports passed");
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
