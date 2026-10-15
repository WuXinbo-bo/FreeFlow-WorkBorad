const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { compileWordExportAstToDocxBuffer } = require("../electron/wordDocxCompiler");
const BASE = process.env.AIR_CANVAS_TEST_URL || "http://127.0.0.1:53127/";

async function main() {
  const browser = await chromium.launch();
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), "freeflow-showcase-browser-"));
  console.log("[artifacts]", artifacts);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", msg => { if (msg.type() === "error") console.log("[renderer]", msg.text()); });
    await page.exposeFunction("generateDocx", async ({ ast }) => {
      const buffer = await compileWordExportAstToDocxBuffer(ast);
      return { ok: true, docxBase64: buffer.toString("base64"), size: buffer.length };
    });
    await page.goto(new URL("/feature-showcase.html", BASE).href);
    await page.evaluate(() => window.startFeatureShowcase({ previewWord: window.generateDocx }));
    await page.waitForFunction(() => window.__featureShowcase?.player.getSnapshot().status === "paused");
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__featureShowcase.engine.getSnapshotData().items.length), 0, "reduced motion started playback");
    const chapter = async (index, lastStep) => {
      await page.evaluate(index => { void window.__featureShowcase.player.goTo(index); }, index);
      await page.waitForFunction(index => { const s = window.__featureShowcase.player.getSnapshot(); if (s.status === "error") throw new Error(s.error); return s.chapter === index && s.status === "paused" && s.step === -1; }, index);
      for (let step = 0; step <= lastStep; step++) {
        await page.getByRole("button", { name: "下一步", exact: true }).click();
        await page.waitForFunction(step => { const s = window.__featureShowcase.player.getSnapshot(); if (s.status === "error") throw new Error(s.error); return s.step === step && s.status === "paused"; }, step);
      }
    };
    await chapter(1, 0);
    const beforeTyping = await page.locator('#canvas-rich-editor').innerHTML();
    await page.locator('#canvas-rich-editor').press('A');
    assert.equal(await page.locator('#canvas-rich-editor').innerHTML(), beforeTyping, 'autoplay editor accepted unrequested keyboard input');
    await chapter(1, 2);
    assert(await page.evaluate(() => window.__featureShowcase.engine.getSnapshotData().items[0].html.includes("我的行动方案")));
    await chapter(5, 2);
    assert(await page.evaluate(() => document.querySelector(".showcase-mirror-webpage").contentDocument.getSelection().toString().includes("从资料到行动")), "mirror did not select real webpage content");
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await page.waitForFunction(() => window.__featureShowcase.player.getSnapshot().step === 3 && window.__featureShowcase.player.getSnapshot().status === "paused");
    assert(await page.evaluate(() => window.__featureShowcase.engine.getSnapshotData().items.some(item => item.html?.includes("从资料到行动"))));
    for (const viewport of [{ width: 1280, height: 800 }, { width: 900, height: 650 }, { width: 680, height: 520 }]) {
      await page.setViewportSize(viewport);
      const geometry = await page.evaluate(() => {
        const stage = document.querySelector(".showcase-stage").getBoundingClientRect();
        const actions = document.querySelector(".showcase-actions").getBoundingClientRect();
        const mirror = document.querySelector(".showcase-mirror").getBoundingClientRect();
        return { fits: actions.bottom <= innerHeight && stage.height > 100 && mirror.right <= innerWidth && mirror.left >= stage.left,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert(geometry.fits && !geometry.overflow, `tour overflow at ${JSON.stringify(viewport)}: ${JSON.stringify(geometry)}`);
      await page.screenshot({ path: path.join(artifacts, `mirror-${viewport.width}.png`) });
    }
    await chapter(6, 2);
    await page.waitForFunction(() => document.querySelector(".canvas2d-word-export-docx-iframe")?.contentDocument?.querySelector("section.canvas2d-word-docx-preview-document"), null, {timeout: 8000}).catch(async error => {
      console.log("[word failure]", await page.evaluate(() => ({text:document.querySelector('.canvas2d-word-export-overlay')?.innerText, frames:[...document.querySelectorAll('iframe')].map(f=>({cls:f.className,html:f.contentDocument?.body?.innerHTML?.slice(0,1000),head:f.contentDocument?.head?.innerHTML,zip:typeof f.contentWindow?.JSZip,resources:f.contentWindow?.performance.getEntriesByType("resource").map(e=>e.name)})), state:window.__featureShowcase.player.getSnapshot()})));
      await page.screenshot({path:path.join(artifacts,'failure.png')}); throw error;
    });
    await page.screenshot({ path: path.join(artifacts, "word-680.png") });
    await page.getByRole("button", { name: "亲自试试", exact: true }).click();
    await page.waitForFunction(() => window.__featureShowcase.player.getSnapshot().practicing);
    assert.equal(await page.locator(".showcase-interaction-guard").count(), 0);
    await page.evaluate(() => { const e=window.__featureShowcase.engine; e.closeWordExportPreview(); const board=e.getSnapshotData(); e.loadStructuredBoardForExport({...board,selectedIds:[board.items.find(i=>i.type==='text').id]}); e.runCommand('element.edit'); });
    await page.locator('#canvas-rich-editor').fill('练习修改');
    await page.evaluate(() => window.__featureShowcase.engine.runCommand('element.commit-edit'));
    assert(await page.evaluate(() => window.__featureShowcase.engine.getSnapshotData().items.some(item=>item.html?.includes('练习修改'))));
    await chapter(0, 1);
    assert.equal(await page.evaluate(() => window.__featureShowcase.engine.getSnapshotData().items.length), 1, "replay retained practice state");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "播放", exact: true }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => window.__featureShowcase.player.getSnapshot().status === "paused");
    await page.evaluate(() => window.__featureShowcase.dispose());
    assert.equal(await page.locator(".showcase-shell").count(), 0);
    assert.deepEqual(errors, []);
    console.log(`[feature-showcase-browser] manual playback, mirror selection/paste, small-window layout, practice/replay, motion preference changes and disposal passed; artifacts: ${artifacts}`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
