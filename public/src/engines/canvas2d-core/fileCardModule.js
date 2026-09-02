import { buildFileCardContextMenuHtml as buildSharedFileCardContextMenuHtml } from "./contextMenu/menuSchemaBuilders.js";

export function isFileCard(item) {
  return item?.type === "fileCard";
}

export function buildFileCardContextMenuHtml(item = {}, runtime = {}) {
  return buildSharedFileCardContextMenuHtml(item, runtime);
}

export function getFileCardHit(items, hitTestElement, scenePoint, scale) {
  const hit = hitTestElement(items, scenePoint, scale);
  return hit?.type === "fileCard" ? hit : null;
}

export function toggleFileCardMark(items, selectedIds) {
  const selected = new Set(selectedIds || []);
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.type !== "fileCard" || !selected.has(item.id)) {
      return item;
    }
    changed = true;
    return {
      ...item,
      marked: !item.marked,
    };
  });
  return { items: nextItems, changed };
}

export function removeFileCardById(items, id) {
  const nextItems = items.filter((item) => item.id !== id);
  return { items: nextItems, removed: nextItems.length !== items.length };
}

export async function pasteFileCardsFromClipboard({ clipboardBroker, dragBroker, anchor }) {
  const filePaths = await clipboardBroker.readSystemClipboardFiles();
  if (filePaths.length) {
    return { items: await dragBroker.createFileCardsFromPaths(filePaths, anchor), source: "system" };
  }
  return { items: [], source: "none" };
}
