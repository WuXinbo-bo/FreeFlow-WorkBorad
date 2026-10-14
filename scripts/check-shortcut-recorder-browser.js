const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const URL = process.env.CANVAS_TEST_URL || 'http://127.0.0.1:3220/canvas-office.html';
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(URL);
    const result = await page.evaluate(async () => {
      const { attachShortcutRecorder } = await import('/src/components/settings/shortcutRecorder.js');
      const host = document.createElement('div'); host.innerHTML = '<input data-record readonly><button>Leave</button>'; document.body.appendChild(host);
      const input = host.querySelector('input'), button = host.querySelector('button');
      let value = { accelerator: 'Control+Shift+X', display: 'Ctrl + Shift + X' }, release, hold = true, failSetup = false;
      const calls = [];
      const recorder = attachShortcutRecorder(host, { selector: '[data-record]', getValue: () => value,
        onChange: next => { value = next; }, desktopShell: { platform: 'darwin', setShortcutRecording: async enabled => {
          calls.push(enabled); if (hold && !enabled) await new Promise(resolve => { release = resolve; }); return { ok: !(enabled && failSetup) };
        } } });
      input.focus(); await new Promise(resolve => setTimeout(resolve, 0));
      button.focus(); hold = false; release();
      await new Promise(resolve => setTimeout(resolve, 20));
      const staleRecording = input.dataset.recording;
      await recorder.stop();
      input.focus(); await new Promise(resolve => setTimeout(resolve, 20));
      for (const key of ['Control', 'Shift', 'KeyY']) input.dispatchEvent(new KeyboardEvent('keydown', { key: key === 'KeyY' ? 'y' : key, code: key, ctrlKey: true, shiftKey: key !== 'Control', bubbles: true, cancelable: true }));
      await recorder.stop();
      const accepted = { ...value };
      input.blur(); input.focus(); await new Promise(resolve => setTimeout(resolve, 20));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 20));
      const cancelled = { ...value };
      const ended = input.dataset.recording;
      input.blur(); failSetup = true; input.focus();
      await new Promise(resolve => setTimeout(resolve, 20));
      const rejected = input.dataset.recording;
      const rejectedValue = { ...value };
      return { staleRecording, accepted, cancelled, ended, rejected, rejectedValue, calls };
    });
    assert.equal(result.staleRecording, 'false', 'blur during preparation resumed stale recording');
    assert.equal(result.accepted.accelerator, 'Control+Shift+Y');
    assert.deepEqual(result.cancelled, result.accepted);
    assert.equal(result.ended, 'false');
    assert.equal(result.rejected, 'false', 'failed native preparation left recording active');
    assert.deepEqual(result.rejectedValue, result.accepted);
    assert.equal(result.calls.at(-1), false);
    console.log('[shortcut-recorder] delayed native setup, blur, chord, accept, Escape and failed preparation recovery passed');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
