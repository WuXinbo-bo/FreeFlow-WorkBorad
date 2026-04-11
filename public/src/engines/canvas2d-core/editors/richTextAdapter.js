import { normalizeRichHtml } from "../utils.js";

function ensureEditableHost(host) {
  if (!host) {
    return null;
  }
  host.setAttribute("contenteditable", "true");
  host.setAttribute("spellcheck", "false");
  host.setAttribute("role", "textbox");
  return host;
}

function exec(command, value) {
  if (typeof document?.execCommand !== "function") {
    return false;
  }
  return document.execCommand(command, false, value);
}

function getNodeText(node) {
  if (!node) {
    return "";
  }
  return String(node.textContent || "").replace(/\u00a0/g, " ");
}

function normalizeRichFontSize(value, fallback = 16) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return Math.max(10, Number(fallback) || 16);
  }
  return Math.max(10, numericValue);
}

export function createRichTextAdapter(host, { onCommit, onCancel, onSelectionChange: onSelectionChangeExternal } = {}) {
  const element = ensureEditableHost(host);
  if (!element) {
    return null;
  }
  exec("defaultParagraphSeparator", "br");
  let lastRange = null;

  function selectionInside() {
    const selection = document.getSelection?.();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    return (anchorNode && element.contains(anchorNode)) || (focusNode && element.contains(focusNode));
  }

  function storeSelection() {
    const selection = document.getSelection?.();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    if (!selectionInside()) {
      return;
    }
    lastRange = selection.getRangeAt(0).cloneRange();
  }

  function selectAll() {
    const selection = document.getSelection?.();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    lastRange = range.cloneRange();
  }

  function ensureSelection({ selectAllWhenCollapsed = true } = {}) {
    const selection = document.getSelection?.();
    if (!selection || selection.rangeCount === 0) {
      selectAll();
      return;
    }
    if (!selectionInside()) {
      selectAll();
      return;
    }
    const range = selection.getRangeAt(0);
    if (range.collapsed && selectAllWhenCollapsed) {
      selectAll();
    }
  }

  function restoreSelection() {
    const selection = document.getSelection?.();
    if (!selection || !lastRange) {
      return;
    }
    selection.removeAllRanges();
    selection.addRange(lastRange);
  }

  function getSelectionRange() {
    const selection = document.getSelection?.();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    if (!selectionInside()) {
      return null;
    }
    return range;
  }

  function wrapSelection(tagName, attrs) {
    ensureSelection();
    const range = getSelectionRange();
    if (!range) {
      return false;
    }
    const wrapper = document.createElement(tagName);
    if (attrs) {
      Object.entries(attrs).forEach(([key, value]) => {
        wrapper.setAttribute(key, value);
      });
    }
    const content = range.extractContents();
    wrapper.appendChild(content);
    range.insertNode(wrapper);
    const selection = document.getSelection?.();
    if (selection) {
      selection.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(wrapper);
      selection.addRange(newRange);
      lastRange = newRange.cloneRange();
    }
    return true;
  }

  function getSelectionContainerNode() {
    const range = getSelectionRange();
    if (!range) {
      return null;
    }
    let node = range.commonAncestorContainer;
    if (node?.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }
    return node instanceof Node ? node : null;
  }

  function getClosestWithinSelection(selector) {
    const node = getSelectionContainerNode();
    if (!(node instanceof Element)) {
      return node?.parentElement?.closest?.(selector) || null;
    }
    return node.closest(selector);
  }

  function getCurrentBlock() {
    return getClosestWithinSelection("li, div, p, section, article, h1, h2, h3, h4, h5, h6") || element;
  }

  function selectNodeContents(node) {
    const selection = document.getSelection?.();
    if (!selection || !(node instanceof Node)) {
      return null;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
    lastRange = range.cloneRange();
    return range;
  }

  function collapseToEnd(node) {
    const selection = document.getSelection?.();
    if (!selection || !(node instanceof Node)) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    lastRange = range.cloneRange();
  }

  function replaceCurrentBlockText(text = "") {
    const block = getCurrentBlock();
    if (!(block instanceof HTMLElement)) {
      return false;
    }
    block.textContent = text;
    collapseToEnd(block);
    return true;
  }

  function applyAlignment(value = "left") {
    const commandName =
      value === "center" ? "justifyCenter" : value === "right" ? "justifyRight" : "justifyLeft";
    return exec(commandName);
  }

  function applyFormatBlock(tagName = "div") {
    focus();
    restoreSelection();
    ensureSelection({ selectAllWhenCollapsed: false });
    const value = `<${String(tagName || "div").toLowerCase()}>`;
    if (exec("formatBlock", value) || exec("heading", value)) {
      return true;
    }
    return false;
  }

  function removeLeadingIndent() {
    const range = getSelectionRange();
    if (!range) {
      return false;
    }
    let node = range.startContainer;
    if (node?.nodeType !== Node.TEXT_NODE) {
      node = node?.childNodes?.[Math.max(0, range.startOffset - 1)] || node?.firstChild || node;
    }
    if (!(node instanceof Text)) {
      return false;
    }
    const value = node.nodeValue || "";
    const before = value.slice(0, range.startOffset);
    if (!before.endsWith("    ") && !before.endsWith("\u00a0\u00a0\u00a0\u00a0")) {
      return false;
    }
    node.nodeValue = `${before.slice(0, -4)}${value.slice(range.startOffset)}`;
    const selection = document.getSelection?.();
    if (selection) {
      const nextRange = document.createRange();
      const nextOffset = Math.max(0, range.startOffset - 4);
      nextRange.setStart(node, nextOffset);
      nextRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      lastRange = nextRange.cloneRange();
    }
    return true;
  }

  function handleMarkdownShortcut() {
    const block = getCurrentBlock();
    if (!(block instanceof HTMLElement)) {
      return false;
    }
    const rawText = getNodeText(block).trim();
    const trigger = rawText.replace(/\s+$/, "");
    if (trigger === "#") {
      block.textContent = "";
      selectNodeContents(block);
      applyFormatBlock("h1");
      return true;
    }
    if (trigger === "##") {
      block.textContent = "";
      selectNodeContents(block);
      applyFormatBlock("h2");
      return true;
    }
    if (trigger === "-" || trigger === "*") {
      block.textContent = "";
      selectNodeContents(block);
      exec("insertUnorderedList");
      return true;
    }
    if (/^\d+\.$/.test(trigger)) {
      block.textContent = "";
      selectNodeContents(block);
      exec("insertOrderedList");
      return true;
    }
    return false;
  }

  function setContent(html = "", textFallback = "") {
    const safeHtml = normalizeRichHtml(html || "");
    if (safeHtml.trim()) {
      element.innerHTML = safeHtml;
    } else {
      element.textContent = String(textFallback || "");
    }
  }

  function getHTML() {
    return element.innerHTML || "";
  }

  function getText() {
    return element.innerText || element.textContent || "";
  }

  function insertHtml(html) {
    const content = String(html || "");
    if (!content) {
      return false;
    }
    focus();
    restoreSelection();
    ensureSelection({ selectAllWhenCollapsed: false });
    const ok = exec("insertHTML", content);
    if (ok) {
      return true;
    }
    const range = getSelectionRange();
    if (!range) {
      return false;
    }
    const fragment = range.createContextualFragment(content);
    const lastChild = fragment.lastChild;
    range.deleteContents();
    range.insertNode(fragment);
    if (lastChild) {
      const selection = document.getSelection?.();
      const nextRange = document.createRange();
      nextRange.setStartAfter(lastChild);
      nextRange.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(nextRange);
      lastRange = nextRange.cloneRange();
    }
    return true;
  }

  function insertLineBreak() {
    focus();
    restoreSelection();
    ensureSelection({ selectAllWhenCollapsed: false });
    if (exec("insertLineBreak")) {
      return true;
    }
    return insertHtml("<br>");
  }

  function focus() {
    element.focus();
  }

  function command(name, value) {
    focus();
    restoreSelection();
    ensureSelection();
    if (name === "align") {
      applyAlignment(value);
      return;
    }
    if (name === "formatBlock") {
      applyFormatBlock(value);
      return;
    }
    if (name === "highlight") {
      const color = value || "#fff4a3";
      const ok = exec("hiliteColor", color) || exec("backColor", color);
      if (ok) {
        return;
      }
      wrapSelection("span", { style: `background-color: ${color};` });
      return;
    }
    const ok = exec(name, value);
    if (ok) {
      return;
    }
    if (name === "bold") {
      wrapSelection("strong");
    } else if (name === "italic") {
      wrapSelection("em");
    } else if (name === "underline") {
      wrapSelection("u");
    } else if (name === "strikeThrough") {
      wrapSelection("s");
    } else if (name === "createLink" && value) {
      wrapSelection("a", {
        href: value,
        target: "_blank",
        rel: "noopener noreferrer",
      });
    } else if (name === "foreColor" && value) {
      wrapSelection("span", { style: `color: ${value};` });
    } else if (name === "fontSize" && value) {
      const size = normalizeRichFontSize(value, 16);
      wrapSelection("span", { style: `font-size: ${size}px;` });
    }
  }

  function clearInlineFontSizes() {
    const nodes = element.querySelectorAll("[style]");
    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      if (!node.style.fontSize) {
        return;
      }
      node.style.fontSize = "";
      if (!node.getAttribute("style")) {
        node.removeAttribute("style");
      }
    });
  }

  function onKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "enter") {
      event.preventDefault();
      onCommit?.();
      return;
    }
    if (event.key === " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (handleMarkdownShortcut()) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === "Enter" && event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      insertLineBreak();
      return;
    }
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      const inList = Boolean(getClosestWithinSelection("li"));
      if (inList) {
        return;
      }
      event.preventDefault();
      insertLineBreak();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const inList = Boolean(getClosestWithinSelection("li"));
      if (inList) {
        if (event.shiftKey) {
          command("outdent");
        } else {
          command("indent");
        }
        return;
      }
      if (event.shiftKey) {
        removeLeadingIndent();
        return;
      }
      insertHtml("&nbsp;&nbsp;&nbsp;&nbsp;");
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAll();
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        command("bold");
      } else if (key === "i") {
        event.preventDefault();
        command("italic");
      } else if (key === "u") {
        event.preventDefault();
        command("underline");
      } else if (key === "k") {
        event.preventDefault();
        const url = window.prompt("输入链接");
        if (url) {
          command("createLink", url);
        } else {
          exec("unlink");
        }
      }
    }
  }

  function onPaste(event) {
    if (!event.clipboardData) {
      return;
    }
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (!html && !text) {
      return;
    }
    event.preventDefault();
    if (html) {
      insertHtml(normalizeRichHtml(html));
      return;
    }
    exec("insertText", text);
  }

  function onSelectionChange() {
    storeSelection();
    onSelectionChangeExternal?.();
  }

  element.addEventListener("keydown", onKeyDown);
  element.addEventListener("paste", onPaste);
  document.addEventListener("selectionchange", onSelectionChange);

  return {
    element,
    setContent,
    getHTML,
    getText,
    focus,
    command,
    captureSelection() {
      storeSelection();
    },
    setBaseFontSize(size, { normalize = false } = {}) {
      const next = normalizeRichFontSize(size, 16);
      element.style.fontSize = `${next}px`;
      if (normalize) {
        clearInlineFontSizes();
      }
    },
    getFormatState() {
      const bold = typeof document?.queryCommandState === "function" ? document.queryCommandState("bold") : false;
      const italic = typeof document?.queryCommandState === "function" ? document.queryCommandState("italic") : false;
      const underline =
        typeof document?.queryCommandState === "function" ? document.queryCommandState("underline") : false;
      const strike =
        typeof document?.queryCommandState === "function" ? document.queryCommandState("strikeThrough") : false;
      const unorderedList =
        typeof document?.queryCommandState === "function" ? document.queryCommandState("insertUnorderedList") : false;
      const orderedList =
        typeof document?.queryCommandState === "function" ? document.queryCommandState("insertOrderedList") : false;
      let color = "";
      if (typeof document?.queryCommandValue === "function") {
        color = String(document.queryCommandValue("foreColor") || "");
      }
      const block =
        getClosestWithinSelection("h1, h2, h3, h4, h5, h6, p, div, section, article, li")?.tagName?.toLowerCase() || "";
      const alignTarget = getClosestWithinSelection("li, h1, h2, h3, h4, h5, h6, p, div, section, article");
      const style = alignTarget instanceof HTMLElement ? alignTarget.style.textAlign : "";
      const align = style === "center" || style === "right" ? style : "left";
      return { bold, italic, underline, strike, color, unorderedList, orderedList, block, align };
    },
    destroy() {
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("paste", onPaste);
      document.removeEventListener("selectionchange", onSelectionChange);
    },
  };
}
