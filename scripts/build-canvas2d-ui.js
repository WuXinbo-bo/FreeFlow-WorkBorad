const fs = require("fs/promises");
const path = require("path");
const esbuild = require("esbuild");

const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const ENTRY_FILE = path.join(PUBLIC_DIR, "src", "engines", "canvas2d-core", "ui", "index.js");
const OUT_DIR = path.join(PUBLIC_DIR, "assets", "canvas2d-ui", "current");
const OUT_FILE = path.join(OUT_DIR, "canvas2d-ui.js");
const PRISM_COMPONENTS_DIR = path.join(ROOT_DIR, "node_modules", "prismjs", "components");
const PRISM_VENDOR_DIR = path.join(PUBLIC_DIR, "vendor", "prismjs", "components");
const MERMAID_DIST_DIR = path.join(ROOT_DIR, "node_modules", "mermaid", "dist");
const MERMAID_VENDOR_DIR = path.join(PUBLIC_DIR, "assets", "vendor", "mermaid");
const XLSX_MODULE_FILE = path.join(ROOT_DIR, "node_modules", "xlsx", "xlsx.mjs");
const XLSX_VENDOR_DIR = path.join(PUBLIC_DIR, "vendor", "xlsx");
const XLSX_VENDOR_FILE = path.join(XLSX_VENDOR_DIR, "xlsx.mjs");
const PRISM_COMPONENT_FILES = [
  "prism-core.min.js",
  "prism-clike.min.js",
  "prism-javascript.min.js",
  "prism-typescript.min.js",
  "prism-python.min.js",
  "prism-json.min.js",
  "prism-markup.min.js",
  "prism-css.min.js",
  "prism-markdown.min.js",
  "prism-sql.min.js",
  "prism-c.min.js",
  "prism-cpp.min.js",
  "prism-java.min.js",
  "prism-bash.min.js",
];

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyPrismVendorAssets() {
  try {
    await fs.access(PRISM_COMPONENTS_DIR);
  } catch {
    return;
  }
  await ensureDir(PRISM_VENDOR_DIR);
  await Promise.all(
    PRISM_COMPONENT_FILES.map(async (fileName) => {
      const sourcePath = path.join(PRISM_COMPONENTS_DIR, fileName);
      const targetPath = path.join(PRISM_VENDOR_DIR, fileName);
      try {
        await fs.copyFile(sourcePath, targetPath);
      } catch {
        // Skip individual languages that are unavailable locally.
      }
    })
  );
}

async function copyMermaidVendorAssets() {
  try {
    await fs.access(MERMAID_DIST_DIR);
  } catch {
    return;
  }
  await ensureDir(MERMAID_VENDOR_DIR);
  await fs.copyFile(
    path.join(MERMAID_DIST_DIR, "mermaid.esm.min.mjs"),
    path.join(MERMAID_VENDOR_DIR, "mermaid.esm.min.mjs")
  );
  await fs.cp(
    path.join(MERMAID_DIST_DIR, "chunks", "mermaid.esm.min"),
    path.join(MERMAID_VENDOR_DIR, "chunks", "mermaid.esm.min"),
    { recursive: true, force: true }
  );
}

async function copyXlsxVendorAsset() {
  try {
    await fs.access(XLSX_MODULE_FILE);
  } catch {
    return;
  }
  await ensureDir(XLSX_VENDOR_DIR);
  await fs.copyFile(XLSX_MODULE_FILE, XLSX_VENDOR_FILE);
}

async function main() {
  await ensureDir(OUT_DIR);
  await copyPrismVendorAssets();
  await copyMermaidVendorAssets();
  await copyXlsxVendorAsset();

  await esbuild.build({
    entryPoints: [ENTRY_FILE],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    minify: true,
    outfile: OUT_FILE,
    define: {
      "process.env.NODE_ENV": "\"production\"",
    },
    loader: {
      ".js": "jsx",
      ".jsx": "jsx",
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
