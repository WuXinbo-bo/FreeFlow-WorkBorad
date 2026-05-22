"use strict";

async function main() {
  const detectorModule = await import("../../public/src/engines/canvas2d-core/import/gateway/contentTypeDetector.js");
  const { detectTextContentType, CODE_ENTRY_STRATEGIES } = detectorModule;

  const markdownResult = detectTextContentType(
    ["# Heading", "", "- [x] done", "- [ ] todo", "", "| a | b |", "| - | - |", "| 1 | 2 |"].join("\n")
  );
  assert(markdownResult.entryKind === "markdown", "markdown detector entry kind mismatch");
  assert(markdownResult.type === "table" || markdownResult.type === "list", "markdown detector type mismatch");

  const codeResult = detectTextContentType(
    ["'''js", "function sum(a, b) {", "  const total = a + b;", "  return total;", "}", "'''"].join("\n")
  );
  assert(codeResult.entryKind === "markdown", "code detector default entry kind mismatch");
  assert(codeResult.type === "code", "code detector type mismatch");
  const nativeCodeResult = detectTextContentType(
    ["'''js", "function sum(a, b) {", "  const total = a + b;", "  return total;", "}", "'''"].join("\n"),
    { codeEntryStrategy: CODE_ENTRY_STRATEGIES.NATIVE_CODE }
  );
  assert(nativeCodeResult.entryKind === "code", "native code strategy entry kind mismatch");
  assert(nativeCodeResult.type === "code", "native code strategy type mismatch");

  const mathResult = detectTextContentType("$E=mc^2$");
  assert(mathResult.entryKind === "markdown", "math detector entry kind mismatch");
  assert(mathResult.type === "math", "math detector type mismatch");
  const mathParenResult = detectTextContentType("\\(a^2+b^2=c^2\\)");
  assert(mathParenResult.type === "math", "math paren wrapper type mismatch");
  const mathBracketResult = detectTextContentType("\\[\\int_a^b f(x)dx\\]");
  assert(mathBracketResult.type === "math", "math bracket wrapper type mismatch");

  const quoteResult = detectTextContentType(["> one", "> two", "> three"].join("\n"));
  assert(quoteResult.entryKind === "markdown", "quote detector entry kind mismatch");
  assert(quoteResult.type === "quote", "quote detector type mismatch");

  const plainTextResult = detectTextContentType("We will keep this note as plain prose and continue the rollout tomorrow.");
  assert(plainTextResult.entryKind === "text", "plain text detector entry kind mismatch");
  assert(plainTextResult.type === "text", "plain text detector type mismatch");

  console.log("[content-type-detector] ok: 8 scenarios validated");
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
