import { Canvas } from "./Canvas.js";
import { ItemManager } from "./ItemManager.js";
import { ProjectFile } from "./ProjectFile.js";

export function createCanvasFeature(options = {}) {
  const canvas = new Canvas({
    state: options.state,
    refs: options.refs,
    setStatus: options.setCanvasStatus,
    scheduleDesktopWindowShapeSync: options.scheduleDesktopWindowShapeSync,
    bindTextEditors: () => itemManager.bindCanvasTextboxEditor(),
  });

  const projectFile = new ProjectFile({
    apiRoutes: options.apiRoutes,
    readJsonResponse: options.readJsonResponse,
    getBoard: () => options.state.canvasBoard,
    setBoard: (board) => {
      options.state.canvasBoard = board;
    },
    getSavePath: options.getCanvasBoardSavePath,
    setStorageInfo: options.applyCanvasBoardStorageInfo,
    setStatus: options.setCanvasStatus,
    readLegacyBoard: options.readLegacyBoard,
    clearLegacyBoard: options.clearLegacyBoard,
  });

  const itemManager = new ItemManager({
    state: options.state,
    canvas,
    projectFile,
    refs: options.refs,
    getActiveAppClipboardPayload: options.getActiveAppClipboardPayload,
    shouldUseAppClipboardPayload: options.shouldUseAppClipboardPayload,
    pasteAppClipboardToCanvas: options.pasteAppClipboardToCanvas,
    pasteAppClipboardToComposer: options.pasteAppClipboardToComposer,
    setAppClipboardPayload: options.setAppClipboardPayload,
    readClipboardText: options.readClipboardText,
    writeClipboardText: options.writeClipboardText,
    setActiveClipboardZone: options.setActiveClipboardZone,
    openCanvasImageLightbox: options.openCanvasImageLightbox,
    openCanvasItem: options.openCanvasItem,
    setCanvasStatus: options.setCanvasStatus,
    renderCanvasBoard: () => canvas.render(),
    saveCanvasBoardToStorage: () => projectFile.save(options.state.canvasBoard),
    updateCanvasView: (nextView, opts) => canvas.setView(nextView, opts),
    getCanvasPositionFromClientPoint: (clientX, clientY) => canvas.getCanvasPositionFromClientPoint(clientX, clientY),
    isEditableElement: options.isEditableElement,
  });

  canvas.onPersist = () => projectFile.save(options.state.canvasBoard);

  return {
    canvas,
    itemManager,
    projectFile,
  };
}
