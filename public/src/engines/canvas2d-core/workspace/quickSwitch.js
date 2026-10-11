export function getQuickSwitchBoards(boards, recent, query, view, sort) {
  const text = String(query || "").trim().toLocaleLowerCase();
  const source = text ? [...recent, ...boards] : view === "recent" ? recent : boards;
  const seen = new Set();
  const entries = source.filter((board) => {
    if (!board?.filePath || seen.has(board.filePath)) return false;
    seen.add(board.filePath);
    return !text || `${board.name || ""} ${board.filePath}`.toLocaleLowerCase().includes(text);
  });
  return entries.sort((a, b) => {
    if (text) {
      const aStarts = String(a.name || "").toLocaleLowerCase().startsWith(text);
      const bStarts = String(b.name || "").toLocaleLowerCase().startsWith(text);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return Number(b.openedAt || b.modifiedAt || 0) - Number(a.openedAt || a.modifiedAt || 0);
    }
    if (view === "recent") return Number(b.openedAt || 0) - Number(a.openedAt || 0);
    if (sort === "name") return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN-u-kn-true");
    return Number(b.modifiedAt || 0) - Number(a.modifiedAt || 0) || String(a.name || "").localeCompare(String(b.name || ""));
  });
}
