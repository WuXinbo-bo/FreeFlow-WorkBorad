const {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  HighlightColor,
  LevelFormat,
  LevelSuffix,
  LineRuleType,
  Math: DocxMath,
  MathFraction,
  MathFunction,
  MathIntegral,
  MathRadical,
  MathRoundBrackets,
  MathRun,
  MathSquareBrackets,
  MathSubScript,
  MathSubSuperScript,
  MathSum,
  MathSuperScript,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlignTable,
  WidthType,
  convertMillimetersToTwip,
} = require("docx");

const AST_KIND = "freeflow-word-export";
const AST_VERSION = 1;

const STYLE_CODE_LINE = "FreeFlowCodeLine";
const STYLE_CODE_LABEL = "FreeFlowCodeLabel";
const STYLE_BLOCK_QUOTE = "FreeFlowBlockQuote";
const STYLE_MATH_BLOCK = "FreeFlowMathBlock";
const STYLE_TABLE_HEADER = "FreeFlowTableHeader";
const STYLE_TABLE_CELL = "FreeFlowTableCell";
const STYLE_LIST_CONTINUATION = "FreeFlowListContinuation";
const STYLE_NORMAL = "Normal";
const DEFAULT_FONT_POLICY_MODE = "restricted";
const EXPORT_FONT_FAMILIES = Object.freeze({
  latinBody: "Arial",
  latinHeading: "Arial",
  latinSerif: "Times New Roman",
  latinMono: "Consolas",
  eastAsiaBody: "SimSun",
  eastAsiaHeading: "Microsoft YaHei",
  eastAsiaSerif: "SimSun",
  eastAsiaMono: "Consolas",
  math: "Cambria Math",
});

function normalizeHexColor(value, fallback = "") {
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }
  const match = raw.match(/#?([0-9a-f]{6}|[0-9a-f]{3})/i);
  if (!match) {
    return fallback;
  }
  let hex = match[1].toUpperCase();
  if (hex.length === 3) {
    hex = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return hex;
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toInteger(value, fallback = 0, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const numeric = toFiniteNumber(value, fallback);
  const rounded = Math.round(numeric);
  return Math.min(max, Math.max(min, rounded));
}

function ptToHalfPoints(value, fallback = 24) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return toInteger(fallback, 24, { min: 1 });
  }
  return toInteger(numeric * 2, fallback, { min: 1 });
}

function ptToTwip(value, fallback = 120) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return toInteger(fallback, 120, { min: 0 });
  }
  return toInteger(numeric * 20, fallback, { min: 0 });
}

function roundToNearest(value, step = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isFinite(step) || step <= 0) {
    return value;
  }
  return Math.round(numeric / step) * step;
}

function mmToTwip(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return toInteger(fallback, 0, { min: 0 });
  }
  return toInteger(convertMillimetersToTwip(numeric), fallback, { min: 0 });
}

function normalizeIndentTwip(value, fallback = 0) {
  return toInteger(value, fallback, { min: 0, max: 31680 });
}

function buildParagraphIndent(value, extra = {}) {
  const left = normalizeIndentTwip(value, 0);
  if (left <= 0 && extra.hanging == null) {
    return undefined;
  }
  const indent = { left };
  if (extra.hanging != null) {
    indent.hanging = normalizeIndentTwip(extra.hanging, 0);
  }
  return indent;
}

function buildTableIndent(value) {
  const size = normalizeIndentTwip(value, 0);
  return size > 0 ? { size, type: WidthType.DXA } : undefined;
}

function normalizeListDepth(depth) {
  return toInteger(depth, 0, { min: 0, max: 8 });
}

function buildAllowedFontSet(theme = {}) {
  const families = theme?.fontPolicy?.allowedFamilies && typeof theme.fontPolicy.allowedFamilies === "object"
    ? theme.fontPolicy.allowedFamilies
    : EXPORT_FONT_FAMILIES;
  return new Set(
    Object.values(families)
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
}

function resolveRestrictedFont(candidate = "", fallback = "", allowedSet = null) {
  const normalized = String(candidate || "").trim();
  if (normalized && (!allowedSet || allowedSet.has(normalized))) {
    return normalized;
  }
  const safeFallback = String(fallback || "").trim();
  if (safeFallback && (!allowedSet || allowedSet.has(safeFallback))) {
    return safeFallback;
  }
  return safeFallback || normalized || "Arial";
}

function mapAlignment(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "center") {
    return AlignmentType.CENTER;
  }
  if (normalized === "right") {
    return AlignmentType.RIGHT;
  }
  if (normalized === "justify") {
    return AlignmentType.JUSTIFIED;
  }
  return AlignmentType.LEFT;
}

function buildFontAttributes(theme = {}, fontName = "", options = {}) {
  const allowedSet = theme.allowedFontSet instanceof Set ? theme.allowedFontSet : null;
  const ascii = resolveRestrictedFont(
    fontName || options.asciiFont || theme.defaultFont || "Arial",
    theme.defaultFont || EXPORT_FONT_FAMILIES.latinBody,
    allowedSet
  );
  const eastAsia = resolveRestrictedFont(
    options.eastAsiaFont || theme.eastAsiaFont || ascii,
    theme.eastAsiaFont || EXPORT_FONT_FAMILIES.eastAsiaBody,
    allowedSet
  );
  return {
    ascii,
    hAnsi: ascii,
    eastAsia,
    cs: ascii,
  };
}

