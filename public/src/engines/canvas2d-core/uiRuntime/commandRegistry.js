function normalizeCommandId(value = "") {
  return String(value || "").trim();
}

const SHORTCUT_KEY_ALIASES = Object.freeze({
  " ": "Space",
  spacebar: "Space",
  esc: "Escape",
  escape: "Escape",
  del: "Delete",
  delete: "Delete",
  backspace: "Backspace",
  tab: "Tab",
  enter: "Enter",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
});

function normalizeShortcutKey(value = "") {
  const source = String(value || "");
  if (source === " ") {
    return "Space";
  }
  const raw = source.trim();
  if (!raw) {
    return "";
  }
  const alias = SHORTCUT_KEY_ALIASES[raw.toLowerCase()];
  if (alias) {
    return alias;
  }
  if (/^f\d{1,2}$/i.test(raw)) {
    return raw.toUpperCase();
  }
  return raw.length === 1 ? raw.toUpperCase() : raw;
}

export function normalizeCanvasShortcut(value = "") {
  const tokens = String(value || "")
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) {
    return "";
  }
  const modifiers = new Set();
  let key = "";
  tokens.forEach((token) => {
    const normalized = token.toLowerCase();
    if (["ctrl", "control", "cmd", "command", "meta", "mod"].includes(normalized)) {
      modifiers.add("Ctrl");
      return;
    }
    if (normalized === "alt" || normalized === "option") {
      modifiers.add("Alt");
      return;
    }
    if (normalized === "shift") {
      modifiers.add("Shift");
      return;
    }
    key = normalizeShortcutKey(token);
  });
  if (!key) {
    return "";
  }
  return ["Ctrl", "Alt", "Shift"].filter((modifier) => modifiers.has(modifier)).concat(key).join("+");
}

export function getCanvasShortcutFromEvent(event = null) {
  if (!event) {
    return "";
  }
  const key = normalizeShortcutKey(event.key);
  if (!key || ["Control", "Shift", "Alt", "Meta"].includes(key)) {
    return "";
  }
  return [
    event.ctrlKey || event.metaKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
    key,
  ].filter(Boolean).join("+");
}

function freezeCommandDefinition(definition = {}, handler = null) {
  const id = normalizeCommandId(definition.id || definition.name);
  if (!id) {
    throw new Error("Canvas command requires an id");
  }
  const execute = typeof handler === "function" ? handler : definition.execute;
  if (typeof execute !== "function") {
    throw new Error(`Canvas command \"${id}\" requires execute()`);
  }
  return Object.freeze({
    id,
    label: String(definition.label || id),
    category: String(definition.category || "canvas"),
    scope: String(definition.scope || "canvas"),
    elementTypes: Object.freeze(
      Array.from(new Set((Array.isArray(definition.elementTypes) ? definition.elementTypes : []).map(String).filter(Boolean)))
    ),
    shortcuts: Object.freeze(
      Array.from(
        new Set(
          (Array.isArray(definition.shortcuts) ? definition.shortcuts : [])
            .map(normalizeCanvasShortcut)
            .filter(Boolean)
        )
      )
    ),
    destructive: definition.destructive === true,
    when: typeof definition.when === "function" ? definition.when : null,
    execute,
  });
}

export function createCanvasCommandRegistry() {
  const commands = new Map();
  let revision = 0;

  function register(definition = {}, handler = null, { replace = false } = {}) {
    const normalized = freezeCommandDefinition(definition, handler);
    if (commands.has(normalized.id) && !replace) {
      throw new Error(`Canvas command \"${normalized.id}\" is already registered`);
    }
    commands.set(normalized.id, normalized);
    revision += 1;
    let active = true;
    return () => {
      if (!active || commands.get(normalized.id) !== normalized) {
        return false;
      }
      active = false;
      commands.delete(normalized.id);
      revision += 1;
      return true;
    };
  }

  function resolve(id = "") {
    return commands.get(normalizeCommandId(id)) || null;
  }

  function canRun(id = "", context = {}) {
    const command = resolve(id);
    if (!command) {
      return false;
    }
    if (!command.when) {
      return true;
    }
    try {
      return command.when(context) !== false;
    } catch {
      return false;
    }
  }

  function run(id = "", context = {}, ...args) {
    const command = resolve(id);
    if (!command || !canRun(command.id, context)) {
      return null;
    }
    return command.execute(context, ...args);
  }

  function resolveShortcut(shortcutOrEvent = "", context = {}) {
    const shortcut = typeof shortcutOrEvent === "string"
      ? normalizeCanvasShortcut(shortcutOrEvent)
      : getCanvasShortcutFromEvent(shortcutOrEvent);
    if (!shortcut) {
      return null;
    }
    for (const command of commands.values()) {
      if (command.shortcuts.includes(shortcut) && canRun(command.id, context)) {
        return command;
      }
    }
    return null;
  }

  function runShortcut(shortcutOrEvent = "", context = {}, ...args) {
    const command = resolveShortcut(shortcutOrEvent, context);
    if (!command) {
      return { matched: false, id: "", result: null };
    }
    return {
      matched: true,
      id: command.id,
      result: command.execute(context, ...args),
    };
  }

  function list(context = null) {
    return Array.from(commands.values()).map((command) => ({
      id: command.id,
      label: command.label,
      category: command.category,
      scope: command.scope,
      elementTypes: [...command.elementTypes],
      shortcuts: [...command.shortcuts],
      destructive: command.destructive,
      enabled: context == null ? true : canRun(command.id, context),
    }));
  }

  return {
    register,
    resolve,
    canRun,
    run,
    resolveShortcut,
    runShortcut,
    list,
    getRevision: () => revision,
  };
}
