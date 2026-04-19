import { collectElementsInRect, hitTestElement } from "../../hitTest.js";
import { getElementBounds } from "../../elements/index.js";

export function hitTestHostInteraction(board, point, scale = 1) {
  const items = Array.isArray(board?.items) ? board.items : [];
  const item = hitTestElement(items, point, scale);
  if (!item) {
    return null;
  }

  const base = {
    item,
    zone: "element",
    detail: null,
  };

  if (item.type === "table") {
    const cell = hitTestTableCell(item, point);
    if (cell) {
      return {
        ...base,
        zone: "table-cell",
        detail: cell,
      };
    }
  }

  if (item.type === "codeBlock") {
    return {
      ...base,
      zone: pointInBounds(point, getCodeContentBounds(item)) ? "code-content" : "element",
      detail: {
        language: String(item.language || ""),
      },
    };
  }

  if (item.type === "mathBlock" || item.type === "mathInline") {
    return {
      ...base,
      zone: "math-formula",
      detail: {
        displayMode: Boolean(item.displayMode),
        sourceFormat: String(item.sourceFormat || ""),
      },
    };
  }

  if (item.type === "text") {
    const checkbox = hitTestTaskListCheckbox(item, point);
    if (checkbox) {
      return {
        ...base,
        zone: "task-checkbox",
        detail: checkbox,
      };
    }
  }

  return base;
}

export function collectHostSelection(board, startPoint, currentPoint) {
  const items = Array.isArray(board?.items) ? board.items : [];
  const ids = collectElementsInRect(items, startPoint, currentPoint);
  const selectedItems = items.filter((item) => ids.includes(item.id));
  return {
    ids,
    items: selectedItems,
    typeCounts: selectedItems.reduce((counts, item) => {
      const type = String(item?.type || "");
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {}),
  };
}

export function buildHostDragSelection(board, selectedIds = []) {
  const items = Array.isArray(board?.items) ? board.items : [];
  const selected = items.filter((item) => selectedIds.includes(item.id));
  const bounds = mergeBounds(selected.map((item) => getElementBounds(item)));
  return {
    ids: selected.map((item) => item.id),
    items: selected,
    bounds,
    draggable: selected.length > 0,
  };
}

function hitTestTableCell(item, point) {
  const structure = item?.table;
  const rows = Array.isArray(structure?.rows) ? structure.rows : [];
  if (!rows.length) {
    return null;
  }
  const bounds = getElementBounds(item);
  const rowHeight = bounds.height / Math.max(1, rows.length);
  let rowTop = bounds.top;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowBottom = rowTop + rowHeight;
    if (point.y < rowTop || point.y > rowBottom) {
      rowTop = rowBottom;
      continue;
    }
    const totalColumns = Math.max(1, Number(structure?.columns) || 1);
    const columnWidth = bounds.width / totalColumns;
    let cellLeft = bounds.left;
    const cells = Array.isArray(row.cells) ? row.cells : [];
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const cell = cells[cellIndex];
      const span = Math.max(1, Number(cell?.colSpan) || 1);
      const cellRight = cellLeft + columnWidth * span;
      if (point.x >= cellLeft && point.x <= cellRight) {
        return {
          rowIndex,
          cellIndex,
          header: Boolean(cell?.header),
        };
      }
      cellLeft = cellRight;
    }
    break;
  }
  return null;
}

function getCodeContentBounds(item) {
  const bounds = getElementBounds(item);
  return {
    left: bounds.left + 8,
    top: bounds.top + 28,
    right: bounds.right - 8,
    bottom: bounds.bottom - 8,
  };
}

function hitTestTaskListCheckbox(item, point) {
  const fragmentItems = item?.structuredImport?.canonicalFragment?.items;
  if (!Array.isArray(fragmentItems) || !fragmentItems.length) {
    return null;
  }
  const flattened = flattenTaskItems(fragmentItems);
  if (!flattened.length) {
    return null;
  }
  const bounds = getElementBounds(item);
  const lineHeight = Math.max(24, bounds.height / Math.max(1, flattened.length));
  for (let index = 0; index < flattened.length; index += 1) {
    const entry = flattened[index];
    const top = bounds.top + index * lineHeight;
    const checkboxBounds = {
      left: bounds.left + 6 + entry.level * 16,
      top,
      right: bounds.left + 26 + entry.level * 16,
      bottom: top + lineHeight,
    };
    if (pointInBounds(point, checkboxBounds)) {
      return {
        index,
        level: entry.level,
        checked: Boolean(entry.checked),
      };
    }
  }
  return null;
}

function flattenTaskItems(items = [], level = 0, result = []) {
  items.forEach((item) => {
    if (String(item?.kind || "") === "taskItem") {
      result.push({
        checked: Boolean(item.checked),
        level,
      });
    }
    if (Array.isArray(item?.childItems) && item.childItems.length) {
      flattenTaskItems(item.childItems, level + 1, result);
    }
  });
  return result;
}

function pointInBounds(point, bounds) {
  return (
    Number(point?.x || 0) >= Number(bounds.left || 0) &&
    Number(point?.x || 0) <= Number(bounds.right || 0) &&
    Number(point?.y || 0) >= Number(bounds.top || 0) &&
    Number(point?.y || 0) <= Number(bounds.bottom || 0)
  );
}

function mergeBounds(boundsList = []) {
  if (!boundsList.length) {
    return null;
  }
  return boundsList.reduce(
    (acc, bounds) => ({
      left: Math.min(acc.left, bounds.left),
      top: Math.min(acc.top, bounds.top),
      right: Math.max(acc.right, bounds.right),
      bottom: Math.max(acc.bottom, bounds.bottom),
      width: Math.max(acc.right, bounds.right) - Math.min(acc.left, bounds.left),
      height: Math.max(acc.bottom, bounds.bottom) - Math.min(acc.top, bounds.top),
    }),
    {
      left: boundsList[0].left,
      top: boundsList[0].top,
      right: boundsList[0].right,
      bottom: boundsList[0].bottom,
      width: boundsList[0].width,
      height: boundsList[0].height,
    }
  );
}
