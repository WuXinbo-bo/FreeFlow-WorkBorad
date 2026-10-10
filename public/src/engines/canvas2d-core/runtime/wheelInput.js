export function normalizeCanvasWheelInput(event, { controlKeyPressed = false, viewport = {} } = {}) {
  const mode = Number(event.deltaMode) || 0;
  const unitX = mode === 1 ? 16 : mode === 2 ? Math.max(1, Number(viewport.width) || 800) : 1;
  const unitY = mode === 1 ? 16 : mode === 2 ? Math.max(1, Number(viewport.height) || 600) : 1;
  const deltaX = Number(event.deltaX) * unitX || 0;
  const deltaY = Number(event.deltaY) * unitY || 0;
  const zooming = Boolean(event.ctrlKey || event.metaKey);
  // Chromium exposes trackpad pinch as pixel wheel + Ctrl without a physical Control key.
  const pinching = zooming && event.ctrlKey && !event.metaKey && !controlKeyPressed && mode === 0;
  return {
    deltaX,
    deltaY,
    zooming,
    zoomFactor: zooming ? Math.exp(Math.max(-1, Math.min(1, -deltaY * (pinching ? 0.01 : 0.0015)))) : 1,
  };
}
