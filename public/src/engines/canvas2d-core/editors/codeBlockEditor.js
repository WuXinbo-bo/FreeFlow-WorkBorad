export function createCodeBlockEditor(host, options = {}) {
  let mountHost = host instanceof HTMLElement ? host : null;
  let activeItemId = "";
  let currentLanguage = "";
  let textarea = null;
  let currentWrap = false;
  let onInputHandler = null;
  let onBlurHandler = null;

  function detachTextarea() {
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return;
    }
    if (onInputHandler) {
      textarea.removeEventListener("input", onInputHandler);
    }
    if (onBlurHandler) {
      textarea.removeEventListener("blur", onBlurHandler);
    }
    onInputHandler = null;
    onBlurHandler = null;
    textarea.remove();
  }

  function ensureTextarea() {
    if (!(mountHost instanceof HTMLElement)) {
      return null;
    }
    if (textarea instanceof HTMLTextAreaElement) {
      if (textarea.parentElement !== mountHost) {
        mountHost.innerHTML = "";
        mountHost.appendChild(textarea);
      }
      return textarea;
    }
    const node = document.createElement("textarea");
    node.className = "canvas-code-block-editor-textarea";
    node.spellcheck = false;
    node.autocapitalize = "off";
    node.autocomplete = "off";
    node.autocorrect = "off";
    node.setAttribute("aria-label", "代码编辑器");
    node.style.background = "transparent";
    node.style.color = "#0f172a";
    onInputHandler = () => {
      options.onChange?.(node.value || "");
    };
    onBlurHandler = () => {
      options.onBlur?.();
    };
    node.addEventListener("input", onInputHandler);
    node.addEventListener("blur", onBlurHandler);
    mountHost.innerHTML = "";
    mountHost.appendChild(node);
    textarea = node;
    return textarea;
  }

  function syncSession(session = {}) {
    const node = ensureTextarea();
    if (!node) {
      return null;
    }
    currentLanguage = String(session.language || "").trim().toLowerCase();
    currentWrap = session.wrap === true;
    const nextValue = String(session.code || "");
    if (node.value !== nextValue) {
      node.value = nextValue;
    }
    node.setAttribute("wrap", currentWrap ? "soft" : "off");
    node.setAttribute("data-language", currentLanguage);
    return node;
  }

  function begin(session = {}) {
    if (!(mountHost instanceof HTMLElement)) {
      return false;
    }
    activeItemId = String(session.itemId || "");
    textarea = syncSession(session);
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return false;
    }
    return true;
  }

  function focus() {
    textarea?.focus();
  }

  function getValue() {
    return textarea?.value || "";
  }

  function setLanguage(language = "") {
    currentLanguage = String(language || "").trim().toLowerCase();
    if (textarea) {
      textarea.setAttribute("data-language", currentLanguage);
    }
  }

  function setWrap(wrap = false) {
    currentWrap = wrap === true;
    if (textarea) {
      textarea.setAttribute("wrap", currentWrap ? "soft" : "off");
    }
  }

  function setValueIfNeeded(nextValue = "") {
    const normalized = String(nextValue || "");
    if (textarea && textarea.value !== normalized) {
      textarea.value = normalized;
    }
  }

  function clear() {
    activeItemId = "";
    currentLanguage = "";
    currentWrap = false;
    if (textarea) {
      textarea.value = "";
      textarea.removeAttribute("data-language");
      textarea.setAttribute("wrap", "off");
    }
  }

  return {
    begin,
    focus,
    clear,
    getValue,
    setLanguage,
    setWrap,
    setValueIfNeeded,
    isEditing(itemId = "") {
      return Boolean(activeItemId) && activeItemId === String(itemId || "");
    },
    setHost(nextHost) {
      if (mountHost === nextHost) {
        return;
      }
      mountHost = nextHost instanceof HTMLElement ? nextHost : null;
      if (!mountHost) {
        detachTextarea();
        textarea = null;
        return;
      }
      if (textarea instanceof HTMLTextAreaElement) {
        mountHost.innerHTML = "";
        mountHost.appendChild(textarea);
      }
    },
  };
}
