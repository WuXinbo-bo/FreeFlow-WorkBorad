import {
  ALL_NODE_TYPES,
  CANONICAL_DOCUMENT_VERSION,
  CANONICAL_MIN_READER_VERSION,
  CANONICAL_NODE_ALLOWED_CHILDREN,
  DOCUMENT_META_ALLOWED_FIELDS,
  EMPTY_NODE_POLICIES,
  MARK_ALLOWED_ATTRS,
  MARK_TYPES,
  NODE_ALLOWED_ATTRS,
  NODE_META_ALLOWED_FIELDS,
  NODE_REQUIRED_ATTRS,
  isCanonicalNodeType,
  isInlineNodeType,
} from "./nodeTypes.js";

export function createCanonicalDocument(partial = {}) {
  return normalizeCanonicalDocument({
    version: CANONICAL_DOCUMENT_VERSION,
    type: "doc",
    attrs: normalizeObject(partial.attrs),
    content: Array.isArray(partial.content) ? partial.content.map((node) => createCanonicalNode(node)) : [],
    meta: normalizeDocumentMeta(partial.meta),
  });
}

export function createCanonicalNode(partial = {}) {
  const type = String(partial.type || "");
  return normalizeCanonicalNode({
    type,
    attrs: normalizeObject(partial.attrs),
    content: Array.isArray(partial.content) ? partial.content.map((node) => createCanonicalNode(node)) : [],
    text: typeof partial.text === "string" ? partial.text : "",
    marks: Array.isArray(partial.marks) ? partial.marks.map(normalizeMark).filter(Boolean) : [],
    meta: normalizeNodeMeta(partial.meta),
  });
}

export function normalizeCanonicalDocument(document) {
  return {
    version: CANONICAL_DOCUMENT_VERSION,
    type: "doc",
    attrs: normalizeObject(document?.attrs),
    content: Array.isArray(document?.content) ? document.content.map((node) => normalizeCanonicalNode(node)) : [],
    meta: normalizeDocumentMeta(document?.meta),
  };
}

export function normalizeCanonicalNode(node = {}) {
  const type = String(node.type || "");
  const normalized = {
    type,
    attrs: normalizeNodeAttrs(type, node.attrs),
    content: Array.isArray(node.content) ? node.content.map((child) => normalizeCanonicalNode(child)) : [],
    text: typeof node.text === "string" ? node.text : "",
    marks: Array.isArray(node.marks) ? node.marks.map(normalizeMark).filter(Boolean) : [],
    meta: normalizeNodeMeta(node.meta),
  };
  return applyEmptyNodePolicy(normalized);
}

export function validateCanonicalDocument(document) {
  const issues = [];
  if (!document || typeof document !== "object") {
    return { ok: false, issues: ["document must be an object"] };
  }
  if (document.version !== CANONICAL_DOCUMENT_VERSION) {
    issues.push(`document.version must be ${CANONICAL_DOCUMENT_VERSION}`);
  }
  if (document.type !== "doc") {
    issues.push('document.type must be "doc"');
  }
  if (!Array.isArray(document.content)) {
    issues.push("document.content must be an array");
  } else {
    document.content.forEach((node, index) => {
      validateNode(node, "doc", `content[${index}]`, issues);
    });
  }
  validateDocumentMeta(document.meta, "meta", issues);
  return {
    ok: issues.length === 0,
    issues,
  };
}

