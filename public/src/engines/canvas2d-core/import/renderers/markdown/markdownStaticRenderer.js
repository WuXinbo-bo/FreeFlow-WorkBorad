import { sanitizeText } from "../../../utils.js";
import {
  RICH_TEXT_BLOCK_TYPES,
  RICH_TEXT_INLINE_NODE_TYPES,
  RICH_TEXT_MARK_TYPES,
  createRichTextDocument,
  createRichTextTextNode,
  normalizeRichTextInlineNode,
} from "../../../textModel/richTextDocument.js";
import { buildTextElementContentFields } from "../text/sharedTextRenderUtils.js";

const HTML_BLOCK_TYPES = new Set([
  RICH_TEXT_BLOCK_TYPES.PARAGRAPH,
  RICH_TEXT_BLOCK_TYPES.HEADING,
  RICH_TEXT_BLOCK_TYPES.BLOCKQUOTE,
  RICH_TEXT_BLOCK_TYPES.LIST,
  RICH_TEXT_BLOCK_TYPES.LIST_ITEM,
  RICH_TEXT_BLOCK_TYPES.CODE_BLOCK,
  RICH_TEXT_BLOCK_TYPES.THEMATIC_BREAK,
  RICH_TEXT_BLOCK_TYPES.TABLE,
  RICH_TEXT_BLOCK_TYPES.TABLE_ROW,
  RICH_TEXT_BLOCK_TYPES.TABLE_CELL,
  RICH_TEXT_BLOCK_TYPES.MATH_BLOCK,
  RICH_TEXT_BLOCK_TYPES.FOOTNOTE_DEFINITION,
]);

export function renderMarkdownToStaticHtml(markdown = "", { inline = false } = {}) {
  const source = normalizeLatexDelimiters(String(markdown || "")).trim();
  if (!source) {
    return "";
  }
  const blocks = parseMarkdownBlocks(source);
  if (!blocks.length) {
    return "";
  }
  if (inline) {
    return blocks.map((block) => renderBlockToInlineHtml(block)).join("");
  }
  return blocks.map((block) => renderBlockToHtml(block)).join("");
}

export function renderLatexToStaticHtml(formula = "", { displayMode = false } = {}) {
  const source = String(formula || "").trim();
  if (!source) {
    return "";
  }
  const katexApi = globalThis?.katex;
  if (katexApi && typeof katexApi.renderToString === "function") {
    try {
      return katexApi.renderToString(source, {
        displayMode,
        throwOnError: false,
        strict: "ignore",
        output: "htmlAndMathml",
      });
    } catch {
      // Fall back to escaped source below.
    }
  }
  const escaped = escapeHtml(source);
  return displayMode
    ? `<div data-role="math-block" data-math-render-state="fallback">${escaped}</div>`
    : `<span data-role="math-inline" data-math-render-state="fallback">${escaped}</span>`;
}

export function renderMarkdownToTextElementContent(markdown = "", options = {}) {
  const source = String(markdown || "");
  const html = renderMarkdownToStaticHtml(source, options);
  const plainText = sanitizeText(String(options?.plainText || source || ""));
  const fontSize = Number(options?.fontSize) || 20;
  const richTextDocument = buildRichTextDocumentFromMarkdown(source, {
    html,
    plainText,
    baseFontSize: fontSize,
    inline: options?.inline === true,
  });
  return buildTextElementContentFields(
    {
      html,
      plainText,
      text: plainText,
      richTextDocument,
      fontSize,
    },
    {
      fontSize,
    }
  );
}

export function renderLatexToTextElementContent(formula = "", options = {}) {
  const source = String(formula || "");
  const displayMode = options?.displayMode === true;
  const html = renderLatexToStaticHtml(source, { displayMode });
  const plainText = sanitizeText(source);
  const fontSize = Number(options?.fontSize) || 20;
  const blocks = displayMode
    ? [
        {
          id: "block-1",
          type: RICH_TEXT_BLOCK_TYPES.MATH_BLOCK,
          plainText,
          attrs: {
            displayMode: true,
          },
          meta: {
            sourceSyntax: "latex",
          },
        },
      ]
    : [
        {
          id: "block-1",
          type: RICH_TEXT_BLOCK_TYPES.PARAGRAPH,
          content: [
            {
              type: RICH_TEXT_INLINE_NODE_TYPES.MATH_INLINE,
              text: plainText,
              attrs: {},
              meta: {
                sourceSyntax: "latex",
              },
            },
          ],
        },
      ];
  const richTextDocument = createRichTextDocument({
    html,
    plainText,
    blocks,
    meta: {
      baseFontSize: fontSize,
      sourceType: "markdown",
      sourceSyntax: "latex",
      markdownFlavor: "math",
    },
  });
  return buildTextElementContentFields(
    {
      html,
      plainText,
      text: plainText,
      richTextDocument,
      fontSize,
    },
    {
      fontSize,
    }
  );
}

