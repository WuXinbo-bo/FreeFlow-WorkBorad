"use strict";

const { chromium } = require("playwright");

const BASE_URL = process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:3000/?desktop=1";
const VIEWPORT = { width: 1440, height: 900 };

function assert(condition, message, detail) {
  if (!condition) {
    throw new Error(`${message}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
  }
}

async function installDesktopStub(page, { stallStartup = false } = {}) {
  await page.addInitScript(({ shouldStallStartup }) => {
    const lifecycle = { ready: 0, released: 0, reloads: 0 };
    window.__freeflowStartupLifecycle = lifecycle;
    window.desktopShell = {
      isDesktop: true,
      notifyRendererReady() {
        lifecycle.ready += 1;
      },
      async releaseBootShapeLock() {
        lifecycle.released += 1;
        return { ok: true };
      },
      onBootstrapTimeout(listener) {
        window.__triggerFreeFlowBootstrapTimeout = listener;
        return () => {
          window.__triggerFreeFlowBootstrapTimeout = null;
        };
      },
      async reload() {
        lifecycle.reloads += 1;
        return { ok: true };
      },
      ...(shouldStallStartup
        ? { getStartupContext: () => new Promise(() => {}) }
        : {}),
    };
  }, { shouldStallStartup: stallStartup });
}

async function readBootCoverage(page) {
  return page.evaluate(() => {
    const splash = document.querySelector(".boot-splash");
    const pageShell = document.querySelector(".page-shell");
    const rect = splash.getBoundingClientRect();
    return {
      booting: document.body.classList.contains("app-booting"),
      shapeLocked: document.body.classList.contains("boot-shape-lock"),
      splashOpacity: Number(getComputedStyle(splash).opacity),
      splashVisibility: getComputedStyle(splash).visibility,
      pageVisibility: getComputedStyle(pageShell).visibility,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      background: getComputedStyle(splash, "::before").backgroundImage,
    };
  });
}

async function assertAtomicBoot(page, label) {
  await page.waitForSelector(".boot-splash");
  const coverage = await readBootCoverage(page);
  assert(
    coverage.booting &&
      coverage.shapeLocked &&
      coverage.splashOpacity === 1 &&
      coverage.splashVisibility === "visible" &&
      coverage.pageVisibility === "hidden" &&
      coverage.rect.left === 0 &&
      coverage.rect.top === 0 &&
      coverage.rect.right === VIEWPORT.width &&
      coverage.rect.bottom === VIEWPORT.height &&
      coverage.background !== "none",
    `${label} did not begin with one full-screen boot surface`,
    coverage
  );
  await page.waitForFunction(() => !document.body.classList.contains("app-booting"), null, { timeout: 15_000 });
  await page.waitForFunction(() => window.__freeflowStartupLifecycle.released === 1, null, { timeout: 3_000 });
  const complete = await page.evaluate(() => ({
    ready: window.__freeflowStartupLifecycle.ready,
    released: window.__freeflowStartupLifecycle.released,
    booting: document.body.classList.contains("app-booting"),
    shapeLocked: document.body.classList.contains("boot-shape-lock"),
  }));
  assert(
    complete.ready === 1 && complete.released === 1 && !complete.booting && !complete.shapeLocked,
    `${label} did not complete the ready and splash-exit handshake`,
    complete
  );
}

async function checkColdAndRefresh(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  try {
    await installDesktopStub(page);
    await page.route("**/src/runtime/workbenchRuntime.js", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 260));
      await route.continue();
    });
    await page.goto(BASE_URL, { waitUntil: "commit" });
    await assertAtomicBoot(page, "cold start");
    await page.reload({ waitUntil: "commit" });
    await assertAtomicBoot(page, "refresh");
  } finally {
    await context.close();
  }
}

async function checkFailureRecovery(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  try {
    await installDesktopStub(page, { stallStartup: true });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__triggerFreeFlowBootstrapTimeout === "function");
    await page.evaluate(() => window.__triggerFreeFlowBootstrapTimeout({ reason: "test-timeout" }));
    const failure = await page.evaluate(() => ({
      booting: document.body.classList.contains("app-booting"),
      shapeLocked: document.body.classList.contains("boot-shape-lock"),
      failed: document.body.classList.contains("boot-failed"),
      pageHidden: getComputedStyle(document.querySelector(".page-shell")).visibility === "hidden",
      failureVisible: !document.querySelector("#boot-splash-failure").hidden,
      message: document.querySelector("#boot-splash-failure-message").textContent,
      retryPointerEvents: getComputedStyle(document.querySelector(".boot-splash")).pointerEvents,
    }));
    assert(
      failure.booting &&
        failure.shapeLocked &&
        failure.failed &&
        failure.pageHidden &&
        failure.failureVisible &&
        failure.message.includes("启动时间过长") &&
        failure.retryPointerEvents === "auto",
      "bootstrap timeout exposed a partial workspace instead of recovery UI",
      failure
    );
    await page.locator("#boot-splash-retry").click();
    assert(
      await page.evaluate(() => window.__freeflowStartupLifecycle.reloads === 1),
      "bootstrap recovery did not request a controlled reload"
    );
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await checkColdAndRefresh(browser);
    await checkFailureRecovery(browser);
  } finally {
    await browser.close();
  }
  console.log("[startup-lifecycle] checks passed");
}

main().catch((error) => {
  console.error(`[startup-lifecycle] ${error.message}`);
  process.exitCode = 1;
});
