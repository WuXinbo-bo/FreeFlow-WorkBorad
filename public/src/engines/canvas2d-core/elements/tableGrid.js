// Count occupied columns, including cells carried over from earlier rows.
export function getTableColumnCount(rows = []) {
  const occupiedUntil = [];
  let columns = 0;
  rows.forEach((row, rowIndex) => {
    let cursor = 0;
    for (const cell of row.cells || row.content || []) {
      const attrs = cell.attrs || cell;
      const colSpan = Math.min(1000, Math.max(1, Number(attrs.colSpan) || 1));
      const rowSpan = Math.max(1, Number(attrs.rowSpan) || 1);
      while (Array.from({ length: colSpan }, (_, offset) => occupiedUntil[cursor + offset] > rowIndex).some(Boolean)) {
        cursor += 1;
      }
      for (let offset = 0; offset < colSpan; offset += 1) {
        occupiedUntil[cursor + offset] = rowIndex + rowSpan;
      }
      cursor += colSpan;
      columns = Math.max(columns, cursor);
    }
  });
  return columns;
}
