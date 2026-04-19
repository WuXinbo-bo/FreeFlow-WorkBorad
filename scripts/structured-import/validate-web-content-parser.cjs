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
  const htmlParserModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/html/htmlParser.js"
  );
  const webParserModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/webContent/webContentParser.js"
  );
  const runnerModule = await import(
    "../../public/src/engines/canvas2d-core/import/parsers/parserRunner.js"
  );

  const { createInputDescriptor, INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createParserRegistry } = registryModule;
  const { createFallbackStrategyManager } = fallbackModule;
  const { createDiagnosticsModel } = diagnosticsModule;
  const { createHtmlParser } = htmlParserModule;
  const { createWebContentParser, WEB_CONTENT_PARSER_ID } = webParserModule;
  const { runImportParsePipeline } = runnerModule;

  const registry = createParserRegistry();
  registry.registerParser(createHtmlParser({ priority: 25 }));
  registry.registerParser(createWebContentParser({ priority: 40 }));

  const descriptor = createInputDescriptor({
    descriptorId: "descriptor-web-1",
    channel: INPUT_CHANNELS.PASTE_NATIVE,
    sourceKind: INPUT_SOURCE_KINDS.HTML,
    sourceUrl: "https://example.com/article/1",
    entries: [
      {
        entryId: "entry-web-html",
        kind: "html",
        mimeType: "text/html",
        raw: {
          html: "<div class=\"page\"><nav>site nav</nav><article class=\"article-body\"><h1>Real Title</h1><p>First body paragraph.</p><p>Second body paragraph with <a href=\"https://example.com\">link</a>.</p></article><aside>related links</aside></div>",
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

  assert(pipeline.parseResult.ok === true, "web content parse should succeed");
  assert(pipeline.parseResult.parserId === WEB_CONTENT_PARSER_ID, "web content parser id mismatch");
  const blocks = pipeline.parseResult.result.document.content;
  assert(blocks[0].type === "heading", "extracted article heading mismatch");
  assert(blocks.some((node) => node.type === "paragraph"), "extracted article paragraph missing");
  const serializedText = JSON.stringify(blocks);
  assert(!/related links/i.test(serializedText), "noise sidebar should be removed");
  assert(pipeline.parseResult.result.stats.extractedEntryCount === 1, "extraction count mismatch");

  const weakDescriptor = createInputDescriptor({
    descriptorId: "descriptor-web-2",
    channel: INPUT_CHANNELS.DRAG_DROP,
    sourceKind: INPUT_SOURCE_KINDS.HTML,
    entries: [
      {
        entryId: "entry-weak-html",
        kind: "html",
        mimeType: "text/html",
        raw: {
          html: "<div><span>short</span></div><div><p>Fallback paragraph without strong article signal but enough text to remain parseable.</p></div>",
        },
      },
    ],
  });

  const weakResult = await registry.parseDescriptor(weakDescriptor);
  assert(weakResult.ok === true, "weak web html parse should still succeed");
  assert(weakResult.parserId === WEB_CONTENT_PARSER_ID, "web parser should still handle weak input by internal fallback");
  assert(weakResult.result.stats.fallbackToGenericHtml === 1, "generic html fallback stat mismatch");

  console.log("[web-content-parser] ok: 2 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[web-content-parser] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
