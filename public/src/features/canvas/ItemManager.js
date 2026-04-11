import { CONFIG, DESKTOP_SHELL } from "../../config/index.js";
import { API_ROUTES, readJsonResponse } from "../../api/http.js";
import {
  buildCanvasTextTitle,
  formatBytes,
  getFileNameFromPath,
  sanitizeCanvasTextPreview,
  sanitizeCanvasTextboxText,
  normalizeCanvasTextBoxFontSize,
} from "./canvasUtils.js";
import {
  buildCanvasFileMetadataFromPath,
  detectCanvasFileMetadata,
  getCanvasFileKindMeta,
} from "./fileMetadata.js";
import {
  buildShapePayloadFromDrag,
  getShapeGeometry,
  isLinearShape,
  normalizeShapeType,
} from "./shapeUtils.js";
import {
  createCanvasItem,
  getCanvasCardTitle as resolveCanvasCardTitle,
  getCanvasMaterialDimensions as resolveCanvasMaterialDimensions,
  isCanvasTextItem as resolveIsCanvasTextItem,
} from "./items/index.js";

export class ItemManager {
  constructor(options = {}) {
    this.state = options.state;
    this.canvas = options.canvas;
    this.projectFile = options.projectFile;
    this.refs = options.refs || {};
    this.getActiveAppClipboardPayloadFn = options.getActiveAppClipboardPayload || (() => null);
    this.shouldUseAppClipboardPayloadFn = options.shouldUseAppClipboardPayload || (() => false);
    this.pasteAppClipboardToCanvasFn = options.pasteAppClipboardToCanvas || (() => false);
    this.pasteAppClipboardToComposerFn = options.pasteAppClipboardToComposer || (() => false);
    this.setAppClipboardPayloadFn = options.setAppClipboardPayload || (() => {});
    this.readClipboardText = options.readClipboardText || (async () => "");
    this.writeClipboardText = options.writeClipboardText || (async () => {});
    this.setActiveClipboardZone = options.setActiveClipboardZone || (() => {});
    this.openCanvasImageLightbox = options.openCanvasImageLightbox || (() => {});
    this.openCanvasItem = options.openCanvasItem || (() => false);
    this.setCanvasStatus = options.setCanvasStatus || (() => {});
    this.renderCanvasBoard = options.renderCanvasBoard || (() => {});
    this.saveCanvasBoardToStorage = options.saveCanvasBoardToStorage || (() => Promise.resolve());
    this.updateCanvasView = options.updateCanvasView || (() => {});
    this.getCanvasPositionFromClientPoint = options.getCanvasPositionFromClientPoint || (() => ({ x: 0, y: 0 }));
    this.isEditableElement = options.isEditableElement || (() => false);
    this.historyLimit = Number(options.historyLimit) || Number(this.state?.canvasHistory?.limit) || 40;
  }

  getCanvasTool() {
    return String(this.state.canvasTool || "select");
  }

  setCanvasTool(nextTool = "select") {
    const tool = ["select", "text", "file", "rect", "arrow", "line", "ellipse", "highlight", "mind"].includes(
      String(nextTool || "").trim()
    )
      ? String(nextTool || "").trim()
      : "select";
    this.state.canvasTool = tool;
    if (tool === "select") {
      this.cancelCanvasShapeDraft({ persist: false });
    }
    this.renderCanvasBoard();
    this.setCanvasStatus(
      tool === "select"
        ? "已切换到选择模式"
        : tool === "text"
          ? "已切换到文本模式"
          : tool === "file"
            ? "已切换到文件模式"
            : `已切换到 ${tool} 工具`
    );
    return tool;
  }

  getCanvasItemById(itemId) {
    return this.state.canvasBoard.items.find((item) => item.id === itemId);
  }

  getSelectedCanvasItems() {
    const selectedIds = new Set(this.state.canvasBoard.selectedIds || []);
    return this.state.canvasBoard.items.filter((item) => selectedIds.has(item.id));
  }

  setSelectionToCanvasItem(itemId, { additive = false } = {}) {
    const targetId = String(itemId || "").trim();
    if (!targetId) return;
    if (additive) {
      const next = new Set(this.state.canvasBoard.selectedIds || []);
      if (next.has(targetId)) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      this.state.canvasBoard.selectedIds = Array.from(next).slice(0, 24);
      return;
    }
    this.state.canvasBoard.selectedIds = [targetId];
  }

