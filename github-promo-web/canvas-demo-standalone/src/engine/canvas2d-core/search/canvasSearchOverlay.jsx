import React from "react";

function normalizeSearchText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <circle cx="11" cy="11" r="5.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15.4 15.4l4.1 4.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function SearchTypeGlyph({ type = "" }) {
  if (type === "flowNode" || type === "mindNode" || type === "mindSummary") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
        <rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
        <circle cx="8" cy="12" r="1" fill="currentColor" opacity="0.5" />
        <circle cx="16" cy="12" r="1" fill="currentColor" opacity="0.5" />
      </svg>
    );
  }
  if (type === "fileCard") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
        <path d="M7 4.5h6.3l3.7 3.8v11.2H7z" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M13.3 4.5v4h3.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M9 12.2h6M9 15.6h4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "image") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
        <rect x="4.8" y="5.4" width="14.4" height="13.2" rx="2.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="9.2" cy="10" r="1.4" fill="currentColor" />
        <path
          d="M7.4 16.2 10.8 12.8l2.7 2.2 2.9-3 2.3 4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (type === "table") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
        <rect x="4.8" y="5.2" width="14.4" height="13.6" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4.8 10h14.4M4.8 14.6h14.4M9.6 5.2v13.6M14.4 5.2v13.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  if (type === "codeBlock") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
        <path d="m9 8-3 4 3 4M15 8l3 4-3 4M13.4 6.8l-2.8 10.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <path d="M8 6.6h8M8 11.8h8M8 17h5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="5" y="4.8" width="14" height="14.4" rx="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.42" />
    </svg>
  );
}

function MatchGlyph({ label = "" }) {
  const normalized = String(label || "").trim();
  if (normalized.includes("代码")) {
    return "</>";
  }
  if (normalized.includes("表格")) {
    return "▦";
  }
  if (normalized.includes("标题")) {
    return "T";
  }
  if (normalized.includes("链接")) {
    return "🔗";
  }
  if (normalized.includes("文件")) {
    return "F";
  }
  return "·";
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
}) {
  if (!isOpen) {
    return (
      <button
        type="button"
        className="canvas2d-engine-search-placeholder"
        title="打开画布全局搜索"
        aria-label="打开画布搜索"
        onClick={onOpen}
      >
        <span className="canvas2d-engine-search-icon" aria-hidden="true">
          <SearchGlyph />
        </span>
      </button>
    );
  }

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

  return (
    <div className="canvas2d-engine-search-panel">
      <div className="canvas2d-engine-search-panel-top">
        <label className="canvas2d-engine-search-input-wrap">
          <span className="canvas2d-engine-search-input-leading" aria-hidden="true">
            <span className="canvas2d-engine-search-icon">
              <SearchGlyph />
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
            <CloseGlyph />
          </button>
        </div>
      </div>
      <div className="canvas2d-engine-search-panel-meta">
        <div className="canvas2d-engine-search-status">
          {hasQuery
            ? `在${activeScope?.label || "画布"}中找到 ${results.length} 条结果`
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
                <SearchGlyph />
              </span>
              <strong>没有匹配结果</strong>
              <span>{activeScope?.key && activeScope.key !== "all" ? `当前仅检索${activeScope.label}，可切换范围后再试。` : "换个关键词，或缩短搜索词再试。"}</span>
            </div>
          ) : null}
          {hasResults
            ? results.map((result, index) => (
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
                      <em>{result.typeLabel}</em>
                    </span>
                    <span className="canvas2d-engine-search-result-summary">
                      {renderHighlighted(result.summary)}
                    </span>
                  </span>
                  <span className="canvas2d-engine-search-result-meta">
                    <span className="canvas2d-engine-search-result-order">{index === activeIndex ? "Enter" : `${index + 1}`}</span>
                    <span className="canvas2d-engine-search-result-match">
                      <i aria-hidden="true">{MatchGlyph({ label: result.matchLabel })}</i>
                      <small>{result.matchLabel}</small>
                    </span>
                  </span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
