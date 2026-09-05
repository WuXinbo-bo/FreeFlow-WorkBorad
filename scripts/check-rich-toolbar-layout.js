const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:53127/canvas-office.html";

async function waitFrames(page, count = 2) {
  await page.evaluate(
    async (frameCount) => {
      for (let index = 0; index < frameCount; index += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      }
    },
    count
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(String(error?.stack || error?.message || error));
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__canvas2dEngine), null, { timeout: 15000 });
    await page.evaluate(async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__canvas2dEngine.addFlowNode();
      await waitFrame();
    });

    const setup = await page.evaluate(() => {
      const snapshot = window.__canvas2dEngine.getSnapshot();
      return {
        root: snapshot?.board?.items?.find?.((item) => item.type === "mindNode" && !item.parentId) || null,
        view: snapshot?.board?.view || { scale: 1, offsetX: 0, offsetY: 0 },
        editingId: snapshot?.editingId || "",
      };
    });
    const { root, view, editingId } = setup;
    if (!root) {
      throw new Error("mindNode root not created");
    }

    if (editingId !== root.id) {
      const canvas = page.locator("#canvas-office-canvas");
      const canvasBox = await canvas.boundingBox();
      if (!canvasBox) {
        throw new Error("canvas bounding box unavailable");
      }

      const scale = Number(view.scale || 1);
      const clickX = canvasBox.x + Number(view.offsetX || 0) + (root.x + root.width / 2) * scale;
      const clickY = canvasBox.y + Number(view.offsetY || 0) + (root.y + root.height / 2) * scale;
      await page.mouse.dblclick(clickX, clickY);
      await waitFrames(page, 4);
    }

    await page.evaluate(() => {
      const selection = window.getSelection();
      const editor = document.querySelector("#canvas-rich-editor");
      if (!(editor instanceof HTMLElement) || !selection) {
        return;
      }
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    });
    await waitFrames(page, 4);

    const report = await page.evaluate(() => {
      const persistent = document.querySelector("#canvas2d-rich-toolbar");
      const selection = document.querySelector("#canvas2d-rich-selection-toolbar");
      const persistentRow = persistent?.querySelector?.(".canvas2d-rich-toolbar-row-single");
      const selectionRows = selection ? selection.querySelectorAll(".canvas2d-rich-toolbar-row") : [];
      const controlCenters = persistentRow
        ? Array.from(persistentRow.children)
            .filter((node) => node instanceof HTMLElement && getComputedStyle(node).display !== "none")
            .map((node) => {
              const rect = node.getBoundingClientRect();
              return Math.round(rect.top + rect.height / 2);
            })
        : [];
      return {
        persistentVisible: Boolean(persistent && !persistent.classList.contains("is-hidden")),
        persistentWrapped: Boolean(persistent?.classList.contains("is-wrapped")),
        persistentDisplay: persistentRow ? getComputedStyle(persistentRow).display : "",
        persistentFlexWrap: persistentRow ? getComputedStyle(persistentRow).flexWrap : "",
        persistentDistinctCenterCount: Array.from(new Set(controlCenters)).length,
        selectionVisible: Boolean(selection && !selection.classList.contains("is-hidden")),
        selectionRowCount: selectionRows.length,
        selectionRowDisplays: Array.from(selectionRows).map((row) => getComputedStyle(row).display),
        selectionDistinctTops: Array.from(selectionRows).map((row) => Math.round(row.getBoundingClientRect().top)),
      };
    });

    console.log(JSON.stringify({ report, errors }, null, 2));

    if (errors.length) {
      throw new Error(`page errors detected: ${errors.join("\n")}`);
    }
    if (!report.persistentVisible) {
      throw new Error("persistent toolbar is not visible");
    }
    if (report.persistentDisplay !== "flex" || report.persistentFlexWrap !== "nowrap") {
      throw new Error(`persistent toolbar row is not single-line flex nowrap: ${report.persistentDisplay} / ${report.persistentFlexWrap}`);
    }
    if (report.persistentDistinctCenterCount !== 1) {
      throw new Error(`persistent toolbar controls are not vertically aligned: ${report.persistentDistinctCenterCount}`);
    }
    if (!report.selectionVisible) {
      throw new Error("selection toolbar is not visible");
    }
    if (report.selectionRowCount !== 2) {
      throw new Error(`selection toolbar row count mismatch: ${report.selectionRowCount}`);
    }
    if (new Set(report.selectionDistinctTops).size !== 2) {
      throw new Error(`selection toolbar is not rendering as two rows: ${report.selectionDistinctTops.join(",")}`);
    }

    await page.keyboard.press("Escape");
    await waitFrames(page, 4);
    const recovered = await page.evaluate(() => ({
      editingId: window.__canvas2dEngine.getSnapshot()?.editingId || "",
      persistentHidden: document.querySelector("#canvas2d-rich-toolbar")?.classList.contains("is-hidden"),
      selectionHidden: document.querySelector("#canvas2d-rich-selection-toolbar")?.classList.contains("is-hidden"),
    }));
    if (recovered.editingId || !recovered.persistentHidden || !recovered.selectionHidden) {
      throw new Error(`rich toolbar state did not recover after editing: ${JSON.stringify(recovered)}`);
    }

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await page.evaluate(() => window.__canvas2dEngine.addFlowNode());
      await waitFrames(page, 2);
      await page.keyboard.press("Escape");
      await waitFrames(page, 2);
    }
    const rapidRecovery = await page.evaluate(() => ({
      editingId: window.__canvas2dEngine.getSnapshot()?.editingId || "",
      persistentHidden: document.querySelector("#canvas2d-rich-toolbar")?.classList.contains("is-hidden"),
      selectionHidden: document.querySelector("#canvas2d-rich-selection-toolbar")?.classList.contains("is-hidden"),
    }));
    if (rapidRecovery.editingId || !rapidRecovery.persistentHidden || !rapidRecovery.selectionHidden) {
      throw new Error(`rich toolbar state did not recover after rapid cycles: ${JSON.stringify(rapidRecovery)}`);
    }
    console.log(JSON.stringify({ recovered, rapidCycles: 3, rapidRecovery }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
