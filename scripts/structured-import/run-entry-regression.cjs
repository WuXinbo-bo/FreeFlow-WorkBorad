const { execFileSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

const VALIDATORS = [
  "validate-input-descriptor.cjs",
  "validate-content-type-detector.cjs",
  "validate-paste-gateway.cjs",
  "validate-drag-gateway.cjs",
  "validate-context-menu-paste-adapter.cjs",
  "validate-parser-registry.cjs",
  "validate-fallback-strategy-manager.cjs",
  "validate-diagnostics-model.cjs",
  "validate-pipeline-switches.cjs",
  "validate-kill-switch.cjs",
  "validate-import-log-collector.cjs",
  "validate-canonical-fragment-copy.cjs",
  "validate-copy-downgrade-rules.cjs",
  "validate-external-compatibility-output.cjs",
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

  const fixtureOutput = execFileSync(process.execPath, [
    path.join(ROOT, "scripts", "structured-import-fixtures", "validate-fixtures.cjs"),
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  console.log(`[entry-regression] ok: ${results.length + 1} validators passed`);
  for (const result of results) {
    console.log(`- ${result.file}: ${result.output}`);
  }
  console.log(`- validate-fixtures.cjs: ${fixtureOutput}`);
}

main();
