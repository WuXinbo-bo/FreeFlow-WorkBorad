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

async function findInteractiveRailPoint(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const vertical = rect.height > rect.width;
    const ratios = [0.25, 0.5, 0.75, 0.12, 0.88];
    for (const ratio of ratios) {
      const x = vertical ? rect.left + rect.width / 2 : rect.left + rect.width * ratio;
      const y = vertical ? rect.top + rect.height * ratio : rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && element.contains(hit)) {
        return { x, y };
      }
    }
    return null;
  });
}

async function moveAway(page, viewport) {
  await page.mouse.move(Math.max(2, viewport.width - 2), Math.round(viewport.height / 2));
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.waitForTimeout(200);
}

function rectanglesOverlap(a, b, gap = 0) {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

async function checkChromeStates(page, viewport) {
  const toolbarSelector = ".canvas2d-engine-toolbar";
  const utilitySelector = ".canvas2d-engine-search-row";
  const statusSelector = ".canvas-chrome-status-dock";
  const zoomSelector = ".canvas2d-floating-card-zoom";
  const expectedIdleBackground = "rgba(255, 255, 255, 0.58)";

  const desktopUnderlays = await page.evaluate(() => {
    const background = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {
      html: background("html"),
      body: background("body"),
      pageShell: background(".page-shell"),
      workspace: background(".workspace"),
      canvasFrame: background(".desktop-clear-stage"),
      rightFrame: background(".conversation-panel"),
    };
  });
  assert(
    Object.values(desktopUnderlays).every((background) => background === "rgba(0, 0, 0, 0)"),
    "desktop shell still contains a visible gray underlay",
    { viewport, desktopUnderlays }
  );

  const recoveryControls = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".pane-restore-btn")).map((element) => ({
      id: element.id,
      hidden: element.classList.contains("is-hidden"),
      display: getComputedStyle(element).display,
    }))
  );
  assert(recoveryControls.every((control) => !control.hidden || control.display === "none"), "hidden recovery control is still visible", {
    viewport,
    recoveryControls,
  });

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
    const expectedHeight = viewport.width <= 720 ? 36 : 40;
    assert(Math.abs(surface.rect.height - expectedHeight) <= 0.5, `${name} dock height is unstable`, { viewport, surface });
  }
  assert(Math.abs(utility.rect.right - zoom.rect.right) <= 2, "top and bottom canvas chrome are not right-aligned", {
    viewport,
    utility: utility.rect,
    zoom: zoom.rect,
  });
  assert(Math.abs(utility.rect.right - toolbar.rect.right) <= 2, "stacked top canvas controls are not right-aligned", {
    viewport,
    toolbar: toolbar.rect,
    utility: utility.rect,
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

  const shellMenu = page.locator("#conversation-shell-menu");
  await page.locator("#conversation-shell-more").click();
  await page.waitForFunction(() => !document.querySelector("#conversation-shell-menu")?.classList.contains("is-hidden"));
  const shellMenuSurface = await shellMenu.evaluate((element) => {
    const style = getComputedStyle(element);
    const backing = getComputedStyle(element, "::before");
    const firstItem = element.querySelector(".conversation-shell-menu-item");
    return {
      background: style.backgroundColor,
      backingBackground: backing.backgroundColor,
      backingOpacity: Number(backing.opacity),
      borderRadius: style.borderRadius,
      firstItemBackground: firstItem ? getComputedStyle(firstItem).backgroundColor : "",
    };
  });
  assert(shellMenuSurface.background === "rgba(0, 0, 0, 0)" && shellMenuSurface.backingBackground === "rgba(255, 255, 255, 0.58)" && shellMenuSurface.backingOpacity === 0.84 && shellMenuSurface.borderRadius === "12px", "global more menu does not use the shared popover surface", {
    viewport,
    shellMenuSurface,
  });
  assert(shellMenuSurface.firstItemBackground === "rgba(0, 0, 0, 0)", "global more menu items still have permanent backing cards", {
    viewport,
    shellMenuSurface,
  });
  await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
  await page.waitForFunction(() => document.querySelector("#conversation-shell-menu")?.classList.contains("is-hidden"));

  for (let index = 0; index < 3; index += 1) {
    await page.locator("#conversation-shell-more").click();
    await page.waitForFunction(() => !document.querySelector("#conversation-shell-menu")?.classList.contains("is-hidden"));
    await page.locator("#conversation-shell-more").click();
    await page.waitForFunction(() => document.querySelector("#conversation-shell-menu")?.classList.contains("is-hidden"));
  }

  await page.locator("#conversation-settings-btn").click();
  await page.waitForSelector("#insight-drawer.is-open");
  await page.waitForTimeout(200);
  const statusOpen = await readSurface(page, statusSelector);
  const backdropOpen = await page.locator("#drawer-backdrop").evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, opacity: Number(style.opacity), pointerEvents: style.pointerEvents };
  });
  assert(statusOpen.opacity === 1 && statusOpen.background === "rgba(255, 255, 255, 0.8)", "open settings did not activate status glass", {
    viewport,
    statusOpen,
  });
  assert(backdropOpen.background === "rgba(0, 0, 0, 0)" && backdropOpen.opacity === 1 && backdropOpen.pointerEvents === "auto", "settings backdrop is not an invisible outside-click target", {
    viewport,
    backdropOpen,
  });
  await page.evaluate(() => document.querySelector("#conversation-settings-btn")?.click());
  await page.waitForFunction(() => !document.querySelector("#insight-drawer")?.classList.contains("is-open"));
  await moveAway(page, viewport);
  await page.waitForFunction(
    (selector) => Number(getComputedStyle(document.querySelector(selector)).opacity) <= 0.84,
    statusSelector
  );
  const statusClosed = await readSurface(page, statusSelector);
  const backdropClosed = await page.locator("#drawer-backdrop").evaluate((element) => {
    const style = getComputedStyle(element);
    return { opacity: Number(style.opacity), pointerEvents: style.pointerEvents };
  });
  assert(statusClosed.opacity === statusIdle.opacity && statusClosed.background === statusIdle.background, "closing settings did not restore status glass", {
    viewport,
    statusIdle,
    statusClosed,
  });
  assert(backdropClosed.opacity === 0 && backdropClosed.pointerEvents === "none", "closed settings backdrop still intercepts the workspace", {
    viewport,
    backdropClosed,
  });

  for (let index = 0; index < 4; index += 1) {
    await page.evaluate(() => document.querySelector("#conversation-settings-btn")?.click());
    await page.waitForFunction(() => document.querySelector("#insight-drawer")?.classList.contains("is-open"));
    await page.evaluate(() => document.querySelector("#drawer-close-btn")?.click());
    await page.waitForFunction(() => !document.querySelector("#insight-drawer")?.classList.contains("is-open"));
  }
  const backdropAfterRapidToggle = await page.locator("#drawer-backdrop").evaluate((element) => getComputedStyle(element).pointerEvents);
  assert(backdropAfterRapidToggle === "none", "settings backdrop did not recover after rapid toggles", { viewport, backdropAfterRapidToggle });
}

