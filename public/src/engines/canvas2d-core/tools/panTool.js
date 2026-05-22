export function createPanPointer(event) {
  return {
    type: "pan",
    pointerId: event.pointerId,
    lastClientX: Number(event.clientX) || 0,
    lastClientY: Number(event.clientY) || 0,
  };
}
