"use strict";

async function main() {
  const rendererPipelineModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/rendererPipeline.js"
  );
  const rendererModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/list/listRenderer.js"
  );

  const { createRendererPipeline } = rendererPipelineModule;
  const { createListRenderer, LIST_RENDERER_ID } = rendererModule;

  const pipeline = createRendererPipeline();
  pipeline.registerRenderer(createListRenderer());

  const pipelineOutput = {
    descriptor: {
      descriptorId: "descriptor-list-render-1",
    },
    parseResult: {
      parserId: "markdown-parser",
      result: {
        document: {
          type: "doc",
          content: [
            {
              type: "taskList",
              content: [
                {
                  type: "taskItem",
                  attrs: { checked: true },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Ship parser" }],
                    },
                    {
                      type: "orderedList",
                      attrs: { start: 3 },
                      content: [
                        {
                          type: "listItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "Write docs" }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "taskItem",
                  attrs: { checked: false },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Review tests" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "One" }],
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
  assert(matches.length === 1, "list renderer match count mismatch");

  const result = await pipeline.render(pipelineOutput);
  assert(result.ok === true, "list render should succeed");
  assert(result.rendererId === LIST_RENDERER_ID, "list renderer id mismatch");
  assert(result.result.operations.length === 2, "list operation count mismatch");

  const taskOperation = result.result.operations[0];
  assert(taskOperation.listRole === "taskList", "task list role mismatch");
  assert(taskOperation.structure.items.length === 2, "task item count mismatch");
  assert(taskOperation.structure.items[0].checked === true, "task checked mismatch");
  assert(taskOperation.element.html.includes("☑"), "task html marker mismatch");
  assert(taskOperation.element.plainText.includes("[x] Ship parser"), "task plain text mismatch");
  assert(taskOperation.structure.items[0].childItems[0].orderedIndex === 3, "nested ordered index mismatch");

  const bulletOperation = result.result.operations[1];
  assert(bulletOperation.listRole === "bulletList", "bullet list role mismatch");
  assert(bulletOperation.element.html.startsWith("<ul>"), "bullet html mismatch");
  assert(bulletOperation.element.plainText.includes("• One"), "bullet plain text mismatch");

  console.log("[list-renderer] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[list-renderer] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
