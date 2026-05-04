import React, { useEffect, useMemo, useRef, useState } from "react";

const SORT_OPTIONS = Object.freeze([
  { value: "modified-desc", label: "最近修改" },
  { value: "name-asc", label: "名称" },
  { value: "size-desc", label: "文件大小" },
  { value: "modified-asc", label: "最早修改" },
]);

function formatPathLabel(pathValue = "", emptyText = "未设置") {
  const value = String(pathValue || "").trim();
  if (!value) {
    return emptyText;
  }
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 2) {
    return value;
  }
  return `.../${segments.slice(-2).join("/")}`;
}

function formatBoardDisplayName(name = "") {
  const value = String(name || "").trim() || "未命名画布";
  return value.replace(/\.(?:freeflow|json)$/i, "");
}

function formatBoardExtensionLabel(name = "", filePath = "") {
  const raw = String(name || filePath || "").trim();
  const match = raw.match(/(\.[^.\\/]+)$/);
  if (!match) {
    return ".freeflow";
  }
  return match[1].toLowerCase();
}

function formatFileSize(size) {
  const value = Number(size || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "0 KB";
  }
  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value) {
  const numeric = Number(value || 0);
  if (!numeric) {
    return "未知时间";
  }
  try {
    return new Date(numeric).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "未知时间";
  }
}

function normalizeBoardName(value) {
  const clean = String(value || "").trim();
  if (!clean) {
    return "";
  }
  const safe = clean
    .replace(/\.(?:freeflow|json)$/i, "")
    .replace(/[\\/:"*?<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!safe) {
    return "";
  }
  return `${safe}.freeflow`;
}

function getFolderName(pathValue = "") {
  const normalized = String(pathValue || "").replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] || "未选择工作区";
}

function compareBoardsBySort(leftBoard, rightBoard, sortKey) {
  const leftName = formatBoardDisplayName(leftBoard?.name || "");
  const rightName = formatBoardDisplayName(rightBoard?.name || "");
  const leftModified = Number(leftBoard?.modifiedAt || 0);
  const rightModified = Number(rightBoard?.modifiedAt || 0);
  const leftSize = Number(leftBoard?.size || 0);
  const rightSize = Number(rightBoard?.size || 0);

  if (sortKey === "name-asc") {
    return leftName.localeCompare(rightName, "zh-CN-u-kn-true", { sensitivity: "base" });
  }
  if (sortKey === "size-desc") {
    return rightSize - leftSize || rightModified - leftModified || leftName.localeCompare(rightName, "zh-CN-u-kn-true");
  }
  if (sortKey === "modified-asc") {
    return leftModified - rightModified || leftName.localeCompare(rightName, "zh-CN-u-kn-true");
  }
  return rightModified - leftModified || leftName.localeCompare(rightName, "zh-CN-u-kn-true");
}

