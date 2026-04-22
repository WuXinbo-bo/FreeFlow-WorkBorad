import {
  INPUT_CHANNELS,
  INPUT_ENTRY_KINDS,
  INPUT_SOURCE_KINDS,
} from "../../protocols/inputDescriptor.js";
import { createCanonicalDocument, createCanonicalNode } from "../../canonical/canonicalDocument.js";
import { detectTextContentType, DETECTED_TEXT_TYPES } from "../../gateway/contentTypeDetector.js";

export const MARKDOWN_PARSER_ID = "markdown-parser";

export function createMarkdownParser(options = {}) {
  const id = options.id || MARKDOWN_PARSER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 35;

  return {
    id,
    version: "1.0.0",
    displayName: "Markdown / GFM Parser",
    priority,
    sourceKinds: [
      INPUT_SOURCE_KINDS.MARKDOWN,
      INPUT_SOURCE_KINDS.MIXED,
      INPUT_SOURCE_KINDS.UNKNOWN,
    ],
    channels: [
      INPUT_CHANNELS.PASTE_NATIVE,
      INPUT_CHANNELS.PASTE_CONTEXT_MENU,
      INPUT_CHANNELS.DRAG_DROP,
      INPUT_CHANNELS.PROGRAMMATIC,
      INPUT_CHANNELS.INTERNAL_COPY,
    ],
    tags: ["builtin", "markdown", "gfm"],
    supports({ descriptor }) {
      const markdownEntries = collectMarkdownEntries(descriptor);
      if (!markdownEntries.length) {
        return { matched: false, score: -1, reason: "no-markdown-entry" };
      }
      let score = 30;
      if (markdownEntries.some((entry) => looksLikeGfm(String(entry?.raw?.markdown || "")))) {
        score += 10;
      }
      return {
        matched: true,
        score,
        reason: "markdown-entry-available",
      };
    },
    async parse({ descriptor }) {
      const markdownEntries = collectMarkdownEntries(descriptor);
      if (!markdownEntries.length) {
        throw new Error("Markdown parser requires at least one markdown entry.");
      }

      const blocks = [];
      const stats = {
        sourceEntryCount: markdownEntries.length,
        headingCount: 0,
        listCount: 0,
        taskListCount: 0,
        tableCount: 0,
        codeBlockCount: 0,
        blockquoteCount: 0,
        footnoteCount: 0,
        mathBlockCount: 0,
        paragraphCount: 0,
      };

      markdownEntries.forEach((entry, index) => {
        const markdown = normalizeMarkdown(String(entry?.raw?.markdown || ""));
        if (!markdown.trim()) {
          return;
        }
        const parsed = parseMarkdownBlocks(markdown, {
          descriptor,
          parserId: id,
          originPrefix: `md-entry-${index}`,
          stats,
        });
        blocks.push(...parsed);
      });

      const document = createCanonicalDocument({
        meta: buildDocumentMeta(descriptor, id, ["markdown", "gfm"]),
        content: blocks,
      });

      stats.paragraphCount = document.content.filter((node) => node.type === "paragraph").length;

      return {
        document,
        stats,
      };
    },
  };
}

function collectMarkdownEntries(descriptor) {
  const entries = Array.isArray(descriptor?.entries) ? descriptor.entries : [];
  return entries.filter((entry) => {
    const kind = String(entry?.kind || "");
    return kind === INPUT_ENTRY_KINDS.MARKDOWN && typeof entry?.raw?.markdown === "string" && entry.raw.markdown.trim();
  });
}

