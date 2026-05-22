import { getTextMinSize, TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT, TEXT_RESIZE_MODE_WRAP } from "./text.js";

export const MIND_LAYOUT_MODE_HORIZONTAL = "horizontal";
export const MIND_BRANCH_AUTO = "auto";
export const MIND_BRANCH_LEFT = "left";
export const MIND_BRANCH_RIGHT = "right";
export const MIND_NODE_HORIZONTAL_GAP = 88;
export const MIND_NODE_VERTICAL_GAP = 26;
export const MIND_SUMMARY_TYPE = "mindSummary";

function uniqueIds(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
}

export function isMindMapNode(item = {}) {
  return item?.type === "mindNode";
}

export function isMindSummaryItem(item = {}) {
  return item?.type === MIND_SUMMARY_TYPE;
}

export function normalizeMindBranchSide(value = "", fallback = MIND_BRANCH_AUTO) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === MIND_BRANCH_LEFT || normalized === MIND_BRANCH_RIGHT || normalized === MIND_BRANCH_AUTO) {
    return normalized;
  }
  return fallback;
}

export function normalizeMindLayoutMode(value = "", fallback = MIND_LAYOUT_MODE_HORIZONTAL) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === MIND_LAYOUT_MODE_HORIZONTAL ? normalized : fallback;
}

export function normalizeMindChildrenIds(value = []) {
  return uniqueIds(value);
}

export function syncMindNodeTextMetrics(item = {}) {
  const next = { ...item };
  const metrics = getTextMinSize(
    {
      ...next,
      text: next.plainText || next.text || next.title || "",
      plainText: next.plainText || next.text || next.title || "",
      html: next.html || "",
      richTextDocument: next.richTextDocument || null,
      textBoxLayoutMode: TEXT_BOX_LAYOUT_MODE_AUTO_HEIGHT,
      textResizeMode: TEXT_RESIZE_MODE_WRAP,
    },
    {
      widthHint: Math.max(180, Number(next.width || 0) || 220),
      fontSize: Math.max(12, Number(next.fontSize || 18) || 18),
    }
  );
  next.width = Math.max(180, Number(metrics.width || next.width || 220) || 220);
  next.height = Math.max(72, Number(metrics.height || next.height || 96) || 96);
  return next;
}

export function buildMindMapIndex(items = []) {
  const allItems = Array.isArray(items) ? items : [];
  const nodes = allItems.filter(isMindMapNode);
  const summaries = allItems.filter(isMindSummaryItem);
  const byId = new Map(nodes.map((node) => [String(node.id || ""), node]));
  const childrenByParent = new Map();
  nodes.forEach((node) => {
    childrenByParent.set(String(node.id || ""), []);
  });
  nodes.forEach((node) => {
    const parentId = String(node.parentId || "").trim();
    if (!parentId || !byId.has(parentId)) {
      return;
    }
    const bucket = childrenByParent.get(parentId) || [];
    bucket.push(node);
    childrenByParent.set(parentId, bucket);
  });
  childrenByParent.forEach((bucket, parentId) => {
    const parent = byId.get(parentId);
    const childOrderIds = normalizeMindChildrenIds(parent?.childrenIds || []);
    bucket.sort((left, right) => {
      const leftId = String(left.id || "");
      const rightId = String(right.id || "");
      const leftIndex = childOrderIds.indexOf(leftId);
      const rightIndex = childOrderIds.indexOf(rightId);
      const safeLeftIndex = leftIndex >= 0 ? leftIndex : Number(left.order ?? Number.MAX_SAFE_INTEGER);
      const safeRightIndex = rightIndex >= 0 ? rightIndex : Number(right.order ?? Number.MAX_SAFE_INTEGER);
      if (safeLeftIndex !== safeRightIndex) {
        return safeLeftIndex - safeRightIndex;
      }
      return Number(left.createdAt || 0) - Number(right.createdAt || 0);
    });
  });
  return {
    nodes,
    summaries,
    byId,
    childrenByParent,
  };
}

function hasCollapsedAncestor(index, node) {
  let current = node;
  while (current?.parentId) {
    const parent = index.byId.get(String(current.parentId || ""));
    if (!parent) {
      return false;
    }
    if (parent.collapsed) {
      return true;
    }
    current = parent;
  }
  return false;
}

