export function deriveNodeSourceOrder(node, fallback = 0) {
  const originId = String(node?.meta?.originId || "").trim();
  const fromOriginId = parseOriginIdOrderPath(originId);
  if (fromOriginId.length) {
    return buildComparableSourceOrder(fromOriginId);
  }
  const value = Number(fallback);
  return Number.isFinite(value) ? value : 0;
}

function buildComparableSourceOrder(parts = []) {
  const base = 1000;
  return parts.reduce((sum, part, index) => {
    const normalized = Math.max(0, Number(part) || 0) + 1;
    return sum + normalized / Math.pow(base, index + 1);
  }, 0);
}

function parseOriginIdOrderPath(originId) {
  if (!originId) {
    return [];
  }
  return Array.from(String(originId).matchAll(/-(\d+)(?=-|$)/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
}
