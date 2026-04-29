const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8").replace(/^\uFEFF/, "");
}

function assertIncludes(relativePath, expected) {
  const content = read(relativePath);
  if (!content.includes(expected)) {
    throw new Error(`${relativePath} 缺少版本内容: ${expected}`);
  }
}

function assertJsonVersion(relativePath, expected) {
  const payload = JSON.parse(read(relativePath));
  if (payload.version !== expected) {
    throw new Error(`${relativePath} version=${payload.version || "<empty>"}，期望 ${expected}`);
  }
}

function main() {
  const packageJson = JSON.parse(read("package.json"));
  const expectedVersion = String(packageJson.version || "").trim();
  if (!expectedVersion) {
    throw new Error("package.json 缺少 version");
  }
  const displayVersion = `v${expectedVersion}`;

  assertJsonVersion("package-lock.json", expectedVersion);
  const lockRoot = JSON.parse(read("package-lock.json"))?.packages?.[""];
  if (lockRoot?.version !== expectedVersion) {
    throw new Error(`package-lock.json packages[\"\"].version=${lockRoot?.version || "<empty>"}，期望 ${expectedVersion}`);
  }

  assertIncludes("electron/main.js", `TUTORIAL_BOARD_TEMPLATE_VERSION = "${expectedVersion}"`);
  assertIncludes("public/src/config/app.config.js", `startupTutorialIntroVersion: "${expectedVersion}"`);
  assertIncludes("public/src/tutorial-core/tutorialTypes.js", `TUTORIAL_VERSION = "${expectedVersion}"`);
  assertIncludes("public/src/engines/canvas2d-core/ui/index.jsx", displayVersion);
  assertIncludes("public/assets/canvas2d-ui/current/canvas2d-ui.js", expectedVersion);
  assertIncludes("public/assets/canvas-office/current/canvas-office-ui.js", expectedVersion);
  assertIncludes("data/FreeFlow教程画布.json", displayVersion);
  assertIncludes("build/README.md", displayVersion);

  console.log(`[check-release-version] 版本一致性验证通过: ${displayVersion}`);
}

main();
