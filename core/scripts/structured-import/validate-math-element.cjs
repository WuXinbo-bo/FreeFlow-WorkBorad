"use strict";

async function main() {
  const mathModule = await import(
    "../../public/src/engines/canvas2d-core/elements/math.js"
  );
  const indexModule = await import(
    "../../public/src/engines/canvas2d-core/elements/index.js"
  );
  const bridgeModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/math/mathElementBridge.js"
  );

  const {
    createMathElement,
    normalizeMathElement,
    MATH_MIN_WIDTH,
    MATH_MIN_HEIGHT,
  } = mathModule;
  const { normalizeElement } = indexModule;
  const { buildMathElementFromRenderOperation } = bridgeModule;

  const created = createMathElement({ x: 10, y: 20 }, "x^2 + y^2 = z^2", {
    displayMode: true,
    sourceFormat: "latex",
  });
  assert(created.type === "mathBlock", "created math block type mismatch");
  assert(created.sourceFormat === "latex", "created source format mismatch");
  assert(created.width >= MATH_MIN_WIDTH, "created math width mismatch");

  const normalized = normalizeElement({
    type: "mathInline",
    formula: "E=mc^2",
    sourceFormat: "latex",
    width: 10,
    height: 10,
    structuredImport: {
      sourceNodeType: "mathInline",
      canonicalFragment: {
        type: "mathInline",
        text: "E=mc^2",
      },
    },
  });
  assert(normalized.type === "mathInline", "normalized math inline type mismatch");
  assert(normalized.width >= MATH_MIN_WIDTH, "normalized math min width mismatch");
  assert(normalized.height >= MATH_MIN_HEIGHT, "normalized math min height mismatch");
  assert(normalized.structuredImport != null, "normalized math structuredImport missing");

  const bridged = buildMathElementFromRenderOperation({
    type: "render-math-block",
    sourceNodeType: "mathBlock",
    element: {
      id: "math-1",
      type: "mathBlock",
      title: "公式",
      formula: "\\frac{a}{b}",
      sourceFormat: "latex",
      displayMode: true,
      fallbackText: "$$\\frac{a}{b}$$",
      width: 260,
      height: 88,
      x: 0,
      y: 0,
      locked: false,
      renderState: "ready",
    },
    structure: {
      sourceFormat: "latex",
      displayMode: true,
      formula: "\\frac{a}{b}",
      fallbackText: "$$\\frac{a}{b}$$",
      parentType: "doc",
    },
    meta: {
      descriptorId: "descriptor-math-1",
      parserId: "latex-math-parser",
    },
  });

  assert(bridged.type === "mathBlock", "bridged math type mismatch");
  assert(bridged.structuredImport != null, "bridged math structuredImport missing");
  assert(bridged.structuredImport.canonicalFragment.type === "mathBlock", "bridged canonical fragment mismatch");
  assert(bridged.structuredImport.sourceMeta.parserId === "latex-math-parser", "bridged parser id mismatch");

  console.log("[math-element] ok: 3 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[math-element] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