function mapHighlightColor(hex = "") {
  const normalized = normalizeHexColor(hex, "");
  if (!normalized) {
    return undefined;
  }
  const palette = [
    { key: HighlightColor.YELLOW, rgb: [255, 255, 0] },
    { key: HighlightColor.GREEN, rgb: [0, 255, 0] },
    { key: HighlightColor.CYAN, rgb: [0, 255, 255] },
    { key: HighlightColor.BLUE, rgb: [0, 0, 255] },
    { key: HighlightColor.RED, rgb: [255, 0, 0] },
    { key: HighlightColor.MAGENTA, rgb: [255, 0, 255] },
    { key: HighlightColor.LIGHT_GRAY, rgb: [211, 211, 211] },
    { key: HighlightColor.DARK_YELLOW, rgb: [128, 128, 0] },
  ];
  const source = [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  palette.forEach((entry) => {
    const distance =
      (entry.rgb[0] - source[0]) ** 2 +
      (entry.rgb[1] - source[1]) ** 2 +
      (entry.rgb[2] - source[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  });
  return best.key;
}

function normalizeTheme(ast = {}) {
  const theme = ast?.theme && typeof ast.theme === "object" ? ast.theme : {};
  const typography = theme?.typography && typeof theme.typography === "object" ? theme.typography : {};
  const fontPolicy = theme?.fontPolicy && typeof theme.fontPolicy === "object" ? theme.fontPolicy : {};
  const baseFontSizePt = Number(theme.baseFontSizePt) > 0 ? Number(theme.baseFontSizePt) : 11;
  const bodyPt = Number(typography.bodyPt) > 0 ? Number(typography.bodyPt) : baseFontSizePt;
  const headingPts = Array.from({ length: 6 }, (_, index) => {
    const fallback = [16, 14, 13, 12, 11, 10.5][index];
    const numeric = Number(Array.isArray(typography.headingPts) ? typography.headingPts[index] : NaN);
    return roundToNearest(numeric > 0 ? numeric : fallback, 0.5);
  });
  const normalizedTheme = {
    defaultFont: String(theme.defaultFont || EXPORT_FONT_FAMILIES.latinBody).trim() || EXPORT_FONT_FAMILIES.latinBody,
    headingFont: String(theme.headingFont || EXPORT_FONT_FAMILIES.latinHeading).trim() || EXPORT_FONT_FAMILIES.latinHeading,
    eastAsiaFont: String(theme.eastAsiaFont || EXPORT_FONT_FAMILIES.eastAsiaBody).trim() || EXPORT_FONT_FAMILIES.eastAsiaBody,
    eastAsiaHeadingFont: String(theme.eastAsiaHeadingFont || EXPORT_FONT_FAMILIES.eastAsiaHeading).trim() || EXPORT_FONT_FAMILIES.eastAsiaHeading,
    codeFont: String(theme.codeFont || EXPORT_FONT_FAMILIES.latinMono).trim() || EXPORT_FONT_FAMILIES.latinMono,
    codeEastAsiaFont: String(theme.codeEastAsiaFont || EXPORT_FONT_FAMILIES.eastAsiaMono).trim() || EXPORT_FONT_FAMILIES.eastAsiaMono,
    mathFont: String(theme.mathFont || EXPORT_FONT_FAMILIES.math).trim() || EXPORT_FONT_FAMILIES.math,
    fontPolicy: {
      mode: String(fontPolicy.mode || DEFAULT_FONT_POLICY_MODE).trim() || DEFAULT_FONT_POLICY_MODE,
      requestedRole: String(fontPolicy.requestedRole || "sans").trim() || "sans",
      requestedSourceFont: String(fontPolicy.requestedSourceFont || "").trim(),
      allowedFamilies: {
        ...EXPORT_FONT_FAMILIES,
        ...(fontPolicy.allowedFamilies && typeof fontPolicy.allowedFamilies === "object" ? fontPolicy.allowedFamilies : {}),
      },
    },
    baseFontSizePt: bodyPt,
    baseColor: normalizeHexColor(theme.baseColor, "111827"),
    linkColor: normalizeHexColor(theme.linkColor, "2563EB"),
    quoteBorderColor: normalizeHexColor(theme.quoteBorderColor, "CBD5E1"),
    quoteTextColor: normalizeHexColor(theme.quoteTextColor, "475569"),
    codeBackgroundColor: normalizeHexColor(theme.codeBackgroundColor, "F8FAFC"),
    codeBorderColor: normalizeHexColor(theme.codeBorderColor, "D7DEE8"),
    tableBorderColor: normalizeHexColor(theme.tableBorderColor, "CBD5E1"),
    tableHeaderBackgroundColor: normalizeHexColor(theme.tableHeaderBackgroundColor, "F8FAFC"),
    typography: {
      bodyPt,
      headingPts,
      codePt: Number(typography.codePt) > 0 ? Number(typography.codePt) : Math.max(9.5, bodyPt - 1),
      inlineCodePt: Number(typography.inlineCodePt) > 0 ? Number(typography.inlineCodePt) : Math.max(9.5, bodyPt - 0.5),
      footnotePt: Number(typography.footnotePt) > 0 ? Number(typography.footnotePt) : Math.max(9, bodyPt - 1.5),
      lineMultiple: Number(typography.lineMultiple) > 0 ? Number(typography.lineMultiple) : 1.24,
      quoteLineMultiple: Number(typography.quoteLineMultiple) > 0 ? Number(typography.quoteLineMultiple) : 1.22,
      codeLineMultiple: Number(typography.codeLineMultiple) > 0 ? Number(typography.codeLineMultiple) : 1.15,
    },
    page: {
      widthMm: Number(theme?.page?.widthMm) || 210,
      heightMm: Number(theme?.page?.heightMm) || 297,
      marginTopMm: Number(theme?.page?.marginTopMm) || 25.4,
      marginRightMm: Number(theme?.page?.marginRightMm) || 25.4,
      marginBottomMm: Number(theme?.page?.marginBottomMm) || 25.4,
      marginLeftMm: Number(theme?.page?.marginLeftMm) || 25.4,
      headerMm: Number(theme?.page?.headerMm) || 12.7,
      footerMm: Number(theme?.page?.footerMm) || 12.7,
    },
    spacing: {
      paragraphAfterPt: Number(theme?.spacing?.paragraphAfterPt) >= 0 ? Number(theme.spacing.paragraphAfterPt) : 6,
      paragraphBeforePt: Number(theme?.spacing?.paragraphBeforePt) >= 0 ? Number(theme.spacing.paragraphBeforePt) : 0,
      listParagraphAfterPt: Number(theme?.spacing?.listParagraphAfterPt) >= 0 ? Number(theme.spacing.listParagraphAfterPt) : 2.5,
      listBlockAfterPt: Number(theme?.spacing?.listBlockAfterPt) >= 0 ? Number(theme.spacing.listBlockAfterPt) : 1,
      headingBeforePt: Number(theme?.spacing?.headingBeforePt) >= 0 ? Number(theme.spacing.headingBeforePt) : 12,
      headingAfterPt: Number(theme?.spacing?.headingAfterPt) >= 0 ? Number(theme.spacing.headingAfterPt) : 6,
      headingSpacingPts: Array.from({ length: 6 }, (_, index) => {
        const numeric = Number(Array.isArray(theme?.spacing?.headingSpacingPts) ? theme.spacing.headingSpacingPts[index] : NaN);
        return numeric >= 0 ? numeric : [18, 15, 13, 11, 9, 8][index];
      }),
      blockAfterPt: Number(theme?.spacing?.blockAfterPt) >= 0 ? Number(theme.spacing.blockAfterPt) : 8,
      codeLineAfterPt: Number(theme?.spacing?.codeLineAfterPt) >= 0 ? Number(theme.spacing.codeLineAfterPt) : 0,
      codeBlockBeforePt: Number(theme?.spacing?.codeBlockBeforePt) >= 0 ? Number(theme.spacing.codeBlockBeforePt) : 4,
      codeBlockAfterPt: Number(theme?.spacing?.codeBlockAfterPt) >= 0 ? Number(theme.spacing.codeBlockAfterPt) : 9,
      quoteAfterPt: Number(theme?.spacing?.quoteAfterPt) >= 0 ? Number(theme.spacing.quoteAfterPt) : 6,
      quoteInnerAfterPt: Number(theme?.spacing?.quoteInnerAfterPt) >= 0 ? Number(theme.spacing.quoteInnerAfterPt) : 3,
      tableAfterPt: Number(theme?.spacing?.tableAfterPt) >= 0 ? Number(theme.spacing.tableAfterPt) : 8,
      tableCellAfterPt: Number(theme?.spacing?.tableCellAfterPt) >= 0 ? Number(theme.spacing.tableCellAfterPt) : 1.5,
      thematicBreakBeforePt: Number(theme?.spacing?.thematicBreakBeforePt) >= 0 ? Number(theme.spacing.thematicBreakBeforePt) : 8,
      thematicBreakAfterPt: Number(theme?.spacing?.thematicBreakAfterPt) >= 0 ? Number(theme.spacing.thematicBreakAfterPt) : 10,
    },
    table: {
      cellPaddingTopPt: Number(theme?.table?.cellPaddingTopPt) >= 0 ? Number(theme.table.cellPaddingTopPt) : 4,
      cellPaddingBottomPt: Number(theme?.table?.cellPaddingBottomPt) >= 0 ? Number(theme.table.cellPaddingBottomPt) : 4,
      cellPaddingLeftPt: Number(theme?.table?.cellPaddingLeftPt) >= 0 ? Number(theme.table.cellPaddingLeftPt) : 5,
      cellPaddingRightPt: Number(theme?.table?.cellPaddingRightPt) >= 0 ? Number(theme.table.cellPaddingRightPt) : 5,
      headerMinHeightPt: Number(theme?.table?.headerMinHeightPt) >= 0 ? Number(theme.table.headerMinHeightPt) : 18,
    },
  };
  normalizedTheme.allowedFontSet = buildAllowedFontSet(normalizedTheme);
  normalizedTheme.defaultFont = resolveRestrictedFont(
    normalizedTheme.defaultFont,
    EXPORT_FONT_FAMILIES.latinBody,
    normalizedTheme.allowedFontSet
  );
  normalizedTheme.headingFont = resolveRestrictedFont(
    normalizedTheme.headingFont,
    EXPORT_FONT_FAMILIES.latinHeading,
    normalizedTheme.allowedFontSet
  );
  normalizedTheme.eastAsiaFont = resolveRestrictedFont(
    normalizedTheme.eastAsiaFont,
    EXPORT_FONT_FAMILIES.eastAsiaBody,
    normalizedTheme.allowedFontSet
  );
  normalizedTheme.eastAsiaHeadingFont = resolveRestrictedFont(
    normalizedTheme.eastAsiaHeadingFont,
    EXPORT_FONT_FAMILIES.eastAsiaHeading,
    normalizedTheme.allowedFontSet
  );
  normalizedTheme.codeFont = resolveRestrictedFont(
    normalizedTheme.codeFont,
    EXPORT_FONT_FAMILIES.latinMono,
    normalizedTheme.allowedFontSet
  );
  normalizedTheme.codeEastAsiaFont = resolveRestrictedFont(
    normalizedTheme.codeEastAsiaFont,
    EXPORT_FONT_FAMILIES.eastAsiaMono,
    normalizedTheme.allowedFontSet
  );
  normalizedTheme.mathFont = resolveRestrictedFont(
    normalizedTheme.mathFont,
    EXPORT_FONT_FAMILIES.math,
    normalizedTheme.allowedFontSet
  );
  return normalizedTheme;
}

function buildParagraphLineSpacing(theme, kind = "body") {
  const rawMultiple =
    kind === "code"
      ? theme.typography.codeLineMultiple
      : kind === "quote"
        ? theme.typography.quoteLineMultiple
        : theme.typography.lineMultiple;
  const multiple = Math.max(0.75, Math.min(3, toFiniteNumber(rawMultiple, 1.24)));
  return {
    line: toInteger(240 * multiple, 298, { min: 240 }),
    lineRule: LineRuleType.AUTO,
  };
}

function buildSpacing(theme, kind = "body", extra = {}) {
  const spacing = {
    before: ptToTwip(theme.spacing.paragraphBeforePt, 0),
    after: ptToTwip(theme.spacing.paragraphAfterPt, 120),
    ...buildParagraphLineSpacing(theme, kind),
  };
  if (kind === "list") {
    spacing.after = ptToTwip(theme.spacing.listParagraphAfterPt, 50);
  } else if (kind === "quote") {
    spacing.after = ptToTwip(theme.spacing.quoteInnerAfterPt, 60);
  } else if (kind === "tableCell") {
    spacing.after = ptToTwip(theme.spacing.tableCellAfterPt, 30);
  } else if (kind === "code") {
    spacing.after = ptToTwip(theme.spacing.codeLineAfterPt, 0);
  }
  if (typeof extra.before === "number") {
    spacing.before = ptToTwip(extra.before, spacing.before);
  }
  if (typeof extra.after === "number") {
    spacing.after = ptToTwip(extra.after, spacing.after);
  }
  return spacing;
}

function createDocumentStyles(theme) {
  const baseRun = {
    font: buildFontAttributes(theme, "", { eastAsiaFont: theme.eastAsiaFont }),
    color: theme.baseColor,
    size: ptToHalfPoints(theme.typography.bodyPt, 24),
  };
  const headingRunFont = buildFontAttributes(theme, theme.headingFont, { eastAsiaFont: theme.eastAsiaHeadingFont });
  return {
    default: {
      document: {
        run: baseRun,
        paragraph: {
          spacing: buildSpacing(theme, "body"),
        },
      },
      heading1: {
        run: { ...baseRun, font: headingRunFont, size: ptToHalfPoints(theme.typography.headingPts[0]), bold: true },
        paragraph: { spacing: buildSpacing(theme, "body", { before: theme.spacing.headingSpacingPts[0], after: 5 }) },
      },
      heading2: {
        run: { ...baseRun, font: headingRunFont, size: ptToHalfPoints(theme.typography.headingPts[1]), bold: true },
        paragraph: { spacing: buildSpacing(theme, "body", { before: theme.spacing.headingSpacingPts[1], after: 4.5 }) },
      },
      heading3: {
        run: { ...baseRun, font: headingRunFont, size: ptToHalfPoints(theme.typography.headingPts[2]), bold: true },
        paragraph: { spacing: buildSpacing(theme, "body", { before: theme.spacing.headingSpacingPts[2], after: 4 }) },
      },
      heading4: {
        run: { ...baseRun, font: headingRunFont, size: ptToHalfPoints(theme.typography.headingPts[3]), bold: true },
        paragraph: { spacing: buildSpacing(theme, "body", { before: theme.spacing.headingSpacingPts[3], after: 3.5 }) },
      },
      heading5: {
        run: { ...baseRun, font: headingRunFont, size: ptToHalfPoints(theme.typography.headingPts[4]), bold: true },
        paragraph: { spacing: buildSpacing(theme, "body", { before: theme.spacing.headingSpacingPts[4], after: 3 }) },
      },
      heading6: {
        run: { ...baseRun, font: headingRunFont, size: ptToHalfPoints(theme.typography.headingPts[5]), bold: true },
        paragraph: { spacing: buildSpacing(theme, "body", { before: theme.spacing.headingSpacingPts[5], after: 2.5 }) },
      },
      hyperlink: {
        run: {
          color: theme.linkColor,
          underline: { type: UnderlineType.SINGLE },
        },
      },
      footnoteReference: {
        run: {
          size: ptToHalfPoints(theme.typography.footnotePt),
          superScript: true,
        },
      },
      footnoteText: {
        run: {
          ...baseRun,
          size: ptToHalfPoints(theme.typography.footnotePt),
        },
      },
    },
    paragraphStyles: [
      {
        id: STYLE_NORMAL,
        name: "Normal",
        default: true,
        quickFormat: true,
        run: {
          ...baseRun,
        },
        paragraph: {
          spacing: buildSpacing(theme, "body"),
        },
      },
      {
        id: STYLE_BLOCK_QUOTE,
        name: "FreeFlow Block Quote",
        basedOn: STYLE_NORMAL,
        paragraph: {
          border: {
            left: { style: BorderStyle.SINGLE, color: theme.quoteBorderColor, size: 6, space: 6 },
          },
          indent: buildParagraphIndent(mmToTwip(6)),
          spacing: buildSpacing(theme, "quote", { before: 2, after: theme.spacing.quoteAfterPt }),
        },
        run: {
          color: theme.quoteTextColor,
        },
      },
      {
        id: STYLE_CODE_LINE,
        name: "FreeFlow Code Line",
        basedOn: STYLE_NORMAL,
        paragraph: {
          spacing: buildSpacing(theme, "code"),
        },
        run: {
          font: buildFontAttributes(theme, theme.codeFont, { eastAsiaFont: theme.codeEastAsiaFont }),
          size: ptToHalfPoints(theme.typography.codePt),
          color: "0F172A",
        },
      },
      {
        id: STYLE_CODE_LABEL,
        name: "FreeFlow Code Label",
        basedOn: STYLE_NORMAL,
        paragraph: {
          spacing: buildSpacing(theme, "code", { before: 0, after: 2.5 }),
        },
        run: {
          font: buildFontAttributes(theme, theme.headingFont, { eastAsiaFont: theme.eastAsiaHeadingFont }),
          size: ptToHalfPoints(Math.max(8.5, theme.typography.bodyPt - 2)),
          color: "64748B",
          bold: true,
        },
      },
      {
        id: STYLE_MATH_BLOCK,
        name: "FreeFlow Math Block",
        basedOn: STYLE_NORMAL,
        paragraph: {
          spacing: buildSpacing(theme, "body", { before: 4, after: theme.spacing.blockAfterPt }),
        },
        run: {
          font: buildFontAttributes(theme, theme.mathFont),
          italics: true,
        },
      },
      {
        id: STYLE_TABLE_HEADER,
        name: "FreeFlow Table Header",
        basedOn: STYLE_NORMAL,
        paragraph: {
          spacing: buildSpacing(theme, "tableCell", { before: 0, after: theme.spacing.tableCellAfterPt }),
        },
        run: {
          bold: true,
        },
      },
      {
        id: STYLE_TABLE_CELL,
        name: "FreeFlow Table Cell",
        basedOn: STYLE_NORMAL,
        paragraph: {
          spacing: buildSpacing(theme, "tableCell", { before: 0, after: theme.spacing.tableCellAfterPt }),
        },
      },
      {
        id: STYLE_LIST_CONTINUATION,
        name: "FreeFlow List Continuation",
        basedOn: STYLE_NORMAL,
        paragraph: {
          spacing: buildSpacing(theme, "list", { before: 0, after: theme.spacing.listBlockAfterPt }),
        },
      },
    ],
  };
}

function createNumberingConfig() {
  const bulletSymbols = ["•", "◦", "▪", "•", "◦", "▪", "•", "◦", "▪"];
  return {
    config: [
      {
        reference: "freeflow-ordered-list",
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.LEFT,
          suffix: LevelSuffix.TAB,
          style: {
            paragraph: {
              indent: {
                left: normalizeIndentTwip(720 + normalizeListDepth(level) * 360),
                hanging: normalizeIndentTwip(360),
              },
            },
          },
        })),
      },
      {
        reference: "freeflow-bullet-list",
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: LevelFormat.BULLET,
          text: bulletSymbols[level] || "•",
          alignment: AlignmentType.LEFT,
          suffix: LevelSuffix.TAB,
          style: {
            paragraph: {
              indent: {
                left: normalizeIndentTwip(720 + normalizeListDepth(level) * 360),
                hanging: normalizeIndentTwip(360),
              },
            },
            run: {
              font: "Symbol",
            },
          },
        })),
      },
    ],
  };
}

