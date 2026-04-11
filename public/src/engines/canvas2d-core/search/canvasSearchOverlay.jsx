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

export function CanvasSearchOverlay({
  isOpen = false,
  query = "",
  highlightQuery = "",
  results = [],
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
        onClick={onOpen}
      >
        <span className="canvas2d-engine-search-icon" aria-hidden="true">
          <SearchGlyph />
        </span>
        <span className="canvas2d-engine-search-copy">
          <strong>搜索画布内容</strong>
          <span>文本、节点、文件名、标签、备忘录</span>
        </span>
        <span className="canvas2d-engine-search-kbd" aria-hidden="true">Ctrl + K</span>
      </button>
    );
  }

  const hasQuery = normalizeSearchText(query).length > 0;
  const hasResults = results.length > 0;
  const highlightText = normalizeSearchText(highlightQuery || query);

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
      parts.push(<mark key={`${index}-${needle}`} className="canvas2d-engine-search-mark">{safeText.slice(index, index + needle.length)}</mark>);
      cursor = index + needle.length;
    }
    return parts;
  };

  return (
    <div className="canvas2d-engine-search-panel">
      <div className="canvas2d-engine-search-panel-header">
        <label className="canvas2d-engine-search-input-wrap">
          <span className="canvas2d-engine-search-icon" aria-hidden="true">
            <SearchGlyph />
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
        <button type="button" className="canvas2d-engine-search-close" onClick={onClose} aria-label="关闭搜索">
          Esc
        </button>
      </div>
      <div className="canvas2d-engine-search-status">
        {hasQuery ? `${results.length} 条结果` : "输入关键词开始搜索"}
      </div>
      <div className="canvas2d-engine-search-results" role="listbox" aria-label="画布搜索结果">
        {!hasQuery ? (
          <div className="canvas2d-engine-search-empty">
            <strong>支持搜索画布内容</strong>
            <span>可查找文本、节点内容、文件名、图片标签与备忘录。</span>
          </div>
        ) : null}
        {hasQuery && !hasResults ? (
          <div className="canvas2d-engine-search-empty">
            <strong>没有找到匹配内容</strong>
            <span>可以换一个关键词，或缩短搜索词再试。</span>
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
                <span className="canvas2d-engine-search-result-main">
                  <strong>{result.title}</strong>
                  <span>{renderHighlighted(result.summary)}</span>
                </span>
                <span className="canvas2d-engine-search-result-meta">
                  <span>{result.typeLabel}</span>
                  <span>{result.matchLabel}</span>
                </span>
              </button>
            ))
          : null}
      </div>
    </div>
  );
}
