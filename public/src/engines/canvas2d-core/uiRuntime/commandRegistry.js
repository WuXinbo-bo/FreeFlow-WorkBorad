function normalizeCommandId(value = "") {
  return String(value || "").trim();
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
      Array.from(new Set((Array.isArray(definition.shortcuts) ? definition.shortcuts : []).map(String).filter(Boolean)))
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
    list,
    getRevision: () => revision,
  };
}
