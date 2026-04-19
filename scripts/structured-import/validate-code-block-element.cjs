"use strict";

async function main() {
  const elementModule = await import(
    "../../public/src/engines/canvas2d-core/elements/codeBlock.js"
  );
  const indexModule = await import(
    "../../public/src/engines/canvas2d-core/elements/index.js"
  );
  const bridgeModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/code/codeBlockElementBridge.js"
  );

  const {
    createCodeBlockElement,
    normalizeCodeBlockElement,
    CODE_BLOCK_MIN_WIDTH,
    CODE_BLOCK_MIN_HEIGHT,
  } = elementModule;
  const { normalizeElement } = indexModule;
  const { buildCodeBlockElementFromRenderOperation } = bridgeModule;

  const created = createCodeBlockElement({ x: 10, y: 20 }, "const a = 1;\nconsole.log(a);", "js");
  assert(created.type === "codeBlock", "created codeBlock type mismatch");
  assert(created.language === "js", "created codeBlock language mismatch");
  assert(created.width >= CODE_BLOCK_MIN_WIDTH, "created codeBlock width mismatch");
  assert(created.height >= CODE_BLOCK_MIN_HEIGHT, "created codeBlock height mismatch");

  const normalized = normalizeElement({
    type: "codeBlock",
    text: "SELECT *\nFROM board_items;",
    language: "sql",
    width: 120,
    height: 40,
    structuredImport: {
      sourceNodeType: "codeBlock",
      canonicalFragment: {
        type: "codeBlock",
        attrs: { language: "sql" },
        text: "SELECT *\nFROM board_items;",
      },
    },
  });
  assert(normalized.type === "codeBlock", "normalized codeBlock type mismatch");
  assert(normalized.width >= CODE_BLOCK_MIN_WIDTH, "normalized codeBlock min width mismatch");
  assert(normalized.height >= CODE_BLOCK_MIN_HEIGHT, "normalized codeBlock min height mismatch");
  assert(normalized.structuredImport != null, "normalized codeBlock structuredImport missing");

  const bridged = buildCodeBlockElementFromRenderOperation({
    type: "render-code-block",
    sourceNodeType: "codeBlock",
    element: {
      id: "code-1",
      type: "codeBlock",
      title: "js 代码块",
      language: "js",
      text: "console.log(1);",
      plainText: "console.log(1);",
      fontSize: 16,
      width: 280,
      height: 96,
      x: 0,
      y: 0,
      locked: false,
      theme: "default",
    },
    structure: {
      language: "js",
      lineCount: 1,
      parentType: "doc",
      code: "console.log(1);",
    },
    meta: {
      descriptorId: "descriptor-code-1",
      parserId: "code-parser",
    },
  });

  assert(bridged.type === "codeBlock", "bridged codeBlock type mismatch");
  assert(bridged.structuredImport != null, "bridged structuredImport missing");
  assert(bridged.structuredImport.canonicalFragment.type === "codeBlock", "bridged canonical fragment mismatch");
  assert(bridged.structuredImport.sourceMeta.parserId === "code-parser", "bridged parser id mismatch");

  console.log("[code-block-element] ok: 3 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[code-block-element] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
