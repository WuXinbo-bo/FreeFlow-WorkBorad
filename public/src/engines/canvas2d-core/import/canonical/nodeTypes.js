export const CANONICAL_DOCUMENT_VERSION = "1.0.0";
export const CANONICAL_MIN_READER_VERSION = "1.0.0";

export const BLOCK_NODE_TYPES = Object.freeze([
  "doc",
  "paragraph",
  "heading",
  "blockquote",
  "horizontalRule",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "table",
  "tableRow",
  "tableCell",
  "codeBlock",
  "mathBlock",
  "image",
  "footnote",
]);

export const INLINE_NODE_TYPES = Object.freeze([
  "text",
  "hardBreak",
  "link",
  "inlineCode",
  "mathInline",
  "footnoteRef",
]);

export const MARK_TYPES = Object.freeze([
  "bold",
  "italic",
  "underline",
  "strike",
  "highlight",
  "textColor",
  "backgroundColor",
  "code",
  "link",
]);

export const MARK_ALLOWED_ATTRS = Object.freeze({
  bold: [],
  italic: [],
  underline: [],
  strike: [],
  highlight: ["color"],
  textColor: ["color"],
  backgroundColor: ["color"],
  code: [],
  link: ["href", "title", "target"],
});

export const ALL_NODE_TYPES = Object.freeze([
  ...BLOCK_NODE_TYPES,
  ...INLINE_NODE_TYPES,
]);

export const NODE_TYPE_GROUPS = Object.freeze(
  ALL_NODE_TYPES.reduce((accumulator, type) => {
    accumulator[type] = BLOCK_NODE_TYPES.includes(type) ? "block" : "inline";
    return accumulator;
  }, {})
);

export const CANONICAL_NODE_BASE_FIELDS = Object.freeze([
  "type",
  "attrs",
  "content",
  "text",
  "marks",
  "meta",
]);

export const DOCUMENT_META_ALLOWED_FIELDS = Object.freeze([
  "source",
  "compat",
  "tags",
  "labels",
]);

export const NODE_META_ALLOWED_FIELDS = Object.freeze([
  "source",
  "compat",
  "originId",
  "legacyType",
]);

export const CANONICAL_NODE_ALLOWED_CHILDREN = Object.freeze({
  doc: ["paragraph", "heading", "blockquote", "horizontalRule", "bulletList", "orderedList", "taskList", "table", "codeBlock", "mathBlock", "image", "footnote"],
  paragraph: ["text", "hardBreak", "link", "inlineCode", "mathInline", "footnoteRef"],
  heading: ["text", "hardBreak", "link", "inlineCode", "mathInline", "footnoteRef"],
  blockquote: ["paragraph", "bulletList", "orderedList", "taskList", "codeBlock", "mathBlock"],
  horizontalRule: [],
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  listItem: ["paragraph", "bulletList", "orderedList", "taskList", "codeBlock", "mathBlock"],
  taskList: ["taskItem"],
  taskItem: ["paragraph", "bulletList", "orderedList", "codeBlock", "mathBlock"],
  table: ["tableRow"],
  tableRow: ["tableCell"],
  tableCell: ["paragraph", "bulletList", "orderedList", "taskList", "codeBlock", "mathBlock"],
  codeBlock: [],
  mathBlock: [],
  image: [],
  footnote: ["paragraph", "bulletList", "orderedList", "taskList", "codeBlock", "mathBlock"],
  text: [],
  hardBreak: [],
  link: ["text", "inlineCode", "mathInline"],
  inlineCode: [],
  mathInline: [],
  footnoteRef: [],
});

export const EMPTY_NODE_POLICIES = Object.freeze({
  paragraph: {
    allowed: true,
    strategy: "empty-content",
  },
  listItem: {
    allowed: true,
    strategy: "single-empty-paragraph",
  },
  taskItem: {
    allowed: true,
    strategy: "single-empty-paragraph",
  },
  tableCell: {
    allowed: true,
    strategy: "single-empty-paragraph",
  },
  footnote: {
    allowed: true,
    strategy: "single-empty-paragraph",
  },
});

export const NODE_ALLOWED_ATTRS = Object.freeze({
  doc: ["title"],
  paragraph: ["align"],
  heading: ["level", "align"],
  blockquote: [],
  horizontalRule: [],
  bulletList: [],
  orderedList: ["start"],
  listItem: [],
  taskList: [],
  taskItem: ["checked"],
  table: ["columns"],
  tableRow: [],
  tableCell: ["align", "colSpan", "rowSpan", "header"],
  codeBlock: ["language"],
  mathBlock: ["sourceFormat", "displayMode"],
  image: ["src", "alt", "title", "width", "height", "resourceId"],
  footnote: ["id"],
  text: [],
  hardBreak: [],
  link: ["href", "title", "target"],
  inlineCode: [],
  mathInline: ["sourceFormat", "displayMode"],
  footnoteRef: ["refId"],
});

export const NODE_REQUIRED_ATTRS = Object.freeze({
  heading: ["level"],
  tableCell: ["colSpan", "rowSpan", "header"],
  mathBlock: ["sourceFormat", "displayMode"],
  mathInline: ["sourceFormat", "displayMode"],
  footnote: ["id"],
  footnoteRef: ["refId"],
});

export function isCanonicalNodeType(value) {
  return ALL_NODE_TYPES.includes(String(value || ""));
}

export function isBlockNodeType(value) {
  return BLOCK_NODE_TYPES.includes(String(value || ""));
}

export function isInlineNodeType(value) {
  return INLINE_NODE_TYPES.includes(String(value || ""));
}

export function isMarkType(value) {
  return MARK_TYPES.includes(String(value || ""));
}

export function getNodeGroup(value) {
  return NODE_TYPE_GROUPS[String(value || "")] || "unknown";
}

export function getMarkAllowedAttrs(value) {
  return MARK_ALLOWED_ATTRS[String(value || "")] || [];
}

export function getEmptyNodePolicy(value) {
  return EMPTY_NODE_POLICIES[String(value || "")] || null;
}

export function getNodeAllowedAttrs(value) {
  return NODE_ALLOWED_ATTRS[String(value || "")] || [];
}

export function getNodeRequiredAttrs(value) {
  return NODE_REQUIRED_ATTRS[String(value || "")] || [];
}
