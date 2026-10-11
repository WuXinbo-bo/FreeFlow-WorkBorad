import { getElementBounds } from "../elements/index.js";
import { getFlowNodeConnectors } from "../elements/flow.js";
import {
  collectMindMapVisibleConnections,
  collectMindMapVisibleSummaries,
  isMindMapItemVisible,
  MIND_BRANCH_LEFT,
} from "../elements/mindMap.js";
import { getMindRelationshipGeometry, isMindRelationshipItem } from "../elements/mindRelationship.js";
import { getMindNodeStyle, MIND_CONNECTION_STYLE, getMindCollapsedBadgeBounds } from "../elements/mindStyle.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(tagName, className = "") {
  const node = document.createElementNS(SVG_NS, tagName);
  if (className) {
    node.setAttribute("class", className);
  }
  return node;
}

function setAttribute(node, name, value) {
  const nextValue = String(value);
  if (node.getAttribute(name) !== nextValue) {
    node.setAttribute(name, nextValue);
  }
}

function setOptionalAttribute(node, name, value) {
  if (value == null || value === "") {
    node.removeAttribute(name);
    return;
  }
  setAttribute(node, name, value);
}

function getItemCenter(item) {
  const bounds = getElementBounds(item);
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
}

function getArrowPoints(fromPoint, toPoint, size = 12) {
  const angle = Math.atan2(toPoint.y - fromPoint.y, toPoint.x - fromPoint.x);
  return [
    [toPoint.x, toPoint.y],
    [toPoint.x - size * Math.cos(angle - Math.PI / 6), toPoint.y - size * Math.sin(angle - Math.PI / 6)],
    [toPoint.x - size * Math.cos(angle + Math.PI / 6), toPoint.y - size * Math.sin(angle + Math.PI / 6)],
  ].map((point) => point.join(",")).join(" ");
}

function createShapeNode() {
  return createSvgElement("g", "canvas2d-scene-vector-item canvas2d-scene-shape-item");
}

function syncShapeNode(node, item) {
  const shapeType = String(item.shapeType || "rect");
  if (node.dataset.shapeType !== shapeType) {
    const body = createSvgElement(shapeType === "ellipse" ? "ellipse" : shapeType === "line" || shapeType === "arrow" ? "line" : "rect");
    body.classList.add("canvas2d-scene-shape-body");
    node.replaceChildren(body);
    if (shapeType === "arrow") {
      node.appendChild(createSvgElement("polygon", "canvas2d-scene-shape-arrow"));
    }
    node.dataset.shapeType = shapeType;
  }
  const body = node.querySelector(".canvas2d-scene-shape-body");
  if (!(body instanceof SVGElement)) {
    return false;
  }
  const center = getItemCenter(item);
  const rotation = Number(item.rotation || 0) || 0;
  setOptionalAttribute(node, "transform", rotation ? `rotate(${rotation} ${center.x} ${center.y})` : "");
  const stroke = item.strokeColor || "#334155";
  const fill = item.fillColor || "transparent";
  setAttribute(body, "stroke", stroke);
  setAttribute(body, "fill", shapeType === "line" || shapeType === "arrow" ? "none" : fill);
  setAttribute(body, "stroke-width", Math.max(0.75, Number(item.strokeWidth || 2)));
  setAttribute(body, "stroke-linecap", "round");
  setAttribute(body, "stroke-linejoin", "round");
  setOptionalAttribute(body, "stroke-dasharray", shapeType === "line" && item.lineDash ? "8 6" : "");
  setAttribute(body, "fill-opacity", shapeType === "highlight" ? 0.95 : 1);
  setAttribute(body, "stroke-opacity", shapeType === "highlight" ? 0.42 : 1);
  if (shapeType === "ellipse") {
    setAttribute(body, "cx", Number(item.x || 0) + Number(item.width || 0) / 2);
    setAttribute(body, "cy", Number(item.y || 0) + Number(item.height || 0) / 2);
    setAttribute(body, "rx", Math.max(0.5, Number(item.width || 1) / 2));
    setAttribute(body, "ry", Math.max(0.5, Number(item.height || 1) / 2));
  } else if (shapeType === "line" || shapeType === "arrow") {
    const start = { x: Number(item.startX || 0), y: Number(item.startY || 0) };
    const end = { x: Number(item.endX || 0), y: Number(item.endY || 0) };
    setAttribute(body, "x1", start.x);
    setAttribute(body, "y1", start.y);
    setAttribute(body, "x2", end.x);
    setAttribute(body, "y2", end.y);
    const arrow = node.querySelector(".canvas2d-scene-shape-arrow");
    if (arrow instanceof SVGElement) {
      setAttribute(arrow, "points", getArrowPoints(start, end));
      setAttribute(arrow, "fill", stroke);
    }
  } else {
    setAttribute(body, "x", Number(item.x || 0));
    setAttribute(body, "y", Number(item.y || 0));
    setAttribute(body, "width", Math.max(1, Number(item.width || 1)));
    setAttribute(body, "height", Math.max(1, Number(item.height || 1)));
    setAttribute(body, "rx", shapeType === "highlight" ? 16 : Math.max(0, Number(item.radius || 18)));
  }
  return true;
}

