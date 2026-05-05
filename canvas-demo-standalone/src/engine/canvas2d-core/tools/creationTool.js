import { createShapeElement, updateShapeElement } from "../elements/shapes.js";

export function createDraftElement(tool, startPoint) {
  return createShapeElement(tool, startPoint, startPoint);
}

export function updateDraftElement(element, startPoint, currentPoint) {
  return updateShapeElement(element, startPoint, currentPoint);
}
