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
  context.fetch = async () => ({ ok: false, status: 403, json: async () => ({ message: "rate limited" }) });
  await assert.rejects(service.checkForAppUpdate(), (error) => error.code === "RATE_LIMITED");
  context.fetch = async () => ({ ok: true, json: async () => release });
  assert((await service.checkForAppUpdate()).isLatest, "update check must recover after a network failure");
  console.log("[check-update-service] previous-version upgrade, exact installer, and failure recovery passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
