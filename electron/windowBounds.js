function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function constrainWindowBoundsToWorkArea(bounds = {}, workArea = {}, options = {}) {
  const area = {
    x: Math.round(toFiniteNumber(workArea.x)),
    y: Math.round(toFiniteNumber(workArea.y)),
    width: Math.max(1, Math.round(toFiniteNumber(workArea.width, 1))),
    height: Math.max(1, Math.round(toFiniteNumber(workArea.height, 1))),
  };
  const minWidth = Math.max(1, Math.round(toFiniteNumber(options.minWidth, 1)));
  const minHeight = Math.max(1, Math.round(toFiniteNumber(options.minHeight, 1)));
  const width = Math.max(minWidth, Math.min(Math.round(toFiniteNumber(bounds.width, minWidth)), area.width));
  const height = Math.max(minHeight, Math.min(Math.round(toFiniteNumber(bounds.height, minHeight)), area.height));
  const maxX = area.x + Math.max(0, area.width - width);
  const maxY = area.y + Math.max(0, area.height - height);
  const x = Math.min(Math.max(Math.round(toFiniteNumber(bounds.x, area.x)), area.x), maxX);
  const y = Math.min(Math.max(Math.round(toFiniteNumber(bounds.y, area.y)), area.y), maxY);
  return { x, y, width, height };
}

module.exports = {
  constrainWindowBoundsToWorkArea,
};