function createCompilerState(ast, theme) {
  const footnoteMap = new Map();
  (Array.isArray(ast.footnotes) ? ast.footnotes : []).forEach((entry, index) => {
    const refId = String(entry?.id || "").trim();
    if (!refId || footnoteMap.has(refId)) {
      return;
    }
    footnoteMap.set(refId, {
      number: index + 1,
      entry,
    });
  });
  return {
    theme,
    footnoteMap,
  };
}

function hasOwnContent(value) {
  return value != null && value !== "";
}

function removeUndefinedFields(input = {}) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function buildBodyRunOptions(theme, overrides = {}) {
  return removeUndefinedFields({
    font: buildFontAttributes(theme, theme.defaultFont, { eastAsiaFont: theme.eastAsiaFont }),
    size: ptToHalfPoints(theme.typography.bodyPt, 24),
    color: theme.baseColor,
    ...overrides,
  });
}

function buildHeadingRunOptions(theme, level = 1, overrides = {}) {
  const normalizedLevel = toInteger(level, 1, { min: 1, max: 6 });
  return removeUndefinedFields({
    font: buildFontAttributes(theme, theme.headingFont, { eastAsiaFont: theme.eastAsiaHeadingFont }),
    size: ptToHalfPoints(theme.typography.headingPts[normalizedLevel - 1]),
    color: theme.baseColor,
    bold: true,
    ...overrides,
  });
}