export function buildRichTextDocumentFromMarkdown(markdown = "", options = {}) {
  const source = normalizeLatexDelimiters(String(markdown || ""));
  const html = String(options?.html || renderMarkdownToStaticHtml(source, options));
  const plainText = sanitizeText(String(options?.plainText || source || ""));
  const blocks = parseMarkdownBlocks(source);
  return createRichTextDocument({
    html,
    plainText,
    blocks: blocks.length
      ? blocks
      : [
          {
            id: "block-1",
            type: RICH_TEXT_BLOCK_TYPES.HTML,
            html,
            plainText,
          },
        ],
    meta: {
      baseFontSize: Number(options?.baseFontSize || options?.fontSize || 20) || 20,
      sourceType: "markdown",
      markdownFlavor: "gfm-lite",
      inline: options?.inline === true,
      hasTables: blocks.some((block) => block?.type === RICH_TEXT_BLOCK_TYPES.TABLE),
      hasTaskList: blocks.some((block) => block?.type === RICH_TEXT_BLOCK_TYPES.LIST && block?.attrs?.task),
      hasFootnotes: blocks.some((block) => block?.type === RICH_TEXT_BLOCK_TYPES.FOOTNOTE_DEFINITION),
    },
  });
}

function parseMarkdownBlocks(markdown = "") {
  const lines = normalizeMarkdown(markdown).split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = String(lines[index] || "");
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        id: `block-${blocks.length + 1}`,
        type: RICH_TEXT_BLOCK_TYPES.HEADING,
        content: parseInlineMarkdown(headingMatch[2]),
        attrs: {
          level: headingMatch[1].length,
        },
        meta: {
          sourceNodeType: "heading",
        },
      });
      index += 1;
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push({
        id: `block-${blocks.length + 1}`,
        type: RICH_TEXT_BLOCK_TYPES.THEMATIC_BREAK,
        meta: {
          sourceNodeType: "thematicBreak",
        },
      });
      index += 1;
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      const result = parseDelimitedMathBlock(lines, index, /^\s*\$\$\s*$/, "math");
      blocks.push(result.block);
      index = result.nextIndex;
      continue;
    }
    if (/^\s*\\\[\s*$/.test(line)) {
      const result = parseDelimitedMathBlock(lines, index, /^\s*\\\]\s*$/, "math");
      blocks.push(result.block);
      index = result.nextIndex;
      continue;
    }
    if (/^\s*(?:```|''')/.test(line)) {
      const result = parseCodeBlock(lines, index);
      blocks.push(result.block);
      index = result.nextIndex;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const result = parseBlockquote(lines, index);
      blocks.push(result.block);
      index = result.nextIndex;
      continue;
    }
    if (isTableStart(lines, index)) {
      const result = parseTable(lines, index);
      blocks.push(result.block);
      index = result.nextIndex;
      continue;
    }
    if (isListItem(line)) {
      const result = parseList(lines, index);
      blocks.push(result.block);
      index = result.nextIndex;
      continue;
    }
    const result = parseParagraph(lines, index);
    blocks.push(result.block);
    index = result.nextIndex;
  }
  return blocks.filter((block) => block && HTML_BLOCK_TYPES.has(block.type));
}

function parseDelimitedMathBlock(lines, startIndex, closePattern, sourceNodeType) {
  const content = [];
  let index = startIndex + 1;
  while (index < lines.length && !closePattern.test(String(lines[index] || ""))) {
    content.push(String(lines[index] || ""));
    index += 1;
  }
  return {
    block: createMathBlock(content.join("\n"), sourceNodeType),
    nextIndex: index < lines.length ? index + 1 : index,
  };
}

function parseCodeBlock(lines, startIndex) {
  const open = String(lines[startIndex] || "").match(/^\s*(```|''')([\w+-]*)\s*$/);
  const fence = String(open?.[1] || "```");
  const language = String(open?.[2] || "").trim().toLowerCase();
  const content = [];
  let index = startIndex + 1;
  while (index < lines.length && String(lines[index] || "").trim() !== fence) {
    content.push(String(lines[index] || ""));
    index += 1;
  }
  return {
    block: {
      id: `block-code-${startIndex + 1}`,
      type: RICH_TEXT_BLOCK_TYPES.CODE_BLOCK,
      plainText: content.join("\n"),
      attrs: {
        language,
      },
      meta: {
        sourceNodeType: "code",
      },
    },
    nextIndex: index < lines.length ? index + 1 : index,
  };
}

function parseBlockquote(lines, startIndex) {
  const quoteLines = [];
  let index = startIndex;
  while (index < lines.length && /^\s*>/.test(String(lines[index] || ""))) {
    quoteLines.push(String(lines[index] || "").replace(/^\s*>\s?/, ""));
    index += 1;
  }
  return {
    block: {
      id: `block-quote-${startIndex + 1}`,
      type: RICH_TEXT_BLOCK_TYPES.BLOCKQUOTE,
      blocks: parseMarkdownBlocks(quoteLines.join("\n")),
      meta: {
        sourceNodeType: "blockquote",
      },
    },
    nextIndex: index,
  };
}

function parseTable(lines, startIndex) {
  const headerCells = splitTableRow(lines[startIndex]);
  const aligns = parseTableAlignment(lines[startIndex + 1]);
  const rows = [];
  let rowIndex = 0;
  const pushRow = (cells, isHeader) => {
    rows.push({
      id: `table-row-${startIndex + 1}-${rowIndex + 1}`,
      type: RICH_TEXT_BLOCK_TYPES.TABLE_ROW,
      blocks: cells.map((cell, cellIndex) => ({
        id: `table-cell-${startIndex + 1}-${rowIndex + 1}-${cellIndex + 1}`,
        type: RICH_TEXT_BLOCK_TYPES.TABLE_CELL,
        content: parseInlineMarkdown(cell),
        attrs: {
          align: aligns[cellIndex] || null,
          header: isHeader,
        },
        meta: {
          sourceNodeType: "tableCell",
        },
      })),
      attrs: {
        headerRow: isHeader,
      },
      meta: {
        sourceNodeType: "tableRow",
      },
    });
    rowIndex += 1;
  };
  pushRow(headerCells, true);

  let index = startIndex + 2;
  while (index < lines.length && /^\s*\|?.+\|\s*$/.test(String(lines[index] || ""))) {
    pushRow(splitTableRow(lines[index]), false);
    index += 1;
  }
  return {
    block: {
      id: `block-table-${startIndex + 1}`,
      type: RICH_TEXT_BLOCK_TYPES.TABLE,
      blocks: rows,
      attrs: {
        aligns,
      },
      meta: {
        sourceNodeType: "table",
      },
    },
    nextIndex: index,
  };
}

function parseList(lines, startIndex) {
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
      const next = String(lines[index] || "");
      if (!next.trim()) {
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
    const childBlocks = parseMarkdownBlocks(bodyLines.join("\n"));
    const firstParagraph = childBlocks[0]?.type === RICH_TEXT_BLOCK_TYPES.PARAGRAPH ? childBlocks[0] : null;
    items.push({
      id: `list-item-${startIndex + 1}-${itemIndex + 1}`,
      type: RICH_TEXT_BLOCK_TYPES.LIST_ITEM,
      content: firstParagraph?.content || [],
      blocks: firstParagraph ? childBlocks.slice(1) : childBlocks,
      attrs: {
        checked: isTask ? Boolean(parsed.task) : null,
        spread: bodyLines.some((entry) => !String(entry || "").trim()),
      },
      meta: {
        sourceNodeType: isTask ? "taskItem" : "listItem",
      },
    });
    itemIndex += 1;
  }
  return {
    block: {
      id: `block-list-${startIndex + 1}`,
      type: RICH_TEXT_BLOCK_TYPES.LIST,
      blocks: items,
      attrs: {
        ordered: isOrdered,
        start: isOrdered ? first.start : null,
        spread: false,
        task: isTask,
      },
      meta: {
        sourceNodeType: isTask ? "taskList" : isOrdered ? "orderedList" : "bulletList",
      },
    },
    nextIndex: index,
  };
}

function parseParagraph(lines, startIndex) {
  const buffer = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = String(lines[index] || "");
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
  const source = buffer.join("\n");
  const singleLineDisplayDollar = source.match(/^\s*\$\$([\s\S]+)\$\$\s*$/);
  if (singleLineDisplayDollar) {
    return {
      block: createMathBlock(singleLineDisplayDollar[1], "math"),
      nextIndex: index,
    };
  }
  const singleLineDisplayBracket = source.match(/^\s*\\\[([\s\S]+)\\\]\s*$/);
  if (singleLineDisplayBracket) {
    return {
      block: createMathBlock(singleLineDisplayBracket[1], "math"),
      nextIndex: index,
    };
  }
  return {
    block: {
      id: `block-${startIndex + 1}`,
      type: RICH_TEXT_BLOCK_TYPES.PARAGRAPH,
      content: parseInlineMarkdown(source),
      meta: {
        sourceNodeType: "paragraph",
      },
    },
    nextIndex: index,
  };
}

function createMathBlock(value = "", sourceNodeType = "math") {
  return {
    id: `block-math-${createStableHash(value)}`,
    type: RICH_TEXT_BLOCK_TYPES.MATH_BLOCK,
    plainText: sanitizeText(String(value || "").trim()),
    attrs: {
      displayMode: true,
    },
    meta: {
      sourceNodeType,
    },
  };
}

function parseInlineMarkdown(text = "") {
  return compactInlineNodes(parseInlineSegments(String(text || "")));
}

function parseInlineSegments(text = "") {
  const patterns = [
    {
      regex: /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g,
      create(match) {
        return {
          type: RICH_TEXT_INLINE_NODE_TYPES.LINK,
          content: parseInlineMarkdown(match[1]),
          attrs: {
            href: match[2],
            title: match[3] ? match[3] : "",
          },
          meta: {
            sourceNodeType: "link",
          },
        };
      },
    },
    {
      regex: /`([^`]+)`/g,
      create(match) {
        return {
          type: RICH_TEXT_INLINE_NODE_TYPES.INLINE_CODE,
          text: match[1],
          marks: [],
        };
      },
    },
    {
      regex: /\$([^$\n]+)\$/g,
      create(match) {
        return {
          type: RICH_TEXT_INLINE_NODE_TYPES.MATH_INLINE,
          text: match[1],
          attrs: {},
          marks: [],
        };
      },
    },
    {
      regex: /\\\(([^()\n]+)\\\)/g,
      create(match) {
        return {
          type: RICH_TEXT_INLINE_NODE_TYPES.MATH_INLINE,
          text: match[1],
          attrs: {},
          marks: [],
        };
      },
    },
    {
      regex: /\*\*([^*]+)\*\*/g,
      create(match) {
        return applyMarks(parseInlineMarkdown(match[1]), [{ type: RICH_TEXT_MARK_TYPES.BOLD }]);
      },
    },
    {
      regex: /~~([^~]+)~~/g,
      create(match) {
        return applyMarks(parseInlineMarkdown(match[1]), [{ type: RICH_TEXT_MARK_TYPES.STRIKE }]);
      },
    },
    {
      regex: /\*([^*\n]+)\*/g,
      create(match) {
        return applyMarks(parseInlineMarkdown(match[1]), [{ type: RICH_TEXT_MARK_TYPES.ITALIC }]);
      },
    },
  ];

  const result = [];
  let cursor = 0;
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
      result.push(...created);
    } else if (created) {
      result.push(created);
    }
    cursor = next.index + next.match[0].length;
  }
  return result;
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

function pushTextNode(target, value) {
  const normalized = String(value || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n");
  if (!normalized) {
    return;
  }
  const parts = normalized.split("\n");
  parts.forEach((part, index) => {
    if (part) {
      target.push(createRichTextTextNode(part, []));
    }
    if (index < parts.length - 1) {
      target.push({ type: RICH_TEXT_INLINE_NODE_TYPES.HARD_BREAK });
    }
  });
}

function applyMarks(nodes, marks) {
  return (Array.isArray(nodes) ? nodes : []).map((node) => {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (node.type === RICH_TEXT_INLINE_NODE_TYPES.TEXT) {
      return {
        ...node,
        marks: mergeMarks(node.marks || [], marks),
      };
    }
    if (node.type === RICH_TEXT_INLINE_NODE_TYPES.LINK) {
      return {
        ...node,
        content: applyMarks(node.content || [], marks),
      };
    }
    return node;
  });
}

function mergeMarks(base = [], next = []) {
  const merged = [];
  [...base, ...next].forEach((mark) => {
    const key = JSON.stringify(mark || {});
    if (!merged.some((entry) => JSON.stringify(entry || {}) === key)) {
      merged.push(mark);
    }
  });
  return merged;
}

function compactInlineNodes(nodes = []) {
  const result = [];
  (Array.isArray(nodes) ? nodes : []).forEach((node) => {
    const normalized = normalizeRichTextInlineNode(node);
    if (!normalized) {
      return;
    }
    const last = result[result.length - 1];
    if (
      last?.type === RICH_TEXT_INLINE_NODE_TYPES.TEXT &&
      normalized.type === RICH_TEXT_INLINE_NODE_TYPES.TEXT &&
      JSON.stringify(last.marks || []) === JSON.stringify(normalized.marks || [])
    ) {
      last.text += normalized.text || "";
      return;
    }
    result.push(normalized);
  });
  return result;
}

function renderBlockToInlineHtml(block) {
  if (!block || typeof block !== "object") {
    return "";
  }
  if (block.type === RICH_TEXT_BLOCK_TYPES.PARAGRAPH || block.type === RICH_TEXT_BLOCK_TYPES.HEADING) {
    return renderInlineNodesToHtml(block.content || []);
  }
  return renderBlockToHtml(block);
}

function renderBlockToHtml(block) {
  if (!block || typeof block !== "object") {
    return "";
  }
  switch (block.type) {
    case RICH_TEXT_BLOCK_TYPES.PARAGRAPH:
      return `<p>${renderInlineNodesToHtml(block.content || [])}</p>`;
    case RICH_TEXT_BLOCK_TYPES.HEADING: {
      const level = Math.min(6, Math.max(1, Number(block?.attrs?.level || 1)));
      return `<h${level}>${renderInlineNodesToHtml(block.content || [])}</h${level}>`;
    }
    case RICH_TEXT_BLOCK_TYPES.BLOCKQUOTE:
      return `<blockquote>${(block.blocks || []).map((child) => renderBlockToHtml(child)).join("")}</blockquote>`;
    case RICH_TEXT_BLOCK_TYPES.LIST:
      return renderListToHtml(block);
    case RICH_TEXT_BLOCK_TYPES.CODE_BLOCK: {
      const language = String(block?.attrs?.language || "").trim();
      const classAttr = language ? ` class="language-${escapeAttribute(language)}"` : "";
      return `<pre><code${classAttr}>${escapeHtml(String(block.plainText || ""))}</code></pre>`;
    }
    case RICH_TEXT_BLOCK_TYPES.THEMATIC_BREAK:
      return "<hr>";
    case RICH_TEXT_BLOCK_TYPES.TABLE:
      return renderTableToHtml(block);
    case RICH_TEXT_BLOCK_TYPES.MATH_BLOCK:
      return renderLatexToStaticHtml(String(block.plainText || ""), { displayMode: true });
    case RICH_TEXT_BLOCK_TYPES.FOOTNOTE_DEFINITION:
      return `<section data-role="footnote-definition">${(block.blocks || []).map((child) => renderBlockToHtml(child)).join("")}</section>`;
    default:
      return "";
  }
}

function renderListToHtml(block) {
  const ordered = block?.attrs?.ordered === true;
  const task = block?.attrs?.task === true;
  const tag = ordered ? "ol" : "ul";
  const attrs = [];
  if (ordered && Number(block?.attrs?.start) > 1) {
    attrs.push(`start="${Number(block.attrs.start)}"`);
  }
  if (task) {
    attrs.push('data-ff-task-list="true"');
  }
  const body = (block.blocks || [])
    .map((item) => {
      const itemAttrs = [];
      if (task) {
        itemAttrs.push(`data-ff-task-state="${item?.attrs?.checked ? "done" : "todo"}"`);
      }
      const inline = renderInlineNodesToHtml(item?.content || []);
      const nested = (item?.blocks || []).map((child) => renderBlockToHtml(child)).join("");
      return `<li${itemAttrs.length ? ` ${itemAttrs.join(" ")}` : ""}>${inline}${nested}</li>`;
    })
    .join("");
  return `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${body}</${tag}>`;
}

function renderTableToHtml(block) {
  const rows = Array.isArray(block?.blocks) ? block.blocks : [];
  const headerRow = rows.find((row) => row?.attrs?.headerRow);
  const bodyRows = rows.filter((row) => !row?.attrs?.headerRow);
  const renderRow = (row) =>
    `<tr>${(row?.blocks || [])
      .map((cell) => {
        const tag = cell?.attrs?.header ? "th" : "td";
        const align = String(cell?.attrs?.align || "").trim();
        const alignAttr = align ? ` align="${escapeAttribute(align)}"` : "";
        return `<${tag}${alignAttr}>${renderInlineNodesToHtml(cell?.content || [])}</${tag}>`;
      })
      .join("")}</tr>`;
  const thead = headerRow ? `<thead>${renderRow(headerRow)}</thead>` : "";
  const tbody = bodyRows.length ? `<tbody>${bodyRows.map((row) => renderRow(row)).join("")}</tbody>` : "";
  return `<table>${thead}${tbody}</table>`;
}

function renderInlineNodesToHtml(nodes = []) {
  return (Array.isArray(nodes) ? nodes : [])
    .map((node) => renderInlineNodeToHtml(node))
    .join("");
}

function renderInlineNodeToHtml(node) {
  if (!node || typeof node !== "object") {
    return "";
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.TEXT) {
    return applyMarksToHtml(escapeHtml(String(node.text || "")), node.marks || []);
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.HARD_BREAK) {
    return "<br>";
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.INLINE_CODE) {
    return `<code>${escapeHtml(String(node.text || ""))}</code>`;
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.MATH_INLINE) {
    return renderLatexToStaticHtml(String(node.text || ""), { displayMode: false });
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.LINK) {
    const href = escapeAttribute(String(node?.attrs?.href || ""));
    const title = String(node?.attrs?.title || "").trim();
    const titleAttr = title ? ` title="${escapeAttribute(title)}"` : "";
    return `<a href="${href}"${titleAttr}>${renderInlineNodesToHtml(node.content || [])}</a>`;
  }
  if (node.type === RICH_TEXT_INLINE_NODE_TYPES.FOOTNOTE_REF) {
    const refId = escapeAttribute(String(node?.attrs?.refId || ""));
    return `<sup data-role="footnote-ref">${refId || "*"}</sup>`;
  }
  return "";
}

function applyMarksToHtml(html, marks = []) {
  let next = String(html || "");
  (Array.isArray(marks) ? marks : []).forEach((mark) => {
    const type = String(mark?.type || "").trim();
    if (type === RICH_TEXT_MARK_TYPES.BOLD) {
      next = `<strong>${next}</strong>`;
    } else if (type === RICH_TEXT_MARK_TYPES.ITALIC) {
      next = `<em>${next}</em>`;
    } else if (type === RICH_TEXT_MARK_TYPES.STRIKE) {
      next = `<s>${next}</s>`;
    }
  });
  return next;
}

function parseTableAlignment(line) {
  return splitTableRow(line).map((cell) => {
    const trimmed = String(cell || "").trim();
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
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableStart(lines, index) {
  if (index + 1 >= lines.length) {
    return false;
  }
  const current = String(lines[index] || "");
  const next = String(lines[index + 1] || "");
  if (!/\|/.test(current) || !/\|/.test(next)) {
    return false;
  }
  return /^\s*\|?[:\- ]+\|[:\-| ]+\s*$/.test(next);
}

function isListItem(line) {
  return /^(\s*)([-+*]|\d+\.)\s+/.test(String(line || ""));
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

function stripListContinuationIndent(line, baseIndent) {
  const spaces = Math.max(0, baseIndent + 2);
  return String(line || "").replace(new RegExp(`^\\s{0,${spaces}}`), "");
}

function normalizeLatexDelimiters(markdown = "") {
  let source = String(markdown || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  source = source.replace(/(^|\n)\s*\\\[\s*([\s\S]*?)\s*\\\]\s*(?=\n|$)/g, (_match, prefix, body) => {
    return `${prefix}$$\n${String(body || "").trim()}\n$$`;
  });
  source = source.replace(/\\\(([^()\n]+)\\\)/g, (_match, body) => `$${String(body || "").trim()}$`);
  return source;
}

function normalizeMarkdown(markdown = "") {
  return String(markdown || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function createStableHash(value = "") {
  let hash = 0;
  const source = String(value || "");
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
