export function createCustomParserHost(options = {}) {
  const registry = options.registry || null;
  let enabled = Boolean(options.enabled);
  const staged = new Map();
  const active = new Map();

  function stageParser(definition) {
    const normalized = normalizeCustomParserDefinition(definition);
    staged.set(normalized.id, normalized);
    if (enabled && registry) {
      attachParser(normalized.id);
    }
    return normalized;
  }

  function attachParser(customParserId) {
    if (!registry) {
      return {
        ok: false,
        reason: "registry-unavailable",
        parserId: customParserId,
      };
    }
    const parser = staged.get(customParserId);
    if (!parser) {
      return {
        ok: false,
        reason: "parser-not-staged",
        parserId: customParserId,
      };
    }
    const registered = registry.registerParser(parserToRegistryDefinition(parser));
    active.set(customParserId, {
      customParser: parser,
      registryParserId: registered.id,
    });
    return {
      ok: true,
      parserId: customParserId,
      registryParserId: registered.id,
    };
  }

  function detachParser(customParserId) {
    const activeEntry = active.get(customParserId);
    if (!activeEntry) {
      return false;
    }
    active.delete(customParserId);
    if (registry && activeEntry.registryParserId) {
      registry.unregisterParser(activeEntry.registryParserId);
    }
    return true;
  }

  function enable() {
    enabled = true;
    if (registry) {
      for (const parserId of staged.keys()) {
        if (!active.has(parserId)) {
          attachParser(parserId);
        }
      }
    }
  }

  function disable() {
    enabled = false;
    for (const parserId of Array.from(active.keys())) {
      detachParser(parserId);
    }
  }

  function isEnabled() {
    return enabled;
  }

  function listStagedParsers() {
    return Array.from(staged.values()).sort(compareCustomParsers);
  }

  function listActiveParsers() {
    return Array.from(active.values())
      .map((entry) => entry.customParser)
      .sort(compareCustomParsers);
  }

  return {
    stageParser,
    attachParser,
    detachParser,
    enable,
    disable,
    isEnabled,
    listStagedParsers,
    listActiveParsers,
  };
}

export function normalizeCustomParserDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw new Error("custom parser definition must be an object");
  }
  const namespace = normalizeSegment(definition.namespace, "custom parser namespace");
  const localId = normalizeSegment(definition.localId || definition.id, "custom parser localId");
  const version = String(definition.version || "0.0.0");
  const displayName = String(definition.displayName || `${namespace}/${localId}`);
  const description = String(definition.description || "");
  const parse = definition.parse;
  const supports = definition.supports;
  if (typeof parse !== "function") {
    throw new Error(`custom parser "${namespace}/${localId}" must provide a parse() function`);
  }
  if (supports != null && typeof supports !== "function") {
    throw new Error(`custom parser "${namespace}/${localId}" supports must be a function when provided`);
  }
  return {
    id: `custom:${namespace}/${localId}`,
    namespace,
    localId,
    version,
    displayName,
    description,
    priority: normalizePriority(definition.priority),
    channels: normalizeStringList(definition.channels),
    sourceKinds: normalizeStringList(definition.sourceKinds),
    tags: normalizeStringList(definition.tags),
    parse,
    supports: typeof supports === "function" ? supports : null,
    meta: definition.meta && typeof definition.meta === "object" ? { ...definition.meta } : {},
  };
}

function parserToRegistryDefinition(parser) {
  return {
    id: parser.id,
    version: parser.version,
    displayName: parser.displayName,
    priority: parser.priority,
    channels: parser.channels,
    sourceKinds: parser.sourceKinds,
    tags: ["custom-parser", ...parser.tags],
    parse: parser.parse,
    supports: parser.supports,
    meta: {
      ...parser.meta,
      namespace: parser.namespace,
      localId: parser.localId,
      custom: true,
    },
  };
}

function compareCustomParsers(a, b) {
  if (a.namespace !== b.namespace) {
    return a.namespace.localeCompare(b.namespace);
  }
  return a.localId.localeCompare(b.localId);
}

function normalizeSegment(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (!/^[a-z0-9._-]+$/i.test(normalized)) {
    throw new Error(`${label} contains unsupported characters`);
  }
  return normalized;
}

function normalizePriority(value) {
  const priority = Number(value);
  return Number.isFinite(priority) ? priority : 0;
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}
