import React from "react";
import { AppIcon } from "../../../ui/icons/AppIcon.jsx";

function normalizeSearchText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function SearchTypeGlyph({ type = "" }) {
  const name = {
    flowNode: "git-fork",
    mindNode: "git-fork",
    mindSummary: "git-fork",
    fileCard: "file-text",
    image: "image",
    table: "table",
    codeBlock: "code",
  }[type] || "type";
  return <AppIcon name={name} size={18} />;
}

function MatchGlyph({ label = "" }) {
  const normalized = String(label || "").trim();
  const name = normalized.includes("代码") ? "code"
    : normalized.includes("表格") ? "table"
    : normalized.includes("标题") ? "heading"
    : normalized.includes("链接") ? "link"
    : normalized.includes("文件") ? "file-text"
    : "dot";
  return <AppIcon name={name} size={16} />;
}

function getShortcutLabel() {
  return /mac|iphone|ipad|ipod/i.test(globalThis?.navigator?.platform || "") ? "⌘ K" : "Ctrl K";
}

export function CanvasSearchOverlay({
  isOpen = false,
  query = "",
  highlightQuery = "",
  results = [],
  stats = null,
  scopeItems = [],
  activeFilterKey = "all",
  activeIndex = 0,
  onOpen,
  onClose,
  onQueryChange,
  onFilterChange,
  onKeyDown,
  onHoverResult,
  onSelectResult,
  inputRef = null,
  range = "current",
  onRangeChange,
  workspaceSupported = false,
  loading = false,
  warnings = [],
  renderPanel,
}) {
  const trigger = (
      <button
        type="button"
        className="canvas2d-engine-search-placeholder"
        title="打开画布全局搜索"
        aria-label="打开画布搜索"
        aria-expanded={isOpen}
        aria-controls={isOpen ? "canvas2d-search-panel" : undefined}
        onClick={isOpen ? onClose : onOpen}
      >
        <span className="canvas2d-engine-search-icon" aria-hidden="true">
          <AppIcon name="search" size={18} />
        </span>
      </button>
  );
  if (!isOpen) return trigger;

  const hasQuery = normalizeSearchText(query).length > 0;
  const hasResults = results.length > 0;
  const highlightText = normalizeSearchText(highlightQuery || query);
  const totalItems = Math.max(0, Number(stats?.indexTotal || stats?.total || 0) || 0);
  const activeScope = Array.isArray(scopeItems)
    ? scopeItems.find((item) => String(item?.key || "").trim() === String(activeFilterKey || "").trim()) || null
    : null;
  const shortcutLabel = getShortcutLabel();

  const renderHighlighted = (text) => {
    const safeText = String(text || "");
    const needle = highlightText.trim();
    if (!needle) {
      return safeText;
    }
    const lower = safeText.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    if (!lower.includes(lowerNeedle)) {
      return safeText;
    }
    const parts = [];
    let cursor = 0;
    while (cursor < safeText.length) {
      const index = lower.indexOf(lowerNeedle, cursor);
      if (index === -1) {
        parts.push(safeText.slice(cursor));
        break;
      }
      if (index > cursor) {
        parts.push(safeText.slice(cursor, index));
      }
      parts.push(
        <mark key={`${index}-${needle}`} className="canvas2d-engine-search-mark">
          {safeText.slice(index, index + needle.length)}
        </mark>
      );
      cursor = index + needle.length;
    }
    return parts;
  };

  const panel = (
    <div id="canvas2d-search-panel" className="canvas2d-engine-search-panel">
      <div className="canvas2d-engine-search-panel-top">
        <label className="canvas2d-engine-search-input-wrap">
          <span className="canvas2d-engine-search-input-leading" aria-hidden="true">
            <span className="canvas2d-engine-search-icon">
              <AppIcon name="search" size={18} />
            </span>
          </span>
          <input
            ref={inputRef}
            className="canvas2d-engine-search-input"
            type="text"
            value={query}
            placeholder="搜索文本、节点、文件名、标签、备忘录"
            onChange={(event) => onQueryChange?.(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>
        <div className="canvas2d-engine-search-panel-actions">
          <span className="canvas2d-engine-search-kbd" aria-hidden="true">{shortcutLabel}</span>
          <button type="button" className="canvas2d-engine-search-close" onClick={onClose} aria-label="关闭搜索">
            <AppIcon name="x" size={16} />
          </button>
        </div>
      </div>
      <div className="canvas2d-engine-search-subnav canvas2d-search-range" aria-label="画布搜索范围">
        <button type="button" aria-pressed={range === "current"} onClick={() => onRangeChange?.("current")}>当前画布</button>
        <button type="button" disabled={!workspaceSupported} aria-pressed={range === "workspace"} onClick={() => onRangeChange?.("workspace")}>整个工作区</button>
        {loading && <span role="status">正在检索…</span>}
      </div>
      {warnings.length > 0 && <div className="canvas2d-engine-search-panel-meta" role="alert">{warnings.slice(0, 3).join("；")}</div>}
      <div className="canvas2d-engine-search-panel-meta">
        <div className="canvas2d-engine-search-status">
          {hasQuery
            ? `${loading ? "正在搜索" : "在"}${range === "workspace" ? "整个工作区" : activeScope?.label || "画布"}中找到 ${results.length} 条结果${range === "workspace" && results.length >= 80 ? "（仅显示前 80 条）" : ""}`
            : `输入即搜，当前 ${totalItems} 个可检索对象`}
        </div>
        <div className="canvas2d-engine-search-shortcuts" aria-hidden="true">
          <span>↑↓ 切换</span>
          <span>Enter 定位</span>
        </div>
      </div>
      <div className="canvas2d-engine-search-subnav" aria-label="搜索范围">
        {scopeItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`canvas2d-engine-search-scope-chip${item.key === activeFilterKey ? " is-active" : ""} ${item.accent}`}
            aria-pressed={item.key === activeFilterKey}
            onClick={() => onFilterChange?.(item.key)}
          >
            <strong>{item.label}</strong>
            <em>{item.count}</em>
          </button>
        ))}
      </div>
      {hasQuery ? (
        <div className="canvas2d-engine-search-results" role="listbox" aria-label="画布搜索结果">
          {!hasResults ? (
            <div className="canvas2d-engine-search-empty">
              <span className="canvas2d-engine-search-empty-icon" aria-hidden="true">
                <AppIcon name="search" size={18} />
              </span>
              <strong>{loading ? "正在检索…" : "没有匹配结果"}</strong>
              <span>{activeScope?.key && activeScope.key !== "all" ? `当前仅检索${activeScope.label}，可切换范围后再试。` : "换个关键词，或缩短搜索词再试。"}</span>
            </div>
          ) : null}
          {hasResults
            ? results.map((result, index) => (
              <React.Fragment key={result.entryKey || `${result.id}-${index}`}>
                {result.boardName && (index === 0 || results[index - 1].boardPath !== result.boardPath) && <div className="canvas2d-search-board-heading">{result.boardName}</div>}
                <button
                  key={result.entryKey || `${result.id}-${result.matchLabel}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`canvas2d-engine-search-result${index === activeIndex ? " is-active" : ""}`}
                  onMouseEnter={() => onHoverResult?.(index)}
                  onClick={() => onSelectResult?.(result, index)}
                >
                  <span className={`canvas2d-engine-search-result-glyph is-${result.type}`} aria-hidden="true">
                    <SearchTypeGlyph type={result.type} />
                  </span>
                  <span className="canvas2d-engine-search-result-main">
                    <span className="canvas2d-engine-search-result-head">
                      <strong>{result.title}</strong>
                      {result.boardName && <small>{result.boardName}</small>}
                      <em>{result.typeLabel}</em>
                    </span>
                    <span className="canvas2d-engine-search-result-summary">
                      {renderHighlighted(result.summary)}
                    </span>
                  </span>
                  <span className="canvas2d-engine-search-result-meta">
                    <span className="canvas2d-engine-search-result-order">{index === activeIndex ? "Enter" : `${index + 1}`}</span>
                    <span className="canvas2d-engine-search-result-match">
                      <i aria-hidden="true"><MatchGlyph label={result.matchLabel} /></i>
                      <small>{result.matchLabel}</small>
                    </span>
                  </span>
                </button>
              </React.Fragment>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
  return <>{trigger}{renderPanel ? renderPanel(panel) : panel}</>;
}
