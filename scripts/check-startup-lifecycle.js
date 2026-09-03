"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const BASE_URL = process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:3000/?desktop=1";
const VIEWPORT = { width: 1440, height: 900 };
const ROOT_DIR = path.resolve(__dirname, "..");

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
      backgroundColor: getComputedStyle(splash).backgroundColor,
      externalLogo: Boolean(document.querySelector(".boot-splash img")),
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
      coverage.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      !coverage.externalLogo,
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
    marks: { ...window.__FREEFLOW_BOOT_METRICS?.marks },
  }));
  const marks = complete.marks;
  assert(
    complete.ready === 1 &&
      complete.released === 1 &&
      !complete.booting &&
      !complete.shapeLocked &&
      marks["navigation-start"] <= marks["splash-frame"] &&
      marks["splash-frame"] <= marks["renderer-ready"] &&
      marks["renderer-ready"] <= marks["splash-exit-start"] &&
      marks["splash-exit-start"] <= marks["splash-exit-end"] &&
      marks["splash-exit-end"] <= marks["shape-unlocked"],
    `${label} did not complete the ready and splash-exit handshake`,
    complete
  );
}

async function checkColdAndRefresh(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  let bootLogoRequests = 0;
  try {
    page.on("request", (request) => {
      if (request.url().includes("/assets/brand/FreeFlow_logo.svg")) {
        bootLogoRequests += 1;
      }
    });
    await installDesktopStub(page);
    await page.route("**/src/runtime/workbenchRuntime.js", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 260));
      await route.continue();
    });
    await page.goto(BASE_URL, { waitUntil: "commit" });
    await assertAtomicBoot(page, "cold start");
    await page.reload({ waitUntil: "commit" });
    await assertAtomicBoot(page, "refresh");
    assert(bootLogoRequests === 0, "startup requested the oversized legacy logo", { bootLogoRequests });
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
    await page.waitForFunction(() => document.activeElement?.id === "boot-splash-retry");
    await page.locator("#boot-splash-retry").click();
    assert(
      await page.evaluate(() => window.__freeflowStartupLifecycle.reloads === 1),
      "bootstrap recovery did not request a controlled reload"
    );
  } finally {
    await context.close();
  }
}

async function checkReducedMotion(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await installDesktopStub(page, { stallStartup: true });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    const animation = await page.locator(".boot-splash-title span").first().evaluate((element) => ({
      animationName: getComputedStyle(element).animationName,
      transitionDuration: getComputedStyle(document.querySelector(".boot-splash")).transitionDuration,
    }));
    assert(
      animation.animationName === "none" && animation.transitionDuration === "0s",
      "reduced-motion preference did not disable startup motion",
      animation
    );
  } finally {
    await context.close();
  }
}

async function checkStaticCacheValidation() {
  const assetUrl = new URL("src/runtime/workbenchRuntime.js", BASE_URL).toString();
  const requestAsset = (headers = {}) =>
    new Promise((resolve, reject) => {
      const request = http.get(assetUrl, { headers }, (response) => {
        response.resume();
        response.on("end", () => resolve({ status: response.statusCode, headers: response.headers }));
      });
      request.on("error", reject);
    });
  const first = await requestAsset();
  const cacheControl = String(first.headers["cache-control"] || "");
  const etag = String(first.headers.etag || "");
  assert(cacheControl.includes("no-cache") && !cacheControl.includes("no-store"), "static assets cannot be reused", {
    cacheControl,
  });
  assert(etag, "static assets do not expose a validation token");
  const validated = await requestAsset({ "If-None-Match": etag });
  assert(validated.status === 304, "static asset validation did not return 304", { status: validated.status });
}

function checkDesktopReloadPolicy() {
  const source = fs.readFileSync(path.join(ROOT_DIR, "electron", "main.js"), "utf8");
  const reloadFunction = source.slice(source.indexOf("async function reloadMainWindow"), source.indexOf("function getDefaultWindowBoundsForDisplay"));
  const crashHandler = source.slice(
    source.indexOf('window.webContents.on("render-process-gone"'),
    source.indexOf('window.on("close"')
  );
  assert(reloadFunction.includes("mainWindow.webContents.reload();"), "ordinary desktop refresh still bypasses cache");
  assert(!reloadFunction.includes("reloadIgnoringCache"), "ordinary desktop refresh still ignores validated assets");
  assert(crashHandler.includes("reloadIgnoringCache"), "renderer crash recovery no longer forces a clean reload");
  assert(!source.includes("defaultSession?.clearCache"), "desktop startup still clears the resource cache");
  assert(
    source.includes("!window.__freeflowReadyToShow || !window.__freeflowRendererReady"),
    "desktop window can become visible before renderer startup completes"
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    checkDesktopReloadPolicy();
    await checkStaticCacheValidation();
    await checkColdAndRefresh(browser);
    await checkFailureRecovery(browser);
    await checkReducedMotion(browser);
  } finally {
    await browser.close();
  }
  console.log("[startup-lifecycle] checks passed");
}

main().catch((error) => {
  console.error(`[startup-lifecycle] ${error.message}`);
  process.exitCode = 1;
});
