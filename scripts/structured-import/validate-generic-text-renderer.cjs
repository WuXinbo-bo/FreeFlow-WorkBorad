"use strict";

async function main() {
  const rendererPipelineModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/rendererPipeline.js"
  );
  const rendererModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/text/genericTextRenderer.js"
  );

  const { createRendererPipeline } = rendererPipelineModule;
  const { createGenericTextRenderer, GENERIC_TEXT_RENDERER_ID } = rendererModule;

  const pipeline = createRendererPipeline();
  pipeline.registerRenderer(createGenericTextRenderer());

  const pipelineOutput = {
    descriptor: {
      descriptorId: "descriptor-text-render-1",
    },
    parseResult: {
      parserId: "markdown-parser",
      result: {
        document: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [
                { type: "text", text: "Title", marks: [{ type: "bold" }] },
              ],
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Hello " },
                { type: "text", text: "world", marks: [{ type: "italic" }] },
                { type: "hardBreak" },
                { type: "inlineCode", text: "const a = 1;" },
              ],
            },
            {
              type: "blockquote",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Quoted line" }],
                },
              ],
            },
            {
              type: "codeBlock",
              attrs: { language: "js" },
              text: "console.log(1);",
            },
          ],
        },
      },
    },
  };

  const matches = pipeline.matchRenderers(pipelineOutput);
  assert(matches.length === 1, "generic text renderer match count mismatch");

  const result = await pipeline.render(pipelineOutput);
  assert(result.ok === true, "generic text render should succeed");
  assert(result.rendererId === GENERIC_TEXT_RENDERER_ID, "generic text renderer id mismatch");
  assert(result.result.operations.length === 3, "generic text operation count mismatch");

  const headingOperation = result.result.operations[0];
  assert(headingOperation.blockRole === "heading", "heading block role mismatch");
  assert(headingOperation.element.fontSize === 30, "heading font size mismatch");
  assert(headingOperation.element.html.includes("<strong>Title</strong>"), "heading html mismatch");

  const paragraphOperation = result.result.operations[1];
  assert(paragraphOperation.blockRole === "paragraph", "paragraph block role mismatch");
  assert(paragraphOperation.element.plainText.includes("Hello world"), "paragraph text mismatch");
  assert(paragraphOperation.element.html.includes("<br>"), "paragraph hard break html mismatch");
  assert(paragraphOperation.element.html.includes("<code>const a = 1;</code>"), "paragraph inline code html mismatch");

  const quoteOperation = result.result.operations[2];
  assert(quoteOperation.blockRole === "blockquote", "blockquote role mismatch");
  assert(quoteOperation.element.color === "#475569", "blockquote color mismatch");

  console.log("[generic-text-renderer] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[generic-text-renderer] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
