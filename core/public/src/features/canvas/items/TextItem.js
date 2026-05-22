import { CanvasItem } from "./CanvasItem.js";
import { escapeHtml, formatCanvasTextboxHtml } from "../canvasUtils.js";
import { createCanvasTextTitle } from "../schema.js";

export class TextItem extends CanvasItem {
  get width() {
    return Number(this.payload.width) || 0;
  }

  get height() {
    return Number(this.payload.height) || 0;
  }

  get fontSize() {
    return Number(this.payload.fontSize) || 18;
  }

  render({ selected = false, editing = false } = {}) {
    const style = `left:${Math.round(Number(this.payload.renderX) || 0)}px;top:${Math.round(Number(this.payload.renderY) || 0)}px;width:${Math.round(
      this.width
    )}px;min-height:${Math.round(this.height)}px;--canvas-text-font-size:${Math.round(this.fontSize)}px;`;
    const textHtml = formatCanvasTextboxHtml(this.payload.text || "");
    return `
      <article class="canvas-textbox${selected ? " is-selected" : ""}${editing ? " is-editing" : ""}${
        this.payload.bold ? " is-bold" : ""
      }${this.payload.highlighted ? " is-highlighted" : ""}" data-canvas-item-id="${escapeHtml(this.id)}" style="${style}">
        ${
          editing
            ? `<div class="canvas-textbox-editor" contenteditable="true" spellcheck="false" data-placeholder="输入文本" data-canvas-textbox-editor="${escapeHtml(
                this.id
              )}">${textHtml}</div>`
            : `<div class="canvas-textbox-copy">${textHtml || '<span class="canvas-textbox-placeholder">双击输入文本</span>'}</div>`
        }
      </article>
    `;
  }
}

export function normalizeTextItemPayload(payload = {}) {
  return {
    ...payload,
    kind: payload.kind === "text" ? "text" : "textbox",
    title: String(payload.title || "").trim() || createCanvasTextTitle(payload.text || ""),
  };
}

