import { normalizeTextElement, TEXT_STRUCTURED_IMPORT_KIND } from "../../../elements/text.js";

export function isTaskListTextElement(element = {}) {
  const structuredImport = element?.structuredImport;
  if (!structuredImport || typeof structuredImport !== "object") {
    return false;
  }
  if (structuredImport.kind !== TEXT_STRUCTURED_IMPORT_KIND) {
    return false;
  }
  return String(structuredImport.listRole || "") === "taskList";
}

export function getTaskListItems(element = {}) {
  if (!isTaskListTextElement(element)) {
    return [];
  }
  const items = element?.structuredImport?.canonicalFragment?.items;
  return Array.isArray(items) ? JSON.parse(JSON.stringify(items)) : [];
}

export function toggleTaskListItemChecked(element = {}, targetIndex = 0) {
  return updateTaskListItems(element, (items) => {
    const flat = flattenTaskItems(items);
    const target = flat[targetIndex];
    if (!target) {
      return items;
    }
    target.item.checked = !Boolean(target.item.checked);
    return items;
  });
}

export function setTaskListItemChecked(element = {}, targetIndex = 0, checked = true) {
  return updateTaskListItems(element, (items) => {
    const flat = flattenTaskItems(items);
    const target = flat[targetIndex];
    if (!target) {
      return items;
    }
    target.item.checked = Boolean(checked);
    return items;
  });
}

export function setAllTaskListItemsChecked(element = {}, checked = true) {
  return updateTaskListItems(element, (items) => {
    flattenTaskItems(items).forEach((entry) => {
      entry.item.checked = Boolean(checked);
    });
    return items;
  });
}

export function updateTaskListItems(element = {}, updater) {
  if (!isTaskListTextElement(element)) {
    return normalizeTextElement(element);
  }
  const items = getTaskListItems(element);
  const nextItems = typeof updater === "function" ? updater(items) || items : items;
  const canonicalFragment = {
    ...element.structuredImport.canonicalFragment,
    items: nextItems,
  };
  const plainText = buildTaskListPlainText(nextItems);
  const html = buildTaskListHtml(nextItems);
  return normalizeTextElement({
    ...element,
    text: plainText,
    plainText,
    html,
    title: plainText.split("\n").find((line) => line.trim()) || element.title || "任务列表",
    structuredImport: {
      ...element.structuredImport,
      canonicalFragment,
    },
  });
}

function flattenTaskItems(items = [], entries = []) {
  const safeItems = Array.isArray(items) ? items : [];
  safeItems.forEach((item) => {
    entries.push({ item });
    if (Array.isArray(item.childItems) && item.childItems.length) {
      flattenTaskItems(item.childItems, entries);
    }
  });
  return entries;
}

function buildTaskListPlainText(items = []) {
  return flattenTaskItemsForRender(items)
    .map((item) => {
      const indent = "  ".repeat(item.level || 0);
      return `${indent}${item.checked ? "[x]" : "[ ]"} ${item.plainText || ""}`.trimEnd();
    })
    .join("\n");
}

function buildTaskListHtml(items = []) {
  return `<ul>${items.map((item) => renderTaskItemHtml(item)).join("")}</ul>`;
}

function renderTaskItemHtml(item) {
  const nested = Array.isArray(item.childItems) && item.childItems.length
    ? `<ul>${item.childItems.map((child) => renderTaskItemHtml(child)).join("")}</ul>`
    : "";
  const body = `${item.checked ? "☑" : "☐"} ${item.html || escapeHtml(item.plainText || "")}`;
  return `<li data-kind="taskItem">${body}${nested}</li>`;
}

function flattenTaskItemsForRender(items = [], level = 0, result = []) {
  const safeItems = Array.isArray(items) ? items : [];
  safeItems.forEach((item) => {
    result.push({
      ...item,
      level: Number(item?.level ?? level) || level,
    });
    if (Array.isArray(item.childItems) && item.childItems.length) {
      flattenTaskItemsForRender(item.childItems, level + 1, result);
    }
  });
  return result;
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
