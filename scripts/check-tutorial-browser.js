"use strict";

const { chromium } = require("playwright");

const BASE_URL = process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:3000/?desktop=1";
const TUTORIAL_EVENT = "freeflow:tutorial-ui-event";

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

async function checkAutomaticIntroLifecycle(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
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
        await route.fulfill({ json: { ok: true, ...payload } });
        return;
      }
      await route.fulfill({
        json: {
          ok: true,
          hasShownStartupTutorial: false,
          lastTutorialIntroVersion: "",
          dismissedTutorialIntroVersion: "",
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
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await checkAutomaticIntroLifecycle(browser, false);
    await checkAutomaticIntroLifecycle(browser, true);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !document.body.classList.contains("app-booting"), null, { timeout: 15_000 });
      await page.waitForFunction(() => getComputedStyle(document.querySelector(".boot-splash")).visibility === "hidden");

    await dispatchTutorial(page, "open-global-tutorial-intro");
    await page.waitForSelector('[aria-label="欢迎使用 FreeFlow"]');
    const introContract = await page.evaluate(() => ({
      logo: Boolean(document.querySelector(".tutorial-intro-logo")),
      workspacePanels: document.querySelectorAll(".tutorial-workflow-panel").length,
      flowSteps: document.querySelectorAll(".tutorial-intro-step").length,
      inlineVisualStyles: document.querySelectorAll('[aria-label="欢迎使用 FreeFlow"] [style]').length,
    }));
    assert(
      introContract.logo && introContract.workspacePanels === 2 && introContract.flowSteps === 3 && introContract.inlineVisualStyles === 0,
      "welcome guide visual contract regressed",
      introContract
    );
    await assertDialogFits(page, '[aria-label="欢迎使用 FreeFlow"]');
    await page.locator("[data-global-tutorial-open-center]").click();

    await page.waitForSelector('[aria-label="教程中心"]');
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
    await page.locator("[data-global-tutorial-back-root]").click();
    await page.locator('[data-global-tutorial-action="canvas"]').click();
    await page.waitForSelector('.canvas2d-react-ui-host .canvas2d-tutorial-overlay-panel');
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
      await page.locator("[data-global-tutorial-close]").click();
      await page.waitForFunction(() => !document.querySelector("#global-tutorial-host .canvas2d-tutorial-layer"));
    }

    await page.setViewportSize({ width: 560, height: 720 });
    await dispatchTutorial(page, "open-global-tutorial-center");
    await page.waitForSelector('[aria-label="教程中心"]');
    await assertDialogFits(page, '[aria-label="教程中心"]');
    await page.locator("[data-global-tutorial-close]").click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await dispatchTutorial(page, "open-global-tutorial-center");
    await page.waitForSelector('[aria-label="教程中心"]');
    await assertDialogFits(page, '[aria-label="教程中心"]');
    await page.locator("[data-global-tutorial-close]").click();

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
