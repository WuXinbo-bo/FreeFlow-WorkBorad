"use strict";

async function main() {
  const textModule = await import(
    "../../public/src/engines/canvas2d-core/elements/text.js"
  );
  const bridgeModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/text/textElementBridge.js"
  );

  const {
    normalizeTextElement,
    TEXT_STRUCTURED_IMPORT_KIND,
  } = textModule;
  const { buildStructuredTextElementFromRenderOperation } = bridgeModule;

  const normalized = normalizeTextElement({
    text: "Hello",
    html: "<p>Hello</p>",
    structuredImport: {
      blockRole: "paragraph",
      sourceNodeType: "paragraph",
      canonicalFragment: {
        type: "paragraph",
        plainText: "Hello",
      },
      sourceMeta: {
        descriptorId: "descriptor-text-1",
      },
    },
  });

  assert(normalized.structuredImport != null, "structuredImport should be preserved");
  assert(normalized.structuredImport.kind === TEXT_STRUCTURED_IMPORT_KIND, "structuredImport kind mismatch");
  assert(normalized.structuredImport.blockRole === "paragraph", "structuredImport blockRole mismatch");
  assert(normalized.structuredImport.canonicalFragment.type === "paragraph", "canonical fragment mismatch");

  const bridged = buildStructuredTextElementFromRenderOperation({
    type: "render-list-block",
    sourceNodeType: "taskList",
    listRole: "taskList",
    element: {
      id: "text-1",
      type: "text",
      text: "[x] Item",
      plainText: "[x] Item",
      html: "<ul><li>☑ Item</li></ul>",
      title: "Item",
      fontSize: 20,
      color: "#0f172a",
      wrapMode: "manual",
      textResizeMode: "auto-width",
      width: 180,
      height: 56,
      x: 0,
      y: 0,
      locked: false,
    },
    structure: {
      listRole: "taskList",
      items: [
        {
          kind: "taskItem",
          checked: true,
          level: 0,
          plainText: "Item",
          html: "Item",
          childItems: [],
        },
      ],
    },
    meta: {
      descriptorId: "descriptor-text-2",
      parserId: "markdown-parser",
    },
  });

  assert(bridged.type === "text", "bridged text type mismatch");
  assert(bridged.structuredImport != null, "bridged structuredImport missing");
  assert(bridged.structuredImport.listRole === "taskList", "bridged list role mismatch");
  assert(Array.isArray(bridged.structuredImport.canonicalFragment.items), "bridged canonical items missing");
  assert(
    bridged.structuredImport.sourceMeta.parserId === "markdown-parser",
    "bridged source meta parser mismatch"
  );

  console.log("[text-element-protocol] ok: 2 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[text-element-protocol] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
