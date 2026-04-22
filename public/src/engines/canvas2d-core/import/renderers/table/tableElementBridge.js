import {
  normalizeTableElement,
  normalizeTableStructure,
  TABLE_STRUCTURED_IMPORT_KIND,
} from "../../../elements/table.js";

export function buildTableElementFromRenderOperation(operation = {}, options = {}) {
  const element = operation?.element && typeof operation.element === "object" ? operation.element : {};
  const structure = operation?.structure && typeof operation.structure === "object" ? operation.structure : {};
  const meta = operation?.meta && typeof operation.meta === "object" ? operation.meta : {};

  const normalizedStructure = normalizeTableStructure({
    title: String(element.title || "表格"),
    columns: Number(structure.columns) || Number(element.columns) || 1,
    rows: Array.isArray(structure.rows) ? structure.rows : element?.table?.rows || [],
    hasHeader: Boolean(structure.hasHeader ?? element?.table?.hasHeader),
  });
  const sourceMeta = {
    ...(element?.sourceMeta && typeof element.sourceMeta === "object" ? element.sourceMeta : {}),
    ...(element?.table?.sourceMeta && typeof element.table.sourceMeta === "object" ? element.table.sourceMeta : {}),
    descriptorId: String(meta.descriptorId || ""),
    parserId: String(meta.parserId || ""),
    entryId: String(meta.entryId || ""),
  };
  return normalizeTableElement({
    ...element,
    x: Number(options.x) || 0,
    y: Number(options.y) || 0,
    sourceMeta,
    table: normalizedStructure,
    structuredImport: {
      kind: TABLE_STRUCTURED_IMPORT_KIND,
      sourceNodeType: String(operation?.sourceNodeType || "table"),
      canonicalFragment: {
        type: "table",
        attrs: {
          columns: normalizedStructure.columns,
          hasHeader: Boolean(normalizedStructure.hasHeader),
        },
        rows: JSON.parse(JSON.stringify(normalizedStructure.rows)),
      },
      sourceMeta,
    },
  });
}
