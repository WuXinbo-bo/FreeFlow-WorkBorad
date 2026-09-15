export function matchesInternalClipboardMarker(marker = null, payload = null) {
  if (!marker || !payload) {
    return false;
  }
  const markerId = String(marker.clipboardId || "").trim();
  const payloadId = String(payload.clipboardId || "").trim();
  if (markerId || payloadId) {
    return Boolean(markerId && payloadId && markerId === payloadId);
  }
  return Number(marker.copiedAt || 0) > 0 && Number(marker.copiedAt) === Number(payload.copiedAt);
}

export function resolveInternalClipboardFreshness({
  payload = null,
  marker = null,
} = {}) {
  if (!payload?.items?.length) {
    return false;
  }
  if (marker) {
    return matchesInternalClipboardMarker(marker, payload);
  }
  return false;
}
