import {
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../protocols/inputDescriptor.js";
import { PARSER_MATCH_STATUS } from "../parsers/parserRegistry.js";

export const FALLBACK_ACTIONS = Object.freeze({
  USE_PLAIN_TEXT: "use-plain-text",
  USE_HTML_AS_TEXT: "use-html-as-text",
  USE_MARKDOWN_AS_TEXT: "use-markdown-as-text",
  USE_FILE_RESOURCES: "use-file-resources",
  USE_IMAGE_RESOURCES: "use-image-resources",
  USE_INTERNAL_PAYLOAD: "use-internal-payload",
  REPORT_UNSUPPORTED: "report-unsupported",
});

export function createFallbackStrategyManager(options = {}) {
  const registry = new Map();
  const onRegister = typeof options.onRegister === "function" ? options.onRegister : null;
  const onUnregister = typeof options.onUnregister === "function" ? options.onUnregister : null;

  const builtins = Array.isArray(options.builtins) ? options.builtins : createBuiltinStrategies();
  builtins.forEach((strategy) => registerStrategy(strategy));

  function registerStrategy(strategy) {
    const normalized = normalizeStrategy(strategy);
    registry.set(normalized.id, normalized);
    onRegister?.(normalized);
    return normalized;
  }

  function unregisterStrategy(strategyId) {
    const strategy = registry.get(strategyId) || null;
    if (!strategy) {
      return false;
    }
    registry.delete(strategyId);
    onUnregister?.(strategy);
    return true;
  }

  function getStrategy(strategyId) {
    return registry.get(strategyId) || null;
  }

  function listStrategies() {
    return Array.from(registry.values()).sort(compareStrategies);
  }

  function resolve(input, context = {}) {
    const normalizedInput = normalizeResolveInput(input);
    const matches = listStrategies()
      .map((strategy) => buildStrategyMatch(strategy, normalizedInput, context))
      .filter((match) => match.matched)
      .sort(compareMatches);

    if (!matches.length) {
      return createUnsupportedResult(normalizedInput, []);
    }

    const chosen = matches[0];
    try {
      const plan = chosen.strategy.build({
        input: normalizedInput,
        context,
        match: chosen,
      });
      return {
        ok: true,
        strategyId: chosen.strategy.id,
        action: plan?.action || FALLBACK_ACTIONS.REPORT_UNSUPPORTED,
        reason: plan?.reason || chosen.reason || "fallback-applied",
        payload: plan?.payload || null,
        matches,
      };
    } catch (error) {
      return createUnsupportedResult(normalizedInput, matches, error);
    }
  }

  return {
    registerStrategy,
    unregisterStrategy,
    getStrategy,
    listStrategies,
    resolve,
  };
}

function createBuiltinStrategies() {
  return [
    {
      id: "internal-payload-fallback",
      priority: 100,
      supports({ input }) {
        return hasEntryKind(input.descriptor, INPUT_ENTRY_KINDS.INTERNAL_PAYLOAD);
      },
      build({ input }) {
        const entry = findEntryByKind(input.descriptor, INPUT_ENTRY_KINDS.INTERNAL_PAYLOAD);
        return {
          action: FALLBACK_ACTIONS.USE_INTERNAL_PAYLOAD,
          reason: "internal-payload-available",
          payload: {
            entryId: entry?.entryId || "",
            internalPayload: entry?.raw?.internalPayload || null,
          },
        };
      },
    },
    {
      id: "file-resource-fallback",
      priority: 90,
      supports({ input }) {
        return (
          input.parseStatus === PARSER_MATCH_STATUS.NO_MATCH &&
          (input.descriptor?.sourceKind === INPUT_SOURCE_KINDS.FILE_RESOURCE ||
            hasEntryKind(input.descriptor, INPUT_ENTRY_KINDS.FILE))
        );
      },
      build({ input }) {
        const files = collectEntriesByKind(input.descriptor, INPUT_ENTRY_KINDS.FILE);
        return {
          action: FALLBACK_ACTIONS.USE_FILE_RESOURCES,
          reason: "file-resources-available",
          payload: {
            files: files.map((entry) => ({
              entryId: entry.entryId,
              filePath: entry.raw?.filePath || "",
              name: entry.name || entry.meta?.displayName || "",
            })),
          },
        };
      },
    },
    {
      id: "image-resource-fallback",
      priority: 85,
      supports({ input }) {
        return (
          input.parseStatus === PARSER_MATCH_STATUS.NO_MATCH &&
          (input.descriptor?.sourceKind === INPUT_SOURCE_KINDS.IMAGE_RESOURCE ||
            hasEntryKind(input.descriptor, INPUT_ENTRY_KINDS.IMAGE))
        );
      },
      build({ input }) {
        const images = collectEntriesByKind(input.descriptor, INPUT_ENTRY_KINDS.IMAGE);
        return {
          action: FALLBACK_ACTIONS.USE_IMAGE_RESOURCES,
          reason: "image-resources-available",
          payload: {
            images: images.map((entry) => ({
              entryId: entry.entryId,
              filePath: entry.raw?.filePath || "",
              mimeType: entry.mimeType || "",
            })),
          },
        };
      },
    },
    {
      id: "html-to-text-fallback",
      priority: 70,
      supports({ input }) {
        return (
          input.parseStatus !== PARSER_MATCH_STATUS.PARSED &&
          (input.descriptor?.sourceKind === INPUT_SOURCE_KINDS.HTML ||
            hasEntryKind(input.descriptor, INPUT_ENTRY_KINDS.HTML))
        );
      },
      build({ input }) {
        const entry = findEntryByKind(input.descriptor, INPUT_ENTRY_KINDS.HTML);
        return {
          action: FALLBACK_ACTIONS.USE_HTML_AS_TEXT,
          reason: "html-entry-available",
          payload: {
            entryId: entry?.entryId || "",
            html: entry?.raw?.html || "",
            text: entry?.raw?.text || "",
          },
        };
      },
    },
    {
      id: "markdown-to-text-fallback",
      priority: 65,
      supports({ input }) {
        return (
          input.parseStatus !== PARSER_MATCH_STATUS.PARSED &&
          (input.descriptor?.sourceKind === INPUT_SOURCE_KINDS.MARKDOWN ||
            hasEntryKind(input.descriptor, INPUT_ENTRY_KINDS.MARKDOWN))
        );
      },
      build({ input }) {
        const entry = findEntryByKind(input.descriptor, INPUT_ENTRY_KINDS.MARKDOWN);
        return {
          action: FALLBACK_ACTIONS.USE_MARKDOWN_AS_TEXT,
          reason: "markdown-entry-available",
          payload: {
            entryId: entry?.entryId || "",
            markdown: entry?.raw?.markdown || "",
          },
        };
      },
    },
    {
      id: "plain-text-fallback",
      priority: 50,
      supports({ input }) {
        return (
          input.parseStatus !== PARSER_MATCH_STATUS.PARSED &&
          hasEntryKind(input.descriptor, INPUT_ENTRY_KINDS.TEXT)
        );
      },
      build({ input }) {
        const entry = findEntryByKind(input.descriptor, INPUT_ENTRY_KINDS.TEXT);
        return {
          action: FALLBACK_ACTIONS.USE_PLAIN_TEXT,
          reason: "plain-text-entry-available",
          payload: {
            entryId: entry?.entryId || "",
            text: entry?.raw?.text || "",
          },
        };
      },
    },
  ];
}

function normalizeStrategy(strategy) {
  if (!strategy || typeof strategy !== "object") {
    throw new Error("fallback strategy must be an object");
  }
  const id = String(strategy.id || "").trim();
  if (!id) {
    throw new Error("fallback strategy must include a non-empty id");
  }
  if (typeof strategy.build !== "function") {
    throw new Error(`fallback strategy "${id}" must provide a build() function`);
  }
  return {
    id,
    priority: normalizePriority(strategy.priority),
    supports: typeof strategy.supports === "function" ? strategy.supports : null,
    build: strategy.build,
    meta: strategy.meta && typeof strategy.meta === "object" ? { ...strategy.meta } : {},
  };
}

function normalizeResolveInput(input) {
  const descriptor = input?.descriptor || null;
  const parseResult = input?.parseResult || null;
  const parseStatus =
    typeof parseResult?.status === "string"
      ? parseResult.status
      : PARSER_MATCH_STATUS.NO_MATCH;
  return {
    descriptor,
    parseResult,
    parseStatus,
  };
}

function buildStrategyMatch(strategy, input, context) {
  const matched = runSupports(strategy, input, context);
  return {
    strategy,
    matched: matched.matched,
    score: strategy.priority + matched.score,
    priority: strategy.priority,
    reason: matched.reason,
  };
}

function runSupports(strategy, input, context) {
  if (!strategy.supports) {
    return { matched: true, score: 0, reason: "no-supports-hook" };
  }
  const result = strategy.supports({ input, context, strategy });
  if (typeof result === "boolean") {
    return {
      matched: result,
      score: result ? 0 : -1,
      reason: result ? "supports-boolean-true" : "supports-boolean-false",
    };
  }
  if (typeof result === "number") {
    return {
      matched: result >= 0,
      score: result >= 0 ? result : -1,
      reason: "supports-number",
    };
  }
  if (result && typeof result === "object") {
    return {
      matched: Boolean(result.matched),
      score: Number.isFinite(result.score) ? Number(result.score) : 0,
      reason: typeof result.reason === "string" ? result.reason : "supports-object",
    };
  }
  return {
    matched: false,
    score: -1,
    reason: "supports-invalid-return",
  };
}

function createUnsupportedResult(input, matches, error = null) {
  return {
    ok: false,
    strategyId: null,
    action: FALLBACK_ACTIONS.REPORT_UNSUPPORTED,
    reason: error ? "fallback-build-failed" : "no-fallback-match",
    payload: {
      sourceKind: input?.descriptor?.sourceKind || "",
      entryKinds: Array.isArray(input?.descriptor?.entries)
        ? input.descriptor.entries.map((entry) => entry.kind)
        : [],
      error: error ? normalizeError(error) : null,
    },
    matches,
  };
}

function compareStrategies(a, b) {
  if (b.priority !== a.priority) {
    return b.priority - a.priority;
  }
  return a.id.localeCompare(b.id);
}

function compareMatches(a, b) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  if (b.priority !== a.priority) {
    return b.priority - a.priority;
  }
  return a.strategy.id.localeCompare(b.strategy.id);
}

function normalizePriority(value) {
  const priority = Number(value);
  return Number.isFinite(priority) ? priority : 0;
}

function hasEntryKind(descriptor, kind) {
  return Array.isArray(descriptor?.entries) && descriptor.entries.some((entry) => entry?.kind === kind);
}

function findEntryByKind(descriptor, kind) {
  return Array.isArray(descriptor?.entries)
    ? descriptor.entries.find((entry) => entry?.kind === kind) || null
    : null;
}

function collectEntriesByKind(descriptor, kind) {
  return Array.isArray(descriptor?.entries)
    ? descriptor.entries.filter((entry) => entry?.kind === kind)
    : [];
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    name: "Error",
    message: String(error || "Unknown error"),
  };
}
