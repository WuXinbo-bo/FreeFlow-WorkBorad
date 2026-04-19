import { INPUT_ENTRY_KINDS, INPUT_SOURCE_KINDS } from "../protocols/inputDescriptor.js";

export const DETECTED_TEXT_TYPES = Object.freeze({
  CODE: "code",
  MATH: "math",
  TABLE: "table",
  LIST: "list",
  QUOTE: "quote",
  TEXT: "text",
});

const TYPE_PRIORITY = Object.freeze([
  DETECTED_TEXT_TYPES.CODE,
  DETECTED_TEXT_TYPES.MATH,
  DETECTED_TEXT_TYPES.TABLE,
  DETECTED_TEXT_TYPES.LIST,
  DETECTED_TEXT_TYPES.QUOTE,
  DETECTED_TEXT_TYPES.TEXT,
]);

const BASE_SCORES = Object.freeze({
  [DETECTED_TEXT_TYPES.CODE]: 80,
  [DETECTED_TEXT_TYPES.MATH]: 60,
  [DETECTED_TEXT_TYPES.TABLE]: 45,
  [DETECTED_TEXT_TYPES.LIST]: 25,
  [DETECTED_TEXT_TYPES.QUOTE]: 20,
  [DETECTED_TEXT_TYPES.TEXT]: 5,
});

const STRONG_SIGNAL_BONUS = 20;

export function detectTextContentType(value) {
  const preprocessed = preprocessRawText(value);
  const features = extractGlobalFeatures(preprocessed);
  const candidates = [
    detectCode(preprocessed, features),
    detectMath(preprocessed, features),
    detectTable(preprocessed, features),
    detectList(preprocessed, features),
    detectQuote(preprocessed, features),
    detectPlainText(preprocessed, features),
  ];

  const winner = resolveCandidates(candidates);
  const mapping = mapDetectedTypeToEntry(winner.type);

  return {
    type: winner.type,
    entryKind: mapping.entryKind,
    sourceKind: mapping.sourceKind,
    reason: winner.reason,
    matchedRule: winner.matchedRule,
    confidence: winner.confidence,
    scores: Object.fromEntries(candidates.map((candidate) => [candidate.type, candidate.score])),
    features: serializeFeatures(features),
    preprocessed: {
      text: preprocessed.text,
      lineCount: preprocessed.lines.length,
      nonEmptyLineCount: preprocessed.nonEmptyLines.length,
    },
  };
}

