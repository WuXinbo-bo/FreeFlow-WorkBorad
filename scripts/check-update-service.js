const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { version } = require("../package.json");

async function main() {
  const context = vm.createContext({
    require: (name) => {
      assert.equal(name, "electron");
      return { app: { getVersion: () => version } };
    },
    module: { exports: {} }, fetch, AbortController, setTimeout, clearTimeout,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../electron/updateService.js"), "utf8"), context);
  const service = context.module.exports;
  const release = {
    tag_name: `v${version}`, name: `FreeFlow ${version}`,
    html_url: `https://github.com/WuXinbo-bo/FreeFlow-WorkBorad/releases/tag/v${version}`,
    assets: [
      { name: `FreeFlow-v${version}-x64-portable.exe`, browser_download_url: "https://example.com/portable.exe" },
      { name: `FreeFlow-v${version}-x64.exe`, browser_download_url: "https://example.com/setup.exe", size: 123 },
    ],
  };
  const upgrade = await service.checkForAppUpdate({ currentVersion: "1.2.0", mockRelease: release });
  assert(upgrade.hasUpdate);
  assert.equal(upgrade.downloadAssetName, `FreeFlow-v${version}-x64.exe`);
  assert.equal(upgrade.downloadUrl, "https://example.com/setup.exe");
  assert((await service.checkForAppUpdate({ mockRelease: release })).isLatest);
  assert.equal(service.compareVersions("2.0.0-rc.1", "2.0.0"), -1);
  assert.equal(service.compareVersions("2.0", "2.0.0"), 0);
  assert.equal(service.compareVersions("invalid", version), null);
  const missingAsset = await service.checkForAppUpdate({ currentVersion: "1.2.0", mockRelease: { ...release, assets: [] } });
  assert.equal(missingAsset.downloadUrl, release.html_url);
  const armRelease = {
    ...release,
    assets: [...release.assets, { name: `FreeFlow-v${version}-arm64.exe`, browser_download_url: "https://example.com/windows-arm64.exe" }],
  };
  assert.equal((await service.checkForAppUpdate({ currentVersion: "1.2.0", mockRelease: armRelease, platform: "win32", arch: "arm64" })).downloadAssetName,
    `FreeFlow-v${version}-arm64.exe`, "a Windows ARM64 device must not receive the default x64 installer");
  const pluginRelease = { tag_name: "plugin-ai-assistant-v99.0.0", assets: [] };
  const requestedUrls = [];
  context.fetch = async (url) => {
    requestedUrls.push(url);
    return { ok: true, json: async () => String(url).endsWith("/latest") ? pluginRelease : [
      pluginRelease,
      { ...release, tag_name: "v99.0.0", draft: true },
      { ...release, tag_name: "v98.0.0", prerelease: true },
      { ...release, tag_name: "v97.0.0-beta.1" },
      { ...release, tag_name: "v1.0.0" },
      release,
    ] };
  };
  const isolated = await service.checkForAppUpdate({ currentVersion: "1.2.0", platform: "win32", arch: "x64" });
  assert.equal(isolated.latestVersion, version, "plugin releases, drafts, and previews must not replace the stable app release");
  assert.equal(isolated.downloadAssetName, `FreeFlow-v${version}-x64.exe`);
  assert.equal(requestedUrls.length, 2, "a plugin marked Latest must fall back to the application release list");
  context.fetch = async (url) => ({ ok: true, json: async () => String(url).endsWith("/latest") ? pluginRelease :
    String(url).includes("page=2") ? [release] : Array.from({ length: 100 }, () => pluginRelease) });
  assert((await service.checkForAppUpdate()).isLatest, "a long plugin release history must not hide application releases on later pages");
  context.fetch = async (url) => String(url).endsWith("/latest") ? { ok: false, status: 404, json: async () => ({}) } :
    { ok: true, json: async () => [release] };
  assert((await service.checkForAppUpdate()).isLatest, "a missing Latest marker must still find stable application releases");
  await assert.rejects(service.checkForAppUpdate({ mockRelease: pluginRelease }), (error) => error.code === "NO_RELEASE_FOUND");
  context.fetch = async () => ({ ok: true, json: async () => release });
  assert((await service.checkForAppUpdate()).isLatest, "the normal latest application release must recover after the fallback path");
  context.fetch = async (url) => ({ ok: true, json: async () => String(url).endsWith("/latest") ? pluginRelease : [pluginRelease] });
  await assert.rejects(service.checkForAppUpdate(), (error) => error.code === "NO_RELEASE_FOUND");
  context.fetch = async () => ({ ok: false, status: 403, json: async () => ({ message: "rate limited" }) });
  await assert.rejects(service.checkForAppUpdate(), (error) => error.code === "RATE_LIMITED");
  context.fetch = async () => ({ ok: true, json: async () => release });
  assert((await service.checkForAppUpdate()).isLatest, "update check must recover after a network failure");
  console.log("[check-update-service] platform installers, app/plugin release isolation, and failure recovery passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