function buildParagraphBaseRunOptions(theme, context = {}) {
  const overrides = {};
  if (context.quoteDepth > 0) {
    overrides.color = theme.quoteTextColor;
  }
  if (context.preferredParagraphStyle === STYLE_TABLE_HEADER) {
    overrides.bold = true;
  }
  return buildBodyRunOptions(theme, overrides);
}

function buildRunOptionsForMarks(marks = [], theme, overrides = {}) {
  const options = { ...overrides };
  (Array.isArray(marks) ? marks : []).forEach((mark) => {
    if (!mark || typeof mark !== "object") {
      return;
    }
    if (mark.type === "bold") {
      options.bold = true;
      return;
    }
    if (mark.type === "italic") {
      options.italics = true;
      return;
    }
    if (mark.type === "underline") {
      options.underline = { type: UnderlineType.SINGLE };
      return;
    }
    if (mark.type === "strike") {
      options.strike = true;
      return;
    }
    if (mark.type === "code") {
      options.font = buildFontAttributes(theme, theme.codeFont, { eastAsiaFont: theme.codeEastAsiaFont });
      options.size = ptToHalfPoints(theme.typography.inlineCodePt);
      options.color = options.color || "0F172A";
      options.shading = {
        type: ShadingType.CLEAR,
        fill: "F1F5F9",
        color: "auto",
      };
      return;
    }
    if (mark.type === "textColor") {
      const color = normalizeHexColor(mark.color, "");
      if (color) {
        options.color = color;
      }
      return;
    }
    if (mark.type === "highlight") {
      const color = normalizeHexColor(mark.color, "");
      if (color) {
        options.highlight = mapHighlightColor(color);
      }
      return;
    }
    if (mark.type === "backgroundColor") {
      const color = normalizeHexColor(mark.color, "");
      if (color) {
        options.shading = {
          type: ShadingType.CLEAR,
          fill: color,
          color: "auto",
        };
      }
    }
  });
  return options;
}

const LATEX_SYMBOLS = Object.freeze({
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  varpi: "ϖ",
  rho: "ρ",
  varrho: "ϱ",
  sigma: "σ",
  varsigma: "ς",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  partial: "∂",
  nabla: "∇",
  infty: "∞",
  infinity: "∞",
  pm: "±",
  mp: "∓",
  times: "×",
  div: "÷",
  cdot: "·",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  sim: "∼",
  equiv: "≡",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  supset: "⊃",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  forall: "∀",
  exists: "∃",
  degree: "°",
});

const LATEX_FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "log",
  "ln",
  "lim",
  "min",
  "max",
  "rank",
  "det",
  "dim",
  "ker",
  "Pr",
]);

