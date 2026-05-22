"use strict";

async function main() {
  const nodeTypesModule = await import("../../public/src/engines/canvas2d-core/import/canonical/nodeTypes.js");
  const canonicalModule = await import("../../public/src/engines/canvas2d-core/import/canonical/canonicalDocument.js");

  const { CANONICAL_DOCUMENT_VERSION, CANONICAL_MIN_READER_VERSION } = nodeTypesModule;
  const { createCanonicalDocument, normalizeCanonicalNode, validateCanonicalDocument } = canonicalModule;

  assert(CANONICAL_DOCUMENT_VERSION === "1.0.0", "document version mismatch");
  assert(CANONICAL_MIN_READER_VERSION === "1.0.0", "min reader version mismatch");

  const document = createCanonicalDocument({
    meta: {
      source: {
        kind: "markdown",
        channel: "paste-native",
        parserId: "markdown-primary",
        descriptorId: "descriptor-001",
      },
      compat: {
        minReaderVersion: "1.0.0",
        featureFlags: ["task-list", "footnote"],
        legacyAliases: ["doc-v0"],
      },
      tags: ["study", "imported"],
      labels: ["demo"],
    },
    content: [
      {
        type: "paragraph",
        meta: {
          source: {
            kind: "markdown",
            channel: "paste-native",
            parserId: "markdown-primary",
            descriptorId: "descriptor-001",
          },
          compat: {
            minReaderVersion: "1.0.0",
            featureFlags: [],
            legacyAliases: [],
          },
          originId: "node-1",
          legacyType: "text",
        },
        content: [{ type: "text", text: "Hello" }],
      },
    ],
  });

  const valid = validateCanonicalDocument(document);
  assert(valid.ok === true, `compat document should be valid: ${valid.issues.join("; ")}`);

  const normalizedNode = normalizeCanonicalNode({
    type: "paragraph",
    meta: {
      source: { kind: "html", parserId: "html" },
      compat: { featureFlags: ["rich-text"] },
      originId: "legacy-1",
    },
  });
  assert(normalizedNode.meta.source.kind === "html", "node source kind mismatch");
  assert(normalizedNode.meta.source.channel === "", "node source channel should default empty");
  assert(normalizedNode.meta.compat.minReaderVersion === "1.0.0", "node compat default version mismatch");

  const invalid = validateCanonicalDocument({
    version: "1.0.0",
    type: "doc",
    attrs: {},
    meta: {
      source: {
        kind: "html",
        channel: "paste-native",
        parserId: "html",
        descriptorId: "descriptor-1",
      },
      compat: {
        minReaderVersion: "1.0.0",
        featureFlags: [],
        legacyAliases: []
      },
      tags: [],
      labels: []
    },
    content: [
      {
        type: "paragraph",
        attrs: {},
        content: [],
        text: "",
        marks: [],
        meta: {
          source: {},
          compat: {},
          originId: 1,
          legacyType: ""
        }
      }
    ]
  });
  assert(invalid.ok === false, "invalid compat document should fail validation");

  console.log("[canonical-compat] ok: 3 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[canonical-compat] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
