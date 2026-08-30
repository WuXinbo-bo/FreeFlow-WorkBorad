import { getElementBounds } from "../elements/index.js";
import { getFlowNodeConnectors } from "../elements/flow.js";
import {
  collectMindMapVisibleConnections,
  collectMindMapVisibleSummaries,
  isMindMapItemVisible,
  MIND_BRANCH_LEFT,
} from "../elements/mindMap.js";
import { getMindRelationshipGeometry, isMindRelationshipItem } from "../elements/mindRelationship.js";

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
    createSvgElement("polygon", "canvas2d-scene-flow-edge-arrow")
  );
  return node;
}

function syncFlowEdgeNode(node, item, itemById, selectedIds, hoverId) {
  const fromNode = itemById.get(String(item.fromId || ""));
  const toNode = itemById.get(String(item.toId || ""));
  if (!fromNode || !toNode) {
    return false;
  }
  const fromConnectors = getFlowNodeConnectors(fromNode);
  const toConnectors = getFlowNodeConnectors(toNode);
  const fromPoint = fromConnectors[item.fromSide] || fromConnectors.right;
  const toPoint = toConnectors[item.toSide] || toConnectors.left;
  const line = node.querySelector(".canvas2d-scene-flow-edge-line");
  const focus = node.querySelector(".canvas2d-scene-flow-edge-focus");
  const arrow = node.querySelector(".canvas2d-scene-flow-edge-arrow");
  if (!(line instanceof SVGElement) || !(focus instanceof SVGElement) || !(arrow instanceof SVGElement)) {
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
      setAttribute(node, "stroke", "rgba(14, 116, 144, 0.34)");
      setAttribute(node, "stroke-width", 1.1);
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
        if (!syncFlowEdgeNode(node, item, itemById, selectedIdSet, hoverId)) {
          return;
        }
        node.dataset.id = itemId;
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
