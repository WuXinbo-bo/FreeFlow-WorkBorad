import { createImageElement, normalizeImageElement } from "./elements/media.js";
import { createImageRenderer } from "./rendererImage.js";

export { createImageElement, normalizeImageElement };

export function isImageFile(file) {
  return String(file?.type || "").startsWith("image/");
}

export function buildImageContextMenuHtml(item = {}) {
  const locked = Boolean(item?.locked);
  const lockLabel = locked ? "解锁" : "锁定";
  return `
    <button type="button" class="canvas2d-context-menu-item" data-action="cut">剪切</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="image-copy">复制</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="paste">粘贴</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="image-edit">轻量编辑图片</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="image-restore">恢复原图</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="image-export">导出当前图片</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="image-reveal">打开所在位置</button>
    <button type="button" class="canvas2d-context-menu-item" data-action="image-memo">标签与备忘录</button>
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

export function createImageModule() {
  return {
    createElement: createImageElement,
    normalizeElement: normalizeImageElement,
    isImageFile,
    createRenderer: createImageRenderer,
    buildContextMenuHtml: buildImageContextMenuHtml,
  };
}
