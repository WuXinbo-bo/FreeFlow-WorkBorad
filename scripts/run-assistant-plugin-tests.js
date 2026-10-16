const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const packageInfo = require("../package.json");

const ROOT_DIR = path.resolve(__dirname, "..");

function run(script, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT_DIR, script), ...args], {
      cwd: ROOT_DIR,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${script} failed (${signal || code})`)));
  });
}

async function main() {
  const artifactIndex = process.argv.indexOf("--artifact");
  let artifact;
  if (artifactIndex >= 0) {
    const requested = process.argv[artifactIndex + 1];
    if (!requested || requested.startsWith("--")) throw new Error("--artifact requires the path to an existing signed .ffplugin package");
    artifact = path.resolve(requested);
    await fs.access(artifact).catch(() => { throw new Error(`Signed plugin artifact not found: ${artifact}. Run npm run build:assistant-plugin with the existing signing key, or pass a valid --artifact path.`); });
  } else {
    const key = process.env.FREEFLOW_PLUGIN_SIGNING_KEY_FILE || path.join(os.homedir(), ".config/freeflow/plugin-signing-ed25519.pem");
    await fs.access(key).catch(() => { throw new Error("Plugin signing key is unavailable. Restore the original trusted signing key and set FREEFLOW_PLUGIN_SIGNING_KEY_FILE, or test an existing official package with npm run test:assistant-plugin -- --artifact /path/assistant.ffplugin. Tests never create or replace a release signing key."); });
    await run("scripts/build-assistant-plugin.js");
    artifact = path.join(ROOT_DIR, "release/plugins", `freeflow-ai-assistant-${packageInfo.version}.ffplugin`);
  }
  await run("scripts/check-assistant-plugin-packaging.js", ["--package-file", artifact]);
  await run("scripts/check-assistant-plugin-release-config.js");
  await run("scripts/check-assistant-plugin-manager.js", ["--artifact", artifact]);
  await run("scripts/check-assistant-plugin-routes.js");
  await run("scripts/check-assistant-process-host.js", [artifact]);
  await run("scripts/check-assistant-cli-launch.js");
  await run("scripts/check-assistant-plugin-ui.js");
  await run("scripts/check-assistant-plugin-desktop.js", [], { FREEFLOW_ASSISTANT_PLUGIN_ARTIFACT: artifact });
  console.log("[test:assistant-plugin] Signed package, actual download/install, process lifecycle, UI and native desktop checks passed");
}

main().catch((error) => {
  console.error(`[test:assistant-plugin] ${error.message}`);
  process.exitCode = 1;
});
