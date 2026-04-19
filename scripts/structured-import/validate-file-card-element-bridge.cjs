"use strict";

async function main() {
  const bridgeModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/file/fileCardElementBridge.js"
  );

  const { buildFileCardElementFromBridgeOperation } = bridgeModule;

  const element = buildFileCardElementFromBridgeOperation({
    type: "bridge-file-card",
    legacyType: "fileCard",
    element: {
      id: "file-1",
      type: "fileCard",
      fileName: "report.pdf",
      title: "report",
      ext: "pdf",
      mime: "application/pdf",
      sourcePath: "D:\\docs\\report.pdf",
      fileId: "file-1",
      size: 2048,
      width: 320,
      height: 120,
      x: 0,
      y: 0,
    },
    structure: {
      entryId: "entry-file-1",
      originId: "descriptor-file-1-file-0",
      sourcePath: "D:\\docs\\report.pdf",
      resourceId: "descriptor-file-1:entry-file-1",
      size: 2048,
      sizeLabel: "2.00 KB",
      ext: "pdf",
      mime: "application/pdf",
    },
    meta: {
      descriptorId: "descriptor-file-1",
      parserId: "file-resource-compatibility-adapter",
    },
  });

  assert(element.type === "fileCard", "fileCard bridge type mismatch");
  assert(element.structuredImport != null, "fileCard structuredImport missing");
  assert(element.structuredImport.compatibilityFragment.adapterType === "fileCard", "fileCard compatibility mismatch");
  assert(
    element.structuredImport.sourceMeta.parserId === "file-resource-compatibility-adapter",
    "fileCard bridge parser mismatch"
  );

  console.log("[file-card-element-bridge] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[file-card-element-bridge] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
