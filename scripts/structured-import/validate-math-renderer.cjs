"use strict";

async function main() {
  const rendererPipelineModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/rendererPipeline.js"
  );
  const rendererModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/math/mathRenderer.js"
  );

  const { createRendererPipeline } = rendererPipelineModule;
  const { createMathRenderer, MATH_RENDERER_ID } = rendererModule;

  const pipeline = createRendererPipeline();
  pipeline.registerRenderer(createMathRenderer());

  const pipelineOutput = {
    descriptor: {
      descriptorId: "descriptor-math-render-1",
    },
    parseResult: {
      parserId: "latex-math-parser",
      result: {
        document: {
          type: "doc",
          content: [
            {
              type: "mathBlock",
              attrs: {
                sourceFormat: "latex",
                displayMode: true,
              },
              text: "\\int_0^1 x^2 \\, dx",
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Area is " },
                {
                  type: "mathInline",
                  attrs: {
                    sourceFormat: "latex",
                    displayMode: false,
                  },
                  text: "x^2+y^2",
                },
                { type: "text", text: "." },
              ],
            },
            {
              type: "blockquote",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "mathInline",
                      attrs: {
                        sourceFormat: "latex",
                        displayMode: false,
                      },
                      text: "\\alpha+\\beta",
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  };

  const matches = pipeline.matchRenderers(pipelineOutput);
  assert(matches.length === 1, "math renderer match count mismatch");

  const result = await pipeline.render(pipelineOutput);
  assert(result.ok === true, "math render should succeed");
  assert(result.rendererId === MATH_RENDERER_ID, "math renderer id mismatch");
  assert(result.result.operations.length === 1, "math operation count mismatch");

  const blockOperation = result.result.operations[0];
  assert(blockOperation.type === "render-math-block", "math block operation mismatch");
  assert(blockOperation.element.type === "mathBlock", "math block element type mismatch");
  assert(blockOperation.structure.displayMode === true, "math block display mode mismatch");
  assert(blockOperation.element.fallbackText === "$$\\int_0^1 x^2 \\, dx$$", "math block fallback mismatch");
  assert(result.result.stats.mathBlockCount === 1, "math block count mismatch");
  assert(result.result.stats.mathInlineCount === 0, "math inline count should remain zero");

  console.log("[math-renderer] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[math-renderer] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