function createFlowEdgeNode() {
  const node = createSvgElement("g", "canvas2d-scene-vector-item canvas2d-scene-flow-edge-item");
  node.append(
    createSvgElement("line", "canvas2d-scene-flow-edge-line"),
    createSvgElement("line", "canvas2d-scene-flow-edge-focus"),
    createSvgElement("polygon", "canvas2d-scene-flow-edge-arrow"),
    createSvgElement("circle", "canvas2d-scene-flow-edge-endpoint is-from"),
    createSvgElement("circle", "canvas2d-scene-flow-edge-endpoint is-to")
  );
  return node;
}

function syncFlowEdgeNode(node, item, itemById, selectedIds, hoverId, view, flowDraft) {
  const fromNode = itemById.get(String(item.fromId || ""));
  const toNode = itemById.get(String(item.toId || ""));
  if (!fromNode || !toNode) {
    return false;
  }
  const fromConnectors = getFlowNodeConnectors(fromNode);
  const toConnectors = getFlowNodeConnectors(toNode);
  let fromPoint = fromConnectors[item.fromSide] || fromConnectors.right;
  let toPoint = toConnectors[item.toSide] || toConnectors.left;
  if (String(flowDraft?.edgeId || "") === String(item.id || "") && flowDraft?.toPoint) {
    if (flowDraft.endpoint === "from") {
      fromPoint = flowDraft.toPoint;
    } else if (flowDraft.endpoint === "to") {
      toPoint = flowDraft.toPoint;
    }
  }
  const line = node.querySelector(".canvas2d-scene-flow-edge-line");
  const focus = node.querySelector(".canvas2d-scene-flow-edge-focus");
  const arrow = node.querySelector(".canvas2d-scene-flow-edge-arrow");
  const fromEndpoint = node.querySelector(".canvas2d-scene-flow-edge-endpoint.is-from");
  const toEndpoint = node.querySelector(".canvas2d-scene-flow-edge-endpoint.is-to");
  if (
    !(line instanceof SVGElement) ||
    !(focus instanceof SVGElement) ||
    !(arrow instanceof SVGElement) ||
    !(fromEndpoint instanceof SVGElement) ||
    !(toEndpoint instanceof SVGElement)
  ) {
    return false;
  }
  [line, focus].forEach((entry) => {
    setAttribute(entry, "x1", fromPoint.x);
    setAttribute(entry, "y1", fromPoint.y);
    setAttribute(entry, "x2", toPoint.x);
    setAttribute(entry, "y2", toPoint.y);
    setAttribute(entry, "stroke-linecap", "round");
  });
  const selected = selectedIds.has(String(item.id || ""));
  const hovered = String(hoverId || "") === String(item.id || "");
  setAttribute(line, "stroke", "rgba(71, 85, 105, 0.9)");
  setAttribute(line, "stroke-width", 1.8);
  setOptionalAttribute(line, "stroke-dasharray", item.style === "dashed" ? "8 6" : "");
  setAttribute(focus, "stroke", selected ? "rgba(37, 99, 235, 0.95)" : "rgba(59, 130, 246, 0.5)");
  setAttribute(focus, "stroke-width", 2.4);
  focus.style.display = selected || hovered ? "block" : "none";
  const scale = Math.max(0.1, Number(view?.scale || 1));
  [
    [fromEndpoint, fromPoint, "from"],
    [toEndpoint, toPoint, "to"],
  ].forEach(([endpointNode, point, endpoint]) => {
    setAttribute(endpointNode, "cx", point.x);
    setAttribute(endpointNode, "cy", point.y);
    setAttribute(endpointNode, "r", 6 / scale);
    setAttribute(endpointNode, "fill", flowDraft?.endpoint === endpoint ? "rgba(37, 99, 235, 0.98)" : "#ffffff");
    setAttribute(endpointNode, "stroke", "rgba(37, 99, 235, 0.98)");
    setAttribute(endpointNode, "stroke-width", 2 / scale);
    endpointNode.style.display = selected ? "block" : "none";
  });
  if (item.style === "arrow") {
    const forward = item.arrowDirection !== "backward";
    const start = forward ? fromPoint : toPoint;
    const end = forward ? toPoint : fromPoint;
    setAttribute(arrow, "points", getArrowPoints(start, end));
    setAttribute(arrow, "fill", selected ? "rgba(37, 99, 235, 0.95)" : "rgba(71, 85, 105, 0.9)");
    arrow.style.display = "block";
  } else {
    arrow.style.display = "none";
  }
  return true;
}

