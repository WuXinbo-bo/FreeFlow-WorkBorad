function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInlineMarkdown(text = "") {
  const source = String(text || "");
  if (!source) {
    return "";
  }
  const tokens = [];
  const store = (html) => {
    const key = `__FF_MD_${tokens.length}__`;
    tokens.push({ key, html });
    return key;
  };
  let html = escapeHtml(source);
  html = html.replace(/`([^`]+)`/g, (_, code) => store(`<code data-ff-inline-code="true">${escapeHtml(code)}</code>`));
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
    store(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${renderInlineMarkdown(label)}</a>`)
  );
  html = html.replace(/\$([^$\n]+)\$/g, (_, formula) =>
    store(`<span data-role="math-inline">${escapeHtml(String(formula || "").trim())}</span>`)
  );
  html = html.replace(/\\\(([^()\n]+)\\\)/g, (_, formula) =>
    store(`<span data-role="math-inline">${escapeHtml(String(formula || "").trim())}</span>`)
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  tokens.forEach(({ key, html: tokenHtml }) => {
    html = html.replaceAll(key, tokenHtml);
  });
  return html;
}

function splitTableRow(line = "") {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line = "") {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderParagraph(lines = []) {
  const joined = (Array.isArray(lines) ? lines : []).join("\n").trim();
  const singleLineDisplayDollar = joined.match(/^\$\$([\s\S]+)\$\$$/);
  if (singleLineDisplayDollar) {
    return `<div data-role="math-block">${escapeHtml(String(singleLineDisplayDollar[1] || "").trim())}</div>`;
  }
  const singleLineDisplayBracket = joined.match(/^\\\[([\s\S]+)\\\]$/);
  if (singleLineDisplayBracket) {
    return `<div data-role="math-block">${escapeHtml(String(singleLineDisplayBracket[1] || "").trim())}</div>`;
  }
  const content = lines.map((line) => renderInlineMarkdown(line)).join("<br>");
  return `<p>${content || "<br>"}</p>`;
}

function renderList(lines = [], { ordered = false, task = false } = {}) {
  const tag = ordered ? "ol" : "ul";
  const attrs = task ? ' data-ff-task-list="true"' : "";
  const items = lines
    .map((line) => {
      const taskMatch = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
      const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
      const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/);
      const content = taskMatch?.[2] || orderedMatch?.[1] || bulletMatch?.[1] || line;
      const state = taskMatch?.[1] && /x/i.test(taskMatch[1]) ? "done" : "todo";
      const itemAttrs = task ? ` data-ff-task-item="true" data-ff-task-state="${state}"` : "";
      return `<li${itemAttrs}>${renderInlineMarkdown(content)}</li>`;
    })
    .join("");
  return `<${tag}${attrs}>${items}</${tag}>`;
}

function renderTable(lines = []) {
  const rows = lines.map((line) => splitTableRow(line));
  if (rows.length < 2 || !isTableSeparator(lines[1])) {
    return renderParagraph(lines);
  }
  const header = rows[0]
    .map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`)
    .join("");
  const bodyRows = rows.slice(2).map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("");
  return `<table data-ff-md-table="true"><thead><tr>${header}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

export function renderMarkdownPlainTextToRichHtml(text = "") {
  const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!source) {
    return "";
  }
  const lines = source.split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!String(line || "").trim()) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.max(1, Math.min(6, heading[1].length));
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push('<hr data-ff-divider="true">');
      index += 1;
      continue;
    }
    if (/^```/.test(line)) {
      const fence = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        fence.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(`<pre data-ff-code-block="true"><code>${escapeHtml(fence.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      const mathLines = [];
      index += 1;
      while (index < lines.length && !/^\s*\$\$\s*$/.test(lines[index])) {
        mathLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(`<div data-role="math-block">${escapeHtml(mathLines.join("\n").trim())}</div>`);
      continue;
    }
    if (/^\s*\\\[\s*$/.test(line)) {
      const mathLines = [];
      index += 1;
      while (index < lines.length && !/^\s*\\\]\s*$/.test(lines[index])) {
        mathLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(`<div data-role="math-block">${escapeHtml(mathLines.join("\n").trim())}</div>`);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${renderParagraph(quoteLines)}</blockquote>`);
      continue;
    }
    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
      const taskLines = [];
      while (index < lines.length && /^\s*[-*+]\s+\[[ xX]\]\s+/.test(lines[index])) {
        taskLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderList(taskLines, { task: true }));
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const listLines = [];
      while (
        index < lines.length &&
        /^\s*[-*+]\s+/.test(lines[index]) &&
        !/^\s*[-*+]\s+\[[ xX]\]\s+/.test(lines[index])
      ) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderList(listLines, { ordered: false }));
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const listLines = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderList(listLines, { ordered: true }));
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && String(lines[index] || "").trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderTable(tableLines));
      continue;
    }
    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && String(lines[index] || "").trim()) {
      const nextLine = lines[index];
        if (
          /^(#{1,6})\s+/.test(nextLine) ||
          /^```/.test(nextLine) ||
          /^\s*\$\$\s*$/.test(nextLine) ||
          /^\s*\\\[\s*$/.test(nextLine) ||
          /^\s*>/.test(nextLine) ||
          /^\s*[-*+]\s+/.test(nextLine) ||
          /^\s*\d+\.\s+/.test(nextLine) ||
        /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(nextLine)
      ) {
        break;
      }
      paragraphLines.push(nextLine);
      index += 1;
    }
    blocks.push(renderParagraph(paragraphLines));
  }
  return blocks.join("");
}
