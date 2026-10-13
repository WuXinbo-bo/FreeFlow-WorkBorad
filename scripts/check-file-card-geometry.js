const assert = require("node:assert/strict");

async function main() {
  const { resizeElement, normalizeElement } = await import("../public/src/engines/canvas2d-core/elements/index.js");
  const { getFileCardLayout, getFileCardNameLines } = await import("../public/src/engines/canvas2d-core/fileCardLayout.js");
  const base = { id: "file", type: "fileCard", name: "调查报告.docx", x: 40, y: 60, width: 336, height: 128 };
  for (const handle of ["nw", "ne", "sw", "se"]) {
    for (const point of [{ x: -1000, y: -300 }, { x: 1000, y: 800 }, { x: 100, y: 100 }]) {
      const card = resizeElement(base, handle, point);
      assert(Math.abs(card.width / card.height - 2.625) < 1e-10);
      assert(card.width >= 168 && card.height >= 64);
      assert.equal(card.x + (handle.includes("w") ? card.width : 0), base.x + (handle.includes("w") ? base.width : 0));
      assert.equal(card.y + (handle.includes("n") ? card.height : 0), base.y + (handle.includes("n") ? base.height : 0));
      const reopened = normalizeElement(JSON.parse(JSON.stringify(card)));
      assert.equal(reopened.width, card.width);
      assert.equal(reopened.height, card.height);
    }
  }
  const old = { ...base, width: 560, height: 170 };
  assert.equal(normalizeElement(old).width, 560);
  const resized = resizeElement(old, "se", { x: 1100, y: 200 });
  assert(Math.abs(resized.width / resized.height - old.width / old.height) < 1e-10);
  const small = getFileCardLayout(base);
  const large = getFileCardLayout({ ...base, width: 1344, height: 512 });
  for (const part of ["name", "tag", "meta"]) assert.equal(large[part].font, small[part].font * 4);
  assert.equal(large.radius, small.radius * 4);
  const lines = getFileCardNameLines("中文非常长的资料文件名称没有空格最后需要保留扩展名.docx", 100, text => Array.from(text).length * 10);
  assert.equal(lines.length, 2);
  assert(lines[1].endsWith("….docx"));
  assert(lines.every(line => Array.from(line).length <= 10));
  assert.deepEqual(getFileCardNameLines("报告.pdf", 200, text => text.length * 10), ["报告.pdf"]);
  const { computeMultiSelectionResizedBounds } = await import("../public/src/engines/canvas2d-core/multiSelectionTransform.js");
  const bounds = { left: 0, top: 0, right: 800, bottom: 300, width: 800, height: 300 };
  const reduced = computeMultiSelectionResizedBounds(bounds, "multi-e", { x: 400, y: 150 }, { preserveAspect: true });
  assert.equal(reduced.width, 400);
  assert.equal(reduced.height, 150);
  assert.equal(reduced.left, 0);
  const { createDragBroker } = await import("../public/src/engines/canvas2d-core/brokers/dragBroker.js");
  const { createFileCardElement } = await import("../public/src/engines/canvas2d-core/elements/fileCard.js");
  const broker = createDragBroker({ createFileCardElement });
  const imported = await broker.createElementsFromFiles([{ name: "a.pdf" }, { name: "b.docx" }, { name: "c.csv" }], { x: 70, y: 80 });
  assert(imported.every(item => item.x === 70));
  for (let i = 1; i < imported.length; i++) assert(imported[i].y >= imported[i - 1].y + imported[i - 1].height + 24);
  console.log("[check-file-card-geometry] aspect, anchors, minimum, legacy/reload and proportional layout passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