async function checkRightWorkspaceGlass(page, viewport) {
  const restoreRight = page.locator("#restore-right-pane-btn");
  if (await restoreRight.isVisible()) {
    await restoreRight.click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".conversation-panel")).display !== "none");
  }

  await page.locator("#right-panel-tab-assistant").click();
  await page.mouse.move(1, 1);
  await page.waitForTimeout(220);
  const assistantGlass = await page.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);
      const backing = getComputedStyle(element, "::before");
      const rect = element.getBoundingClientRect();
      return {
        background: style.backgroundColor,
        backingBackground: backing.backgroundColor,
        backingOpacity: Number(backing.opacity),
        backingFilter: backing.backdropFilter || backing.webkitBackdropFilter,
        borderRadius: style.borderRadius,
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      };
    };
    return {
      workspace: read(".conversation-panel"),
      segmented: read("#right-panel-window-strip"),
      lock: read("#right-panel-switch-lock-btn"),
      composer: read("#chat-form"),
      text: {
        assistantTab: getComputedStyle(document.querySelector("#right-panel-tab-assistant")).color,
        composer: getComputedStyle(document.querySelector("#prompt-input")).color,
        placeholder: getComputedStyle(document.querySelector("#prompt-input"), "::placeholder").color,
      },
    };
  });
  assert(
    assistantGlass.workspace.background === "rgba(0, 0, 0, 0)" && assistantGlass.workspace.backingBackground === "rgba(255, 255, 255, 0.58)" && assistantGlass.workspace.backingOpacity === 0.84 && assistantGlass.workspace.backingFilter.includes("blur(16px)"),
    "right workspace does not use the canvas chrome glass backing",
    { viewport, assistantGlass }
  );
  for (const name of ["segmented", "lock", "composer"]) {
    const surface = assistantGlass[name];
    assert(
      surface.background === "rgba(0, 0, 0, 0)" && surface.backingBackground === "rgba(255, 255, 255, 0.58)" && surface.backingOpacity === 0.84 && surface.backingFilter.includes("blur(16px)") && surface.borderRadius === "10px",
      `${name} does not use the canvas chrome glass backing`,
      { viewport, assistantGlass }
    );
  }
  assert(
    assistantGlass.text.assistantTab === "rgb(32, 37, 43)" && assistantGlass.text.composer === "rgb(48, 57, 66)" && assistantGlass.text.placeholder === "rgb(70, 81, 92)",
    "assistant text hierarchy is too light for the transparent workspace",
    { viewport, assistantGlass }
  );

  const layoutBeforeLongInput = await page.evaluate(() => {
    const rect = (selector) => {
      const value = document.querySelector(selector).getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    return { stage: rect(".desktop-clear-stage"), panel: rect(".conversation-panel") };
  });
  await page.locator("#prompt-input").fill("长文本布局隔离检查".repeat(500));
  await page.waitForTimeout(80);
  const longInputLayout = await page.evaluate(() => {
    const rect = (selector) => {
      const value = document.querySelector(selector).getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const input = document.querySelector("#prompt-input");
    return {
      stage: rect(".desktop-clear-stage"),
      panel: rect(".conversation-panel"),
      composer: rect("#chat-form"),
      input: rect("#prompt-input"),
      inputClientHeight: input.clientHeight,
      inputScrollHeight: input.scrollHeight,
      inputOverflowY: getComputedStyle(input).overflowY,
    };
  });
  const allowedInputHeight = Math.max(72, Math.min(220, Math.floor(longInputLayout.panel.height * 0.32))) + 2;
  assert(
    Math.abs(longInputLayout.stage.width - layoutBeforeLongInput.stage.width) <= 1 &&
      Math.abs(longInputLayout.stage.height - layoutBeforeLongInput.stage.height) <= 1 &&
      Math.abs(longInputLayout.stage.left - layoutBeforeLongInput.stage.left) <= 1,
    "long composer input changed the canvas frame",
    { viewport, layoutBeforeLongInput, longInputLayout }
  );
  assert(
    longInputLayout.input.height <= allowedInputHeight &&
      longInputLayout.inputScrollHeight > longInputLayout.inputClientHeight &&
      longInputLayout.inputOverflowY === "auto" &&
      longInputLayout.composer.top >= longInputLayout.panel.top &&
      longInputLayout.composer.bottom <= longInputLayout.panel.bottom + 1,
    "long composer input escaped its internal scroll boundary",
    { viewport, allowedInputHeight, longInputLayout }
  );
  await page.locator("#prompt-input").fill("");
  await page.waitForTimeout(80);
  const layoutAfterLongInput = await page.evaluate(() => {
    const stage = document.querySelector(".desktop-clear-stage").getBoundingClientRect();
    const input = document.querySelector("#prompt-input").getBoundingClientRect();
    return {
      stage: { left: stage.left, width: stage.width, height: stage.height },
      inputHeight: input.height,
    };
  });
  assert(
    Math.abs(layoutAfterLongInput.stage.width - layoutBeforeLongInput.stage.width) <= 1 &&
      Math.abs(layoutAfterLongInput.stage.height - layoutBeforeLongInput.stage.height) <= 1 &&
      Math.abs(layoutAfterLongInput.stage.left - layoutBeforeLongInput.stage.left) <= 1 &&
      layoutAfterLongInput.inputHeight <= 40,
    "composer layout did not recover after clearing long input",
    { viewport, layoutBeforeLongInput, layoutAfterLongInput }
  );

  const lockButton = page.locator("#right-panel-switch-lock-btn");
  await lockButton.click();
  await page.waitForFunction(() => document.querySelector("#right-panel-switch-lock-btn")?.getAttribute("aria-pressed") === "true");
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#right-panel-switch-lock-btn"), "::before").backgroundColor === "rgba(255, 255, 255, 0.8)");
  const lockedBackground = await lockButton.evaluate((element) => getComputedStyle(element, "::before").backgroundColor);
  assert(lockedBackground === "rgba(255, 255, 255, 0.8)", "right view lock did not enter shared active glass", { viewport, lockedBackground });
  await lockButton.click();
  await page.waitForFunction(() => document.querySelector("#right-panel-switch-lock-btn")?.getAttribute("aria-pressed") === "false");
  await page.mouse.move(1, 1);
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#right-panel-switch-lock-btn"), "::before").backgroundColor === "rgba(255, 255, 255, 0.58)");
  const unlockedBackground = await lockButton.evaluate((element) => getComputedStyle(element, "::before").backgroundColor);
  assert(unlockedBackground === assistantGlass.lock.backingBackground, "right view lock did not restore shared idle glass", { viewport, unlockedBackground });

  await page.locator("#right-panel-tab-screen").click();
  await page.waitForSelector("#screen-source-panel.is-active");
  const mappingTrigger = page.locator("#screen-source-header-menu > summary");
  await mappingTrigger.click();
  await page.waitForFunction(() => !document.querySelector(".screen-source-header-panel")?.classList.contains("is-hidden"));
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#screen-source-header-menu > summary"), "::before").backgroundColor === "rgba(255, 255, 255, 0.8)");
  const mappingGlass = await page.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);
      const backing = getComputedStyle(element, "::before");
      const rect = element.getBoundingClientRect();
      return {
        background: style.backgroundColor,
        backingBackground: backing.backgroundColor,
        backingOpacity: Number(backing.opacity),
        backingFilter: backing.backdropFilter || backing.webkitBackdropFilter,
        borderRadius: style.borderRadius,
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      };
    };
    return {
      trigger: read("#screen-source-header-menu > summary"),
      popover: read(".screen-source-header-panel"),
      picker: read(".screen-source-picker"),
      target: read("#screen-source-select-trigger"),
      renderMode: read(".screen-source-render-mode"),
      fitMode: read(".screen-source-fit-mode"),
      status: read("#screen-source-status-pill"),
      preview: read(".screen-source-preview-shell"),
      globalActions: read(".app-global-shell-actions"),
      emptyBackground: getComputedStyle(document.querySelector("#screen-source-empty")).backgroundColor,
      text: {
        trigger: getComputedStyle(document.querySelector("#screen-source-header-menu > summary")).color,
        target: getComputedStyle(document.querySelector("#screen-source-select-current")).color,
        note: getComputedStyle(document.querySelector(".screen-source-picker-note")).color,
        action: getComputedStyle(document.querySelector("#screen-source-refresh-btn")).color,
        emptyTitle: getComputedStyle(document.querySelector("#screen-source-empty-title")).color,
        emptyText: getComputedStyle(document.querySelector("#screen-source-empty-text")).color,
      },
    };
  });
  assert(
    mappingGlass.trigger.backingBackground === "rgba(255, 255, 255, 0.8)" && mappingGlass.popover.background === "rgba(0, 0, 0, 0)" && mappingGlass.popover.backingBackground === "rgba(255, 255, 255, 0.58)" && mappingGlass.popover.backingOpacity === 0.84 && mappingGlass.popover.backingFilter.includes("blur(16px)"),
    "mapping controls do not use the shared trigger and popover glass",
    { viewport, mappingGlass }
  );
  assert(
    mappingGlass.picker.background === "rgba(255, 255, 255, 0.08)" && mappingGlass.target.background === "rgba(255, 255, 255, 0.06)" && mappingGlass.target.backingBackground === "rgba(0, 0, 0, 0)" && mappingGlass.preview.background === "rgba(255, 255, 255, 0.08)" && mappingGlass.emptyBackground === "rgba(0, 0, 0, 0)",
    "mapping content still stacks opaque backing surfaces",
    { viewport, mappingGlass }
  );
  assert(
    Math.abs(mappingGlass.renderMode.rect.top - mappingGlass.fitMode.rect.top) <= 1 && mappingGlass.status.rect.top >= mappingGlass.renderMode.rect.bottom && mappingGlass.popover.rect.right <= viewport.width,
    "mapping mode controls are not aligned in the shared compact grid",
    { viewport, mappingGlass }
  );
  assert(
    !rectanglesOverlap(mappingGlass.trigger.rect, mappingGlass.globalActions.rect, 8) && mappingGlass.trigger.rect.width >= 60,
    "AI mirror mapping control overlaps the global settings controls or is clipped",
    { viewport, mappingGlass }
  );
  assert(
    mappingGlass.text.trigger === "rgb(32, 37, 43)" && mappingGlass.text.target === "rgb(32, 37, 43)" && mappingGlass.text.action === "rgb(48, 57, 66)" && mappingGlass.text.note === "rgb(89, 101, 112)" && mappingGlass.text.emptyTitle === "rgb(32, 37, 43)" && mappingGlass.text.emptyText === "rgb(70, 81, 92)",
    "AI mirror text hierarchy is too light for the transparent workspace",
    { viewport, mappingGlass }
  );

  await page.mouse.click(2, Math.round(viewport.height / 2));
  await page.waitForFunction(() => document.querySelector(".screen-source-header-panel")?.classList.contains("is-hidden"));
  for (let index = 0; index < 4; index += 1) {
    await mappingTrigger.click();
    await page.waitForFunction(() => !document.querySelector(".screen-source-header-panel")?.classList.contains("is-hidden"));
    await page.mouse.click(2, Math.round(viewport.height / 2));
    await page.waitForFunction(() => document.querySelector(".screen-source-header-panel")?.classList.contains("is-hidden"));
  }

  for (let index = 0; index < 3; index += 1) {
    await page.locator("#right-panel-tab-assistant").click();
    await page.locator("#right-panel-tab-screen").click();
  }
  await page.locator("#right-panel-tab-assistant").click();
  await page.waitForFunction(() => !document.querySelector(".conversation-panel")?.classList.contains("screen-view-active"));
  const recovered = await page.evaluate(() => ({
    composerVisible: getComputedStyle(document.querySelector("#chat-form")).display !== "none",
    composerBackground: getComputedStyle(document.querySelector("#chat-form")).backgroundColor,
    composerBacking: getComputedStyle(document.querySelector("#chat-form"), "::before").backgroundColor,
    mappingHidden: document.querySelector(".screen-source-header-panel")?.classList.contains("is-hidden"),
    headerSlotHidden: document.querySelector("#screen-source-header-slot")?.classList.contains("is-hidden"),
  }));
  assert(
    recovered.composerVisible && recovered.composerBackground === "rgba(0, 0, 0, 0)" && recovered.composerBacking === "rgba(255, 255, 255, 0.58)" && recovered.mappingHidden && recovered.headerSlotHidden,
    "right workspace did not recover after repeated assistant and mirror switching",
    { viewport, recovered }
  );
}

