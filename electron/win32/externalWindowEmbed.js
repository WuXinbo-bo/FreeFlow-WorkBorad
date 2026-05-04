let electron = require("electron");
if (typeof electron === "string") {
  electron = require("electron/main");
}

const ZERO_HANDLE = 0n;
const HWND_TOP = 0n;
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_VISIBLE = 0x10000000n;
const WS_CHILD = 0x40000000n;
const WS_POPUP = 0x80000000n;
const WS_CAPTION = 0x00c00000n;
const WS_THICKFRAME = 0x00040000n;
const WS_MINIMIZEBOX = 0x00020000n;
const WS_MAXIMIZEBOX = 0x00010000n;
const WS_SYSMENU = 0x00080000n;
const WS_EX_APPWINDOW = 0x00040000n;
const WS_EX_TOOLWINDOW = 0x00000080n;
const SW_HIDE = 0;
const SW_MINIMIZE = 6;
const SW_RESTORE = 9;
const SW_SHOW = 5;
const SWP_NOZORDER = 0x0004;
const SWP_NOOWNERZORDER = 0x0200;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SWP_SHOWWINDOW = 0x0040;
const EMBED_FIT_MODES = ["contain", "cover", "fill"];

function bufferToUintPtr(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length <= 0) {
    return ZERO_HANDLE;
  }

  if (buffer.length >= 8 && typeof buffer.readBigUInt64LE === "function") {
    return buffer.readBigUInt64LE(0);
  }

  if (buffer.length >= 4) {
    return BigInt(buffer.readUInt32LE(0));
  }

  let value = ZERO_HANDLE;
  for (let index = 0; index < buffer.length; index += 1) {
    value |= BigInt(buffer[index]) << BigInt(index * 8);
  }
  return value;
}

function parseWindowSourceHandle(sourceId = "") {
  const normalized = String(sourceId || "").trim();
  const match = /^(?:window:(\d+):|hwnd:(\d+))$/i.exec(normalized);
  if (!match) {
    return ZERO_HANDLE;
  }

  try {
    return BigInt(match[1] || match[2] || "0");
  } catch {
    return ZERO_HANDLE;
  }
}

function createUnsupportedManager() {
  const error = () => {
    throw new Error("当前环境不支持 Win32 子窗口嵌入");
  };

  return {
    isSupported: () => false,
    getState: () => ({ active: false, sourceId: "" }),
    embedExternalWindow: error,
    syncEmbeddedWindowBounds: error,
    setEmbeddedWindowMinimized: () => ({ ok: true, active: false, minimized: false }),
    focusEmbeddedWindow: () => ({ ok: true, active: false }),
    blurEmbeddedWindow: () => ({ ok: true, active: false }),
    clearEmbeddedWindow: () => ({ ok: true, active: false }),
  };
}

