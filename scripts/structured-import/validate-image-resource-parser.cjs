"use strict";

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const registryModule = await import("../../public/src/engines/canvas2d-core/import/parsers/parserRegistry.js");
  const fallbackModule = await import(
    "../../public/src/engines/canvas2d-core/import/fallbacks/fallbackStrategyManager.js"
  );
  const diagnosticsModule = await import(
    "../../public/src/engines/canvas2d-core/import/diagnostics/diagnosticsModel.js"
  );
  const parserModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/image/imageResourceParser.js"
  );
  const runnerModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/parserRunner.js"
  );

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createParserRegistry } = registryModule;
  const { createFallbackStrategyManager } = fallbackModule;
  const { createDiagnosticsModel } = diagnosticsModule;
  const { createImageResourceParser, IMAGE_RESOURCE_PARSER_ID } = parserModule;
  const { runImportParsePipeline } = runnerModule;

  const registry = createParserRegistry();
  registry.registerParser(createImageResourceParser());

  const fileDescriptor = createInputDescriptor({
    descriptorId: "descriptor-image-1",
    channel: INPUT_CHANNELS.DRAG_DROP,
    sourceKind: INPUT_SOURCE_KINDS.IMAGE_RESOURCE,
    entries: [
      {
        entryId: "entry-image-file",
        kind: "image",
        mimeType: "image/png",
        name: "diagram.png",
        raw: {
          filePath: "C:\\fixtures\\diagram.png",
        },
        meta: {
          displayName: "diagram.png",
        },
      },
    ],
  });

  const filePipeline = await runImportParsePipeline({
    descriptor: fileDescriptor,
    registry,
    fallbackManager: createFallbackStrategyManager(),
    diagnosticsModel: createDiagnosticsModel(),
  });

  assert(filePipeline.parseResult.ok === true, "image file parse should succeed");
  assert(filePipeline.parseResult.parserId === IMAGE_RESOURCE_PARSER_ID, "image parser id mismatch");
  const fileNode = filePipeline.parseResult.result.document.content[0];
  assert(fileNode.type === "image", "image node missing");
  assert(fileNode.attrs.src === "C:\\fixtures\\diagram.png", "image src mismatch");
  assert(fileNode.attrs.title === "diagram.png", "image title mismatch");
  assert(fileNode.attrs.resourceId === "descriptor-image-1:entry-image-file", "resourceId mismatch");
  assert(filePipeline.diagnostics.score >= 90, "image diagnostics score should be high");

  const embeddedDescriptor = createInputDescriptor({
    descriptorId: "descriptor-image-2",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.IMAGE_RESOURCE,
    entries: [
      {
        entryId: "entry-image-data-url",
        kind: "image",
        mimeType: "image/jpeg",
        name: "snapshot.jpg",
        raw: {
          imageDataUrl: "data:image/jpeg;base64,QUJDRA==",
        },
        meta: {
          displayName: "snapshot.jpg",
        },
      },
    ],
  });

  const embeddedResult = await registry.parseDescriptor(embeddedDescriptor);
  assert(embeddedResult.ok === true, "embedded image parse should succeed");
  const embeddedNode = embeddedResult.result.document.content[0];
  assert(embeddedNode.type === "image", "embedded image node missing");
  assert(embeddedNode.attrs.src.startsWith("data:image/jpeg;base64,"), "embedded src mismatch");
  assert(embeddedNode.attrs.alt === "snapshot.jpg", "embedded alt mismatch");

  console.log("[image-resource-parser] ok: 2 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[image-resource-parser] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
