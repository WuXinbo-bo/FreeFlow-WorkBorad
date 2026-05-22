import { createRichTextAdapter } from "./richTextAdapter.js";
import { syncFloatingToolbarLayout } from "./floatingToolbarLayout.js";

export const TEXT_EDITING_SESSION_PHASES = Object.freeze({
  IDLE: "idle",
  ACTIVE: "active",
});

export function createTextEditingSessionManager(options = {}) {
  const host = options.host instanceof HTMLElement ? options.host : null;
  if (!host) {
    return null;
  }

  const surface = options.surface instanceof HTMLElement ? options.surface : null;
  const toolbar = options.toolbar instanceof HTMLElement ? options.toolbar : null;
  const selectionToolbar = options.selectionToolbar instanceof HTMLElement ? options.selectionToolbar : null;
  const adapterFactory =
    typeof options.adapterFactory === "function" ? options.adapterFactory : createRichTextAdapter;

  let adapter = null;
  let activeSession = null;
  let phase = TEXT_EDITING_SESSION_PHASES.IDLE;
  let destroyed = false;

  function ensureAdapter() {
    if (adapter || destroyed) {
      return adapter;
    }
    adapter = adapterFactory(host, {
      onCommit: () => {
        commit({ source: "adapter" });
      },
      onCancel: () => {
        cancel({ source: "adapter" });
      },
      onInput: handleInput,
      onBlur: handleBlur,
      onSelectionChange: handleSelectionChange,
    });
    return adapter;
  }

  function handleInput(event) {
    if (!isActive()) {
      return null;
    }
    const payload = emit("input", { nativeEvent: event });
    emit("change", {
      cause: "input",
      nativeEvent: event,
      input: payload,
    });
    syncToolbar();
    return payload;
  }

  function handleSelectionChange() {
    if (!isActive()) {
      return null;
    }
    const payload = emit("selection", {});
    emit("change", {
      cause: "selection",
      selection: payload,
    });
    syncToolbar();
    return payload;
  }

  function handleBlur(event) {
    if (!isActive()) {
      return null;
    }
    const blurPayload = emit("blur", { nativeEvent: event });
    if (activeSession?.blurBehavior === "commit" && !blurPayload.defaultPrevented) {
      commit({ source: "blur", nativeEvent: event });
      return blurPayload;
    }
    if (activeSession?.blurBehavior === "cancel" && !blurPayload.defaultPrevented) {
      cancel({ source: "blur", nativeEvent: event });
      return blurPayload;
    }
    syncToolbar();
    return blurPayload;
  }

  function createLifecyclePayload(type, extra = {}) {
    const selection = adapter?.getSelectionSnapshot?.() || {
      inside: false,
      collapsed: true,
      text: "",
      rect: null,
    };
    const formatState = adapter?.getFormatState?.() || {};
    const payload = {
      type,
      phase,
      session: getSessionSnapshot(),
      selection,
      formatState,
      html: adapter?.getHTML?.() || "",
      text: adapter?.getText?.() || "",
      host,
      toolbar,
      selectionToolbar,
      surface,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...extra,
    };
    return payload;
  }

  function emit(type, extra = {}) {
    const payload = createLifecyclePayload(type, extra);
    const handlerName = resolveHandlerName(type);
    const handler = typeof options[handlerName] === "function" ? options[handlerName] : null;
    handler?.(payload);
    return payload;
  }

  function resolveHandlerName(type) {
    switch (type) {
      case "begin":
        return "onBegin";
      case "input":
        return "onInput";
      case "selection":
        return "onSelectionChange";
      case "change":
        return "onChange";
      case "commit":
        return "onCommit";
      case "cancel":
        return "onCancel";
      case "blur":
        return "onBlur";
      case "toolbar-sync":
        return "onToolbarSync";
      default:
        return "";
    }
  }

  function getSessionSnapshot() {
    if (!activeSession) {
      return null;
    }
    return {
      id: activeSession.id,
      kind: activeSession.kind,
      meta: { ...activeSession.meta },
      startedAt: activeSession.startedAt,
      blurBehavior: activeSession.blurBehavior,
    };
  }

  function isActive() {
    return phase === TEXT_EDITING_SESSION_PHASES.ACTIVE && Boolean(activeSession);
  }

  function nextSessionId() {
    return `text-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function begin(config = {}) {
    if (destroyed) {
      return null;
    }
    const nextAdapter = ensureAdapter();
    if (!nextAdapter) {
      return null;
    }

    const previousSession = getSessionSnapshot();
    activeSession = {
      id: String(config.id || nextSessionId()),
      kind: String(config.kind || "rich-text"),
      meta: config.meta && typeof config.meta === "object" ? { ...config.meta } : {},
      startedAt: Date.now(),
      blurBehavior: normalizeBlurBehavior(config.blurBehavior),
    };
    phase = TEXT_EDITING_SESSION_PHASES.ACTIVE;

    if (Object.prototype.hasOwnProperty.call(config, "html") || Object.prototype.hasOwnProperty.call(config, "text")) {
      nextAdapter.setContent(config.html || "", config.text || "");
    }
    if (Number.isFinite(config.baseFontSize)) {
      nextAdapter.setBaseFontSize(config.baseFontSize, {
        normalize: Boolean(config.normalizeBaseFontSize),
      });
    }
    if (config.focus !== false) {
      nextAdapter.focus();
    }
    if (config.selectAll) {
      nextAdapter.selectAll?.();
    } else {
      nextAdapter.captureSelection?.();
    }

    const payload = emit("begin", {
      previousSession,
      config,
    });
    syncToolbar(config.toolbarOptions || {});
    return payload;
  }

  function end(extra = {}) {
    const previous = getSessionSnapshot();
    activeSession = null;
    phase = TEXT_EDITING_SESSION_PHASES.IDLE;
    hideToolbar(toolbar);
    hideToolbar(selectionToolbar);
    return {
      previousSession: previous,
      ...extra,
    };
  }

  function commit(extra = {}) {
    if (!isActive()) {
      return null;
    }
    const payload = emit("commit", extra);
    if (!payload.defaultPrevented) {
      end({
        reason: "commit",
      });
    }
    return payload;
  }

  function cancel(extra = {}) {
    if (!isActive()) {
      return null;
    }
    const payload = emit("cancel", extra);
    if (!payload.defaultPrevented) {
      end({
        reason: "cancel",
      });
    }
    return payload;
  }

  function focus() {
    adapter?.focus?.();
  }

  function blur() {
    adapter?.blur?.();
  }

  function setContent(html = "", text = "") {
    const nextAdapter = ensureAdapter();
    if (!nextAdapter) {
      return false;
    }
    nextAdapter.setContent(html, text);
    emit("change", {
      cause: "set-content",
    });
    syncToolbar();
    return true;
  }

  function setBaseFontSize(size, adapterOptions = {}) {
    const nextAdapter = ensureAdapter();
    if (!nextAdapter) {
      return false;
    }
    nextAdapter.setBaseFontSize?.(size, adapterOptions);
    emit("change", {
      cause: "set-base-font-size",
      size,
    });
    syncToolbar();
    return true;
  }

  function command(name, value) {
    const nextAdapter = ensureAdapter();
    if (!nextAdapter) {
      return false;
    }
    nextAdapter.command(name, value);
    emit("change", {
      cause: "command",
      commandName: name,
      commandValue: value,
    });
    syncToolbar();
    return true;
  }

  function deleteSelection() {
    const nextAdapter = ensureAdapter();
    if (!nextAdapter) {
      return false;
    }
    const deleted = nextAdapter.deleteSelection?.();
    emit("change", {
      cause: "delete-selection",
    });
    syncToolbar();
    return Boolean(deleted);
  }

  function captureSelection() {
    adapter?.captureSelection?.();
  }

  function handleToolbarSyncPayload(extra = {}) {
    const payload = emit("toolbar-sync", extra);
    return payload;
  }

  function syncToolbar(toolbarOptions = {}) {
    if (!surface || !isActive()) {
      hideToolbar(toolbar);
      hideToolbar(selectionToolbar);
      return handleToolbarSyncPayload({
        layout: {
          toolbar: null,
          selectionToolbar: null,
        },
      });
    }

    const selection = adapter?.getSelectionSnapshot?.() || {
      inside: false,
      collapsed: true,
      rect: null,
    };

    let toolbarLayout = null;
    let selectionToolbarLayout = null;

    if (toolbar) {
      toolbar.classList.remove("is-hidden");
      toolbarLayout = syncFloatingToolbarLayout(toolbar, surface, toolbarOptions.main || {});
    }

    if (selectionToolbar) {
      selectionToolbarLayout = syncSelectionToolbarLayout(selectionToolbar, surface, {
        rect: selection.inside && !selection.collapsed ? selection.rect : null,
        ...(toolbarOptions.selection || {}),
      });
    }

    return handleToolbarSyncPayload({
      selection,
      layout: {
        toolbar: toolbarLayout,
        selectionToolbar: selectionToolbarLayout,
      },
    });
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    end({
      reason: "destroy",
    });
    adapter?.destroy?.();
    adapter = null;
  }

  return {
    begin,
    end,
    handleInput,
    handleSelectionChange,
    handleBlur,
    commit,
    cancel,
    focus,
    blur,
    isActive,
    getPhase() {
      return phase;
    },
    getSession: getSessionSnapshot,
    getAdapter() {
      return ensureAdapter();
    },
    setContent,
    setBaseFontSize,
    command,
    deleteSelection,
    captureSelection,
    syncToolbar,
    getHTML() {
      return adapter?.getHTML?.() || "";
    },
    getText() {
      return adapter?.getText?.() || "";
    },
    getFormatState() {
      return adapter?.getFormatState?.() || {};
    },
    getSelectionSnapshot() {
      return adapter?.getSelectionSnapshot?.() || null;
    },
    getSelectionHtml(options = {}) {
      return adapter?.getSelectionHtml?.(options) || "";
    },
    getSelectionText() {
      return adapter?.getSelectionText?.() || "";
    },
    destroy,
  };
}

function normalizeBlurBehavior(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "commit" || normalized === "cancel") {
    return normalized;
  }
  return "none";
}

function hideToolbar(toolbar) {
  if (!(toolbar instanceof HTMLElement)) {
    return;
  }
  toolbar.classList.add("is-hidden");
}

function syncSelectionToolbarLayout(toolbar, surface, options = {}) {
  if (!(toolbar instanceof HTMLElement) || !(surface instanceof HTMLElement)) {
    return null;
  }
  const rect = options.rect;
  if (!rect) {
    hideToolbar(toolbar);
    return null;
  }

  const margin = Number.isFinite(options.margin) ? options.margin : 8;
  const gap = Number.isFinite(options.gap) ? options.gap : 10;
  const surfaceRect = surface.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  const width = Math.max(1, toolbar.offsetWidth || toolbarRect.width || 0);
  const height = Math.max(1, toolbar.offsetHeight || toolbarRect.height || 0);
  const surfaceWidth = surfaceRect.width || surface.clientWidth || 0;
  const surfaceHeight = surfaceRect.height || surface.clientHeight || 0;

  if (!surfaceWidth || !surfaceHeight || !width || !height) {
    hideToolbar(toolbar);
    return null;
  }

  toolbar.classList.remove("is-hidden");

  const anchorCenterX = ((rect.left + rect.right) / 2) - surfaceRect.left;
  const preferredTop = rect.top - surfaceRect.top - height - gap;
  const fallbackTop = rect.bottom - surfaceRect.top + gap;
  const left = clamp(anchorCenterX - width / 2, margin, Math.max(margin, surfaceWidth - width - margin));
  const top = preferredTop >= margin
    ? preferredTop
    : clamp(fallbackTop, margin, Math.max(margin, surfaceHeight - height - margin));

  toolbar.style.transformOrigin = "top left";
  toolbar.style.transform = "scale(1)";
  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.round(top)}px`;
  toolbar.style.setProperty("--canvas2d-floating-toolbar-scale", "1");

  return {
    scale: 1,
    left,
    top,
    width,
    height,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
