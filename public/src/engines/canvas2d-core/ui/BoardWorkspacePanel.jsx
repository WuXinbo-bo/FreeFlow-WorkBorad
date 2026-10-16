import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "../../../ui/icons/AppIcon.jsx";
import { readChromePreference, writeChromePreference } from "./chromePreferences.js";
import { CanvasRecoveryDialog } from "./CanvasRecoveryDialog.jsx";
import { boardSyncLabel, summarizeSyncPlan } from "../workspace/syncPresentation.js";
import { getQuickSwitchBoards } from "../workspace/quickSwitch.js";
import { runGithubSyncOperation, githubSyncResultWarning } from "../../../runtime/githubSyncRecovery.js";

const displayName = (value) => String(value || "未命名画布").replace(/\.(freeflow|json)$/i, "");
const folderName = (value) => String(value || "").replace(/\\/g, "/").split("/").filter(Boolean).pop() || "未选择工作区";

function IconButton({ label, children, ...props }) {
  return <button type="button" className="canvas2d-workspace-icon" title={label} aria-label={label} {...props}>{children}</button>;
}

export function BoardWorkspacePanel({ bridge, snapshot, openRequest = 0, width = 288, onWidthChange }) {
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
  const [recovery, setRecovery] = useState(null);
  const [failedPath, setFailedPath] = useState("");
  const [syncStatus, setSyncStatus] = useState(null);
  const [plan, setPlan] = useState(null);
  const [planStale, setPlanStale] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [syncExpanded, setSyncExpanded] = useState(false);
  const [syncPending, setSyncPending] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const folderRef = useRef("");
  const searchRef = useRef(null);
  const sequence = useRef(0);
  const statusSequence = useRef(0);
  const repositoryKey = useRef("");
  const busyRef = useRef(false);
  const quickSwitchRef = useRef(null);
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
  const operationReturnFocusRef = useRef(null);
  const portalHost = document.getElementById("global-overlay-layer") || document.body;

  const toggle = (next) => {
    setOpen(next);
    if (!next) setSyncExpanded(false);
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
      if (status?.ok === false) throw new Error(status.error || "读取同步状态失败");
      if (mounted.current && request === statusSequence.current) {
        const key = `${Boolean(status.connected)}:${status.repository?.owner || ""}/${status.repository?.repo || ""}:${status.repository?.branch || ""}`;
        if (key !== repositoryKey.current) {
          repositoryKey.current = key; setPlan(null); setPlanStale(false); setSyncExpanded(false); setSyncError(""); setNotice("");
        }
        setStatusError("");
        setSyncStatus(status);
      }
    } catch (cause) {
      if (mounted.current && request === statusSequence.current) { setStatusError(cause.message); setPlanStale(true); }
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
    const changed = () => { setPlanStale(true); void refresh(); void refreshStatus(); };
    const onFocus = () => { if (!document.hidden) changed(); };
    const remoteChanged = (event) => {
      if (repositoryKey.current !== `true:${event.detail?.repositoryKey}`) return;
      setPlanStale(true);
      setNotice("远端有更新，检查差异后可拉取");
    };
    window.addEventListener("freeflow:workspace-files-changed", changed);
    window.addEventListener("freeflow:github-sync-status", refreshStatus);
    window.addEventListener("focus", onFocus);
    window.addEventListener("freeflow:github-remote-update", remoteChanged);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      sequence.current += 1;
      window.removeEventListener("freeflow:github-remote-update", remoteChanged);
      statusSequence.current += 1;
      window.removeEventListener("freeflow:workspace-files-changed", changed);
      window.removeEventListener("freeflow:github-sync-status", refreshStatus);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [supported, open, bridge]);

  useEffect(() => {
    if (open && supported) { setPlanStale(true); void refresh(); }
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
      setPlanStale(true);
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

  useLayoutEffect(() => {
    if (open && openRequest) searchRef.current?.focus({ preventScroll: true });
  }, [open, openRequest]);

  function restoreOperationFocus() {
    const trigger = operationReturnFocusRef.current;
    if (busyRef.current || trigger?.disabled) return;
    operationReturnFocusRef.current = null;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }

  useLayoutEffect(() => { if (!busy) restoreOperationFocus(); }, [busy, loading]);

  useEffect(() => {
    if (!supported) return undefined;
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing || event.repeat || event.key.toLowerCase() !== "p") return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      setQuery(""); setView("workspace"); setActiveIndex(-1);
      toggle(true);
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [supported]);

  useEffect(() => {
    if (!supported) return undefined;
    const switchPrevious = (event) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "o" || event.altKey || event.isComposing || event.repeat || document.querySelector('[aria-modal="true"]')) return;
      const previous = quickSwitchRef.current?.previous;
      if (!previous) return;
      event.preventDefault(); event.stopPropagation();
      quickSwitchRef.current.request({ kind: "open", path: previous.filePath });
    };
    window.addEventListener("keydown", switchPrevious, true);
    return () => window.removeEventListener("keydown", switchPrevious, true);
  }, [supported]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const node = menuRef.current;
    const rect = node.getBoundingClientRect();
    node.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`;
    node.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`;
  }, [menu]);

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
  const sorted = useMemo(() => getQuickSwitchBoards(boards, recent, query, view, sort), [boards, recent, query, sort, view]);
  const visibleCount = query ? sorted.length : displayed.length;
  useEffect(() => { setActiveIndex(-1); }, [query, view, sort]);
  const syncByPath = new Map((plan?.items || []).map((item) => [item.localPath, item.state]));
  const ledger = Object.values(syncStatus?.ledger?.boards || {}).filter((entry) => String(entry.localPath || "").replace(/[\\/][^\\/]+$/, "") === folder);
  const connected = Boolean(syncStatus?.connected && syncStatus.repository?.owner && syncStatus.repository?.repo);
  const stateStale = planStale || Boolean(snapshot?.boardDirty || snapshot?.editingId);
  const boardLabel = (path) => {
    const entry = ledger.find((entry) => entry.localPath === path);
    const modified = boards.find((board) => board.filePath === path)?.modifiedAt || 0;
    const synced = Date.parse(entry?.updatedAt || "") || 0;
    return boardSyncLabel({ state: syncByPath.get(path) || entry?.syncState || "", cached: !plan || stateStale, changed: (!plan || stateStale) && synced > 0 && modified > synced, connected, dirty: path === currentPath && Boolean(snapshot?.boardDirty || snapshot?.editingId), reloadRequired: path === currentPath && snapshot?.boardFileReloadRequired });
  };
  const syncCounts = summarizeSyncPlan(plan);
  const lastSyncedAt = Math.max(0, ...ledger.map((entry) => Date.parse(entry.updatedAt || entry.lastSyncedAt || "") || 0));
  const showSyncDetails = syncExpanded || Boolean(syncError || statusError || syncCounts.upload || syncCounts.pull || syncCounts.conflict || syncCounts.deleted || ["pull", "upload"].includes(busy));
  const previousBoard = recent.find((entry) => entry.filePath !== currentPath);

  function moveSearchSelection(event) {
    if (!["ArrowDown", "ArrowUp"].includes(event.key) || !sorted.length) return;
    event.preventDefault(); event.stopPropagation();
    const next = activeIndex < 0 ? event.key === "ArrowUp" ? sorted.length - 1 : 0 : (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + sorted.length) % sorted.length;
    setActiveIndex(next);
    rootRef.current?.querySelectorAll(".canvas2d-workspace-row")[next]?.scrollIntoView({ block: "nearest" });
  }

  async function run(action, task) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    setError("");
    setNotice("");
    setMenu(null);
    try { await task(); return true; }
    catch (cause) {
      if (mounted.current) {
        if (["check", "pull", "upload"].includes(action)) setSyncError(cause.message || "同步未完成，本地内容已保留");
        else setError(cause.message || "操作失败");
      }
      return false;
    }
    finally { busyRef.current = false; if (mounted.current) setBusy(""); }
  }

  async function chooseWorkspaceFolder(trigger) {
    operationReturnFocusRef.current = trigger;
    await run("folder", async () => {
      const next = await bridge.pickCanvasWorkspaceFolder();
      if (next) { setQuery(""); setPlan(null); await refresh(next); }
    });
    restoreOperationFocus();
  }

  async function saveCurrentBoard(trigger) {
    operationReturnFocusRef.current = trigger;
    await run("save", async () => {
      if (!(await bridge.saveBoard({ exactPath: true }))) throw new Error("保存失败");
      await refresh();
    });
    restoreOperationFocus();
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
  quickSwitchRef.current = { previous: previousBoard, request: requestSwitch };

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
    setMenu({ board, x: Math.max(boundary.left + 8, Math.min(rect.right - 170, window.innerWidth - 182)), y: rect.bottom + 4 });
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
    setSyncError("");
    await run(action, async () => {
      if (!folder) throw new Error("请先打开工作区");
      const key = repositoryKey.current;
      const isCurrent = () => mounted.current && key === repositoryKey.current && folder === folderRef.current;
      const perform = task => bridge.withBoardFileOperation(() => runGithubSyncOperation(task, {
        client: syncClient,
        onPending(operation) {
          if (!isCurrent()) return;
          setSyncPending(operation);
          if (operation?.phase !== "interrupted") setNotice(operation ? "正在确认同步结果，请勿重复操作" : "");
        },
        onQueryError(cause) { if (isCurrent()) setStatusError(`尚未确认同步结果：${cause.message}。正在继续查询原任务。`); },
      }));
      try {
        const path = currentRef.current?.boardFilePath || "";
        const payload = { rootPath: folder, boardPath: path };
        if (action === "check") {
          const result = await perform(() => syncClient.planWorkspace(payload));
          if (!isCurrent()) return;
          if (result?.ok === false) throw new Error(result.error || "检查失败");
          setSyncPending(null);
          setPlan({ ...result, checkedAt: result.checkedAt || Date.now() }); setPlanStale(false);
          setNotice(`已检查 ${result.total || result.items?.length || 0} 个画布`);
          await refreshStatus();
          return;
        }
        const result = await perform(() => action === "pull" ? syncClient.pullWorkspace(payload) : syncClient.syncWorkspace(payload));
        if (!isCurrent()) return;
        if (result?.ok === false) throw new Error(result.error || "同步失败");
        window.dispatchEvent(new CustomEvent("freeflow:workspace-files-changed", { detail: result }));
        setPlan(result.refreshed ? { ...result.refreshed, checkedAt: result.refreshed.checkedAt || Date.now() } : null); setPlanStale(false);
        const failures = (result.results || []).filter((item) => item.error);
        if (failures.length) { setSyncError(`${failures.length} 个画布未完成：${failures[0].error}。可以重新检查后重试。`); }
        else {
          const conflicts = Number(result.counts?.["both-changed"] || 0) + Number(result.counts?.["path-collision"] || 0) + Number(result.counts?.conflict || 0);
          setNotice(conflicts ? `${conflicts} 个画布需要在 GitHub 设置中处理冲突` : action === "pull" ? "拉取完成，画布列表已更新" : "上传完成");
        }
        const warning = githubSyncResultWarning(result);
        if (warning) setSyncError(warning);
        await refresh();
        await refreshStatus();
      } catch (cause) {
        if (cause?.localChanged) window.dispatchEvent(new CustomEvent("freeflow:workspace-files-changed", { detail: cause }));
        if (isCurrent()) {
          if (["SYNC_OPERATION_INTERRUPTED", "COMMIT_CONFIRMED_RECHECK", "COMMIT_NOT_PUBLISHED_RECHECK"].includes(cause.code)) cause.message += " 请重新检查同步，或到 GitHub 设置检查当前文件夹。";
          throw cause;
        }
      }
    }).then((ok) => { if (!ok) setPlanStale(true); });
  }

  async function openRecovery(kind, board = null) {
    setMenu(null);
    await run("recovery", async () => {
      const target = board?.filePath || currentPath;
      if (kind === "history") {
        const result = await bridge.listCanvasHistory(target);
        if (!result?.ok) throw new Error(result?.error || "读取历史失败");
        setRecovery({ kind, target, entries: result.entries || [] });
        return;
      }
      const result = await bridge.listCanvasTrash(folder);
      if (!result?.ok) throw new Error(result?.error || "读取回收站失败");
      setRecovery({ kind, target: folder, entries: result.items || [] });
    });
  }

  async function restoreRecovery(entry) {
    await run("restore", async () => {
      const result = recovery.kind === "history"
        ? await bridge.restoreCanvasHistory(recovery.target, entry.id)
        : await bridge.restoreCanvasTrash(recovery.target, entry);
      if (!result?.ok) throw new Error(result?.error || "恢复失败");
      setRecovery(null);
      window.dispatchEvent(new CustomEvent("freeflow:workspace-files-changed", { detail: result }));
      setNotice(result.renamed ? "画布已恢复并自动改名，原同名文件已保留" : "恢复完成");
      await refresh();
    });
  }

  if (!supported) return null;
  const modal = pending || deleteTarget;
  return (
    <aside ref={rootRef} className={`canvas2d-workspace-panel${open ? " is-open" : " is-collapsed"}`} aria-label="画布工作区" aria-busy={Boolean(busy)}>
      {!open ? <div className="canvas2d-workspace-rail">
        <strong>工作区</strong>
        <IconButton label="展开画布工作区" aria-expanded={false} onClick={() => toggle(true)}><AppIcon name="folder" size={18} /></IconButton>
      </div> : null}
      <div className="canvas2d-workspace-files">
        <header className="canvas2d-workspace-head"><strong>工作区</strong><div>
          <IconButton label="打开回收站" disabled={Boolean(busy) || !folder} onClick={() => openRecovery("trash")}><AppIcon name="trash-2" size={16} /></IconButton>
          <IconButton label="新建画布" disabled={Boolean(busy) || !folder} onClick={() => { setEditor({ kind: "create", name: "" }); setMenu(null); }}><AppIcon name="file-plus-2" size={16} /></IconButton>
          <IconButton label="收起画布工作区" onClick={() => toggle(false)}><AppIcon name="chevron-left" size={16} /></IconButton>
        </div></header>
        <div className="canvas2d-workspace-folder"><button type="button" title={folder || "打开工作区文件夹"} disabled={Boolean(busy)} onClick={(event) => chooseWorkspaceFolder(event.currentTarget)}><AppIcon name="folder-open" size={16} /><span>{folderName(folder)}</span></button><button type="button" className="canvas2d-workspace-folder-switch" aria-label="切换工作区" title="选择其他工作区文件夹" disabled={Boolean(busy)} onClick={(event) => chooseWorkspaceFolder(event.currentTarget)}>切换</button><IconButton label="刷新画布列表" disabled={loading || Boolean(busy)} onClick={() => run("refresh", async () => { await refresh(); await refreshStatus(); })}><AppIcon name="refresh-cw" size={16} /></IconButton></div>
        {snapshot?.boardSaveError && <div className="canvas2d-workspace-error" role="alert">保存失败：{snapshot.boardSaveError}。请重试保存或另存为，修改仍保留在内存。</div>}
        <label className="canvas2d-workspace-search"><AppIcon name="search" size={16} /><input ref={searchRef} aria-label="搜索画布" aria-controls="freeflow-workspace-board-list" aria-activedescendant={activeIndex >= 0 && sorted[activeIndex] ? `freeflow-workspace-board-${activeIndex}` : undefined} placeholder="搜索画布 · ⌘/Ctrl P" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; moveSearchSelection(event); if (event.key === "Escape") { setQuery(""); setActiveIndex(-1); event.currentTarget.blur(); } const selected = sorted[Math.max(0, activeIndex)]; if (event.key === "Enter" && selected) { event.preventDefault(); requestSwitch({ kind: "open", path: selected.filePath }); } }} /></label>
        <div className="canvas2d-workspace-list-head"><div className="canvas2d-workspace-views" role="tablist" aria-label="画布列表视图"><button role="tab" aria-selected={view === "workspace"} onClick={() => { setView("workspace"); setQuery(""); }}>工作区</button><button role="tab" aria-selected={view === "recent"} onClick={() => { setView("recent"); setQuery(""); }}>最近打开</button></div><span title={`${visibleCount} 个画布`}>{loading ? "读取中…" : `${visibleCount}${width < 300 && visibleCount >= 1000 ? "" : " 个画布"}`}</span>{view === "workspace" ? <select aria-label="画布排序" value={sort} onChange={(event) => setSort(event.target.value)}><option value="modified">最近修改</option><option value="name">名称</option></select> : null}</div>
        {editor ? <form className="canvas2d-workspace-editor" onSubmit={commitEditor}><input aria-label={editor.kind === "create" ? "新画布名称" : "重命名画布"} autoFocus placeholder="画布名称" value={editor.name} disabled={Boolean(busy)} onChange={(event) => setEditor({ ...editor, name: event.target.value })} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") setEditor(null); }} /><button type="submit" disabled={Boolean(busy)}>{editor.kind === "create" ? "新建" : "确认"}</button><IconButton label="取消编辑" onClick={() => setEditor(null)}><AppIcon name="x" size={16} /></IconButton></form> : null}
        <div id="freeflow-workspace-board-list" className="canvas2d-workspace-list" aria-label="工作区画布列表">
          {sorted.map((board, index) => <div id={`freeflow-workspace-board-${index}`} key={board.filePath} className={`canvas2d-workspace-row${board.filePath === currentPath ? " is-current" : ""}${index === activeIndex ? " is-keyboard-selected" : ""}`} onContextMenu={(event) => openMenu(event, board)}>
            <button type="button" className="canvas2d-workspace-open" aria-current={board.filePath === currentPath ? "page" : undefined} title={board.filePath} disabled={Boolean(busy) || Boolean(pending)} onClick={() => requestSwitch({ kind: "open", path: board.filePath })}><span className="canvas2d-workspace-board-copy"><span>{displayName(board.name)}</span>{board.filePath === currentPath && snapshot?.boardSaveError ? <small>保存失败</small> : !["仅本地", "尚未检查"].includes(boardLabel(board.filePath)) ? <small>{boardLabel(board.filePath)}</small> : null}</span></button>
            {board.filePath === currentPath ? <IconButton label="保存当前画布" disabled={Boolean(busy)} onClick={(event) => saveCurrentBoard(event.currentTarget)}><AppIcon name="save" size={14} /></IconButton> : null}
            <IconButton label={`画布操作：${displayName(board.name)}`} data-workspace-more disabled={Boolean(busy)} onClick={(event) => openMenu(event, board)}><AppIcon name="ellipsis" size={16} /></IconButton>
          </div>)}
          {!sorted.length && !loading ? <div className="canvas2d-workspace-empty">{query ? "没有匹配的画布" : folder ? "工作区暂无画布" : "未选择工作区"}</div> : null}
        </div>
        {failedPath ? <button type="button" className="canvas2d-workspace-repair" disabled={Boolean(busy)} onClick={() => run("repair", async () => { const result = await bridge.repairBoardAtPath(failedPath); if (!result?.ok) throw new Error(result?.error || "修复失败"); setNotice("已生成修复副本"); setFailedPath(""); await refresh(); })}>生成修复副本</button> : null}
        {folder && currentPath && currentPath.replace(/[\\/][^\\/]+$/, "") !== folder ? <div className="canvas2d-workspace-notice" role="status" title={currentPath}>当前画布「{currentName}」位于工作区外，保存仍使用原位置。</div> : null}
        {folder && currentPath && !boards.some((board) => board.filePath === currentPath) && currentPath.replace(/[\\/][^\\/]+$/, "") === folder && !loading ? <div className="canvas2d-workspace-error" role="status">当前文件已从工作区移除，内存内容已保留，请另存为。</div> : null}
        {snapshot?.boardFileReloadRequired ? <button type="button" className="canvas2d-workspace-repair" disabled={Boolean(busy)} onClick={() => requestSwitch({ kind: "open", path: currentPath, reload: true })}>重新载入当前画布</button> : null}
        {connected ? <div className={`canvas2d-workspace-sync${syncError || statusError || syncCounts.conflict ? " is-warning" : ""}`}>
          <div><AppIcon name="cloud" size={16} /><button type="button" className="canvas2d-workspace-sync-toggle" aria-expanded={showSyncDetails} title={syncStatus?.repository?.owner ? `${syncStatus.repository.owner}/${syncStatus.repository.repo}` : "GitHub 同步"} onClick={() => setSyncExpanded((value) => !value)}>{busy === "check" ? "正在检查…" : busy === "pull" ? "正在拉取…" : busy === "upload" ? "正在上传…" : connected ? syncCounts.conflict ? `有 ${syncCounts.conflict} 个冲突` : stateStale ? "修改后待检查" : plan ? syncCounts.upload || syncCounts.pull ? `待上传 ${syncCounts.upload} · 待拉取 ${syncCounts.pull}` : "检查完成 · 无待同步内容" : "已连接 · 尚未检查" : syncStatus?.connected ? "未绑定仓库" : "未连接 GitHub"}</button>{connected ? <button type="button" className={`canvas2d-workspace-sync-check${busy === "check" ? " is-checking" : ""}`} aria-label="检查同步" title="检查本地与远端差异" disabled={Boolean(busy) || !folder} onClick={() => sync("check")}><AppIcon name="refresh-cw" size={14} />检查</button> : null}<IconButton label="GitHub 同步设置" onClick={() => window.dispatchEvent(new CustomEvent("freeflow:open-settings", { detail: { section: "github" } }))}><AppIcon name="settings" size={16} /></IconButton></div>
          {connected ? <>
            {showSyncDetails && (syncCounts.pull || syncCounts.upload || syncPending || ["pull", "upload"].includes(busy)) ? <div className="canvas2d-workspace-sync-actions"><button type="button" disabled={Boolean(busy) || Boolean(syncPending) || !folder || (plan && !stateStale && !syncCounts.pull)} onClick={() => sync("pull")}>拉取</button><button type="button" disabled={Boolean(busy) || Boolean(syncPending) || !folder || (plan && !stateStale && !syncCounts.upload)} onClick={() => sync("upload")}>上传</button></div> : null}
            {showSyncDetails ? <div className="canvas2d-workspace-sync-details">
              <div className="canvas2d-workspace-sync-summary" role="status">{plan ? `${stateStale ? "上次检查：" : ""}待上传 ${syncCounts.upload} · 待拉取 ${syncCounts.pull}${syncCounts.conflict ? ` · 冲突 ${syncCounts.conflict}` : ""}${syncCounts.deleted ? ` · 远程已删除 ${syncCounts.deleted}` : ""}` : "检查同步后可查看本地与远端差异"}</div>
              {plan?.checkedAt ? <small className="canvas2d-workspace-sync-time">检查于 {new Date(plan.checkedAt).toLocaleString()}{stateStale ? " · 结果可能已变化" : ""}</small> : null}
              {lastSyncedAt ? <small className="canvas2d-workspace-sync-time">上次成功同步 {new Date(lastSyncedAt).toLocaleString()}</small> : null}
              {syncCounts.conflict ? <button type="button" className="canvas2d-workspace-repair" onClick={() => window.dispatchEvent(new CustomEvent("freeflow:open-settings", { detail: { section: "github" } }))}>查看并处理冲突</button> : null}
            </div> : null}
          </> : null}
          {syncError || statusError ? <div className="canvas2d-workspace-error" role="alert">{syncError || statusError}<button type="button" disabled={Boolean(busy) || !connected || !folder} onClick={() => sync("check")}>重试检查</button></div> : null}
        </div> : null}
        {notice ? <div className="canvas2d-workspace-notice" role="status">{notice}</div> : null}
        {error ? <div className="canvas2d-workspace-error" role="alert">{error}</div> : null}
      </div>
      {open ? <div className="canvas2d-workspace-resizer" role="separator" aria-label="调整工作区宽度" aria-orientation="vertical" aria-valuemin={260} aria-valuemax={360} aria-valuenow={width} tabIndex={0} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); const next = Math.min(360, Math.max(260, width + (event.key === "ArrowLeft" ? -10 : 10))); onWidthChange(next); try { localStorage.setItem("freeflow.canvas.chrome.workspaceWidth", next); } catch {} } }} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const left = rootRef.current.getBoundingClientRect().left; onWidthChange(Math.min(360, Math.max(260, event.clientX - left))); }} onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); try { localStorage.setItem("freeflow.canvas.chrome.workspaceWidth", width); } catch {} }} /> : null}
      {menu ? createPortal(<div ref={menuRef} className="canvas2d-workspace-menu canvas-chrome-surface" role="menu" data-shape-include="true" style={{ left: menu.x, top: menu.y }}>
        {menu.board.filePath === currentPath ? <><button role="menuitem" onClick={() => saveCurrentBoard(menuReturnFocusRef.current)}>保存当前画布</button><button role="menuitem" disabled={!previousBoard} onClick={() => { setMenu(null); requestSwitch({ kind: "open", path: previousBoard.filePath }); }}>切换到上一个画布</button></> : null}
        <button role="menuitem" onClick={() => run("duplicate", async () => { const result = await bridge.duplicateBoardAtPath(menu.board.filePath); if (!result?.ok) throw new Error(result?.error || "复制失败"); setNotice("已创建独立画布副本"); setView("workspace"); await refresh(); })}>复制画布</button>
        <button role="menuitem" onClick={() => { setEditor({ kind: "rename", path: menu.board.filePath, name: displayName(menu.board.name) }); setMenu(null); }}>重命名</button>
        <button role="menuitem" onClick={() => { bridge.revealBoardPathInFolder(menu.board.filePath); setMenu(null); }}>显示文件位置</button>
        <button role="menuitem" onClick={() => openRecovery("history", menu.board)}>历史版本</button>
        {menu.board.filePath === currentPath ? <button role="menuitem" onClick={() => run("save-as", async () => { if (await bridge.saveBoardAs()) { await refresh(); setNotice("已另存为新文件"); } })}>另存为…</button> : null}
        <button role="menuitem" disabled={menu.board.filePath === currentPath} onClick={() => { setDeleteTarget(menu.board); setMenu(null); }}>删除画布</button>
        <button role="menuitem" onClick={() => openRecovery("trash")}>打开回收站</button>
      </div>, portalHost) : null}
      {recovery ? createPortal(<CanvasRecoveryDialog recovery={recovery} busy={busy} error={error} onClose={() => { setRecovery(null); setError(""); searchRef.current?.focus(); }} onRestore={restoreRecovery} onRefresh={() => openRecovery(recovery.kind, { filePath: recovery.target })} />, portalHost) : null}
      {modal ? createPortal(<div className="canvas2d-workspace-confirm-backdrop" data-shape-include="true"><section ref={switchDialogRef} className="canvas2d-workspace-confirm canvas-chrome-surface" role="alertdialog" aria-modal="true" aria-label={pending ? "切换前保存画布" : "删除画布确认"} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape" && !busy) { setPending(null); setDeleteTarget(null); } }}>
        <strong>{pending ? `「${currentName}」有未保存内容` : `删除「${displayName(deleteTarget.name)}」？`}</strong><p>{pending ? snapshot?.boardFileReloadRequired ? "磁盘已有新版本，保存会另存本次修改，再载入磁盘版本。" : "保存后切换，或放弃本次未保存修改。" : "画布会移入当前工作区的回收站，可以恢复。远程副本不会自动删除。"}</p>
        {error ? <div role="alert" className="canvas2d-workspace-error">{error}</div> : null}
        <div><button autoFocus type="button" disabled={Boolean(busy)} onClick={() => { setPending(null); setDeleteTarget(null); setError(""); }}>取消</button>{pending ? <><button type="button" disabled={Boolean(busy)} onClick={() => confirmSwitch("discard")}>放弃并切换</button><button type="button" disabled={Boolean(busy)} onClick={() => confirmSwitch("save")}>保存并切换</button></> : <button type="button" disabled={Boolean(busy)} onClick={() => run("delete", async () => { const result = await bridge.deleteBoardAtPath(deleteTarget.filePath); if (!result?.ok) throw new Error(result?.error || "删除失败"); setRecent((previous) => previous.filter((entry) => entry.filePath !== deleteTarget.filePath)); setDeleteTarget(null); await refresh(); })}>删除</button>}</div>
      </section></div>, portalHost) : null}
    </aside>
  );
}