function createPathNode(className) {
  const node = createSvgElement("path", className);
  setAttribute(node, "fill", "none");
  setAttribute(node, "stroke-linecap", "round");
  setAttribute(node, "stroke-linejoin", "round");
  return node;
}

function createMindRelationshipNode() {
  const node = createSvgElement("g", "canvas2d-scene-vector-item canvas2d-scene-mind-relationship-item");
  node.appendChild(createSvgElement("line", "canvas2d-scene-mind-relationship-line"));
  const badge = createSvgElement("g", "canvas2d-scene-mind-relationship-badge");
  badge.append(
    createSvgElement("circle"),
    createSvgElement("line", "is-forward"),
    createSvgElement("line", "is-backward")
  );
  node.appendChild(badge);
  return node;
}

function syncMindRelationshipNode(node, relationship, itemById, hoverId, hoverHandle, view) {
  const geometry = getMindRelationshipGeometry(relationship, itemById);
  if (!geometry) {
    return false;
  }
  relationship.__mindRelationshipMidpoint = geometry.midpoint;
  const line = node.querySelector(".canvas2d-scene-mind-relationship-line");
  const badge = node.querySelector(".canvas2d-scene-mind-relationship-badge");
  if (!(line instanceof SVGElement) || !(badge instanceof SVGGElement)) {
    return false;
  }
  setAttribute(line, "x1", geometry.fromPoint.x);
  setAttribute(line, "y1", geometry.fromPoint.y);
  setAttribute(line, "x2", geometry.toPoint.x);
  setAttribute(line, "y2", geometry.toPoint.y);
  setAttribute(line, "stroke", "rgba(34, 197, 94, 0.96)");
  setAttribute(line, "stroke-width", 2.1);
  setAttribute(line, "stroke-dasharray", "8 6");
  setAttribute(line, "stroke-linecap", "round");
  const hovered =
    String(hoverId || "") === String(relationship.id || "") ||
    String(hoverId || "") === String(geometry.fromItem?.id || "") ||
    String(hoverId || "") === String(geometry.toItem?.id || "") ||
    hoverHandle === "mind-relationship-delete";
  setAttribute(line, "stroke-width", hovered ? 2.6 : 2.1);
  badge.style.display = hovered ? "block" : "none";
  if (hovered) {
    const scale = Math.max(0.1, Number(view?.scale || 1) || 1);
    const radius = 9 / scale;
    const circle = badge.querySelector("circle");
    const forward = badge.querySelector(".is-forward");
    const backward = badge.querySelector(".is-backward");
    if (circle instanceof SVGElement && forward instanceof SVGElement && backward instanceof SVGElement) {
      setAttribute(circle, "cx", geometry.midpoint.x);
      setAttribute(circle, "cy", geometry.midpoint.y);
      setAttribute(circle, "r", radius);
      setAttribute(circle, "fill", "rgba(220, 38, 38, 0.98)");
      const arm = 3.2 / scale;
      [forward, backward].forEach((entry) => {
        setAttribute(entry, "stroke", "#ffffff");
        setAttribute(entry, "stroke-width", 1.8 / scale);
        setAttribute(entry, "stroke-linecap", "round");
      });
      setAttribute(forward, "x1", geometry.midpoint.x - arm);
      setAttribute(forward, "y1", geometry.midpoint.y - arm);
      setAttribute(forward, "x2", geometry.midpoint.x + arm);
      setAttribute(forward, "y2", geometry.midpoint.y + arm);
      setAttribute(backward, "x1", geometry.midpoint.x + arm);
      setAttribute(backward, "y1", geometry.midpoint.y - arm);
      setAttribute(backward, "x2", geometry.midpoint.x - arm);
      setAttribute(backward, "y2", geometry.midpoint.y + arm);
    }
  }
  return true;
}

