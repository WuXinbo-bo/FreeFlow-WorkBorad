import { createId } from "../utils.js";
import { getElementBounds } from "./index.js";

export const MIND_RELATIONSHIP_TYPE = "mindRelationship";

function normalizeItemId(value = "") {
  return String(value || "").trim();
}

export function isMindRelationshipItem(item = {}) {
  return item?.type === MIND_RELATIONSHIP_TYPE;
}

export function createMindRelationshipElement(fromId, toId) {
  return {
    id: createId("mind-rel"),
    type: MIND_RELATIONSHIP_TYPE,
    fromId: normalizeItemId(fromId),
    toId: normalizeItemId(toId),
    createdAt: Date.now(),
  };
}

export function normalizeMindRelationshipElement(element = {}) {
  return {
    id: String(element.id || createId("mind-rel")),
    type: MIND_RELATIONSHIP_TYPE,
    fromId: normalizeItemId(element.fromId),
    toId: normalizeItemId(element.toId),
    createdAt: Number(element.createdAt) || Date.now(),
  };
}

export function getMindRelationshipEndpoint(item = {}) {
  const bounds = getElementBounds(item);
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
    bounds,
  };
}

export function getMindRelationshipGeometry(relationship = {}, itemById = new Map()) {
  if (!isMindRelationshipItem(relationship)) {
    return null;
  }
  const from = itemById.get(String(relationship.fromId || ""));
  const to = itemById.get(String(relationship.toId || ""));
  if (!from || !to) {
    return null;
  }
  const fromEndpoint = getMindRelationshipEndpoint(from);
  const toEndpoint = getMindRelationshipEndpoint(to);
  const midpoint = {
    x: (fromEndpoint.x + toEndpoint.x) / 2,
    y: (fromEndpoint.y + toEndpoint.y) / 2,
  };
  const bounds = {
    left: Math.min(fromEndpoint.x, toEndpoint.x),
    top: Math.min(fromEndpoint.y, toEndpoint.y),
    right: Math.max(fromEndpoint.x, toEndpoint.x),
    bottom: Math.max(fromEndpoint.y, toEndpoint.y),
  };
  return {
    fromItem: from,
    toItem: to,
    fromPoint: { x: fromEndpoint.x, y: fromEndpoint.y },
    toPoint: { x: toEndpoint.x, y: toEndpoint.y },
    fromBounds: fromEndpoint.bounds,
    toBounds: toEndpoint.bounds,
    midpoint,
    bounds,
  };
}
