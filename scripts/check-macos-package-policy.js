const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getFileMatchers, getNodeModuleFileMatcher } = require("app-builder-lib/out/fileMatcher");
const prepareMacosPackage = require("./prepare-macos-package");
const build = require("../package.json").build;
const ROOT = path.resolve(__dirname, "..");

async function main() {
  assert(!build.mac?.files, "Do not create a second exclusion-only Mac matcher");
  for (const platform of ["darwin", "win32"]) {
    const config = { ...build, files: [{ filter: [...build.files] }] };
    await prepareMacosPackage({ electronPlatformName: platform, packager: { config } });
    const matchers = getFileMatchers(config, "files", "/output", { defaultSrc: ROOT, macroExpander: value => value, customBuildOptions: {}, globalOutDir: "/output" });
    assert.equal(matchers.length, 1, "Platform exclusions introduced a catch-all matcher");
    const filter = matchers[0].createFilter();
    for (const file of ["release/old/app.asar", ".tools/node/bin/node", ".codegraph/codegraph.db", "data/ui-settings.json"]) {
      assert.equal(filter(path.join(ROOT, file), { isDirectory: () => false }), false, `Local file leaked: ${file}`);
    }
    assert(filter(path.join(ROOT, "server.js"), fs.statSync(path.join(ROOT, "server.js"))));
    const modules = getNodeModuleFileMatcher(ROOT, "/output", value => value, {}, { config, debugLogger: { isEnabled: false } });
    const koffi = path.join(ROOT, "node_modules/koffi/package.json");
    assert.equal(modules.createFilter()(koffi, fs.statSync(koffi)), platform === "win32", "Koffi platform boundary changed");
  }
  console.log("[macos-package-policy] Mac excludes Koffi; Windows retains it; whitelist rejects old builds, tools and user data");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