function resolveEffectiveBranchSide(node, parent, siblingIndex = 0) {
  const explicit = normalizeMindBranchSide(node?.branchSide, MIND_BRANCH_AUTO);
  if (explicit !== MIND_BRANCH_AUTO) {
    return explicit;
  }
  if (!parent) {
    return MIND_BRANCH_RIGHT;
  }
  if (!parent.parentId) {
    return MIND_BRANCH_RIGHT;
  }
  return normalizeMindBranchSide(parent.branchSide, MIND_BRANCH_RIGHT);
}

function measureSubtreeHeight(node, index, depth = 0) {
  if (!node || node.collapsed) {
    return Math.max(Number(node?.height || 72) || 72, 72);
  }
  const children = index.childrenByParent.get(String(node.id || "")) || [];
  if (!children.length) {
    return Math.max(Number(node.height || 72) || 72, 72);
  }
  const heights = children.map((child) => measureSubtreeHeight(child, index, depth + 1));
  const total = heights.reduce((sum, value) => sum + value, 0) + Math.max(0, heights.length - 1) * MIND_NODE_VERTICAL_GAP;
  return Math.max(Number(node.height || 72) || 72, total);
}

function layoutBranch(parent, children, side, index, patchById) {
  if (!children.length) {
    return;
  }
  const subtreeHeights = children.map((child) => measureSubtreeHeight(child, index));
  const totalHeight =
    subtreeHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, subtreeHeights.length - 1) * MIND_NODE_VERTICAL_GAP;
  let cursorY = Number(parent.y || 0) + Number(parent.height || 72) / 2 - totalHeight / 2;
  children.forEach((child, siblingIndex) => {
    const subtreeHeight = subtreeHeights[siblingIndex];
    const childWidth = Math.max(180, Number(child.width || 220) || 220);
    const childHeight = Math.max(72, Number(child.height || 96) || 96);
    const nextX =
      side === MIND_BRANCH_LEFT
        ? Number(parent.x || 0) - MIND_NODE_HORIZONTAL_GAP - childWidth
        : Number(parent.x || 0) + Number(parent.width || 220) + MIND_NODE_HORIZONTAL_GAP;
    const nextY = cursorY + subtreeHeight / 2 - childHeight / 2;
    patchById.set(String(child.id || ""), {
      x: Math.round(nextX),
      y: Math.round(nextY),
      depth: Math.max(0, Number(parent.depth || 0) + 1),
      rootId: String(parent.rootId || parent.id || child.rootId || child.id || ""),
      branchSide: side,
      order: siblingIndex,
    });
    cursorY += subtreeHeight + MIND_NODE_VERTICAL_GAP;
    if (!child.collapsed) {
      const grandChildren = index.childrenByParent.get(String(child.id || "")) || [];
      layoutBranch(child, grandChildren, side, index, patchById);
    }
  });
}

