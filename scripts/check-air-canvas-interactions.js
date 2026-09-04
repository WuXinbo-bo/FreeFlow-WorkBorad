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
      indicatorTransitionDuration: indicator.transitionDuration,
      indicatorTransitionProperty: indicator.transitionProperty,
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

async function assertPortalMenu(page, selector, viewport) {
  const result = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const root = document.querySelector(".canvas2d-engine-ui")?.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 80));
    return {
      parentId: element.parentElement?.id || "",
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      root: root ? { left: root.left, top: root.top, right: root.right, bottom: root.bottom } : null,
      hitInside: Boolean(hit && element.contains(hit)),
      inline: { left: element.style.left, top: element.style.top, right: element.style.right },
      computed: { left: getComputedStyle(element).left, right: getComputedStyle(element).right },
      placement: { x: element.dataset.placementX || "", y: element.dataset.placementY || "" },
    };
  });
  assert(result.parentId === "global-overlay-layer", "canvas toolbar menu did not use the global overlay host", {
    viewport,
    selector,
    result,
  });
  assert(
    result.rect.left >= Math.max(0, result.root?.left || 0) &&
      result.rect.right <= Math.min(viewport.width, result.root?.right || viewport.width) &&
      result.rect.top >= Math.max(0, result.root?.top || 0) &&
      result.rect.bottom <= Math.min(viewport.height, result.root?.bottom || viewport.height),
    "canvas toolbar menu escaped its safe boundary",
    { viewport, selector, result }
  );
  assert(result.hitInside, "canvas toolbar menu is visually present but not pointer hittable", { viewport, selector, result });
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
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    return {
      html: style("html").backgroundColor,
      body: style("body").backgroundColor,
      pageShell: style(".page-shell").backgroundColor,
      workspace: style(".workspace").backgroundColor,
      canvasFrame: style(".desktop-clear-stage").backgroundColor,
      rightFrame: style(".conversation-panel").backgroundColor,
      rightFrameFilter: style(".conversation-panel").backdropFilter,
    };
  });
  assert(
    [desktopUnderlays.html, desktopUnderlays.body, desktopUnderlays.pageShell, desktopUnderlays.workspace, desktopUnderlays.canvasFrame]
      .every((background) => background === "rgba(0, 0, 0, 0)") &&
      desktopUnderlays.rightFrame === "rgba(249, 250, 251, 0.72)" &&
      desktopUnderlays.rightFrameFilter.includes("blur(30px)"),
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
  await page.waitForFunction(
    ({ selector, opacity, background }) => {
      const style = getComputedStyle(document.querySelector(selector));
      return Number(style.opacity) === opacity && style.backgroundColor === background;
    },
    { selector: statusSelector, opacity: statusIdle.opacity, background: statusIdle.background },
    { timeout: 1_000 }
  );
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
  assert(backdropOpen.background === "rgba(0, 0, 0, 0)" && backdropOpen.opacity === 0 && backdropOpen.pointerEvents === "none", "settings backdrop still obscures or intercepts the workspace", {
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
    assistantGlass.workspace.background === "rgba(249, 250, 251, 0.72)" && assistantGlass.workspace.backdropFilter.includes("blur(30px)"),
    "right workspace does not use the dedicated frosted surface",
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
  await page.waitForFunction(() => document.querySelector("#screen-source-select-trigger")?.getAttribute("aria-disabled") === "false");
  const mappingOpenState = await page.evaluate(() => ({
    nativeOpen: document.querySelector("#screen-source-header-menu")?.hasAttribute("open"),
    expanded: document.querySelector("#screen-source-header-menu > summary")?.getAttribute("aria-expanded"),
    controls: document.querySelector("#screen-source-header-menu > summary")?.getAttribute("aria-controls"),
  }));
  assert(
    mappingOpenState.nativeOpen && mappingOpenState.expanded === "true" && mappingOpenState.controls === "screen-source-header-panel",
    "mapping parent menu did not synchronize native and accessible open state",
    { viewport, mappingOpenState }
  );

  const targetTrigger = page.locator("#screen-source-select-trigger");
  await targetTrigger.click();
  await page.waitForFunction(() => document.querySelector("#screen-source-select-menu")?.hasAttribute("open"));
  assert((await targetTrigger.getAttribute("aria-expanded")) === "true", "mapping target menu did not expose expanded state", viewport);
  await page.keyboard.press("Escape");
  const targetEscapeState = await page.evaluate(() => ({
    targetOpen: document.querySelector("#screen-source-select-menu")?.hasAttribute("open"),
    targetExpanded: document.querySelector("#screen-source-select-trigger")?.getAttribute("aria-expanded"),
    parentOpen: document.querySelector("#screen-source-header-menu")?.hasAttribute("open"),
    focusedId: document.activeElement?.id || "",
  }));
  assert(
    !targetEscapeState.targetOpen && targetEscapeState.targetExpanded === "false" && targetEscapeState.parentOpen && targetEscapeState.focusedId === "screen-source-select-trigger",
    "Escape did not close only the deepest mapping menu and restore focus",
    { viewport, targetEscapeState }
  );

  await targetTrigger.click();
  const secondTarget = page.locator("[data-screen-source-option]").nth(1);
  const secondTargetLabel = await secondTarget.locator(".screen-source-select-option-title").textContent();
  await secondTarget.click();
  const targetSelectionState = await page.evaluate(() => ({
    targetOpen: document.querySelector("#screen-source-select-menu")?.hasAttribute("open"),
    targetExpanded: document.querySelector("#screen-source-select-trigger")?.getAttribute("aria-expanded"),
    parentOpen: document.querySelector("#screen-source-header-menu")?.hasAttribute("open"),
    focusedId: document.activeElement?.id || "",
    selectedLabel: document.querySelector("#screen-source-select-current")?.textContent || "",
  }));
  assert(
    !targetSelectionState.targetOpen &&
      targetSelectionState.targetExpanded === "false" &&
      targetSelectionState.parentOpen &&
      targetSelectionState.focusedId === "screen-source-select-trigger" &&
      targetSelectionState.selectedLabel === secondTargetLabel,
    "mapping target selection did not close the child menu, preserve the parent, and restore focus",
    { viewport, secondTargetLabel, targetSelectionState }
  );

  await page.keyboard.press("Escape");
  const parentEscapeState = await page.evaluate(() => ({
    parentOpen: document.querySelector("#screen-source-header-menu")?.hasAttribute("open"),
    parentExpanded: document.querySelector("#screen-source-header-menu > summary")?.getAttribute("aria-expanded"),
    panelHidden: document.querySelector(".screen-source-header-panel")?.classList.contains("is-hidden"),
    focused: document.activeElement === document.querySelector("#screen-source-header-menu > summary"),
    focusedId: document.activeElement?.id || "",
    focusedTag: document.activeElement?.tagName || "",
  }));
  assert(
    !parentEscapeState.parentOpen && parentEscapeState.parentExpanded === "false" && parentEscapeState.panelHidden && parentEscapeState.focused,
    "Escape did not close the mapping parent and restore trigger focus",
    { viewport, parentEscapeState }
  );

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await mappingTrigger.click();
    await targetTrigger.click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const repeatedEscapeState = await page.evaluate(() => ({
      parentOpen: document.querySelector("#screen-source-header-menu")?.hasAttribute("open"),
      targetOpen: document.querySelector("#screen-source-select-menu")?.hasAttribute("open"),
      focused: document.activeElement === document.querySelector("#screen-source-header-menu > summary"),
      focusedId: document.activeElement?.id || "",
      focusedTag: document.activeElement?.tagName || "",
    }));
    assert(
      !repeatedEscapeState.parentOpen && !repeatedEscapeState.targetOpen && repeatedEscapeState.focused,
      "repeated Escape did not preserve the mapping menu recovery state",
      { viewport, cycle, repeatedEscapeState }
    );
  }

  await mappingTrigger.click();
  await page.waitForFunction(() => !document.querySelector(".screen-source-header-panel")?.classList.contains("is-hidden"));
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#screen-source-header-menu > summary"), "::before").backgroundColor === "rgba(255, 255, 255, 0.8)");
  const displaySettings = page.locator("#screen-source-display-settings");
  assert(!(await displaySettings.evaluate((element) => element.hasAttribute("open"))), "AI mirror display settings should be collapsed by default", viewport);
  await displaySettings.locator(":scope > summary").click();
  await page.waitForFunction(() => document.querySelector("#screen-source-display-settings")?.hasAttribute("open"));
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
      pickerHead: read(".screen-source-picker-head"),
      targetRow: read(".screen-source-target-row"),
      target: read("#screen-source-select-trigger"),
      refresh: read("#screen-source-refresh-btn"),
      actions: read("#screen-source-inline-actions"),
      primary: read("#screen-source-embed-toggle-btn"),
      refreshEmbed: read("#screen-source-refresh-embed-btn"),
      displaySettings: read("#screen-source-display-settings"),
      renderMode: read(".screen-source-render-mode"),
      fitMode: read(".screen-source-fit-mode"),
      status: read("#screen-source-status-pill"),
      preview: read(".screen-source-preview-shell"),
      globalActions: read(".app-global-shell-actions"),
      emptyBackground: getComputedStyle(document.querySelector("#screen-source-empty")).backgroundColor,
      text: {
        trigger: getComputedStyle(document.querySelector("#screen-source-header-menu > summary")).color,
        target: getComputedStyle(document.querySelector("#screen-source-select-current")).color,
        action: getComputedStyle(document.querySelector("#screen-source-refresh-btn")).color,
        emptyTitle: getComputedStyle(document.querySelector("#screen-source-empty-title")).color,
        emptyText: getComputedStyle(document.querySelector("#screen-source-empty-text")).color,
      },
      actionContract: {
        refreshText: document.querySelector("#screen-source-refresh-btn")?.textContent?.trim() || "",
        refreshSvgCount: document.querySelector("#screen-source-refresh-btn")?.querySelectorAll("svg").length || 0,
        refreshEmbedText: document.querySelector("#screen-source-refresh-embed-btn")?.textContent?.trim() || "",
        refreshEmbedSvgCount: document.querySelector("#screen-source-refresh-embed-btn")?.querySelectorAll("svg").length || 0,
        primaryLabel: document.querySelector("#screen-source-embed-toggle-btn")?.textContent?.trim() || "",
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
    Math.abs(mappingGlass.target.rect.top - mappingGlass.refresh.rect.top) <= 1 &&
      Math.abs(mappingGlass.target.rect.bottom - mappingGlass.refresh.rect.bottom) <= 1 &&
      mappingGlass.target.rect.width >= mappingGlass.picker.rect.width - 64 &&
      mappingGlass.status.rect.top >= mappingGlass.pickerHead.rect.top &&
      mappingGlass.status.rect.bottom <= mappingGlass.pickerHead.rect.bottom &&
      Math.abs(mappingGlass.renderMode.rect.top - mappingGlass.fitMode.rect.top) <= 1 &&
      mappingGlass.renderMode.rect.height > 0 &&
      mappingGlass.displaySettings.rect.bottom <= mappingGlass.popover.rect.bottom &&
      mappingGlass.popover.rect.right <= viewport.width &&
      mappingGlass.popover.rect.bottom <= viewport.height,
    "mapping controls do not follow the target, status, and collapsed display-settings layout",
    { viewport, mappingGlass }
  );
  assert(
    mappingGlass.primary.rect.width >= mappingGlass.actions.rect.width - 1 &&
      mappingGlass.actionContract.refreshText === "" &&
      mappingGlass.actionContract.refreshSvgCount === 1 &&
      mappingGlass.actionContract.refreshEmbedText === "" &&
      mappingGlass.actionContract.refreshEmbedSvgCount === 1 &&
      mappingGlass.actionContract.primaryLabel === "开始嵌入",
    "AI mirror actions do not expose one primary command with icon-only refresh controls",
    { viewport, mappingGlass }
  );
  assert(
    !rectanglesOverlap(mappingGlass.trigger.rect, mappingGlass.globalActions.rect, 8) &&
      mappingGlass.trigger.rect.width >= 32 &&
      mappingGlass.trigger.rect.width <= 48,
    "AI mirror mapping control overlaps the global settings controls or is clipped",
    { viewport, mappingGlass }
  );
  assert(
    mappingGlass.text.trigger === "rgb(32, 37, 43)" && mappingGlass.text.target === "rgb(32, 37, 43)" && mappingGlass.text.action === "rgb(48, 57, 66)" && mappingGlass.text.emptyTitle === "rgb(32, 37, 43)" && mappingGlass.text.emptyText === "rgb(70, 81, 92)",
    "AI mirror text hierarchy is too light for the transparent workspace",
    { viewport, mappingGlass }
  );
  assert(
    (await page.locator("#screen-source-status-pill").getAttribute("title")) === (await page.locator("#screen-source-status-pill").textContent()),
    "compact AI mirror status does not preserve its full text",
    viewport
  );
  await displaySettings.locator(":scope > summary").click();
  await page.waitForFunction(() => !document.querySelector("#screen-source-display-settings")?.hasAttribute("open"));
  assert(!(await page.locator(".screen-source-render-mode").isVisible()), "AI mirror display settings did not restore the collapsed state", viewport);

  const refreshState = await page.evaluate(() => {
    window.__queueAiMirrorTargetResponses?.([
      {
        delay: 140,
        targets: [
          { id: "target-b", name: "Target B", label: "Target B", note: "current" },
          { id: "target-stale", name: "Stale Target", label: "Stale Target", note: "stale" },
        ],
      },
      {
        delay: 20,
        targets: [
          { id: "target-b", name: "Target B", label: "Target B", note: "current" },
          { id: "target-latest", name: "Latest Target", label: "Latest Target", note: "latest" },
        ],
      },
    ]);
    const refresh = document.querySelector("#screen-source-refresh-btn");
    refresh?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    refresh?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return {
      disabled: refresh?.disabled,
      busy: refresh?.getAttribute("aria-busy"),
    };
  });
  assert(refreshState.disabled && refreshState.busy === "true", "mapping refresh did not expose a loading guard", {
    viewport,
    refreshState,
  });
  await page.waitForTimeout(220);
  await targetTrigger.click();
  const refreshResult = await page.locator("#screen-source-select-panel").textContent();
  assert(
    refreshResult.includes("Latest Target") && !refreshResult.includes("Stale Target"),
    "an older mapping refresh overwrote the latest response",
    { viewport, refreshResult }
  );
  const refreshedTargetMenuLayout = await page.evaluate(() => {
    const panel = document.querySelector("#screen-source-select-panel");
    const trigger = document.querySelector("#screen-source-select-trigger");
    const parent = document.querySelector("#screen-source-header-panel");
    const panelRect = panel.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    return {
      portalParentId: panel.parentElement?.id || "",
      hidden: panel.classList.contains("is-hidden"),
      panelRect: { left: panelRect.left, top: panelRect.top, right: panelRect.right, bottom: panelRect.bottom },
      triggerRect: { left: triggerRect.left, top: triggerRect.top, right: triggerRect.right, bottom: triggerRect.bottom },
      parentRect: { left: parentRect.left, top: parentRect.top, right: parentRect.right, bottom: parentRect.bottom },
    };
  });
  assert(
    refreshedTargetMenuLayout.portalParentId === "global-overlay-layer" &&
      !refreshedTargetMenuLayout.hidden &&
      refreshedTargetMenuLayout.panelRect.left >= 12 &&
      refreshedTargetMenuLayout.panelRect.top >= 12 &&
      refreshedTargetMenuLayout.panelRect.right <= viewport.width - 12 &&
      refreshedTargetMenuLayout.panelRect.bottom <= viewport.height - 12 &&
      !rectanglesOverlap(refreshedTargetMenuLayout.panelRect, refreshedTargetMenuLayout.parentRect),
    "refreshed mapping target menu overlapped or remained clipped inside its parent popover",
    { viewport, refreshedTargetMenuLayout }
  );
  await page.keyboard.press("Escape");

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

  const assistantPanelFrame = await page.locator(".conversation-panel").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
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
      panelFrame: { left: panelRect.left, top: panelRect.top, width: panelRect.width, height: panelRect.height },
      switcherTop: document.querySelector("#right-panel-window-strip")?.getBoundingClientRect().top || 0,
      canvasToolbarTop: document.querySelector(".canvas2d-engine-toolbar")?.getBoundingClientRect().top || 0,
      loaderSize: document.querySelector("#screen-source-loader-host")?.getBoundingClientRect().width || 0,
      emptyCenter: (() => {
        const rect = document.querySelector(".screen-source-empty-shell")?.getBoundingClientRect();
        return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
      })(),
      contentCenter: (() => {
        const rect = preview.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })(),
      insets: {
        left: previewRect.left - panelRect.left,
        right: panelRect.right - previewRect.right,
        bottom: panelRect.bottom - previewRect.bottom,
      },
    };
  });
  const expectedPanelPadding = viewport.width <= 680 ? "10px" : "12px 14px 14px";
  assert(
    frame.panelPadding === expectedPanelPadding && frame.panelRadius === "12px",
    "AI mirror workspace does not use the shared assistant frame",
    { viewport, expectedPanelPadding, frame }
  );
  assert(
      Math.abs(frame.panelFrame.left - assistantPanelFrame.left) <= 0.5 &&
      Math.abs(frame.panelFrame.top - assistantPanelFrame.top) <= 0.5 &&
      Math.abs(frame.panelFrame.width - assistantPanelFrame.width) <= 0.5 &&
      Math.abs(frame.panelFrame.height - assistantPanelFrame.height) <= 0.5,
    "AI assistant and AI mirror change the outer workspace dimensions when switched",
    { viewport, assistantPanelFrame, mirrorPanelFrame: frame.panelFrame }
  );
  assert(
    Math.abs(frame.loaderSize - 64) <= 0.5 &&
      Math.abs(frame.emptyCenter.x - frame.contentCenter.x) <= 1 &&
      Math.abs(frame.emptyCenter.y - frame.contentCenter.y) <= 1,
    "AI mirror empty state is not consistently sized and centered",
    { viewport, frame }
  );
  assert(
    frame.switcherTop - frame.panelFrame.top <= (viewport.width <= 720 ? 56 : 24) &&
      (viewport.width <= 720 || Math.abs(frame.switcherTop - frame.canvasToolbarTop) <= 4),
    "AI assistant and AI mirror switcher remains lower than the canvas toolbar",
    { viewport, frame }
  );
  assert(frame.previewBorder === "1px" && frame.previewRadius === "10px", "AI mirror preview still has an oversized outer frame", { viewport, frame });
  assert(!frame.nativeBoxShadow.includes("14px"), "native AI mirror restored the legacy 14px inset frame", { viewport, frame });
  assert(frame.insets.left <= 16 && frame.insets.right <= 16 && frame.insets.bottom <= 16, "AI mirror content padding is not aligned with the assistant frame", { viewport, frame });

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
    await page.waitForFunction(
      (selector) => Number(getComputedStyle(document.querySelector(selector), "::after").opacity) > 0.95,
      railSelector,
      { timeout: 1_000 }
    ).catch(() => {});
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

  for (const railClass of rails) {
    const leftRailSelector = `.desktop-clear-stage > .canvas-chrome-edge-rail.${railClass}`;
    const rightRailSelector = `.conversation-panel > .canvas-chrome-edge-rail.${railClass}`;
    await moveAway(page, viewport);
    const leftIdle = await readEdgeRail(page, leftRailSelector);
    const rightIdle = await readEdgeRail(page, rightRailSelector);
    assert(
      rightIdle.cursor === leftIdle.cursor &&
        rightIdle.indicatorTransitionDuration === leftIdle.indicatorTransitionDuration &&
        rightIdle.indicatorTransitionDuration !== "0s" &&
        rightIdle.indicatorTransitionProperty === leftIdle.indicatorTransitionProperty,
      "conversation edge rail animation does not match the canvas edge rail",
      { viewport, railClass, leftIdle, rightIdle }
    );

    const hitPoint = await findInteractiveRailPoint(page, rightRailSelector);
    assert(Boolean(hitPoint), "conversation edge rail has no unobstructed interactive point", { viewport, railClass });
    await page.mouse.move(hitPoint.x, hitPoint.y);
    await page.waitForFunction(
      (selector) => Number(getComputedStyle(document.querySelector(selector), "::after").opacity) > 0.95,
      rightRailSelector,
      { timeout: 1_000 }
    );
    const hovered = await readEdgeRail(page, rightRailSelector);
    assert(hovered.indicatorOpacity > 0.95, "conversation edge rail did not animate into view", {
      viewport,
      railClass,
      hovered,
    });

    await page.mouse.down();
    await page.mouse.move(hitPoint.x - 6, hitPoint.y + 5, { steps: 2 });
    const dragging = await page.evaluate(() => ({
      body: document.body.classList.contains("is-stage-dragging"),
      panel: document.querySelector(".conversation-panel")?.classList.contains("is-stage-moving"),
    }));
    assert(dragging.body && dragging.panel, "conversation edge drag did not enter its active state", {
      viewport,
      railClass,
      dragging,
    });
    await page.mouse.up();
    await moveAway(page, viewport);
    const restored = await page.evaluate(() => ({
      body: document.body.classList.contains("is-stage-dragging"),
      resizing: document.body.classList.contains("is-resizing"),
      panel: document.querySelector(".conversation-panel")?.classList.contains("is-stage-moving"),
    }));
    assert(!restored.body && !restored.resizing && !restored.panel, "conversation edge drag state did not restore", {
      viewport,
      railClass,
      restored,
    });
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
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      navigatorRect: navigatorRect
        ? { left: navigatorRect.left, top: navigatorRect.top, right: navigatorRect.right, bottom: navigatorRect.bottom }
        : null,
      navigatorRight: navigatorRect?.right || 0,
      titleHeight: titleRect?.height || 0,
      canvasHit: Boolean(canvas && hit === canvas),
      hasDragLabel: Boolean(element.querySelector(".canvas2d-transient-minimap-meta")),
      background: getComputedStyle(element).backgroundColor,
    };
  });
  const avoidsNavigator = viewport.width <= 720
    ? !expanded.navigatorRect || !rectanglesOverlap(expanded.rect, expanded.navigatorRect, 8)
    : expanded.rect.left >= expanded.navigatorRight + 10;
  assert(avoidsNavigator, "current-location minimap is covered by the navigator", {
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
  const navigatorHeaderLayout = await page.evaluate(() => {
    const read = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null;
    };
    return {
      brand: read(".canvas2d-navigator-brand"),
      panelControls: read('[data-stage-panel-controls="left"]'),
    };
  });
  assert(
    navigatorHeaderLayout.brand && navigatorHeaderLayout.panelControls && !rectanglesOverlap(navigatorHeaderLayout.brand, navigatorHeaderLayout.panelControls, 4),
    "canvas navigator brand is covered by the workspace controls",
    { viewport, navigatorHeaderLayout }
  );
  await page.locator(".canvas2d-navigator-dock-collapse").click();
  await page.waitForTimeout(260);
  const infoSelector = ".canvas-chrome-info-dock";
  const expanded = await readSurface(page, infoSelector);
  const expandedMetrics = await page.evaluate(() => {
    const logo = document.querySelector(".canvas-chrome-info-dock .canvas2d-brand-logo")?.getBoundingClientRect();
    const label = document.querySelector(".canvas-chrome-info-dock .canvas2d-brand-label")?.getBoundingClientRect();
    const toggle = document.querySelector(".canvas-chrome-info-dock .canvas2d-info-collapse-toggle")?.getBoundingClientRect();
    const panelControls = document.querySelector('[data-stage-panel-controls="left"]')?.getBoundingClientRect();
    const utility = document.querySelector(".canvas-chrome-utility-dock")?.getBoundingClientRect();
    const info = document.querySelector(".canvas-chrome-info-dock")?.getBoundingClientRect();
    const canvasPanel = document.querySelector(".desktop-clear-stage")?.getBoundingClientRect();
    return {
      logoHeight: logo?.height || 0,
      logoRightGap: logo && info ? info.right - logo.right : null,
      brandOrder: Boolean(label && logo && label.right <= logo.left),
      toggleSideAligned: Boolean(toggle && info && Math.abs((toggle.top + toggle.bottom) / 2 - (info.top + info.bottom) / 2) <= 1 && toggle.left >= info.left && toggle.left - info.left <= 4),
      toggleAvoidsLogo: Boolean(toggle && logo && toggle.right <= logo.left),
      logoAvoidsPanelControls: Boolean(
        logo && panelControls &&
          (logo.right <= panelControls.left || logo.left >= panelControls.right || logo.bottom <= panelControls.top || logo.top >= panelControls.bottom)
      ),
      bottomDelta: info && utility ? info.bottom - utility.bottom : null,
      canvasWidth: canvasPanel?.width || 0,
      contained: Boolean(info && canvasPanel && info.left >= canvasPanel.left && info.right <= canvasPanel.right),
    };
  });
  assert(expanded.background === "rgba(255, 255, 255, 0.58)" && expanded.hitInside, "canvas information dock has no usable glass backing", {
    viewport,
    expanded,
  });
  assert(
    expandedMetrics.logoRightGap >= 0 && expandedMetrics.logoRightGap <= 12 && expandedMetrics.brandOrder && expandedMetrics.toggleSideAligned && expandedMetrics.toggleAvoidsLogo && expandedMetrics.logoAvoidsPanelControls,
    "canvas information dock did not keep the logo at the right and the collapse control at the side midpoint",
    { viewport, expandedMetrics }
  );
  if (expandedMetrics.canvasWidth >= 620) {
    assert(expandedMetrics.logoHeight >= 18 && Math.abs(expandedMetrics.bottomDelta) <= 1, "expanded canvas information dock is not aligned with the stacked chrome", {
      viewport,
      expandedMetrics,
    });
  } else {
    assert(expandedMetrics.logoHeight >= 18 && expandedMetrics.contained, "expanded canvas information dock escaped the narrow canvas workspace", {
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
  const restoredWidthIsValid = expanded.rect.width > 78.5 ? restored.rect.width >= 185 : restored.rect.width <= 78.5;
  assert(restoredWidthIsValid && restored.hitInside && restored.background === expanded.background, "canvas information dock did not restore", {
    viewport,
    expanded,
    restored,
  });
}

async function checkPanelLayoutControls(page, viewport) {
  const restoreDefault = page.locator("#stage-restore-btn");
  const leftPanel = page.locator(".desktop-clear-stage");
  const rightPanel = page.locator(".conversation-panel");
  const leftMode = page.locator('[data-stage-panel-action="presentation"][data-stage-panel-side="left"]');
  const leftCollapse = page.locator('[data-stage-panel-action="close"][data-stage-panel-side="left"]');
  const rightCollapse = page.locator('[data-stage-panel-action="close"][data-stage-panel-side="right"]');

  const iconContract = await page.evaluate(() => {
    const selectors = [
      "#restore-left-pane-btn",
      "#restore-right-pane-btn",
      '[data-stage-panel-action="close"][data-stage-panel-side="left"]',
      '[data-stage-panel-drag="left"]',
      '[data-stage-panel-action="presentation"][data-stage-panel-side="left"]',
      '[data-stage-panel-action="close"][data-stage-panel-side="right"]',
      '[data-stage-panel-drag="right"]',
      '[data-stage-panel-action="presentation"][data-stage-panel-side="right"]',
    ];
    return selectors.map((selector) => {
      const element = document.querySelector(selector);
      return {
        selector,
        exists: Boolean(element),
        text: element?.textContent?.trim() || "",
        svgCount: element?.querySelectorAll("svg").length || 0,
        label: element?.getAttribute("aria-label") || "",
        title: element?.getAttribute("title") || "",
      };
    });
  });
  assert(
    iconContract.every((entry) => entry.exists && entry.text === "" && entry.svgCount >= 1 && entry.label && entry.title),
    "panel layout controls are not complete accessible icon controls",
    { viewport, iconContract }
  );

  const restorePlacement = await restoreDefault.evaluate((element) => ({
    parentId: element.parentElement?.id || "",
    label: element.textContent?.trim() || "",
    standaloneDockCount: document.querySelectorAll("#stage-restore-dock").length,
  }));
  assert(
    restorePlacement.parentId === "conversation-shell-menu" &&
      restorePlacement.label === "恢复默认布局" &&
      restorePlacement.standaloneDockCount === 0,
    "default layout recovery is not contained in the global more menu",
    { viewport, restorePlacement }
  );

  if (!(await restoreDefault.isDisabled())) {
    await page.locator("#conversation-shell-more").click();
    await restoreDefault.click();
  }
  for (const selector of ["#restore-left-pane-btn", "#restore-right-pane-btn"]) {
    const restorePanel = page.locator(selector);
    if (await restorePanel.isVisible()) {
      await restorePanel.click();
    }
  }
  await page.waitForFunction(() =>
    getComputedStyle(document.querySelector(".desktop-clear-stage")).display !== "none" &&
    getComputedStyle(document.querySelector(".conversation-panel")).display !== "none" &&
    document.querySelector(".desktop-clear-stage")?.dataset.workspaceMode === "normal" &&
    document.querySelector(".conversation-panel")?.dataset.workspaceMode === "normal"
  );
  const defaultLayout = await page.evaluate(() => {
    const read = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    return {
      left: read(".desktop-clear-stage"),
      right: read(".conversation-panel"),
      leftControls: read('[data-stage-panel-controls="left"]'),
      rightControls: read('[data-stage-panel-controls="right"]'),
      leftCollapse: read('[data-stage-panel-action="close"][data-stage-panel-side="left"]'),
      rightCollapse: read('[data-stage-panel-action="close"][data-stage-panel-side="right"]'),
      rightHeader: read(".right-panel-window-controls"),
    };
  });
  assert(
    defaultLayout.left.right <= defaultLayout.right.left + 1,
    "viewport-aware default layout still overlaps the canvas and conversation workspaces",
    { viewport, defaultLayout }
  );
  for (const [name, panel, controls] of [
    ["left", defaultLayout.left, defaultLayout.leftControls],
    ["right", defaultLayout.right, defaultLayout.rightControls],
  ]) {
    assert(
      controls.left >= panel.left && controls.top >= panel.top && controls.top <= panel.top + 10 && controls.bottom <= panel.top + 38,
      `${name} panel controls are not docked to the top-left edge rail`,
      { viewport, panel, controls }
    );
  }
  for (const [name, panel, collapse, expectedSide] of [
    ["left", defaultLayout.left, defaultLayout.leftCollapse, "left"],
    ["right", defaultLayout.right, defaultLayout.rightCollapse, "right"],
  ]) {
    const sideAligned = expectedSide === "left"
      ? Math.abs(collapse.left - panel.left) <= 1
      : Math.abs(collapse.right - panel.right) <= 1;
    assert(
      sideAligned &&
        Math.abs((collapse.top + collapse.bottom) / 2 - (panel.top + panel.bottom) / 2) <= 1 &&
        collapse.width <= 12.5 &&
        collapse.height >= 70,
      `${name} panel collapse control is not docked to the side midpoint`,
      { viewport, panel, collapse }
    );
  }
  const leftCollapseRestingRect = await leftCollapse.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
  await leftCollapse.hover();
  await page.waitForTimeout(180);
  const leftCollapseHoverRect = await leftCollapse.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
  await page.mouse.down();
  const leftCollapsePressedRect = await leftCollapse.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.up();
  assert(
    [leftCollapseHoverRect, leftCollapsePressedRect].every((rect) =>
      Math.abs(rect.left - leftCollapseRestingRect.left) <= 0.5 &&
      Math.abs(rect.top - leftCollapseRestingRect.top) <= 0.5 &&
      Math.abs(rect.right - leftCollapseRestingRect.right) <= 0.5 &&
      Math.abs(rect.bottom - leftCollapseRestingRect.bottom) <= 0.5
    ),
    "panel collapse handle shifts when hovered or pressed",
    { viewport, leftCollapseRestingRect, leftCollapseHoverRect, leftCollapsePressedRect }
  );
  assert(
    !rectanglesOverlap(defaultLayout.rightControls, defaultLayout.rightHeader, 6),
    "right panel edge controls overlap the header rail",
    { viewport, defaultLayout }
  );

  assert((await leftMode.getAttribute("title"))?.includes("半屏"), "normal panel mode did not advertise the next half-screen action", viewport);
  await leftMode.click();
  assert((await leftPanel.getAttribute("data-workspace-mode")) === "half-left", "panel did not enter half-screen mode", viewport);
  assert((await leftMode.getAttribute("title"))?.includes("全屏"), "half-screen panel mode did not advertise the next fullscreen action", viewport);
  await leftMode.click();
  assert((await leftPanel.getAttribute("data-workspace-mode")) === "maximized", "panel did not enter fullscreen mode", viewport);
  assert((await leftMode.getAttribute("title"))?.includes("常规"), "fullscreen panel mode did not advertise the restore action", viewport);
  await leftMode.click();
  assert((await leftPanel.getAttribute("data-workspace-mode")) === "normal", "panel mode did not recover to normal", viewport);

  await leftMode.click();
  assert(!(await restoreDefault.isDisabled()), "layout recovery did not enable after a panel mode change", viewport);
  await page.locator("#conversation-shell-more").click();
  await restoreDefault.click();
  await page.waitForTimeout(80);
  const restoredDefaultState = await page.evaluate(() => ({
    leftMode: document.querySelector(".desktop-clear-stage")?.dataset.workspaceMode || "",
    rightMode: document.querySelector(".conversation-panel")?.dataset.workspaceMode || "",
    restoreDisabled: document.querySelector("#stage-restore-btn")?.disabled,
    menuHidden: document.querySelector("#conversation-shell-menu")?.classList.contains("is-hidden"),
  }));
  assert(
    restoredDefaultState.leftMode === "normal" &&
      restoredDefaultState.rightMode === "normal" &&
      restoredDefaultState.restoreDisabled === true &&
      restoredDefaultState.menuHidden,
    "default layout did not recover and close its parent menu",
    { viewport, restoredDefaultState }
  );

  await leftCollapse.click();
  await page.waitForFunction(() => document.querySelector(".desktop-clear-stage")?.classList.contains("is-pane-collapsed"));
  const restoreLeft = page.locator("#restore-left-pane-btn");
  const collapsedRestore = await restoreLeft.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
  assert(
    Math.abs((collapsedRestore.top + collapsedRestore.bottom) / 2 - viewport.height / 2) <= 1 &&
      collapsedRestore.left <= 0.5 &&
      collapsedRestore.right - collapsedRestore.left >= 15 &&
      collapsedRestore.right - collapsedRestore.left <= 16.5 &&
      collapsedRestore.bottom - collapsedRestore.top >= 80,
    "collapsed canvas restore control is not a centered left-edge drawer handle",
    { viewport, collapsedRestore }
  );
  await restoreLeft.click();
  await page.waitForFunction(() => !document.querySelector(".desktop-clear-stage")?.classList.contains("is-pane-collapsed"));
  assert((await leftPanel.getAttribute("data-workspace-mode")) === "normal", "collapsed panel did not recover its normal layout", viewport);
  assert(await rightPanel.isVisible(), "conversation panel was damaged by canvas panel recovery", viewport);

  await rightCollapse.click();
  await page.waitForFunction(() => document.querySelector(".conversation-panel")?.classList.contains("is-pane-collapsed"));
  await page.waitForTimeout(160);
  const restoreRight = page.locator("#restore-right-pane-btn");
  const rightRestore = await restoreRight.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
  assert(
    Math.abs((rightRestore.top + rightRestore.bottom) / 2 - viewport.height / 2) <= 1 &&
      Math.abs(viewport.width - rightRestore.right) <= 0.5 &&
      rightRestore.right - rightRestore.left >= 15 &&
      rightRestore.right - rightRestore.left <= 16.5 &&
      rightRestore.bottom - rightRestore.top >= 80,
    "collapsed conversation restore control is not a centered right-edge drawer handle",
    { viewport, rightRestore }
  );
  await restoreRight.click();
  await page.waitForFunction(() => !document.querySelector(".conversation-panel")?.classList.contains("is-pane-collapsed"));
  assert((await rightPanel.getAttribute("data-workspace-mode")) === "normal", "conversation panel did not recover its normal layout", viewport);
  assert(await leftPanel.isVisible(), "canvas panel was damaged by conversation panel recovery", viewport);
}

async function checkPanelResizeContract(page, viewport) {
  if (viewport.width < 1200) return;

  const readFrame = (selector) =>
    page.locator(selector).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });
  const dragBy = async (selector, deltaX, deltaY = 0) => {
    const box = await page.locator(selector).boundingBox();
    assert(Boolean(box), "panel resize handle is not visible", { viewport, selector });
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(80);
  };

  const leftResizer = page.locator("#left-pane-resizer");
  const rightResizer = page.locator("#right-pane-resizer");
  assert((await leftResizer.getAttribute("data-resize-edge")) === "right", "left-docked canvas uses the wrong resize edge", viewport);
  assert((await rightResizer.getAttribute("data-resize-edge")) === "left", "right-docked conversation uses the wrong resize edge", viewport);

  const leftBefore = await readFrame(".desktop-clear-stage");
  await dragBy("#left-pane-resizer", 80);
  const leftAfter = await readFrame(".desktop-clear-stage");
  assert(
    Math.abs(leftAfter.left - leftBefore.left) <= 1 && Math.abs(leftAfter.width - leftBefore.width - 80) <= 2,
    "left-docked canvas did not resize from its right edge",
    { viewport, leftBefore, leftAfter }
  );
  await leftResizer.dblclick();
  await page.waitForTimeout(80);

  const rightBefore = await readFrame(".conversation-panel");
  await dragBy("#right-pane-resizer", -80);
  const rightExpanded = await readFrame(".conversation-panel");
  assert(
    Math.abs(rightExpanded.right - rightBefore.right) <= 1 &&
      Math.abs(rightExpanded.width - rightBefore.width - 80) <= 2 &&
      Math.abs(rightExpanded.left - rightBefore.left + 80) <= 2,
    "right-docked conversation did not resize from its left edge",
    { viewport, rightBefore, rightExpanded }
  );
  await dragBy("#right-pane-resizer", 60);
  const rightShrunk = await readFrame(".conversation-panel");
  assert(
    Math.abs(rightShrunk.right - rightExpanded.right) <= 1 && Math.abs(rightShrunk.width - rightExpanded.width + 60) <= 2,
    "right-docked conversation lost its fixed right edge while shrinking",
    { viewport, rightExpanded, rightShrunk }
  );
  await rightResizer.dblclick();
  await page.waitForTimeout(80);

  const cancelBox = await leftResizer.boundingBox();
  await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cancelBox.x + cancelBox.width / 2 + 12, cancelBox.y + cancelBox.height / 2, { steps: 2 });
  await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 })));
  assert(
    !await page.evaluate(() =>
      document.body.classList.contains("is-resizing") || document.body.classList.contains("is-pane-resizing")
    ),
    "panel resize state survived pointer cancellation",
    viewport
  );
  await page.mouse.up();

  const lostCaptureBox = await leftResizer.boundingBox();
  await page.mouse.move(lostCaptureBox.x + lostCaptureBox.width / 2, lostCaptureBox.y + lostCaptureBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(lostCaptureBox.x + lostCaptureBox.width / 2 + 12, lostCaptureBox.y + lostCaptureBox.height / 2, { steps: 2 });
  await leftResizer.evaluate((element) => element.dispatchEvent(new Event("lostpointercapture")));
  assert(
    !await page.evaluate(() =>
      document.body.classList.contains("is-resizing") || document.body.classList.contains("is-pane-resizing")
    ),
    "panel resize state survived lost pointer capture",
    viewport
  );
  await page.mouse.up();

  const blurBox = await leftResizer.boundingBox();
  await page.mouse.move(blurBox.x + blurBox.width / 2, blurBox.y + blurBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(blurBox.x + blurBox.width / 2 + 12, blurBox.y + blurBox.height / 2, { steps: 2 });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert(
    !await page.evaluate(() =>
      document.body.classList.contains("is-resizing") || document.body.classList.contains("is-pane-resizing")
    ),
    "panel resize state survived window blur",
    viewport
  );
  await page.mouse.up();

  const rightCollapse = page.locator('[data-stage-panel-action="close"][data-stage-panel-side="right"]');
  await rightCollapse.click();
  await page.waitForFunction(() => document.querySelector(".conversation-panel")?.classList.contains("is-pane-collapsed"));
  const hiddenHit = await rightResizer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      opacity: getComputedStyle(element).opacity,
      pointerEvents: getComputedStyle(element).pointerEvents,
      interceptsPointer: hit === element,
    };
  });
  assert(
    hiddenHit.pointerEvents === "none" && !hiddenHit.interceptsPointer,
    "hidden conversation resize handle still intercepts pointer input",
    { viewport, hiddenHit }
  );
  await page.locator("#restore-right-pane-btn").click();
  await page.waitForFunction(() => !document.querySelector(".conversation-panel")?.classList.contains("is-pane-collapsed"));
}

