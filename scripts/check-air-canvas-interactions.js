const { chromium } = require("playwright");

const BASE_URL = process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:3000/?desktop=1";
const VIEWPORTS = [
  { width: 1600, height: 1000 },
  { width: 900, height: 900 },
  { width: 680, height: 820 },
];

function assert(condition, message, detail) {
  if (!condition) {
    throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
  }
}

async function readSurface(page, selector) {
  return page.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      background: style.backgroundColor,
      opacity: Number(style.opacity),
      visibility: style.visibility,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      hitInside: Boolean(hit && element.contains(hit)),
    };
  });
}

async function checkViewport(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message || error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".canvas2d-engine-toolbar", { timeout: 15_000 });

    const toolbar = await readSurface(page, ".canvas2d-engine-toolbar");
    const zoom = await readSurface(page, ".canvas2d-floating-card-zoom");
    const stageControls = await readSurface(page, ".stage-panel-controls");
    assert(toolbar.background === "rgba(0, 0, 0, 0)", "toolbar retained a background", { viewport, toolbar });
    assert(zoom.background === "rgba(0, 0, 0, 0)", "zoom controls retained a background", { viewport, zoom });
    assert(stageControls.background === "rgba(0, 0, 0, 0)", "stage controls retained a background", {
      viewport,
      stageControls,
    });

    const shareButton = page.locator('.canvas2d-engine-tool[title="分享"]');
    await shareButton.click();
    const shareMenu = page.locator(".canvas2d-engine-menu-share");
    await shareMenu.getByRole("menuitem", { name: "导出 PDF" }).click();
    assert(await shareMenu.getByRole("menuitem", { name: "标准" }).isVisible(), "PDF submenu did not open", viewport);
    await shareMenu.getByRole("menuitem", { name: "导出 PNG" }).click();
    assert((await shareMenu.getByRole("menuitem", { name: "标准" }).count()) === 1, "share submenus were not exclusive", viewport);
    const shareSurface = await readSurface(page, ".canvas2d-engine-menu-share");
    assert(shareSurface.background === "rgb(255, 255, 255)" && shareSurface.hitInside, "share menu is not a usable white surface", {
      viewport,
      shareSurface,
    });
    await shareButton.click();

    const menuButton = page.locator('.canvas2d-engine-tool[title="菜单"]');
    const menu = page.locator(".canvas2d-engine-tool-group > .canvas2d-engine-menu-wide");
    await menuButton.click();
    await menu.getByRole("menuitem", { name: "自动对齐吸附" }).click();
    assert(await menu.getByRole("menuitemcheckbox", { name: /启用自动吸附/ }).isVisible(), "alignment submenu did not open", viewport);
    await menu.getByRole("menuitem", { name: "背景" }).click();
    assert((await menu.getByRole("menuitem", { name: "自动对齐吸附" }).getAttribute("aria-expanded")) === "false", "alignment submenu did not close", viewport);
    assert(await menu.getByRole("menuitemradio", { name: /无背景/ }).isVisible(), "background submenu did not open", viewport);
    await menu.getByRole("menuitem", { name: "关于画布" }).click();
    assert((await menu.getByRole("menuitem", { name: "背景" }).getAttribute("aria-expanded")) === "false", "background submenu did not close", viewport);
    assert(await menu.locator(".canvas2d-engine-menu-group-about").isVisible(), "about submenu did not open", viewport);
    const menuSurface = await readSurface(page, ".canvas2d-engine-tool-group > .canvas2d-engine-menu-wide");
    assert(menuSurface.background === "rgb(255, 255, 255)" && menuSurface.hitInside, "main menu is not a usable white surface", {
      viewport,
      menuSurface,
    });
    assert(menuSurface.rect.bottom <= viewport.height, "main menu extends below the viewport", { viewport, menuSurface });
    await menuButton.click();

    const zoomText = page.locator(".canvas2d-zoom-display strong");
    const initialZoom = await zoomText.textContent();
    await page.locator('.canvas2d-zoom-btn[title="放大"]').click();
    await page.waitForFunction(
      (previousZoom) => document.querySelector(".canvas2d-zoom-display strong")?.textContent !== previousZoom,
      initialZoom
    );
    assert((await zoomText.textContent()) !== initialZoom, "zoom in did not update the view", viewport);
    await page.locator('.canvas2d-zoom-btn[title="重置视图"]').click();
    assert((await zoomText.textContent()) === initialZoom, "reset view did not restore the zoom", viewport);
    await page.locator('.canvas2d-zoom-btn[title="适配全部内容"]').click();

    for (let index = 0; index < 8; index += 1) {
      await page.evaluate(() => {
        document.documentElement.classList.add("desktop-full-pass-through");
        document.body.classList.add("desktop-full-pass-through");
        document.documentElement.classList.remove("desktop-full-pass-through");
        document.body.classList.remove("desktop-full-pass-through");
      });
    }
    await page.evaluate(() => {
      document.documentElement.classList.add("desktop-full-pass-through");
      document.body.classList.add("desktop-full-pass-through");
    });
    const passThrough = await page.evaluate(() => ({
      htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      stageVisibility: getComputedStyle(document.querySelector(".desktop-clear-stage")).visibility,
    }));
    assert(passThrough.htmlBackground === "rgba(0, 0, 0, 0)", "root background remained visible in pass-through", {
      viewport,
      passThrough,
    });
    assert(passThrough.bodyBackground === "rgba(0, 0, 0, 0)" && passThrough.stageVisibility === "hidden", "canvas remained visible in pass-through", {
      viewport,
      passThrough,
    });
    await page.evaluate(() => {
      document.documentElement.classList.remove("desktop-full-pass-through");
      document.body.classList.remove("desktop-full-pass-through");
    });
    await page.waitForTimeout(180);
    const restored = await readSurface(page, ".desktop-clear-stage");
    assert(restored.visibility === "visible" && restored.opacity > 0.99, "canvas did not restore after pass-through", {
      viewport,
      restored,
    });
    assert(errors.length === 0, "page errors detected", { viewport, errors });
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      await checkViewport(browser, viewport);
    }
  } finally {
    await browser.close();
  }
  console.log("[air-canvas] interaction checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
