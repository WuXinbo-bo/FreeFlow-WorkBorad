import { normalizeRichHtml, normalizeRichHtmlInlineFontSizes } from "../utils.js";

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

  function isTransparentColor(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || normalized === "transparent" || normalized === "rgba(0, 0, 0, 0)" || normalized === "rgba(0,0,0,0)";
  }

  function resolveElement(node) {
    if (!node) {
      return null;
    }
    if (node instanceof Element) {
      return node;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return node.parentElement;
    }
    return null;
  }

  function findAncestor(node, predicate) {
    let current = resolveElement(node);
    while (current) {
      if (current === element) {
        return predicate(current) ? current : null;
      }
      if (predicate(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function isHighlightElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    if (node.hasAttribute("data-ff-highlight")) {
      return true;
    }
    if (node.tagName === "MARK") {
      return true;
    }
    const inlineBackground = String(node.style?.backgroundColor || "").trim();
    if (inlineBackground && !isTransparentColor(inlineBackground)) {
      return true;
    }
    if (node.tagName !== "SPAN" || typeof window?.getComputedStyle !== "function") {
      return false;
    }
    const computedBackground = String(window.getComputedStyle(node).backgroundColor || "").trim();
    return !isTransparentColor(computedBackground);
  }

  function isCanonicalHighlightElement(node) {
    return node instanceof HTMLElement && node.getAttribute("data-ff-highlight") === "true";
  }

  function getHighlightColor(node) {
    const elementNode = node instanceof HTMLElement ? node : null;
    if (!elementNode) {
      return "";
    }
    const inlineBackground = String(elementNode.style?.backgroundColor || "").trim();
    if (inlineBackground && !isTransparentColor(inlineBackground)) {
      return inlineBackground;
    }
    const attrColor = String(elementNode.getAttribute?.("data-ff-highlight-color") || "").trim();
    if (attrColor) {
      return attrColor;
    }
    if (typeof window?.getComputedStyle === "function") {
      const computedBackground = String(window.getComputedStyle(elementNode).backgroundColor || "").trim();
      if (!isTransparentColor(computedBackground)) {
        return computedBackground;
      }
    }
    return "";
  }

  function getSelectionEndpointRange(range) {
    if (!(range instanceof Range)) {
      return null;
    }
    const start = findAncestor(range.startContainer, () => true);
    const end = findAncestor(range.endContainer, () => true);
    return { start, end };
  }

  function getUniformAncestor(range, predicate) {
    if (!(range instanceof Range)) {
      return null;
    }
    const { start, end } = getSelectionEndpointRange(range);
    const startMatch = start ? findAncestor(start, predicate) : null;
    const endMatch = end ? findAncestor(end, predicate) : null;
    if (startMatch && startMatch === endMatch) {
      return startMatch;
    }
    if (range.collapsed) {
      return startMatch;
    }
    return null;
  }

  function isBoldElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    return node.tagName === "STRONG" || node.tagName === "B";
  }

  function isItalicElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    return node.tagName === "EM" || node.tagName === "I";
  }

  function isUnderlineElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    if (node.tagName === "U") {
      return true;
    }
    const decoration = String(node.style?.textDecoration || node.style?.textDecorationLine || "").toLowerCase();
    return decoration.includes("underline");
  }

  function isStrikeElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    if (node.tagName === "S" || node.tagName === "DEL") {
      return true;
    }
    const decoration = String(node.style?.textDecoration || node.style?.textDecorationLine || "").toLowerCase();
    return decoration.includes("line-through");
  }

  function isListContainer(node, tagName) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    const parentTag = node.parentElement?.tagName?.toLowerCase() || "";
    return node.tagName.toLowerCase() === "li" && parentTag === tagName;
  }

  function isInlineSelectionWrapper(node) {
    if (!(node instanceof HTMLElement) || node === element) {
      return false;
    }
    const tag = node.tagName.toLowerCase();
    if (["span", "mark", "strong", "b", "em", "i", "u", "s", "del", "a"].includes(tag)) {
      return true;
    }
    return Boolean(node.getAttribute("style") || node.getAttribute("data-ff-font-size") || node.getAttribute("data-ff-highlight"));
  }

  function getSelectionRangeText(range) {
    if (!(range instanceof Range)) {
      return "";
    }
    return String(range.toString?.() || "");
  }

  function setSelectionRange(range) {
    const selection = document.getSelection?.();
    if (!selection || !(range instanceof Range)) {
      return false;
    }
    selection.removeAllRanges();
    selection.addRange(range);
    lastRange = range.cloneRange();
    return true;
  }

  function setSelectionAroundNodes(firstNode, lastNode) {
    const selection = document.getSelection?.();
    if (!selection || !(firstNode instanceof Node) || !(lastNode instanceof Node)) {
      return false;
    }
    const range = document.createRange();
    range.setStartBefore(firstNode);
    range.setEndAfter(lastNode);
    return setSelectionRange(range);
  }

  function unwrapNode(node) {
    const parent = node?.parentNode;
    if (!(parent instanceof Node)) {
      return;
    }
    while (node.firstChild) {
      parent.insertBefore(node.firstChild, node);
    }
    parent.removeChild(node);
  }

  function getInlineWrapperChain(node) {
    const chain = [];
    let current = resolveElement(node);
    while (current && current !== element) {
      if (isInlineSelectionWrapper(current)) {
        chain.push(current);
      }
      current = current.parentElement;
    }
    return chain.reverse();
  }

  function getSelectionWrapperChain(range) {
    if (!(range instanceof Range)) {
      return [];
    }
    const startChain = getInlineWrapperChain(range.startContainer);
    const endChain = getInlineWrapperChain(range.endContainer);
    const shared = [];
    const limit = Math.min(startChain.length, endChain.length);
    for (let index = 0; index < limit; index += 1) {
      if (startChain[index] !== endChain[index]) {
        break;
      }
      shared.push(startChain[index]);
    }
    return shared;
  }

  function rangeIntersectsTextNode(range, node) {
    if (!(range instanceof Range) || !(node instanceof Text) || !element.contains(node)) {
      return false;
    }
    if (!String(node.nodeValue || "").trim()) {
      return false;
    }
    try {
      return range.intersectsNode(node);
    } catch {
      return false;
    }
  }

  function getSelectedTextNodes(range) {
    if (!(range instanceof Range) || range.collapsed) {
      return [];
    }
    const root = range.commonAncestorContainer instanceof Node ? range.commonAncestorContainer : element;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node instanceof Text && rangeIntersectsTextNode(range, node)) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  function getComputedFontSize(node) {
    const elementNode = resolveElement(node);
    if (!(elementNode instanceof HTMLElement) || typeof window?.getComputedStyle !== "function") {
      return 0;
    }
    const parsed = Number.parseFloat(window.getComputedStyle(elementNode).fontSize || "");
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  }

  function getRangeFontSize(range) {
    if (!(range instanceof Range)) {
      return 0;
    }
    if (range.collapsed) {
      return getComputedFontSize(range.startContainer);
    }
    const textNodes = getSelectedTextNodes(range);
    if (textNodes.length) {
      let resolvedSize = 0;
      for (const node of textNodes) {
        const nextSize = getComputedFontSize(node);
        if (!nextSize) {
          continue;
        }
        if (!resolvedSize) {
          resolvedSize = nextSize;
          continue;
        }
        if (resolvedSize !== nextSize) {
          return nextSize;
        }
      }
      if (resolvedSize) {
        return resolvedSize;
      }
    }
    return getComputedFontSize(range.startContainer) || getComputedFontSize(range.commonAncestorContainer);
  }

  function stripHighlightMarkup(root) {
    if (!(root instanceof Node)) {
      return;
    }
    const candidates = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node instanceof HTMLElement && (isCanonicalHighlightElement(node) || node.tagName === "MARK")) {
        candidates.push(node);
      }
    }
    candidates.reverse().forEach((node) => {
      const parent = node.parentNode;
      if (!parent) {
        return;
      }
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
    });
  }

  function getHighlightStateFromRange(range) {
    if (!(range instanceof Range)) {
      return { highlight: false, highlightColor: "" };
    }
    if (range.collapsed) {
      const highlightElement =
        findAncestor(range.startContainer, isCanonicalHighlightElement) || findAncestor(range.startContainer, isHighlightElement);
      if (!highlightElement) {
        return { highlight: false, highlightColor: "" };
      }
      return {
        highlight: true,
        highlightColor: getHighlightColor(highlightElement),
      };
    }
    const textNodes = getSelectedTextNodes(range);
    if (!textNodes.length) {
      const fallbackHighlight = getUniformAncestor(range, isCanonicalHighlightElement) || getUniformAncestor(range, isHighlightElement);
      if (!fallbackHighlight) {
        return { highlight: false, highlightColor: "" };
      }
      return {
        highlight: true,
        highlightColor: getHighlightColor(fallbackHighlight),
      };
    }
    let resolvedColor = "";
    for (const node of textNodes) {
      const highlightElement = findAncestor(node, isCanonicalHighlightElement) || findAncestor(node, isHighlightElement);
      if (!highlightElement) {
        return { highlight: false, highlightColor: "" };
      }
      const color = getHighlightColor(highlightElement);
      if (!resolvedColor) {
        resolvedColor = color;
      } else if (color && resolvedColor && color !== resolvedColor) {
        return { highlight: false, highlightColor: "" };
      }
    }
    return {
      highlight: true,
      highlightColor: resolvedColor,
    };
  }

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
    setSelectionRange(range);
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

  function getSelectionRange({ includeStored = true } = {}) {
    const selection = document.getSelection?.();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (selectionInside()) {
        return range;
      }
    }
    if (includeStored && lastRange) {
      return lastRange.cloneRange();
    }
    return null;
  }

  function getSelectionSnapshot() {
    const range = getSelectionRange();
    if (!range) {
      return {
        inside: false,
        collapsed: true,
        text: "",
        rect: null,
      };
    }
    const rects = Array.from(range.getClientRects?.() || []).filter(
      (rect) => rect && Number.isFinite(rect.width) && Number.isFinite(rect.height) && (rect.width > 0 || rect.height > 0)
    );
    let rect = null;
    if (rects.length) {
      const left = Math.min(...rects.map((entry) => entry.left));
      const top = Math.min(...rects.map((entry) => entry.top));
      const right = Math.max(...rects.map((entry) => entry.right));
      const bottom = Math.max(...rects.map((entry) => entry.bottom));
      rect = {
        left,
        top,
        right,
        bottom,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
    } else {
      const fallback = range.getBoundingClientRect?.();
      if (fallback && Number.isFinite(fallback.left) && Number.isFinite(fallback.top)) {
        rect = {
          left: fallback.left,
          top: fallback.top,
          right: fallback.right,
          bottom: fallback.bottom,
          width: fallback.width,
          height: fallback.height,
        };
      }
    }
    return {
      inside: true,
      collapsed: Boolean(range.collapsed),
      text: String(range.toString?.() || ""),
      rect,
    };
  }

  function wrapSelection(tagName, attrs) {
    const range = getSelectionRange();
    if (!range || range.collapsed) {
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
    const newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    return setSelectionRange(newRange);
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
    setSelectionRange(range);
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
    setSelectionRange(range);
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
    const nextRange = document.createRange();
    const nextOffset = Math.max(0, range.startOffset - 4);
    nextRange.setStart(node, nextOffset);
    nextRange.collapse(true);
    setSelectionRange(nextRange);
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
    const safeHtml = normalizeRichHtmlInlineFontSizes(html || "", normalizeRichFontSize(element.style.fontSize, 16));
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

  function getSelectionHtml({ baseFontSize = 16 } = {}) {
    const range = getSelectionRange();
    if (!range) {
      return "";
    }
    const container = document.createElement("div");
    const fragment = range.cloneContents();
    const wrappers = getSelectionWrapperChain(range);
    if (wrappers.length) {
      const outer = wrappers[0].cloneNode(false);
      let cursor = outer;
      for (let index = 1; index < wrappers.length; index += 1) {
        const clone = wrappers[index].cloneNode(false);
        cursor.appendChild(clone);
        cursor = clone;
      }
      cursor.appendChild(fragment);
      container.appendChild(outer);
    } else {
      container.appendChild(fragment);
    }
    return normalizeRichHtmlInlineFontSizes(container.innerHTML || "", baseFontSize);
  }

  function getSelectionText() {
    const range = getSelectionRange();
    if (!range) {
      return "";
    }
    return getSelectionRangeText(range);
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
      const nextRange = document.createRange();
      nextRange.setStartAfter(lastChild);
      nextRange.collapse(true);
      setSelectionRange(nextRange);
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

  function deleteSelection() {
    focus();
    restoreSelection();
    ensureSelection({ selectAllWhenCollapsed: false });
    if (exec("delete")) {
      return true;
    }
    const range = getSelectionRange();
    if (!range) {
      return false;
    }
    range.deleteContents();
    setSelectionRange(range);
    return true;
  }

  function command(name, value) {
    focus();
    restoreSelection();
    ensureSelection({ selectAllWhenCollapsed: false });
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
      const range = getSelectionRange();
      if (!range || range.collapsed) {
        return;
      }
      const currentHighlight = getHighlightStateFromRange(range);
      if (currentHighlight.highlight) {
        const targets = new Set();
        const textNodes = getSelectedTextNodes(range);
        textNodes.forEach((node) => {
          const target = findAncestor(node, isCanonicalHighlightElement) || findAncestor(node, (entry) => entry instanceof HTMLElement && entry.tagName === "MARK");
          if (target) {
            targets.add(target);
          }
        });
        if (!targets.size) {
          const fallbackTarget =
            findAncestor(range.startContainer, isCanonicalHighlightElement) ||
            findAncestor(range.startContainer, (entry) => entry instanceof HTMLElement && entry.tagName === "MARK");
          if (fallbackTarget) {
            targets.add(fallbackTarget);
          }
        }
        Array.from(targets).sort((left, right) => {
          if (left === right) {
            return 0;
          }
          return left.contains(right) ? -1 : 1;
        }).forEach((target) => {
          unwrapNode(target);
        });
        const refreshedRange = getSelectionRange({ includeStored: false });
        if (refreshedRange) {
          setSelectionRange(refreshedRange);
        }
        return;
      }
      const ok = wrapSelection("span", {
        "data-ff-highlight": "true",
        "data-ff-highlight-color": color,
        style: `background-color: ${color};`,
      });
      if (ok) {
        return;
      }
      return;
    }
    if (name === "fontSize" && value) {
      if (typeof value === "object" && value !== null) {
        const logicalSize = normalizeRichFontSize(value.logicalSize, 16);
        const renderedSize = normalizeRichFontSize(value.renderedSize, logicalSize);
        wrapSelection("span", {
          "data-ff-font-size": String(logicalSize),
          style: `font-size: ${renderedSize}px;`,
        });
        return;
      }
      const rawValue = String(value || "").trim().toLowerCase();
      if (rawValue.endsWith("em")) {
        wrapSelection("span", { style: `font-size: ${rawValue};` });
        return;
      }
      const size = normalizeRichFontSize(value, 16);
      wrapSelection("span", { "data-ff-font-size": String(size), style: `font-size: ${size}px;` });
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
      insertHtml(normalizeRichHtmlInlineFontSizes(html, normalizeRichFontSize(element.style.fontSize, 16)));
      return;
    }
    exec("insertText", text);
  }

  function onSelectionChange() {
    if (!selectionInside()) {
      return;
    }
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
    getSelectionHtml,
    getSelectionText,
    focus,
    command,
    deleteSelection,
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
      const range = getSelectionRange();
      const highlightState = range ? getHighlightStateFromRange(range) : { highlight: false, highlightColor: "" };
      const bold = Boolean(range && getUniformAncestor(range, isBoldElement));
      const italic = Boolean(range && getUniformAncestor(range, isItalicElement));
      const underline = Boolean(range && getUniformAncestor(range, isUnderlineElement));
      const strike = Boolean(range && getUniformAncestor(range, isStrikeElement));
      const unorderedList = Boolean(range && getUniformAncestor(range, (node) => isListContainer(node, "ul")));
      const orderedList = Boolean(range && getUniformAncestor(range, (node) => isListContainer(node, "ol")));
      let color = "";
      const colorTarget = range
        ? getUniformAncestor(range, (node) => node instanceof HTMLElement && Boolean(node.style?.color))
        : null;
      if (colorTarget instanceof HTMLElement) {
        color = String(colorTarget.style.color || "");
      } else if (typeof document?.queryCommandValue === "function") {
        color = String(document.queryCommandValue("foreColor") || "");
      }
      let fontSize = getRangeFontSize(range);
      if (!fontSize && typeof window?.getComputedStyle === "function") {
        const parsed = Number.parseFloat(window.getComputedStyle(element).fontSize || "");
        if (Number.isFinite(parsed) && parsed > 0) {
          fontSize = Math.round(parsed);
        }
      }
      const block =
        getClosestWithinSelection("h1, h2, h3, h4, h5, h6, p, div, section, article, li")?.tagName?.toLowerCase() || "";
      const alignTarget = getClosestWithinSelection("li, h1, h2, h3, h4, h5, h6, p, div, section, article");
      const style = alignTarget instanceof HTMLElement ? alignTarget.style.textAlign : "";
      const align = style === "center" || style === "right" ? style : "left";
      return {
        bold,
        italic,
        underline,
        strike,
        color,
        fontSize,
        unorderedList,
        orderedList,
        block,
        align,
        highlight: highlightState.highlight,
        highlightColor: highlightState.highlightColor,
      };
    },
    getSelectionSnapshot,
    destroy() {
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("paste", onPaste);
      document.removeEventListener("selectionchange", onSelectionChange);
    },
  };
}