async function checkViewport(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message || error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.addInitScript(() => {
      const defaultTargets = [
        { id: "target-a", name: "Target A", label: "Target A", note: "primary" },
        { id: "target-b", name: "Target B", label: "Target B", note: "secondary" },
      ];
      let queuedResponses = [];
      window.__queueAiMirrorTargetResponses = (responses = []) => {
        queuedResponses = Array.isArray(responses) ? responses.slice() : [];
      };
      window.desktopShell = {
        isDesktop: true,
        async listAiMirrorTargets() {
          const response = queuedResponses.shift() || { delay: 0, targets: defaultTargets };
          if (response.delay) {
            await new Promise((resolve) => window.setTimeout(resolve, response.delay));
          }
          return { ok: true, targets: response.targets };
        },
      };
    });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".canvas2d-engine-toolbar", { timeout: 15_000 });

    await checkChromeStates(page, viewport);
    await checkMinimap(page, viewport);
    await checkInfoDock(page, viewport);
    await checkPanelLayoutControls(page, viewport);
    await checkPanelResizeContract(page, viewport);

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
    await assertPortalMenu(page, ".canvas2d-engine-menu-share", viewport);
    await shareButton.click();

    const menuButton = page.locator('.canvas2d-engine-tool[title="菜单"]');
    const menu = page.locator(".canvas2d-engine-menu-portal.canvas2d-engine-menu-wide");
    await menuButton.click();
    await menu.getByRole("menuitem", { name: "自动对齐吸附" }).click();
    assert(await menu.getByRole("menuitemcheckbox", { name: /启用自动吸附/ }).isVisible(), "alignment submenu did not open", viewport);
    await menu.getByRole("menuitem", { name: "背景" }).click();
    assert((await menu.getByRole("menuitem", { name: "自动对齐吸附" }).getAttribute("aria-expanded")) === "false", "alignment submenu did not close", viewport);
    assert(await menu.getByRole("menuitemradio", { name: /无背景/ }).isVisible(), "background submenu did not open", viewport);
    await menu.getByRole("menuitem", { name: "关于画布" }).click();
    assert((await menu.getByRole("menuitem", { name: "背景" }).getAttribute("aria-expanded")) === "false", "background submenu did not close", viewport);
    assert(await menu.locator(".canvas2d-engine-menu-group-about").isVisible(), "about submenu did not open", viewport);
    const menuSurface = await readSurface(page, ".canvas2d-engine-menu-portal.canvas2d-engine-menu-wide");
    assert(menuSurface.background === "rgb(255, 255, 255)" && menuSurface.hitInside, "main menu is not a usable white surface", {
      viewport,
      menuSurface,
    });
    assert(menuSurface.rect.bottom <= viewport.height, "main menu extends below the viewport", { viewport, menuSurface });
    await assertPortalMenu(page, ".canvas2d-engine-menu-portal.canvas2d-engine-menu-wide", viewport);
    await page.keyboard.press("Escape");
    assert(!(await menu.isVisible()), "Escape did not close the canvas menu", viewport);
    assert(await menuButton.evaluate((button) => document.activeElement === button), "menu trigger focus was not restored", viewport);

    const canvasBoundary = await page.locator("#canvas-canvas2d-host").evaluate((element) => {
      const shadow = getComputedStyle(element).boxShadow;
      const before = element.getBoundingClientRect();
      return { shadow, width: before.width, height: before.height };
    });
    assert(canvasBoundary.shadow !== "none", "canvas surface does not expose a desktop boundary", { viewport, canvasBoundary });

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
