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

function compareImages(leftItem, rightItem, sortKey) {
  const leftName = String(leftItem?.name || "");
  const rightName = String(rightItem?.name || "");
  const leftModified = Number(leftItem?.modifiedAt || 0);
  const rightModified = Number(rightItem?.modifiedAt || 0);
  const leftSize = Number(leftItem?.size || 0);
  const rightSize = Number(rightItem?.size || 0);
  if (sortKey === "name-asc") {
    return leftName.localeCompare(rightName, "zh-CN-u-kn-true", { sensitivity: "base" });
  }
  if (sortKey === "size-desc") {
    return rightSize - leftSize || rightModified - leftModified || leftName.localeCompare(rightName, "zh-CN-u-kn-true");
  }
  return rightModified - leftModified || leftName.localeCompare(rightName, "zh-CN-u-kn-true");
}

const SORT_OPTIONS = Object.freeze([
  { value: "modified-desc", label: "最近加入" },
  { value: "name-asc", label: "名称" },
  { value: "size-desc", label: "文件大小" },
]);

export function CanvasImageManagerDialog({ open, bridge, snapshot, onClose }) {
  const [busyAction, setBusyAction] = useState("");
  const [feedback, setFeedback] = useState("");
  const [sortKey, setSortKey] = useState("modified-desc");
  const [selectedPath, setSelectedPath] = useState("");

  const imageManager = snapshot?.canvasImageManager || {};
  const folderPath = String(imageManager?.folderPath || snapshot?.canvasImageSavePath || "").trim();
  const items = Array.isArray(imageManager?.items) ? imageManager.items : [];
  const loading = Boolean(imageManager?.loading);
  const error = String(imageManager?.error || "").trim();
  const missingCount = Number(imageManager?.missingCount || 0) || 0;
  const sortedItems = useMemo(() => items.slice().sort((left, right) => compareImages(left, right, sortKey)), [items, sortKey]);
  const selectedItem = sortedItems.find((item) => String(item.filePath || "") === selectedPath) || sortedItems[0] || null;
  const referencedCount = items.filter((item) => item?.referenced).length;

  useEffect(() => {
    if (!open) {
      return;
    }
    void bridge.refreshCanvasImageManager();
  }, [open, bridge]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedPath((current) => {
      if (current && items.some((item) => String(item.filePath || "") === current)) {
        return current;
      }
      return String(items[0]?.filePath || "").trim();
    });
  }, [open, items]);

  if (!open) {
    return null;
  }

  const runBusy = async (action, task) => {
    if (busyAction) {
      return;
    }
    setBusyAction(action);
    setFeedback("");
    try {
      await task();
    } finally {
      setBusyAction("");
    }
  };

  const handleChooseFolder = () =>
    runBusy("pick-folder", async () => {
      const nextPath = String((await bridge.pickCanvasImageSavePath()) || "").trim();
      if (!nextPath) {
        return;
      }
      await bridge.refreshCanvasImageManager();
      setFeedback("图片目录已更新");
    });

  const handleOpenFolder = () =>
    runBusy("open-folder", async () => {
      await bridge.revealCanvasImageSavePath();
    });

  const handleClipboardImport = () =>
    runBusy("clipboard", async () => {
      const ok = await bridge.importCanvasImagesFromClipboard();
      if (ok) {
        setFeedback("已导入剪贴板图片");
      }
    });

  const handleScreenshotImport = () =>
    runBusy("screenshot", async () => {
      const ok = await bridge.captureCanvasImageToManager();
      if (ok) {
        setFeedback("系统截图已加入画布");
      }
    });

  const handleLocalImport = () =>
    runBusy("local-import", async () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = async () => {
        const files = Array.from(input.files || []);
        if (!files.length) {
          return;
        }
        await bridge.importFiles(files);
        await bridge.refreshCanvasImageManager();
        setFeedback(`已导入 ${files.length} 张图片`);
      };
      input.click();
    });

  const handleInsertSelected = () =>
    runBusy("insert", async () => {
      const targetPath = String(selectedItem?.filePath || "").trim();
      if (!targetPath || selectedItem?.missing) {
        return;
      }
      const ok = await bridge.insertManagedCanvasImage(targetPath);
      if (ok) {
        setFeedback("图片已插入画布");
      }
    });

  return (
    <div className="canvas2d-board-workspace-overlay" role="presentation">
      <div className="canvas2d-board-workspace-dialog canvas2d-image-manager-dialog" role="dialog" aria-modal="true" aria-label="画布图片管理">
        <div className="canvas2d-board-workspace-main canvas2d-image-manager-main">
          <div className="canvas2d-board-workspace-header">
            <div className="canvas2d-board-workspace-title-block">
              <span className="canvas2d-board-workspace-eyebrow">Canvas Assets</span>
              <strong>画布图片管理</strong>
              <div className="canvas2d-board-workspace-header-meta">
                <span>{items.length} 项</span>
                <span>{referencedCount} 项已在画布中使用</span>
                {missingCount ? <span>缺失 {missingCount} 项</span> : null}
              </div>
            </div>
            <button type="button" className="canvas2d-board-workspace-close" onClick={onClose} aria-label="关闭图片管理">
              ×
            </button>
          </div>

          <div className="canvas2d-board-workspace-path-card">
            <div className="canvas2d-board-workspace-path-main">
              <span>当前图片目录</span>
              <strong title={folderPath || "未设置画布图片目录"}>{formatPathLabel(folderPath, "未设置")}</strong>
              <small>{folderPath || "导入、截图和粘贴图片会统一写入这里"}</small>
            </div>
            <div className="canvas2d-board-workspace-path-actions">
              <button type="button" onClick={handleChooseFolder} disabled={busyAction === "pick-folder"}>选择目录</button>
              <button type="button" onClick={handleOpenFolder} disabled={!folderPath || busyAction === "open-folder"}>打开目录</button>
              <button type="button" onClick={() => void bridge.refreshCanvasImageManager()} disabled={loading}>刷新</button>
            </div>
          </div>

          <div className="canvas2d-board-workspace-toolbar">
            <div className="canvas2d-board-workspace-list-head">
              <span>来源与资产</span>
              <strong>统一导入入口</strong>
            </div>
            <div className="canvas2d-board-workspace-toolbar-actions">
              <div className="canvas2d-board-workspace-sort-field">
                <span>排序</span>
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="canvas2d-image-manager-action-grid">
            <button type="button" onClick={handleLocalImport} disabled={busyAction === "local-import"}>导入本地图片</button>
            <button type="button" onClick={handleClipboardImport} disabled={busyAction === "clipboard"}>读取剪贴板图片</button>
            <button type="button" onClick={handleScreenshotImport} disabled={busyAction === "screenshot"}>系统截图导入</button>
            <button type="button" onClick={handleInsertSelected} disabled={!selectedItem || Boolean(selectedItem?.missing) || busyAction === "insert"}>
              插入选中图片
            </button>
          </div>

          {error ? <div className="canvas2d-image-manager-banner is-error">{error}</div> : null}
          {feedback ? <div className="canvas2d-image-manager-banner">{feedback}</div> : null}

          <div className="canvas2d-image-manager-list" role="list">
            {loading ? (
              <div className="canvas2d-engine-export-history-empty">
                <strong>正在读取图片目录</strong>
                <span>请稍候，正在整理当前画布的图片资产。</span>
              </div>
            ) : sortedItems.length ? (
              sortedItems.map((item) => {
                const selected = selectedItem && selectedItem.filePath === item.filePath;
                return (
                  <button
                    key={item.id || item.filePath}
                    type="button"
                    className={`canvas2d-image-manager-item${selected ? " is-active" : ""}${item.missing ? " is-missing" : ""}`}
                    onClick={() => setSelectedPath(String(item.filePath || "").trim())}
                    title={item.filePath || item.name}
                  >
                    <span className="canvas2d-image-manager-item-main">
                      <strong>{item.name || "未命名图片"}</strong>
                      <span>{item.filePath || "当前记录未关联本地文件"}</span>
                    </span>
                    <span className="canvas2d-image-manager-item-meta">
                      <span>{formatFileSize(item.size)}</span>
                      <span>{formatTime(item.modifiedAt)}</span>
                      <span>{item.missing ? "文件缺失" : item.referenced ? `已使用 ${item.referenceCount} 次` : "未放置到画布"}</span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="canvas2d-engine-export-history-empty">
                <strong>当前还没有图片资产</strong>
                <span>从本地导入、读取剪贴板图片或做一次系统截图后，会统一出现在这里。</span>
              </div>
            )}
          </div>
        </div>

        <aside className="canvas2d-board-workspace-side canvas2d-image-manager-side">
          <div className="canvas2d-board-workspace-current">
            <span>当前选中</span>
            <strong>{selectedItem?.name || "未选择图片"}</strong>
            <small>{selectedItem?.filePath || "从列表中选中一张图片以继续操作"}</small>
          </div>
          <div className="canvas2d-board-workspace-stat-strip">
            <div className="canvas2d-board-workspace-stat">
              <span>目录</span>
              <strong>{formatPathLabel(folderPath, "未设置")}</strong>
            </div>
            <div className="canvas2d-board-workspace-stat">
              <span>更新时间</span>
              <strong>{formatTime(imageManager?.lastScannedAt || 0)}</strong>
            </div>
          </div>
          <div className="canvas2d-image-manager-detail-card">
            <span className="canvas2d-board-workspace-eyebrow">状态摘要</span>
            <strong>{selectedItem?.missing ? "待修复的图片引用" : selectedItem ? "可继续插入或定位" : "等待选择图片"}</strong>
            <p>
              {selectedItem
                ? selectedItem.missing
                  ? "当前画布中存在失效图片路径，建议先重新导入原图，再逐步替换。"
                  : selectedItem.referenced
                    ? "该图片已经被当前画布使用，可继续重复放置或打开本地目录。"
                    : "该图片已进入统一管理目录，但尚未放置到当前画布。"
                : "这里保留统一目录、图片状态和快捷操作，避免在多个设置入口之间来回切换。"}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