export function preprocessRawText(value) {
  const normalized = String(value || "")
    .replace(/\uFEFF/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  const lines = normalized ? normalized.split("\n") : [];
  const nonEmptyLines = lines.filter((line) => line.trim());
  return {
    text: normalized,
    lines,
    nonEmptyLines,
  };
}

export function extractGlobalFeatures(preprocessed) {
  const text = preprocessed.text;
  const lines = preprocessed.lines;
  const nonEmptyLines = preprocessed.nonEmptyLines;
  const totalChars = text.length;
  const symbolMatches = text.match(/[^A-Za-z0-9\u4E00-\u9FFF\s]/g) || [];
  const leadingSpaceChars = lines.reduce((sum, line) => {
    const match = line.match(/^[ \t]+/);
    return sum + (match ? match[0].length : 0);
  }, 0);
  const spaceChars = (text.match(/[ \t]/g) || []).length;
  const blankLines = lines.filter((line) => !line.trim()).length;
  const separatorCounts = {
    pipes: countPattern(text, /\|/g),
    pluses: countPattern(text, /\+/g),
    tabs: countPattern(text, /\t/g),
    commas: countPattern(text, /,/g),
    dashes: countPattern(text, /-/g),
    blockquotes: countPattern(text, /^\s*>\s+/gm),
  };

  return {
    lineCount: lines.length,
    nonEmptyLineCount: nonEmptyLines.length,
    avgLineLen: nonEmptyLines.length
      ? nonEmptyLines.reduce((sum, line) => sum + line.length, 0) / nonEmptyLines.length
      : 0,
    symbolRatio: totalChars ? symbolMatches.length / totalChars : 0,
    indentRatio: totalChars ? leadingSpaceChars / totalChars : 0,
    spaceDensity: totalChars ? spaceChars / totalChars : 0,
    blankLineFrequency: lines.length ? blankLines / lines.length : 0,
    separatorCounts,
    lineFeatures: lines.map((line) => extractLineFeatures(line)),
    naturalLanguagePenalty: computeNaturalLanguagePenalty(text),
  };
}

function detectCode(preprocessed, features) {
  const text = preprocessed.text;
  if (!text) {
    return createCandidate(DETECTED_TEXT_TYPES.CODE, 0, "empty", false);
  }

  let score = BASE_SCORES.code;
  const reasons = [];
  let strongSignal = false;

  if (/^\s*```[\w-]*\s*$/m.test(text)) {
    score += 30;
    reasons.push("fenced-code");
    strongSignal = true;
  }
  if (/^#!\s*\/.+/.test(text)) {
    score += 20;
    reasons.push("shebang");
    strongSignal = true;
  }

  const keywordHits = countPattern(
    text,
    /\b(function|const|let|var|class|return|import|export|from|if|else|for|while|switch|case|try|catch|await|async|def|lambda|raise|except|elif|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|public|private|static|void|new|package|interface|enum|struct)\b/g
  );
  if (keywordHits > 0) {
    score += Math.min(keywordHits, 6) * 5;
    reasons.push(`keyword-hits:${keywordHits}`);
  }

  const punctuationDensity = countPattern(text, /[{}()[\];:=<>]/g);
  if (punctuationDensity >= 6) {
    score += 10;
    reasons.push("punctuation-density");
  }
  if (/=>|::|->|==|!=|<=|>=/.test(text)) {
    score += 10;
    reasons.push("operator-signature");
  }
  if (/^\s{2,}\S+/m.test(text) || /^\t+\S+/m.test(text)) {
    score += 15;
    reasons.push("indent-structure");
  }
  if (features.nonEmptyLineCount >= 3 && punctuationDensity >= 4) {
    score += 8;
    reasons.push("multiline-structure");
  }

  score -= features.naturalLanguagePenalty;
  const matched = strongSignal || score >= 90;
  return createCandidate(
    DETECTED_TEXT_TYPES.CODE,
    matched ? score : Math.max(score - 40, 0),
    reasons.join(",") || "no-code-signature",
    matched,
    strongSignal ? "strong-code-signal" : "scored-code-signal"
  );
}

function detectMath(preprocessed, features) {
  const text = preprocessed.text;
  if (!text) {
    return createCandidate(DETECTED_TEXT_TYPES.MATH, 0, "empty", false);
  }

  let score = BASE_SCORES.math;
  const reasons = [];
  let strongSignal = false;

  if (/^\$\$(.|\n)+\$\$$/.test(text) || /^\$(.|\n)+\$$/.test(text) || /^\\\((.|\n)+\\\)$/.test(text) || /^\\\[(.|\n)+\\\]$/.test(text)) {
    score += 25;
    reasons.push("latex-wrapper");
    strongSignal = true;
  }
  if (/^\\begin\{([a-z*]+)\}(.|\n)+\\end\{\1\}$/.test(text)) {
    score += 25;
    reasons.push("latex-environment");
    strongSignal = true;
  }

  const commandHits = countPattern(
    text,
    /\\(frac|sqrt|sum|int|prod|alpha|beta|gamma|theta|lambda|pi|sigma|Delta|partial|begin|end|left|right)/g
  );
  if (commandHits > 0) {
    score += Math.min(commandHits, 5) * 5;
    reasons.push(`latex-commands:${commandHits}`);
  }

  const mathSymbolHits = countPattern(text, /[=+\-*/^_{}[\]<>]|∑|∫|√|∞|≈|≠|≤|≥|±|×|÷/g);
  const mathSymbolRatio = text.length ? mathSymbolHits / text.length : 0;
  if (mathSymbolRatio >= 0.15) {
    score += 12;
    reasons.push("math-symbol-density");
  }
  if (countPattern(text, /[_^]/g) >= 1 && /[{}]/.test(text)) {
    score += 10;
    reasons.push("super-sub-script");
  }
  if (countPattern(text, /=/g) >= 1 && countPattern(text, /[(){}\[\]]/g) >= 2) {
    score += 8;
    reasons.push("equation-structure");
  }

  score -= features.naturalLanguagePenalty;
  const matched = strongSignal || score >= 80;
  return createCandidate(
    DETECTED_TEXT_TYPES.MATH,
    matched ? score : Math.max(score - 35, 0),
    reasons.join(",") || "no-math-signature",
    matched,
    strongSignal ? "strong-math-signal" : "scored-math-signal"
  );
}

function detectTable(preprocessed, features) {
  const { text, lines, nonEmptyLines } = preprocessed;
  if (!text || nonEmptyLines.length < 2) {
    return createCandidate(DETECTED_TEXT_TYPES.TABLE, 0, "not-enough-lines", false);
  }

  let score = BASE_SCORES.table;
  const reasons = [];
  let strongSignal = false;
  const tableStats = computeTableStats(lines);

  if (tableStats.pipeLineCount >= 2 && tableStats.pipeLineCount >= Math.max(2, Math.floor(nonEmptyLines.length * 0.6))) {
    score += 12;
    reasons.push("pipe-columns");
  }
  if (tableStats.hasMarkdownSeparator) {
    score += 20;
    reasons.push("markdown-separator");
    strongSignal = true;
  }
  if (tableStats.tabHeavy) {
    score += 15;
    reasons.push("tab-columns");
  }
  if (tableStats.commaFieldConsistency >= 0.8) {
    score += 12;
    reasons.push("csv-consistency");
  }
  if (tableStats.alignmentVariance <= 2.5 && tableStats.alignmentSampleCount >= 2) {
    score += 20;
    reasons.push("column-alignment");
  }
  if (tableStats.fieldConsistency >= 0.8) {
    score += 12;
    reasons.push("field-consistency");
  }

  score -= Math.min(features.naturalLanguagePenalty, 10);
  const matched = strongSignal || score >= 70;
  return createCandidate(
    DETECTED_TEXT_TYPES.TABLE,
    matched ? score : Math.max(score - 25, 0),
    reasons.join(",") || "no-table-signature",
    matched,
    strongSignal ? "strong-table-signal" : "scored-table-signal"
  );
}

function detectList(preprocessed, features) {
  const text = preprocessed.text;
  if (!text) {
    return createCandidate(DETECTED_TEXT_TYPES.LIST, 0, "empty", false);
  }
  const taskCount = countPattern(text, /^\s*[-*+]\s+\[[ xX]\]\s+\S+/gm);
  const bulletCount = countPattern(text, /^\s*[-*+]\s+\S+/gm);
  const orderedCount = countPattern(text, /^\s*\d+\.\s+\S+/gm);
  const total = taskCount + bulletCount + orderedCount;

  let score = BASE_SCORES.list;
  const reasons = [];
  if (taskCount > 0) {
    score += taskCount * 5;
    reasons.push(`task-items:${taskCount}`);
  }
  if (bulletCount > 1) {
    score += Math.min(bulletCount, 5) * 3;
    reasons.push(`bullet-items:${bulletCount}`);
  }
  if (orderedCount > 1) {
    score += Math.min(orderedCount, 5) * 3;
    reasons.push(`ordered-items:${orderedCount}`);
  }
  if (total >= 2 && features.avgLineLen <= 28) {
    score += 8;
    reasons.push("short-list-structure");
  }

  const matched = total >= 2 && score >= 32;
  return createCandidate(
    DETECTED_TEXT_TYPES.LIST,
    matched ? score : Math.max(score - 20, 0),
    reasons.join(",") || "no-list-signature",
    matched,
    matched ? "list-structure-signal" : "scored-list-signal"
  );
}

function detectQuote(preprocessed) {
  const text = preprocessed.text;
  if (!text) {
    return createCandidate(DETECTED_TEXT_TYPES.QUOTE, 0, "empty", false);
  }
  const quoteCount = countPattern(text, /^\s*>\s+\S+/gm);
  let score = BASE_SCORES.quote;
  const reasons = [];
  if (quoteCount > 0) {
    score += Math.min(quoteCount, 5) * 4;
    reasons.push(`quote-lines:${quoteCount}`);
  }
  const matched = quoteCount >= 2 && score >= 28;
  return createCandidate(
    DETECTED_TEXT_TYPES.QUOTE,
    matched ? score : Math.max(score - 15, 0),
    reasons.join(",") || "no-quote-signature",
    matched,
    matched ? "quote-structure-signal" : "scored-quote-signal"
  );
}

function detectPlainText(preprocessed, features) {
  let score = BASE_SCORES.text;
  if (features.naturalLanguagePenalty >= 12) {
    score += 10;
  }
  if (features.symbolRatio <= 0.12) {
    score += 6;
  }
  return createCandidate(DETECTED_TEXT_TYPES.TEXT, score, "plain-text-default", true, "plain-text-fallback");
}

function computeTableStats(lines) {
  const nonEmptyLines = lines.filter((line) => line.trim());
  const pipeLines = nonEmptyLines.filter((line) => countPattern(line, /\|/g) >= 2);
  const tabLines = nonEmptyLines.filter((line) => /\t/.test(line));
  const csvLines = nonEmptyLines.filter((line) => countPattern(line, /,/g) >= 1);
  const pipeFieldCounts = pipeLines.map((line) => splitPipeFields(line).length).filter((count) => count > 1);
  const tabFieldCounts = tabLines.map((line) => splitTabFields(line).length).filter((count) => count > 1);
  const csvFieldCounts = csvLines.map((line) => splitCommaFields(line).length).filter((count) => count > 1);
  const alignmentStats = computeColumnAlignmentVariance(nonEmptyLines);

  return {
    pipeLineCount: pipeLines.length,
    hasMarkdownSeparator: nonEmptyLines.some((line) => /^\s*\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?\s*$/.test(line)),
    tabHeavy: textCharRatio(nonEmptyLines.join("\n"), /\t/g) >= 0.08,
    fieldConsistency: computeConsistency([...pipeFieldCounts, ...tabFieldCounts]),
    commaFieldConsistency: computeConsistency(csvFieldCounts),
    alignmentVariance: alignmentStats.variance,
    alignmentSampleCount: alignmentStats.sampleCount,
  };
}

function computeColumnAlignmentVariance(lines) {
  const coordinatesByIndex = new Map();
  lines.forEach((line) => {
    const coords = [];
    const regex = / {2,}|\t+/g;
    let match = regex.exec(line);
    while (match) {
      coords.push(match.index);
      match = regex.exec(line);
    }
    coords.forEach((coord, index) => {
      if (!coordinatesByIndex.has(index)) {
        coordinatesByIndex.set(index, []);
      }
      coordinatesByIndex.get(index).push(coord);
    });
  });

  const variances = [];
  for (const coords of coordinatesByIndex.values()) {
    if (coords.length < 2) {
      continue;
    }
    const mean = coords.reduce((sum, value) => sum + value, 0) / coords.length;
    const variance = coords.reduce((sum, value) => sum + (value - mean) ** 2, 0) / coords.length;
    variances.push(variance);
  }

  if (!variances.length) {
    return { variance: Number.POSITIVE_INFINITY, sampleCount: 0 };
  }
  return {
    variance: variances.reduce((sum, value) => sum + value, 0) / variances.length,
    sampleCount: variances.length,
  };
}

function computeConsistency(fieldCounts) {
  if (!fieldCounts.length) {
    return 0;
  }
  const frequency = new Map();
  fieldCounts.forEach((count) => {
    frequency.set(count, (frequency.get(count) || 0) + 1);
  });
  const best = Math.max(...frequency.values());
  return best / fieldCounts.length;
}

function splitPipeFields(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitTabFields(line) {
  return String(line || "")
    .split(/\t+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitCommaFields(line) {
  return String(line || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractLineFeatures(line) {
  const text = String(line || "");
  const indentMatch = text.match(/^[ \t]*/);
  return {
    text,
    trimmed: text.trim(),
    length: text.length,
    indent: indentMatch ? indentMatch[0].length : 0,
    pipeCount: countPattern(text, /\|/g),
    tabCount: countPattern(text, /\t/g),
    commaCount: countPattern(text, /,/g),
    quote: /^\s*>\s+/.test(text),
    list: /^\s*(?:[-*+]|\d+\.)\s+/.test(text),
  };
}

function computeNaturalLanguagePenalty(text) {
  const sentenceMarkerCount = countPattern(text, /[。！？.!?]/g);
  const connectorCount = countPattern(text, /\b(的|是|和|为|以及|如果|所以|然后|但是|并且|我们|你们|他们|this|that|with|then|because|however|therefore)\b/g);
  const latinWordCount = countPattern(text, /\b[A-Za-z]{3,}\b/g);
  if (sentenceMarkerCount === 0 && connectorCount === 0) {
    return 0;
  }
  return Math.min(sentenceMarkerCount * 2 + connectorCount * 3 + Math.min(latinWordCount, 4), 24);
}

function resolveCandidates(candidates) {
  const nonTextMatched = candidates.filter(
    (candidate) => candidate.matched && candidate.type !== DETECTED_TEXT_TYPES.TEXT
  );
  if (!nonTextMatched.length) {
    return enrichCandidate(
      candidates.find((candidate) => candidate.type === DETECTED_TEXT_TYPES.TEXT) || candidates[0],
      "low"
    );
  }

  const sorted = candidates
    .slice()
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return TYPE_PRIORITY.indexOf(left.type) - TYPE_PRIORITY.indexOf(right.type);
    });

  const best = sorted[0];
  const second = sorted[1];
  if (!second) {
    return enrichCandidate(best, best.score >= 70 ? "high" : "medium");
  }

  const scoreGap = best.score - second.score;
  const bestPriority = TYPE_PRIORITY.indexOf(best.type);
  const secondPriority = TYPE_PRIORITY.indexOf(second.type);
  if (best.matched && scoreGap >= 10) {
    return enrichCandidate(best, best.score >= 85 ? "high" : "medium");
  }
  if (best.matched && bestPriority < secondPriority) {
    return enrichCandidate(best, "medium");
  }
  return enrichCandidate(best, best.type === DETECTED_TEXT_TYPES.TEXT ? "low" : "medium");
}

function enrichCandidate(candidate, confidence) {
  return {
    ...candidate,
    confidence,
  };
}

function createCandidate(type, score, reason, matched, matchedRule = "") {
  const adjusted = Math.max(0, Math.round(score + (matched ? STRONG_SIGNAL_BONUS : 0)));
  return {
    type,
    score: adjusted,
    reason,
    matched,
    matchedRule,
  };
}

function mapDetectedTypeToEntry(type) {
  switch (type) {
    case DETECTED_TEXT_TYPES.CODE:
      return {
        entryKind: INPUT_ENTRY_KINDS.CODE,
        sourceKind: INPUT_SOURCE_KINDS.CODE,
      };
    case DETECTED_TEXT_TYPES.MATH:
      return {
        entryKind: INPUT_ENTRY_KINDS.MATH,
        sourceKind: INPUT_SOURCE_KINDS.MATH_FORMULA,
      };
    case DETECTED_TEXT_TYPES.TABLE:
    case DETECTED_TEXT_TYPES.LIST:
    case DETECTED_TEXT_TYPES.QUOTE:
      return {
        entryKind: INPUT_ENTRY_KINDS.MARKDOWN,
        sourceKind: INPUT_SOURCE_KINDS.MARKDOWN,
      };
    default:
      return {
        entryKind: INPUT_ENTRY_KINDS.TEXT,
        sourceKind: INPUT_SOURCE_KINDS.PLAIN_TEXT,
      };
  }
}

function serializeFeatures(features) {
  return {
    lineCount: features.lineCount,
    nonEmptyLineCount: features.nonEmptyLineCount,
    avgLineLen: round(features.avgLineLen),
    symbolRatio: round(features.symbolRatio),
    indentRatio: round(features.indentRatio),
    spaceDensity: round(features.spaceDensity),
    blankLineFrequency: round(features.blankLineFrequency),
    separatorCounts: { ...features.separatorCounts },
    naturalLanguagePenalty: features.naturalLanguagePenalty,
  };
}

function textCharRatio(text, pattern) {
  const totalChars = String(text || "").length;
  return totalChars ? countPattern(text, pattern) / totalChars : 0;
}

function countPattern(text, pattern) {
  const matches = String(text || "").match(pattern);
  return Array.isArray(matches) ? matches.length : 0;
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}
