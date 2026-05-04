const { chromium } = require("playwright");

const BASE_URL = process.env.CANVAS_TEST_URL || "http://127.0.0.1:3000/canvas-office.html";

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

    const root = await page.evaluate(() => {
      const snapshot = window.__canvas2dEngine.getSnapshot();
      return snapshot?.board?.items?.find?.((item) => item.type === "mindNode" && !item.parentId) || null;
    });
    if (!root) {
      throw new Error("mindNode root not created");
    }

    const canvas = page.locator("canvas").first();
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) {
      throw new Error("canvas bounding box unavailable");
    }

    const clickX = canvasBox.x + root.x + root.width / 2;
    const clickY = canvasBox.y + root.y + root.height / 2;
    await page.mouse.dblclick(clickX, clickY);
    await waitFrames(page, 4);

    await page.evaluate(() => {
      const selection = window.getSelection();
      const editor = document.querySelector("#canvas-rich-editor");
      if (!(editor instanceof HTMLElement) || !selection) {
        return;
      }
      const textNode = editor.firstChild;
      if (textNode) {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    });
    await waitFrames(page, 4);

    const report = await page.evaluate(() => {
      const persistent = document.querySelector("#canvas2d-rich-toolbar");
      const selection = document.querySelector("#canvas2d-rich-selection-toolbar");
      const persistentRow = persistent?.querySelector?.(".canvas2d-rich-toolbar-row-single");
      const selectionRows = selection ? selection.querySelectorAll(".canvas2d-rich-toolbar-row") : [];
      const buttonTops = persistentRow
        ? Array.from(persistentRow.querySelectorAll(".canvas2d-rich-btn,.canvas2d-rich-select-wrap,.canvas2d-rich-submenu,[data-role='rich-color-control']")).map((node) =>
            Math.round(node.getBoundingClientRect().top)
          )
        : [];
      return {
        persistentVisible: Boolean(persistent && !persistent.classList.contains("is-hidden")),
        persistentWrapped: Boolean(persistent?.classList.contains("is-wrapped")),
        persistentDisplay: persistentRow ? getComputedStyle(persistentRow).display : "",
        persistentFlexWrap: persistentRow ? getComputedStyle(persistentRow).flexWrap : "",
        persistentDistinctTopCount: Array.from(new Set(buttonTops)).length,
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
    if (report.persistentDistinctTopCount !== 1) {
      throw new Error(`persistent toolbar default layout is not single-line: ${report.persistentDistinctTopCount}`);
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
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
