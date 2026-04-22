import { buildTextTitle, createId, sanitizeText } from "../../../utils.js";
import { RENDER_PAYLOAD_KINDS } from "../rendererPipeline.js";
import {
  buildTextElementContentFields,
  estimateTextHeight,
  estimateTextWidth,
  inlineNodesToHtml,
  inlineNodesToPlainText,
  resolveImportedTextBoxLayout,
} from "../text/sharedTextRenderUtils.js";
import { deriveNodeSourceOrder } from "../shared/sourceOrder.js";

export const LIST_RENDERER_ID = "list-renderer";

export function createListRenderer(options = {}) {
  const id = options.id || LIST_RENDERER_ID;
  const priority = Number.isFinite(options.priority) ? options.priority : 72;

  return {
    id,
    version: "1.0.0",
    displayName: "List Renderer",
    priority,
    payloadKinds: [RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT],
    tags: ["builtin", "list", "canonical-renderer"],
    supports({ renderInput }) {
      const blocks = collectRenderableListBlocks(renderInput?.payload?.content || []);
      if (!blocks.length) {
        return { matched: false, score: -1, reason: "no-renderable-list-blocks" };
      }
      return {
        matched: true,
        score: blocks.length >= 2 ? 20 : 14,
        reason: blocks.length >= 2 ? "multiple-list-blocks" : "list-block-available",
      };
    },
    async render({ renderInput }) {
      const blocks = collectRenderableListBlocks(renderInput?.payload?.content || []);
      const operations = blocks.map((block, index) => buildListOperation(block, index, renderInput));
      return {
        planId: `${id}:${renderInput?.descriptorId || "list-render-plan"}`,
        kind: "element-render-plan",
        payloadKind: renderInput?.kind || RENDER_PAYLOAD_KINDS.CANONICAL_DOCUMENT,
        operations,
        stats: {
          listBlockCount: operations.length,
          taskListCount: operations.filter((operation) => operation.listRole === "taskList").length,
          orderedListCount: operations.filter((operation) => operation.listRole === "orderedList").length,
          bulletListCount: operations.filter((operation) => operation.listRole === "bulletList").length,
        },
        meta: {
          rendererId: id,
        },
      };
    },
  };
}

function collectRenderableListBlocks(nodes = [], context = { quoteDepth: 0 }) {
  const result = [];
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  safeNodes.forEach((node, index) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (isListNode(node.type)) {
      const items = normalizeListItems(node, {
        level: 0,
        orderedStart: Number(node?.attrs?.start) || 1,
      });
      result.push({
        node,
        listRole: node.type,
        items,
        quoteDepth: context.quoteDepth,
        orderKey: `${context.quoteDepth}:${index}`,
      });
      return;
    }
    if (node.type === "blockquote") {
      result.push(
        ...collectRenderableListBlocks(node.content || [], {
          quoteDepth: context.quoteDepth + 1,
        })
      );
    }
  });
  return result.filter((block) => block.items.length > 0);
}

function normalizeListItems(listNode, context = { level: 0, orderedStart: 1 }) {
  const content = Array.isArray(listNode?.content) ? listNode.content : [];
  const result = [];

  content.forEach((itemNode, index) => {
    if (!itemNode || typeof itemNode !== "object") {
      return;
    }
    const orderedIndex =
      listNode.type === "orderedList" ? (Number(context.orderedStart) || 1) + index : null;
    const textSegments = [];
    const childLists = [];

    (Array.isArray(itemNode.content) ? itemNode.content : []).forEach((child) => {
      if (!child || typeof child !== "object") {
        return;
      }
      if (child.type === "paragraph") {
        const plainText = inlineNodesToPlainText(child.content || []);
        const html = inlineNodesToHtml(child.content || []);
        if (plainText.trim() || html.trim()) {
          textSegments.push({
            plainText,
            html,
          });
        }
        return;
      }
      if (isListNode(child.type)) {
        childLists.push(
          ...normalizeListItems(child, {
            level: context.level + 1,
            orderedStart: Number(child?.attrs?.start) || 1,
          })
        );
      }
    });

    const plainText = sanitizeText(textSegments.map((segment) => segment.plainText).join("\n")).trim();
    const htmlBody = textSegments.map((segment) => segment.html).filter(Boolean).join("<br>");

    result.push({
      kind: itemNode.type,
      checked: itemNode.type === "taskItem" ? Boolean(itemNode?.attrs?.checked) : null,
      orderedIndex,
      level: context.level,
      plainText,
      html: htmlBody,
      childItems: childLists,
    });
  });

  return result;
}

