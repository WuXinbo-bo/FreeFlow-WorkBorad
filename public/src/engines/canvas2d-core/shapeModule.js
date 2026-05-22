import { createShapeElement, updateShapeElement } from "./elements/shapes.js";
import { createShapeRenderer } from "./rendererShape.js";

export function createShapeModule() {
  return {
    createElement: (tool, startPoint, endPoint) => createShapeElement(tool, startPoint, endPoint),
    updateElement: (element, startPoint, endPoint) => updateShapeElement(element, startPoint, endPoint),
    createDraftElement: (tool, startPoint) => createShapeElement(tool, startPoint, startPoint),
    updateDraftElement: (element, startPoint, currentPoint) => updateShapeElement(element, startPoint, currentPoint),
    createRenderer: createShapeRenderer,
  };
}
