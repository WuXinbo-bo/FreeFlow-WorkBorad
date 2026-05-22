"use strict";

async function main() {
  const rendererPipelineModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/rendererPipeline.js"
  );
  const rendererModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/code/codeBlockRenderer.js"
  );

  const { createRendererPipeline } = rendererPipelineModule;
  const { createCodeBlockRenderer, CODE_BLOCK_RENDERER_ID } = rendererModule;

  const pipeline = createRendererPipeline();
  pipeline.registerRenderer(createCodeBlockRenderer());

  const pipelineOutput = {
    descriptor: {
      descriptorId: "descriptor-code-render-1",
    },
    parseResult: {
      parserId: "code-parser",
      result: {
        document: {
          type: "doc",
          content: [
            {
              type: "codeBlock",
              attrs: { language: "python" },
              text: [
                "def normalize(items):",
                "    return [item.strip() for item in items if item]",
              ].join("\n"),
            },
            {
              type: "blockquote",
              content: [
                {
                  type: "codeBlock",
                  attrs: { language: "sql" },
                  text: "SELECT *\nFROM users;",
                },
              ],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "ignore me" }],
            },
          ],
        },
      },
    },
  };

  const matches = pipeline.matchRenderers(pipelineOutput);
  assert(matches.length === 1, "code renderer match count mismatch");

  const result = await pipeline.render(pipelineOutput);
  assert(result.ok === true, "code render should succeed");
  assert(result.rendererId === CODE_BLOCK_RENDERER_ID, "code renderer id mismatch");
  assert(result.result.operations.length === 2, "code operation count mismatch");

  const first = result.result.operations[0];
  assert(first.type === "render-code-block", "code operation type mismatch");
  assert(first.element.type === "codeBlock", "code element type mismatch");
  assert(first.structure.language === "python", "code language mismatch");
  assert(first.structure.lineCount === 2, "code line count mismatch");
  assert(first.element.text.includes("return [item.strip()"), "code text mismatch");

  const second = result.result.operations[1];
  assert(second.structure.language === "sql", "nested code language mismatch");
  assert(second.layout.quoteDepth === 1, "nested quote depth mismatch");

  console.log("[code-block-renderer] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[code-block-renderer] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
