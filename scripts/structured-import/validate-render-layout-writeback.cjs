const assert = require("node:assert/strict");

async function main() {
  const { applyRenderLayoutWriteback } = await import(
    "../../public/src/engines/canvas2d-core/import/host/renderLayoutWriteback.js"
  );

  const result = applyRenderLayoutWriteback({
    operations: [
      {
        layout: { strategy: "flow-stack", stackIndex: 0, gap: 18 },
        element: { id: "text-1", type: "text", text: "A", plainText: "A", html: "A", width: 100, height: 40 },
      },
      {
        layout: { strategy: "inline-anchor", stackIndex: 1 },
        element: { id: "math-1", type: "mathInline", formula: "x", width: 50, height: 28 },
      },
    ],
  }, {
    anchorPoint: { x: 40, y: 50 },
  });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].x, 40);
  assert.equal(result.items[0].y, 50);
  assert.ok(result.items[1].x >= 40);

  console.log("[render-layout-writeback] ok: 1 scenario validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