function validateNode(node, parentType, path, issues) {
  if (!node || typeof node !== "object") {
    issues.push(`${path} must be an object`);
    return;
  }

  const type = String(node.type || "");
  if (!isCanonicalNodeType(type)) {
    issues.push(`${path}.type is unsupported: ${type}`);
    return;
  }

  const allowedChildren = CANONICAL_NODE_ALLOWED_CHILDREN[parentType] || [];
  if (parentType && !allowedChildren.includes(type)) {
    issues.push(`${path}.type "${type}" is not allowed inside "${parentType}"`);
  }

  if (isInlineNodeType(type) && Array.isArray(node.content) && node.content.length) {
    const inlineAllowed = CANONICAL_NODE_ALLOWED_CHILDREN[type] || [];
    node.content.forEach((child, index) => {
      validateNode(child, type, `${path}.content[${index}]`, issues);
      if (!inlineAllowed.includes(child?.type || "")) {
        issues.push(`${path}.content[${index}] is not allowed inside inline node "${type}"`);
      }
    });
  } else if (Array.isArray(node.content)) {
    node.content.forEach((child, index) => {
      validateNode(child, type, `${path}.content[${index}]`, issues);
    });
  }

  if (type === "text" && typeof node.text !== "string") {
    issues.push(`${path}.text must be a string for text nodes`);
  }
  if ((type === "inlineCode" || type === "mathInline" || type === "mathBlock" || type === "codeBlock") && typeof node.text !== "string") {
    issues.push(`${path}.text must be a string for ${type} nodes`);
  }
  if (type === "hardBreak" && node.text) {
    issues.push(`${path}.text must be empty for hardBreak nodes`);
  }

  validateNodeAttrs(type, node.attrs, `${path}.attrs`, issues);

  validateEmptyNodeRule(node, path, issues);

  if (!Array.isArray(node.marks)) {
    issues.push(`${path}.marks must be an array`);
  } else {
    node.marks.forEach((mark, index) => {
      validateMark(mark, `${path}.marks[${index}]`, issues);
    });
  }

  validateNodeMeta(node.meta, `${path}.meta`, issues);
}

function validateMark(mark, path, issues) {
  if (!mark || typeof mark !== "object") {
    issues.push(`${path} must be an object`);
    return;
  }
  const type = String(mark.type || "");
  if (!MARK_TYPES.includes(type)) {
    issues.push(`${path}.type is unsupported: ${type}`);
    return;
  }
  const attrs = mark.attrs;
  if (attrs != null && (typeof attrs !== "object" || Array.isArray(attrs))) {
    issues.push(`${path}.attrs must be an object`);
    return;
  }
  const allowedAttrs = MARK_ALLOWED_ATTRS[type] || [];
  const attrKeys = Object.keys(attrs || {});
  for (const key of attrKeys) {
    if (!allowedAttrs.includes(key)) {
      issues.push(`${path}.attrs.${key} is not allowed for mark "${type}"`);
    }
  }
  if ((type === "textColor" || type === "backgroundColor" || type === "highlight") && typeof attrs?.color !== "string") {
    issues.push(`${path}.attrs.color must be a string for mark "${type}"`);
  }
  if (type === "link" && typeof attrs?.href !== "string") {
    issues.push(`${path}.attrs.href must be a string for link mark`);
  }
}

function normalizeMark(mark) {
  if (!mark || typeof mark !== "object") {
    return null;
  }
  const type = String(mark.type || "");
  if (!MARK_TYPES.includes(type)) {
    return null;
  }
  return {
    type,
    attrs: normalizeMarkAttrs(type, mark.attrs),
  };
}

function normalizeDocumentMeta(meta) {
  const normalized = filterObjectFields(meta, DOCUMENT_META_ALLOWED_FIELDS);
  return {
    source: normalizeSourceMeta(normalized.source),
    compat: normalizeCompatMeta(normalized.compat),
    tags: normalizeStringList(normalized.tags),
    labels: normalizeStringList(normalized.labels),
  };
}

function normalizeNodeMeta(meta) {
  const normalized = filterObjectFields(meta, NODE_META_ALLOWED_FIELDS);
  return {
    source: normalizeSourceMeta(normalized.source),
    compat: normalizeCompatMeta(normalized.compat),
    originId: typeof normalized.originId === "string" ? normalized.originId : "",
    legacyType: typeof normalized.legacyType === "string" ? normalized.legacyType : "",
  };
}

