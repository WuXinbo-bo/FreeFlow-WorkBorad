import { findLatexSpans, normalizeLatexSource, readLatexSpan } from "./latexSyntax.js";

const BLOCK_TAGS = /^(P|DIV|SECTION|ARTICLE|H[1-6]|LI|BLOCKQUOTE|UL|OL|TABLE|THEAD|TBODY|TR|TD|TH)$/;

function isMathSourceLine(node) {
  return /^(P|DIV)$/.test(node.tagName)
    && !node.matches('[data-role], [contenteditable="false"]')
    && !node.querySelector('img, a, pre, code, table, ul, ol, blockquote, p, div, section, article, h1, h2, h3, h4, h5, h6, [data-role], [contenteditable="false"]');
}

// Work on a detached copy, never the live contenteditable DOM or its selection.
export function normalizeRichMathHtml(html = "") {
  const source = String(html || "");
  if (!/\$|\\[([]/.test(source) || typeof document === "undefined") return source;
  const root = document.createElement("div");
  root.innerHTML = source;
  const visit = (container) => {
    // Enter in contenteditable splits a $$ block into sibling divs/paragraphs.
    // Join only complete fenced blocks; never cross a list, table, or code block.
    const children = Array.from(container.children);
    for (let i = 0; i < children.length; i += 1) {
      const first = children[i];
      if (!isMathSourceLine(first) || !/^(\$\$|\\\[)\s*$/.test(first.textContent.trim())) continue;
      const parts = [first];
      for (let j = i + 1; j < children.length; j += 1) {
        const child = children[j];
        if (!isMathSourceLine(child)) break;
        let gap = parts[parts.length - 1].nextSibling;
        while (gap && gap !== child && gap.nodeType === Node.TEXT_NODE && !gap.textContent.trim()) gap = gap.nextSibling;
        if (gap !== child) break;
        parts.push(child);
        const joined = parts.map(node => node.textContent).join("\n").trim();
        const span = readLatexSpan(joined);
        if (!span) continue;
        if (span.end !== joined.length) break;
        const math = document.createElement("div");
        math.setAttribute("data-role", "math-block");
        math.textContent = span.formula;
        first.replaceWith(math);
        parts.slice(1).forEach(node => node.remove());
        i = j;
        break;
      }
    }
    let entries = [], text = "";
    const flush = () => {
      const spans = findLatexSpans(text);
      for (const span of spans.reverse()) {
        const first = entries.find(entry => entry.end > span.start);
        const last = entries.find(entry => entry.end >= span.end);
        if (!first || !last) continue;
        const standalone = span.displayMode && text.trim() === text.slice(span.start, span.end)
          && container.textContent.replace(/\s/g, "") === text.replace(/\s/g, "")
          && !container.querySelector('img, a, pre, code, [contenteditable="false"], [data-role]');
        if (standalone && container !== root && /^(P|DIV|SECTION|ARTICLE)$/.test(container.tagName)) {
          const math = document.createElement("div");
          for (const attr of container.attributes) math.setAttribute(attr.name, attr.value);
          math.setAttribute("data-role", "math-block");
          math.textContent = span.formula;
          container.replaceWith(math);
          break;
        }
        const range = document.createRange();
        range.setStart(first.node, span.start - first.start);
        range.setEnd(last.node, span.end - last.start);
        const math = document.createElement(standalone ? "div" : "span");
        math.setAttribute("data-role", standalone ? "math-block" : "math-inline");
        math.textContent = span.formula;
        range.deleteContents();
        range.insertNode(math);
      }
      entries = []; text = "";
    };
    const collect = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const start = text.length;
        text += node.data;
        entries.push({ node, start, end: text.length });
        return;
      }
      if (!(node instanceof Element)) return;
      if (node.matches('[data-role="math-inline"], [data-role="math-block"]')) {
        flush(); node.textContent = normalizeLatexSource(node.textContent); return;
      }
      if (node.matches('pre, code, a, img, hr, [contenteditable="false"]')) { flush(); return; }
      if (node.tagName === "BR") { text += "\n"; return; }
      if (BLOCK_TAGS.test(node.tagName)) { flush(); visit(node); return; }
      Array.from(node.childNodes).forEach(collect);
    };
    Array.from(container.childNodes).forEach(collect);
    flush();
  };
  visit(root);
  return root.innerHTML;
}
