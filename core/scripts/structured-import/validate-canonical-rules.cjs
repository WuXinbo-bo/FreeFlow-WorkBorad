"use strict";

async function main() {
  const nodeTypesModule = await import("../../public/src/engines/canvas2d-core/import/canonical/nodeTypes.js");
  const canonicalModule = await import("../../public/src/engines/canvas2d-core/import/canonical/canonicalDocument.js");

  const { MARK_ALLOWED_ATTRS, getEmptyNodePolicy } = nodeTypesModule;
  const { createCanonicalNode, normalizeCanonicalNode, validateCanonicalDocument } = canonicalModule;

  assert(Array.isArray(MARK_ALLOWED_ATTRS.textColor), "textColor mark attrs should exist");
  assert(MARK_ALLOWED_ATTRS.textColor.includes("color"), "textColor mark should allow color");
  assert(getEmptyNodePolicy("tableCell")?.strategy === "single-empty-paragraph", "tableCell empty policy mismatch");

  const emptyTableCell = createCanonicalNode({
    type: "tableCell",
  });
  assert(emptyTableCell.content.length === 1, "empty tableCell should normalize to one paragraph");
  assert(emptyTableCell.content[0].type === "paragraph", "empty tableCell placeholder should be paragraph");

  const normalizedMarkNode = normalizeCanonicalNode({
    type: "text",
    text: "Hello",
    marks: [
      { type: "textColor", attrs: { color: "#f00", unknown: "drop-me" } },
      { type: "bold", attrs: { ignored: true } },
    ],
  });
  assert(normalizedMarkNode.marks.length === 2, "normalized marks length mismatch");
  assert(
    Object.keys(normalizedMarkNode.marks[0].attrs).length === 1 &&
      normalizedMarkNode.marks[0].attrs.color === "#f00",
    "textColor attrs should be filtered"
  );
  assert(Object.keys(normalizedMarkNode.marks[1].attrs).length === 0, "bold attrs should normalize empty");

  const invalid = validateCanonicalDocument({
    version: "1.0.0",
    type: "doc",
    attrs: {},
    meta: {},
    content: [
      {
        type: "tableCell",
        attrs: {},
        content: [],
        text: "",
        marks: [],
        meta: {},
      },
    ],
  });
  assert(invalid.ok === false, "invalid empty tableCell should fail document validation");

  console.log("[canonical-rules] ok: 4 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[canonical-rules] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
