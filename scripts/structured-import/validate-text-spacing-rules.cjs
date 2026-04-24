"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const MEASURE_LAYOUT_FILE = path.join(
  ROOT,
  "public",
  "src",
  "engines",
  "canvas2d-core",
  "textLayout",
  "measureTextElementLayout.js"
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertRegex(source, regex, message) {
  assert(regex.test(source), message);
}

async function main() {
  const sharedUtilsModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/text/sharedTextRenderUtils.js"
  );
  const rendererTextModule = await import(
    "../../public/src/engines/canvas2d-core/rendererText.js"
  );

  const { inferHeadingFontSize } = sharedUtilsModule;
  const { TEXT_LINE_HEIGHT_RATIO, FLOW_NODE_TEXT_LAYOUT } = rendererTextModule;

  const bodyLineHeight = Number(TEXT_LINE_HEIGHT_RATIO);
  const flowNodeLineHeight = Number(FLOW_NODE_TEXT_LAYOUT?.lineHeightRatio);
  assert(Number.isFinite(bodyLineHeight), "body line-height ratio should be finite");
  assert(bodyLineHeight >= 1.2, "body line-height ratio should be >= 1.2");
  assert(Number.isFinite(flowNodeLineHeight), "flow node line-height ratio should be finite");
  assert(flowNodeLineHeight >= bodyLineHeight, "flow node line-height should not be smaller than body");

  const headingSizes = [1, 2, 3, 4, 5, 6].map((level) => inferHeadingFontSize(level));
  const expectedSizes = [36, 30, 26, 22, 20, 18];
  expectedSizes.forEach((size, index) => {
    assert(
      headingSizes[index] === size,
      `heading size map mismatch at h${index + 1}: expected ${size}, got ${headingSizes[index]}`
    );
  });
  for (let index = 1; index < headingSizes.length; index += 1) {
    assert(
      headingSizes[index] <= headingSizes[index - 1],
      `heading sizes should be non-increasing at h${index + 1}`
    );
  }

  const source = fs.readFileSync(MEASURE_LAYOUT_FILE, "utf8");
  assertRegex(
    source,
    /const\s+BODY_LINE_HEIGHT_RATIO\s*=\s*TEXT_BODY_LINE_HEIGHT_RATIO\s*;/,
    "measurement body line-height token should come from shared typography tokens"
  );
  assertRegex(
    source,
    /TEXT_BLOCK_SPACING_EM/,
    "shared block spacing tokens should be imported"
  );
  assertRegex(
    source,
    /getBlockSpacingEmForTag|getLineHeightRatioForTag/,
    "measurement should reuse shared typography helpers"
  );

  // paragraph/list/blockquote/code/table spacing presence in measurement markup.
  assertRegex(source, /node\.querySelectorAll\("p"\)/, "paragraph selector should be normalized");
  assertRegex(
    source,
    /node\.querySelectorAll\("p"\)[\s\S]*?marginTop\s*=\s*"0"[\s\S]*?marginBottom\s*=\s*`\$\{spacing\}em`/,
    "paragraph spacing should match overlay bottom-spacing behavior"
  );
  assertRegex(
    source,
    /node\.querySelectorAll\("ul, ol"\)[\s\S]*?paddingInlineStart\s*=\s*"1\.25em"/,
    "list blocks should define paddingInlineStart spacing"
  );
  assertRegex(
    source,
    /node\.querySelectorAll\("li"\)[\s\S]*?isLastInList[\s\S]*?marginBottom\s*=\s*isLastInList\s*\?\s*"0"\s*:\s*`\$\{TEXT_BLOCK_SPACING_EM\.listItem\}em`[\s\S]*?padding\s*=\s*"0"/,
    "list item spacing should match overlay last-item collapsing"
  );
  assertRegex(
    source,
    /node\.querySelectorAll\("blockquote"\)[\s\S]*?marginTop\s*=\s*`\$\{spacing\}em`[\s\S]*?marginBottom\s*=\s*`\$\{spacing\}em`[\s\S]*?paddingInlineStart\s*=\s*"0\.9em"/,
    "blockquote spacing normalization should exist"
  );
  assertRegex(
    source,
    /node\.querySelectorAll\("pre"\)[\s\S]*?marginTop\s*=\s*`\$\{spacing\}em`[\s\S]*?marginBottom\s*=\s*`\$\{spacing\}em`[\s\S]*?element\.style\.padding\s*=\s*"0\.6em 0\.8em"/,
    "code block spacing normalization should exist"
  );
  assertRegex(
    source,
    /node\.querySelectorAll\("h1, h2, h3, h4, h5, h6"\)[\s\S]*?element\.style\.lineHeight\s*=\s*String\(getLineHeightRatioForTag\(tag\)\)/,
    "heading line-height mapping should come from shared token helper"
  );
  assertRegex(
    source,
    /node\.querySelectorAll\("table"\)[\s\S]*?marginTop\s*=\s*`\$\{spacing\}em`[\s\S]*?marginBottom\s*=\s*`\$\{spacing\}em`/,
    "table block spacing should use SEMANTIC_BLOCK_SPACING_EM"
  );
  assertRegex(
    source,
    /node\.querySelectorAll\("td, th"\)[\s\S]*?element\.style\.padding\s*=\s*"0\.38em 0\.5em"/,
    "table cell spacing normalization should exist"
  );

  console.log("[text-spacing-rules] ok: 17 spacing assertions validated");
}

main().catch((error) => {
  console.error("[text-spacing-rules] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
