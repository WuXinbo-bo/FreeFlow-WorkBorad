import { normalizeCanvasBoard, getDefaultCanvasBoard } from "./schema.js";

export class ProjectFile {
  constructor(options = {}) {
    this.apiRoutes = options.apiRoutes || {};
    this.readJsonResponse = options.readJsonResponse || (async (response) => response.json());
    this.getBoard = options.getBoard || (() => getDefaultCanvasBoard());
    this.setBoard = options.setBoard || (() => {});
    this.getSavePath = options.getSavePath || (() => "");
    this.setStorageInfo = options.setStorageInfo || (() => {});
    this.setStatus = options.setStatus || (() => {});
    this.readLegacyBoard = options.readLegacyBoard || (() => null);
    this.clearLegacyBoard = options.clearLegacyBoard || (() => {});
    this.persistDelayMs = Number(options.persistDelayMs) || 250;
    this.timer = 0;
    this.promise = Promise.resolve();
  }

  async load() {
    let boardFromFile = normalizeCanvasBoard();

    try {
      const response = await fetch(this.apiRoutes.canvasBoard);
      const data = await this.readJsonResponse(response, "画布文件");
      if (!response.ok || !data.ok) {
        throw new Error(data.details || data.error || "无法读取画布文件");
      }
      boardFromFile = normalizeCanvasBoard(data.board || {});
      this.setStorageInfo(data);
    } catch (error) {
      const legacyBoard = normalizeCanvasBoard(this.readLegacyBoard() || {});
      this.setBoard(legacyBoard);
      if (!legacyBoard.items.length) {
        this.setStatus(`画布文件读取失败：${error.message}`, "warning");
      }
      return legacyBoard;
    }

    const legacyBoard = normalizeCanvasBoard(this.readLegacyBoard() || {});
    const shouldMigrateLegacy = legacyBoard.items.length && !boardFromFile.items.length;
    const nextBoard = shouldMigrateLegacy ? legacyBoard : boardFromFile;
    this.setBoard(nextBoard);

    if (shouldMigrateLegacy) {
      try {
        await this.save(nextBoard, true);
        this.clearLegacyBoard();
        this.setStatus("已将旧浏览器画布迁移到本地文件", "success");
      } catch (error) {
        this.setStatus(`画布迁移失败：${error.message}`, "warning");
      }
    }

    return nextBoard;
  }

  scheduleSave(board = this.getBoard(), immediate = false) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = 0;
    }

    const run = () => {
      this.promise = this.promise
        .catch(() => {})
        .then(async () => {
          const payload = normalizeCanvasBoard({
            ...board,
            updatedAt: Date.now(),
          });
          const response = await fetch(this.apiRoutes.canvasBoard, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await this.readJsonResponse(response, "画布文件");
          if (!response.ok || !data.ok) {
            throw new Error(data.details || data.error || "画布文件写入失败");
          }
          this.setBoard(normalizeCanvasBoard(data.board || payload));
          this.setStorageInfo(data);
          this.clearLegacyBoard();
          return this.getBoard();
        })
        .catch((error) => {
          this.setStatus(`画布保存失败：${error.message}`, "warning");
          throw error;
        });
      return this.promise;
    };

    if (immediate) {
      return run();
    }

    this.timer = window.setTimeout(run, this.persistDelayMs);
    return this.promise;
  }

  save(board = this.getBoard(), immediate = false) {
    return this.scheduleSave(board, immediate);
  }
}
