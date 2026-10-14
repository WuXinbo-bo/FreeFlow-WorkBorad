import { normalizeLatexSource } from "../../../textModel/latexSyntax.js";
import { sanitizeText } from "../../../utils.js";
import {
  RICH_TEXT_BLOCK_TYPES,
  RICH_TEXT_INLINE_NODE_TYPES,
  createRichTextDocument,
  createRichTextDocumentFromHtml,
  serializeRichTextBlocksToPlainText,
} from "../../../textModel/richTextDocument.js";
import { buildTextElementContentFields } from "../text/sharedTextRenderUtils.js";
import { parseHtmlEntriesToCanonical } from "../../parsers/html/htmlParser.js";

import { renderMarkdownHtml } from "../../../textModel/markdownRuntime.js";

export function renderMarkdownToStaticHtml(markdown = "", { inline = false } = {}) {
  return renderMarkdownHtml(markdown, { inline });
}

export function renderLatexToStaticHtml(formula = "", { displayMode = false } = {}) {
  const source = normalizeLatexSource(formula);
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
  const html = String(options?.html || renderMarkdownHtml(markdown, options));
  const document = typeof globalThis.document !== 'undefined'
    ? createRichTextDocumentFromHtml(html, options?.plainText || "", options)
    : (() => {
        const parsed = parseHtmlEntriesToCanonical({ entries: [{ raw: { html } }] });
        const blocks = parsed.document.content.map(canonicalBlockToRichBlock);
        return createRichTextDocument({ html, blocks, plainText: serializeRichTextBlocksToPlainText(blocks), meta: options });
      })();
  document.meta = { ...document.meta, sourceType: "markdown", markdownFlavor: "commonmark-gfm", inline: options?.inline === true,
    hasTables: document.blocks.some(block => block.type === RICH_TEXT_BLOCK_TYPES.TABLE),
    hasTaskList: document.blocks.some(block => block.type === RICH_TEXT_BLOCK_TYPES.LIST && block.attrs.task),
    hasFootnotes: document.blocks.some(block => block.type === RICH_TEXT_BLOCK_TYPES.FOOTNOTE_DEFINITION) };
  return document;
}

// The same HTML parser supplies semantics in Node, where no DOM is available.
// This adapts the existing canonical schema; it does not parse Markdown again.
function canonicalBlockToRichBlock(node) {
  if (node.type === 'image') {
    return { type: RICH_TEXT_BLOCK_TYPES.PARAGRAPH, content: [{ type: RICH_TEXT_INLINE_NODE_TYPES.IMAGE, attrs: node.attrs }] };
  }
  const types = { bulletList: 'list', orderedList: 'list', taskList: 'list', listItem: 'list-item', taskItem: 'list-item',
    codeBlock: 'code-block', mathBlock: 'math-block', horizontalRule: 'thematic-break', tableRow: 'table-row', tableCell: 'table-cell', footnote: 'footnote-definition' };
  const block = { type: types[node.type] || node.type, attrs: { ...node.attrs }, plainText: node.text || '', content: [], blocks: [] };
  const children = node.content || [];
  if (['bulletList', 'orderedList', 'taskList'].includes(node.type)) {
    block.attrs.ordered = node.type === 'orderedList';
    block.attrs.task = node.type === 'taskList';
  }
  if (['heading', 'paragraph'].includes(node.type)) block.content = children;
  else if (['listItem', 'taskItem', 'tableCell'].includes(node.type)) {
    children.forEach((child, i) => {
      if (child.type === 'paragraph' && i === 0) block.content.push(...child.content);
      else block.blocks.push(canonicalBlockToRichBlock(child));
    });
  } else block.blocks = children.map(canonicalBlockToRichBlock);
  if (node.type === 'tableRow') block.attrs.headerRow = children.length > 0 && children.every(cell => cell.attrs?.header);
  return block;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
