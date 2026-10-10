import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Cloud, FilePlus2, FolderOpen, ListTree, MoreHorizontal, PanelLeft, RefreshCw, Save, Search, Settings, X } from "lucide-react";
import { readChromePreference, writeChromePreference } from "./chromePreferences.js";

const displayName = (value) => String(value || "未命名画布").replace(/\.(freeflow|json)$/i, "");
const folderName = (value) => String(value || "").replace(/\\/g, "/").split("/").filter(Boolean).pop() || "未选择工作区";
const stateLabels = { synced: "上次已同步", "up-to-date": "上次已同步", "local-only": "仅本地", "local-changed": "待上传", "remote-only": "待拉取", "remote-changed": "远程有更新", "both-changed": "有冲突", conflict: "有冲突", "path-collision": "路径冲突", "deleted-remote": "远程已删除", error: "同步失败" };

function IconButton({ label, children, ...props }) {
  return <button type="button" className="canvas2d-workspace-icon" title={label} aria-label={label} {...props}>{children}</button>;
}

export function BoardWorkspacePanel({ bridge, snapshot, children, onShowDirectory, openRequest = 0 }) {
  const supported = typeof globalThis.desktopShell?.listCanvasBoards === "function";
  const [open, setOpen] = useState(() => readChromePreference("workspaceOpen", supported));
  const [folder, setFolder] = useState("");
  const [boards, setBoards] = useState([]);
  const [view, setView] = useState("workspace");
  const [recent, setRecent] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("freeflow.canvas.chrome.recentBoards") || "[]");
      return Array.isArray(stored) ? stored.filter((entry) => typeof entry?.filePath === "string").slice(0, 12) : [];
    } catch { return []; }
  });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("modified");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState(null);
  const [menu, setMenu] = useState(null);
  const [pending, setPending] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [failedPath, setFailedPath] = useState("");
  const [syncStatus, setSyncStatus] = useState(null);
  const [plan, setPlan] = useState(null);
  const [width, setWidth] = useState(() => {
    try { return Math.min(360, Math.max(260, Number(localStorage.getItem("freeflow.canvas.chrome.workspaceWidth")) || 288)); } catch { return 288; }
  });
  const rootRef = useRef(null);
  const folderRef = useRef("");
  const searchRef = useRef(null);
  const sequence = useRef(0);
  const statusSequence = useRef(0);
  const busyRef = useRef(false);
  const mounted = useRef(false);
  const currentRef = useRef(snapshot);
  currentRef.current = snapshot;
  const currentPath = String(snapshot?.boardFilePath || "");
  const currentName = displayName(snapshot?.boardFileName);
  const syncClient = globalThis.desktopShell?.githubSync;
  const switchDialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  const menuRef = useRef(null);
  const menuReturnFocusRef = useRef(null);
  const portalHost = document.getElementById("global-overlay-layer") || document.body;

  const toggle = (next) => {
    setOpen(next);
    writeChromePreference("workspaceOpen", next);
    setMenu(null);
    setEditor(null);
  };

  async function refresh(target = folderRef.current) {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const root = target || await bridge.getCanvasBoardWorkspace();
      const result = root ? await bridge.listCanvasBoards(root) : { ok: true, boards: [], folderPath: "" };
      if (!mounted.current || request !== sequence.current) return;
      if (!result?.ok) throw new Error(result?.error || "无法读取工作区");
      folderRef.current = result.folderPath || root || "";
      setFolder(folderRef.current);
      setBoards(result.boards || []);
    } catch (cause) {
      if (mounted.current && request === sequence.current) setError(cause.message || "无法读取工作区");
    } finally {
      if (mounted.current && request === sequence.current) setLoading(false);
    }
  }

  async function refreshStatus() {
    if (!syncClient?.getStatus) return;
    const request = ++statusSequence.current;
    try {
      const status = await syncClient.getStatus();
      if (mounted.current && request === statusSequence.current) setSyncStatus(status);
    } catch (cause) {
      if (mounted.current && request === statusSequence.current) setError(cause.message);
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current += 1; statusSequence.current += 1; };
  }, []);

  useEffect(() => {
    if (!supported || !open) return undefined;
    void refresh();
    void refreshStatus();
    const changed = () => { setPlan(null); void refresh(); void refreshStatus(); };
    const onFocus = () => { if (!document.hidden) changed(); };
    window.addEventListener("freeflow:workspace-files-changed", changed);
    window.addEventListener("freeflow:github-sync-status", refreshStatus);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      sequence.current += 1;
      statusSequence.current += 1;
      window.removeEventListener("freeflow:workspace-files-changed", changed);
      window.removeEventListener("freeflow:github-sync-status", refreshStatus);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [supported, open, bridge]);

  useEffect(() => {
    if (open && supported) { setPlan(null); void refresh(); }
  }, [currentPath, snapshot?.boardLastSavedAt, snapshot?.boardAutosaveAt]);

  useEffect(() => {
    if (!currentPath) return;
    setRecent((previous) => {
      const next = [{ filePath: currentPath, name: snapshot.boardFileName, openedAt: Date.now() }, ...previous.filter((entry) => entry.filePath !== currentPath)].slice(0, 12);
      try { localStorage.setItem("freeflow.canvas.chrome.recentBoards", JSON.stringify(next)); } catch {}
      return next;
    });
  }, [currentPath]);

  useEffect(() => {
    try { localStorage.setItem("freeflow.canvas.chrome.recentBoards", JSON.stringify(recent)); } catch {}
  }, [recent]);

  useEffect(() => {
    const shell = globalThis.desktopShell;
    if (!open || !folder || !shell?.watchCanvasWorkspace) return undefined;
    let active = true;
    const unsubscribe = shell.onCanvasWorkspaceChanged?.((detail) => {
      if (detail.folderPath !== folder) return;
      if (detail.error) setError(detail.error);
      void refresh(folder);
    });
    void shell.watchCanvasWorkspace({ folderPath: folder }).then((result) => { if (active && !result?.ok) setError(result?.error || "无法监听文件夹"); }).catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; unsubscribe?.(); void shell.watchCanvasWorkspace({ folderPath: "" }).catch(() => {}); };
  }, [open, folder]);

  useEffect(() => {
    if (!(pending || deleteTarget)) return undefined;
    returnFocusRef.current = document.activeElement;
    switchDialogRef.current?.querySelector("button")?.focus();
    const trap = (event) => {
      if (event.key !== "Tab") return;
      event.stopPropagation();
      const buttons = Array.from(switchDialogRef.current?.querySelectorAll("button:not(:disabled)") || []);
      const next = event.shiftKey ? buttons[buttons.length - 1] : buttons[0];
      if (document.activeElement === (event.shiftKey ? buttons[0] : buttons[buttons.length - 1]) || !switchDialogRef.current?.contains(document.activeElement)) { event.preventDefault(); next?.focus(); }
    };
    window.addEventListener("keydown", trap, true);
    return () => { window.removeEventListener("keydown", trap, true); returnFocusRef.current?.focus?.({ preventScroll: true }); };
  }, [Boolean(pending || deleteTarget)]);

  useEffect(() => {
    if (openRequest) toggle(true);
  }, [openRequest]);

  useEffect(() => {
    if (!supported) return undefined;
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "p") return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      toggle(true);
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [supported]);

  useEffect(() => {
    if (!menu) return undefined;
    menuRef.current?.querySelector("button:not(:disabled)")?.focus();
    const close = (event) => {
      if (!event.target.closest?.(".canvas2d-workspace-menu, [data-workspace-more]")) setMenu(null);
    };
    const key = (event) => {
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        event.stopPropagation(); setMenu(null); menuReturnFocusRef.current?.focus();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const buttons = Array.from(menuRef.current?.querySelectorAll("button:not(:disabled)") || []);
        const index = buttons.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("pointerdown", close, true); window.removeEventListener("keydown", key, true); };
  }, [menu]);

  const displayed = view === "recent" ? recent : boards;
  const sorted = useMemo(() => displayed.filter((board) => displayName(board.name).toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => {
    if (view === "recent") return Number(b.openedAt || 0) - Number(a.openedAt || 0);
    if (sort === "name") return a.name.localeCompare(b.name, "zh-CN-u-kn-true");
    return Number(b.modifiedAt || 0) - Number(a.modifiedAt || 0) || a.name.localeCompare(b.name);
  }), [displayed, query, sort, view]);
  const syncByPath = new Map((plan?.items || []).map((item) => [item.localPath, item.state]));
  const ledger = Object.values(syncStatus?.ledger?.boards || {});
  const boardState = (path) => syncByPath.get(path) || ledger.find((entry) => entry.localPath === path)?.syncState || "";

  async function run(action, task) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    setError("");
    setNotice("");
    setMenu(null);
    try { await task(); return true; }
    catch (cause) { if (mounted.current) setError(cause.message || "操作失败"); return false; }
    finally { busyRef.current = false; if (mounted.current) setBusy(""); }
  }

  async function executeSwitch(target, saveBeforeSwitch) {
    await run(target.kind, async () => {
      if (target.kind === "open") {
        const loaded = await bridge.openBoardAtPath(target.path, { saveBeforeSwitch });
        if (!loaded) {
          setFailedPath(target.path);
          throw new Error(currentRef.current?.statusText || "画布无法打开，原画布已保留");
        }
        setFailedPath("");
      } else {
        const result = await bridge.createBoardInWorkspace(folder, target.name, { saveBeforeSwitch });
        if (!result?.ok) throw new Error(result?.error || "新建失败");
        setEditor(null);
        setQuery("");
      }
      setPending(null);
      await refresh();
    });
  }

  function requestSwitch(target) {
    if (busyRef.current || pending || (target.kind === "open" && target.path === currentPath && !target.reload)) return;
    if (currentRef.current?.boardDirty || currentRef.current?.editingId) setPending(target);
    else void executeSwitch(target, true);
  }

  async function confirmSwitch(choice) {
    if (choice === "cancel") { setPending(null); setError(""); return; }
    if (!pending) return;
    if (choice === "save") {
      const saved = await run("save", async () => {
        const saved = currentRef.current?.boardFileReloadRequired ? await bridge.saveBoardAs() : await bridge.saveBoard({ exactPath: true });
        if (!saved) throw new Error("当前画布保存失败，已停止切换");
        if (bridge.getSnapshot()?.boardDirty) throw new Error("保存期间还有新修改，已停止切换，请重试");
      });
      if (!saved) return;
    }
    void executeSwitch(pending, false);
  }

  function openMenu(event, board) {
    event.preventDefault();
    event.stopPropagation();
    if (busyRef.current || !board.filePath) return;
    menuReturnFocusRef.current = event.currentTarget;
    const boundary = rootRef.current.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ board, x: Math.max(boundary.left + 8, Math.min(rect.right - 170, window.innerWidth - 182)), y: Math.min(rect.bottom + 4, window.innerHeight - 215) });
  }

  async function commitEditor(event) {
    event.preventDefault();
    if (!editor) return;
    if (editor.kind === "create") {
      if (!editor.name.trim() || /[\\/:"*?<>|]/.test(editor.name)) { setError("名称不能为空或包含路径符号"); return; }
      requestSwitch({ kind: "create", name: editor.name }); return;
    }
    await run("rename", async () => {
      const clean = editor.name.trim().replace(/\.(freeflow|json)$/i, "");
      if (!clean || /[\\/:"*?<>|]/.test(clean)) throw new Error("名称不能为空或包含路径符号");
      const result = await bridge.renameBoardAtPath(editor.path, `${clean}.freeflow`);
      if (!result?.ok) throw new Error(result?.error || "重命名失败");
      setRecent((previous) => previous.map((entry) => entry.filePath === editor.path ? { ...entry, filePath: result.filePath, name: `${clean}.freeflow` } : entry).filter((entry, index, entries) => entries.findIndex((candidate) => candidate.filePath === entry.filePath) === index));
      setEditor(null);
      await refresh();
    });
  }

  async function sync(action) {
    await run(action, async () => {
      if (!folder) throw new Error("请先打开工作区");
      const path = currentRef.current?.boardFilePath || "";
      const payload = { rootPath: folder, boardPath: path };
      if (action === "check") {
        const result = await bridge.withBoardFileOperation(() => syncClient.planWorkspace(payload));
        if (result?.ok === false) throw new Error(result.error || "检查失败");
        setPlan(result);
        setNotice(`已检查 ${result.total || result.items?.length || 0} 个画布`);
        return;
      }
      const result = await bridge.withBoardFileOperation(() => action === "pull" ? syncClient.pullWorkspace(payload) : syncClient.syncWorkspace(payload));
      if (result?.ok === false) throw new Error(result.error || "同步失败");
      window.dispatchEvent(new CustomEvent("freeflow:workspace-files-changed", { detail: result }));
      setPlan(result.refreshed || null);
      const failures = (result.results || []).filter((item) => item.error);
      if (failures.length) setError(`${failures.length} 个画布未完成：${failures[0].error}`);
      else {
        const conflicts = Number(result.counts?.["both-changed"] || 0) + Number(result.counts?.["path-collision"] || 0) + Number(result.counts?.conflict || 0);
        setNotice(conflicts ? `${conflicts} 个画布需要在 GitHub 设置中处理冲突` : action === "pull" ? "拉取完成，画布列表已更新" : "上传完成");
      }
      await refresh();
      await refreshStatus();
    });
  }

  if (!supported) return children;
  const modal = pending || deleteTarget;
  return (
    <aside ref={rootRef} className={`canvas2d-workspace-panel${open ? " is-open" : " is-collapsed"}`} style={{ "--workspace-width": `${width}px` }} aria-label="画布工作区" aria-busy={Boolean(busy)}>
      {!open ? <div className="canvas2d-workspace-rail">
        <IconButton label="展开画布工作区" onClick={() => toggle(true)}><PanelLeft size={18} /></IconButton>
        <IconButton label="展开当前画布目录" onClick={() => { toggle(true); onShowDirectory?.(); }}><ListTree size={18} /></IconButton>
      </div> : null}
      <div className="canvas2d-workspace-files">
        <header className="canvas2d-workspace-head"><strong>工作区</strong><div>
          <IconButton label="新建画布" disabled={Boolean(busy) || !folder} onClick={() => { setEditor({ kind: "create", name: "" }); setMenu(null); }}><FilePlus2 size={17} /></IconButton>
          <IconButton label="收起画布工作区" onClick={() => toggle(false)}><ChevronLeft size={17} /></IconButton>
        </div></header>
        <div className="canvas2d-workspace-folder"><button type="button" title={folder || "打开工作区文件夹"} disabled={Boolean(busy)} onClick={() => run("folder", async () => { const next = await bridge.pickCanvasWorkspaceFolder(); if (next) { setQuery(""); setPlan(null); await refresh(next); } })}><FolderOpen size={17} /><span>{folderName(folder)}</span></button><IconButton label="刷新画布列表" disabled={loading || Boolean(busy)} onClick={() => run("refresh", async () => { await refresh(); await refreshStatus(); })}><RefreshCw size={15} /></IconButton></div>
        <div className="canvas2d-workspace-current"><div><span>当前画布</span><strong title={currentPath}>{currentName}</strong><small>{snapshot?.boardDirty ? "未保存" : "已保存"}{folder && !boards.some((board) => board.filePath === currentPath) ? " · 工作区外" : ""}</small></div><IconButton label="保存当前画布" disabled={Boolean(busy)} onClick={() => run("save", async () => { if (!(await bridge.saveBoard({ exactPath: true }))) throw new Error("保存失败"); await refresh(); })}><Save size={16} /></IconButton><IconButton label="当前画布操作" data-workspace-more disabled={Boolean(busy)} onClick={(event) => openMenu(event, { name: snapshot?.boardFileName, filePath: currentPath })}><MoreHorizontal size={17} /></IconButton></div>
        <label className="canvas2d-workspace-search"><Search size={15} /><input ref={searchRef} aria-label="搜索画布" placeholder="搜索画布" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { setQuery(""); event.currentTarget.blur(); } if (event.key === "Enter" && sorted[0]) requestSwitch({ kind: "open", path: sorted[0].filePath }); }} /></label>
        <div className="canvas2d-workspace-views" role="tablist" aria-label="画布列表视图"><button role="tab" aria-selected={view === "workspace"} onClick={() => { setView("workspace"); setQuery(""); }}>工作区</button><button role="tab" aria-selected={view === "recent"} onClick={() => { setView("recent"); setQuery(""); }}>最近打开</button></div>
        <div className="canvas2d-workspace-list-head"><span>{loading ? "正在读取…" : `${displayed.length} 个画布`}</span>{view === "workspace" ? <select aria-label="画布排序" value={sort} onChange={(event) => setSort(event.target.value)}><option value="modified">最近修改</option><option value="name">名称</option></select> : null}</div>
        {editor ? <form className="canvas2d-workspace-editor" onSubmit={commitEditor}><input aria-label={editor.kind === "create" ? "新画布名称" : "重命名画布"} autoFocus placeholder="画布名称" value={editor.name} disabled={Boolean(busy)} onChange={(event) => setEditor({ ...editor, name: event.target.value })} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") setEditor(null); }} /><button type="submit" disabled={Boolean(busy)}>{editor.kind === "create" ? "新建" : "确认"}</button><IconButton label="取消编辑" onClick={() => setEditor(null)}><X size={15} /></IconButton></form> : null}
        <div className="canvas2d-workspace-list" aria-label="工作区画布列表">
          {sorted.map((board) => <div key={board.filePath} className={`canvas2d-workspace-row${board.filePath === currentPath ? " is-current" : ""}`} onContextMenu={(event) => openMenu(event, board)}>
            <button type="button" className="canvas2d-workspace-open" aria-current={board.filePath === currentPath ? "page" : undefined} title={board.filePath} disabled={Boolean(busy) || Boolean(pending)} onClick={() => requestSwitch({ kind: "open", path: board.filePath })}><span>{displayName(board.name)}</span><small>{board.filePath === currentPath ? snapshot?.boardDirty ? "未保存" : "当前" : stateLabels[boardState(board.filePath)] || ""}</small></button>
            <IconButton label={`画布操作：${displayName(board.name)}`} data-workspace-more disabled={Boolean(busy)} onClick={(event) => openMenu(event, board)}><MoreHorizontal size={15} /></IconButton>
          </div>)}
          {!sorted.length && !loading ? <div className="canvas2d-workspace-empty">{query ? "没有匹配的画布" : folder ? "工作区暂无画布" : "未选择工作区"}</div> : null}
        </div>
        {failedPath ? <button type="button" className="canvas2d-workspace-repair" disabled={Boolean(busy)} onClick={() => run("repair", async () => { const result = await bridge.repairBoardAtPath(failedPath); if (!result?.ok) throw new Error(result?.error || "修复失败"); setNotice("已生成修复副本"); setFailedPath(""); await refresh(); })}>生成修复副本</button> : null}
        {folder && currentPath && !boards.some((board) => board.filePath === currentPath) && currentPath.replace(/[\\/][^\\/]+$/, "") === folder && !loading ? <div className="canvas2d-workspace-error" role="status">当前文件已从工作区移除，内存内容已保留，请另存为。</div> : null}
        {snapshot?.boardFileReloadRequired ? <button type="button" className="canvas2d-workspace-repair" disabled={Boolean(busy)} onClick={() => requestSwitch({ kind: "open", path: currentPath, reload: true })}>重新载入当前画布</button> : null}
        <div className="canvas2d-workspace-sync"><div><Cloud size={15} /><span title={syncStatus?.repository?.owner ? `${syncStatus.repository.owner}/${syncStatus.repository.repo}` : ""}>{busy === "pull" ? "正在拉取" : busy === "upload" ? "正在上传" : syncStatus?.connected ? syncStatus.repository?.repo || "未绑定仓库" : "未连接 GitHub"}</span><IconButton label="GitHub 同步设置" onClick={() => window.dispatchEvent(new CustomEvent("freeflow:open-settings", { detail: { section: "github" } }))}><Settings size={15} /></IconButton></div>{syncStatus?.connected && syncStatus.repository?.repo ? <div className="canvas2d-workspace-sync-actions"><button type="button" disabled={Boolean(busy) || !folder} onClick={() => sync("check")}>检查更新</button><button type="button" disabled={Boolean(busy) || !folder} onClick={() => sync("pull")}>拉取</button><button type="button" disabled={Boolean(busy) || !folder} onClick={() => sync("upload")}>上传</button></div> : null}</div>
        {notice ? <div className="canvas2d-workspace-notice" role="status">{notice}</div> : null}
        {error ? <div className="canvas2d-workspace-error" role="alert">{error}</div> : null}
      </div>
      <div className="canvas2d-workspace-directory">{children}</div>
      {open ? <div className="canvas2d-workspace-resizer" role="separator" aria-label="调整工作区宽度" aria-orientation="vertical" aria-valuemin={260} aria-valuemax={360} aria-valuenow={width} tabIndex={0} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); const next = Math.min(360, Math.max(260, width + (event.key === "ArrowLeft" ? -10 : 10))); setWidth(next); try { localStorage.setItem("freeflow.canvas.chrome.workspaceWidth", next); } catch {} } }} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const left = rootRef.current.getBoundingClientRect().left; setWidth(Math.min(360, Math.max(260, event.clientX - left))); }} onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); try { localStorage.setItem("freeflow.canvas.chrome.workspaceWidth", width); } catch {} }} /> : null}
      {menu ? createPortal(<div ref={menuRef} className="canvas2d-workspace-menu" role="menu" data-shape-include="true" style={{ left: menu.x, top: menu.y }}>
        <button role="menuitem" onClick={() => run("duplicate", async () => { const result = await bridge.duplicateBoardAtPath(menu.board.filePath); if (!result?.ok) throw new Error(result?.error || "复制失败"); setNotice("已创建独立画布副本"); setView("workspace"); await refresh(); })}>复制画布</button>
        <button role="menuitem" onClick={() => { setEditor({ kind: "rename", path: menu.board.filePath, name: displayName(menu.board.name) }); setMenu(null); }}>重命名</button>
        <button role="menuitem" onClick={() => { bridge.revealBoardPathInFolder(menu.board.filePath); setMenu(null); }}>显示文件位置</button>
        {menu.board.filePath === currentPath ? <button role="menuitem" onClick={() => run("save-as", async () => { if (await bridge.saveBoardAs()) { await refresh(); setNotice("已另存为新文件"); } })}>另存为…</button> : null}
        <button role="menuitem" disabled={menu.board.filePath === currentPath} onClick={() => { setDeleteTarget(menu.board); setMenu(null); }}>删除画布</button>
      </div>, portalHost) : null}
      {modal ? createPortal(<div className="canvas2d-workspace-confirm-backdrop" data-shape-include="true"><section ref={switchDialogRef} className="canvas2d-workspace-confirm" role="alertdialog" aria-modal="true" aria-label={pending ? "切换前保存画布" : "删除画布确认"} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape" && !busy) { setPending(null); setDeleteTarget(null); } }}>
        <strong>{pending ? `「${currentName}」有未保存内容` : `删除「${displayName(deleteTarget.name)}」？`}</strong><p>{pending ? snapshot?.boardFileReloadRequired ? "磁盘已有新版本，保存会另存本次修改，再载入磁盘版本。" : "保存后切换，或放弃本次未保存修改。" : "删除后无法撤销，远程副本不会自动删除。"}</p>
        {error ? <div role="alert" className="canvas2d-workspace-error">{error}</div> : null}
        <div><button autoFocus type="button" disabled={Boolean(busy)} onClick={() => { setPending(null); setDeleteTarget(null); setError(""); }}>取消</button>{pending ? <><button type="button" disabled={Boolean(busy)} onClick={() => confirmSwitch("discard")}>放弃并切换</button><button type="button" disabled={Boolean(busy)} onClick={() => confirmSwitch("save")}>保存并切换</button></> : <button type="button" disabled={Boolean(busy)} onClick={() => run("delete", async () => { const result = await bridge.deleteBoardAtPath(deleteTarget.filePath); if (!result?.ok) throw new Error(result?.error || "删除失败"); setRecent((previous) => previous.filter((entry) => entry.filePath !== deleteTarget.filePath)); setDeleteTarget(null); await refresh(); })}>删除</button>}</div>
      </section></div>, portalHost) : null}
    </aside>
  );
}