  clearCanvasSelection({ persist = true, statusText = "" } = {}) {
    if (!this.state.canvasBoard.selectedIds.length) return false;
    this.state.canvasBoard.selectedIds = [];
    this.renderCanvasBoard();
    if (persist) {
      void this.saveCanvasBoardToStorage();
    }
    if (statusText) {
      this.setCanvasStatus(statusText);
    }
    return true;
  }

  getCanvasBoardSignature() {
    try {
      return JSON.stringify({
        items: this.state.canvasBoard.items,
        selectedIds: this.state.canvasBoard.selectedIds,
        view: this.state.canvasBoard.view,
        editingId: this.state.canvasEditingTextId || null,
        draft: this.state.canvasDraftItem || null,
      });
    } catch {
      return "";
    }
  }

  snapshotCanvasBoardState() {
    const items =
      typeof structuredClone === "function"
        ? structuredClone(this.state.canvasBoard.items || [])
        : JSON.parse(JSON.stringify(this.state.canvasBoard.items || []));
    return {
      items,
      selectedIds: Array.isArray(this.state.canvasBoard.selectedIds) ? [...this.state.canvasBoard.selectedIds] : [],
      view: { ...(this.state.canvasBoard.view || {}) },
      editingId: this.state.canvasEditingTextId || null,
    };
  }

  restoreCanvasBoardSnapshot(snapshot = null, { persist = true, statusText = "" } = {}) {
    if (!snapshot) return false;
    this.state.canvasBoard.items = Array.isArray(snapshot.items)
      ? snapshot.items.map((item, index) => this.createCanvasItem(item, index))
      : [];
    this.state.canvasBoard.selectedIds = Array.isArray(snapshot.selectedIds) ? [...snapshot.selectedIds] : [];
    this.state.canvasBoard.view = {
      ...(this.state.canvasBoard.view || {}),
      ...(snapshot.view || {}),
    };
    this.state.canvasEditingTextId = snapshot.editingId || null;
    this.renderCanvasBoard();
    if (persist) {
      void this.saveCanvasBoardToStorage();
    }
    if (statusText) {
      this.setCanvasStatus(statusText);
    }
    return true;
  }

  recordCanvasHistory(reason = "") {
    const history =
      this.state.canvasHistory ||
      (this.state.canvasHistory = {
        undo: [],
        redo: [],
        limit: this.historyLimit,
        lastSignature: "",
      });
    const signature = this.getCanvasBoardSignature();
    if (!signature || signature === history.lastSignature) return false;
    history.undo.push({
      signature,
      snapshot: this.snapshotCanvasBoardState(),
      reason: String(reason || ""),
      createdAt: Date.now(),
    });
    history.lastSignature = signature;
    history.redo = [];
    const limit = Math.max(10, Number(history.limit) || this.historyLimit || 40);
    while (history.undo.length > limit) {
      history.undo.shift();
    }
    return true;
  }

  undoCanvasBoard() {
    const history = this.state.canvasHistory;
    if (!history?.undo?.length) return false;
    const currentSnapshot = this.snapshotCanvasBoardState();
    const currentSignature = this.getCanvasBoardSignature();
    const entry = history.undo.pop();
    if (!entry?.snapshot) return false;
    history.redo.push({
      signature: currentSignature,
      snapshot: currentSnapshot,
      reason: "undo",
      createdAt: Date.now(),
    });
    history.lastSignature = entry.signature || "";
    return this.restoreCanvasBoardSnapshot(entry.snapshot, { persist: true, statusText: "已撤销上一步操作" });
  }

  redoCanvasBoard() {
    const history = this.state.canvasHistory;
    if (!history?.redo?.length) return false;
    const currentSnapshot = this.snapshotCanvasBoardState();
    const currentSignature = this.getCanvasBoardSignature();
    const entry = history.redo.pop();
    if (!entry?.snapshot) return false;
    history.undo.push({
      signature: currentSignature,
      snapshot: currentSnapshot,
      reason: "redo",
      createdAt: Date.now(),
    });
    history.lastSignature = entry.signature || "";
    return this.restoreCanvasBoardSnapshot(entry.snapshot, { persist: true, statusText: "已重做上一步操作" });
  }

  createCanvasItem(base = {}, index = this.state.canvasBoard.items.length, anchorPoint = null) {
    return createCanvasItem(base, index, anchorPoint);
  }

