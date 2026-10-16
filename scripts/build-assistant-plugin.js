const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const zlib = require("zlib");
const esbuild = require("esbuild");
const packageInfo = require("../package.json");

const ROOT_DIR = path.resolve(__dirname, "..");
const FILES = ["backend.cjs", "assistant.js", "assistant.css", "assistant.html"];
const PLUGIN_ID = "freeflow.ai-assistant";

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function loadSigningKey(filePath, initialize) {
  try {
    return crypto.createPrivateKey(await fs.readFile(filePath));
  } catch (error) {
    if (error.code !== "ENOENT" || !initialize) {
      if (error.code === "ENOENT") throw new Error("Missing plugin signing key. Set FREEFLOW_PLUGIN_SIGNING_KEY_FILE, or initialize a local key explicitly with --init-signing-key.");
      throw error;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    await fs.writeFile(filePath, privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 });
    return privateKey;
  }
}

function hostServicesPlugin() {
  const shims = new Map([
    [path.join(ROOT_DIR, "src/backend/config/paths.js"), "paths"],
    [path.join(ROOT_DIR, "src/backend/services/secretStorageService.js"), "secretStorageService"],
  ]);
  return {
    name: "assistant-host-services",
    setup(build) {
      build.onResolve({ filter: /(?:config\/paths|services\/secretStorageService)$/ }, (args) => {
        const resolved = path.resolve(args.resolveDir, `${args.path}.js`);
        return shims.has(resolved) ? { path: shims.get(resolved), namespace: "assistant-host" } : undefined;
      });
      build.onLoad({ filter: /.*/, namespace: "assistant-host" }, (args) => ({
        contents: `module.exports = globalThis.__FREEFLOW_ASSISTANT_HOST__[${JSON.stringify(args.path)}];`,
        loader: "js",
      }));
    },
  };
}

async function buildAssistantPlugin(options = {}) {
  const outputDir = path.resolve(options.outputDir || path.join(ROOT_DIR, "release/plugins"));
  const version = options.version || packageInfo.version;
  const minAppVersion = options.minAppVersion || packageInfo.version;
  const { compareVersion } = require("../src/backend/plugins/assistantPluginManager");
  compareVersion(version, version);
  compareVersion(minAppVersion, minAppVersion);
  const keyPath = path.resolve(options.keyPath || process.env.FREEFLOW_PLUGIN_SIGNING_KEY_FILE || path.join(os.homedir(), ".config/freeflow/plugin-signing-ed25519.pem"));
  const privateKey = await loadSigningKey(keyPath, options.initializeSigningKey === true);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("Plugin signing requires an Ed25519 key");
  const publicKey = crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" });
  const { ASSISTANT_PLUGIN_PUBLIC_KEY } = require("../src/backend/plugins/pluginTrust");
  if (publicKey.trim() !== ASSISTANT_PLUGIN_PUBLIC_KEY.trim()) throw new Error("Signing key does not match the host's trusted public key");
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-assistant-build-"));
  try {
    const backendBuild = await esbuild.build({
      absWorkingDir: ROOT_DIR,
      entryPoints: ["src/backend/assistant-plugin/entry.js"],
      outfile: path.join(temporaryDir, "backend.cjs"),
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      minify: true,
      metafile: true,
      plugins: [hostServicesPlugin()],
    });
    const frontendBuild = await esbuild.build({
      absWorkingDir: ROOT_DIR,
      entryPoints: ["public/src/runtime/assistant-plugin/assistantEntry.js"],
      outfile: path.join(temporaryDir, "assistant.js"),
      bundle: true,
      platform: "browser",
      format: "esm",
      target: "es2022",
      minify: true,
      metafile: true,
      define: { "process.env.NODE_ENV": '"production"' },
    });
    await esbuild.build({
      entryPoints: [path.join(ROOT_DIR, "public/ui.agent-assistant.css")],
      outfile: path.join(temporaryDir, "assistant.css"),
      bundle: true,
      minify: true,
      external: ["/assets/*"],
    });
    await fs.copyFile(path.join(ROOT_DIR, "public/src/runtime/assistant-plugin/assistantTemplate.html"), path.join(temporaryDir, "assistant.html"));
    const files = {};
    const descriptors = {};
    for (const file of FILES) {
      const bytes = await fs.readFile(path.join(temporaryDir, file));
      if (!bytes.length) throw new Error(`Plugin asset is empty: ${file}`);
      files[file] = bytes.toString("base64");
      descriptors[file] = { size: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
    }
    const manifest = { id: PLUGIN_ID, version, hostApiVersion: 1, minAppVersion, files: descriptors };
    const signature = crypto.sign(null, Buffer.from(JSON.stringify(manifest)), privateKey).toString("base64");
    const bytes = zlib.gzipSync(Buffer.from(JSON.stringify({ manifest, signature, files })), { level: 9 });
    const fileName = `freeflow-ai-assistant-${manifest.version}.ffplugin`;
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const baseUrl = options.baseUrl || "";
    const catalog = { id: PLUGIN_ID, version: manifest.version, hostApiVersion: 1, minAppVersion: manifest.minAppVersion, url: baseUrl ? new URL(fileName, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href : fileName, size: bytes.length, sha256, manifest, signature };
    await fs.mkdir(outputDir, { recursive: true });
    const packagePath = path.join(outputDir, fileName);
    await fs.writeFile(packagePath, bytes);
    await fs.writeFile(path.join(outputDir, "assistant-plugin-catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
    await fs.writeFile(path.join(outputDir, "build-inputs.json"), `${JSON.stringify({ backend: Object.keys(backendBuild.metafile.inputs), frontend: Object.keys(frontendBuild.metafile.inputs) }, null, 2)}\n`);
    return { packagePath, catalog, uncompressedBytes: Object.values(descriptors).reduce((sum, file) => sum + file.size, 0) };
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  buildAssistantPlugin({
    outputDir: argument("--out-dir"),
    keyPath: argument("--key-file"),
    baseUrl: argument("--base-url"),
    version: argument("--plugin-version"),
    minAppVersion: argument("--min-app-version"),
    initializeSigningKey: process.argv.includes("--init-signing-key"),
  }).then((result) => console.log(`[build-assistant-plugin] ${result.packagePath} (${result.catalog.size} bytes, installed ${result.uncompressedBytes} bytes)`)).catch((error) => {
    console.error(`[build-assistant-plugin] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { buildAssistantPlugin, FILES, PLUGIN_ID };
