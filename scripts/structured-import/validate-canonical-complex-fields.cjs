"use strict";

async function main() {
  const canonicalModule = await import("../../public/src/engines/canvas2d-core/import/canonical/canonicalDocument.js");
  const nodeTypesModule = await import("../../public/src/engines/canvas2d-core/import/canonical/nodeTypes.js");

  const { createCanonicalDocument, normalizeCanonicalNode, validateCanonicalDocument } = canonicalModule;
  const { getNodeAllowedAttrs, getNodeRequiredAttrs } = nodeTypesModule;

  assert(getNodeAllowedAttrs("tableCell").includes("colSpan"), "tableCell should allow colSpan");
  assert(getNodeRequiredAttrs("footnoteRef").includes("refId"), "footnoteRef should require refId");

  const tableCell = normalizeCanonicalNode({
    type: "tableCell",
    attrs: { colSpan: 2, rowSpan: 3, header: true, align: "center", unknown: "drop" },
    content: [],
  });
  assert(tableCell.attrs.colSpan === 2, "tableCell colSpan normalize mismatch");
  assert(tableCell.attrs.rowSpan === 3, "tableCell rowSpan normalize mismatch");
  assert(tableCell.attrs.header === true, "tableCell header normalize mismatch");
  assert(!("unknown" in tableCell.attrs), "tableCell unknown attr should be dropped");

  const mathInline = normalizeCanonicalNode({
    type: "mathInline",
    attrs: { sourceFormat: "mathml", displayMode: false },
    text: "<math></math>",
  });
  assert(mathInline.attrs.sourceFormat === "mathml", "mathInline sourceFormat normalize mismatch");
  assert(mathInline.attrs.displayMode === false, "mathInline displayMode normalize mismatch");

  const document = createCanonicalDocument({
    content: [
      {
        type: "table",
        attrs: { columns: 2 },
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: { colSpan: 1, rowSpan: 1, header: false },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Cell" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "See note" },
          { type: "footnoteRef", attrs: { refId: "fn-1" } },
        ],
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
      {
        type: "mathBlock",
        attrs: { sourceFormat: "latex", displayMode: true },
        text: "\\frac{1}{2}",
      },
    ],
  });
  const valid = validateCanonicalDocument(document);
  assert(valid.ok === true, `canonical complex document should be valid: ${valid.issues.join("; ")}`);

  const invalid = validateCanonicalDocument({
    version: "1.0.0",
    type: "doc",
    attrs: {},
    meta: {},
    content: [
      {
        type: "footnoteRef",
        attrs: {},
        content: [],
        text: "",
        marks: [],
        meta: {},
      },
    ],
  });
  assert(invalid.ok === false, "invalid footnoteRef should fail validation");

  console.log("[canonical-complex-fields] ok: 4 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[canonical-complex-fields] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