function normalizeLatexForWord(value = "") {
  return String(value || "")
    .trim()
    .replace(/^\${1,2}/, "")
    .replace(/\${1,2}$/, "")
    .replace(/\\limits\b/g, "")
    .replace(/\\mathrm\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\boldsymbol\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\mathbf\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\text\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\operatorname\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\:/g, " ")
    .replace(/\\!/g, "");
}

function parseLatexToWordMathChildren(latex = "") {
  const source = normalizeLatexForWord(latex);
  if (!source) {
    return null;
  }

  let index = 0;
  function eof() {
    return index >= source.length;
  }
  function peek() {
    return source[index] || "";
  }
  function consume() {
    const char = source[index] || "";
    index += 1;
    return char;
  }
  function skipWhitespace() {
    while (!eof() && /\s/.test(peek())) {
      index += 1;
    }
  }
  function readCommand() {
    if (peek() !== "\\") {
      return "";
    }
    consume();
    let name = "";
    while (!eof() && /[A-Za-z]/.test(peek())) {
      name += consume();
    }
    if (!name && !eof()) {
      name = consume();
    }
    return name;
  }
  function readGroup(stopChar = "}") {
    skipWhitespace();
    if (peek() !== "{") {
      return parseAtom();
    }
    consume();
    const children = parseExpression(new Set([stopChar]));
    if (peek() === stopChar) {
      consume();
    }
    return children;
  }
  function readOptionalGroup() {
    skipWhitespace();
    if (peek() !== "[") {
      return null;
    }
    consume();
    const children = parseExpression(new Set(["]"]));
    if (peek() === "]") {
      consume();
    }
    return children;
  }
  function mergeRuns(children = []) {
    const merged = [];
    children.forEach((child) => {
      if (!child) {
        return;
      }
      merged.push(child);
    });
    return merged;
  }
  function textRun(text = "") {
    const value = String(text || "");
    return value ? new MathRun(value) : null;
  }
  function parseCommandAtom(command) {
    if (command === "frac" || command === "dfrac" || command === "tfrac") {
      const numerator = readGroup();
      const denominator = readGroup();
      return [new MathFraction({ numerator, denominator })];
    }
    if (command === "sqrt") {
      const degree = readOptionalGroup();
      const children = readGroup();
      return [new MathRadical({ degree: degree || undefined, children })];
    }
    if (command === "sum") {
      return [new MathSum({ children: [textRun(" ")].filter(Boolean) })];
    }
    if (command === "prod") {
      return [textRun("∏")].filter(Boolean);
    }
    if (command === "int") {
      return [new MathIntegral({ children: [textRun(" ")].filter(Boolean) })];
    }
    if (LATEX_FUNCTIONS.has(command)) {
      return [new MathFunction({ name: [textRun(command)].filter(Boolean), children: [textRun(" ")].filter(Boolean) })];
    }
    if (command === "left") {
      const open = consume();
      const closeToken = "\\right";
      const start = index;
      const closeIndex = source.indexOf(closeToken, index);
      if (closeIndex >= 0) {
        const innerSource = source.slice(start, closeIndex);
        index = closeIndex + closeToken.length;
        const close = consume();
        const inner = parseLatexToWordMathChildren(innerSource) || [textRun(innerSource)].filter(Boolean);
        if (open === "(" && close === ")") {
          return [new MathRoundBrackets({ children: inner })];
        }
        if (open === "[" && close === "]") {
          return [new MathSquareBrackets({ children: inner })];
        }
        return [textRun(open), ...inner, textRun(close)].filter(Boolean);
      }
      return [textRun(open)].filter(Boolean);
    }
    if (command === "right") {
      return [];
    }
    if (LATEX_SYMBOLS[command]) {
      return [textRun(LATEX_SYMBOLS[command])].filter(Boolean);
    }
    return [textRun(command)].filter(Boolean);
  }
  function attachScripts(baseChildren) {
    let base = baseChildren;
    let subScript = null;
    let superScript = null;
    let changed = false;
    while (!eof()) {
      skipWhitespace();
      const char = peek();
      if (char !== "_" && char !== "^") {
        break;
      }
      consume();
      const script = readGroup();
      if (char === "_") {
        subScript = script;
      } else {
        superScript = script;
      }
      changed = true;
    }
    if (!changed) {
      return base;
    }
    const safeBase = base && base.length ? base : [textRun(" ")].filter(Boolean);
    if (safeBase.length === 1 && safeBase[0] instanceof MathSum) {
      return [new MathSum({ children: [textRun(" ")].filter(Boolean), subScript, superScript })];
    }
    if (safeBase.length === 1 && safeBase[0] instanceof MathIntegral) {
      return [new MathIntegral({ children: [textRun(" ")].filter(Boolean), subScript, superScript })];
    }
    if (subScript && superScript) {
      return [new MathSubSuperScript({ children: safeBase, subScript, superScript })];
    }
    if (subScript) {
      return [new MathSubScript({ children: safeBase, subScript })];
    }
    return [new MathSuperScript({ children: safeBase, superScript })];
  }
  function parseAtom() {
    skipWhitespace();
    if (eof()) {
      return [];
    }
    const char = peek();
    if (char === "{") {
      return readGroup();
    }
    if (char === "(") {
      consume();
      const children = parseExpression(new Set([")"]));
      if (peek() === ")") {
        consume();
      }
      return [new MathRoundBrackets({ children })];
    }
    if (char === "[") {
      consume();
      const children = parseExpression(new Set(["]"]));
      if (peek() === "]") {
        consume();
      }
      return [new MathSquareBrackets({ children })];
    }
    if (char === "\\") {
      return parseCommandAtom(readCommand());
    }
    return [textRun(consume())].filter(Boolean);
  }
  function parseExpression(stops = new Set()) {
    const children = [];
    while (!eof() && !stops.has(peek())) {
      const atom = parseAtom();
      const scripted = attachScripts(atom);
      children.push(...scripted);
    }
    return mergeRuns(children);
  }

  try {
    const children = parseExpression();
    return children.length ? children : null;
  } catch (_error) {
    return null;
  }
}

function buildWordMath(latex = "") {
  const children = parseLatexToWordMathChildren(latex);
  return children && children.length ? new DocxMath({ children }) : null;
}

