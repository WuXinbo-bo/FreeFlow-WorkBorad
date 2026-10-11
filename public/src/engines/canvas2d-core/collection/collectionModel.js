import { createTextElement } from "../elements/text.js";

export function parseStandaloneUrls(snapshot = {}) {
  if (snapshot.files?.length || snapshot.filePaths?.length || snapshot.markdown) return [];
  const lines = String(snapshot.uriList || snapshot.text || "").trim().split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#"));
  if (!lines.length || lines.length > 100) return [];
  const urls = [];
  for (const line of lines) {
    try {
      const url = new URL(line.trim());
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return [];
      urls.push(String(url));
    } catch { return []; }
  }
  if (snapshot.html && /<(table|pre|h[1-6]|img)\b/i.test(snapshot.html)) return [];
  if (snapshot.html && snapshot.html.replace(/<[^>]*>/g, "").replace(/\s+/g, "").replace(/&amp;/g, "&") !== lines.join("").replace(/\s+/g, "")) return [];
  return urls;
}
export function collectionMetadata(sourceKind, inbox, sourceUrl = "") {
  return { kind: "freeflow-collection-v1", sourceKind, capturedAt: Date.now(), sourceUrl, inbox: Boolean(inbox) };
}
export function createLinkCard(url, point, metadata, title = "") {
  const parsed = new URL(url);
  const label = title || parsed.hostname;
  const text = `${label}\n${parsed.hostname}\n${url}`;
  return { ...createTextElement(point, text), title: label, width: 360, height: 120,
    linkCard: { kind: "freeflow-link-card-v1", url, domain: parsed.hostname, title: label, fetchState: "pending" }, collection: metadata };
}
