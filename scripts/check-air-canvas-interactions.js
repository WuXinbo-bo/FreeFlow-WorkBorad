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
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      opacity: Number(style.opacity),
      visibility: style.visibility,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      hitInside: Boolean(hit && element.contains(hit)),
    };
  });
}

async function readEdgeRail(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    const indicator = getComputedStyle(element, "::after");
    return {
      cursor: style.cursor,
      indicatorOpacity: Number(indicator.opacity),
    };
  });
}

async function moveAway(page, viewport) {
  await page.mouse.move(Math.max(2, viewport.width - 2), Math.round(viewport.height / 2));
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.waitForTimeout(200);
}

async function checkChromeStates(page, viewport) {
  const toolbarSelector = ".canvas2d-engine-toolbar";
  const utilitySelector = ".canvas2d-engine-search-row";
  const statusSelector = ".canvas-chrome-status-dock";
  const zoomSelector = ".canvas2d-floating-card-zoom";
  const expectedIdleBackground = "rgba(255, 255, 255, 0.58)";

  await moveAway(page, viewport);
  const toolbar = await readSurface(page, toolbarSelector);
  const utility = await readSurface(page, utilitySelector);
  const statusIdle = await readSurface(page, statusSelector);
  const zoom = await readSurface(page, zoomSelector);
  assert(toolbar.background === expectedIdleBackground, "toolbar does not use the shared idle glass token", { viewport, toolbar });
  assert(utility.background === expectedIdleBackground, "utility dock does not use the shared idle glass token", { viewport, utility });
  assert(zoom.background === expectedIdleBackground, "viewport dock does not use the shared idle glass token", { viewport, zoom });
  assert(statusIdle.background === expectedIdleBackground && statusIdle.opacity < 0.9, "status dock is not idle", {
    viewport,
    statusIdle,
  });
  for (const [name, surface] of Object.entries({ toolbar, utility, status: statusIdle, zoom })) {
    assert(Math.abs(surface.rect.height - 36) <= 0.5, `${name} dock height is unstable`, { viewport, surface });
  }
  assert(Math.abs(utility.rect.right - zoom.rect.right) <= 2, "top and bottom canvas chrome are not right-aligned", {
    viewport,
    utility: utility.rect,
    zoom: zoom.rect,
  });
  assert(Math.abs(viewport.width - statusIdle.rect.right - 18) <= 2, "global settings dock moved away from the viewport edge", {
    viewport,
    status: statusIdle.rect,
  });

  await page.locator(".canvas2d-engine-search-placeholder").hover();
  await page.waitForTimeout(200);
  const utilityHover = await readSurface(page, utilitySelector);
  assert(utilityHover.background === toolbar.background && utilityHover.opacity === toolbar.opacity, "search and download dock changed to a different surface color", {
    viewport,
    toolbar,
    utilityHover,
  });
  await moveAway(page, viewport);

  await page.locator(statusSelector).hover();
  await page.waitForTimeout(200);
  const statusHover = await readSurface(page, statusSelector);
  assert(statusHover.opacity > statusIdle.opacity && statusHover.background === "rgba(255, 255, 255, 0.8)", "status hover did not activate glass", {
    viewport,
    statusIdle,
    statusHover,
  });
  await moveAway(page, viewport);
  const statusAfterHover = await readSurface(page, statusSelector);
  assert(statusAfterHover.opacity === statusIdle.opacity && statusAfterHover.background === statusIdle.background, "status hover did not restore", {
    viewport,
    statusIdle,
    statusAfterHover,
  });

  await page.locator("#conversation-settings-btn").click();
  await page.waitForSelector("#insight-drawer.is-open");
  await page.waitForTimeout(200);
  const statusOpen = await readSurface(page, statusSelector);
  assert(statusOpen.opacity === 1 && statusOpen.background === "rgba(255, 255, 255, 0.8)", "open settings did not activate status glass", {
    viewport,
    statusOpen,
  });
  await page.evaluate(() => document.querySelector("#conversation-settings-btn")?.click());
  await page.waitForFunction(() => !document.querySelector("#insight-drawer")?.classList.contains("is-open"));
  await moveAway(page, viewport);
  const statusClosed = await readSurface(page, statusSelector);
  assert(statusClosed.opacity === statusIdle.opacity && statusClosed.background === statusIdle.background, "closing settings did not restore status glass", {
    viewport,
    statusIdle,
    statusClosed,
  });
}