  createCanvasShapeItem(base = {}, index = this.state.canvasBoard.items.length, anchorPoint = null) {
    return this.createCanvasItem(
      {
        kind: "shape",
        shapeType: normalizeShapeType(base.shapeType || "rect"),
        stroke: base.stroke || "#334155",
        fill: base.fill || "rgba(255,255,255,0.92)",
        strokeWidth: Number(base.strokeWidth) || 2,
        radius: Number(base.radius) || 16,
        ...base,
      },
      index,
      anchorPoint
    );
  }

  upsertCanvasItems(items = [], statusText = "", anchorPoint = null) {
    const nextItems = (Array.isArray(items) ? items : []).map((item, index) => this.createCanvasItem(item, index, anchorPoint));
    this.state.canvasBoard.items = [...nextItems, ...this.state.canvasBoard.items].slice(0, 120);
    this.state.canvasBoard.selectedIds = nextItems.map((item) => item.id);
    this.renderCanvasBoard();
    void this.saveCanvasBoardToStorage();
    this.recordCanvasHistory(statusText || "新增素材卡");
    if (statusText) {
      this.setCanvasStatus(statusText);
    }
    return nextItems;
  }

  removeCanvasItemsByIds(itemIds = [], statusText = "") {
    const normalizedIds = [...new Set((Array.isArray(itemIds) ? itemIds : []).map((item) => String(item || "").trim()).filter(Boolean))];
    if (!normalizedIds.length) return false;
    this.state.canvasBoard.items = this.state.canvasBoard.items.filter((entry) => !normalizedIds.includes(entry.id));
    this.state.canvasBoard.selectedIds = this.state.canvasBoard.selectedIds.filter((id) => !normalizedIds.includes(id));
    if (normalizedIds.includes(this.state.canvasEditingTextId)) {
      this.state.canvasEditingTextId = null;
    }
    this.renderCanvasBoard();
    void this.saveCanvasBoardToStorage();
    this.recordCanvasHistory(statusText || "删除素材卡");
    this.setCanvasStatus(statusText || `已删除 ${normalizedIds.length} 个素材卡`);
    return true;
  }

  startEditingCanvasTextbox(itemId) {
    const item = this.getCanvasItemById(itemId);
    if (!item || !resolveIsCanvasTextItem(item)) return;
    this.state.canvasEditingTextId = item.id;
    this.state.canvasBoard.selectedIds = [item.id];
    this.renderCanvasBoard();
  }

  stopEditingCanvasTextbox({ persist = true } = {}) {
    if (!this.state.canvasEditingTextId) return;
    this.state.canvasEditingTextId = null;
    this.renderCanvasBoard();
    if (persist) {
      void this.saveCanvasBoardToStorage();
    }
  }

  getCanvasTextBoxItemById(itemId) {
    const item = this.getCanvasItemById(itemId);
    return resolveIsCanvasTextItem(item) ? item : null;
  }

  readCanvasTextboxEditorText(editor) {
    return sanitizeCanvasTextboxText(String(editor?.innerText || "").replace(/\u00a0/g, " ").replace(/\n$/, ""));
  }

  syncCanvasTextboxEditor(editor, item) {
    if (!editor || !item) return;
    item.text = this.readCanvasTextboxEditorText(editor);
    item.title = buildCanvasTextTitle(item.text);
    const baseHeight = Math.max((Number(item.fontSize) || CONFIG.canvasTextBoxDefaultFontSize) * 1.7 + 20, CONFIG.canvasTextBoxDefaultHeight);
    const measuredHeight = editor.scrollHeight + 18;
    item.height = Math.max(baseHeight, measuredHeight || item.height || 0);
    const wrapper = editor.closest(".canvas-textbox");
    if (wrapper) {
      wrapper.style.minHeight = `${Math.round(item.height)}px`;
    }
  }

