export function createCodeBlockEditor(host, options = {}) {
  let mountHost = host instanceof HTMLElement ? host : null;
  let activeItemId = "";
  let currentLanguage = "";
  let textarea = null;
  let currentWrap = false;
  let currentTabSize = 2;
  let onInputHandler = null;
  let onBlurHandler = null;
  let onKeyDownHandler = null;

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
    if (onKeyDownHandler) {
      textarea.removeEventListener("keydown", onKeyDownHandler);
    }
    onInputHandler = null;
    onBlurHandler = null;
    onKeyDownHandler = null;
    textarea.remove();
  }

  function normalizeTabSize(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 2;
    }
    return Math.max(1, Math.min(8, Math.round(number) || 2));
  }

  function emitChange(node) {
    options.onChange?.(node?.value || "");
  }

  function replaceRange(node, rangeStart, rangeEnd, nextText, { selectionStart = null, selectionEnd = null } = {}) {
    if (!(node instanceof HTMLTextAreaElement)) {
      return false;
    }
    const start = Math.max(0, Number(rangeStart || 0));
    const end = Math.max(start, Number(rangeEnd || start));
    const value = String(node.value || "");
    node.value = `${value.slice(0, start)}${nextText}${value.slice(end)}`;
    const nextStart = selectionStart == null ? start + String(nextText || "").length : Math.max(0, Number(selectionStart || 0));
    const nextEnd = selectionEnd == null ? nextStart : Math.max(nextStart, Number(selectionEnd || nextStart));
    node.selectionStart = nextStart;
    node.selectionEnd = nextEnd;
    emitChange(node);
    return true;
  }

  function replaceSelection(node, nextText, options = {}) {
    if (!(node instanceof HTMLTextAreaElement)) {
      return false;
    }
    return replaceRange(node, node.selectionStart, node.selectionEnd, nextText, options);
  }

  function handleTabKey(node, event) {
    if (!(node instanceof HTMLTextAreaElement)) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    const indentUnit = " ".repeat(currentTabSize);
    const value = String(node.value || "");
    const start = Math.max(0, Number(node.selectionStart || 0));
    const end = Math.max(start, Number(node.selectionEnd || start));
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const selectedText = value.slice(start, end);
    const multiLine = start !== end && selectedText.includes("\n");
    if (!event.shiftKey) {
      if (!multiLine) {
        return replaceSelection(node, indentUnit);
      }
      const blockEnd = end < value.length && value[end] === "\n" ? end : Math.max(end, value.indexOf("\n", end) === -1 ? value.length : value.indexOf("\n", end));
      const block = value.slice(lineStart, blockEnd);
      const lines = block.split("\n");
      const indentedBlock = lines.map((line) => `${indentUnit}${line}`).join("\n");
      return replaceRange(node, lineStart, blockEnd, indentedBlock, {
        selectionStart: start + indentUnit.length,
        selectionEnd: end + indentUnit.length * lines.length,
      });
    }
    const blockEnd = multiLine
      ? (end < value.length && value[end] === "\n" ? end : Math.max(end, value.indexOf("\n", end) === -1 ? value.length : value.indexOf("\n", end)))
      : Math.max(end, value.indexOf("\n", end) === -1 ? value.length : value.indexOf("\n", end));
    const block = value.slice(lineStart, blockEnd);
    const lines = block.split("\n");
    let removedBeforeStart = 0;
    let removedTotal = 0;
    const dedentedBlock = lines
      .map((line, index) => {
        const leadingIndent = line.match(new RegExp(`^(\\t| {1,${currentTabSize}})`))?.[0] || "";
        const removeCount = leadingIndent.length;
        if (index === 0) {
          removedBeforeStart = Math.min(removeCount, Math.max(0, start - lineStart));
        }
        removedTotal += removeCount;
        return line.slice(removeCount);
      })
      .join("\n");
    return replaceRange(node, lineStart, blockEnd, dedentedBlock, {
      selectionStart: Math.max(lineStart, start - removedBeforeStart),
      selectionEnd: Math.max(lineStart, end - removedTotal),
    });
  }

  function handleEnterKey(node, event) {
    if (!(node instanceof HTMLTextAreaElement) || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    const value = String(node.value || "");
    const start = Math.max(0, Number(node.selectionStart || 0));
    const end = Math.max(start, Number(node.selectionEnd || start));
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const currentLine = value.slice(lineStart, start);
    const indentMatch = currentLine.match(/^[ \t]+/);
    const indent = indentMatch ? indentMatch[0].replace(/\t/g, " ".repeat(currentTabSize)) : "";
    event.preventDefault();
    event.stopPropagation();
    return replaceSelection(node, `\n${indent}`);
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
      emitChange(node);
    };
    onBlurHandler = () => {
      options.onBlur?.();
    };
    onKeyDownHandler = (event) => {
      const key = String(event.key || "").toLowerCase();
      if (key === "tab") {
        handleTabKey(node, event);
        return;
      }
      if (key === "enter") {
        handleEnterKey(node, event);
      }
    };
    node.addEventListener("input", onInputHandler);
    node.addEventListener("blur", onBlurHandler);
    node.addEventListener("keydown", onKeyDownHandler);
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
    currentTabSize = normalizeTabSize(session.tabSize);
    const nextValue = String(session.code || "");
    if (node.value !== nextValue) {
      node.value = nextValue;
    }
    node.setAttribute("wrap", currentWrap ? "soft" : "off");
    node.setAttribute("data-language", currentLanguage);
    node.style.tabSize = String(currentTabSize);
    node.style.MozTabSize = String(currentTabSize);
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
    currentTabSize = 2;
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
