const assert = require("node:assert/strict");

async function main() {
  const { createShowcasePlayer } = await import("../public/src/runtime/tutorial-system/showcasePlayer.js");
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  let releases = [];
  let mutations = [];
  let active = 0;
  let maxActive = 0;
  const player = createShowcasePlayer({
    chapters: [0, 1].map(id => ({ description: String(id), steps: [{ caption: String(id), duration: 180,
      async run(signal) { active++; maxActive = Math.max(maxActive, active); await new Promise(resolve => releases.push(resolve)); if (!signal.aborted) mutations.push(id); active--; } }] })),
    prepare: async () => {},
  });
  void player.goTo(0);
  await wait(5);
  player.pause();
  const paused = player.getSnapshot();
  assert.equal(paused.status, "paused");
  void player.goTo(1);
  releases.shift()();
  await wait(5);
  assert.equal(maxActive, 1, "chapter operations overlapped");
  assert.deepEqual(mutations, [], "canceled step mutated the next chapter");
  const practicing = player.practice();
  assert.equal(player.getSnapshot().practicing, false, "practice began before the pending operation settled");
  releases.shift()();
  await practicing;
  assert.equal(player.getSnapshot().practicing, true);
  const count = mutations.length;
  assert.equal(player.getSnapshot().chapter, 1);
  assert.equal(player.getSnapshot().status, "paused");
  const disposing = player.dispose();
  await disposing;
  await wait(200);
  assert.equal(mutations.length, count, "disposed player continued changing the scene");
  assert.equal(maxActive, 1);

  let ran = 0;
  const reduced = createShowcasePlayer({ reducedMotion: true, prepare: async () => {}, chapters: [{ steps: [0, 1].map(() => ({ run() { ran++; }, duration: 10 })) }] });
  void reduced.goTo(0);
  await wait(5);
  assert.equal(ran, 0, "reduced-motion tour auto-played");
  reduced.resume(); await wait(80); assert.equal(ran, 1);
  await wait(150); assert.equal(ran, 1, "reduced-motion tour advanced without user input");
  reduced.resume(); await wait(80); assert.equal(ran, 2);
  await reduced.dispose();

  const failing = createShowcasePlayer({ prepare: async () => { throw new Error("preview failed"); }, chapters: [{ steps: [] }] });
  await failing.goTo(0);
  assert.equal(failing.getSnapshot().status, "error");
  assert.match(failing.getSnapshot().error, /preview failed/);
  await failing.dispose();
  await checkMirrorVisibility();
  console.log("[feature-showcase] cancel, pause, practice, reduced motion and failure recovery passed");
}
async function checkMirrorVisibility() {
  const fs = require("node:fs");
  const vm = require("node:vm");
  const source = fs.readFileSync(require("node:path").join(__dirname, "../public/src/runtime/workbenchRuntime.js"), "utf8");
  const shouldHide = source.slice(source.indexOf("function shouldHideEmbeddedWindowForOverlay()"), source.indexOf("function isLeftStageOccludingRightPanel()"));
  const sync = source.slice(source.indexOf("function syncEmbeddedWindowOverlayVisibility()"), source.indexOf("function prepareEmbeddedWindowForDrawerOpen()"));
  let showing = false;
  const calls = [];
  const context = {
    IS_DESKTOP_APP: true, state: { desktopShellState: {}, drawerOpen: false },
    isEmbeddedScreenSourceActive: () => true, isScreenSourcePreviewAvailable: () => true,
    document: { querySelector: () => showing ? {} : null },
    desktopMenuPanel: { classList: { contains: () => true } }, conversationShellMenuEl: { classList: { contains: () => true } },
    screenSourceHeaderMenuOpen: false, screenSourceOverflowMenuEl: { hasAttribute: () => false },
    isLeftStageOccludingRightPanel: () => false, isLeftStageOccludingEmbeddedPreview: () => false,
    setEmbeddedProjectionVisibility: async visible => { calls.push(visible); }, scheduleEmbeddedScreenSourceSync: () => {},
  };
  const api = vm.runInNewContext(`let embeddedWindowOverlayHidden = false; let embeddedWindowOverlaySyncPromise = Promise.resolve(); ${shouldHide} ${sync}; ({syncEmbeddedWindowOverlayVisibility})`, context);
  for (let index = 0; index < 4; index++) {
    showing = true; const opening = api.syncEmbeddedWindowOverlayVisibility();
    showing = false; const closing = api.syncEmbeddedWindowOverlayVisibility();
    await Promise.all([opening, closing]);
  }
  assert.deepEqual(calls, [false, true, false, true, false, true, false, true], "native mirror was not restored after rapid tour exit");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
