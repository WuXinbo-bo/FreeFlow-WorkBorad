import { getCanvasFileKindMeta } from "../fileMetadata.js";
import { CanvasItem } from "./CanvasItem.js";
import { escapeCssColor, escapeHtml, formatBytes, getFileExtension, getFileNameFromPath } from "../canvasUtils.js";

export class FileItem extends CanvasItem {
  get width() {
    return Number(this.payload.width) || 0;
  }

  get height() {
    return Number(this.payload.height) || 0;
  }

  getCardTitle() {
    return String(this.payload.fileName || this.payload.title || "未命名素材").trim() || "未命名素材";
  }

  getFileMetaLine() {
    if (this.payload.isDirectory) return "folder";
    const kindMeta = getCanvasFileKindMeta(this.payload);
    const extension = String(this.payload.detectedExt || this.payload.fileExt || getFileExtension(this.payload.fileName || this.payload.title || "")).trim().toLowerCase();
    const location = String(this.payload.filePath || this.payload.locationLabel || this.payload.fileBaseName || "").trim();
    const parts = [kindMeta?.label || "文件"];
    if (extension) parts.push(`.${extension}`);
    if (this.payload.hasFileSize) parts.push(formatBytes(this.payload.fileSize));
    if (location) parts.push(location);
    return parts.join(" · ");
  }

  getDimensions() {
    if (this.payload.kind === "image") {
      return {
        width: Math.max(220, Math.min(420, this.width || 280)),
        minHeight: Math.max(180, Math.min(420, this.height || 220)),
      };
    }
    return {
      width: Math.max(280, Math.min(420, this.width || 344)),
      minHeight: Math.max(132, Math.min(220, this.height || 140)),
    };
  }

  render({ selected = false } = {}) {
    const renderX = Math.round(Number(this.payload.renderX) || 0);
    const renderY = Math.round(Number(this.payload.renderY) || 0);
    const dimensions = this.getDimensions();

    if (this.payload.kind === "image" && this.payload.dataUrl) {
      const style = `left:${renderX}px;top:${renderY}px;width:${Math.round(dimensions.width)}px;height:${Math.round(
        dimensions.minHeight
      )}px;`;
      return `
        <article class="canvas-card canvas-card-image${selected ? " is-selected" : ""}" data-canvas-item-id="${escapeHtml(
          this.id
        )}" style="${style}">
          <img class="canvas-card-image-asset" src="${escapeHtml(this.payload.dataUrl)}" alt="${escapeHtml(
            this.getCardTitle()
          )}" draggable="false" />
          <button class="canvas-image-resize-handle canvas-image-resize-handle-left" type="button" data-canvas-image-resize="${escapeHtml(
            this.id
          )}" data-canvas-image-resize-handle="left" aria-label="调整左边缘"></button>
          <button class="canvas-image-resize-handle canvas-image-resize-handle-right" type="button" data-canvas-image-resize="${escapeHtml(
            this.id
          )}" data-canvas-image-resize-handle="right" aria-label="调整右边缘"></button>
          <button class="canvas-image-resize-handle canvas-image-resize-handle-bottom" type="button" data-canvas-image-resize="${escapeHtml(
            this.id
          )}" data-canvas-image-resize-handle="bottom" aria-label="调整底边缘"></button>
          <button class="canvas-image-resize-handle canvas-image-resize-handle-top-left" type="button" data-canvas-image-resize="${escapeHtml(
            this.id
          )}" data-canvas-image-resize-handle="top-left" aria-label="等比调整左上角"></button>
          <button class="canvas-image-resize-handle canvas-image-resize-handle-top-right" type="button" data-canvas-image-resize="${escapeHtml(
            this.id
          )}" data-canvas-image-resize-handle="top-right" aria-label="等比调整右上角"></button>
          <button class="canvas-image-resize-handle canvas-image-resize-handle-bottom-left" type="button" data-canvas-image-resize="${escapeHtml(
            this.id
          )}" data-canvas-image-resize-handle="bottom-left" aria-label="等比调整左下角"></button>
          <button class="canvas-image-resize-handle canvas-image-resize-handle-bottom-right" type="button" data-canvas-image-resize="${escapeHtml(
            this.id
          )}" data-canvas-image-resize-handle="bottom-right" aria-label="等比调整右下角"></button>
        </article>
      `;
    }

    const fileTypeMeta = getCanvasFileKindMeta(this.payload);
    const tagStyle = [
      `--canvas-file-tag-bg:${escapeCssColor(fileTypeMeta?.background || "#F1F3F5")}`,
      `--canvas-file-tag-color:${escapeCssColor(fileTypeMeta?.textColor || "#5F6B76")}`,
      `--canvas-file-tag-border:${escapeCssColor(fileTypeMeta?.borderColor || "#D7DDE3")}`,
    ].join(";");
    const style = `left:${renderX}px;top:${renderY}px;width:${Math.round(dimensions.width)}px;min-height:${Math.round(
      dimensions.minHeight
    )}px;`;

    const displayName = escapeHtml(this.getCardTitle() || getFileNameFromPath(this.payload.filePath || this.payload.fileName || this.payload.title || ""));
    const iconGlyph = escapeHtml(fileTypeMeta?.icon || "📦");
    const metaTitle = escapeHtml(fileTypeMeta?.label || "文件");
    return `
      <article class="canvas-card canvas-card-${escapeHtml(this.payload.kind)}${selected ? " is-selected" : ""}" data-canvas-item-id="${escapeHtml(
        this.id
      )}" style="${style}">
        <div class="canvas-file-card">
          <div class="canvas-file-card-header">
            <span class="canvas-file-icon" style="${tagStyle}" aria-hidden="true">${iconGlyph}</span>
            <div class="canvas-card-head canvas-file-card-head">
              <strong class="canvas-card-title">${displayName}</strong>
              <div class="canvas-card-subtitle">${metaTitle}</div>
            </div>
            <span class="canvas-file-type-tag" style="${tagStyle}">${escapeHtml(fileTypeMeta?.label || "文件")}</span>
          </div>
        </div>
      </article>
    `;
  }
}
