"use strict";

async function main() {
  const rendererPipelineModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/rendererPipeline.js"
  );
  const rendererModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/table/tableRenderer.js"
  );

  const { createRendererPipeline } = rendererPipelineModule;
  const { createTableRenderer, TABLE_RENDERER_ID } = rendererModule;

  const pipeline = createRendererPipeline();
  pipeline.registerRenderer(createTableRenderer());

  const pipelineOutput = {
    descriptor: {
      descriptorId: "descriptor-table-render-1",
    },
    parseResult: {
      parserId: "html-parser",
      result: {
        document: {
          type: "doc",
          content: [
            {
              type: "table",
              attrs: { columns: 3 },
              content: [
                {
                  type: "tableRow",
                  content: [
                    {
                      type: "tableCell",
                      attrs: { colSpan: 1, rowSpan: 1, header: true, align: "center" },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Name" }],
                        },
                      ],
                    },
                    {
                      type: "tableCell",
                      attrs: { colSpan: 2, rowSpan: 1, header: true, align: "left" },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Details" }],
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "tableRow",
                  content: [
                    {
                      type: "tableCell",
                      attrs: { colSpan: 1, rowSpan: 2, header: false, align: "left" },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Alpha" }],
                        },
                      ],
                    },
                    {
                      type: "tableCell",
                      attrs: { colSpan: 1, rowSpan: 1, header: false, align: "right" },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "42" }],
                        },
                      ],
                    },
                    {
                      type: "tableCell",
                      attrs: { colSpan: 1, rowSpan: 1, header: false, align: "left" },
                      content: [
                        {
                          type: "bulletList",
                          content: [
                            {
                              type: "listItem",
                              content: [
                                {
                                  type: "paragraph",
                                  content: [{ type: "text", text: "Nested" }],
                                },
                              ],
                            },
                          ],
                        },
                      ],
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
  assert(matches.length === 1, "table renderer match count mismatch");

  const result = await pipeline.render(pipelineOutput);
  assert(result.ok === true, "table render should succeed");
  assert(result.rendererId === TABLE_RENDERER_ID, "table renderer id mismatch");
  assert(result.result.operations.length === 1, "table operation count mismatch");

  const tableOperation = result.result.operations[0];
  assert(tableOperation.type === "render-table-block", "table operation type mismatch");
  assert(tableOperation.element.type === "table", "table element type mismatch");
  assert(tableOperation.structure.columns === 3, "table columns mismatch");
  assert(tableOperation.structure.hasHeader === true, "table header mismatch");
  assert(tableOperation.structure.rows.length === 2, "table row count mismatch");

  const firstHeaderCell = tableOperation.structure.rows[0].cells[0];
  assert(firstHeaderCell.header === true, "header cell flag mismatch");
  assert(firstHeaderCell.align === "center", "header cell align mismatch");

  const mergedCell = tableOperation.structure.rows[1].cells[0];
  assert(mergedCell.rowSpan === 2, "merged cell rowSpan mismatch");

  const nestedCell = tableOperation.structure.rows[1].cells[2];
  assert(nestedCell.plainText.includes("• Nested"), "nested list plain text mismatch");
  assert(nestedCell.html.includes("<ul>"), "nested list html mismatch");

  console.log("[table-renderer] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[table-renderer] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
