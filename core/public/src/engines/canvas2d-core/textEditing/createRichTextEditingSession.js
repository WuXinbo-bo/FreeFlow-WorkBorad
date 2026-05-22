import { createRichTextAdapter } from "../editors/richTextAdapter.js";

function normalizeFontSize(value, fallback = 20) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) {
    return Math.max(8, Number(fallback) || 20);
  }
  return Math.max(8, next);
}

function isElementWithinTargets(target, targets = []) {
  if (!(target instanceof Element)) {
    return false;
  }
  return targets.some((entry) => entry instanceof Element && entry.contains(target));
}

export function createRichTextEditingSession({
  editorElement,
  onSelectionChange = null,
  onRequestCommit = null,
  onRequestCancel = null,
  onRequestExternalLink = null,
} = {}) {
  let host = editorElement instanceof HTMLDivElement ? editorElement : null;
  let adapter = null;
  let session = null;

  function ensureAdapter() {
    if (!host) {
      return null;
    }
    if (!adapter) {
      adapter = createRichTextAdapter(host, {
        onCommit: () => onRequestCommit?.(),
        onCancel: () => onRequestCancel?.(),
        onSelectionChange: () => onSelectionChange?.(),
        onRequestExternalLink: () => onRequestExternalLink?.(),
      });
    }
    return adapter;
  }

  function setSession(nextSession = null) {
    session = nextSession
      ? {
          itemId: String(nextSession.itemId || ""),
          itemType: String(nextSession.itemType || ""),
          baselineSnapshot: nextSession.baselineSnapshot || null,
          lastSyncedItemId: String(nextSession.lastSyncedItemId || nextSession.itemId || ""),
          fontSize: normalizeFontSize(nextSession.fontSize, 20),
        }
      : null;
  }

  function syncHiddenState(hidden) {
    if (!host) {
      return;
    }
    host.classList.toggle("is-hidden", Boolean(hidden));
  }

  return {
    setEditorElement(nextElement) {
      if (host === nextElement) {
        return;
      }
      if (adapter) {
        adapter.destroy();
        adapter = null;
      }
      host = nextElement instanceof HTMLDivElement ? nextElement : null;
      if (!host) {
        setSession(null);
      }
    },
    begin({ itemId, itemType, html = "", plainText = "", fontSize = 20, baselineSnapshot = null } = {}) {
      const nextAdapter = ensureAdapter();
      if (!nextAdapter) {
        return false;
      }
      setSession({
        itemId,
        itemType,
        baselineSnapshot,
        lastSyncedItemId: itemId,
        fontSize,
      });
      nextAdapter.setContent(html, plainText);
      nextAdapter.setBaseFontSize?.(session.fontSize, { normalize: false });
      syncHiddenState(false);
      return true;
    },
    clear({ destroyAdapter = false } = {}) {
      syncHiddenState(true);
      if (destroyAdapter && adapter) {
        adapter.destroy();
        adapter = null;
      }
      setSession(null);
    },
    destroy() {
      if (adapter) {
        adapter.destroy();
        adapter = null;
      }
      setSession(null);
    },
    isActive() {
      return Boolean(session?.itemId);
    },
    isEditingType(type) {
      return Boolean(session?.itemId) && session?.itemType === type;
    },
    getItemId() {
      return session?.itemId || "";
    },
    getItemType() {
      return session?.itemType || "";
    },
    getBaselineSnapshot() {
      return session?.baselineSnapshot || null;
    },
    setBaselineSnapshot(snapshot = null) {
      if (!session) {
        return;
      }
      session.baselineSnapshot = snapshot || null;
    },
    ensureBaselineSnapshot(factory) {
      if (!session || session.baselineSnapshot || typeof factory !== "function") {
        return session?.baselineSnapshot || null;
      }
      session.baselineSnapshot = factory();
      return session.baselineSnapshot;
    },
    getLastSyncedItemId() {
      return session?.lastSyncedItemId || "";
    },
    markItemSynced(itemId = "") {
      if (!session) {
        return;
      }
      session.lastSyncedItemId = String(itemId || session.itemId || "");
    },
    clearLastSyncedItemId() {
      if (!session) {
        return;
      }
      session.lastSyncedItemId = "";
    },
    getFontSize() {
      return normalizeFontSize(session?.fontSize, 20);
    },
    setFontSize(value, { normalize = false } = {}) {
      const nextAdapter = ensureAdapter();
      const nextSize = normalizeFontSize(value, session?.fontSize || 20);
      if (session) {
        session.fontSize = nextSize;
      }
      nextAdapter?.setBaseFontSize?.(nextSize, { normalize });
      return nextSize;
    },
    focus() {
      ensureAdapter()?.focus?.();
    },
    captureSelection() {
      ensureAdapter()?.captureSelection?.();
    },
    getSelectionSnapshot() {
      return ensureAdapter()?.getSelectionSnapshot?.() || null;
    },
    getFormatState() {
      return ensureAdapter()?.getFormatState?.() || {};
    },
    getHTML() {
      return ensureAdapter()?.getHTML?.() || "";
    },
    getText() {
      return ensureAdapter()?.getText?.() || "";
    },
    getSelectionHtml(options = {}) {
      return ensureAdapter()?.getSelectionHtml?.(options) || "";
    },
    getSelectionText() {
      return ensureAdapter()?.getSelectionText?.() || "";
    },
    command(name, value) {
      return ensureAdapter()?.command?.(name, value) || false;
    },
    deleteSelection() {
      return ensureAdapter()?.deleteSelection?.() || false;
    },
    selectAll() {
      ensureAdapter()?.selectAll?.();
    },
    moveCaretToEnd() {
      ensureAdapter()?.moveCaretToEnd?.();
    },
    syncContent({ itemId, html = "", plainText = "", fontSize = 20, force = false } = {}) {
      const nextAdapter = ensureAdapter();
      if (!nextAdapter || !session) {
        return false;
      }
      const nextItemId = String(itemId || session.itemId || "");
      const shouldReset = force || session.lastSyncedItemId !== nextItemId;
      session.fontSize = normalizeFontSize(fontSize, session.fontSize || 20);
      nextAdapter.setBaseFontSize?.(session.fontSize, { normalize: false });
      if (shouldReset) {
        nextAdapter.setContent(html, plainText);
        session.lastSyncedItemId = nextItemId;
        return true;
      }
      return false;
    },
    applyFrame({
      left = 0,
      top = 0,
      width = 1,
      height = 1,
      fontSize = 20,
      padding = "0px",
      lineHeight = "1.4",
      fontFamily = "",
      fontWeight = "",
      color = "",
      overflow = "visible",
      classToggles = {},
    } = {}) {
      if (!host) {
        return;
      }
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
      host.style.width = `${Math.max(1, Number(width || 1))}px`;
      host.style.height = `${Math.max(1, Number(height || 1))}px`;
      host.style.fontSize = `${Math.max(1, Number(fontSize || 1))}px`;
      host.style.padding = padding;
      host.style.lineHeight = String(lineHeight || "1.4");
      host.style.overflow = overflow;
      if (fontFamily) {
        host.style.fontFamily = fontFamily;
      }
      if (fontWeight) {
        host.style.fontWeight = fontWeight;
      }
      if (color) {
        host.style.color = color;
      }
      Object.entries(classToggles || {}).forEach(([className, enabled]) => {
        if (!className) return;
        host.classList.toggle(className, Boolean(enabled));
      });
    },
    handleBlur(event, { ignoreTargets = [], onCommit = null } = {}) {
      const next = event?.relatedTarget instanceof Element ? event.relatedTarget : document.activeElement;
      if (isElementWithinTargets(next, ignoreTargets)) {
        return false;
      }
      onCommit?.();
      return true;
    },
    handleInput(onChange = null) {
      onChange?.();
    },
  };
}
