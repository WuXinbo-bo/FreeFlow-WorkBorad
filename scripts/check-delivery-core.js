const assert = require("node:assert/strict");
const sharp = require("sharp");
const yauzl = require("yauzl");
const { compileWordExportAstToDocxBuffer } = require("../electron/wordDocxCompiler");
function unzip(buffer) {
  return new Promise((resolve, reject) => yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    const entries = new Map();
    zip.on("error", reject); zip.on("end", () => resolve(entries));
    zip.on("entry", (entry) => zip.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const chunks = []; stream.on("data", (chunk) => chunks.push(chunk)); stream.on("end", () => { entries.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); }); stream.on("error", reject);
    })); zip.readEntry();
  }));
}
async function main() {
  const { createFrame } = await import("../public/src/engines/canvas2d-core/frames/frameModel.js");
  const { buildWordExportAstFromCanvasSelection } = await import("../public/src/engines/canvas2d-core/export/word/buildWordExportAst.js");
  const { prepareWordExportAssets } = await import("../public/src/engines/canvas2d-core/export/word/prepareWordExportAssets.js");
  const { resolveSelectionDependencyClosure } = await import("../public/src/engines/canvas2d-core/selection/selectionDependencyClosure.js");
  const { prepareElementDuplicateBatch } = await import("../public/src/engines/canvas2d-core/brokers/duplicateElementBatch.js");
  const image = await sharp({ create: { width: 40, height: 20, channels: 4, background: "red" } }).png().toBuffer();
  const frame = createFrame("a4-portrait", { x: 0, y: 0 }, 0, "周报章节");
  const items = [frame,
    { id: "image", type: "image", frameId: frame.id, x: 20, y: 50, width: 200, height: 100, dataUrl: `data:image/png;base64,${image.toString("base64")}`, title: "红色图片" },
    { id: "root", type: "mindNode", frameId: frame.id, title: "导图根", plainText: "导图根", childrenIds: ["child"], x: 100, y: 400 },
    { id: "child", type: "mindNode", frameId: frame.id, title: "导图子", plainText: "导图子", parentId: "root", x: 500, y: 600 },
    { id: "missing", type: "image", sourcePath: "/ungranted/image.png", title: "缺失图", x: 500, y: 900 },
  ];
  const ast = await prepareWordExportAssets(buildWordExportAstFromCanvasSelection(items));
  const closure = resolveSelectionDependencyClosure([frame], items);
  assert.deepEqual(closure.map((item) => item.id), [frame.id, "image", "root", "child"]);
  const copies = prepareElementDuplicateBatch(closure, { frameOrderStart: 2 }).items;
  const frameCopy = copies.find((item) => item.frame);
  assert.equal(frameCopy.frame.order, 2);
  assert(copies.filter((item) => !item.frame).every((item) => item.frameId === frameCopy.id));
  assert.equal(prepareElementDuplicateBatch([items[1]]).items[0].frameId, "");
  assert.equal(ast.assetWarnings.length, 1);
  const files = await unzip(await compileWordExportAstToDocxBuffer(ast));
  const xml = files.get("word/document.xml").toString();
  assert.match(xml, /周报章节/); assert.match(xml, /导图根/); assert.match(xml, /导图子/); assert.match(xml, /<w:ilvl w:val="1"/); assert.match(xml, /<w:drawing>/);
  assert.equal([...files.keys()].filter((name) => name.startsWith("word/media/") && name.endsWith(".png")).length, 1);
  assert.match(xml, /图片：缺失图/);
  const ordered = buildWordExportAstFromCanvasSelection(items, { orderedItemIds: ["missing", frame.id, "image", "root", "child"] });
  assert.equal(ordered.selectionPlan.orderedItemIds[0], "missing");
  const { createLinkCard, collectionMetadata } = await import("../public/src/engines/canvas2d-core/collection/collectionModel.js");
  const { buildSyncBundleFromPayload } = require("../src/backend/services/freeflowSyncModel");
  const { mergeBoardPayloads } = require("../src/backend/services/githubSyncService");
  const card = createLinkCard("https://example.com/", { x: 10, y: 10 }, collectionMetadata("clipboard", true, "https://example.com/"));
  const payload = { kind: "structured-host-board", board: { boardId: "delivery-sync-fixture", items: [frame, { ...card, frameId: frame.id }], preferences: { collectionMode: true } } };
  const bundle = await buildSyncBundleFromPayload(payload);
  const restored = JSON.parse(bundle.boardText);
  assert.deepEqual(restored, payload, "sync serialization must preserve frames, membership, link provenance and collection preferences");
  const local = structuredClone(restored);
  const remote = structuredClone(restored);
  local.board.items[0].title = "本机改章节";
  remote.board.items[1].collection.inbox = false;
  const merged = mergeBoardPayloads(restored, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.payload.board.items[0].title, "本机改章节");
  assert.equal(merged.payload.board.items[1].collection.inbox, false);
  assert.deepEqual(merged.payload.board.items[1].linkCard, card.linkCard);
  remote.board.items[0].title = "另一台改章节";
  assert(mergeBoardPayloads(restored, local, remote).conflicts.some((conflict) => conflict.path.endsWith(".title")), "simultaneous chapter edits must preserve the existing conflict protection");
  console.log("[delivery-core] actual DOCX image bytes, nested numbering, chapter, missing asset and reading order passed");
  console.log("[delivery-core] sync roundtrip, independent device metadata merge and chapter conflict protection passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
