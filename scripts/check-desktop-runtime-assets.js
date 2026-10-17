const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const BROWSER_PACKAGES = ["dompurify", "html2canvas", "katex", "lucide-react", "markdown-it", "markdown-it-footnote", "mermaid", "prismjs", "react", "react-dom"];

function checkRuntimeAssets(root = ROOT) {
  const required = [
    "public/assets/canvas2d-ui/current/canvas2d-ui.js", "public/assets/canvas-office/current/canvas-office-ui.js",
    "public/assets/vendor/markdown/markdown-parser.js", "public/assets/vendor/dompurify/purify.es.mjs",
    "public/assets/vendor/html2canvas/html2canvas.esm.min.js", "public/assets/vendor/mermaid/mermaid.esm.min.mjs",
    "public/assets/vendor/pdfjs-dist/pdf.mjs", "public/assets/vendor/pdfjs-dist/pdf.worker.mjs",
    "public/assets/vendor/pdf-lib.esm.min.js", "public/assets/vendor/docx-preview/docx-preview.mjs",
    "public/vendor/katex/katex.min.js", "public/vendor/katex/katex.min.css", "public/vendor/xlsx/xlsx.mjs",
    "public/assets/vendor/THIRD-PARTY-NOTICES.txt",
  ];
  for (const file of required) assert(fs.statSync(path.join(root, file)).size > 0, `Missing offline runtime asset: ${file}`);
  for (const dir of ["public/assets/vendor/mermaid/chunks/mermaid.esm.min", "public/assets/vendor/pdfjs-dist/cmaps", "public/assets/vendor/pdfjs-dist/standard_fonts", "public/assets/vendor/pdfjs-dist/wasm", "public/vendor/katex/fonts"]) {
    assert(fs.readdirSync(path.join(root, dir)).length > 0, `Missing offline runtime resources: ${dir}`);
  }
  // Every currently supported language must survive the /vendor node_modules
  // route falling through to the public copy in a production installation.
  for (const language of ["core", "clike", "javascript", "typescript", "python", "json", "markup", "css", "markdown", "sql", "c", "cpp", "java", "bash"]) {
    assert(fs.statSync(path.join(root, `public/vendor/prismjs/components/prism-${language}.min.js`)).size > 0, `Missing syntax language: ${language}`);
  }
}

function writeBrowserNotices() {
  const lock = require("../package-lock.json");
  const seen = new Set();
  function visit(name, from = "") {
    let parent = from;
    let key;
    while (true) {
      const candidate = `${parent ? parent + "/" : ""}node_modules/${name}`;
      if (lock.packages[candidate]) { key = candidate; break; }
      if (!parent) return;
      parent = parent.includes("/node_modules/") ? parent.slice(0, parent.lastIndexOf("/node_modules/")) : "";
    }
    if (seen.has(key)) return;
    seen.add(key);
    const entry = lock.packages[key];
    for (const dependency of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies })) visit(dependency, key);
  }
  BROWSER_PACKAGES.forEach(name => visit(name));
  const notices = [...seen].sort().map(key => {
    const info = lock.packages[key];
    const directory = path.join(ROOT, key);
    const licenses = fs.readdirSync(directory).filter(file => /^(?:licen[cs]e|copying|notice)(?:[.-]|$)/i.test(file) && fs.statSync(path.join(directory, file)).isFile());
    assert(licenses.length, `No third-party license text for ${key}`);
    return [`${key} @ ${info.version} (${info.license || "see license text"})`, ...licenses.map(file => fs.readFileSync(path.join(directory, file), "utf8").replace(/\r\n?/g, "\n").replace(/[\t ]+$/gm, ""))].join("\n\n");
  });
  fs.writeFileSync(path.join(ROOT, "public/assets/vendor/THIRD-PARTY-NOTICES.txt"), `Third-party browser runtime notices\n\n${notices.join("\n\n------------------------------------------------------------\n\n")}\n`);
}

function checkArchive(archivePath, platform) {
  const asar = require("@electron/asar");
  const files = asar.listPackage(archivePath).map(file => file.replace(/^\//, ""));
  for (const file of files) {
    assert(!/^(?:release|\.tools|\.codegraph|data|tmp|screenshots)(?:\/|$)/.test(file), `Development or local data leaked into package: ${file}`);
    assert(!file.endsWith(".map"), `Source map leaked into package: ${file}`);
    assert(!/^node_modules\/.*\.d\.(?:ts|mts|cts)$/.test(file), `Type declaration leaked into package: ${file}`);
    for (const name of BROWSER_PACKAGES) assert(!file.startsWith(`node_modules/${name}/`), `Build-only package leaked into runtime: ${file}`);
    if (platform === "darwin") assert(!file.startsWith("node_modules/koffi/"), `Windows native library leaked into Mac package: ${file}`);
    assert(!/^node_modules\/mathjax\/(?:config|extensions|fonts|jax|localization|test)(?:\/|$)/.test(file), `Duplicate MathJax distribution: ${file}`);
  }
  for (const required of ["public/assets/vendor/THIRD-PARTY-NOTICES.txt", "public/assets/vendor/markdown/markdown-parser.js", "public/vendor/katex/katex.min.js", "public/assets/vendor/pdfjs-dist/pdf.worker.mjs", "public/assets/vendor/mermaid/mermaid.esm.min.mjs", "electron/fileWorkstationWorker.js", "node_modules/mathjax/unpacked/MathJax.js", "node_modules/pdf-parse/package.json", "node_modules/sharp/package.json"]) {
    assert(files.includes(required), `Missing packaged runtime: ${required}`);
  }
  if (platform === "win32") assert(files.includes("node_modules/koffi/package.json"), "Windows package lost Koffi");
  console.log(`[desktop-runtime-assets] Actual ${platform || "desktop"} archive: ${files.length} entries; runtime resources present, build-only files absent`);
}

if (require.main === module) {
  if (process.argv.includes("--prepare")) writeBrowserNotices();
  const archiveIndex = process.argv.indexOf("--asar-file");
  if (archiveIndex >= 0) {
    assert(process.argv[archiveIndex + 1], "--asar-file requires a path");
    const platformIndex = process.argv.indexOf("--platform");
    checkArchive(path.resolve(process.argv[archiveIndex + 1]), platformIndex >= 0 ? process.argv[platformIndex + 1] : undefined);
  } else checkRuntimeAssets();
  console.log("[desktop-runtime-assets] Offline browser resources, fonts, workers, languages and third-party notices present");
}
module.exports = { BROWSER_PACKAGES, checkRuntimeAssets, checkArchive };
