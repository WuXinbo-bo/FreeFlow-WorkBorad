"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:3000/?desktop=1";
const TUTORIAL_EVENT = "freeflow:tutorial-ui-event";
const ARTIFACT_DIR = path.resolve(__dirname, "../tmp/welcome-check");

function assert(condition, message, detail) {
  if (!condition) throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
}

async function dispatchTutorial(page, type) {
  await page.evaluate(({ eventName, eventType }) => {
    window.dispatchEvent(new CustomEvent(eventName, { detail: { type: eventType } }));
  }, { eventName: TUTORIAL_EVENT, eventType: type });
}

async function assertDialogFits(page, selector) {
  const geometry = await page.locator(selector).evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      overflow: dialog.scrollWidth - dialog.clientWidth,
    };
  });
  assert(
    geometry.left >= 0 &&
      geometry.top >= 0 &&
      geometry.right <= geometry.viewportWidth &&
      geometry.bottom <= geometry.viewportHeight &&
      geometry.overflow <= 1,
    "tutorial dialog overflowed its viewport",
    geometry
  );
}

async function assertClearTutorialBackdrop(page) {
  const backdrops = await page.locator(".canvas2d-tutorial-backdrop").evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return { backdropFilter: style.backdropFilter, filter: style.filter };
    })
  );
  assert(backdrops.length > 0 && backdrops.every((style) => style.backdropFilter === "none" && style.filter === "none"),
    "tutorial backdrop blurred the workspace", backdrops);
}

async function assertWelcomeReady(page) {
  await page.waitForSelector('.is-intro[data-welcome-state="ready"]', { timeout: 12_000 });
  await page.waitForFunction(() => document.querySelector(".is-intro img")?.naturalWidth > 0);
  const state = await page.locator(".is-intro").evaluate((dialog) => ({
    animations: dialog.getAnimations({ subtree: true }).length,
    inert: dialog.querySelectorAll("[inert]").length,
    contentVisible: [...dialog.querySelectorAll("[data-welcome-reveal]")].every((element) => getComputedStyle(element).opacity === "1"),
    logoLoaded: dialog.querySelector("img").naturalWidth > 0,
    title: dialog.querySelector("h2").textContent,
  }));
  assert(state.animations === 0 && state.inert === 0 && state.contentVisible && state.logoLoaded && state.title === "欢迎使用全新FreeFlow Air Canvas",
    "welcome did not settle into a usable final state", state);
}

async function assertWelcomeContentFits(page) {
  await assertDialogFits(page, ".is-intro");
  const layout = await page.locator(".is-intro").evaluate((dialog) => {
    const sections = [...dialog.querySelectorAll(".tutorial-intro-brand, [data-welcome-reveal]")];
    const rects = sections.map((element) => element.getBoundingClientRect());
    const clipped = [...dialog.querySelectorAll("h2, p, strong, small, button")].some((element) => element.scrollWidth > element.clientWidth + 1);
    return {
      overlap: rects.some((rect, index) => index > 0 && rect.top < rects[index - 1].bottom - 1),
      clipped,
      verticalOverflow: dialog.scrollHeight > dialog.clientHeight + 1,
    };
  });
  assert(!layout.overlap && !layout.clipped, "welcome content overlapped or clipped", layout);
  if (page.viewportSize().height >= 640) assert(!layout.verticalOverflow, "welcome required scrolling on a regular viewport", layout);
}