function compileInlineNodes(nodes = [], state, inlineContext = {}) {
  const theme = state.theme;
  const inheritedMarks = Array.isArray(inlineContext.marks) ? inlineContext.marks : [];
  const baseRunOptions = inlineContext.baseRunOptions && typeof inlineContext.baseRunOptions === "object"
    ? inlineContext.baseRunOptions
    : {};
  return (Array.isArray(nodes) ? nodes : []).map((node) => {
    if (!node || typeof node !== "object") {
      return null;
    }
    if (node.type === "text") {
      const text = String(node.text || "");
      if (!text) {
        return null;
      }
      const runOptions = removeUndefinedFields({
        text,
        ...baseRunOptions,
        ...buildRunOptionsForMarks(
          inheritedMarks.concat(Array.isArray(node.marks) ? node.marks : []),
          theme,
          inlineContext.runOverrides || {}
        ),
      });
      return new TextRun(runOptions);
    }
    if (node.type === "break") {
      return new TextRun({ break: 1 });
    }
    if (node.type === "inlineCode") {
      return new TextRun({
        text: String(node.text || ""),
        font: buildFontAttributes(theme, theme.codeFont, { eastAsiaFont: theme.codeEastAsiaFont }),
        color: "0F172A",
        size: ptToHalfPoints(theme.typography.inlineCodePt),
        shading: {
          type: ShadingType.CLEAR,
          fill: "F1F5F9",
          color: "auto",
        },
      });
    }
    if (node.type === "mathInline") {
      const math = buildWordMath(node.latex || "");
      if (math) {
        return math;
      }
      return new TextRun({
        text: `$${String(node.latex || "").trim()}$`,
        font: buildFontAttributes(theme, theme.mathFont),
        italics: true,
        size: ptToHalfPoints(theme.typography.bodyPt, 24),
      });
    }
    if (node.type === "footnoteRef") {
      const refId = String(node.refId || "").trim();
      const footnote = state.footnoteMap.get(refId);
      if (!footnote) {
        return new TextRun({
          text: `[${refId}]`,
          superScript: true,
          size: ptToHalfPoints(theme.typography.footnotePt),
        });
      }
      return new FootnoteReferenceRun(footnote.number);
    }
    if (node.type === "image") {
      const altText = String(node.alt || node.title || node.src || "图片").trim();
      return new TextRun({
        text: `[图片：${altText}]`,
        italics: true,
        color: "64748B",
      });
    }
    if (node.type === "link") {
      const href = String(node.href || "").trim();
      const linkChildren = compileInlineNodes(node.children || [], state, {
        ...inlineContext,
        baseRunOptions,
        runOverrides: {
          ...(inlineContext.runOverrides || {}),
          underline: { type: UnderlineType.SINGLE },
          color: theme.linkColor,
        },
      }).filter(Boolean);
      if (!href) {
        return linkChildren;
      }
      return new ExternalHyperlink({
        link: href,
        children: linkChildren.length ? linkChildren : [new TextRun({ text: href, color: theme.linkColor })],
      });
    }
    return null;
  }).flat().filter(Boolean);
}

function compileParagraphNode(node, state, context = {}) {
  const theme = state.theme;
  const runs = compileInlineNodes(node.children || [], state, {
    marks: [],
    baseRunOptions: buildParagraphBaseRunOptions(theme, context),
  });
  const spacingKind = context.inTableCell ? "tableCell" : context.inList ? "list" : context.quoteDepth > 0 ? "quote" : "body";
  return new Paragraph({
    children: runs.length ? runs : [new TextRun("")],
    alignment: mapAlignment(node.align || context.preferredAlignment || "left"),
    style: context.preferredParagraphStyle || (context.quoteDepth > 0 ? STYLE_BLOCK_QUOTE : STYLE_NORMAL),
    spacing: buildSpacing(theme, spacingKind),
    indent: buildParagraphIndent(context.indentTwip),
  });
}

function compileHeadingNode(node, state, context = {}) {
  const level = toInteger(node.level, 1, { min: 1, max: 6 });
  const headingMap = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
  };
  const headingRunOptions = buildHeadingRunOptions(state.theme, level, context.quoteDepth > 0 ? { color: state.theme.quoteTextColor } : {});
  return new Paragraph({
    children: compileInlineNodes(node.children || [], state, {
      baseRunOptions: headingRunOptions,
    }),
    alignment: mapAlignment(node.align || "left"),
    heading: headingMap[level] || HeadingLevel.HEADING_1,
    style: context.quoteDepth > 0 ? STYLE_BLOCK_QUOTE : undefined,
    spacing: buildSpacing(
      state.theme,
      context.quoteDepth > 0 ? "quote" : "body",
      {
        before: state.theme.spacing.headingSpacingPts[level - 1],
        after: Math.max(2.5, state.theme.spacing.headingAfterPt - (level - 1) * 0.25),
      }
    ),
    indent: buildParagraphIndent(context.indentTwip),
  });
}

function compileMathBlockNode(node, state, context = {}) {
  const math = buildWordMath(node.latex || "");
  return new Paragraph({
    children: math
      ? [math]
      : [
          new TextRun({
            text: `$$${String(node.latex || "").trim()}$$`,
            font: buildFontAttributes(state.theme, state.theme.mathFont),
            italics: true,
          }),
        ],
    alignment: mapAlignment(node.align || "center"),
    style: STYLE_MATH_BLOCK,
    indent: buildParagraphIndent(context.indentTwip),
  });
}

function compileThematicBreakNode(state) {
  return new Paragraph({
    thematicBreak: true,
    spacing: buildSpacing(state.theme, "body", {
      before: state.theme.spacing.thematicBreakBeforePt,
      after: state.theme.spacing.thematicBreakAfterPt,
    }),
  });
}

function compileCodeBlockNode(node, state, context = {}) {
  const theme = state.theme;
  const codeLines = String(node.text || "").replace(/\r\n/g, "\n").split("\n");
  const children = [];
  const language = String(node.language || "").trim();
  if (language) {
    children.push(
      new Paragraph({
        text: language.toUpperCase(),
        style: STYLE_CODE_LABEL,
      })
    );
  }
  codeLines.forEach((line) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line || " ",
            font: buildFontAttributes(theme, theme.codeFont, { eastAsiaFont: theme.codeEastAsiaFont }),
            size: ptToHalfPoints(theme.typography.codePt),
            color: "0F172A",
          }),
        ],
        style: STYLE_CODE_LINE,
      })
    );
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: TableBorders.NONE,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: {
              type: ShadingType.CLEAR,
              fill: theme.codeBackgroundColor,
              color: "auto",
            },
            margins: {
              top: ptToTwip(theme.spacing.codeBlockBeforePt, 80),
              bottom: ptToTwip(theme.spacing.codeBlockAfterPt, 160),
              left: 140,
              right: 140,
            },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 6, color: theme.codeBorderColor },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: theme.codeBorderColor },
              left: { style: BorderStyle.SINGLE, size: 6, color: theme.codeBorderColor },
              right: { style: BorderStyle.SINGLE, size: 6, color: theme.codeBorderColor },
            },
            children,
          }),
        ],
      }),
    ],
    indent: buildTableIndent(context.indentTwip),
  });
}

function flattenInlineTextLength(nodes = []) {
  return (Array.isArray(nodes) ? nodes : []).reduce((total, node) => {
    if (!node || typeof node !== "object") {
      return total;
    }
    if (node.type === "text" || node.type === "inlineCode") {
      return total + String(node.text || "").length;
    }
    if (node.type === "mathInline") {
      return total + Math.max(4, String(node.latex || "").length);
    }
    if (node.type === "link") {
      return total + flattenInlineTextLength(node.children || []);
    }
    return total;
  }, 0);
}

function estimateTableCellTextLength(cell = null) {
  const blocks = Array.isArray(cell?.children) ? cell.children : [];
  const total = blocks.reduce((count, block) => {
    if (!block || typeof block !== "object") {
      return count;
    }
    if (block.type === "paragraph" || block.type === "heading") {
      return count + flattenInlineTextLength(block.children || []);
    }
    return count;
  }, 0);
  return Math.max(2, total);
}

function normalizeColumnWeights(weights = []) {
  const normalized = (Array.isArray(weights) ? weights : []).map((value) => Math.max(1, Number(value) || 1));
  const total = normalized.reduce((sum, value) => sum + value, 0) || 1;
  return normalized.map((value) => value / total);
}

