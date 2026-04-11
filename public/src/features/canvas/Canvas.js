import { CONFIG, IS_DESKTOP_APP, DESKTOP_SHELL } from "../../config/index.js";
import { clampCanvasScale } from "./canvasUtils.js";
import { createCanvasItem, isCanvasTextItem } from "./items/index.js";

export class Canvas {
  constructor(options = {}) {
    this.state = options.state;
    this.refs = options.refs || {};
    this.setStatus = options.setStatus || (() => {});
    this.scheduleDesktopWindowShapeSync = options.scheduleDesktopWindowShapeSync || (() => {});
    this.bindTextEditors = options.bindTextEditors || (() => {});
  }

  get view() {
    return this.state?.canvasBoard?.view || { scale: 1, offsetX: 0, offsetY: 0 };
  }

  setView(nextView = {}, { persist = true } = {}) {
    this.state.canvasBoard.view = {
      ...this.state.canvasBoard.view,
      ...nextView,
      scale: clampCanvasScale(nextView.scale ?? this.state.canvasBoard.view.scale, CONFIG.canvasDefaultScale),
    };
    this.render();
    if (persist && typeof this.onPersist === "function") {
      this.onPersist(this.state.canvasBoard);
    }
  }

  getCanvasPositionFromClientPoint(clientX, clientY) {
    const viewportEl = this.refs.canvasViewportEl;
    if (!viewportEl) return { x: 0, y: 0 };
    const rect = viewportEl.getBoundingClientRect();
    const scale = clampCanvasScale(this.view.scale, CONFIG.canvasDefaultScale);
    const scrollLeft = Number(viewportEl.scrollLeft) || 0;
    const scrollTop = Number(viewportEl.scrollTop) || 0;
    const offsetX = Number(this.view.offsetX) || 0;
    const offsetY = Number(this.view.offsetY) || 0;
    return {
      x: (clientX - rect.left + scrollLeft - offsetX) / scale,
      y: (clientY - rect.top + scrollTop - offsetY) / scale,
    };
  }

  setScaleContinuous(nextScale, { persist = true, status = true } = {}) {
    const scale = clampCanvasScale(nextScale, CONFIG.canvasDefaultScale);
    this.setView({ scale }, { persist });
    if (status) {
      this.setStatus(`画布缩放：${Math.round(scale * 100)}%`);
    }
  }

  render() {
    const canvasSurfaceEl = this.refs.canvasSurfaceEl;
    const canvasItemsEl = this.refs.canvasItemsEl;
    if (!canvasSurfaceEl || !canvasItemsEl || !this.state?.canvasBoard) return;

    const view = this.state.canvasBoard.view || {};
    const scale = clampCanvasScale(view.scale, CONFIG.canvasDefaultScale);
    const offsetX = Number(view.offsetX) || 0;
    const offsetY = Number(view.offsetY) || 0;
    canvasSurfaceEl.style.setProperty("--canvas-scale", scale.toFixed(3));
    canvasSurfaceEl.style.setProperty("--canvas-offset-x", `${offsetX}px`);
    canvasSurfaceEl.style.setProperty("--canvas-offset-y", `${offsetY}px`);

    if (this.refs.canvasZoomLabelEl) {
      this.refs.canvasZoomLabelEl.textContent = `${Math.round(scale * 100)}%`;
    }
    if (this.refs.canvasZoomRangeEl) {
      this.refs.canvasZoomRangeEl.value = String(Math.round(scale * 100));
    }
    if (this.refs.canvasItemCountEl) {
      this.refs.canvasItemCountEl.textContent = String(this.state.canvasBoard.items.length);
    }

    const items = Array.isArray(this.state.canvasBoard.items) ? this.state.canvasBoard.items : [];
    const selectedIds = new Set(Array.isArray(this.state.canvasBoard.selectedIds) ? this.state.canvasBoard.selectedIds : []);
    const editingId = this.state.canvasEditingTextId;
    const draftItem = this.state.canvasDraftItem;

    if (this.refs.canvasEmptyStateEl) {
      this.refs.canvasEmptyStateEl.classList.toggle("is-hidden", items.length > 0 || Boolean(draftItem));
    }

    if (Array.isArray(this.refs.canvasToolButtons)) {
      for (const button of this.refs.canvasToolButtons) {
        if (!(button instanceof HTMLElement)) continue;
        const tool = String(button.dataset.canvasTool || "").trim();
        const isActive = tool && tool === String(this.state.canvasTool || "select");
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      }
    }

    canvasItemsEl.innerHTML = items
      .map((item, index) => {
        const renderItem = createCanvasItem(item, index);
        const renderX = Math.round(Number(item.x) || 0);
        const renderY = Math.round(Number(item.y) || 0);
        renderItem.payload.renderX = renderX;
        renderItem.payload.renderY = renderY;
        const selected = selectedIds.has(renderItem.id);
        const editing = editingId === renderItem.id;
        return isCanvasTextItem(renderItem.payload)
          ? renderItem.render({ selected, editing })
          : renderItem.render({ selected });
      })
      .join("");

    if (this.refs.canvasDraftLayerEl) {
      if (draftItem) {
        const draftRender = createCanvasItem(draftItem, items.length);
        this.refs.canvasDraftLayerEl.innerHTML = draftRender.render({ selected: false });
      } else {
        this.refs.canvasDraftLayerEl.innerHTML = "";
      }
    }

    this.bindTextEditors?.();
    if (selectedIds.size > 0) {
      this.setStatus(`已选中 ${selectedIds.size} 个素材卡`);
    }
  }

