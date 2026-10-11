import { createEmptyBoard } from "../elements/index.js";
import { getFileName } from "../utils.js";
import { DEFAULT_BOARD_FILE_NAME, parseBoardFileText, wrapFreeFlowBoardPayload } from "../boardFileFormat.js";

export function createCanvasWorkspaceManager(deps) {
  const {
    state,
    useLocalFileSystem,
    getFileApi,
    getBoardOps,
  } = deps;

  const {
    setStatus,
    setBoardFilePath,
    setCanvasImageSavePath,
    resolveCanvasBoardSavePath,
    resolveCanvasWorkspaceFolderPath,
    resolveCanvasImageSavePath,
    updateCanvasWorkspaceFolderSetting,
    ensureBoardFileExtension,
    normalizeCanvasImageSavePathValue,
    resolveBoardFolderPath,
    joinPath,
    isBoardFileName,
    resolveUniqueBoardFilePathByBaseName,
    sanitizeBoardFileBaseName,
  } = getFileApi();

  const {
    saveBoard,
    maybeSaveBeforeSwitch,
    buildBoardFilePayload,
    loadBoardFromPath,
    getBoardEditRevision,
    withBoardFileOperation,
    ensureImportImageFolderExists,
  } = getBoardOps();

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
    if (!cleanName) return { ok: false, filePath: source, error: "画布名称为空" };
    if (cleanName === sourceName) return { ok: true, filePath: source, error: "" };
    if (/[\\/:"*?<>|]/.test(cleanName)) return { ok: false, filePath: source, error: "画布名称包含路径符号" };
    const separator = source.includes("\\") ? "\\" : "/";
    const parts = source.split(/[\\/]/);
    parts[parts.length - 1] = cleanName;
    const nextPath = parts.join(separator);
    if (typeof globalThis?.desktopShell?.pathExists === "function" && await globalThis.desktopShell.pathExists(nextPath)) {
      return { ok: false, filePath: source, error: "同名画布已存在，请使用其他名称" };
    }
    if (typeof globalThis?.desktopShell?.renamePath !== "function") {
      setStatus("当前环境不支持重命名", "warning");
      return { ok: false, filePath: "", error: "当前环境不支持重命名" };
    }
    const rename = async () => {
      const result = await globalThis.desktopShell.renamePath(source, nextPath);
      if (result?.ok && source === state.boardFilePath) await setBoardFilePath(nextPath, { updateSettings: true });
      return result;
    };
    const result = source === currentPath
      ? await withBoardFileOperation(rename, { saveFirst: false })
      : await rename();
    if (!result?.ok) {
      setStatus(result?.error || "画布重命名失败", "warning");
      return { ok: false, filePath: "", error: result?.error || "画布重命名失败" };
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
    setStatus("画布已移入回收站");
    return { ok: true, filePath: targetPath, trashId: result.trashId || "" };
  }

  async function listCanvasHistory(filePath = state.boardFilePath) {
    if (!globalThis.desktopShell?.listCanvasHistory) return { ok: false, entries: [], error: "当前环境不支持历史记录" };
    return globalThis.desktopShell.listCanvasHistory({ filePath: String(filePath || "").trim() });
  }

  async function restoreCanvasHistory(filePath, historyId) {
    if (!globalThis.desktopShell?.restoreCanvasHistory) return { ok: false, error: "当前环境不支持历史恢复" };
    return withBoardFileOperation(() => globalThis.desktopShell.restoreCanvasHistory({ filePath, historyId }), { saveFirst: filePath === state.boardFilePath });
  }

  async function listCanvasTrash(folderPath) {
    if (!globalThis.desktopShell?.listCanvasTrash) return { ok: false, items: [], error: "当前环境不支持回收站" };
    return globalThis.desktopShell.listCanvasTrash({ folderPath: folderPath || resolveBoardFolderPath(state.boardFilePath) });
  }

  async function restoreCanvasTrash(folderPath, item) {
    if (!globalThis.desktopShell?.restoreCanvasTrash) return { ok: false, error: "当前环境不支持回收站恢复" };
    return globalThis.desktopShell.restoreCanvasTrash({ folderPath, trashId: item?.id });
  }

  async function duplicateBoardAtPath(filePath) {
    const source = String(filePath || "").trim();
    if (!source || !useLocalFileSystem) return { ok: false, error: "当前画布不能复制" };
    return withBoardFileOperation(async () => {
      const read = await globalThis.desktopShell.readFile(source);
      if (!read?.ok) return { ok: false, error: read?.error || "读取画布失败" };
      const payload = parseBoardFileText(read.text).payload;
      const board = payload.kind === "structured-host-board" ? payload.board : payload;
      if (!Array.isArray(board?.items)) return { ok: false, error: "文件不是有效画布" };
      const target = await resolveUniqueBoardFilePathByBaseName(resolveBoardFolderPath(source), `${sanitizeBoardFileBaseName(getFileName(source))} 副本`);
      const boardId = globalThis.crypto.randomUUID();
      board.boardId = boardId;
      if (payload.boardId) payload.boardId = boardId;
      if (payload.meta) payload.meta.boardFilePath = target;
      const result = await globalThis.desktopShell.writeFile(target, JSON.stringify(wrapFreeFlowBoardPayload(payload), null, 2));
      return result?.ok ? { ok: true, filePath: target } : { ok: false, error: result?.error || "复制画布失败" };
    }, { saveFirst: source === state.boardFilePath });
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
    const workspaceFolder = await resolveCanvasWorkspaceFolderPath();
    if (workspaceFolder) {
      return resolveBoardFolderPath(workspaceFolder) || workspaceFolder;
    }
    const settingsPath = await resolveCanvasBoardSavePath();
    if (settingsPath) {
      return resolveBoardFolderPath(settingsPath) || String(settingsPath || "").trim();
    }
    return resolveBoardFolderPath(state.boardFilePath);
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
    const listing = await listCanvasBoards(nextFolder);
    if (!listing.ok) throw new Error(listing.error || "工作区无法读取");
    await updateCanvasWorkspaceFolderSetting(nextFolder);
    setStatus("画布工作区已切换");
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

  async function createBoardInWorkspace(folderPath, nextName, { saveBeforeSwitch = true } = {}) {
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
    const ok = !saveBeforeSwitch || await maybeSaveBeforeSwitch();
    if (!ok) {
      return { ok: false, filePath: "", error: "当前画布保存失败，已取消切换" };
    }
    const expectedEditRevision = getBoardEditRevision();
    const cleanBaseName = sanitizeBoardFileBaseName(nextName);
    const nextPath = await resolveUniqueBoardFilePathByBaseName(targetFolder, cleanBaseName);
    // Write before replacing the active board so a failed write preserves its edits.
    const payload = buildBoardFilePayload(nextPath, createEmptyBoard());
    const saved = await globalThis.desktopShell.writeFile(nextPath, JSON.stringify(payload, null, 2));
    if (!saved?.ok) {
      setStatus("新建画布写入失败", "warning");
      return { ok: false, filePath: nextPath, error: saved?.error || "新建画布写入失败" };
    }
    if (!(await loadBoardFromPath(nextPath, { expectedEditRevision }))) return { ok: false, filePath: nextPath, error: "新文件已创建，但未切换；当前画布及期间的新编辑已保留" };
    await updateCanvasWorkspaceFolderSetting(targetFolder);
    setStatus("已新建画布");
    return { ok: true, filePath: nextPath, error: "" };
  }

  return {
    renameBoard,
    renameBoardAtPath,
    deleteBoardAtPath,
    listCanvasHistory,
    restoreCanvasHistory,
    listCanvasTrash,
    restoreCanvasTrash,
    duplicateBoardAtPath,
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
