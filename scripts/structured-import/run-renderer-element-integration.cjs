const { execFileSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

const VALIDATORS = [
  "validate-renderer-pipeline.cjs",
  "validate-legacy-element-adapter-registry.cjs",
  "validate-generic-text-renderer.cjs",
  "validate-list-renderer.cjs",
  "validate-code-block-renderer.cjs",
  "validate-table-renderer.cjs",
  "validate-math-renderer.cjs",
  "validate-image-renderer.cjs",
  "validate-file-card-legacy-adapter.cjs",
  "validate-native-passthrough-adapter.cjs",
  "validate-text-element-protocol.cjs",
  "validate-code-block-element.cjs",
  "validate-table-element.cjs",
  "validate-math-element.cjs",
  "validate-task-list-interaction.cjs",
  "validate-image-element-bridge.cjs",
  "validate-file-card-element-bridge.cjs",
  "validate-native-compatibility-passthrough.cjs",
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

  console.log(`[renderer-element-integration] ok: ${results.length} validators passed`);
  for (const result of results) {
    console.log(`- ${result.file}: ${result.output}`);
  }
}

main();
