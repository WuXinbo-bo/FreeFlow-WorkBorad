"use strict";
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { builtinModules } = require("module");
const esbuild = require("esbuild");
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "build/extensions");
const VERSION = "1.0.0";
// Keep the branch's target stable when cross-building on a different host OS.
const PLATFORM = require("../src/backend/extensions/assistantCatalog.json").platform;
async function build() {
  if (!["darwin", "win32"].includes(PLATFORM)) throw new Error("扩展目录缺少有效的目标平台");
  await fs.mkdir(OUT, { recursive: true });
  const files = {};
  for (const [name, platform, format] of [["client", "browser", "esm"], ["server", "node", "cjs"], ["settingsBackend", "node", "cjs"]]) {
    const result = await esbuild.build({
      absWorkingDir: ROOT, entryPoints: [path.join(ROOT, `extensions/ai-assistant/${name}.js`)],
      bundle: true, write: false, platform, format, target: platform === "node" ? "node24" : "chrome140",
      plugins: platform === "node" ? [{ name: "host-services", setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => {
          if (builtinModules.includes(args.path) || args.path.startsWith("node:")) return { path: args.path, external: true };
          if (!args.importer) return;
          const absolute = args.path.startsWith(".") ? path.resolve(args.resolveDir, args.path) : null;
          if (absolute && (absolute.includes(`${path.sep}agent${path.sep}`) || absolute.endsWith(`${path.sep}agent`))) return;
          const id = absolute ? path.relative(ROOT, absolute).split(path.sep).join("/") : args.path;
          return { path: id, namespace: "host" };
        });
        builder.onLoad({ filter: /.*/, namespace: "host" }, (args) => ({ contents: `module.exports = globalThis.__freeflowHostRequire(${JSON.stringify(args.path)});`, loader: "js" }));
      }}] : [],
    });
    files[platform === "node" ? `${name}.cjs` : "client.js"] = Buffer.from(result.outputFiles[0].contents).toString("base64");
  }
  // Settings renderers are loaded only when the enabled assistant settings are opened.
  const settings = await esbuild.build({ absWorkingDir: ROOT, entryPoints: [path.join(ROOT, "extensions/ai-assistant/settings.js")], bundle: true, write: false, format: "esm", platform: "browser", target: "chrome140" });
  files["settings.js"] = Buffer.from(settings.outputFiles[0].contents).toString("base64");
  files["assistant.css"] = (await fs.readFile(path.join(ROOT, "public/ui.agent-assistant.css"))).toString("base64");
  files["panel.json"] = (await fs.readFile(path.join(ROOT, "extensions/ai-assistant/panel.json"))).toString("base64");
  const manifest = { id: "ai-assistant", version: VERSION, platform: PLATFORM, apiVersion: 1, dataSchemaVersion: 3, files };
  const bytes = zlib.gzipSync(Buffer.from(JSON.stringify(manifest)), { level: 9 });
  const filename = `freeflow-ai-assistant-${VERSION}-${PLATFORM}.ffext`;
  await fs.writeFile(path.join(OUT, filename), bytes);
  const catalog = { id: manifest.id, version: VERSION, platform: PLATFORM, apiVersion: 1, dataSchemaVersion: 3, filename,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length,
    url: `https://github.com/WuXinbo-bo/FreeFlow-WorkBorad/releases/download/assistant-v${VERSION}/${filename}` };
  const catalogText = JSON.stringify(catalog, null, 2) + "\n";
  await fs.writeFile(path.join(ROOT, "src/backend/extensions/assistantCatalog.json"), catalogText);
  console.log(`AI assistant: ${filename} (${bytes.length} bytes), excluded from base installer`);
}
build().catch((error) => { console.error(error); process.exitCode = 1; });
