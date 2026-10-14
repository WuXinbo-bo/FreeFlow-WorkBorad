const MODIFIERS = ["CommandOrControl", "Control", "Command", "Shift", "Alt", "Super"];
function validateShortcutAccelerator(value) {
  const aliases = { ctrl: "Control", control: "Control", cmd: "Command", command: "Command", cmdorctrl: "CommandOrControl", commandorcontrol: "CommandOrControl", shift: "Shift", alt: "Alt", option: "Alt", meta: "Super", super: "Super", esc: "Escape", escape: "Escape", space: "Space", tab: "Tab", enter: "Enter", return: "Enter", backspace: "Backspace", delete: "Delete", insert: "Insert", home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown", up: "Up", down: "Down", left: "Left", right: "Right", plus: "Plus", minus: "-" };
  const raw = String(value || "").trim();
  if (!raw || raw.split("+").some(part => !part.trim())) throw new Error("快捷键组合不完整，请重新录制");
  const parts = raw.split("+").map(part => {
    const token = part.trim();
    return aliases[token.toLowerCase()] || (/^([a-z0-9]|f([1-9]|1[0-9]|2[0-4]))$/i.test(token) ? token.toUpperCase() : token);
  });
  const keys = parts.filter(part => !MODIFIERS.includes(part));
  if (keys.length !== 1) throw new Error("快捷键需要修饰键加一个主键，不支持多个字母同时按下");
  if (!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Tab|Enter|Escape|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Plus|[-,./;'])$/.test(keys[0])) throw new Error("不支持此快捷键，请使用字母、数字、功能键或常用按键");
  if (keys[0] === "F5" || (keys[0] === "R" && parts.some(part => ["Control", "Command", "CommandOrControl"].includes(part)))) throw new Error("此组合用于刷新应用，请选择其他快捷键");
  const modifiers = MODIFIERS.filter(part => parts.includes(part));
  if (!modifiers.length) throw new Error("请至少按住 Ctrl、Cmd、Alt 或 Shift 中的一个修饰键");
  if (modifiers.includes("CommandOrControl") && (modifiers.includes("Command") || modifiers.includes("Control"))) throw new Error("修饰键组合重复，请重新录制");
  return [...modifiers, keys[0]].join("+");
}

// Keep the old registration live until both registration and persistence succeed.
async function replaceShortcutRegistration({ accelerator, previous, globalShortcut, persist, onTrigger }) {
  if (accelerator === previous && globalShortcut.isRegistered(accelerator)) { await persist(); return; }
  const registered = globalShortcut.register(accelerator, onTrigger);
  if (!registered) throw new Error("快捷键已被系统或其他应用占用，请换一个组合");
  try { await persist(); }
  catch (error) { globalShortcut.unregister(accelerator); throw error; }
  if (previous && previous !== accelerator) globalShortcut.unregister(previous);
}
module.exports = { validateShortcutAccelerator, replaceShortcutRegistration };