function createFlowNodeNode() {
  const node = createSvgElement("g", "canvas2d-scene-vector-item canvas2d-scene-flow-node-item");
  node.append(
    createSvgElement("rect", "canvas2d-scene-flow-node-body"),
    createSvgElement("g", "canvas2d-scene-flow-node-connectors")
  );
  return node;
}

function syncFlowNodeNode(node, item, selectedIds, hoverId, view, flowDraft) {
  const body = node.querySelector(".canvas2d-scene-flow-node-body");
  const connectors = node.querySelector(".canvas2d-scene-flow-node-connectors");
  if (!(body instanceof SVGElement) || !(connectors instanceof SVGElement)) {
    return false;
  }
  const bounds = getElementBounds(item);
  const scale = Math.max(0.1, Number(view?.scale || 1) || 1);
  setAttribute(body, "x", bounds.left);
  setAttribute(body, "y", bounds.top);
  setAttribute(body, "width", bounds.width);
  setAttribute(body, "height", bounds.height);
  setAttribute(body, "rx", 18 / scale);
  setAttribute(body, "fill", "rgba(255, 255, 255, 0.98)");
  setAttribute(body, "stroke", "rgba(148, 163, 184, 0.55)");
  setAttribute(body, "stroke-width", 1.2 / scale);
  const selected = selectedIds.has(String(item.id || ""));
  const hovered = String(hoverId || "") === String(item.id || "");
  const showConnectors = selected || hovered || String(flowDraft?.fromId || "") === String(item.id || "");
  connectors.style.display = showConnectors ? "block" : "none";
  if (showConnectors) {
    const points = Object.values(getFlowNodeConnectors(item));
    while (connectors.childElementCount < points.length) {
      connectors.appendChild(createSvgElement("circle", "canvas2d-scene-flow-node-connector"));
    }
    Array.from(connectors.children).forEach((entry, index) => {
      const point = points[index];
      entry.style.display = point ? "block" : "none";
      if (!point) {
        return;
      }
      setAttribute(entry, "cx", point.x);
      setAttribute(entry, "cy", point.y);
      setAttribute(entry, "r", 5 / scale);
      setAttribute(entry, "fill", "rgba(148, 163, 184, 0.9)");
      setAttribute(entry, "stroke", "rgba(255, 255, 255, 0.9)");
      setAttribute(entry, "stroke-width", 1.2 / scale);
    });
  }
  return true;
}

function createFlowDraftNode() {
  return createSvgElement("line", "canvas2d-scene-flow-draft");
}

