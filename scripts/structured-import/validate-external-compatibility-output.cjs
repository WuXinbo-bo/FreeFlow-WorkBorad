"use strict";

async function main() {
  const protocolModule = await import(
    "../../public/src/engines/canvas2d-core/import/protocols/externalCompatibilityOutput.js"
  );

  const {
    buildExternalCompatibilityOutputFromItems,
    extractExternalFilePaths,
    EXTERNAL_COMPATIBILITY_OUTPUT_KIND,
    EXTERNAL_COMPATIBILITY_OUTPUT_VERSION,
  } = protocolModule;

  const items = [
    {
      id: "text-1",
      type: "text",
      plainText: "Alpha",
      html: "<p>Alpha</p>",
      structuredImport: {
        canonicalFragment: {
          type: "paragraph",
          plainText: "Alpha",
        },
        sourceMeta: {
          descriptorId: "descriptor-text-1",
        },
      },
    },
    {
      id: "image-1",
      type: "image",
      sourcePath: "D:\\assets\\diagram.png",
      structuredImport: {
        canonicalFragment: {
          type: "image",
          attrs: {
            src: "D:\\assets\\diagram.png",
            title: "diagram.png",
          },
        },
      },
    },
    {
      id: "file-1",
      type: "fileCard",
      fileName: "report.pdf",
      sourcePath: "D:\\docs\\report.pdf",
      structuredImport: {
        compatibilityFragment: {
          sourcePath: "D:\\docs\\report.pdf",
        },
      },
    },
  ];

  const filePaths = extractExternalFilePaths(items);
  assert(filePaths.length === 2, "external file path count mismatch");

  const output = buildExternalCompatibilityOutputFromItems(items, {
    source: "canvas",
    createdAt: 789,
  });

  assert(output.kind === EXTERNAL_COMPATIBILITY_OUTPUT_KIND, "external output kind mismatch");
  assert(output.version === EXTERNAL_COMPATIBILITY_OUTPUT_VERSION, "external output version mismatch");
  assert(output.createdAt === 789, "external output createdAt mismatch");
  assert(output.text.includes("Alpha"), "external output text mismatch");
  assert(output.html.includes("<p>Alpha</p>"), "external output html mismatch");
  assert(output.filePaths.length === 2, "external output file path mismatch");
  assert(output.canonicalCopy.kind === "structured-canonical-copy", "external canonical copy mismatch");
  assert(output.downgradedCopy.kind === "structured-copy-downgrade", "external downgraded copy mismatch");

  console.log("[external-compatibility-output] ok: 1 scenario validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[external-compatibility-output] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
