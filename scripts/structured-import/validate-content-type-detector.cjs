"use strict";

async function main() {
  const detectorModule = await import("../../public/src/engines/canvas2d-core/import/gateway/contentTypeDetector.js");
  const { detectTextContentType } = detectorModule;

  const markdownResult = detectTextContentType(
    ["# Heading", "", "- [x] done", "- [ ] todo", "", "| a | b |", "| - | - |", "| 1 | 2 |"].join("\n")
  );
  assert(markdownResult.entryKind === "markdown", "markdown detector entry kind mismatch");
  assert(markdownResult.type === "table" || markdownResult.type === "list", "markdown detector type mismatch");

  const codeResult = detectTextContentType(
    ["function sum(a, b) {", "  const total = a + b;", "  return total;", "}"].join("\n")
  );
  assert(codeResult.entryKind === "code", "code detector entry kind mismatch");
  assert(codeResult.type === "code", "code detector type mismatch");

  const mathResult = detectTextContentType(
    ["\\begin{aligned}", "E &= mc^2 \\\\", "F &= ma", "\\end{aligned}"].join("\n")
  );
  assert(mathResult.entryKind === "math", "math detector entry kind mismatch");
  assert(mathResult.type === "math", "math detector type mismatch");

  const quoteResult = detectTextContentType(["> one", "> two", "> three"].join("\n"));
  assert(quoteResult.entryKind === "markdown", "quote detector entry kind mismatch");
  assert(quoteResult.type === "quote", "quote detector type mismatch");

  const plainTextResult = detectTextContentType("We will keep this note as plain prose and continue the rollout tomorrow.");
  assert(plainTextResult.entryKind === "text", "plain text detector entry kind mismatch");
  assert(plainTextResult.type === "text", "plain text detector type mismatch");

  console.log("[content-type-detector] ok: 5 scenarios validated");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error("[content-type-detector] validation script failed");
  console.error(error);
  process.exitCode = 1;
});
