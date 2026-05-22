"use strict";

async function main() {
  const rendererTextModule = await import(
    "../../public/src/engines/canvas2d-core/rendererText.js"
  );

  const { resolveRichTextDisplayHtml } = rendererTextModule;

  const inlineHtml = '<p>公式 <span data-role="math-inline">E=mc^2</span> 正文</p>';
  const inlineRendered = resolveRichTextDisplayHtml({
    text: "公式 E=mc^2 正文",
    html: inlineHtml,
    linkTokens: [],
  });
  assert(/class="katex"/.test(inlineRendered), "inline math should render through KaTeX");
  assert(!inlineRendered.includes('data-role="math-inline"'), "inline math placeholder should be replaced");

  const blockHtml = '<div data-role="math-block">\\int_0^1 x^2 \\, dx</div>';
  const blockRendered = resolveRichTextDisplayHtml({
    text: "\\int_0^1 x^2 \\, dx",
    html: blockHtml,
    linkTokens: [],
  });
  assert(/class="katex-display"/.test(blockRendered), "math block should render through KaTeX display mode");

  console.log("[renderer-text-math-display] ok: 2 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[renderer-text-math-display] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
