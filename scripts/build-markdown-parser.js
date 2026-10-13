const path = require("node:path");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
esbuild.build({
  stdin: { contents: 'export { default as MarkdownIt } from "markdown-it"; export { default as footnote } from "markdown-it-footnote";', resolveDir: root, sourcefile: "markdown-parser-vendor.js" },
  bundle: true, format: "esm", platform: "browser", target: ["es2022"], minify: true,
  outfile: path.join(root, "public/assets/vendor/markdown/markdown-parser.js"),
  banner: { js: "/*! markdown-it 14.1.0 and markdown-it-footnote 4.0.0 | MIT */" },
}).catch(error => { console.error(error); process.exitCode = 1; });
