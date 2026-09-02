export const CANVAS_OPERATION_STATUS = Object.freeze({
  SUCCESS: "success",
  DEGRADED: "degraded",
  FAILED: "failed",
  CANCELED: "canceled",
});

const SUCCESS_ENTRY_STATES = new Set(["completed", "consumed", "stored", "written"]);
const DEGRADED_ENTRY_STATES = new Set(["degraded", "skipped"]);
const FAILED_ENTRY_STATES = new Set(["failed"]);

function uniqueStrings(values = []) {
  return Array.from(
    new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))
  );
}

function normalizeEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => ({
      id: String(entry.id || entry.itemId || entry.entryId || `entry-${index + 1}`),
      type: String(entry.type || entry.itemType || entry.kind || "unknown"),
      status: String(entry.status || "completed"),
      reason: String(entry.reason || ""),
      requestedFormat: String(entry.requestedFormat || ""),
      providedFormat: String(entry.providedFormat || ""),
    }));
}

function deriveStatus({ explicitStatus, canceled, available, entries, errors, requestedFormats, providedFormats }) {
  if (Object.values(CANVAS_OPERATION_STATUS).includes(explicitStatus)) {
    return explicitStatus;
  }
  if (canceled) {
    return CANVAS_OPERATION_STATUS.CANCELED;
  }
  if (!available) {
    return CANVAS_OPERATION_STATUS.FAILED;
  }
  const entryStatuses = entries.map((entry) => entry.status);
  const requestedMissing = requestedFormats.some((format) => !providedFormats.includes(format));
  if (
    requestedMissing ||
    errors.length ||
    entryStatuses.some((status) => DEGRADED_ENTRY_STATES.has(status) || FAILED_ENTRY_STATES.has(status))
  ) {
    return CANVAS_OPERATION_STATUS.DEGRADED;
  }
  return CANVAS_OPERATION_STATUS.SUCCESS;
}

export function createCanvasOperationResult(options = {}) {
  const operation = String(options.operation || "unknown");
  const requestedFormats = uniqueStrings(options.requestedFormats);
  const providedFormats = uniqueStrings(options.providedFormats);
  const entries = normalizeEntries(options.entries);
  const errors = (Array.isArray(options.errors) ? options.errors : [])
    .filter(Boolean)
    .map((error) => ({
      code: String(error?.code || "OPERATION_FAILED"),
      message: String(error?.message || ""),
      stage: String(error?.stage || ""),
    }));
  const internalStored = options.internalStored === true;
  const systemWritten = options.systemWritten === true;
  const hasCompletedEntry = entries.some((entry) => SUCCESS_ENTRY_STATES.has(entry.status));
  const available = options.available === true || internalStored || systemWritten || providedFormats.length > 0 || hasCompletedEntry;
  const status = deriveStatus({
    explicitStatus: String(options.status || ""),
    canceled: options.canceled === true,
    available,
    entries,
    errors,
    requestedFormats,
    providedFormats,
  });
  const skippedCount = entries.filter((entry) => entry.status === "skipped").length;
  const failedCount = entries.filter((entry) => entry.status === "failed").length;
  const degradedCount = entries.filter((entry) => entry.status === "degraded").length;

  return {
    kind: "canvas-operation-result-v1",
    operation,
    status,
    ok: status === CANVAS_OPERATION_STATUS.SUCCESS || status === CANVAS_OPERATION_STATUS.DEGRADED,
    canceled: status === CANVAS_OPERATION_STATUS.CANCELED,
    code: String(options.code || ""),
    message: String(options.message || ""),
    internalStored,
    systemWritten,
    fallbackUsed: options.fallbackUsed === true,
    requestedFormats,
    providedFormats,
    entries,
    skippedCount,
    degradedCount,
    failedCount,
    errors,
  };
}

export function attachCanvasOperationManifest(result = {}, options = {}) {
  const source = result && typeof result === "object" ? result : {};
  const entries = Array.isArray(options.entries)
    ? options.entries
    : Array.isArray(source.operationEntries)
      ? source.operationEntries
    : Array.isArray(source.skippedItems)
      ? source.skippedItems.map((item) => ({ ...item, status: "skipped" }))
      : [];
  const manifest = createCanvasOperationResult({
    operation: options.operation,
    status: source.canceled
      ? CANVAS_OPERATION_STATUS.CANCELED
      : source.ok === true && (
          options.degraded === true ||
          source.downgraded === true ||
          Number(source.exportImageFallbackCount || 0) > 0 ||
          entries.some((entry) => entry?.status === "skipped" || entry?.status === "degraded")
        )
        ? CANVAS_OPERATION_STATUS.DEGRADED
        : options.status,
    canceled: source.canceled,
    available: source.ok === true,
    code: source.code,
    message: source.message,
    requestedFormats: options.requestedFormats,
    providedFormats: source.ok === true ? options.providedFormats : [],
    entries,
    errors: source.ok === false && !source.canceled
      ? [{ code: source.code || "OPERATION_FAILED", message: source.message || "", stage: options.stage || "" }]
      : [],
  });
  return { ...source, operationResult: manifest };
}
