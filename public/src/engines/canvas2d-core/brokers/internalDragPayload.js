export const INTERNAL_DRAG_PAYLOAD_MIME = "application/x-freeflow-canvas2d-drag";
export const INTERNAL_DRAG_PAYLOAD_TYPE = "freeflow-canvas2d-drag";
export const INTERNAL_DRAG_PAYLOAD_VERSION = 1;

export function stringifyInternalDragPayload({ marker = "", payload = null } = {}) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.items) || !payload.items.length) {
    return "";
  }
  try {
    return JSON.stringify({
      type: INTERNAL_DRAG_PAYLOAD_TYPE,
      version: INTERNAL_DRAG_PAYLOAD_VERSION,
      marker: String(marker || ""),
      payload,
    });
  } catch {
    return "";
  }
}

export function parseInternalDragPayload(rawValue = "") {
  try {
    const parsed = JSON.parse(String(rawValue || "").trim());
    if (
      !parsed ||
      parsed.type !== INTERNAL_DRAG_PAYLOAD_TYPE ||
      Number(parsed.version) !== INTERNAL_DRAG_PAYLOAD_VERSION ||
      !parsed.payload ||
      typeof parsed.payload !== "object" ||
      !Array.isArray(parsed.payload.items) ||
      !parsed.payload.items.length ||
      !parsed.payload.items.every((item) => item && typeof item === "object")
    ) {
      return null;
    }
    return {
      marker: String(parsed.marker || ""),
      payload: parsed.payload,
    };
  } catch {
    return null;
  }
}
