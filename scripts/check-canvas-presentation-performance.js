const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:3000/canvas-office.html";
const STORAGE_KEY = "ai_worker_canvas_office_board_v3";

function createBoard() {
  const items = [];
  const now = Date.now();
  for (let row = 0; row < 10; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      const index = row * 12 + column;
      const text = `Section ${index + 1}\nUnified presentation keeps real content visible during continuous camera movement.`;
      items.push({
        id: `stress-text-${index}`,
        type: "text",
        x: 100 + column * 330,
        y: 100 + row * 190,
        width: 280,
        height: 130,
        text,
        plainText: text,
        html: `<p><strong>Section ${index + 1}</strong></p><p>Unified presentation keeps real content visible during continuous camera movement.</p>`,
        fontSize: 24,
        textBoxLayoutMode: "fixed-size",
        textResizeMode: "wrap",
        wrapMode: "wrap",
        contentFit: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return {
    items,
    selectedIds: [],
    view: { scale: 0.2, offsetX: 80, offsetY: 80 },
    preferences: { allowLocalFileAccess: true, backgroundPattern: "none" },
  };
}

function assert(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message || String(error)));
  try {
    await page.addInitScript(({ storageKey, board }) => {
      localStorage.setItem(storageKey, JSON.stringify(board));
    }, { storageKey: STORAGE_KEY, board: createBoard() });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__canvas2dEngine && document.querySelector("#canvas-office-canvas")));
    await page.addStyleTag({ content: `
      html, body, #canvas-office-root, .canvas-office-root, .canvas-office-shell, .canvas-office-main, .canvas-office-surface {
        min-height: 100vh !important;
        height: 100vh !important;
      }
      body { margin: 0 !important; }
    ` });
    await page.evaluate(() => window.__canvas2dEngine.resize({ immediate: true, reason: "presentation-performance-check" }));
    await page.waitForFunction(() => document.querySelector("#canvas-office-canvas")?.clientWidth > 1000);

    const result = await page.evaluate(async () => {
      const engine = window.__canvas2dEngine;
      const canvas = document.querySelector("#canvas-office-canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const readPresentationState = () => {
        const overlayNodes = Array.from(document.querySelectorAll(".canvas2d-rich-item[data-id]"));
        const quality = window.__ffPresentationQuality || null;
        const entries = Object.values(quality?.activePlan?.entries || {});
        const reasonCounts = entries.reduce((counts, entry) => {
          const reason = String(entry?.reason || "unknown");
          counts[reason] = (counts[reason] || 0) + 1;
          return counts;
        }, {});
        return {
          phase: String(quality?.phase || ""),
          pendingTransitions: Number(quality?.pendingTransitions || 0),
          plannedFrozenCount: Number(quality?.activePlan?.stats?.counts?.["frozen-detail"] || 0),
          activeFrozenCount: overlayNodes.filter((node) => node.dataset.activeRepresentation === "frozen-detail").length,
          activeLiveCount: overlayNodes.filter((node) => node.dataset.activeRepresentation === "live-detail").length,
          overlayCount: overlayNodes.length,
          scenePhase: document.querySelector("#canvas2d-scene-root")?.dataset.presentationPhase || "",
          planScale: Number(quality?.activePlan?.scale || 0),
          reasonCounts,
        };
      };
      const waitForPresentationState = async (predicate, timeoutMs) => {
        const startedAt = performance.now();
        let current = readPresentationState();
        while (!predicate(current) && performance.now() - startedAt < timeoutMs) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          current = readPresentationState();
        }
        return {
          converged: Boolean(predicate(current)),
          elapsedMs: performance.now() - startedAt,
          state: current,
        };
      };
      const baseline = await waitForPresentationState(
        (current) => current.phase === "steady" && current.plannedFrozenCount > 0 && current.activeFrozenCount > 0,
        3000
      );
      let storeEmissionCount = 0;
      let formalViewUpdateCount = 0;
      let lastFormalViewSignature = JSON.stringify(engine.getSnapshot().board.view);
      const unsubscribeStore = engine.subscribe((snapshot) => {
        storeEmissionCount += 1;
        const nextSignature = JSON.stringify(snapshot.board.view);
        if (nextSignature !== lastFormalViewSignature) {
          formalViewUpdateCount += 1;
          lastFormalViewSignature = nextSignature;
        }
      });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      storeEmissionCount = 0;
      formalViewUpdateCount = 0;
      lastFormalViewSignature = JSON.stringify(engine.getSnapshot().board.view);
      const initialGeometry = Object.fromEntries(
        engine.getSnapshot().board.items.map((item) => [item.id, [item.x, item.y, item.width, item.height]])
      );
      const frameDurations = [];
      const rafIntervals = [];
      const recoveryRafIntervals = [];
      const tileCounts = [];
      const fallbackChecks = [];
      let maxSnapshotCloneCount = 0;
      let cameraFastPathFrames = 0;
      let previousFrameTime = performance.now();

      for (let index = 0; index < 36; index += 1) {
        canvas.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 720,
          clientY: 460,
          deltaX: index % 2 === 0 ? 3 : -1,
          deltaY: 1,
        }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const currentFrameTime = performance.now();
        rafIntervals.push(currentFrameTime - previousFrameTime);
        previousFrameTime = currentFrameTime;
        const stats = canvas.__ffRenderStats || null;
        if (stats?.cameraFastPath?.active) cameraFastPathFrames += 1;
        frameDurations.push(Number(stats?.frameDurationMs || 0));
        tileCounts.push(Number(stats?.tileCache?.tileCount || 0));
        maxSnapshotCloneCount = Math.max(
          maxSnapshotCloneCount,
          document.querySelectorAll(".html2canvas-container").length
        );

        const target = engine.getSnapshot().board.items.find((item) => item.id === "stress-text-119");
        const node = document.querySelector('.canvas2d-rich-item[data-id="stress-text-119"]');
        const nodeVisible = Boolean(node && getComputedStyle(node).visibility !== "hidden" && getComputedStyle(node).display !== "none");
        if (!nodeVisible && target) {
          const view = canvas.__ffRenderStats?.frameContext?.camera || engine.getSnapshot().board.view;
          const dpr = canvas.width / Math.max(1, canvas.clientWidth);
          const left = Math.max(0, Math.floor((target.x * view.scale + view.offsetX) * dpr));
          const top = Math.max(0, Math.floor((target.y * view.scale + view.offsetY) * dpr));
          const width = Math.max(1, Math.min(canvas.width - left, Math.ceil(target.width * view.scale * dpr)));
          const height = Math.max(1, Math.min(canvas.height - top, Math.ceil(target.height * view.scale * dpr)));
          let dark = 0;
          if (width > 0 && height > 0) {
            const pixels = ctx.getImageData(left, top, width, height).data;
            for (let offset = 0; offset < pixels.length; offset += 4) {
              if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 170) dark += 1;
            }
          }
          fallbackChecks.push({ index, dark });
        }
      }
      const activeStoreEmissionCount = storeEmissionCount;
      const activeFormalViewUpdateCount = formalViewUpdateCount;

      let previousRecoveryFrameTime = performance.now();
      for (let index = 0; index < 90; index += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const currentFrameTime = performance.now();
        recoveryRafIntervals.push(currentFrameTime - previousRecoveryFrameTime);
        previousRecoveryFrameTime = currentFrameTime;
        maxSnapshotCloneCount = Math.max(
          maxSnapshotCloneCount,
          document.querySelectorAll(".html2canvas-container").length
        );
      }
      const recovery = await waitForPresentationState(
        (current) =>
          current.phase === "steady" &&
          current.scenePhase === "steady" &&
          current.pendingTransitions === 0 &&
          current.plannedFrozenCount > 0 &&
          current.activeFrozenCount > 0,
        1500
      );
      const recoveredSnapshot = engine.getSnapshot();
      const recoveredGeometry = Object.fromEntries(
        recoveredSnapshot.board.items.map((item) => [item.id, [item.x, item.y, item.width, item.height]])
      );
      const overlayNodes = Array.from(document.querySelectorAll(".canvas2d-rich-item[data-id]"));
      unsubscribeStore();
      const countLineBands = (node) => {
        if (!node) return 0;
        const rows = [];
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (!String(walker.currentNode.nodeValue || "").trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(walker.currentNode);
          Array.from(range.getClientRects()).forEach((rect) => rows.push(Math.round(rect.top * 2) / 2));
        }
        return new Set(rows).size;
      };
      return {
        baseline,
        recovery,
        frameDurations,
        rafIntervals,
        recoveryRafIntervals,
        tileCounts,
        fallbackChecks,
        maxSnapshotCloneCount,
        cameraFastPathFrames,
        storeEmissionCount,
        activeStoreEmissionCount,
        activeFormalViewUpdateCount,
        formalViewUpdateCount,
        initialGeometry,
        recoveredGeometry,
        recoveredRuntimeMode: canvas.__ffRenderStats?.runtimeMode || null,
        recoveredPhase: document.querySelector("#canvas2d-scene-root")?.dataset.presentationPhase || "",
        visibleOverlayCount: overlayNodes.filter((node) => {
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden";
        }).length,
        emptyOverlayCount: overlayNodes.filter((node) => !String(node.textContent || "").trim() && !node.querySelector("img")).length,
        frozenDetailCount: overlayNodes.filter((node) => node.dataset.activeRepresentation === "frozen-detail").length,
        sampleLineBands: countLineBands(document.querySelector('.canvas2d-rich-item[data-id="stress-text-0"]')),
        legacySkeletonCount: document.querySelectorAll(".canvas2d-rich-skeleton, .canvas2d-rich-skeleton-svg").length,
      };
    });

    const summary = {
      frameP50Ms: Number(percentile(result.frameDurations, 0.5).toFixed(2)),
      frameP95Ms: Number(percentile(result.frameDurations, 0.95).toFixed(2)),
      frameP99Ms: Number(percentile(result.frameDurations, 0.99).toFixed(2)),
      rafP95Ms: Number(percentile(result.rafIntervals, 0.95).toFixed(2)),
      recoveryRafP95Ms: Number(percentile(result.recoveryRafIntervals, 0.95).toFixed(2)),
      maxTileCount: Math.max(...result.tileCounts),
      maxSnapshotCloneCount: result.maxSnapshotCloneCount,
      cameraFastPathFrames: result.cameraFastPathFrames,
      storeEmissionCount: result.storeEmissionCount,
      activeStoreEmissionCount: result.activeStoreEmissionCount,
      activeFormalViewUpdateCount: result.activeFormalViewUpdateCount,
      formalViewUpdateCount: result.formalViewUpdateCount,
      minimumFallbackPixels: Math.min(...result.fallbackChecks.map((entry) => entry.dark)),
      visibleOverlayCount: result.visibleOverlayCount,
      frozenDetailCount: result.frozenDetailCount,
      baselineConvergenceMs: Number(result.baseline.elapsedMs.toFixed(2)),
      recoveryConvergenceMs: Number(result.recovery.elapsedMs.toFixed(2)),
    };
    await page.screenshot({ path: "tmp/presentation-performance.png", fullPage: false });
    assert(errors.length === 0, "presentation performance check produced page errors", errors);
    assert(summary.frameP95Ms <= 40, "continuous camera frames exceeded the presentation budget", summary);
    assert(summary.rafP95Ms <= 60, "continuous camera interaction stalled animation frames", summary);
    assert(summary.recoveryRafP95Ms <= 60, "snapshot recovery stalled animation frames", summary);
    assert(summary.maxTileCount <= 32, "continuous camera interaction expanded into excessive tiles", summary);
    assert(summary.maxSnapshotCloneCount === 0, "frozen detail started a main-thread snapshot capture", summary);
    assert(summary.cameraFastPathFrames >= 30, "camera-only frames did not consistently use the fast path", summary);
    assert(summary.activeFormalViewUpdateCount === 0, "camera interaction changed the formal view on the hot path", summary);
    assert(summary.formalViewUpdateCount === 1, "camera interaction committed the formal view more than once", summary);
    assert(result.baseline.converged, "frozen detail did not establish a stable baseline", result.baseline);
    assert(
      result.fallbackChecks.every((entry) => entry.dark > 0),
      "a deferred text overlay had no Canvas fallback pixels",
      summary
    );
    assert(result.recovery.converged, "frozen detail did not recover within the presentation deadline", result.recovery);
    assert(summary.frozenDetailCount > 0, "frozen detail did not recover after interaction", result.recovery);
    assert(result.sampleLineBands >= 2, "recovered text collapsed into a single line", { summary, sampleLineBands: result.sampleLineBands });
    assert(JSON.stringify(result.initialGeometry) === JSON.stringify(result.recoveredGeometry), "camera interaction changed model geometry", summary);
    assert(result.recoveredRuntimeMode?.mode === "steady" && result.recoveredPhase === "steady", "camera interaction did not recover", result);
    assert(result.visibleOverlayCount > 0 && result.emptyOverlayCount === 0, "detail overlays recovered blank", result);
    assert(result.legacySkeletonCount === 0, "performance recovery restored a legacy skeleton", result);
    console.log(JSON.stringify({ ok: true, summary }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message, details: error.details || null, errors }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
