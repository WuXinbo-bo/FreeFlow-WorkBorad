import {
  INPUT_DESCRIPTOR_STATUS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../protocols/inputDescriptor.js";
import { FALLBACK_ACTIONS } from "../fallbacks/fallbackStrategyManager.js";
import { PARSER_MATCH_STATUS } from "../parsers/parserRegistry.js";

export const DIAGNOSTIC_LEVELS = Object.freeze({
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
});

export const QUALITY_GRADES = Object.freeze({
  EXCELLENT: "excellent",
  GOOD: "good",
  FAIR: "fair",
  POOR: "poor",
  BROKEN: "broken",
});

export function createDiagnosticsModel(options = {}) {
  const clampScore = typeof options.clampScore === "function" ? options.clampScore : defaultClampScore;

  function evaluateDescriptor(descriptor) {
    const diagnostics = [];
    const losses = [];
    let score = 100;

    const status = String(descriptor?.status || "");
    const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
    const sourceKind = String(descriptor?.sourceKind || "");

    if (!entries.length) {
      score -= 60;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.ERROR, "descriptor-empty", "Input descriptor contains no entries.");
      losses.push(createLoss("content", "No input entries were captured."));
    }

    if (status === INPUT_DESCRIPTOR_STATUS.PARTIAL) {
      score -= 20;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.WARNING, "descriptor-partial", "Input descriptor is partial and may miss source data.");
    } else if (status === INPUT_DESCRIPTOR_STATUS.UNSUPPORTED) {
      score -= 45;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.ERROR, "descriptor-unsupported", "Input descriptor is marked unsupported.");
    } else if (status === INPUT_DESCRIPTOR_STATUS.ERROR) {
      score -= 55;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.ERROR, "descriptor-error", "Input descriptor is in error state.");
    }

    if (sourceKind === INPUT_SOURCE_KINDS.UNKNOWN) {
      score -= 10;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.WARNING, "unknown-source-kind", "Source kind is unknown.");
    }

    let unsupportedEntryCount = 0;
    entries.forEach((entry) => {
      const kind = String(entry?.kind || "");
      const entryStatus = String(entry?.status || "");
      if (kind === INPUT_ENTRY_KINDS.UNKNOWN) {
        unsupportedEntryCount += 1;
      }
      if (entryStatus === INPUT_DESCRIPTOR_STATUS.PARTIAL) {
        score -= 4;
      } else if (entryStatus === INPUT_DESCRIPTOR_STATUS.ERROR) {
        score -= 8;
      }
    });

    if (unsupportedEntryCount > 0) {
      score -= unsupportedEntryCount * 8;
      pushDiagnostic(
        diagnostics,
        DIAGNOSTIC_LEVELS.WARNING,
        "unsupported-entries",
        `${unsupportedEntryCount} descriptor entries are unsupported or unknown.`
      );
      losses.push(createLoss("coverage", "Some input entries are unsupported and may be ignored."));
    }

    return finalizeSection("descriptor", score, diagnostics, losses, clampScore);
  }

  function evaluateParseResult(parseResult) {
    const diagnostics = [];
    const losses = [];
    let score = 100;

    const status = String(parseResult?.status || PARSER_MATCH_STATUS.NO_MATCH);
    const attempts = Array.isArray(parseResult?.attempts) ? parseResult.attempts : [];
    const matches = Array.isArray(parseResult?.matches) ? parseResult.matches : [];

    if (status === PARSER_MATCH_STATUS.PARSED) {
      if (attempts.length > 1) {
        const failedAttempts = attempts.filter((attempt) => attempt.status === PARSER_MATCH_STATUS.FAILED).length;
        if (failedAttempts > 0) {
          score -= Math.min(20, failedAttempts * 8);
          pushDiagnostic(
            diagnostics,
            DIAGNOSTIC_LEVELS.WARNING,
            "parser-retries",
            `${failedAttempts} parser attempts failed before one succeeded.`
          );
        }
      }
    } else if (status === PARSER_MATCH_STATUS.NO_MATCH) {
      score -= 40;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.ERROR, "no-parser-match", "No parser matched the descriptor.");
      losses.push(createLoss("structure", "Structured parsing was not available for this input."));
    } else if (status === PARSER_MATCH_STATUS.FAILED) {
      score -= 50;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.ERROR, "parser-failed", "All matched parsers failed.");
      losses.push(createLoss("structure", "Structured parsing failed and requires fallback."));
    }

    if (matches.length > 0 && status !== PARSER_MATCH_STATUS.PARSED) {
      pushDiagnostic(
        diagnostics,
        DIAGNOSTIC_LEVELS.WARNING,
        "matched-but-unparsed",
        `${matches.length} parser candidates matched but no successful parse result was produced.`
      );
    }

    return finalizeSection("parse", score, diagnostics, losses, clampScore);
  }

  function evaluateFallbackResult(fallbackResult) {
    const diagnostics = [];
    const losses = [];
    let score = 100;

    const action = String(fallbackResult?.action || "");
    const ok = Boolean(fallbackResult?.ok);

    if (!ok) {
      score -= 55;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.ERROR, "fallback-unresolved", "Fallback strategy could not produce a usable result.");
      losses.push(createLoss("availability", "No reliable fallback path is available."));
      return finalizeSection("fallback", score, diagnostics, losses, clampScore);
    }

    if (action === FALLBACK_ACTIONS.USE_PLAIN_TEXT) {
      score -= 25;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.WARNING, "fallback-plain-text", "Content falls back to plain text.");
      losses.push(createLoss("structure", "Block structure and rich styles are flattened into plain text."));
    } else if (action === FALLBACK_ACTIONS.USE_HTML_AS_TEXT) {
      score -= 20;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.WARNING, "fallback-html-text", "HTML falls back to text-compatible rendering.");
      losses.push(createLoss("style", "HTML structure may be preserved only partially and rich styling may be lost."));
    } else if (action === FALLBACK_ACTIONS.USE_MARKDOWN_AS_TEXT) {
      score -= 18;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.WARNING, "fallback-markdown-text", "Markdown falls back to text-compatible rendering.");
      losses.push(createLoss("structure", "Markdown structure may degrade into plain text presentation."));
    } else if (action === FALLBACK_ACTIONS.USE_FILE_RESOURCES) {
      score -= 8;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.INFO, "fallback-file-resource", "File resources are preserved as file-backed content.");
    } else if (action === FALLBACK_ACTIONS.USE_IMAGE_RESOURCES) {
      score -= 8;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.INFO, "fallback-image-resource", "Image resources are preserved as image-backed content.");
    } else if (action === FALLBACK_ACTIONS.USE_INTERNAL_PAYLOAD) {
      score -= 5;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.INFO, "fallback-internal-payload", "Internal payload fallback is available.");
    } else if (action === FALLBACK_ACTIONS.REPORT_UNSUPPORTED) {
      score -= 60;
      pushDiagnostic(diagnostics, DIAGNOSTIC_LEVELS.ERROR, "fallback-report-unsupported", "Input remains unsupported after fallback resolution.");
      losses.push(createLoss("availability", "Content cannot be converted into a supported import path."));
    }

    return finalizeSection("fallback", score, diagnostics, losses, clampScore);
  }

  function buildImportDiagnostics({ descriptor, parseResult, fallbackResult } = {}) {
    const descriptorSection = evaluateDescriptor(descriptor);
    const parseSection = evaluateParseResult(parseResult);
    const fallbackSection = fallbackResult ? evaluateFallbackResult(fallbackResult) : null;

    const sections = [descriptorSection, parseSection];
    if (fallbackSection) {
      sections.push(fallbackSection);
    }

    const score = clampScore(
      Math.round(
        sections.reduce((sum, section) => sum + section.score, 0) / Math.max(1, sections.length)
      )
    );

    const diagnostics = sections.flatMap((section) => section.diagnostics);
    const losses = dedupeLosses(sections.flatMap((section) => section.losses));
    const grade = scoreToGrade(score);
    const summary = buildSummary({ score, grade, diagnostics, losses, parseResult, fallbackResult });

    return {
      score,
      grade,
      summary,
      diagnostics,
      losses,
      sections,
    };
  }

  return {
    evaluateDescriptor,
    evaluateParseResult,
    evaluateFallbackResult,
    buildImportDiagnostics,
  };
}