  focusNearestItem() {
    const viewportEl = this.refs.canvasViewportEl;
    const canvasItemsEl = this.refs.canvasItemsEl;
    if (!viewportEl || !Array.isArray(this.state?.canvasBoard?.items) || !this.state.canvasBoard.items.length) {
      this.setStatus("画布中还没有元素");
      return;
    }

    const viewportRect = viewportEl.getBoundingClientRect();
    const viewportCenterX = viewportRect.left + viewportRect.width / 2;
    const viewportCenterY = viewportRect.top + viewportRect.height / 2;
    const selectedIds = new Set(this.state.canvasBoard.selectedIds || []);
    let targetCard = null;
    let targetDistance = Number.POSITIVE_INFINITY;

    for (const item of this.state.canvasBoard.items) {
      const card = canvasItemsEl?.querySelector(`[data-canvas-item-id="${item.id}"]`);
      if (!card) continue;
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(centerX - viewportCenterX, centerY - viewportCenterY);
      if (selectedIds.has(item.id)) {
        targetCard = card;
        targetDistance = distance;
        break;
      }
      if (distance < targetDistance) {
        targetCard = card;
        targetDistance = distance;
      }
    }

    if (!targetCard) {
      this.setStatus("没有找到可定位的画布元素");
      return;
    }

    const cardRect = targetCard.getBoundingClientRect();
    const deltaX = viewportCenterX - (cardRect.left + cardRect.width / 2);
    const deltaY = viewportCenterY - (cardRect.top + cardRect.height / 2);
    this.setView({
      offsetX: (Number(this.view.offsetX) || 0) + deltaX,
      offsetY: (Number(this.view.offsetY) || 0) + deltaY,
    });
    this.setStatus(selectedIds.size ? "已返回当前选中的画布元素" : "已返回最近的画布元素");
  }

  createContextMenu() {
    const menu = document.createElement("div");
    menu.className = "canvas-context-menu is-hidden";
    menu.innerHTML = `
      <button class="canvas-context-menu-item" type="button" data-canvas-menu-action="copy">复制</button>
      <button class="canvas-context-menu-item" type="button" data-canvas-menu-action="cut">剪切</button>
      <button class="canvas-context-menu-item" type="button" data-canvas-menu-action="delete">删除</button>
      <button class="canvas-context-menu-item" type="button" data-canvas-menu-action="paste">粘贴</button>
    `;
    document.body.appendChild(menu);
    return menu;
  }

  createImageLightbox() {
    const lightbox = document.createElement("div");
    lightbox.className = "canvas-image-lightbox is-hidden";
    lightbox.innerHTML = `
      <button class="canvas-image-lightbox-close" type="button" aria-label="关闭图片预览">×</button>
      <img class="canvas-image-lightbox-image" alt="" />
    `;
    document.body.appendChild(lightbox);
    return lightbox;
  }

  openImageLightbox(lightboxEl, item) {
    if (!lightboxEl || item?.kind !== "image" || !item?.dataUrl) return;
    const imageEl = lightboxEl.querySelector(".canvas-image-lightbox-image");
    if (!(imageEl instanceof HTMLImageElement)) return;
    imageEl.src = item.dataUrl;
    imageEl.alt = String(item?.title || item?.fileName || "图片");
    lightboxEl.classList.remove("is-hidden");
    this.scheduleDesktopWindowShapeSync();
  }

  closeImageLightbox(lightboxEl) {
    if (!lightboxEl) return;
    lightboxEl.classList.add("is-hidden");
    this.scheduleDesktopWindowShapeSync();
  }

  shouldSyncDesktopShapeForLightbox(lightboxEl) {
    return Boolean(IS_DESKTOP_APP && DESKTOP_SHELL?.setExternalWindowVisibility && lightboxEl && !lightboxEl.classList.contains("is-hidden"));
  }
}