async function checkAutomaticIntroLifecycle(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  let savedSettings = { hasShownStartupTutorial: false, lastTutorialIntroVersion: "", dismissedTutorialIntroVersion: "" };
  try {
    await page.addInitScript(() => {
      window.__tutorialBootLifecycle = { ready: 0, released: 0 };
      window.desktopShell = {
        isDesktop: true,
        async getStartupContext() {
          return {
            ok: true,
            uiSettings: {
              hasShownStartupTutorial: false,
              lastTutorialIntroVersion: "",
              dismissedTutorialIntroVersion: "",
            },
            workbenchPreferences: {},
            startup: { shouldOpenStartupTutorial: true },
          };
        },
        notifyRendererReady() {
          window.__tutorialBootLifecycle.ready += 1;
        },
        async releaseBootShapeLock() {
          window.__tutorialBootLifecycle.released += 1;
          return { ok: true };
        },
      };
    });
    await page.route("**/api/ui-settings", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        const payload = request.postDataJSON();
        savedSettings = payload;
        await route.fulfill({ json: { ok: true, ...payload } });
        return;
      }
      await route.fulfill({
        json: {
          ok: true,
          ...savedSettings,
        },
      });
    });

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[aria-label="欢迎使用 FreeFlow"]', { timeout: 15_000 });
    const entered = await page.evaluate(() => {
      const splash = document.querySelector(".boot-splash");
      const intro = document.querySelector('[aria-label="欢迎使用 FreeFlow"]');
      return {
        booting: document.body.classList.contains("app-booting"),
        shapeLocked: document.body.classList.contains("boot-shape-lock"),
        splashOpacity: Number(getComputedStyle(splash).opacity),
        splashVisibility: getComputedStyle(splash).visibility,
        introVisible: Boolean(intro && getComputedStyle(intro).visibility !== "hidden"),
        lifecycle: { ...window.__tutorialBootLifecycle },
      };
    });
    assert(
      !entered.booting &&
        !entered.shapeLocked &&
        entered.splashOpacity === 0 &&
        entered.splashVisibility === "hidden" &&
        entered.introVisible &&
        entered.lifecycle.ready === 1 &&
        entered.lifecycle.released === 1,
      `${reducedMotion ? "reduced-motion" : "animated"} automatic welcome overlapped startup`,
      entered
    );

    if (!reducedMotion) {
      // Interrupt before completion, then immediately reopen. Old timelines must be cancelled.
      for (let index = 0; index < 3; index += 1) {
        await page.waitForSelector('.is-intro[data-welcome-state="playing"]');
        await page.evaluate(() => { window.__oldWelcomeAnimations = document.querySelector(".is-intro").getAnimations({ subtree: true }); });
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !document.querySelector(".is-intro"));
        assert(await page.evaluate(() => window.__oldWelcomeAnimations.every((animation) => animation.playState === "idle")), "closing welcome left animations running");
        await dispatchTutorial(page, "open-global-tutorial-intro");
      }
      const startRect = await page.locator(".is-intro").boundingBox();
      const opening = await page.locator(".is-intro").evaluate((dialog) => {
        const panel = dialog.getBoundingClientRect();
        const brand = dialog.querySelector(".tutorial-intro-brand").getBoundingClientRect();
        const paths = [...dialog.querySelectorAll(".tutorial-intro-wordmark path")];
        return {
          centered: Math.abs(brand.y + brand.height / 2 - panel.y - panel.height / 2) < 2,
          hiddenStrokes: paths.every((element) => Number(getComputedStyle(element).opacity) === 0),
          hiddenContent: [...dialog.querySelectorAll("[data-welcome-reveal]")].every((element) => element.inert && Number(getComputedStyle(element).opacity) === 0),
        };
      });
      assert(opening.centered && opening.hiddenStrokes && opening.hiddenContent, "opening scene was not centered or leaked future strokes/content", opening);
      await page.waitForTimeout(1700);
      const writing = await page.screenshot({ path: path.join(ARTIFACT_DIR, "desktop-writing.png") });
      const strokeState = await page.locator(".tutorial-intro-wordmark path").evaluateAll((paths) => paths.map((element) => ({
        opacity: Number(getComputedStyle(element).opacity), offset: parseFloat(getComputedStyle(element).strokeDashoffset),
      })));
      assert(strokeState.some((stroke) => stroke.opacity === 1 && stroke.offset === 0) && strokeState.filter((stroke) => stroke.opacity > 0 && stroke.offset > 0).length <= 1,
        "handwriting drew multiple strokes simultaneously", strokeState);
      await page.waitForTimeout(2900);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "desktop-brand-hold.png") });
      await assertWelcomeReady(page);
      const final = await page.screenshot({ path: path.join(ARTIFACT_DIR, "desktop-ready.png") });
      assert(!writing.equals(final), "welcome animation produced identical frames");
      const endRect = await page.locator(".is-intro").boundingBox();
      assert(JSON.stringify(startRect) === JSON.stringify(endRect), "welcome panel resized during its animation", { startRect, endRect });
    } else {
      await assertWelcomeReady(page);
      assert(await page.locator("[data-welcome-skip]").isHidden(), "reduced motion retained the animation control");
    }
    await assertWelcomeContentFits(page);

    await page.locator("[data-global-tutorial-dismiss-intro]").click();
    await page.waitForSelector('[aria-label="教程入口提示"]');
    await page.locator("[data-global-tutorial-later-confirm]").click();
    await page.waitForFunction(() => !document.querySelector("#global-tutorial-host .canvas2d-tutorial-layer"));
    const exited = await page.evaluate(() => ({
      booting: document.body.classList.contains("app-booting"),
      shapeLocked: document.body.classList.contains("boot-shape-lock"),
      pageVisibility: getComputedStyle(document.querySelector(".page-shell")).visibility,
    }));
    assert(
      !exited.booting && !exited.shapeLocked && exited.pageVisibility === "visible",
      "closing the automatic welcome did not restore the workspace",
      exited
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".boot-splash")).visibility === "hidden");
    assert(await page.locator(".is-intro").count() === 0, "confirmed welcome reopened on the same version");
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    await checkAutomaticIntroLifecycle(browser, false);
    await checkAutomaticIntroLifecycle(browser, true);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    try {
      await page.route("**/api/ui-settings", async (route) => {
        await route.fulfill({ json: { ok: true, ...(route.request().method() === "POST" ? route.request().postDataJSON() : {}) } });
      });
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !document.body.classList.contains("app-booting"), null, { timeout: 15_000 });
      await page.waitForFunction(() => getComputedStyle(document.querySelector(".boot-splash")).visibility === "hidden");

    await dispatchTutorial(page, "open-global-tutorial-intro");
    await page.waitForSelector('[aria-label="欢迎使用 FreeFlow"]');
    const introContract = await page.evaluate(() => ({
      logo: Boolean(document.querySelector(".tutorial-intro-logo")),
      workspacePanels: document.querySelectorAll(".tutorial-workflow-panel").length,
      width: document.querySelector('[aria-label="欢迎使用 FreeFlow"]').getBoundingClientRect().width,
      flowSteps: document.querySelectorAll(".tutorial-intro-step").length,
      inlineVisualStyles: document.querySelectorAll('[aria-label="欢迎使用 FreeFlow"] [style]').length,
    }));
    assert(
      introContract.logo && introContract.workspacePanels === 0 && introContract.width === 880 && introContract.flowSteps === 3 && introContract.inlineVisualStyles === 0,
      "welcome guide visual contract regressed",
      introContract
    );
    await assertDialogFits(page, '[aria-label="欢迎使用 FreeFlow"]');
    await assertClearTutorialBackdrop(page);
    await page.locator("[data-welcome-skip]").click();
    await assertWelcomeReady(page);
    assert(await page.locator("[data-global-tutorial-open-center]").evaluate((element) => element === document.activeElement), "skipping did not focus the primary action");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    assert(await page.locator("[data-global-tutorial-close]").evaluate((element) => element === document.activeElement), "welcome keyboard focus escaped the dialog");
    await page.locator("[data-global-tutorial-open-center]").click();

    await page.waitForSelector('[aria-label="教程中心"]');
    await assertClearTutorialBackdrop(page);
    const centerContract = await page.evaluate(() => ({
      tutorialCards: document.querySelectorAll(".tutorial-center-card").length,
      progressBars: document.querySelectorAll(".tutorial-center-card progress").length,
      sampleBoardAction: Boolean(document.querySelector("[data-global-tutorial-open-board]")),
      shortcutAction: Boolean(document.querySelector('[data-global-tutorial-action="shortcut-guide"]')),
    }));
    assert(
      centerContract.tutorialCards === 3 && centerContract.progressBars === 3 && centerContract.sampleBoardAction && centerContract.shortcutAction,
      "tutorial center information architecture regressed",
      centerContract
    );

    await page.locator('[data-global-tutorial-action="shortcut-guide"]').click();
    await page.waitForSelector('[aria-label="快捷键说明"]');
    await assertClearTutorialBackdrop(page);
    await page.locator("[data-global-tutorial-back-root]").click();
    await page.locator('[data-global-tutorial-action="canvas"]').click();
    await page.waitForSelector('.canvas2d-react-ui-host .canvas2d-tutorial-overlay-panel');
    await assertClearTutorialBackdrop(page);
    const stageContract = await page.evaluate(() => ({
      progress: Boolean(document.querySelector(".canvas2d-react-ui-host .tutorial-step-progress")),
      chapter: document.querySelector(".canvas2d-react-ui-host .canvas2d-tutorial-overlay-chapter")?.textContent.trim(),
      title: document.querySelector(".canvas2d-react-ui-host .canvas2d-tutorial-overlay-title")?.textContent.trim(),
    }));
    assert(stageContract.progress && stageContract.chapter && stageContract.title, "canvas tutorial step panel is incomplete", stageContract);
    await page.locator('.canvas2d-react-ui-host .canvas2d-tutorial-overlay-close').click();
    await page.waitForFunction(() => !document.querySelector(".canvas2d-react-ui-host .canvas2d-tutorial-layer"));

    for (let index = 0; index < 3; index += 1) {
      await dispatchTutorial(page, "open-global-tutorial-center");
      await page.waitForSelector('[aria-label="教程中心"]');
      await page.locator('[data-global-tutorial-action="main-shell"]').click();
      await page.waitForSelector('[data-global-tutorial-panel]');
      await assertClearTutorialBackdrop(page);
      await page.locator('[data-global-tutorial-next]').click();
      await assertClearTutorialBackdrop(page);
      await page.locator('[data-global-tutorial-prev]').click();
      await assertClearTutorialBackdrop(page);
      await page.locator("[data-global-tutorial-close]").click();
      await page.waitForFunction(() => !document.querySelector("#global-tutorial-host .canvas2d-tutorial-layer"));
    }

    await page.setViewportSize({ width: 560, height: 720 });
    await dispatchTutorial(page, "open-global-tutorial-intro");
    await page.waitForSelector('[aria-label="欢迎使用 FreeFlow"]');
    await assertDialogFits(page, '[aria-label="欢迎使用 FreeFlow"]');
    await assertClearTutorialBackdrop(page);
    await page.locator('[data-global-tutorial-open-center]').click();
    await dispatchTutorial(page, "open-global-tutorial-center");
    await page.waitForSelector('[aria-label="教程中心"]');
    await assertDialogFits(page, '[aria-label="教程中心"]');
    await page.locator("[data-global-tutorial-close]").click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await dispatchTutorial(page, "open-global-tutorial-center");
    await page.waitForSelector('[aria-label="教程中心"]');
    await assertDialogFits(page, '[aria-label="教程中心"]');
    await page.locator("[data-global-tutorial-close]").click();

    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }, { width: 1024, height: 640 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await dispatchTutorial(page, "open-global-tutorial-intro");
      await assertWelcomeReady(page);
      await assertWelcomeContentFits(page);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `welcome-${viewport.width}x${viewport.height}.png`) });
      if (viewport.height < 580) {
        await page.locator("[data-global-tutorial-dismiss-intro]").click();
        await page.locator("[data-global-tutorial-later-confirm]").click();
      } else {
        await page.locator("[data-global-tutorial-close]").click();
      }
      await page.waitForFunction(() => !document.querySelector("#global-tutorial-host .canvas2d-tutorial-layer"));
    }

    // Enabling reduced motion mid-scene must reveal usable content immediately.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('.is-intro[data-welcome-state="playing"]');
    await page.emulateMedia({ reducedMotion: "reduce" });
    await assertWelcomeReady(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await assertWelcomeReady(page);
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('.is-intro[data-welcome-state="playing"]');
    await page.setViewportSize({ width: 390, height: 844 });
    await assertWelcomeReady(page);
    await assertWelcomeContentFits(page);
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((element) => !element.disabled && element.getBoundingClientRect().width > 0 && getComputedStyle(element).visibility === "visible");
      button.focus();
      window.__welcomeReturnFocus = button;
    });
    await dispatchTutorial(page, "open-global-tutorial-intro");
    await assertWelcomeReady(page);
    await page.keyboard.press("Escape");
    assert(await page.evaluate(() => document.activeElement === window.__welcomeReturnFocus), "closing welcome did not restore the original focus");

      assert(pageErrors.length === 0, "tutorial interactions caused page errors", pageErrors);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log("[check-tutorial-browser] Welcome, tutorial center, canvas steps, recovery, and responsive layout passed");
}

main().catch((error) => {
  console.error(`[check-tutorial-browser] ${error.stack || error.message}`);
  process.exitCode = 1;
});