function finalizeSection(name, rawScore, diagnostics, losses, clampScore) {
  const score = clampScore(rawScore);
  return {
    name,
    score,
    grade: scoreToGrade(score),
    diagnostics,
    losses,
  };
}

function buildSummary({ score, grade, diagnostics, losses, parseResult, fallbackResult }) {
  const warningCount = diagnostics.filter((item) => item.level === DIAGNOSTIC_LEVELS.WARNING).length;
  const errorCount = diagnostics.filter((item) => item.level === DIAGNOSTIC_LEVELS.ERROR).length;
  const parsed = parseResult?.status === PARSER_MATCH_STATUS.PARSED;
  const fallbackAction = fallbackResult?.action || "";

  if (errorCount > 0 && !parsed && fallbackAction === FALLBACK_ACTIONS.REPORT_UNSUPPORTED) {
    return `Import quality is ${grade} (${score}/100); parsing failed and no usable fallback is available.`;
  }
  if (parsed && warningCount === 0 && losses.length === 0) {
    return `Import quality is ${grade} (${score}/100); parsing succeeded without notable losses.`;
  }
  if (parsed) {
    return `Import quality is ${grade} (${score}/100); parsing succeeded with ${warningCount} warning(s) and ${losses.length} known loss area(s).`;
  }
  if (fallbackAction) {
    return `Import quality is ${grade} (${score}/100); structured parse did not complete and fallback action "${fallbackAction}" will be used.`;
  }
  return `Import quality is ${grade} (${score}/100); diagnostics are available for review.`;
}

function pushDiagnostic(target, level, code, message) {
  target.push({ level, code, message });
}

function createLoss(area, message) {
  return { area, message };
}

function dedupeLosses(losses) {
  const seen = new Set();
  const result = [];
  for (const loss of losses) {
    const key = `${loss.area}:${loss.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(loss);
  }
  return result;
}

function scoreToGrade(score) {
  if (score >= 90) return QUALITY_GRADES.EXCELLENT;
  if (score >= 75) return QUALITY_GRADES.GOOD;
  if (score >= 55) return QUALITY_GRADES.FAIR;
  if (score >= 30) return QUALITY_GRADES.POOR;
  return QUALITY_GRADES.BROKEN;
}

function defaultClampScore(score) {
  const numeric = Number.isFinite(score) ? score : 0;
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return Math.round(numeric);
}
