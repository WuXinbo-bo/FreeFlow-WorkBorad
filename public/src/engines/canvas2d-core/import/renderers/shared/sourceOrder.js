export function deriveNodeSourceOrder(node, fallback = 0) {
  const originId = String(node?.meta?.originId || "").trim();
  const fromOriginId = parseOriginIdTrailingInteger(originId);
  if (Number.isFinite(fromOriginId)) {
    return fromOriginId;
  }
  const value = Number(fallback);
  return Number.isFinite(value) ? value : 0;
}

function parseOriginIdTrailingInteger(originId) {
  if (!originId) {
    return null;
  }
  const match = originId.match(/-(\d+)(?:-[^-]+)?$/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}