function syncFlowDraftNode(node, flowDraft, itemById) {
  const fromNode = itemById.get(String(flowDraft?.fromId || ""));
  if (!fromNode || !flowDraft?.toPoint) {
    return false;
  }
  const fromPoint = getFlowNodeConnectors(fromNode)[flowDraft.fromSide] || getFlowNodeConnectors(fromNode).right;
  setAttribute(node, "x1", fromPoint.x);
  setAttribute(node, "y1", fromPoint.y);
  setAttribute(node, "x2", Number(flowDraft.toPoint.x || 0));
  setAttribute(node, "y2", Number(flowDraft.toPoint.y || 0));
  setAttribute(node, "stroke", "rgba(71, 85, 105, 0.9)");
  setAttribute(node, "stroke-width", 1.8);
  setAttribute(node, "stroke-linecap", "round");
  setOptionalAttribute(node, "stroke-dasharray", flowDraft.style === "dashed" ? "8 6" : "");
  return true;
}

function createMindNodeNode() {
  const node = createSvgElement("g", "canvas2d-scene-vector-item canvas2d-scene-mind-node-item");
  node.append(
    createSvgElement("rect", "canvas2d-scene-mind-node-body"),
    createSvgElement("g", "canvas2d-scene-mind-node-link"),
    createSvgElement("g", "canvas2d-scene-mind-node-collapsed")
  );
  return node;
}

function syncMindNodeLink(node, item, bounds, selected) {
  const links = Array.isArray(item.links) ? item.links : [];
  node.style.display = links.length && !selected ? "block" : "none";
  if (!links.length || selected) {
    return;
  }
  if (!node.childElementCount) {
    node.append(
      createSvgElement("ellipse", "is-first"),
      createSvgElement("ellipse", "is-second"),
      createSvgElement("circle", "is-badge"),
      createSvgElement("text", "is-count")
    );
  }
  const size = 14;
  const inset = 6;
  const centerX = bounds.right - inset - size / 2;
  const centerY = bounds.bottom - inset - size / 2;
  const first = node.querySelector(".is-first");
  const second = node.querySelector(".is-second");
  [first, second].forEach((entry, index) => {
    setAttribute(entry, "cx", centerX + (index ? 1 : -1) * size * 0.16);
    setAttribute(entry, "cy", centerY + (index ? -1 : 1) * size * 0.02);
    setAttribute(entry, "rx", size * 0.34);
    setAttribute(entry, "ry", size * 0.2);
    setAttribute(entry, "transform", `rotate(-35 ${centerX} ${centerY})`);
    setAttribute(entry, "fill", "none");
    setAttribute(entry, "stroke", "rgba(29, 78, 216, 0.96)");
    setAttribute(entry, "stroke-width", size * 0.12);
  });
  const badge = node.querySelector(".is-badge");
  const count = node.querySelector(".is-count");
  const badgeSize = 10;
  const showBadge = links.length > 1;
  badge.style.display = showBadge ? "block" : "none";
  count.style.display = showBadge ? "block" : "none";
  if (showBadge) {
    const badgeX = bounds.right - inset - badgeSize * 0.38;
    const badgeY = bounds.bottom - inset - size - badgeSize * 0.18;
    setAttribute(badge, "cx", badgeX);
    setAttribute(badge, "cy", badgeY);
    setAttribute(badge, "r", badgeSize / 2);
    setAttribute(badge, "fill", "rgba(29, 78, 216, 0.96)");
    setAttribute(count, "x", badgeX);
    setAttribute(count, "y", badgeY);
    setAttribute(count, "fill", "#ffffff");
    setAttribute(count, "font-size", 6);
    setAttribute(count, "font-weight", 700);
    setAttribute(count, "text-anchor", "middle");
    setAttribute(count, "dominant-baseline", "central");
    count.textContent = String(links.length);
  }
}

