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
                { type: "text", text: " with " },
                {
                  type: "mathInline",
                  attrs: {
                    sourceFormat: "latex",
                    displayMode: false,
                  },
                  text: "E=mc^2",
                },
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
  assert(paragraphOperation.element.plainText.includes("Hello world with E=mc^2"), "paragraph text mismatch");
  assert(paragraphOperation.element.html.includes("<br>"), "paragraph hard break html mismatch");
  assert(paragraphOperation.element.html.includes("<code>const a = 1;</code>"), "paragraph inline code html mismatch");
  assert(paragraphOperation.element.html.includes('data-role="math-inline"'), "paragraph math inline html mismatch");

  const quoteOperation = result.result.operations[2];
  assert(quoteOperation.blockRole === "blockquote", "blockquote role mismatch");
  assert(quoteOperation.element.color === "#475569", "blockquote color mismatch");

  const plainTextPipelineOutput = {
    descriptor: {
      descriptorId: "descriptor-text-render-plain-1",
    },
    parseResult: {
      parserId: "plain-text-parser",
      result: {
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "第一段第一行" }, { type: "hardBreak" }, { type: "text", text: "第一段第二行" }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "第二段内容" }],
            },
          ],
        },
      },
    },
  };

  const plainResult = await pipeline.render(plainTextPipelineOutput);
  assert(plainResult.ok === true, "plain text render should succeed");
  assert(plainResult.result.operations.length === 1, "plain text should aggregate into single text box");
  const aggregatedOperation = plainResult.result.operations[0];
  assert(aggregatedOperation.element.textBoxLayoutMode === "auto-height", "aggregated text box mode mismatch");
  assert(aggregatedOperation.element.plainText.includes("第一段第二行\n\n第二段内容"), "aggregated paragraph text mismatch");
  assert(aggregatedOperation.element.html.includes("<div>"), "aggregated paragraph html mismatch");

  const cjkSingleParagraphOutput = {
    descriptor: {
      descriptorId: "descriptor-text-render-cjk-1",
    },
    parseResult: {
      parserId: "plain-text-parser",
      result: {
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "这是一段中文连续文本用于验证拖拽导入时的换行稳定性" }],
            },
          ],
        },
      },
    },
  };

  const cjkResult = await pipeline.render(cjkSingleParagraphOutput);
  assert(cjkResult.ok === true, "cjk plain text render should succeed");
  assert(cjkResult.result.operations.length === 1, "cjk plain text should render to one operation");
  const cjkOperation = cjkResult.result.operations[0];
  assert(cjkOperation.element.textBoxLayoutMode === "auto-height", "cjk paragraph should prefer auto-height");
  assert(cjkOperation.element.textResizeMode === "wrap", "cjk paragraph should prefer wrap mode");

  const dragDropShortParagraphOutput = {
    descriptor: {
      descriptorId: "descriptor-text-render-drag-1",
      channel: "drag-drop",
    },
    parseResult: {
      parserId: "html-parser",
      result: {
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "短句也需要按文本框换行显示" }],
            },
          ],
        },
      },
    },
  };
  const dragDropResult = await pipeline.render(dragDropShortParagraphOutput);
  assert(dragDropResult.ok === true, "drag-drop render should succeed");
  const dragOperation = dragDropResult.result.operations[0];
  assert(dragOperation.element.textBoxLayoutMode === "auto-height", "drag-drop paragraph should force auto-height");
  assert(dragOperation.element.textResizeMode === "wrap", "drag-drop paragraph should force wrap");

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
