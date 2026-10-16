// Keep the original task and file-operation guard until its outcome is known.
export async function runGithubSyncOperation(task, {
  client,
  onPending = () => {},
  onQueryError = () => {},
  waitForRetry = () => new Promise(resolve => setTimeout(resolve, 1000)),
} = {}) {
  try { return await task(); }
  catch (error) {
    if (["SYNC_OPERATION_INTERRUPTED", "COMMIT_CONFIRMED_RECHECK", "COMMIT_NOT_PUBLISHED_RECHECK"].includes(error.code)) {
      onPending({ id: error.operationId, phase: "interrupted", error });
    }
    if (error.code !== "SYNC_OPERATION_PENDING" || !error.operationId) throw error;
    const operationId = error.operationId;
    onPending({ id: operationId, phase: "confirming" });
    while (true) {
      let operation;
      try { operation = (await client.getOperation({ operationId })).operation; }
      catch (queryError) {
        if (queryError.code === "SYNC_OPERATION_NOT_FOUND") {
          const interrupted = Object.assign(new Error("未找到上次操作的记录，请先检查当前文件夹和远端差异后重试。"), { code: "SYNC_OPERATION_INTERRUPTED", operationId });
          onPending({ id: operationId, phase: "interrupted", error: interrupted });
          throw interrupted;
        }
        onQueryError(queryError);
      }
      if (operation?.phase === "completed") {
        onPending(null);
        return operation.journalWarning ? { ...operation.result, journalWarning: operation.journalWarning } : operation.result;
      }
      if (operation?.phase === "failed") {
        onPending(null);
        throw Object.assign(new Error(operation.error?.message || "同步操作失败"), operation.error);
      }
      if (operation?.phase === "interrupted") {
        onPending(operation);
        throw Object.assign(new Error(operation.error?.message || "上次同步被中断，请先检查当前文件夹和远端差异后再继续。"), { code: "SYNC_OPERATION_INTERRUPTED", operationId, ...operation.error });
      }
      await waitForRetry();
    }
  }
}

export function githubSyncResultWarning(result = {}) {
  return [...new Set([result.refreshWarning, result.ledgerWarning, result.journalWarning,
    ...(result.results || []).map(item => item.ledgerWarning || item.journalWarning)].filter(Boolean))].join(" ");
}