export function applyMindMapAutoLayout(items = [], rootId = "", options = {}) {
  const safeRootId = String(rootId || "").trim();
  if (!safeRootId) {
    return Array.isArray(items) ? items.slice() : [];
  }
  const nextItems = Array.isArray(items) ? items.slice() : [];
  const index = buildMindMapIndex(nextItems);
  const root = index.byId.get(safeRootId);
  if (!root) {
    return nextItems;
  }
  const patchById = new Map();
  patchById.set(safeRootId, {
    depth: 0,
    rootId: safeRootId,
    branchSide: normalizeMindBranchSide(root.branchSide, MIND_BRANCH_RIGHT),
  });
  const rootChildren = index.childrenByParent.get(safeRootId) || [];
  const leftChildren = [];
  const rightChildren = [];
  rootChildren.forEach((child, siblingIndex) => {
    const side = resolveEffectiveBranchSide(child, root, siblingIndex);
    if (side === MIND_BRANCH_LEFT) {
      leftChildren.push(child);
    } else {
      rightChildren.push(child);
    }
  });
  layoutBranch(root, rightChildren, MIND_BRANCH_RIGHT, index, patchById);
  layoutBranch(root, leftChildren, MIND_BRANCH_LEFT, index, patchById);
  const laidOutItems = nextItems.map((item) => {
    if (!isMindMapNode(item)) {
      return item;
    }
    const patch = patchById.get(String(item.id || ""));
    if (!patch) {
      return item;
    }
    return {
      ...item,
      ...patch,
    };
  });
  const laidOutIndex = buildMindMapIndex(laidOutItems);
  return laidOutItems.map((item) => {
    if (!isMindSummaryItem(item)) {
      return item;
    }
    const siblingIds = normalizeMindChildrenIds(item.siblingIds || []);
    const siblingNodes = siblingIds
      .map((id) => laidOutIndex.byId.get(id))
      .filter((node) => node && String(node.parentId || "") === String(item.summaryOwnerId || ""));
    if (siblingNodes.length < 2) {
      return item;
    }
    const side = normalizeMindBranchSide(
      item.branchSide || siblingNodes[0]?.branchSide,
      normalizeMindBranchSide(siblingNodes[0]?.branchSide, MIND_BRANCH_RIGHT)
    );
    const left = Math.min(...siblingNodes.map((node) => Number(node.x || 0)));
    const top = Math.min(...siblingNodes.map((node) => Number(node.y || 0)));
    const right = Math.max(...siblingNodes.map((node) => Number(node.x || 0) + Number(node.width || 0)));
    const bottom = Math.max(...siblingNodes.map((node) => Number(node.y || 0) + Number(node.height || 0)));
    const width = Math.max(180, Number(item.width || 220) || 220);
    const height = Math.max(72, Number(item.height || 96) || 96);
    const x = side === MIND_BRANCH_LEFT ? left - width - 104 : right + 104;
    const y = top + (bottom - top) / 2 - height / 2;
    return {
      ...item,
      x: Math.round(x),
      y: Math.round(y),
      rootId: String(siblingNodes[0]?.rootId || item.rootId || rootId || ""),
      depth: Math.max(0, Number(siblingNodes[0]?.depth || item.depth || 0)),
      order: Math.max(0, Number(siblingNodes[0]?.order || item.order || 0)),
      branchSide: side,
    };
  });
}

export function collectMindMapVisibleConnections(items = []) {
  const index = buildMindMapIndex(items);
  const connections = [];
  index.nodes.forEach((node) => {
    const parentId = String(node.parentId || "").trim();
    if (!parentId) {
      return;
    }
    const parent = index.byId.get(parentId);
    if (!parent || hasCollapsedAncestor(node)) {
      return;
    }
    const side = normalizeMindBranchSide(node.branchSide, MIND_BRANCH_RIGHT);
    connections.push({
      parentId,
      childId: String(node.id || ""),
      side,
    });
  });
  return connections;
}

export function collectMindMapVisibleSummaries(items = []) {
  const index = buildMindMapIndex(items);
  return index.summaries.filter((summary) => {
    const siblingIds = normalizeMindChildrenIds(summary?.siblingIds || []);
    if (siblingIds.length < 2) {
      return false;
    }
    const siblingNodes = siblingIds
      .map((id) => index.byId.get(id))
      .filter((node) => node && String(node.parentId || "") === String(summary.summaryOwnerId || ""));
    if (siblingNodes.length < 2) {
      return false;
    }
    return siblingNodes.every((node) => !hasCollapsedAncestor(index, node));
  });
}

export function isMindMapItemVisible(item = {}, items = []) {
  if (!item || typeof item !== "object") {
    return true;
  }
  const index = buildMindMapIndex(items);
  if (isMindMapNode(item)) {
    return !hasCollapsedAncestor(index, item);
  }
  if (isMindSummaryItem(item)) {
    const siblingIds = normalizeMindChildrenIds(item?.siblingIds || []);
    if (siblingIds.length < 2) {
      return false;
    }
    const siblingNodes = siblingIds
      .map((id) => index.byId.get(id))
      .filter((node) => node && String(node.parentId || "") === String(item.summaryOwnerId || ""));
    if (siblingNodes.length < 2) {
      return false;
    }
    return siblingNodes.every((node) => !hasCollapsedAncestor(index, node));
  }
  return true;
}
