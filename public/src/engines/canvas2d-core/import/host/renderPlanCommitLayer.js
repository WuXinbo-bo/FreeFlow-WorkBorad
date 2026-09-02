import { getElementBounds, normalizeBoard, normalizeElement } from "../../elements/index.js";
import { buildExportReadyBoardItems } from "../../export/buildExportReadyBoardItems.js";
import {
  applyRenderLayoutWriteback,
  applyRenderLayoutWritebackAsync,
  getImportedBatchLayoutIssues,
  stabilizeImportedBatchLayout,
} from "./renderLayoutWriteback.js";

export function createRenderPlanCommitLayer(options = {}) {
  const applyLayout = typeof options.applyLayout === "function" ? options.applyLayout : applyRenderLayoutWriteback;
  const applyLayoutAsync =
    typeof options.applyLayoutAsync === "function" ? options.applyLayoutAsync : applyRenderLayoutWritebackAsync;

  function commit({ board, renderResult, bridgeResult, anchorPoint, batchId } = {}) {
    const plan = extractPlan(renderResult, bridgeResult);
    if (!plan) {
      return {
        ok: false,
        error: {
          code: "missing-render-plan",
          message: "Render plan commit layer requires a render result or bridge result.",
        },
        board: normalizeBoard(board || {}),
      };
    }

    const diagnostics = collectStructuredOperationDiagnostics(plan);
    const layoutResult = applyLayout(plan, { anchorPoint, batchId });
    return buildCommitResult(board, plan, diagnostics, layoutResult);
  }

  async function commitAsync({ board, renderResult, bridgeResult, anchorPoint, batchId, yieldControl, signal } = {}) {
    const plan = extractPlan(renderResult, bridgeResult);
    if (!plan) {
      return {
        ok: false,
        error: {
          code: "missing-render-plan",
          message: "Render plan commit layer requires a render result or bridge result.",
        },
        board: normalizeBoard(board || {}),
      };
    }

    const diagnostics = collectStructuredOperationDiagnostics(plan);
    const layoutResult = await applyLayoutAsync(plan, {
      anchorPoint,
      batchId,
      yieldControl,
      signal,
    });
    return buildCommitResult(board, plan, diagnostics, layoutResult);
  }

  return {
    commit,
    commitAsync,
  };
}

function buildCommitResult(board, plan, diagnostics, layoutResult) {
  const normalizedBoard = normalizeBoard({
    ...(board && typeof board === "object" ? board : {}),
    items: [],
  });
  const existingItems = Array.isArray(board?.items) ? board.items : [];
  const committedItems = stabilizeImportedBatchLayout(
    normalizeCommittedItems(layoutResult?.items || []),
    { remeasure: false }
  );
  const layoutIssues = getImportedBatchLayoutIssues(committedItems);
  const nextBoard = {
    ...normalizedBoard,
    items: existingItems.concat(committedItems),
    selectedIds: committedItems.map((item) => item.id),
  };

  return {
    ok: true,
    kind: "commit-result",
    planId: String(plan.planId || ""),
    batchId: String(layoutResult?.batchId || ""),
    board: nextBoard,
    items: committedItems,
    commits: rebuildCommits(layoutResult?.commits || [], committedItems),
    diagnostics,
    layoutIssues,
    stats: {
      committedCount: committedItems.length,
      selectedCount: nextBoard.selectedIds.length,
      structuredWarningCount: diagnostics.warnings.length,
      layoutIssueCount: layoutIssues.length,
    },
  };
}

function rebuildCommits(commits = [], items = []) {
  const itemMap = new Map(items.map((item) => [String(item?.id || ""), item]));
  return (Array.isArray(commits) ? commits : []).map((commit) => {
    const item = itemMap.get(String(commit?.item?.id || "")) || commit.item;
    return {
      ...commit,
      item,
      bounds: item ? getElementBounds(item) : commit.bounds,
    };
  });
}

function normalizeCommittedItems(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }
  return buildExportReadyBoardItems(items.map((item) => normalizeElement(item)));
}

function collectStructuredOperationDiagnostics(plan = {}) {
  const operations = Array.isArray(plan?.operations) ? plan.operations : [];
  const warnings = [];
  operations.forEach((operation, index) => {
    const operationType = String(operation?.type || "").trim().toLowerCase();
    const elementType = String(operation?.element?.type || "").trim().toLowerCase();
    if (operationType === "render-table-block" || elementType === "table") {
      const rowCount = Array.isArray(operation?.structure?.rows) ? operation.structure.rows.length : 0;
      if (!rowCount) {
        warnings.push({
          index,
          code: "table-rows-missing",
          message: "render-table-block operation has no structured rows; bridge will fallback to empty table.",
        });
      }
    }
    if (operationType === "render-code-block" || elementType === "codeblock") {
      const text = String(operation?.structure?.code || operation?.element?.text || "");
      const language = String(operation?.structure?.language || operation?.element?.language || "");
      const theme = String(operation?.structure?.theme || operation?.element?.theme || "");
      const sourceMeta = operation?.meta && typeof operation.meta === "object" ? operation.meta : operation?.element?.sourceMeta;
      if (!text.trim()) {
        warnings.push({
          index,
          code: "code-text-empty",
          message: "render-code-block operation has empty code payload.",
        });
      }
      if (!language.trim()) {
        warnings.push({
          index,
          code: "code-language-missing",
          message: "render-code-block operation has no language; fallback to plain code block.",
        });
      }
      if (!theme.trim()) {
        warnings.push({
          index,
          code: "code-theme-missing",
          message: "render-code-block operation has no theme; fallback to default theme.",
        });
      }
      if (!sourceMeta || typeof sourceMeta !== "object") {
        warnings.push({
          index,
          code: "code-source-meta-missing",
          message: "render-code-block operation has no source meta payload.",
        });
      }
    }
    if (operationType === "render-math-block" || operationType === "render-math-inline" || elementType === "mathblock" || elementType === "mathinline") {
      const formula = String(operation?.structure?.formula || operation?.element?.formula || "");
      const renderState = String(operation?.element?.renderState || operation?.structure?.renderState || "").trim().toLowerCase();
      if (!formula.trim()) {
        warnings.push({
          index,
          code: "math-formula-empty",
          message: "render-math operation has empty formula payload.",
        });
      }
      if (renderState && !["ready", "fallback", "error", "fallback-text"].includes(renderState)) {
        warnings.push({
          index,
          code: "math-render-state-invalid",
          message: "render-math operation uses unsupported renderState value.",
        });
      }
    }
    if (operationType === "render-table-block" || elementType === "table") {
      const rows = Array.isArray(operation?.structure?.rows) ? operation.structure.rows : [];
      const invalidRow = rows.findIndex((row) => !Array.isArray(row?.cells) || !row.cells.length);
      if (invalidRow >= 0) {
        warnings.push({
          index,
          code: "table-row-cells-missing",
          message: `render-table-block row ${invalidRow} has no cells.`,
        });
      }
    }
  });
  return {
    operationCount: operations.length,
    warnings,
  };
}

export function extractPlan(renderResult, bridgeResult) {
  const candidates = [renderResult, bridgeResult];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    if (candidate.result && typeof candidate.result === "object" && Array.isArray(candidate.result.operations)) {
      return candidate.result;
    }
    if (Array.isArray(candidate.operations)) {
      return candidate;
    }
  }
  return null;
}
