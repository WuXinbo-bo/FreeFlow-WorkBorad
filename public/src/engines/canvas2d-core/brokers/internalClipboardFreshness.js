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
  payloadPaths = [],
  clipboardPaths = [],
  payloadText = "",
  clipboardText = "",
} = {}) {
  if (!payload?.items?.length) {
    return false;
  }
  if (marker) {
    return matchesInternalClipboardMarker(marker, payload);
  }
  if (payloadPaths.length || clipboardPaths.length) {
    return arraysEqual(payloadPaths, clipboardPaths);
  }
  return Boolean(payloadText && clipboardText && payloadText === clipboardText);
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}
