import { syncFloatingToolbarLayout } from "./floatingToolbarLayout.js";

export function createLightImageEditor(options = {}) {
  const {
    getImageItemById,
    isLockedItem,
    updateImageItem,
    setStatus,
    resolveImageSource,
    pickImageSavePath,
    writeFile,
    allowLocalFileAccess,
    onCropCommit,
  } = options;

  let toolbar = null;
  let editState = null;

  function ensureToolbar(host) {
    if (!(host instanceof HTMLElement)) {
      return null;
    }
    if (toolbar && toolbar.isConnected) {
      return toolbar;
    }
    toolbar = host.querySelector("#canvas2d-image-toolbar");
    if (!(toolbar instanceof HTMLDivElement)) {
      toolbar = document.createElement("div");
      toolbar.id = "canvas2d-image-toolbar";
      toolbar.className = "canvas2d-image-toolbar is-hidden";
      toolbar.innerHTML = `
        <button type="button" class="canvas2d-image-btn" data-action="image-crop">裁剪</button>
        <button type="button" class="canvas2d-image-btn" data-action="image-rotate-ccw">⟲</button>
        <button type="button" class="canvas2d-image-btn" data-action="image-rotate-cw">⟳</button>
        <button type="button" class="canvas2d-image-btn" data-action="image-flip-x">水平翻转</button>
        <button type="button" class="canvas2d-image-btn" data-action="image-flip-y">垂直翻转</button>
        <button type="button" class="canvas2d-image-btn" data-action="image-export">导出</button>
        <button type="button" class="canvas2d-image-btn" data-action="image-done">完成</button>
      `;
      host.appendChild(toolbar);
    }
    return toolbar;
  }

  function setEditState(next) {
    editState = next;
  }

  function beginEdit(itemId) {
    const item = getImageItemById?.(itemId);
    if (!item) {
      return false;
    }
    if (isLockedItem?.(item)) {
      setStatus?.("图片已锁定，无法编辑");
      return false;
    }
    setEditState({
      id: item.id,
      mode: null,
      cropPreview: null,
      cropStart: null,
    });
    return true;
  }

  function finishEdit() {
    if (!editState) {
      return false;
    }
    editState = null;
    return true;
  }

  function isEditing(itemId) {
    return Boolean(editState?.id) && (!itemId || editState.id === itemId);
  }

  function setMode(mode) {
    if (!editState) {
      return;
    }
    setEditState({
      ...editState,
      mode: editState.mode === mode ? null : mode,
      cropPreview: null,
      cropStart: null,
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getImageLocalPoint(item, scenePoint) {
    const width = Number(item?.width || 0);
    const height = Number(item?.height || 0);
    if (!width || !height) {
      return { x: 0, y: 0, inside: false };
    }
    const nx = (Number(scenePoint?.x || 0) - Number(item.x || 0)) / width;
    const ny = (Number(scenePoint?.y || 0) - Number(item.y || 0)) / height;
    return {
      x: clamp(nx, 0, 1),
      y: clamp(ny, 0, 1),
      inside: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1,
    };
  }

  function updateCropPreview(start, current) {
    const left = Math.min(start.x, current.x);
    const right = Math.max(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const bottom = Math.max(start.y, current.y);
    return {
      x: clamp(left, 0, 1),
      y: clamp(top, 0, 1),
      w: clamp(right - left, 0, 1),
      h: clamp(bottom - top, 0, 1),
    };
  }

  function handlePointerDown({ event, scenePoint }) {
    if (!editState || !editState.id) {
      return { handled: false, pointer: null };
    }
    if (event.button !== 0) {
      return { handled: false, pointer: null };
    }
    const item = getImageItemById?.(editState.id);
    if (!item) {
      return { handled: false, pointer: null };
    }
    const local = getImageLocalPoint(item, scenePoint);
    if (!local.inside) {
      return { handled: false, pointer: null };
    }
    if (editState.mode === "crop") {
      const start = { x: local.x, y: local.y };
      setEditState({
        ...editState,
        cropStart: start,
        cropPreview: { x: start.x, y: start.y, w: 0.01, h: 0.01 },
      });
      return {
        handled: true,
        pointer: {
          type: "image-crop",
          pointerId: event.pointerId,
          startScene: scenePoint,
          startLocal: start,
          itemId: item.id,
        },
      };
    }
    return { handled: true, pointer: null };
  }

  function handlePointerMove(pointer, scenePoint) {
    if (!pointer || !editState) {
      return;
    }
    const item = getImageItemById?.(pointer.itemId);
    if (!item) {
      return;
    }
    if (pointer.type === "image-crop") {
      const local = getImageLocalPoint(item, scenePoint);
      const preview = updateCropPreview(pointer.startLocal, local);
      setEditState({
        ...editState,
        cropPreview: preview,
      });
      return;
    }
  }

  function handlePointerUp(pointer) {
    if (!pointer || !editState) {
      return;
    }
    if (pointer.type === "image-crop") {
      const crop = editState.cropPreview;
      if (crop && pointer.itemId) {
        updateImageItem?.(
          pointer.itemId,
          (item) => {
            item.crop = crop;
          },
          "裁剪图片",
          "已裁剪图片"
        );
        if (typeof onCropCommit === "function") {
          onCropCommit(pointer.itemId, crop);
        }
      }
      setEditState({
        ...editState,
        cropPreview: null,
        cropStart: null,
      });
      return;
    }
  }

  function clearTransientState() {
    if (!editState) {
      return;
    }
    setEditState({
      ...editState,
      cropPreview: null,
      cropStart: null,
    });
  }

  function applyRotation(itemId, delta) {
    return updateImageItem?.(
      itemId,
      (item) => {
        item.rotation = (Number(item.rotation || 0) + delta + 360) % 360;
      },
      "旋转图片",
      "已旋转图片"
    );
  }

  function applyFlip(itemId, axis) {
    return updateImageItem?.(
      itemId,
      (item) => {
        if (axis === "x") {
          item.flipX = !item.flipX;
        } else if (axis === "y") {
          item.flipY = !item.flipY;
        }
      },
      "翻转图片",
      "已翻转图片"
    );
  }


  function resetTransform(itemId) {
    return updateImageItem?.(
      itemId,
      (item) => {
        item.rotation = 0;
        item.flipX = false;
        item.flipY = false;
        item.brightness = 0;
        item.contrast = 0;
        item.crop = null;
        item.annotations = { lines: [], texts: [] };
      },
      "重置图片",
      "已重置图片"
    );
  }

  async function exportImage(itemId, renderImageToCanvas) {
    const item = getImageItemById?.(itemId);
    if (!item) {
      return false;
    }
    const source = resolveImageSource?.(item, allowLocalFileAccess?.());
    if (!source) {
      setStatus?.("图片路径为空，无法导出");
      return false;
    }
    const image = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = source;
    });
    if (!image) {
      setStatus?.("图片加载失败");
      return false;
    }
    const canvas = renderImageToCanvas?.(item, image);
    if (!canvas) {
      setStatus?.("导出失败");
      return false;
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      setStatus?.("导出失败");
      return false;
    }
    const defaultName = item.name || "image.png";
    if (typeof pickImageSavePath === "function" && typeof writeFile === "function") {
      const result = await pickImageSavePath({ defaultName });
      if (result?.canceled) {
        return false;
      }
      const targetPath = String(result?.filePath || "").trim();
      if (!targetPath) {
        return false;
      }
      const buffer = new Uint8Array(await blob.arrayBuffer());
      const writeResult = await writeFile(targetPath, buffer);
      if (!writeResult?.ok) {
        setStatus?.(writeResult?.error || "导出失败");
        return false;
      }
      setStatus?.("已导出图片");
      return true;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = defaultName.endsWith(".png") ? defaultName : `${defaultName}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus?.("已导出图片");
    return true;
  }

  function syncToolbarLayout({ surface, isInteractive }) {
    if (!(toolbar instanceof HTMLDivElement)) {
      return;
    }
    if (!isInteractive || !editState?.id) {
      toolbar.classList.add("is-hidden");
      return;
    }
    const item = getImageItemById?.(editState.id);
    if (!item) {
      finishEdit();
      toolbar.classList.add("is-hidden");
      return;
    }
    toolbar.classList.remove("is-hidden");
    syncFloatingToolbarLayout(toolbar, surface, {
      minScale: 0.74,
      hardMinScale: 0.58,
      preferAboveZoom: false,
      gap: 14,
      margin: 8,
    });

    toolbar.querySelectorAll(".canvas2d-image-btn").forEach((button) => {
      const action = button.getAttribute("data-action");
      if (action === "image-crop") {
        button.classList.toggle("is-active", editState?.mode === "crop");
      }
    });
  }

  function handleToolbarClick(event, renderImageToCanvas) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target) {
      return;
    }
    const action = target.getAttribute("data-action");
    if (!action || !editState?.id) {
      return;
    }
    const itemId = editState.id;
    if (action === "image-crop") {
      setMode("crop");
      return;
    }
    if (action === "image-rotate-cw") {
      applyRotation(itemId, 90);
      return;
    }
    if (action === "image-rotate-ccw") {
      applyRotation(itemId, -90);
      return;
    }
    if (action === "image-flip-x") {
      applyFlip(itemId, "x");
      return;
    }
    if (action === "image-flip-y") {
      applyFlip(itemId, "y");
      return;
    }
    if (action === "image-export") {
      void exportImage(itemId, renderImageToCanvas);
      return;
    }
    if (action === "image-done") {
      finishEdit();
    }
  }

  return {
    mount(host) {
      const node = ensureToolbar(host);
      return node;
    },
    getState() {
      return editState;
    },
    beginEdit,
    finishEdit,
    isEditing,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    clearTransientState,
    syncToolbarLayout,
    handleToolbarClick,
    resetTransform,
    applyRotation,
    applyFlip,
    exportImage,
  };
}