async function checkMirrorFrame(page, viewport) {
  const restoreRight = page.locator("#restore-right-pane-btn");
  if (await restoreRight.isVisible()) {
    await restoreRight.click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".conversation-panel")).display !== "none");
  }

  await page.locator("#right-panel-tab-screen").click();
  await page.waitForSelector("#screen-source-panel.is-active");
  await page.waitForTimeout(220);
  const frame = await page.evaluate(() => {
    const panel = document.querySelector(".conversation-panel");
    const preview = document.querySelector(".screen-source-preview-shell");
    const panelStyle = getComputedStyle(panel);
    const previewStyle = getComputedStyle(preview);
    const panelRect = panel.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    preview.classList.add("is-native-embedded");
    const nativeStyle = getComputedStyle(preview);
    const nativeBoxShadow = nativeStyle.boxShadow;
    preview.classList.remove("is-native-embedded");
    return {
      panelPadding: panelStyle.padding,
      panelRadius: panelStyle.borderRadius,
      previewBorder: previewStyle.borderWidth,
      previewRadius: previewStyle.borderRadius,
      nativeBoxShadow,
      insets: {
        left: previewRect.left - panelRect.left,
        right: panelRect.right - previewRect.right,
        bottom: panelRect.bottom - previewRect.bottom,
      },
    };
  });
  assert(frame.panelPadding === "8px" && frame.panelRadius === "12px", "AI mirror workspace does not use the compact shared frame", { viewport, frame });
  assert(frame.previewBorder === "1px" && frame.previewRadius === "10px", "AI mirror preview still has an oversized outer frame", { viewport, frame });
  assert(!frame.nativeBoxShadow.includes("14px"), "native AI mirror restored the legacy 14px inset frame", { viewport, frame });
  assert(frame.insets.left <= 10 && frame.insets.right <= 10 && frame.insets.bottom <= 10, "AI mirror content padding is still oversized", { viewport, frame });

  await page.locator("#conversation-settings-btn").click();
  await page.waitForSelector("#insight-drawer.is-open");
  await page.locator("#drawer-close-btn").click();
  await page.waitForFunction(() => !document.querySelector("#insight-drawer")?.classList.contains("is-open"));
  const recovered = await page.evaluate(() => ({
    active: document.querySelector("#screen-source-panel")?.classList.contains("is-active"),
    backdropPointerEvents: getComputedStyle(document.querySelector("#drawer-backdrop")).pointerEvents,
  }));
  assert(recovered.active && recovered.backdropPointerEvents === "none", "AI mirror did not recover after settings closed", { viewport, recovered });
}

