const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const repository = "WuXinbo-bo/FreeFlow-WorkBorad";
const fileNames = ["backend.cjs", "assistant.js", "assistant.css", "assistant.html"];
const maximumPackage = 32 * 1024 * 1024;
const maximumContent = 96 * 1024 * 1024;

function validVersion(value) {
  assert.match(value, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/);
}

function verifyManifest(manifest, signature, publicKey) {
  assert.equal(manifest.id, "freeflow.ai-assistant");
  assert.equal(manifest.hostApiVersion, 1);
  validVersion(manifest.version);
  validVersion(manifest.minAppVersion);
  if (manifest.maxAppVersion) validVersion(manifest.maxAppVersion);
  assert(["darwin", "win32", "any"].includes(manifest.platform));
  assert(["arm64", "x64", "any"].includes(manifest.arch));
  assert.deepEqual(Object.keys(manifest.files).sort(), [...fileNames].sort());
  let total = 0;
  for (const info of Object.values(manifest.files)) {
    assert(Number.isSafeInteger(info.size) && info.size > 0 && info.size <= 24 * 1024 * 1024);
    assert.match(info.sha256, /^[a-f0-9]{64}$/);
    total += info.size;
  }
  assert(total <= maximumContent);
  assert(crypto.verify(null, Buffer.from(JSON.stringify(manifest)), publicKey, Buffer.from(signature, "base64")), "manifest signature is not trusted");
}

async function download(url, maximum) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  assert(response.ok, `Download failed: HTTP ${response.status}: ${url}`);
  assert(new URL(response.url).protocol === "https:");
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    assert(length <= maximum, "download exceeds size limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function main() {
  const index = JSON.parse(await fs.readFile(path.join(root, "catalog/v1/index.json"), "utf8"));
  const publicKey = await fs.readFile(path.join(root, "trust/assistant-ed25519.pub"), "utf8");
  assert.equal(index.schemaVersion, 1);
  assert(index.plugins.length > 0);
  const ids = new Set();
  for (const plugin of index.plugins) {
    assert(!ids.has(plugin.id), "duplicate plugin id");
    ids.add(plugin.id);
    assert.equal(plugin.id, "freeflow.ai-assistant", "only the official assistant is currently supported");
    assert.equal(plugin.catalog, "freeflow.ai-assistant.json");
    const catalog = JSON.parse(await fs.readFile(path.join(root, "catalog/v1", plugin.catalog), "utf8"));
    assert.equal(catalog.schemaVersion, 1);
    assert.equal(catalog.id, plugin.id);
    assert(catalog.packages.length > 0);
    const targets = new Set();
    for (const entry of catalog.packages) {
      verifyManifest(entry.manifest, entry.signature, publicKey);
      for (const key of ["id", "version", "hostApiVersion", "minAppVersion", "maxAppVersion", "platform", "arch"]) {
        assert.equal(entry[key], entry.manifest[key], `catalog differs from signed manifest: ${key}`);
      }
      const target = `${entry.version}/${entry.platform}/${entry.arch}`;
      assert(!targets.has(target), `duplicate package target: ${target}`);
      targets.add(target);
      assert(Number.isSafeInteger(entry.size) && entry.size > 0 && entry.size <= maximumPackage);
      assert.match(entry.sha256, /^[a-f0-9]{64}$/);
      const targetSuffix = `${entry.platform === "any" ? "" : `-${entry.platform}`}${entry.arch === "any" ? "" : `-${entry.arch}`}`;
      const expectedUrl = `https://github.com/${repository}/releases/download/plugin-ai-assistant-v${entry.version}/freeflow-ai-assistant-${entry.version}${targetSuffix}.ffplugin`;
      assert.equal(entry.url, expectedUrl, "package URL must point to an immutable versioned official Release");
      const snapshot = JSON.parse(await fs.readFile(path.join(root, `manifests/${entry.id}/${entry.version}.json`), "utf8"));
      assert(snapshot.packages.some(value => JSON.stringify(value) === JSON.stringify(entry)), "version snapshot differs from active catalog");
      if (process.argv.includes("--online")) {
        const bytes = await download(entry.url, maximumPackage);
        assert.equal(bytes.length, entry.size);
        assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), entry.sha256);
        const envelope = JSON.parse(zlib.gunzipSync(bytes, { maxOutputLength: maximumContent }));
        assert.deepEqual(envelope.manifest, entry.manifest);
        assert.equal(envelope.signature, entry.signature);
        assert.deepEqual(Object.keys(envelope.files).sort(), [...fileNames].sort());
        for (const file of fileNames) {
          const content = Buffer.from(envelope.files[file], "base64");
          assert.equal(content.length, entry.manifest.files[file].size);
          assert.equal(crypto.createHash("sha256").update(content).digest("hex"), entry.manifest.files[file].sha256);
        }
      }
      console.log(`PASS ${entry.id} ${target}${process.argv.includes("--online") ? " HTTPS package verified" : " signed catalog verified"}`);
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
