"use strict";

async function main() {
  const gateway = await import("../../public/src/engines/canvas2d-core/import/gateway/sharedEntryBuilders.js");
  const detector = await import("../../public/src/engines/canvas2d-core/import/gateway/contentTypeDetector.js");
  const protocol = await import("../../public/src/engines/canvas2d-core/import/protocols/inputDescriptor.js");

  const { createEntryFromMimeType, DEFAULT_INTERNAL_CLIPBOARD_MIME } = gateway;
  const { detectTextContentType } = detector;
  const { INPUT_ENTRY_KINDS } = protocol;

  const proseLikeCode = [
    "Please run the following command tomorrow:",
    "node scripts/build.js",
    "Then share the screenshot.",
  ].join("\n");
  const proseDetected = detectTextContentType(proseLikeCode);
  assert(proseDetected.type === "text" || proseDetected.confidence !== "high", "prose-like code false positive");
  const proseEntry = createEntryFromMimeType({
    mimeType: "text/plain",
    value: proseLikeCode,
    entryId: "sample-prose",
    internalClipboardMime: DEFAULT_INTERNAL_CLIPBOARD_MIME,
  });
  assert(proseEntry.kind === INPUT_ENTRY_KINDS.TEXT, "prose-like code should remain text entry");

  const mathLikeProse = "The formula E=mc2 is famous, but this sentence is plain explanation text.";
  const mathLikeDetected = detectTextContentType(mathLikeProse);
  assert(mathLikeDetected.type !== "math" || mathLikeDetected.confidence !== "high", "math-like prose false positive");
  const mathLikeEntry = createEntryFromMimeType({
    mimeType: "text/plain",
    value: mathLikeProse,
    entryId: "sample-math-like",
    internalClipboardMime: DEFAULT_INTERNAL_CLIPBOARD_MIME,
  });
  assert(mathLikeEntry.kind === INPUT_ENTRY_KINDS.TEXT, "math-like prose should remain text entry");

  const weakTable = [
    "name value",
    "alpha 10",
    "beta 20",
  ].join("\n");
  const weakTableDetected = detectTextContentType(weakTable);
  assert(weakTableDetected.type !== "table" || weakTableDetected.confidence === "low", "weak table should not strongly match table");
  const weakTableEntry = createEntryFromMimeType({
    mimeType: "text/plain",
    value: weakTable,
    entryId: "sample-weak-table",
    internalClipboardMime: DEFAULT_INTERNAL_CLIPBOARD_MIME,
  });
  assert(weakTableEntry.kind === INPUT_ENTRY_KINDS.TEXT, "weak table should remain text entry");

  const strongMarkdown = [
    "# Launch Plan",
    "",
    "- [x] parser",
    "- [ ] renderer",
  ].join("\n");
  const strongMarkdownEntry = createEntryFromMimeType({
    mimeType: "text/plain",
    value: strongMarkdown,
    entryId: "sample-strong-markdown",
    internalClipboardMime: DEFAULT_INTERNAL_CLIPBOARD_MIME,
  });
  assert(strongMarkdownEntry.kind === INPUT_ENTRY_KINDS.MARKDOWN, "strong markdown should promote to markdown");

  console.log("[detector-confusion-samples] ok: 4 confusion scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[detector-confusion-samples] validation script failed");
  console.error(error);
  process.exitCode = 1;
});

