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
    "../../public/src/engines/canvas2d-core/import/parsers/html/htmlParser.js"
  );
  const runnerModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/parserRunner.js"
  );

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createParserRegistry } = registryModule;
  const { createFallbackStrategyManager } = fallbackModule;
  const { createDiagnosticsModel } = diagnosticsModule;
  const { createHtmlParser, HTML_PARSER_ID } = parserModule;
  const { runImportParsePipeline } = runnerModule;

  const registry = createParserRegistry();
  registry.registerParser(createHtmlParser());

  const descriptor = createInputDescriptor({
    descriptorId: "descriptor-html-1",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.HTML,
    entries: [
      {
        entryId: "entry-html",
        kind: "html",
        mimeType: "text/html",
        raw: {
          html: "<h2>Title</h2><p>Hello <strong>world</strong><br><a href=\"https://example.com\">link</a></p><ul><li>One</li><li><input type=\"checkbox\" checked>Task</li></ul>",
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

  assert(pipeline.parseResult.ok === true, "html parse should succeed");
  assert(pipeline.parseResult.parserId === HTML_PARSER_ID, "html parser id mismatch");
  assert(pipeline.parseResult.result.document.content[0].type === "heading", "heading mapping mismatch");
  assert(pipeline.parseResult.result.document.content[1].type === "paragraph", "paragraph mapping mismatch");
  assert(pipeline.parseResult.result.document.content[2].type === "taskList", "task list mapping mismatch");
  assert(pipeline.diagnostics.score >= 90, "html diagnostics score should be high");

  const richDescriptor = createInputDescriptor({
    descriptorId: "descriptor-html-2",
    channel: INPUT_CHANNELS.DRAG_DROP,
    sourceKind: INPUT_SOURCE_KINDS.HTML,
    entries: [
      {
        entryId: "entry-rich-html",
        kind: "html",
        mimeType: "text/html",
        raw: {
          html: "<blockquote><p>Quoted</p></blockquote><pre><code class=\"language-js\">const x = 1;\\nconsole.log(x);</code></pre><table><tr><th>Name</th><th>Value</th></tr><tr><td align=\"right\">A</td><td>1</td></tr></table><img src=\"https://example.com/a.png\" alt=\"demo\">",
        },
      },
    ],
  });

  const richResult = await registry.parseDescriptor(richDescriptor);
  assert(richResult.ok === true, "rich html parse should succeed");
  const nodes = richResult.result.document.content;
  assert(nodes.some((node) => node.type === "blockquote"), "blockquote should exist");
  assert(nodes.some((node) => node.type === "codeBlock"), "codeBlock should exist");
  assert(nodes.some((node) => node.type === "table"), "table should exist");
  assert(nodes.some((node) => node.type === "image"), "image should exist");

  const codeBlock = nodes.find((node) => node.type === "codeBlock");
  assert(codeBlock.attrs.language === "js", "code block language mismatch");

  console.log("[html-parser] ok: 2 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[html-parser] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