function createExternalWindowEmbedManager(mainWindowGetter) {
  if (process.platform !== "win32") {
    return createUnsupportedManager();
  }

  let koffi;
  try {
    koffi = require("koffi");
  } catch (error) {
    console.warn(`Failed to load koffi for Win32 embedding: ${error.message}`);
    return createUnsupportedManager();
  }

  const RECT = koffi.struct("RECT", {
    left: "long",
    top: "long",
    right: "long",
    bottom: "long",
  });
  const LPRECT = koffi.pointer("LPRECT", RECT);
  const GUITHREADINFO = koffi.struct("GUITHREADINFO", {
    cbSize: "uint",
    flags: "uint",
    hwndActive: "uintptr",
    hwndFocus: "uintptr",
    hwndCapture: "uintptr",
    hwndMenuOwner: "uintptr",
    hwndMoveSize: "uintptr",
    hwndCaret: "uintptr",
    rcCaret: RECT,
  });
  const LPGUITHREADINFO = koffi.pointer("LPGUITHREADINFO", GUITHREADINFO);

  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");
  const GetParent = user32.func("__stdcall", "GetParent", "uintptr", ["uintptr"]);
  const SetParent = user32.func("__stdcall", "SetParent", "uintptr", ["uintptr", "uintptr"]);
  const GetWindowLongPtrW = user32.func("__stdcall", "GetWindowLongPtrW", "intptr", ["uintptr", "int"]);
  const SetWindowLongPtrW = user32.func("__stdcall", "SetWindowLongPtrW", "intptr", ["uintptr", "int", "intptr"]);
  const CreateWindowExW = user32.func(
    "__stdcall",
    "CreateWindowExW",
    "uintptr",
    ["uint", "str16", "str16", "uint", "int", "int", "int", "int", "uintptr", "uintptr", "uintptr", "uintptr"]
  );
  const DestroyWindow = user32.func("__stdcall", "DestroyWindow", "bool", ["uintptr"]);
  const GetWindowRect = user32.func("__stdcall", "GetWindowRect", "bool", ["uintptr", koffi.out(LPRECT)]);
  const IsWindow = user32.func("__stdcall", "IsWindow", "bool", ["uintptr"]);
  const ShowWindow = user32.func("__stdcall", "ShowWindow", "bool", ["uintptr", "int"]);
  const BringWindowToTop = user32.func("__stdcall", "BringWindowToTop", "bool", ["uintptr"]);
  const SetForegroundWindow = user32.func("__stdcall", "SetForegroundWindow", "bool", ["uintptr"]);
  const SetActiveWindow = user32.func("__stdcall", "SetActiveWindow", "uintptr", ["uintptr"]);
  const SetFocus = user32.func("__stdcall", "SetFocus", "uintptr", ["uintptr"]);
  const GetGUIThreadInfo = user32.func("__stdcall", "GetGUIThreadInfo", "bool", ["uint", koffi.out(LPGUITHREADINFO)]);
  const GetWindowThreadProcessId = user32.func("__stdcall", "GetWindowThreadProcessId", "uint", ["uintptr", "uintptr"]);
  const AttachThreadInput = user32.func("__stdcall", "AttachThreadInput", "bool", ["uint", "uint", "bool"]);
  const GetCurrentThreadId = kernel32.func("__stdcall", "GetCurrentThreadId", "uint", []);
  const SetWindowPos = user32.func(
    "__stdcall",
    "SetWindowPos",
    "bool",
    ["uintptr", "uintptr", "int", "int", "int", "int", "uint"]
  );

  let embeddedWindow = null;
  let hostWindow = null;

  function getMainWindow() {
    const window = typeof mainWindowGetter === "function" ? mainWindowGetter() : null;
    if (!window || window.isDestroyed()) {
      throw new Error("主窗口不可用，无法执行嵌入");
    }
    return window;
  }

  function ensureValidHandle(hwnd) {
    if (!hwnd || hwnd === ZERO_HANDLE || !IsWindow(hwnd)) {
      throw new Error("目标窗口句柄无效或窗口已关闭");
    }
  }

  function getWindowThreadId(hwnd) {
    if (!hwnd || hwnd === ZERO_HANDLE || !IsWindow(hwnd)) {
      return 0;
    }
    try {
      return Number(GetWindowThreadProcessId(hwnd, ZERO_HANDLE) || 0);
    } catch {
      return 0;
    }
  }

  function withAttachedInputQueues(threadIds = [], callback = () => {}) {
    const currentThreadId = Number(GetCurrentThreadId() || 0);
    const uniqueThreadIds = [...new Set([currentThreadId, ...threadIds.map((id) => Number(id) || 0).filter(Boolean)])];
    const attachedPairs = [];

    try {
      for (let index = 0; index < uniqueThreadIds.length; index += 1) {
        for (let pairIndex = index + 1; pairIndex < uniqueThreadIds.length; pairIndex += 1) {
          const first = uniqueThreadIds[index];
          const second = uniqueThreadIds[pairIndex];
          if (!first || !second || first === second) {
            continue;
          }
          try {
            if (AttachThreadInput(first, second, true)) {
              attachedPairs.push([first, second]);
            }
          } catch {
            // Ignore queue-attach failures and continue with best-effort focus transfer.
          }
        }
      }

      return callback(currentThreadId);
    } finally {
      for (let index = attachedPairs.length - 1; index >= 0; index -= 1) {
        const [first, second] = attachedPairs[index];
        try {
          AttachThreadInput(first, second, false);
        } catch {
          // Ignore queue-detach failures during cleanup.
        }
      }
    }
  }

  function readThreadFocusHandle(hwnd) {
    const threadId = getWindowThreadId(hwnd);
    if (!threadId) {
      return ZERO_HANDLE;
    }
    const info = {
      cbSize: Number(koffi.sizeof(GUITHREADINFO)),
    };
    try {
      if (!GetGUIThreadInfo(threadId, info)) {
        return ZERO_HANDLE;
      }
      const focusHwnd = BigInt(info.hwndFocus || ZERO_HANDLE);
      return focusHwnd && focusHwnd !== ZERO_HANDLE && IsWindow(focusHwnd) ? focusHwnd : ZERO_HANDLE;
    } catch {
      return ZERO_HANDLE;
    }
  }

  function transferWindowFocus(targetHwnd, sourceHwnd = ZERO_HANDLE, focusHwnd = targetHwnd) {
    if (!targetHwnd || targetHwnd === ZERO_HANDLE) {
      return false;
    }

    const targetThreadId = getWindowThreadId(targetHwnd);
    const sourceThreadId = getWindowThreadId(sourceHwnd);

    return withAttachedInputQueues([targetThreadId, sourceThreadId], () => {
      try {
        BringWindowToTop(targetHwnd);
      } catch {
        // Ignore z-order failures.
      }
      try {
        SetForegroundWindow(targetHwnd);
      } catch {
        // Ignore foreground failures.
      }
      try {
        SetActiveWindow(targetHwnd);
      } catch {
        // Ignore active-window failures.
      }
      try {
        SetFocus(focusHwnd && focusHwnd !== ZERO_HANDLE ? focusHwnd : targetHwnd);
      } catch {
        // Ignore focus failures.
      }
      return true;
    });
  }

  function getMainWindowHandle() {
    return bufferToUintPtr(getMainWindow().getNativeWindowHandle());
  }

  function getEmbeddedState() {
    if (!embeddedWindow) {
      return {
        active: false,
        sourceId: "",
        hwnd: "",
      };
    }

    return {
      active: true,
      sourceId: embeddedWindow.sourceId,
      hwnd: embeddedWindow.hwnd.toString(),
      minimized: Boolean(embeddedWindow.minimized),
      visible: !Boolean(embeddedWindow.hidden),
      fitMode: embeddedWindow.fitMode || "contain",
      interactive: Boolean(embeddedWindow.interactive),
    };
  }

  function normalizeDipRect(rect = {}) {
    const x = Math.max(0, Math.floor(Number(rect?.x) || 0));
    const y = Math.max(0, Math.floor(Number(rect?.y) || 0));
    const width = Math.max(1, Math.ceil(Number(rect?.width) || 0));
    const height = Math.max(1, Math.ceil(Number(rect?.height) || 0));

    return { x, y, width, height };
  }

  function normalizeFitMode(value) {
    const fitMode = String(value || "").trim().toLowerCase();
    return EMBED_FIT_MODES.includes(fitMode) ? fitMode : "contain";
  }

  function toParentClientScreenRect(window, rect) {
    const safeRect = normalizeDipRect(rect);
    const contentBoundsDip = window.getContentBounds();
    const maxX = Math.max(0, (Number(contentBoundsDip.width) || 0) - 1);
    const maxY = Math.max(0, (Number(contentBoundsDip.height) || 0) - 1);
    const clampedX = Math.min(safeRect.x, maxX);
    const clampedY = Math.min(safeRect.y, maxY);
    const clampedDipRect = {
      x: clampedX,
      y: clampedY,
      width: Math.max(1, Math.min(safeRect.width, Math.max(1, (Number(contentBoundsDip.width) || 1) - clampedX))),
      height: Math.max(1, Math.min(safeRect.height, Math.max(1, (Number(contentBoundsDip.height) || 1) - clampedY))),
    };
    const rectScreen = electron.screen.dipToScreenRect(window, {
      x: contentBoundsDip.x + clampedDipRect.x,
      y: contentBoundsDip.y + clampedDipRect.y,
      width: clampedDipRect.width,
      height: clampedDipRect.height,
    });
    const contentScreen = electron.screen.dipToScreenRect(window, contentBoundsDip);
    const relativeX = Math.max(0, rectScreen.x - contentScreen.x);
    const relativeY = Math.max(0, rectScreen.y - contentScreen.y);
    const maxWidth = Math.max(1, contentScreen.width - relativeX);
    const maxHeight = Math.max(1, contentScreen.height - relativeY);

    return {
      x: relativeX,
      y: relativeY,
      width: Math.max(1, Math.min(rectScreen.width, maxWidth)),
      height: Math.max(1, Math.min(rectScreen.height, maxHeight)),
    };
  }

  function computeEmbeddedClientRect(target, hostRect, fitMode) {
    const normalizedFitMode = normalizeFitMode(fitMode || target?.fitMode);
    if (normalizedFitMode === "fill") {
      return {
        x: 0,
        y: 0,
        width: Math.max(1, hostRect.width),
        height: Math.max(1, hostRect.height),
      };
    }

    const sourceWidth = Math.max(1, Number(target?.originalRect?.width) || hostRect.width || 1);
    const sourceHeight = Math.max(1, Number(target?.originalRect?.height) || hostRect.height || 1);
    const scale =
      normalizedFitMode === "cover"
        ? Math.max(hostRect.width / sourceWidth, hostRect.height / sourceHeight)
        : Math.min(hostRect.width / sourceWidth, hostRect.height / sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    return {
      x: Math.round((hostRect.width - width) / 2),
      y: Math.round((hostRect.height - height) / 2),
      width,
      height,
    };
  }

  function readWindowRect(hwnd) {
    const result = {};
    if (!GetWindowRect(hwnd, result)) {
      return null;
    }

    return {
      left: Number(result.left) || 0,
      top: Number(result.top) || 0,
      right: Number(result.right) || 0,
      bottom: Number(result.bottom) || 0,
      width: Math.max(0, (Number(result.right) || 0) - (Number(result.left) || 0)),
      height: Math.max(0, (Number(result.bottom) || 0) - (Number(result.top) || 0)),
    };
  }

  function destroyHostWindow() {
    if (!hostWindow?.hwnd) {
      hostWindow = null;
      return;
    }

    try {
      if (IsWindow(hostWindow.hwnd)) {
        DestroyWindow(hostWindow.hwnd);
      }
    } catch {
      // Ignore host cleanup failures.
    } finally {
      hostWindow = null;
    }
  }

  function ensureHostWindow(rect) {
    const normalizedRect = normalizeDipRect(rect);
    if (hostWindow?.hwnd && IsWindow(hostWindow.hwnd)) {
      return {
        hwnd: hostWindow.hwnd,
        rect: normalizedRect,
      };
    }

    const hostHwnd = CreateWindowExW(
      0,
      "Static",
      "",
      Number(BigInt.asUintN(32, WS_CHILD | WS_VISIBLE)),
      normalizedRect.x,
      normalizedRect.y,
      normalizedRect.width,
      normalizedRect.height,
      getMainWindowHandle(),
      ZERO_HANDLE,
      ZERO_HANDLE,
      ZERO_HANDLE
    );

    if (!hostHwnd || hostHwnd === ZERO_HANDLE || !IsWindow(hostHwnd)) {
      throw new Error("创建嵌入宿主窗口失败");
    }

    hostWindow = {
      hwnd: BigInt(hostHwnd),
    };

    return {
      hwnd: hostWindow.hwnd,
      rect: normalizedRect,
    };
  }

  function moveWindowToRect(hwnd, rect, { keepZOrder = false, showWindow = true } = {}) {
    const { x, y, width, height } = rect;
    const moved = SetWindowPos(
      hwnd,
      HWND_TOP,
      x,
      y,
      width,
      height,
      (keepZOrder ? SWP_NOZORDER : 0) |
        SWP_NOOWNERZORDER |
        SWP_NOACTIVATE |
        SWP_FRAMECHANGED |
        (showWindow ? SWP_SHOWWINDOW : 0)
    );

    if (!moved) {
      throw new Error("调整嵌入窗口位置失败");
    }
  }

  function moveEmbeddedWindow(hwnd, rect, options = {}) {
    moveWindowToRect(hwnd, rect, { keepZOrder: true, ...options });
  }

  function applyEmbeddedChildStyles(target) {
    const normalizedStyle = BigInt.asUintN(32, target.originalStyle);
    const normalizedExStyle = BigInt.asUintN(32, target.originalExStyle);
    const childStyle =
      (normalizedStyle | WS_CHILD) &
      ~WS_POPUP &
      ~WS_CAPTION &
      ~WS_THICKFRAME &
      ~WS_MINIMIZEBOX &
      ~WS_MAXIMIZEBOX &
      ~WS_SYSMENU;
    const childExStyle = (normalizedExStyle & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW;

    SetWindowLongPtrW(target.hwnd, GWL_STYLE, childStyle);
    SetWindowLongPtrW(target.hwnd, GWL_EXSTYLE, childExStyle);
    target.childStyle = childStyle;
    target.childExStyle = childExStyle;
  }

  function restoreOriginalWindowStyles(target) {
    SetWindowLongPtrW(target.hwnd, GWL_STYLE, target.originalStyle);
    SetWindowLongPtrW(target.hwnd, GWL_EXSTYLE, target.originalExStyle);
  }

  function detachEmbeddedWindowToOriginalParent(target) {
    restoreOriginalWindowStyles(target);
    SetParent(target.hwnd, target.originalParent || ZERO_HANDLE);

    const restoreRect = target.originalRect;
    if (restoreRect) {
      SetWindowPos(
        target.hwnd,
        ZERO_HANDLE,
        restoreRect.left,
        restoreRect.top,
        Math.max(1, restoreRect.width),
        Math.max(1, restoreRect.height),
        SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW
      );
    }
  }

  function attachEmbeddedWindowToHost(target, host) {
    ShowWindow(target.hwnd, SW_RESTORE);
    applyEmbeddedChildStyles(target);
    SetParent(target.hwnd, host.hwnd);
    const clientRect = computeEmbeddedClientRect(target, host.rect, target.fitMode);
    moveEmbeddedWindow(target.hwnd, clientRect);
    ShowWindow(target.hwnd, SW_SHOW);
    setEmbeddedWindowInteractive(false, { target, restoreRendererFocus: false });
    target.hostHwnd = host.hwnd;
    target.hidden = false;
    target.minimized = false;
    target.lastClientRect = clientRect;
  }

  function setEmbeddedWindowInteractive(interactive, { target = embeddedWindow, restoreRendererFocus = true } = {}) {
    if (!target) {
      return {
        ok: true,
        active: false,
        interactive: false,
      };
    }

    ensureValidHandle(target.hwnd);
    const nextInteractive = Boolean(interactive) && !Boolean(target.hidden) && !Boolean(target.minimized);
    const previousInteractive = Boolean(target.interactive);

    if (!nextInteractive && restoreRendererFocus && previousInteractive) {
      try {
        const focusedChild = readThreadFocusHandle(target.hwnd);
        if (focusedChild && focusedChild !== ZERO_HANDLE) {
          target.lastFocusedHwnd = focusedChild;
        }
      } catch {
        // Ignore focused-child snapshot failures before returning to renderer.
      }
      try {
        transferWindowFocus(getMainWindowHandle(), target.hwnd);
      } catch {
        // Ignore focus-transfer failures while returning focus to the renderer.
      }
    }

    target.interactive = nextInteractive;

    if (nextInteractive) {
      try {
        ShowWindow(target.hwnd, SW_RESTORE);
      } catch {
        // Ignore restore failures.
      }
      try {
        const preferredFocusHwnd =
          target.lastFocusedHwnd && target.lastFocusedHwnd !== ZERO_HANDLE && IsWindow(target.lastFocusedHwnd)
            ? target.lastFocusedHwnd
            : readThreadFocusHandle(target.hwnd) || target.hwnd;
        transferWindowFocus(target.hwnd, getMainWindowHandle(), preferredFocusHwnd);
      } catch {
        // Ignore focus-transfer failures.
      }
    }

    return {
      ok: true,
      active: true,
      sourceId: target.sourceId,
      hwnd: target.hwnd.toString(),
      visible: !Boolean(target.hidden),
      minimized: Boolean(target.minimized),
      fitMode: target.fitMode || "contain",
      interactive: Boolean(target.interactive),
    };
  }

  function focusEmbeddedWindow(target = embeddedWindow) {
    return setEmbeddedWindowInteractive(true, {
      target,
      restoreRendererFocus: false,
    });
  }

  function blurEmbeddedWindow(target = embeddedWindow) {
    return setEmbeddedWindowInteractive(false, {
      target,
      restoreRendererFocus: true,
    });
  }

  function setEmbeddedWindowVisibility(visible) {
    if (!embeddedWindow) {
      return {
        ok: true,
        active: false,
        visible: Boolean(visible),
      };
    }

    ensureValidHandle(embeddedWindow.hwnd);
    const nextVisible = Boolean(visible);
    if (!nextVisible) {
      setEmbeddedWindowInteractive(false, {
        target: embeddedWindow,
        restoreRendererFocus: false,
      });
    }
    embeddedWindow.hidden = !nextVisible;

    if (!embeddedWindow.minimized) {
      if (hostWindow?.hwnd && IsWindow(hostWindow.hwnd)) {
        ShowWindow(hostWindow.hwnd, nextVisible ? SW_SHOW : SW_HIDE);
      }
      ShowWindow(embeddedWindow.hwnd, nextVisible ? SW_SHOW : SW_HIDE);
    }

    return {
      ok: true,
      active: true,
      sourceId: embeddedWindow.sourceId,
      hwnd: embeddedWindow.hwnd.toString(),
      minimized: Boolean(embeddedWindow.minimized),
      visible: nextVisible,
      fitMode: embeddedWindow.fitMode || "contain",
      interactive: Boolean(embeddedWindow.interactive),
    };
  }

  function setEmbeddedWindowMinimized(minimized) {
    if (!embeddedWindow) {
      return {
        ok: true,
        active: false,
        minimized: Boolean(minimized),
      };
    }

    ensureValidHandle(embeddedWindow.hwnd);
    const nextMinimized = Boolean(minimized);
    embeddedWindow.minimized = nextMinimized;

    if (nextMinimized) {
      setEmbeddedWindowInteractive(false, {
        target: embeddedWindow,
        restoreRendererFocus: false,
      });
      detachEmbeddedWindowToOriginalParent(embeddedWindow);
      destroyHostWindow();
      ShowWindow(embeddedWindow.hwnd, SW_MINIMIZE);
      return {
        ok: true,
        active: true,
        sourceId: embeddedWindow.sourceId,
        hwnd: embeddedWindow.hwnd.toString(),
        minimized: true,
        visible: false,
        fitMode: embeddedWindow.fitMode || "contain",
        interactive: false,
      };
    }

    const host = ensureHostWindow(embeddedWindow.lastBounds || { x: 0, y: 0, width: 640, height: 360 });
    moveWindowToRect(host.hwnd, host.rect);
    ShowWindow(host.hwnd, SW_SHOW);
    attachEmbeddedWindowToHost(embeddedWindow, host);

    return {
      ok: true,
      active: true,
      sourceId: embeddedWindow.sourceId,
      hwnd: embeddedWindow.hwnd.toString(),
      minimized: false,
      visible: true,
      fitMode: embeddedWindow.fitMode || "contain",
      interactive: Boolean(embeddedWindow.interactive),
    };
  }

  function clearEmbeddedWindow({ reason = "", restoreVisible = true } = {}) {
    if (!embeddedWindow) {
      return {
        ok: true,
        active: false,
        reason,
      };
    }

    const current = embeddedWindow;
    embeddedWindow = null;

    try {
      if (!IsWindow(current.hwnd)) {
        return {
          ok: true,
          active: false,
          reason: reason || "target-closed",
        };
      }

      detachEmbeddedWindowToOriginalParent(current);
      ShowWindow(current.hwnd, restoreVisible ? SW_SHOW : SW_HIDE);
    } catch (error) {
      return {
        ok: false,
        active: false,
        reason: reason || "restore-failed",
        error: error.message,
      };
    }

    destroyHostWindow();

    return {
      ok: true,
      active: false,
      reason,
    };
  }

  function embedExternalWindow({ sourceId = "", bounds = null, layout = null } = {}) {
    const hwnd = parseWindowSourceHandle(sourceId);
    if (!hwnd || hwnd === ZERO_HANDLE) {
      throw new Error("只能嵌入窗口类型的映射目标");
    }

    ensureValidHandle(hwnd);

    if (embeddedWindow?.hwnd && embeddedWindow.hwnd !== hwnd) {
      clearEmbeddedWindow({ reason: "switch-target" });
    }

    const window = getMainWindow();
    const parentHwnd = getMainWindowHandle();
    const rect = toParentClientScreenRect(window, bounds || { x: 0, y: 0, width: 640, height: 360 });
    const host = ensureHostWindow(rect);
    moveWindowToRect(host.hwnd, host.rect);

    if (!embeddedWindow || embeddedWindow.hwnd !== hwnd) {
      const originalStyle = BigInt(GetWindowLongPtrW(hwnd, GWL_STYLE));
      const originalExStyle = BigInt(GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
      const originalParent = BigInt(GetParent(hwnd) || ZERO_HANDLE);
      const originalRect = readWindowRect(hwnd);

      embeddedWindow = {
        sourceId,
        hwnd,
        hostHwnd: host.hwnd,
        originalParent,
        originalStyle,
        originalExStyle,
        originalRect,
        lastBounds: rect,
        fitMode: normalizeFitMode(layout?.fitMode),
        hidden: false,
        minimized: false,
        interactive: false,
        lastFocusedHwnd: ZERO_HANDLE,
      };
    }

    embeddedWindow.lastBounds = rect;
    embeddedWindow.fitMode = normalizeFitMode(layout?.fitMode || embeddedWindow.fitMode);
    attachEmbeddedWindowToHost(embeddedWindow, host);

    return {
      ok: true,
      active: true,
      sourceId,
      hwnd: hwnd.toString(),
      visible: !Boolean(embeddedWindow.hidden),
      fitMode: embeddedWindow.fitMode,
      hostBounds: rect,
      clientBounds: embeddedWindow.lastClientRect || { x: 0, y: 0, width: rect.width, height: rect.height },
    };
  }

  function syncEmbeddedWindowBounds({ bounds = null, layout = null } = {}) {
    if (!embeddedWindow) {
      return {
        ok: true,
        active: false,
      };
    }

    ensureValidHandle(embeddedWindow.hwnd);
    const window = getMainWindow();
    const rect = toParentClientScreenRect(window, bounds || { x: 0, y: 0, width: 1, height: 1 });
    embeddedWindow.lastBounds = rect;
    embeddedWindow.fitMode = normalizeFitMode(layout?.fitMode || embeddedWindow.fitMode);
    if (embeddedWindow.minimized) {
      return {
        ok: true,
        active: true,
        sourceId: embeddedWindow.sourceId,
        hwnd: embeddedWindow.hwnd.toString(),
        minimized: true,
        visible: !Boolean(embeddedWindow.hidden),
        fitMode: embeddedWindow.fitMode,
      };
    }
    const host = ensureHostWindow(rect);
    moveWindowToRect(host.hwnd, host.rect, { showWindow: !embeddedWindow.hidden });
    const clientRect = computeEmbeddedClientRect(embeddedWindow, host.rect, embeddedWindow.fitMode);
    moveEmbeddedWindow(embeddedWindow.hwnd, clientRect, { showWindow: !embeddedWindow.hidden });
    embeddedWindow.lastClientRect = clientRect;
    if (embeddedWindow.hidden) {
      if (hostWindow?.hwnd && IsWindow(hostWindow.hwnd)) {
        ShowWindow(hostWindow.hwnd, SW_HIDE);
      }
      ShowWindow(embeddedWindow.hwnd, SW_HIDE);
    }

    return {
      ok: true,
      active: true,
      sourceId: embeddedWindow.sourceId,
      hwnd: embeddedWindow.hwnd.toString(),
      minimized: false,
      visible: !Boolean(embeddedWindow.hidden),
      fitMode: embeddedWindow.fitMode,
      interactive: Boolean(embeddedWindow.interactive),
      hostBounds: host.rect,
      clientBounds: clientRect,
    };
  }

  return {
    isSupported: () => true,
    getState: getEmbeddedState,
    embedExternalWindow,
    syncEmbeddedWindowBounds,
    setEmbeddedWindowVisibility,
    setEmbeddedWindowMinimized,
    setEmbeddedWindowInteractive,
    focusEmbeddedWindow,
    blurEmbeddedWindow,
    clearEmbeddedWindow,
  };
}

module.exports = {
  createExternalWindowEmbedManager,
};
