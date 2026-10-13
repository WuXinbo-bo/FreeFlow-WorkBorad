// Map normalized search offsets back to the original DOM, including split Word runs.
export function findPreviewText(root, query, startOffset = 0) {
  const keyword = String(query || "").trim().normalize("NFKC").toLowerCase();
  if (!root || !keyword) return null;
  const nodes = [];
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  let text = "", node, previousBlock = null;
  while ((node = walker.nextNode())) {
    if (!node.textContent || node.parentElement?.closest("script,style")) continue;
    const block = node.parentElement?.closest("p,div,li,td,th,pre,h1,h2,h3,h4,h5,h6");
    if (nodes.length && block !== previousBlock) text += "\n";
    nodes.push({ node, start: text.length, end: text.length + node.textContent.length });
    text += node.textContent;
    previousBlock = block;
  }
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text);
  let normalized = "";
  const offsets = [];
  for (const { segment, index } of segments) {
    const value = segment.normalize("NFKC").toLowerCase();
    for (let i = 0; i < value.length; i++) offsets.push({ start: index, end: index + segment.length });
    normalized += value;
  }
  let index = normalized.indexOf(keyword, Math.max(0, startOffset));
  if (index < 0 && startOffset > 0) index = normalized.indexOf(keyword);
  if (index < 0) return null;
  const start = offsets[index].start, end = offsets[index + keyword.length - 1].end;
  const first = nodes.find((entry) => entry.start <= start && entry.end > start);
  const last = nodes.find((entry) => entry.start < end && entry.end >= end);
  if (!first || !last) return null;
  const range = root.ownerDocument.createRange();
  range.setStart(first.node, start - first.start);
  range.setEnd(last.node, end - last.start);
  return { range, nextOffset: index + keyword.length };
}
