import { MarkdownIt, footnote } from '../../../../assets/vendor/markdown/markdown-parser.js';

import { readLatexSpan } from "./latexSyntax.js";

const parser = new MarkdownIt({ html: false, breaks: true, linkify: true }).use(footnote);
const escape = parser.utils.escapeHtml;

// Formatting newlines between HTML blocks become extra text lines in a
// pre-wrap canvas host. Remove renderer whitespace, preserving code content.
const renderToken = parser.renderer.renderToken.bind(parser.renderer);
parser.renderer.renderToken = (tokens, i, options) => renderToken(tokens, i, options).replace(/\n$/, '');
for (const rule of ['fence', 'code_block']) {
  const render = parser.renderer.rules[rule];
  parser.renderer.rules[rule] = (...args) => render(...args).replace(/\n$/, '');
}
parser.renderer.rules.hardbreak = () => '<br>';
parser.renderer.rules.softbreak = () => '<br>';

// Rich text has underline; ordinary Markdown does not. Accept these exact
// inline tags only, rather than enabling arbitrary HTML in pasted Markdown.
parser.inline.ruler.before('escape', 'freeflow_inline_html', (state, silent) => {
  const match = state.src.slice(state.pos).match(/^<\/?(?:u|s|mark|sup|sub)>|^<br\s*\/?>/i);
  if (!match) return false;
  if (!silent) state.push('html_inline', '', 0).content = match[0].toLowerCase();
  state.pos += match[0].length;
  return true;
});
parser.inline.ruler.before('escape', 'freeflow_math', (state, silent) => {
  const span = readLatexSpan(state.src, state.pos);
  if (!span) return false;
  // $$ within a paragraph remains part of that paragraph; standalone $$ is a block.
  if (!silent) state.push('freeflow_math_inline', '', 0).content = span.formula;
  state.pos = span.end;
  return true;
});
parser.renderer.rules.freeflow_math_inline = (tokens, index) => `<span data-role="math-inline">${escape(tokens[index].content)}</span>`;
parser.block.ruler.before('fence', 'freeflow_math_block', (state, start, end, silent) => {
  const startOffset = state.bMarks[start] + state.tShift[start];
  const first = state.src.slice(startOffset, state.eMarks[start]).trim();
  if (!first.startsWith('$$') && !first.startsWith('\\[')) return false;
  const candidate = state.src.slice(startOffset, state.eMarks[end - 1]);
  const span = readLatexSpan(candidate);
  if (!span?.displayMode) return false;
  const last = start + candidate.slice(0, span.end).split('\n').length - 1;
  if (candidate.slice(span.end).split('\n')[0].trim()) return false;
  if (silent) return true;
  const token = state.push('freeflow_math_block', 'div', 0);
  token.block = true; token.content = span.formula; token.map = [start, last + 1];
  state.line = last + 1;
  return true;
}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
parser.renderer.rules.freeflow_math_block = (tokens, index) => `<div data-role="math-block">${escape(tokens[index].content)}</div>`;

// Keep the task state in the document, with no live input in an editable host.
parser.core.ruler.after('inline', 'freeflow_tasks', state => {
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i];
    if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue;
    const match = inline.children?.[0]?.type === 'text' && inline.children[0].content.match(/^\[([ xX])\]\s+/);
    if (!match) continue;
    inline.children[0].content = inline.children[0].content.slice(match[0].length);
    const li = tokens[i - 2];
    li.attrSet('data-ff-task-item', 'true'); li.attrSet('data-ff-task-state', /x/i.test(match[1]) ? 'done' : 'todo');
    let depth = 0;
    for (let j = i - 3; j >= 0; j--) {
      if (tokens[j].type === 'bullet_list_close' || tokens[j].type === 'ordered_list_close') depth++;
      if (tokens[j].type === 'bullet_list_open' || tokens[j].type === 'ordered_list_open') {
        if (depth-- === 0) { tokens[j].attrSet('data-ff-task-list', 'true'); break; }
      }
    }
  }
});
const footnoteId = (token, env) => String(env?.footnotes?.list?.[token.meta.id]?.label || token.meta.id + 1);
parser.renderer.rules.footnote_ref = (tokens, i, _options, env) => `<sup data-footnote-ref="${escape(footnoteId(tokens[i], env))}">${tokens[i].meta.id + 1}</sup>`;
parser.renderer.rules.footnote_block_open = () => '';
parser.renderer.rules.footnote_block_close = () => '';
parser.renderer.rules.footnote_open = (tokens, i, _options, env) => `<div data-footnote-definition="${escape(footnoteId(tokens[i], env))}">`;
parser.renderer.rules.footnote_close = () => '</div>';
parser.renderer.rules.footnote_anchor = () => '';

export function renderMarkdownHtml(value = '', { inline = false } = {}) {
  const source = String(value || '').replace(/\r\n?/g, '\n').trim();
  return source ? (inline ? parser.renderInline(source) : parser.render(source)) : '';
}
