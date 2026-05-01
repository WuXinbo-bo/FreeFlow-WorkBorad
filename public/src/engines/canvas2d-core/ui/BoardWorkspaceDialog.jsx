import React, { useEffect, useMemo, useState } from "react";

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
  return value.toLowerCase().endsWith(".json") ? value.slice(0, -5) : value;
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

function normalizeJsonName(value) {
  const clean = String(value || "").trim();
  if (!clean) {
    return "";
  }
  const safe = clean
    .replace(/\.json$/i, "")
    .replace(/[\\/:"*?<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!safe) {
    return "";
  }
  return `${safe}.json`;
}

function getFolderName(pathValue = "") {
  const normalized = String(pathValue || "").replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] || "未选择工作区";
}

export function BoardWorkspaceDialog({ open, bridge, snapshot, onClose }) {
  const [folderPath, setFolderPath] = useState("");
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newBoardName, setNewBoardName] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [selectedPath, setSelectedPath] = useState("");

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
          name: currentName || "当前画布.json",
          filePath: currentPath,
          size: 0,
          modifiedAt: 0,
        }
      : null);
  const selectedOrActivePath = selectedPath || currentPath;

  const refreshBoards = async (nextFolder = folderPath) => {
    const cleanFolder = String(nextFolder || "").trim();
    if (!cleanFolder) {
      setBoards([]);
      return;
    }
    setLoading(true);
    setError("");
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
  }, [open, selectedBoard?.name, activeBoard?.name, currentName]);

  if (!open) {
    return null;
  }

  const runBusy = async (task) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (taskError) {
      setError(taskError?.message || "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const handlePickFolder = () =>
    runBusy(async () => {
      const nextFolder = String((await bridge.pickCanvasWorkspaceFolder()) || "").trim();
      if (nextFolder) {
        setFolderPath(nextFolder);
        await refreshBoards(nextFolder);
      }
    });

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
      setSelectedPath(result.filePath || "");
      await refreshBoards(targetFolder);
    });

  const handleOpenSelected = (explicitPath = "") =>
    runBusy(async () => {
      const targetPath = explicitPath || selectedPath || boards[0]?.filePath || "";
      if (!targetPath) {
        return;
      }
      const loaded = await bridge.openBoardAtPath(targetPath);
      if (!loaded) {
        throw new Error("画布打开失败");
      }
      await refreshBoards(folderPath);
    });

  const handleSave = () =>
    runBusy(async () => {
      const saved = await bridge.saveBoard();
      if (!saved) {
        throw new Error("画布保存失败");
      }
      await refreshBoards(folderPath);
    });

  const handleSaveAs = () =>
    runBusy(async () => {
      const saved = await bridge.saveBoardAs();
      if (!saved) {
        return;
      }
      const workspace = String((await bridge.getCanvasBoardWorkspace()) || folderPath).trim();
      setFolderPath(workspace);
      await refreshBoards(workspace);
    });

  const handleRename = () =>
    runBusy(async () => {
      const targetName = normalizeJsonName(renameDraft);
      if (!targetName) {
        return;
      }
      const renamed = await bridge.renameBoard(targetName);
      if (!renamed) {
        throw new Error("画布重命名失败");
      }
      await refreshBoards(folderPath);
    });

  const handleReveal = () => {
    bridge.revealBoardInFolder?.();
  };

  const boardCountLabel = `${boards.length} 个画布`;
  const dirtyLabel = boardDirty ? "未保存" : "已保存";
  const workspaceLabel = folderPath || "选择文件夹后开始管理";
  const selectedName = formatBoardDisplayName(selectedBoard?.name || activeBoard?.name || currentName);
  const selectedMetaTime = formatTime(selectedBoard?.modifiedAt || activeBoard?.modifiedAt || 0);
  const selectedMetaSize = formatFileSize(selectedBoard?.size || activeBoard?.size || 0);

  return (
    <div className="canvas2d-board-workspace-overlay" role="dialog" aria-modal="true" aria-label="画布工作区">
      <div className="canvas2d-board-workspace-dialog">
        <section className="canvas2d-board-workspace-main">
          <header className="canvas2d-board-workspace-header">
            <div className="canvas2d-board-workspace-title-block">
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

          <div className="canvas2d-board-workspace-list-head">
            <div>
              <strong>画布列表</strong>
              <span>{folderPath ? boardCountLabel : "未连接工作区"}</span>
            </div>
            <span className="canvas2d-board-workspace-list-badge">{loading ? "同步中" : "本地文件"}</span>
          </div>

          <div className="canvas2d-board-workspace-list" role="listbox" aria-label="画布文件列表">
            {loading ? (
              <div className="canvas2d-board-workspace-empty">
                <strong>正在读取工作区</strong>
                <span>扫描本地画布文件</span>
              </div>
            ) : boards.length ? (
              boards.map((board) => {
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
                      <strong>{formatBoardDisplayName(board.name)}</strong>
                      <span>{formatPathLabel(board.filePath)}</span>
                    </span>
                    <span className="canvas2d-board-workspace-item-meta">
                      <span>{formatTime(board.modifiedAt)}</span>
                      <span>{formatFileSize(board.size)}</span>
                    </span>
                    {isActive ? <span className="canvas2d-board-workspace-active-pill">当前</span> : null}
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
              <span className={`canvas2d-board-workspace-status-pill${boardDirty ? " is-dirty" : ""}`}>{dirtyLabel}</span>
            </div>
            <strong title={currentPath || currentName}>{selectedName}</strong>
            <div className="canvas2d-board-workspace-current-meta">
              <small>{selectedMetaTime}</small>
              <small>{selectedMetaSize}</small>
            </div>
          </div>

          <div className="canvas2d-board-workspace-action-card">
            <div className="canvas2d-board-workspace-card-head">
              <strong>新建画布</strong>
            </div>
            <label>
              <span>名称</span>
              <input
                value={newBoardName}
                onChange={(event) => setNewBoardName(event.target.value)}
                placeholder="留空自动命名"
                disabled={busy}
              />
            </label>
            <button type="button" className="is-primary" onClick={handleCreate} disabled={busy}>
              新建画布
            </button>
          </div>

          <div className="canvas2d-board-workspace-action-grid">
            <button type="button" onClick={handleOpenSelected} disabled={busy || !selectedPath}>
              打开
            </button>
            <button type="button" onClick={handleSave} disabled={busy}>
              保存
            </button>
            <button type="button" onClick={handleSaveAs} disabled={busy}>
              另存为
            </button>
            <button type="button" onClick={handleReveal} disabled={!currentPath}>
              打开位置
            </button>
          </div>

          <div className="canvas2d-board-workspace-action-card">
            <div className="canvas2d-board-workspace-card-head">
              <strong>重命名</strong>
            </div>
            <label>
              <span>当前文件</span>
              <input
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                placeholder="输入新名称"
                disabled={busy || !currentPath}
              />
            </label>
            <button type="button" onClick={handleRename} disabled={busy || !currentPath}>
              应用重命名
            </button>
          </div>

          <div className="canvas2d-board-workspace-note">
            <strong>结构</strong>
            <span>画布保存为 JSON，图片资源默认写入工作区 `Images`。</span>
          </div>

          {error ? <div className="canvas2d-board-workspace-error">{error}</div> : null}
        </aside>
      </div>
    </div>
  );
}

export default BoardWorkspaceDialog;