function normalizeNodeAttrs(type, attrs) {
  const normalized = normalizeObject(attrs);
  const allowed = NODE_ALLOWED_ATTRS[type] || [];
  const filtered = Object.fromEntries(
    Object.entries(normalized).filter(([key, value]) => allowed.includes(key) && isSerializableNodeValue(value))
  );

  if (type === "heading") {
    filtered.level = normalizePositiveInteger(filtered.level, 1);
  }
  if (type === "orderedList") {
    filtered.start = normalizePositiveInteger(filtered.start, 1);
  }
  if (type === "taskItem") {
    filtered.checked = Boolean(filtered.checked);
  }
  if (type === "table") {
    filtered.columns = normalizePositiveInteger(filtered.columns, 0);
  }
  if (type === "tableCell") {
    filtered.colSpan = normalizePositiveInteger(filtered.colSpan, 1);
    filtered.rowSpan = normalizePositiveInteger(filtered.rowSpan, 1);
    filtered.header = Boolean(filtered.header);
    if (typeof filtered.align !== "string" || !["left", "center", "right"].includes(filtered.align)) {
      delete filtered.align;
    }
  }
  if (type === "codeBlock") {
    if (typeof filtered.language !== "string") {
      delete filtered.language;
    }
  }
  if (type === "mathBlock" || type === "mathInline") {
    filtered.sourceFormat = normalizeMathSourceFormat(filtered.sourceFormat);
    filtered.displayMode = Boolean(filtered.displayMode);
  }
  if (type === "footnote") {
    filtered.id = typeof filtered.id === "string" ? filtered.id : "";
  }
  if (type === "footnoteRef") {
    filtered.refId = typeof filtered.refId === "string" ? filtered.refId : "";
  }
  if (type === "image") {
    if (typeof filtered.width !== "number") {
      delete filtered.width;
    }
    if (typeof filtered.height !== "number") {
      delete filtered.height;
    }
  }
  if (type === "paragraph" || type === "heading") {
    if (typeof filtered.align !== "string" || !["left", "center", "right", "justify"].includes(filtered.align)) {
      delete filtered.align;
    }
  }
  return filtered;
}

function normalizeMarkAttrs(type, attrs) {
  const normalized = normalizeObject(attrs);
  const allowed = MARK_ALLOWED_ATTRS[type] || [];
  return Object.fromEntries(
    Object.entries(normalized).filter(([key, value]) => allowed.includes(key) && isSerializableMarkValue(value))
  );
}

function isSerializableMarkValue(value) {
  return value == null || ["string", "number", "boolean"].includes(typeof value);
}

function isSerializableNodeValue(value) {
  return value == null || ["string", "number", "boolean"].includes(typeof value);
}

function validateNodeAttrs(type, attrs, path, issues) {
  const normalizedAttrs = attrs && typeof attrs === "object" && !Array.isArray(attrs) ? attrs : {};
  const allowed = NODE_ALLOWED_ATTRS[type] || [];
  const required = NODE_REQUIRED_ATTRS[type] || [];

  for (const key of Object.keys(normalizedAttrs)) {
    if (!allowed.includes(key)) {
      issues.push(`${path}.${key} is not allowed for node "${type}"`);
    }
  }

  for (const key of required) {
    if (!(key in normalizedAttrs)) {
      issues.push(`${path}.${key} is required for node "${type}"`);
    }
  }

  if (type === "heading" && !Number.isInteger(normalizedAttrs.level)) {
    issues.push(`${path}.level must be an integer for heading nodes`);
  }
  if (type === "tableCell") {
    if (!Number.isInteger(normalizedAttrs.colSpan) || normalizedAttrs.colSpan < 1) {
      issues.push(`${path}.colSpan must be an integer >= 1 for tableCell nodes`);
    }
    if (!Number.isInteger(normalizedAttrs.rowSpan) || normalizedAttrs.rowSpan < 1) {
      issues.push(`${path}.rowSpan must be an integer >= 1 for tableCell nodes`);
    }
    if (typeof normalizedAttrs.header !== "boolean") {
      issues.push(`${path}.header must be a boolean for tableCell nodes`);
    }
    if (normalizedAttrs.align != null && !["left", "center", "right"].includes(normalizedAttrs.align)) {
      issues.push(`${path}.align must be left/center/right for tableCell nodes`);
    }
  }
  if ((type === "mathBlock" || type === "mathInline") && !["latex", "mathml", "omml"].includes(normalizedAttrs.sourceFormat)) {
    issues.push(`${path}.sourceFormat must be latex/mathml/omml for ${type} nodes`);
  }
  if ((type === "mathBlock" || type === "mathInline") && typeof normalizedAttrs.displayMode !== "boolean") {
    issues.push(`${path}.displayMode must be a boolean for ${type} nodes`);
  }
  if (type === "footnote" && typeof normalizedAttrs.id !== "string") {
    issues.push(`${path}.id must be a string for footnote nodes`);
  }
  if (type === "footnoteRef" && typeof normalizedAttrs.refId !== "string") {
    issues.push(`${path}.refId must be a string for footnoteRef nodes`);
  }
}

