const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateShortcutAccelerator: validate, replaceShortcutRegistration: replace } = require('../electron/shortcutSettings');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
async function main() {
  for (const [value, expected] of [['Ctrl+X', 'Control+X'], ['Cmd+Shift+X', 'Command+Shift+X'], ['Ctrl+Alt+Shift+F12', 'Control+Shift+Alt+F12'], ['Shift+Plus', 'Shift+Plus']]) assert.equal(validate(value), expected);
  for (const value of ['', 'Shift', 'Control+Shift', 'A+B+C', 'Ctrl+A+B', 'Ctrl++X', 'X', 'Ctrl+F5', 'Cmd+R', 'Ctrl+Unknown', 'CommandOrControl+Control+X']) assert.throws(() => validate(value), undefined, value);
  const active = new Map([['Control+X', () => {}]]);
  const globalShortcut = { isRegistered: key => active.has(key), register: (key, cb) => { if (key === 'Control+Q' || active.has(key)) return false; active.set(key, cb); return true; }, unregister: key => active.delete(key) };
  let writes = 0; let triggers = 0;
  const options = { previous: 'Control+X', globalShortcut, persist: async () => { writes++; }, onTrigger: () => triggers++ };
  await assert.rejects(replace({ ...options, accelerator: 'Control+Q' }), /占用/); assert.equal(writes, 0); assert(active.has('Control+X'));
  await assert.rejects(replace({ ...options, accelerator: 'Control+Z', persist: async () => { throw Error('disk full'); } }), /disk full/); assert(active.has('Control+X')); assert(!active.has('Control+Z'));
  await replace({ ...options, accelerator: 'Control+Z' }); assert(!active.has('Control+X')); active.get('Control+Z')(); assert.equal(triggers, 1);
  await replace({ ...options, previous: 'Control+Z', accelerator: 'Control+Z' }); assert.equal(writes, 2);
  const { createUiSettingsRuntimeBridge } = await import('data:text/javascript;base64,' + Buffer.from(read('public/src/runtime/settings/createUiSettingsRuntimeBridge.js')).toString('base64'));
  const state = {};
  global.localStorage = { getItem: () => JSON.stringify({ defaultChatPanelVisible: true }), setItem() {} };
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: true, defaultCanvasPanelVisible: false, defaultChatPanelVisible: false, defaultLaunchFullscreen: false }) });
  const bridge = createUiSettingsRuntimeBridge({ state, CONFIG: {}, DESKTOP_SHELL: { getStartupContext: async () => ({ ok: true, uiSettings: { defaultChatPanelVisible: true }, workbenchPreferences: { defaultChatPanelVisible: true } }) }, API_ROUTES: {}, readJsonResponse: r => r.json(), normalizeUiSettings: v => ({ ...v }), pickWorkbenchPreferences: v => ({ defaultCanvasPanelVisible: v.defaultCanvasPanelVisible, defaultChatPanelVisible: v.defaultChatPanelVisible, defaultLaunchFullscreen: v.defaultLaunchFullscreen }), applyUiSettings() {}, setStatus() {} });
  await bridge.loadUiSettings(); assert.equal(state.workbenchPreferences.defaultChatPanelVisible, false); assert.equal(bridge.getStartupContext().workbenchPreferences.defaultChatPanelVisible, false);
  await bridge.loadUiSettings(); assert.equal(state.workbenchPreferences.defaultChatPanelVisible, false);
  const esbuild = require('esbuild');
  const result = await esbuild.build({ entryPoints: [path.join(__dirname, '../public/src/engines/canvas2d-core/elements/fileCard.js')], bundle: true, platform: 'node', format: 'cjs', write: false });
  const mod = { exports: {} }; new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require);
  const { fitFilePreviewBounds, getFileCardPreviewBounds, normalizeFileCardElement } = mod.exports;
  for (const scale of [.1, .5, 1, 2]) {
    const original = getFileCardPreviewBounds({ x: -4000, y: 6000, width: 700, height: 266, previewHeightRatio: 3 });
    assert.deepEqual(fitFilePreviewBounds(original, { scale, offsetX: 2000 }, { width: 400, height: 300 }), original);
    assert.equal(original.height, 2100);
  }
  const card = normalizeFileCardElement({ previewHeightRatio: 3, previewExpandedHeightRatio: 5 }); assert.equal(card.previewHeightRatio, 3); assert.equal(card.previewExpandedHeightRatio, 5);
  console.log('[navigation-settings] shortcut validation/registration rollback, stale startup context, world preview geometry passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
