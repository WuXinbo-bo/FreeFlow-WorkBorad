function descriptor(options = {}) {
  return Object.freeze({
    editor: String(options.editor || "none"),
    inspector: String(options.inspector || "common"),
    contextMenu: String(options.contextMenu || "element"),
    preview: String(options.preview || "none"),
    commands: Object.freeze(Array.from(new Set(options.commands || []))),
    acceptance: Object.freeze(Array.from(new Set(options.acceptance || []))),
  });
}

const COMMON_COMMANDS = [
  "selection.cut",
  "selection.copy",
  "selection.delete",
  "selection.toggle-lock",
  "selection.layer-front",
  "selection.layer-back",
  "selection.layer-up",
  "selection.layer-down",
];

const COMMON_ACCEPTANCE = ["select", "move", "resize", "undo-redo", "forward-recovery", "reverse-recovery"];

export const BUILTIN_ELEMENT_UX = Object.freeze({
  shape: descriptor({
    editor: "shape",
    inspector: "shape",
    contextMenu: "shape",
    commands: [...COMMON_COMMANDS, "shape.reverse", "shape.toggle-dash", "shape.toggle-fill"],
    acceptance: [...COMMON_ACCEPTANCE, "rotate", "endpoint-edit"],
  }),
  image: descriptor({
    editor: "image",
    inspector: "image",
    contextMenu: "image",
    preview: "image",
    commands: [...COMMON_COMMANDS, "image.crop", "image.rotate", "image.flip", "image.reset-adjustments", "image.memo"],
    acceptance: [...COMMON_ACCEPTANCE, "crop", "rotate", "flip", "memo", "resource-recovery"],
  }),
  fileCard: descriptor({
    editor: "file-memo",
    inspector: "file-card",
    contextMenu: "file-card",
    preview: "document",
    commands: [...COMMON_COMMANDS, "file.open", "file.preview", "file.retry-preview", "file.memo"],
    acceptance: [...COMMON_ACCEPTANCE, "preview-open-close", "preview-repeat", "preview-failure-retry", "memo"],
  }),
  codeBlock: descriptor({
    editor: "code-block",
    inspector: "code-block",
    contextMenu: "code-block",
    commands: [...COMMON_COMMANDS, "element.edit", "code.copy", "code.toggle-wrap", "code.toggle-lines"],
    acceptance: [...COMMON_ACCEPTANCE, "edit-commit-cancel", "language", "mermaid-preview"],
  }),
  table: descriptor({
    editor: "table",
    inspector: "table",
    contextMenu: "table",
    commands: [...COMMON_COMMANDS, "element.edit", "table.insert", "table.move", "table.delete", "table.toggle-header"],
    acceptance: [...COMMON_ACCEPTANCE, "edit-commit-cancel", "cell-range", "row-column", "clipboard"],
  }),
  mathBlock: descriptor({
    editor: "math",
    inspector: "math",
    contextMenu: "math",
    commands: [...COMMON_COMMANDS, "element.edit"],
    acceptance: [...COMMON_ACCEPTANCE, "edit-commit-cancel", "latex-render"],
  }),
  mathInline: descriptor({
    editor: "math",
    inspector: "math",
    contextMenu: "math",
    commands: [...COMMON_COMMANDS, "element.edit"],
    acceptance: [...COMMON_ACCEPTANCE, "edit-commit-cancel", "latex-render"],
  }),
  mindNode: descriptor({
    editor: "mind-node",
    inspector: "mind-node",
    contextMenu: "mind-node",
    commands: [...COMMON_COMMANDS, "element.edit", "mind.child", "mind.sibling", "mind.promote", "mind.demote", "mind.collapse"],
    acceptance: [...COMMON_ACCEPTANCE, "edit-commit-cancel", "tree-layout", "collapse-recovery", "canvas-link"],
  }),
  mindSummary: descriptor({
    editor: "mind-node",
    inspector: "mind-summary",
    contextMenu: "mind-summary",
    commands: [...COMMON_COMMANDS, "element.edit"],
    acceptance: [...COMMON_ACCEPTANCE, "edit-commit-cancel", "tree-layout"],
  }),
  mindRelationship: descriptor({
    editor: "none",
    inspector: "mind-relationship",
    contextMenu: "mind-relationship",
    commands: ["selection.delete"],
    acceptance: ["select", "delete", "endpoint-follow", "undo-redo", "reverse-recovery"],
  }),
  flowNode: descriptor({
    editor: "flow-node",
    inspector: "flow-node",
    contextMenu: "flow-node",
    commands: [...COMMON_COMMANDS, "element.edit"],
    acceptance: [...COMMON_ACCEPTANCE, "edit-commit-cancel", "connect"],
  }),
  flowEdge: descriptor({
    editor: "none",
    inspector: "flow-edge",
    contextMenu: "flow-edge",
    commands: ["selection.delete", "flow.reverse", "flow.toggle-dash"],
    acceptance: ["select", "delete", "endpoint-follow", "undo-redo", "reverse-recovery"],
  }),
  text: descriptor({
    editor: "text",
    inspector: "text",
    contextMenu: "text",
    commands: [...COMMON_COMMANDS, "element.edit", "text.link", "text.inline-math", "text.block-math"],
    acceptance: [...COMMON_ACCEPTANCE, "edit-commit-cancel", "rich-format", "link", "clipboard"],
  }),
});

export function getBuiltinElementUx(type = "") {
  return BUILTIN_ELEMENT_UX[String(type || "").trim()] || descriptor();
}