function buildTableCellWidth(cell = null, normalizedColumnWeights = []) {
  const span = toInteger(cell?.colSpan, 1, { min: 1, max: 63 });
  const start = toInteger(cell?._columnStart, 0, { min: 0 });
  const ratio = normalizedColumnWeights
    .slice(start, start + span)
    .reduce((sum, value) => sum + (Number(value) || 0), 0);
  const fallbackRatio = 1 / Math.max(1, normalizedColumnWeights.length || 1);
  return {
    size: toInteger((ratio || fallbackRatio) * 100, 100, { min: 6, max: 100 }),
    type: WidthType.PERCENTAGE,
  };
}

function compileTableNode(node, state, context = {}) {
  const theme = state.theme;
  const columnWeights = [];
  (Array.isArray(node.rows) ? node.rows : []).forEach((row) => {
    let visualIndex = 0;
    (Array.isArray(row?.cells) ? row.cells : []).forEach((cell) => {
      const span = toInteger(cell?.colSpan, 1, { min: 1, max: 63 });
      const textLength = estimateTableCellTextLength(cell);
      const perColumnWeight = Math.max(1, Math.min(12, Math.ceil(textLength / span) || 1));
      for (let offset = 0; offset < span; offset += 1) {
        columnWeights[visualIndex + offset] = Math.max(columnWeights[visualIndex + offset] || 1, perColumnWeight);
      }
      visualIndex += span;
    });
  });
  const normalizedColumnWeights = normalizeColumnWeights(columnWeights);
  const rows = (Array.isArray(node.rows) ? node.rows : []).map((row) => {
    let visualIndex = 0;
    const cells = (Array.isArray(row.cells) ? row.cells : []).map((cell) => {
      const enrichedCell = {
        ...cell,
        _columnStart: visualIndex,
      };
      visualIndex += toInteger(cell?.colSpan, 1, { min: 1, max: 63 });
      return enrichedCell;
    });
    return new TableRow({
      tableHeader: row?.header === true,
      height: row?.header === true ? { value: ptToTwip(theme.table.headerMinHeightPt, 360) } : undefined,
      children: cells.map((cell) =>
        new TableCell({
          columnSpan: toInteger(cell?.colSpan, 1, { min: 1, max: 63 }),
          rowSpan: toInteger(cell?.rowSpan, 1, { min: 1, max: 63 }),
          verticalAlign: VerticalAlignTable.TOP,
          shading: cell?.header
            ? {
                type: ShadingType.CLEAR,
                fill: theme.tableHeaderBackgroundColor,
                color: "auto",
              }
            : undefined,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: theme.tableBorderColor },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: theme.tableBorderColor },
            left: { style: BorderStyle.SINGLE, size: 4, color: theme.tableBorderColor },
            right: { style: BorderStyle.SINGLE, size: 4, color: theme.tableBorderColor },
          },
          margins: {
            top: ptToTwip(theme.table.cellPaddingTopPt, 70),
            bottom: ptToTwip(theme.table.cellPaddingBottomPt, 70),
            left: ptToTwip(theme.table.cellPaddingLeftPt, 90),
            right: ptToTwip(theme.table.cellPaddingRightPt, 90),
          },
          width: buildTableCellWidth(cell, normalizedColumnWeights),
          children: compileBlocks(cell.children || [], state, {
            indentTwip: 0,
            quoteDepth: 0,
            inTableCell: true,
            preferredParagraphStyle: cell?.header ? STYLE_TABLE_HEADER : STYLE_TABLE_CELL,
            preferredAlignment: cell?.align || "left",
          }),
        })
      ),
    });
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: theme.tableBorderColor },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: theme.tableBorderColor },
      left: { style: BorderStyle.SINGLE, size: 4, color: theme.tableBorderColor },
      right: { style: BorderStyle.SINGLE, size: 4, color: theme.tableBorderColor },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: theme.tableBorderColor },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: theme.tableBorderColor },
    },
    rows: rows.length ? rows : [new TableRow({ children: [new TableCell({ children: [new Paragraph("")] })] })],
    indent: buildTableIndent(context.indentTwip),
  });
}

function compileListNode(node, state, context = {}, depth = 0) {
  const items = [];
  const listItems = Array.isArray(node.items) ? node.items : [];
  const currentDepth = normalizeListDepth(depth);
  const baseIndentTwip = normalizeIndentTwip(context.indentTwip, 0);
  listItems.forEach((item) => {
    const blocks = Array.isArray(item.children) ? item.children : [];
    if (!blocks.length) {
      return;
    }
    const [firstBlock, ...restBlocks] = blocks;
    if (firstBlock?.type === "paragraph") {
      const paragraphRuns = compileInlineNodes(firstBlock.children || [], state, {
        baseRunOptions: buildParagraphBaseRunOptions(state.theme, { ...context, inList: true }),
      });
      if (node.task) {
        const checkbox = item.checked ? "☑ " : "☐ ";
        items.push(
          new Paragraph({
            children: [
              new TextRun({
                text: checkbox,
                ...buildBodyRunOptions(state.theme, {
                  color: context.quoteDepth > 0 ? state.theme.quoteTextColor : state.theme.baseColor,
                }),
              }),
              ...paragraphRuns,
            ],
            alignment: mapAlignment(firstBlock.align || "left"),
            indent: buildParagraphIndent(baseIndentTwip + 720 + currentDepth * 360, { hanging: 360 }),
            spacing: buildSpacing(state.theme, "list"),
          })
        );
      } else {
        items.push(
          new Paragraph({
            children: paragraphRuns,
            alignment: mapAlignment(firstBlock.align || "left"),
            numbering: {
              reference: node.ordered ? "freeflow-ordered-list" : "freeflow-bullet-list",
              level: currentDepth,
            },
            spacing: buildSpacing(state.theme, "list"),
          })
        );
      }
    } else {
      items.push(...compileBlocks([firstBlock], state, {
        ...context,
        inList: true,
        indentTwip: baseIndentTwip + 720 + currentDepth * 360,
      }));
    }

    restBlocks.forEach((childBlock) => {
      if (childBlock?.type === "list") {
        items.push(...compileListNode(childBlock, state, { ...context, indentTwip: baseIndentTwip }, currentDepth + 1));
        return;
      }
      items.push(...compileBlocks([childBlock], state, {
        ...context,
        inList: true,
        preferredParagraphStyle: STYLE_LIST_CONTINUATION,
        indentTwip: baseIndentTwip + 1080 + currentDepth * 360,
      }));
    });
  });
  return items;
}

function compileBlockquoteNode(node, state, context = {}) {
  return compileBlocks(node.children || [], state, {
    ...context,
    quoteDepth: (context.quoteDepth || 0) + 1,
    indentTwip: normalizeIndentTwip(context.indentTwip, 0),
  });
}

function compileBlocks(nodes = [], state, context = {}) {
  const result = [];
  (Array.isArray(nodes) ? nodes : []).forEach((node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.type === "paragraph") {
      result.push(compileParagraphNode(node, state, context));
      return;
    }
    if (node.type === "heading") {
      result.push(compileHeadingNode(node, state, context));
      return;
    }
    if (node.type === "list") {
      result.push(...compileListNode(node, state, context, 0));
      return;
    }
    if (node.type === "blockquote") {
      result.push(...compileBlockquoteNode(node, state, context));
      return;
    }
    if (node.type === "codeBlock") {
      result.push(compileCodeBlockNode(node, state, context));
      return;
    }
    if (node.type === "table") {
      result.push(compileTableNode(node, state, context));
      return;
    }
    if (node.type === "mathBlock") {
      result.push(compileMathBlockNode(node, state, context));
      return;
    }
    if (node.type === "thematicBreak") {
      result.push(compileThematicBreakNode(state));
      return;
    }
  });
  return result;
}

