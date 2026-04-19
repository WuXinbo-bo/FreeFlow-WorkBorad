import {
  INPUT_CHANNELS,
  INPUT_SOURCE_KINDS,
} from "../protocols/inputDescriptor.js";

export const PARSER_MATCH_STATUS = Object.freeze({
  MATCHED: "matched",
  SKIPPED: "skipped",
  NO_MATCH: "no-match",
  PARSED: "parsed",
  FAILED: "failed",
});

export function createParserRegistry(options = {}) {
  const registry = new Map();
  const onRegister = typeof options.onRegister === "function" ? options.onRegister : null;
  const onUnregister = typeof options.onUnregister === "function" ? options.onUnregister : null;

  function registerParser(parser) {
    const normalized = normalizeParserDefinition(parser);
    registry.set(normalized.id, normalized);
    onRegister?.(normalized);
    return normalized;
  }

  function unregisterParser(parserId) {
    const parser = registry.get(parserId) || null;
    if (!parser) {
      return false;
    }
    registry.delete(parserId);
    onUnregister?.(parser);
    return true;
  }

  function getParser(parserId) {
    return registry.get(parserId) || null;
  }

  function listParsers() {
    return Array.from(registry.values()).sort(compareParsers);
  }

  function matchDescriptor(descriptor, context = {}) {
    return listParsers()
      .map((parser) => buildMatchResult(parser, descriptor, context))
      .filter((match) => match.status === PARSER_MATCH_STATUS.MATCHED)
      .sort(compareMatches);
  }

  async function parseDescriptor(descriptor, context = {}) {
    const matches = matchDescriptor(descriptor, context);
    if (!matches.length) {
      return {
        ok: false,
        status: PARSER_MATCH_STATUS.NO_MATCH,
        matches: [],
        error: {
          code: "no-parser-match",
          message: "No parser matched the provided input descriptor.",
        },
      };
    }

    const attempts = [];
    for (const match of matches) {
      const parser = match.parser;
      try {
        const result = await parser.parse({
          descriptor,
          context,
          match,
        });
        attempts.push({
          parserId: parser.id,
          status: PARSER_MATCH_STATUS.PARSED,
          score: match.score,
        });
        return {
          ok: true,
          status: PARSER_MATCH_STATUS.PARSED,
          parserId: parser.id,
          match,
          attempts,
          result,
        };
      } catch (error) {
        attempts.push({
          parserId: parser.id,
          status: PARSER_MATCH_STATUS.FAILED,
          score: match.score,
          error: normalizeError(error),
        });
      }
    }

    return {
      ok: false,
      status: PARSER_MATCH_STATUS.FAILED,
      matches,
      attempts,
      error: {
        code: "parser-execution-failed",
        message: "All matched parsers failed while parsing the descriptor.",
      },
    };
  }

  return {
    registerParser,
    unregisterParser,
    getParser,
    listParsers,
    matchDescriptor,
    parseDescriptor,
  };
}

function normalizeParserDefinition(parser) {
  if (!parser || typeof parser !== "object") {
    throw new Error("parser definition must be an object");
  }
  const id = String(parser.id || "").trim();
  if (!id) {
    throw new Error("parser definition must include a non-empty id");
  }
  if (typeof parser.parse !== "function") {
    throw new Error(`parser "${id}" must provide a parse() function`);
  }

  return {
    id,
    version: String(parser.version || "0.0.0"),
    displayName: String(parser.displayName || id),
    priority: normalizePriority(parser.priority),
    sourceKinds: normalizeStringList(parser.sourceKinds, Object.values(INPUT_SOURCE_KINDS)),
    channels: normalizeStringList(parser.channels, Object.values(INPUT_CHANNELS)),
    tags: normalizeStringList(parser.tags),
    supports: typeof parser.supports === "function" ? parser.supports : null,
    parse: parser.parse,
    meta: parser.meta && typeof parser.meta === "object" ? { ...parser.meta } : {},
  };
}

function buildMatchResult(parser, descriptor, context) {
  const sourceKind = String(descriptor?.sourceKind || "");
  const channel = String(descriptor?.channel || "");
  const sourceKindMatched = !parser.sourceKinds.length || parser.sourceKinds.includes(sourceKind);
  const channelMatched = !parser.channels.length || parser.channels.includes(channel);
  if (!sourceKindMatched || !channelMatched) {
    return {
      parser,
      status: PARSER_MATCH_STATUS.SKIPPED,
      score: -1,
      reason: "channel-or-source-kind-mismatch",
    };
  }

  const baseScore = parser.priority;
  const supportsResult = runSupports(parser, descriptor, context);
  if (!supportsResult.matched) {
    return {
      parser,
      status: PARSER_MATCH_STATUS.SKIPPED,
      score: -1,
      reason: supportsResult.reason || "supports-returned-no-match",
    };
  }

  return {
    parser,
    status: PARSER_MATCH_STATUS.MATCHED,
    score: baseScore + supportsResult.score,
    basePriority: parser.priority,
    supportsScore: supportsResult.score,
    reason: supportsResult.reason || "matched",
  };
}

function runSupports(parser, descriptor, context) {
  if (!parser.supports) {
    return { matched: true, score: 0, reason: "no-supports-hook" };
  }
  const result = parser.supports({ descriptor, context, parser });
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

function compareParsers(a, b) {
  if (b.priority !== a.priority) {
    return b.priority - a.priority;
  }
  return a.id.localeCompare(b.id);
}

function compareMatches(a, b) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  if (b.basePriority !== a.basePriority) {
    return b.basePriority - a.basePriority;
  }
  return a.parser.id.localeCompare(b.parser.id);
}

function normalizePriority(value) {
  const priority = Number(value);
  return Number.isFinite(priority) ? priority : 0;
}

function normalizeStringList(values, allowList = null) {
  if (!Array.isArray(values)) {
    return [];
  }
  const normalized = values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!allowList) {
    return normalized;
  }
  return normalized.filter((value) => allowList.includes(value));
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
