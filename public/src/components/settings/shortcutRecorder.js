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
  async function stop(accept = true) {
    ++generation;
    if (input) {
      if (!accept || !completed) { input.value = original.display; onChange(original); }
      input.dataset.recording = "false";
      input = null;
    }
    if (original) {
      original = null;
      await desktopShell?.setShortcutRecording?.(false).catch(() => {});
    }
  }
  function begin(target) {
    if (input === target || target.disabled) return;
    void stop();
    input = target;
    original = { ...getValue() };
    completed = false;
    input.dataset.recording = "true";
    input.value = "请按下快捷键组合…";
    const current = ++generation;
    if (desktopShell?.setShortcutRecording) {
      input.dataset.recording = "preparing";
      void desktopShell.setShortcutRecording(true).then(() => {
        if (current === generation && input) input.dataset.recording = "true";
      }).catch(() => { if (current === generation) { void stop(false); } });
    }
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
  const focusout = event => { if (event.target === input) void stop(); };
  host.addEventListener("focusin", focus);
  host.addEventListener("click", focus);
  host.addEventListener("keydown", keydown, true);
  host.addEventListener("keyup", keyup, true);
  host.addEventListener("focusout", focusout);
  window.addEventListener("blur", () => void stop());
  window.addEventListener("pagehide", () => void stop());
  return { stop };
}
