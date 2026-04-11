const fs = require("fs/promises");
const path = require("path");
const esbuild = require("esbuild");

const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const ENTRY_FILE = path.join(PUBLIC_DIR, "src", "engines", "canvas2d-core", "ui", "index.js");
const OUT_DIR = path.join(PUBLIC_DIR, "assets", "canvas2d-ui", "current");
const OUT_FILE = path.join(OUT_DIR, "canvas2d-ui.js");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  await ensureDir(OUT_DIR);

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
