const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const pngToIco = require("png-to-ico");

const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_ICON_PNG = path.join(ROOT_DIR, "public", "assets", "brand", "FreeFlow_app_icon.png");
const SOURCE_ICON_SVG = path.join(ROOT_DIR, "public", "assets", "brand", "FreeFlow_logo.svg");
const BUILD_DIR = path.join(ROOT_DIR, "build");
const PNG_ICON = path.join(BUILD_DIR, "icon.png");
const MAC_PNG_ICON = path.join(BUILD_DIR, "icon-mac.png");
const ICO_ICON = path.join(BUILD_DIR, "icon.ico");
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_BLACK_ALPHA_THRESHOLD = 18;
const DESKTOP_ICON_SIZE = 512;
const DESKTOP_ICON_PADDING = 58;
const DESKTOP_ICON_RADIUS = 112;
// Legacy ICNS/Dock artwork includes its own safe area. A 1024px canvas with
// a centered 824px tile matches the visible bounds of native macOS icons.
const MAC_ICON_SIZE = 1024;
const MAC_ICON_INSET = 100;

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

  // Keep the source Logo transparent for in-app UI usage. Desktop assets use
  // a centered Logo on a white rounded tile so the mark has stable padding in
  // the macOS Dock and in Windows shortcuts.
  const logoSource = sharp(trimmedBuffer);

  async function renderDesktopIcon(size, inset = 0) {
    const tileSize = size - inset * 2;
    const padding = Math.max(2, Math.round((DESKTOP_ICON_PADDING / DESKTOP_ICON_SIZE) * tileSize));
    const radius = Math.max(2, Math.round((DESKTOP_ICON_RADIUS / DESKTOP_ICON_SIZE) * tileSize));
    const innerSize = Math.max(1, tileSize - padding * 2);
    const backgroundSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect x="${inset}" y="${inset}" width="${tileSize}" height="${tileSize}" rx="${radius}" fill="#ffffff"/></svg>`
    );
    const logoBuffer = await logoSource
      .clone()
      .resize(innerSize, innerSize, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
      .toBuffer();
    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      },
    })
      .composite([
        { input: backgroundSvg, left: 0, top: 0 },
        { input: logoBuffer, left: inset + padding, top: inset + padding },
      ])
      .png()
      .toBuffer();
  }

  await fs.writeFile(PNG_ICON, await renderDesktopIcon(DESKTOP_ICON_SIZE));
  await fs.writeFile(MAC_PNG_ICON, await renderDesktopIcon(MAC_ICON_SIZE, MAC_ICON_INSET));

  const pngBuffers = [];
  for (const size of ICO_SIZES) {
    pngBuffers.push(await renderDesktopIcon(size));
  }

  const icoBuffer = await pngToIco(pngBuffers);
  await fs.writeFile(ICO_ICON, icoBuffer);

  console.log(`[generate-app-icons] generated ${path.relative(ROOT_DIR, PNG_ICON)}`);
  console.log(`[generate-app-icons] generated ${path.relative(ROOT_DIR, MAC_PNG_ICON)}`);
  console.log(`[generate-app-icons] generated ${path.relative(ROOT_DIR, ICO_ICON)}`);
}

main().catch((error) => {
  console.error(`[generate-app-icons] ${error.message}`);
  process.exit(1);
});
