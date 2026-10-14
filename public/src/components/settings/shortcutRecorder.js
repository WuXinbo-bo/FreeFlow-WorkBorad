// Record a chord, keeping display labels separate from Electron accelerators.
export function shortcutFromKeyboardEvent(event, platform = "") {
  if (event.isComposing || event.key === "Process" || event.key === "Dead") return null;
  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.metaKey) modifiers.push(platform === "darwin" ? "Command" : "Super");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.altKey) modifiers.push("Alt");
  let key = "";
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  else if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.key)) key = event.key;
  else key = ({ " ": "Space", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", "=": "Plus", "+": "Plus" })[event.key] || (/^(Tab|Enter|Escape|Backspace|Delete|Insert|Home|End|PageUp|PageDown|[-,./;'])$/.test(event.key) ? event.key : "");
  const parts = [...modifiers, ...(key ? [key] : [])];
  return {
    accelerator: parts.join("+"),
    display: parts.map(part => ({ Control: "Ctrl", Command: "Cmd", Super: "Win", Alt: platform === "darwin" ? "Option" : "Alt" })[part] || part).join(" + "),
    complete: Boolean(key && modifiers.length),
  };
}

export function attachShortcutRecorder(host, { selector, desktopShell, getValue, onChange }) {
  let input = null;
  let original = null;
  let completed = false;
  let generation = 0;
  let recordingRequest = Promise.resolve();

  function setNativeRecording(enabled) {
    if (typeof desktopShell?.setShortcutRecording !== "function") return Promise.resolve();
    recordingRequest = recordingRequest
      .catch(() => {})
      .then(() => desktopShell.setShortcutRecording(enabled))
      .then(result => {
        if (result?.ok === false) throw new Error(result.error || "快捷键录入准备失败");
      });
    return recordingRequest;
  }

  async function stop(accept = true, invalidate = true) {
    if (invalidate) ++generation;
    const activeInput = input;
    const activeOriginal = original;
    const activeCompleted = completed;
    input = null;
    original = null;
    completed = false;
    if (activeInput) {
      if (!accept || !activeCompleted) { activeInput.value = activeOriginal.display; onChange(activeOriginal); }
      activeInput.dataset.recording = "false";
    }
    await setNativeRecording(false).catch(() => {});
  }
  function begin(target) {
    if (input === target || target.disabled) return;
    const current = ++generation;
    void stop(true, false).then(() => {
      if (current !== generation || target.disabled || !target.isConnected || document.activeElement !== target) {
        target.dataset.recording = "false";
        return;
      }
      input = target;
      original = { ...getValue() };
      completed = false;
      input.dataset.recording = "preparing";
      input.value = "请按下快捷键组合…";
      return setNativeRecording(true).then(() => {
        if (current === generation && input === target) input.dataset.recording = "true";
      }).catch(() => { if (current === generation) void stop(false); });
    });
  }
  const focus = event => { if (event.target.matches?.(selector)) begin(event.target); };
  const keydown = event => {
    if (!event.target.matches?.(selector)) return;
    if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) { void stop(); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    if (!input) begin(event.target);
    if (!input || input.dataset.recording === "preparing" || event.repeat || event.isComposing) return;
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
    if (event.key === "Escape" && plain) { void stop(false); return; }
    if (event.key === "Backspace" && plain) { completed = true; input.value = "未设置"; onChange({ accelerator: "", display: "" }); return; }
    const shortcut = shortcutFromKeyboardEvent(event, desktopShell?.platform);
    if (!shortcut) return;
    input.value = shortcut.display || "请按住修饰键后再按主键…";
    if (shortcut.complete) { completed = true; onChange(shortcut); }
  };
  const keyup = event => {
    if (input && event.target === input) { event.stopImmediatePropagation(); if (completed) input.value = getValue().display; }
  };
  const focusout = event => {
    if (event.target.matches?.(selector) && !event.relatedTarget?.closest?.(selector)) {
      void stop();
    }
  };
  host.addEventListener("focusin", focus);
  host.addEventListener("click", focus);
  host.addEventListener("keydown", keydown, true);
  host.addEventListener("keyup", keyup, true);
  host.addEventListener("focusout", focusout);
  window.addEventListener("blur", () => void stop());
  window.addEventListener("pagehide", () => void stop());
  return { stop };
}
