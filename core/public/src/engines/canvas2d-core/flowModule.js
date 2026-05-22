import { createFlowNodeElement, createFlowEdgeElement, getFlowNodeConnectors } from "./elements/flow.js";
import { createFlowRenderer } from "./rendererFlow.js";

export function createFlowModule({ getItemById } = {}) {
  function getConnectorHit(node, scenePoint, view) {
    if (!node) {
      return null;
    }
    const scale = Math.max(0.1, Number(view?.scale) || 1);
    const radius = 10 / scale;
    const connectors = getFlowNodeConnectors(node);
    for (const [side, point] of Object.entries(connectors)) {
      const dx = Number(scenePoint.x || 0) - point.x;
      const dy = Number(scenePoint.y || 0) - point.y;
      if (Math.hypot(dx, dy) <= radius) {
        return side;
      }
    }
    return null;
  }

  return {
    createNode: (point) => createFlowNodeElement(point),
    createEdge: (from, to, style) => createFlowEdgeElement(from, to, style),
    getConnectorHit,
    getConnectors: getFlowNodeConnectors,
    createRenderer: () => createFlowRenderer({ getItemById }),
  };
}
