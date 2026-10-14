function isEscaped(source, index) {
  let slashes = 0;
  while (index > 0 && source[--index] === "\\") slashes += 1;
  return slashes % 2 === 1;
}

// Recognize only a complete pair. Unfinished input remains editable text.
export function readLatexSpan(source = "", start = 0) {
  if (isEscaped(source, start)) return null;
  const opener = ["$$", "\\[", "\\(", "$"].find(value => source.startsWith(value, start));
  if (!opener || (opener === "$" && source[start - 1] === "$")) return null;
  const closer = { "$$": "$$", "\\[": "\\]", "\\(": "\\)", "$": "$" }[opener];
  let end = source.indexOf(closer, start + opener.length);
  while (end >= 0 && (isEscaped(source, end) || (opener === "$" && (source[end - 1] === "$" || source[end + 1] === "$")))) {
    end = source.indexOf(closer, end + closer.length);
  }
  if (end < 0) return null;
  const body = source.slice(start + opener.length, end);
  if (!body.trim()) return null;
  if (opener === "$" && (body.includes("\n") || /\d/.test(source[end + 1] || ""))) return null;
  return { start, end: end + closer.length, formula: body.trim(), displayMode: opener === "$$" || opener === "\\[" };
}

export function normalizeLatexSource(value = "") {
  const source = String(value || "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();
  // Explicit math nodes can contain padding even when ordinary dollar text
  // would be rejected by the currency/whitespace rules.
  for (const [open, close] of [["$$", "$$"], ["\\[", "\\]"], ["\\(", "\\)"], ["$", "$"]]) {
    if (source.length > open.length + close.length && source.startsWith(open) && source.endsWith(close) && !isEscaped(source, source.length - close.length)) {
      const body = source.slice(open.length, -close.length);
      if (!body.includes(close)) return body.trim();
    }
  }
  const span = readLatexSpan(source);
  return span?.end === source.length ? span.formula : source;
}

export function formatLatexSource(value = "", displayMode = false) {
  const source = normalizeLatexSource(value);
  return source ? (displayMode ? `$$\n${source}\n$$` : `$${source}$`) : "";
}

export function findLatexSpans(value = "") {
  const source = String(value || "");
  const spans = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "$" && source[index] !== "\\") continue;
    const span = readLatexSpan(source, index);
    if (span) { spans.push(span); index = span.end - 1; }
    else if (source.startsWith("$$", index)) index += 1;
  }
  return spans;
}