function looksLikeGfm(markdown) {
  const value = String(markdown || "");
  return (
    /^\s*[-*+]\s+\[[ xX]\]\s+/m.test(value) ||
    /^\|.+\|\s*$/m.test(value) ||
    /^\[\^[^\]]+\]:/m.test(value) ||
    /^```/m.test(value)
  );
}

function buildDocumentMeta(descriptor, parserId, tags = []) {
  return {
    source: {
      kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.MARKDOWN,
      channel: descriptor?.channel || "",
      parserId,
      descriptorId: descriptor?.descriptorId || "",
    },
    compat: {
      minReaderVersion: "1.0.0",
      featureFlags: [],
      legacyAliases: [],
    },
    tags,
    labels: [],
  };
}

function buildNodeMeta(descriptor, parserId, originId, legacyType = "") {
  return {
    source: {
      kind: descriptor?.sourceKind || INPUT_SOURCE_KINDS.MARKDOWN,
      channel: descriptor?.channel || "",
      parserId,
      descriptorId: descriptor?.descriptorId || "",
    },
    compat: {
      minReaderVersion: "1.0.0",
      featureFlags: [],
      legacyAliases: [],
    },
    originId,
    legacyType,
  };
}

function normalizeMarkdown(markdown) {
  return String(markdown || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseMarkdownBlocks(markdown, context) {
  const { body, footnotes } = extractFootnotes(markdown);
  const lines = body.split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    if (!String(lines[index] || "").trim()) {
      index += 1;
      continue;
    }

    const headingMatch = lines[index].match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      context.stats.headingCount += 1;
      blocks.push(
        createCanonicalNode({
          type: "heading",
          attrs: { level: headingMatch[1].length },
          meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-heading-${index}`, "markdown-heading"),
          content: parseInlineMarkdown(headingMatch[2], context),
        })
      );
      index += 1;
      continue;
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(lines[index])) {
      blocks.push(
        createCanonicalNode({
          type: "horizontalRule",
          meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-hr-${index}`, "markdown-hr"),
        })
      );
      index += 1;
      continue;
    }

    if (/^\s*\$\$\s*$/.test(lines[index])) {
      const result = parseMathBlock(lines, index, context);
      blocks.push(result.node);
      context.stats.mathBlockCount += 1;
      index = result.nextIndex;
      continue;
    }
    if (/^\s*\\\[\s*$/.test(lines[index])) {
      const result = parseBracketMathBlock(lines, index, context);
      blocks.push(result.node);
      context.stats.mathBlockCount += 1;
      index = result.nextIndex;
      continue;
    }

    if (/^\s*(?:```|''')/.test(lines[index])) {
      const result = parseCodeFence(lines, index, context);
      blocks.push(...result.nodes);
      if (result.isCodeBlock) {
        context.stats.codeBlockCount += 1;
      }
      index = result.nextIndex;
      continue;
    }

    if (/^\s*>/.test(lines[index])) {
      const result = parseBlockquote(lines, index, context);
      blocks.push(result.node);
      context.stats.blockquoteCount += 1;
      index = result.nextIndex;
      continue;
    }

    if (isTableStart(lines, index)) {
      const result = parseTable(lines, index, context);
      blocks.push(result.node);
      context.stats.tableCount += 1;
      index = result.nextIndex;
      continue;
    }

    if (isListItem(lines[index])) {
      const result = parseList(lines, index, context);
      blocks.push(result.node);
      context.stats.listCount += 1;
      if (result.node.type === "taskList") {
        context.stats.taskListCount += 1;
      }
      index = result.nextIndex;
      continue;
    }

    const result = parseParagraph(lines, index, context);
    blocks.push(result.node);
    index = result.nextIndex;
  }

  footnotes.forEach((footnote, footnoteIndex) => {
    blocks.push(
      createCanonicalNode({
        type: "footnote",
        attrs: { id: footnote.id },
        meta: buildNodeMeta(
          context.descriptor,
          context.parserId,
          `${context.originPrefix}-footnote-${footnoteIndex}`,
          "markdown-footnote"
        ),
        content: parseMarkdownBlocks(footnote.content, {
          ...context,
          originPrefix: `${context.originPrefix}-footnote-${footnote.id}`,
          stats: context.stats,
        }),
      })
    );
    context.stats.footnoteCount += 1;
  });

  return blocks;
}

function extractFootnotes(markdown) {
  const lines = normalizeMarkdown(markdown).split("\n");
  const body = [];
  const footnotes = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (!match) {
      body.push(line);
      continue;
    }
    const id = match[1];
    const contentLines = [match[2] || ""];
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      if (/^( {2,}|\t)/.test(next)) {
        contentLines.push(next.replace(/^( {2,}|\t)/, ""));
        index += 1;
        continue;
      }
      if (!next.trim()) {
        contentLines.push("");
        index += 1;
        continue;
      }
      index -= 1;
      break;
    }
    footnotes.push({
      id,
      content: contentLines.join("\n").trim(),
    });
  }

  return {
    body: body.join("\n"),
    footnotes,
  };
}

function parseMathBlock(lines, startIndex, context) {
  const content = [];
  let index = startIndex + 1;
  while (index < lines.length && !/^\s*\$\$\s*$/.test(lines[index])) {
    content.push(lines[index]);
    index += 1;
  }
  const node = createCanonicalNode({
    type: "mathBlock",
    attrs: {
      sourceFormat: "latex",
      displayMode: true,
    },
    text: content.join("\n"),
    meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-math-${startIndex}`, "markdown-math-block"),
  });
  return {
    node,
    nextIndex: index < lines.length ? index + 1 : index,
  };
}

function parseBracketMathBlock(lines, startIndex, context) {
  const content = [];
  let index = startIndex + 1;
  while (index < lines.length && !/^\s*\\\]\s*$/.test(lines[index])) {
    content.push(lines[index]);
    index += 1;
  }
  const node = createCanonicalNode({
    type: "mathBlock",
    attrs: {
      sourceFormat: "latex",
      displayMode: true,
    },
    text: content.join("\n"),
    meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-math-bracket-${startIndex}`, "markdown-math-block"),
  });
  return {
    node,
    nextIndex: index < lines.length ? index + 1 : index,
  };
}

function parseCodeFence(lines, startIndex, context) {
  const open = String(lines[startIndex] || "").match(/^\s*(```|''')([\w+-]*)\s*$/);
  const fence = String(open?.[1] || "```");
  const language = String(open?.[2] || "").trim().toLowerCase();
  const content = [];
  let index = startIndex + 1;
  while (index < lines.length) {
    const trimmed = String(lines[index] || "").trim();
    if (trimmed === fence) {
      break;
    }
    content.push(lines[index]);
    index += 1;
  }
  const body = content.join("\n");
  if (shouldDowngradeFenceToMarkdown(language, body)) {
    const nodes = parseMarkdownBlocks(body, {
      ...context,
      originPrefix: `${context.originPrefix}-fence-downgraded-${startIndex}`,
    });
    return {
      nodes: nodes.length
        ? nodes
        : [
            createCanonicalNode({
              type: "paragraph",
              meta: buildNodeMeta(
                context.descriptor,
                context.parserId,
                `${context.originPrefix}-fence-downgraded-${startIndex}-paragraph`,
                "markdown-fence-downgraded"
              ),
              content: parseInlineMarkdown(body, context),
            }),
          ],
      nextIndex: index < lines.length ? index + 1 : index,
      isCodeBlock: false,
    };
  }
  const node = createCanonicalNode({
    type: "codeBlock",
    attrs: language ? { language } : {},
    text: body,
    meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-code-${startIndex}`, "markdown-code-fence"),
  });
  return {
    nodes: [node],
    nextIndex: index < lines.length ? index + 1 : index,
    isCodeBlock: true,
  };
}

function shouldDowngradeFenceToMarkdown(language, text) {
  const normalizedLanguage = String(language || "").trim().toLowerCase();
  // Explicit fenced code blocks should remain code blocks by default.
  // Only explicitly-marked markdown fences are candidates for downgrade.
  const markdownLikeLanguage =
    normalizedLanguage === "markdown" ||
    normalizedLanguage === "md" ||
    normalizedLanguage === "mdx" ||
    normalizedLanguage === "gfm";
  if (!markdownLikeLanguage) {
    return false;
  }
  const source = String(text || "").trim();
  if (!source) {
    return true;
  }
  const detected = detectTextContentType(source);
  return detected?.type !== DETECTED_TEXT_TYPES.CODE;
}

function parseBlockquote(lines, startIndex, context) {
  const quoteLines = [];
  let index = startIndex;
  while (index < lines.length && /^\s*>/.test(lines[index])) {
    quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
    index += 1;
  }
  const content = parseMarkdownBlocks(quoteLines.join("\n"), {
    ...context,
    originPrefix: `${context.originPrefix}-blockquote-${startIndex}`,
  });
  return {
    node: createCanonicalNode({
      type: "blockquote",
      meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-blockquote-${startIndex}`, "markdown-blockquote"),
      content,
    }),
    nextIndex: index,
  };
}

