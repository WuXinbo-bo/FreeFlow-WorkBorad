const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const pngToIco = require("png-to-ico");

const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_ICON_PNG = path.join(ROOT_DIR, "public", "assets", "brand", "FreeFlow_app_icon.png");
const SOURCE_ICON_SVG = path.join(ROOT_DIR, "public", "assets", "brand", "FreeFlow_logo.svg");
const BUILD_DIR = path.join(ROOT_DIR, "build");
const PNG_ICON = path.join(BUILD_DIR, "icon.png");
const ICO_ICON = path.join(BUILD_DIR, "icon.ico");
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_BLACK_ALPHA_THRESHOLD = 18;

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function stripBlackBackground(buffer, info, threshold = PNG_BLACK_ALPHA_THRESHOLD) {
  const channels = Number(info?.channels || 4);
  if (channels < 4) {
    return buffer;
  }

  for (let index = 0; index < buffer.length; index += channels) {
    const red = buffer[index];
    const green = buffer[index + 1];
    const blue = buffer[index + 2];
    const alpha = buffer[index + 3];

    if (alpha === 0) {
      continue;
    }

    if (red <= threshold && green <= threshold && blue <= threshold) {
      buffer[index + 3] = 0;
    }
  }

  return buffer;
}

async function main() {
  const sourcePath = (await fileExists(SOURCE_ICON_PNG)) ? SOURCE_ICON_PNG : SOURCE_ICON_SVG;

  if (!(await fileExists(sourcePath))) {
    throw new Error(`缺少源图标: ${sourcePath}`);
  }

  await ensureDir(BUILD_DIR);

  // The source logo is exported from a large SVG artboard with transparent margins.
  // Trim it first so Windows ICO sizes keep the actual mark visible.
  let rasterizedBuffer = await sharp(sourcePath, {
    density: 256,
    limitInputPixels: false,
  })
    .ensureAlpha()
    .png()
    .toBuffer();

  if (path.extname(sourcePath).toLowerCase() === ".png") {
    const raw = await sharp(rasterizedBuffer, {
      limitInputPixels: false,
    })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    stripBlackBackground(raw.data, raw.info);

    rasterizedBuffer = await sharp(raw.data, {
      raw: raw.info,
      limitInputPixels: false,
    })
      .png()
      .toBuffer();
  }

  const trimmedBuffer = await sharp(rasterizedBuffer, {
    limitInputPixels: false,
  })
    .trim()
    .png()
    .toBuffer();

  const base = sharp(trimmedBuffer);

  await base
    .clone()
    .resize(512, 512, {
      fit: "contain",
      background: "#00000000",
    })
    .png()
    .toFile(PNG_ICON);

  const pngBuffers = [];
  for (const size of ICO_SIZES) {
    const buffer = await base
      .clone()
      .resize(size, size, {
        fit: "contain",
        background: "#00000000",
      })
      .png()
      .toBuffer();
    pngBuffers.push(buffer);
  }

  const icoBuffer = await pngToIco(pngBuffers);
  await fs.writeFile(ICO_ICON, icoBuffer);

  console.log(`[generate-app-icons] generated ${path.relative(ROOT_DIR, PNG_ICON)}`);
  console.log(`[generate-app-icons] generated ${path.relative(ROOT_DIR, ICO_ICON)}`);
}

main().catch((error) => {
  console.error(`[generate-app-icons] ${error.message}`);
  process.exit(1);
});
