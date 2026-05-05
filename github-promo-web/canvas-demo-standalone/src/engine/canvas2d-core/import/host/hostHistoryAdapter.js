import { pushHistory } from "../../history.js";

export function createHostHistoryAdapter() {
  function beginTransaction(snapshot, reason = "", meta = {}) {
    return {
      before: snapshot,
      reason: String(reason || "host-transaction"),
      meta: meta && typeof meta === "object" ? { ...meta } : {},
      startedAt: Date.now(),
    };
  }

  function commitTransaction(history, transaction, afterSnapshot) {
    const before = transaction?.before || null;
    const reason = String(transaction?.reason || "host-transaction");
    const pushed = pushHistory(history, before, afterSnapshot, reason);
    return {
      ok: pushed === true,
      reason,
      meta: transaction?.meta && typeof transaction.meta === "object" ? { ...transaction.meta } : {},
    };
  }

  function buildImportTransactionReason(items = []) {
    const types = Array.from(
      new Set((Array.isArray(items) ? items : []).map((item) => String(item?.type || "")).filter(Boolean))
    );
    return `structured-import:${types.join(",") || "items"}`;
  }

  return {
    beginTransaction,
    commitTransaction,
    buildImportTransactionReason,
  };
}
