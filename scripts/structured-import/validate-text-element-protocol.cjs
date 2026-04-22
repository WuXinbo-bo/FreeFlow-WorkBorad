"use strict";

async function main() {
  const textModule = await import(
    "../../public/src/engines/canvas2d-core/elements/text.js"
  );
  const bridgeModule = await import(
    "../../public/src/engines/canvas2d-core/import/renderers/text/textElementBridge.js"
  );
  const richTextDocumentModule = await import(
    "../../public/src/engines/canvas2d-core/textModel/richTextDocument.js"
  );

  const {
    normalizeTextElement,
    TEXT_STRUCTURED_IMPORT_KIND,
    TEXT_BOX_LAYOUT_MODE_FIXED_SIZE,
  } = textModule;
  const { buildStructuredTextElementFromRenderOperation } = bridgeModule;
  const { TEXT_LINK_FETCH_STATES } = richTextDocumentModule;

  const normalized = normalizeTextElement({
    text: "Hello",
    html: "<p>Hello</p>",
    structuredImport: {
      blockRole: "paragraph",
      sourceNodeType: "paragraph",
      canonicalFragment: {
        type: "paragraph",
        plainText: "Hello",
      },
      sourceMeta: {
        descriptorId: "descriptor-text-1",
      },
    },
  });

  assert(normalized.structuredImport != null, "structuredImport should be preserved");
  assert(normalized.structuredImport.kind === TEXT_STRUCTURED_IMPORT_KIND, "structuredImport kind mismatch");
  assert(normalized.structuredImport.blockRole === "paragraph", "structuredImport blockRole mismatch");
  assert(normalized.structuredImport.canonicalFragment.type === "paragraph", "canonical fragment mismatch");

  const bridged = buildStructuredTextElementFromRenderOperation({
    type: "render-list-block",
    sourceNodeType: "taskList",
    listRole: "taskList",
    element: {
      id: "text-1",
      type: "text",
      text: "[x] Item",
      plainText: "[x] Item",
      html: "<ul><li>☑ Item</li></ul>",
      title: "Item",
      fontSize: 20,
      color: "#0f172a",
      wrapMode: "manual",
      textResizeMode: "auto-width",
      width: 180,
      height: 56,
      x: 0,
      y: 0,
      locked: false,
    },
    structure: {
      listRole: "taskList",
      items: [
        {
          kind: "taskItem",
          checked: true,
          level: 0,
          plainText: "Item",
          html: "Item",
          childItems: [],
        },
      ],
    },
    meta: {
      descriptorId: "descriptor-text-2",
      parserId: "markdown-parser",
    },
  });

  assert(bridged.type === "text", "bridged text type mismatch");
  assert(bridged.structuredImport != null, "bridged structuredImport missing");
  assert(bridged.structuredImport.listRole === "taskList", "bridged list role mismatch");
  assert(Array.isArray(bridged.structuredImport.canonicalFragment.items), "bridged canonical items missing");
  assert(
    bridged.structuredImport.sourceMeta.parserId === "markdown-parser",
    "bridged source meta parser mismatch"
  );

  const migrated = normalizeTextElement({
    text: "legacy fixed size text that should remain fixed size after normalization",
    plainText: "legacy fixed size text that should remain fixed size after normalization",
    html: "<div>legacy fixed size text that should remain fixed size after normalization</div>",
    textBoxLayoutMode: "fixed-size",
    textResizeMode: "wrap",
    width: 220,
    height: 40,
  });
  assert(
    migrated.textBoxLayoutMode === TEXT_BOX_LAYOUT_MODE_FIXED_SIZE,
    "legacy fixed-size text should preserve fixed-size mode"
  );
  assert(migrated.width >= 220, "normalized fixed-size text width should remain valid");
  assert(migrated.height >= 40, "normalized fixed-size text height should remain valid");

  const docsUrl = "https://example.com/docs";
  const embedUrl = "https://example.com/embed";
  const linkText = `访问 ${docsUrl} 和 ${embedUrl}`;
  const docsStart = linkText.indexOf(docsUrl);
  const embedStart = linkText.indexOf(embedUrl);
  const linked = normalizeTextElement({
    text: linkText,
    plainText: linkText,
    html: `<p>${linkText}</p>`,
    linkTokens: [
      {
        url: docsUrl,
        rangeStart: docsStart,
        rangeEnd: docsStart + docsUrl.length,
        kindHint: "preview-candidate",
        fetchState: "READY",
      },
      {
        url: embedUrl,
        rangeStart: embedStart,
        rangeEnd: embedStart + embedUrl.length,
        kindHint: "embed-candidate",
        fetchState: "invalid-state",
      },
    ],
    urlMetaCache: {
      [docsUrl]: {
        title: "Example Docs",
        description: "Structured import guide",
        siteName: "Example",
        fetchState: "stale",
        status: "ok",
      },
      [embedUrl]: {
        title: "Embed Page",
        fetchState: "BROKEN_STATE",
      },
    },
  });

  assert(Array.isArray(linked.linkTokens), "linkTokens should be normalized");
  assert(linked.linkTokens.length >= 1, "linkTokens should keep valid tokens");
  const allowedStates = new Set(TEXT_LINK_FETCH_STATES);
  linked.linkTokens.forEach((token) => {
    assert(
      token.fetchState === "" || allowedStates.has(token.fetchState),
      `token fetchState should be enum-consistent, got: ${token.fetchState}`
    );
  });

  const metaKeys = Object.keys(linked.urlMetaCache || {});
  assert(metaKeys.includes(docsUrl), "urlMetaCache should preserve docs entry");
  assert(
    linked.urlMetaCache[docsUrl]?.title === "Example Docs",
    "urlMetaCache title should be preserved"
  );
  assert(
    linked.urlMetaCache[docsUrl]?.description === "Structured import guide",
    "urlMetaCache description should be preserved"
  );
  assert(
    linked.richTextDocument?.meta?.urlMetaCache?.[docsUrl]?.siteName === "Example",
    "richTextDocument.meta should preserve urlMetaCache payload"
  );

  console.log("[text-element-protocol] ok: 4 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[text-element-protocol] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
