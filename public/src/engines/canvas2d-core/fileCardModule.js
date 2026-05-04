export function isFileCard(item) {
  return item?.type === "fileCard";
}

export function buildFileCardContextMenuHtml(item = {}) {
  const locked = Boolean(item?.locked);
  const lockLabel = locked ? "解锁" : "锁定";
  const ext = String(item?.ext || "").trim().toLowerCase();
  const previewSupported = ext === "docx" || ext === "pdf";
  return `
    <button type="button" class="canvas2d-context-menu-item" data-action="cut">剪切</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="copy">复制</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
    <button type="button" class="canvas2d-context-menu-item${previewSupported ? "" : " is-disabled"}" data-action="file-preview"${previewSupported ? "" : ' disabled title="当前仅支持 DOCX / PDF 预览"'}>预览</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="file-reveal">打开所在位置</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="file-memo">标签与备忘录</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="file-mark">重点标记</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="connect-node">连接节点</button>
    <div class="canvas2d-context-submenu">
      <button type="button" class="canvas2d-context-menu-item canvas2d-context-submenu-trigger">图层</button>
      <div class="canvas2d-context-submenu-panel" role="menu" aria-label="图层">
        <button type="button" class="canvas2d-context-menu-item" data-action="layer-front">置于顶层</button>
        <button type="button" class="canvas2d-context-menu-item" data-action="layer-back">置于底层</button>
        <button type="button" class="canvas2d-context-menu-item" data-action="layer-up">上移一层</button>
        <button type="button" class="canvas2d-context-menu-item" data-action="layer-down">下移一层</button>
      </div>
    </div>
    <button type="button" class="canvas2d-context-menu-item" data-action="toggle-lock">${lockLabel}</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="delete">删除</button>
  `;
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
