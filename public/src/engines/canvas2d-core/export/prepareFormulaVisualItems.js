import { captureElementSnapshot } from "../overlay/presentationSnapshotController.js";

// Only the export path allocates DOM snapshots; the board remains editable data.
export async function prepareFormulaVisualItems(items, { createSurface, signal } = {}) {
  const results = [];
  for (const item of items) {
    if (signal?.aborted) throw new DOMException("Export canceled", "AbortError");
    const html = item?.type === "table"
      ? (item.table?.rows || []).flatMap((row) => (row.cells || []).map((cell) => cell?.html || "")).join("")
      : String(item?.html || "");
    if (!/data-role=["']math-(?:inline|block)["']|\bkatex\b/i.test(html)) {
      results.push(item);
      continue;
    }
    const surface = createSurface?.(item);
    if (!surface) throw new Error("当前公式内容无法生成图片预览");
    Object.assign(surface.style, { position: "fixed", left: "-100000px", top: "0", pointerEvents: "none" });
    document.body.appendChild(surface);
    try {
      await document.fonts?.ready;
      if (signal?.aborted) throw new DOMException("Export canceled", "AbortError");
      const snapshot = await captureElementSnapshot(surface, { density: 2, maxPixels: 1_500_000 });
      if (signal?.aborted) throw new DOMException("Export canceled", "AbortError");
      const preserveNode = ["flowNode", "mindNode", "mindSummary"].includes(item.type);
      if (preserveNode) results.push({ ...item, html: "", text: "", plainText: "", title: "", richTextDocument: null, linkTokens: [] });
      results.push({ id: preserveNode ? `${item.id}-formula-visual` : item.id, type: "image", x: item.x, y: item.y, width: item.width, height: item.height,
        dataUrl: snapshot.dataUrl, source: "data", naturalWidth: snapshot.pixelWidth, naturalHeight: snapshot.pixelHeight });
    } finally {
      surface.remove();
    }
  }
  return results;
}