function syncMindCollapsedBadge(node, item) {
  const childCount = Math.max(0, Array.isArray(item.childrenIds) ? item.childrenIds.length : 0);
  node.style.display = item.collapsed && childCount ? "block" : "none";
  if (!item.collapsed || !childCount) {
    return;
  }
  if (!node.childElementCount) {
    node.append(
      createSvgElement("rect", "is-body"),
      createSvgElement("line", "is-plus-x"),
      createSvgElement("line", "is-plus-y"),
      createSvgElement("text", "is-count")
    );
  }
  const { x, y, width, height } = getMindCollapsedBadgeBounds(item);
  const body = node.querySelector(".is-body");
  setAttribute(body, "x", x);
  setAttribute(body, "y", y);
  setAttribute(body, "width", width);
  setAttribute(body, "height", height);
  setAttribute(body, "rx", 4);
  setAttribute(body, "fill", "#e4eeea");
  const centerX = x + 10;
  const centerY = y + height / 2;
  const arm = 4;
  [node.querySelector(".is-plus-x"), node.querySelector(".is-plus-y")].forEach((entry, index) => {
    setAttribute(entry, "x1", centerX - (index ? 0 : arm));
    setAttribute(entry, "y1", centerY - (index ? arm : 0));
    setAttribute(entry, "x2", centerX + (index ? 0 : arm));
    setAttribute(entry, "y2", centerY + (index ? arm : 0));
    setAttribute(entry, "stroke", "#3f6b60");
    setAttribute(entry, "stroke-width", 1.5);
  });
  const count = node.querySelector(".is-count");
  setAttribute(count, "x", x + 18);
  setAttribute(count, "y", centerY);
  setAttribute(count, "fill", "#3f6b60");
  setAttribute(count, "font-family", "Segoe UI, sans-serif");
  setAttribute(count, "font-size", 11);
  setAttribute(count, "font-weight", 700);
  setAttribute(count, "dominant-baseline", "central");
  count.textContent = String(childCount);
}

function syncMindNodeNode(node, item, selectedIds, view) {
  const body = node.querySelector(".canvas2d-scene-mind-node-body");
  const link = node.querySelector(".canvas2d-scene-mind-node-link");
  const collapsed = node.querySelector(".canvas2d-scene-mind-node-collapsed");
  if (!(body instanceof SVGElement) || !(link instanceof SVGElement) || !(collapsed instanceof SVGElement)) {
    return false;
  }
  const bounds = getElementBounds(item);
  const style = getMindNodeStyle(item);
  setAttribute(body, "x", bounds.left);
  setAttribute(body, "y", bounds.top);
  setAttribute(body, "width", bounds.width);
  setAttribute(body, "height", bounds.height);
  setAttribute(body, "rx", style.radius);
  setAttribute(body, "fill", style.fill);
  setAttribute(body, "stroke", style.stroke);
  setAttribute(body, "stroke-width", style.strokeWidth);
  setOptionalAttribute(body, "stroke-dasharray", style.dash.join(" "));
  const selected = selectedIds.has(String(item.id || ""));
  syncMindNodeLink(link, item, bounds, selected);
  syncMindCollapsedBadge(collapsed, item);
  return true;
}

