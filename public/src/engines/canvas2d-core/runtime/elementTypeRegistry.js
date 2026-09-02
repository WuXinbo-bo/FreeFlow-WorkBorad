const REQUIRED_CAPABILITIES = ["normalize", "getBounds", "translate"];

function normalizeType(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeAliases(values = []) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map((value) => normalizeType(value)).filter(Boolean))
  );
}

function assertDefinition(definition = {}) {
  const type = String(definition.type || "").trim();
  if (!type) {
    throw new Error("Element definition requires a type");
  }
  REQUIRED_CAPABILITIES.forEach((capability) => {
    if (typeof definition[capability] !== "function") {
      throw new Error(`Element definition \"${type}\" requires ${capability}()`);
    }
  });
}

function freezeUxDefinition(ux = {}) {
  return Object.freeze({
    ...ux,
    commands: Object.freeze([...(Array.isArray(ux.commands) ? ux.commands : [])]),
    acceptance: Object.freeze([...(Array.isArray(ux.acceptance) ? ux.acceptance : [])]),
  });
}

function freezeCapabilities(capabilities = {}) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(capabilities).map(([key, value]) => [
        key,
        Array.isArray(value) ? Object.freeze([...value]) : value,
      ])
    )
  );
}

export function createElementTypeRegistry({ fallbackType = "text" } = {}) {
  const definitions = new Map();
  const aliases = new Map();
  let revision = 0;

  function register(definition = {}, { replace = false } = {}) {
    assertDefinition(definition);
    const type = String(definition.type).trim();
    const key = normalizeType(type);
    if (definitions.has(key) && !replace) {
      throw new Error(`Element definition \"${type}\" is already registered`);
    }
    const normalizedAliases = normalizeAliases(definition.aliases);
    [key, ...normalizedAliases].forEach((alias) => {
      const owner = aliases.get(alias);
      if (owner && owner !== key) {
        throw new Error(`Element alias \"${alias}\" is already registered`);
      }
    });
    const normalized = Object.freeze({
      schemaVersion: 1,
      ...definition,
      type,
      aliases: normalizedAliases,
      capabilities: freezeCapabilities(definition.capabilities || {}),
      lifecycle: Object.freeze({ ...(definition.lifecycle || {}) }),
      ux: freezeUxDefinition(definition.ux || {}),
    });
    if (replace) {
      Array.from(aliases.entries()).forEach(([alias, owner]) => {
        if (owner === key) {
          aliases.delete(alias);
        }
      });
    }
    definitions.set(key, normalized);
    aliases.set(key, key);
    normalized.aliases.forEach((alias) => {
      aliases.set(alias, key);
    });
    revision += 1;
    return normalized;
  }

  function extend(type, patch = {}) {
    const current = resolve(type, { fallback: false });
    if (!current) {
      throw new Error(`Cannot extend unknown element type \"${type}\"`);
    }
    return register(
      {
        ...current,
        ...patch,
        type: current.type,
        aliases: patch.aliases || current.aliases,
        capabilities: { ...current.capabilities, ...(patch.capabilities || {}) },
        lifecycle: { ...current.lifecycle, ...(patch.lifecycle || {}) },
        ux: { ...current.ux, ...(patch.ux || {}) },
      },
      { replace: true }
    );
  }

  function unregister(type) {
    const key = aliases.get(normalizeType(type));
    if (!key || !definitions.has(key)) {
      return false;
    }
    definitions.delete(key);
    Array.from(aliases.entries()).forEach(([alias, owner]) => {
      if (owner === key) {
        aliases.delete(alias);
      }
    });
    revision += 1;
    return true;
  }

  function resolve(type, { fallback = true } = {}) {
    const key = aliases.get(normalizeType(type));
    if (key && definitions.has(key)) {
      return definitions.get(key);
    }
    if (!fallback) {
      return null;
    }
    const fallbackKey = aliases.get(normalizeType(fallbackType));
    return fallbackKey ? definitions.get(fallbackKey) || null : null;
  }

  function resolveElement(element = {}, options = {}) {
    return resolve(element?.type || element?.kind || "", options);
  }

  function invoke(element, capability, ...args) {
    const definition = resolveElement(element);
    const handler = definition?.[capability];
    if (typeof handler !== "function") {
      return undefined;
    }
    return handler(element, ...args);
  }

  function validate({ requiredCapabilities = REQUIRED_CAPABILITIES } = {}) {
    const missing = [];
    definitions.forEach((definition) => {
      requiredCapabilities.forEach((capability) => {
        if (typeof definition[capability] !== "function" && definition.capabilities?.[capability] == null) {
          missing.push(`${definition.type}.${capability}`);
        }
      });
    });
    return {
      ok: missing.length === 0,
      missing,
      types: list().map((definition) => definition.type),
      revision,
    };
  }

  function list() {
    return Array.from(definitions.values());
  }

  function clone() {
    const next = createElementTypeRegistry({ fallbackType });
    list().forEach((definition) => next.register(definition));
    return next;
  }

  return {
    register,
    unregister,
    extend,
    resolve,
    resolveElement,
    invoke,
    validate,
    list,
    clone,
    getRevision: () => revision,
  };
}

export { REQUIRED_CAPABILITIES as ELEMENT_REQUIRED_CAPABILITIES };
