const assert = require("assert");
const { performance } = require("perf_hooks");

function createTable(index) {
  return {
    rows: [
      {
        cells: [
          { id: `cell-${index}-a`, plainText: `Row ${index}`, html: `<p>Row ${index}</p>`, header: true },
          { id: `cell-${index}-b`, plainText: "Value", html: "<p>Value</p>", header: true },
        ],
      },
      {
        cells: [
          { id: `cell-${index}-c`, plainText: "Alpha", html: "<p>Alpha</p>" },
          { id: `cell-${index}-d`, plainText: "Beta", html: "<p>Beta</p>" },
        ],
      },
    ],
    hasHeader: true,
  };
}

function createMixedItems(count) {
  const items = [];
  const columns = 250;
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * 280;
    const y = row * 190;
    const slot = index % 8;
    const base = {
      id: `item-${index}`,
      x,
      y,
      width: 220,
      height: 130,
      createdAt: index + 1,
      updatedAt: index + 1,
    };
    if (slot === 0) {
      items.push({ ...base, type: "shape", shapeType: "rect", fill: "#ffffff", stroke: "#334155" });
    } else if (slot === 1) {
      const text = `Section ${index}\nLarge canvas mixed runtime fixture.`;
      items.push({
        ...base,
        type: "text",
        text,
        plainText: text,
        html: `<p><strong>Section ${index}</strong></p><p>Large canvas mixed runtime fixture.</p>`,
        fontSize: 18,
        textBoxLayoutMode: "fixed-size",
        textResizeMode: "wrap",
        wrapMode: "wrap",
      });
    } else if (slot === 2) {
      items.push({ ...base, type: "image", name: `image-${index}.png`, sourcePath: "", dataUrl: "" });
    } else if (slot === 3) {
      items.push({ ...base, type: "table", table: createTable(index) });
    } else if (slot === 4) {
      items.push({
        ...base,
        type: "codeBlock",
        language: "javascript",
        code: `const value${index} = ${index};`,
        text: `const value${index} = ${index};`,
      });
    } else if (slot === 5 || slot === 6) {
      items.push({
        ...base,
        id: `flow-${index}`,
        type: "flowNode",
        plainText: `Flow ${index}`,
        html: `<p>Flow ${index}</p>`,
        fontSize: 18,
      });
    } else {
      items.push({
        ...base,
        type: "flowEdge",
        fromId: `flow-${index - 2}`,
        toId: `flow-${index - 1}`,
        fromSide: "right",
        toSide: "left",
      });
    }
  }
  return items;
}

function measure(task) {
  const startedAt = performance.now();
  const value = task();
  return {
    value,
    elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
  };
}

async function main() {
  const { normalizeBoard } = await import("../public/src/engines/canvas2d-core/elements/index.js");
  const { buildSceneIndex, querySceneIndex } = await import(
    "../public/src/engines/canvas2d-core/scene/sceneIndex.js"
  );
  const { createHistoryState, markHistoryBaseline, takeHistorySnapshot } = await import(
    "../public/src/engines/canvas2d-core/history.js"
  );
  const { createCanvas2DStore } = await import("../public/src/engines/canvas2d-core/store.js");
  const summaries = [];

  for (const count of [1_000, 10_000, 50_000]) {
    const board = {
      items: createMixedItems(count),
      selectedIds: [],
      view: { scale: 0.35, offsetX: 80, offsetY: 80 },
      preferences: { allowLocalFileAccess: true, backgroundPattern: "dots" },
    };
    const normalized = measure(() => normalizeBoard(board));
    const sceneIndex = measure(() => buildSceneIndex(normalized.value.items, { revision: 1 }));
    const queries = measure(() => {
      let resultCount = 0;
      for (let index = 0; index < 60; index += 1) {
        const left = (index % 20) * 2_800;
        const top = Math.floor(index / 20) * 1_900;
        resultCount += querySceneIndex(sceneIndex.value, {
          left,
          top,
          right: left + 4_000,
          bottom: top + 2_400,
        }).length;
      }
      return resultCount;
    });
    const history = measure(() => {
      const value = createHistoryState();
      markHistoryBaseline(value, takeHistorySnapshot({ board: normalized.value }));
      return value;
    });
    const storeSnapshot = measure(() => {
      const store = createCanvas2DStore({ initialBoard: normalized.value, disableLocalStorage: true });
      const snapshot = store.getSnapshot();
      store.dispose();
      return snapshot;
    });
    const serializedBytes = Buffer.byteLength(JSON.stringify(normalized.value));
    const historySignatureBytes = Buffer.byteLength(String(history.value.lastSignature || ""));
    const summary = {
      count,
      normalizeMs: normalized.elapsedMs,
      sceneIndexMs: sceneIndex.elapsedMs,
      viewportQueriesMs: queries.elapsedMs,
      historyBaselineMs: history.elapsedMs,
      storeSnapshotMs: storeSnapshot.elapsedMs,
      serializedMiB: Number((serializedBytes / 1024 / 1024).toFixed(2)),
      historySignatureMiB: Number((historySignatureBytes / 1024 / 1024).toFixed(2)),
      indexedRecords: sceneIndex.value.records.length,
      gridEntries: sceneIndex.value.gridEntryCount,
      queryResultCount: queries.value,
    };
    assert.strictEqual(normalized.value.items.length, count, "mixed board normalization lost elements");
    assert.strictEqual(sceneIndex.value.records.length, count, "mixed scene index lost elements");
    assert(summary.normalizeMs < 5_000, "mixed board normalization exceeded the baseline guard");
    assert(summary.sceneIndexMs < 5_000, "mixed scene index exceeded the baseline guard");
    assert(summary.viewportQueriesMs < 2_000, "mixed viewport queries exceeded the baseline guard");
    assert(summary.historyBaselineMs < 5_000, "mixed history baseline exceeded the baseline guard");
    assert(summary.storeSnapshotMs < 5_000, "mixed store snapshot exceeded the baseline guard");
    summaries.push(summary);
  }

  console.log(JSON.stringify({ ok: true, summaries }, null, 2));
}

main().catch((error) => {
  console.error(`[check-canvas-large-scene-runtime] ${error.stack || error.message}`);
  process.exitCode = 1;
});