export function createSceneVectorRenderer({ host = null } = {}) {
  const nodes = new Map();
  let ownedIds = new Set();
  let connectionCount = 0;
  let orderSignature = "";

  function setHost(nextHost) {
    host = nextHost;
  }

  function ensureNode(key, createNode) {
    let node = nodes.get(key);
    if (!node) {
      node = createNode();
      node.dataset.sceneKey = key;
      nodes.set(key, node);
      host.appendChild(node);
    }
    return node;
  }

  function clear() {
    nodes.forEach((node) => node.remove?.());
    nodes.clear();
    ownedIds = new Set();
    connectionCount = 0;
    orderSignature = "";
  }

  function sync({
    items = [],
    visibleItems = items,
    frozen = false,
    selectedIds = [],
    hoverId = "",
    hoverHandle = "",
    view = null,
    flowDraft = null,
    canOwnItem = () => true,
  } = {}) {
    if (frozen || !(host instanceof SVGSVGElement)) {
      return { ownedIds: new Set(ownedIds), connectionCount };
    }
    const allItems = Array.isArray(items) ? items : [];
    const activeItems = Array.isArray(visibleItems) ? visibleItems : allItems;
    const itemById = new Map(allItems.map((item) => [String(item?.id || ""), item]));
    const visibleIdSet = new Set(activeItems.map((item) => String(item?.id || "")).filter(Boolean));
    const selectedIdSet = new Set((Array.isArray(selectedIds) ? selectedIds : []).map((id) => String(id || "")));
    const activeKeys = new Set();
    const orderedKeys = [];
    const nextOwnedIds = new Set();
    let nextConnectionCount = 0;

    collectMindMapVisibleConnections(allItems).forEach((connection) => {
      const parent = itemById.get(String(connection.parentId || ""));
      const child = itemById.get(String(connection.childId || ""));
      if (
        !parent || !child ||
        (!visibleIdSet.has(String(parent.id || "")) && !visibleIdSet.has(String(child.id || ""))) ||
        !isMindMapItemVisible(parent, allItems) || !isMindMapItemVisible(child, allItems)
      ) {
        return;
      }
      const key = `mind-tree:${parent.id}:${child.id}`;
      const node = ensureNode(key, () => createPathNode("canvas2d-scene-mind-tree-path"));
      const parentBounds = getElementBounds(parent);
      const childBounds = getElementBounds(child);
      const leftBranch = connection.side === MIND_BRANCH_LEFT;
      const fromX = leftBranch ? parentBounds.left : parentBounds.right;
      const fromY = parentBounds.top + parentBounds.height / 2;
      const toX = leftBranch ? childBounds.right : childBounds.left;
      const toY = childBounds.top + childBounds.height / 2;
      const direction = leftBranch ? -1 : 1;
      const elbowX = fromX + direction * Math.max(18, Math.abs(toX - fromX) * 0.38);
      setAttribute(node, "d", `M ${fromX} ${fromY} C ${elbowX} ${fromY}, ${toX - direction * 12} ${toY}, ${toX} ${toY}`);
      setAttribute(node, "stroke", MIND_CONNECTION_STYLE.color);
      setAttribute(node, "stroke-width", MIND_CONNECTION_STYLE.width);
      activeKeys.add(key);
      orderedKeys.push(key);
      nextConnectionCount += 1;
    });

    collectMindMapVisibleSummaries(allItems).forEach((summary) => {
      const siblingNodes = (Array.isArray(summary.siblingIds) ? summary.siblingIds : [])
        .map((id) => itemById.get(String(id || "")))
        .filter(Boolean);
      if (siblingNodes.length < 2 || !visibleIdSet.has(String(summary.id || ""))) {
        return;
      }
      const key = `mind-summary:${summary.id}`;
      const node = ensureNode(key, () => createPathNode("canvas2d-scene-mind-summary-path"));
      const summaryBounds = getElementBounds(summary);
      const bounds = siblingNodes.map(getElementBounds);
      const left = Math.min(...bounds.map((entry) => entry.left));
      const top = Math.min(...bounds.map((entry) => entry.top));
      const right = Math.max(...bounds.map((entry) => entry.right));
      const bottom = Math.max(...bounds.map((entry) => entry.bottom));
      const leftBranch = String(summary.branchSide || siblingNodes[0]?.branchSide || "").toLowerCase() === MIND_BRANCH_LEFT;
      const braceX = leftBranch ? left - 26 : right + 26;
      const controlX = leftBranch ? braceX - 24 : braceX + 24;
      const labelAnchorX = leftBranch ? summaryBounds.right : summaryBounds.left;
      const labelAnchorY = summaryBounds.top + summaryBounds.height / 2;
      const midY = top + (bottom - top) / 2;
      setAttribute(
        node,
        "d",
        `M ${braceX} ${top + 12} Q ${controlX} ${top + 12}, ${braceX} ${midY} Q ${controlX} ${bottom - 12}, ${braceX} ${bottom - 12} M ${braceX} ${midY} L ${labelAnchorX} ${labelAnchorY}`
      );
      setAttribute(node, "stroke", "rgba(249, 115, 22, 0.72)");
      setAttribute(node, "stroke-width", 1.8);
      setAttribute(node, "stroke-dasharray", "8 6");
      activeKeys.add(key);
      orderedKeys.push(key);
      nextConnectionCount += 1;
    });

    allItems.filter(isMindRelationshipItem).forEach((relationship) => {
      const geometry = getMindRelationshipGeometry(relationship, itemById);
      if (
        !geometry ||
        (!visibleIdSet.has(String(geometry.fromItem?.id || "")) && !visibleIdSet.has(String(geometry.toItem?.id || "")))
      ) {
        return;
      }
      const key = `mind-relationship:${relationship.id}`;
      const node = ensureNode(key, createMindRelationshipNode);
      if (!syncMindRelationshipNode(node, relationship, itemById, hoverId, hoverHandle, view)) {
        return;
      }
      node.dataset.id = String(relationship.id || "");
      activeKeys.add(key);
      orderedKeys.push(key);
      nextOwnedIds.add(String(relationship.id || ""));
      nextConnectionCount += 1;
    });

    allItems.forEach((item) => {
      const itemId = String(item?.id || "");
      if (!itemId) {
        return;
      }
      if (item.type === "flowEdge") {
        if (!canOwnItem(item)) {
          return;
        }
        const fromVisible = visibleIdSet.has(String(item.fromId || ""));
        const toVisible = visibleIdSet.has(String(item.toId || ""));
        if (!fromVisible && !toVisible && !selectedIdSet.has(itemId)) {
          return;
        }
        const key = `flow-edge:${itemId}`;
        const node = ensureNode(key, createFlowEdgeNode);
        if (!syncFlowEdgeNode(node, item, itemById, selectedIdSet, hoverId, view, flowDraft)) {
          return;
        }
        node.dataset.id = itemId;
        activeKeys.add(key);
        orderedKeys.push(key);
        nextOwnedIds.add(itemId);
        return;
      }
      if (item.type === "flowNode" && visibleIdSet.has(itemId) && Number(view?.scale || 1) > 0.15) {
        if (!canOwnItem(item)) {
          return;
        }
        const key = `flow-node:${itemId}`;
        const node = ensureNode(key, createFlowNodeNode);
        if (!syncFlowNodeNode(node, item, selectedIdSet, hoverId, view, flowDraft)) {
          return;
        }
        node.dataset.id = itemId;
        activeKeys.add(key);
        orderedKeys.push(key);
        nextOwnedIds.add(itemId);
        return;
      }
      if ((item.type === "mindNode" || item.type === "mindSummary") && visibleIdSet.has(itemId) && Number(view?.scale || 1) > 0.15) {
        if (!canOwnItem(item) || !isMindMapItemVisible(item, allItems)) {
          return;
        }
        const key = `mind-node:${itemId}`;
        const node = ensureNode(key, createMindNodeNode);
        if (!syncMindNodeNode(node, item, selectedIdSet, view)) {
          return;
        }
        node.dataset.id = itemId;
        node.dataset.type = item.type;
        activeKeys.add(key);
        orderedKeys.push(key);
        nextOwnedIds.add(itemId);
        return;
      }
      if (item.type === "shape" && visibleIdSet.has(itemId)) {
        if (!canOwnItem(item)) {
          return;
        }
        const key = `shape:${itemId}`;
        const node = ensureNode(key, createShapeNode);
        if (!syncShapeNode(node, item)) {
          return;
        }
        node.dataset.id = itemId;
        activeKeys.add(key);
        orderedKeys.push(key);
        nextOwnedIds.add(itemId);
      }
    });

    if (flowDraft?.fromId && flowDraft?.toPoint && !flowDraft?.edgeId) {
      const key = "flow-draft";
      const node = ensureNode(key, createFlowDraftNode);
      if (syncFlowDraftNode(node, flowDraft, itemById)) {
        activeKeys.add(key);
        orderedKeys.push(key);
      }
    }

    nodes.forEach((node, key) => {
      if (!activeKeys.has(key)) {
        node.remove?.();
        nodes.delete(key);
      }
    });
    const nextOrderSignature = orderedKeys.join("|");
    if (nextOrderSignature !== orderSignature) {
      orderedKeys.forEach((key) => {
        const node = nodes.get(key);
        if (node) {
          host.appendChild(node);
        }
      });
      orderSignature = nextOrderSignature;
    }
    ownedIds = nextOwnedIds;
    connectionCount = nextConnectionCount;
    return { ownedIds: new Set(ownedIds), connectionCount };
  }

  return {
    setHost,
    sync,
    clear,
    getOwnedIds: () => new Set(ownedIds),
    getConnectionCount: () => connectionCount,
  };
}
