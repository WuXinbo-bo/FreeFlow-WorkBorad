"use strict";

async function main() {
  const nodeTypesModule = await import("../../public/src/engines/canvas2d-core/import/canonical/nodeTypes.js");
  const canonicalModule = await import("../../public/src/engines/canvas2d-core/import/canonical/canonicalDocument.js");

  const { BLOCK_NODE_TYPES, INLINE_NODE_TYPES, MARK_TYPES, CANONICAL_DOCUMENT_VERSION } = nodeTypesModule;
  const { createCanonicalDocument, validateCanonicalDocument } = canonicalModule;

  assert(BLOCK_NODE_TYPES.includes("taskList"), "taskList should be a block node");
  assert(INLINE_NODE_TYPES.includes("mathInline"), "mathInline should be an inline node");
  assert(MARK_TYPES.includes("underline"), "underline mark should exist");
  assert(CANONICAL_DOCUMENT_VERSION === "1.0.0", "canonical version mismatch");

  const document = createCanonicalDocument({
    meta: {
      sourceKind: "markdown",
    },
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [
          {
            type: "text",
            text: "Structured Import",
            marks: [{ type: "bold" }],
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Line 1" },
          { type: "hardBreak" },
          { type: "text", text: "Line 2" },
        ],
      },
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Done" }],
              },
            ],
          },
        ],
      },
      {
        type: "mathBlock",
        text: "\\int_0^1 x^2 dx",
      },
      {
        type: "footnote",
        attrs: { id: "fn-1" },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Footnote body" }],
          },
        ],
      },
    ],
  });

  const valid = validateCanonicalDocument(document);
  assert(valid.ok === true, `canonical document should be valid: ${valid.issues.join("; ")}`);

  const invalid = validateCanonicalDocument({
    version: "1.0.0",
    type: "doc",
    attrs: {},
    meta: {},
    content: [
      {
        type: "tableRow",
        attrs: {},
        content: [],
        text: "",
        marks: [],
        meta: {},
      },
    ],
  });
  assert(invalid.ok === false, "invalid canonical document should fail validation");

  console.log("[canonical-document] ok: 3 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[canonical-document] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
