const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { PDFDocument } = require("pdf-lib");
const { decodePDFRawStream } = require("pdf-lib/cjs/core");
const URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:45126/canvas-office.html";

async function checkNarrowPanelRecovery(browser, errors) {
  const page = await browser.newPage({ viewport: { width: 680, height: 850 } });
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(new globalThis.URL("/?desktop=1", URL).href);
    await page.waitForFunction(() => window.__canvas2dEngine);
    for (const name of ["板块与交付", "收件箱"]) {
      const trigger = page.getByRole("button", { name, exact: true });
      const panel = page.getByRole("region", { name: name === "收件箱" ? "画布收件箱" : name, exact: true });
      for (let cycle = 0; cycle < 2; cycle += 1) {
        await trigger.click();
        await panel.waitFor();
        for (const width of [680, 1100, 680]) {
          await page.setViewportSize({ width, height: 850 });
          await page.waitForFunction(() => {
            const panel = document.querySelector(".canvas2d-delivery-panel");
            const canvas = panel.closest(".canvas2d-engine-ui").getBoundingClientRect();
            const bounds = panel.getBoundingClientRect();
            return bounds.left >= Math.max(0, canvas.left) && bounds.right <= Math.min(innerWidth, canvas.right) + 1 && bounds.bottom <= innerHeight && panel.scrollWidth <= panel.clientWidth + 1;
          });
        }
        if (name === "板块与交付" && cycle === 0) {
          await page.getByRole("button", { name: "新建板块", exact: true }).click();
          await page.getByRole("textbox", { name: "板块 1 标题", exact: true }).fill("窄窗口板块");
          await page.getByRole("textbox", { name: "板块 1 标题", exact: true }).press("Enter");
          assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.find((item) => item.frame)?.title), "窄窗口板块");
        }
        await page.keyboard.press("Escape");
        await panel.waitFor({ state: "detached" });
        assert.equal(await trigger.evaluate((element) => document.activeElement === element), true);
      }
      await trigger.click();
      await panel.waitFor();
      await page.mouse.click(40, 800);
      await panel.waitFor({ state: "detached" });
    }
    console.log("[delivery] narrow canvas panels, open resize, real input, Escape focus and outside-close recovery passed");
  } finally { await page.close(); }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(URL); await page.waitForFunction(() => window.__canvas2dEngine);
    const frames = await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      engine.loadStructuredBoardForExport({ items: [{ id: "note", type: "text", x: 200, y: 200, width: 220, height: 100, text: "交付测试", plainText: "交付测试" }], selectedIds: ["note"], view: { scale: 1, offsetX: 0, offsetY: 0 } });
      const first = engine.addFrame("a4-portrait", "周报");
      const afterCreate = engine.getSnapshot().board.items;
      const member = afterCreate.find((item) => item.id === "note");
      const previousX = member.x;
      engine.runCommand("selection.nudge", 40, 25);
      const moved = engine.getSnapshot().board.items.find((item) => item.id === "note");
      engine.undo();
      const restored = engine.getSnapshot().board.items.find((item) => item.id === "note");
      engine.removeFrame(first);
      const detached = engine.getSnapshot().board.items.find((item) => item.id === "note");
      engine.undo();
      const recovered = engine.getSnapshot().board.items.find((item) => item.id === "note");
      const second = engine.addFrame("16:9", "第二页");
      engine.updateFrame(second, { order: 0 });
      return { first, second, member: member.frameId, delta: moved.x - previousX, restored: restored.x === previousX, detached: detached.frameId, recovered: recovered.frameId };
    });
    assert.equal(frames.member, frames.first); assert.equal(frames.delta, 40); assert.equal(frames.restored, true); assert.equal(frames.detached, ""); assert.equal(frames.recovered, frames.first);
    await page.waitForFunction(() => [...document.querySelectorAll(".canvas2d-scene-frame-title")].some((node) => node.textContent.includes("周报")));
    const locking = await page.evaluate(({ first, second }) => {
      const engine = window.__canvas2dEngine;
      const before = engine.getSnapshot().board.items.find((item) => item.id === second).x;
      engine.updateFrame(second, { locked: true });
      engine.runCommand("selection.nudge", 10, 10);
      const after = engine.getSnapshot().board.items.find((item) => item.id === second).x;
      const rejected = engine.removeFrame(second);
      engine.updateFrame(second, { locked: false });
      engine.removeFrame(first);
      const renumbered = engine.getSnapshot().board.items.find((item) => item.id === second).frame.order;
      engine.undo();
      return { before, after, rejected, renumbered, member: engine.getSnapshot().board.items.find((item) => item.id === "note").frameId };
    }, frames);
    assert.equal(locking.after, locking.before); assert.equal(locking.rejected, false); assert.equal(locking.renumbered, 0); assert.equal(locking.member, frames.first);
    const download = page.waitForEvent("download");
    await page.evaluate(() => window.__canvas2dEngine.exportBoardAsPdf({ paginateFrames: true, preferDownload: true, scale: 1 }));
    const file = await download;
    const pdf = await PDFDocument.load(require("node:fs").readFileSync(await file.path()));
    assert.equal(pdf.getPageCount(), 2); assert.equal(pdf.getPage(0).getWidth(), 960); assert.equal(pdf.getPage(1).getWidth(), 595.28);
    const fittedDownload = page.waitForEvent("download");
    await page.evaluate(async () => {
      const { exportFramePagesAsPdf } = await import("/src/engines/canvas2d-core/export/exportFramePagesAsPdf.js");
      await exportFramePagesAsPdf([{ pageWidth: 100, pageHeight: 200 }], async () => {
        const canvas = document.createElement("canvas"); canvas.width = 300; canvas.height = 100;
        canvas.getContext("2d").fillRect(0, 0, 300, 100); return { canvas };
      }, { preferDownload: true });
    });
    const fittedFile = await fittedDownload;
    const fittedPdf = await PDFDocument.load(require("node:fs").readFileSync(await fittedFile.path()));
    const contents = fittedPdf.getPage(0).node.Contents();
    const operators = Buffer.from(decodePDFRawStream(fittedPdf.context.lookup(contents.get(0))).decode()).toString();
    const imageMatrix = [...operators.matchAll(/^([\d.]+) 0 0 ([\d.]+) 0 0 cm$/gm)].find((match) => Number(match[1]) === 100);
    assert(imageMatrix, "PDF must fit image within page width");
    assert(Math.abs(Number(imageMatrix[1]) / Number(imageMatrix[2]) - 3) < .0001, "arbitrary outside content must keep its aspect ratio");
    const cancel = await page.evaluate(async () => {
      const { exportFramePagesAsPdf } = await import("/src/engines/canvas2d-core/export/exportFramePagesAsPdf.js");
      const controller = new AbortController();
      const canvases = [];
      const before = structuredClone(window.__canvas2dEngine.getSnapshot().board);
      const result = await exportFramePagesAsPdf([{ pageWidth: 100, pageHeight: 100 }, { pageWidth: 100, pageHeight: 100 }], async () => {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 100; canvases.push(canvas);
        canvas.getContext("2d").fillRect(0, 0, 100, 100); controller.abort(); return { canvas };
      }, { signal: controller.signal });
      return { result, canvases: canvases.map((canvas) => [canvas.width, canvas.height]), unchanged: JSON.stringify(before) === JSON.stringify(window.__canvas2dEngine.getSnapshot().board) };
    });
    assert.equal(cancel.result.canceled, true); assert.deepEqual(cancel.canvases, [[1, 1]]); assert.equal(cancel.unchanged, true);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.getByRole("button", { name: "板块与交付", exact: true }).click();
      await page.getByRole("region", { name: "板块与交付", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("region", { name: "板块与交付", exact: true }).waitFor({ state: "hidden" });
    }
    // External clipboard collection preserves normal paste and records provenance.
    await page.evaluate(async () => {
      window.desktopShell = { ...window.desktopShell, readClipboardText: async () => ({ text: "https://example.com" }), readClipboardFiles: async () => ({ paths: [] }) };
      const engine = window.__canvas2dEngine;
      engine.setCollectionMode(false);
      await engine.collectClipboardToInbox();
    });
    await page.waitForFunction(() => window.__canvas2dEngine.getSnapshot().board.items.some((item) => ["ready", "failed"].includes(item.linkCard?.fetchState)));
    const collection = await page.evaluate(() => {
      const engine = window.__canvas2dEngine;
      const card = engine.getSnapshot().board.items.find((item) => item.linkCard);
      const captured = card.collection;
      engine.organizeInboxItems([card.id]);
      const organized = engine.getSnapshot().board.items.find((item) => item.id === card.id);
      engine.undo();
      const recovered = engine.getSnapshot().board.items.find((item) => item.id === card.id);
      const serialized = engine.serializeStructuredBoard();
      return { captured, organized: organized.collection.inbox, groupId: organized.groupId, recovered: recovered.collection.inbox, restoredCollection: serialized.board.items.find((item) => item.id === card.id).collection, mode: serialized.board.preferences.collectionMode };
    });
    assert.equal(collection.captured.sourceKind, "clipboard"); assert.equal(collection.captured.sourceUrl, "https://example.com/"); assert(collection.captured.capturedAt > 0);
    assert.equal(collection.organized, false); assert(collection.groupId); assert.equal(collection.recovered, true); assert.deepEqual(collection.restoredCollection, collection.captured); assert.equal(collection.mode, false);
    for (let cycle = 0; cycle < 2; cycle += 1) { await page.getByRole("button", { name: /^收件箱/ }).click(); await page.getByRole("region", { name: "画布收件箱" }).waitFor(); await page.keyboard.press("Escape"); await page.getByRole("region", { name: "画布收件箱" }).waitFor({ state: "hidden" }); }
    const beforePlainPaste = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.length);
    await page.evaluate(async () => {
      window.desktopShell.readClipboardText = async () => ({ text: "普通粘贴保留当前位置" });
      await window.__canvas2dEngine.runCommand("selection.paste", { x: 80, y: 70 });
    });
    const pasted = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items);
    assert.equal(pasted.length, beforePlainPaste + 1); assert.equal(pasted.at(-1).collection.inbox, false);
    assert(Math.abs(pasted.at(-1).x - 80) < 100);
    // A late link response must not resurrect a deleted card or cross a board switch.
    const pending = [];
    await page.route("**/api/url-meta?**", async (route) => { pending.push(route); });
    await page.evaluate(async () => { window.desktopShell.readClipboardText = async () => ({ text: "https://example.org/deleted" }); await window.__canvas2dEngine.collectClipboardToInbox(); });
    await page.waitForTimeout(50);
    await page.evaluate(() => window.__canvas2dEngine.runCommand("selection.delete"));
    for (const route of pending.splice(0)) await route.fulfill({ json: { ok: true, meta: { title: "late title" } } }).catch(() => {});
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.some((item) => item.linkCard?.url.includes("deleted"))), false);
    await page.evaluate(async () => { window.desktopShell.readClipboardText = async () => ({ text: "https://example.org/undo" }); await window.__canvas2dEngine.collectClipboardToInbox(); });
    await page.waitForTimeout(50);
    await page.evaluate(() => { window.__canvas2dEngine.undo(); window.__canvas2dEngine.redo(); });
    for (const route of pending.splice(0)) await route.fulfill({ json: { ok: true, meta: { title: "stale undo title" } } }).catch(() => {});
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.some((item) => item.linkCard?.title === "stale undo title")), false);
    await page.evaluate(async () => { window.desktopShell.readClipboardText = async () => ({ text: "https://example.org/other-board" }); await window.__canvas2dEngine.collectClipboardToInbox(); });
    await page.waitForTimeout(50);
    await page.evaluate(() => window.__canvas2dEngine.loadStructuredBoardForExport({ items: [], selectedIds: [], view: { scale: 1, offsetX: 0, offsetY: 0 } }));
    for (const route of pending.splice(0)) await route.fulfill({ json: { ok: true, meta: { title: "stale board title" } } }).catch(() => {});
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items.length), 0);
    await page.unroute("**/api/url-meta?**");
    // Out-of-order preview compilation and closing/reopening keep only the latest generation.
    const previewRace = await page.evaluate(async () => {
      const engine = window.__canvas2dEngine;
      const requests = [];
      window.desktopShell.previewWordDocx = ({ ast }) => new Promise((resolve) => requests.push({ ast, resolve }));
      engine.loadStructuredBoardForExport({ items: [{ id: "a", type: "text", x: 0, y: 0, text: "A" }, { id: "b", type: "text", x: 0, y: 100, text: "B" }], selectedIds: [], view: { scale: 1, offsetX: 0, offsetY: 0 } });
      const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
      engine.exportSelectionAsWord(engine.getSnapshot().board.items); await tick();
      const id = engine.getSnapshot().wordExportPreviewRequest.id;
      engine.reorderWordExportPreview(id, "b", -1); await tick();
      requests[1].resolve({ ok: true, docxBase64: "latest", size: 6 }); await tick();
      requests[0].resolve({ ok: true, docxBase64: "stale", size: 5 }); await tick();
      const latest = engine.getSnapshot().wordExportPreviewRequest.previewDocxBase64;
      engine.reorderWordExportPreview(id, "b", 1); await tick();
      engine.closeWordExportPreview(id);
      engine.exportSelectionAsWord(engine.getSnapshot().board.items); await tick();
      requests[2].resolve({ ok: true, docxBase64: "closed", size: 6 }); await tick();
      const reopened = engine.getSnapshot().wordExportPreviewRequest;
      requests[3].resolve({ ok: true, docxBase64: "reopened", size: 8 }); await tick();
      engine.closeWordExportPreview(reopened.id);
      return { latest, oldIgnored: reopened.id !== id && reopened.previewStatus === "loading", closed: engine.getSnapshot().wordExportPreviewRequest === null };
    });
    assert.equal(previewRace.latest, "latest"); assert.equal(previewRace.oldIgnored, true); assert.equal(previewRace.closed, true);
    const cachedSearch = await page.evaluate(async () => {
      const { createWorkspaceSearchIndex } = await import("/src/engines/canvas2d-core/search/workspaceSearchIndex.js");
      let reads = 0;
      const deps = { listBoards: async () => ({ ok: true, boards: [{ filePath: "/idb-fixture/a.freeflow", name: "缓存画布", modifiedAt: 1, size: 100 }] }), readBoard: async () => { reads += 1; return { ok: true, text: JSON.stringify({ items: [{ id: "cache", type: "text", text: "持久索引报价" }] }) }; } };
      const first = createWorkspaceSearchIndex(deps);
      await first.search("/idb-fixture", "报价");
      // Wait for the IndexedDB write, then close and create a fresh index.
      await new Promise((resolve) => setTimeout(resolve, 120)); first.dispose();
      const second = createWorkspaceSearchIndex(deps);
      const restored = await second.search("/idb-fixture", "报价");
      const warmReads = reads;
      second.invalidate(["/idb-fixture/a.freeflow"]);
      await second.search("/idb-fixture", "报价");
      second.dispose();
      return { results: restored.results.length, warmReads, reads };
    });
    assert.equal(cachedSearch.results, 1); assert.equal(cachedSearch.warmReads, 1); assert.equal(cachedSearch.reads, 2);
    console.log("[delivery] frame lock/renumber recovery, PDF cancel/release, stale link delete/undo/switch and Word generation recovery passed");
    console.log("[delivery] real link metadata, inbox provenance/organize/undo/serialization and ordinary paste passed");
    await checkNarrowPanelRecovery(browser, errors);
    assert.deepEqual(errors, []);
    console.log("[delivery] Frame create/move/delete/undo, ordered multipage PDF and repeated panel recovery passed");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
