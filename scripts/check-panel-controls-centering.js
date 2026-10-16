"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const measurements = [];
const panelSelector = (side) => side === "left" ? ".desktop-clear-stage" : ".conversation-panel";
const controlsSelector = (side) => `[data-stage-panel-controls="${side}"]`;
const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const near = (actual, expected, message, detail) => assert(Math.abs(actual - expected) <= 0.35, `${message}: ${JSON.stringify(detail)}`);

async function readControls(page, side) {
  return page.locator(controlsSelector(side)).evaluate((root) => {
    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2 };
    };
    return {
      backing: rect(root),
      buttons: [...root.querySelectorAll("button")].map((button) => {
        const icons = [...button.querySelectorAll(".ui-control-icon")].filter((element) => getComputedStyle(element).display !== "none");
        const svg = icons[0]?.querySelector("svg");
        const bounds = rect(button);
        const style = getComputedStyle(button);
        return {
          label: button.getAttribute("aria-label"), button: bounds, iconCount: icons.length,
          icon: icons[0] ? rect(icons[0]) : null, svg: svg ? rect(svg) : null,
          focused: document.activeElement === button, focusVisible: button.matches(":focus-visible"),
          outline: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth),
          hit: button.contains(document.elementFromPoint(bounds.cx, bounds.cy)),
        };
      }),
    };
  });
}

function assertCentered(result, label) {
  assert.equal(result.buttons.length, 3, label);
  for (const item of result.buttons) {
    assert.equal(item.iconCount, 1, `${label}: only the current presentation icon should be visible`);
    assert(item.hit, `${label}: button is covered: ${item.label}`);
    near(item.button.width, item.button.height, `${label}: square hit area`, item);
    near(item.button.cy, result.backing.cy, `${label}: button/backing vertical center`, item);
    for (const type of ["icon", "svg"]) {
      near(item[type].cx, item.button.cx, `${label}: ${type} horizontal center`, item);
      near(item[type].cy, item.button.cy, `${label}: ${type} vertical center`, item);
    }
  }
  const first = result.buttons[0].button;
  const last = result.buttons.at(-1).button;
  near((first.x + last.x + last.width) / 2, result.backing.cx, `${label}: button group/backing horizontal center`, result);
}

function assertStable(before, after, label) {
  for (const property of ["x", "y", "width", "height"]) {
    near(after.backing[property], before.backing[property], `${label}: backing ${property} changed`, { before, after });
    after.buttons.forEach((item, index) => near(item.button[property], before.buttons[index].button[property], `${label}: button ${property} changed`, { before, after }));
  }
}

async function checkControls(page, side, label) {
  await page.mouse.move(800, 850);
  await page.evaluate(() => document.activeElement?.blur());
  await settle(page);
  const baseline = await readControls(page, side);
  assertCentered(baseline, label);
  const buttons = page.locator(`${controlsSelector(side)} button`);
  for (let index = 0; index < 3; index += 1) {
    const button = buttons.nth(index);
    await button.hover();
    await settle(page);
    const hover = await readControls(page, side);
    assertCentered(hover, `${label}/hover-${index}`);
    assertStable(baseline, hover, `${label}/hover-${index}`);
    await page.keyboard.press("Tab");
    await button.focus();
    const focused = await readControls(page, side);
    assertCentered(focused, `${label}/focus-${index}`);
    assertStable(baseline, focused, `${label}/focus-${index}`);
    assert(focused.buttons[index].focused && focused.buttons[index].focusVisible && focused.buttons[index].outline !== "none" && focused.buttons[index].outlineWidth >= 1, `${label}: keyboard focus indicator missing: ${JSON.stringify(focused.buttons[index])}`);
  }
  measurements.push({ label, ...baseline });
}

async function cycleModes(page, side, label) {
  const button = page.locator(`[data-stage-panel-action="presentation"][data-stage-panel-side="${side}"]`);
  const panel = page.locator(panelSelector(side));
  for (const mode of [side === "left" ? "half-left" : "half-right", "maximized", "normal"]) {
    await button.click();
    await page.waitForFunction(({ selector, mode }) => document.querySelector(selector)?.dataset.workspaceMode === mode, { selector: panelSelector(side), mode });
    await settle(page);
    await checkControls(page, side, `${label}/${mode}`);
  }
  assert.equal(await panel.getAttribute("data-workspace-mode"), "normal");
}