function parseTable(lines, startIndex, context) {
  const headerCells = splitTableRow(lines[startIndex]);
  const alignments = parseTableAlignment(lines[startIndex + 1]);
  const rows = [
    createCanonicalNode({
      type: "tableRow",
      meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-table-row-0`, "markdown-table-row"),
      content: headerCells.map((cell, index) =>
        createCanonicalNode({
          type: "tableCell",
          attrs: {
            colSpan: 1,
            rowSpan: 1,
            header: true,
            ...(alignments[index] ? { align: alignments[index] } : {}),
          },
          meta: buildNodeMeta(
            context.descriptor,
            context.parserId,
            `${context.originPrefix}-table-header-${index}`,
            "markdown-table-cell"
          ),
          content: [
            createCanonicalNode({
              type: "paragraph",
              content: parseInlineMarkdown(cell, context),
            }),
          ],
        })
      ),
    }),
  ];

  let index = startIndex + 2;
  let rowIndex = 1;
  while (index < lines.length && /^\s*\|?.+\|\s*$/.test(lines[index])) {
    const cells = splitTableRow(lines[index]);
    rows.push(
      createCanonicalNode({
        type: "tableRow",
        meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-table-row-${rowIndex}`, "markdown-table-row"),
        content: cells.map((cell, cellIndex) =>
          createCanonicalNode({
            type: "tableCell",
            attrs: {
              colSpan: 1,
              rowSpan: 1,
              header: false,
              ...(alignments[cellIndex] ? { align: alignments[cellIndex] } : {}),
            },
            meta: buildNodeMeta(
              context.descriptor,
              context.parserId,
              `${context.originPrefix}-table-cell-${rowIndex}-${cellIndex}`,
              "markdown-table-cell"
            ),
            content: [
              createCanonicalNode({
                type: "paragraph",
                content: parseInlineMarkdown(cell, context),
              }),
            ],
          })
        ),
      })
    );
    rowIndex += 1;
    index += 1;
  }

  return {
    node: createCanonicalNode({
      type: "table",
      attrs: { columns: headerCells.length },
      meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-table-${startIndex}`, "markdown-table"),
      content: rows,
    }),
    nextIndex: index,
  };
}

function parseTableAlignment(line) {
  return splitTableRow(line).map((cell) => {
    const trimmed = cell.trim();
    const left = trimmed.startsWith(":");
    const right = trimmed.endsWith(":");
    if (left && right) {
      return "center";
    }
    if (right) {
      return "right";
    }
    if (left) {
      return "left";
    }
    return "";
  });
}

function splitTableRow(line) {
  const trimmed = String(line || "").trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableStart(lines, index) {
  if (index + 1 >= lines.length) {
    return false;
  }
  if (!/\|/.test(lines[index]) || !/\|/.test(lines[index + 1])) {
    return false;
  }
  return /^\s*\|?[:\- ]+\|[:\-| ]+\s*$/.test(lines[index + 1]);
}

function parseList(lines, startIndex, context) {
  const first = parseListItemLine(lines[startIndex]);
  const isTask = first.task !== null;
  const isOrdered = first.ordered;
  const items = [];
  let index = startIndex;
  let itemIndex = 0;

  while (index < lines.length) {
    const parsed = parseListItemLine(lines[index]);
    if (!parsed) {
      break;
    }
    if (parsed.indent !== first.indent || parsed.ordered !== isOrdered || (parsed.task !== null) !== isTask) {
      break;
    }

    const bodyLines = [parsed.content];
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      if (!next.trim()) {
        const lookahead = findNextNonEmptyLine(lines, index + 1);
        if (
          lookahead &&
          countIndent(lookahead.line) <= first.indent &&
          !/^( {2,}|\t)/.test(lookahead.line) &&
          !isListItem(lookahead.line)
        ) {
          break;
        }
        bodyLines.push("");
        index += 1;
        continue;
      }
      const nextParsed = parseListItemLine(next);
      if (nextParsed && nextParsed.indent === first.indent) {
        break;
      }
      if (countIndent(next) <= first.indent && !/^( {2,}|\t)/.test(next)) {
        break;
      }
      bodyLines.push(stripListContinuationIndent(next, first.indent));
      index += 1;
    }

    const childContent = parseMarkdownBlocks(bodyLines.join("\n"), {
      ...context,
      originPrefix: `${context.originPrefix}-list-item-${itemIndex}`,
    });
    items.push(
      createCanonicalNode({
        type: isTask ? "taskItem" : "listItem",
        attrs: isTask ? { checked: Boolean(parsed.task) } : {},
        meta: buildNodeMeta(
          context.descriptor,
          context.parserId,
          `${context.originPrefix}-list-item-${itemIndex}`,
          isTask ? "markdown-task-item" : "markdown-list-item"
        ),
        content: childContent,
      })
    );
    itemIndex += 1;
  }

  return {
    node: createCanonicalNode({
      type: isTask ? "taskList" : isOrdered ? "orderedList" : "bulletList",
      attrs: isOrdered && first.start ? { start: first.start } : {},
      meta: buildNodeMeta(
        context.descriptor,
        context.parserId,
        `${context.originPrefix}-list-${startIndex}`,
        isTask ? "markdown-task-list" : isOrdered ? "markdown-ordered-list" : "markdown-bullet-list"
      ),
      content: items,
    }),
    nextIndex: index,
  };
}

function parseListItemLine(line) {
  const match = String(line || "").match(/^(\s*)([-+*]|\d+\.)\s+(.*)$/);
  if (!match) {
    return null;
  }
  const indent = countIndent(match[1] || "");
  const marker = match[2];
  const ordered = /\d+\./.test(marker);
  const taskMatch = String(match[3] || "").match(/^\[([ xX])\]\s+(.*)$/);
  return {
    indent,
    ordered,
    start: ordered ? Number.parseInt(marker, 10) || 1 : null,
    task: taskMatch ? /x/i.test(taskMatch[1]) : null,
    content: taskMatch ? taskMatch[2] : match[3],
  };
}

function countIndent(value) {
  const leading = String(value || "").match(/^[ \t]*/)?.[0] || "";
  return leading.replace(/\t/g, "  ").length;
}

function findNextNonEmptyLine(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (String(lines[index] || "").trim()) {
      return {
        line: lines[index],
        index,
      };
    }
  }
  return null;
}

function stripListContinuationIndent(line, baseIndent) {
  const spaces = Math.max(0, baseIndent + 2);
  return String(line || "").replace(new RegExp(`^\\s{0,${spaces}}`), "");
}

function isListItem(line) {
  return /^(\s*)([-+*]|\d+\.)\s+/.test(String(line || ""));
}

function parseParagraph(lines, startIndex, context) {
  const buffer = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      break;
    }
    if (
      /^\s*>/.test(line) ||
      /^#{1,6}\s+/.test(line) ||
      /^\s*(?:```|''')/.test(line) ||
      /^\s*\$\$\s*$/.test(line) ||
      /^\s*\\\[\s*$/.test(line) ||
      /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line) ||
      isListItem(line) ||
      isTableStart(lines, index)
    ) {
      break;
    }
    buffer.push(line);
    index += 1;
  }

  const paragraphLines = [];
  buffer.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      paragraphLines.push("\n");
    }
    paragraphLines.push(line);
  });
  const paragraphSource = paragraphLines.join("");
  const singleLineDisplayDollar = paragraphSource.match(/^\s*\$\$([\s\S]+)\$\$\s*$/);
  if (singleLineDisplayDollar) {
    return {
      node: createCanonicalNode({
        type: "mathBlock",
        attrs: {
          sourceFormat: "latex",
          displayMode: true,
        },
        text: String(singleLineDisplayDollar[1] || "").trim(),
        meta: buildNodeMeta(
          context.descriptor,
          context.parserId,
          `${context.originPrefix}-math-inline-display-${startIndex}`,
          "markdown-math-block"
        ),
      }),
      nextIndex: index,
    };
  }
  const singleLineDisplayBracket = paragraphSource.match(/^\s*\\\[([\s\S]+)\\\]\s*$/);
  if (singleLineDisplayBracket) {
    return {
      node: createCanonicalNode({
        type: "mathBlock",
        attrs: {
          sourceFormat: "latex",
          displayMode: true,
        },
        text: String(singleLineDisplayBracket[1] || "").trim(),
        meta: buildNodeMeta(
          context.descriptor,
          context.parserId,
          `${context.originPrefix}-math-inline-bracket-${startIndex}`,
          "markdown-math-block"
        ),
      }),
      nextIndex: index,
    };
  }

  return {
    node: createCanonicalNode({
      type: "paragraph",
      meta: buildNodeMeta(context.descriptor, context.parserId, `${context.originPrefix}-paragraph-${startIndex}`, "markdown-paragraph"),
      content: parseInlineMarkdown(paragraphSource, context),
    }),
    nextIndex: index,
  };
}

function parseInlineMarkdown(text, context) {
  return parseInlineSegments(String(text || ""), context);
}

function parseInlineSegments(text, context) {
  const result = [];
  let cursor = 0;
  const patterns = [
    {
      name: "footnoteRef",
      regex: /\[\^([^\]]+)\]/g,
      create(match) {
        return createCanonicalNode({
          type: "footnoteRef",
          attrs: { refId: match[1] },
        });
      },
    },
    {
      name: "link",
      regex: /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
      create(match) {
        return createCanonicalNode({
          type: "link",
          attrs: {
            href: match[2],
            ...(match[3] ? { title: match[3] } : {}),
          },
          content: parseInlineSegments(match[1], context),
        });
      },
    },
    {
      name: "inlineCode",
      regex: /`([^`]+)`/g,
      create(match) {
        return createCanonicalNode({
          type: "inlineCode",
          text: match[1],
        });
      },
    },
    {
      name: "mathInline",
      regex: /\$([^$\n]+)\$/g,
      create(match) {
        return createCanonicalNode({
          type: "mathInline",
          attrs: {
            sourceFormat: "latex",
            displayMode: false,
          },
          text: match[1],
        });
      },
    },
    {
      name: "mathInlineParen",
      regex: /\\\(([^()\n]+)\\\)/g,
      create(match) {
        return createCanonicalNode({
          type: "mathInline",
          attrs: {
            sourceFormat: "latex",
            displayMode: false,
          },
          text: match[1],
        });
      },
    },
    {
      name: "bold",
      regex: /\*\*([^*]+)\*\*/g,
      create(match) {
        return applyMarks(parseInlineSegments(match[1], context), [{ type: "bold" }]);
      },
    },
    {
      name: "strike",
      regex: /~~([^~]+)~~/g,
      create(match) {
        return applyMarks(parseInlineSegments(match[1], context), [{ type: "strike" }]);
      },
    },
    {
      name: "italic",
      regex: /\*([^*\n]+)\*/g,
      create(match) {
        return applyMarks(parseInlineSegments(match[1], context), [{ type: "italic" }]);
      },
    },
  ];

  while (cursor < text.length) {
    const next = findNextInlineMatch(text, cursor, patterns);
    if (!next) {
      pushTextNode(result, text.slice(cursor));
      break;
    }
    if (next.index > cursor) {
      pushTextNode(result, text.slice(cursor, next.index));
    }
    const created = next.pattern.create(next.match);
    if (Array.isArray(created)) {
      created.forEach((node) => result.push(node));
    } else if (created) {
      result.push(created);
    }
    cursor = next.index + next.match[0].length;
  }

  return compactInlineNodes(result);
}

function findNextInlineMatch(text, cursor, patterns) {
  let best = null;
  patterns.forEach((pattern) => {
    pattern.regex.lastIndex = cursor;
    const match = pattern.regex.exec(text);
    if (!match) {
      return;
    }
    if (!best || match.index < best.index) {
      best = { pattern, match, index: match.index };
    }
  });
  return best;
}

function applyMarks(nodes, marks) {
  return (Array.isArray(nodes) ? nodes : []).map((node) => {
    if (node.type === "text") {
      return createCanonicalNode({
        ...node,
        marks: mergeMarks(node.marks, marks),
      });
    }
    if (node.type === "link") {
      return createCanonicalNode({
        ...node,
        content: applyMarks(node.content, marks),
      });
    }
    return node;
  });
}

function mergeMarks(base, next) {
  const merged = [];
  [...(Array.isArray(base) ? base : []), ...(Array.isArray(next) ? next : [])].forEach((mark) => {
    const key = JSON.stringify(mark || {});
    if (!merged.some((item) => JSON.stringify(item) === key)) {
      merged.push(mark);
    }
  });
  return merged;
}

function pushTextNode(target, value) {
  const normalized = normalizeInlineText(value);
  if (!normalized) {
    return;
  }
  const parts = normalized.split("\n");
  parts.forEach((part, index) => {
    if (part) {
      const last = target[target.length - 1];
      if (last?.type === "text" && (!last.marks || !last.marks.length)) {
        last.text += part;
      } else {
        target.push(
          createCanonicalNode({
            type: "text",
            text: part,
          })
        );
      }
    }
    if (index < parts.length - 1) {
      target.push(createCanonicalNode({ type: "hardBreak" }));
    }
  });
}

function normalizeInlineText(value) {
  return String(value || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ");
}

function compactInlineNodes(nodes) {
  const result = [];
  (Array.isArray(nodes) ? nodes : []).forEach((node) => {
    if (!node) {
      return;
    }
    if (node.type === "text" && !String(node.text || "").trim()) {
      return;
    }
    const last = result[result.length - 1];
    if (
      last?.type === "text" &&
      node.type === "text" &&
      JSON.stringify(last.marks || []) === JSON.stringify(node.marks || [])
    ) {
      last.text += node.text;
      return;
    }
    result.push(node);
  });
  return result;
}
