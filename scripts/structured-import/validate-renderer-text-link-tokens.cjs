const assert = require("node:assert/strict");

async function main() {
  const { buildLinkStyledHtmlFromTokens, resolveRichTextDisplayHtml } = await import(
    "../../public/src/engines/canvas2d-core/rendererText.js"
  );
  const { TEXT_LINK_FETCH_STATES, normalizeTextLinkFetchState } = await import(
    "../../public/src/engines/canvas2d-core/textModel/richTextDocument.js"
  );

  const source = "访问 https://example.com/docs 获取文档";
  const html = buildLinkStyledHtmlFromTokens(source, [
    {
      url: "https://example.com/docs",
      rangeStart: 3,
      rangeEnd: 27,
      kindHint: "preview-candidate",
      fetchState: "ready",
    },
  ]);

  assert.ok(html.includes('data-link-token="1"'), "missing link token marker");
  assert.ok(html.includes("https://example.com/docs"), "missing url");
  assert.ok(html.includes("访问 "), "plain text prefix should be preserved");
  assert.ok(html.includes(" 获取文档"), "plain text suffix should be preserved");
  assert.ok(html.includes('data-link-state="ready"'), "link fetchState marker should be preserved");

  const invalid = buildLinkStyledHtmlFromTokens(source, [
    { url: "https://example.com/docs", rangeStart: -3, rangeEnd: 0 },
  ]);
  assert.equal(invalid, "", "invalid range should be ignored");

  for (const state of TEXT_LINK_FETCH_STATES) {
    const htmlByState = buildLinkStyledHtmlFromTokens(source, [
      {
        url: "https://example.com/docs",
        rangeStart: 3,
        rangeEnd: 27,
        kindHint: "preview-candidate",
        fetchState: normalizeTextLinkFetchState(state),
      },
    ]);
    assert.ok(
      htmlByState.includes(`data-link-state="${state}"`),
      `fetchState should be enum-consistent: ${state}`
    );
  }

  const nonEnumState = normalizeTextLinkFetchState("not-a-state");
  assert.equal(nonEnumState, "", "non-enum state should normalize to empty");
  const fallbackHtml = buildLinkStyledHtmlFromTokens(source, [
    {
      url: "https://example.com/docs",
      rangeStart: 3,
      rangeEnd: 27,
      kindHint: "preview-candidate",
      fetchState: nonEnumState,
    },
  ]);
  assert.ok(fallbackHtml.includes('data-link-state="unknown"'), "empty fetchState should fallback to unknown marker");

  const displayHtml = resolveRichTextDisplayHtml({
    text: source,
    html: "<p>访问 https://example.com/docs 获取文档</p>",
    linkTokens: [
      {
        url: "https://example.com/docs",
        rangeStart: 3,
        rangeEnd: 27,
        kindHint: "preview-candidate",
        fetchState: "ready",
      },
    ],
  });
  assert.ok(displayHtml.includes("访问 https://example.com/docs 获取文档"), "display html should preserve original content");
  if (typeof document !== "undefined") {
    assert.ok(displayHtml.includes('data-link-token="1"'), "display html should still inject link markers into preserved html");
  }
  assert.ok(
    !displayHtml.startsWith("<p><a") || displayHtml.includes("访问 "),
    "display html should not flatten structured html into a links-only paragraph"
  );

  const preservedAnchorHtml = resolveRichTextDisplayHtml({
    text: source,
    html: '<p>访问 <a href="https://example.com/docs">https://example.com/docs</a> 获取文档</p>',
    linkTokens: [
      {
        url: "https://example.com/docs",
        rangeStart: 3,
        rangeEnd: 27,
      },
    ],
  });
  assert.ok(
    preservedAnchorHtml.includes("<a href=\"https://example.com/docs\">"),
    "existing anchor markup should be preserved"
  );

  const structuredHtml = resolveRichTextDisplayHtml({
    text: "标题\n访问 https://example.com/docs\n结尾",
    html: "<h2>标题</h2><p>访问 https://example.com/docs</p><p>结尾</p>",
    linkTokens: [
      {
        url: "https://example.com/docs",
        rangeStart: 3,
        rangeEnd: 27,
        kindHint: "preview-candidate",
        fetchState: "ready",
      },
    ],
  });
  assert.ok(structuredHtml.includes("<h2>标题</h2>"), "structured rich html should remain intact");
  assert.ok(structuredHtml.includes("<p>结尾</p>"), "subsequent blocks should remain intact");
  if (typeof document !== "undefined") {
    assert.ok(structuredHtml.includes('data-link-token="1"'), "structured rich html should materialize link token anchor");
  }

  console.log("[renderer-text-link-tokens] ok: 7 scenarios validated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
