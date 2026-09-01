import { getMultiSelectionBounds } from "../multiSelectionTransform.js";

const NON_GEOMETRY_TYPES = new Set(["flowEdge", "mindRelationship"]);

const TYPE_LABELS = Object.freeze({
  shape: "图形",
  image: "图片",
  fileCard: "文件",
  codeBlock: "代码块",
  table: "表格",
  mathBlock: "块公式",
  mathInline: "行内公式",
  mindNode: "思维节点",
  mindSummary: "思维摘要",
  mindRelationship: "思维关系线",
  flowNode: "流程节点",
  flowEdge: "流程连线",
  text: "文本",
});

function resolveBooleanState(values = []) {
  if (!values.length) {
    return "off";
  }
  if (values.every(Boolean)) {
    return "on";
  }
  if (values.every((value) => !value)) {
    return "off";
  }
  return "mixed";
}

function resolveGroupState(items = []) {
  const groupIds = items.map((item) => String(item?.groupId || "").trim());
  if (groupIds.every(Boolean) && new Set(groupIds).size === 1) {
    return "on";
  }
  if (groupIds.every((groupId) => !groupId)) {
    return "off";
  }
  return "mixed";
}

function roundGeometry(value = 0) {
  return Math.round((Number(value || 0) || 0) * 100) / 100;
}

export function buildSelectionInspectorModel(items = [], { getElementUx = null } = {}) {
  const selectedItems = (Array.isArray(items) ? items : []).filter((item) => item?.id && item?.type);
  if (!selectedItems.length) {
    return Object.freeze({
      visible: false,
      count: 0,
      ids: Object.freeze([]),
      types: Object.freeze([]),
    });
  }

  const types = Array.from(new Set(selectedItems.map((item) => String(item.type))));
  const inspectorKinds = Array.from(
    new Set(
      selectedItems
        .map((item) => getElementUx?.(item)?.inspector)
        .map((value) => String(value || "common"))
    )
  );
  const bounds = getMultiSelectionBounds(selectedItems);
  const allMutable = selectedItems.every((item) => item.locked !== true);
  const geometrySupported = Boolean(bounds) && selectedItems.every((item) => !NON_GEOMETRY_TYPES.has(item.type));
  const geometryEditable = allMutable && geometrySupported;
  const lockedState = resolveBooleanState(selectedItems.map((item) => item.locked === true));
  const groupedState = resolveGroupState(selectedItems);
  const title = selectedItems.length === 1
    ? TYPE_LABELS[types[0]] || "元素"
    : `${selectedItems.length} 个元素`;

  return Object.freeze({
    visible: true,
    count: selectedItems.length,
    title,
    ids: Object.freeze(selectedItems.map((item) => String(item.id))),
    types: Object.freeze(types),
    typeLabels: Object.freeze(types.map((type) => TYPE_LABELS[type] || type)),
    inspectorKinds: Object.freeze(inspectorKinds),
    lockedState,
    groupedState,
    geometry: bounds
      ? Object.freeze({
          x: roundGeometry(bounds.left),
          y: roundGeometry(bounds.top),
          width: roundGeometry(bounds.width),
          height: roundGeometry(bounds.height),
          xEditable: geometryEditable,
          yEditable: geometryEditable,
          widthEditable: geometryEditable,
          heightEditable: geometryEditable && selectedItems.length === 1,
        })
      : null,
    actions: Object.freeze({
      canLock: true,
      canGroup: allMutable && selectedItems.length > 1,
      canUngroup: allMutable && groupedState !== "off",
      canAlign: allMutable && selectedItems.length > 1,
      canDistribute: allMutable && selectedItems.length > 2,
      canDelete: selectedItems.some((item) => item.locked !== true),
    }),
  });
}