async function checkEdgeRails(page, viewport) {
  const rails = ["is-top", "is-right", "is-bottom", "is-left"];
  const panel = page.locator(".desktop-clear-stage");

  for (const railClass of rails) {
    const rail = page.locator(`.desktop-clear-stage > .canvas-chrome-edge-rail.${railClass}`);
    await moveAway(page, viewport);
    const idle = await readEdgeRail(page, `.desktop-clear-stage > .canvas-chrome-edge-rail.${railClass}`);
    assert(idle.cursor === "grab" && idle.indicatorOpacity < 0.05, "edge rail is not quiet at rest", { viewport, railClass, idle });

    await rail.hover();
    await page.waitForTimeout(180);
    const hovered = await readEdgeRail(page, `.desktop-clear-stage > .canvas-chrome-edge-rail.${railClass}`);
    assert(hovered.indicatorOpacity > 0.95, "edge rail did not reveal on hover", { viewport, railClass, hovered });

    const box = await rail.boundingBox();
    assert(Boolean(box), "edge rail has no interactive bounds", { viewport, railClass });
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 6, startY + 5, { steps: 2 });
    const dragging = await page.evaluate(() => ({
      body: document.body.classList.contains("is-stage-dragging"),
      panel: document.querySelector(".desktop-clear-stage")?.classList.contains("is-stage-moving"),
    }));
    assert(dragging.body && dragging.panel, "edge drag did not enter its active state", { viewport, railClass, dragging });
    await page.mouse.up();
    await moveAway(page, viewport);
    const restored = await page.evaluate(() => ({
      body: document.body.classList.contains("is-stage-dragging"),
      resizing: document.body.classList.contains("is-resizing"),
      panel: document.querySelector(".desktop-clear-stage")?.classList.contains("is-stage-moving"),
    }));
    assert(!restored.body && !restored.resizing && !restored.panel, "edge drag state did not restore after pointer-up", { viewport, railClass, restored });
  }

  const topRail = page.locator(".desktop-clear-stage > .canvas-chrome-edge-rail.is-top");
  const topBox = await topRail.boundingBox();
  await page.mouse.move(topBox.x + topBox.width / 2, topBox.y + topBox.height / 2);
  await page.mouse.down();
  await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 })));
  await page.mouse.up();
  await moveAway(page, viewport);
  const cancelled = await page.evaluate(() => ({
    body: document.body.classList.contains("is-stage-dragging"),
    resizing: document.body.classList.contains("is-resizing"),
    panel: document.querySelector(".desktop-clear-stage")?.classList.contains("is-stage-moving"),
  }));
  assert(!cancelled.body && !cancelled.resizing && !cancelled.panel, "edge drag state did not restore after pointer-cancel", { viewport, cancelled });

  const blurBox = await topRail.boundingBox();
  await page.mouse.move(blurBox.x + blurBox.width / 2, blurBox.y + blurBox.height / 2);
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  await moveAway(page, viewport);
  const blurred = await page.evaluate(() => ({
    body: document.body.classList.contains("is-stage-dragging"),
    resizing: document.body.classList.contains("is-resizing"),
    panel: document.querySelector(".desktop-clear-stage")?.classList.contains("is-stage-moving"),
  }));
  assert(!blurred.body && !blurred.resizing && !blurred.panel, "edge drag state did not restore after window blur", { viewport, blurred });
  assert(await panel.isVisible(), "canvas panel disappeared after repeated edge drags", viewport);
}

