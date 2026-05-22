const { execFileSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

const VALIDATORS = [
  "validate-plain-text-parser.cjs",
  "validate-html-parser.cjs",
  "validate-web-content-parser.cjs",
  "validate-markdown-parser.cjs",
  "validate-code-parser.cjs",
  "validate-latex-math-parser.cjs",
  "validate-image-resource-parser.cjs",
  "validate-file-resource-compatibility-adapter.cjs",
  "validate-internal-compatibility-parser.cjs",
];

function main() {
  const results = [];
  for (const file of VALIDATORS) {
    const scriptPath = path.join(ROOT, "scripts", "structured-import", file);
    const output = execFileSync(process.execPath, [scriptPath], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    results.push({ file, output });
  }

  console.log(`[parser-unit-tests] ok: ${results.length} validators passed`);
  for (const result of results) {
    console.log(`- ${result.file}: ${result.output}`);
  }
}

main();
