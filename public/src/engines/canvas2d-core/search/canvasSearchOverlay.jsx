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

function SearchTypeGlyph({ type = "" }) {
  if (type === "flowNode") {
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
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="canvas2d-tool-svg">
      <path d="M8 6.6h8M8 11.8h8M8 17h5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="5" y="4.8" width="14" height="14.4" rx="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.42" />
    </svg>
  );
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
  activeIndex = 0,
  onOpen,
  onClose,
  onQueryChange,
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
  const totalItems = Math.max(0, Number(stats?.total || 0) || 0);
  const searchableCount =
    Math.max(0, Number(stats?.text || 0) || 0) +
    Math.max(0, Number(stats?.flowNode || 0) || 0) +
    Math.max(0, Number(stats?.fileCard || 0) || 0) +
    Math.max(0, Number(stats?.image || 0) || 0);
  const shortcutLabel = getShortcutLabel();
  const scopeItems = [
    { key: "all", label: "画布", count: searchableCount || totalItems, accent: "is-board" },
    { key: "text", label: "文本", count: stats?.text || 0, accent: "is-text" },
    { key: "flowNode", label: "节点", count: stats?.flowNode || 0, accent: "is-node" },
    { key: "fileCard", label: "文件", count: stats?.fileCard || 0, accent: "is-file" },
    { key: "image", label: "图片", count: stats?.image || 0, accent: "is-image" },
  ];

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
            <span className="canvas2d-engine-search-scope-badge">Canvas</span>
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
            Esc
          </button>
        </div>
      </div>
      <div className="canvas2d-engine-search-panel-meta">
        <div className="canvas2d-engine-search-status">
          {hasQuery
            ? `找到 ${results.length} 条结果`
            : `输入即搜，当前 ${searchableCount} 个可检索对象`}
        </div>
        <div className="canvas2d-engine-search-shortcuts" aria-hidden="true">
          <span>↑↓ 切换</span>
          <span>Enter 定位</span>
        </div>
      </div>
      <div className="canvas2d-engine-search-subnav" aria-label="搜索范围">
        {scopeItems.map((item) => (
          <span
            key={item.key}
            className={`canvas2d-engine-search-scope-chip${item.key === "all" ? " is-active" : ""} ${item.accent}`}
          >
            <strong>{item.label}</strong>
            <em>{item.count}</em>
          </span>
        ))}
      </div>
      <div className="canvas2d-engine-search-results" role="listbox" aria-label="画布搜索结果">
        {!hasQuery ? (
          <div className="canvas2d-engine-search-empty">
            <span className="canvas2d-engine-search-empty-icon" aria-hidden="true">
              <SearchGlyph />
            </span>
            <strong>搜索画布内容</strong>
            <span>输入关键词后直接定位结果。</span>
          </div>
        ) : null}
        {hasQuery && !hasResults ? (
          <div className="canvas2d-engine-search-empty">
            <span className="canvas2d-engine-search-empty-icon" aria-hidden="true">
              <SearchGlyph />
            </span>
            <strong>没有匹配结果</strong>
            <span>换个关键词，或缩短搜索词再试。</span>
          </div>
        ) : null}
        {hasResults
          ? results.map((result, index) => (
              <button
                key={`${result.id}-${result.matchLabel}-${index}`}
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
                  </span>
                  <span>{renderHighlighted(result.summary)}</span>
                </span>
                <span className="canvas2d-engine-search-result-meta">
                  <span>{index === activeIndex ? "Enter" : `${index + 1}`}</span>
                </span>
              </button>
            ))
          : null}
      </div>
    </div>
  );
}