async function checkMinimap(page, viewport) {
  const minimap = page.locator("#canvas2d-transient-minimap");
  const toggle = minimap.locator(".canvas2d-transient-minimap-toggle");
  const expanded = await minimap.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const navigatorRect = document.querySelector(".canvas2d-navigator-panel")?.getBoundingClientRect();
    const titleRect = element.querySelector(".canvas2d-transient-minimap-title")?.getBoundingClientRect();
    const canvas = element.querySelector("canvas");
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      rect: { left: rect.left, right: rect.right, width: rect.width, height: rect.height },
      navigatorRight: navigatorRect?.right || 0,
      titleHeight: titleRect?.height || 0,
      canvasHit: Boolean(canvas && hit === canvas),
      background: getComputedStyle(element).backgroundColor,
    };
  });
  assert(expanded.rect.left >= expanded.navigatorRight + 10, "current-location minimap is covered by the navigator", {
    viewport,
    expanded,
  });
  assert(expanded.rect.width >= 188 && expanded.titleHeight < 20 && expanded.canvasHit, "current-location minimap is not fully usable", {
    viewport,
    expanded,
  });
  assert(expanded.background === "rgba(255, 255, 255, 0.58)", "current-location minimap does not use shared glass", {
    viewport,
    expanded,
  });

  await toggle.click();
  await page.waitForTimeout(220);
  const collapsed = await readSurface(page, "#canvas2d-transient-minimap");
  assert(Math.abs(collapsed.rect.width - 46) <= 0.5 && Math.abs(collapsed.rect.height - 46) <= 0.5, "minimap did not collapse cleanly", {
    viewport,
    collapsed,
  });
  assert(collapsed.background === "rgba(0, 0, 0, 0)" && collapsed.boxShadow === "none", "collapsed minimap retained a white backing surface", {
    viewport,
    collapsed,
  });
  await toggle.click();
  await page.waitForTimeout(220);
  const restored = await readSurface(page, "#canvas2d-transient-minimap");
  assert(Math.abs(restored.rect.width - expanded.rect.width) <= 0.5 && Math.abs(restored.rect.height - expanded.rect.height) <= 0.5, "minimap did not restore after expanding", {
    viewport,
    expanded,
    restored,
  });

  await page.evaluate(() => {
    const button = document.querySelector(".canvas2d-transient-minimap-toggle");
    for (let index = 0; index < 4; index += 1) button?.click();
  });
  await page.waitForTimeout(220);
  assert(await minimap.locator("canvas").isVisible(), "minimap did not recover after rapid repeated toggles", viewport);
}

async function checkInfoDock(page, viewport) {
  await page.locator(".canvas2d-navigator-dock-collapse").click();
  await page.waitForTimeout(260);
  const infoSelector = ".canvas-chrome-info-dock";
  const expanded = await readSurface(page, infoSelector);
  assert(expanded.background === "rgba(255, 255, 255, 0.58)" && expanded.hitInside, "canvas information dock has no usable glass backing", {
    viewport,
    expanded,
  });

  const toggle = page.locator(".canvas2d-info-collapse-toggle");
  await toggle.click();
  await moveAway(page, viewport);
  const collapsed = await readSurface(page, infoSelector);
  assert(collapsed.rect.width <= 78.5 && collapsed.background === expanded.background, "collapsed canvas information dock lost its glass backing", {
    viewport,
    collapsed,
  });
  await toggle.click();
  await moveAway(page, viewport);
  const restored = await readSurface(page, infoSelector);
  assert(restored.rect.width >= 185 && restored.background === expanded.background, "canvas information dock did not restore", {
    viewport,
    expanded,
    restored,
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

    await checkChromeStates(page, viewport);
    await checkMinimap(page, viewport);
    await checkInfoDock(page, viewport);

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

    await checkEdgeRails(page, viewport);

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