function compileFootnotes(ast, state) {
  const output = {};
  state.footnoteMap.forEach((entry, refId) => {
    output[String(entry.number)] = {
      children: compileBlocks(entry.entry.children || [], state, {}),
    };
  });
  return output;
}

function buildSectionOptions(astSection = {}, theme, state) {
  return {
    properties: {
      page: {
        size: {
          width: mmToTwip(theme.page.widthMm, convertMillimetersToTwip(210)),
          height: mmToTwip(theme.page.heightMm, convertMillimetersToTwip(297)),
          orientation: PageOrientation.PORTRAIT,
        },
        margin: {
          top: mmToTwip(theme.page.marginTopMm, convertMillimetersToTwip(25.4)),
          right: mmToTwip(theme.page.marginRightMm, convertMillimetersToTwip(25.4)),
          bottom: mmToTwip(theme.page.marginBottomMm, convertMillimetersToTwip(25.4)),
          left: mmToTwip(theme.page.marginLeftMm, convertMillimetersToTwip(25.4)),
          header: mmToTwip(theme.page.headerMm, convertMillimetersToTwip(12.7)),
          footer: mmToTwip(theme.page.footerMm, convertMillimetersToTwip(12.7)),
          gutter: 0,
        },
      },
    },
    children: compileBlocks(astSection.children || [], state, {}),
  };
}

function normalizeAst(ast = null) {
  if (!ast || typeof ast !== "object") {
    throw new Error("Word 导出失败：导出 AST 无效");
  }
  if (String(ast.kind || "").trim() !== AST_KIND) {
    throw new Error("Word 导出失败：导出 AST 类型不匹配");
  }
  if (Number(ast.version || 0) !== AST_VERSION) {
    throw new Error("Word 导出失败：导出 AST 版本不兼容");
  }
  if (!Array.isArray(ast.sections) || !ast.sections.length) {
    throw new Error("Word 导出失败：导出内容为空");
  }
  return ast;
}

function buildThemeXml(theme) {
  const majorLatin = theme.headingFont || theme.defaultFont || "Arial";
  const minorLatin = theme.defaultFont || "Arial";
  const majorEastAsia = theme.eastAsiaHeadingFont || theme.eastAsiaFont || "Microsoft YaHei";
  const minorEastAsia = theme.eastAsiaFont || "SimSun";
  const majorComplex = majorLatin;
  const minorComplex = minorLatin;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="FreeFlow Theme">
  <a:themeElements>
    <a:clrScheme name="FreeFlow Colors">
      <a:dk1><a:srgbClr val="111827"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F2937"/></a:dk2>
      <a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="2563EB"/></a:accent1>
      <a:accent2><a:srgbClr val="0EA5E9"/></a:accent2>
      <a:accent3><a:srgbClr val="16A34A"/></a:accent3>
      <a:accent4><a:srgbClr val="F97316"/></a:accent4>
      <a:accent5><a:srgbClr val="7C3AED"/></a:accent5>
      <a:accent6><a:srgbClr val="DB2777"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink>
      <a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="FreeFlow Fonts">
      <a:majorFont>
        <a:latin typeface="${majorLatin}"/>
        <a:ea typeface="${majorEastAsia}"/>
        <a:cs typeface="${majorComplex}"/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="${minorLatin}"/>
        <a:ea typeface="${minorEastAsia}"/>
        <a:cs typeface="${minorComplex}"/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="FreeFlow Format">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs>
            <a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="16200000" scaled="1"/>
        </a:gradFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:shade val="51000"/><a:satMod val="130000"/></a:schemeClr></a:gs>
            <a:gs pos="80000"><a:schemeClr val="phClr"><a:shade val="93000"/><a:satMod val="130000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="94000"/><a:satMod val="135000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="16200000" scaled="0"/>
        </a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/><a:lumMod val="102000"/></a:schemeClr></a:gs>
            <a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/><a:lumMod val="103000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path>
        </a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>`;
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default ContentType="image/png" Extension="png"/>
  <Default ContentType="image/jpeg" Extension="jpeg"/>
  <Default ContentType="image/jpeg" Extension="jpg"/>
  <Default ContentType="image/bmp" Extension="bmp"/>
  <Default ContentType="image/gif" Extension="gif"/>
  <Default ContentType="image/svg+xml" Extension="svg"/>
  <Default ContentType="application/vnd.openxmlformats-package.relationships+xml" Extension="rels"/>
  <Default ContentType="application/xml" Extension="xml"/>
  <Default ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont" Extension="odttf"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" PartName="/word/document.xml"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml" PartName="/word/styles.xml"/>
  <Override ContentType="application/vnd.openxmlformats-package.core-properties+xml" PartName="/docProps/core.xml"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml" PartName="/docProps/custom.xml"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml" PartName="/docProps/app.xml"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml" PartName="/word/numbering.xml"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml" PartName="/word/footnotes.xml"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml" PartName="/word/settings.xml"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml" PartName="/word/comments.xml"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml" PartName="/word/fontTable.xml"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.theme+xml" PartName="/word/theme/theme1.xml"/>
</Types>`;
}

function buildSettingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 wp14">
  <w:displayBackgroundShape/>
  <w:themeFontLang w:val="en-US" w:eastAsia="zh-CN" w:bidi="ar-SA"/>
  <w:evenAndOddHeaders w:val="false"/>
  <w:compat>
    <w:compatSetting w:val="15" w:uri="http://schemas.microsoft.com/office/word" w:name="compatibilityMode"/>
  </w:compat>
</w:settings>`;
}

function buildWordPackageOverrides(doc, theme) {
  const themeRelationshipId = Number(doc?.Document?.Relationships?.RelationshipCount || 0) + 1;
  doc?.Document?.Relationships?.createRelationship?.(
    themeRelationshipId,
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme",
    "theme/theme1.xml"
  );
  return [
    {
      path: "word/theme/theme1.xml",
      data: buildThemeXml(theme),
    },
    {
      path: "[Content_Types].xml",
      data: buildContentTypesXml(),
    },
    {
      path: "word/settings.xml",
      data: buildSettingsXml(),
    },
  ];
}

async function compileWordExportAstToDocxBuffer(ast) {
  const normalizedAst = normalizeAst(ast);
  const theme = normalizeTheme(normalizedAst);
  const state = createCompilerState(normalizedAst, theme);
  const doc = new Document({
    title: String(normalizedAst?.meta?.title || "文本").trim() || "文本",
    creator: String(normalizedAst?.meta?.creator || "FreeFlow").trim() || "FreeFlow",
    lastModifiedBy: String(normalizedAst?.meta?.lastModifiedBy || "FreeFlow").trim() || "FreeFlow",
    styles: createDocumentStyles(theme),
    numbering: createNumberingConfig(),
    footnotes: compileFootnotes(normalizedAst, state),
    sections: normalizedAst.sections.map((section) => buildSectionOptions(section, theme, state)),
  });
  return Packer.toBuffer(doc, false, buildWordPackageOverrides(doc, theme));
}

module.exports = {
  compileWordExportAstToDocxBuffer,
};