async function checkContext(browser, url, deviceScaleFactor) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.addInitScript(() => {
      window.desktopShell = { isDesktop: true, listAiMirrorTargets: async () => ({ ok: true, targets: [] }) };
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__canvas2dEngine && !document.body.classList.contains("app-booting"));
    await page.evaluate(() => window.__canvas2dEngine.whenReady());
    const original = await page.evaluate(() => {
      const snapshot = window.__canvas2dEngine.getSnapshot();
      return { board: JSON.stringify(snapshot.board), dirty: snapshot.boardDirty };
    });
    for (const side of ["left", "right"]) {
      await checkControls(page, side, `DPR${deviceScaleFactor}/${side}/normal`);
      await cycleModes(page, side, `DPR${deviceScaleFactor}/${side}`);
      await page.locator(`[data-stage-panel-action="close"][data-stage-panel-side="${side}"]`).click();
      await page.locator(`#restore-${side}-pane-btn`).click();
      await checkControls(page, side, `DPR${deviceScaleFactor}/${side}/restored`);
    }
    const panel = page.locator(panelSelector("right"));
    const before = await panel.boundingBox();
    const handle = await page.locator("#right-pane-resizer").boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + before.width - 400, handle.y + handle.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector(".conversation-panel")?.classList.contains("is-header-compact"));
    await checkControls(page, "right", `DPR${deviceScaleFactor}/right/compact`);
    await cycleModes(page, "right", `DPR${deviceScaleFactor}/right/compact-cycle`);
    assert(await panel.evaluate((element) => element.classList.contains("is-header-compact")), "compact state did not restore after fullscreen");
    if (process.env.FREEFLOW_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.FREEFLOW_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.FREEFLOW_SCREENSHOT_DIR, `panel-controls-dpr-${deviceScaleFactor}.png`) });
    }
    const current = await page.evaluate(() => {
      const snapshot = window.__canvas2dEngine.getSnapshot();
      return { board: JSON.stringify(snapshot.board), dirty: snapshot.boardDirty };
    });
    assert.deepEqual(current, original, "panel controls changed canvas content");
    assert.deepEqual(errors, [], "panel controls generated browser errors");
  } finally { await context.close(); }
}

async function main() {
  let backend;
  let temporaryRoot;
  let browser;
  let url = process.env.AIR_CANVAS_TEST_URL;
  try {
    if (!url) {
      temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-control-centering-"));
      const dataDir = path.join(temporaryRoot, "AppData");
      Object.assign(process.env, {
        FREEFLOW_HOME_DIR: temporaryRoot, FREEFLOW_USER_DATA_DIR: dataDir,
        FREEFLOW_CANVAS_BOARD_DIR: path.join(temporaryRoot, "Boards"), FREEFLOW_CACHE_DIR: path.join(temporaryRoot, "Cache"),
        FREEFLOW_RUNTIME_DIR: path.join(temporaryRoot, "Runtime"), FREEFLOW_TEMP_DRAG_DIR: path.join(temporaryRoot, "Drag"),
        FREEFLOW_LEGACY_PROJECT_DATA_DIR: path.join(temporaryRoot, "Legacy"), FREEFLOW_ASSISTANT_CATALOG_URL: "",
      });
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(path.join(dataDir, "ui-settings.json"), JSON.stringify({
        defaultLaunchFullscreen: false, hasShownStartupTutorial: true,
        lastTutorialIntroVersion: "2.0.2", dismissedTutorialIntroVersion: "2.0.2",
      }));
      backend = require("../server");
      const server = await backend.startServer(0);
      url = `http://127.0.0.1:${server.address().port}/?desktop=1`;
    }
    browser = await chromium.launch({ headless: true });
    for (const ratio of [1, 1.5, 2]) await checkContext(browser, url, ratio);
    const maxOffset = Math.max(...measurements.flatMap((result) => result.buttons.map((item) => Math.hypot(item.svg.cx - item.button.cx, item.svg.cy - item.button.cy))));
    console.log(`[check-panel-controls-centering] ${measurements.length} full-app layouts passed at DPR 1/1.5/2; normal/half/fullscreen/compact/restore, hover and keyboard focus stable; maximum SVG offset ${maxOffset.toFixed(3)}px`);
  } finally {
    await browser?.close();
    await backend?.stopServer();
    if (temporaryRoot) await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
