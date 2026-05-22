import { buildWordExportAstFromItems, buildSelectionWordExportPlan } from "./buildWordExportAst.js";

const PREVIEW_MAX_BLOCKS = 80;
const PREVIEW_MAX_INLINE_TEXT = 260;

function toText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value = "", maxLength = PREVIEW_MAX_INLINE_TEXT) {
  const text = toText(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function getItemTypeLabel(type = "") {
  const normalized = String(type || "").trim();
  if (normalized === "text" || normalized === "flowNode") return "富文本";
  if (normalized === "table") return "表格";
  if (normalized === "codeBlock") return "代码块";
  if (normalized === "mathBlock" || normalized === "mathInline") return "数学公式";
  if (normalized === "image") return "图片";
  if (normalized === "shape") return "图形";
  if (normalized === "fileCard") return "文件卡";
  return normalized || "元素";
}

function collectInlineText(children = []) {
  return (Array.isArray(children) ? children : [])
    .map((child) => {
      const type = String(child?.type || "").trim();
      if (type === "text" || type === "inlineCode") {
        return child.text || "";
      }
      if (type === "link") {
        return collectInlineText(child.children || []);
      }
      if (type === "mathInline") {
        return child.latex ? ` ${child.latex} ` : "";
      }
      if (type === "footnoteRef") {
        return "[注]";
      }
      if (type === "image") {
        return "[图片]";
      }
      if (type === "break") {
        return "\n";
      }
      return "";
    })
    .join("");
}

function getNodePreviewText(node = {}) {
  const type = String(node?.type || "").trim();
  if (type === "paragraph" || type === "heading") {
    return truncateText(collectInlineText(node.children || []), 220);
  }
  if (type === "mathBlock") {
    return truncateText(node.latex || "", 180);
  }
  if (type === "codeBlock") {
    return truncateText(node.text || "", 220);
  }
  if (type === "list") {
    const firstItem = Array.isArray(node.items) ? node.items[0] : null;
    const firstParagraph = Array.isArray(firstItem?.children)
      ? firstItem.children.find((child) => String(child?.type || "") === "paragraph")
      : null;
    return truncateText(collectInlineText(firstParagraph?.children || []), 160);
  }
  return "";
}

function summarizeAstNode(node = {}, path = "") {
  const type = String(node?.type || "").trim();
  if (!type) {
    return null;
  }
  if (type === "paragraph") {
    return {
      id: path,
      type,
      label: "段落",
      align: node.align || "left",
      text: getNodePreviewText(node),
    };
  }
  if (type === "heading") {
    return {
      id: path,
      type,
      label: `标题 H${node.level || 1}`,
      level: Math.max(1, Math.min(6, Number(node.level || 1) || 1)),
      align: node.align || "left",
      text: getNodePreviewText(node) || "未命名标题",
    };
  }
  if (type === "list") {
    const items = (Array.isArray(node.items) ? node.items : []).slice(0, 8).map((item, index) => {
      const paragraph = Array.isArray(item?.children)
        ? item.children.find((child) => String(child?.type || "") === "paragraph")
        : null;
      return truncateText(collectInlineText(paragraph?.children || []), 120) || "列表项";
    });
    return {
      id: path,
      type,
      label: node.ordered ? "有序列表" : node.task ? "任务列表" : "无序列表",
      ordered: Boolean(node.ordered),
      task: Boolean(node.task),
      items,
      overflowCount: Math.max(0, (Array.isArray(node.items) ? node.items.length : 0) - items.length),
    };
  }
  if (type === "table") {
    const rows = Array.isArray(node.rows) ? node.rows : [];
    const columnCount = rows.reduce((max, row) => Math.max(max, Array.isArray(row?.cells) ? row.cells.length : 0), 0);
    const previewRows = rows.slice(0, 5).map((row) => ({
      header: Boolean(row?.header),
      cells: (Array.isArray(row?.cells) ? row.cells : []).slice(0, 5).map((cell) => {
        const firstParagraph = Array.isArray(cell?.children)
          ? cell.children.find((child) => String(child?.type || "") === "paragraph")
          : null;
        return truncateText(collectInlineText(firstParagraph?.children || []), 80);
      }),
    }));
    return {
      id: path,
      type,
      label: "表格",
      rows: previewRows,
      rowCount: rows.length,
      columnCount,
      overflowRowCount: Math.max(0, rows.length - previewRows.length),
    };
  }
  if (type === "codeBlock") {
    return {
      id: path,
      type,
      label: "代码块",
      language: String(node.language || "").trim(),
      text: getNodePreviewText(node) || "空代码块",
    };
  }
  if (type === "mathBlock") {
    return {
      id: path,
      type,
      label: "数学公式",
      text: getNodePreviewText(node) || "空公式",
    };
  }
  if (type === "blockquote") {
    const children = (Array.isArray(node.children) ? node.children : [])
      .map((child, index) => summarizeAstNode(child, `${path}-quote-${index}`))
      .filter(Boolean)
      .slice(0, 4);
    return {
      id: path,
      type,
      label: "引用",
      children,
    };
  }
  if (type === "thematicBreak") {
    return {
      id: path,
      type,
      label: "分割线",
    };
  }
  return null;
}

function summarizeAst(ast = null) {
  const sections = Array.isArray(ast?.sections) ? ast.sections : [];
  const blocks = [];
  sections.forEach((section, sectionIndex) => {
    (Array.isArray(section?.children) ? section.children : []).forEach((node, nodeIndex) => {
      if (blocks.length >= PREVIEW_MAX_BLOCKS) {
        return;
      }
      const summary = summarizeAstNode(node, `${sectionIndex}-${nodeIndex}`);
      if (summary) {
        blocks.push(summary);
      }
    });
  });
  return blocks;
}

function countSupportedByType(entries = []) {
  return entries.reduce((acc, entry) => {
    const label = getItemTypeLabel(entry?.type || entry?.item?.type || "");
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

export function buildWordExportPreviewModel(items = [], options = {}) {
  const normalizedItems = (Array.isArray(items) ? items : []).filter((item) => item && typeof item === "object");
  const plan = buildSelectionWordExportPlan(normalizedItems, options);
  const exportableItems = plan.orderedEntries.map((entry) => entry.item).filter(Boolean);
  const ast = exportableItems.length
    ? buildWordExportAstFromItems(exportableItems, {
        title: options.title || "导出 Word",
      })
    : null;
  const blocks = ast ? summarizeAst(ast) : [];
  const skippedItems = Array.isArray(ast?.meta?.skippedItems) ? ast.meta.skippedItems : plan.meta.skippedItems;
  return {
    title: String(options.title || "导出 Word").trim() || "导出 Word",
    scope: normalizedItems.length === 1 ? "single" : "selection",
    itemCount: normalizedItems.length,
    exportableCount: exportableItems.length,
    skippedCount: Array.isArray(skippedItems) ? skippedItems.length : 0,
    skippedItems: Array.isArray(skippedItems)
      ? skippedItems.map((entry) => ({
          id: entry.id || "",
          type: entry.type || "unknown",
          label: getItemTypeLabel(entry.type || ""),
          reason: entry.reason || "unsupported",
        }))
      : [],
    typeSummary: countSupportedByType(plan.orderedEntries),
    orderedItemIds: plan.meta.orderedItemIds || [],
    sortStrategy: plan.meta.sortStrategy || "visual-reading-order",
    blocks,
    overflowBlockCount: Math.max(
      0,
      (Array.isArray(ast?.sections?.[0]?.children) ? ast.sections[0].children.length : blocks.length) - blocks.length
    ),
    astVersion: ast?.version || null,
    ast,
  };
}
