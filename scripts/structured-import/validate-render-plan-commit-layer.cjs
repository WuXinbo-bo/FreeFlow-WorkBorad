const assert = require("node:assert/strict");

async function main() {
  const { createRenderPlanCommitLayer } = await import(
    "../../public/src/engines/canvas2d-core/import/host/renderPlanCommitLayer.js"
  );

  const layer = createRenderPlanCommitLayer();
  const result = layer.commit({
    board: { items: [], selectedIds: [], view: {}, preferences: {} },
    renderResult: {
      result: {
        planId: "plan-1",
        kind: "element-render-plan",
        operations: [
          {
            type: "render-generic-text-block",
            layout: { strategy: "flow-stack", stackIndex: 0, gap: 20 },
            element: {
              id: "text-1",
              type: "text",
              text: "Hello",
              plainText: "Hello",
              html: "<p>Hello</p>",
              width: 160,
              height: 60,
              x: 0,
              y: 0,
            },
          },
          {
            type: "render-code-block",
            layout: { strategy: "flow-stack", stackIndex: 1, gap: 20 },
            element: {
              id: "code-1",
              type: "codeBlock",
              text: "print('hi')",
              plainText: "print('hi')",
              language: "python",
              width: 240,
              height: 100,
              x: 0,
              y: 0,
            },
          },
        ],
      },
    },
    anchorPoint: { x: 120, y: 80 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.board.items.length, 2);
  assert.deepEqual(result.board.selectedIds, ["text-1", "code-1"]);
  assert.equal(result.items[0].x, 120);
  assert.ok(result.items[1].y > result.items[0].y);

  console.log("[render-plan-commit-layer] ok: 1 scenario validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
