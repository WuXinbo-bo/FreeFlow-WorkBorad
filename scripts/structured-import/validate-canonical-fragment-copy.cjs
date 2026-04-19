"use strict";

async function main() {
  const protocolModule = await import(
    "../../public/src/engines/canvas2d-core/import/protocols/canonicalFragmentCopy.js"
  );

  const {
    buildCanonicalFragmentCopyPayloadFromItems,
    hasCanonicalFragmentCopyData,
    CANONICAL_FRAGMENT_COPY_KIND,
    CANONICAL_FRAGMENT_COPY_VERSION,
  } = protocolModule;

  const items = [
    {
      id: "text-1",
      type: "text",
      plainText: "[ ] Item A",
      structuredImport: {
        kind: "structured-import-v1",
        sourceNodeType: "taskList",
        canonicalFragment: {
          type: "taskList",
          attrs: { role: "taskList" },
          items: [{ kind: "taskItem", checked: false, plainText: "Item A", childItems: [] }],
        },
        sourceMeta: {
          descriptorId: "descriptor-text-1",
          parserId: "markdown-parser",
        },
      },
    },
    {
      id: "file-1",
      type: "fileCard",
      fileName: "report.pdf",
      structuredImport: {
        kind: "structured-import-v1",
        sourceNodeType: "fileCard",
        compatibilityFragment: {
          adapterType: "fileCard",
          originId: "descriptor-file-1-file-0",
          sourcePath: "D:\\docs\\report.pdf",
        },
        sourceMeta: {
          descriptorId: "descriptor-file-1",
          parserId: "file-resource-compatibility-adapter",
        },
      },
    },
    {
      id: "flow-1",
      type: "flowNode",
      plainText: "Flow node",
      legacyCompatibility: {
        kind: "legacy-compatibility-v1",
        legacyType: "flowNode",
        adapterType: "native-items",
        sourceMeta: {
          descriptorId: "descriptor-native-1",
          parserId: "internal-legacy-compatibility-parser",
        },
      },
    },
  ];

  assert(hasCanonicalFragmentCopyData(items) === true, "canonical fragment copy presence mismatch");

  const payload = buildCanonicalFragmentCopyPayloadFromItems(items, {
    source: "canvas",
    createdAt: 123,
  });

  assert(payload.kind === CANONICAL_FRAGMENT_COPY_KIND, "copy payload kind mismatch");
  assert(payload.version === CANONICAL_FRAGMENT_COPY_VERSION, "copy payload version mismatch");
  assert(payload.createdAt === 123, "copy payload createdAt mismatch");
  assert(payload.nativeItems.length === 3, "copy payload native item count mismatch");
  assert(payload.fragments.length === 3, "copy payload fragment count mismatch");
  assert(payload.stats.canonicalFragmentCount === 1, "canonical fragment count mismatch");
  assert(payload.stats.compatibilityFragmentCount === 1, "compatibility fragment count mismatch");
  assert(payload.stats.legacyCompatibilityCount === 1, "legacy compatibility fragment count mismatch");
  assert(payload.summary.itemTypes.text === 1, "item type summary mismatch");
  assert(payload.summary.fragmentKinds.canonical === 1, "fragment kind summary mismatch");

  console.log("[canonical-fragment-copy] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[canonical-fragment-copy] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
