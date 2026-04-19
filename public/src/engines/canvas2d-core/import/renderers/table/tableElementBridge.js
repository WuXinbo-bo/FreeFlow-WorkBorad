import { normalizeTableElement, TABLE_STRUCTURED_IMPORT_KIND } from "../../../elements/table.js";

export function buildTableElementFromRenderOperation(operation = {}, options = {}) {
  const element = operation?.element && typeof operation.element === "object" ? operation.element : {};
  const structure = operation?.structure && typeof operation.structure === "object" ? operation.structure : {};
  const meta = operation?.meta && typeof operation.meta === "object" ? operation.meta : {};

  return normalizeTableElement({
    ...element,
    x: Number(options.x) || 0,
    y: Number(options.y) || 0,
    table: {
      title: String(element.title || "表格"),
      columns: Number(structure.columns) || Number(element.columns) || 1,
      rows: Array.isArray(structure.rows) ? JSON.parse(JSON.stringify(structure.rows)) : [],
      hasHeader: Boolean(structure.hasHeader),
    },
    structuredImport: {
      kind: TABLE_STRUCTURED_IMPORT_KIND,
      sourceNodeType: String(operation?.sourceNodeType || "table"),
      canonicalFragment: {
        type: "table",
        attrs: {
          columns: Number(structure.columns) || Number(element.columns) || 1,
        },
        rows: Array.isArray(structure.rows) ? JSON.parse(JSON.stringify(structure.rows)) : [],
      },
      sourceMeta: {
        descriptorId: String(meta.descriptorId || ""),
        parserId: String(meta.parserId || ""),
      },
    },
  });
}
