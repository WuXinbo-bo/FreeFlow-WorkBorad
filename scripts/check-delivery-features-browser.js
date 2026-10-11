const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { PDFDocument } = require("pdf-lib");
const URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:45126/canvas-office.html";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const errors = [];
  let metadataRequests = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.url().includes("/api/url-meta?")) metadataRequests += 1; });
  try {
    await page.goto(URL); await page.waitForFunction(() => window.__canvas2dEngine);
    assert.equal(await page.getByRole("button", { name: "板块与交付", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /^收件箱/ }).count(), 0);
    const recovery = await page.evaluate(async () => {
      const { createShapeElement } = await import("/src/engines/canvas2d-core/elements/shapes.js");
      const legacyShape = { ...createShapeElement("rect", { x: 20, y: 20 }, { x: 200, y: 120 }), id: "legacy-frame", frame: { kind: "freeflow-frame-v1", preset: "a4-portrait", order: 0 } };
      const legacyCard = { id: "legacy-card", type: "text", x: 300, y: 200, width: 300, height: 100, text: "已保存的网址与笔记", plainText: "已保存的网址与笔记", frameId: "legacy-frame", collection: { kind: "freeflow-collection-v1", inbox: true, capturedAt: 1 }, linkCard: { kind: "freeflow-link-card-v1", url: "https://example.com/", title: "旧链接" } };
      const engine = window.__canvas2dEngine;
      engine.loadStructuredBoardForExport({ items: [legacyShape, legacyCard], selectedIds: [legacyShape.id], preferences: { collectionMode: true }, view: { scale: 1, offsetX: 0, offsetY: 0 } });
      const cardBefore = engine.getSnapshot().board.items.find((item) => item.id === legacyCard.id);
      engine.runCommand("selection.nudge", 40, 25);
      const moved = engine.getSnapshot().board.items;
      engine.undo();
      const restored = engine.getSnapshot().board.items;
      const serialized = engine.serializeStructuredBoard().board.items;
      return {
        apis: ["addFrame", "updateFrame", "removeFrame", "assignSelectionToFrame", "setCollectionMode", "collectClipboardToInbox", "organizeInboxItems", "retryLinkMetadata"].map((name) => typeof engine[name]),
        movedShape: moved.find((item) => item.id === legacyShape.id).x === legacyShape.x + 40,
        memberStayed: moved.find((item) => item.id === legacyCard.id).x === cardBefore.x,
        undo: restored.find((item) => item.id === legacyShape.id).x === legacyShape.x,
        card: serialized.find((item) => item.id === legacyCard.id), frame: serialized.find((item) => item.id === legacyShape.id).frame,
      };
    });
    assert(recovery.apis.every((type) => type === "undefined"));
    assert.equal(recovery.movedShape, true); assert.equal(recovery.memberStayed, true); assert.equal(recovery.undo, true);
    assert.equal(recovery.card.text, "已保存的网址与笔记"); assert.equal(recovery.card.linkCard.title, "旧链接");
    assert.equal(recovery.frame.kind, "freeflow-frame-v1");
    // Previous collection preferences must no longer redirect new clipboard content.
    await page.evaluate(async () => {
      window.desktopShell = { ...window.desktopShell, readClipboardText: async () => ({ text: "https://example.org/plain-paste" }), readClipboardFiles: async () => ({ paths: [] }) };
      await window.__canvas2dEngine.runCommand("selection.paste", { x: 80, y: 70 });
    });
    const pasted = await page.evaluate(() => window.__canvas2dEngine.getSnapshot().board.items);
    assert.equal(pasted.length, 3);
    assert.equal(pasted.at(-1).collection, undefined); assert.equal(pasted.at(-1).linkCard, undefined);
    assert(Math.abs(pasted.at(-1).x - 80) < 100);
    assert(pasted.at(-1).plainText.includes("https://example.org/plain-paste"));
    assert.equal(metadataRequests, 0, "ordinary paste must not start the removed metadata collector");
    const download = page.waitForEvent("download");
    const result = await page.evaluate(() => window.__canvas2dEngine.exportBoardAsPdf({ preferDownload: true, scale: 1 }));
    assert.equal(result.ok, true);
    const file = await download;
    const pdf = await PDFDocument.load(require("node:fs").readFileSync(await file.path()));
    assert.equal(pdf.getPageCount(), 1, "original whole-canvas PDF export must remain available");
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
    assert.deepEqual(errors, []);
    console.log("[delivery] Frame/inbox entry removal, legacy content roundtrip, ordinary URL paste, original PDF and undo passed");
    console.log("[delivery] retained Word generation/reorder recovery and persistent workspace index passed");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
