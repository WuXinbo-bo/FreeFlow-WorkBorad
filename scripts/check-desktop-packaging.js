const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");
const DATA_DIR = path.join(ROOT_DIR, "data");
const ALLOWED_EXTRA_RESOURCE_SOURCES = new Set([
  "data/FreeFlow教程画布.json",
  "public/assets/tutorial-group.png",
  "build/README.md",
]);
const SENSITIVE_DATA_PATTERNS = [
  /^model-provider-settings\.json$/i,
  /^model-profiles\.json$/i,
  /^sessions\.json$/i,
  /^ui-settings\.json$/i,
  /^permissions\.json$/i,
  /^clipboard-store\.json$/i,
  /^.*\.pid$/i,
  /^.*\.log$/i,
  /^.*\.json$/i,
  /^importimage[\\/].+/i,
];

const REQUIRED_PATHS = [
  "electron/main.js",
  "electron/preload.js",
  "server.js",
  "public/index.html",
  "public/assets/canvas2d-ui/current/canvas2d-ui.js",
  "public/assets/canvas-office/current/canvas-office-ui.js",
];

let hasError = false;
let hasWarning = false;

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

function loadPackageJson() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
}

function collectDataFiles(currentDir, relativePrefix = "") {
  if (!fs.existsSync(currentDir)) {
    return [];
  }

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const nextRelativePath = relativePrefix ? path.join(relativePrefix, entry.name) : entry.name;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectDataFiles(fullPath, nextRelativePath));
      continue;
    }
    results.push({
      fullPath,
      relativePath: toPosix(nextRelativePath),
    });
  }
  return results;
}

for (const relativePath of REQUIRED_PATHS) {
  const fullPath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`[check-desktop-packaging] 缺少文件: ${relativePath}`);
    hasError = true;
  }
}

const iconPath = path.join(ROOT_DIR, "build", "icon.ico");
if (!fs.existsSync(iconPath)) {
  console.warn("[check-desktop-packaging] 未发现 build/icon.ico，安装包会缺少正式 Windows 图标");
}

const envExamplePath = path.join(ROOT_DIR, ".env.example");
if (!fs.existsSync(envExamplePath)) {
  console.warn("[check-desktop-packaging] 未发现 .env.example，建议保留一份配置模板给新机器使用");
}

const packageJson = loadPackageJson();
const buildConfig = packageJson.build || {};
const buildFiles = Array.isArray(buildConfig.files) ? buildConfig.files.map((item) => String(item || "")) : [];
const extraResources = Array.isArray(buildConfig.extraResources) ? buildConfig.extraResources : [];

if (!buildFiles.includes("!data/**/*")) {
  console.error("[check-desktop-packaging] package.json 未显式排除 data/**/*，存在把本机数据误打进安装包的风险");
  hasError = true;
}

if (!buildFiles.includes("!release/**/*")) {
  console.error("[check-desktop-packaging] package.json 未显式排除 release/**/*，存在把本地产物重复打包的风险");
  hasError = true;
}

for (const resource of extraResources) {
  const from = toPosix(resource?.from || "");
  if (!ALLOWED_EXTRA_RESOURCE_SOURCES.has(from)) {
    console.error(`[check-desktop-packaging] extraResources 中存在未批准的资源来源: ${from || "<empty>"}`);
    hasError = true;
  }
}

const dataFiles = collectDataFiles(DATA_DIR);
const suspiciousDataFiles = dataFiles.filter((entry) => {
  if (entry.relativePath === "FreeFlow教程画布.json") {
    return false;
  }
  return SENSITIVE_DATA_PATTERNS.some((pattern) => pattern.test(entry.relativePath));
});

if (suspiciousDataFiles.length) {
  hasWarning = true;
  console.warn("[check-desktop-packaging] 检测到仓库 data/ 下仍有本机用户数据，这些文件已被排除出安装包：");
  for (const entry of suspiciousDataFiles) {
    console.warn(`  - data/${entry.relativePath}`);
  }
}

if (hasError) {
  process.exit(1);
}

if (hasWarning) {
  console.warn("[check-desktop-packaging] 请在正式发布前确认这些本机数据不再需要保留在仓库中");
}

console.log("[check-desktop-packaging] 打包前静态检查通过");