function validateEmptyNodeRule(node, path, issues) {
  const policy = EMPTY_NODE_POLICIES[node.type];
  if (!policy || !policy.allowed) {
    return;
  }
  if (node.type === "paragraph") {
    if (node.text) {
      issues.push(`${path}.text must stay empty on paragraph nodes; paragraph text should live in child text nodes`);
    }
    return;
  }
  if (policy.strategy === "single-empty-paragraph") {
    if (!Array.isArray(node.content) || node.content.length !== 1 || node.content[0]?.type !== "paragraph") {
      issues.push(`${path} empty state must be represented as a single empty paragraph child`);
      return;
    }
    const paragraph = node.content[0];
    if (Array.isArray(paragraph.content) && paragraph.content.length > 0) {
      return;
    }
  }
}

function validateDocumentMeta(meta, path, issues) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    issues.push(`${path} must be an object`);
    return;
  }
  validateSourceMeta(meta.source, `${path}.source`, issues);
  validateCompatMeta(meta.compat, `${path}.compat`, issues);
  if (!Array.isArray(meta.tags)) {
    issues.push(`${path}.tags must be an array`);
  }
  if (!Array.isArray(meta.labels)) {
    issues.push(`${path}.labels must be an array`);
  }
}

function validateNodeMeta(meta, path, issues) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    issues.push(`${path} must be an object`);
    return;
  }
  validateSourceMeta(meta.source, `${path}.source`, issues);
  validateCompatMeta(meta.compat, `${path}.compat`, issues);
  if (typeof meta.originId !== "string") {
    issues.push(`${path}.originId must be a string`);
  }
  if (typeof meta.legacyType !== "string") {
    issues.push(`${path}.legacyType must be a string`);
  }
}

function validateSourceMeta(source, path, issues) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    issues.push(`${path} must be an object`);
    return;
  }
  for (const key of ["kind", "channel", "parserId", "descriptorId"]) {
    if (typeof source[key] !== "string") {
      issues.push(`${path}.${key} must be a string`);
    }
  }
}

function validateCompatMeta(compat, path, issues) {
  if (!compat || typeof compat !== "object" || Array.isArray(compat)) {
    issues.push(`${path} must be an object`);
    return;
  }
  if (typeof compat.minReaderVersion !== "string") {
    issues.push(`${path}.minReaderVersion must be a string`);
  }
  if (!Array.isArray(compat.featureFlags)) {
    issues.push(`${path}.featureFlags must be an array`);
  }
  if (!Array.isArray(compat.legacyAliases)) {
    issues.push(`${path}.legacyAliases must be an array`);
  }
}

function applyEmptyNodePolicy(node) {
  const policy = EMPTY_NODE_POLICIES[node.type];
  if (!policy || !policy.allowed) {
    return node;
  }
  if (node.type === "paragraph") {
    return {
      ...node,
      text: "",
    };
  }
  if (policy.strategy === "single-empty-paragraph" && (!Array.isArray(node.content) || node.content.length === 0)) {
    return {
      ...node,
      content: [
        {
          type: "paragraph",
          attrs: {},
          content: [],
          text: "",
          marks: [],
          meta: {},
        },
      ],
    };
  }
  return node;
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function filterObjectFields(value, allowedFields) {
  const normalized = normalizeObject(value);
  return Object.fromEntries(
    Object.entries(normalized).filter(([key]) => allowedFields.includes(key))
  );
}

function normalizeSourceMeta(value) {
  const normalized = normalizeObject(value);
  return {
    kind: typeof normalized.kind === "string" ? normalized.kind : "",
    channel: typeof normalized.channel === "string" ? normalized.channel : "",
    parserId: typeof normalized.parserId === "string" ? normalized.parserId : "",
    descriptorId: typeof normalized.descriptorId === "string" ? normalized.descriptorId : "",
  };
}

function normalizeCompatMeta(value) {
  const normalized = normalizeObject(value);
  return {
    minReaderVersion:
      typeof normalized.minReaderVersion === "string"
        ? normalized.minReaderVersion
        : CANONICAL_MIN_READER_VERSION,
    featureFlags: normalizeStringList(normalized.featureFlags),
    legacyAliases: normalizeStringList(normalized.legacyAliases),
  };
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
}

function normalizeMathSourceFormat(value) {
  return ["latex", "mathml", "omml"].includes(value) ? value : "latex";
}
