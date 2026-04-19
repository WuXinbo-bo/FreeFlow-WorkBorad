const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const [
    { createPlainTextParser },
    { createHtmlParser },
    { createMarkdownParser },
    { createCodeParser },
    { createTableRenderer },
    { createCanonicalDocument, createCanonicalNode },
  ] = await Promise.all([
    import("../../public/src/engines/canvas2d-core/import/parsers/plainText/plainTextParser.js"),
    import("../../public/src/engines/canvas2d-core/import/parsers/html/htmlParser.js"),
    import("../../public/src/engines/canvas2d-core/import/parsers/markdown/markdownParser.js"),
    import("../../public/src/engines/canvas2d-core/import/parsers/code/codeParser.js"),
    import("../../public/src/engines/canvas2d-core/import/renderers/table/tableRenderer.js"),
    import("../../public/src/engines/canvas2d-core/import/canonical/canonicalDocument.js"),
  ]);

  const fixturesDir = path.join(ROOT, "docs", "test", "structured-import-fixtures", "samples");
  const htmlFixture = fs.readFileSync(path.join(fixturesDir, "html", "HT-001-rich-inline-and-list.html"), "utf8");
  const markdownFixture = fs.readFileSync(path.join(fixturesDir, "markdown", "MD-001-gfm-task-table-footnote.md"), "utf8");
  const codeFixture = fs.readFileSync(path.join(fixturesDir, "code", "CD-001-python-snippet.txt"), "utf8");
  const textFixture = fs.readFileSync(path.join(fixturesDir, "plain-text", "PT-001-basic-paragraphs.txt"), "utf8");

  const htmlParser = createHtmlParser();
  const markdownParser = createMarkdownParser();
  const codeParser = createCodeParser();
  const textParser = createPlainTextParser();
  const tableRenderer = createTableRenderer();

  const thresholds = {
    htmlMs: 220,
    markdownMs: 220,
    codeMs: 120,
    textMs: 80,
    tableRendererMs: 140,
  };

  const htmlSample = `<section>${repeatWithJoin(htmlFixture, 14, "\n")}</section>`;
  const markdownSample = repeatWithJoin(markdownFixture, 18, "\n\n");
  const codeSample = repeatWithJoin(codeFixture, 20, "\n\n");
  const textSample = repeatWithJoin(textFixture, 24, "\n\n");

  const htmlResult = await benchmarkAsync(() => htmlParser.parse({
    descriptor: buildDescriptor({
      descriptorId: "perf-html",
      channel: "programmatic",
      sourceKind: "html",
      entries: [{ kind: "html", raw: { html: htmlSample } }],
    }),
  }), 8);

  const markdownResult = await benchmarkAsync(() => markdownParser.parse({
    descriptor: buildDescriptor({
      descriptorId: "perf-markdown",
      channel: "programmatic",
      sourceKind: "markdown",
      entries: [{ kind: "markdown", raw: { markdown: markdownSample } }],
    }),
  }), 8);

  const codeResult = await benchmarkAsync(() => codeParser.parse({
    descriptor: buildDescriptor({
      descriptorId: "perf-code",
      channel: "programmatic",
      sourceKind: "code",
      entries: [{ kind: "code", raw: { code: codeSample }, meta: { language: "python" } }],
    }),
  }), 8);

  const textResult = await benchmarkAsync(() => textParser.parse({
    descriptor: buildDescriptor({
      descriptorId: "perf-text",
      channel: "programmatic",
      sourceKind: "plain-text",
      entries: [{ kind: "text", raw: { text: textSample } }],
    }),
  }), 8);

  const tableDocument = createCanonicalDocument({
    meta: {
      source: { kind: "markdown", channel: "programmatic", parserId: "perf", descriptorId: "perf-table" },
      compat: { minReaderVersion: "1.0.0", featureFlags: [], legacyAliases: [] },
      tags: ["perf"],
      labels: [],
    },
    content: [
      createCanonicalNode({
        type: "table",
        attrs: { columns: 8 },
        content: Array.from({ length: 60 }, (_, rowIndex) =>
          createCanonicalNode({
            type: "tableRow",
            content: Array.from({ length: 8 }, (_, cellIndex) =>
              createCanonicalNode({
                type: "tableCell",
                attrs: { header: rowIndex === 0, align: cellIndex % 2 === 0 ? "left" : "center" },
                content: [
                  createCanonicalNode({
                    type: "paragraph",
                    content: [
                      createCanonicalNode({
                        type: "text",
                        text: `R${rowIndex + 1}C${cellIndex + 1} sample value`,
                      }),
                    ],
                  }),
                ],
              })
            ),
          })
        ),
      }),
    ],
  });

  const tableRendererResult = await benchmarkAsync(() => tableRenderer.render({
    input: {
      kind: "canonical-document",
      document: tableDocument,
    },
  }), 8);

  assertThreshold("htmlMs", htmlResult.averageMs, thresholds.htmlMs);
  assertThreshold("markdownMs", markdownResult.averageMs, thresholds.markdownMs);
  assertThreshold("codeMs", codeResult.averageMs, thresholds.codeMs);
  assertThreshold("textMs", textResult.averageMs, thresholds.textMs);
  assertThreshold("tableRendererMs", tableRendererResult.averageMs, thresholds.tableRendererMs);

  console.log("[performance-thresholds] ok: 5 benchmarks validated");
  printResult("html", htmlResult, thresholds.htmlMs);
  printResult("markdown", markdownResult, thresholds.markdownMs);
  printResult("code", codeResult, thresholds.codeMs);
  printResult("text", textResult, thresholds.textMs);
  printResult("table-renderer", tableRendererResult, thresholds.tableRendererMs);
}

function buildDescriptor({ descriptorId, channel, sourceKind, entries }) {
  return {
    descriptorId,
    channel,
    sourceKind,
    status: "ready",
    entries,
  };
}

function repeatWithJoin(value, count, separator) {
  return Array.from({ length: count }, () => String(value || "")).join(separator);
}

async function benchmarkAsync(fn, iterations) {
  const timings = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    timings.push(end - start);
  }
  const averageMs = timings.reduce((sum, value) => sum + value, 0) / Math.max(1, timings.length);
  const maxMs = Math.max(...timings);
  return {
    iterations,
    averageMs: round(averageMs),
    maxMs: round(maxMs),
  };
}

function assertThreshold(label, value, threshold) {
  if (value > threshold) {
    throw new Error(`${label} exceeded threshold: ${value}ms > ${threshold}ms`);
  }
}

function printResult(label, result, threshold) {
  console.log(`- ${label}: avg ${result.averageMs}ms, max ${result.maxMs}ms, threshold ${threshold}ms`);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
