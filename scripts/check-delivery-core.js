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
  const { buildWordExportAstFromCanvasSelection } = await import("../public/src/engines/canvas2d-core/export/word/buildWordExportAst.js");
  const { prepareWordExportAssets } = await import("../public/src/engines/canvas2d-core/export/word/prepareWordExportAssets.js");
  const image = await sharp({ create: { width: 40, height: 20, channels: 4, background: "red" } }).png().toBuffer();
  const items = [
    { id: "heading", type: "text", plainText: "周报标题", richTextDocument: { kind: "freeflow-rich-text", version: 2, blocks: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "周报标题" }] }] }, x: 0, y: 0 },
    { id: "image", type: "image", x: 20, y: 50, width: 200, height: 100, dataUrl: `data:image/png;base64,${image.toString("base64")}`, title: "红色图片" },
    { id: "root", type: "mindNode", title: "导图根", plainText: "导图根", childrenIds: ["child"], x: 100, y: 400 },
    { id: "child", type: "mindNode", title: "导图子", plainText: "导图子", parentId: "root", x: 500, y: 600 },
    { id: "missing", type: "image", sourcePath: "/ungranted/image.png", title: "缺失图", x: 500, y: 900 },
  ];
  const ast = await prepareWordExportAssets(buildWordExportAstFromCanvasSelection(items));
  assert.equal(ast.assetWarnings.length, 1);
  const files = await unzip(await compileWordExportAstToDocxBuffer(ast));
  const xml = files.get("word/document.xml").toString();
  assert.match(xml, /周报标题/); assert.match(xml, /导图根/); assert.match(xml, /导图子/); assert.match(xml, /<w:ilvl w:val="1"/); assert.match(xml, /<w:drawing>/);
  assert.equal([...files.keys()].filter((name) => name.startsWith("word/media/") && name.endsWith(".png")).length, 1);
  assert.match(xml, /图片：缺失图/);
  const ordered = buildWordExportAstFromCanvasSelection(items, { orderedItemIds: ["missing", "heading", "image", "root", "child"] });
  assert.equal(ordered.selectionPlan.orderedItemIds[0], "missing");
  console.log("[delivery-core] retained DOCX image bytes, nested numbering, heading, missing asset and reading order passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
