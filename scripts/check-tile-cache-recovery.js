const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");
const { performance } = require("perf_hooks");
const root = path.resolve(__dirname, "..");
const file = "public/src/engines/canvas2d-core/render/tileSceneCache.js";
async function load(ref) {
  let source = ref ? execFileSync("git", ["show", `${ref}:${file}`], { cwd: root, encoding: "utf8" }) : fs.readFileSync(path.join(root, file), "utf8");
  for (const relative of ["../scene/sceneIndex.js", "../perf/byteBudgetLru.js"]) source = source.replace(JSON.stringify(relative), JSON.stringify(pathToFileURL(path.resolve(root, path.dirname(file), relative)).href));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}
async function main() {
  const { buildSceneIndex } = await import("../public/src/engines/canvas2d-core/scene/sceneIndex.js");
  let closed = 0;
  global.OffscreenCanvas = class {
    constructor() { this.records = []; }
    getContext() { return { clearRect() {}, canvas: this }; }
    transferToImageBitmap() { return { records: this.records, close() { closed++; } }; }
  };
  const { createTileSceneCache } = await load();
  const cache = createTileSceneCache({ tileSize: 128, maxEntries: 96, maxBytes: 64 * 1024 * 1024 });
  let items = [{ id: "moving", type: "shape", x: 30, y: 30, width: 20, height: 20 }];
  const drawn = [];
  const draw = (scale, changed = false, dirtyItemIds = []) => cache.draw({ ctx: { drawImage: (canvas) => drawn.push(...canvas.records) }, sceneIndex: buildSceneIndex(items), sceneKey: "board", view: { scale, offsetX: 0, offsetY: 0 }, viewportWidth: 640, viewportHeight: 480, preloadMarginPx: 0, overscanMarginPx: 0, sceneChanged: changed, dirtyItemIds, drawItems: ({ ctx, items: visible }) => { ctx.canvas.records = visible.map((i) => ({ id: i.id, x: i.x })); } });
  draw(1); draw(2);
  for (let i = 0; i < 4; i++) {
    const x = i % 2 ? 30 : 350;
    items = [{ ...items[0], x }];
    drawn.length = 0;
    const updated = draw(1, true, ["moving"]);
    assert(updated.invalidatedTiles >= 2, "movement did not invalidate old/new tiles across scales");
    assert(drawn.some((i) => i.x === x));
    assert(drawn.every((i) => i.x === x), "stale old-position tile survived movement/undo");
    drawn.length = 0;
    draw(2);
    assert(drawn.every((i) => i.x === x), "stale tile survived at another scale");
  }
  items = [];
  drawn.length = 0;
  draw(1, true, ["moving"]); draw(2);
  assert.equal(drawn.length, 0, "deleted element remained in cached tiles");
  const beforeClear = closed;
  cache.clear();
  assert.equal(cache.getSize(), 0);
  assert(closed > beforeClear, "clear did not close cached bitmaps");

  if (process.argv[2]) {
    const results = {};
    for (const [name, ref] of [["baseline", process.argv[2]], ["current", null]]) {
      const module = await load(ref);
      const samples = [];
      for (let repeat = 0; repeat < 5; repeat++) {
        const subject = module.createTileSceneCache({ tileSize: 128, maxEntries: 96 });
        const index = buildSceneIndex(Array.from({ length: 1000 }, (_, i) => ({ id: `far-${i}`, type: "shape", x: 100000 + i * 20, y: 100000, width: 10, height: 10 })));
        const config = { ctx: { drawImage() {} }, sceneIndex: index, sceneKey: "board", view: { scale: 1, offsetX: 0, offsetY: 0 }, viewportWidth: 1280, viewportHeight: 960, preloadMarginPx: 0, overscanMarginPx: 0, drawItems: () => {} };
        subject.draw(config);
        const dirtyItemIds = index.records.map((r) => r.itemId);
        const start = performance.now();
        for (let i = 0; i < 100; i++) subject.draw({ ...config, sceneChanged: true, dirtyItemIds });
        samples.push(performance.now() - start);
        subject.clear();
      }
      results[name] = samples.sort((a,b) => a-b)[2];
    }
    console.log(JSON.stringify({ scenario: "100 batches, 1000 offscreen changed items, bounded 96 tiles", medianSamples: 5, milliseconds: results }));
  }
  delete global.OffscreenCanvas;
  console.log("[check-tile-cache-recovery] multi-scale old/new bounds, deletion, repeated movement and bitmap disposal passed");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
