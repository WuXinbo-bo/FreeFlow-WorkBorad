const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { createImageThumbnailService } = require("../electron/imageThumbnailService");
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-thumbnails-"));
  try {
    const source = path.join(temp, "picture.png");
    const service = createImageThumbnailService();
    await sharp({ create: { width: 1800, height: 900, channels: 4, background: "red" } }).png().toFile(source);
    const first = await service.read(source);
    assert(first.ok, first.error);
    const metadata = await sharp(Buffer.from(first.data)).metadata();
    assert.equal(metadata.width, 160); assert.equal(metadata.height, 80);
    const batch = await Promise.all(Array.from({ length: 40 }, () => service.read(source)));
    assert(batch.some((result) => !result.ok && result.error.includes("队列已满")));
    assert.equal(batch.filter((result) => result.ok).length, 34);
    await fs.writeFile(source, "broken"); assert.equal((await service.read(source)).ok, false);
    await sharp({ create: { width: 60, height: 40, channels: 4, background: "blue" } }).png().toFile(source);
    const recovered = await service.read(source); assert(recovered.ok);
    assert.equal((await sharp(Buffer.from(recovered.data)).metadata()).width, 60, "small images must not be upscaled");
    assert.notDeepEqual(recovered.data, first.data, "changed images must not retain stale thumbnails");
    const huge = path.join(temp, "huge.png"); const handle = await fs.open(huge, "w"); await handle.truncate(17 * 1024 * 1024); await handle.close();
    assert.match((await service.read(huge)).error, /大文件/);
    assert.equal((await service.read(path.join(temp, "missing.png"))).ok, false);
    assert.equal((await service.read(path.join(temp, "script.svg"))).ok, false);
    console.log("[image-thumbnails] bounded output/concurrency/queue, oversized/corrupt/missing/unsupported input and replacement recovery passed");
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
