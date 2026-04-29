import { getCopyMenuItems, getExportMenuItems } from "../export/copyExportProtocol.js";
import { renderContextMenuSchema } from "./renderContextMenuSchema.js";

function action(label, actionId, extra = {}) {
  return {
    type: "action",
    label,
    action: actionId,
    ...extra,
  };
}

function submenu(label, ariaLabel, items = [], extra = {}) {
  return {
    type: "submenu",
    label,
    ariaLabel,
    items,
    ...extra,
  };
}

function copyExportSubmenu(label, ariaLabel, items = []) {
  return submenu(
    label,
    ariaLabel,
    items.map((entry) => action(entry.menuLabel, entry.action))
  );
}

function layerSubmenuSchema() {
  return submenu("图层", "图层", [
    action("置于顶层", "layer-front"),
    action("置于底层", "layer-back"),
    action("上移一层", "layer-up"),
    action("下移一层", "layer-down"),
  ]);
}

function baseElementActionsSchema() {
  return [
    action("剪切", "cut"),
    action("复制", "copy"),
    action("粘贴", "paste"),
    layerSubmenuSchema(),
  ];
}

export function createRichEditorContextMenuSchema() {
  return [
    action("剪切", "rich-cut"),
    action("复制", "rich-copy"),
    action("粘贴", "rich-paste"),
    action("全选", "rich-select-all"),
    submenu("格式", "文本格式", [
      action("加粗", "bold"),
      action("斜体", "italic"),
      action("下划线", "underline"),
      action("删除线", "strike"),
      action("高亮", "highlight"),
      action("行内代码", "inline-code"),
    ]),
    submenu("结构", "段落结构", [
      action("引用", "blockquote"),
      action("引用层级 +", "blockquote-indent"),
      action("引用层级 -", "blockquote-outdent"),
      action("无序列表", "unordered-list"),
      action("有序列表", "ordered-list"),
      action("任务列表", "task-list"),
      action("分割线", "horizontal-rule"),
    ]),
    submenu("链接", "链接", [
      action("外部链接", "link"),
      action("画布链接", "link-canvas"),
      action("移除链接", "link-remove"),
    ]),
    submenu("插入", "插入", [
      action("行内公式", "insert-math-inline"),
      action("独立公式", "insert-math-block"),
    ]),
    action("完成编辑", "rich-finish-edit"),
  ];
}

export function buildRichEditorContextMenuHtml() {
  return renderContextMenuSchema(createRichEditorContextMenuSchema());
}

export function createRichTextItemContextMenuSchema({ isNode = false } = {}) {
  return [
    ...baseElementActionsSchema().slice(0, 2),
    copyExportSubmenu("复制文本", "复制文本", getCopyMenuItems("text")),
    baseElementActionsSchema()[2],
    action(isNode ? "转为普通文本" : "转为节点文本", "text-node-toggle"),
    copyExportSubmenu("导出", "导出", getExportMenuItems("text")),
    baseElementActionsSchema()[3],
  ];
}

export function buildRichTextItemContextMenuHtml(options = {}) {
  return renderContextMenuSchema(createRichTextItemContextMenuSchema(options));
}

export function createCodeBlockContextMenuSchema() {
  return [
    ...baseElementActionsSchema().slice(0, 2),
    copyExportSubmenu("复制文本", "复制文本", getCopyMenuItems("codeBlock")),
    copyExportSubmenu("导出", "导出", getExportMenuItems("codeBlock")),
    baseElementActionsSchema()[2],
    baseElementActionsSchema()[3],
  ];
}

export function buildCodeBlockContextMenuHtml() {
  return renderContextMenuSchema(createCodeBlockContextMenuSchema());
}

export function createTableContextMenuSchema({ editing = false, selectionMode = "cell" } = {}) {
  const normalizedMode = ["cell", "row", "column", "all"].includes(selectionMode) ? selectionMode : "cell";
  const showRowActions = normalizedMode !== "column";
  const showColumnActions = normalizedMode !== "row";
  const insertItems = [
    showRowActions ? action("上方插入行", "table-add-row-above") : null,
    showRowActions ? action("下方插入行", "table-add-row-below") : null,
    showColumnActions ? action("左侧插入列", "table-add-column-left") : null,
    showColumnActions ? action("右侧插入列", "table-add-column-right") : null,
  ].filter(Boolean);
  const moveItems = [
    showRowActions ? action("上移行", "table-move-row-up") : null,
    showRowActions ? action("下移行", "table-move-row-down") : null,
    showColumnActions ? action("左移列", "table-move-column-left") : null,
    showColumnActions ? action("右移列", "table-move-column-right") : null,
  ].filter(Boolean);
  const deleteItems = [
    showRowActions ? action("删除所选行", "table-delete-row") : null,
    showColumnActions ? action("删除所选列", "table-delete-column") : null,
  ].filter(Boolean);
  if (!editing) {
    return [
      action("编辑表格", "table-edit"),
      ...baseElementActionsSchema().slice(0, 2),
      copyExportSubmenu("复制文本", "复制文本", getCopyMenuItems("table")),
      copyExportSubmenu("导出", "导出", getExportMenuItems("table")),
      baseElementActionsSchema()[2],
      baseElementActionsSchema()[3],
    ];
  }
  return [
    action("复制选区", "table-copy-selection"),
    action("剪切选区", "table-cut-selection"),
    action("清空选区", "table-clear-selection"),
    submenu("插入", "插入", insertItems),
    submenu("移动", "移动", moveItems),
    ...deleteItems,
    action("切换表头", "table-toggle-header"),
    action("完成编辑", "table-done"),
  ];
}

export function buildTableContextMenuHtml(options = {}) {
  return renderContextMenuSchema(createTableContextMenuSchema(options));
}

export function createMathContextMenuSchema() {
  return [...baseElementActionsSchema()];
}

export function buildMathContextMenuHtml() {
  return renderContextMenuSchema(createMathContextMenuSchema());
}

export function createLockDeleteTailSchema(lockLabel = "锁定") {
  return [action(lockLabel, "toggle-lock"), action("删除", "delete")];
}

export function buildLockDeleteTailHtml(lockLabel = "锁定") {
  return renderContextMenuSchema(createLockDeleteTailSchema(lockLabel));
}

export function buildLayerContextMenuHtml() {
  return renderContextMenuSchema([layerSubmenuSchema()]);
}
