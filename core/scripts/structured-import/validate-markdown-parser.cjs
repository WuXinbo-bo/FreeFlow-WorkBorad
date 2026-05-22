"use strict";

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const registryModule = await import("../../public/src/engines/canvas2d-core/import/parsers/parserRegistry.js");
  const fallbackModule = await import(
    "../../public/src/engines/canvas2d-core/import/fallbacks/fallbackStrategyManager.js"
  );
  const diagnosticsModule = await import(
    "../../public/src/engines/canvas2d-core/import/diagnostics/diagnosticsModel.js"
  );
  const parserModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/markdown/markdownParser.js"
  );
  const runnerModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/parserRunner.js"
  );

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createParserRegistry } = registryModule;
  const { createFallbackStrategyManager } = fallbackModule;
  const { createDiagnosticsModel } = diagnosticsModule;
  const { createMarkdownParser, MARKDOWN_PARSER_ID } = parserModule;
  const { runImportParsePipeline } = runnerModule;

  const registry = createParserRegistry();
  registry.registerParser(createMarkdownParser());

  const descriptor = createInputDescriptor({
    descriptorId: "descriptor-markdown-1",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.MARKDOWN,
    entries: [
      {
        entryId: "entry-markdown",
        kind: "markdown",
        mimeType: "text/markdown",
        raw: {
          markdown: [
            "# Title",
            "",
            "- [x] Done item",
            "- [ ] Todo item",
            "",
            "| Name | Value |",
            "| :--- | ---: |",
            "| A | 1 |",
            "",
            "```js",
            "console.log('hello');",
            "```",
            "",
            "正文里有一个脚注引用。[^note]",
            "",
            "[^note]: 这是一个 GFM 脚注样本。",
          ].join("\n"),
        },
      },
    ],
  });

  const pipeline = await runImportParsePipeline({
    descriptor,
    registry,
    fallbackManager: createFallbackStrategyManager(),
    diagnosticsModel: createDiagnosticsModel(),
  });

  assert(pipeline.parseResult.ok === true, "markdown parse should succeed");
  assert(pipeline.parseResult.parserId === MARKDOWN_PARSER_ID, "markdown parser id mismatch");
  const nodes = pipeline.parseResult.result.document.content;
  assert(nodes.some((node) => node.type === "heading"), "heading missing");
  assert(nodes.some((node) => node.type === "taskList"), "taskList missing");
  assert(nodes.some((node) => node.type === "table"), "table missing");
  assert(nodes.some((node) => node.type === "codeBlock"), "codeBlock missing");
  assert(nodes.some((node) => node.type === "footnote"), "footnote missing");
  assert(pipeline.diagnostics.score >= 90, "markdown diagnostics score should be high");

  const inlineDescriptor = createInputDescriptor({
    descriptorId: "descriptor-markdown-2",
    channel: INPUT_CHANNELS.PASTE_CONTEXT_MENU,
    sourceKind: INPUT_SOURCE_KINDS.MARKDOWN,
    entries: [
      {
        entryId: "entry-markdown-inline",
        kind: "markdown",
        mimeType: "text/markdown",
        raw: {
          markdown: "公式：$E = mc^2$，并且有 **bold**、*italic*、~~strike~~、`code`、[link](https://example.com)。",
        },
      },
    ],
  });

  const inlineResult = await registry.parseDescriptor(inlineDescriptor);
  assert(inlineResult.ok === true, "inline markdown parse should succeed");
  const paragraph = inlineResult.result.document.content[0];
  assert(paragraph.type === "paragraph", "inline markdown should map to paragraph");
  assert(paragraph.content.some((node) => node.type === "mathInline"), "mathInline missing");
  assert(paragraph.content.some((node) => node.type === "inlineCode"), "inlineCode missing");
  assert(paragraph.content.some((node) => node.type === "link"), "link missing");
  assert(paragraph.content.some((node) => node.type === "text" && Array.isArray(node.marks) && node.marks.some((mark) => mark.type === "bold")), "bold mark missing");

  console.log("[markdown-parser] ok: 2 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[markdown-parser] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