function buildListOperation(block, index, renderInput) {
  const normalizedPlainText = buildListPlainText(block.items, block.listRole);
  const normalizedHtml = buildListHtml(block.node, block.items);
  const content = buildTextElementContentFields(
    {
      html: normalizedHtml,
      plainText: normalizedPlainText,
      text: normalizedPlainText,
      fontSize: 20,
    },
    {
      fontSize: 20,
    }
  );
  const plainText = content.plainText;
  const initialLayout = resolveImportedTextBoxLayout(plainText, 20);
  const title = buildTextTitle(plainText || block.listRole || "列表");
  return {
    type: "render-list-block",
    sourceNodeType: block.node.type,
    listRole: block.listRole,
    legacyType: "text",
    order: index,
    layout: {
      strategy: "flow-stack",
      stackIndex: index,
      quoteDepth: block.quoteDepth,
      gap: 18,
    },
    element: {
      id: createId("text"),
      type: "text",
      text: content.text,
      plainText: content.plainText,
      html: content.html,
      richTextDocument: content.richTextDocument,
      title,
      fontSize: 20,
      color: "#0f172a",
      wrapMode: "manual",
      textBoxLayoutMode: initialLayout.textBoxLayoutMode,
      textResizeMode: initialLayout.textResizeMode,
      width: initialLayout.width || estimateTextWidth(plainText, 20),
      height: initialLayout.height || estimateTextHeight(plainText, 20),
      x: 0,
      y: 0,
      locked: false,
      structuredImport: {
        kind: "structured-import-v1",
        blockRole: block.listRole,
        sourceNodeType: block.node.type,
        listRole: block.listRole,
        canonicalFragment: {
          type: block.node.type,
          attrs: {
            role: block.listRole,
          },
          items: JSON.parse(JSON.stringify(block.items)),
        },
      },
    },
    structure: {
      listRole: block.listRole,
      items: block.items,
    },
    meta: {
      descriptorId: String(renderInput?.descriptorId || ""),
      parserId: String(renderInput?.parserId || ""),
    },
    sourceOrder: deriveNodeSourceOrder(block?.node, index),
  };
}

function buildListPlainText(items = [], listRole = "bulletList") {
  return flattenListItems(items)
    .map((item) => {
      const indent = "  ".repeat(item.level || 0);
      const marker = getPlainTextMarker(item, listRole);
      return `${indent}${marker}${item.plainText || ""}`.trimEnd();
    })
    .join("\n");
}

function flattenListItems(items = []) {
  const result = [];
  const safeItems = Array.isArray(items) ? items : [];
  safeItems.forEach((item) => {
    result.push({
      ...item,
    });
    if (Array.isArray(item.childItems) && item.childItems.length) {
      result.push(...flattenListItems(item.childItems));
    }
  });
  return result;
}

function getPlainTextMarker(item, listRole) {
  if (item.kind === "taskItem") {
    return item.checked ? "[x] " : "[ ] ";
  }
  if (item.orderedIndex != null || listRole === "orderedList") {
    const resolved = Number.isFinite(Number(item.orderedIndex)) ? Number(item.orderedIndex) : 1;
    return `${resolved}. `;
  }
  return "• ";
}

function buildListHtml(listNode, items = []) {
  const tagName = listNode?.type === "orderedList" ? "ol" : "ul";
  const attrs = [];
  if (listNode?.type === "orderedList" && Number(listNode?.attrs?.start) > 1) {
    attrs.push(` start="${Number(listNode.attrs.start)}"`);
  }
  if (listNode?.type === "taskList") {
    attrs.push(' data-ff-task-list="true"');
  }
  return `<${tagName}${attrs.join("")}>${items.map((item) => renderListItemHtml(item)).join("")}</${tagName}>`;
}

function renderListItemHtml(item) {
  const taskAttrs = item.kind === "taskItem"
    ? ` data-ff-task-item="true" data-ff-task-state="${item.checked ? "done" : "todo"}"`
    : "";
  const taskMarker = item.kind === "taskItem"
    ? `<span data-ff-task-marker="true">${item.checked ? "☑" : "☐"}</span> `
    : "";
  const body = item.html || "";
  const nested = Array.isArray(item.childItems) && item.childItems.length
    ? buildNestedListHtml(item.childItems)
    : "";
  return `<li data-kind="${escapeAttribute(item.kind)}"${taskAttrs}>${taskMarker}${body}${nested}</li>`;
}

function buildNestedListHtml(items) {
  if (!items.length) {
    return "";
  }
  const isTask = items.some((item) => item.kind === "taskItem");
  const tagName = isTask ? "ul" : items.some((item) => item.orderedIndex != null) ? "ol" : "ul";
  const taskAttr = isTask ? ' data-ff-task-list="true"' : "";
  return `<${tagName}${taskAttr}>${items.map((item) => renderListItemHtml(item)).join("")}</${tagName}>`;
}

function isListNode(type) {
  return type === "bulletList" || type === "orderedList" || type === "taskList";
}

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
