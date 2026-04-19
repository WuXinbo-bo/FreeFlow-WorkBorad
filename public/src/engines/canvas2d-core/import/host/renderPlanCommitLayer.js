import { normalizeBoard } from "../../elements/index.js";
import { applyRenderLayoutWriteback } from "./renderLayoutWriteback.js";

export function createRenderPlanCommitLayer(options = {}) {
  const applyLayout = typeof options.applyLayout === "function" ? options.applyLayout : applyRenderLayoutWriteback;

  function commit({ board, renderResult, bridgeResult, anchorPoint } = {}) {
    const normalizedBoard = normalizeBoard(board || {});
    const plan = extractPlan(renderResult, bridgeResult);
    if (!plan) {
      return {
        ok: false,
        error: {
          code: "missing-render-plan",
          message: "Render plan commit layer requires a render result or bridge result.",
        },
        board: normalizedBoard,
      };
    }

    const layoutResult = applyLayout(plan, { anchorPoint });
    const nextBoard = normalizeBoard({
      ...normalizedBoard,
      items: normalizedBoard.items.concat(layoutResult.items),
      selectedIds: layoutResult.items.map((item) => item.id),
    });

    return {
      ok: true,
      kind: "commit-result",
      planId: String(plan.planId || ""),
      board: nextBoard,
      items: layoutResult.items,
      commits: layoutResult.commits,
      stats: {
        committedCount: layoutResult.items.length,
        selectedCount: nextBoard.selectedIds.length,
      },
    };
  }

  return {
    commit,
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
