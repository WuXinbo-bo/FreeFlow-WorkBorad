import { buildCanvasSearchIndex, buildCanvasSearchResults } from "./canvasSearchIndex.js";
import { parseBoardFileText } from "../boardFileFormat.js";

export function createWorkspaceSearchIndex({ listBoards, readBoard, maxEntries = 100000, maxCharacters = 8000000 } = {}) {
  const cache = new Map();
  let folder = "";
  let revision = 0;
  let dbPromise;
  function database() {
    if (!globalThis.indexedDB) return Promise.resolve(null);
    if (!dbPromise) dbPromise = new Promise((resolve) => {
      const request = indexedDB.open("freeflow-workspace-search-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("workspaces");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return dbPromise;
  }
  async function restore(root, generation) {
    const db = await database();
    if (!db) return;
    const saved = await new Promise((resolve) => {
      const request = db.transaction("workspaces").objectStore("workspaces").get(root);
      request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null);
    });
    if (generation === revision && Array.isArray(saved)) for (const [path, entry] of saved) cache.set(path, entry);
  }
  async function persist(root, generation) {
    const db = await database();
    if (!db || generation !== revision) return;
    try {
      const transaction = db.transaction("workspaces", "readwrite");
      transaction.objectStore("workspaces").put([...cache], root);
      transaction.onabort = () => {}; transaction.onerror = () => {};
    } catch { /* A full cache can be rebuilt; it never affects board data. */ }
  }
  function invalidate(paths) {
    revision += 1;
    if (Array.isArray(paths)) paths.forEach((path) => cache.delete(path));
    else cache.clear();
  }
  async function search(root, query, { currentPath = "", currentItems = [], filterKey = "all", limit = 60, signal } = {}) {
    const generation = ++revision;
    const canceled = () => signal?.aborted || generation !== revision;
    if (root !== folder) { folder = root; cache.clear(); await restore(root, generation); }
    const listing = await listBoards(root);
    if (canceled()) return { canceled: true, results: [], warnings: [] };
    if (!listing?.ok) throw new Error(listing?.error || "无法读取工作区");
    const paths = new Set((listing.boards || []).map((board) => board.filePath));
    for (const path of cache.keys()) if (!paths.has(path)) cache.delete(path);
    const warnings = [];
    let entryCount = 0;
    let characterCount = 0;
    const indexedPaths = new Set();
    for (const board of listing.boards || []) {
      if (canceled()) return { canceled: true, results: [], warnings: [] };
      if (board.filePath === currentPath) continue;
      const signature = `${board.modifiedAt}:${board.size}`;
      const previous = cache.get(board.filePath);
      if (!previous || previous.signature !== signature) {
        try {
          const read = await readBoard(board.filePath);
          if (canceled()) return { canceled: true, results: [], warnings: [] };
          if (!read?.ok) throw new Error(read?.error || "读取失败");
          const payload = parseBoardFileText(read.text).payload;
          const items = payload.board?.items || payload.items;
          if (!Array.isArray(items)) throw new Error("文件不是有效画布");
          const entries = buildCanvasSearchIndex(items).map((entry) => ({ ...entry, aggregateText: "" }));
          cache.set(board.filePath, { signature, name: board.name, entries });
        } catch (error) { cache.delete(board.filePath); warnings.push(`${board.name}：${error.message}`); }
      }
      const entry = cache.get(board.filePath);
      const characters = entry?.entries.reduce((total, item) => total + item.title.length + item.fields.reduce((sum, field) => sum + field.value.length, 0), 0) || 0;
      if (entryCount + (entry?.entries.length || 0) > maxEntries || characterCount + characters > maxCharacters) {
        cache.delete(board.filePath);
        warnings.push(`${board.name} 及后续画布未纳入搜索：工作区内容超过本机索引预算，请缩小工作区范围`);
        break;
      }
      entryCount += entry?.entries.length || 0;
      characterCount += characters;
      indexedPaths.add(board.filePath);
      // Yield between files so typing, closing and changing workspaces can cancel work.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    for (const path of cache.keys()) if (!indexedPaths.has(path)) cache.delete(path);
    const results = [];
    for (const board of listing.boards || []) {
      const entries = board.filePath === currentPath ? buildCanvasSearchIndex(currentItems) : cache.get(board.filePath)?.entries || [];
      for (const result of buildCanvasSearchResults(entries, query, { filterKey, limit })) results.push({ ...result, boardPath: board.filePath, boardName: board.name, entryKey: `${board.filePath}:${result.entryKey}` });
    }
    if (!paths.has(currentPath)) for (const result of buildCanvasSearchResults(buildCanvasSearchIndex(currentItems), query, { filterKey, limit })) results.unshift({ ...result, boardPath: currentPath, boardName: "当前画布（工作区外）", entryKey: `current:${result.entryKey}` });
    void persist(root, generation);
    return { results: results.slice(0, limit), warnings, canceled: canceled(), total: results.length };
  }
  return { search, invalidate, dispose() { invalidate(); cache.clear(); if (dbPromise) dbPromise.then((db) => db?.close()); } };
}
