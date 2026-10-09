const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");

async function main() {
  const { data, info } = await sharp(path.join(root, "build", "icon-mac.png"))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1024);
  assert.equal(info.height, 1024);
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      if (data[offset + 3] < 240) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  // This catches the previous full-canvas tile even when corners are rounded.
  assert.deepEqual([left, top, right, bottom], [100, 100, 923, 923]);
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  assert.equal(pixel(512, 0)[3], 0, "top safe area must be transparent");
  assert.equal(pixel(0, 512)[3], 0, "left safe area must be transparent");
  assert.equal(pixel(100, 100)[3], 0, "rounded corner must be transparent");
  assert.deepEqual(pixel(512, 110), [255, 255, 255, 255], "tile must retain its white background");
  assert.deepEqual(pixel(512, 910), [255, 255, 255, 255]);
  const config = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(config.build.mac.icon, "build/icon-mac.png", "packaging must use the Mac artwork");
  assert.equal(config.build.win.icon, "build/icon.ico", "Windows must keep its own artwork");
  const source = fs.readFileSync(path.join(root, "electron", "main.js"), "utf8");
  const resolver = source.slice(source.indexOf("function resolveAppIconPath()"), source.indexOf("function applyMacOSDockIcon()"));
  assert.match(resolver, /"build", "icon-mac\.png"/);
  assert.doesNotMatch(resolver, /"build", "icon\.png"/);
  assert.doesNotMatch(resolver, /"build", "icon\.icns"/, "stale development ICNS must not override the Mac artwork");
  console.log("[check-macos-icons] 1024px artwork, 80.47% tile, transparent safe area and Dock/package sources passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