async function checkEdgeRails(page, viewport) {
  const rails = ["is-top", "is-right", "is-bottom", "is-left"];
  const panel = page.locator(".desktop-clear-stage");

  for (const railClass of rails) {
    const railSelector = `.desktop-clear-stage > .canvas-chrome-edge-rail.${railClass}`;
    const rail = page.locator(railSelector);
    await moveAway(page, viewport);
    const idle = await readEdgeRail(page, railSelector);
    assert(idle.cursor === "grab" && idle.indicatorOpacity < 0.05, "edge rail is not quiet at rest", { viewport, railClass, idle });

    const hitPoint = await findInteractiveRailPoint(page, railSelector);
    assert(Boolean(hitPoint), "edge rail has no unobstructed interactive point", { viewport, railClass });
    await page.mouse.move(hitPoint.x, hitPoint.y);
    await page.waitForTimeout(180);
    const hovered = await readEdgeRail(page, railSelector);
    assert(hovered.indicatorOpacity > 0.95, "edge rail did not reveal on hover", { viewport, railClass, hovered });

    const box = await rail.boundingBox();
    assert(Boolean(box), "edge rail has no interactive bounds", { viewport, railClass });
    const startX = hitPoint.x;
    const startY = hitPoint.y;
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

  const topRailSelector = ".desktop-clear-stage > .canvas-chrome-edge-rail.is-top";
  const topPoint = await findInteractiveRailPoint(page, topRailSelector);
  assert(Boolean(topPoint), "top edge rail has no unobstructed interactive point", viewport);
  await page.mouse.move(topPoint.x, topPoint.y);
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

  const blurPoint = await findInteractiveRailPoint(page, topRailSelector);
  assert(Boolean(blurPoint), "top edge rail did not recover after pointer cancel", viewport);
  await page.mouse.move(blurPoint.x, blurPoint.y);
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

  const alignedAfterDrag = await page.evaluate(() => {
    const stage = document.querySelector(".desktop-clear-stage")?.getBoundingClientRect();
    const utility = document.querySelector(".canvas-chrome-utility-dock")?.getBoundingClientRect();
    const zoom = document.querySelector(".canvas-chrome-viewport-dock")?.getBoundingClientRect();
    if (!stage || !utility || !zoom) return null;
    return {
      utilityInset: stage.right - utility.right,
      zoomInset: stage.right - zoom.right,
    };
  });
  const expectedRightInset = viewport.width <= 720 ? 84 : 8;
  assert(
    alignedAfterDrag &&
      Math.abs(alignedAfterDrag.utilityInset - alignedAfterDrag.zoomInset) <= 2 &&
      Math.abs(alignedAfterDrag.utilityInset - expectedRightInset) <= 2,
    "canvas chrome lost its shared right inset after moving the canvas",
    { viewport, alignedAfterDrag }
  );
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
      hasDragLabel: Boolean(element.querySelector(".canvas2d-transient-minimap-meta")),
      background: getComputedStyle(element).backgroundColor,
    };
  });
  assert(expanded.rect.left >= expanded.navigatorRight + 10, "current-location minimap is covered by the navigator", {
    viewport,
    expanded,
  });
  assert(Math.abs(expanded.rect.width - 164) <= 0.5 && expanded.rect.height <= 134 && expanded.titleHeight < 20 && expanded.canvasHit && !expanded.hasDragLabel, "current-location minimap is not compact and fully usable", {
    viewport,
    expanded,
  });
  assert(expanded.background === "rgba(255, 255, 255, 0.58)", "current-location minimap does not use shared glass", {
    viewport,
    expanded,
  });

  await toggle.click();
  await page.waitForFunction(() => {
    const rect = document.querySelector("#canvas2d-transient-minimap")?.getBoundingClientRect();
    return Boolean(rect && rect.width <= 38.5 && rect.height <= 38.5);
  });
  const collapsed = await readSurface(page, "#canvas2d-transient-minimap");
  assert(Math.abs(collapsed.rect.width - 38) <= 0.5 && Math.abs(collapsed.rect.height - 38) <= 0.5, "minimap did not collapse cleanly", {
    viewport,
    collapsed,
  });
  assert(collapsed.background === "rgba(0, 0, 0, 0)" && collapsed.boxShadow === "none", "collapsed minimap retained a white backing surface", {
    viewport,
    collapsed,
  });
  await toggle.click();
  await page.waitForFunction(
    (expandedWidth) => document.querySelector("#canvas2d-transient-minimap")?.getBoundingClientRect().width >= expandedWidth - 0.5,
    expanded.rect.width
  );
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
  const expandedMetrics = await page.evaluate(() => {
    const logo = document.querySelector(".canvas-chrome-info-dock .canvas2d-brand-logo")?.getBoundingClientRect();
    const utility = document.querySelector(".canvas-chrome-utility-dock")?.getBoundingClientRect();
    const info = document.querySelector(".canvas-chrome-info-dock")?.getBoundingClientRect();
    return {
      logoHeight: logo?.height || 0,
      bottomDelta: info && utility ? info.bottom - utility.bottom : null,
    };
  });
  assert(expanded.background === "rgba(255, 255, 255, 0.58)" && expanded.hitInside, "canvas information dock has no usable glass backing", {
    viewport,
    expanded,
  });
  if (viewport.width > 720) {
    assert(expandedMetrics.logoHeight >= 18 && Math.abs(expandedMetrics.bottomDelta) <= 1, "expanded canvas information dock is not aligned with the stacked chrome", {
      viewport,
      expandedMetrics,
    });
  }

  const toggle = page.locator(".canvas2d-info-collapse-toggle");
  await toggle.click();
  await moveAway(page, viewport);
  const collapsed = await readSurface(page, infoSelector);
  const collapsedLogoHeight = await page.locator(".canvas-chrome-info-dock .canvas2d-brand-logo").evaluate((logo) => logo.getBoundingClientRect().height);
  const expectedCollapsedHeight = viewport.width <= 720 ? 36 : 40;
  const expectedCollapsedLogoHeight = viewport.width <= 720 ? 22 : 24;
  assert(collapsed.rect.width <= 78.5 && Math.abs(collapsed.rect.height - expectedCollapsedHeight) <= 0.5 && Math.abs(collapsedLogoHeight - expectedCollapsedLogoHeight) <= 0.5 && collapsed.background === expanded.background, "collapsed canvas information dock lost its balanced glass layout", {
    viewport,
    collapsed,
    collapsedLogoHeight,
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
    const restoredRoots = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      workspace: getComputedStyle(document.querySelector(".workspace")).backgroundColor,
    }));
    assert(restored.visibility === "visible" && restored.opacity > 0.99 && Object.values(restoredRoots).every((background) => background === "rgba(0, 0, 0, 0)"), "canvas did not restore after pass-through", {
      viewport,
      restored,
      restoredRoots,
    });
    await checkRightWorkspaceGlass(page, viewport);
    await checkMirrorFrame(page, viewport);
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