  focusCanvasTextboxEditor(editor) {
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection?.();
    const range = document.createRange?.();
    if (!selection || !range) return;
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  bindCanvasTextboxEditor() {
    const itemId = this.state.canvasEditingTextId;
    if (!itemId || !this.refs.canvasItemsEl) return;
    const item = this.getCanvasTextBoxItemById(itemId);
    const editor = this.refs.canvasItemsEl.querySelector(`[data-canvas-textbox-editor="${itemId}"]`);
    if (!item || !editor) {
      this.state.canvasEditingTextId = null;
      return;
    }

    editor.addEventListener("input", () => {
      this.syncCanvasTextboxEditor(editor, item);
    });
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.stopEditingCanvasTextbox();
        return;
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        this.stopEditingCanvasTextbox();
      }
    });
    editor.addEventListener("blur", () => {
      if (this.state.canvasEditingTextId !== itemId) return;
      this.syncCanvasTextboxEditor(editor, item);
      this.stopEditingCanvasTextbox();
    });

    requestAnimationFrame(() => {
      if (this.state.canvasEditingTextId !== itemId) return;
      this.focusCanvasTextboxEditor(editor);
      this.syncCanvasTextboxEditor(editor, item);
    });
  }

  createCanvasTextboxAt(clientX, clientY) {
    const point = this.getCanvasPositionFromClientPoint(clientX, clientY);
    const items = this.upsertCanvasItems(
      [
        {
          kind: "textbox",
          title: "文本框",
          text: "",
          x: point.x - 12,
          y: point.y - 12,
          width: CONFIG.canvasTextBoxDefaultWidth,
          height: CONFIG.canvasTextBoxDefaultHeight,
          fontSize: CONFIG.canvasTextBoxDefaultFontSize,
          bold: false,
          highlighted: false,
        },
      ],
      "已在画布中创建文本框",
      point
    );
    if (!items.length) return;
    this.state.canvasEditingTextId = items[0].id;
    this.renderCanvasBoard();
    this.recordCanvasHistory("创建文本框");
  }

  createCanvasShapeAt(clientX, clientY, shapeType = "rect", options = {}) {
    const point = this.getCanvasPositionFromClientPoint(clientX, clientY);
    const normalizedType = normalizeShapeType(shapeType);
    const draft = buildShapePayloadFromDrag({
      shapeType: normalizedType,
      startX: point.x,
      startY: point.y,
      endX: point.x + (options.width || 160),
      endY: point.y + (options.height || 96),
      snap: Boolean(options.snap),
    });
    const basePayload = {
      kind: "shape",
      title:
        normalizedType === "arrow"
          ? "箭头"
          : normalizedType === "line"
            ? "线段"
            : normalizedType === "highlight"
              ? "高亮框"
              : normalizedType === "ellipse"
                ? "椭圆"
                : "方框",
      shapeType: normalizedType,
      stroke: options.stroke || "#334155",
      fill:
        options.fill ||
        (normalizedType === "highlight"
          ? "rgba(255, 214, 102, 0.28)"
          : normalizedType === "ellipse"
            ? "rgba(148, 163, 184, 0.10)"
            : "rgba(255,255,255,0.92)"),
      strokeWidth: Number(options.strokeWidth) || 2,
      radius: Number(options.radius) || 16,
      ...draft,
    };
    const items = this.upsertCanvasItems([basePayload], `已创建${basePayload.title}`, point);
    this.recordCanvasHistory(`已创建${basePayload.title}`);
    return items[0] || null;
  }

  beginCanvasShapeDraft(shapeType = "rect", clientX = 0, clientY = 0, options = {}) {
    const point = this.getCanvasPositionFromClientPoint(clientX, clientY);
    const normalizedType = normalizeShapeType(shapeType);
    this.state.canvasDraftItem = {
      id: `draft-${crypto.randomUUID()}`,
      kind: "shape",
      title:
        normalizedType === "arrow"
          ? "箭头"
          : normalizedType === "line"
            ? "线段"
            : normalizedType === "highlight"
              ? "高亮框"
              : normalizedType === "ellipse"
                ? "椭圆"
                : "方框",
      shapeType: normalizedType,
      stroke: options.stroke || "#334155",
      fill:
        options.fill ||
        (normalizedType === "highlight"
          ? "rgba(255, 214, 102, 0.28)"
          : normalizedType === "ellipse"
            ? "rgba(148, 163, 184, 0.10)"
            : "rgba(255,255,255,0.92)"),
      strokeWidth: Number(options.strokeWidth) || 2,
      radius: Number(options.radius) || 16,
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
      x: point.x,
      y: point.y,
      width: 1,
      height: 1,
      createdAt: Date.now(),
    };
    this.state.canvasBoard.selectedIds = [];
    this.renderCanvasBoard();
    return this.state.canvasDraftItem;
  }

  updateCanvasShapeDraft(clientX = 0, clientY = 0, options = {}) {
    const draft = this.state.canvasDraftItem;
    if (!draft || draft.kind !== "shape") return null;
    const point = this.getCanvasPositionFromClientPoint(clientX, clientY);
    const nextGeometry = buildShapePayloadFromDrag({
      shapeType: draft.shapeType,
      startX: Number(draft.startX) || 0,
      startY: Number(draft.startY) || 0,
      endX: point.x,
      endY: point.y,
      snap: Boolean(options.snap),
    });
    Object.assign(draft, nextGeometry);
    draft.stroke = draft.stroke || "#334155";
    draft.fill = draft.fill || "rgba(255,255,255,0.92)";
    draft.strokeWidth = Number(draft.strokeWidth) || 2;
    this.renderCanvasBoard();
    return draft;
  }

  commitCanvasShapeDraft() {
    const draft = this.state.canvasDraftItem;
    if (!draft || draft.kind !== "shape") return null;
    const payload = {
      ...draft,
      id: crypto.randomUUID(),
    };
    this.state.canvasDraftItem = null;
    const items = this.upsertCanvasItems([payload], `已创建${payload.title}`);
    this.recordCanvasHistory(`已创建${payload.title}`);
    return items[0] || null;
  }

  cancelCanvasShapeDraft({ persist = true } = {}) {
    if (!this.state.canvasDraftItem) return false;
    this.state.canvasDraftItem = null;
    this.renderCanvasBoard();
    if (persist) {
      void this.saveCanvasBoardToStorage();
    }
    this.recordCanvasHistory("取消图形草稿");
    return true;
  }

  isCanvasTextItem(item) {
    return resolveIsCanvasTextItem(item);
  }

  getCanvasMaterialDimensions(item) {
    return resolveCanvasMaterialDimensions(item);
  }

  isCanvasShapeItem(item) {
    return item?.kind === "shape";
  }

  getCanvasFileMetaLine(item) {
    if (item?.isDirectory) return "文件夹";
    const fileName = String(item?.fileName || item?.title || "").trim();
    const fileExt = String(item?.detectedExt || item?.fileExt || "").trim().toLowerCase();
    const mimeType = String(item?.detectedMimeType || item?.mimeType || "").trim().toLowerCase();
    const kindMeta = getCanvasFileKindMeta({
      kind: item?.kind,
      fileName,
      detectedMimeType: mimeType,
      mimeType,
      ext: fileExt,
      isDirectory: item?.isDirectory,
    });
    const location = String(item?.filePath || item?.locationLabel || item?.fileBaseName || "").trim();
    const parts = [kindMeta?.label || "文件"];
    if (fileExt) parts.push(`.${fileExt}`);
    if (item?.hasFileSize) {
      parts.push(formatBytes(item.fileSize));
    }
    if (location) parts.push(location);
    return parts.join(" · ");
  }

  getCanvasCardTitle(item) {
    return resolveCanvasCardTitle(item);
  }

  async openCanvasItem(item) {
    if (!item || isCanvasTextItem(item)) return false;
    const filePath = String(item.filePath || "").trim();
    if (!filePath || !DESKTOP_SHELL?.openPath) {
      return false;
    }
    const result = await DESKTOP_SHELL.openPath(filePath);
    if (!result?.ok) {
      throw new Error(result?.error || "打开文件失败");
    }
    return true;
  }

  async fileToCanvasItem(file) {
    const metadata = await detectCanvasFileMetadata(file);
    const cleanName = metadata.fileName || String(file?.name || "").trim() || "未命名文件";
    const mimeType = metadata.detectedMimeType || metadata.mimeType || String(file?.type || "").trim();
    const realFilePath =
      (typeof DESKTOP_SHELL?.getPathForFile === "function" ? DESKTOP_SHELL.getPathForFile(file) : "") ||
      String(file?.path || "").trim() ||
      String(file?.webkitRelativePath || "").trim();

    if (metadata.kind === "image") {
      const dataUrl = await this.fileToDataUrl(file);
      const dimensions = await this.readImageDimensions(dataUrl);
      const cardSize = this.getAdaptiveImageCardSize(dimensions.width, dimensions.height);
      return {
        kind: "image",
        ...metadata,
        title: cleanName,
        dataUrl,
        imageWidth: cardSize.imageWidth,
        imageHeight: cardSize.imageHeight,
        filePath: realFilePath,
        fileName: cleanName,
        mimeType,
        width: cardSize.width,
        height: cardSize.height,
      };
    }

    return {
      ...metadata,
      kind: "file",
      title: cleanName,
      text: [cleanName, metadata.summaryLabel, metadata.locationLabel].filter(Boolean).join("\n"),
      filePath: realFilePath,
      fileName: cleanName,
      fileBaseName: metadata.fileBaseName,
      fileExt: metadata.fileExt,
      detectedExt: metadata.detectedExt,
      mimeType,
      detectedMimeType: metadata.detectedMimeType || mimeType,
      fileSize: Number(file?.size) || metadata.fileSize || 0,
    };
  }

  async filePathToCanvasItem(filePath) {
    const cleanPath = String(filePath || "").trim();
    if (!cleanPath) {
      throw new Error("缺少文件路径");
    }
    const metadata = buildCanvasFileMetadataFromPath(cleanPath);
    return {
      ...metadata,
      kind: "file",
      title: metadata.fileName || getFileNameFromPath(cleanPath),
      text: [metadata.fileName || getFileNameFromPath(cleanPath), metadata.summaryLabel, cleanPath].filter(Boolean).join("\n"),
      filePath: cleanPath,
      fileName: metadata.fileName || getFileNameFromPath(cleanPath),
      fileBaseName: metadata.fileBaseName,
      fileExt: metadata.fileExt,
      detectedExt: metadata.detectedExt,
      mimeType: metadata.mimeType,
      detectedMimeType: metadata.detectedMimeType,
      fileSize: metadata.fileSize,
    };
  }

  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
      reader.readAsDataURL(file);
    });
  }

  readImageDimensions(dataUrl) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        resolve({
          width: Math.max(1, Number(image.naturalWidth) || 1),
          height: Math.max(1, Number(image.naturalHeight) || 1),
        });
      };
      image.onerror = () => resolve({ width: 1, height: 1 });
      image.src = dataUrl;
    });
  }

  getAdaptiveImageCardSize(imageWidth, imageHeight) {
    const sourceWidth = Math.max(1, Number(imageWidth) || 1);
    const sourceHeight = Math.max(1, Number(imageHeight) || 1);
    const maxPreviewWidth = 360;
    const maxPreviewHeight = 280;
    const minPreviewWidth = 160;
    const minPreviewHeight = 120;
    const scale = Math.min(maxPreviewWidth / sourceWidth, maxPreviewHeight / sourceHeight, 1);
    const previewWidth = Math.max(minPreviewWidth, Math.round(sourceWidth * scale));
    const previewHeight = Math.max(minPreviewHeight, Math.round(sourceHeight * scale));

    return {
      width: Math.min(420, Math.max(220, previewWidth + 24)),
      height: Math.min(420, Math.max(210, previewHeight + 112)),
      imageWidth: sourceWidth,
      imageHeight: sourceHeight,
    };
  }

  hasClipboardFiles(dataTransfer) {
    if (!dataTransfer) return false;
    if (Number(dataTransfer.files?.length) > 0) return true;
    return [...(dataTransfer.items || [])].some((item) => item?.kind === "file");
  }

  async readClipboardFilePaths() {
    if (!DESKTOP_SHELL?.readClipboardFiles) {
      return [];
    }
    const result = await DESKTOP_SHELL.readClipboardFiles();
    if (!result?.ok) {
      throw new Error(result?.error || "无法读取系统剪贴板中的文件");
    }
    return Array.isArray(result.paths) ? result.paths.map((item) => String(item || "").trim()).filter(Boolean) : [];
  }

  async importClipboardFilesFromDesktop(anchorPoint = null) {
    const paths = await this.readClipboardFilePaths();
    if (!paths.length) return false;
    const items = [];
    for (const filePath of paths) {
      items.push(await this.filePathToCanvasItem(filePath));
    }
    if (!items.length) return false;
    this.upsertCanvasItems(items, "系统剪贴板文件已加入画布", anchorPoint);
    return true;
  }

  getDroppedDirectoryItems(dataTransfer) {
    const entries = [];
    for (const item of [...(dataTransfer?.items || [])]) {
      if (typeof item?.webkitGetAsEntry !== "function") continue;
      const entry = item.webkitGetAsEntry();
      if (!entry?.isDirectory) continue;
      entries.push({
        kind: "file",
        title: entry.name || "未命名文件夹",
        text: `文件夹：${entry.name || "未命名文件夹"}\n这是拖入无限画布的目录素材卡。你可以让 AI 基于这个目录继续规划或整理任务。`,
        fileName: `${entry.name || "未命名文件夹"}/`,
        mimeType: "inode/directory",
        isDirectory: true,
        fileSize: 0,
        width: 320,
        height: 180,
      });
    }
    return entries;
  }

  async importClipboardOrDroppedData(dataTransfer, source = "paste", anchorPoint = null) {
    if (!dataTransfer) return false;
    const items = [];
    if (source === "drop") {
      items.push(...this.getDroppedDirectoryItems(dataTransfer));
    }
    const files = [...(dataTransfer.files || [])];
    for (const file of files) {
      items.push(await this.fileToCanvasItem(file));
    }
    const text = String(dataTransfer.getData?.("text/plain") || dataTransfer.getData?.("text") || "").trim();
    if (!items.length && text) {
      items.push({
        kind: "text",
        title: "剪贴板文本",
        text,
      });
    }
    if (!items.length) return false;
    this.upsertCanvasItems(items, source === "drop" ? "拖拽内容已加入画布" : "剪贴板内容已加入画布", anchorPoint);
    return true;
  }

  normalizeAppClipboardItem(item = {}) {
    const kind = ["text", "image", "file", "textbox", "shape"].includes(item?.kind) ? item.kind : "text";
    return {
      id: String(item?.id || crypto.randomUUID()),
      kind,
      title: String(item?.title || item?.fileName || "未命名内容").trim() || "未命名内容",
      text: kind === "textbox" ? sanitizeCanvasTextboxText(item?.text || "") : sanitizeCanvasTextPreview(item?.text || ""),
      filePath: String(item?.filePath || "").trim(),
      fileName: String(item?.fileName || "").trim(),
      fileBaseName: String(item?.fileBaseName || "").trim(),
      fileExt: String(item?.fileExt || "").trim().toLowerCase(),
      detectedExt: String(item?.detectedExt || "").trim().toLowerCase(),
      mimeType: String(item?.mimeType || "").trim(),
      detectedMimeType: String(item?.detectedMimeType || "").trim(),
      hasFileSize: Boolean(item?.hasFileSize),
      isDirectory: Boolean(item?.isDirectory),
      fileSize: Number(item?.fileSize) || 0,
      dataUrl: typeof item?.dataUrl === "string" ? item.dataUrl : "",
      width: Math.max(44, Number(item?.width) || 0),
      height: Math.max(44, Number(item?.height) || 0),
      fontSize: normalizeCanvasTextBoxFontSize(item?.fontSize, CONFIG.canvasTextBoxDefaultFontSize),
      bold: Boolean(item?.bold),
      highlighted: Boolean(item?.highlighted),
      shapeType: String(item?.shapeType || "rect"),
      stroke: String(item?.stroke || ""),
      fill: String(item?.fill || ""),
      strokeWidth: Number(item?.strokeWidth) || 2,
      radius: Number(item?.radius) || 16,
      startX: Number(item?.startX) || 0,
      startY: Number(item?.startY) || 0,
      endX: Number(item?.endX) || 0,
      endY: Number(item?.endY) || 0,
    };
  }

  normalizeAppClipboardPayload(payload = {}) {
    return {
      source: ["canvas", "chat"].includes(payload?.source) ? payload.source : "",
      text: String(payload?.text || ""),
      items: (Array.isArray(payload?.items) ? payload.items : []).map((item) => this.normalizeAppClipboardItem(item)),
      createdAt: Number(payload?.createdAt) || 0,
    };
  }

  setAppClipboardPayload(payload = {}) {
    this.setAppClipboardPayloadFn(this.normalizeAppClipboardPayload(payload));
  }

  getActiveAppClipboardPayload() {
    return this.getActiveAppClipboardPayloadFn();
  }

  async copyCanvasItemToClipboard(item) {
    const filePath = String(item?.filePath || "").trim();
    if ((item?.kind === "file" || item?.kind === "image") && filePath && DESKTOP_SHELL?.copyFilesToClipboard) {
      const result = await DESKTOP_SHELL.copyFilesToClipboard([filePath]);
      if (result?.ok) {
        return {
          mode: "file",
          count: Number(result.count) || 1,
          text: "",
        };
      }
      if (result?.error) {
        throw new Error(result.error);
      }
    }

    const text =
      item?.kind === "file"
        ? [item.fileName || item.title, item.isDirectory ? "文件夹" : item.mimeType || "文件", filePath]
            .filter(Boolean)
            .join("\n")
        : item?.kind === "image"
          ? item.fileName || item.title
          : item?.text || item?.fileName || item?.title;
    await this.writeClipboardText(text);
    return { mode: "text", count: 1, text };
  }

  async copyCanvasItemsToClipboard(items = []) {
    const normalizedItems = (Array.isArray(items) ? items : []).filter(Boolean);
    if (!normalizedItems.length) {
      throw new Error("没有可复制的画布内容");
    }

    this.setAppClipboardPayload({
      source: "canvas",
      text: normalizedItems.map((item) => item.text || item.fileName || item.title).filter(Boolean).join("\n\n"),
      items: normalizedItems.map((item) => this.normalizeAppClipboardItem(item)),
    });

    if (normalizedItems.length === 1) {
      return this.copyCanvasItemToClipboard(normalizedItems[0]);
    }

    const fileItems = normalizedItems.filter(
      (item) => (item.kind === "file" || item.kind === "image") && String(item.filePath || "").trim()
    );
    if (fileItems.length === normalizedItems.length && fileItems.length && DESKTOP_SHELL?.copyFilesToClipboard) {
      const result = await DESKTOP_SHELL.copyFilesToClipboard(fileItems.map((item) => item.filePath));
      if (result?.ok) {
        return { mode: "file", count: Number(result.count) || fileItems.length, text: "" };
      }
    }

    const summaryText =
      normalizedItems.map((item) => item.text || item.fileName || item.title).filter(Boolean).join("\n\n") ||
      normalizedItems.map((item) => item.title).join("\n");
    await this.writeClipboardText(summaryText);
    return { mode: "text", count: normalizedItems.length, text: summaryText };
  }

  async copySelectedCanvasItems() {
    const selectedItems = this.getSelectedCanvasItems();
    if (!selectedItems.length) {
      throw new Error("没有选中的素材卡");
    }
    return this.copyCanvasItemsToClipboard(selectedItems);
  }

  async cutSelectedCanvasItems() {
    const selectedItems = this.getSelectedCanvasItems();
    if (!selectedItems.length) {
      throw new Error("没有选中的素材卡");
    }
    const result = await this.copyCanvasItemsToClipboard(selectedItems);
    this.removeCanvasItemsByIds(
      selectedItems.map((item) => item.id),
      `已剪切 ${selectedItems.length} 个素材卡`
    );
    return result;
  }

  pasteAppClipboardToCanvasFromState(anchorPoint = null) {
    const appClipboard = this.getActiveAppClipboardPayload();
    if (this.shouldUseAppClipboardPayloadFn(appClipboard) && this.pasteAppClipboardToCanvasFn(appClipboard, anchorPoint)) {
      return true;
    }
    return false;
  }

  async pasteIntoCanvasFromSystemClipboard(anchorPoint = null) {
    if (this.pasteAppClipboardToCanvasFromState(anchorPoint)) {
      return true;
    }
    const handledFiles = await this.importClipboardFilesFromDesktop(anchorPoint).catch(() => false);
    if (handledFiles) {
      return true;
    }
    await this.importClipboardTextToCanvas(anchorPoint);
    return true;
  }

  async importClipboardTextToCanvas(anchorPoint = null) {
    const content = String(await this.readClipboardText()).trim();
    if (!content) {
      throw new Error("当前剪贴板没有可导入的文本");
    }
    this.upsertCanvasItems(
      [
        {
          kind: "text",
          title: "剪贴板文本",
          text: content,
        },
      ],
      "已把剪贴板文本放入无限画布",
      anchorPoint
    );
  }

  async handleCanvasExternalDrop(items = [], zone = "outside") {
    const normalizedItems = (Array.isArray(items) ? items : []).filter(Boolean);
    if (!normalizedItems.length) return false;
    const clipboardPayload = {
      source: "canvas",
      text: normalizedItems.map((item) => item.text || item.fileName || item.title).filter(Boolean).join("\n\n"),
      items: normalizedItems.map((item) => this.normalizeAppClipboardItem(item)),
    };

    if (zone === "composer") {
      this.setAppClipboardPayloadFn(clipboardPayload);
      const handled = this.pasteAppClipboardToComposerFn(this.getActiveAppClipboardPayloadFn());
      if (handled) {
        this.setCanvasStatus("已将素材卡发送到右侧交互区");
        return true;
      }
    }

    this.copyCanvasItemsToClipboard(normalizedItems)
      .then((result) => {
        this.setCanvasStatus(
          zone === "screen"
            ? result.mode === "file"
              ? `已复制 ${result.count} 个文件，可在 AI 镜像中粘贴`
              : "已复制到系统剪贴板，可在 AI 镜像中粘贴"
            : result.mode === "file"
              ? `已将${result.count > 1 ? `${result.count} 个` : ""}文件复制到系统剪贴板`
              : "已复制到系统剪贴板"
        );
      })
      .catch((error) => {
        this.setCanvasStatus(`复制失败：${error.message}`);
      });
    return true;
  }
}
