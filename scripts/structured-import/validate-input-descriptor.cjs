"use strict";

function buildSamples(protocol) {
  const {
    INPUT_CHANNELS,
    INPUT_DESCRIPTOR_STATUS,
    INPUT_ENTRY_KINDS,
    INPUT_ERROR_CODES,
    INPUT_SOURCE_KINDS,
    createInputDescriptor,
  } = protocol;
  return [
    createInputDescriptor({
      descriptorId: "sample-html-001",
      channel: INPUT_CHANNELS.PASTE_NATIVE,
      sourceKind: INPUT_SOURCE_KINDS.HTML,
      status: INPUT_DESCRIPTOR_STATUS.READY,
      mimeTypes: ["text/html", "text/plain"],
      sourceApp: "Browser",
      sourceUrl: "https://example.com/article",
      entries: [
        {
          entryId: "html-entry",
          kind: INPUT_ENTRY_KINDS.HTML,
          mimeType: "text/html",
          raw: {
            html: "<h1>Hello</h1><p>world</p>",
            text: "Hello world",
          },
          meta: {
            title: "Example Article",
            displayName: "HTML fragment",
          },
        },
      ],
    }),
    createInputDescriptor({
      descriptorId: "sample-markdown-001",
      channel: INPUT_CHANNELS.PASTE_CONTEXT_MENU,
      sourceKind: INPUT_SOURCE_KINDS.MARKDOWN,
      status: INPUT_DESCRIPTOR_STATUS.READY,
      mimeTypes: ["text/markdown"],
      entries: [
        {
          entryId: "md-entry",
          kind: INPUT_ENTRY_KINDS.MARKDOWN,
          mimeType: "text/markdown",
          raw: {
            markdown: "# Title\n- [x] Done",
          },
        },
      ],
    }),
    createInputDescriptor({
      descriptorId: "sample-file-001",
      channel: INPUT_CHANNELS.DRAG_DROP,
      sourceKind: INPUT_SOURCE_KINDS.FILE_RESOURCE,
      status: INPUT_DESCRIPTOR_STATUS.PARTIAL,
      errorCode: INPUT_ERROR_CODES.FILE_ACCESS_FAILED,
      mimeTypes: ["application/pdf"],
      sourceFilePath: "D:\\example\\file.pdf",
      entries: [
        {
          entryId: "file-entry",
          kind: INPUT_ENTRY_KINDS.FILE,
          status: INPUT_DESCRIPTOR_STATUS.PARTIAL,
          errorCode: INPUT_ERROR_CODES.FILE_ACCESS_FAILED,
          mimeType: "application/pdf",
          raw: {
            filePath: "D:\\example\\file.pdf",
          },
          meta: {
            extension: ".pdf",
            displayName: "file.pdf",
          },
        },
      ],
    }),
  ];
}

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const { validateInputDescriptor } = protocol;
  const samples = buildSamples(protocol);
  let failed = false;
  samples.forEach((sample) => {
    const result = validateInputDescriptor(sample);
    if (!result.ok) {
      failed = true;
      console.error(`[input-descriptor] invalid sample: ${sample.descriptorId}`);
      result.issues.forEach((issue) => console.error(`- ${issue}`));
    }
  });

  if (failed) {
    process.exitCode = 1;
    return;
  }

  console.log(`[input-descriptor] ok: ${samples.length} samples validated`);
}

main().catch((error) => {
  console.error("[input-descriptor] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
