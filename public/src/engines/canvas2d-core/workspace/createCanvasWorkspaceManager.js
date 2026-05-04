import { createEmptyBoard } from "../elements/index.js";
import { createHistoryState, markHistoryBaseline, takeHistorySnapshot } from "../history.js";
import { getFileName } from "../utils.js";
import { DEFAULT_BOARD_FILE_NAME } from "../boardFileFormat.js";

export function createCanvasWorkspaceManager(deps) {
  const {
    state,
    store,
    useLocalFileSystem,
    getFileApi,
    getBoardOps,
    getEditApi,
    setSuppressDirtyTracking,
  } = deps;

  const {
    setStatus,
    setBoardFilePath,
    setBoardDirty,
    setCanvasImageSavePath,
    resolveCanvasBoardSavePath,
    resolveCanvasImageSavePath,
    ensureBoardFileExtension,
    normalizeCanvasImageSavePathValue,
    resolveBoardFolderPath,
    joinPath,
    isBoardFileName,
    resolveUniqueBoardFilePath,
    resolveUniqueBoardFilePathByBaseName,
    sanitizeBoardFileBaseName,
  } = getFileApi();

  const {
    saveBoard,
    maybeSaveBeforeSwitch,
    syncBoard,
    ensureImportImageFolderExists,
  } = getBoardOps();

  const {
    cancelTextEdit,
    cancelFlowNodeEdit,
    cancelFileMemoEdit,
    cancelImageMemoEdit,
    finishImageEdit,
  } = getEditApi();

  async function ensureDirectoryIfSupported(targetPath) {
    if (typeof globalThis?.desktopShell?.ensureDirectory !== "function") {
      return null;
    }
    try {
      return await globalThis.desktopShell.ensureDirectory(targetPath);
    } catch {
      return null;
    }
  }

  async function renameBoard(nextName) {
    const currentPath = String(state.boardFilePath || "").trim();
    if (!currentPath) {
      return saveBoard({ saveAs: true });
    }
    const result = await renameBoardAtPath(currentPath, nextName);
    return Boolean(result?.ok);
  }

  async function renameBoardAtPath(sourcePath, nextName) {
    if (!useLocalFileSystem) {
      setStatus("当前环境不支持重命名", "warning");
      return { ok: false, filePath: "", error: "当前环境不支持重命名" };
    }
    const currentPath = String(state.boardFilePath || "").trim();
    const source = String(sourcePath || "").trim() || currentPath;
    if (!source) {
      return { ok: false, filePath: "", error: "画布路径为空" };
    }
    const sourceName = getFileName(source);
    const providedName = typeof nextName === "string" && nextName.trim() ? nextName.trim() : sourceName;
    const cleanName = ensureBoardFileExtension(providedName);
    if (!cleanName || cleanName === sourceName) {
      return { ok: false, filePath: source, error: "" };
    }
    const separator = source.includes("\\") ? "\\" : "/";
    const parts = source.split(/[\\/]/);
    parts[parts.length - 1] = cleanName;
    const nextPath = parts.join(separator);
    if (typeof globalThis?.desktopShell?.renamePath !== "function") {
      setStatus("当前环境不支持重命名", "warning");
      return { ok: false, filePath: "", error: "当前环境不支持重命名" };
    }
    const result = await globalThis.desktopShell.renamePath(source, nextPath);
    if (!result?.ok) {
      setStatus(result?.error || "画布重命名失败", "warning");
      return { ok: false, filePath: "", error: result?.error || "画布重命名失败" };
    }
    if (source === currentPath) {
      await setBoardFilePath(nextPath, { updateSettings: true });
    }
    setStatus("画布已重命名");
    return { ok: true, filePath: nextPath, error: "" };
  }

  function revealBoardInFolder() {
    const targetPath = String(state.boardFilePath || "").trim();
    return revealBoardPathInFolder(targetPath);
  }

  function revealBoardPathInFolder(filePath) {
    const targetPath = String(filePath || "").trim();
    if (!targetPath) {
      setStatus("画布路径为空");
      return false;
    }
    if (typeof globalThis?.desktopShell?.revealPath === "function") {
      void globalThis.desktopShell.revealPath(targetPath);
      return true;
    }
    setStatus("当前环境不支持打开文件夹");
    return false;
  }

  async function deleteBoardAtPath(filePath) {
    if (!useLocalFileSystem) {
      setStatus("当前环境不支持删除", "warning");
      return { ok: false, error: "当前环境不支持删除" };
    }
    const targetPath = String(filePath || "").trim();
    if (!targetPath) {
      return { ok: false, error: "画布路径为空" };
    }
    const currentPath = String(state.boardFilePath || "").trim();
    if (currentPath && currentPath === targetPath) {
      setStatus("请先切换到其他画布再删除当前文件", "warning");
      return { ok: false, error: "不能直接删除当前已打开画布" };
    }
    if (typeof globalThis?.desktopShell?.removePath !== "function") {
      setStatus("当前环境不支持删除", "warning");
      return { ok: false, error: "当前环境不支持删除" };
    }
    const result = await globalThis.desktopShell.removePath(targetPath);
    if (!result?.ok) {
      setStatus(result?.error || "删除画布失败", "warning");
      return { ok: false, error: result?.error || "删除画布失败" };
    }
    setStatus("画布已删除");
    return { ok: true, filePath: targetPath };
  }

  function revealCanvasImageSavePath() {
    const targetPath = String(state.canvasImageSavePath || "").trim();
    if (!targetPath) {
      setStatus("画布图片位置为空");
      return false;
    }
    if (typeof globalThis?.desktopShell?.revealPath === "function") {
      void globalThis.desktopShell.revealPath(targetPath);
      return true;
    }
    setStatus("当前环境不支持打开文件夹");
    return false;
  }

  async function pickCanvasImageSavePath() {
    if (typeof globalThis?.desktopShell?.pickDirectory !== "function") {
      setStatus("当前环境不支持选择目录", "warning");
      return "";
    }
    const result = await globalThis.desktopShell.pickDirectory({
      defaultPath: state.canvasImageSavePath || (await resolveCanvasImageSavePath()) || "",
    });
    if (result?.canceled || !result?.filePath) {
      return "";
    }
    const nextPath = normalizeCanvasImageSavePathValue(result.filePath);
    setCanvasImageSavePath(nextPath, { updateSettings: true });
    setStatus("画布图片位置已更新");
    return nextPath;
  }

  async function pickCanvasBoardSavePath() {
    if (typeof globalThis?.desktopShell?.pickDirectory !== "function") {
      setStatus("当前环境不支持选择目录", "warning");
      return "";
    }
    const defaultPath = resolveBoardFolderPath(state.boardFilePath) || (await resolveCanvasBoardSavePath()) || "";
    const result = await globalThis.desktopShell.pickDirectory({
      defaultPath,
    });
    if (result?.canceled || !result?.filePath) {
      return "";
    }
    const nextFolder = resolveBoardFolderPath(result.filePath);
    if (!nextFolder) {
      return "";
    }
    const currentName = isBoardFileName(getFileName(state.boardFilePath)) ? getFileName(state.boardFilePath) : DEFAULT_BOARD_FILE_NAME;
    const nextFilePath = joinPath(nextFolder, currentName);
    await setBoardFilePath(nextFilePath, { updateSettings: true });
    setStatus("画布保存位置已更新");
    void ensureImportImageFolderExists();
    return nextFolder;
  }

  async function getCanvasBoardWorkspace() {
    const currentFolder = resolveBoardFolderPath(state.boardFilePath);
    if (currentFolder) {
      return currentFolder;
    }
    const settingsPath = await resolveCanvasBoardSavePath();
    return resolveBoardFolderPath(settingsPath) || String(settingsPath || "").trim();
  }

  async function pickCanvasWorkspaceFolder() {
    if (typeof globalThis?.desktopShell?.pickDirectory !== "function") {
      setStatus("当前环境不支持选择工作区", "warning");
      return "";
    }
    const defaultPath = (await getCanvasBoardWorkspace()) || "";
    const result = await globalThis.desktopShell.pickDirectory({ defaultPath });
    if (result?.canceled || !result?.filePath) {
      return "";
    }
    const nextFolder = resolveBoardFolderPath(result.filePath);
    if (!nextFolder) {
      return "";
    }
    await ensureDirectoryIfSupported(nextFolder);
    const currentName = isBoardFileName(getFileName(state.boardFilePath)) ? getFileName(state.boardFilePath) : DEFAULT_BOARD_FILE_NAME;
    let nextFilePath = joinPath(nextFolder, currentName);
    if (typeof globalThis?.desktopShell?.pathExists === "function") {
      const exists = await globalThis.desktopShell.pathExists(nextFilePath);
      if (exists && nextFilePath !== state.boardFilePath) {
        nextFilePath = await resolveUniqueBoardFilePath(nextFolder);
      }
    }
    await setBoardFilePath(nextFilePath, { emit: false, updateSettings: true });
    setBoardDirty(true, { emit: false });
    const imageFolder = joinPath(nextFolder, "Images");
    setCanvasImageSavePath(imageFolder, { updateSettings: true });
    await ensureDirectoryIfSupported(imageFolder);
    await saveBoard({ silent: true, exactPath: true });
    setStatus("画布工作区已切换");
    store.emit();
    return nextFolder;
  }

  async function listCanvasBoards(folderPath) {
    const targetFolder = String(folderPath || "").trim() || (await getCanvasBoardWorkspace());
    if (!targetFolder) {
      return { ok: true, folderPath: "", boards: [], error: "" };
    }
    if (typeof globalThis?.desktopShell?.listCanvasBoards !== "function") {
      return { ok: false, folderPath: targetFolder, boards: [], error: "当前环境不支持读取工作区" };
    }
    let result = null;
    try {
      result = await globalThis.desktopShell.listCanvasBoards({ folderPath: targetFolder });
    } catch (error) {
      return {
        ok: false,
        folderPath: targetFolder,
        boards: [],
        error: error?.message || "读取画布工作区失败，请重启应用后重试",
      };
    }
    if (!result?.ok) {
      return {
        ok: false,
        folderPath: targetFolder,
        boards: [],
        error: result?.error || "读取画布工作区失败",
      };
    }
    return {
      ok: true,
      folderPath: String(result.folderPath || targetFolder).trim(),
      boards: Array.isArray(result.boards) ? result.boards : [],
      error: "",
    };
  }

  async function createBoardInWorkspace(folderPath, nextName) {
    const targetFolder = resolveBoardFolderPath(folderPath) || (await getCanvasBoardWorkspace());
    if (!targetFolder) {
      setStatus("请先选择画布工作区", "warning");
      return { ok: false, filePath: "", error: "请先选择画布工作区" };
    }
    const ensured = await ensureDirectoryIfSupported(targetFolder);
    if (ensured && !ensured.ok) {
      const error = ensured.error || "工作区创建失败";
      setStatus(error, "warning");
      return { ok: false, filePath: "", error };
    }
    const ok = await maybeSaveBeforeSwitch();
    if (!ok) {
      return { ok: false, filePath: "", error: "当前画布保存失败，已取消切换" };
    }
    const cleanBaseName = sanitizeBoardFileBaseName(nextName);
    const nextPath = await resolveUniqueBoardFilePathByBaseName(targetFolder, cleanBaseName);
    setSuppressDirtyTracking(true);
    state.board = createEmptyBoard();
    state.board.selectedIds = [];
    state.history = createHistoryState();
    markHistoryBaseline(state.history, takeHistorySnapshot(state));
    cancelTextEdit();
    cancelFlowNodeEdit();
    cancelFileMemoEdit();
    cancelImageMemoEdit();
    finishImageEdit();
    syncBoard({ persist: false, emit: true, markDirty: false });
    setSuppressDirtyTracking(false);
    await setBoardFilePath(nextPath, { emit: false, updateSettings: true });
    setBoardDirty(true, { emit: false });
    const saved = await saveBoard({ silent: true, exactPath: true });
    if (!saved) {
      setStatus("新建画布写入失败", "warning");
      store.emit();
      return { ok: false, filePath: nextPath, error: "新建画布写入失败" };
    }
    setStatus("已新建画布");
    return { ok: true, filePath: nextPath, error: "" };
  }

  return {
    renameBoard,
    renameBoardAtPath,
    deleteBoardAtPath,
    revealBoardInFolder,
    revealBoardPathInFolder,
    revealCanvasImageSavePath,
    pickCanvasImageSavePath,
    pickCanvasBoardSavePath,
    getCanvasBoardWorkspace,
    pickCanvasWorkspaceFolder,
    listCanvasBoards,
    createBoardInWorkspace,
    ensureDirectoryIfSupported,
  };
}