export function BoardWorkspaceDialog({ open, bridge, snapshot, onClose }) {
  const [folderPath, setFolderPath] = useState("");
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [newBoardName, setNewBoardName] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [renameEditing, setRenameEditing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [sortKey, setSortKey] = useState("modified-desc");
  const [failedOpenPath, setFailedOpenPath] = useState("");
  const [repairResult, setRepairResult] = useState(null);
  const [openResultPath, setOpenResultPath] = useState("");
  const [saveResultPath, setSaveResultPath] = useState("");
  const renameInputRef = useRef(null);
  const createInputRef = useRef(null);

  const currentPath = String(snapshot?.boardFilePath || "").trim();
  const currentName = String(snapshot?.boardFileName || "").trim();
  const boardDirty = Boolean(snapshot?.boardDirty);
  const selectedBoard = useMemo(
    () => boards.find((board) => String(board.filePath || "") === selectedPath) || null,
    [boards, selectedPath]
  );
  const activeBoard =
    boards.find((board) => String(board.filePath || "") === currentPath) ||
    (currentPath
      ? {
          name: currentName || "当前画布.freeflow",
          filePath: currentPath,
          size: 0,
          modifiedAt: 0,
        }
      : null);
  const selectedOrActivePath = selectedPath || currentPath;
  const selectedTarget = selectedBoard || activeBoard;
  const selectedFilePath = String(selectedTarget?.filePath || selectedPath || currentPath || "").trim();
  const isSelectedActive = selectedFilePath && selectedFilePath === currentPath;
  const sortedBoards = useMemo(() => {
    return boards.slice().sort((leftBoard, rightBoard) => compareBoardsBySort(leftBoard, rightBoard, sortKey));
  }, [boards, sortKey]);

  const refreshBoards = async (nextFolder = folderPath) => {
    const cleanFolder = String(nextFolder || "").trim();
    if (!cleanFolder) {
      setBoards([]);
      return;
    }
    setLoading(true);
    setError("");
    setFeedback("");
    try {
      const result = await bridge.listCanvasBoards(cleanFolder);
      if (!result?.ok) {
        const message = result?.error || "读取画布工作区失败";
        setError(message.includes("No handler registered") ? "工作区读取接口尚未在主进程生效，请重启应用后重试。" : message);
        setBoards([]);
        return;
      }
      const nextBoards = Array.isArray(result.boards) ? result.boards : [];
      setFolderPath(String(result.folderPath || cleanFolder).trim());
      setBoards(nextBoards);
      setSelectedPath((current) => {
        if (current && nextBoards.some((board) => board.filePath === current)) {
          return current;
        }
        if (currentPath && nextBoards.some((board) => board.filePath === currentPath)) {
          return currentPath;
        }
        return nextBoards[0]?.filePath || "";
      });
    } catch (loadError) {
      const message = loadError?.message || "读取画布工作区失败";
      setError(message.includes("No handler registered") ? "工作区读取接口尚未在主进程生效，请重启应用后重试。" : message);
      setBoards([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    let canceled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const workspace = String((await bridge.getCanvasBoardWorkspace()) || "").trim();
        if (canceled) {
          return;
        }
        setFolderPath(workspace);
        await refreshBoards(workspace);
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      canceled = true;
    };
  }, [open, bridge]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setRenameDraft(formatBoardDisplayName(selectedBoard?.name || activeBoard?.name || currentName));
    setRenameEditing(false);
  }, [open, selectedBoard?.name, activeBoard?.name, currentName]);

  useEffect(() => {
    if (renameEditing) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renameEditing]);

  useEffect(() => {
    if (createOpen) {
      createInputRef.current?.focus();
    }
  }, [createOpen]);

  if (!open) {
    return null;
  }

  const runBusy = async (task, action = "") => {
    if (busy) {
      return;
    }
    setBusy(true);
    setBusyAction(action);
    setError("");
    setFeedback("");
    try {
      await task();
    } catch (taskError) {
      setError(taskError?.message || "操作失败");
    } finally {
      setBusy(false);
      setBusyAction("");
    }
  };

  const handlePickFolder = () =>
    runBusy(async () => {
      const nextFolder = String((await bridge.pickCanvasWorkspaceFolder()) || "").trim();
      if (nextFolder) {
        setFolderPath(nextFolder);
        await refreshBoards(nextFolder);
        setFeedback(`已切换到 ${getFolderName(nextFolder)}`);
      }
    }, "pick-folder");

  const handleCreate = () =>
    runBusy(async () => {
      const targetFolder = folderPath || String((await bridge.getCanvasBoardWorkspace()) || "").trim();
      if (!targetFolder) {
        const nextFolder = String((await bridge.pickCanvasWorkspaceFolder()) || "").trim();
        if (nextFolder) {
          setFolderPath(nextFolder);
          await refreshBoards(nextFolder);
        }
        return;
      }
      const result = await bridge.createBoardInWorkspace(targetFolder, newBoardName);
      if (!result?.ok) {
        throw new Error(result?.error || "新建画布失败");
      }
      setNewBoardName("");
      setCreateOpen(false);
      setOpenResultPath("");
      setSaveResultPath("");
      await refreshBoards(targetFolder);
      setSelectedPath(result.filePath || "");
      setFeedback("新画布已建立");
    }, "create");

  const handleOpenSelected = (explicitPath = "") =>
    runBusy(async () => {
      const targetPath = explicitPath || selectedFilePath || boards[0]?.filePath || "";
      if (!targetPath) {
        return;
      }
      setRepairResult(null);
      setOpenResultPath("");
      const loaded = await bridge.openBoardAtPath(targetPath);
      if (!loaded) {
        setFailedOpenPath(targetPath);
        throw new Error("画布打开失败，可使用下方修复功能生成可打开副本");
      }
      setFailedOpenPath("");
      setOpenResultPath(targetPath);
      setSaveResultPath("");
      await refreshBoards(folderPath);
    }, "open");

  const handleRepairSelected = () =>
    runBusy(async () => {
      const targetPath = selectedFilePath || failedOpenPath || "";
      if (!targetPath) {
        throw new Error("未选中损坏画布");
      }
      const result = await bridge.repairBoardAtPath?.(targetPath);
      if (!result?.ok) {
        throw new Error(result?.error || "画布修复失败");
      }
      setRepairResult(result);
      setOpenResultPath("");
      setSaveResultPath("");
      await refreshBoards(folderPath);
      setSelectedPath(result.repairedFile || targetPath);
      setFeedback(`已生成修复副本，恢复 ${Number(result.recoveredItemCount || 0)} 个节点`);
    }, "repair");

  const handleSave = () =>
    runBusy(async () => {
      const saved = await bridge.saveBoard();
      if (!saved) {
        throw new Error("画布保存失败");
      }
      setSaveResultPath(selectedFilePath || currentPath || "");
      await refreshBoards(folderPath);
    }, "save");

  const handleSaveAs = () =>
    runBusy(async () => {
      const saved = await bridge.saveBoardAs();
      if (!saved) {
        return;
      }
      setOpenResultPath("");
      setSaveResultPath("");
      const workspace = String((await bridge.getCanvasBoardWorkspace()) || folderPath).trim();
      setFolderPath(workspace);
      await refreshBoards(workspace);
      setFeedback("已另存为新文件");
    }, "save-as");

  const handleRename = () =>
    runBusy(async () => {
      const targetName = normalizeBoardName(renameDraft);
      if (!targetName) {
        return;
      }
      const currentSelectedName = normalizeBoardName(selectedTarget?.name || currentName);
      if (targetName === currentSelectedName) {
        setRenameEditing(false);
        setRenameDraft(formatBoardDisplayName(currentSelectedName));
        return;
      }
      if (!selectedFilePath) {
        throw new Error("未选中画布");
      }
      const result =
        typeof bridge.renameBoardAtPath === "function"
          ? await bridge.renameBoardAtPath(selectedFilePath, targetName)
          : isSelectedActive
            ? await bridge.renameBoard(targetName)
            : null;
      const renamed = typeof result === "boolean" ? { ok: result, filePath: selectedFilePath } : result;
      if (!renamed?.ok) {
        throw new Error("画布重命名失败");
      }
      setRenameEditing(false);
      setOpenResultPath("");
      setSaveResultPath("");
      await refreshBoards(folderPath);
      setSelectedPath(renamed.filePath || selectedFilePath);
      setFeedback("名称已更新");
    }, "rename");

  const handleDelete = () =>
    runBusy(async () => {
      if (!selectedFilePath) {
        throw new Error("未选中画布");
      }
      const result = await bridge.deleteBoardAtPath?.(selectedFilePath);
      if (!result?.ok) {
        throw new Error(result?.error || "删除画布失败");
      }
      setDeleteConfirmOpen(false);
      setOpenResultPath("");
      setSaveResultPath("");
      await refreshBoards(folderPath);
      setFeedback("画布已删除");
    }, "delete");

  const handleReveal = () => {
    if (typeof bridge.revealBoardPathInFolder === "function") {
      bridge.revealBoardPathInFolder(selectedFilePath);
      return;
    }
    if (isSelectedActive) {
      bridge.revealBoardInFolder?.();
    }
  };

  const boardCountLabel = `${boards.length} 个画布`;
  const dirtyLabel = boardDirty ? "未保存" : "已保存";
  const selectedStatusLabel = isSelectedActive ? dirtyLabel : selectedFilePath ? "未打开" : "未选择";
  const workspaceLabel = folderPath || "选择文件夹后开始管理";
  const selectedName = formatBoardDisplayName(selectedTarget?.name || currentName);
  const selectedMetaTime = formatTime(selectedTarget?.modifiedAt || 0);
  const selectedMetaSize = formatFileSize(selectedTarget?.size || 0);
  const createButtonLabel = busyAction === "create" ? "正在建立..." : "建立";
  const canRenameSelected = Boolean(selectedFilePath);
  const canDeleteSelected = Boolean(selectedFilePath) && !isSelectedActive;
  const activeBoardLabel = activeBoard ? formatBoardDisplayName(activeBoard.name) : "未打开画布";
  const selectedPathLabel = selectedFilePath ? formatPathLabel(selectedFilePath, "未选择") : "未选择";
  const workspaceBadgeLabel = loading ? "同步中" : "本地工作区";
  const listHintLabel = folderPath ? "双击直接打开" : "先连接工作区";
  const failedRepairPath = failedOpenPath || "";
  const canRepairSelected =
    Boolean(failedRepairPath) &&
    (selectedFilePath === failedRepairPath || !selectedFilePath || selectedPath === failedRepairPath);
  const isOpeningSelected = busyAction === "open";
  const isOpenedSelected =
    !isOpeningSelected &&
    Boolean(selectedFilePath) &&
    (selectedFilePath === currentPath || selectedFilePath === openResultPath);
  const openButtonLabel = isOpeningSelected ? "画布加载中" : isOpenedSelected ? "已打开" : "打开";
  const isSavingSelected = busyAction === "save";
  const isSavedSelected =
    !isSavingSelected &&
    Boolean(selectedFilePath) &&
    (selectedFilePath === currentPath || selectedFilePath === saveResultPath);
  const saveButtonLabel = isSavingSelected ? "保存中" : isSavedSelected ? "已保存" : "保存";

  return (
    <div className="canvas2d-board-workspace-overlay" role="dialog" aria-modal="true" aria-label="画布工作区">
      <div className="canvas2d-board-workspace-dialog">
        <section className="canvas2d-board-workspace-main">
          <header className="canvas2d-board-workspace-header">
            <div className="canvas2d-board-workspace-title-block">
              <span className="canvas2d-board-workspace-eyebrow">Workspace</span>
              <strong>画布工作区</strong>
              <div className="canvas2d-board-workspace-header-meta">
                <span>{getFolderName(folderPath)}</span>
                <span>{boardCountLabel}</span>
              </div>
            </div>
            <button type="button" className="canvas2d-board-workspace-close" onClick={onClose} aria-label="关闭">
              ×
            </button>
          </header>

          <div className="canvas2d-board-workspace-path-card">
            <div className="canvas2d-board-workspace-path-main">
              <span>工作区</span>
              <strong title={folderPath || "未选择工作区"}>{workspaceLabel}</strong>
              <small title={currentPath || "当前未打开画布"}>{activeBoardLabel}</small>
            </div>
            <div className="canvas2d-board-workspace-path-actions">
              <button type="button" onClick={() => refreshBoards(folderPath)} disabled={loading || busy || !folderPath}>
                刷新
              </button>
              <button type="button" onClick={handlePickFolder} disabled={busy}>
                更换文件夹
              </button>
            </div>
          </div>

          <div className="canvas2d-board-workspace-toolbar">
            <div className="canvas2d-board-workspace-list-head">
              <strong>画布列表</strong>
              <span>{listHintLabel}</span>
            </div>
            <div className="canvas2d-board-workspace-toolbar-actions">
              <span className="canvas2d-board-workspace-list-badge">{workspaceBadgeLabel}</span>
              <label className="canvas2d-board-workspace-sort-field">
                <span>排序</span>
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value)} disabled={loading || busy || boards.length < 2}>
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="canvas2d-board-workspace-stat-strip" aria-hidden="true">
            <div className="canvas2d-board-workspace-stat">
              <span>当前画布</span>
              <strong title={activeBoardLabel}>{activeBoardLabel}</strong>
            </div>
            <div className="canvas2d-board-workspace-stat">
              <span>列表状态</span>
              <strong>{boardCountLabel}</strong>
            </div>
          </div>

          <div className="canvas2d-board-workspace-list" role="listbox" aria-label="画布文件列表">
            {loading ? (
              <div className="canvas2d-board-workspace-empty">
                <strong>正在读取工作区</strong>
                <span>扫描本地画布文件</span>
              </div>
            ) : boards.length ? (
              sortedBoards.map((board) => {
                const isActive = board.filePath === currentPath;
                const isSelected = board.filePath === selectedOrActivePath;
                return (
                  <button
                    key={board.filePath}
                    type="button"
                    className={`canvas2d-board-workspace-item${isSelected ? " is-selected" : ""}${isActive ? " is-active" : ""}`}
                    onClick={() => setSelectedPath(board.filePath)}
                    onDoubleClick={() => {
                      setSelectedPath(board.filePath);
                      void handleOpenSelected(board.filePath);
                    }}
                    title={board.filePath}
                    >
                    <span className="canvas2d-board-workspace-file-icon" aria-hidden="true">
                      FF
                    </span>
                    <span className="canvas2d-board-workspace-item-main">
                      <span className="canvas2d-board-workspace-item-top">
                        <strong>{formatBoardDisplayName(board.name)}</strong>
                        {isActive ? <span className="canvas2d-board-workspace-active-pill">当前</span> : null}
                      </span>
                      <span className="canvas2d-board-workspace-item-path">
                        {formatBoardExtensionLabel(board.name, board.filePath)}
                      </span>
                    </span>
                    <span className="canvas2d-board-workspace-item-meta">
                      <small>{formatTime(board.modifiedAt)}</small>
                      <strong>{formatFileSize(board.size)}</strong>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="canvas2d-board-workspace-empty">
                <strong>{folderPath ? "这个工作区还没有画布" : "未选择工作区文件夹"}</strong>
                <span>{folderPath ? "在右侧新建第一张画布" : "先选择一个本地文件夹"}</span>
              </div>
            )}
          </div>
        </section>

        <aside className="canvas2d-board-workspace-side">
          <div className="canvas2d-board-workspace-current">
            <div className="canvas2d-board-workspace-current-head">
              <span>当前选中</span>
              <span className={`canvas2d-board-workspace-status-pill${isSelectedActive && boardDirty ? " is-dirty" : ""}`}>
                {selectedStatusLabel}
              </span>
            </div>
            {renameEditing ? (
              <div className="canvas2d-board-workspace-rename-editor">
                <input
                  ref={renameInputRef}
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleRename();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setRenameDraft(selectedName);
                      setRenameEditing(false);
                    }
                  }}
                  placeholder="画布名称"
                  disabled={busy}
                />
                <button type="button" className="is-primary" onClick={handleRename} disabled={busy || !canRenameSelected}>
                  {busyAction === "rename" ? "保存中" : "确认"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenameDraft(selectedName);
                    setRenameEditing(false);
                  }}
                  disabled={busy}
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="canvas2d-board-workspace-current-title-row">
                <strong title={selectedFilePath || currentName}>{selectedName}</strong>
                <button
                  type="button"
                  className="canvas2d-board-workspace-icon-action"
                  onClick={() => {
                    setRenameDraft(selectedName);
                    setRenameEditing(true);
                  }}
                  disabled={busy || !canRenameSelected}
                  aria-label="重命名当前选中画布"
                  title="重命名"
                >
                  ✎
                </button>
              </div>
            )}
            <div className="canvas2d-board-workspace-current-meta">
              <small>{selectedMetaTime}</small>
              <small>{selectedMetaSize}</small>
            </div>
            {feedback ? <div className="canvas2d-board-workspace-feedback">{feedback}</div> : null}
          </div>

          <div className="canvas2d-board-workspace-action-stack">
            <button
              type="button"
              onClick={handleSave}
              disabled={(busy && busyAction !== "save") || !selectedFilePath}
              className={isSavedSelected ? "canvas2d-board-workspace-save-action is-saved" : ""}
            >
              {saveButtonLabel}
            </button>
            <button type="button" onClick={handleSaveAs} disabled={busy}>
              另存为
            </button>
            <button type="button" onClick={handleReveal} disabled={!selectedFilePath}>
              打开位置
            </button>
            <button
              type="button"
              className={`canvas2d-board-workspace-repair-action${canRepairSelected ? " is-visible" : ""}`}
              onClick={handleRepairSelected}
              disabled={busy || !canRepairSelected}
              title={canRepairSelected ? "为当前打不开的画布生成修复副本" : "打开失败后可在这里修复"}
            >
              {busyAction === "repair" ? "修复中" : "修复画布"}
            </button>
            <button
              type="button"
              className="canvas2d-board-workspace-danger-action"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={busy || !canDeleteSelected}
              title={isSelectedActive ? "请先切换到其他画布，再删除当前文件" : "删除当前选中的画布文件"}
            >
              删除
            </button>
          </div>

          {repairResult?.ok ? (
            <div className="canvas2d-board-workspace-feedback">
              已生成修复副本：{formatPathLabel(repairResult.repairedFile, repairResult.repairedFile)}
            </div>
          ) : null}
          {error ? (
            <div className="canvas2d-board-workspace-error">
              <span>{error}</span>
              {canRepairSelected ? (
                <button
                  type="button"
                  className="canvas2d-board-workspace-inline-repair"
                  onClick={handleRepairSelected}
                  disabled={busy}
                >
                  {busyAction === "repair" ? "修复中" : "修复画布"}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className={`canvas2d-board-workspace-create-dock${createOpen ? " is-open" : ""}`}>
            {createOpen ? (
              <>
                <div className="canvas2d-board-workspace-card-head">
                  <strong>新建画布</strong>
                  <button
                    type="button"
                    className="canvas2d-board-workspace-mini-action"
                    onClick={() => {
                      setCreateOpen(false);
                      setNewBoardName("");
                    }}
                    disabled={busy}
                  >
                    取消
                  </button>
                </div>
                <input
                  ref={createInputRef}
                  value={newBoardName}
                  onChange={(event) => setNewBoardName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleCreate();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setCreateOpen(false);
                      setNewBoardName("");
                    }
                  }}
                  placeholder="输入名称，留空自动命名"
                  disabled={busy}
                />
                <button type="button" className="is-primary" onClick={handleCreate} disabled={busy}>
                  {createButtonLabel}
                </button>
              </>
            ) : null}
          </div>

          <div className="canvas2d-board-workspace-bottom-actions">
            <button
              type="button"
              onClick={() => handleOpenSelected()}
              disabled={(busy && busyAction !== "open") || !selectedFilePath || isOpenedSelected}
              className={isOpenedSelected ? "canvas2d-board-workspace-open-action is-opened" : ""}
            >
              {openButtonLabel}
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={busy}
              className="canvas2d-board-workspace-create-inline-action"
            >
              新建画布
            </button>
          </div>
        </aside>
      </div>
      {deleteConfirmOpen ? (
        <div className="canvas2d-board-workspace-confirm-backdrop">
          <div className="canvas2d-board-workspace-confirm-dialog" role="alertdialog" aria-modal="true" aria-label="删除画布确认">
            <span className="canvas2d-board-workspace-confirm-eyebrow">删除确认</span>
            <strong title={selectedName}>确认删除「{selectedName}」？</strong>
            <p>删除后将从当前工作区移除该画布文件，此操作不可撤销。</p>
            <div className="canvas2d-board-workspace-confirm-actions">
              <button type="button" onClick={() => setDeleteConfirmOpen(false)} disabled={busy}>
                取消
              </button>
              <button type="button" className="is-danger" onClick={handleDelete} disabled={busy}>
                {busyAction === "delete" ? "删除中" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default BoardWorkspaceDialog;
