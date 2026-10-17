const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

function runNodeScript(relativePath, args = []) {
  const target = path.join(ROOT_DIR, relativePath);
  const result = spawnSync(process.execPath, [target, ...args], {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function warnIfMissing(relativePath, message) {
  const target = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(target)) {
    console.warn(`[prepare-desktop-build] ${message}: ${relativePath}`);
  }
}

runNodeScript(path.join("scripts", "configure-assistant-plugin-release.js"));
runNodeScript(path.join("scripts", "sync-app-icons.js"));
runNodeScript(path.join("scripts", "build-markdown-parser.js"));
runNodeScript(path.join("scripts", "build-canvas2d-ui.js"));
runNodeScript(path.join("scripts", "build-canvas-office.js"));
runNodeScript(path.join("scripts", "check-desktop-runtime-assets.js"), ["--prepare"]);
runNodeScript(path.join("scripts", "generate-app-icons.js"));
runNodeScript(path.join("scripts", "check-macos-icons.js"));
runNodeScript(path.join("scripts", "check-assistant-plugin-packaging.js"));

warnIfMissing(path.join("build", "icon.ico"), "Windows 图标生成失败");
