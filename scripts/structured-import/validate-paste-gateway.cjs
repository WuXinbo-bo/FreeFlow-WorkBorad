"use strict";

async function main() {
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");
  const gatewayModule = await import("../../public/src/engines/canvas2d-core/import/gateway/pasteGateway.js");
  const { INPUT_CHANNELS, INPUT_SOURCE_KINDS } = protocol;
  const { createPasteGateway, DEFAULT_INTERNAL_CLIPBOARD_MIME } = gatewayModule;

  const gateway = createPasteGateway({
    createDescriptorId(prefix) {
      return `${prefix}-fixed-id`;
    },
  });

  const descriptorFromClipboardData = gateway.fromClipboardData(
    createClipboardDataMock({
      "text/plain": "const answer = 42;",
      "text/html": "<pre><code>const answer = 42;</code></pre>",
      [DEFAULT_INTERNAL_CLIPBOARD_MIME]: JSON.stringify({ type: "canvas2d", itemCount: 2 }),
    }),
    {
      origin: "canvas",
      boardId: "board-1",
      pointer: { x: 120, y: 80 },
    }
  );

  assert(descriptorFromClipboardData.channel === INPUT_CHANNELS.PASTE_NATIVE, "clipboardData channel mismatch");
  assert(descriptorFromClipboardData.sourceKind === INPUT_SOURCE_KINDS.MIXED, "clipboardData sourceKind mismatch");
  assert(descriptorFromClipboardData.entries.length === 3, "clipboardData entries mismatch");

  const descriptorFromSnapshot = gateway.fromSystemClipboardSnapshot(
    {
      text: "# Title",
      markdown: "# Title",
      filePaths: ["D:\\tmp\\note.md"],
      sourceApp: "DesktopShell",
    },
    {
      channel: INPUT_CHANNELS.PASTE_CONTEXT_MENU,
      origin: "context-menu",
    }
  );

  assert(
    descriptorFromSnapshot.channel === INPUT_CHANNELS.PASTE_CONTEXT_MENU,
    "snapshot channel mismatch"
  );
  assert(descriptorFromSnapshot.entries.length === 3, "snapshot entries mismatch");

  const descriptorFromMissingClipboard = gateway.fromClipboardData(null, {});
  assert(descriptorFromMissingClipboard.status === "error", "missing clipboard should be error");

  const descriptorFromPlainMarkdown = gateway.fromClipboardData(
    createClipboardDataMock({
      "text/plain": [
        "# 一级标题",
        "",
        "- [x] 已完成",
        "- [ ] 待处理",
        "",
        "| a | b |",
        "| - | - |",
        "| 1 | 2 |",
        "",
        "$$E=mc^2$$",
      ].join("\n"),
    }),
    {
      origin: "canvas",
      boardId: "board-markdown",
      pointer: { x: 20, y: 30 },
    }
  );
  assert(descriptorFromPlainMarkdown.sourceKind === INPUT_SOURCE_KINDS.MARKDOWN, "plain markdown sourceKind mismatch");
  assert(descriptorFromPlainMarkdown.entries.length === 1, "plain markdown entries mismatch");
  assert(descriptorFromPlainMarkdown.entries[0].kind === "markdown", "plain markdown entry kind mismatch");

  const descriptorFromPlainCode = gateway.fromClipboardData(
    createClipboardDataMock({
      "text/plain": [
        "'''js",
        "function sum(a, b) {",
        "  const total = a + b;",
        "  return total;",
        "}",
        "'''",
      ].join("\n"),
    }),
    {
      origin: "canvas",
      boardId: "board-code",
      pointer: { x: 40, y: 60 },
    }
  );
  assert(descriptorFromPlainCode.sourceKind === INPUT_SOURCE_KINDS.MARKDOWN, "plain code sourceKind mismatch");
  assert(descriptorFromPlainCode.entries[0].kind === "markdown", "plain code entry kind mismatch");
  assert(
    /^```/.test(String(descriptorFromPlainCode.entries[0]?.raw?.markdown || "")),
    "plain code should be wrapped as fenced markdown by default"
  );

  const descriptorFromPlainMath = gateway.fromClipboardData(
    createClipboardDataMock({
      "text/plain": "$E = mc^2$",
    }),
    {
      origin: "canvas",
      boardId: "board-math",
      pointer: { x: 50, y: 70 },
    }
  );
  assert(descriptorFromPlainMath.sourceKind === INPUT_SOURCE_KINDS.MARKDOWN, "plain math sourceKind mismatch");
  assert(descriptorFromPlainMath.entries[0].kind === "markdown", "plain math entry kind mismatch");

  console.log("[paste-gateway] ok: 6 scenarios validated");
}

function createClipboardDataMock(dataMap) {
  const map = { ...(dataMap || {}) };
  return {
    types: Object.keys(map),
    files: [],
    getData(type) {
      return map[type] || "";
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[paste-gateway] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
