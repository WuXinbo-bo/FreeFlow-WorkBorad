"use strict";

async function main() {
  const bridgeModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/image/imageElementBridge.js"
  );

  const { buildImageElementFromRenderOperation } = bridgeModule;

  const element = buildImageElementFromRenderOperation({
    type: "render-image-block",
    sourceNodeType: "image",
    element: {
      id: "img-1",
      type: "image",
      name: "diagram.png",
      mime: "image/png",
      source: "path",
      sourcePath: "D:\\assets\\diagram.png",
      fileId: "img-file-1",
      width: 480,
      height: 260,
      naturalWidth: 480,
      naturalHeight: 260,
      x: 0,
      y: 0,
    },
    structure: {
      src: "D:\\assets\\diagram.png",
      alt: "diagram.png",
      title: "diagram.png",
      resourceId: "descriptor-image-1:entry-image-file",
      source: "path",
    },
    meta: {
      descriptorId: "descriptor-image-1",
      parserId: "image-resource-parser",
    },
  });

  assert(element.type === "image", "image bridge type mismatch");
  assert(element.structuredImport != null, "image structuredImport missing");
  assert(element.structuredImport.canonicalFragment.type === "image", "image canonical fragment mismatch");
  assert(element.structuredImport.sourceMeta.parserId === "image-resource-parser", "image bridge parser mismatch");

  console.log("[image-element-bridge] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[image-element-bridge] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
