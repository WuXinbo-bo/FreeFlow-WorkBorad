"use strict";

async function main() {
  const rendererPipelineModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/rendererPipeline.js"
  );
  const rendererModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/image/imageRenderer.js"
  );

  const { createRendererPipeline } = rendererPipelineModule;
  const { createImageRenderer, IMAGE_RENDERER_ID } = rendererModule;

  const pipeline = createRendererPipeline();
  pipeline.registerRenderer(createImageRenderer());

  const pipelineOutput = {
    descriptor: {
      descriptorId: "descriptor-image-render-1",
    },
    parseResult: {
      parserId: "image-resource-parser",
      result: {
        document: {
          type: "doc",
          content: [
            {
              type: "image",
              attrs: {
                src: "D:\\assets\\diagram.png",
                alt: "diagram.png",
                title: "diagram.png",
                width: 480,
                height: 260,
                resourceId: "descriptor-image-1:entry-image-file",
              },
            },
            {
              type: "blockquote",
              content: [
                {
                  type: "image",
                  attrs: {
                    src: "data:image/jpeg;base64,QUJDRA==",
                    alt: "snapshot.jpg",
                    title: "snapshot.jpg",
                    width: 320,
                    height: 180,
                    resourceId: "descriptor-image-2:entry-image-data-url",
                  },
                },
              ],
            },
          ],
        },
      },
    },
  };

  const matches = pipeline.matchRenderers(pipelineOutput);
  assert(matches.length === 1, "image renderer match count mismatch");

  const result = await pipeline.render(pipelineOutput);
  assert(result.ok === true, "image render should succeed");
  assert(result.rendererId === IMAGE_RENDERER_ID, "image renderer id mismatch");
  assert(result.result.operations.length === 2, "image operation count mismatch");

  const first = result.result.operations[0];
  assert(first.type === "render-image-block", "image operation type mismatch");
  assert(first.element.type === "image", "legacy image element type mismatch");
  assert(first.element.source === "path", "legacy image source mismatch");
  assert(first.element.sourcePath === "D:\\assets\\diagram.png", "legacy image sourcePath mismatch");
  assert(first.element.fileId === "descriptor-image-1:entry-image-file", "legacy image fileId mismatch");
  assert(first.element.width === 480, "legacy image width mismatch");
  assert(first.structure.source === "path", "image structure source mismatch");

  const second = result.result.operations[1];
  assert(second.element.source === "blob", "embedded image source mismatch");
  assert(second.element.dataUrl.startsWith("data:image/jpeg;base64,"), "embedded image dataUrl mismatch");
  assert(second.layout.quoteDepth === 1, "embedded image quote depth mismatch");
  assert(second.structure.source === "blob", "embedded image structure source mismatch");

  console.log("[image-renderer] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[image-renderer] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
